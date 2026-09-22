"""Sinh bo PDF mau tong hop cho P0 PoC.

Day la du lieu TONG HOP (synthetic), khong phai PDF that cua khach hang.
Muc dich: co corpus tai lap lai duoc de benchmark parser/renderer va kiem
tra cac tinh huong loi trong ROADMAP.md (muc "Ma tran nghiem thu bat buoc").

Chay: python generate_fixtures.py
Yeu cau: reportlab, pypdf (da cai qua pip trong buoc PoC).
"""

from __future__ import annotations

import io
import pathlib
import wave

from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, DecodedStreamObject, DictionaryObject, NameObject, NumberObject, TextStringObject

OUT_DIR = pathlib.Path(__file__).parent
WIN_FONT_DIR = pathlib.Path(r"C:\Windows\Fonts")

VN_TEXT = [
    "Ky yeu 70 nam MISA — Bao cao tong ket",
    "Tieng Viet co dau: A A A A A A A A A A A A A A A A A A A A A A A A A",
    "Doan van kiem tra font nhung: kha nang render dau moi, dau nang,",
    "dau sac, dau huyen, dau hoi, dau nga tren nguyen am co va khong dau.",
    "Vi du that: Ha Noi, Ho Chi Minh, Da Nang, Can Tho, Hue, Quang Ninh.",
]


def register_vn_font() -> str:
    """Dang ky mot font TTF co day du dau tieng Viet (Arial tren Windows)."""
    candidates = ["arial.ttf", "segoeui.ttf", "tahoma.ttf"]
    for name in candidates:
        path = WIN_FONT_DIR / name
        if path.exists():
            pdfmetrics.registerFont(TTFont("VNFont", str(path)))
            return "VNFont"
    raise RuntimeError(
        "Khong tim thay font TTF co dau tieng Viet tren may nay; "
        "can chi dinh font khac truoc khi sinh fixture."
    )


def make_vi_text_with_links(path: pathlib.Path, font_name: str) -> None:
    """5 trang: unicode tieng Viet, 1 external link, 1 internal link ve trang cuoi."""
    c = canvas.Canvas(str(path), pagesize=A4)
    width, height = A4
    n_pages = 5
    for page_idx in range(n_pages):
        c.setFont(font_name, 11)
        y = height - 60
        for line in VN_TEXT:
            c.drawString(50, y, f"[Trang {page_idx + 1}] {line}")
            y -= 20
        if page_idx == 0:
            c.setFillColorRGB(0, 0, 0.8)
            c.drawString(50, y - 20, "Lien ket ngoai: https://www.misa.com.vn")
            c.linkURL(
                "https://www.misa.com.vn",
                (48, y - 30, 320, y - 10),
                relative=0,
            )
            c.drawString(50, y - 50, "Lien ket noi bo: di toi trang cuoi")
            c.linkAbsolute(
                "internal-last-page",
                "goto-last-page",
                (48, y - 60, 320, y - 40),
            )
        if page_idx == n_pages - 1:
            c.bookmarkPage("goto-last-page")
        c.showPage()
    c.save()


def make_rotated_mixed_sizes(path: pathlib.Path, font_name: str) -> None:
    """Trang doc A4, trang ngang A4 xoay, trang kho khac (A5) trong cung 1 file."""
    c = canvas.Canvas(str(path))
    # Trang 1: A4 doc
    c.setPageSize(A4)
    c.setFont(font_name, 14)
    c.drawString(50, A4[1] - 60, "Trang 1: A4 doc (portrait)")
    c.showPage()
    # Trang 2: A4 ngang that su (kich thuoc hoan vi, khong chi rotate flag)
    c.setPageSize(landscape(A4))
    c.setFont(font_name, 14)
    c.drawString(50, A4[0] - 60, "Trang 2: A4 ngang (landscape thuc)")
    c.showPage()
    # Trang 3: A4 doc nhung se duoc rotate 90 do o buoc sau qua pypdf
    c.setPageSize(A4)
    c.setFont(font_name, 14)
    c.drawString(50, A4[1] - 60, "Trang 3: A4 doc, se bi xoay 90 do (rotate flag)")
    c.showPage()
    # Trang 4: kho nho hon (A5-ish) de test mixed sizes
    small = (A4[0] * 0.7, A4[1] * 0.7)
    c.setPageSize(small)
    c.setFont(font_name, 12)
    c.drawString(30, small[1] - 40, "Trang 4: kho nho hon (mixed size)")
    c.showPage()
    c.save()

    reader = PdfReader(str(path))
    writer = PdfWriter()
    for i, p in enumerate(reader.pages):
        if i == 2:
            p.rotate(90)
        writer.add_page(p)
    with open(path, "wb") as f:
        writer.write(f)


def make_transparency(path: pathlib.Path, font_name: str) -> None:
    c = canvas.Canvas(str(path), pagesize=A4)
    width, height = A4
    c.setFont(font_name, 14)
    c.drawString(50, height - 50, "Trang kiem tra transparency / alpha blending")
    c.setFillColorRGB(1, 0, 0, alpha=0.5)
    c.rect(80, height - 300, 200, 150, fill=1, stroke=0)
    c.setFillColorRGB(0, 0, 1, alpha=0.5)
    c.rect(160, height - 350, 200, 150, fill=1, stroke=0)
    c.showPage()
    c.save()


