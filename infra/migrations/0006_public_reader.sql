-- P2: duong rieng cho public reader (khong dang nhap), nhu da ghi chu trong
-- 0003_rls_policies.sql dong 9-12. app_user KHONG the doc truc tiep bang books/
-- assets khi khong co app.user_id/app.tenant_id (RLS chan het, dung thiet ke).
-- Cac ham SECURITY DEFINER duoi day do role bootstrap (superuser, xem
-- infra/migrations/run.js) so huu nen bo qua duoc RLS - CHI duoc tra ve du lieu
-- cua sach dA PUBLISH (status='published' AND published_revision_id khop), va
-- KHONG BAO GIO tra ve asset kind='source_pdf' (khong lo PDF goc qua duong cong khai).

CREATE OR REPLACE FUNCTION public_get_book(p_slug text, p_suffix text)
RETURNS TABLE (
  book_id                uuid,
  tenant_id              uuid,
  title                  text,
  permalink_slug         text,
  permalink_suffix       text,
  allow_download         boolean,
  has_password           boolean,
  published_revision_id  uuid,
  manifest_key           text
) AS $$
  SELECT
    b.id, b.tenant_id, b.title, b.permalink_slug, b.permalink_suffix,
    COALESCE(bs.allow_download, false),
    (bs.password_hash IS NOT NULL),
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

-- Chi tra ve page_image/thumbnail CUA DUNG revision dang published cua sach do -
-- khong cho phep doc asset cua revision khac (vd draft cu chua publish) hay
-- source_pdf, du co doan biet duoc book_id/asset_id.
CREATE OR REPLACE FUNCTION public_list_page_assets(p_book_id uuid, p_revision_id uuid)
RETURNS TABLE (
  id            uuid,
  kind          text,
  object_key    text,
  content_type  text
) AS $$
  SELECT a.id, a.kind, a.object_key, a.content_type
  FROM assets a
  JOIN books b ON b.id = a.book_id AND b.tenant_id = a.tenant_id
  WHERE a.book_id = p_book_id
    AND a.revision_id = p_revision_id
    AND b.status = 'published'
    AND b.published_revision_id = p_revision_id
    AND a.kind IN ('page_image', 'thumbnail')
  ORDER BY a.object_key;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public_list_page_assets(uuid, uuid) TO app_user;

CREATE OR REPLACE FUNCTION public_get_page_asset(p_book_id uuid, p_asset_id uuid)
RETURNS TABLE (
  object_key    text,
  content_type  text
) AS $$
  SELECT a.object_key, a.content_type
  FROM assets a
  JOIN books b ON b.id = a.book_id AND b.tenant_id = a.tenant_id
  WHERE a.id = p_asset_id
    AND a.book_id = p_book_id
    AND b.status = 'published'
    AND b.published_revision_id = a.revision_id
    AND a.kind IN ('page_image', 'thumbnail');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public_get_page_asset(uuid, uuid) TO app_user;
