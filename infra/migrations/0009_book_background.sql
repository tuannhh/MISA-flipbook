-- F15: anh nen cho sach (backdrop phia sau khung doc flipbook, KHONG phai nen rieng
-- cua tung trang PDF - nguoi dung da xac nhan chi can 1 anh nen chung cho ca cuon sach,
-- noi dung/hinh anh/nen tung trang van nam trong file PDF da upload). Luu truc tiep
-- trong book_settings (khong dung bang `assets` vi assets.revision_id dang NOT NULL/
-- CHECK kind gioi han 4 gia tri - anh nen khong gan voi revision nao ca, tach rieng
-- don gian hon la sua rang buoc cua assets).
ALTER TABLE book_settings
  ADD COLUMN background_object_key text,
  ADD COLUMN background_content_type text;

-- Tra them 2 cot moi cho route cong khai tu quyet dinh co phuc vu anh nen hay khong -
-- doi kieu tra ve (them cot) nen phai DROP truoc, giong 0008_book_visibility.sql.
DROP FUNCTION IF EXISTS public_get_book(text, text);
CREATE FUNCTION public_get_book(p_slug text, p_suffix text)
RETURNS TABLE (
  book_id                 uuid,
  tenant_id               uuid,
  owner_id                uuid,
  title                   text,
  permalink_slug          text,
  permalink_suffix        text,
  allow_download          boolean,
  has_password            boolean,
  password_hash           text,
  access_epoch            integer,
  failed_attempts         integer,
  locked_until            timestamptz,
  published_revision_id   uuid,
  manifest_key            text,
  visibility              text,
  background_object_key   text,
  background_content_type text
) AS $$
  SELECT
    b.id, b.tenant_id, b.owner_id, b.title, b.permalink_slug, b.permalink_suffix,
    COALESCE(bs.allow_download, false),
    (bs.password_hash IS NOT NULL),
    bs.password_hash,
    COALESCE(bs.access_epoch, 0),
    COALESCE(bs.failed_attempts, 0),
    bs.locked_until,
    b.published_revision_id,
    r.manifest_key,
    COALESCE(bs.visibility, 'public'),
    bs.background_object_key,
    bs.background_content_type
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
