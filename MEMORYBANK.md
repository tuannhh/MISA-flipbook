# Memory bank — MISA Flipbook
Cập nhật: 17/09/2026. Trạng thái: P1+P2+P3 xong (chưa cắt tag).
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
| P2-flip | ~~Tự viết hiệu ứng lật trang bằng CSS 3D transform thuần~~ **Superseded** — chuyển sang thư viện `react-pageflip` (bọc `page-flip`/StPageFlip) | Quyết định gốc (ghi ở phần "Bổ sung sau khi P2 đã xong theo gate") từng nêu lý do tránh dùng "turn.js/react-pageflip" để kiểm soát license — SAI: đã tra lại license thật (GitHub, npm registry), `page-flip`/`react-pageflip` (tác giả Nodlik) là **MIT**, dùng thương mại được, khác hẳn turn.js (license thương mại riêng, đúng là nên tránh). Đồng thời bản CSS 3D tự viết có lỗi thật: cơ chế "đợi rAF kép" để kích hoạt CSS transition bị đứng/nhảy cứng khi rAF không chạy đúng nhịp (tái hiện được cả ở dev lẫn production build, không phải chỉ do công cụ test), và chất lượng hiệu ứng (phẳng, không có bo cong giấy/vệt sáng/bóng đổ động) không đạt yêu cầu người dùng đối chiếu Heyzine. Đã xin xác nhận người dùng trước khi đổi thư viện (không tự ý). |

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

**P2 — hoàn tất điều kiện đi tiếp theo ROADMAP.md, có bằng chứng chạy thật**:

Theo chỉ đạo người dùng trước khi làm P2: "tách các service thành các worker để đảm bảo khi
có 1 module bị lỗi cũng không ảnh hưởng tới toàn hệ thống" và "tách riêng FE và BE". Cả hai đã
làm THẬT (không phải đổi tên gọi):

- **Tách dispatcher thành 2 service độc lập** (`apps/dispatcher`, `apps/worker-convert`), thay vì
  1 tiến trình vừa claim job vừa gọi pdf-worker như P1:
  - `dispatcher` (claimer): CHỈ claim job từ outbox Postgres và đẩy vào BullMQ/Redis. Không gọi
    pdf-worker, không có logic xử lý — do đó không thể crash vì lý do liên quan đến nội dung PDF.
  - `worker-convert`: tiến trình DUY NHẤT gọi pdf-worker/ghi kết quả. Nếu code ở đây lỗi (PDF quá
    lớn, bug xử lý manifest...), CHỈ container này bị ảnh hưởng.
  - Sửa thêm 1 lỗ hổng phát hiện khi đọc lại code cũ: `reconcileStuckJobs()` trước đây chỉ chạy
    1 lần lúc khởi động dispatcher, không chạy định kỳ — nếu dispatcher không tự restart thì job
    kẹt "processing" sẽ không bao giờ được đưa về lại "queued". Đã sửa thành chạy theo chu kỳ
    `RECONCILE_INTERVAL_MS` (mặc định 60s).
  - **Đã kiểm chứng THẬT (thủ công, ghi lại đây vì khó tự động hoá trong CI)**: upload PDF 150
    trang, kill `worker-convert` bằng SIGKILL đúng lúc job đang ở state 'processing' (giữa lúc
    gọi pdf-worker). Kết quả: `api` vẫn health 200, `dispatcher` vẫn claim job mới bình thường
    (log không có lỗi), Docker restart policy `unless-stopped` KHÔNG tự khởi động lại container
    sau `docker kill` (đúng theo thiết kế của Docker — `unless-stopped` coi kill/stop thủ công là
    ý định của operator, không tự phục hồi; nếu tiến trình bên TRONG container tự crash — OOM,
    exception không bắt được — Docker MỚI tự restart theo policy này). Sau khi tự khởi động lại
    `worker-convert` (`docker start`), BullMQ tự phát hiện job "stalled" (lock hết hạn vì worker
    cũ chết giữa chừng) và giao lại job đó cho worker mới, job hoàn tất đúng
    (`job.state=done`, `revision.state=ready`, đủ asset) — không mất, không kẹt vĩnh viễn, không
    cần can thiệp thủ công vào DB. Đây là bằng chứng thật cho điều kiện đi tiếp của P2: "restart
    worker không làm hỏng publish".
- **Tách FE/BE hoàn toàn** (`apps/web`, Next.js 16 + React 19, container riêng, cổng 3001):
  FE chỉ gọi `apps/api` qua HTTP/JSON thuần (Bearer JWT trong `localStorage`, không cookie/session
  chia sẻ, không SSR-proxy). BE bật CORS có kiểm soát (`CORS_ORIGIN`, mặc định KHÔNG mở nếu không
  khai báo). Không dùng chung process, DB, hay bất kỳ state nào giữa 2 app — có thể build/deploy/
  scale độc lập.

Backend bổ sung cho luồng "Upload → job → preview → publish → reader, permalink, title/thumbnail":
- Migration `0006_public_reader.sql`: 3 hàm SECURITY DEFINER (`public_get_book`,
  `public_list_page_assets`, `public_get_page_asset`) cho phép `app_user` đọc dữ liệu sách ĐÃ
  PUBLISH mà KHÔNG cần `app.tenant_id`/`app.user_id` (đường riêng cho reader công khai, như đã
  ghi chú trong `0003_rls_policies.sql` từ P1) — và tuyệt đối KHÔNG BAO GIỜ trả về asset
  `kind='source_pdf'` qua đường này (đã test: id asset PDF gốc thật trả về 404 qua endpoint công
  khai, kể cả khi biết đúng book_id).
- `apps/api`: thêm `GET/PUT /books/:id/settings` (allowDownload, chọn thumbnail bìa),
  `GET /books/:id/revisions`, `GET /books/:id/preview` (xem trước 1 revision TRƯỚC khi publish,
  dùng lại đúng manifest.json + assets, không phải dữ liệu giả lập), `GET /books/:id/assets/:id`
  (ảnh trang cho Creator, có xác thực), `PATCH /books/:id` (đổi tiêu đề), `POST /books/:id/publish`
  (chỉ cho publish revision ở state 'ready'; kiểm tra revision thuộc đúng sách). Cột `cover_asset_id`
  tự động suy ra từ thumbnail trang đầu của revision ĐANG PUBLISH nếu Creator chưa tự chọn — sách
  draft không có cover_asset_id (tránh lộ ảnh của revision chưa duyệt).
- `apps/web`: trang đăng nhập (tự chọn tenant nếu Creator thuộc nhiều tenant), dashboard (tạo/
  liệt kê sách, upload PDF với polling trạng thái job, xem trước thumbnail từng trang, publish,
  đổi tiêu đề, bật/tắt cho phép tải xuống, chọn ảnh bìa bằng cách bấm vào thumbnail), và
  `/read/:permalink` — reader công khai không cần đăng nhập, điều hướng bằng nút trái/phải,
  phím mũi tên, và vuốt cảm ứng (đã test tại viewport 375×812 qua trình duyệt thật). **Ghi chú
  trung thực**: đây là slideshow ảnh từng trang với chuyển cảnh mượt, CHƯA phải hiệu ứng lật
  trang 3D kiểu Heyzine như PLAN.md mô tả ban đầu — điều kiện đi tiếp của P2 trong ROADMAP.md chỉ
  yêu cầu "PDF thực đọc được trên desktop/mobile" (đã đạt), hiệu ứng lật trang thật là việc còn
  mở, nên làm ở P2 polish hoặc gộp cùng P4.
- **Test tự động mới** (`tests/integration/p2_e2e.test.js`, 16/16 PASS, chạy lặp lại nhiều lần):
  draft chưa publish → public 404; upload → job done → preview có đủ ảnh; publish revision không
  tồn tại → 404; publish thành công → cover tự động; public reader đọc được sách đã publish nhưng
  KHÔNG tự nhảy sang revision mới hơn chưa publish (tách bạch draft/published đúng); asset id sai
  → 404 (không dò được dữ liệu qua brute-force); cài đặt allowDownload/thumbnail hoạt động đúng.
  Đã chạy lại `tenant_isolation.test.js` (13/13) và `api_e2e.test.js` (14/14) — không hồi quy.
- Docker Compose: thêm service `web`, tách `dispatcher`/`worker-convert`, xác nhận cold start
  THẬT TỪ RỖNG (`down -v` rồi `up --build`) với đủ 7 service (postgres/redis/migrate/api/web/
  dispatcher/worker-convert/pdf-worker — 8 thực ra, đếm cả migrate one-shot) lên healthy, chạy
  đủ 6 file migration, luồng upload→publish→đọc công khai hoạt động qua cả API thô lẫn UI thật
  trong trình duyệt.

**Bổ sung sau khi P2 đã "xong theo gate" — hiệu ứng lật trang 3D thật (không phải
slideshow/crossfade cũ)**, làm theo yêu cầu người dùng "làm hiệu ứng lật trang 3D",
tham khảo tương tác (không sao chép code) từ heyzine.com/flip-book/17a2725140.html#page/5:

- `apps/web/src/components/FlipBook.tsx` (mới) thay hoàn toàn phần render ảnh tĩnh trong
  `apps/web/src/app/read/[permalink]/page.tsx`. Tự dựng bằng CSS 3D transform thuần
  (`rotateY` + `backface-visibility` + `perspective`), KHÔNG dùng thư viện ngoài
  (turn.js/react-pageflip) để tránh phụ thuộc license ngoài tầm kiểm soát — giữ tinh
  thần đã chọn ở P0 (từ chối PyMuPDF vì AGPL).
- Mô hình vật lý (ghi lại trong comment đầu file để không phải suy luận lại):
  - Mobile/1-trang: mỗi trang là 1 lá bản lề cạnh TRÁI cố định, lật tới `rotateY 0→-180`,
    lật lùi `rotateY 0→+180` (giống lịch bàn/sổ xoay — một ẩn dụ vật lý thật, không phải
    giả để đơn giản hoá code).
  - Desktop/2-trang (spread): trang phải lật quanh gáy sách khi lật tới, trang trái lật
    quanh gáy khi lật lùi — đúng mô hình sách thật; mặt sau của lá lật chính là trang mới
    xuất hiện ở phía đối diện (không phải ảnh giả lập).
  - Bìa trước/bìa sau (trang đơn theo PLAN.md mục 4) là trường hợp biên: ĐƠN GIẢN HOÁ CÓ
    CHỦ ĐÍCH — mặt sau lá lật khi đóng/mở bìa dùng "giấy lót" (gradient trơn, không phải
    ảnh PDF thật) thay vì compose ảnh hai trang, để tránh hiển thị sai tỷ lệ khi lá chỉ
    rộng bằng nửa slot nhưng đích lại là trang bìa rộng đầy đủ. Đây là 1 trong 2 điểm
    hiệu ứng KHÔNG hoàn toàn chính xác vật lý, ghi rõ để không tự nhận "giống hệt sách
    thật 100%".
  - Chế độ 1/2 trang: tự động theo bề rộng khung (>=900px → spread, theo PLAN.md mục 4),
    CÓ nút cho người dùng tự chọn đè lên khi khung >=640px ("tablet có chọn 1/2 trang
    theo chiều rộng thực tế" — yêu cầu này trước đó CHƯA làm, nay đã có).
  - `useSimpleReaderMode` (mới, `apps/web/src/lib/useSimpleReaderMode.ts`): tắt hẳn hiệu
    ứng 3D, chỉ đổi trang tức thì, khi `prefers-reduced-motion: reduce` HOẶC
    `navigator.deviceMemory<=2` HOẶC `hardwareConcurrency<=2`. **Đây là suy đoán bằng
    heuristic, KHÔNG phải benchmark đo trên thiết bị yếu thật** — `deviceMemory` chỉ có ở
    Chromium, `hardwareConcurrency` là proxy thô cho CPU chứ không đo được năng lực GPU
    compositing. Đường này được xác minh bằng ĐỌC CODE/lần theo logic, KHÔNG bằng giả lập
    trình duyệt trực tiếp (công cụ trình duyệt dùng để tự kiểm thử không hỗ trợ ép
    `prefers-reduced-motion` runtime) — nếu cần độ tin cậy cao hơn phải đo trên thiết bị
    thật, giữ nguyên mục "chưa xác nhận iOS/Android thật" đã ghi ở phần giả định.
- **Lỗi thật phát hiện và sửa trong lúc tự kiểm thử qua Claude Browser (không phải suy
  đoán)**: lần lượt bắt gặp 2 lỗi khiến hiệu ứng lật kẹt giữa chừng vĩnh viễn (không bao
  giờ hoàn tất chuyển trang) khi pane trình duyệt không được vẽ (rAF bị treo vô thời hạn
  dù `document.hidden===false`, không phát hiện được qua Page Visibility API) — sửa bằng:
  (1) `nextPaint()` (rAF + `setTimeout` dự phòng thay vì rAF đơn thuần) cho bước "tạo lá ở
  progress 0 rồi mới bật transition"; (2) một `useEffect` an toàn: nếu quá
  `durationMs + 150ms` mà `transitionend` chưa tự dọn dẹp flight, tự ép hoàn tất/huỷ. Đây
  không phải rủi ro giả định — đã tái hiện được lỗi kẹt thật (spread lùi từ trang cuối bị
  đứng hình vô thời hạn), sửa, rồi xác nhận lại chạy đúng qua cùng kịch bản.
- **Đã tự kiểm thử thật qua Claude Browser (không phải mô tả suy diễn)**, trên
  `sach-demo-p2-tieng-viet` (5 trang, có bìa+2 spread) và một sách 150 trang tự tạo/publish
  tạm qua API thật (`tests/fixtures/pdf/sample_stress_150pages.pdf`, đã xoá dữ liệu test
  sau khi xong để không để lại rác trong DB dev):
  - Desktop 1280px: lật tới/lùi qua nút bấm VÀ qua kéo chuột (pointer drag) đều đúng, cả
    hướng tới lẫn lùi, cho cặp trang nội bộ (vd 2-3 ↔ 4-5) lẫn ranh giới mở/đóng bìa
    trước (1 ↔ 2-3).
  - Kéo dở dang <50% rồi thả: tự huỷ, quay lại đúng trang cũ (không commit nhầm).
  - Mobile giả lập 375×812: lật từng trang một (không ghép cặp), kéo vuốt hoạt động.
  - Nút "1 trang"/"2 trang" ép chế độ hoạt động đúng trên desktop.
  - Phím mũi tên trái/phải hoạt động.
  - Dữ liệu thật 150 trang: xác nhận `computeSpreads` cho đúng bìa trước (trang 1, đơn),
    spread áp chót (148-149, cặp), bìa sau (trang 150, đơn) — đúng dự kiến khi tổng số
    trang sau bìa là số lẻ.
  - **Giới hạn thật của lần tự kiểm thử này**: KHÔNG click hết tới tận trang 150 để xem
    trực tiếp hoạt cảnh "đóng/mở bìa sau" bằng mắt (mỗi lần lật chỉ ăn 1 lần bấm do có
    guard chặn spam trong lúc đang animate — click nhanh 74 lần để tới cuối sẽ tốn quá
    nhiều lượt gọi công cụ). Nhánh "đóng/mở bìa sau" trong code ĐỐI XỨNG với nhánh "mở/đóng
    bìa trước" đã xác nhận chạy đúng trên sách 5 trang, và đã xác nhận dữ liệu (bước trên)
    đúng hình dạng để nhánh đó được gọi tới — nhưng đây là suy luận đối xứng + kiểm chứng
    dữ liệu, KHÔNG phải đã tận mắt xem hoạt cảnh đó chạy trên trình duyệt. Ghi rõ để không
    tự nhận "đã test hết mọi trường hợp".
  - Chưa giả lập được `prefers-reduced-motion` qua công cụ trình duyệt đang dùng (không hỗ
    trợ ép media feature này khi mở tab thường) nên đường "chế độ đơn giản" chỉ được xác
    nhận qua đọc code, như đã ghi ở trên.
  - Sau khi build lại xong, đã CHỦ ĐỘNG chạy lại `tenant_isolation.test.js` (13/13),
    `api_e2e.test.js` (14/14), `p2_e2e.test.js` (16/16) trên đúng stack Docker đang chạy —
    không hồi quy (thay đổi lần này chỉ ở `apps/web`, không đụng API/DB/worker).

Chưa xong trong P2 (không được coi là hoàn tất, ghi rõ để không tự nhận):
- Mật khẩu bảo vệ sách công khai (`book_settings.password_hash` đã có cột nhưng chưa có luồng
  nhập mật khẩu ở reader) — public reader hiện CHẶN HẲN (403) nếu Creator bật mật khẩu, thay vì
  cho qua sai — an toàn nhưng chưa đúng chức năng, để dành cho P3 theo ROADMAP.md.
- Trang admin trên FE (tạo tenant/user/membership hiện chỉ làm qua API thô, đúng như ROADMAP.md
  xếp "Admin" vào P4).
- Test tải/concurrency thật (nhiều Creator upload/publish đồng thời) — vẫn là việc mở từ P1.
- Reconciler DB (job 'processing' quá hạn quay lại 'queued') mới kiểm chứng qua đọc code + suy
  luận từ test BullMQ-stalled ở trên, CHƯA có test tự động giả lập đúng kịch bản
  STUCK_JOB_TIMEOUT_MINUTES thật (15 phút, quá lâu để chạy trong CI).
- Trong hiệu ứng lật trang mới: chưa có test tự động (Playwright/Cypress...) cho FE, mới chỉ
  tự kiểm thử thủ công qua trình duyệt (xem ghi chú chi tiết ở trên); chưa test trên thiết bị
  chạm thật (chỉ giả lập kích thước 375×812 qua DevTools-style emulation, chưa test iOS/Android
  thật như ghi ở phần giả định); ?page=N deep-link (PLAN.md mục 2: "Trang đọc dùng ?page=5")
  vẫn CHƯA làm — không nằm trong yêu cầu lần này (chỉ làm hiệu ứng lật trang) nên không tự ý
  mở rộng phạm vi, ghi lại để không quên.

**Sửa hiệu ứng lật trang sau khi P2 "xong theo gate" (đợt 2, sau khi đã đổi thư viện,
xem ADR P2-flip ở trên) — làm theo phản hồi người dùng "bị lỗi lật trang ngay trang
đầu ... hiệu ứng flip hơi bị thô ... muốn tốt như Heyzine":**

- Lỗi thật đã tái hiện và xác định nguyên nhân gốc (không suy đoán): dùng công cụ
  trình duyệt tự động, chèn `data-*` attribute phản ánh state React và poll
  `getComputedStyle` mỗi ~100ms trong lúc trigger lật trang bìa (cover, leaf full-width).
  Kết quả: React state cập nhật đúng (`progress=1, animated=true, angle=-180`) và style
  attribute cũng đúng (`transform: rotateY(-180deg)`), nhưng `getComputedStyle` đứng yên
  ở ma trận identity suốt animation rồi bị timeout an toàn (`durationMs+150ms`) ép nhảy
  cứng sang trang đích — tức la CSS transition không thực sự chạy, không phải do
  logic tính toán progress sai. Tái hiện được cả trên `next dev` lẫn `next build && next
  start` (loại trừ nguyên nhân React StrictMode double-render ở dev). Cơ chế "đợi 2 lần
  requestAnimationFrame rồi mới bật transition" (để né việc trình duyệt gộp 2 lần set
  style liên tiếp) không đủ tin cậy cho trường hợp leaf full-width (mở/đóng bìa).
