"""Logic chuyen doi PDF -> anh trang + manifest.

Day la ban tai su dung CO KIEM CHUNG cua services/pdf-worker/poc/render_bench.py
(P0 PoC) - cung thu vien (pypdfium2 render, pypdf annotation), cung cach xu ly
loi (khong crash tren file hong/ma hoa), chi to chuc lai thanh module goi duoc
tu FastAPI thay vi script doc lap. Xem ADR-P0-parser-renderer.md cho ly do chon
thu vien va gioi han da biet (chua co PoC audio/video). Link noi bo (internal
GoTo) da duoc resolve ra so trang cu the (P4/F10 Muc A) qua
PdfReader.get_destination_page_number.
"""

from __future__ import annotations

import pathlib
import os
import math
import time
from dataclasses import dataclass, field

import pypdfium2 as pdfium
from pypdf import PdfReader
from pypdf.errors import FileNotDecryptedError, PdfReadError
from pypdf.generic import ArrayObject
from PIL import Image

READING_WIDTH_PX = 1600
THUMB_WIDTH_PX = 320
PDF_SIGNATURE = b"%PDF-"
MAX_PAGES = int(os.getenv("PDF_MAX_PAGES", "500"))
MAX_PAGE_PIXELS = int(os.getenv("PDF_MAX_PAGE_PIXELS", "8000000"))
MAX_OUTPUT_BYTES = int(os.getenv("PDF_MAX_OUTPUT_BYTES", "536870912"))
MAX_SOURCE_BYTES = int(os.getenv("PDF_MAX_BYTES", "209715200"))


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


def _resolve_dest_page(reader: PdfReader, dest) -> int | None:
    """Resolve mot /Dest (ten dinh danh hoac mang truc tiep [page_ref, /Fit, ...])
    thanh so trang 1-based khop voi danh so trang cua manifest. Tra None neu
    khong resolve duoc (ten dich khong ton tai, tham chieu hong...)."""
    if dest is None:
        return None
    obj = dest.get_object() if hasattr(dest, "get_object") else dest
    if isinstance(obj, ArrayObject):
        destination = reader._build_destination("", obj)
    else:
        destination = reader.named_destinations.get(str(obj))
        if destination is None:
            return None
    page_index = reader.get_destination_page_number(destination)
    return None if page_index is None else page_index + 1


def _extract_links(pdf_path: pathlib.Path, password: str | None):
    reader = PdfReader(str(pdf_path))
    if reader.is_encrypted:
        if password is None:
            raise ConversionError("needs_password", "PDF can mat khau de doc.")
        result = reader.decrypt(password)
        if result == 0:
            raise ConversionError("needs_password", "Mat khau khong dung.")

    per_page = []
    if len(reader.pages) > MAX_PAGES:
        raise ConversionError("page_limit", f"PDF vuot gioi han {MAX_PAGES} trang.")
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
                    dest = obj.get("/Dest")
                    if dest is None and uri_action is not None:
                        dest = uri_action.get("/D")
                    entry["type"] = "internal_goto"
                    try:
                        entry["target"] = _resolve_dest_page(reader, dest)
                    except (PdfReadError, KeyError, ValueError):
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

    if source_path.stat().st_size > MAX_SOURCE_BYTES:
        raise ConversionError("size_limit", "PDF vuot gioi han dung luong.")
    with source_path.open("rb") as source:
        header = source.read(5)
    if header != PDF_SIGNATURE:
        raise ConversionError("invalid_signature", "File khong co chu ky %PDF-.")

    warnings: list[str] = []
    try:
        link_info = _extract_links(source_path, password)
    except (PdfReadError, FileNotDecryptedError, ValueError) as exc:
        raise ConversionError("corrupted_or_invalid", "PDF hong hoac khong doc duoc.") from exc

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
    if n_pages < 1 or n_pages > MAX_PAGES:
        pdf.close()
        raise ConversionError("page_limit", f"PDF can tu 1 den {MAX_PAGES} trang.")
    output_bytes = 0
    for i in range(n_pages):
        page = pdf[i]
        w_pt, h_pt = page.get_size()
        if not all(math.isfinite(v) and v > 0 for v in (w_pt, h_pt)):
            raise ConversionError("page_geometry", "Kich thuoc trang khong hop le.")
        pixel_h = math.ceil(READING_WIDTH_PX * h_pt / w_pt)
        if max(w_pt / h_pt, h_pt / w_pt) > 12 or pixel_h > 8192 or READING_WIDTH_PX * pixel_h > MAX_PAGE_PIXELS:
            raise ConversionError("pixel_limit", "Trang PDF vuot gioi han kich thuoc render.")
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
            output_bytes += (pages_dir / filename).stat().st_size
            pil_image.close()
            bitmap.close()
            if output_bytes > MAX_OUTPUT_BYTES:
                raise ConversionError("output_limit", "PDF sinh ra qua nhieu du lieu anh.")
            images[label] = f"pages/{filename}"
        page.close()

        page_link_info = link_info[i] if i < len(link_info) else {"links": [], "rotation": 0}
        pages_manifest.append(
            {
                "page": i + 1,
                "width_pt": w_pt,
                "height_pt": h_pt,
                # pypdfium2's get_size()/render() da tu ap dung /Rotate cua trang (w_pt/h_pt
                # o day la kich thuoc SAU khi xoay, anh render cung da xoay dung huong doc).
                # Gia tri "rotation" cua pypdf (page_link_info) chi dung NOI BO de quy doi
                # toa do link ve dung he SAU-xoay qua _normalize_rect - KHONG duoc gui ra
                # ngoai, neu khong FE se ap dung CSS rotate() THEM MOT LAN NUA len anh da
                # xoay dung san, gay xoay lech (vd /Rotate 90 nhin thanh lat nguoc 180 do).
                # Da phat hien that qua kiem tra bang mat P5 voi sample_rotated_mixed.pdf.
                "rotation": 0,
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
