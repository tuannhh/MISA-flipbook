# MISA Flipbook
Ngày khởi tạo kế hoạch: 16/09/2026. Trạng thái hiện tại: Docker pilot đã có mã chạy được;
candidate gần nhất chưa phải bản stable.

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

## Chạy Docker pilot

1. Sao chép `infra/docker/.env.example` thành `infra/docker/.env` và thay toàn bộ secret placeholder.
2. Tại `infra/docker`, chạy `docker compose up -d --build --wait`.
3. Mở `http://localhost:8080`; API công khai nằm dưới cùng origin tại `/api` và healthcheck là `/health`.

Chỉ Nginx proxy mở cổng public. API, web, worker, PostgreSQL và Redis không được publish trực tiếp;
PostgreSQL/Redis chỉ bind loopback để chẩn đoán trên máy Docker. Mặc định proxy vận hành một hop với
`TRUST_PROXY_HOPS=1`; nếu topology MISA khác, DevOps phải đặt đúng hop/allowlist trước khi đưa vào môi trường thật.

## Hiện đã có / giới hạn trước stable

Đã có: ứng dụng multi-tenant, Docker Compose, pipeline PDF, reader, publish/rollback, mật khẩu,
download, share/embed, analytics, storage accounting, CI, cùng baseline media PDF nhúng an toàn.
Các kiểm chứng Docker cô lập gần nhất được ghi tại `handoffs/HF-20260921-06.md`; đây là candidate
hiện hành, không phải stable hay mốc rollback production.

Chưa có stable tag hay điểm rollback production: người dùng cần xác nhận candidate cụ thể theo
`HANDOFF.md`; sau đó mới tạo annotated tag, ghi image digest và backup/restore reference. Audio/video
PDF đã có baseline chỉ nhận embedded media allowlist; video của corpus MISA, device matrix,
CDN/object-storage/HA và topology TLS của MISA vẫn cần được xác minh trước production.
