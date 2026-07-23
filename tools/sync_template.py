#!/usr/bin/env python3
"""
Copy templates/form1-en.json into js/template-form1-en.js as a plain global
assignment, so index.html can load it with a <script src> tag instead of
fetch() -- fetch() of a local file fails under file:// (no server, no CORS),
which is exactly how this tool is meant to run from a shop counter machine.

This is a maintainer-only step (like vendoring pdf-lib), not a runtime build:
run it by hand whenever templates/form1-en.json changes.

    python3 tools/sync_template.py
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "templates" / "form1-en.json"
DST = ROOT / "js" / "template-form1-en.js"

with open(SRC) as fh:
    data = json.load(fh)

DST.parent.mkdir(exist_ok=True)
with open(DST, "w") as fh:
    fh.write("// Generated from templates/form1-en.json by tools/sync_template.py -- do not hand-edit.\n")
    fh.write("window.FORM1_EN_TEMPLATE = ")
    json.dump(data, fh, indent=2)
    fh.write(";\n")

print(f"Wrote {DST}")
