"""P0 PoC: render PDF -> anh trang bang pypdfium2, trich link bang pypdf.

Day la ban do luong thuc te tren MAY DEV hien tai (khong phai server production,
khong phai thiet bi mobile that). Muc dich: co so lieu THAT de chon thu vien va
phat hien loi som, khong dung de cong bo SLO production.

Chay: python render_bench.py
Ket qua: in ra console + ghi vao poc_report.json trong cung thu muc.
"""

from __future__ import annotations

import io
import json
import pathlib
import time
import traceback

import pypdfium2 as pdfium
from pypdf import PdfReader
from pypdf.errors import PdfReadError, FileNotDecryptedError
from PIL import Image

FIXTURES = pathlib.Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "pdf"
OUT_DIR = pathlib.Path(__file__).parent / "output"
REPORT_PATH = pathlib.Path(__file__).parent / "poc_report.json"

READING_WIDTH_PX = 1600
THUMB_WIDTH_PX = 320


def normalize_rect(rect, page_w, page_h, rotation):
    """Quy doi toa do annot (PDF space, origin duoi-trai) ve ty le 0..1
    theo he truc anh da render (origin tren-trai), da tinh rotation."""
    x0, y0, x1, y1 = rect
    # Chuan hoa theo kich thuoc trang truoc rotation.
    nx0, nx1 = sorted([x0 / page_w, x1 / page_w])
    ny0, ny1 = sorted([1 - y1 / page_h, 1 - y0 / page_h])  # flip truc Y

    if rotation == 0:
        return [nx0, ny0, nx1, ny1]
    if rotation == 90:
        return [ny0, 1 - nx1, ny1, 1 - nx0]
    if rotation == 180:
        return [1 - nx1, 1 - ny1, 1 - nx0, 1 - ny0]
    if rotation == 270:
        return [1 - ny1, nx0, 1 - ny0, nx1]
    return [nx0, ny0, nx1, ny1]


def extract_links_pypdf(pdf_path: pathlib.Path, password: str | None = None):
    """Tra ve list[page_index] = list of {rect_norm, type, target}."""
    reader = PdfReader(str(pdf_path))
    if reader.is_encrypted:
        if password is None:
            raise FileNotDecryptedError("encrypted, no password supplied")
        reader.decrypt(password)

    result = []
    for page in reader.pages:
        page_links = []
        rotation = int(page.get("/Rotate", 0)) % 360
        mediabox = page.mediabox
        page_w = float(mediabox.width)
        page_h = float(mediabox.height)
        annots = page.get("/Annots")
        if annots:
            for a in annots:
                obj = a.get_object()
                if obj.get("/Subtype") != "/Link":
                    continue
                rect = [float(v) for v in obj.get("/Rect", [0, 0, 0, 0])]
                entry = {"rect_norm": normalize_rect(rect, page_w, page_h, rotation)}
                uri_action = obj.get("/A")
                if uri_action and uri_action.get("/S") == "/URI":
                    entry["type"] = "external_uri"
                    entry["target"] = str(uri_action.get("/URI"))
                elif obj.get("/Dest") is not None or (
                    uri_action and uri_action.get("/S") == "/GoTo"
                ):
                    entry["type"] = "internal_goto"
                    entry["target"] = "named_or_explicit_dest"
                else:
                    entry["type"] = "unsupported_action"
                    entry["target"] = None
                page_links.append(entry)
        result.append(page_links)
    return result


def render_pages_pdfium(pdf_path: pathlib.Path, out_subdir: pathlib.Path, password: str | None = None):
    """Render moi trang o 2 do phan giai (thumb + reading), tra ve list timing (giay)."""
    out_subdir.mkdir(parents=True, exist_ok=True)
    pdf = pdfium.PdfDocument(str(pdf_path), password=password)
    timings = []
    warnings = []
    n_pages = len(pdf)
    for i in range(n_pages):
        page = pdf[i]
        w_pt, h_pt = page.get_size()
        for label, target_w in (("thumb", THUMB_WIDTH_PX), ("reading", READING_WIDTH_PX)):
            scale = target_w / w_pt
            t0 = time.perf_counter()
            bitmap = page.render(scale=scale)
            pil_image = bitmap.to_pil()
            elapsed = time.perf_counter() - t0
            fmt = "WEBP" if label == "reading" else "JPEG"
            img_path = out_subdir / f"page-{i + 1:03d}-{label}.{fmt.lower()}"
            save_kwargs = {"quality": 82} if fmt == "JPEG" else {"quality": 82, "method": 4}
            pil_image.convert("RGB").save(img_path, fmt, **save_kwargs)
            timings.append({"page": i + 1, "variant": label, "seconds": elapsed})
        page.close()
    pdf.close()
    return {"n_pages": n_pages, "timings": timings, "warnings": warnings}


