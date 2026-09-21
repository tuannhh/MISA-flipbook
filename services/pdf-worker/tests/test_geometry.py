"""Regression tests for PDF annotation geometry and browser-safe link targets."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from PIL import Image
from pypdf import PdfWriter
from pypdf.generic import ArrayObject, DecodedStreamObject, DictionaryObject, NameObject, NumberObject, TextStringObject

from app.convert import _extract_links, _normalize_rect, _safe_external_uri, convert_share_thumbnail


class AnnotationGeometryTests(unittest.TestCase):
    def assert_rect(self, actual, expected):
        self.assertEqual(len(actual), 4)
        for value, target in zip(actual, expected):
            self.assertAlmostEqual(value, target, places=7)

    def test_uses_crop_box_not_media_box_origin(self):
        # Rect (115,70)-(145,90) inside CropBox (100,50)-(400,250).
        self.assert_rect(
            _normalize_rect([115, 70, 145, 90], (100, 50, 400, 250), 0),
            [0.05, 0.8, 0.15, 0.9],
        )

    def test_rotate_90_matches_pdfium_post_rotation_coordinates(self):
        # In unrotated display coordinates the area is x=.1-.3, y=.2-.4.
        # PDF /Rotate 90 moves it to x=.6-.8, y=.1-.3.
        self.assert_rect(
            _normalize_rect([10, 60, 30, 80], (0, 0, 100, 100), 90),
            [0.6, 0.1, 0.8, 0.3],
        )

    def test_rotate_270_is_the_opposite_mapping(self):
        self.assert_rect(
            _normalize_rect([10, 60, 30, 80], (0, 0, 100, 100), 270),
            [0.2, 0.7, 0.4, 0.9],
        )

    def test_rejects_empty_or_outside_rect(self):
        self.assertIsNone(_normalize_rect([500, 10, 550, 20], (0, 0, 100, 100), 0))

    def test_only_allows_safe_browser_protocols(self):
        self.assertEqual(_safe_external_uri("https://misa.vn/a"), "https://misa.vn/a")
        self.assertEqual(_safe_external_uri("mailto:reader@misa.vn"), "mailto:reader@misa.vn")
        self.assertEqual(_safe_external_uri("tel:+84912345678"), "tel:+84912345678")
        self.assertIsNone(_safe_external_uri("javascript:alert(1)"))
        self.assertIsNone(_safe_external_uri("data:text/html,alert(1)"))
        self.assertIsNone(_safe_external_uri("//untrusted.example/path"))

    def test_share_thumbnail_is_exactly_16_by_9(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "source.png"
            output = Path(tmp) / "cover.webp"
            Image.new("RGB", (2000, 800), "#245fdf").save(source)
            self.assertGreater(convert_share_thumbnail(source, output), 0)
            with Image.open(output) as cover:
                self.assertEqual(cover.size, (1200, 675))

    def _write_movie_pdf(self, output: Path, payload: bytes, filename: str = "clip.mp4"):
        """Build a small standard /Movie annotation with an embedded FileSpec."""
        writer = PdfWriter()
        page = writer.add_blank_page(width=200, height=100)
        stream = DecodedStreamObject()
        stream.set_data(payload)
        stream[NameObject("/Type")] = NameObject("/EmbeddedFile")
        stream[NameObject("/Subtype")] = NameObject("/video#2Fmp4")
        stream_ref = writer._add_object(stream)
        file_spec = DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Filespec"),
                NameObject("/F"): TextStringObject(filename),
                NameObject("/EF"): DictionaryObject({NameObject("/F"): stream_ref}),
            }
        )
        movie = DictionaryObject({NameObject("/F"): writer._add_object(file_spec)})
        annotation = DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Annot"),
                NameObject("/Subtype"): NameObject("/Movie"),
                NameObject("/Rect"): ArrayObject([NumberObject(20), NumberObject(10), NumberObject(180), NumberObject(90)]),
                NameObject("/Movie"): writer._add_object(movie),
            }
        )
        page[NameObject("/Annots")] = ArrayObject([writer._add_object(annotation)])
        with output.open("wb") as handle:
            writer.write(handle)

    def test_extracts_only_magic_checked_embedded_movie_as_media_overlay(self):
        # A minimal ftyp header proves extractor/asset routing; browser playback is
        # covered separately with a real media fixture in the integration suite.
        payload = b"\x00\x00\x00\x18ftypisom\x00\x00\x02\x00isomiso2avc1mp41"
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "movie.pdf"
            output = root / "output"
            self._write_movie_pdf(source, payload)
            warnings: list[str] = []
            pages = _extract_links(source, None, output, warnings)
            self.assertEqual(warnings, [])
            self.assertEqual(len(pages[0]["media"]), 1)
            media = pages[0]["media"][0]
            self.assertEqual(media["kind"], "video")
            self.assertEqual(media["content_type"], "video/mp4")
            self.assert_rect(media["rect_norm"], [0.1, 0.1, 0.9, 0.9])
            self.assertEqual((output / media["path"]).read_bytes(), payload)

    def test_rejects_disguised_embedded_file_even_when_pdf_declares_video(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "disguised.pdf"
            output = root / "output"
            self._write_movie_pdf(source, b"MZ-not-browser-media", filename="danger.mp4")
            warnings: list[str] = []
            pages = _extract_links(source, None, output, warnings)
            self.assertEqual(pages[0]["media"], [])
            self.assertEqual(len(warnings), 1)
            self.assertFalse((output / "media").exists())

if __name__ == "__main__":
    unittest.main()
