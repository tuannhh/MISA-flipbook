# Codex tiếp quản — rà Đợt 1 và củng cố pipeline PDF/job

Ngày 21/09/2026. Baseline của Claude: `745e28c`. Đây là bản candidate phục vụ review, chưa phải stable/handoff được người dùng duyệt.

## 1. Kết luận về các sửa đổi của Claude

Các sửa đổi có giá trị và đúng nguyên nhân của lỗi. Không cần bỏ đi hoặc thay framework. Tuy nhiên “test pass” của một ca không đồng nghĩa đóng mọi điều kiện bảo mật của finding.

| Finding | Kết luận kiểm tra lại | Còn phải nghiệm thu |
|---|---|---|
| SEC-01 | Protected responses hiện trả `private, no-store`, regression pass. | Public response cũ vẫn có freshness 1 giờ: chuyển Public → Private không thể thu hồi bản đã nằm ở cache. Chọn revalidation từ đầu hoặc auth trước cache + purge; kiểm chứng bằng proxy thật. Không tuyên bố đã có khai thác/lộ dữ liệu trên Docker. |
| SEC-02 | Chấp nhận. Kiểm tra DB + test suspend/membership đều đúng. | Giữ quyết định sản phẩm: suspend chặn quản trị Creator, public reader tiếp tục hoạt động. |
| SEC-03 | Redis atomic và phân biệt nguồn truy cập đúng. Thử hai TCP client Docker: nguồn A bị 429, nguồn B cùng email vẫn 401; giả X-Forwarded-For không vượt được khóa. | Chưa đủ chống password spraying nhiều email; fail-open khi Redis lỗi bỏ throttle hoàn toàn; chưa có command deadline rõ ràng. Đề xuất tầng giới hạn theo nguồn + cặp nguồn/tài khoản, fallback cục bộ có giới hạn và metric/cảnh báo. Không khóa cứng một tài khoản trên toàn hệ thống. |
| UI-01 | Sửa state giải quyết nguyên nhân vỡ ảnh; xác nhận bằng mã, không lặp lại kiểm chứng UI của Claude trong lượt này. | `setAccessToken(loginToken)` đưa JWT đăng nhập đầy đủ vào URL ảnh/nền/PDF. Cần token đọc giới hạn theo sách (không dùng được cho API quản trị, hạn ngắn, vẫn kiểm quyền DB) hoặc fetch Authorization + blob URL. Không dùng JWT đăng nhập làm query token. |
| QA-01 | CI đã thêm đúng các suite bị thiếu. | Việc sửa YAML chưa chứng minh GitHub Actions đã chạy xanh; backup/restore và handoff vẫn cần làm. |

Số liệu: 5 suite P1/P2/P3/F16/P5 là 96 assertion. Cộng security suite mới 14 là **110**, cộng RLS 13 là **123**. Đây là sửa cách cộng số, không phủ nhận kết quả Claude đã kiểm tra.

## 2. Các thay đổi Codex đã thực hiện

### PDF-01: cô lập thật từng tài liệu

FastAPI chỉ giám sát, không import PDFium. Mỗi tài liệu chạy trong một tiến trình Python riêng. Semaphore giới hạn admission (mặc định 1 tiến trình/instance), trả 503 khi bận để DB outbox lên lịch lại. Deadline diệt và thu hồi tiến trình con; không chỉ timeout HTTP rồi để parser tiếp tục ăn tài nguyên.

Tiến trình con đặt giới hạn address space 512 MiB, CPU time, kích thước file. Docker bổ sung init/reaping, bỏ capabilities, no-new-privileges, PID limit. Đây chưa phải sandbox chống mọi lỗ hổng native parser; network egress/read-only filesystem cần chốt cùng đợt vận hành.

