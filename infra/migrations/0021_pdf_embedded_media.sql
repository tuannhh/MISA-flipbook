-- F10 level B: browser-playable audio/video extracted from an embedded PDF media
-- annotation is stored like any other revision-scoped asset. It is never public by
-- object key: the existing reader grant/password/private gate remains authoritative.

ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_kind_check;
ALTER TABLE assets ADD CONSTRAINT assets_kind_check
  CHECK (kind IN ('source_pdf', 'page_image', 'thumbnail', 'share_thumbnail', 'manifest', 'media'));

CREATE OR REPLACE FUNCTION public_list_revision_page_assets(p_book_id uuid, p_revision_id uuid)
RETURNS TABLE (id uuid, kind text, object_key text, content_type text) AS $$
  SELECT a.id, a.kind, a.object_key, a.content_type
  FROM assets a
  JOIN revisions r ON r.id = a.revision_id AND r.book_id = a.book_id AND r.tenant_id = a.tenant_id
  JOIN books b ON b.id = a.book_id AND b.tenant_id = a.tenant_id
  WHERE a.book_id = p_book_id
    AND a.revision_id = p_revision_id
    AND r.state = 'ready'
    AND b.status = 'published'
    AND b.deleted_at IS NULL
    AND a.kind IN ('page_image', 'thumbnail', 'media')
  ORDER BY a.object_key;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public,pg_temp;
REVOKE ALL ON FUNCTION public_list_revision_page_assets(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_list_revision_page_assets(uuid, uuid) TO app_user;

CREATE OR REPLACE FUNCTION public_get_revision_page_asset(p_book_id uuid, p_revision_id uuid, p_asset_id uuid)
RETURNS TABLE (object_key text, content_type text) AS $$
  SELECT a.object_key, a.content_type
  FROM assets a
  JOIN revisions r ON r.id = a.revision_id AND r.book_id = a.book_id AND r.tenant_id = a.tenant_id
  JOIN books b ON b.id = a.book_id AND b.tenant_id = a.tenant_id
  WHERE a.id = p_asset_id
    AND a.book_id = p_book_id
    AND a.revision_id = p_revision_id
    AND r.state = 'ready'
    AND b.status = 'published'
    AND b.deleted_at IS NULL
    AND a.kind IN ('page_image', 'thumbnail', 'media');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public,pg_temp;
REVOKE ALL ON FUNCTION public_get_revision_page_asset(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_get_revision_page_asset(uuid, uuid, uuid) TO app_user;