def sha_signature_check(path: pathlib.Path) -> bool:
    data = path.read_bytes()[:5]
    return data == b"%PDF-"


def run_case(name: str, path: pathlib.Path, password: str | None = None):
    case_result = {"file": path.name, "declared_case": name}
    if not sha_signature_check(path):
        case_result["status"] = "rejected_invalid_signature"
        return case_result
    try:
        render_info = render_pages_pdfium(path, OUT_DIR / path.stem, password=password)
        link_info = extract_links_pypdf(path, password=password)
        case_result["status"] = "ok"
        case_result["n_pages"] = render_info["n_pages"]
        case_result["render_timings_sample"] = render_info["timings"][:6]
        avg_reading = [
            t["seconds"] for t in render_info["timings"] if t["variant"] == "reading"
        ]
        if avg_reading:
            case_result["avg_reading_render_seconds"] = sum(avg_reading) / len(avg_reading)
            case_result["max_reading_render_seconds"] = max(avg_reading)
        case_result["links_per_page"] = [len(p) for p in link_info]
        case_result["sample_links_page1"] = link_info[0] if link_info else []
    except FileNotDecryptedError as e:
        case_result["status"] = "rejected_needs_password"
        case_result["error"] = str(e)
    except pdfium.PdfiumError as e:
        msg = str(e).lower()
        if "password" in msg:
            case_result["status"] = "rejected_needs_password"
        else:
            case_result["status"] = "rejected_corrupted_or_invalid"
        case_result["error"] = str(e)
    except (PdfReadError, ValueError) as e:
        case_result["status"] = "rejected_corrupted_or_invalid"
        case_result["error"] = str(e)
    except Exception as e:  # PoC: ghi lai loi that, khong nuot loi
        case_result["status"] = "unexpected_error"
        case_result["error"] = f"{type(e).__name__}: {e}"
        case_result["traceback"] = traceback.format_exc(limit=3)
    return case_result


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cases = [
        ("vietnamese_text_with_links", FIXTURES / "sample_vi_text.pdf", None),
        ("rotated_mixed_sizes", FIXTURES / "sample_rotated_mixed.pdf", None),
        ("transparency", FIXTURES / "sample_transparency.pdf", None),
        ("scanned_like_no_text", FIXTURES / "sample_scanned_like.pdf", None),
        ("many_pages_30", FIXTURES / "sample_many_pages.pdf", None),
        ("stress_150_pages", FIXTURES / "sample_stress_150pages.pdf", None),
        ("encrypted_correct_password", FIXTURES / "sample_encrypted.pdf", "test1234"),
        ("encrypted_no_password_should_fail", FIXTURES / "sample_encrypted.pdf", None),
        ("corrupted_should_fail", FIXTURES / "sample_corrupted.pdf", None),
        ("wrong_mime_should_fail", FIXTURES / "sample_wrong_mime.pdf", None),
    ]

    results = []
    wall_start = time.perf_counter()
    for name, path, pwd in cases:
        print(f"== {name} :: {path.name} ==")
        r = run_case(name, path, password=pwd)
        print(json.dumps(r, ensure_ascii=False, indent=2)[:800])
        results.append(r)
    wall_total = time.perf_counter() - wall_start

    report = {
        "note": (
            "Do tren may dev cuc bo (khong phai server production, khong phai "
            "thiet bi mobile). Chi dung de so sanh thu vien va phat hien loi som."
        ),
        "libraries": {
            "renderer": "pypdfium2",
            "link_extraction": "pypdf",
            "image_lib": "Pillow",
        },
        "total_wall_seconds": wall_total,
        "cases": results,
    }
    REPORT_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("\nBao cao day du ghi tai:", REPORT_PATH)


if __name__ == "__main__":
    main()
