"""Regression tests for PDF annotation geometry and browser-safe link targets."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from PIL import Image

from app.convert import _normalize_rect, _safe_external_uri, convert_share_thumbnail


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


if __name__ == "__main__":
    unittest.main()
