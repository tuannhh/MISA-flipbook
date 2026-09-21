# Roadmap triển khai
Ước lượng sơ bộ 8–12 tuần cho đội 2 lập trình viên có QA/DevOps hỗ trợ; không phải cam kết lịch. Một người làm cần điều chỉnh. Thời gian xét duyệt API mạng xã hội, chờ thiết bị/PDF và cấp hạ tầng nằm ngoài ước lượng. Không cần thêm nhân sự để bắt đầu PoC, nhưng vẫn cần kiểm thử đầy đủ.

## Các mốc
| Mốc | Thời lượng | Đầu ra | Điều kiện đi tiếp |
|---|---|---|---|
| P0 — Chốt kỹ thuật | 3–5 ngày | Corpus PDF, ma trận thiết bị, PoC render/flip/link/media, license review, số đo | Chọn parser/renderer; ghi rõ audio/video nào hoạt động; chốt ngưỡng mobile |
| P1 — Nền tảng | 1–2 tuần | Repo, Docker Compose, auth, tenant, ownership, schema, storage adapter, CI | Hai tenant và hai Creator không đọc/sửa dữ liệu quản trị của nhau; cold start Docker được |
| P2 — Luồng cốt lõi | 2 tuần | Upload → job → preview → publish → reader, permalink, title/thumbnail | PDF thực đọc được trên desktop/mobile; restart worker không làm hỏng publish |
| P3 — Quản lý xuất bản | 1–2 tuần | Mật khẩu, download, replace/revision, embed, link share | Link giữ nguyên; protected assets không lộ; rollback PDF hoạt động |
| P4 — Tương tác và báo cáo | 1–2 tuần | Hyperlink hoàn chỉnh, media trong phạm vi PoC, GA4, dashboard, Admin | Overlay đúng tọa độ; tenant stats đúng; không tự chạy PDF script; media có báo cáo |
| P5 — UAT và phát hành | 1–2 tuần | Test thiết bị/tải/quyền, backup/restore drill, server staging, runbook | Người dùng xác nhận bản ổn định và hồ sơ handoff đầy đủ |
| P6 — Social API nâng cao | 1–3 tuần kỹ thuật + thời gian nền tảng | OAuth/publishing cho loại tài khoản được hỗ trợ | App/scopes được duyệt, test tài khoản thật, disconnect và token expiry đúng |

Theo chỉ đạo người dùng: ưu tiên bản chạy Docker; DevOps tự sizing server MISA về sau. P5 có thể nghiệm thu Docker và bàn giao runbook trước, phần cutover server chỉ thực hiện khi DevOps sẵn sàng.

**Trạng thái P0/P1 (chi tiết đầy đủ + bằng chứng ở MEMORYBANK.md, mục "Tiến độ thực tế")**:
- P0: hoàn tất giai đoạn PoC render/extract PDF (pypdfium2 + pypdf), một số case (audio/video,
  scan thật, mobile thật) còn mở, không chặn P1.
- P1: **điều kiện đi tiếp đã đạt và kiểm chứng thật** — "Hai tenant và hai Creator không đọc/sửa
  dữ liệu quản trị của nhau" (13/13 + 14/14 test PASS, kể cả sửa 2 lỗi RLS phát hiện qua test) và
  "cold start Docker được" (toàn bộ 6 service postgres/redis/migrate/api/dispatcher/pdf-worker
  cold start từ volume rỗng thành công qua `docker compose up --build`, pipeline PDF thật chạy
  hết tới trạng thái done/ready). apps/web và reverse proxy chủ động dời sang P2/P3 (không nằm
  trong điều kiện đi tiếp của P1 theo bảng trên).
- P2: **điều kiện đi tiếp đã đạt và kiểm chứng thật** — "PDF thực đọc được trên desktop/mobile"
  (reader công khai `apps/web/read/:permalink`, test qua trình duyệt thật ở desktop và mobile
  375×812) và "restart worker không làm hỏng publish" (tách `dispatcher`/`worker-convert` thành
  2 service độc lập; kill `worker-convert` bằng SIGKILL giữa lúc xử lý job 150 trang, hệ thống
  còn lại không bị ảnh hưởng, job tự phục hồi qua BullMQ stalled-job detection sau khi worker
  sống lại, hoàn tất đúng). Sau đó đã bổ sung hiệu ứng lật trang 3D thật (CSS 3D transform,
  không phải slideshow/crossfade) theo yêu cầu người dùng, tự kiểm thử qua trình duyệt thật
  (desktop kéo/click/phím, mobile giả lập vuốt, chế độ 1/2 trang) — chi tiết, giới hạn còn
  mở (đơn giản hoá mặt sau lá lật ở bìa, chế độ đơn giản cho máy yếu chỉ xác nhận qua đọc
  code) ở MEMORYBANK.md. Giới hạn còn mở khác (đã thu hẹp sau P3, xem dưới): chưa có trang
  Admin trên FE, chưa có test tự động (Playwright) cho FE.
