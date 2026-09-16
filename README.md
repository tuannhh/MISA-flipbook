# MISA Flipbook — bộ kế hoạch v0.1
Ngày: 16/09/2026. Trạng thái: đề xuất để duyệt; chưa triển khai ứng dụng.

Mục tiêu: tự vận hành dịch vụ PDF → flipbook online, chạy Docker trước và chuyển lên server MISA; có multi-tenant ngay từ nền tảng.

## Đọc theo thứ tự
1. [PLAN.md](PLAN.md): phạm vi sản phẩm, phân quyền, trải nghiệm và điều kiện nghiệm thu.
2. [ARCHITECTURE.md](ARCHITECTURE.md): kiến trúc, dữ liệu, chuyển đổi PDF, Docker và vận hành.
3. [ROADMAP.md](ROADMAP.md): các mốc triển khai, đầu ra và cửa kiểm soát chất lượng.
4. [MEMORYBANK.md](MEMORYBANK.md): yêu cầu gốc, quyết định, giả định và trạng thái để tiếp tục công việc.
5. [HANDOFF.md](HANDOFF.md): cách chốt bản ổn định, bàn giao và rollback.
6. [handoffs/TEMPLATE.md](handoffs/TEMPLATE.md): mẫu hồ sơ cho mỗi điểm handoff.
7. [SOURCES.md](SOURCES.md): nguồn tham khảo và những giới hạn đã xác minh.

## Đề xuất chính
- Frontend quản trị React/Next.js; reader nhẹ, tải ảnh trang đã xử lý phía server.
- Backend NestJS; worker PDF Python; PostgreSQL; Redis/BullMQ; kho file qua adapter local/S3.
- Docker Compose pilot gồm proxy, web, API, bộ điều phối job, worker, PostgreSQL, Redis.
- Reader mobile mặc định một trang; desktop hai trang khi đủ diện tích; chế độ đơn giản cho máy yếu.
- Bản PDF mới được chuyển đổi độc lập; chỉ phát hành khi hoàn tất; link cố định.
- Admin là quản trị toàn hệ thống; Creator chỉ sửa sách của chính mình trong tenant.
- Tự động đăng mạng xã hội là giai đoạn có điều kiện về API; không coi việc đã đăng nhập mạng xã hội là đã cấp quyền cho MISA Flipbook.
- Không tạo nhãn “stable” trước khi có phiên bản chạy được, bằng chứng kiểm thử và người dùng xác nhận.

## Hiện đã có / chưa có
Đã có: đặc tả, kiến trúc đề xuất, roadmap, memory bank và quy trình handoff.
Chưa có: mã ứng dụng, Git tag, Docker image, triển khai Docker, kiểm thử thực thi, bản backup hoặc điểm rollback thực tế.
Bộ tài liệu này là mốc tài liệu PLANNING-001, không phải bản phần mềm ổn định.
