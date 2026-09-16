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

**P1 — hoàn tất, có bằng chứng chạy thật trên Docker cold start (không phải mockup)**:

Giai đoạn 1 (schema + cách ly tenant):
- Schema Postgres đầy đủ theo ARCHITECTURE.md mục 3 (infra/migrations/0002_core_schema.sql):
  tenants/users/memberships/books/revisions/book_settings/assets/jobs/audit_logs/
  analytics_events/daily_stats, khóa ngoại ghép tenant_id để chặn liên kết chéo tenant.
- RLS thật (infra/migrations/0003_rls_policies.sql): role runtime `app_user` KHÔNG superuser/
  BYPASSRLS; mọi bảng có dữ liệu tenant đều FORCE ROW LEVEL SECURITY. **Sửa 1 lỗi thiết kế phát
  hiện khi viết test**: policy ban đầu cho đọc theo toàn tenant, vi phạm PLAN.md mục 3 ("Creator
  khác dù cùng tenant chỉ xem qua link như Viewer") — đã sửa thành owner-scoped (Creator chỉ thấy
  sách/revision/asset/job/thống kê CỦA CHÍNH MÌNH, không phải toàn tenant) qua helper
  `is_own_book()` SECURITY DEFINER; Admin bypass riêng bằng `app.is_system_admin`.
- **Sửa 1 lỗi thiết kế thứ 2 phát hiện khi làm API** (infra/migrations/0005_self_membership_policies.sql):
  policy cũ của memberships/tenants đòi hỏi `app.tenant_id` đã được SET trước, nhưng luồng đăng
  nhập theo PLAN.md ("chọn tenant sau đăng nhập") cần liệt kê TẤT CẢ tenant của user TRƯỚC khi
  chọn — đã thêm policy self-scoped theo `app.user_id`, không cần tenant_id.
- Migration runner (infra/migrations/run.js) tự tạo/đồng bộ role `app_user`, idempotent.

