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

The 53 field coordinates (`fields`) are the verbatim, PDF-vector-derived
values from the build spec — authoritative and not re-measured here.

The `wire` array (used to draw reference rectangles in the live preview and
the alignment sheet) is currently a **synthetic approximation** built from
those same field anchors (see `wireIsSynthetic: true` in the JSON), because
this repository does not have — and deliberately does not embed — a copy of
the actual `Form_1_Eng.pdf`. It is good enough to sanity-check layout on
screen, but it is not a substitute for running `tools/extract_template.py`
against the real PDF, which the build spec says should yield 283
rectangles.

**To regenerate against the real PDF once it's available:**

```
pip install pdfplumber
python3 tools/extract_template.py path/to/Form_1_Eng.pdf -o templates/form1-en.json
python3 tools/sync_template.py   # refresh js/template-form1-en.js from it
```

`tools/extract_template.py` will emit rectangle-derived fields under
placeholder names (`grid_N_unlabelled`, `tick_N_unlabelled`); it prints a
reminder to rename them to match the semantic names index.html expects
(the keys already present in `templates/form1-en.json`) before the output
replaces the shipped template.

## Phase 0 — do this before trusting any printed output

The build spec is explicit that coordinates must be verified against paper,
not just the PDF, before this tool is used on a real applicant:

1. **Measure the blank form stock with a ruler.** Record width, height,
   gsm. `templates/form1-en.json` currently assumes US Letter
   (215.9 × 279.4 mm) per the spec. If the real stock is A4
   (210 × 297 mm), the fix is to re-derive coordinates against an A4
   rendering — not to apply a scale factor. **This has not been confirmed
   against physical stock in this build.**
2. Run `tools/proof.py` against the real `Form_1_Eng.pdf` and look at the
   PNG it produces.
3. Print the alignment sheet (button in the calibration panel), measure
   the crosshair and the 150 mm bar on paper, and enter those measurements
   into the calibration panel's "Apply measurements" fields.
4. Print one fully populated form onto real stock, photograph it, and check
   every field sits inside its printed box with ≥0.5 mm clearance.
5. Fix any offending field's `x`/`y`/`w` in `templates/form1-en.json` (and
   re-run `tools/sync_template.py`).

None of steps 1–4 have been performed against physical UIDAI form stock in
this build — they require a real printer, a real form, and a ruler, none of
which are available in this environment. **Do not use this tool on a real
applicant until that verification has been done.**

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
each is a valid PDF at 215.9 × 279.4 mm with the expected page count) —
not on a real printer.

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
