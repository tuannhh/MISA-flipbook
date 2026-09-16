-- Phat hien khi lam API /me: PLAN.md muc 4 buoc 1 can "chon tenant NEU co nhieu
-- membership", tuc la phai liet ke duoc TAT CA tenant/membership cua user TRUOC KHI
-- da chon (SET LOCAL app.tenant_id) mot tenant cu the. Policy cu (memberships_tenant_read,
-- tenants_member_read) doi hoi app.tenant_id da duoc dat truoc — khong dung cho buoc
-- chon tenant ban dau. Bo sung policy "tu doc theo user_id" (khong phu thuoc tenant_id
-- session) va bo policy tenant-wide vi khong co use case can Creator xem membership
-- cua nguoi khac trong cung tenant.

DROP POLICY IF EXISTS memberships_tenant_read ON memberships;
CREATE POLICY memberships_self_read ON memberships
  FOR SELECT
  USING (user_id::text = current_setting('app.user_id', true));

CREATE POLICY tenants_self_member_read ON tenants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.tenant_id = tenants.id
        AND m.user_id::text = current_setting('app.user_id', true)
        AND m.status = 'active'
    )
  );
