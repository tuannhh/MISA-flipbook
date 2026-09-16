-- Extensions can gioi han khong can superuser tren hau het managed Postgres.
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- email khong phan biet hoa/thuong

-- Ham dung chung: tu dong cap nhat cot updated_at khi UPDATE.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