- P3: **điều kiện đi tiếp đã đạt và kiểm chứng thật** — "Link giữ nguyên" (F07: publish
  nguyên tử + rollback bằng publish lại revision cũ, permalink không đổi, đã test thật),
  "protected assets không lộ" (F05 mật khẩu qua argon2 + book-access-token JWT ngắn hạn,
  gate cả JSON/ảnh/download; F11 download kiểm 2 lớp TS+SQL), "rollback PDF hoạt động"
  (publish lại revisionId cũ, đã test). Đã làm thêm F08 (chia sẻ FB/LinkedIn/copy/native +
  Open Graph server-side thật, xác nhận bằng curl HTML) và F09 (embed `/read/:permalink/embed`
  giữ nguyên gate mật khẩu, đã test tab ẩn danh). Tất cả kiểm thử bằng
  `tests/integration/p3_e2e.test.js` (33/33 PASS, HTTP thật) + kiểm thử tay qua Claude
  Browser trên Docker thật, cộng với chạy lại 3 bộ test cũ (13+14+16 PASS, không hồi quy).
  Giới hạn còn mở: khóa mật khẩu theo TỪNG SÁCH chứ không theo IP (có thể bị lợi dụng khóa
  link của chính chủ, chấp nhận được ở quy mô pilot, không quảng bá như DRM); cột
  `book_settings.public_preview` (Creator chủ động lộ tiêu đề/ảnh cho sách có mật khẩu) có
  sẵn từ schema P1 nhưng chưa dùng; chưa nhúng thử `/embed` vào 1 site thật khác; chưa bấm
  thử `navigator.share` trên thiết bị thật hỗ trợ (chỉ xác nhận code ẩn/hiện đúng điều kiện).
  Chi tiết đầy đủ ở MEMORYBANK.md.
  - Sau đó (17/09/2026): làm lại toàn bộ UI `apps/web` theo yêu cầu người dùng — tiếng Việt có
    dấu chuẩn UTF-8 (trước đó ASCII không dấu), i18n `next-intl` (Việt/Anh, không đổi URL/
    permalink), Xoăn Design System (port ~13 component sang React), mobile-native cho cả 6 màn
    hình (không responsive-shrink). Phát hiện và sửa 1 bug hydration React thật (ảnh hưởng mọi
    trang, do `XToast.tsx`) + 1 bug UX thật (thông báo copy-link trong reader không bao giờ
    hiện được). Không đổi BE, chạy lại 76/76 test cũ xác nhận không hồi quy. Chi tiết đầy đủ,
    kể cả giới hạn còn mở, ở MEMORYBANK.md.

P6 có thể khảo sát từ P0, nhưng không khóa tiến độ đọc sách vào thời gian Meta/LinkedIn xét duyệt. Mốc v1.0-core đạt P5 phải ghi rõ social trực tiếp chưa hoàn tất nếu P6 còn mở; không ghi toàn bộ yêu cầu đã xong.

**P6 — tiến độ (2026-09-17, ưu tiên Facebook trước theo chỉ đạo người dùng)**: đã đổi
nút "Chia sẻ Facebook" từ link `sharer.php` tĩnh sang gọi Facebook Share Dialog thật qua
Facebook JS SDK (`apps/web/src/lib/facebookShare.ts`), tự fallback về link cũ khi chưa
cấu hình App ID hoặc SDK lỗi — không phá luồng chia sẻ hiện có. Đã build lại + test qua
Claude Browser xác nhận nhánh fallback chạy đúng. **Còn nghẽn thật**: cần người dùng tự
tạo Facebook App tại developers.facebook.com (AI không được tạo tài khoản/app thay), điền
`WEB_PUBLIC_FACEBOOK_APP_ID` vào `infra/docker/.env` rồi rebuild `web`, mới kiểm chứng
được nhánh Share Dialog thật — xem chi tiết ở MEMORYBANK.md mục "P6 — Social API nâng
cao". **LinkedIn ở mức MVP (F08) đã xong, không có điểm nghẽn** — link `share-offsite`
không cần App/OAuth, đã kiểm chứng URL sinh đúng qua Claude Browser. Phần LinkedIn "nâng
cao" (OAuth đăng thẳng qua tài khoản đã kết nối) vẫn vướng điểm nghẽn giống Facebook: cần
người dùng tự tạo LinkedIn Developer App trước — chưa làm. Instagram chưa bắt đầu.