- Quyết định: thay vì tiếp tục vá cơ chế tự viết, tra lại license của 2 thư viện người
  dùng gửi tham khảo (`dearhive/dearflip-js-flipbook` — CC BY-NC-ND 4.0, KHÔNG dùng
  thương mại được, loại; `ts1/flipbook-vue` — MIT nhưng là component Vue, không cắm
  thẳng vào React) và của `StPageFlip`/`react-pageflip` (ADR P2-flip ở trên) — xác nhận
  MIT thật qua GitHub + npm registry trước khi đổi, không dùng lại suy đoán cũ. Đã hỏi
  và được người dùng đồng ý đổi sang `react-pageflip` trước khi code.
- Đã làm: viết lại hoàn toàn `apps/web/src/components/FlipBook.tsx` dùng
  `<HTMLFlipBook>` của `react-pageflip@2.0.3` (kéo theo `page-flip@2.0.7`, cả hai MIT,
  đã pin version cụ thể trong package-lock.json, không dùng `latest`). Giữ nguyên hợp
  đồng props bên ngoài (`{title, pages, imageUrl}`), giữ `useSimpleReaderMode` (máy yếu/
  giảm chuyển động dùng `flippingTime=1` thay vì tắt hẳn animation — đơn giản hơn bản cũ
  vì StPageFlip tự lo animation, không cần nhánh render tĩnh riêng), giữ phím mũi tên
  trái/phải qua `pageFlip().flipNext()/flipPrev()`, giữ `showCover` cho bìa đơn đúng
  PLAN.md mục 4. CSS cũ (`flipbook-leaf`, `flipbook-face`, `flipbook-shade`, keyframes
  `flipbook-bend`/`flipbook-shade-pulse`, `flipbook-view-toggle`) đã xoá khỏi
  `globals.css` vì không còn dùng (StPageFlip tự vẽ curl/bóng đổ bằng canvas/DOM riêng).
- Nút ép "1 trang/2 trang" thủ công (PLAN.md mục 4: "tablet có chọn 1/2 trang") — ĐÃ THỬ
  làm lại với react-pageflip bằng cách ép `minWidth`/`maxWidth` (đọc thẳng source
  `node_modules/page-flip/dist/js` để biết đúng công thức quyết định portrait/landscape
  của `size="stretch"`, không đoán), nhưng phát hiện `minWidth` đồng thời là SÀN CỨNG
  cho kích thước render thật, không chỉ là ngưỡng quyết định — ép nó theo bề rộng khung
  làm trang bị phóng to vỡ layout (đã tự kiểm thử thấy hỏng thật, có ảnh chụp màn hình
  làm bằng chứng trong phiên làm việc, không lưu file riêng). Đã BỎ nút ép tay này (thà
  không có còn hơn có nút bấm không hoạt động đúng), chỉ giữ hành vi tự động theo bề
  rộng khung (`containerWidth >= 900px` → spread, đã test đúng ở 375px/mobile và
  966px/desktop). Đây là quy định trong PLAN.md CHƯA làm được, ghi rõ để không tự nhận
  đã xong.
- Đã tự kiểm thử THẬT qua Claude Browser + docker compose build lại `web` (không phải
  mô tả suy diễn): bìa đơn (trang 1) mở ra spread đúng mô hình sách thật, bắt được
  khung hình đang lật cho thấy trang cong thật (không phẳng) kèm vệt sáng dọc nếp cong
  và bóng đổ tự nhiên lên trang bên dưới — đúng chất lượng đối chiếu với ảnh demo/
  Heyzine người dùng gửi, không còn hiện tượng đứng hình/nhảy cứng ở lần lật đầu tiên
  (đã thử lại nhiều lần, kể cả sau khi rebuild image Docker). Test qua mobile giả lập
  375×812: single-page, chạm/click chuyển trang đúng. Build production
  (`next build`) qua TypeScript sạch, SSR trang `/read/[permalink]` không lỗi.
  Chạy lại `tenant_isolation.test.js` (13/13), `api_e2e.test.js` (14/14),
  `p2_e2e.test.js` (16/16) trên stack Docker sau khi rebuild `web` — không hồi quy
  (thay đổi lần này chỉ ở `apps/web`, không đụng API/DB/worker).
- Giới hạn còn mở sau đợt sửa này: nút ép 1/2 trang thủ công chưa làm được (nêu trên);
  chưa test trên thiết bị chạm thật (chỉ giả lập kích thước qua trình duyệt); chưa có
  test tự động (Playwright) cho FE; `?page=N` deep-link vẫn chưa làm (đã ghi từ đợt
  trước, không mở rộng phạm vi ngoài yêu cầu lần này).

**Ghi nhận yêu cầu mới 17/09/2026 (chưa triển khai, chỉ mới đưa vào tài liệu)**: người
dùng yêu cầu ghi lại 3 việc làm sau — chi tiết đầy đủ và câu hỏi mở ở PLAN.md mục 8,
tham chiếu ngắn ở ROADMAP.md mục Backlog:
- F15: chèn ảnh nền cho sách (chưa rõ phạm vi ảnh nền toàn trang đọc hay nền từng trang PDF).
- F16: công tắc Publish ⇄ Private TRÊN sách đã publish (không phải trạng thái thay draft) —
  **đã hỏi lại và người dùng làm rõ (17/09/2026)**: giống "chỉ mình tôi" của Facebook,
  "Private" của YouTube, "Restricted" của Google Drive — Creator khóa lại link ĐÃ publish,
  cùng permalink đó chặn người xem ẩn danh (403) nhưng chủ sở hữu vẫn xem được qua chính
  link đó khi đăng nhập; chuyển qua lại được, link không đổi. **Đã chốt thêm 2 điểm
  (17/09/2026)**: Admin (system admin) LUÔN xem được sách Private của người khác, mỗi
  lần xem phải ghi `audit_logs` (không có ngoại lệ tuyệt đối); nếu vừa Private vừa có
  mật khẩu F05 thì Private ưu tiên cao nhất — chỉ owner/Admin xem được, mật khẩu vô hiệu
  lực trong lúc Private đang bật. Đã đủ rõ để thiết kế/ước lượng khi vào lịch, chi tiết
  đầy đủ ở PLAN.md mục 8.
- F17: tham khảo props/events/slot của `ts1/flipbook-vue` (MIT, đã tra license) để bổ
  sung zoom in/out cho reader hiện tại (`apps/web/src/components/FlipBook.tsx`, đang
  dùng `react-pageflip`) — KHÔNG chuyển sang flipbook-vue (khác framework, xem ADR
  P2-flip); chỉ lấy ý tưởng thiết kế API.