Giai đoạn 2 (API + pipeline convert thật, chạy full trên Docker):
- NestJS API thật (apps/api): JWT login (argon2id, có dummy-hash chống timing attack khi email
  không tồn tại), interceptor `DbContextInterceptor` mở transaction Postgres mỗi request, SET
  LOCAL app.user_id/app.tenant_id/app.is_system_admin đúng theo context đã kiểm chứng ở RLS trên
  — tức là tầng ứng dụng dùng ĐÚNG cơ chế cách ly đã test, không phải một lớp auth riêng biệt.
  Endpoint: /auth/login, /me, /admin/* (tạo tenant/user/membership), /books (list/create/upload),
  /jobs/:id, /health.
- Outbox pattern thật: upload PDF hợp lệ (kiểm chữ ký `%PDF-`, SHA-256, giới hạn kích thước) tạo
  revision + asset(source_pdf) + jobs row (idempotency_key theo revision+pipeline_version) trong
  cùng transaction Postgres — không có job nào "mất tích" nếu app crash giữa chừng.
- Dispatcher thật (apps/dispatcher): claim job bằng `SELECT ... FOR UPDATE SKIP LOCKED` (an toàn
  chạy nhiều instance song song), đẩy vào BullMQ/Redis để retry có backoff, tự phục hồi job kẹt ở
  'processing' quá hạn (reconcileStuckJobs). Gọi pdf-worker qua HTTP nội bộ có shared-secret
  (`x-internal-token`), ghi kết quả (manifest/page_image/thumbnail asset rows, revision.state,
  job.state) trong transaction admin riêng.
- pdf-worker thật (services/pdf-worker, FastAPI + pypdfium2 + pypdf): render trang, trích link,
  chuẩn hoá toạ độ theo rotation, viết manifest.json. Có path-traversal guard trên STORAGE_ROOT.
- **Toàn bộ 5 service (postgres, redis, migrate, api, dispatcher, pdf-worker) đã build và chạy
  bằng `docker compose up --build` trong infra/docker/docker-compose.yml**, xác nhận 2 lần:
  (1) cold start với volume Postgres còn dữ liệu cũ, (2) cold start THẬT SỰ TỪ RỖNG
  (`docker compose down -v` xoá hết volume rồi `up` lại) — cả 2 lần container lên healthy, migrate
  chạy đủ 5 file migration, seed admin thành công, và một PDF upload thật đi hết pipeline tới
  job.state='done'/revision.state='ready' với đủ asset (source_pdf, manifest, 5 page_image,
  5 thumbnail). Không có port nào của dispatcher/pdf-worker lộ ra ngoài host — chỉ api (3000) và
  postgres/redis (5432/6379, chỉ bind 127.0.0.1) publish port.
- Resource limit (`deploy.resources.limits` trong docker-compose.yml) đã xác minh bằng
  `docker inspect` áp dụng thật: api 1 CPU/512MB, pdf-worker 1 CPU/1GB, dispatcher 0.5 CPU/256MB.
- **Cả 2 bộ test tích hợp PASS 100% trên stack Docker cold-start-từ-rỗng** (không phải host dev
  process, không phải mock):
  - tests/integration/tenant_isolation.test.js — 13/13 PASS (DB-level, raw pg qua app_user).
  - tests/integration/api_e2e.test.js — 14/14 PASS (HTTP-level qua API thật: login, /me, tạo
    sách F02 slug, chặn cross-tenant 403/404, chặn thiếu x-tenant-id, chặn PDF giả chữ ký, upload
    PDF thật → job queued → done).
- CI (.github/workflows/ci.yml): dựng lại đúng docker-compose.yml này trên GitHub Actions
  (`docker compose up -d --build --wait`), seed admin, chạy cả 2 bộ test tích hợp, dump log khi
  fail, luôn `down -v` để dọn.

**Đã CHỦ ĐỘNG bỏ phạm vi khỏi P1 (quyết định minh bạch, không phải quên)**:
- apps/web (Next.js reader/dashboard) và reverse proxy (nginx) — ARCHITECTURE.md mục 8 liệt kê
  trong "Docker Compose pilot" nhưng điều kiện gate của ROADMAP.md cho P1 chỉ yêu cầu "cold start
  Docker được" ở tầng dữ liệu + API + pipeline, chưa cần UI. Dời sang P2/P3 khi có FE thật.
- Mạng Docker `internal: true` cho pdf-worker (cô lập hẳn khỏi internet) — hiện chỉ dừng ở mức
  không publish port ra host; container vẫn có thể ra internet qua bridge network mặc định. Rủi ro
  thấp (pdf-worker không có endpoint public, chỉ nhận từ dispatcher cùng mạng) nhưng CHƯA đóng
  hoàn toàn theo ARCHITECTURE.md.
- Font-embedding: pdf-worker container chưa cài font hệ thống bổ sung (fonts-noto/fonts-liberation);
  PDF không nhúng font thật (chưa có corpus thật) chưa được kiểm chứng render đúng trong container.
- Test tải/pool connection dưới concurrency thật (nhiều upload đồng thời, nhiều dispatcher
  instance) — chưa đo; hiện chỉ xác nhận đúng (correctness), chưa xác nhận hiệu năng dưới tải.
- Backup/restore Postgres thật — chưa thử, vẫn ghi nhận mục tiêu RPO 24h/RTO 4h ở phần giả định.

Chưa bắt đầu: P2-P6, Git tag bản stable.
Điểm stable gần nhất: chưa có (P1 xong nhưng chưa cắt tag).
Handoff tài liệu: PLANNING-001 (draft); không coi là phần mềm có thể rollback.
Bước tiếp theo: bắt đầu P2 theo ROADMAP.md (khả năng cao là apps/web — reader/dashboard), hoặc
đóng các mục "chủ động bỏ phạm vi" ở trên nếu người dùng muốn cứng hoá P1 trước khi sang P2.

## Cách cập nhật
Sau mỗi đợt công việc, ghi: đã đổi gì, quyết định/giả định mới, test nào thực sự chạy, kết quả/lỗi, commit và bước kế tiếp.
Giữ lịch sử ADR nếu thay quyết định, đánh dấu superseded thay vì xóa.
Khi người dùng nói “ổn rồi”, làm quy trình HANDOFF.md cho đúng build hiện tại; nếu chỉ duyệt kế hoạch thì ghi duyệt tài liệu, không tạo stable ứng dụng giả.
Đọc README, MEMORYBANK và hồ sơ handoff gần nhất trước khi tiếp tục phát triển.