**Cập nhật candidate Docker edge (21/09/2026):** Compose hiện chạy web và API sau Nginx, chỉ proxy
mở cổng public; browser gọi API cùng origin qua `/api`. Nginx non-root ghi đè header IP do client gửi,
API tin đúng một hop có cấu hình và regression thật xác nhận không thể giả `X-Forwarded-For` để lách
login throttle. P1 (14), P2 (21), P3 (35), security audit (14), P5 upload/UAT (21) và proxy security
(5) đều pass qua public proxy trên stack cô lập. Đây tăng độ sát production của Docker pilot, nhưng
chưa thay cho TLS/CDN và topology proxy do DevOps MISA chốt.

## Backlog ưu tiên
P0: thu thập PDF mẫu → benchmark PDFium/pypdf → annotation/media inventory → thử hiệu ứng + JPEG fallback trên máy yếu → quyết định ADR.
P1: schema/permission tests trước → API auth → upload private → dispatcher/outbox → worker resource limits.
P2: manifest → reader đơn trang → spread desktop → title/thumbnail/metadata → draft/publish.
P3: protection end-to-end → replace/publish atomic → download guard → embed và share.
P4: dashboard/events → media support đã xác minh → Admin operations/audit.
P5: fix lỗi theo severity → load/restore → staging MISA → nghiệm thu → handoff ổn định.

**F15 ảnh nền cho khung đọc — ĐÃ XONG (2026-09-17)**, xem chi tiết ở MEMORYBANK.md: người
dùng xác nhận phạm vi là 1 ảnh nền/sách cho cả khung đọc (không phải nền riêng từng trang
PDF). Backend: cột mới trong `book_settings` + endpoint upload/xem/xóa (owner) và endpoint
công khai (dùng lại đúng cơ chế chặn Private/mật khẩu của F16). Frontend: khối "Background
image" trong Cài đặt + hiển thị nền phủ gradient tối trong reader. Test tay qua Docker thật
+ không hồi quy 5 bộ test cũ (88/88).

**F16 công tắc Publish ⇄ Private trên sách đã publish — ĐÃ XONG (2026-09-17)**, xem chi tiết
đầy đủ ở MEMORYBANK.md: backend (migration + `public_get_book`/`resolveActor`/audit log qua
SECURITY DEFINER) test tích hợp 12/12 PASS, frontend (switch trên trang chi tiết sách + màn
chặn riêng tư trên reader công khai, 2 ngôn ngữ) đã test tay qua Docker thật. Không hồi quy
3 bộ test cũ (14/14 + 16/16 + 33/33).

**F17 zoom in/out cho reader — ĐÃ XONG (2026-09-17)**, xem chi tiết ở MEMORYBANK.md: tự làm
bằng CSS transform (thư viện react-pageflip/StPageFlip không hỗ trợ zoom sẵn), có nút zoom
1x-2.5x + kéo (pan) khi đang zoom, đã test tay qua Docker thật (đo trực tiếp DOM + chụp màn
hình xác nhận phóng to/kéo đúng). Còn 1 giới hạn nhỏ đã ghi nhận: tâm zoom canh theo tâm
khung spread nên trang bìa đơn lẻ (đầu/cuối sách) có thể lệch nhiều hơn khi zoom lần đầu,
cần kéo lại - chưa tối ưu riêng cho trường hợp này.

