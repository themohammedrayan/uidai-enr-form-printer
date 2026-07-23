#!/usr/bin/env python3
"""
Regenerate templates/<form>.json from an official UIDAI form PDF.

Run this whenever UIDAI revises a form, or to add a new one, instead of
re-measuring coordinates by hand:

    pip install pdfplumber
    python3 tools/extract_template.py path/to/Form_1_Eng.pdf \
        --config tools/extract_configs/form1-en.json \
        -o templates/form1-en.json

Per-form calibration workflow (see the build spec's own "verify against
real geometry by inspection" ethos -- this deliberately stays a human
judgment call, not an automatic classifier, because a misclassified
near-boundary rectangle would fail silently):

    1. python3 tools/extract_template.py new_form.pdf --histogram
       Dump every rectangle's (width, height), rounded to 0.1pt, with
       counts, sorted most-common first. Eyeball the size clusters: one
       around ~10.x/10.x is the character-cell grid, one around ~15.x/9-10
       is the tick boxes, and everything else (mostly 0.5pt-thin rules) is
       structural.
    2. Copy tools/extract_configs/form1-en.json to a new file for the new
       form, and adjust cellSizePt/cellTolPt/tickWRange/tickHRange/
       maxCellGapPt/dedupeTolPt to bracket the clusters found in step 1.
       Leave freeTextLabels empty and expectedFields/expectedWire at 0 for
       now.
    3. Run extraction for real with --config pointing at that new file.
       Grid/tick fields come out named grid_N_unlabelled/tick_N_unlabelled;
       rename them to the semantic field names index.html expects (cross-
       reference the form's own section numbering), and hand-derive each
       free-text field's anchor from its table rule position and its
       label's end x-coordinate (same method used for Form 1 -- baseline
       should sit just above its printed rule line, and must not overlap
       any label text).
    4. Cross-check every renamed field's coordinates against a second,
       independent pass (e.g. nearest-neighbour matching two extraction
       runs, or eyeballing tools/proof.py's rendered output) within
       ~0.5mm, then fill in the config's expectedFields/expectedWire so
       future re-extractions of the same revision get the sanity check.

Extraction rules (see build spec section 6), all tunable per form via the
--config file (schema: cellSizePt, cellTolPt, tickWRange, tickHRange,
dedupeTolPt, maxCellGapPt, wireCutoffTopPt, freeTextLabels,
expectedFields, expectedWire):

  - Character cells: rectangles near cellSizePt (Form 1/3: 10.4x10.4pt).
    The PDF draws several of these twice, ~0.12pt apart, so they are
    deduplicated first.
  - Tick boxes: rectangles inside tickWRange x tickHRange. Real-world PDF
    geometry has more jitter than the build spec's two exact size variants
    suggest, so this is a range rather than two exact points -- as long as
    the range doesn't overlap the cell-size range, there's no ambiguity.
  - Free-text field positions cannot be derived from rectangles alone
    (there is no printed box) -- they come from the table rule lines plus
    the end x-coordinate of the printed label before each blank, hand-
    derived into freeTextLabels. This is the one part of the file that
    stays hand-tuned, as noted in the build spec.
  - Every rectangle above y = wireCutoffTopPt (pdfplumber's top-down
    coordinates) is also emitted as a `wire` entry, in mm, as
    [x, y, w, h]. This drives the on-screen preview and the alignment
    sheet without ever embedding the official PDF in the repo. The cutoff
    excludes the signature/thumb-impression/verifier block at the bottom
    of the page, consistent with never drawing into it -- adjust per form
    if that block sits at a different height.

Form 1 (English) measured ground truth, for reference: 53 fields
(26 ticks + 10 grids + 17 free-text), 265 wire rectangles, page
215.9 x 279.4 mm (US Letter). All 36 rect-derived field coordinates
matched the shipped template within 0.13mm.
"""
import argparse
import json
import sys
from collections import Counter, defaultdict

PT_PER_MM = 72.0 / 25.4
MM_PER_PT = 25.4 / 72.0

