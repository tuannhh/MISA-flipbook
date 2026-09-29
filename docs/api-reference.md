# API Backend (NestJS `apps/api`) — danh sách đầy đủ

Base URL qua proxy: `/api` (Nginx bỏ tiền tố `/api`). Trong tài liệu này đường dẫn viết **không** có `/api`.
Tổng cộng **44 endpoint** (41 của API NestJS + 3 nội bộ của pdf-worker).

## Quy ước truy cập

| Nhóm | Xác thực | Mạng |
|---|---|---|
| `public/**`, `health` | Không cần (sách có mật khẩu/riêng tư cần token đọc) | Ai cũng gọi được (qua `public-edge` :8081) |
| `auth/**` | Không (chính là bước lấy phiên) | **Chỉ IP MISA** (`MISA_ALLOWED_CIDRS`) |
| `me`, `jobs/**`, `books/**` | JWT (Bearer hoặc cookie HttpOnly + `x-csrf-token` khi ghi) | Chỉ IP MISA |
| `books/**` | Thêm header `x-tenant-id` (`@RequireTenant`); RLS chỉ cho chủ sách | Chỉ IP MISA |
| `admin/**` | JWT của **System Admin** (`assertAdmin`), xuyên tenant | Chỉ IP MISA |

Mọi request JSON đi qua `ValidationPipe` (`whitelist` + `forbidNonWhitelisted`): field lạ bị 400.

## 1. Sức khỏe

| Method | Path | Mô tả |
|---|---|---|
| GET | `/health` | Kiểm tra API + kết nối DB (`{status:"ok"}`) |

## 2. Xác thực — `auth`

| Method | Path | Body | Mô tả |
|---|---|---|---|
| POST | `/auth/login` | `{email, password}` | Đăng nhập; trả `{accessToken}` và set cookie phiên HttpOnly + cookie CSRF. Giới hạn số lần sai theo (IP,email) và theo IP (Redis) → 429 |
| POST | `/auth/logout` | — | Xóa cookie phiên |

## 3. Người dùng hiện tại / job

| Method | Path | Mô tả |
|---|---|---|
| GET | `/me` | Thông tin người dùng + danh sách tenant (membership) |
| GET | `/jobs/:id` | Trạng thái job convert (`queued/processing/done/failed`, tiến độ, lỗi) |

## 4. Sách của Creator — `books` (cần `x-tenant-id`)

| Method | Path | Body / Query | Mô tả |
|---|---|---|---|
| GET | `/books` | — | Danh sách sách của tôi |
| POST | `/books` | `{title}` | Tạo sách (sinh permalink `slug-suffix`) |
| GET | `/books/:id` | — | Chi tiết sách |
| PATCH | `/books/:id` | `{title?}` | Đổi tiêu đề |
| POST | `/books/:id/upload` | multipart `file` (PDF) | Upload PDF → tạo revision + job. Kiểm `%PDF-`, `%%EOF`, quota tenant, ≤ `PDF_MAX_BYTES` |
| GET | `/books/:id/revisions` | — | Các bản revision |
| GET | `/books/:id/preview` | `?revisionId` | Manifest xem trước (chưa publish) |
| GET | `/books/:id/assets/:assetId` | — | Ảnh trang/thumbnail cho Dashboard |
| POST | `/books/:id/publish` | `{revisionId}` | Publish một revision (đưa sách ra đường đọc công khai) |
| GET | `/books/:id/stats` | `?days` | Thống kê lượt xem theo ngày |
| GET | `/books/:id/settings` | — | Cài đặt: tải xuống, hiển thị, mật khẩu (chỉ cờ), GA4, thumbnail… |
| PUT | `/books/:id/settings` | `{allowDownload?, visibility?, thumbnailAssetId?, password?, removePassword?, gaId?…}` | Cập nhật cài đặt |
| POST | `/books/:id/share-thumbnail` | multipart `file` (PNG/JPEG/WebP ≤ 8 MB) | Ảnh chia sẻ mạng xã hội |
| POST | `/books/:id/background` | multipart `file` (ảnh) | Ảnh nền trình đọc |
| GET | `/books/:id/background` | — | Lấy ảnh nền |
| DELETE | `/books/:id/background` | — | Xóa ảnh nền |

## 5. Quản trị — `admin` (chỉ System Admin)

| Method | Path | Body / Query | Mô tả |
|---|---|---|---|
| POST | `/admin/tenants` | `{name}` | Tạo tenant |
| GET | `/admin/tenants` | — | Danh sách tenant |
| PATCH | `/admin/tenants/:id` | `{defaultGaId?, status?: active\|suspended}` | Sửa GA4 mặc định / tạm ngưng tenant |
| POST | `/admin/users` | `{email, password(≥8), isSystemAdmin?}` | Tạo người dùng |
| GET | `/admin/users` | — | Danh sách người dùng + membership |
| PATCH | `/admin/users/:id/status` | `{status: active\|disabled}` | Vô hiệu/kích hoạt |
| POST | `/admin/memberships` | `{tenantId, userId}` | Gán người dùng vào tenant |
| GET | `/admin/books` | `?limit&cursor&from&to` | Toàn bộ sách xuyên tenant (phân trang cursor) |
| DELETE | `/admin/books/:id` | — | Xóa mềm sách |
| GET | `/admin/jobs` | `?state` | Danh sách job convert |
| GET | `/admin/stats` | — | Thống kê hệ thống |
| GET | `/admin/audit-logs` | `?limit` | Nhật ký kiểm toán |

## 6. Đọc công khai — `public/books` (đường duy nhất lộ ra Internet)

Chỉ sách **đã publish**; sách riêng tư chỉ chủ sở hữu/Admin đọc được; sách có mật khẩu cần `?token=` (readerToken).

| Method | Path | Body / Query | Mô tả |
|---|---|---|---|
| GET | `/public/books/:permalink` | `?token` | Manifest đọc: danh sách trang, ảnh, link, media, `readerToken` |
| GET | `/public/books/:permalink/metadata` | — | Tiêu đề + có ảnh xem trước không (dùng cho Open Graph) |
| GET | `/public/books/:permalink/preview-image` | — | Ảnh chia sẻ mạng xã hội |
| GET | `/public/books/:permalink/background` | `?token` | Ảnh nền |
| GET | `/public/books/:permalink/assets/:assetId` | `?token` | Ảnh trang / thumbnail / media (hỗ trợ `Range` → 206) |
| GET | `/public/books/:permalink/download` | `?token` | Tải PDF gốc (nếu `allowDownload`), luôn `attachment` |
| POST | `/public/books/:permalink/events` | `{eventType: open\|page_view, page?}` | Ghi lượt mở / xem trang (chống trùng theo phiên) |
| POST | `/public/books/:permalink/verify-password` | `{password}` | Xác thực mật khẩu sách → `readerToken`; có khóa tạm khi sai nhiều lần |

## 7. Nội bộ pdf-worker (FastAPI, không publish port, mạng `sandbox`)

Chỉ `api`/`worker-convert` gọi, kèm `INTERNAL_API_TOKEN`.

| Method | Path | Mô tả |
|---|---|---|
| GET | `/internal/health` | Sức khỏe worker |
| POST | `/internal/convert` | Convert PDF → ảnh WebP trang + thumbnail + link + media |
| POST | `/internal/share-thumbnail` | Chuẩn hóa ảnh chia sẻ |