**F17 v2 — fullscreen, slider zoom, tiến trình đọc, mã nhúng, sửa lỗi lật đôi trang trên
mobile — ĐÃ XONG (2026-09-17)**, xem chi tiết ở MEMORYBANK.md: root-cause thật (đọc source
`page-flip.module.js`) cho lỗi mobile bị lật đôi trang dù đã truyền `usePortrait` đúng — thư
viện tự tính lại portrait/landscape theo `minWidth` nội bộ, minWidth cũ hardcode 200 khiến
ngưỡng thật chỉ 400px thay vì 900px dự định; đã sửa và test lại trên nhiều độ rộng (320-1024px)
kể cả đúng độ rộng mobile 375px người dùng báo lỗi, không hồi quy. Thêm slider zoom liên tục,
nút fullscreen (Fullscreen API chuẩn, không kiểm chứng được trong Claude Browser do
Permissions Policy sandbox — cần người dùng tự bấm thử trên trình duyệt thật), thanh tiến
trình đọc, và nút copy mã nhúng `<iframe>` vào menu chia sẻ. Đã kiểm tra kỹ báo cáo "lỗi lật
trang 1/trang cuối" bằng đo thời gian 150ms/lần ở cả 2 khổ màn hình — kết luận là độ trễ hiệu
ứng lật (~450-600ms), không phải lỗi kẹt vĩnh viễn; không hồi quy 109/109 test cũ.

**Phản hồi audit codex 21/09/2026 — Đợt 1 (SEC-01/02/03, UI-01) — ĐÃ XONG (2026-09-21)**,
xem chi tiết đầy đủ ở MEMORYBANK.md: sửa cache header lộ nội dung protected qua shared
cache (SEC-01), suspend tenant/thu hồi membership chưa có hiệu lực ngay (SEC-02, kèm quyết
định người dùng: suspend chỉ chặn Dashboard, không chặn public reader), thiếu throttle
đăng nhập + khóa mật khẩu sách theo toàn cục thay vì theo nguồn (SEC-03, thêm hạ tầng
Redis rate-limit mới), và lỗi owner mở sách Private bị vỡ ảnh do FE không cập nhật
accessToken khi retry (UI-01). Đã kiểm chứng thật: 96/96 test tích hợp cũ + mới (P1/P2/P3/
F16/P5/sec_audit mới) đều PASS trên Docker thật, cộng kiểm chứng UI-01 qua Claude Browser
thật. Thêm P3/F16/P5/sec_audit vào CI (QA-01). Còn lại PDF-01/02, JOB-01, PERF-01, PDF-03,
PUB-01, FEAT-01/DATA-01, UX-01/URL-01, OPS-01, ADM-01, EDGE-01 cho Đợt 2/3/4 theo
REMEDIATION.md — quy mô lớn hơn nhiều (process isolation, streaming upload, lease/fencing,
windowed reader), không gộp chung 1 lượt.

**P4 — F10 Mức A (hyperlink URL ngoài + link nội bộ sang trang) — ĐÃ XONG (2026-09-17)**,
xem chi tiết ở MEMORYBANK.md: backend đã có sẵn phần trích xuất link từ trước (P0), việc làm
thêm là resolve `/Dest` (link nội bộ) ra số trang cụ thể (`services/pdf-worker/app/convert.py`)
+ dựng overlay bấm được trên FE (`FlipBook.tsx`, tính đúng vùng ảnh hiển thị kể cả khi trang
bị xoay/lệch tỉ lệ). Test thật qua Docker + Claude Browser với `sample_vi_text.pdf` (link
ngoài + link nội bộ về trang cuối), không hồi quy 88/88 test cũ. F10 Mức C (JS/Launch) sẽ
báo cáo rõ là bỏ qua, không tự chạy. F06 (GA4), F12 (dashboard Creator), F13 (dashboard
Admin) của P4 chưa làm — đang làm tiếp theo thứ tự đó.

**P4 — F10 Mức B (audio/video, cập nhật 2026-09-21)**: quyết định tạm hoãn 17/09 vì thiếu PDF
MISA thật vẫn được giữ trong lịch sử, nhưng baseline an toàn đã được triển khai và kiểm chứng bằng
WAV nhúng thật: `/Movie`, `/Screen` Rendition và `/RichMedia` chỉ được lấy từ `/EF` nội bộ, sniff
magic byte, allowlist media browser, giới hạn 20 MiB/object và 50 MiB/PDF; URL/path ngoài PDF,
JavaScript, Launch và Flash đều bị bỏ qua. Reader không autoplay, pause khi lật khỏi trang, và media
đi qua đúng password/Private grant + HTTP Range. Chưa coi F10 hoàn tất cho đến khi UAT PDF MISA có
cả audio/video, đặc biệt là codec video thực tế.

