# Kế hoạch sản phẩm MISA Flipbook
Phiên bản tài liệu 0.1 — 16/09/2026 — đề xuất.

## 1. Mục tiêu và nhận diện
Người tạo đăng nhập, upload PDF, chờ xử lý, xem trước, đặt tiêu đề/thumbnail/mật khẩu/quyền tải rồi phát hành. Người đọc mở link trên desktop hoặc mobile để đọc ngay, không cần tài khoản; sách có mật khẩu cần mở khóa.

Dùng logo MISA do người dùng cung cấp, giữ tỷ lệ và nội dung logo. Giao diện tiếng Việt; nền trung tính, màu đỏ làm điểm nhấn theo logo, không mặc định đây là toàn bộ quy chuẩn thương hiệu. Hai ảnh Heyzine là tham khảo bố cục và thao tác, không phải danh sách tính năng phải sao chép. Không thêm lead form, copy book, background music hay trình thiết kế tương tác tổng quát chỉ vì chúng xuất hiện trong ảnh.

## 2. Phạm vi và tiêu chí
| ID | Yêu cầu | Cách thực hiện / nghiệm thu |
|---|---|---|
| F01 | Upload PDF → flipbook | Upload có tiến độ; xử lý bất đồng bộ; báo số trang, cảnh báo và lỗi; lỗi không làm mất sách đã phát hành |
| F02 | Link chia sẻ cố định | /ky-yeu-70-nam-misa-1234abcd/; hậu tố 8 ký tự a-z0-9, ngẫu nhiên mật mã, unique constraint và retry khi trùng |
| F03 | Tên tiêu đề | Unicode tiếng Việt; đổi tiêu đề không đổi permalink đã phát hành |
| F04 | Thumbnail 16:9 | Upload/crop hoặc tạo từ trang bìa đặt trên nền 16:9, không kéo méo; master đề xuất 1600×900 |
| F05 | Mật khẩu xem | Hash mật khẩu; kiểm tra quyền trên manifest, ảnh, text, media và download; giới hạn lần thử |
| F06 | Google Analytics | Nhập GA4 Measurement ID G-… ở cấp sách, có mặc định tenant; không nhận JavaScript tùy ý |
| F07 | Replace PDF | Tạo revision mới, preview, publish nguyên tử; giữ book ID, permalink và cấu hình; lỗi vẫn đọc được revision cũ |
| F08 | Chia sẻ | Facebook, LinkedIn, sao chép link, chia sẻ qua thiết bị khi hỗ trợ; nút Instagram theo phương án thực tế bên dưới |
| F09 | HTML embed | Sinh iframe responsive tại /slug/embed/; giữ đầy đủ mật khẩu/quyền; có phương án mở tab khi trình duyệt chặn cookie bên thứ ba |
| F10 | Tương tác PDF | Trích hyperlink ngoài và chuyển trang nội bộ; audio/video theo ma trận định dạng và PoC, có báo cáo phần không hỗ trợ |
| F11 | Cho tải / không tải | Bật/tắt PDF gốc ở server; khi tắt không cấp URL hoặc byte PDF gốc cho viewer |
| F12 | Creator dashboard | Danh sách sách của mình, trạng thái, dung lượng, lượt mở/lượt xem trang theo ngày, bộ lọc và thao tác quản lý |
| F13 | Admin dashboard | Quản lý tenant, tài khoản, toàn bộ sách, job lỗi, dung lượng, thống kê và audit log |
| F14 | Multi-tenant | Cách ly dữ liệu quản trị, file, job, thống kê; test quyền trên mọi API và thao tác bất đồng bộ |

URL chuẩn: /{slug}-{suffix8}/. Các tuyến tính năng: /{slug}-{suffix8}/embed/, /{slug}-{suffix8}/download/. Trang đọc dùng ?page=5; cấu hình admin đặt dưới /app/books/{id}/edit để tránh lẫn với link công khai. Dành trước /app, /api, /health và /assets. Hậu tố không phải bí mật bảo mật. Permalink được lưu cố định, không tính lại từ tiêu đề ở mỗi request.

