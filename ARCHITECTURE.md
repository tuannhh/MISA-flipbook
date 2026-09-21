# Kiến trúc đề xuất
Trạng thái: thiết kế, chưa benchmark hoặc khóa phiên bản dependency.

## 1. Thành phần
| Thành phần | Đề xuất | Vai trò |
|---|---|---|
| Web quản trị + trang public | Next.js / React / TypeScript | Dashboard, editor, HTML metadata public |
| Reader | Module JS nhẹ, ảnh trang + overlay | Không tải PDF gốc; hiệu ứng lật trang và fallback |
| API | NestJS / TypeScript | Auth, tenant, ownership, publish, metadata, asset authorization |
| Điều phối | BullMQ + Redis, tiến trình Node riêng | Retry, timeout, concurrency, trạng thái job |
| PDF worker | Python + PDFium/pypdf ứng viên | Render ảnh, extract annotations/text/media; lựa chọn cuối qua PoC/license review |
| Database | PostgreSQL | Metadata, revisions, membership, audit, thống kê tổng hợp |
| Storage | Adapter local pilot / S3-compatible production | PDF gốc private, derivatives immutable theo revision |
| Reverse proxy | Nginx | TLS, route, body limits, delivery asset nội bộ |

PDF worker nhận công việc từ dispatcher qua giao tiếp nội bộ đã xác thực; không giả định Python đọc trực tiếp giao thức BullMQ. PostgreSQL giữ job ledger/outbox bền vững; Redis là hàng đợi, không là nguồn duy nhất. Sau restart, reconciler đưa job dang dở trở lại hàng đợi, có idempotency key theo revision + pipeline version.

Thư viện StPageFlip là ứng viên PoC cho hiệu ứng; bọc qua adapter để thay thư viện hoặc dùng slide đơn giản. Không phụ thuộc PDF.js mới nhất trên máy mobile cũ: Mozilla ghi rõ cả build legacy cũng có sàn trình duyệt; pipeline ảnh phía server giúp tách khả năng đọc khỏi parser ở client. Các bản package/image chỉ được pin sau kiểm chứng, không dùng latest cho production.

## 2. Luồng chuyển đổi
Upload → kiểm tra file/quota → lưu source private → tạo revision + job/outbox → queue → worker sandbox → render/extract → kiểm tra manifest → ready → người tạo preview → publish.

- Upload streaming/multipart, kiểm tra kích thước, MIME + chữ ký PDF, checksum; giới hạn trang và tài nguyên khi parse.
- Pilot: PDF hỏng hoặc cần mật khẩu giải mã thì báo lỗi rõ; không nhầm mật khẩu file PDF với mật khẩu xem flipbook.
- Worker không có outbound network mặc định, không chạy JavaScript PDF, non-root, giới hạn CPU/RAM/thời gian/dung lượng scratch.
- Chuyển từng trang, không giữ toàn bộ bitmap trong RAM; tạo thumbnail và ảnh nhiều kích thước. WebP + JPEG fallback; ảnh chất lượng cao tải theo zoom.
- Link/text/media có tọa độ chuẩn hóa sau CropBox/rotation, cùng hệ tọa độ với bitmap.
- PDF có media URL không được server tự fetch tùy ý; nếu cần fetch/transcode ở giai đoạn sau phải có allowlist, kiểm tra IP/redirect chống SSRF và job riêng.
- Ghi lỗi và cảnh báo theo trang/đối tượng; giới hạn số retry; worker chết không publish dữ liệu dở.
- Derivative path chứa tenant/book/revision, không dùng tên file người dùng để tạo đường dẫn filesystem.
- Có kiểm soát quota tổng cả source, ảnh, media và bản cũ; cleanup chỉ thu gom dữ liệu không còn được giữ bởi revision/backup/handoff.

Manifest chứa kích thước từng trang, các biến thể ảnh, text/links/media và warnings. Danh sách asset phải được cấp quyền như nội dung sách.