**P4 — F06 (Google Analytics GA4) — ĐÃ XONG (2026-09-17)**, xem chi tiết ở MEMORYBANK.md:
phát hiện 2 cột cần dùng (`book_settings.ga_id`, `tenants.default_ga_id`) đã có sẵn từ schema
P1 nhưng chưa API nào dùng tới — chỉ cần nối dây validate + đọc/ghi + endpoint Admin mới
(`PATCH /admin/tenants/:id`, trước đó chưa có cách sửa tenant sau khi tạo) + chèn script
`gtag.js` cố định ở reader công khai (không nhận JavaScript tùy ý, chỉ 1 ID đã validate định
dạng). Phát hiện + sửa 1 bug thật khi test (không phải đọc code đoán ra): field TS khai báo
kiểu `gaId?: string` với target ES2022 luôn là own-property ngay cả khi client không gửi,
làm sai logic phân biệt "giữ nguyên" vs "xóa" — đã sửa bằng cách kiểm tra `req.body` thô.
Test thật qua Docker + script Node + Claude Browser (đặt/xóa/sửa GA4 qua cả API lẫn UI, xác
nhận script gtag đúng ID ở `<head>` sau khi publish, vòng khép kín Dashboard→API→reader),
không hồi quy 88/88 test cũ. Còn lại của P4: F12 (dashboard Creator), F13 (dashboard Admin).

**P4 — F12 (dashboard Creator: danh sách/trạng thái/dung lượng/lượt mở-xem/lọc) — ĐÃ XONG
(2026-09-17)**, xem chi tiết ở MEMORYBANK.md: phát hiện bảng `analytics_events`/`daily_stats`
+ RLS đã có sẵn từ schema P1 nhưng chưa dùng — chỉ cần 1 hàm SECURITY DEFINER mới
(`public_record_book_event`, migration 0011) cho đường ghi công khai không đăng nhập, còn
đường đọc của Creator dùng thẳng RLS có sẵn. Thêm `GET :id/stats`, `POST
:permalink/events`, mở rộng danh sách sách trả kèm dung lượng/lượt mở/lượt xem 30 ngày. FE:
port `XSelect` từ Vue sang React (đúng Ưu tiên 2 của skill XDS, không dùng `<select>` gốc) cho
bộ lọc trạng thái + ô tìm theo tiêu đề trên dashboard, thêm card "Statistics" (dung lượng +
30 ngày + bảng theo ngày) trên trang chi tiết sách. Phát hiện + sửa 1 bug thật khi test (không
phải đọc code đoán ra): cột ngày trả nguyên `stat_date` dạng ISO datetime đầy đủ thay vì chỉ
ngày — sửa ở FE, rebuild lại `web`. Test thật qua Docker + script Node + Claude Browser: tạo
tenant/gán quyền creator cho tài khoản test qua API thật, lọc/tìm trên dashboard (kể cả
trường hợp rỗng đúng `XEmptyState type="no-result"`), lật trang thật trên reader công khai và
xác nhận `POST .../events` ghi đúng vào `daily_stats` (khớp số lần lật), card thống kê trên
trang chi tiết hiển thị đúng số liệu thật — không hồi quy 88/88 test cũ. Còn lại của P4: F13
(dashboard Admin).

**P4 — F13 (dashboard Admin: tenant/tài khoản/sách/job lỗi/thống kê/audit log) — ĐÃ XONG
(2026-09-17)**, xem chi tiết ở MEMORYBANK.md: mọi bảng nghiệp vụ đã có sẵn RLS `*_admin_all`
từ P1, chỉ thiếu tầng API đọc xuyên tenant — thêm 6 endpoint GET mới (`tenants`, `users`,
`books`, `jobs`, `stats`, `audit-logs`) + 2 endpoint đổi trạng thái (tạm ngưng tenant/khóa tài
khoản, có ghi audit log). Phát hiện và sửa 1 bug chặn hoàn toàn đăng nhập Admin thuần (tài
khoản không có membership tenant nào bị kẹt ở lỗi "không có tenant" vì FE bỏ qua
`me.isSystemAdmin`) trước khi có thể làm tiếp — nếu không sửa, `admin@misa.local` sẵn có
trong seed sẽ không bao giờ vào được `/admin`. Phát hiện + sửa 1 bug thật khi test (không
phải đọc code đoán ra): dùng lại 1 tham số SQL (`$2`) cho 2 cột khác kiểu (`uuid` vs `text`)
trong cùng câu `INSERT audit_logs` gây lỗi 500 khi bấm nút thật trên UI — Postgres suy luận
kiểu tham số mâu thuẫn ngay lúc parse câu lệnh. Test thật qua Docker + Claude Browser: đăng
nhập Admin thuần vào thẳng `/admin`, xem đúng dữ liệu thật (74 tenant/75 tài khoản/54 sách),
tạm ngưng/kích hoạt lại 1 tenant và khóa/mở 1 tài khoản qua UI thật (bắt được lỗi 500 nêu
trên, sửa, xác nhận lại thành công + audit log đúng), lọc job theo trạng thái, tìm kiếm
sách, resize mobile 375×812 không vỡ layout — không hồi quy 88/88 test cũ.

