-- F12: ghi nhan luot mo sach / luot xem trang cho reader cong khai. Bang
-- `analytics_events`/`daily_stats` VA RLS cua chung DA CO SAN tu 0002/0003 (schema P1)
-- nhung chua tung duoc ghi/doc o dau - migration nay CHI them 1 ham SECURITY DEFINER
-- de route cong khai (khong co DbContextInterceptor, khong co session app.tenant_id/
-- app.user_id) ghi duoc event, cung nguyen tac voi public_get_book/
-- public_record_admin_private_view da co.
CREATE OR REPLACE FUNCTION public_record_book_event(
  p_book_id uuid,
  p_tenant_id uuid,
  p_revision_id uuid,
  p_event_type text
) RETURNS void AS $$
  INSERT INTO analytics_events (tenant_id, book_id, revision_id, event_type)
  VALUES (p_tenant_id, p_book_id, p_revision_id, p_event_type);

  INSERT INTO daily_stats (tenant_id, book_id, stat_date, opens, page_views)
  VALUES (
    p_tenant_id, p_book_id, CURRENT_DATE,
    CASE WHEN p_event_type = 'open' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'page_view' THEN 1 ELSE 0 END
  )
  ON CONFLICT (tenant_id, book_id, stat_date) DO UPDATE SET
    opens = daily_stats.opens + CASE WHEN p_event_type = 'open' THEN 1 ELSE 0 END,
    page_views = daily_stats.page_views + CASE WHEN p_event_type = 'page_view' THEN 1 ELSE 0 END;
$$ LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public_record_book_event(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_record_book_event(uuid, uuid, uuid, text) TO app_user;
