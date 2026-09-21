-- Reader sessions are deliberately scoped to one published revision.  A reader that
-- started before a replacement keeps a coherent book until the short-lived session
-- expires, while a password/visibility change advances access_epoch and immediately
-- invalidates every existing session.

CREATE FUNCTION public_get_ready_revision(p_book_id uuid, p_revision_id uuid)
RETURNS TABLE (manifest_key text) AS $$
  SELECT r.manifest_key
  FROM revisions r
  JOIN books b ON b.id = r.book_id AND b.tenant_id = r.tenant_id
  WHERE r.book_id = p_book_id
    AND r.id = p_revision_id
    AND r.state = 'ready'
    AND r.manifest_key IS NOT NULL
    AND b.status = 'published'
    AND b.deleted_at IS NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public,pg_temp;
REVOKE ALL ON FUNCTION public_get_ready_revision(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_get_ready_revision(uuid, uuid) TO app_user;

CREATE FUNCTION public_list_revision_page_assets(p_book_id uuid, p_revision_id uuid)
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
    AND a.kind IN ('page_image', 'thumbnail')
  ORDER BY a.object_key;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public,pg_temp;
REVOKE ALL ON FUNCTION public_list_revision_page_assets(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_list_revision_page_assets(uuid, uuid) TO app_user;

CREATE FUNCTION public_get_revision_page_asset(p_book_id uuid, p_revision_id uuid, p_asset_id uuid)
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
    AND a.kind IN ('page_image', 'thumbnail');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public,pg_temp;
REVOKE ALL ON FUNCTION public_get_revision_page_asset(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_get_revision_page_asset(uuid, uuid, uuid) TO app_user;

CREATE FUNCTION public_get_revision_source_pdf(p_book_id uuid, p_revision_id uuid)
RETURNS TABLE (object_key text, content_type text, file_name_hint text) AS $$
  SELECT a.object_key, a.content_type, b.permalink_slug || '-' || b.permalink_suffix || '.pdf'
  FROM assets a
  JOIN revisions r ON r.id = a.revision_id AND r.book_id = a.book_id AND r.tenant_id = a.tenant_id
  JOIN books b ON b.id = a.book_id AND b.tenant_id = a.tenant_id
  JOIN book_settings bs ON bs.book_id = b.id AND bs.tenant_id = b.tenant_id
  WHERE a.book_id = p_book_id
    AND a.revision_id = p_revision_id
    AND a.kind = 'source_pdf'
    AND r.state = 'ready'
    AND b.status = 'published'
    AND b.deleted_at IS NULL
    AND bs.allow_download = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public,pg_temp;
REVOKE ALL ON FUNCTION public_get_revision_source_pdf(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_get_revision_source_pdf(uuid, uuid) TO app_user;

-- A session can contribute one open and one page-view per page.  The unique key is
-- enforced in PostgreSQL so retries, browser refreshes and concurrent requests do
-- not inflate analytics.
CREATE TABLE reader_event_dedup (
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL REFERENCES revisions(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('open', 'page_view')),
  page_number integer NOT NULL DEFAULT 0 CHECK (page_number >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (book_id, revision_id, session_id, event_type, page_number)
);
ALTER TABLE reader_event_dedup ENABLE ROW LEVEL SECURITY;
ALTER TABLE reader_event_dedup FORCE ROW LEVEL SECURITY;

CREATE FUNCTION public_record_reader_event(
  p_book_id uuid,
  p_tenant_id uuid,
  p_revision_id uuid,
  p_session_id uuid,
  p_event_type text,
  p_page_number integer
)
RETURNS boolean AS $$
DECLARE
  v_inserted_count integer;
BEGIN
  IF p_event_type NOT IN ('open', 'page_view') OR p_page_number < 0 THEN
    RAISE EXCEPTION 'invalid reader event';
  END IF;

  INSERT INTO reader_event_dedup (book_id, revision_id, session_id, event_type, page_number)
  VALUES (p_book_id, p_revision_id, p_session_id, p_event_type, p_page_number)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  IF v_inserted_count = 0 THEN RETURN false; END IF;

  INSERT INTO analytics_events (tenant_id, book_id, revision_id, event_type)
  VALUES (p_tenant_id, p_book_id, p_revision_id, p_event_type);

  INSERT INTO daily_stats (tenant_id, book_id, stat_date, opens, page_views)
  VALUES (
    p_tenant_id,
    p_book_id,
    CURRENT_DATE,
    CASE WHEN p_event_type = 'open' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'page_view' THEN 1 ELSE 0 END
  )
  ON CONFLICT (tenant_id, book_id, stat_date) DO UPDATE SET
    opens = daily_stats.opens + EXCLUDED.opens,
    page_views = daily_stats.page_views + EXCLUDED.page_views;
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp;
REVOKE ALL ON FUNCTION public_record_reader_event(uuid, uuid, uuid, uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_record_reader_event(uuid, uuid, uuid, uuid, text, integer) TO app_user;
