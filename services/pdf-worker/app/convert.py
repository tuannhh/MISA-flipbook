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
# F10 level B: media is intentionally bounded independently of raster output. An
# embedded video can be valid while still being far too large for a reader session.
MAX_MEDIA_BYTES = int(os.getenv("PDF_MEDIA_MAX_BYTES", str(20 * 1024 * 1024)))
MAX_MEDIA_TOTAL_BYTES = int(os.getenv("PDF_MEDIA_TOTAL_BYTES", str(50 * 1024 * 1024)))


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
    media: list = field(default_factory=list)


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


def _deref(value):
    """Dereference a pypdf indirect object without trusting its concrete class."""
    return value.get_object() if hasattr(value, "get_object") else value


def _pdf_name(value) -> str | None:
    if value is None:
        return None
    # PDF names encode '/' as '#2F'. Decode only that constrained PDF escaping; this
    # is metadata, never a path that is used directly on disk.
    text = str(value).lstrip("/")
    out: list[str] = []
    pos = 0
    while pos < len(text):
        if text[pos] == "#" and pos + 2 < len(text):
            try:
                out.append(chr(int(text[pos + 1 : pos + 3], 16)))
                pos += 3
                continue
            except ValueError:
                pass
        out.append(text[pos])
        pos += 1
    return "".join(out)


def _file_spec_payload(file_spec):
    """Return one embedded-file payload without following any external file path.

    PDF FileSpec can also name a local path or URL. The worker must never dereference
    either: doing so would turn an upload into a server-side file/network read. Only
    the /EF stream already physically inside the uploaded PDF is eligible.
    """
    spec = _deref(file_spec)
    if not hasattr(spec, "get"):
        return None
    embedded = _deref(spec.get("/EF"))
    if not hasattr(embedded, "get"):
        return None
    stream = _deref(embedded.get("/UF") or embedded.get("/F"))
    if stream is None or not hasattr(stream, "get_data"):
        return None
    try:
        data = stream.get_data()
    except (OSError, PdfReadError, ValueError):
        return None
    if not isinstance(data, bytes):
        return None
    file_name = str(spec.get("/UF") or spec.get("/F") or "media")
    declared_type = _pdf_name(stream.get("/Subtype"))
    return data, file_name, declared_type


def _name_tree_file_specs(node):
    """Yield FileSpecs stored in a RichMedia /Assets name tree."""
    tree = _deref(node)
    if not hasattr(tree, "get"):
        return
    names = _deref(tree.get("/Names"))
    if isinstance(names, (list, tuple)):
        # Name tree entries alternate display-name and FileSpec.
        for index in range(1, len(names), 2):
            yield names[index]
    kids = _deref(tree.get("/Kids"))
    if isinstance(kids, (list, tuple)):
        for child in kids:
            yield from _name_tree_file_specs(child)


def _annotation_file_specs(annotation):
    """Yield only embedded media FileSpecs from standard PDF media annotations.

    Supports legacy Movie, Screen/Rendition and RichMedia asset containers. PDF
    JavaScript, Launch actions, Flash and arbitrary URI actions are deliberately not
    considered media; they remain unsupported per PLAN F10 level C.
    """
    subtype = str(annotation.get("/Subtype", ""))
    if subtype == "/Movie":
        movie = _deref(annotation.get("/Movie"))
        if hasattr(movie, "get") and movie.get("/F") is not None:
            yield movie.get("/F")
        return

    if subtype == "/Screen":
        action = _deref(annotation.get("/A"))
        if hasattr(action, "get") and action.get("/S") == "/Rendition":
            rendition = _deref(action.get("/R"))
            clip = _deref(rendition.get("/C")) if hasattr(rendition, "get") else None
            media_data = _deref(clip.get("/D")) if hasattr(clip, "get") else None
            if media_data is not None:
                yield media_data
        return

    if subtype == "/RichMedia":
        content = _deref(annotation.get("/RichMediaContent"))
        assets = _deref(content.get("/Assets")) if hasattr(content, "get") else None
        if assets is not None:
            yield from _name_tree_file_specs(assets)


