# UIDAI Overlay Printer

A static, offline browser tool that lets an Akshaya e-Centre operator type an
applicant's details and print **only that text** onto a pre-printed official
UIDAI enrolment form sheet fed through the printer. It is an overlay printer
— it does not recreate or render the forms themselves.

Supports three forms, switchable by tab, sharing one printer calibration and
one queue:

| Form | Who it's for | Page size |
|---|---|---|
| **Form 1** (English) | Adult enrolment/update | US Letter (215.9 × 279.4mm) |
| **Form 3** (English) | Child aged 5–18 | US Letter (215.9 × 279.4mm) |
| **Form 5** (English) | Child below 5 | A4 (210 × 297mm) |

Scope: **page 1 only** of each form (page 2 is instructions/declaration text,
never filled, for all three).

No backend, no framework, no build step, no npm at runtime. Vanilla
HTML/CSS/JS, plus a vendored copy of [pdf-lib](https://pdf-lib.js.org/) for
PDF output. Open `index.html` directly from a folder — no server required.
(A small `package.json`/Playwright setup exists purely for the dev-only
regression suite in `tests/` — see "Testing" below; it has no bearing on how
the shipped app runs.)

## Hard rules this tool follows

1. Never draws into the signature / thumb-impression / verifier blocks — no
   field definitions exist for them, in any of the three forms.
2. No applicant data leaves the browser. No server, no runtime `fetch`, no
   analytics. Only printer calibration is persisted (`localStorage`).
3. The queue is in-memory only: manual wipe button, plus a 15-minute idle
   auto-wipe (of both the queue and the current form, across all three
   forms) with a visible countdown in the final minute.
4. No biometric data anywhere in the model, UI, or any template.
5. Aadhaar numbers are Verhoeff-checked before printing (warns, does not
   block).
6. Works fully offline; `pdf-lib` is vendored into `vendor/`, not loaded
   from a CDN.

## Running it

Open `index.html` in a browser (double-click, or `file://` from a folder on
the shop counter machine). Pick the right tab (Form 1 / Form 3 / Form 5) for
the applicant. That's it.

## Architecture: engine / schema-runtime / per-form schema

The three forms share almost all of their plumbing; only the parts that
genuinely differ per form (field coordinates, and which UI widgets bind to
which record paths) are duplicated.

- **`js/engine.js`** (`window.FormEngine`) — template-agnostic rendering.
  `place()`, `computeRenderPlan()`, `drawFieldCanvas()`/`drawFieldPdf()`,
  and the four `generate*Pdf()` functions never reference a specific form's
  field names; they operate purely on a template's `{kind, x, y, ...}` field
  definitions and a flat `fieldValues` map, with `template`/`fontsMetrics`
  passed in explicitly. `generateQueuePdf()` sizes each page from that
  entry's own template, so a queue mixing Form 1/3 (Letter) and Form 5 (A4)
  entries produces one PDF with correctly-sized pages throughout.
- **`js/schema-runtime.js`** (`window.SchemaRuntime`) — the generic binding
  and validation layer, driven by each form's declarative schema (below):
  record↔form binding (`applyRecordToForm`, `bindTextInput`/`bindRadioGroup`/
  `bindCheckboxGroup`), Verhoeff/duplicate-Aadhaar/title-detection/overflow-
  warning/NRI-email-required validation UI (attached via
  `data-status-for`/`data-warning-for`/`data-dup-warning-for`/
  `data-required-note-for`/`data-hint-for` attributes rather than hardcoded
  DOM ids — necessary since all three forms' markup coexists in the DOM at
  once, so these lookups are scoped to the active form's root element), and
  cross-form-aware queue-list rendering (each entry resolves its own schema
  via a registry, so a mixed-form queue renders correctly).
- **`js/schema-form{1,3,5}-en.js`** — each form's declarative field table:
  for every input, its widget kind (`text` / `radioGroup` / `checkboxGroup`),
  record path, and which template field(s) it feeds (a 12-digit Aadhaar text
  input splits across three grid template fields via `split: 4`), plus
  validation `role`s (`aadhaar`, `name`, `dob`) and `requiredWhen` for the
  NRI-conditional email. Entry-form **HTML is still hand-authored** per form
  (not generated from the schema) — the three forms' wording and section
  layout differ enough, especially Form 5's dual-parent section, that
  hand-authored markup stays far more readable; only the *wiring* is
  schema-driven.
- **`js/app.js`** — glue: a `REGISTRY` mapping `formId → {schema, template,
  label}`, `switchForm()` (swaps the active template/schema/DOM root,
  preserving each form's in-progress record across tab switches, resizing
  the preview canvas to the new template's aspect ratio), calibration
  profiles, idle-wipe, and keyboard flow.

Form 1 was migrated onto this same layer (rather than left as a one-off) —
see git history for the sequencing: engine extracted first and confirmed
behavior-identical, then the schema layer built and Form 1 migrated onto it
with the regression suite gating each step, before Form 3 and Form 5 were
built on the now-proven foundation.

### recordShape convention (cross-form queue / reuse-address)

Each schema declares a `recordShape`: which record paths make up the address
block (`addr`), which top-level paths are safe to copy into *any* other
form's fresh record on "reuse address" (`sharedTop`), and which paths hold
Aadhaar numbers for cross-form duplicate checking (`aadhaarPaths`). The
`addr` key set is identical across all three schemas by convention (enforced
by a test, `tests/multi-form.spec.js`) — that's what lets "reuse address"
work generically between any two forms without a per-pair adapter.

Form 5 doesn't have a single "head of family" like Form 1/3 do (it has
separate mother/father/guardian slots), so its `sharedTop` deliberately
excludes any HoF-equivalent path — reuse-address *into* or *from* Form 5
carries address + POA only, never HoF/parent details, since there's no
principled automatic mapping from one adult HoF onto a specific parent slot.

## Coordinate system

Millimetres, measured from the top-left of each form's own page, stored that
way in `templates/form{1,3,5}-en.json`. Converted to PDF points and flipped
to a bottom-left origin only inside `place()` (`js/engine.js`). The canvas
live preview uses the same mm-space transform with no flip, so preview and
PDF logic stay close to identical, and its pixel size is derived from the
active template's own aspect ratio (`sizeCanvasToTemplate`) — necessary
since Form 5 is A4 (0.707 aspect ratio) while Form 1/3 are Letter (0.773).

## Repository layout

```
index.html                     entry point: form-switcher tabs + three entry
                               panels + shared calibration/preview/queue pane
css/style.css                  responsive two-pane layout + tab styling
js/engine.js                   template-agnostic rendering (window.FormEngine)
js/schema-runtime.js           generic binding/validation layer (window.SchemaRuntime)
js/schema-form{1,3,5}-en.js    per-form declarative field schemas
js/template-form{1,3,5}-en.js  per-form field templates as plain globals
                               (generated, see tools/sync_template.py) —
                               loaded via <script src>, not fetch(), so it
                               works under file://
js/validation.js               Verhoeff checksum + honorific detection
                               (fully generic, used by all three forms)
js/app.js                      form registry/switcher, calibration, queue,
                               idle-wipe, keyboard flow
vendor/pdf-lib.min.js          vendored pdf-lib UMD build (window.PDFLib)
templates/form{1,3,5}-en.json  canonical field templates (source of truth)
tools/extract_template.py      regenerates a templates/*.json from a form's
                               official PDF's vector geometry (pdfplumber),
                               config-driven per form (see below)
tools/extract_configs/*.json   per-form extraction calibration (cell/tick
                               size thresholds, free-text label anchors,
                               expected field/wire counts)
tools/sync_template.py         copies templates/*.json into js/template-*.js
tools/proof.py                 Phase-0 sanity check: stamps sample data onto
                               a real form PDF and rasterises it to PNG
tests/                         Playwright regression suite (dev-only)
package.json, playwright.config.js   dev-only test tooling
```

## About the templates

All three templates' field coordinates were extracted from the official
PDFs' vector geometry (not measured by hand) and independently re-verified:

- **Form 1**: 53 fields (26 ticks + 10 grids + 17 free-text), 265 wire
  rectangles, US Letter. All 36 rect-derived fields matched within 0.13mm;
  all 17 free-text fields checked out against their printed rule lines.
- **Form 3**: 50 fields (23 ticks + 10 grids + 17 free-text — 3 relationship
  options instead of Form 1's 6, since this form is for a minor), 259 wire
  rectangles, US Letter. Labeled by reading the actual printed text next to
  each rectangle (not by nearest-neighbor distance to Form 1's coordinates —
  an early attempt at that mislabeled two ticks, since Form 3's Father/Legal-
  guardian boxes happen to sit near where Form 1 draws its own unrelated
  Spouse/Child boxes). Its house-number field is genuinely only ~5mm wide
  (confirmed intentional via `tools/proof.py`, not a bug) — the printed
  label consumes nearly the whole column.
- **Form 5**: 60 fields (25 ticks + 16 grids + 19 free-text — mother/father/
  guardian name+Aadhaar instead of a single HoF, a Yes/No "other parent
  absent" tick, and a genuinely multi-select relationship field modeled as a
  `checkboxGroup`), 332 wire rectangles, **A4**. Required real recalibration
  of the extractor's size thresholds (this form's rectangles run ~0.1–0.3pt
  smaller than Form 1/3's), and one tick box ("Document verification") turned
  out to be a real, much smaller irregularity in the source PDF (5.16×3.0pt
  vs. the ~14.5×9pt standard) rather than an extraction bug.

All three were visually verified with `tools/proof.py` (which takes a
`--sample` JSON file of field→value pairs, so each form's own field names
can be used) stamping sample data directly onto the real PDF and inspecting
the rendered PNG: every field lands cleanly inside its printed box with
clearance, nothing touches any signature/thumb-impression/verifier block.

**None of the official PDFs are committed to this repo** — per the tool's
own "don't embed the official form" design, only the derived numeric
geometry is.

### Regenerating a template, or adding a new form

```
pip install pdfplumber
python3 tools/extract_template.py path/to/Form_N_Eng.pdf --histogram
```

Run `--histogram` first on any new form: it dumps a sorted `(width, height)`
rectangle-size frequency table, letting you eyeball the cell/tick clusters
before writing a config (this is exactly how Form 5's recalibration and its
one-off tiny tick box were found and confirmed). Then:

1. Copy an existing `tools/extract_configs/form{N}-en.json` as a starting
   point; adjust `cellSizePt`/`cellTolPt`/`tickWRange`/`tickHRange`/
   `maxCellGapPt`/`dedupeTolPt`/`wireCutoffTopPt` to bracket the real
   clusters found in step 1. Leave `freeTextLabels` empty and
   `expectedFields`/`expectedWire` at 0 for now.
2. `python3 tools/extract_template.py path/to/Form_N_Eng.pdf --config tools/extract_configs/form{N}-en.json -o templates/form{N}-en.json`.
   Grid/tick fields come out as `grid_N_unlabelled`/`tick_N_unlabelled`;
   rename them to the semantic names by reading the actual printed text next
   to each (pdfplumber word extraction) — **not** by nearest-neighbor
   distance to another form's coordinates, which can silently mislabel
   fields with a different option set (see Form 3's note above).
   Hand-derive each free-text field's anchor from its label's end-x,
   baseline, and the real column-divider rectangles bounding its row.
3. Cross-check the result (nearest-neighbor match against a second
   independent extraction pass, or eyeballing `tools/proof.py`'s output)
   within ~0.5mm, then fill in the config's `expectedFields`/`expectedWire`
   so future re-extractions of the same revision get a sanity check.
4. `python3 tools/sync_template.py form{N}-en` to refresh the JS global.
5. Write `js/schema-form{N}-en.js` (declarative field table) and add an
   entry-form panel + form-tab button to `index.html`, then register it in
   `js/app.js`'s `REGISTRY`.

## Phase 0 — do this before trusting any printed output

The build spec is explicit that coordinates must be verified against paper,
not just the PDF, before this tool is used on a real applicant. For all
three forms:

1. **Measure the blank form stock with a ruler.** Record width, height, gsm.
   **Still not done** for any of the three forms — needs physical stock
   on-site, which isn't available in this environment. Real copies of all
   three PDFs *are* available and confirm the PDFs themselves are US Letter
   (Form 1/3) and A4 (Form 5) via `pdfplumber` — but that only proves the
   **PDF** size, not that the **printed stock** the centre was actually
   supplied matches. If any real stock turns out to be the other size,
   coordinates need re-deriving against that size's rendering, not a scale
   factor.
2. **Done**, for all three forms. Ran `tools/extract_template.py` against
   real copies of each PDF and cross-checked every rect-derived field; ran
   `tools/proof.py` against each and visually inspected the rendered PNGs.
   No coordinate corrections were needed for any of the three.
3. **Still not done.** Printing the alignment sheet and measuring it
   requires a real printer, which isn't available here. Once it is: budget
   **separate calibration profiles per page size** (e.g. "Default-Letter" /
   "Default-A4") — a printer's registration offset is not guaranteed
   identical across paper sizes even through the same tray, and this tool
   doesn't assume otherwise.
4. **Still not done**, same reason — needs a real printer and real stock to
   print onto and photograph, for each form.
5. N/A — no corrections were needed in step 2.

**What this means concretely: all three templates' coordinates are verified
correct against their actual official PDFs — the "does this match the form"
risk is retired for all of them. What remains is entirely printer/paper-side**
(steps 1, 3, 4): confirming the physical stock matches each PDF's assumed
size, and calibrating/verifying against a real printer. **Do not use this
tool on a real applicant until those remaining physical steps have been
done.**

## What's implemented

- Form-switcher tabs (Form 1 / Form 3 / Form 5) sharing one calibration
  panel, live preview, and queue; per-form in-progress state is preserved
  when switching tabs away and back.
- Full data entry for each form in its own printed order, keyboard-first:
  `Enter` advances field-to-field, `Ctrl+Enter` prints the current record,
  `Ctrl+S` adds it to the queue.
- Auto-uppercase on free-text fields (cursor-preserving), digit-stripping on
  numeric fields, and per-field max length computed from the template's `w`
  and a 6pt worst-case-glyph floor via pdf-lib's real font metrics (not a
  guessed round number) — e.g. Form 1's `addr_ward` (explicitly capped at 4
  chars per the spec) and Form 3's `addr_house` (genuinely ~2 chars, from
  its real narrow column) both end up computed/capped correctly.
- Verhoeff validation on every Aadhaar field across all three forms (live
  remaining-digit count, then pass/fail), title/honorific detection on the
  name field, an overflow warning when a name has to shrink below its
  preferred size, and an NRI-conditional "email mandatory" hint. All of
  these warn; none of them block printing.
- Live canvas preview in mm-space (sized to the active template's own
  aspect ratio), sharing its field-rendering logic with the PDF exporter so
  the two can't drift apart.
- Named calibration profiles (`dx`, `dy`, `scale`) in `localStorage`
  (wrapped in try/catch), shared across all three forms, with an "apply
  measurements" helper that turns a measured crosshair position and 150mm
  bar reading directly into those three numbers.
- An alignment-sheet print mode (wire hairlines + labelled crosshair +
  labelled 150mm bar), generated for whichever form tab is active.
- In-app PDF preview (blob URL in an iframe) instead of download-then-open,
  with a "Print now" button and a "Print blank" jam-fallback escape hatch.
- Family batching: one shared queue across all three form types, "reuse
  address" (seeds the shared address/POA/HoF-where-applicable fields from
  any queued entry — of any form — into whichever form is currently active,
  and focuses the name field), "print whole queue" (one PDF, one page per
  record, each page sized from its own entry's form — confirmed with an
  actual mixed Letter+A4 two-page PDF), duplicate-Aadhaar warning checked
  across the whole queue regardless of which form each entry belongs to,
  manual queue wipe, and a 15-minute idle auto-wipe of the whole session
  (all three forms' state) with a final-minute countdown banner.

## Testing

`tests/regression.spec.js` (Form 1) and `tests/multi-form.spec.js` (switcher,
Form 3, Form 5, and cross-form queue/reuse/duplicate-check/mixed-PDF
behavior) — 26 Playwright tests total, run against `index.html` directly via
`file://`, matching how the tool is actually used.

```
npm install
npx playwright test
```

(`playwright.config.js` points at a specific Chromium build; adjust
`PW_CHROMIUM_PATH` if yours lives elsewhere.) This is dev-only tooling — the
shipped app has no dependency on Node, npm, or Playwright.

Also visually verified with `tools/proof.py` against real PDFs (see "About
the templates" above) — not yet on a real printer (see Phase 0).

## Explicitly out of scope

Per the build spec: PIN-code autofill, document-type pickers, and a fully
schema-generated (rather than hand-authored) entry-form UI are Phase 2/3
work. Malayalam forms would need an embedded Unicode font (the PDF standard
fonts can't draw it) and haven't been started. Forms 2/4/6/7/8 aren't built.
There is no server, database, account system, or biometric capture, and
there never will be — this tool prints paper; a human operator does the
rest through the official client.

## Open questions (unresolved here)

1. Is the physical stock Letter or A4, for each of the three forms? — needs
   a ruler on-site.
2. Does the counter printer have a manual feed tray?
3. Which of Forms 2/4/6/7/8 does the centre actually see, if any beyond
   1/3/5?
4. Are Malayalam forms needed?