def make_scanned_like(path: pathlib.Path) -> None:
    """Trang khong co text layer (chi ve hinh khoi), mo phong PDF scan."""
    c = canvas.Canvas(str(path), pagesize=A4)
    width, height = A4
    for _ in range(2):
        c.setFillColorRGB(0.85, 0.85, 0.85)
        c.rect(0, 0, width, height, fill=1, stroke=0)
        c.setFillColorRGB(0.2, 0.2, 0.2)
        c.rect(60, height - 200, width - 120, 100, fill=1, stroke=0)
        c.rect(60, height - 350, width - 200, 60, fill=1, stroke=0)
        c.showPage()
    c.save()


def make_many_pages(path: pathlib.Path, font_name: str, n_pages: int = 30) -> None:
    c = canvas.Canvas(str(path), pagesize=A4)
    width, height = A4
    for i in range(n_pages):
        c.setFont(font_name, 12)
        c.drawString(50, height - 50, f"Trang {i + 1}/{n_pages} — kiem tra pagination")
        c.showPage()
    c.save()



def make_embedded_audio(path: pathlib.Path) -> None:
    """One valid WAV nested in a standard PDF /Movie annotation for F10 E2E."""
    audio = io.BytesIO()
    with wave.open(audio, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(1)
        wav.setframerate(8000)
        wav.writeframes(b"\x80" * 800)
    writer = PdfWriter()
    page = writer.add_blank_page(width=400, height=300)
    stream = DecodedStreamObject()
    stream.set_data(audio.getvalue())
    stream[NameObject("/Type")] = NameObject("/EmbeddedFile")
    stream[NameObject("/Subtype")] = NameObject("/audio#2Fwav")
    stream_ref = writer._add_object(stream)
    file_spec = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Filespec"),
            NameObject("/F"): TextStringObject("embedded-audio.wav"),
            NameObject("/EF"): DictionaryObject({NameObject("/F"): stream_ref}),
        }
    )
    movie = DictionaryObject({NameObject("/F"): writer._add_object(file_spec)})
    annotation = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Annot"),
            NameObject("/Subtype"): NameObject("/Movie"),
            NameObject("/Rect"): ArrayObject([NumberObject(60), NumberObject(90), NumberObject(340), NumberObject(160)]),
            NameObject("/Movie"): writer._add_object(movie),
        }
    )
    page[NameObject("/Annots")] = ArrayObject([writer._add_object(annotation)])
    with path.open("wb") as handle:
        writer.write(handle)
def make_encrypted(src: pathlib.Path, dst: pathlib.Path, user_pwd: str = "test1234") -> None:
    reader = PdfReader(str(src))
    writer = PdfWriter()
    for p in reader.pages:
        writer.add_page(p)
    writer.encrypt(user_password=user_pwd, owner_password=None, use_128bit=True)
    with open(dst, "wb") as f:
        writer.write(f)


def make_corrupted(src: pathlib.Path, dst: pathlib.Path) -> None:
    data = src.read_bytes()
    # Cat bo 40% cuoi file de mo phong upload bi loi/ngat giua chung.
    truncated = data[: int(len(data) * 0.6)]
    dst.write_bytes(truncated)


def make_wrong_mime(dst: pathlib.Path) -> None:
    dst.write_text(
        "Day la file .pdf gia, thuc chat la text thuong. "
        "Dung de test kiem tra magic bytes / chu ky file.",
        encoding="utf-8",
    )


def main() -> None:
    font_name = register_vn_font()

    vi_text = OUT_DIR / "sample_vi_text.pdf"
    rotated = OUT_DIR / "sample_rotated_mixed.pdf"
    transparency = OUT_DIR / "sample_transparency.pdf"
    scanned = OUT_DIR / "sample_scanned_like.pdf"
    many_pages = OUT_DIR / "sample_many_pages.pdf"
    encrypted = OUT_DIR / "sample_encrypted.pdf"
    corrupted = OUT_DIR / "sample_corrupted.pdf"
    wrong_mime = OUT_DIR / "sample_wrong_mime.pdf"

    make_vi_text_with_links(vi_text, font_name)
    make_rotated_mixed_sizes(rotated, font_name)
    make_transparency(transparency, font_name)
    make_scanned_like(scanned)
    make_many_pages(many_pages, font_name, n_pages=30)
    make_many_pages(OUT_DIR / "sample_stress_150pages.pdf", font_name, n_pages=150)
    make_embedded_audio(OUT_DIR / "sample_embedded_audio.pdf")
    make_encrypted(vi_text, encrypted)
    make_corrupted(vi_text, corrupted)
    make_wrong_mime(wrong_mime)

    print("Da sinh fixtures vao:", OUT_DIR)
    for f in sorted(OUT_DIR.glob("sample_*")):
        print(" -", f.name, f.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