## 3. Phân quyền — đúng ba cấp
| Thao tác | Viewer | Creator | Admin |
|---|---|---|---|
| Đọc sách đã publish | Có link + mật khẩu nếu có | Như Viewer; preview sách mình | Mọi sách |
| Upload / tạo sách | Không | Trong tenant đang được cấp quyền | Mọi tenant |
| Sửa / thay PDF / publish / xóa | Không | Chỉ sách của mình | Mọi sách |
| Xem báo cáo | Không | Sách của mình | Toàn hệ thống |
| Quản lý user / tenant / cấu hình hệ thống | Không | Không | Có |

Giả định tenant là một đơn vị/khách hàng/phòng ban, không phải mỗi Creator là một tenant. Một người có thể được gán membership vào nhiều tenant; quyền Creator xét cả tenant và owner. Admin là system admin theo yêu cầu “toàn hệ thống”; chưa phát sinh cấp tenant-admin thứ tư. Viewer là quyền truy cập công khai, không bắt buộc có bản ghi tài khoản.

Creator khác dù cùng tenant chỉ có quyền xem qua link như Viewer, không xem nháp hoặc dashboard của chủ sách. Admin truy cập/sửa chéo tenant cần audit. Tenant là ranh giới quản trị; sách đã phát hành vẫn được đọc bằng link theo thiết lập công khai/mật khẩu.

## 4. Luồng và màn hình
1. Đăng nhập Creator/Admin; chọn tenant nếu có nhiều membership.
2. Dashboard: tạo mới, trạng thái đang upload/xử lý/nháp/phát hành/lỗi, tìm kiếm và thống kê.
3. Upload: kéo thả, tiến độ truyền file, tiến độ xử lý riêng, retry và thông báo lỗi dễ hiểu.
4. Editor: preview giữa màn hình, panel tiêu đề/thumbnail/bảo vệ/download/GA; có chế độ preview mobile.
5. Publish: xem kết quả rồi phát hành; popup link, embed, mạng xã hội.
6. Replace: giữ sách hiện tại online; xử lý bản mới, hiện số trang/cảnh báo tương tác thay đổi; preview và publish.
7. Reader: trước/sau, vuốt, nhập trang, thumbnail navigation, zoom, fullscreen khi hỗ trợ, chia sẻ, tải nếu được phép.
8. Admin: tenant, tài khoản, toàn bộ sách, hàng đợi lỗi và audit.

Desktop đủ rộng mở spread hai trang, bìa đầu/cuối xử lý riêng. Mobile mặc định một trang kể cả màn hình dọc/ngang; tablet có chọn 1/2 trang theo chiều rộng thực tế. Tôn trọng reduced-motion; nút bấm tối thiểu 44 CSS px; hỗ trợ bàn phím, focus, nhãn cho screen reader. Khi zoom, kéo là pan, không vô tình lật trang.

Không cam kết “mọi máy cũ”. Mục tiêu thử nghiệm ban đầu: viewport 320–430 px, tablet 768–1024 px, desktop 1280 px trở lên; Safari iOS 15+ và Chrome Android 100+ là mục tiêu PoC cần xác nhận bằng thiết bị thực. Máy không đủ khả năng chạy hiệu ứng vẫn đọc một trang và chuyển trang đơn giản. Nếu PDF không có text, ảnh trang không tự tạo khả năng đọc bằng screen reader; OCR ngoài phạm vi v1.

## 5. Chia sẻ mạng xã hội
MVP cung cấp link/iframe và mở giao diện chia sẻ của nền tảng. Người dùng xác nhận đăng trong giao diện tương ứng; trạng thái đăng nhập có thể được nền tảng sử dụng.

