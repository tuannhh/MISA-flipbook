# ADR-P0 — Chọn thư viện render/parse PDF

Ngày: 16/09/2026. Trạng thái: **quyết định P0**, dựa trên PoC thật chạy trong repo này
(`services/pdf-worker/poc/render_bench.py`), không phải suy đoán.

## Quyết định

- **Render trang thành ảnh**: `pypdfium2` (binding Python cho PDFium — engine render PDF
  của Chromium/Google). Bundle prebuilt PDFium binary theo giấy phép BSD-3-Clause/Apache-2.0
  (dự án [pdfium-binaries](https://github.com/bblanchon/pdfium-binaries)), phù hợp dùng
  trong sản phẩm thương mại đóng — không kéo theo nghĩa vụ AGPL như PyMuPDF/MuPDF.
- **Trích hyperlink/annotation + đọc metadata trang (kích thước, rotation)**: `pypdf`
  (giấy phép BSD). API `/Annots`, `/Rotate`, `mediabox` ổn định và dễ kiểm soát hơn khi cần
  phân loại từng loại annotation (URI/GoTo/khác) theo yêu cầu F10 mức A/B/C trong PLAN.md.
- **Đóng gói ảnh**: Pillow — JPEG cho thumbnail, WebP cho ảnh đọc (đúng đề xuất
  ARCHITECTURE.md "WebP + JPEG fallback").
- **Sinh PDF mẫu tổng hợp cho test** (không phải runtime worker): `reportlab`.

Đây là lựa chọn để bắt đầu code P1/P2, thay cho ADR-008 (candidate). Đánh dấu ADR-008 là
**superseded by ADR-P0** trong MEMORYBANK.md.

## Vì sao không chọn PyMuPDF (fitz)

PyMuPDF/MuPDF phát hành theo AGPL-3.0 hoặc license thương mại trả phí của Artifex. Dùng AGPL
trong một dịch vụ SaaS đóng nguồn kéo theo nghĩa vụ công bố mã nguồn khi phục vụ qua mạng —
rủi ro pháp lý cho MISA nếu không mua license thương mại. Vì pypdfium2 (BSD/Apache) đáp ứng
được nhu cầu render + pypdf đáp ứng được nhu cầu annotation, không cần PyMuPDF ở v1.

## Bằng chứng PoC thật (chạy trên máy dev, xem `poc_report.json`)

Corpus: 10 file PDF tổng hợp (synthetic) sinh bởi `tests/fixtures/pdf/generate_fixtures.py`,
bao gồm: tiếng Việt có dấu + font nhúng, hyperlink ngoài + link nội bộ (goto trang cuối),
trang xoay 90°/khổ trộn (A4 dọc/ngang/A5), transparency, "scan" không có text layer,
30 trang, **150 trang (stress test)**, mã hoá đúng/sai mật khẩu, file bị cắt cụt (corrupted),
file giả PDF (sai magic bytes).

| Tình huống | Kết quả | Ghi chú |
|---|---|---|
| Tiếng Việt có dấu, 5 trang | OK | Font TTF nhúng render đúng, không lỗi mất dấu |
| Hyperlink ngoài (URI) trang 1 | OK, 1 link phát hiện | `type=external_uri`, tọa độ chuẩn hoá 0..1 đúng vị trí vẽ |
| Link nội bộ (goto trang cuối) | OK, 1 link phát hiện | `type=internal_goto`; pypdf trả `/Dest`, chưa resolve tên đích sang số trang (xem "Hạn chế") |
| Trang xoay 90° trong file khổ trộn | OK | PDFium tự áp dụng `/Rotate` khi render — xác nhận bằng ảnh xuất ra (text nằm ngang trong content stream hiển thị dọc sau khi xoay, đúng chuẩn PDF) |
| Khổ trang trộn (A4 dọc/ngang/A5) trong cùng 1 file | OK | Không kéo méo; mỗi trang scale theo kích thước riêng |
| Transparency (2 hình chữ nhật alpha 0.5 chồng nhau) | OK | Không lỗi, không crash |
| "Scan" không text layer | OK | Vẫn render ảnh bình thường; xác nhận không có link nào bị trích nhầm |
| 30 trang | OK | Không lỗi tích lũy |
| 150 trang (stress) | OK | avg 8.27 ms/trang (ảnh đọc, 1600px), max 18.4 ms/trang, trên máy dev — **không phải số đo production/mobile** |
| Mã hoá + đúng mật khẩu | OK | Giải mã và render bình thường |
| Mã hoá + không đưa mật khẩu | Từ chối có kiểm soát | `status=rejected_needs_password`, không crash |
| File bị cắt cụt (corrupted) | Từ chối có kiểm soát | `status=rejected_corrupted_or_invalid`, không crash |
| File giả PDF (sai magic bytes `%PDF-`) | Từ chối trước khi mở | `status=rejected_invalid_signature`, chặn ở bước kiểm tra chữ ký, không đưa vào PDFium |

Ước tính ngoại suy tuyến tính cho 500 trang (chỉ phần render, dựa trên trung bình 150 trang
đo được): ~4.1 giây tổng thời gian render trên máy dev. **Đây là ngoại suy, không phải số đo
thật ở 500 trang** — do corpus thật 200 MB/500 trang từ khách hàng chưa có. Cần chạy lại benchmark
này với PDF 500 trang thật trước khi chốt SLO trong ARCHITECTURE.md mục 6.

## Hạn chế đã biết, chưa đóng (không tự đánh dấu hoàn tất)

1. **Audio/video (F10 mức B)**: chưa có PDF mẫu thật chứa RichMedia/Screen annotation có
   audio/video để thử trích xuất. Chưa chạy PoC phần này — theo đúng PLAN.md mục 6, **không
   được tự đánh dấu F10 hoàn tất** khi chưa có PoC media thật. Việc cần làm tiếp: xin MISA
   cung cấp ít nhất 1 PDF thật có audio/video nhúng.
2. **Internal link resolve tên đích → số trang**: pypdf trả về `/Dest` là named destination
   hoặc explicit destination array; PoC hiện chỉ phát hiện loại link (`internal_goto`), CHƯA
   resolve ra số trang đích cụ thể. Cần bổ sung logic resolve qua `reader.named_destinations`
   trước khi dùng cho reader thật (P4).
3. **Thiết bị mobile thật**: toàn bộ số đo là trên máy dev Windows, KHÔNG phải iOS
   Safari 15+/Android Chrome 100+ như mục tiêu PoC nêu ở PLAN.md mục 4. Cần thiết bị thật hoặc
   BrowserStack/lab thật trước khi kết luận ngưỡng mobile.
4. **PDF scan bằng ảnh scan thật (300dpi, nhiều MB/trang)**: fixture "scanned_like" ở đây chỉ
   là hình khối vẽ bằng vector, KHÔNG phải ảnh bitmap scan thật — chưa đo được thời gian
   render/kích thước file khi trang là ảnh lớn nhúng trong PDF. Cần bổ sung fixture ảnh scan
   thật (hoặc PDF scan mẫu từ MISA) ở P2.
5. **200 MB/PDF**: chưa test file PDF dung lượng lớn thật (nhiều ảnh embed nặng); corpus hiện
   tại nhẹ (tối đa ~56 KB). Cần fixture riêng để test giới hạn dung lượng và giới hạn bộ nhớ
   worker (ARCHITECTURE.md mục 2: "không giữ toàn bộ bitmap trong RAM").

## Việc tiếp theo (P0 còn mở trước khi coi P0 xong hoàn toàn)

- Xin corpus PDF thật (tiếng Việt, có audio/video, scan 300dpi, >100 trang, encrypted) từ MISA.
- Resolve named destination → số trang cho internal link.
- Đo lại benchmark trên corpus thật + ghi nhận trên ít nhất 1 thiết bị mobile thật.
- Review license bundle nhị phân PDFium (pdfium-binaries) khi build Docker image cho
  pdf-worker — cần ghi rõ nguồn gốc binary trong image (ADR sẽ cập nhật nếu đổi).
