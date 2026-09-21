-- A Creator-selected social cover is independent of the currently published PDF
-- revision. It remains stable when a PDF is replaced and is served only through the
-- public preview endpoint after the same visibility/password gate as the reader.
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_kind_check;
ALTER TABLE assets ADD CONSTRAINT assets_kind_check
  CHECK (kind IN ('source_pdf', 'page_image', 'thumbnail', 'share_thumbnail', 'manifest'));

CREATE FUNCTION public_get_share_thumbnail(p_book_id uuid)
RETURNS TABLE (id uuid, object_key text, content_type text) AS $$
  SELECT a.id, a.object_key, a.content_type
  FROM book_settings bs
  JOIN books b ON b.id = bs.book_id AND b.tenant_id = bs.tenant_id
  JOIN assets a ON a.id = bs.thumbnail_asset_id AND a.book_id = b.id AND a.tenant_id = b.tenant_id
  WHERE b.id = p_book_id
    AND b.status = 'published'
    AND b.deleted_at IS NULL
    AND a.kind = 'share_thumbnail';
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public,pg_temp;
REVOKE ALL ON FUNCTION public_get_share_thumbnail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_get_share_thumbnail(uuid) TO app_user;
