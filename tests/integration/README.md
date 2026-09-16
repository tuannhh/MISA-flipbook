# Test tich hop — cach ly tenant (RLS)

`tenant_isolation.test.js` la bang chung THAT cho dieu kien di tiep cua P1 trong
[ROADMAP.md](../../ROADMAP.md): "Hai tenant va hai Creator khong doc/sua du lieu quan tri
cua nhau; cold start Docker duoc". Chay truc tiep tren Postgres that qua Docker Compose,
khong mock, khong tu nhan "pass".

## Chay

Sau khi da `docker compose up -d` (infra/docker) va ap dung migration (infra/migrations):

```bash
cd tests/integration
npm install
DATABASE_URL="postgres://<bootstrap_user>:<pw>@127.0.0.1:5432/<db>" \
APP_USER_URL="postgres://app_user:<app_pw>@127.0.0.1:5432/<db>" \
node tenant_isolation.test.js
```

## Pham vi da kiem chung (13 assertion, chay that ngay 16/09/2026)

1. Creator chi thay sach cua chinh minh, kho ke ca cung tenant voi Creator khac.
2-3. Creator khong doc/sua duoc sach cua tenant khac.
4. Creator khong sua duoc sach cua Creator khac cung tenant.
5-6. INSERT gia mao tenant_id hoac owner_id bi RLS tu choi (loi "row-level security"), khong
   am tham thanh cong voi 0 dong.
7. Revision con thua ke dung quy tac owner-scoped (khong phai tenant-wide).
8. Admin (is_system_admin=true) doc duoc xuyen tenant.
9. Session khong dat tenant/user/admin (mo phong request chua xac thuc) khong thay gi.

## Chua kiem chung o day (con mo)

- Luong qua HTTP API that (NestJS) — test nay noi truc tiep Postgres, chua co tang API/auth.
- Public/anonymous reader path cho sach da publish (se lam o P2, can view/function rieng
  thay vi RLS chung cua bang `books`).
- Hanh vi duoi tai/concurrency (nhieu transaction dong thoi, connection pool tai su dung).
