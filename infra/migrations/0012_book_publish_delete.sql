-- F13-simplification: nguoi dung yeu cau don gian hoa Admin dashboard, thay bang Tenant
-- bang danh sach sach da dang co "Ngay dang" that (chua tung co) + nut Xoa (chua tung
-- co chuc nang xoa sach nao, chi co unpublish/rollback). Da chot voi nguoi dung qua
-- AskUserQuestion: (1) them cot published_at rieng (khong dung tam updated_at), (2)
-- xoa kieu XOA MEM (deleted_at, khong xoa vinh vien khoi DB/khong xoa file da luu).
ALTER TABLE books ADD COLUMN published_at timestamptz;
ALTER TABLE books ADD COLUMN deleted_at timestamptz;

-- Backfill xap xi cho sach da publish TRUOC migration nay (khong co moc that trong qua
-- khu, dung updated_at gan nhat lam gia tri gan dung). Sach publish TU GIO TRO DI se co
-- published_at chinh xac qua books.controller.ts publish() (COALESCE(published_at, now())
-- - chi dat 1 lan dau tien, republish/rollback sau nay khong ghi de).
UPDATE books SET published_at = updated_at WHERE status = 'published' AND published_at IS NULL;

-- public_get_book(): sach bi Admin xoa mem (deleted_at khong null) khong con hien qua
-- permalink cong khai nua - dinh nghia lai voi dieu kien loc them, giu nguyen moi cot
-- tra ve khac (copy tu 0010_book_ga4.sql, chua co migration nao doi lai kieu tra ve).
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
    AND b.deleted_at IS NULL
    AND b.published_revision_id IS NOT NULL
    AND r.state = 'ready';
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public_get_book(text, text) TO app_user;