## 3. Mô hình dữ liệu
| Bảng | Dữ liệu chính |
|---|---|
| tenants | id, name, status, quotas, default_ga_id |
| users | id, identity/password_hash, is_system_admin, status |
| memberships | tenant_id, user_id, role=creator, status |
| books | id, tenant_id, owner_id, title, immutable_permalink, public_suffix, published_revision_id, status |
| book_settings | tenant_id, book_id, password_hash, access_epoch, allow_download, ga_id, thumbnail_asset_id, public_preview |
| revisions | id, tenant_id, book_id, revision_number, source_key, checksum, pipeline_version, manifest_key, state |
| assets | id, tenant_id, book_id, revision_id, kind, object_key, content_type, bytes |
| jobs / outbox | tenant_id, revision_id, idempotency_key, state, attempts, progress, error |
| audit_logs | actor, tenant_id, action, resource_id, time, metadata đã lọc bí mật |
| analytics_events / daily_stats | tenant_id, book_id, revision_id, event/page/date, session pseudonym/aggregates |
| social_connections (giai đoạn sau) | user/tenant/platform, encrypted_token_reference, scopes, expiry |

Khóa ngoại ghép gồm tenant_id để ngăn liên kết asset/revision khác tenant; unique permalink toàn hệ thống; published_revision_id phải trỏ về revision của chính book và tenant. UUID nội bộ tách khỏi permalink công khai.

## 4. Cách ly tenant và cấp quyền
Middleware xác thực lấy membership từ server; không tin tenant_id/owner_id do client gửi. Quy tắc Creator = tenant hợp lệ AND owner_id bằng user hiện tại. Query, mutation, export, stats, job, storage đều áp dụng cùng chính sách.

PostgreSQL Row Level Security là lớp bổ sung. Runtime không dùng superuser, table owner hoặc BYPASSRLS; cân nhắc FORCE ROW LEVEL SECURITY. Tenant/user context gắn trong transaction, tránh rò qua connection pool. Admin dùng nhánh quyền kiểm soát và audit rõ, không mở BYPASSRLS cho mọi request. Public lookup chỉ trả metadata được phép và cấp quyền reader phạm vi một book; không mở policy SELECT toàn bộ dữ liệu của tenant cho anonymous.

Object storage private. API kiểm tra trạng thái publish, book access và revision rồi proxy nội dung qua internal redirect hoặc URL ký ngắn hạn. Không public prefix ảnh của sách có mật khẩu. URL ký vẫn có cửa sổ sử dụng tới expiry; với yêu cầu thu hồi tức thời dùng gateway kiểm tra mỗi request. Cache key chứa revision và ngữ cảnh quyền; phản hồi bảo vệ không được cache công khai.

Mật khẩu hash Argon2id, rate-limit theo sách/IP, session mở khóa chỉ cho một sách, có TTL và access_epoch. Đổi mật khẩu/unpublish tăng epoch; hủy session cũ; byte đã tải về không thu hồi được. Không để mật khẩu/token dài hạn trong URL, analytics hoặc log.

## 5. Revision và xuất bản
Book và permalink tồn tại lâu dài. Nội dung PDF nằm ở revisions bất biến; settings là bản ghi riêng.
Ví dụ đang publish r1: upload r2 → converting → ready → preview → giao dịch cập nhật published_revision_id r2. Worker r2 lỗi thì r1 tiếp tục phục vụ. Client ghim revision trong một phiên đọc để không trộn trang r1/r2; có thông báo bản mới khi phù hợp.

Publish dùng optimistic concurrency/expected current revision để hai thao tác không ghi đè lẫn nhau. Chỉ latest candidate được publish nếu chủ sách chọn; job cũ hoàn tất trễ không tự chiếm bản phát hành.
Replace giữ title, thumbnail tùy chỉnh, GA, mật khẩu, download và URL; annotation từ PDF phải trích lại theo PDF mới. Nếu thumbnail tự sinh thì preview bản mới trước publish. Link ?page=N ngoài số trang mới được đưa về trang hợp lệ có thông báo.
Rollback nội dung bằng đổi pointer về revision ready cũ; không phục hồi database toàn hệ thống chỉ để thay một PDF.

## 6. Reader và hiệu năng
Ưu tiên tải trang đang đọc, prefetch 1–2 trang kề, hủy request không cần, giải phóng ảnh xa, giới hạn texture/DPR trên máy yếu. HTML text layer nếu trích xuất được giúp chọn text và accessibility; OCR chưa bao gồm.
Reader ở embed hoặc mobile có fallback nút trước/sau. Không autoplay audio/video. Với iframe cross-site bị chặn cookie, cho mở reader top-level để nhập mật khẩu hoặc thiết kế grant ngắn hạn trong bộ nhớ; không đưa mật khẩu vào snippet iframe.
Dashboard và reader tách bundle; reader không tải thư viện editor. Metadata public server-rendered; asset nội dung qua đường kiểm soát quyền.

