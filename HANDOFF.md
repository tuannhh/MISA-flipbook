# Quy trình handoff và rollback
Handoff là hồ sơ bất biến gắn một phiên bản đã được xác nhận, đủ để bàn giao và tái triển khai. Git tag riêng lẻ không phục hồi được database hoặc file đã thay đổi.

## 1. Khi người dùng nói “ổn rồi”
Lời xác nhận là tín hiệu chốt phiên bản đang được xem. Không cần hỏi lại nếu build/phiên bản đã rõ; nếu chỉ duyệt plan thì ghi mốc tài liệu. Nếu có nhiều build khác nhau chưa xác định thì làm rõ build trước khi đóng mốc.

Thực hiện:
1. Xác định commit và image đang chạy; bảo đảm tất cả thay đổi cần giữ đã nằm trong commit, không bao gồm secret.
2. Ghi lời xác nhận, thời gian, URL/môi trường, phạm vi tính năng và giới hạn còn lại.
3. Lưu bằng chứng test đã chạy. Nếu còn lỗi nghiêm trọng, ghi accepted-with-limitations/candidate; không gọi stable.
4. Tạo annotated Git tag bất biến, ví dụ misa-flipbook-v0.3.0-stable. Build/tag không được gán lại vào commit khác.
5. Lưu digest của mọi image, lockfile, migration head, phiên bản pipeline PDF và cấu hình không chứa secret.
6. Tạo backup nhất quán DB + object inventory/checksum/version IDs; xác minh có thể restore trên môi trường biệt lập. Lưu backup ở kho riêng, hồ sơ chỉ lưu tham chiếu.
7. Điền handoffs/HF-YYYYMMDD-NN.md từ mẫu; cập nhật memory bank và release notes.
8. Giữ image trong registry, Git ref và object revisions liên quan khỏi garbage collection.
9. Báo người dùng mã handoff, version, phạm vi và cách yêu cầu rollback.

Không đưa bản dump có dữ liệu thật hoặc secret vào Git. Không tự ghi “backup verified” nếu mới tạo backup mà chưa restore thành công.

## 2. Ba loại rollback khác nhau
| Loại | Thao tác | Ảnh hưởng |
|---|---|---|
| Một flipbook | Trỏ published_revision_id về revision trước của cùng sách | Link không đổi; giữ dữ liệu hệ thống hiện tại |
| Ứng dụng | Triển khai lại image digest trong handoff, cấu hình tương thích | Giữ DB/object mới nếu schema và pipeline tương thích |
| Toàn hệ thống | Restore DB và objects đồng bộ về cùng thời điểm + đúng image/config | Có thể mất dữ liệu phát sinh sau backup; cần chốt phạm vi dữ liệu bị lùi trước khi thực hiện |

Ưu tiên rollback ứng dụng không mất dữ liệu hoặc forward fix. Migration dùng expand/contract: thêm trường trước, duy trì tương thích N/N-1, chỉ xóa sau khi hết cửa sổ rollback. Migration phá hủy/không tương thích chặn rollback code đơn thuần; hồ sơ phải ghi rõ phương án và downtime.
Giữ tối thiểu 3 mốc stable gần nhất và 30 ngày là đề xuất ban đầu, cần thống nhất chi phí lưu trữ; mọi mốc được người dùng chỉ định bảo tồn phải pin riêng.

## 3. Khi người dùng yêu cầu quay lại HF-…
1. Đọc đúng hồ sơ, so sánh môi trường hiện tại, schema, pipeline, key/secret versions và object references.
2. Xác định rollback code hay nội dung; không ngầm hiểu là khôi phục toàn DB.
3. Snapshot trạng thái hiện tại để còn đường quay về; kiểm tra dung lượng và backup.
4. Restore thử/triển khai thử ở staging; chạy smoke tests theo hồ sơ.
5. Nếu chỉ rollback code tương thích, triển khai digest đã chốt; giữ migrations an toàn. Nếu restore dữ liệu gây mất thay đổi mới, trình bày mốc thời gian và dữ liệu bị ảnh hưởng để người dùng chốt trước thao tác phá hủy.
6. Tạm dừng write/publish/job nếu cần cutover, chuyển traffic rồi kiểm tra link cũ, password, permission, embed, download, queue và assets.
7. Ghi deployment event mới trỏ về mốc cũ; không rewrite Git history hoặc di chuyển tag stable.
8. Cập nhật memory bank và kết quả kiểm tra. Nếu rollback thất bại, dùng snapshot trước thao tác theo runbook đã thử.

Đây là quy trình sẽ được hiện thực hóa cùng CI/CD. Hiện chưa có repo, tag, image hoặc backup thật để chạy rollback.

## 4. Cấu trúc repo dự kiến
- apps/web, apps/api, apps/dispatcher
- services/pdf-worker
- packages/contracts, packages/reader
- infra/docker, infra/migrations
- docs/plan, docs/memorybank, docs/handoffs
- tests/fixtures (chỉ PDF mẫu được phép lưu)

Khi bắt đầu phát triển, đưa bộ tài liệu này vào repo và bảo tồn lịch sử. Handoff không phụ thuộc máy của người phát triển; mọi artifact cần thiết phải có vị trí lưu có quyền truy cập phù hợp.
