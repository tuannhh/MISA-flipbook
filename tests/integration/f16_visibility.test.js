#!/usr/bin/env node
"use strict";

/**
 * Test tich hop THAT cho F16 (cong tac Publish/Private tren sach DA publish - xem
 * PLAN.md muc 8 va MEMORYBANK.md phan quyet dinh da chot 17/09/2026). Tiep noi phong
 * cach cua p3_e2e.test.js - goi HTTP that vao API dang chay that (khong mock), cong
 * them 1 truy van Postgres truc tiep (bang DATABASE_URL, dung role bootstrap misa_admin
 * de doc audit_logs khong bi RLS chan) de xac nhan THAT Admin xem sach Private cua
 * nguoi khac co ghi audit log, khong chi tin API tra ve 200 la du.
 *
 * Dieu kien truoc khi chay: postgres/redis/migrate/api da len, da ap dung migration
 * 0008_book_visibility.sql, co dispatcher + worker-convert + pdf-worker dang chay that.
 *
 *   API_BASE_URL="http://localhost:3000" \
 *   DATABASE_URL="postgres://misa_admin:<pw>@127.0.0.1:5432/misa_flipbook" \
 *   ADMIN_EMAIL="admin@misa.local" ADMIN_PASSWORD="<mat khau admin da seed>" \
 *   node f16_visibility.test.js
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const BASE = process.env.API_BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@misa.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeThisAdminPw123!";
const DATABASE_URL = process.env.DATABASE_URL;
const FIXTURE_DIR = path.resolve(__dirname, "../fixtures/pdf");
const VALID_PDF = process.env.FIXTURE_PDF_VALID ?? path.join(FIXTURE_DIR, "sample_vi_text.pdf");
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS ?? 30000);

if (!DATABASE_URL) {
  console.error("Thieu DATABASE_URL (can de doc bang audit_logs truc tiep, khong qua API).");
  process.exit(1);
}

let passed = 0;
let failed = 0;
function check(label, condition, extra) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed += 1;
  } else {
    console.log(`  FAIL: ${label}${extra ? " -- " + JSON.stringify(extra) : ""}`);
    failed += 1;
  }
}

async function api(method, urlPath, { token, tenantId, json } = {}) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (tenantId) headers["x-tenant-id"] = tenantId;
  let body;
  if (json) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers, body });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // no body
  }
  return { status: res.status, data };
}

function uniqueSuffix() {
  return Math.random().toString(36).slice(2, 10);
}

async function waitJobDone(jobId, token, tenantId) {
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await api("GET", `/jobs/${jobId}`, { token, tenantId });
    if (res.data?.state === "done" || res.data?.state === "failed") return res.data;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Job ${jobId} khong xong sau ${JOB_TIMEOUT_MS}ms.`);
}

async function uploadAndPublish(bookId, token, tenantId) {
  const buf = fs.readFileSync(VALID_PDF);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "application/pdf" }), "f16.pdf");
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (tenantId) headers["x-tenant-id"] = tenantId;
  const res = await fetch(`${BASE}/books/${bookId}/upload`, { method: "POST", headers, body: form });
  const upload = await res.json();
  const job = await waitJobDone(upload.jobId, token, tenantId);
  if (job.state !== "done") throw new Error(`Job upload that bai: ${JSON.stringify(job)}`);
  const publish = await api("POST", `/books/${bookId}/publish`, { token, tenantId, json: { revisionId: upload.revisionId } });
  if (publish.status >= 300) throw new Error(`Publish that bai: ${JSON.stringify(publish.data)}`);
  return upload.revisionId;
}

async function main() {
  console.log(`API_BASE_URL = ${BASE}`);
  const suffix = uniqueSuffix();

  const adminLogin = await api("POST", "/auth/login", { json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  const adminToken = adminLogin.data?.accessToken;
  check("Admin login thanh cong", !!adminToken, adminLogin);

  // Tenant A: chu so huu sach.
  const tenantA = await api("POST", "/admin/tenants", { token: adminToken, json: { name: `F16 Tenant A ${suffix}` } });
  const tenantAId = tenantA.data.id;
  const ownerRes = await api("POST", "/admin/users", {
    token: adminToken,
    json: { email: `f16-owner-${suffix}@test.local`, password: "F16OwnerPass123!" },
  });
  await api("POST", "/admin/memberships", { token: adminToken, json: { tenantId: tenantAId, userId: ownerRes.data.id } });
  const ownerLogin = await api("POST", "/auth/login", { json: { email: `f16-owner-${suffix}@test.local`, password: "F16OwnerPass123!" } });
  const ownerToken = ownerLogin.data.accessToken;

  // Tenant B: Creator KHONG lien quan, dung de xac nhan bi tu choi dung nghia (khong
  // phai owner, khong phai admin) chu khong chi don gian la "khong dang nhap".
  const tenantB = await api("POST", "/admin/tenants", { token: adminToken, json: { name: `F16 Tenant B ${suffix}` } });
  const tenantBId = tenantB.data.id;
  const strangerRes = await api("POST", "/admin/users", {
    token: adminToken,
    json: { email: `f16-stranger-${suffix}@test.local`, password: "F16StrangerPass123!" },
  });
  await api("POST", "/admin/memberships", { token: adminToken, json: { tenantId: tenantBId, userId: strangerRes.data.id } });
  const strangerLogin = await api("POST", "/auth/login", {
    json: { email: `f16-stranger-${suffix}@test.local`, password: "F16StrangerPass123!" },
  });
  const strangerToken = strangerLogin.data.accessToken;

  const book = await api("POST", "/books", { token: ownerToken, tenantId: tenantAId, json: { title: `F16 Private Demo ${suffix}` } });
  const bookId = book.data.id;
  const permalink = `${book.data.permalink_slug}-${book.data.permalink_suffix}`;
  await uploadAndPublish(bookId, ownerToken, tenantAId);

  console.log("\n=== F16: cong tac Publish/Private tren sach da publish ===");

  const publicBefore = await api("GET", `/public/books/${permalink}`);
  check("truoc khi bat Private, ai cung xem duoc (mac dinh visibility=public)", publicBefore.status === 200, publicBefore.data);

  const setPrivate = await api("PUT", `/books/${bookId}/settings`, { token: ownerToken, tenantId: tenantAId, json: { visibility: "private" } });
  check("owner bat Private thanh cong, visibility=private", setPrivate.status === 200 && setPrivate.data.visibility === "private", setPrivate.data);

  const anonBlocked = await api("GET", `/public/books/${permalink}`);
  check(
    "sau khi bat Private: nguoi xem an danh bi 403 privateBook (KHONG phai 404 - sach van ton tai)",
    anonBlocked.status === 403 && anonBlocked.data?.privateBook === true,
    anonBlocked.data
  );

  const strangerBlocked = await api("GET", `/public/books/${permalink}`, { token: strangerToken });
  check(
    "Creator khac (co dang nhap that, khong phai owner/admin) van bi 403 privateBook qua CHINH permalink",
    strangerBlocked.status === 403 && strangerBlocked.data?.privateBook === true,
    strangerBlocked.data
  );

  const ownerStillSees = await api("GET", `/public/books/${permalink}`, { token: ownerToken });
  check(
    "owner (dang nhap, gui JWT thuong qua CHINH permalink cong khai) van xem duoc sach Private cua minh",
    ownerStillSees.status === 200 && ownerStillSees.data.pages.length > 0,
    ownerStillSees.data
  );

  console.log("\nTest: Admin xem sach Private cua nguoi khac -> duoc phep NHUNG bat buoc ghi audit_logs.");
  const dbClient = new Client({ connectionString: DATABASE_URL });
  await dbClient.connect();
  const beforeCount = await dbClient.query(
    "SELECT count(*)::int AS n FROM audit_logs WHERE action = 'view_private_book_as_admin' AND resource_id = $1",
    [bookId]
  );
  const adminViews = await api("GET", `/public/books/${permalink}`, { token: adminToken });
  check("Admin (system admin, khong phai owner) van xem duoc sach Private", adminViews.status === 200 && adminViews.data.pages.length > 0, adminViews.data);
  const afterCount = await dbClient.query(
    "SELECT count(*)::int AS n FROM audit_logs WHERE action = 'view_private_book_as_admin' AND resource_id = $1",
    [bookId]
  );
  check(
    "moi lan Admin xem sach Private khong phai cua minh -> them dung 1 dong audit_logs",
    afterCount.rows[0].n === beforeCount.rows[0].n + 1,
    { before: beforeCount.rows[0].n, after: afterCount.rows[0].n }
  );
  const auditRow = await dbClient.query(
    "SELECT actor_user_id, tenant_id, action FROM audit_logs WHERE action = 'view_private_book_as_admin' AND resource_id = $1 ORDER BY occurred_at DESC LIMIT 1",
    [bookId]
  );
  check(
    "dong audit_logs moi nhat dung actor la Admin va dung tenant cua sach",
    auditRow.rows[0]?.tenant_id === tenantAId,
    auditRow.rows[0]
  );

  console.log("\nTest: Private la lop chan CAO HON mat khau F05 - dat them mat khau khi dang Private van khong doi ket qua.");
  await api("PUT", `/books/${bookId}/settings`, { token: ownerToken, tenantId: tenantAId, json: { password: "MatKhauThuaKhiPrivate123" } });
  const anonWithPasswordAttempt = await api("GET", `/public/books/${permalink}`);
  check(
    "van la 403 privateBook (khong phai 403 passwordRequired) - khong cong don 2 lop bao ve",
    anonWithPasswordAttempt.status === 403 && anonWithPasswordAttempt.data?.privateBook === true && !anonWithPasswordAttempt.data?.passwordRequired,
    anonWithPasswordAttempt.data
  );
  await api("PUT", `/books/${bookId}/settings`, { token: ownerToken, tenantId: tenantAId, json: { removePassword: true } });

  console.log("\nTest: chuyen lai Publish (visibility=public) -> ai cung xem duoc nhu cu, link khong doi.");
  const setPublic = await api("PUT", `/books/${bookId}/settings`, { token: ownerToken, tenantId: tenantAId, json: { visibility: "public" } });
  check("owner chuyen lai Publish thanh cong", setPublic.status === 200 && setPublic.data.visibility === "public", setPublic.data);
  const anonAfterPublic = await api("GET", `/public/books/${permalink}`);
  check(
    "sau khi chuyen lai Publish: an danh xem duoc lai binh thuong, dung permalink cu",
    anonAfterPublic.status === 200 && anonAfterPublic.data.permalink === permalink,
    anonAfterPublic.data
  );

  await dbClient.end();
  console.log(`\n=== KET QUA F16 E2E: ${passed} PASS / ${failed} FAIL ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("F16 E2E TEST SCRIPT ERROR:", err);
  process.exit(1);
});
