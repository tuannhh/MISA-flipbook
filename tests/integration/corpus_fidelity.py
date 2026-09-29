"""Doi chung DOC LAP cho test corpus PDF that: dung pypdf + pypdfium2 (khong dung code pipeline)
de (1) lay thong tin goc cua PDF va (2) so sanh anh trang ma pipeline convert phuc vu ra
voi ban render tham chieu -> phat hien trang trang/sai noi dung/sai ty le.

  python corpus_fidelity.py info <pdf>
  python corpus_fidelity.py compare <pdf> <dir>   # dir: page-001.webp + page-001-thumb.jpg ...
"""
import json
import pathlib
import sys

import numpy as np
import pypdfium2 as pdfium
from pypdf import PdfReader
from PIL import Image


def info(pdf_path: str) -> dict:
    pdf = pdfium.PdfDocument(pdf_path)
    reader = PdfReader(pdf_path)
    pages = []
    for i in range(len(pdf)):
        w, h = pdf[i].get_size()
        annots = reader.pages[i].get("/Annots") or []
        n_link = 0
        n_uri = 0
        for a in annots:
            try:
                obj = a.get_object()
            except Exception:
                continue
            if obj.get("/Subtype") == "/Link":
                n_link += 1
                action = obj.get("/A")
                if action is not None and action.get_object().get("/S") == "/URI":
                    n_uri += 1
        pages.append({"w": w, "h": h, "annotLinks": n_link, "uriLinks": n_uri})
    return {"pageCount": len(pdf), "pages": pages}


def compare(pdf_path: str, folder: str) -> dict:
    pdf = pdfium.PdfDocument(pdf_path)
    base = pathlib.Path(folder)
    out = []
    for i in range(len(pdf)):
        n = i + 1
        page = pdf[i]
        w_pt, h_pt = page.get_size()
        row = {"page": n}
        for label, file_name in (("reading", f"page-{n:03d}.webp"), ("thumb", f"page-{n:03d}-thumb.jpg")):
            path = base / file_name
            if not path.exists():
                row[label] = {"missing": True}
                continue
            with Image.open(path) as im:
                im = im.convert("RGB")
                iw, ih = im.size
                target_w = 400
                ref = page.render(scale=target_w / w_pt).to_pil().convert("RGB")
                got = im.resize(ref.size, Image.Resampling.LANCZOS)
                a = np.asarray(ref, dtype=np.float32)
                b = np.asarray(got, dtype=np.float32)
                row[label] = {
                    "size": [iw, ih],
                    "aspectErr": abs((iw / ih) - (w_pt / h_pt)) / (w_pt / h_pt),
                    "mae": float(np.abs(a - b).mean()),
                    "refStd": float(a.std()),
                    "imgStd": float(b.std()),
                }
        page.close()
        out.append(row)
    return {"pages": out}


def variants(pdf_path: str, out_dir: str) -> dict:
    """Cat cac PDF nho tu PDF that de kiem tra bien so trang (1..5) + trang xoay + hon hop
    ngang/doc. Khong dung pipeline de tao -> nguon su that doc lap."""
    from pypdf import PdfWriter

    out = pathlib.Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    reader = PdfReader(pdf_path)
    made = {}

    def write(name, pages, rotate=None, landscape=None):
        w = PdfWriter()
        for idx, i in enumerate(pages):
            pg = w.add_page(reader.pages[i])
            if rotate and idx in rotate:
                pg.rotate(rotate[idx])
            if landscape and idx in landscape:
                # doi CA MediaBox lan CropBox (pdfium lay giao cua 2 hop) thanh ngang
                width, height = float(pg.mediabox.right), float(pg.mediabox.top)
                pg.mediabox.upper_right = (height, width)
                pg.cropbox.upper_right = (height, width)
        target = out / name
        with open(target, "wb") as fh:
            w.write(fh)
        made[name] = {"path": str(target), "pages": len(pages)}

    for n in (1, 2, 3, 4, 5):
        write(f"pages-{n}.pdf", list(range(n)))
    write("rotated-mixed.pdf", [0, 1, 2, 3], rotate={1: 90, 2: 180})
    write("landscape-mixed.pdf", [0, 1, 2, 3], landscape={2})
    return made


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "info":
        print(json.dumps(info(sys.argv[2])))
    elif cmd == "compare":
        print(json.dumps(compare(sys.argv[2], sys.argv[3])))
    elif cmd == "variants":
        print(json.dumps(variants(sys.argv[2], sys.argv[3])))
    else:
        raise SystemExit("cmd khong hop le")