## P3 — Quản lý xuất bản (mật khẩu F05, replace/rollback F07, chia sẻ F08, embed F09, download F11)
Đặt `/goal` tự làm nốt P3 sau khi khảo sát ROADMAP.md ("làm thật tâm đắc, không tự bịa kết quả
để bypass testcase" — nguyên văn chỉ đạo người dùng). Thứ tự làm theo đúng backlog ROADMAP.md:
protection end-to-end (F05) → replace/publish nguyên tử (F07) → download (F11) → embed/share
(F09/F08).

**F05 — Mật khẩu xem sách**: migration `infra/migrations/0007_book_password_protection.sql`
thêm `book_settings.failed_attempts`/`locked_until`; mở rộng `public_get_book` trả thêm
password_hash/access_epoch/failed_attempts/locked_until (SQL không gọi được argon2, nên chỉ
tầng Node mới so khớp được — hàm SQL chỉ cung cấp dữ liệu, không tự chặn nữa); thêm hàm
`public_record_password_attempt` (tăng/reset đếm sai, tự khóa khi chạm ngưỡng) và
`public_get_source_pdf` (F11). BE (`public-books.controller.ts`) dùng lại `argon2` (đã có sẵn
từ auth Creator/Admin) để hash/verify, và một "book access token" là JWT riêng ký bằng
`JwtService` có sẵn (khác JWT đăng nhập, phân biệt bằng claim `typ:"book_access"` + `bookId` +
`accessEpoch`) — cấp qua `POST /public/books/:permalink/verify-password` sau khi nhập đúng, hết
hạn sau `BOOK_ACCESS_TOKEN_TTL_SECONDS` (mặc định 12h). Đổi/xóa mật khẩu tăng `access_epoch` ->
token cũ tự động vô hiệu ngay, không cần danh sách đen riêng. Khóa tạm thời sau
`BOOK_PASSWORD_MAX_ATTEMPTS` lần sai liên tiếp (mặc định 8) trong `BOOK_PASSWORD_LOCKOUT_MINUTES`
phút (mặc định 15) — kiểm tra khóa TRƯỚC cả khi so khớp mật khẩu, nên nhập đúng trong lúc đang
khóa vẫn bị từ chối (không có đường lách khóa bằng mật khẩu đúng). **Giới hạn đã biết, không tự
nhận là chống brute-force cấp doanh nghiệp**: khóa theo TỪNG SÁCH (không theo IP), nên một kẻ cố
tình có thể chủ động khóa link của chính chủ sở hữu bằng cách nhập sai liên tục — đánh đổi chấp
nhận được ở quy mô pilot, giống model "mật khẩu bài viết" của WordPress, không hứa là DRM (đúng
tinh thần PLAN.md mục 7 "không quảng bá như DRM").

FE: `apps/web/src/components/PublicBookReader.tsx` (logic dùng chung cho `/read/:permalink` và
`/read/:permalink/embed` — tách ra vì cả 2 đường đều phải giữ đúng gate mật khẩu, không lặp code
2 lần) xử lý 403 `{passwordRequired:true}` (mở rộng `ApiError` ở `lib/api.ts` để giữ nguyên body
JSON lỗi, không chỉ message string) bằng form nhập mật khẩu; token lưu `sessionStorage` (mất khi
đóng tab, đúng ý "phải nhập lại mỗi phiên" hơn `localStorage` vĩnh viễn), gắn vào request JSON
qua header `Authorization`, gắn vào `<img>`/`<a>` (không set được header tùy ý) qua query
`?token=`. Dashboard (`dashboard/books/[id]/page.tsx`) có UI đặt/đổi/xóa mật khẩu qua
`PUT /books/:id/settings` (DTO `password`/`removePassword` mới).

**Đã kiểm thử THẬT (không suy diễn)**: bộ test tích hợp mới `tests/integration/p3_e2e.test.js`
(33/33 PASS, gọi HTTP thật vào API đang chạy) phủ: xem trước khi đặt mật khẩu, chặn 403 sau khi
đặt, sai mật khẩu, đúng mật khẩu nhận token, token dùng qua cả header lẫn query, ảnh trang bị
chặn nếu không token, đổi mật khẩu vô hiệu token cũ ngay, khóa sau đủ số lần sai, mật khẩu đúng
KHÔNG bypass được khi đang khóa, xóa mật khẩu trả về công khai. Ngoài ra đã tự tay kiểm thử qua
Claude Browser trên Docker thật (không phải mock): đăng nhập Creator qua UI, đặt mật khẩu qua
dashboard, mở `/read/:permalink` ở tab ẩn danh khác thấy đúng form khóa, nhập sai thấy đúng
thông báo "còn N lần thử", nhập đúng vào xem được sách, network tab xác nhận ảnh trang tải qua
`?token=` thành công, xóa mật khẩu qua UI thấy sách công khai lại ngay.

**F11 — Tải PDF gốc**: route mới `GET /public/books/:permalink/download`, kiểm tra CẢ hai tầng
(TypeScript VÀ hàm SQL `public_get_source_pdf` đều tự kiểm `allow_download=true`, giống nguyên
tắc phòng vệ 2 lớp của `0006_public_reader.sql`) — nếu 1 tầng có bug, tầng kia vẫn chặn. Cũng đi
qua đúng gate mật khẩu F05 (sách có mật khẩu thì tải xuống cũng cần token hợp lệ). FE: nút tải
(`⇩`) trong `FlipBook.tsx` chỉ hiện khi `allowDownload=true`, dùng `<a href download>` (không
fetch/blob) để trình duyệt tự xử lý `Content-Disposition` chuẩn. Đã kiểm thử thật: script P3 xác
nhận byte đầu file đúng chữ ký `%PDF-` và có header `Content-Disposition: attachment`; qua Claude
Browser xác nhận `fetch()` tới đúng URL (kèm token khi cần) trả về 200/`application/pdf`/đúng
kích thước file gốc.

**F07 — Replace PDF / publish nguyên tử / rollback**: khảo sát code trước khi làm mới phát hiện
model dữ liệu (`revisions` + `books.published_revision_id`) VÀ luồng upload/publish sẵn có từ P2
ĐÃ đáp ứng gần hết yêu cầu ROADMAP.md ("tạo revision mới, preview, publish nguyên tử; giữ book
ID/permalink/cấu hình; lỗi vẫn đọc được revision cũ") mà không cần sửa gì — publish 1 lần
UPDATE duy nhất, thất bại (vd revisionId sai) không đụng tới `published_revision_id` hiện tại;
"rollback" chỉ đơn giản là publish lại một revisionId CŨ (dashboard vẫn hiện nút Publish cho mọi
revision `ready`, kể cả bản cũ hơn bản đang publish). Vì vậy phần việc thật sự của F07 lần này là
XÁC MINH bằng test thật, không phải viết code mới — bổ sung vào `p3_e2e.test.js`: upload+publish
v2 đè lên v1 (permalink không đổi, nội dung reader đổi đúng sang v2), rồi publish lại v1
(rollback thật, không tạo revision mới) xác nhận permalink/nội dung quay lại đúng v1, và publish
1 revisionId không tồn tại xác nhận KHÔNG làm hỏng revision đang publish. Không sửa UI thêm vì
đã đủ rõ (nút Publish disable đúng khi là revision đang active).

**F09 — Embed iframe**: route mới `apps/web/src/app/read/[permalink]/embed/page.tsx`, dùng
chung `PublicBookReader` (KHÔNG bớt gate mật khẩu như PLAN.md yêu cầu "giữ đầy đủ mật
khẩu/quyền") — đã tự kiểm thử qua Claude Browser: mở `/embed` ở tab hoàn toàn mới (không có
token trong sessionStorage) VẪN thấy đúng form khóa mật khẩu, không lộ nội dung qua "cửa sau"
embed. Dashboard sinh sẵn đoạn mã `<iframe>` (responsive, `aspect-ratio` xấp xỉ, không kích
thước cứng) kèm nút sao chép. **Chưa kiểm thử**: nhúng thật vào một trang HTML/site khác để xem
layout khi ở trong iframe của bên thứ ba (chỉ xác nhận route `/embed` tự nó chạy đúng, không lồng
thử trong iframe thật).

**F08 — Chia sẻ mạng xã hội + Open Graph**: `FlipBook.tsx` thêm nút chia sẻ (sao chép link,
Facebook, LinkedIn, và `navigator.share` khi trình duyệt hỗ trợ) — đúng PLAN.md mục 5 ("mở giao
diện chia sẻ của nền tảng, không tự nhận đã đăng"). Đã chuyển `read/[permalink]/page.tsx` từ
Client Component sang Server Component (`generateMetadata` async) để Open Graph render
SERVER-SIDE thật (PLAN.md mục 5: "để bot đọc được") — xác minh bằng `curl` HTML trả về từ server
(không phải đọc DOM sau khi JS chạy), thấy đúng `<title>`/`og:title`/`og:description`/`og:image`
cho sách công khai, và tự động rơi về tiêu đề chung "MISA Flipbook" (không lộ tên/ảnh sách) khi
sách có mật khẩu — đúng yêu cầu PLAN.md "mặc định hiển thị tên ứng dụng/ảnh chung" cho sách có
mật khẩu, đạt được TỰ NHIÊN vì fetch phía server dùng đúng API đã có gate mật khẩu, không cần
thêm logic riêng. Phát sinh 1 chi tiết hạ tầng thật (không phải suy đoán): code server-side chạy
TRONG container `web`, không gọi được `localhost:3000` như trình duyệt (đó là port của chính
container `web`, không phải `api`) — phải thêm biến môi trường runtime `API_INTERNAL_BASE_URL`
(`http://api:3000`, DNS nội bộ Docker Compose) riêng cho fetch phía server, khác hẳn
`NEXT_PUBLIC_API_BASE_URL` (URL cho trình duyệt) đã có từ trước; đã tự kiểm bằng `curl` sau khi
rebuild thấy hoạt động đúng, KHÔNG chỉ giả định là chạy được.
**Chưa làm** (giới hạn còn mở, ghi rõ để không nhận vơ đã xong): cột `book_settings.public_preview`
(có sẵn từ schema P1, chưa dùng ở đâu) đáng ra dùng để Creator chủ động "cho phép lộ tiêu đề/ảnh"
cho sách có mật khẩu (PLAN.md mục 5) — hiện sách có mật khẩu LUÔN rơi về tiêu đề chung, chưa có
đường để Creator bật lộ thông tin có kiểm soát; đây là backlog riêng, chưa nằm trong yêu cầu P3
lần này (P3 chỉ yêu cầu mặc định an toàn, không yêu cầu cơ chế bật lộ). `navigator.share` chỉ xác
nhận ĐÚNG LOGIC hiển thị có điều kiện (ẩn nút khi API không tồn tại) qua browser pane — pane dùng
để test không có `navigator.share` nên chưa tự tay bấm thử share sheet thật trên thiết bị có hỗ
trợ. Nút "Sao chép link" bị `NotAllowedError: Write permission denied` khi bấm qua Claude Browser
(quyền clipboard bị chặn ở tầng tự động hoá của công cụ, không phải lỗi code — đã xác nhận bằng
`navigator.clipboard.writeText` ném lỗi y hệt khi gọi trực tiếp qua console) — đã xác nhận ĐƯỜNG
LỖI dự phòng hoạt động đúng (hiện thông báo "Khong sao chep duoc..." thay vì crash), nhưng chưa
xác nhận đường THÀNH CÔNG thật trong một phiên trình duyệt bình thường có quyền clipboard.

Sau P3: CORS API thêm `exposedHeaders: ["Content-Disposition"]` (main.ts) — chi tiết nhỏ nhưng
đúng chuẩn cho endpoint download, không ảnh hưởng hành vi hiện tại vì FE dùng `<a download>`
(điều hướng, không `fetch()`) nên không phụ thuộc JS đọc được header này.

Đã chạy lại TOÀN BỘ 4 bộ test tích hợp sau cùng một lượt (không chỉ bộ mới) để xác nhận không hồi
quy: `tenant_isolation.test.js` 13/13, `api_e2e.test.js` 14/14, `p2_e2e.test.js` 16/16,
`p3_e2e.test.js` 33/33 — tổng 76/76 PASS, chạy thật trên Docker (`docker compose build api web`
rồi `up -d`), không phải chạy trên máy dev khác biệt với môi trường publish.

Chưa bắt đầu: P4-P6, Git tag bản stable, và F15/F16/F17 (backlog PLAN.md mục 8, còn nguyên trạng
thái mở như đã ghi ở lần cập nhật trước).
Điểm stable gần nhất: chưa có (P1+P2+P3 xong nhưng chưa cắt tag).
Handoff tài liệu: PLANNING-001 (draft); không coi là phần mềm có thể rollback.
Bước tiếp theo: P4 theo ROADMAP.md (hyperlink hoàn chỉnh, media trong phạm vi PoC, GA4, dashboard
Admin) — hoặc đóng public_preview/F15/F16/F17 nếu người dùng muốn xử lý backlog trước. Test tự
động cho FE (Playwright) vẫn đáng cân nhắc trước khi vào P4 (nhiều tương tác client hơn: overlay
hyperlink, media, zoom F17).

## Redesign UI: i18n (next-intl) + Xoăn Design System (XDS) + mobile-native (2026-09-17)

Yêu cầu người dùng: (1) toàn bộ text UI phải là tiếng Việt có dấu chuẩn UTF-8 (trước đó 100%
string trong `apps/web` viết ASCII không dấu kiểu "Dang nhap"); (2) thêm i18n, dựng sẵn chuyển
ngữ Việt/Anh tự động; (3) làm lại UI theo skill Xoăn Design System; (4) mobile phải như native
app thật cho cả 6 màn hình, không phải responsive co giãn từ desktop. Kế hoạch đầy đủ ở
`C:\Users\A04-0035\.claude\plans\lazy-sprouting-scroll.md`.

**i18n**: `next-intl@^4.14.5` (bump tu ^3.26 vi peerDependencies cua v3 chi ho tro toi
next@15, repo nay pin next@16.3.5). Chon co tinh: **khong tien to URL** — locale doc/ghi qua
cookie (`locale=vi|en`), khong dung routing `[locale]`, de permalink `/read/:permalink` (F02)
khong doi cau truc theo ngon ngu. Catalog day du o `apps/web/messages/{vi,en}.json`, chia theo
namespace (common/auth/dashboard/bookDetail/reader). Doi ngon ngu qua dialog Cai dat (icon gear
tren header/top bar) → set cookie + `router.refresh()`, KHONG doi URL — da tu kiem chung that:
bam doi Viet→Anh tren dialog Cai dat, toan bo label doi dung ngay, `location.href` (kiem qua
`javascript_tool`) khong doi mot ky tu nao.

**XDS**: `apps/web` la React/Next.js (khong phai Vue 3) nen ap dung dung "Uu tien 2" bat buoc
cua skill: doc truc tiep tung file `.vue` goc trong `ui/components/` (khong doan tu anh chup)
roi viet lai bang React, giu nguyen class Tailwind/token. Da port ~13 component
(`apps/web/src/components/xds/`): XButton, XInput, XTextarea, XCheckbox, XSwitch, XTag,
XProgress, XEmptyState, XDialog, XToast(+Provider/hook), XDropdownMenu (rut gon), XHeaderBar,
XSettingsDialog, XIcon (Tabler, stroke 1.5, khong inline SVG rai rac). Token/theme
(`tokens.css`, `theme-blue.css`) va font Inter chep NGUYEN VAN tu skill vao
`apps/web/src/styles/xds/`, khong tu khai bao bien `--xds-*` song song. Da xoa sach class CSS
chet cu (`.btn/.card/.field/.badge/.book-tile`...) khoi `globals.css` sau khi xac nhan qua
`Grep` khong con noi nao dung.

**Mobile-native (ca 6 man hinh)**: moi trang render 2 cay JSX rieng (`hidden md:flex` desktop /
`flex md:hidden` mobile voi class `.xds-mobile-app`), chuyen thuan Tailwind breakpoint
`md:` (768px) — khong dung JS/media-query hook (tranh hydration mismatch/flicker). Mobile dung
top bar rieng 56px + safe-area, danh sach hang phang (khong phai luoi the shrink tu desktop),
touch target ≥48px qua `.xds-mobile-app` co san trong `tokens.css` cua skill. Da tu kiem chung
qua Browser pane emulate 375×812 tren dashboard + book-detail: xac nhan dung top bar/FAB/hang
phang, KHONG phai ban desktop co lai.

**2 bug thật phát hiện và sửa khi tự kiểm tay (không chỉ đọc code)**:
1. **Hydration mismatch toàn app** (`Minified React error #418` mọi trang) — root cause:
   `XToast.tsx` (component gắn ở `RootLayout`, nên chạy trên MỌI trang) kiểm tra
   `typeof document !== "undefined"` trực tiếp trong JSX để quyết định có `createPortal` hay
   không; do `document` luôn tồn tại ngay ở lần render đầu tiên trên client (khác server, nơi
   `document` không tồn tại khi SSR) nên cây client lệch cây server ngay từ đầu — không phải do
   `preview`/`window.location.origin` như nghi ngờ ban đầu. Phát hiện bằng cách chạy tạm
   `next dev` (port 3055, ngoài Docker) để lấy overlay lỗi KHÔNG bị minify, overlay chỉ thẳng
   dòng `XToast.tsx:50` và component nghi phạm. Sửa bằng pattern chuẩn: thêm state
   `mounted` (`useState(false)` + `useEffect(() => setMounted(true), [])`) thay cho kiểm tra
   `typeof document` trực tiếp trong JSX — đã rebuild Docker image thật, xác nhận lại bằng tab
   trình duyệt SẠCH (chưa từng nạp trang) thấy "No console logs", và xác nhận publish thật
   (nhánh code trước đó chưa test tới, dùng `window.location.origin`) cũng không còn lỗi.
2. **Thông báo "Đã sao chép link!" trong menu Chia sẻ của reader không bao giờ hiện được** —
   `XDropdownMenu` luôn đóng dropdown ngay sau khi chọn 1 mục (`onSelect?.(); setOpen(false);`),
   trong khi `FlipBook.tsx` bản port đầu tiên hiển thị thông báo copy qua prop `extra` bên
   TRONG chính dropdown đó → dropdown đóng tức thì, thông báo không kịp hiện. Sửa bằng cách bỏ
   state `copyNotice`/prop `extra` (đã xoá luôn khỏi `XDropdownMenu.tsx` vì hết chỗ dùng), gọi
   `useToast()` (hệ thống toast chung của app) từ `copyShareLink()` — đã tự bấm "Sao chép link"
   thật trên public reader (sách demo có mật khẩu, đã unlock), xác nhận toast xanh "Đã sao chép
   link!" hiện đúng góc trên phải.

**Đã tự kiểm tay qua Docker thật + Browser pane** (không chỉ đọc code): tạo tenant/user/book
QA tạm qua SQL (argon2 hash sinh từ chính container `api`), login qua UI thật; publish sách
(dialog xác nhận → publish → status đổi `published`, public link hiện đúng); đặt mật khẩu xem
sách (toast "Đã đặt mật khẩu xem sách." hiện đúng, nút đổi thành "Đổi mật khẩu"/"Bỏ mật khẩu");
public reader unlock đúng mật khẩu, xem được nội dung PDF thật (ảnh trang render đúng — xác
nhận luôn nghi vấn "thumbnail xem trước bị trắng" trước đó chỉ là hệ quả của bug hydration #1,
không phải bug ảnh); menu Chia sẻ (Sao chép link/Facebook/LinkedIn, ẩn đúng mục "chia sẻ qua
thiết bị" vì `navigator.share` không có trên desktop browser pane); đổi ngôn ngữ Việt↔Anh trên
dialog Cài đặt, xác nhận URL không đổi; mobile 375×812 cho dashboard + book-detail. Đã dọn
fixture QA tạm (tenant/user/book) bằng SQL theo đúng thứ tự FK-safe đã dùng ở P3.

**Chưa kiểm chứng / giới hạn còn mở (ghi rõ, không nhận vơ)**:
- Chưa tự bấm "Choose File" thật qua OS file picker (Browser pane dùng trong phiên này không
  có action upload file) — luồng upload đã xác nhận qua `curl` multipart thẳng vào API (cùng
  JWT/tenant với UI), tức là xác nhận được job/convert/preview nhưng KHÔNG xác nhận thao tác
  click-mở-file-dialog thật.
- Chưa tự bấm nút Xuất bản/Cài đặt/Chia sẻ trên viewport mobile (375×812) — chỉ mới xem layout,
  chưa test tương tác thật ở kích thước mobile (chỉ test tương tác ở desktop + xem layout ở
  mobile riêng).
- `XDropdownMenu.tsx` là bản port RÚT GỌN của `XDropdownMenu.vue`: bỏ điều hướng bàn phím mũi
  tên/active-item highlight đầy đủ của bản gốc, chỉ giữ định vị theo activator, đóng khi click
  ngoài/Esc.
- `XHeaderBar.tsx` mặc định `showSearch=false` (ẩn hẳn ô tìm kiếm) khác bản gốc Vue
  (`default: true`) vì app hiện chưa có nhu cầu tìm kiếm xuyên sách.
- Icon Facebook/LinkedIn trong menu chia sẻ dùng icon Tabler trung tính (`share`/`external-link`)
  + nhãn chữ, KHÔNG phải logo thương hiệu thật — vì bộ icon XDS core không có icon mạng xã hội
  và luật "chỉ Tabler, không trộn nguồn SVG khác" là bắt buộc.
- Không có icon globe/ngôn ngữ riêng trên header (bộ icon XDS không có) → gộp chọn ngôn ngữ vào
  dialog Cài đặt mở từ nút Settings, đúng tinh thần header tối giản của XDS (chỉ Settings +
  Avatar ở cụm phải) nhưng khác với cách một số app khác đặt icon globe riêng.
- Chưa test Reader/embed ở goc do (landscape) hoac man hinh rat nho (<360px).

Đã chạy lại TOÀN BỘ 4 bộ test tích hợp (không đổi BE trong đợt này) để xác nhận không hồi quy:
`tenant_isolation.test.js` 13/13, `api_e2e.test.js` 14/14, `p2_e2e.test.js` 16/16,
`p3_e2e.test.js` 33/33 — tổng 76/76 PASS, chạy that tren Docker sau khi rebuild image `web`.

Bước tiếp theo: hỏi người dùng có muốn commit (kèm cả phần P3 trước đó, cũng chưa commit) hay
không; nếu tiếp tục, cân nhắc test tương tác thật trên mobile viewport và luồng upload qua
Claude-in-Chrome (có action file_upload) thay vì chỉ curl.

## F16 — Công tắc Publish/Private trên sách đã publish (2026-09-17)

Dọn backlog nhỏ (F15/F16/F17, cùng nhóm "quản lý xuất bản" với P3) theo chỉ đạo người dùng,
làm F16 trước vì đã chốt đủ spec từ trước (17/09/2026), F15 cần hỏi thêm, F17 cần khảo sát.

**Thiết kế (đã chốt với người dùng trước đó, không đổi):**
- `visibility` ('public'|'private', mặc định 'public') là cột mới trên `book_settings`,
  khác `books.status` (draft/published...).
- Private là lớp chặn CAO NHẤT: chỉ owner + Admin hệ thống xem được qua CHÍNH permalink cũ.
  Mật khẩu F05 (nếu có) bị bỏ qua/vô hiệu lực trong lúc Private đang bật — không cộng dồn
  2 lớp bảo vệ.
- Admin luôn xem được sách Private của người khác, nhưng MỌI LẦN xem phải ghi `audit_logs`
  (`action='view_private_book_as_admin'`), không có ngoại lệ.

**Backend** (`infra/migrations/0008_book_visibility.sql`,
`apps/api/src/modules/books/{books.controller.ts,dto/update-book-settings.dto.ts}`,
`apps/api/src/modules/public/public-books.controller.ts`):
- `public_get_book` đổi kiểu trả về (thêm `owner_id`/`visibility`) nên phải `DROP FUNCTION`
  trước khi `CREATE FUNCTION` (Postgres không đổi được OUT params bằng `CREATE OR REPLACE`).
  Áp dụng migration qua đúng service `migrate` (transaction + rollback tự động) — có 1 lần
  chạy tay bằng `psql` trực tiếp làm dở dang state (autocommit, không rollback được), đã phải
  revert tay rồi áp dụng lại đúng cách qua `migrate`.
- `auth_lookup_user_by_id` (SECURITY DEFINER) tra `is_system_admin`/`status` theo ID cho route
  công khai (không có `app.user_id` trong session vì không qua `DbContextInterceptor`).
- `public_record_admin_private_view` (SECURITY DEFINER) ghi audit log, bỏ qua RLS vì route
  công khai không có transaction để `SET LOCAL app.user_id` trước khi insert.
- `resolveActor(token)` trong `public-books.controller.ts` phân biệt JWT đăng nhập thường
  (`{sub, email}`) với JWT truy cập sách theo mật khẩu (`{typ: "book_access", ...}`) bằng
  hình dạng payload, cùng secret/`JwtService` — không dùng secret riêng.

Test tích hợp mới `tests/integration/f16_visibility.test.js`: 12/12 PASS thật trên Docker
(gọi HTTP thật + query Postgres trực tiếp bằng `misa_admin` để xác nhận đúng 1 dòng
`audit_logs` mỗi lần Admin xem sách Private của người khác). 3 bộ test cũ
(`api_e2e` 14/14, `p2_e2e` 16/16, `p3_e2e` 33/33) chạy lại không hồi quy.

**Frontend** (`apps/web/src/{lib/types.ts, app/dashboard/books/[id]/page.tsx,
components/PublicBookReader.tsx}`, `apps/web/messages/{vi,en}.json`):
- Trang chi tiết sách: thêm khối "Chế độ hiển thị" (chỉ hiện khi `book.status === "published"`)
  với `XSwitch` bật/tắt Private + note text đổi theo trạng thái + toast xác nhận.
- `PublicBookReader.tsx`: khi gặp 403 `{privateBook: true}`, thử lại 1 lần bằng JWT đăng nhập
  thường lấy từ `getToken()` (`@/lib/auth`, localStorage) nếu có và chưa thử — để owner/admin
  đang đăng nhập trên CHÍNH trình duyệt đó vẫn xem được qua permalink công khai bình thường,
  không cần link riêng. Nếu vẫn 403 hoặc không có token đăng nhập, hiện khối "Sách này đang ở
  chế độ riêng tư" (không phải khối nhập mật khẩu).
- Đã build+rebuild Docker image `web` sạch (`tsc`/Next build không lỗi), test tay qua Claude
  Browser trên Docker thật: tạo sách, upload, publish qua API (upload multipart qua UI chưa hỗ
  trợ trong Claude Browser hiện tại — dùng curl với path kiểu Windows vì `curl.exe` trên
  Git Bash không đọc được path `/c/...`), bật Private trên UI → tab ẩn danh (đã tự
  `localStorage.clear()` để mô phỏng đúng người lạ, vì tab mới trong cùng browser vẫn chia sẻ
  localStorage với tab đã đăng nhập) bị chặn đúng cả tiếng Việt lẫn tiếng Anh, tắt Private lại
  → tab ẩn danh xem lại được ngay, không đổi permalink.

Bước tiếp theo (theo đúng chỉ đạo dọn backlog rồi làm P4): F17 (khảo sát xong, chưa code) rồi
F15 (cần hỏi người dùng phạm vi ảnh nền trước khi làm), sau đó P4.

## F17 — Zoom in/out cho reader (2026-09-17)

Tham khảo ý tưởng API zoom của `flipbook-vue` (KHÔNG dùng thư viện đó - Vue, không tương
thích React/Next.js) chỉ để xác nhận đây là tính năng hợp lý cần có; tự thiết kế lại bằng
CSS transform vì `react-pageflip`/StPageFlip (bọc `page-flip`) không hỗ trợ zoom sẵn - đã
đọc hết `node_modules/react-pageflip/build/settings.d.ts` (interface `FlipSetting`) để xác
nhận trước khi tự làm thêm, không suy đoán.

**Thiết kế** (`apps/web/src/components/FlipBook.tsx`, `apps/web/src/app/globals.css`):
- 2 nút zoom-in/zoom-out (icon Tabler mới thêm vào `xds/icons/paths.ts`, lấy path gốc từ
  `@tabler/icons-react` cài tạm rồi gỡ ngay, không thêm dependency thật) trong `reader-top-right`,
  mức zoom 1x→2.5x, bước 0.5, nút tự vô hiệu hóa ở 2 đầu.
- Zoom dùng CSS `transform: translate() scale()` áp thẳng vào root element của
  `HTMLFlipBook` qua prop `style` (đọc `node_modules/react-pageflip/build/index.js` xác
  nhận `props.style` gán thẳng vào div gốc mà StPageFlip quản lý) — transform không đổi
  `offsetWidth/clientWidth` nên KHÔNG kích hoạt lại logic đo kích thước "stretch" nội bộ
  của thư viện, an toàn với cơ chế size hiện có.
- Pan (kéo di chuyển) khi đang zoom qua pointer events tự viết trên `.reader-stage`, giới
  hạn (clamp) theo `containerSize * (zoom-1)/2` để không kéo trống ra ngoài.
- **Phát hiện quan trọng khi đọc `build/index.js`**: `PageFlip` chỉ được `new` 1 LẦN DUY
  NHẤT lúc mount (settings đông cứng từ lúc khởi tạo) - đổi prop `useMouseEvents` sau đó
  KHÔNG có tác dụng (khác với những gì code cũ ngầm giả định). Vì vậy phải thêm `isZoomed`
  vào `key` của `HTMLFlipBook` để ép remount hoàn toàn mỗi khi bật/tắt zoom, đảm bảo
  `useMouseEvents={!simple && !isZoomed}` được áp dụng đúng lúc khởi tạo lại (tắt hẳn
  kéo-để-lật-trang của thư viện trong lúc đang zoom, tránh xung đột với pan tự viết).
  `startPage={currentIndex}` giữ nguyên vị trí đọc qua lần remount, giống cách xử lý
  `usePortrait` đã có từ trước.

**Đã tự kiểm chứng thật trên trình duyệt** (Docker thật, không chỉ đọc code): zoom-in/out
đổi đúng mức 1→1.5→2→2.5, nút vô hiệu hóa đúng 2 đầu; pan kéo được nội dung đã zoom về lại
khung nhìn, có giới hạn (không kéo trống); zoom-out về 1 tự reset pan về (0,0). Có 1 lần
đầu nghi ngờ nhầm là "zoom không hiển thị" do ảnh chụp màn hình không cập nhật ngay sau
thao tác click (registry/refresh chậm của công cụ trình duyệt, không phải lỗi code) -
đã xác nhận lại bằng cách đo trực tiếp `getBoundingClientRect`/`getComputedStyle` và chụp
lại sau một sự kiện layout khác (đổi kích thước khung xem), thấy đúng nội dung phóng to +
bị cắt theo đúng toán học của `transform-origin: center center`, sau đó pan kéo về đúng
như kỳ vọng. Build Docker `web` sạch (`tsc`/Next build không lỗi).

**Giới hạn còn biết**: `transform-origin: center center` canh theo tâm hình học của
CONTAINER spread (kể cả khi chỉ hiện 1 trang bìa đơn lẻ chiếm nửa bên phải) chứ không phải
tâm của chính trang đang hiển thị - nghĩa là khi zoom trang bìa đầu/cuối (hiển thị lệch
sang 1 bên), ảnh có thể bị đẩy nhiều hơn dự kiến ra khỏi khung nhìn ngay lần zoom đầu tiên,
cần kéo (pan) để đưa lại vào giữa; các trang spread bình thường (2 trang) thì cân đối,
không bị lệch. Chưa tối ưu riêng cho 2 trang bìa - ghi nhận là giới hạn mở, chưa phải yêu
cầu bắt buộc ban đầu.

## F15 — Ảnh nền cho khung đọc (2026-09-17)

Người dùng làm rõ phạm vi khi được hỏi (đã trả lời trực tiếp bằng chữ, không qua nút chọn):
*"Ý tôi phần nền là nền để đặt cuốn sách lên ấy chứ không phải là nền của từng trang sách.
Nội dung, hình ảnh, nền của từng trang sách nó nằm trong file PDF người dùng đã upload lên
rồi. Mình làm hệ thống thôi mà."* → xác nhận đúng phương án "nền toàn khung đọc" (không
phải nền riêng từng trang PDF, vì nội dung/nền từng trang đã nằm sẵn trong PDF).

**Thiết kế**: 1 ảnh nền/sách, lưu trực tiếp trong `book_settings` (KHÔNG dùng bảng `assets`
vì `assets.revision_id` đang `NOT NULL` + `kind` bị CHECK giới hạn 4 giá trị cố định - ảnh
nền không gắn với revision nào, tách riêng đơn giản và an toàn hơn là nới lỏng ràng buộc
của `assets`). Đã đọc code trước khi thiết kế (qua agent Explore) để xác nhận đúng hạ tầng
storage/asset hiện có, tránh đoán.

- `infra/migrations/0009_book_background.sql`: thêm `book_settings.background_object_key`/
  `background_content_type`; cập nhật lại `public_get_book()` (DROP+CREATE, cùng lý do đổi
  kiểu trả về như 0008) để trả thêm 2 cột này cho route công khai tự quyết định.
- `apps/api/src/modules/books/books.controller.ts`: thêm `POST :id/background` (multipart,
  giới hạn 8MB, tự kiểm chữ ký file PNG/JPEG/WebP bằng tay - không tin `Content-Type` client
  gửi lên, cùng triết lý với kiểm tra `%PDF-` của endpoint upload PDF), `GET :id/background`
  (xem trước cho chủ sở hữu), `DELETE :id/background` (xóa, chỉ NULL 2 cột trong DB - không
  xóa file vật lý, chấp nhận rác nhỏ vì ngoài phạm vi PoC). `getSettings`/`putSettings` thêm
  `has_background` (boolean suy ra, giống mẫu `has_password`, không lộ `object_key` nội bộ).
- `apps/api/src/modules/public/public-books.controller.ts`: `GET :permalink` trả thêm
  `hasBackground`; thêm `GET :permalink/background` dùng LẠI đúng `getAuthorizedBook()` (F16)
  nên tự động bị chặn giống hệt trang/tải xuống khi sách đang Private hoặc có mật khẩu -
  đã test tay xác nhận (bật Private thì gọi `/background` cũng nhận 403 `privateBook`).
- FE: `apps/web/src/app/dashboard/books/[id]/page.tsx` thêm khối "Background image" trong
  Cài đặt (input file thẳng + `AuthImage` xem trước + nút xóa, theo đúng pattern
  upload/preview đã có sẵn trong file, không tạo pattern mới); `FlipBook.tsx` nhận prop
  `backgroundUrl`, phủ lên `.reader` qua `backgroundImage` CSS kèm 1 lớp gradient đen mờ
  (`rgba(0,0,0,0.55)`) để chữ trắng ở top/bottom bar và trang PDF nền trắng vẫn đọc rõ.

**Đã test thật** (không chỉ đọc code): build `tsc`/Next sạch cho cả API và Web; áp dụng
migration qua đúng service `migrate` (nhớ rebuild image `migrate` trước khi `up` - lần đầu
quên rebuild nên bị "Khong co migration moi" sai, đã phát hiện và sửa ngay); chạy lại TOÀN
BỘ 5 bộ test tích hợp cũ, không hồi quy: `tenant_isolation` 13/13, `api_e2e` 14/14, `p2_e2e`
16/16, `p3_e2e` 33/33, `f16_visibility` 12/12 (tổng 88/88). Test tay qua curl: upload ảnh
PNG thật (tạo bằng script Python nhỏ) → `has_background=true`; endpoint public trả đúng
`hasBackground`/ảnh tải về đúng nội dung; bật Private → `/background` cũng 403 đúng như
`/assets` và trang; xóa ảnh nền → `has_background=false`; upload file giả (`.txt` đổi tên)
→ 400 đúng thông báo. Test tay qua Claude Browser trên Docker thật: dashboard hiển thị đúng
ảnh preview (màu xanh dương test), nút "Remove background"; reader công khai hiển thị đúng
ảnh nền phủ gradient tối phía sau khung flipbook, chữ/trang vẫn rõ.

## F10 Mức A — Hyperlink (URL ngoài + link nội bộ sang trang) trong flipbook (2026-09-17)

Bắt đầu P4 theo chỉ đạo "dọn backlog nhỏ (F15/F16/F17) xong thì làm tiếp P4". F10 chia 3 mức
theo PLAN.md mục 6: **Mức A** (bắt buộc v1) = hyperlink URL/mailto + link nội bộ sang trang,
đúng cả khi trang xoay/crop và cả 2 chế độ đơn/2 trang; **Mức B** (audio/video, có cổng kiểm
chứng) và **Mức C** (JS/Launch/Flash — không làm, phải báo rõ bị bỏ qua) chưa làm ở đợt này.

**Phát hiện khi đọc code trước khi sửa** (`services/pdf-worker/app/convert.py`,
`_extract_links()`): backend ĐÃ trích xuất link từ `/Annots` của PDF từ trước (qua pypdf),
phân loại đúng `external_uri`/`internal_goto`/`unsupported_action`, và `rect_norm` đã tính
đúng theo hướng xoay trang (`_normalize_rect`) — nhưng `internal_goto` luôn trả `target=None`
(chưa resolve tên đích/mảng `/Dest` ra số trang cụ thể — giới hạn đã ghi rõ từ thời P0 trong
ADR-P0-parser-renderer.md) và **frontend chưa render link nào cả** (`FlipBook.tsx` không hề
đọc `page.links`) dù dữ liệu đã có sẵn xuyên suốt manifest → API → `ReaderPage.links`.

**Việc đã làm:**
- `services/pdf-worker/app/convert.py`: thêm `_resolve_dest_page(reader, dest)` dùng đúng
  API có sẵn của pypdf 6.18 (`PdfReader.get_destination_page_number()` +
  `PdfReader._build_destination()` cho mảng `/Dest` trực tiếp, `PdfReader.named_destinations`
  cho tên đích) để quy đổi `/Dest` (trên annotation) hoặc `/D` (trong action `/GoTo`) ra số
  trang 1-based khớp với cách đánh số trang của manifest. Đã test trực tiếp bằng script Python
  nhỏ với `tests/fixtures/pdf/sample_vi_text.pdf` (file mẫu có sẵn, 5 trang, 1 link ngoài +
  1 link nội bộ về trang cuối) — link nội bộ resolve đúng ra `target=5`, không còn `null`.
- `apps/web/src/lib/types.ts`: `ReaderPage.links[].target` đổi từ `string | null` sang
  `string | number | null` (link ngoài trả URL dạng chuỗi, link nội bộ trả số trang).
- `apps/web/src/components/FlipBook.tsx`: `Page` nhận thêm `links`, `widthPt`/`heightPt`,
  `pageAspect` — tính `computeImageBox()` để quy đổi `rect_norm` (theo khung ảnh ĐÃ xoay,
  đúng như BE đã chuẩn hoá) ra vị trí % chính xác trên `.flipbook-page`, có xử lý letterbox
  vì tất cả các trang dùng chung 1 tỉ lệ khung `pageAspect` (lấy từ trang đầu) trong khi từng
  trang có thể lệch tỉ lệ/bị xoay riêng. Link `external_uri` render `<a target="_blank">`;
  `internal_goto` (đã resolve được số trang) render `<button>` gọi `pageFlip().flip(page-1)`
  (API `flip()` có sẵn của thư viện `page-flip`, xác nhận qua grep bundle vì không có file
  `.d.ts` — không đoán). Link chưa resolve được (`target=null`, gồm cả `unsupported_action`
  Mức C) KHÔNG render vùng bấm, không báo lỗi giữa chừng cho người đọc.
- `apps/web/src/app/globals.css`: `.flipbook-link-overlay` — vùng bấm trong suốt, chỉ lộ viền
  mờ trắng khi hover/focus (theo đúng tông màu tối có sẵn của khung reader, không chèn token
  XDS vào vùng `.reader-*`/`.flipbook-*` vốn đã dùng màu riêng từ P1/P2).

**Giới hạn còn mở, chưa xử lý**: link Mức A hiện chỉ phủ HTTP(S) URI + GoTo nội bộ; chưa lọc
riêng `mailto:` để xác thực định dạng (PLAN.md ghi "mailto đã xác thực" — hiện coi mailto như
1 `external_uri` bình thường, mở qua `<a href="mailto:...">`, CHƯA có bước validate cú pháp
email trước khi hiển thị link). Độ chính xác overlay cho trang bị xoay dựa trên giả định
pipeline render hiện có (pdfium + CSS `rotate()` trên `<img>`) đã hiển thị đúng hướng — chưa
tự kiểm tra bằng mắt overlay trên file `sample_rotated_mixed.pdf` cụ thể (mới test bằng mắt +
DOM với `sample_vi_text.pdf`, không xoay).

**Đã test thật**: rebuild lại 2 image Docker bắt buộc phải rebuild vì build-từ-source, không
mount volume (`pdf-worker`, `web`) rồi `docker compose up -d` lại; chạy lại TOÀN BỘ 5 bộ test
tích hợp cũ, không hồi quy (88/88: `tenant_isolation` 13/13, `api_e2e` 14/14, `p2_e2e` 16/16,
`p3_e2e` 33/33, `f16_visibility` 12/12). Tạo tenant/creator/sách test thật qua API, upload
`sample_vi_text.pdf`, publish, mở bằng Claude Browser (Docker thật, không phải chỉ đọc code):
xác nhận đúng 2 vùng overlay xuất hiện đúng vị trí (kiểm bằng `elementFromPoint` — overlay là
phần tử TRÊN CÙNG đúng tại toạ độ link thật, không bị StPageFlip che); nút link nội bộ bấm
xong thật sự nhảy sang "Page 4-5/5" (đúng trang cuối, xác nhận qua cả DOM text lẫn ảnh chụp
màn hình sau khi ép resize để trình duyệt vẽ lại — screenshot không tự refresh cho thay đổi
chỉ đổi state mà không kèm layout event, y hệt hiện tượng đã gặp khi test F17). Riêng việc
`target="_blank"` có mở tab mới thật hay không KHÔNG xác nhận được qua Claude Browser (trình
duyệt tự động của công cụ chặn popup dù click là thật, không phải lỗi code) — đã xác nhận
gián tiếp bằng `href`/thẻ `<a>` đúng chuẩn, hành vi mở tab mới là hành vi mặc định của trình
duyệt thật với `<a target="_blank">`, không cần code thêm.

## F06 — Google Analytics (GA4) cấp sách + mặc định tenant (2026-09-17)

Người dùng chọn "tạm hoãn F10 Mức B (audio/video), tập trung F06/F12/F13 trước" khi được
hỏi (thiếu PDF mẫu thật có audio/video — xem mục F10 Mức A ở trên). F06 làm theo đúng spec
PLAN.md dòng 17: "Nhập GA4 Measurement ID G-… ở cấp sách, có mặc định tenant; không nhận
JavaScript tùy ý".

**Phát hiện khi khảo sát trước khi sửa** (qua agent Explore, chỉ đọc code): cả 2 cột cần
dùng **đã có sẵn từ `0002_core_schema.sql`** (`tenants.default_ga_id`, `book_settings.ga_id`)
— chỉ chưa được API nào đọc/ghi tới. Không cần thêm cột mới, chỉ cần nối dây.

**Việc đã làm:**
- `infra/migrations/0010_book_ga4.sql`: đổi lại `public_get_book()` (DROP+CREATE, cùng lý do
  đổi kiểu trả về như 0008/0009) để trả thêm `ga_id` (sách) và `default_ga_id` (tenant, JOIN
  bảng `tenants`) cho route công khai tự tính "giá trị hiệu lực".
- `apps/api/.../dto/update-book-settings.dto.ts`: thêm `gaId?: string | null`, validate bằng
  `@Matches(/^G-[A-Z0-9]{4,20}$/)` (bỏ qua khi `null` qua `@ValidateIf`) — CHỈ nhận 1 chuỗi ID
  đúng định dạng, không có đường nào nhận JavaScript tùy ý.
- `apps/api/.../books.controller.ts` (`putSettings`): ghi `ga_id`, phân biệt đúng 3 trạng
  thái (không gửi field = giữ nguyên; gửi `null` = xóa riêng, quay lại dùng mặc định tenant;
  gửi chuỗi hợp lệ = đặt riêng).
- `apps/api/.../admin/admin.controller.ts`: thêm `PATCH /admin/tenants/:id` (DTO
  `UpdateTenantDto`, chỉ có `defaultGaId`) để Admin đặt mặc định GA4 cho cả tenant — trước đó
  KHÔNG có endpoint nào sửa được tenant sau khi tạo (chỉ có `POST /admin/tenants`).
- `apps/api/.../public/public-books.controller.ts`: `getBook()` trả thêm `gaId` = giá trị
  hiệu lực (`book.ga_id ?? tenant.default_ga_id ?? null`).
- FE: `PublicBookReader.tsx` thêm hook `useGoogleAnalytics(gaId)` — tự kiểm tra lại định dạng
  (phòng dữ liệu cũ/lỗi từ nguồn khác) rồi mới chèn đúng 2 thẻ `<script>` cố định của Google
  (`gtag.js` loader + đoạn init ngắn), KHÔNG bao giờ eval/render trực tiếp bất kỳ chuỗi nào
  khác từ dữ liệu sách. `dashboard/books/[id]/page.tsx` thêm khối "Google Analytics (GA4)"
  trong Cài đặt (input + nút Lưu, validate định dạng ở FE trước khi gọi API, giống pattern
  password/background đã có).

**Bug thật phát hiện qua test (không phải đoán trước)**: lúc đầu dùng
`Object.prototype.hasOwnProperty.call(dto, "gaId")` để phân biệt "không gửi field" và "gửi
null" — SAI, vì TS compile target `ES2022` khiến MỌI khai báo field trong class (kể cả
`gaId?: string`, không có initializer) tự động thành own-property `undefined` ngay khi tạo
instance (ngữ nghĩa `[[Define]]` của class field hiện đại) — `hasOwnProperty` trên instance
DTO luôn `true` bất kể client có gửi hay không, làm mọi lần PUT settings (kể cả chỉ đổi
`allowDownload`) đều xóa nhầm `ga_id` về null. Phát hiện qua 1 test thật (script gọi API 2
lần liên tiếp) chứ không phải đọc code đoán ra. **Sửa**: kiểm tra trên `req.body` THÔ (JSON
gốc Express nhận được) thay vì trên instance `dto` đã qua `class-transformer` — áp dụng cho
cả `books.controller.ts` và `admin.controller.ts` (cùng 1 lỗi tại 2 chỗ).

**Đã test thật**: rebuild bắt buộc 3 image build-từ-source (`migrate`, `api`, `web`); chạy
lại toàn bộ 5 bộ test tích hợp cũ, không hồi quy (88/88) — chạy 2 lần (trước và sau khi sửa
bug hasOwnProperty). Test API trực tiếp qua script Node thật (không phải chỉ đọc code): đặt
`default_ga_id` cho tenant qua `PATCH /admin/tenants/:id`, từ chối đúng định dạng sai (400),
đặt/xóa/giữ nguyên `ga_id` cấp sách qua 3 trạng thái nêu trên (7/7 assertion PASS sau khi
sửa bug). Test qua Claude Browser trên Docker thật: tạo sách, đặt GA4 qua API, publish, mở
`/read/:permalink` — xác nhận đúng 2 thẻ `<script>` gtag được chèn vào `<head>` với đúng ID
hiệu lực; đăng nhập dashboard thật, xác nhận input GA4 hiển thị đúng giá trị đã đặt, nhập sai
định dạng bị chặn bởi toast lỗi (không gọi API), sửa thành giá trị hợp lệ mới → lưu thành
công → mở lại reader xác nhận script gtag đã đổi đúng sang ID mới (vòng khép kín Dashboard
→ API → reader công khai).

**Giới hạn còn mở**: chưa có màn hình Admin (F13 chưa làm) để đặt `default_ga_id` qua UI —
hiện chỉ đặt được qua gọi API trực tiếp (`PATCH /admin/tenants/:id`), đúng như hiện trạng
chung của mọi thao tác admin khác trong dự án (chưa có FE admin nào, xem F13 trong ROADMAP).

## F12 — Bảng điều khiển Creator: danh sách/trạng thái/dung lượng/lượt mở-lượt xem/lọc (2026-09-17)

Tiếp tục theo chỉ đạo "F06/F12/F13" sau F06. F12 theo đúng spec PLAN.md: "Danh sách sách của
mình, trạng thái, dung lượng, lượt mở/lượt xem trang theo ngày, bộ lọc và thao tác quản lý".

**Phát hiện khi khảo sát trước khi sửa** (qua agent Explore, chỉ đọc code): bảng
`analytics_events`/`daily_stats` VÀ policy RLS tương ứng (`analytics_owner_all`,
`daily_stats_owner_all`, dùng hàm `is_own_book()` có sẵn) đã tồn tại từ schema P1, chưa ai
dùng tới — không cần migration mới cho phần đọc (creator query qua `req.dbClient` đã tự động
đi qua RLS đúng tenant/owner). Chỉ thiếu 1 hàm SECURITY DEFINER cho đường ghi công khai (không
đăng nhập) từ route `/public/books/:permalink`.

**Việc đã làm:**
- `infra/migrations/0011_book_analytics_events.sql`: hàm `public_record_book_event(book_id,
  tenant_id, revision_id, event_type)` — ghi 1 dòng `analytics_events` + upsert cộng dồn vào
  `daily_stats` (theo ngày hiện tại), `SECURITY DEFINER` + `REVOKE ALL ... GRANT EXECUTE TO
  app_user` giống đúng khuôn mẫu `public_get_book`/`public_record_admin_private_view` đã có.
- `apps/api/.../public/public-books.controller.ts`: `recordEvent()` gọi hàm trên, bọc try/catch
  nuốt lỗi (thống kê hỏng không được chặn người đọc) — gọi khi `GET :permalink` (event "open")
  và endpoint mới `POST :permalink/events` (`RecordBookEventDto`, chỉ nhận
  `eventType: "page_view"`, không nhận giá trị tuỳ ý khác).
- `apps/api/.../books.controller.ts`: mở rộng `BOOK_SELECT_COLUMNS` thêm `storage_bytes` (SUM
  `assets.bytes`), `opens_30d`/`page_views_30d` (SUM `daily_stats` 30 ngày gần nhất) cho từng
  sách trong danh sách của Creator; thêm `GET :id/stats?days=N` (mặc định 30, tối đa 90) trả
  mảng theo ngày từ `daily_stats` cho biểu đồ/bảng chi tiết.
- FE `FlipBook.tsx`: thêm `onPageChange` callback bắn theo mỗi lần `onFlip` đổi trang thật (so
  khớp `pages[e.data].page`, không đếm khi remount nội bộ do đổi zoom — dùng lại đúng cơ chế
  `key` remount đã có từ F17). `PublicBookReader.tsx`: `pingPageView()` — chặn ping trùng trang
  vừa ping (tránh đếm đúp khi remount), fire-and-forget `.catch(() => {})` giống triết lý F06.
- FE Dashboard: `apps/web/src/lib/format.ts` (`formatBytes`, KB/MB/GB làm tròn 1 số lẻ);
  `apps/web/src/components/xds/XSelect.tsx` — port React đầy đủ từ `XSelect.vue` (Ưu tiên 2
  theo skill XDS, không dùng `<select>` gốc): popover qua `createPortal`, điều hướng bàn phím
  đủ (mũi tên/Enter/Escape), đóng khi click ra ngoài, tự định vị lại khi cuộn/resize — dùng cho
  bộ lọc trạng thái trên `dashboard/page.tsx` (thêm cả ô tìm theo tiêu đề, `XEmptyState
  type="no-result"` khi lọc/tìm ra rỗng, phân biệt đúng với `type="initial"` đã có khi CHƯA có
  sách nào — soát lại `XEmptyState.tsx` trước khi dùng, tránh lặp lỗi đã gặp lúc đầu tự đoán
  `type="no-data"` không tồn tại). `dashboard/books/[id]/page.tsx` thêm card "Statistics":
  dung lượng + lượt mở/lượt xem 30 ngày + bảng chi tiết theo ngày (`GET :id/stats?days=7`).

**Bug thật phát hiện qua test (không phải đoán trước)**: bảng chi tiết theo ngày lúc đầu hiện
nguyên `stat_date` dạng `2026-09-17T00:00:00.000Z` (Postgres trả cột `date` qua node-postgres
thành chuỗi ISO datetime đầy đủ khi serialize JSON) thay vì chỉ ngày — phát hiện khi tự mở
trang chi tiết sách thật trên trình duyệt, không phải đọc code đoán ra. Sửa bằng
`d.stat_date.slice(0, 10)` ở FE, rebuild lại `web`, xác nhận lại hiển thị đúng `2026-09-17`.

**Đã test thật**: rebuild bắt buộc 3 image build-từ-source (`migrate`, `api`, `web`); áp dụng
migration 0011 qua `docker compose up -d migrate` (log xác nhận "Ap dung 0011... OK"); chạy
lại toàn bộ 5 bộ test tích hợp cũ, không hồi quy (88/88, chạy 2 lần — trước và sau khi sửa bug
định dạng ngày). Test qua Claude Browser trên Docker thật (không chỉ đọc code): tạo tenant +
gán quyền creator cho tài khoản admin có sẵn qua API thật (để có tài khoản đăng nhập thật, vì
repo chưa có tài khoản creator mẫu riêng cho việc test tay) — đăng nhập dashboard thật, thấy
đúng dung lượng/lượt mở từng sách trên danh sách (lấy từ dữ liệu thật đã có sẵn từ các đợt test
trước); dùng bộ lọc trạng thái (XSelect, mở đúng dropdown, chọn "Draft" lọc đúng) + ô tìm kiếm
theo tiêu đề (lọc đúng còn 1 kết quả), kết hợp lọc "Draft" + text không khớp → hiện đúng
`XEmptyState type="no-result"`; mở link công khai `/read/:permalink` của 1 sách, lật trang thật
bằng chuột — xác nhận qua `read_network_requests` có gọi `POST .../events` (201 Created) đúng
2 lần khi lật 2 lần; gọi lại `GET :id/stats` xác nhận `daily_stats` thật sự cộng dồn đúng
(`opens=2, page_views=2` khớp số lần mở/lật trang), rồi xác nhận card "Statistics" trên trang
chi tiết sách hiển thị đúng số liệu và bảng chi tiết theo ngày. Dọn sạch tenant/membership tạo
tạm cho việc test sau khi xong (không để lại rác trong DB).

**Giới hạn còn mở**: danh sách sách trong dashboard hiện lọc/tìm hoàn toàn ở phía client (đúng
quy mô PoC — 1 Creator không có hàng nghìn sách); "thao tác quản lý" trong spec PLAN.md hiện
mới có sẵn các nút quản lý đã có từ P3 (publish/rollback/xoá mật khẩu...) trên trang chi tiết
từng sách, CHƯA có thao tác hàng loạt (bulk action) trực tiếp trên danh sách — PLAN.md không
nêu rõ cần bulk action nên chưa tự thêm.

Bước tiếp theo: F13 (Bảng điều khiển Admin) — quản lý tenant, tài khoản, toàn bộ sách xuyên
tenant, job lỗi, dung lượng, thống kê, audit log — theo đúng chỉ đạo "F06/F12/F13" đã nhận.

## F13 — Bảng điều khiển Admin: tenant/tài khoản/sách/job lỗi/thống kê/audit log (2026-09-17)

Việc cuối cùng của chuỗi "F06/F12/F13" đã nhận. F13 theo đúng spec PLAN.md: "Quản lý
tenant, tài khoản, toàn bộ sách, job lỗi, dung lượng, thống kê và audit log".

**Phát hiện khi khảo sát trước khi sửa** (qua agent Explore, chỉ đọc code):
- Mọi bảng nghiệp vụ đều đã có policy RLS `*_admin_all` (bật khi `app.is_system_admin=true`,
  do `DbContextInterceptor` set sẵn) — tầng DB đã sẵn sàng cho Admin đọc/ghi xuyên tenant từ
  P1, chỉ thiếu tầng API (`admin.controller.ts` trước đó CHỈ có 4 endpoint POST/PATCH ghi dữ
  liệu, KHÔNG có endpoint GET nào để xem danh sách).
- `audit_logs` đã tồn tại và có đúng 1 nơi ghi (`public_record_admin_private_view` từ F16),
  nhưng chưa có cách nào XEM lại log này qua API.
- **Bug nghiêm trọng phát hiện qua khảo sát (chưa từng thấy trước đây)**: FE gọi `GET /me`
  lúc đăng nhập, nhận đúng `isSystemAdmin: true`, nhưng **bỏ qua hoàn toàn** giá trị này
  (`login/page.tsx` chỉ dùng `me.memberships`) — nghĩa là 1 tài khoản Admin thuần (không có
  membership tenant nào, như `admin@misa.local` có sẵn trong seed) **không đăng nhập được**
  vào bất kỳ đâu (bị chặn ở `errorNoTenant`), dù đây chính xác là kiểu tài khoản cần dùng
  màn Admin. Đây là bug chặn hoàn toàn F13 nếu không sửa trước.

**Việc đã làm:**
- **Sửa bug đăng nhập Admin** (`apps/web/src/app/login/page.tsx`): lưu `isSystemAdmin` qua
  `setIsAdmin()` (key mới `misa_flipbook_is_admin` trong `lib/auth.ts`, chỉ là tiện ích hiển
  thị điều hướng ở FE — mọi endpoint `/admin/*` vẫn tự `assertAdmin()` lại ở BE qua JWT+DB,
  không tin cờ này); nếu Admin có 0 membership → vào thẳng `/admin` thay vì báo lỗi. Thêm
  `useAdminSession()` (`lib/useSession.ts`) — chỉ cần token, không đòi `tenantId` như
  `useSession()` thường (Admin thuần có thể không thuộc tenant nào).
- **`apps/api/src/modules/admin/admin.controller.ts`**: thêm 6 endpoint GET mới xuyên tenant
  (không gắn `@RequireTenant()`, dựa hoàn toàn vào RLS `*_admin_all`): `GET tenants` (kèm số
  thành viên/sách/dung lượng mỗi tenant), `GET users` (kèm danh sách tenant đã tham gia qua
  `json_agg`), `GET books` (toàn bộ sách xuyên tenant, giới hạn 500 dòng cho quy mô PoC),
  `GET jobs?state=` (mặc định `failed`, hỗ trợ `all`), `GET stats` (số liệu tổng quan 1
  dòng), `GET audit-logs?limit=`. Thêm `PATCH users/:id/status` (khóa/mở tài khoản) và mở
  rộng `PATCH tenants/:id` thêm trường `status` (tạm ngưng/kích hoạt tenant) — cả 2 đều ghi
  `audit_logs` (action `user_status_change`/`tenant_status_change`, metadata `{from,to}`)
  khi trạng thái THỰC SỰ đổi, theo đúng mẫu `hasOwnProperty` trên `req.body` thô đã dùng ở
  F06 (phân biệt "không gửi field" vs "gửi giá trị mới").
- FE: trang mới `apps/web/src/app/admin/page.tsx` — 1 trang duy nhất, nhiều thẻ (card) xếp
  chồng (Tổng quan/Tenant/Tài khoản/Toàn bộ sách/Hàng đợi job/Audit log), theo đúng quy ước
  card đã dùng ở `dashboard/books/[id]/page.tsx` thay vì tách nhiều route con (quy mô dữ
  liệu quản trị không lớn, tách route sẽ tăng chi phí điều hướng không cần thiết). Dùng lại
  `XSelect` (bộ lọc job theo trạng thái) + `XInput` (tìm sách) đã port từ F12, `XDialog
  type="confirm"/"danger"` cho xác nhận tạm ngưng tenant/khóa tài khoản (tự ẩn nút thao tác
  với chính tài khoản Admin đang đăng nhập, tránh tự khóa mình). `AppHeader`/
  `MobileHeaderActions` thêm 1 mục "Admin dashboard" TRONG menu avatar có sẵn khi
  `isAdmin=true` — KHÔNG thêm icon riêng lên header (đúng quy tắc XDS "cụm bên phải CHỈ có
  Thiết lập và Avatar").

**Bug thật phát hiện qua test (không phải đoán trước)**: bấm nút "Suspend" trên UI → API trả
`500 Internal Server Error`. Log API: `error: inconsistent types deduced for parameter $2 ...
uuid versus text`. Nguyên nhân: trong câu `INSERT INTO audit_logs (...) VALUES ($1, $2,
'tenant_status_change', $2, $3::jsonb)`, tham số `$2` bị DÙNG LẠI cho cả cột `tenant_id`
(kiểu `uuid`) lẫn cột `resource_id` (kiểu `text`) — cùng 1 giá trị (tenantId) nhưng 2 cột
khác kiểu, khiến Postgres suy luận kiểu tham số mâu thuẫn ngay ở bước parse câu lệnh (không
phải lỗi runtime logic). **Sửa**: tách thành 2 tham số độc lập (`$2` cho `tenant_id`, `$3`
cho `resource_id`, cùng truyền giá trị `tenantId`) — không bao giờ dùng lại 1 số thứ tự
tham số cho 2 cột khác kiểu dữ liệu trong cùng câu lệnh, dù giá trị JS giống hệt nhau.

**Đã test thật**: rebuild bắt buộc `api`+`web` (build-từ-source); chạy lại toàn bộ 5 bộ test
tích hợp cũ, không hồi quy (88/88). Test qua Claude Browser trên Docker thật: đăng nhập bằng
`admin@misa.local` (tài khoản Admin thuần, 0 membership) — xác nhận vào thẳng `/admin` thay
vì bị chặn (xác nhận đã sửa đúng bug đăng nhập nêu trên); trang tải đúng dữ liệu thật (74
tenant, 75 tài khoản, 54 sách, số liệu tổng quan khớp); bấm "Suspend" một tenant test → gặp
đúng lỗi 500 nêu trên (phát hiện qua thao tác thật, không phải đọc code) → sửa, rebuild `api`,
bấm lại thành công (200, tenant chuyển "Suspended", toast đúng, audit_logs ghi đúng dòng mới);
tương tự cho "Disable" 1 tài khoản test (200, audit_logs ghi đúng, xác nhận tài khoản Admin
đang đăng nhập KHÔNG có nút thao tác với chính mình); đổi bộ lọc job từ "Failed" sang "All"
→ hiển thị đúng job `done` thật; tìm kiếm trong bảng "All books" lọc đúng còn 1 kết quả; resize
mobile 375×812 xác nhận top bar/card không vỡ layout, không tràn ngang trang. Đã khôi phục lại
đúng trạng thái ban đầu (active) cho tenant/tài khoản dùng để test, không để lại thay đổi rác.

**Giới hạn còn mở**: danh sách sách/tenant/tài khoản Admin hiện lọc/tìm hoàn toàn ở phía
client và giới hạn cứng (sách tối đa 500 dòng, audit log tối đa 500 dòng/lần) — đủ cho quy mô
PoC hiện tại (54 sách, 74 tenant) nhưng CHƯA phân trang phía server, sẽ cần làm nếu dữ liệu
lớn hơn nhiều. "Quản lý" tenant/tài khoản hiện chỉ có tạo mới (đã có từ trước) + đổi trạng
thái active/suspended hoặc active/disabled — CHƯA có sửa tên tenant, đổi email/mật khẩu tài
khoản, hay xoá cứng — PLAN.md không nêu rõ cần các thao tác này nên chưa tự thêm. Chưa có nút
"chạy lại" (retry) trực tiếp cho job lỗi từ màn Admin — Admin hiện chỉ XEM được job lỗi, việc
retry vẫn phải qua cơ chế dispatcher/BullMQ có sẵn, không có endpoint thao tác riêng.

Đến đây đã hoàn tất toàn bộ phạm vi P4 đã đặt ra ban đầu ("Hyperlink hoàn chỉnh, media trong
phạm vi PoC, GA4, dashboard, Admin") ngoại trừ F10 Mức B (audio/video, đang tạm hoãn chờ file
mẫu thật hoặc chỉ đạo tiếp theo) và F10 Mức C (JS/Launch — chủ động bỏ qua theo PLAN.md).

## F13-rút gọn — Đơn giản hóa Admin dashboard cho người dùng không chuyên (2026-09-17)

Ngay sau khi hoàn tất F13, người dùng phản hồi bảng điều khiển Admin "nhìn có vẻ phức tạp
quá" và yêu cầu rút gọn triệt để: Admin dùng dashboard này **không phải dân kỹ thuật**.

**Yêu cầu đã chốt (qua trao đổi + `AskUserQuestion`):**
- Tổng quan chỉ còn 2 số: **Số sách đã đăng** + **Lượt mở** (bỏ hẳn ý tưởng "time on site" —
  hệ thống chưa đo được, không giả lập số liệu).
- Bỏ HẲN các bảng Tenants/Accounts/Job lỗi/Audit log khỏi giao diện Admin (người dùng xác
  nhận rõ "Bỏ luôn" khi được hỏi lại) — thay toàn bộ bằng 1 danh sách chi tiết **sách đã
  đăng**: Tên sách, Người đăng, Ngày đăng, Số lượt xem, nút Xem/Sửa + Xóa, tick chọn xóa
  hàng loạt, lọc theo khoảng ngày đăng, phân trang 10/20/50 sách/trang.
- Xóa sách kiểu **xóa mềm** (khuyến nghị, người dùng chọn) — ẩn khỏi mọi danh sách, KHÔNG
  xóa dòng trong DB, KHÔNG xóa file PDF/ảnh đã lưu, có thể khôi phục sau bằng tay qua DB.
- "Ngày đăng" lấy từ cột `published_at` MỚI (khuyến nghị, người dùng chọn) — đặt chính xác
  lần đầu publish, KHÔNG suy ra tạm từ `updated_at`.

**Việc đã làm — Schema:**
- Migration mới `infra/migrations/0012_book_publish_delete.sql`: thêm 2 cột `books.published_at`
  (timestamptz, null) và `books.deleted_at` (timestamptz, null — cột xóa mềm). Backfill xấp xỉ
  cho sách đã publish TRƯỚC migration này (`published_at = updated_at` — không có mốc thật
  trong quá khứ, đã ghi rõ trong comment SQL là giá trị GẦN ĐÚNG, không phải giả mạo dữ liệu
  thật). Định nghĩa lại `public_get_book()` thêm điều kiện `deleted_at IS NULL` — sách bị Admin
  xóa mềm biến mất khỏi permalink công khai ngay lập tức.
- `apps/api/src/modules/books/books.controller.ts`: `publish()` đổi câu UPDATE thêm
  `published_at = COALESCE(published_at, now())` — CHỈ đặt lần đầu tiên, các lần
  republish/rollback sau (cùng endpoint này) không ghi đè "ngày đăng" gốc. `list()`/`getOne()`
  thêm `WHERE deleted_at IS NULL` — sách Admin đã xóa mềm không còn hiện trong dashboard của
  chính Creator sở hữu nó nữa.

**Việc đã làm — Backend Admin:**
- `admin.controller.ts`: `listBooks()` viết lại hoàn toàn — chỉ trả về sách `status='published'
  AND deleted_at IS NULL`, kèm `published_at` + `views` (tổng lượt xem trang MỌI THỜI ĐIỂM,
  bỏ khung 30 ngày cũ). `getStats()` rút từ 7 cột xuống còn 2 (`published_count`,
  `total_opens`). Thêm `DELETE /admin/books/:id` (xóa mềm — set `deleted_at`, ghi
  `audit_logs` action `book_soft_delete`, 404 nếu đã xóa trước đó). **Giữ nguyên không đổi**
  các endpoint GET/PATCH tenants/users/jobs/audit-logs cũ (không bị FE gọi nữa nhưng vẫn hoạt
  động — không xóa code đang chạy tốt chỉ vì FE thôi dùng, tránh xóa nhầm thứ có thể cần lại;
  đã xác nhận không bộ test tích hợp nào phụ thuộc các GET này ngoài 3 endpoint POST tạo dữ
  liệu test).

**Việc đã làm — Frontend:**
- `apps/web/src/components/xds/XDatePicker.tsx` (MỚI): port trực tiếp từ
  `XDatePicker.vue` của skill Xoăn Design System (Ưu tiên 2 — project React, không mount được
  file `.vue` thật) — lịch popover đầy đủ (chọn ngày/tháng/năm, nút "Hôm nay", gõ tay dd/MM/yyyy,
  nút xóa), KHÔNG dùng `<input type="date">` gốc trình duyệt. Thêm icon `calendar` vào
  `icons/paths.ts` (copy nguyên path từ `assets/icons/calendar.svg` của skill).
- `apps/web/src/lib/useSession.ts`: `useSession()` cho phép override `tenantId` qua query
  param `?tenantId=` — dùng khi Admin (có thể không thuộc tenant nào) mở trang chi tiết sách
  của tenant khác. AN TOÀN vì BE (`DbContextInterceptor`) vẫn tự kiểm tra: người không phải
  Admin gửi `tenantId` không phải của mình bị 403 (không có membership) — override này chỉ là
  tiện ích điều hướng FE, không phải lớp bảo vệ.
- `apps/web/src/app/dashboard/books/[id]/page.tsx`: phát hiện `viaAdmin` (có `?tenantId=`
  trên URL) → nút/back-button "← Danh sách sách" trỏ về `/admin` thay vì `/dashboard` (Admin
  thuần không có `/dashboard` dùng được). Quyết định gộp "Xem chi tiết" + "Sửa" thành 1 nút
  duy nhất "Xem / Sửa" (trang chi tiết sách của Creator vốn luôn cho sửa trực tiếp, không có
  bản chỉ-xem riêng — dựng thêm 1 UI chỉ-xem riêng cho Admin là dư thừa, không được người
  dùng yêu cầu).
- `apps/web/src/app/admin/page.tsx`: viết lại toàn bộ — bỏ hẳn `tenantsCard`/`usersCard`/
  `jobsCard`/`auditCard`/`jobFilter`/dialog đổi trạng thái tenant-user. Còn lại đúng 2 khối:
  Tổng quan (2 số) + 1 bảng sách đã đăng (checkbox chọn dòng + "chọn tất cả" theo trang, nút
  xóa hàng loạt hiện khi có dòng được chọn, 2 `XDatePicker` lọc khoảng ngày đăng — lọc/phân
  trang hoàn toàn phía CLIENT trên dữ liệu đã tải, phù hợp quy mô PoC hiện tại, `XSelect`
  chọn 10/20/50 dòng/trang, nút prev/next `XButton variant="icon"`). Dialog xác nhận xóa dùng
  chung 1 state (`{ids, label}`) cho cả xóa đơn và xóa hàng loạt.
- `apps/web/src/lib/types.ts`: xóa hẳn `AdminTenant`/`AdminUser`/`AdminJob`/`AdminAuditLog`
  (không còn nơi nào dùng sau khi rút gọn FE). `AdminBook` rút còn đúng 5 field cần cho bảng
  mới + `tenant_id` (chỉ dùng để dựng link Xem/Sửa, không hiển thị trực tiếp). `AdminStats`
  rút còn `published_count` + `total_opens`. `Book` (phía Creator) thêm `published_at`.
- `apps/web/messages/vi.json` + `en.json`: viết lại toàn bộ namespace `admin` theo bộ màn
  hình mới, xóa các khóa dịch không còn dùng (tenantsTitle, statTenants, jobFilter_*,
  userStatus_*, v.v. — đã grep xác nhận không còn tham chiếu nào trong `apps/web/src`).

**Đã test thật**: `tsc --noEmit` sạch cả `apps/api` lẫn `apps/web`; rebuild Docker
`migrate`+`api`+`web`; áp dụng migration 0012 thành công; chạy lại đủ 5 bộ test tích hợp cũ,
không hồi quy (88/88 — không bộ nào đụng tới các endpoint GET admin bị đổi shape nên an toàn).
Test tay qua Claude Browser trên Docker thật, đăng nhập `admin@misa.local`:
- Tổng quan hiện đúng 2 số thật (45→sau xóa còn 42, khớp số lần xóa test).
- Bấm "Xem / Sửa" trên 1 sách thuộc tenant khác Admin không sở hữu → mở đúng trang chi tiết
  Creator, đầy đủ dữ liệu (thống kê/cài đặt/chia sẻ/revisions), Admin KHÔNG bị đá về `/login`
  dù không có tenant nào trong localStorage — xác nhận cơ chế `?tenantId=` override hoạt động
  đúng. Bấm "← Danh sách sách" quay đúng về `/admin` (không phải `/dashboard`).
- Xóa 1 sách đơn: dialog xác nhận đúng tên sách → xác nhận → toast "Đã xóa sách.", sách biến
  mất khỏi danh sách, Tổng quan giảm đúng 1.
- Tick 2 checkbox → nút "Xóa mục đã chọn (2)" hiện đúng → xác nhận → toast "Đã xóa 2 sách.",
  cả 2 biến mất, Tổng quan giảm đúng 2.
- Đổi "Số dòng/trang" 10→50: bảng hiển thị nhiều dòng hơn, "Trang 1/5"→"Trang 1/1" đúng.
  Bấm "Trang sau": sang đúng trang 2, thấy sách khác (kể cả 1 sách có lượt xem thật >0 —
  xác nhận cột "Số lượt xem" tính đúng từ `daily_stats` thật, không phải toàn số 0 giả).
- Chọn "Từ ngày" = 19/09/2026 (mọi sách test đều đăng 17/09) → bảng đúng "Không có dữ liệu.",
  xóa bộ lọc (nút ×) → khôi phục đúng toàn bộ danh sách.
- Resize 375×812: trang tải đúng, top bar/card không vỡ — bảng dùng scroll ngang (cùng cách
  các bảng Admin từ trước tới giờ vẫn làm trên mobile, không phải hồi quy mới).

**Giới hạn còn mở**: lọc/phân trang danh sách sách Admin vẫn hoàn toàn phía CLIENT (tải tối đa
500 dòng rồi lọc/cắt trang trong trình duyệt) — đủ cho quy mô PoC, cần chuyển sang phân trang
phía server nếu số sách lớn hơn nhiều (cùng giới hạn đã ghi nhận ở F13 gốc, chưa giải quyết).
Xóa mềm mới chỉ lọc ở 2 nơi (`GET /books`, `GET /books/:id` của Creator) và ở `public_get_book`
— các endpoint thao tác trực tiếp theo ID khác (upload/settings/publish/preview/background...)
CHƯA kiểm tra `deleted_at`, nghĩa là nếu ai đó có sẵn URL/ID của 1 sách vừa bị Admin xóa mềm thì
một số thao tác con vẫn có thể chạy được cho tới khi tải lại trang danh sách — rủi ro thấp ở
quy mô PoC (sách xóa không còn lộ ra ở bất kỳ danh sách nào để lấy ID mới), nhưng cần biết nếu
mở rộng sau này. Chưa có UI khôi phục sách đã xóa mềm (chỉ có thể khôi phục bằng tay qua DB).
Nút "Xem" và "Sửa" đã gộp làm một theo quyết định chủ động (xem phần "Việc đã làm — Frontend"
ở trên) — nếu người dùng thực sự muốn 2 hành vi khác nhau (vd xem không cho sửa) thì đây là
điểm cần làm thêm.

## P5 — UAT và phát hành (bắt đầu 2026-09-17)

**Chỉ đạo người dùng (qua `/goal`)**: làm tiếp P5; 2 mục còn mở của P4 (F10 Mức B — audio/
video nhúng trong PDF, F10 Mức C — JS/Launch actions) để nguyên, chưa có file PDF mẫu có
nhúng media thật nên chưa thể test.

**Việc đã làm — Bộ test UAT mới `tests/integration/p5_uat.test.js` (21/21 PASS)**:
- Pipeline convert vẫn ổn định (không crash API/worker) khi nhận PDF bị mã hoá mật khẩu hoặc
  file PDF hỏng/corrupt thật — job kết thúc `failed` với lỗi rõ ràng, không treo job, không rơi
  429/500 ở API.
- Chặn đúng việc dùng `tenantId` của tenant khác để dò thống kê (`/dashboard`/`/admin/stats`
  kiểu endpoint) — không rò rỉ số liệu chéo tenant.
- 2 lệnh `POST /books/:id/publish` bắn đồng thời (2 revisionId khác nhau) → cả 2 đều trả
  200/201, DB kết thúc ở đúng 1 trạng thái nhất quán (`published_revision_id` là 1 trong 2,
  không có ghi tách đôi) — xác nhận race an toàn, test bằng request HTTP thật chạy song song,
  không chỉ đọc code.
- **Phát hiện thật (không phải lỗi bảo mật)**: endpoint tải PDF công khai
  (`GET /public/books/:permalink/download`) KHÔNG hỗ trợ HTTP Range request — gửi
  `Range: bytes=0-99` vẫn nhận về 200 kèm toàn bộ file (không phải 206/one phần) — ghi nhận là
  khoảng trống hiệu năng/tính năng, không phải lỗ hổng (không bao giờ trả nhiều hơn file thật).
- **Phát hiện thật**: upload file vượt `PDF_MAX_BYTES` (200MB) trả về HTTP **413** (không phải
  400), phản hồi dưới 1 giây, API vẫn khoẻ mạnh ngay sau đó — xác nhận bằng upload file thật
  >200MB, không giả lập.

**Drill thủ công (không phải regression tự động, xem lý do ở mục Backup/Restore bên dưới)**:
- **Redis restart giữa lúc job đang `processing`**: script `scratchpad/redis_restart_drill.js`
  upload PDF 150 trang thật, đợi job sang `processing`, `docker compose restart redis`, rồi
  theo dõi tới khi job xong. **KẾT QUẢ: PASS** — job tự phục hồi, hoàn tất `done` sau ~23.6s,
  `attempts: 1`, KHÔNG cần can thiệp tay. Cơ chế: `apps/dispatcher/src/index.js` tạo
  `new IORedis(REDIS_URL, { maxRetriesPerRequest: null })`, kết hợp `retryStrategy` mặc định
  của ioredis tự kết nối lại vô hạn.
- **Backup/Restore (mục bắt buộc trong ma trận nghiệm thu P5, trước đây CHƯA từng test)**:
  phương pháp: thay vì phá DB/storage dev thật để "chứng minh" restore chạy được, tạo 1
  container Postgres tạm hoàn toàn tách biệt (`p5-restore-drill-pg`, cổng 15433, volume mới)
  rồi restore bản backup thật vào đó — chứng minh file backup dùng được mà không rủi ro gì
  cho môi trường dev đang chạy.
  - `pg_dump -Fc` từ Postgres dev thật ra `backup.dump` (189.307 bytes).
  - Tarball toàn bộ volume `misa-flipbook_storage_data` ra `storage_backup.tar.gz`
    (28.631.293 bytes), qua 1 container `alpine` dùng 1 lần.
  - `pg_restore` vào container tạm: có 23 lỗi `role "app_user" does not exist` khi restore
    câu lệnh `GRANT ... TO app_user` — ĐÚNG NHƯ DỰ KIẾN vì container tạm chỉ chạy
    `postgres:16.4` gốc, không có role `app_user` (role là cấp cluster, `pg_dump` một DB
    không mang theo role) — không ảnh hưởng dữ liệu/schema thật.
  - **Xác nhận bằng query thật**: `SELECT count(*)` trên container tạm ra đúng **81 books,
    93 tenants, 1858 assets** — khớp 100% với baseline lấy từ DB dev thật trước khi backup.
  - **Xác nhận file storage**: giải nén `storage_backup.tar.gz`, `sha256sum` đúng 1 file asset
    tham chiếu (`9183d7f4-.../source.pdf`, 115.374 bytes) ra đúng
    `8910f6d59ed2fd63d50b600bc746703a69f7e65a41dda35161152edb78edb645` — khớp checksum gốc.
  - **KẾT QUẢ: PASS** — cả backup DB và backup storage đều restore được đúng dữ liệu.
    Container tạm đã dọn (`docker rm -f p5-restore-drill-pg`), file backup/giải nén nằm ở
    scratchpad, không phải file thường trực trong repo.
  - Lưu ý môi trường (Windows/Git Bash, không phải lỗi Docker/DB): đường dẫn Unix tuyệt đối
    (`/tmp/...`) truyền cho `docker exec`/`pg_dump -f`/`docker cp` bị Git Bash tự động đổi
    thành đường dẫn Windows trước khi tới Docker → phải set `MSYS_NO_PATHCONV=1` cho các lệnh
    này; đích `docker cp` phía host phải là đường dẫn kiểu Windows (`C:/Users/...`), không phải
    `/c/Users/...`.

**Việc đã làm — Mobile (test qua Claude Browser `resize_window`, giả lập, không thay thế thiết
bị thật)**: test 375×812 (dọc) và 812×375 (ngang) trên các màn Login, Admin dashboard, Chi tiết
sách, Reader công khai. Login/Admin/Chi tiết sách: bố cục không vỡ, không tràn ngang, nút "Sao
chép mã nhúng"/"Sao chép link" đều bấm được và toast hiện đúng (xác nhận clipboard hoạt động
thật trên mobile). Reader: link nội bộ (F10 Mức A) nhảy đúng trang trên mobile.

- **BUG THẬT phát hiện + ĐÃ SỬA**: ở chế độ xoay ngang (landscape) màn hình thấp (vd 812×375),
  khung đọc FlipBook hiển thị TRẮNG/cắt mất phần lớn nội dung trang (chỉ 1 dải mỏng ở giữa trang
  lọt qua khung nhìn). Nguyên nhân xác nhận qua đo DOM/CSS thật: `.flipbook-book` (`FlipBook.tsx`,
  phần tử `react-pageflip` dùng để tự đo kích thước khung chứa qua `offsetHeight`) không có
  `height`/`max-height` CSS tường minh trong `globals.css`, nên khi `.reader-stage` (khung cha)
  bị nén rất thấp, `.flipbook-book` tự đo theo nội dung (kích thước trang tính trước) thay vì
  theo khung cha thật — sách được tính cao gấp ~2 lần khung nhìn thật rồi bị `.reader-stage`'s
  `overflow:hidden` cắt mất phần lớn, phần còn lọt qua khung thường không phải phần có chữ (nên
  nhìn như "trắng"). **Sửa**: thêm `max-width: 100%; max-height: 100%;` vào `.flipbook-book`
  trong [globals.css](apps/web/src/app/globals.css) để ép kích thước đo đúng theo khung cha thật.
  Đã build lại `web` (`docker compose build web && up -d web`) và test lại thật qua Claude
  Browser: landscape 812×375 hiển thị đúng đầy đủ nội dung (cả 2 trang trong 1 spread), lật
  trang tiếp vẫn đúng; portrait 375×812 và desktop bình thường không đổi (không hồi quy). Chạy
  lại đủ 6 bộ test tích hợp hiện có sau khi sửa (p5_uat 21/21, api_e2e 14/14, p2_e2e 16/16,
  p3_e2e 33/33, f16_visibility 12/12, tenant_isolation 13/13 — tổng 109/109 PASS) — xác nhận
  thay đổi CSS không ảnh hưởng gì khác.

**Việc đã làm — PDF/Tương tác (kiểm tra bằng mắt thật qua Claude Browser, đối chiếu PDF gốc)**:
upload + publish `sample_rotated_mixed.pdf` (4 trang: portrait thường, landscape thật, portrait
có cờ `/Rotate 90`, khổ nhỏ hơn) và `sample_scanned_like.pdf` (2 trang mô phỏng scan, nền xám +
khối đen, không có text layer thật) qua pipeline convert thật, xem trực tiếp trong reader.

- **BUG THẬT phát hiện + ĐÃ SỬA (nghiêm trọng hơn bug landscape ở trên)**: trang PDF có cờ
  `/Rotate 90/180/270` hiển thị SAI hướng trong reader — chữ bị lộn ngược ~180° so với hướng
  đọc đúng, thay vì chỉ xoay đúng 90°. Nguyên nhân xác nhận qua đọc code + tự render thử bằng
  `pypdfium2` (không qua bất kỳ lớp nào của app): thư viện `pypdfium2` dùng trong
  `services/pdf-worker/app/convert.py` (`page.get_size()` + `page.render()`) đã TỰ ĐỘNG áp
  dụng `/Rotate` của trang khi xuất ảnh (ảnh raster + `width_pt`/`height_pt` xuất ra đã ở ĐÚNG
  hướng hiển thị, vd trang 3 mediabox gốc 595×842pt nhưng `get_size()` trả về 842×595 - đã hoán
  đổi đúng theo rotate). Nhưng code VẪN gắn thêm trường `"rotation": <90/180/270 tu pypdf>` vào
  manifest gửi cho frontend, khiến `FlipBook.tsx` áp dụng CSS `transform: rotate()` THÊM MỘT
  LẦN NỮA lên ảnh đã tự xoay đúng sẵn — xoay chồng 2 lần (vd 90+90=180, khớp chính xác với hiện
  tượng "lộn ngược" quan sát được, không phải suy đoán). **Sửa**: trong
  [convert.py](services/pdf-worker/app/convert.py), field `"rotation"` xuất ra cho frontend
  luôn đặt cứng `0` (vì ảnh + kích thước đã ở dạng sau-xoay rồi, không cần xoay thêm ở FE);
  giá trị rotation gốc từ `pypdf` vẫn giữ nguyên vai trò NỘI BỘ duy nhất là quy đổi toạ độ link
  (`_normalize_rect`), không đổi. Đã rebuild `pdf-worker`
  (`docker compose build pdf-worker && up -d`), upload lại PDF qua pipeline thật, xác nhận
  bằng mắt: trang xoay 90° giờ đọc đúng hướng (chữ chạy dọc theo cạnh, đọc từ trên xuống, đúng
  như 1 trang bị xoay 90° thật sự phải trông như vậy), không còn lộn ngược. Chạy lại
  `p5_uat.test.js` (21/21) và `p3_e2e.test.js` (33/33) sau khi rebuild pdf-worker — không hồi
  quy (không có test nào assert riêng trên field `rotation` trước đó, đây là lỗ hổng về độ phủ
  test, không có cách nào phát hiện lỗi này ngoài kiểm tra bằng mắt thật như đã làm ở đây).
  **Lưu ý quan trọng**: các sách ĐÃ publish TRƯỚC thời điểm sửa (bằng revision cũ) vẫn giữ
  nguyên manifest cũ (rotation sai) cho tới khi có người upload lại 1 revision mới - đây là bản
  chất của cách lưu manifest theo revision, không phải lỗi mới phát sinh.
- Trang landscape thật (không có cờ rotate, chỉ đơn giản là trang PDF khổ ngang) và trang khổ
  nhỏ hơn (mixed size) hiển thị đúng tỷ lệ, không méo — không phát hiện vấn đề gì thêm.
- Trang "scanned like" (ảnh scan giả lập, không có text layer) hiển thị đúng, không vỡ ảnh.

**Việc đã làm — Performance (số liệu tải thật, không phải suy đoán)**: script
`scratchpad/perf_concurrent_read.js` bắn N "phiên đọc" THẬT đồng thời (mỗi phiên gọi đúng
trình tự API mà 1 người đọc thật gọi: `GET /public/books/:permalink` + tải 3 ảnh trang đầu qua
`GET /public/books/:permalink/assets/:id`) vào 1 sách đã publish thật (không phải mock).
- 30 phiên đồng thời: 30/30 thành công, độ trễ mỗi phiên p50=152ms / p95=182ms.
- 100 phiên đồng thời (đúng con số "100 phiên đọc giả định" trong ma trận nghiệm thu): 100/100
  thành công, p50=471ms / p95=601ms / max=608ms — API vẫn khoẻ (health check 200 sau đợt tải).
- Giới hạn của phép đo này: chạy trên máy dev (không phải môi trường staging/production thật),
  không mô phỏng độ trễ mạng 4G, chỉ đo 1 vòng bùng nổ đồng thời (không phải tải bền vững kéo
  dài) — đủ để xác nhận hệ thống KHÔNG sập/không lỗi ở quy mô 100 phiên, chưa đủ để công bố SLA
  hiệu năng chính thức cho production.

**Việc đã làm — Embed cross-origin (test thật, không chỉ đọc code)**: dựng 1 static server tạm
ở origin khác hẳn (`http://localhost:8899`, khác cổng = khác origin theo chuẩn same-origin
policy của trình duyệt) chứa 1 trang HTML nhúng `<iframe src="http://localhost:3001/read/.../
embed">`, mở qua Claude Browser. Xác nhận: không có header `X-Frame-Options`/CSP
`frame-ancestors` nào chặn (đã kiểm tra bằng `curl -D -`), iframe load được nội dung sách đầy
đủ, click lật trang bên trong iframe vẫn hoạt động bình thường — nhúng cross-origin thật sự
dùng được, không chỉ dựa trên đọc code.

**Việc đã làm — Download: thử truy cập trực tiếp storage key (không qua API)**: lấy 1 object
key thật từ trong container (`docker compose exec api ... find $STORAGE_ROOT -name source.pdf`),
thử GET trực tiếp qua nhiều dạng URL đoán được (`/data/storage/...`, `/storage/...`) trên cả 2
cổng (api :3000, web :3001) — TẤT CẢ đều trả 404 thật (không phải suy đoán từ đọc code). Xác
nhận qua code: `apps/api` không có `ServeStaticModule`/`express.static` nào trỏ vào
`STORAGE_ROOT`, file chỉ đọc được qua đúng endpoint có kiểm tra quyền
(`GET /public/books/:permalink/assets/:assetId`).

**Việc đã làm — Protection: rà soát cơ chế cache cho asset/background công khai**: đọc lại
`public-books.controller.ts` — endpoint `/assets/:assetId` và `/background` đều set
`Cache-Control: public, max-age=3600(+immutable)`, nhưng đây là thiết kế CHỦ ĐỘNG an toàn: (1)
`assetId` là UUID ngẫu nhiên không đoán được từ permalink (đã có comment giải thích trong
code); (2) với sách có mật khẩu/private, token JWT được nối vào URL qua `?token=...`
(`PublicBookReader.tsx`), nên URL (và do đó cache key) khác nhau theo từng token — không có
URL "dùng chung" nào vừa công khai vừa bảo vệ. Xác nhận thêm bằng test THẬT đã có sẵn
(`p3_e2e.test.js`): đổi mật khẩu tăng `access_epoch` → token cũ bị từ chối NGAY ở server (không
đợi hết hạn JWT) — đây là lớp phòng vệ chính, độc lập với cache. Rủi ro residual CÒN LẠI (đã
biết, chấp nhận được cho PoC): nếu có 1 CDN/proxy cache THẬT ở giữa (môi trường Docker dev hiện
tại KHÔNG có), 1 URL kèm token đã bị thu hồi vẫn có thể được phục vụ lại từ cache tối đa 1 giờ
nếu ai đó đã lưu lại URL đó từ trước — chưa dựng CDN thật để đo trực tiếp hành vi này (ngoài
phạm vi Docker dev).

**Việc đã làm — Script backup tự động hoá `infra/docker/scripts/backup.sh`**: đóng gói lại đúng
quy trình backup DB+storage đã kiểm chứng thủ công thành 1 script chạy lặp lại được (tham số
`BACKUP_DIR`/`POSTGRES_USER`/`POSTGRES_DB`/`STORAGE_VOLUME` qua biến môi trường, mặc định lưu
vào `infra/docker/backups/<timestamp>/`). Gặp lại đúng các bẫy MSYS/Git Bash đã biết khi viết
script (đường dẫn container bị Git Bash tự đổi sai) — xử lý bằng cách tách rõ: lệnh nào có path
container-side thì đặt `MSYS_NO_PATHCONV=1`, lệnh nào cần Git Bash tự đổi path host-side (như
`docker cp`) thì KHÔNG đặt biến đó; riêng lệnh `docker run -v` (cần cả 2 phía cùng lúc) phải tự
quy đổi path host sang dạng Windows thật qua `cygpath -w` trước rồi mới đặt `MSYS_NO_PATHCONV=1`.
Đã TEST THẬT (không chỉ chạy không lỗi): `db.dump` xác nhận đúng magic bytes "PostgreSQL custom
database dump", `storage.tar.gz` xác nhận giải nén được, chứa đúng 3060 mục. Thêm
`infra/docker/backups/` vào `.gitignore` (không commit dữ liệu backup thật). Script này CHƯA có
cơ chế tự xoá bản cũ (retention) — cần thêm nếu dùng cho lịch chạy tự động dài hạn (cron/Task
Scheduler); việc LẬP LỊCH chạy script định kỳ (cron thật) vẫn CHƯA làm (script đã sẵn sàng để
lập lịch, nhưng chưa có cron job/Task Scheduler entry nào được tạo).

**Giới hạn còn mở / chưa làm trong P5** (đã soát lại 2026-09-17 cho khớp với nội dung chi
tiết ở trên — bản liệt kê cũ ở đây bị để sót, ghi nhầm một số việc ĐÃ làm thành "chưa làm"):
- Mobile mới test giả lập qua `resize_window` (Claude Browser), **CHƯA test trên thiết bị
  thật** (notch/bàn phím ảo/cảm ứng thật không giả lập đầy đủ được qua trình duyệt desktop).
- Chưa test "share-cancel" (người dùng huỷ share sheet OS) bằng thiết bị thật + chưa xác nhận
  sự kiện GA4 thật gửi đi đúng (mới xác nhận code gọi đúng hàm, chưa nhìn thấy event thật trên
  Google Analytics thật).
- Rủi ro cache CDN residual với asset công khai (mục Protection ở trên) mới được RÀ SOÁT bằng
  đọc code + đối chiếu test có sẵn, **chưa đo trực tiếp** trên 1 CDN/proxy cache thật (Docker
  dev hiện không có lớp này).
- Script backup (`infra/docker/scripts/backup.sh`) đã test PASS nhưng **chưa có lịch chạy tự
  động** (cron/Task Scheduler) — người dùng đã chọn hoãn việc này ("Chưa cần, để sau").
- Deploy thật lên staging/Cloud Run/hạ tầng MISA: **để sau theo quyết định người dùng**
  (ưu tiên Docker ổn định trước) — không phải việc bị bỏ sót, xem mục "Quyết định 2026-09-17"
  ở ROADMAP.md.
- Điều kiện đi tiếp của P5 ("Người dùng xác nhận bản ổn định và hồ sơ handoff đầy đủ") CHƯA đạt
  — [handoffs/HF-20260917-01.md](handoffs/HF-20260917-01.md) vẫn ở trạng thái `draft`, chờ
  người dùng xác nhận.
- F10 Mức B (audio/video nhúng trong PDF) và F10 Mức C (JS/Launch actions của PDF): để nguyên
  theo đúng chỉ đạo người dùng, chưa có file PDF mẫu nhúng media thật nên chưa thể test.

## P6 — Social API nâng cao (bắt đầu 2026-09-17)

Theo chỉ đạo người dùng ("chạy nốt những gì còn thiếu, P6 chẳng hạn", sau đó chốt lại
"ưu tiên Facebook trước"), bắt đầu P6 từ Facebook thay vì LinkedIn — theo đúng phạm vi
PLAN.md mục 5: "Facebook: kiểm chứng Share Dialog/plugin bằng app MISA thực tế; không
hứa tự đăng lên profile cá nhân."

**Hiện trạng trước khi làm**: nút "Chia sẻ Facebook" trong `FlipBook.tsx` chỉ là link
tĩnh `facebook.com/sharer/sharer.php?u=...` — hoạt động, không cần app, nhưng đây là
kiểu "Share Link" cũ, chưa phải "Share Dialog" thật của Facebook SDK (PLAN.md yêu cầu
kiểm chứng Share Dialog bằng app MISA thực tế).

**Đã làm**:
- [facebookShare.ts](apps/web/src/lib/facebookShare.ts) (mới): nạp Facebook JS SDK động,
  `FB.init({appId, version: v21.0})`, gọi `FB.ui({method: 'share', href})` — đây là
  "Share dialog" công khai, KHÔNG xin quyền đăng nhập/đăng bài nên theo chính sách
  Facebook hiện tại không cần App Review.
- `FlipBook.tsx`: mục Facebook trong menu chia sẻ đổi từ `href` tĩnh sang `onSelect`
  gọi `shareFacebook()` — nếu có `NEXT_PUBLIC_FACEBOOK_APP_ID` thì mở Share Dialog thật
  qua SDK; nếu chưa cấu hình HOẶC SDK lỗi (mạng chặn `connect.facebook.net`, appId sai...)
  thì tự động rơi về link `sharer.php` cũ — không bao giờ làm hỏng luồng chia sẻ hiện có.
- Thêm biến build-time `NEXT_PUBLIC_FACEBOOK_APP_ID` (Next.js inline lúc build, không
  đọc lại lúc chạy): [Dockerfile](apps/web/Dockerfile), truyền qua build arg
  `WEB_PUBLIC_FACEBOOK_APP_ID` trong [docker-compose.yml](infra/docker/docker-compose.yml)
  + [.env.example](infra/docker/.env.example) (mặc định để trống).

**Đã kiểm chứng thật (Claude Browser, sách `kiem-tra-thi-giac-scanned-like-nopynhs7`)**:
rebuild container `web`, mở menu chia sẻ, bấm "Chia sẻ Facebook" — xác nhận code chạy
đúng nhánh fallback (mở popup tới `www.facebook.com`, bị Claude Browser tự chặn popup vì
lý do an toàn — đúng hành vi mong đợi khi CHƯA cấu hình App ID thật), không có lỗi
console. **Chưa test được nhánh Share Dialog thật qua SDK** vì cần một Facebook App ID
thật.

**Điểm nghẽn thật cần người dùng xử lý** (không thể làm thay — tạo tài khoản/app là hành
động bị cấm với AI): để hoàn tất kiểm chứng Share Dialog thật, người dùng cần tự tạo 1
Facebook App tại developers.facebook.com (loại "Consumer" là đủ), lấy App ID, rồi:
- Set `WEB_PUBLIC_FACEBOOK_APP_ID=<app id thật>` trong `infra/docker/.env`, rebuild lại
  `web` (`docker compose build web && docker compose up -d web`).
- Vào Facebook App settings → thêm domain đang chạy FE (vd `localhost` lúc dev, domain
  thật lúc deploy) vào "App Domains"/"Website" platform để Share Dialog không bị chặn.
Không cần xin quyền/App Review nào thêm cho riêng tính năng Share Dialog này.

**LinkedIn/Instagram**: chưa bắt đầu (theo đúng thứ tự ưu tiên mới của người dùng).
LinkedIn cần OAuth đầy đủ (app riêng + client secret + token lưu mã hoá) — quy mô lớn
hơn nhiều so với Facebook Share Dialog, sẽ khảo sát khi được yêu cầu tiếp.

## Cách cập nhật
Sau mỗi đợt công việc, ghi: đã đổi gì, quyết định/giả định mới, test nào thực sự chạy, kết quả/lỗi, commit và bước kế tiếp.
Giữ lịch sử ADR nếu thay quyết định, đánh dấu superseded thay vì xóa.
Khi người dùng nói “ổn rồi”, làm quy trình HANDOFF.md cho đúng build hiện tại; nếu chỉ duyệt kế hoạch thì ghi duyệt tài liệu, không tạo stable ứng dụng giả.
Đọc README, MEMORYBANK và hồ sơ handoff gần nhất trước khi tiếp tục phát triển.