Yêu cầu đăng ngay qua tài khoản đã kết nối được giữ trong roadmap tích hợp:
- LinkedIn: OAuth, quyền đăng phù hợp, quản lý token; sau khi kết nối vẫn có thao tác người dùng xác nhận nội dung.
- Facebook: kiểm chứng Share Dialog/plugin bằng app MISA thực tế; không hứa tự đăng lên profile cá nhân. Nếu cần đăng Page, khảo sát quyền Page và review API riêng.
- Instagram: tài liệu Meta cho API tài khoản professional; không có bảo đảm một plugin web sẽ đăng link lên mọi tài khoản cá nhân. MVP có nút chia sẻ qua hệ điều hành khi khả dụng, hoặc sao chép link + ảnh thumbnail để đăng thủ công; không báo thành công nếu chỉ mở share sheet.
- Giai đoạn sau có thể đăng thumbnail/media và caption cho tài khoản Instagram được API hỗ trợ. Nền tảng quyết định cách hiển thị và khả năng bấm link.

Thumbnail master luôn 16:9; nếu mạng xã hội crop, chỉ tạo biến thể trình bày, không đổi file gốc. Metadata Open Graph được render server-side để bot đọc được. Với sách có mật khẩu, mặc định hiển thị tên ứng dụng/ảnh chung; Creator chủ động cho phép lộ tiêu đề và thumbnail thì mới công khai chúng. Bot không được cấp quyền đọc trang sách.

## 6. PDF có tương tác
Mức A bắt buộc v1: hyperlink HTTP/HTTPS, mailto được kiểm tra; liên kết tới trang nội bộ đúng cả trang xoay/crop và chế độ hai trang.
Mức B có cổng kiểm chứng: annotation audio/video có stream hoặc URL mà parser trích xuất được và trình duyệt phát được. Trích tọa độ thành overlay HTML; phát sau thao tác người dùng; pause khi rời trang.
Mức C không chạy: PDF JavaScript, Launch action, Flash/3D hoặc action tùy ý. Báo cáo rõ từng đối tượng bị bỏ qua. Không coi file đính kèm là media tự phát nếu không có thông tin vị trí/annotation hợp lệ.

Cần PDF mẫu thật có hyperlink, audio và video để chốt phạm vi hỗ trợ. Nếu PoC không giữ được loại media người dùng cần, phải nêu lựa chọn thay parser/SDK hoặc bổ sung media thủ công và cập nhật phạm vi trước khi nghiệm thu; không tự đánh dấu F10 hoàn tất.

## 7. Giới hạn và giả định pilot
Giới hạn đề xuất để benchmark: 200 MB/PDF, 500 trang/PDF, 20 Creator, 100 phiên đọc đồng thời, 1–2 job chuyển đổi đồng thời. Đây là dữ liệu lập kế hoạch, không phải năng lực đã đo.
Theo chỉ đạo bổ sung: làm Docker trước; server MISA do DevOps tính toán khi deploy thật, không chặn phát triển. Docker dùng Linux containers (trên Windows qua WSL2). SSO để điểm tích hợp, pilot dùng tài khoản do Admin cấp. Không có đăng ký công khai mặc định.

Tắt download ngăn cấp PDF gốc; không ngăn người xem chụp màn hình hoặc lưu nội dung đã hiển thị. Không quảng bá như DRM.

## 8. Yêu cầu bổ sung ghi nhận 17/09/2026 (backlog tương lai, chưa ước lượng/chưa vào phạm vi hiện tại)
Người dùng yêu cầu ghi nhận để làm sau, chưa thiết kế chi tiết, chưa cam kết mốc P nào ở ROADMAP.md:

