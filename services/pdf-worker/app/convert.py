"""Logic chuyen doi PDF -> anh trang + manifest.

Day la ban tai su dung CO KIEM CHUNG cua services/pdf-worker/poc/render_bench.py
(P0 PoC) - cung thu vien (pypdfium2 render, pypdf annotation), cung cach xu ly
loi (khong crash tren file hong/ma hoa), chi to chuc lai thanh module goi duoc
tu FastAPI thay vi script doc lap. Xem ADR-P0-parser-renderer.md cho ly do chon
thu vien va gioi han da biet (chua co PoC audio/video, chua resolve internal
link ra so trang cu the).
"""

from __future__ import annotations

import pathlib
import time
from dataclasses import dataclass, field

import pypdfium2 as pdfium
from pypdf import PdfReader
from pypdf.errors import FileNotDecryptedError, PdfReadError
from PIL import Image

READING_WIDTH_PX = 1600
THUMB_WIDTH_PX = 320
PDF_SIGNATURE = b"%PDF-"


class ConversionError(Exception):
    def __init__(self, reason: str, message: str):
        super().__init__(message)
        self.reason = reason  # 'needs_password' | 'corrupted_or_invalid' | 'invalid_signature'
        self.message = message


@dataclass
class PageManifest:
    page: int
    width_pt: float
    height_pt: float
    rotation: int
    images: dict = field(default_factory=dict)
    links: list = field(default_factory=list)


def _normalize_rect(rect, page_w, page_h, rotation):
    x0, y0, x1, y1 = rect
    nx0, nx1 = sorted([x0 / page_w, x1 / page_w])
    ny0, ny1 = sorted([1 - y1 / page_h, 1 - y0 / page_h])
    if rotation == 0:
        return [nx0, ny0, nx1, ny1]
    if rotation == 90:
        return [ny0, 1 - nx1, ny1, 1 - nx0]
    if rotation == 180:
        return [1 - nx1, 1 - ny1, 1 - nx0, 1 - ny0]
    if rotation == 270:
        return [1 - ny1, nx0, 1 - ny0, nx1]
    return [nx0, ny0, nx1, ny1]


def _extract_links(pdf_path: pathlib.Path, password: str | None):
    reader = PdfReader(str(pdf_path))
    if reader.is_encrypted:
        if password is None:
            raise ConversionError("needs_password", "PDF can mat khau de doc.")
        result = reader.decrypt(password)
        if result == 0:
            raise ConversionError("needs_password", "Mat khau khong dung.")

    per_page = []
    for page in reader.pages:
        rotation = int(page.get("/Rotate", 0)) % 360
        mediabox = page.mediabox
        page_w = float(mediabox.width)
        page_h = float(mediabox.height)
        links = []
        annots = page.get("/Annots")
        if annots:
            for a in annots:
                obj = a.get_object()
                if obj.get("/Subtype") != "/Link":
                    continue
                rect = [float(v) for v in obj.get("/Rect", [0, 0, 0, 0])]
                entry = {"rect_norm": _normalize_rect(rect, page_w, page_h, rotation)}
                uri_action = obj.get("/A")
                if uri_action and uri_action.get("/S") == "/URI":
                    entry["type"] = "external_uri"
                    entry["target"] = str(uri_action.get("/URI"))
                elif obj.get("/Dest") is not None or (
                    uri_action and uri_action.get("/S") == "/GoTo"
                ):
                    # Chua resolve ten dich -> so trang cu the (P0 limitation da ghi trong ADR).
                    entry["type"] = "internal_goto"
                    entry["target"] = None
                else:
                    entry["type"] = "unsupported_action"
                    entry["target"] = None
                links.append(entry)
        per_page.append({"rotation": rotation, "width_pt": page_w, "height_pt": page_h, "links": links})
    return per_page


def convert_pdf(
    source_path: pathlib.Path,
    output_dir: pathlib.Path,
    pipeline_version: str,
    password: str | None = None,
) -> dict:
    """Chuyen 1 PDF thanh anh trang + manifest. Nem ConversionError cho loi ky vong
    (mat khau/corrupted); loi khac (bug that) duoc de nguyen cho caller xu ly nhu 500."""
    if not source_path.exists():
        raise ConversionError("corrupted_or_invalid", f"Khong tim thay file: {source_path}")

    header = source_path.open("rb").read(5)
    if header != PDF_SIGNATURE:
        raise ConversionError("invalid_signature", "File khong co chu ky %PDF-.")

    warnings: list[str] = []
    link_info = _extract_links(source_path, password)

    output_dir.mkdir(parents=True, exist_ok=True)
    pages_dir = output_dir / "pages"
    pages_dir.mkdir(parents=True, exist_ok=True)

    try:
        pdf = pdfium.PdfDocument(str(source_path), password=password)
    except pdfium.PdfiumError as e:
        msg = str(e).lower()
        reason = "needs_password" if "password" in msg else "corrupted_or_invalid"
        raise ConversionError(reason, str(e)) from e

    pages_manifest: list[dict] = []
    t_start = time.perf_counter()
    n_pages = len(pdf)
    for i in range(n_pages):
        page = pdf[i]
        w_pt, h_pt = page.get_size()
        images = {}
        for label, target_w, fmt in (
            ("thumb", THUMB_WIDTH_PX, "JPEG"),
            ("reading", READING_WIDTH_PX, "WEBP"),
        ):
            scale = target_w / w_pt
            bitmap = page.render(scale=scale)
            pil_image = bitmap.to_pil().convert("RGB")
            filename = f"page-{i + 1:03d}-{label}.{fmt.lower()}"
            pil_image.save(pages_dir / filename, fmt, quality=82)
            images[label] = f"pages/{filename}"
        page.close()

        page_link_info = link_info[i] if i < len(link_info) else {"links": [], "rotation": 0}
        pages_manifest.append(
            {
                "page": i + 1,
                "width_pt": w_pt,
                "height_pt": h_pt,
                "rotation": page_link_info.get("rotation", 0),
                "images": images,
                "links": page_link_info.get("links", []),
            }
        )
    pdf.close()
    elapsed = time.perf_counter() - t_start

    if n_pages == 0:
        warnings.append("PDF khong co trang nao.")

    return {
        "pipeline_version": pipeline_version,
        "n_pages": n_pages,
        "pages": pages_manifest,
        "warnings": warnings,
        "render_seconds_total": elapsed,
    }