Đến đây P4 đã hoàn tất hyperlink, GA4, dashboard và Admin; F10 Mức B có baseline embedded-media
an toàn nhưng vẫn chờ corpus PDF MISA audio/video để nghiệm thu codec thật; F10 Mức C chủ động bỏ
qua theo đúng PLAN.md, không tự nhận là đã làm.

**F13-rút gọn (2026-09-17)**: người dùng phản hồi Admin dashboard "phức tạp quá" (Admin dùng
không phải dân kỹ thuật) — rút Tổng quan còn 2 số (Số sách đã đăng + Lượt mở), bỏ hẳn các
bảng Tenants/Accounts/Job lỗi/Audit log khỏi UI, thay bằng 1 danh sách sách đã đăng chi tiết
(Tên sách/Người đăng/Ngày đăng/Số lượt xem, Xem-Sửa gộp 1 nút, Xóa mềm, tick chọn xóa hàng
loạt, lọc khoảng ngày đăng, phân trang 10/20/50). Thêm migration `0012_book_publish_delete.sql`
(cột `published_at` đặt chính xác lần đầu publish + `deleted_at` cho xóa mềm), endpoint mới
`DELETE /admin/books/:id`, và port `XDatePicker` (Ưu tiên 2 theo skill XDS) cho bộ lọc khoảng
ngày. Test thật qua Docker + Claude Browser: xóa đơn/xóa hàng loạt, đổi trang/đổi số dòng,
lọc ngày, điều hướng Xem/Sửa sang trang chi tiết Creator qua `?tenantId=` override — không hồi
quy 88/88 test cũ. Chi tiết đầy đủ xem MEMORYBANK.md mục "F13-rút gọn".

**P5 — tiến độ (2026-09-17)**: bắt đầu chạy ma trận nghiệm thu bên dưới. Đã PASS bằng test
thật (xem chi tiết MEMORYBANK.md mục "P5 — UAT và phát hành"): Jobs (Redis restart giữa job,
tự phục hồi không cần can thiệp), Giới hạn (PDF mã hoá/hỏng không crash, vượt dung lượng trả
413), Quyền (chặn dò thống kê chéo tenant), Replace (publish đồng thời vẫn nhất quán), Restore
(backup DB + storage khôi phục đúng vào môi trường tách biệt, đối chiếu row-count và checksum
khớp 100%), Mobile (giả lập qua trình duyệt: Login/Admin/Chi tiết sách/Reader ở 375×812 và
812×375 không vỡ layout, copy link/mã nhúng hoạt động thật). Ghi nhận thêm 1 khoảng trống thật
(không phải lỗ hổng): endpoint tải PDF công khai chưa hỗ trợ HTTP Range request. **Tìm và SỬA 2
bug thật**: (1) FlipBook hiển thị trắng/cắt nội dung khi xoay ngang màn hình thấp — do
`.flipbook-book` thiếu ràng buộc `max-height` khiến thư viện `react-pageflip` đo sai kích thước
khung chứa; đã sửa trong `globals.css`. (2) Trang PDF có cờ `/Rotate` (90/180/270) hiển thị lộn
ngược ~180° trong reader — do pipeline convert (`pdf-worker`) xoay chồng 2 lần (pypdfium2 đã tự
xoay đúng khi render, nhưng code vẫn gửi rotation gốc cho frontend xoay thêm lần nữa); đã sửa
trong `services/pdf-worker/app/convert.py`. Cả 2 bug đều đã rebuild container liên quan, test
lại bằng mắt thật qua Claude Browser + chạy đủ bộ test hồi quy sau khi sửa (không hồi quy). Đã
hoàn thành thêm các hạng mục: PDF/Tương tác (kiểm tra mắt `sample_rotated_mixed.pdf`/
`sample_scanned_like.pdf`, đối chiếu PDF gốc), Performance (100 phiên đọc đồng thời thật,
100/100 thành công, p95=601ms, API khoẻ sau tải), Embed (nhúng cross-origin thật qua origin
khác hẳn, không bị chặn, tương tác bình thường trong iframe). Đã tạo bản DRAFT hồ sơ handoff
đầy đủ [handoffs/HF-20260917-01.md](handoffs/HF-20260917-01.md) (theo mẫu HANDOFF.md) — chờ
người dùng xác nhận "ổn rồi" để chuyển sang `stable` + commit + gán tag. Còn lại CHƯA làm:
Mobile trên thiết bị thật, share-cancel (Social/GA), lịch backup định kỳ chính thức — điều kiện
đi tiếp của P5 ("người dùng xác nhận bản ổn định và hồ sơ handoff đầy đủ") chưa đạt.

