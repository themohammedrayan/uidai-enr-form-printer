# UIDAI Form 1 Overlay Printer

A static, offline browser tool that lets an Akshaya e-Centre operator type an
applicant's details and print **only that text** onto a pre-printed official
UIDAI Form 1 (English) sheet fed through the printer. It is an overlay
printer — it does not recreate or render the form itself.

Scope for v1: **Form 1 (English), page 1 only.**

No backend, no framework, no build step, no npm at runtime. Vanilla
HTML/CSS/JS, plus a vendored copy of [pdf-lib](https://pdf-lib.js.org/) for
PDF output. Open `index.html` directly from a folder — no server required.

## Hard rules this tool follows

1. Never draws into the signature / thumb-impression / verifier blocks — no
   field definitions exist for them.
2. No applicant data leaves the browser. No server, no runtime `fetch`, no
   analytics. Only printer calibration is persisted (`localStorage`).
3. The queue is in-memory only: manual wipe button, plus a 15-minute idle
   auto-wipe (of both the queue and the current form) with a visible
   countdown in the final minute.
4. No biometric data anywhere in the model, UI, or template.
5. Aadhaar numbers are Verhoeff-checked before printing (warns, does not
   block — see "Known limitations").
6. Works fully offline; `pdf-lib` is vendored into `vendor/`, not loaded
   from a CDN.

## Running it

Open `index.html` in a browser (double-click, or `file://` from a folder on
the shop counter machine). That's it.

## Repository layout

```
index.html                   entry point: layout + wiring
css/style.css                two-pane responsive layout
js/template-form1-en.js      field template as a plain global (generated,
                             see tools/sync_template.py) — loaded via
                             <script src>, not fetch(), so it works under
                             file://
js/validation.js             Verhoeff checksum + honorific detection
js/app.js                    record model, canvas preview, PDF export,
                             calibration, queue, keyboard flow
vendor/pdf-lib.min.js        vendored pdf-lib UMD build (window.PDFLib)
templates/form1-en.json      canonical field template (source of truth)
tools/extract_template.py    regenerates templates/form1-en.json from the
                             official PDF's vector geometry (pdfplumber)
tools/sync_template.py       copies templates/form1-en.json into
                             js/template-form1-en.js
tools/proof.py               Phase-0 sanity check: stamps sample data onto
                             the real PDF and rasterises it to PNG
```

## Coordinate system

Millimetres, measured from the top-left of the page, stored that way in
`templates/form1-en.json`. Converted to PDF points and flipped to a
bottom-left origin only inside the draw function (`place()` in
`js/app.js`), per the build spec. The canvas live preview uses the same
mm-space transform with no flip, so preview and PDF logic stay close to
identical.

## About `templates/form1-en.json`

The 53 field coordinates (`fields`) originate as the verbatim, PDF-vector-
derived values from the build spec, and **have since been independently
re-verified against an actual copy of `Form_1_Eng.pdf`** (see Phase 0
below): all 36 rect-derived fields (26 ticks + 10 grids) matched real
extracted geometry within 0.13mm, and all 17 free-text fields sit with
sensible, consistent clearance above their printed rule lines with no
label-text overlap. No coordinate corrections were needed.

The `wire` array (used to draw reference rectangles in the live preview and
the alignment sheet) is **real**, extracted directly from that PDF's vector
geometry by `tools/extract_template.py` — 265 deduplicated rectangles above
the signature/thumb-impression block (`wireIsSynthetic: false`). The build
spec's own estimate of "283" was apparently never checked against a real
copy of the form; 265 is the measured ground truth for this revision and
supersedes it. (The PDF itself is still not committed to this repo, per
the tool's own "don't embed the official form" design — only the derived
numeric geometry is.)

**To regenerate against a future form revision:**

```
pip install pdfplumber
python3 tools/extract_template.py path/to/Form_1_Eng.pdf -o templates/form1-en.json
python3 tools/sync_template.py   # refresh js/template-form1-en.js from it
```

`tools/extract_template.py` now ships with the 17 free-text field anchors
pre-filled (`FREE_TEXT_LABELS`), so a same-layout re-run reproduces the
shipped template exactly. Only the rectangle-derived grid/tick fields still
come out under placeholder names (`grid_N_unlabelled`, `tick_N_unlabelled`);
rename them to match the semantic names index.html expects, and re-run the
±0.5mm coordinate cross-check against the previous template, before a
changed-revision output replaces the shipped one.

## Phase 0 — do this before trusting any printed output

The build spec is explicit that coordinates must be verified against paper,
not just the PDF, before this tool is used on a real applicant:

1. **Measure the blank form stock with a ruler.** Record width, height,
   gsm. **Still not done** — this needs physical stock on-site, which
   isn't available in this environment. A real copy of `Form_1_Eng.pdf`
   *is* now available and confirms the PDF itself is US Letter
   (215.9 × 279.4 mm, verified via `pdfplumber`), matching what
   `templates/form1-en.json` assumes — but that only proves the **PDF**
   is Letter-sized, not that the **printed stock** the centre was actually
   supplied is. If the real stock turns out to be A4, coordinates need
   re-deriving against an A4 rendering, not a scale factor.
2. **Done.** Ran `tools/extract_template.py` against a real copy of
   `Form_1_Eng.pdf`: all 36 rect-derived fields matched the shipped
   template within 0.13mm; the `wire` array was replaced with the real
   265-rectangle extraction (see above). Ran `tools/proof.py` against the
   same PDF and inspected the rendered PNG at full page and cropped
   detail (Aadhaar grids, PIN, ward column) — every stamped field lands
   cleanly inside its printed box with comfortable clearance, and nothing
   touches the signature/thumb-impression/verifier block. No coordinate
   corrections were needed.
3. **Still not done.** Printing the alignment sheet and measuring it
   requires a real printer, which isn't available here.
4. **Still not done**, same reason — needs a real printer and real stock
   to print onto and photograph.
5. N/A — no corrections were needed in step 2.

**What this means concretely: the template's coordinates are now verified
correct against the actual official PDF's geometry — the "does this match
the form" risk is retired. What remains is entirely printer/paper-side**
(steps 1, 3, 4): confirming the physical stock matches the PDF's assumed
size, and calibrating/verifying against a real printer. **Do not use this
tool on a real applicant until those remaining physical steps have been
done** — the software can no longer be the source of a placement error,
but an uncalibrated printer or mismatched paper stock still can be.

## What's implemented (Phase 0 software / Phase 1)

- Two-pane layout (entry / calibration + preview + queue), collapsing to
  one column under 960px.
- Full Form 1 (English) data entry in form order (sections 1, 3–7 per the
  spec), keyboard-first: `Enter` advances field-to-field, `Ctrl+Enter`
  prints the current record, `Ctrl+S` adds it to the queue.
- Auto-uppercase on free-text fields (cursor-preserving), digit-stripping
  on numeric fields, and per-field max length computed from the template's
  `w` and a 6pt worst-case-glyph floor via pdf-lib's real font metrics
  (not a guessed round number) — except `addr_ward`, which the spec caps
  at 4 characters explicitly since the printed label leaves almost no
  usable width.
- Verhoeff validation on both Aadhaar fields (live remaining-digit count,
  then pass/fail), title/honorific detection on the name field, an
  overflow warning when the name has to shrink below its preferred size,
  and an NRI-conditional "email mandatory" hint. All of these warn; none
  of them block printing.
- Live canvas preview in mm-space, sharing its field-rendering logic with
  the PDF exporter so the two can't drift apart.
- Named calibration profiles (`dx`, `dy`, `scale`) in `localStorage`
  (wrapped in try/catch), with an "apply measurements" helper that turns a
  measured crosshair position and 150 mm bar reading directly into those
  three numbers.
- An alignment-sheet print mode (wire hairlines + labelled crosshair +
  labelled 150 mm bar).
- In-app PDF preview (blob URL in an iframe) instead of download-then-open,
  with a "Print now" button and a "Print blank" jam-fallback escape hatch.
- Family batching: queue, "reuse address" (seeds address, POA, HoF name,
  HoF Aadhaar into a fresh form and focuses the name field), "print whole
  queue" (one PDF page per record), duplicate-Aadhaar warning against the
  queue, manual queue wipe, and a 15-minute idle auto-wipe of the whole
  session with a final-minute countdown banner.

Verified with a scripted headless-browser pass (fill fields, check
Verhoeff/title/duplicate logic, generate all four PDF variants, confirm
each is a valid PDF at 215.9 × 279.4 mm with the expected page count), and
separately with `tools/proof.py` stamping sample data directly onto the
real `Form_1_Eng.pdf` and visually inspecting the rendered PNG — not yet on
a real printer.

## Explicitly out of scope for v1

Per the build spec: PIN-code autofill, document-type pickers, multi-page /
multi-form templates, and a generalised extractor CLI are Phase 2/3 work.
Malayalam Form 1 would need an embedded Unicode font (the PDF standard
fonts can't draw it) and hasn't been started. There is no server, database,
account system, or biometric capture, and there never will be — this tool
prints paper; a human operator does the rest through the official client.

## Open questions (spec section 11, unresolved here)

1. Is the physical stock Letter or A4? — needs a ruler on-site.
2. Does the counter printer have a manual feed tray?
3. Which of Forms 2–8 does the centre actually see?
4. Is the Malayalam Form 1 needed?