Mục tiêu tạm cho PDF benchmark 100 trang/20 MB sau xử lý: trang đầu p75 ≤3 giây trên profile 4G định nghĩa tại PoC; chuyển trang đã prefetch p95 ≤300 ms; không crash qua 100 lần lật trên máy mobile mục tiêu. Hiệu ứng mất bao lâu phải đo riêng với thời gian tải ảnh. Chốt SLO sau khi đo, không xem số này là kết quả.

## 7. Analytics và tích hợp
GA4 Measurement ID đã validate; event book_open, page_view_book, link_click, media_play, download_click, share_click. Tránh page_view trùng giữa router và embed. Không gửi password, token, nội dung riêng tư hoặc email làm tham số.
Dashboard nội bộ có event endpoint riêng, rate-limit/dedupe/filter bot, tổng hợp theo tenant/owner. “Lượt mở” không phải số người thật tuyệt đối; “share_click” không chứng minh đã đăng thành công. Định nghĩa session, múi giờ và retention trước UAT. Đề xuất lưu raw 30 ngày, aggregate 12 tháng, cần MISA xác nhận.
Social OAuth dùng state, PKCE khi phù hợp, token mã hóa ở server, có revoke/expiry; API quyền nào chưa được cấp thì UI thể hiện chưa kết nối.

## 8. Docker pilot → server MISA
Người dùng đã chốt làm Docker trước; DevOps tự quyết định sizing và hạ tầng server MISA khi triển khai thật. Các thông số dưới đây chỉ dành cho đo thử, không phải yêu cầu mua/cấp server.
Pilot đề xuất Linux containers, 4 vCPU/8 GB RAM, SSD dung lượng tính theo corpus; thông số để đo thử, không phải sizing production. Compose service: proxy, web, api, dispatcher, pdf-worker, postgres, redis. Local storage nằm trong volume riêng; khi lên server chuyển adapter S3 hoặc volume dùng chung đã đánh giá.
Compose pilot chạy Nginx non-root ở cổng `8080`; API và web chỉ ở mạng Compose. Proxy route web tại
`/`, route API tại `/api`, stream upload không buffer, giới hạn request body 201 MB (API vẫn là lớp
kiểm tra kích thước/định dạng cuối cùng), không cấu hình cache riêng và để API quyết định
`Cache-Control` cho asset protected. Proxy ghi đè `X-Forwarded-For` bằng TCP peer rồi API tin đúng
một hop (`TRUST_PROXY_HOPS=1`), vì vậy client không thể tự đưa IP giả để lách rate limit. Response
edge có `nosniff`, Permissions-Policy tối thiểu và Referrer-Policy để query reader-grant không đi
sang hyperlink cross-origin. Không đặt `X-Frame-Options` vì `/embed` là một tính năng công khai.

Đây là topology Docker pilot, không phải cấu hình TLS production. Khi MISA đặt load balancer/TLS
gateway phía trước, DevOps phải giữ API không public, xác thực proxy upstream và đặt chính xác
`TRUST_PROXY_HOPS` hoặc allowlist proxy. Không copy giá trị `1` một cách máy móc nếu có thêm hop;
sai topology có thể khiến rate-limit nhận IP giả. Có healthcheck, readiness, graceful shutdown,
resource limits, restart policy; migration chạy một job trước release. Secret ở secret store/env
ngoài Git; `.env.example` chỉ chứa placeholder.

Chuyển lên MISA:
1. Chốt OS/Linux container support, domain/TLS, reverse proxy, registry, DNS, firewall, SSO và kho file.
2. Build một lần; đẩy image theo digest; scan dependency/license và image; cấu hình staging.
3. Khôi phục bản sao DB + objects ở staging, chạy migration, smoke test, load test và thử rollback.
4. Backup đồng bộ trước cutover; nếu di chuyển dữ liệu đang hoạt động cần read-only/delta sync và checksum.
5. Chuyển traffic sau kiểm thử; quan sát lỗi API, queue lag, worker OOM, storage growth và latency.

Backup DB và objects độc lập với container, có mã hóa và bản ngoài host. Pilot đề xuất RPO 24h, RTO 4h; phải đo restore thực tế trước cam kết. Nếu cần HA/SLA cao hơn, tách DB, storage, tăng API/worker sau benchmark. Docker Compose đơn host không tự bảo đảm HA.
