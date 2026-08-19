#!/usr/bin/env python3
"""Extract official ATP 7-22.02 figures (public domain, 17 U.S.C. 105) as webp assets.

Usage:
  python3 scripts/extract-atp-figures.py <path-to-atp-7-22.02.pdf> [--out assets/plates/atp]
  python3 scripts/extract-atp-figures.py <pdf> --list              # print catalog
  python3 scripts/extract-atp-figures.py <pdf> --ids 14-3 14-2 --out assets/plates/atp

Each figure is cropped from its exact embedded-image bounding box on the page,
so extraction needs no manual crop QA. Output is <figure-id>.webp.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

try:
    import pymupdf
except ImportError:
    print("pip install pymupdf", file=sys.stderr)
    sys.exit(2)


def iter_figures(doc):
    """Yield dicts: {id, name, page, x0,y0,x1,y1} for every figure caption with an image above it."""
    seen = {}
    for pi in range(len(doc)):
        page = doc[pi]
        d = page.get_text("dict")
        caps = []
        for block in d["blocks"]:
            if block["type"] != 0:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    t = span["text"].strip()
                    if t.startswith("Figure ") and "Figure " in t:
                        caps.append({"text": t, "y0": span["bbox"][1]})
        if not caps:
            continue
        imgs = []
        for im in page.get_images(full=True):
            xref = im[0]
            for r in page.get_image_rects(xref):
                imgs.append({"x0": r.x0, "y0": r.y0, "x1": r.x1, "y1": r.y1, "xref": xref})
        if not imgs:
            continue
        for cap in sorted(caps, key=lambda c: c["y0"]):
            above = [i for i in imgs if i["y1"] <= cap["y0"] + 6]
            if not above:
                continue
            pick = max(above, key=lambda i: i["y1"])
            m = re.match(r"Figure\s+(\d+-[0-9]+)\.\s*([^\n]+)", cap["text"])
            if not m:
                continue
            fid = m.group(1)
            name = re.sub(r"[.]{3,}.*$", "", m.group(2)).strip()
            key = (fid, pi)
            if key in seen:
                continue
            seen[key] = True
            yield {
                "id": fid,
                "name": name,
                "page": pi,
                "x0": pick["x0"], "y0": pick["y0"], "x1": pick["x1"], "y1": pick["y1"],
            }


def crop_webp(doc, fig, out_dir, dpi=300):
    page = doc[fig["page"]]
    zoom = dpi / 72.0
    mat = pymupdf.Matrix(zoom, zoom)
    clip = pymupdf.Rect(fig["x0"], fig["y0"], fig["x1"], fig["y1"])
    pix = page.get_pixmap(matrix=mat, clip=clip, alpha=False)
    png = os.path.join(out_dir, fig["id"] + ".png")
    pix.save(png)
    webp = os.path.join(out_dir, fig["id"] + ".webp")
    magick = shutil.which("magick") or shutil.which("convert")
    subprocess.run([magick, png, "-quality", "85", webp], check=True)
    os.remove(png)
    return webp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--out", default="assets/plates/atp")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--ids", nargs="*")
    ap.add_argument("--dpi", type=int, default=300)
    ap.add_argument("--catalog", default="assets/plates/atp/atp-catalog.json")
    args = ap.parse_args()

    doc = pymupdf.open(args.pdf)
    figures = list(iter_figures(doc))
    print("figure count:", len(figures), file=sys.stderr)

    os.makedirs(args.out, exist_ok=True)
    with open(args.catalog, "w") as fh:
        json.dump({"source": "ATP 7-22.02 (public domain)", "figures": figures}, fh, indent=2)
    print("wrote catalog:", args.catalog, file=sys.stderr)

    if args.list:
        for f in figures:
            print("\t".join([f["id"], str(f["page"]), f["name"]]))
        return

    wanted = set(args.ids) if args.ids else {f["id"] for f in figures}
    done = 0
    for f in figures:
        if f["id"] not in wanted:
            continue
        crop_webp(doc, f, args.out, args.dpi)
        print("crop", f["id"], f["name"], f"page={f['page']}")
        done += 1
    print("extracted", done, "figures", file=sys.stderr)


if __name__ == "__main__":
    main()