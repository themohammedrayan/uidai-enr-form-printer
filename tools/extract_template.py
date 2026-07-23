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
  - Tick boxes: rectangles roughly 15 x 10 pt, in two size variants
    (15.6 x 10.4 and 15.0 x 8.6).
  - Free-text field positions cannot be derived from rectangles alone (there
    is no printed box) -- they come from the table rule lines plus the end
    x-coordinate of the printed label before each blank. Those anchors are
    the FREE_TEXT_LABELS table below; adjust it by hand if the label text or
    layout changes between revisions. This is the one part of the file that
    stays hand-tuned, as noted in the build spec.
  - Every rectangle above y = 560pt ("top < 560pt" in pdfplumber's
    top-down coordinates) is also emitted as a `wire` entry, in mm, as
    [x, y, w, h]. This drives the on-screen preview and the alignment sheet
    without ever embedding the official PDF in the repo.

Expected sanity-check output for the current Form 1 (English) revision:
53 fields, 283 wire rectangles, page 215.9 x 279.4 mm (US Letter).
"""
import argparse
import json
import sys
from collections import defaultdict

PT_PER_MM = 72.0 / 25.4
MM_PER_PT = 25.4 / 72.0

CELL_SIZE_PT = (10.4, 10.4)
CELL_TOL_PT = 0.3

TICK_VARIANTS_PT = [
    (15.6, 10.4),
    (15.0, 8.6),
]
TICK_TOL_PT = 0.3

DEDUPE_TOL_PT = 0.5  # rectangles within this distance are the same rect drawn twice

# Fields that cannot be recovered from rectangle geometry because the form
# prints no box for them -- only a rule line and a label. Filled in by hand
# from the table rule positions and the label's end x-coordinate; kept here
# so a future revision only needs these re-measured, not the whole template.
# Format matches the "text" field kind in the template schema.
FREE_TEXT_LABELS = {
    # "field_name": {"x": ..., "y": ..., "w": ..., "size": ...},
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
            continue
        is_tick = False
        for tw, th in TICK_VARIANTS_PT:
            if matches_size(w, h, tw, th, tol=TICK_TOL_PT):
                ticks.append(r)
                is_tick = True
                break
        if not is_tick:
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
            if pitch <= 6.0:  # same run of adjacent cells
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
        "NOTE: rectangle-derived fields are named grid_N_unlabelled / "
        "tick_N_unlabelled -- rename them to match the semantic field names "
        "used by index.html (see templates/form1-en.json's existing keys), "
        "and fill in FREE_TEXT_LABELS for the boxless text fields, before "
        "this output replaces the shipped template."
    )
    if n_fields != 53 or n_wire != 283:
        print(
            f"Sanity check: expected 53 fields / 283 wire rects for the "
            f"current form revision, got {n_fields} / {n_wire}. "
            f"If the form has genuinely changed, this is expected -- "
            f"otherwise re-check CELL_SIZE_PT / TICK_VARIANTS_PT / "
            f"dedupe tolerances against the new PDF's geometry.",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
