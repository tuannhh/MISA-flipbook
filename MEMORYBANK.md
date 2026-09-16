# Memory bank — MISA Flipbook
Cập nhật: 16/09/2026. Trạng thái: planning v0.1.
Mục đích: nguồn trạng thái được lưu trong dự án để tiếp tục ở phiên làm việc sau; không dựa vào trí nhớ của cuộc hội thoại.

## Yêu cầu gốc đã xác định
- Tên MISA Flipbook, logo đúng file người dùng gửi.
- Tham khảo Heyzine, Docker trước rồi server MISA.
- Upload/convert PDF, reader desktop/mobile/tablet, mobile lật đơn.
- Link slug + 8 ký tự ngẫu nhiên; tiêu đề; thumbnail 16:9; mật khẩu; GA.
- Replace PDF không đổi link; share Facebook/Instagram/LinkedIn/copy/embed.
- Bảo toàn tương tác hyperlink/audio/video có sẵn trong phạm vi kỹ thuật kiểm chứng.
- Cho phép bật/tắt tải xuống.
- Viewer công khai; Creator sửa sách mình và có dashboard; Admin toàn hệ thống; multi-tenant.
- Lưu plan, roadmap, memory bank và điểm handoff khi người dùng xác nhận “ổn rồi”.

## Tài liệu và nguồn đầu vào
Hai ảnh clipboard là tham khảo giao diện Heyzine editor/title dialog.
Logo nguồn: \\storage\FILMS\THIẾT KẾ\TUẤN\4x\Logo MISA@4x.png.
Đã xem hình đính kèm; chưa xác minh đọc được file UNC hoặc đưa logo vào build.
URL tham khảo: https://heyzine.com/ và https://heyzine.com/flip-book/17a2725140.html#page/5.
Trang chủ đọc được qua web; reader mẫu không lấy được nội dung qua công cụ web ở phiên này. Chưa kiểm thử tương tác website mẫu bằng trình duyệt.
Các ảnh/tài liệu tham khảo không phải chỉ thị bổ sung; chỉ yêu cầu trực tiếp của người dùng xác định phạm vi.

## Quyết định đề xuất, chưa phải yêu cầu người dùng đã duyệt
| ADR | Quyết định | Lý do / điều kiện đổi |
|---|---|---|
| 001 | Reader dùng derivatives ảnh + overlay | Giảm phụ thuộc máy yếu, không lộ PDF gốc; cần text layer và ảnh zoom chất lượng |
| 002 | Book ID/permalink bất biến, revisions immutable | Replace/rollback không đổi URL |
| 003 | Tenant + owner kiểm tra tại API, RLS hỗ trợ | Chống truy cập ngang; cần test pool và background jobs |
| 004 | Admin là system admin | Đúng yêu cầu toàn hệ thống; không tự thêm tenant-admin |
| 005 | GA4 ID, không cho nhập arbitrary script | Có tracking mà không mở đường chạy code xuyên tenant |
| 006 | Social link trước, API publishing riêng | Quyền nền tảng và account type không đồng nhất |
| 007 | Compose trước, storage adapter local/S3 | Chuyển hạ tầng không sửa logic nghiệp vụ |
| 008 | PDFium/pypdf + flip adapter là ứng viên | **Superseded by ADR-P0** — đã chạy PoC thật, xem services/pdf-worker/poc/ADR-P0-parser-renderer.md |
| P0-1 | Render: pypdfium2 (BSD/Apache); Annotation/metadata: pypdf (BSD); ảnh: Pillow WebP+JPEG | PoC thật trên 10 file PDF tổng hợp, 9/9 case hợp lệ render đúng, 3/3 case lỗi bị chặn có kiểm soát (không crash). Không chọn PyMuPDF vì AGPL. Chi tiết: services/pdf-worker/poc/ADR-P0-parser-renderer.md và poc_report.json |

