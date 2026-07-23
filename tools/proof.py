#!/usr/bin/env python3
"""
Phase-0 sanity check (build spec section 9, step 3): stamp sample data onto
the real Form_1_Eng.pdf in a contrasting color and rasterise it to PNG, so a
human can eyeball whether the template's coordinates actually land inside
the printed boxes -- before ever touching a real printer or paper stock.

This does NOT use the app's own renderer (index.html + pdf-lib); it is a
deliberately independent, from-scratch overlay using pypdf/reportlab so a
bug shared between the two would not be invisible.

Usage:
    pip install pypdf reportlab pdf2image
    # pdf2image also needs the poppler-utils system package (pdftoppm).
    python3 tools/proof.py path/to/Form_1_Eng.pdf \
        --template templates/form1-en.json \
        --out proof.png

Sample data is intentionally unrealistic (obvious placeholder strings/digits)
so nobody mistakes the PNG for a real applicant's data.
"""
import argparse
import json
import sys

MM2PT = 72.0 / 25.4
CONTRAST_RGB = (0.85, 0.0, 0.85)  # magenta -- unmistakable against black form print

SAMPLE = {
    "purpose_enrolment": True,
    "status_resident": True,
    "name": "SAMPLE APPLICANT NAME",
    "gender_male": True,
    "dob": "01011990",
    "age": "036",
    "dob_declared": True,
    "email": "SAMPLE@EXAMPLE.COM",
    "mobile": "9800000000",
    "basis_document": True,
    "addr_house": "12A",
    "addr_street": "SAMPLE STREET NAME ROAD",
    "addr_landmark": "NEAR SAMPLE LANDMARK",
    "addr_area": "SAMPLE AREA LOCALITY NAME",
    "addr_village": "SAMPLE VILLAGE",
    "addr_post_office": "SAMPLE PO",
    "addr_pin": "682001",
    "addr_subdistrict": "SAMPLE TALUK",
    "addr_district": "SAMPLE DISTRICT",
    "addr_state": "KERALA",
    "doc_poi": "SAMPLE POI DOCUMENT",
    "doc_poa": "SAMPLE POA DOCUMENT",
    "hof_name": "SAMPLE HOF NAME",
    "hof_aadhaar_1": "1234",
    "hof_aadhaar_2": "5678",
    "hof_aadhaar_3": "9012",
    "rel_father": True,
    "applicant_aadhaar_1": "1111",
    "applicant_aadhaar_2": "2222",
    "applicant_aadhaar_3": "3333",
    "upd_name": True,
}


def draw_tick(c, x_mm, y_mm, page_h_pt):
    from reportlab.lib.colors import Color

    arm = 1.3 * MM2PT
    cx = x_mm * MM2PT
    cy = page_h_pt - y_mm * MM2PT
    c.setStrokeColor(Color(*CONTRAST_RGB))
    c.setLineWidth(0.9)
    c.line(cx - arm, cy - arm, cx + arm, cy + arm)
    c.line(cx - arm, cy + arm, cx + arm, cy - arm)


def draw_grid(c, field, value, page_h_pt):
    from reportlab.lib.colors import Color

    c.setFillColor(Color(*CONTRAST_RGB))
    c.setFont("Courier", 10)
    for i, ch in enumerate(str(value)[: field["cells"]]):
        cx_mm = field["x"] + i * field["pitch"]
        baseline_y_mm = field["y"] + field["h"] - 0.85
        x_pt = cx_mm * MM2PT
        y_pt = page_h_pt - baseline_y_mm * MM2PT
        c.drawCentredString(x_pt + (field["pitch"] * MM2PT) / 2, y_pt, ch)


def draw_text(c, field, value, page_h_pt):
    from reportlab.lib.colors import Color
    from reportlab.pdfbase.pdfmetrics import stringWidth

    size = field["size"]
    w_pt = field["w"] * MM2PT
    text = str(value)
    while size > 4 and stringWidth(text, "Helvetica-Bold", size) > w_pt:
        size -= 0.25
    x_pt = field["x"] * MM2PT
    y_pt = page_h_pt - field["y"] * MM2PT
    c.setFillColor(Color(*CONTRAST_RGB))
    c.setFont("Helvetica-Bold", size)
    c.drawString(x_pt, y_pt, text)


def build_overlay(template, sample, page_w_pt, page_h_pt):
    import io

    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(page_w_pt, page_h_pt))
    for name, value in sample.items():
        field = template["fields"].get(name)
        if field is None:
            print(f"warning: sample field {name!r} not in template, skipped", file=sys.stderr)
            continue
        if field["kind"] == "tick" and value:
            draw_tick(c, field["x"], field["y"], page_h_pt)
        elif field["kind"] == "grid":
            draw_grid(c, field, value, page_h_pt)
        elif field["kind"] == "text":
            draw_text(c, field, value, page_h_pt)
    c.showPage()
    c.save()
    buf.seek(0)
    return buf


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf", help="Path to the real form PDF")
    ap.add_argument("--template", default="templates/form1-en.json")
    ap.add_argument("--sample", help="Path to a JSON file of {fieldName: value} sample data. "
                                      "Omit to use the built-in SAMPLE (Form 1's field names).")
    ap.add_argument("--out", default="proof.png")
    ap.add_argument("--dpi", type=int, default=200)
    args = ap.parse_args()

    sample = SAMPLE
    if args.sample:
        with open(args.sample) as fh:
            sample = json.load(fh)

    try:
        from pypdf import PdfReader, PdfWriter
    except ImportError:
        print("pypdf is required: pip install pypdf reportlab pdf2image", file=sys.stderr)
        sys.exit(1)

    with open(args.template) as fh:
        template = json.load(fh)

    base = PdfReader(args.pdf)
    page0 = base.pages[0]
    page_w_pt = float(page0.mediabox.width)
    page_h_pt = float(page0.mediabox.height)

    expected_w_mm = template["page"]["widthMm"]
    expected_h_mm = template["page"]["heightMm"]
    actual_w_mm = page_w_pt * 25.4 / 72.0
    actual_h_mm = page_h_pt * 25.4 / 72.0
    if abs(actual_w_mm - expected_w_mm) > 1 or abs(actual_h_mm - expected_h_mm) > 1:
        print(
            f"WARNING: PDF page is {actual_w_mm:.1f} x {actual_h_mm:.1f} mm, "
            f"template expects {expected_w_mm} x {expected_h_mm} mm. "
            f"Coordinates will not line up -- see build spec section 4.",
            file=sys.stderr,
        )

    overlay_buf = build_overlay(template, sample, page_w_pt, page_h_pt)
    overlay_reader = PdfReader(overlay_buf)

    writer = PdfWriter()
    page0.merge_page(overlay_reader.pages[0])
    writer.add_page(page0)
    for p in base.pages[1:]:
        writer.add_page(p)

    stamped_path = args.out.rsplit(".", 1)[0] + "_stamped.pdf"
    with open(stamped_path, "wb") as fh:
        writer.write(fh)
    print(f"Wrote {stamped_path}")

    try:
        from pdf2image import convert_from_path
    except ImportError:
        print(
            "pdf2image not installed -- stamped PDF written, but skipping "
            "PNG rasterisation. pip install pdf2image (needs poppler-utils).",
            file=sys.stderr,
        )
        return

    images = convert_from_path(stamped_path, dpi=args.dpi, first_page=1, last_page=1)
    images[0].save(args.out)
    print(f"Wrote {args.out} -- open it and check every field sits inside its box.")


if __name__ == "__main__":
    main()
