#!/usr/bin/env python3
"""
Copy every templates/*.json into a matching js/template-*.js as a plain
global assignment, so index.html can load each with a <script src> tag
instead of fetch() -- fetch() of a local file fails under file:// (no
server, no CORS), which is exactly how this tool is meant to run from a
shop counter machine.

This is a maintainer-only step (like vendoring pdf-lib), not a runtime
build: run it by hand whenever a templates/*.json file changes.

    python3 tools/sync_template.py                 # sync all templates/*.json
    python3 tools/sync_template.py form3-en         # sync just templates/form3-en.json

The generated global name is derived from the filename: form1-en.json ->
window.FORM1_EN_TEMPLATE, form3-en.json -> window.FORM3_EN_TEMPLATE, etc.
"""
import argparse
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
TEMPLATES_DIR = ROOT / "templates"
JS_DIR = ROOT / "js"


def global_name(stem):
    return re.sub(r"[^A-Za-z0-9]+", "_", stem).upper() + "_TEMPLATE"


def sync_one(src):
    with open(src) as fh:
        data = json.load(fh)

    dst = JS_DIR / f"template-{src.stem}.js"
    var_name = global_name(src.stem)
    JS_DIR.mkdir(exist_ok=True)
    with open(dst, "w") as fh:
        fh.write(f"// Generated from templates/{src.name} by tools/sync_template.py -- do not hand-edit.\n")
        fh.write(f"window.{var_name} = ")
        json.dump(data, fh, indent=2)
        fh.write(";\n")

    print(f"Wrote {dst} (window.{var_name})")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("stems", nargs="*", help="Template stems to sync (e.g. form3-en). Omit to sync all.")
    args = ap.parse_args()

    if args.stems:
        srcs = [TEMPLATES_DIR / f"{stem}.json" for stem in args.stems]
    else:
        srcs = sorted(TEMPLATES_DIR.glob("*.json"))

    for src in srcs:
        if not src.exists():
            print(f"skip: {src} does not exist")
            continue
        sync_one(src)


if __name__ == "__main__":
    main()