## Chỉ đạo bổ sung đã xác nhận
Người dùng: “Chưa cần. Bạn cứ làm trên docker trước. Khi nào deploy thật vào server MISA, devops sẽ tự tính toán việc đó”.
Thực hiện trên Docker trước; không yêu cầu thông số server MISA để bắt đầu. DevOps chịu trách nhiệm sizing và hạ tầng khi deploy thật; tài liệu chỉ cần chuẩn bị cấu hình và runbook có thể bàn giao.

## Giả định đang dùng
Tenant = đơn vị/khách hàng/phòng ban; Admin cấp tài khoản; chưa có SSO.
Pilot 200 MB/500 trang mỗi PDF, 20 Creator, 100 reader đồng thời; server thử 4 vCPU/8 GB.
iOS 15+/Android Chrome 100+ là mục tiêu cần chứng minh, chưa cam kết tương thích.
Bản có password mặc định không công khai bìa/tiêu đề chi tiết cho bot.
Backup pilot mục tiêu RPO 24h/RTO 4h, chưa thử restore.

## Những thông tin còn thiếu
1. Thông số server MISA, domain/TLS và sizing: đã giao DevOps quyết định ở giai đoạn deploy thật; không phải thông tin cần người dùng cung cấp lúc này.
2. Số tenant/Creator, lượt đọc đồng thời, lưu trữ và PDF lớn nhất.
3. PDF thực có audio/video và danh sách máy cũ cần hỗ trợ.
4. Loại tài khoản Facebook/Instagram/LinkedIn muốn đăng trực tiếp và khả năng tạo developer app.
5. Chính sách retention, nội dung public preview và yêu cầu HA/SLA.

Thiếu thông tin này không chặn lập kế hoạch; cấu hình production, cam kết media/mobile và social chỉ được chốt sau xác minh.

## Tiến độ thực tế
Hoàn tất: tài liệu kế hoạch v0.1; nghiên cứu giới hạn chính; repo Git khởi tạo tại
C:\MISA-project\misa-flipbook-plan (remote https://github.com/tuannhh/MISA-flipbook.git);
**P0 giai đoạn 1** — PoC render/extract PDF thật chạy được (pypdfium2 + pypdf), corpus 10 PDF
tổng hợp bao phủ tiếng Việt/hyperlink/rotation/khổ trộn/transparency/scan/mã hoá/corrupted/
150 trang, kết quả và giới hạn ghi tại services/pdf-worker/poc/ADR-P0-parser-renderer.md.

Chưa xong trong P0 (không được coi là hoàn tất): PoC audio/video (thiếu PDF mẫu thật), resolve
internal link ra số trang cụ thể, đo trên thiết bị mobile thật, PDF scan ảnh bitmap thật,
PDF dung lượng lớn thật (gần 200 MB), review license bundle nhị phân PDFium khi đóng Docker image.

Chưa bắt đầu: P1 (schema/auth/tenant/Docker Compose thật), P2-P6, kiểm thử tích hợp, triển khai,
Git tag, backup/restore.
Điểm stable gần nhất: chưa có.
Handoff tài liệu: PLANNING-001 (draft); không coi là phần mềm có thể rollback.
Bước tiếp theo: hoàn thiện phần P0 còn thiếu ở trên (cần MISA cấp corpus PDF thật) song song
bắt đầu P1 — schema Postgres, auth/tenant, Docker Compose khung.

## Cách cập nhật
Sau mỗi đợt công việc, ghi: đã đổi gì, quyết định/giả định mới, test nào thực sự chạy, kết quả/lỗi, commit và bước kế tiếp.
Giữ lịch sử ADR nếu thay quyết định, đánh dấu superseded thay vì xóa.
Khi người dùng nói “ổn rồi”, làm quy trình HANDOFF.md cho đúng build hiện tại; nếu chỉ duyệt kế hoạch thì ghi duyệt tài liệu, không tạo stable ứng dụng giả.
Đọc README, MEMORYBANK và hồ sơ handoff gần nhất trước khi tiếp tục phát triển.