DEFAULT_CONFIG = {
    "form": "Form 1 (English)",
    "cellSizePt": [10.4, 10.4],
    "cellTolPt": 0.3,
    "tickWRange": [14.5, 16.0],
    "tickHRange": [8.0, 11.0],
    "dedupeTolPt": 0.5,
    "maxCellGapPt": 15.0,
    "wireCutoffTopPt": 560,
    "freeTextLabels": {},
    "expectedFields": 0,
    "expectedWire": 0,
}


def load_config(path):
    config = dict(DEFAULT_CONFIG)
    if path:
        with open(path) as fh:
            config.update(json.load(fh))
    return config


def approx(a, b, tol):
    return abs(a - b) <= tol


def matches_size(w, h, target_w, target_h, tol):
    return approx(w, target_w, tol) and approx(h, target_h, tol)


def dedupe_rects(rects, tol):
    """Collapse near-duplicate rectangles (the PDF draws some twice, ~0.12pt apart)."""
    kept = []
    for r in rects:
        dup = False
        for k in kept:
            if (approx(r["x0"], k["x0"], tol) and approx(r["top"], k["top"], tol)
                    and approx(r["width"], k["width"], tol) and approx(r["height"], k["height"], tol)):
                dup = True
                break
        if not dup:
            kept.append(r)
    return kept


def classify_rects(rects, config):
    cells, ticks, other = [], [], []
    cell_w, cell_h = config["cellSizePt"]
    cell_tol = config["cellTolPt"]
    tick_w_lo, tick_w_hi = config["tickWRange"]
    tick_h_lo, tick_h_hi = config["tickHRange"]
    for r in rects:
        w, h = r["width"], r["height"]
        if matches_size(w, h, cell_w, cell_h, tol=cell_tol):
            cells.append(r)
        elif tick_w_lo <= w <= tick_w_hi and tick_h_lo <= h <= tick_h_hi:
            ticks.append(r)
        else:
            other.append(r)
    return cells, ticks, other


def group_cells_into_grids(cells, max_gap_pt):
    """Group deduplicated character cells into left-to-right rows sharing a
    top edge and a constant pitch, i.e. one grid field per row."""
    rows = defaultdict(list)
    for c in cells:
        rows[round(c["top"], 1)].append(c)

    grids = []
    for top, row_cells in rows.items():
        row_cells.sort(key=lambda c: c["x0"])
        run = [row_cells[0]]
        for c in row_cells[1:]:
            prev = run[-1]
            pitch = c["x0"] - prev["x0"]
            if pitch <= max_gap_pt:  # same run of adjacent cells
                run.append(c)
            else:
                if len(run) > 1:
                    grids.append(run)
                run = [c]
        if len(run) > 1:
            grids.append(run)
    return grids


def rect_to_mm(x0, top, width, height):
    return [
        round(x0 * MM_PER_PT, 3),
        round(top * MM_PER_PT, 3),
        round(width * MM_PER_PT, 3),
        round(height * MM_PER_PT, 3),
    ]


def print_histogram(pdf_path):
    import pdfplumber

    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[0]
        sizes = Counter((round(r["width"], 1), round(r["height"], 1)) for r in page.rects)
        print(f"page: {page.width * MM_PER_PT:.1f} x {page.height * MM_PER_PT:.1f} mm "
              f"({page.width:.1f} x {page.height:.1f} pt)")
        print(f"{len(page.rects)} raw rectangles, {len(sizes)} distinct (width, height) sizes:")
        print(f"{'width_pt':>10} {'height_pt':>10} {'count':>8}")
        for (w, h), count in sorted(sizes.items(), key=lambda kv: -kv[1]):
            print(f"{w:>10} {h:>10} {count:>8}")


