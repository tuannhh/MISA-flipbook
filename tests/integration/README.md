# Test tich hop

Ba file test tich hop THAT (khong mock), chay tren stack Docker that qua
`infra/docker/docker-compose.yml`, khong tu nhan "pass":

- `tenant_isolation.test.js` — DB-level (RLS), noi thang Postgres bang `pg`.
- `api_e2e.test.js` — HTTP-level qua NestJS API (P1): auth JWT, tenant middleware, upload.
- `p2_e2e.test.js` — HTTP-level luong P2: upload -> job -> preview -> publish -> public reader,
  cai dat sach (allowDownload/thumbnail). Doi hoi dispatcher + worker-convert + pdf-worker
  dang chay that (khong chi API) vi phai cho job chuyen tu 'queued' sang 'done'.

## Chay

Sau khi da `docker compose up -d` (infra/docker), ap dung migration (infra/migrations) va
seed 1 system admin (`apps/api/scripts/seed-admin.ts`):

```bash
cd tests/integration
npm install

# DB-level
DATABASE_URL="postgres://<bootstrap_user>:<pw>@127.0.0.1:5432/<db>" \
APP_USER_URL="postgres://app_user:<app_pw>@127.0.0.1:5432/<db>" \
node tenant_isolation.test.js

# HTTP-level (P1 + P2)
API_BASE_URL="http://localhost:3000" \
ADMIN_EMAIL="admin@misa.local" ADMIN_PASSWORD="<mat khau admin da seed>" \
node api_e2e.test.js
node p2_e2e.test.js
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

## Pham vi da kiem chung trong p2_e2e.test.js (16 assertion, chay that ngay 16/09/2026)

Sach draft chua publish -> public reader 404; upload PDF that -> job 'done' -> preview co
day imageAssetId/thumbAssetId; publish revision khong ton tai -> 404; publish thanh cong ->
cover_asset_id tu dong co (thumbnail trang dau); public reader khong dang nhap doc duoc sach
da publish nhung KHONG tu dong nhay sang revision moi hon chua publish; asset id sai -> 404
(khong lo du lieu qua brute-force id); cai dat allowDownload/thumbnail hoat dong dung, tu
choi thumbnailAssetId khong hop le.

Ngoai ra da kiem chung THU CONG (khong tu dong hoa, ghi lai trong MEMORYBANK.md): kill
`worker-convert` bang SIGKILL giua luc dang xu ly job 150 trang — api/dispatcher khong bi
anh huong, job duoc BullMQ tu phat hien "stalled" va xu ly lai tu dau sau khi worker-convert
song lai, hoan tat dung (khong mat, khong trung du lieu).

## Chua kiem chung o day (con mo)

- Hanh vi duoi tai/concurrency that (nhieu transaction dong thoi, connection pool tai su dung,
  nhieu upload/publish dong thoi tren cung 1 sach).
- Reconciler DB (jobs 'processing' qua han bi dua ve 'queued') chi kiem chung qua doc code,
  chua co test tu dong gia lap job ket qua STUCK_JOB_TIMEOUT_MINUTES that (15 phut mac dinh,
  qua lau de chay trong test tu dong o day).
- Mat khau bao ve sach cong khai (book_settings.password_hash) — cho P3.
