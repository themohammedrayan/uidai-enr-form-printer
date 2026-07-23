#!/usr/bin/env python3
"""
Regenerate templates/form1-en.json from the official Form_1_Eng.pdf.

Run this whenever UIDAI revises the form, instead of re-measuring coordinates
by hand:

    pip install pdfplumber
    python3 tools/extract_template.py path/to/Form_1_Eng.pdf -o templates/form1-en.json

Extraction rules (see build spec section 6):

  - Character cells: rectangles measuring 10.4 x 10.4 pt. The PDF draws
    several of these twice, ~0.12pt apart, so they are deduplicated.
  - Tick boxes: rectangles roughly 15 x 10 pt. The build spec describes two
    exact size variants (15.6 x 10.4 and 15.0 x 8.6), but the real PDF's
    geometry has more jitter than that across the page (observed instances
    from 14.9x8.6 to 15.7x10.4) -- classified here by range instead
    (TICK_W_RANGE / TICK_H_RANGE), since no cell-sized rectangle ever falls
    inside that width range, so there's no ambiguity.
  - Free-text field positions cannot be derived from rectangles alone (there
    is no printed box) -- they come from the table rule lines plus the end
    x-coordinate of the printed label before each blank. Those anchors are
    the FREE_TEXT_LABELS table below; adjust it by hand if the label text or
    layout changes between revisions. This is the one part of the file that
    stays hand-tuned, as noted in the build spec. The values currently in
    FREE_TEXT_LABELS are the ones shipped in templates/form1-en.json, and
    have been cross-checked against the real PDF (each field's baseline
    sits ~1.1-1.4mm above its printed rule line, or ~4.9mm for the two
    taller single-line rows -- name and doc_por -- with no label-text
    overlap anywhere); re-verify them by hand if the label layout changes.
  - Every rectangle above y = 560pt ("top < 560pt" in pdfplumber's
    top-down coordinates) is also emitted as a `wire` entry, in mm, as
    [x, y, w, h]. This drives the on-screen preview and the alignment sheet
    without ever embedding the official PDF in the repo. The cutoff
    excludes the signature/thumb-impression/verifier block at the bottom
    of the page, consistent with never drawing into it.

Measured sanity-check output against an actual copy of Form 1 (English):
53 fields (26 ticks + 10 grids + 17 free-text), 265 wire rectangles, page
215.9 x 279.4 mm (US Letter). All 36 rect-derived field coordinates matched
the shipped template within 0.13mm. The build spec's own estimate of "283"
wire rectangles was not re-verified against a real PDF when it was written;
265 is the measured ground truth for this revision and supersedes it.
"""
import argparse
import json
import sys
from collections import defaultdict

PT_PER_MM = 72.0 / 25.4
MM_PER_PT = 25.4 / 72.0

CELL_SIZE_PT = (10.4, 10.4)
CELL_TOL_PT = 0.3

# Tick boxes come in two size variants per the build spec (15.6x10.4 and
# 15.0x8.6), but real-world PDF geometry has more jitter across the page than
# that suggests -- observed instances range from (14.9, 8.6) to (15.7, 10.4).
# Classify by range rather than two exact points, since no cell-sized rect
# (~10.4x10.4) ever falls inside this width range, so there is no ambiguity.
TICK_W_RANGE = (14.5, 16.0)
TICK_H_RANGE = (8.0, 11.0)

DEDUPE_TOL_PT = 0.5  # rectangles within this distance are the same rect drawn twice

# Grid character cells sit pitch-apart (~10.3-10.6pt for this form's 3.64mm
# pitch) within one grid field. A gap larger than this means the next rect
# belongs to a different field that merely happens to share a row.
MAX_CELL_GAP_PT = 15.0

