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

Chưa bắt đầu: P3-P6, Git tag bản stable.
Điểm stable gần nhất: chưa có (P1+P2 xong nhưng chưa cắt tag).
Handoff tài liệu: PLANNING-001 (draft); không coi là phần mềm có thể rollback.
Bước tiếp theo: P3 theo ROADMAP.md (mật khẩu, download, replace/revision, embed, link share) —
book_settings.password_hash đã có cột sẵn từ P1, cần thêm luồng nhập mật khẩu ở FE + kiểm tra ở
`public_get_book`/`public_get_page_asset`; hoặc đóng các mục "chưa xong trong P2" ở trên nếu
người dùng muốn cứng hoá P2 trước khi sang P3. Test tự động cho FE (Playwright) đáng cân nhắc
trước khi làm thêm tương tác phức tạp hơn (P4: hyperlink overlay, media).

## Cách cập nhật
Sau mỗi đợt công việc, ghi: đã đổi gì, quyết định/giả định mới, test nào thực sự chạy, kết quả/lỗi, commit và bước kế tiếp.
Giữ lịch sử ADR nếu thay quyết định, đánh dấu superseded thay vì xóa.
Khi người dùng nói “ổn rồi”, làm quy trình HANDOFF.md cho đúng build hiện tại; nếu chỉ duyệt kế hoạch thì ghi duyệt tài liệu, không tạo stable ứng dụng giả.
Đọc README, MEMORYBANK và hồ sơ handoff gần nhất trước khi tiếp tục phát triển.