| ID | Yêu cầu | Ghi chú / câu hỏi mở cần làm rõ trước khi thiết kế |
|---|---|---|
| F15 | Chèn ảnh nền cho sách | Chưa rõ phạm vi: ảnh nền toàn trang đọc (đằng sau/xung quanh khung flipbook) hay nền cho từng trang PDF cụ thể; cần hỏi người dùng trước khi làm. Ảnh hưởng tới `book_settings` (thêm cột) và FE reader (`apps/web/src/components/FlipBook.tsx`, `globals.css`). |
| F16 | Công tắc hiển thị **trên sách đã publish**: **Publish** (mặc định, ai có link đều xem được — đúng hành vi public reader hiện tại) và **Private** (Creator tự "khóa" lại link đã publish, chỉ chủ sở hữu xem được — giống "chỉ mình tôi" của Facebook, "Private" của YouTube, "Restricted" của Google Drive) | **Đã làm rõ với người dùng (17/09/2026)**: đây KHÔNG phải trạng thái thay thế "draft" (draft = chưa từng publish, không có link công khai) mà là công tắc BẬT/TẮT quyền truy cập công khai trên link CỐ ĐỊNH đã có sẵn của một sách đã publish — Creator có thể chuyển qua lại Publish ⇄ Private bất kỳ lúc nào, link không đổi. Khi Private: cùng permalink đó phải chặn (403, không phải 404 — sách có tồn tại, chỉ không cho xem) với mọi người xem ẩn danh, NHƯNG chủ sở hữu (đăng nhập đúng owner) vẫn xem được qua CHÍNH link đó — nghĩa là route `/read/:permalink` không thể chỉ gọi API public thuần ẩn danh như hiện tại nữa, cần thử kèm token đăng nhập (nếu có) rồi mới quyết định 403 hay hiển thị. Khác F05 (mật khẩu — sách vẫn public cho AI CŨNG xem được nếu có mật khẩu đúng, không giới hạn danh tính). **Đã chốt với người dùng (17/09/2026)**: (1) Private là lớp chặn cao nhất — khi bật, chỉ chủ sở hữu (và Admin) xem được, mật khẩu F05 bị bỏ qua/vô hiệu lực trong lúc Private đang bật (không cộng dồn 2 lớp); (2) Admin (system admin) LUÔN xem được sách Private của người khác (đúng tinh thần PLAN.md mục 3 "Admin truy cập mọi sách, truy cập chéo tenant cần audit"), mỗi lần Admin xem một sách Private không phải của mình phải ghi `audit_logs` — không có ngoại lệ "Private tuyệt đối kể cả Admin". Ảnh hưởng: thêm cột (vd `book_settings.visibility` enum public/private), sửa `public_get_book`/`public_get_page_asset` (migration `0006_public_reader.sql`) để kiểm tra thêm điều kiện owner-or-admin khi visibility=private, ghi audit log khi Admin truy cập, sửa route `/read/:permalink` ở `apps/web` để gửi kèm token nếu Creator/Admin đang đăng nhập, thêm UI bật/tắt ở dashboard/editor sách. Đã đủ rõ để ước lượng/thiết kế khi vào lịch làm việc (chưa gán mốc P, xem ROADMAP.md). |
| F17 | Tham khảo `ts1/flipbook-vue` (MIT, xem đánh giá license ở phiên làm việc 16-17/09/2026) — props/events/slot props cho zoom in/out khi đọc, và rà soát các hook sự kiện lật trang | Không chuyển sang flipbook-vue (thư viện Vue, không tương thích trực tiếp React/Next.js đang dùng — xem MEMORYBANK.md phần ADR P2-flip, hiện đã dùng `react-pageflip`/StPageFlip MIT). Chỉ lấy Ý TƯỞNG API (cách đặt tên prop/event cho zoom, callback khi đổi trang) để bổ sung tính năng ZOOM còn thiếu trong `FlipBook.tsx` (đã ghi là gap ở MEMORYBANK.md) — cần kiểm tra `page-flip`/StPageFlip có hỗ trợ zoom sẵn hay phải tự thêm layer riêng trước khi ước lượng công sức. |

Cả 3 mục trên CHƯA bắt đầu triển khai; cần làm rõ câu hỏi mở ở cột ghi chú (đặc biệt F16, vì đụng mô hình phân quyền) trước khi đưa vào ROADMAP.md backlog của một mốc P cụ thể.