**Quyết định 2026-09-17 (chỉ đạo người dùng)**: ưu tiên bản Docker chạy ổn định trước; việc
deploy thật lên Google Cloud Run (hoặc bàn giao đội DevOps MISA tự triển khai trên hạ tầng công
ty) để SAU, chỉ làm khi bản Docker đã được xác nhận ổn định. Đã cài sẵn `gcloud` CLI và đăng
nhập (tài khoản tuanbui88vn@gmail.com, project dự kiến `prapplication-479309`) để sẵn sàng khi
cần, nhưng CHƯA tạo bất kỳ tài nguyên GCP nào (tránh phát sinh phí khi chưa cần). Đã xác định
qua đọc code: muốn chuyển sang Cloud Run cần thêm object storage (GCS/S3-compatible) cho CẢ 3
service `apps/api` + `apps/worker-convert` + `services/pdf-worker` (hiện cả 3 đều đọc/ghi trực
tiếp qua đường dẫn đĩa dùng chung `STORAGE_ROOT`, không qua API/object storage — phạm vi lớn
hơn 1 adapter đơn thuần), cùng phương án Redis quản lý (Memorystore) hoặc VM riêng cho
dispatcher/worker-convert. Việc này để dành cho khi thực sự bắt tay triển khai.

## Ma trận nghiệm thu bắt buộc
| Nhóm | Tình huống và kết quả mong muốn |
|---|---|
| PDF | Tiếng Việt/font nhúng, scan, trang xoay/ngang/dọc/lẫn kích thước, trong suốt; đối chiếu ảnh với PDF gốc |
| Giới hạn | File hỏng, sai MIME, PDF mã hóa, vượt quota/trang/dung lượng; báo lỗi, không crash hệ thống |
| Jobs | Kill worker, restart Redis, upload lại, job lặp; một revision hợp lệ, không publish thiếu trang |
| Mobile | Màn 320 px, notch, xoay màn, keyboard/focus, tablet; mặc định lật đơn trên mobile, không tràn toolbar |
| Performance | Mạng 4G mô phỏng có thông số ghi lại; đọc dài trên máy ít RAM; tải 100 phiên đọc giả định |
| Quyền | Creator A/B cùng tenant và khác tenant; đổi ID API/asset/job/stats vẫn bị chặn; Admin được audit |
| Protection | Trước/sau unlock, đổi mật khẩu, unpublish, URL cũ, cache/CDN, embed; không lộ nội dung cho session không hợp lệ |
| Download | Tắt cả nút và API; thử direct URL, Range request, storage key; không cấp byte PDF gốc |
| Replace | Đổi 100 trang thành 40 trang; job lỗi; publish đồng thời; link cũ không đổi; không trộn revision |
| Tương tác | Link ngoài/nội bộ, rotation/crop, zoom; audio/video supported phát sau click và dừng khi rời trang |
| Social/GA | Link preview public/protected, share cancel, popup block; GA event không trùng; dashboard không lẫn tenant |
| Embed | Cùng origin/cross-origin, cookie bị chặn, mobile, fullscreen, password; fallback rõ ràng |
| Restore | Khôi phục DB + object + đúng image digest ở staging; quyền/mật khẩu/link/PDF còn nguyên |

