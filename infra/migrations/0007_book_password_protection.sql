-- P3/F05: mat khau xem sach cong khai (bat/tat + kiem tra that + gioi han lan thu).
-- Tiep noi 0006_public_reader.sql: van chi cho app_user goi qua ham SECURITY DEFINER,
-- KHONG bao gio cho app_user doc truc tiep book_settings tren duong public (RLS FORCE
-- van chan het vi request public khong set app.tenant_id/app.user_id - dung thiet ke).

ALTER TABLE book_settings
  ADD COLUMN failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN locked_until    timestamptz;

-- Mo rong public_get_book: tra them password_hash/access_epoch/failed_attempts/locked_until
-- de tang ung dung (Node, argon2.verify) tu quyet dinh cho xem hay yeu cau mat khau -
-- SQL khong the goi argon2, nen khong the tu chan trong ham nay nhu truoc (0006 chan
-- cung moi sach co password ngay trong DB). Doi lai kieu tra ve nen phai DROP truoc.
DROP FUNCTION public_get_book(text, text);

CREATE FUNCTION public_get_book(p_slug text, p_suffix text)
RETURNS TABLE (
  book_id                uuid,
  tenant_id              uuid,
  title                  text,
  permalink_slug         text,
  permalink_suffix       text,
  allow_download         boolean,
  has_password           boolean,
  password_hash          text,
  access_epoch           integer,
  failed_attempts        integer,
  locked_until           timestamptz,
  published_revision_id  uuid,
  manifest_key           text
) AS $$
  SELECT
    b.id, b.tenant_id, b.title, b.permalink_slug, b.permalink_suffix,
    COALESCE(bs.allow_download, false),
    (bs.password_hash IS NOT NULL),
    bs.password_hash,
    COALESCE(bs.access_epoch, 0),
    COALESCE(bs.failed_attempts, 0),
    bs.locked_until,
    b.published_revision_id,
    r.manifest_key
  FROM books b
  LEFT JOIN book_settings bs ON bs.tenant_id = b.tenant_id AND bs.book_id = b.id
  JOIN revisions r
    ON r.id = b.published_revision_id
   AND r.tenant_id = b.tenant_id
   AND r.book_id = b.id
  WHERE b.permalink_slug = p_slug
    AND b.permalink_suffix = p_suffix
    AND b.status = 'published'
    AND b.published_revision_id IS NOT NULL
    AND r.state = 'ready';
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public_get_book(text, text) TO app_user;

-- Ghi nhan 1 lan thu mat khau (thanh cong reset ve 0/mo khoa; that bai tang dan, den
-- nguong p_max_attempts thi khoa p_lock_minutes phut). Tra ve trang thai SAU khi cap
-- nhat de controller bao loi ro (con bao nhieu lan thu / khoa den luc nao).
CREATE FUNCTION public_record_password_attempt(
  p_book_id uuid, p_success boolean, p_max_attempts integer, p_lock_minutes integer
)
RETURNS TABLE (failed_attempts integer, locked_until timestamptz) AS $$
DECLARE
  v_next_attempts integer;
  v_next_locked   timestamptz;
BEGIN
  SELECT bs.failed_attempts INTO v_next_attempts FROM book_settings bs WHERE bs.book_id = p_book_id;
  IF p_success THEN
    v_next_attempts := 0;
    v_next_locked := NULL;
  ELSE
    v_next_attempts := COALESCE(v_next_attempts, 0) + 1;
    v_next_locked := CASE WHEN v_next_attempts >= p_max_attempts
      THEN now() + make_interval(mins => p_lock_minutes)
      ELSE NULL
    END;
  END IF;

  UPDATE book_settings bs
  SET failed_attempts = v_next_attempts,
      locked_until = v_next_locked
  WHERE bs.book_id = p_book_id;

  RETURN QUERY SELECT v_next_attempts, v_next_locked;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public_record_password_attempt(uuid, boolean, integer, integer) TO app_user;

-- F11: endpoint tai PDF goc rieng - CHI tra ve khi allow_download=true (kiem tra lai
-- ngay trong SQL, khong chi dua vao tang ung dung, giong nguyen tac cua 0006).
CREATE FUNCTION public_get_source_pdf(p_book_id uuid, p_revision_id uuid)
RETURNS TABLE (object_key text, content_type text, file_name_hint text) AS $$
  SELECT a.object_key, a.content_type, (b.permalink_slug || '-' || b.permalink_suffix || '.pdf')
  FROM assets a
  JOIN books b ON b.id = a.book_id AND b.tenant_id = a.tenant_id
  JOIN book_settings bs ON bs.tenant_id = b.tenant_id AND bs.book_id = b.id
  WHERE a.book_id = p_book_id
    AND a.revision_id = p_revision_id
    AND a.kind = 'source_pdf'
    AND b.status = 'published'
    AND b.published_revision_id = p_revision_id
    AND bs.allow_download = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public_get_source_pdf(uuid, uuid) TO app_user;
