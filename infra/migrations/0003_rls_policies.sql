-- Cach ly tenant o tang database (ARCHITECTURE.md muc 4).
-- app_user la role runtime cua API: KHONG phai superuser, KHONG la table owner,
-- KHONG co BYPASSRLS (role duoc tao boi migration runner, xem infra/migrations/README.md).
--
-- Context truyen qua transaction bang:
--   SET LOCAL app.tenant_id = '<uuid>';
--   SET LOCAL app.user_id = '<uuid>';
--   SET LOCAL app.is_system_admin = 'true' | 'false';
-- Neu request la public/anonymous (chua dang nhap), API KHONG duoc set cac bien nay,
-- nen cac policy duoi day se tu dong tu choi truy cap — doc sach cong khai phai di qua
-- mot duong rieng (view/function rieng cho public reader), se bo sung o P2 khi lam
-- luong doc sach that; hien P1 chi bao dam Creator/Admin khong cheo tenant.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    RAISE EXCEPTION 'Role app_user chua ton tai. Migration runner phai tao role nay truoc khi chay file SQL (xem infra/migrations/run.js).';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  tenants, users, memberships, books, revisions, book_settings,
  assets, jobs, audit_logs, analytics_events, daily_stats
  TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- ===== tenants: chi Admin (is_system_admin) duoc doc/sua truc tiep bang tenant khac 0 hang =====
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenants_admin_all ON tenants
  USING (current_setting('app.is_system_admin', true)::boolean IS TRUE)
  WITH CHECK (current_setting('app.is_system_admin', true)::boolean IS TRUE);
CREATE POLICY tenants_member_read ON tenants
  FOR SELECT
  USING (
    id::text = current_setting('app.tenant_id', true)
  );

-- ===== users: nguoi dung chi doc chinh minh; Admin doc/sua tat ca =====
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_admin_all ON users
  USING (current_setting('app.is_system_admin', true)::boolean IS TRUE)
  WITH CHECK (current_setting('app.is_system_admin', true)::boolean IS TRUE);
CREATE POLICY users_self_read ON users
  FOR SELECT
  USING (id::text = current_setting('app.user_id', true));

-- ===== memberships: thanh vien chi thay membership cua tenant dang active; Admin toan quyen =====
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY memberships_admin_all ON memberships
  USING (current_setting('app.is_system_admin', true)::boolean IS TRUE)
  WITH CHECK (current_setting('app.is_system_admin', true)::boolean IS TRUE);
CREATE POLICY memberships_tenant_read ON memberships
  FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- ===== books: Creator CHI thay/sua/xoa sach cua chinh minh (PLAN.md muc 3: "Creator khac
-- du cung tenant chi co quyen xem qua link nhu Viewer, khong xem nhap/dashboard cua chu sach").
-- Doc toan tenant KHONG duoc cap o day du cung tenant; Admin di qua policy rieng ben duoi.
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE books FORCE ROW LEVEL SECURITY;
CREATE POLICY books_admin_all ON books
  USING (current_setting('app.is_system_admin', true)::boolean IS TRUE)
  WITH CHECK (current_setting('app.is_system_admin', true)::boolean IS TRUE);
CREATE POLICY books_owner_read ON books
  FOR SELECT
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND owner_id::text = current_setting('app.user_id', true)
  );
CREATE POLICY books_owner_insert ON books
  FOR INSERT
  WITH CHECK (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND owner_id::text = current_setting('app.user_id', true)
  );
CREATE POLICY books_owner_write ON books
  FOR UPDATE
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND owner_id::text = current_setting('app.user_id', true)
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND owner_id::text = current_setting('app.user_id', true)
  );
CREATE POLICY books_owner_delete ON books
  FOR DELETE
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND owner_id::text = current_setting('app.user_id', true)
  );

-- ===== revisions / book_settings / assets / jobs / analytics_events / daily_stats =====
-- Cung nguyen tac voi books: Creator chi thay du lieu cua SACH MINH SO HUU, khong phai
-- toan bo tenant (PLAN.md muc 3). Dung EXISTS sang books de xac nhan owner_id; vi books
-- da co RLS owner-scoped, subquery nay tu nhien chi "nhin thay" sach cua chinh actor,
-- nhung ghi ro dieu kien o day de ro rang khi audit, khong dua ngam vao RLS long nhau.
CREATE OR REPLACE FUNCTION is_own_book(p_tenant_id uuid, p_book_id uuid) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM books b
    WHERE b.id = p_book_id
      AND b.tenant_id = p_tenant_id
      AND b.owner_id::text = current_setting('app.user_id', true)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

ALTER TABLE revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY revisions_admin_all ON revisions
  USING (current_setting('app.is_system_admin', true)::boolean IS TRUE)
  WITH CHECK (current_setting('app.is_system_admin', true)::boolean IS TRUE);
CREATE POLICY revisions_owner_all ON revisions
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND is_own_book(tenant_id, book_id)
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND is_own_book(tenant_id, book_id)
  );

ALTER TABLE book_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY book_settings_admin_all ON book_settings
  USING (current_setting('app.is_system_admin', true)::boolean IS TRUE)
  WITH CHECK (current_setting('app.is_system_admin', true)::boolean IS TRUE);
CREATE POLICY book_settings_owner_all ON book_settings
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND is_own_book(tenant_id, book_id)
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND is_own_book(tenant_id, book_id)
  );

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets FORCE ROW LEVEL SECURITY;
CREATE POLICY assets_admin_all ON assets
  USING (current_setting('app.is_system_admin', true)::boolean IS TRUE)
  WITH CHECK (current_setting('app.is_system_admin', true)::boolean IS TRUE);
CREATE POLICY assets_owner_all ON assets
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND is_own_book(tenant_id, book_id)
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND is_own_book(tenant_id, book_id)
  );

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY jobs_admin_all ON jobs
  USING (current_setting('app.is_system_admin', true)::boolean IS TRUE)
  WITH CHECK (current_setting('app.is_system_admin', true)::boolean IS TRUE);
CREATE POLICY jobs_owner_all ON jobs
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND is_own_book(tenant_id, book_id)
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND is_own_book(tenant_id, book_id)
  );

-- ===== analytics_events / daily_stats: Creator chi xem thong ke sach cua minh; Admin toan he thong =====
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events FORCE ROW LEVEL SECURITY;
CREATE POLICY analytics_admin_all ON analytics_events
  USING (current_setting('app.is_system_admin', true)::boolean IS TRUE)
  WITH CHECK (current_setting('app.is_system_admin', true)::boolean IS TRUE);
CREATE POLICY analytics_owner_all ON analytics_events
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND is_own_book(tenant_id, book_id)
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND is_own_book(tenant_id, book_id)
  );

ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats FORCE ROW LEVEL SECURITY;
CREATE POLICY daily_stats_admin_all ON daily_stats
  USING (current_setting('app.is_system_admin', true)::boolean IS TRUE)
  WITH CHECK (current_setting('app.is_system_admin', true)::boolean IS TRUE);
CREATE POLICY daily_stats_owner_all ON daily_stats
  USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND is_own_book(tenant_id, book_id)
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND is_own_book(tenant_id, book_id)
  );

-- ===== audit_logs: chi Admin doc; ghi duoc thuc hien boi app_user tu moi tenant (INSERT only) =====
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_admin_read ON audit_logs
  FOR SELECT
  USING (current_setting('app.is_system_admin', true)::boolean IS TRUE);
CREATE POLICY audit_logs_insert_any_authenticated ON audit_logs
  FOR INSERT
  WITH CHECK (current_setting('app.user_id', true) IS NOT NULL);
