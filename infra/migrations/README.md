# Migration Postgres — MISA Flipbook

SQL thuan, ap dung theo thu tu ten file (`000N_*.sql`), theo doi trong bang `schema_migrations`.
Khong dung ORM migration generator vi RLS/role can kiem soat tung cau lenh (xem
[ARCHITECTURE.md](../../ARCHITECTURE.md) muc 4 va `0003_rls_policies.sql`).

## Chay thu (Docker Compose local)

```bash
# 1. Khoi dong Postgres + Redis
cd infra/docker
cp .env.example .env   # sua POSTGRES_PASSWORD / APP_DB_PASSWORD that
docker compose up -d

# 2. Ap dung migration (tao role app_user + toan bo schema/RLS)
cd ../migrations
npm install
DATABASE_URL="postgres://<POSTGRES_USER>:<POSTGRES_PASSWORD>@127.0.0.1:5432/<POSTGRES_DB>" \
APP_DB_PASSWORD="<mat khau se gan cho app_user>" \
node run.js
```

`run.js` idempotent: chay lai khong lam gi neu khong co file `.sql` moi; luon dong bo lai mat
khau `app_user` theo `APP_DB_PASSWORD` hien tai.

## Vai tro hai role

- **Bootstrap** (`DATABASE_URL`, vd `misa_admin` — user mac dinh cua image `postgres`, thuc te
  la superuser trong container): dung DE CHAY MIGRATION, tao bang/role/policy. Khong dung role
  nay cho ket noi runtime cua API.
- **app_user**: role runtime that su cua API/worker. Khong SUPERUSER, khong BYPASSRLS, khong
  CREATEDB/CREATEROLE. Moi bang co du lieu tenant deu `ENABLE` + `FORCE ROW LEVEL SECURITY`,
  nen ke ca khi code ung dung co bug quen loc theo tenant, database van tu chan.

Ghi chu san xuat: dung superuser lam bootstrap chi chap nhan cho pilot Docker Compose don gian.
Truoc khi len server that, doi bootstrap role bang mot role co CREATEROLE nhung KHONG superuser,
tach biet voi tai khoan quan tri Postgres cap ha tang.

## Context truyen tenant/user vao transaction

API phai `SET LOCAL app.tenant_id`, `SET LOCAL app.user_id`, `SET LOCAL app.is_system_admin`
o dau MOI transaction truoc khi chay query nghiep vu (xem vi du trong
`tests/integration/tenant_isolation.test.js`). Khong set gi = coi nhu request chua xac thuc,
RLS se tra ve rong cho moi bang co du lieu tenant.
