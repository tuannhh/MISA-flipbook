-- SEC-03 (audit codex 21/09/2026): public_record_password_attempt cu la SELECT
-- failed_attempts INTO bien, roi UPDATE rieng - hai buoc khong cung 1 cau lenh nen
-- khong co row lock giu xuyen suot: hai request cung luc co the cung doc thay so cu,
-- cung +1, mat 1 lan tang (evidence EVIDENCE.md: "Unique collision..." tuong tu, va
-- audit chi dinh danh ham nay o AUDIT.md SEC-03). Viet lai thanh 1 cau UPDATE duy
-- nhat (ham "sql" khong phai "plpgsql") - Postgres tu khoa row cho den khi UPDATE
-- hoan tat, loai bo khoang ho giua doc va ghi.
--
-- Gia tri locked_until/failed_attempts o day CHI con dung de thong ke/quan sat cho
-- Admin sau nay - KHONG con la co che chan chinh. Co che chan chinh chuyen sang
-- RateLimitService (Redis, khoa theo tung (book_id, ip) - xem public-books.controller.ts
-- verifyPassword) de tranh loi "1 nguon sai mat khau khoa het moi nguoi doc khac"
-- (evidence: 8 lan sai -> 429 cho ca nguon nhap dung tiep theo).
CREATE OR REPLACE FUNCTION public_record_password_attempt(
  p_book_id uuid, p_success boolean, p_max_attempts integer, p_lock_minutes integer
)
RETURNS TABLE (failed_attempts integer, locked_until timestamptz) AS $$
  UPDATE book_settings bs
  SET failed_attempts = CASE WHEN p_success THEN 0 ELSE bs.failed_attempts + 1 END,
      locked_until = CASE
        WHEN p_success THEN NULL
        WHEN bs.failed_attempts + 1 >= p_max_attempts
          THEN now() + make_interval(mins => p_lock_minutes)
        ELSE bs.locked_until
      END
  WHERE bs.book_id = p_book_id
  RETURNING bs.failed_attempts, bs.locked_until;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public_record_password_attempt(uuid, boolean, integer, integer) TO app_user;
