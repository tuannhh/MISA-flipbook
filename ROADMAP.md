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
  code) ở MEMORYBANK.md. Giới hạn còn mở khác: chưa có mật khẩu bảo vệ, chưa có trang Admin
  trên FE, chưa có test tự động (Playwright) cho FE.

P6 có thể khảo sát từ P0, nhưng không khóa tiến độ đọc sách vào thời gian Meta/LinkedIn xét duyệt. Mốc v1.0-core đạt P5 phải ghi rõ social trực tiếp chưa hoàn tất nếu P6 còn mở; không ghi toàn bộ yêu cầu đã xong.

## Backlog ưu tiên
P0: thu thập PDF mẫu → benchmark PDFium/pypdf → annotation/media inventory → thử hiệu ứng + JPEG fallback trên máy yếu → quyết định ADR.
P1: schema/permission tests trước → API auth → upload private → dispatcher/outbox → worker resource limits.
P2: manifest → reader đơn trang → spread desktop → title/thumbnail/metadata → draft/publish.
P3: protection end-to-end → replace/publish atomic → download guard → embed và share.
P4: dashboard/events → media support đã xác minh → Admin operations/audit.
P5: fix lỗi theo severity → load/restore → staging MISA → nghiệm thu → handoff ổn định.

Backlog chưa gán mốc P cụ thể (ghi nhận 17/09/2026, xem PLAN.md mục 8 để biết chi tiết
và câu hỏi mở cần làm rõ trước khi ước lượng): F15 ảnh nền cho sách; F16 công tắc
Publish ⇄ Private trên sách đã publish (giống "chỉ mình tôi"/YouTube Private/Google
Drive Restricted — đã làm rõ ý với người dùng, còn 2 câu hỏi nhỏ mở về Admin và ưu
tiên với mật khẩu F05 — khả năng liên quan tới P3 vì cùng nhóm "quản lý xuất bản");
F17 tham khảo props/events zoom in/out của flipbook-vue để bổ sung zoom cho reader (`apps/web/src/components/
FlipBook.tsx`), khả năng liên quan tới P2 polish hoặc P4 (tương tác đọc).

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
