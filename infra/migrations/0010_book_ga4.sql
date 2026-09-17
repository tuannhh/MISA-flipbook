-- F06: GA4 Measurement ID cap sach (book_settings.ga_id) + mac dinh cap tenant
-- (tenants.default_ga_id) - CA HAI COT NAY DA CO SAN tu 0002_core_schema.sql nhung
-- chua duoc dung o dau ca (API chua cho ghi/doc). Migration nay KHONG them cot moi,
-- chi doi lai public_get_book() de tra ve ca 2 gia tri cho route cong khai tu tinh
-- "gia tri hieu luc" (uu tien ga_id cua sach, roi moi toi default_ga_id cua tenant).
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
  background_content_type text,
  ga_id                   text,
  default_ga_id           text
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
    bs.background_content_type,
    bs.ga_id,
    t.default_ga_id
  FROM books b
  LEFT JOIN book_settings bs ON bs.tenant_id = b.tenant_id AND bs.book_id = b.id
  JOIN tenants t ON t.id = b.tenant_id
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