# Fields that cannot be recovered from rectangle geometry because the form
# prints no box for them -- only a rule line and a label. Filled in by hand
# from the table rule positions and the label's end x-coordinate; kept here
# so a future revision only needs these re-measured, not the whole template.
# Format matches the "text" field kind in the template schema.
FREE_TEXT_LABELS = {
    "name": {"kind": "text", "x": 39.51, "y": 40.39, "w": 161.57, "size": 10.5},
    "email": {"kind": "text", "x": 39.51, "y": 63.15, "w": 87.49, "size": 9.0},
    "addr_house": {"kind": "text", "x": 67.73, "y": 86.61, "w": 33.16, "size": 8.5},
    "addr_street": {"kind": "text", "x": 113.24, "y": 86.61, "w": 86.78, "size": 8.5},
    "addr_landmark": {"kind": "text", "x": 39.51, "y": 91.44, "w": 43.74, "size": 8.5},
    "addr_ward": {"kind": "text", "x": 100.19, "y": 91.44, "w": 1.41, "size": 7.0},
    "addr_area": {"kind": "text", "x": 134.41, "y": 91.44, "w": 65.97, "size": 8.5},
    "addr_village": {"kind": "text", "x": 51.51, "y": 96.31, "w": 32.1, "size": 8.5},
    "addr_post_office": {"kind": "text", "x": 118.18, "y": 96.31, "w": 26.11, "size": 8.5},
    "addr_subdistrict": {"kind": "text", "x": 41.27, "y": 101.14, "w": 42.33, "size": 8.5},
    "addr_district": {"kind": "text", "x": 97.72, "y": 101.14, "w": 46.57, "size": 8.5},
    "addr_state": {"kind": "text", "x": 154.52, "y": 101.14, "w": 45.86, "size": 8.5},
    "doc_poi": {"kind": "text", "x": 122.77, "y": 106.01, "w": 77.61, "size": 8.5},
    "doc_poa": {"kind": "text", "x": 125.59, "y": 110.84, "w": 74.79, "size": 8.5},
    "doc_pdb": {"kind": "text", "x": 145.7, "y": 115.68, "w": 54.68, "size": 8.5},
    "hof_name": {"kind": "text", "x": 68.79, "y": 125.38, "w": 51.51, "size": 8.5},
    "doc_por": {"kind": "text", "x": 117.12, "y": 139.7, "w": 83.26, "size": 8.5},
}


def approx(a, b, tol):
    return abs(a - b) <= tol


def matches_size(w, h, target_w, target_h, tol):
    return approx(w, target_w, tol) and approx(h, target_h, tol)


def dedupe_rects(rects, tol=DEDUPE_TOL_PT):
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


def classify_rects(rects):
    cells, ticks, other = [], [], []
    for r in rects:
        w, h = r["width"], r["height"]
        if matches_size(w, h, *CELL_SIZE_PT, tol=CELL_TOL_PT):
            cells.append(r)
        elif TICK_W_RANGE[0] <= w <= TICK_W_RANGE[1] and TICK_H_RANGE[0] <= h <= TICK_H_RANGE[1]:
            ticks.append(r)
        else:
            other.append(r)
    return cells, ticks, other


def group_cells_into_grids(cells, page_height_pt):
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
            if pitch <= MAX_CELL_GAP_PT:  # same run of adjacent cells
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


def extract(pdf_path):
    import pdfplumber

    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[0]
        page_w_mm = round(page.width * MM_PER_PT, 1)
        page_h_mm = round(page.height * MM_PER_PT, 1)

        all_rects = page.rects
        deduped = dedupe_rects(all_rects)
        cells, ticks, _other = classify_rects(deduped)

        wire = []
        for r in deduped:
            if r["top"] < 560:
                wire.append(rect_to_mm(r["x0"], r["top"], r["width"], r["height"]))

        grids = group_cells_into_grids(cells, page.height)

        fields = dict(FREE_TEXT_LABELS)

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
            "form": "Form 1 (English)",
            "page": {"widthMm": page_w_mm, "heightMm": page_h_mm},
            "gridPitchMm": 3.64,
            "fields": fields,
            "wire": wire,
            "wireIsSynthetic": False,
        }, len(fields), len(wire), page_w_mm, page_h_mm


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf", help="Path to Form_1_Eng.pdf")
    ap.add_argument("-o", "--output", default="templates/form1-en.json")
    args = ap.parse_args()

    try:
        import pdfplumber  # noqa: F401
    except ImportError:
        print("pdfplumber is required: pip install pdfplumber", file=sys.stderr)
        sys.exit(1)

    template, n_fields, n_wire, w_mm, h_mm = extract(args.pdf)

    with open(args.output, "w") as fh:
        json.dump(template, fh, indent=2, sort_keys=False)
        fh.write("\n")

    print(f"Wrote {args.output}")
    print(f"fields: {n_fields}  wire: {n_wire}  page: {w_mm} x {h_mm} mm")
    print(
        "NOTE: grid/tick fields not already in FREE_TEXT_LABELS's semantic "
        "namespace are emitted as grid_N_unlabelled / tick_N_unlabelled -- "
        "rename them to match index.html's expected field names (see the "
        "existing keys in templates/form1-en.json) before this output "
        "replaces the shipped template. Re-run the coordinate cross-check "
        "(match each renamed field against the previous template within "
        "~0.5mm) before trusting a changed revision."
    )
    if n_fields != 53 or n_wire != 265:
        print(
            f"Sanity check: this revision was measured at 53 fields / 265 "
            f"wire rects (page 215.9 x 279.4mm), got {n_fields} / {n_wire}. "
            f"If the form has genuinely changed, this is expected -- "
            f"otherwise re-check CELL_SIZE_PT / TICK_W_RANGE / TICK_H_RANGE / "
            f"MAX_CELL_GAP_PT / dedupe tolerances against the new PDF's "
            f"geometry.",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