def extract(pdf_path, config):
    import pdfplumber

    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[0]
        page_w_mm = round(page.width * MM_PER_PT, 1)
        page_h_mm = round(page.height * MM_PER_PT, 1)

        deduped = dedupe_rects(page.rects, config["dedupeTolPt"])
        cells, ticks, _other = classify_rects(deduped, config)

        wire = []
        for r in deduped:
            if r["top"] < config["wireCutoffTopPt"]:
                wire.append(rect_to_mm(r["x0"], r["top"], r["width"], r["height"]))

        grids = group_cells_into_grids(cells, config["maxCellGapPt"])

        fields = dict(config["freeTextLabels"])

        for i, run in enumerate(grids):
            x0_mm = round(run[0]["x0"] * MM_PER_PT, 2)
            y0_mm = round(run[0]["top"] * MM_PER_PT, 2)
            h_mm = round(run[0]["height"] * MM_PER_PT, 2)
            pitch_mm = round((run[1]["x0"] - run[0]["x0"]) * MM_PER_PT, 2)
            fields[f"grid_{i}_unlabelled"] = {
                "kind": "grid",
                "x": x0_mm,
                "y": y0_mm,
                "h": h_mm,
                "pitch": pitch_mm,
                "cells": len(run),
            }

        for i, r in enumerate(ticks):
            cx_mm = round((r["x0"] + r["width"] / 2) * MM_PER_PT, 2)
            cy_mm = round((r["top"] + r["height"] / 2) * MM_PER_PT, 2)
            fields[f"tick_{i}_unlabelled"] = {"kind": "tick", "x": cx_mm, "y": cy_mm}

        return {
            "form": config["form"],
            "page": {"widthMm": page_w_mm, "heightMm": page_h_mm},
            "gridPitchMm": 3.64,
            "fields": fields,
            "wire": wire,
            "wireIsSynthetic": False,
        }, len(fields), len(wire), page_w_mm, page_h_mm


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf", help="Path to the form's PDF")
    ap.add_argument("-o", "--output", default="templates/form1-en.json")
    ap.add_argument("--config", help="Path to a per-form config JSON (see tools/extract_configs/). "
                                      "Omit to use Form 1's built-in defaults.")
    ap.add_argument("--histogram", action="store_true",
                     help="Print a (width, height) rectangle-size frequency table and exit, "
                          "instead of extracting. Use this first on a new form to calibrate "
                          "a --config file.")
    args = ap.parse_args()

    try:
        import pdfplumber  # noqa: F401
    except ImportError:
        print("pdfplumber is required: pip install pdfplumber", file=sys.stderr)
        sys.exit(1)

    if args.histogram:
        print_histogram(args.pdf)
        return

    config = load_config(args.config)
    template, n_fields, n_wire, w_mm, h_mm = extract(args.pdf, config)

    with open(args.output, "w") as fh:
        json.dump(template, fh, indent=2, sort_keys=False)
        fh.write("\n")

    print(f"Wrote {args.output}")
    print(f"fields: {n_fields}  wire: {n_wire}  page: {w_mm} x {h_mm} mm")
    print(
        "NOTE: grid/tick fields not already named in the config's freeTextLabels "
        "are emitted as grid_N_unlabelled / tick_N_unlabelled -- rename them to "
        "match index.html's expected field names before this output replaces a "
        "shipped template. Re-run the coordinate cross-check (match each renamed "
        "field against the previous template within ~0.5mm) before trusting a "
        "changed revision."
    )
    expected_fields = config.get("expectedFields") or 0
    expected_wire = config.get("expectedWire") or 0
    if expected_fields and (n_fields != expected_fields or n_wire != expected_wire):
        print(
            f"Sanity check: this config expects {expected_fields} fields / "
            f"{expected_wire} wire rects, got {n_fields} / {n_wire}. If the form "
            f"has genuinely changed, this is expected -- otherwise re-check "
            f"cellSizePt / tickWRange / tickHRange / maxCellGapPt / dedupeTolPt "
            f"in the config against the PDF's geometry (--histogram helps).",
            file=sys.stderr,
        )
    elif not expected_fields:
        print(
            "No expectedFields/expectedWire set in the config yet -- once "
            f"this output ({n_fields} fields / {n_wire} wire) is cross-checked "
            "and trusted, add those counts to the config so future re-runs get "
            "the sanity check.",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
