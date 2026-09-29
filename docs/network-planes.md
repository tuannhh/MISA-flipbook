# Hai mặt phẳng mạng: nội bộ (IP MISA) và công khai (publish)

Áp dụng theo yêu cầu bộ phận an ninh thông tin MISA:

1. **BE chạy trên server MISA, chỉ cho IP MISA truy cập** vì chưa được kiểm tra an ninh (rủi ro: đẩy file shell
   thay vì PDF để chiếm quyền server).
2. **Publish ra domain public** giống CMS: người ngoài xem sách đã publish, nhưng không chạm được vào BE.

## Sơ đồ

```
Internet ──► :8081 public-edge ─(chỉ GET/HEAD đường đọc sách, POST events/verify-password)─► web + api /public/**
MISA LAN ──► :8080 proxy  ─(allow MISA_ALLOWED_CIDRS, deny all)─► web (Dashboard) + api (toàn bộ)
                                                        api ─► pdf-worker (mạng `sandbox`, không ra Internet)
```

| Mặt phẳng | Cổng | Ai vào được | Có gì |
|---|---|---|---|
| Nội bộ | `8080` (`INTERNAL_BIND`) | Chỉ `MISA_ALLOWED_CIDRS` | Login, Dashboard, tạo sách, **upload PDF**, publish, admin, toàn bộ API |
| Công khai | `8081` (`PUBLIC_EDGE_BIND`) | Ai cũng được | Chỉ `/{permalink}`, `/read/{permalink}`, `/…/embed`, `/_next/`, `/fonts/`, `/brand/`, `/api/public/books/**` |

## Ba lớp chặn (phòng thủ nhiều tầng)

1. **nginx nội bộ** (`infra/docker/proxy`): `allow <CIDR>; … deny all;` sinh từ `MISA_ALLOWED_CIDRS` bởi
   `40-allowlist.sh`. **Fail-closed:** thiếu biến, rỗng hoặc sai định dạng → proxy không khởi động (giá trị được
   whitelist ký tự nên không chèn được lệnh nginx).
2. **API guard** (`apps/api/src/common/network/network-plane.ts`): mọi đường trừ `/public/**` và `/health` yêu cầu
   `req.ip` (một hop tin cậy) nằm trong `MISA_ALLOWED_CIDRS`. Đứng trước auth và DB. Thiếu biến → API không khởi động.
   Lớp này giữ nguyên tác dụng dù nginx cấu hình sai hoặc API bị lộ trực tiếp.
3. **public-edge** (`infra/docker/public-edge`): allowlist đường dẫn **và** method. Không có `/api/auth`, `/api/books`,
   `/api/admin`, `/login`, `/dashboard`, `/admin`; không có upload (body tối đa 16 KB); rate limit theo IP.

## Chống upload shell thay vì PDF

- Chỉ nhận PDF: chữ ký `%PDF-1.x`/`2.x` ở đầu file **và** `%%EOF` trong 1 KiB cuối (chặn PDF nối thêm payload).
  Tên file và `Content-Type` do client gửi **không được tin và không dùng làm đường dẫn** (khóa lưu do server sinh).
- Không có đường xử lý DOC/DOCX; mọi định dạng khác bị 400.
- File không bao giờ được thực thi hay phục vụ nguyên trạng: chỉ tải xuống dạng `attachment` với `application/pdf`,
  kèm `X-Content-Type-Options: nosniff`.
- Chuyển đổi chạy trong `pdf-worker`: **mạng `sandbox` nội bộ (không ra Internet)**, filesystem chỉ đọc (+ tmpfs),
  `cap_drop: ALL`, `no-new-privileges`, user không phải root, giới hạn CPU/RAM/PID. Các container còn lại cũng
  `cap_drop: ALL` + `no-new-privileges`.
- Hệ quả: PDF hỏng/cắt cụt (thiếu `%%EOF`) bị từ chối ngay khi upload (400); PDF có `%%EOF` nhưng thân hỏng vẫn nhận
  và job convert báo `failed`. PDF có >1 KiB dữ liệu rác sau `%%EOF` sẽ bị từ chối (hiếm gặp với PDF hợp lệ).

## Cấu hình (`infra/docker/.env`)

| Biến | Ý nghĩa |
|---|---|
| `MISA_ALLOWED_CIDRS` | **Bắt buộc.** CIDR/IP của mạng MISA, phân tách bằng dấu phẩy (IPv4/IPv6). VD `203.0.113.0/24,198.51.100.10` |
| `INTERNAL_BIND` | IP LAN MISA của server để bind cổng 8080 (mặc định `127.0.0.1`) |
| `PUBLIC_EDGE_BIND` | Bind cổng 8081 (mặc định `127.0.0.1`; `0.0.0.0` khi đặt sau LB/WAF) |
| `PUBLIC_BASE_URL` | Domain public (VD `https://flipbook.misa.vn`). Dashboard sinh link chia sẻ / mã nhúng theo domain này (**đặt lúc build web**) |
| `PUBLIC_EDGE_API_UPSTREAM`, `PUBLIC_EDGE_WEB_UPSTREAM` | Nếu đặt public-edge trên máy DMZ riêng, trỏ về BE |

Lưu ý triển khai:
- Dev mặc định cho phép loopback + dải private để Docker Desktop chạy được. **Production phải thay bằng dải IP MISA thật.**
- Nếu có Load Balancer/WAF đứng trước cổng nội bộ, IP client nginx thấy là IP của LB: đưa IP LB vào allowlist chỉ khi
  LB tự nó đã giới hạn nguồn, hoặc cấu hình `real_ip` tương ứng.
- Đặt TLS ở LB/WAF trước `8081`; khi có HTTPS đặt `AUTH_COOKIE_SECURE=true`.
- Domain public trỏ về `8081`; **không** publish cổng 8080 ra Internet.

## Kiểm chứng

`tests/integration/network_planes.test.js` (58 kiểm tra): domain public đọc được sách đã publish, không có trang/API nội
bộ, không ghi/upload/đăng nhập kể cả có token hợp lệ, sách nháp không lộ; upload từ chối shell/PHP/JSP/ELF/PE/docx/file
rỗng/polyglot; guard API với IP ngoài danh sách; và (`NETPLANE_RECONFIGURE=1`) tạo lại proxy+API với CIDR giả để xác nhận
người ngoài bị 403 ở cổng nội bộ trong khi domain public vẫn đọc được.
