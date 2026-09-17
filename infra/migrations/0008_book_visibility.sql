-- F16: cong tac Publish/Private tren sach DA publish (khac books.status). Xem PLAN.md
-- muc 8 (F16) va MEMORYBANK.md - quyet dinh da chot voi nguoi dung 17/09/2026:
--   1) Private la lop chan CAO NHAT: chi owner + system admin xem duoc qua CHINH
--      permalink cu; mat khau F05 (neu co) bi bo qua/vo hieu luc trong luc Private
--      dang bat (khong cong don 2 lop bao ve).
--   2) Admin luon xem duoc sach Private cua nguoi khac, nhung MOI LAN xem phai ghi
--      audit_logs (khong co ngoai le "Private tuyet doi ke ca Admin").
ALTER TABLE book_settings
  ADD COLUMN visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private'));

-- Tra them owner_id + visibility de controller (khong dung DbContextInterceptor, day
-- la route cong khai) tu quyet dinh 403 rieng-tu vs 403 mat khau vs cho xem. Doi kieu
-- tra ve (them cot) nen phai DROP truoc - CREATE OR REPLACE khong doi duoc OUT params.
DROP FUNCTION IF EXISTS public_get_book(text, text);
CREATE FUNCTION public_get_book(p_slug text, p_suffix text)
RETURNS TABLE (
  book_id                uuid,
  tenant_id              uuid,
  owner_id               uuid,
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
  manifest_key           text,
  visibility             text
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
    COALESCE(bs.visibility, 'public')
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

-- Route cong khai (/public/books/:permalink) khong di qua DbContextInterceptor nen
-- chua co app.user_id trong session luc nay - can 1 ham SECURITY DEFINER rieng de
-- tra cuu is_system_admin/status theo ID (khac auth_lookup_user_by_email von tra
-- cuu theo email luc dang nhap), dung khi client gui kem JWT dang nhap thuong o
-- endpoint public de tu xung la owner/admin cua sach Private.
CREATE OR REPLACE FUNCTION auth_lookup_user_by_id(p_user_id uuid)
RETURNS TABLE(id uuid, is_system_admin boolean, status text) AS $$
  SELECT id, is_system_admin, status FROM users WHERE id = p_user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION auth_lookup_user_by_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_lookup_user_by_id(uuid) TO app_user;

-- Ghi audit khi Admin xem sach Private khong phai cua minh (chot voi nguoi dung:
-- khong co ngoai le). SECURITY DEFINER vi route public khong co transaction rieng
-- de SET LOCAL app.user_id truoc khi INSERT (policy audit_logs_insert_any_authenticated
-- doi hoi current_setting('app.user_id') - ham nay bo qua RLS, tu gioi han bang chinh
-- than logic ben trong controller goi no, khong nhan tham so tu client tho.
CREATE OR REPLACE FUNCTION public_record_admin_private_view(p_actor_user_id uuid, p_tenant_id uuid, p_book_id uuid)
RETURNS void AS $$
  INSERT INTO audit_logs (actor_user_id, tenant_id, action, resource_id, metadata)
  VALUES (p_actor_user_id, p_tenant_id, 'view_private_book_as_admin', p_book_id::text, '{}'::jsonb);
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public_record_admin_private_view(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_record_admin_private_view(uuid, uuid, uuid) TO app_user;