Cơ sở: [PDFium không thread-safe, nên dùng processes](https://pypdfium2.readthedocs.io/en/stable/python_api.html#incompatibility-with-threading) và [Python subprocess lifecycle](https://docs.python.org/3/library/asyncio-subprocess.html).

### PDF-02: nhận file và xử lý có giới hạn

- PDF upload xuống thư mục tạm riêng trên storage volume, không buffer toàn bộ file trong API RAM.
- Xác thực + RLS ownership trước khi nhận body; giải phóng DB connection; kiểm tra lại quyền khi file nhận xong.
- SHA-256 đọc theo stream; adopt bằng rename trên cùng volume.
- Giới hạn 4 upload đồng thời mỗi API process, 120 giây nhận file, 200 MiB/file, 1 multipart file, không nhận field thừa.
- Dọn file tạm khi sai định dạng, quá kích thước, ngắt kết nối. Dọn source nếu transaction chắc chắn rollback; giữ lại nếu COMMIT không rõ kết quả để tránh xóa nhầm dữ liệu đã commit.
- Mặc định tối đa 500 trang, 8 triệu pixel/trang, chiều cao raster 8192 px, aspect ratio 12, 512 MiB tổng ảnh output/job; timeout parser 600 giây.
- Admission quota theo tenant: `quotas.source_bytes` (mặc định 10 GiB PDF nguồn), `quotas.pending_jobs` (mặc định 20). Serialize quota admission bằng advisory lock trong transaction ngắn.

**Không đánh đồng quota nguồn với toàn bộ dung lượng tenant:** ảnh đã render, attempt mồ côi sau crash và retention cần bước accounting/garbage collection riêng. Đã giới hạn mỗi output job, chưa có trần tổng storage vật lý xuyên mọi revision/attempt. Vì vậy PDF-02 đã xử lý phần nóng nhưng chưa đóng toàn bộ yêu cầu vận hành/quota.

### JOB-01: completion có quyền sở hữu và chống replay

- PostgreSQL tiếp tục là nguồn trạng thái và retry; BullMQ chỉ vận chuyển.
- Dispatcher tăng `dispatch_generation` mỗi lần gửi. Queue ID gồm job ID + generation, không mắc vào một message terminal cũ.
- Worker claim nguyên tử, lấy `lease_token`, heartbeat gia hạn lease. Message cũ hoặc worker mất lease không được cập nhật trạng thái.
- Success/failure khóa job và kiểm lease trước khi commit; ready không bị late failure hạ xuống failed.
- File của mỗi attempt nằm trong thư mục UUID riêng. Chỉ trỏ manifest/insert assets cùng transaction hoàn tất; không ghi đè output đã dùng bởi attempt khác.
- Unique index `(revision_id, object_key)` ngăn asset trùng. Migration từ chối nếu dữ liệu lịch sử đang trùng; không tự xóa tài sản người dùng.
- Reconciler khôi phục lease hết hạn; retry lỗi tạm tối đa 3 lần. Worker bận là backpressure, không tiêu hao số lần thử của PDF.

**Giới hạn còn lại:** attempt không được tham chiếu sau kill/COMMIT không rõ kết quả được giữ an toàn. Cần collector có retention và đối soát DB trước khi xóa. Chưa thử SIGKILL hàng loạt/Redis mất toàn bộ dữ liệu trong một bài soak dài; đã thử recovery bằng lease hết hạn trên DB thật.

### EDGE-01: sửa cùng đường upload

Permalink dùng `ON CONFLICT DO NOTHING`, không retry trong transaction đã abort. Serialize cấp revision number bằng khóa book; upload đồng thời không còn cùng `MAX()+1`. Dọn file khi transaction rollback như mô tả trên.

## 3. Bằng chứng kiểm thử

Docker stack biệt lập: `misa-flipbook-codex-test`, API `127.0.0.1:23000`, DB và volume riêng; không thay đổi stack đang dùng ở 3000/3001. Migration từ DB trống đến 0016 đã chạy thành công; build TypeScript thành công.

| Kiểm tra | Kết quả |
|---|---:|
| RLS | 13/13 |
| P1 API | 14/14 |
| P2 publish/reader | 16/16 |
| P3 password/download/replace | 33/33 |
| F16 Private | 12/12 |
| P5 UAT | 21/21 |
| Security regression của Claude | 14/14 |
| Job concurrent claim/replay/late failure/recovery/attempt exhaustion | 12 assertion |
| Upload quota/concurrency/slow connection/disconnect cleanup | 6 assertion |
| Python supervisor: parallel processes, page/pixel/output limits, timeout/reap/recovery, admission, path traversal | 7 test cases |

Tổng: **141 assertion JS + 7 test case Python đã pass**, không gộp số assertion thành số scenario độc lập. Test mới đã đưa vào CI; chưa tự nhận GitHub Actions chạy xanh.

P5 gửi file 201 MiB nhận HTTP 413, sau đó upload hợp lệ tiếp tục hoàn tất. Bộ test đầu tiên chạy bên trong container API đã dừng ở ca tạo buffer rất lớn (test runner dùng chung cgroup 512 MiB với API); chạy lại test runner riêng từ host đã pass. Không dùng lần dừng đó làm bằng chứng ứng dụng an toàn hay kết luận OOM của mã server. Các lần đầu viết test mới có lỗi fixture SQL/cascade cleanup; đã sửa và chạy lại.

UI/mobile không thay đổi trong đợt pipeline; không tuyên bố đã audit lại toàn bộ UI. Audio/video PDF, PERF-01 và các finding tính năng khác còn mở.

## 4. Tiếp tục theo thứ tự

1. Hoàn thiện security reader: đổi JWT query sang credential đọc giới hạn; cache transition + test proxy; fallback rate-limit + timeout và test Redis gián đoạn.
2. Reader tải ảnh quanh trang đang xem, giải phóng ảnh cũ; sửa geometry CropBox/rotation; pin revision cho phiên đọc, optimistic publish.
3. Thumbnail 16:9 + OG, thống kê không đếm SSR, mobile/touch/focus/page-jump, URL contract, Admin pagination.
4. Storage accounting/orphan collector, backup portable + restore drill, chạy CI/cold start/soak rồi mới chốt candidate/stable theo HANDOFF.md.

Đạt 8–9/10 phải qua các tiêu chí ở REMEDIATION.md, không tự chấm điểm chỉ vì số test tăng.

## 5. Lưu ý triển khai/rollback pipeline

Cần chuyển **dispatcher + worker-convert cùng phiên bản**; giao thức generation không tương thích worker cũ. Trước khi áp dụng vào stack đang dùng: dừng nhận upload/claim mới, để job đang chạy kết thúc hoặc ghi nhận cần retry, backup DB/files, kiểm tra duplicate `(revision_id,object_key)`, chạy migrations 0015/0016, cập nhật đồng bộ API/PDF-worker/dispatcher/worker-convert và smoke test. Không để worker cũ ghi vào schema mới trong giai đoạn chuyển.

Hai migration là thêm cột/hàm/index, không xóa dữ liệu. Rollback về worker cũ làm mất đảm bảo fencing; không coi đây là rollback an toàn khi vẫn còn job đang chạy. Không tạo hoặc dời stable tag khi chưa có xác nhận của người dùng.
