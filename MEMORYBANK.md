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

## Cách cập nhật
Sau mỗi đợt công việc, ghi: đã đổi gì, quyết định/giả định mới, test nào thực sự chạy, kết quả/lỗi, commit và bước kế tiếp.
Giữ lịch sử ADR nếu thay quyết định, đánh dấu superseded thay vì xóa.
Khi người dùng nói “ổn rồi”, làm quy trình HANDOFF.md cho đúng build hiện tại; nếu chỉ duyệt kế hoạch thì ghi duyệt tài liệu, không tạo stable ứng dụng giả.
Đọc README, MEMORYBANK và hồ sơ handoff gần nhất trước khi tiếp tục phát triển.
