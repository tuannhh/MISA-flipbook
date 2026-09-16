# Nguồn và phạm vi xác minh
Tra cứu ngày 16/09/2026. Tài liệu chính thức là cơ sở đánh giá khả năng, không thay thế PoC trên phiên bản library và tài khoản thật.

| Nguồn | Điều rút ra |
|---|---|
| [Heyzine](https://heyzine.com/) | Tham khảo upload, reader responsive, chia sẻ và tương tác; không sao chép toàn bộ feature set |
| [PDF.js FAQ — Mozilla](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions) | Modern/legacy đều có giới hạn trình duyệt; không mặc định legacy chạy trên mọi máy cũ |
| [PDFium annotations API](https://pdfium.googlesource.com/pdfium/+/refs/heads/main/public/fpdf_annot.h) | API annotation là cơ sở khảo sát; không chứng minh toàn bộ RichMedia tự chuyển thành HTML5 |
| [pypdf: đọc annotations](https://pypdf.readthedocs.io/en/stable/user/reading-pdf-annotations.html) | Cơ sở trích xuất annotation; cần kiểm tra subtype/stream của corpus thật |
| [StPageFlip — tác giả](https://github.com/Nodlik/StPageFlip) | Ứng viên hiệu ứng page flip; phải đánh giá bảo trì, license, zoom và mobile trước khi chọn |
| [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) | Row policies có ngoại lệ cho superuser/BYPASSRLS và thường cả owner; runtime cần thiết kế role phù hợp |
| [GA4 events](https://developers.google.com/analytics/devguides/collection/ga4/events) | Hỗ trợ event qua gtag; đề xuất lưu Measurement ID thay script tùy ý |
| [LinkedIn Share API](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin) | Đăng thay thành viên yêu cầu OAuth và quyền w_member_social; cần kiểm tra API/version khi triển khai |
| [Instagram API — workspace chính thức Meta](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api) | Luồng Facebook Login mô tả tài khoản professional, token và quyền; không hỗ trợ consumer accounts qua luồng đó |
| [Web Share — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share) | HTTPS, thao tác người dùng, mục tiêu chia sẻ tùy thiết bị; không bảo đảm Instagram luôn xuất hiện |

Trang reader Heyzine người dùng gửi trả lỗi khi lấy qua web, nên phần bố cục dựa trên ảnh đính kèm; chưa kiểm thử reader tương tác.
Các trang Facebook Share Dialog/Web Sharing trả HTTP 429 khi tra cứu. Phương án Share Dialog là đề xuất cần xác minh bằng tài liệu/app thật ở P0; chưa đánh dấu tích hợp Facebook đã được chứng minh.
Các mốc hiệu năng, sizing server, ngưỡng thiết bị, thời lượng roadmap và retention trong tài liệu là đề xuất kỹ thuật, không phải kết quả từ các nguồn trên.
