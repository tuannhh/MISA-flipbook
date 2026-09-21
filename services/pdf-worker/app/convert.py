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
from urllib.parse import urlsplit
from dataclasses import dataclass, field

import pypdfium2 as pdfium
from pypdf import PdfReader
from pypdf.errors import FileNotDecryptedError, PdfReadError
from pypdf.generic import ArrayObject
from PIL import Image, ImageOps

READING_WIDTH_PX = 1600
THUMB_WIDTH_PX = 320
PDF_SIGNATURE = b"%PDF-"
MAX_PAGES = int(os.getenv("PDF_MAX_PAGES", "500"))
MAX_PAGE_PIXELS = int(os.getenv("PDF_MAX_PAGE_PIXELS", "8000000"))
MAX_OUTPUT_BYTES = int(os.getenv("PDF_MAX_OUTPUT_BYTES", "536870912"))
MAX_SOURCE_BYTES = int(os.getenv("PDF_MAX_BYTES", "209715200"))
SHARE_THUMBNAIL_WIDTH = 1200
SHARE_THUMBNAIL_HEIGHT = 675
MAX_SHARE_THUMBNAIL_PIXELS = int(os.getenv("SHARE_THUMBNAIL_MAX_PIXELS", "32000000"))


class ConversionError(Exception):
    def __init__(self, reason: str, message: str):
        super().__init__(message)
        self.reason = reason  # 'needs_password' | 'corrupted_or_invalid' | 'invalid_signature'
        self.message = message


def convert_share_thumbnail(source_path: pathlib.Path, output_path: pathlib.Path) -> int:
    """Create one deterministic 16:9 WebP cover without trusting image metadata."""
    try:
        with Image.open(source_path) as opened:
            if opened.width < 1 or opened.height < 1 or opened.width * opened.height > MAX_SHARE_THUMBNAIL_PIXELS:
                raise ConversionError("pixel_limit", "Anh nguon vuot gioi han kich thuoc.")
            image = ImageOps.exif_transpose(opened).convert("RGB")
            target_aspect = SHARE_THUMBNAIL_WIDTH / SHARE_THUMBNAIL_HEIGHT
            source_aspect = image.width / image.height
            if source_aspect > target_aspect:
                crop_width = round(image.height * target_aspect)
                left = (image.width - crop_width) // 2
                crop = image.crop((left, 0, left + crop_width, image.height))
            else:
                crop_height = round(image.width / target_aspect)
                top = (image.height - crop_height) // 2
                crop = image.crop((0, top, image.width, top + crop_height))
            try:
                rendered = crop.resize((SHARE_THUMBNAIL_WIDTH, SHARE_THUMBNAIL_HEIGHT), Image.Resampling.LANCZOS)
                try:
                    output_path.parent.mkdir(parents=True, exist_ok=True)
                    rendered.save(output_path, "WEBP", quality=86, method=4)
                finally:
                    rendered.close()
            finally:
                crop.close()
                image.close()
    except ConversionError:
        raise
    except (OSError, ValueError) as exc:
        raise ConversionError("invalid_image", "Anh khong the xu ly.") from exc
    return output_path.stat().st_size


@dataclass
class PageManifest:
    page: int
    width_pt: float
    height_pt: float
    rotation: int
    images: dict = field(default_factory=dict)
    links: list = field(default_factory=list)


def _normalize_rect(rect, crop_box, rotation):
    """Map a PDF annotation rectangle into the pixels emitted by PDFium.

    PDF annotation coordinates are expressed in the page's unrotated user space.
    PDFium renders the effective CropBox and then applies /Rotate.  Normalising
    against MediaBox (or applying the inverse rotation) shifts hit areas on many
    production PDFs, particularly exports with bleed/crop marks.
    """
    crop_x0, crop_y0, crop_x1, crop_y1 = crop_box
    crop_w, crop_h = crop_x1 - crop_x0, crop_y1 - crop_y0
    if crop_w <= 0 or crop_h <= 0:
        return None
    x0, y0, x1, y1 = rect
    x0, x1 = sorted((max(crop_x0, min(x0, crop_x1)), max(crop_x0, min(x1, crop_x1))))
    y0, y1 = sorted((max(crop_y0, min(y0, crop_y1)), max(crop_y0, min(y1, crop_y1))))
    if x1 <= x0 or y1 <= y0:
        return None
    nx0, nx1 = (x0 - crop_x0) / crop_w, (x1 - crop_x0) / crop_w
    ny0, ny1 = 1 - (y1 - crop_y0) / crop_h, 1 - (y0 - crop_y0) / crop_h
    if rotation == 0:
        return [nx0, ny0, nx1, ny1]
    if rotation == 90:
        return [1 - ny1, nx0, 1 - ny0, nx1]
    if rotation == 180:
        return [1 - nx1, 1 - ny1, 1 - nx0, 1 - ny0]
    if rotation == 270:
        return [ny0, 1 - nx1, ny1, 1 - nx0]
    return [nx0, ny0, nx1, ny1]


def _safe_external_uri(value) -> str | None:
    """Only pass schemes that the browser may safely navigate from a reader page."""
    uri = str(value).strip()
    parsed = urlsplit(uri)
    scheme = parsed.scheme.lower()
    if scheme in {"http", "https"} and parsed.netloc:
        return uri
    if scheme in {"mailto", "tel"} and parsed.path:
        return uri
    return None


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
        cropbox = page.cropbox
        crop_box = (float(cropbox.left), float(cropbox.bottom), float(cropbox.right), float(cropbox.top))
        links = []
        annots = page.get("/Annots")
        if annots:
            for a in annots:
                obj = a.get_object()
                if obj.get("/Subtype") != "/Link":
                    continue
                rect = [float(v) for v in obj.get("/Rect", [0, 0, 0, 0])]
                rect_norm = _normalize_rect(rect, crop_box, rotation)
                if rect_norm is None:
                    continue
                entry = {"rect_norm": rect_norm}
                uri_action = obj.get("/A")
                if uri_action and uri_action.get("/S") == "/URI":
                    target = _safe_external_uri(uri_action.get("/URI"))
                    entry["type"] = "external_uri" if target else "unsupported_action"
                    entry["target"] = target
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
        per_page.append({"rotation": rotation, "width_pt": crop_box[2] - crop_box[0], "height_pt": crop_box[3] - crop_box[1], "links": links})
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