Không tự viết “pass” trước khi thực hiện. Mỗi mốc lưu build/commit, môi trường, dữ liệu mẫu, kết quả và lỗi còn mở.
Không khóa phiên bản stable khi còn lỗi mất dữ liệu, vượt quyền, lộ PDF bảo vệ hoặc publish sai revision.

## Mốc handoff dự kiến
- H0 / planning: chỉ chốt tài liệu nếu người dùng đồng ý; chưa có bản ứng dụng để rollback.
- H1 / core: upload → đọc → link ổn định.
- H2 / publishing: protection + replace + download + embed.
- H3 / v1.0-core: UAT + vận hành, tài liệu rõ phần social còn phụ thuộc.
- H4 / integrations: social trực tiếp đã kiểm chứng.

Tên/tag thực chỉ tạo sau khi người dùng nói “ổn rồi” cho phiên bản cụ thể và xác minh chất lượng tương ứng.

## Tiếp quản Codex — 21/09/2026
- Đợt 1: SEC-02 verified; SEC-01/03/UI-01 verified một phần, còn điều kiện security trong docs/audits/20260921-codex-followup.md.
- Đợt 2 core: PDF process isolation, deadline/budgets, stream upload, tenant source quota, job lease/fencing/retry và EDGE-01 đã có code + Docker regression.
- Đợt 2 storage: accounting tổng source + derived asset, quota transaction-safe khi worker finalize,
  đối soát physical usage và collector attempt mồ côi có retention đã được thêm ở migration 0020.
  Redis-down rate limit nay co deadline, fallback bounded va chong password spraying theo source.
- Chưa chốt stable; tiếp theo là reader/security residual, tính đúng đắn nội dung và vận hành theo báo cáo tiếp quản.

## Candidate Codex 21/09/2026 — hoàn tất các residual ưu tiên

Đã hoàn tất reader session scoped/revision-pinned, analytics idempotent, cache transition
an toàn, CropBox/Rotate + URL sanitizer, thumbnail chia sẻ 16:9, public URL canonical,
windowed image loading/mobile accessibility, phân trang keyset Admin và runbook backup/restore.
Tất cả được kiểm chứng trên Docker stack riêng; xem `MEMORYBANK.md` và
`handoffs/HF-20260921-02.md`. Mốc này là **candidate**, không phải stable: chờ người dùng
xác nhận và vẫn còn device/mobile thật, proxy/CDN, retention và object storage production.

## Candidate Codex 21/09/2026 — storage accounting và degraded-security

Candidate được nâng thêm migration `0020_storage_accounting.sql`: quota tenant tính cả PDF nguồn
và asset render, worker khóa theo tenant trước khi commit derived assets, đối soát logical/physical
usage, và chỉ xóa temporary upload hoặc `attempts/` không được DB tham chiếu sau retention. Redis
rate-limit có command deadline 500ms, fallback per-process bị giới hạn bộ nhớ, cap theo source để
chặn password spraying, và HMAC email/IP trước khi ghi key. Các kết quả thực tế và điều kiện chưa
đủ để stable được lưu trong handoff candidate kế tiếp; vẫn cần device matrix thật, kiểm chứng
proxy/CDN theo topology DevOps, PDF audio/video mẫu và object storage/HA trước production MISA.
Hồ sơ candidate hiện hành: `handoffs/HF-20260921-03.md`; chưa gắn stable tag.

## Candidate Codex 21/09/2026 — Dashboard HttpOnly session / CSRF

Commit `882edd457d6bc76f523fcd617f4b829802929006` hoàn tất residual Dashboard JWT browser: cookie
HttpOnly cùng origin, CSRF cho thao tác ghi, CORS origin explicit và logout không cache; Bearer API
vẫn tương thích. Docker edge cô lập đạt 125 assertion qua các nhóm cookie (13), P1 (14), P2 (21),
P3 (35), F16 (12), security (14), media (16), cùng production builds. Đây là candidate để DevOps
MISA dựng Docker pilot/staging; không phải stable. Yêu cầu trước production: TLS với
`AUTH_COOKIE_SECURE=true`, topology proxy đúng, secret manager, backup restore drill, device matrix
và corpus PDF MISA. Xem `handoffs/HF-20260921-06.md`.