def _classify_browser_media(data: bytes, file_name: str, declared_type: str | None):
    """Return (audio|video, content-type, extension) after byte-level validation.

    We do not rely on a PDF filename or /Subtype alone: both are attacker-controlled.
    The allowlist is intentionally limited to native browser containers. A PDF with
    Flash, executable media, or an exotic codec still renders as a book and records a
    conversion warning instead of exposing a download or player.
    """
    if len(data) < 4:
        return None
    name = file_name.lower()
    declared = (declared_type or "").lower()
    if data.startswith(b"RIFF") and data[8:12] == b"WAVE":
        return "audio", "audio/wav", "wav"
    if data.startswith(b"ID3") or (len(data) >= 2 and data[0] == 0xFF and data[1] & 0xE0 == 0xE0):
        return "audio", "audio/mpeg", "mp3"
    if data.startswith(b"OggS"):
        if declared.startswith("video/") or name.endswith((".ogv", ".oggv")):
            return "video", "video/ogg", "ogv"
        return "audio", "audio/ogg", "ogg"
    if data.startswith(b"\x1aE\xdf\xa3"):
        if declared.startswith("audio/") or name.endswith((".weba", ".webma")):
            return "audio", "audio/webm", "webm"
        return "video", "video/webm", "webm"
    if len(data) >= 12 and data[4:8] == b"ftyp":
        if declared.startswith("audio/") or name.endswith((".m4a", ".m4b", ".aac")):
            return "audio", "audio/mp4", "m4a"
        return "video", "video/mp4", "mp4"
    return None


def _extract_annotation_media(annotation, rect_norm, media_dir: pathlib.Path, page_number: int, ordinal: int, budget_left: int, warnings: list[str]):
    """Extract safe embedded media for one page annotation and return manifest rows."""
    if rect_norm is None:
        return [], 0
    extracted: list[dict] = []
    used = 0
    for file_spec in _annotation_file_specs(annotation):
        payload = _file_spec_payload(file_spec)
        if payload is None:
            warnings.append(f"Trang {page_number}: bo qua media khong phai file nhung.")
            continue
        data, file_name, declared_type = payload
        if len(data) > MAX_MEDIA_BYTES or len(data) > budget_left - used:
            warnings.append(f"Trang {page_number}: bo qua media vuot gioi han dung luong.")
            continue
        classified = _classify_browser_media(data, file_name, declared_type)
        if classified is None:
            warnings.append(f"Trang {page_number}: bo qua media co dinh dang trinh duyet khong ho tro.")
            continue
        media_kind, content_type, extension = classified
        item_number = ordinal + len(extracted) + 1
        relative = f"media/page-{page_number:03d}-{item_number:03d}.{extension}"
        target = media_dir.parent / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        # Each output directory is exclusive to one attempt. x prevents a malformed
        # PDF from silently overwriting a previous annotation in that same attempt.
        try:
            with target.open("xb") as output:
                output.write(data)
        except FileExistsError:
            warnings.append(f"Trang {page_number}: bo qua media trung ten trong PDF.")
            continue
        extracted.append(
            {
                "kind": media_kind,
                "content_type": content_type,
                "path": relative,
                "rect_norm": rect_norm,
            }
        )
        used += len(data)
    return extracted, used


def _extract_links(pdf_path: pathlib.Path, password: str | None, output_dir: pathlib.Path, warnings: list[str]):
    reader = PdfReader(str(pdf_path))
    if reader.is_encrypted:
        if password is None:
            raise ConversionError("needs_password", "PDF can mat khau de doc.")
        result = reader.decrypt(password)
        if result == 0:
            raise ConversionError("needs_password", "Mat khau khong dung.")

    per_page = []
    total_media_bytes = 0
    media_dir = output_dir / "media"
    if len(reader.pages) > MAX_PAGES:
        raise ConversionError("page_limit", f"PDF vuot gioi han {MAX_PAGES} trang.")
    for page_number, page in enumerate(reader.pages, start=1):
        rotation = int(page.get("/Rotate", 0)) % 360
        cropbox = page.cropbox
        crop_box = (float(cropbox.left), float(cropbox.bottom), float(cropbox.right), float(cropbox.top))
        links = []
        media = []
        annots = page.get("/Annots")
        if annots:
            for a in annots:
                obj = a.get_object()
                rect = [float(v) for v in obj.get("/Rect", [0, 0, 0, 0])]
                rect_norm = _normalize_rect(rect, crop_box, rotation)
                subtype = str(obj.get("/Subtype", ""))
                if subtype == "/Link":
                    if rect_norm is None:
                        continue
                    entry = {"rect_norm": rect_norm}
                    uri_action = _deref(obj.get("/A"))
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
                elif subtype in {"/Movie", "/Screen", "/RichMedia"}:
                    extracted, extracted_bytes = _extract_annotation_media(
                        obj,
                        rect_norm,
                        media_dir,
                        page_number,
                        len(media),
                        MAX_MEDIA_TOTAL_BYTES - total_media_bytes,
                        warnings,
                    )
                    media.extend(extracted)
                    total_media_bytes += extracted_bytes
        per_page.append(
            {
                "rotation": rotation,
                "width_pt": crop_box[2] - crop_box[0],
                "height_pt": crop_box[3] - crop_box[1],
                "links": links,
                "media": media,
            }
        )
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
        link_info = _extract_links(source_path, password, output_dir, warnings)
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
                "media": page_link_info.get("media", []),
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
