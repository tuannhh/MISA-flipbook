-- SEC-02 (audit codex 21/09/2026): route cong khai (/public/books/:permalink) xac
-- dinh "la chu so huu" (owner) CHI bang so sanh users.id, khong kiem tra membership
-- cua nguoi do trong dung tenant cua sach con active hay khong. Bang chung tai hien:
-- Admin disable membership cua Creator trong mot tenant, nhung Creator do van GET
-- duoc sach Private (owner check) bang JWT dang nhap cu (200) - vi status tai khoan
-- (users.status) van 'active', chi co memberships.status bi doi.
--
-- Ham nay cho controller tu tra cuu membership.status theo (tenant_id, user_id) qua
-- SECURITY DEFINER, giong nguyen tac auth_lookup_user_by_id o 0008_book_visibility.sql
-- (route public khong co app.tenant_id/app.user_id nen RLS FORCE se chan doc truc tiep
-- bang memberships).
CREATE OR REPLACE FUNCTION public_lookup_membership_status(p_tenant_id uuid, p_user_id uuid)
RETURNS text AS $$
  SELECT status FROM memberships WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public_lookup_membership_status(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_lookup_membership_status(uuid, uuid) TO app_user;
