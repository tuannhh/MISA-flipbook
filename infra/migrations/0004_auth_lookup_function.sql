-- Ham rieng cho luong dang nhap: tai thoi diem login, API chua biet user_id nen
-- chua the SET LOCAL app.user_id de thoa policy users_self_read. Ham SECURITY DEFINER
-- nay chi tra dung 4 cot can de kiem tra mat khau, khong lo them du lieu nao khac,
-- va chi nhan dung 1 email lam tham so (khong the dung de liet ke toan bo bang users).
CREATE OR REPLACE FUNCTION auth_lookup_user_by_email(p_email citext)
RETURNS TABLE(id uuid, password_hash text, is_system_admin boolean, status text) AS $$
  SELECT id, password_hash, is_system_admin, status FROM users WHERE email = p_email;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION auth_lookup_user_by_email(citext) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_lookup_user_by_email(citext) TO app_user;
