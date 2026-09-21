#!/usr/bin/env node
"use strict";

/**
 * Test tich hop THAT cho cac fix SEC-01/SEC-02/SEC-03 tu audit codex 21/09/2026
 * (xem C:\Users\A04-0035\Documents\Codex\2026-09-16\to\outputs\misa-flipbook-audit-20260921\AUDIT.md).
 * Tiep noi phong cach cua p3_e2e.test.js/f16_visibility.test.js - goi HTTP that vao
 * API dang chay that (khong mock); dung DATABASE_URL (role bootstrap) de dung fixture
 * membership/tenant status ma hien chua co endpoint API rieng (giong cach audit da
 * dung, ghi trong EVIDENCE.md: "Quyen fixture duoc dung qua DB cho phep kiem thu").
 *
 *   API_BASE_URL="http://localhost:3000" \
 *   DATABASE_URL="postgres://misa_admin:<pw>@127.0.0.1:5432/misa_flipbook" \
 *   SEED_ADMIN_EMAIL="admin@misa.local" SEED_ADMIN_PASSWORD="<mat khau admin da seed>" \
 *   node sec_audit_20260921.test.js
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
const LOGIN_MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS ?? 10);

if (!DATABASE_URL) {
  console.error("Thieu DATABASE_URL (can de dung fixture membership/tenant status truc tiep).");
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
  return { status: res.status, data, headers: res.headers };
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

async function uploadAndPublish(bookId, token, tenantId, filename) {
  const buf = fs.readFileSync(VALID_PDF);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "application/pdf" }), filename);
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

async function createTenantAndOwner(adminToken, dbClient, label) {
  const suffix = uniqueSuffix();
  const tenant = await api("POST", "/admin/tenants", { token: adminToken, json: { name: `${label} ${suffix}` } });
  const tenantId = tenant.data.id;
  const userRes = await api("POST", "/admin/users", {
    token: adminToken,
    json: { email: `${label.toLowerCase()}-${suffix}@test.local`, password: "SecAudit123!" },
  });
  const membership = await api("POST", "/admin/memberships", { token: adminToken, json: { tenantId, userId: userRes.data.id } });
  const login = await api("POST", "/auth/login", {
    json: { email: `${label.toLowerCase()}-${suffix}@test.local`, password: "SecAudit123!" },
  });
  return { tenantId, userId: userRes.data.id, membershipId: membership.data.id, token: login.data.accessToken, suffix };
}

async function main() {
  console.log(`API_BASE_URL = ${BASE}`);
  const dbClient = new Client({ connectionString: DATABASE_URL });
  await dbClient.connect();

  const adminLogin = await api("POST", "/auth/login", { json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  const adminToken = adminLogin.data?.accessToken;
  check("Admin login thanh cong", !!adminToken, adminLogin);

  // ===================== SEC-02: membership bi thu hoi mat quyen owner ngay =====================
  console.log("\n=== SEC-02a: membership bi Admin thu hoi -> mat quyen owner NGAY (khong doi JWT het han) ===");
  const owner = await createTenantAndOwner(adminToken, dbClient, "Sec02Owner");
  const book = await api("POST", "/books", { token: owner.token, tenantId: owner.tenantId, json: { title: `SEC-02 Private ${owner.suffix}` } });
  const bookId = book.data.id;
  const permalink = `${book.data.permalink_slug}-${book.data.permalink_suffix}`;
  await uploadAndPublish(bookId, owner.token, owner.tenantId, "sec02.pdf");
  await api("PUT", `/books/${bookId}/settings`, { token: owner.token, tenantId: owner.tenantId, json: { visibility: "private" } });

  const ownerSeesBefore = await api("GET", `/public/books/${permalink}`, { token: owner.token });
  check("truoc khi bi thu hoi: owner van xem duoc sach Private cua minh", ownerSeesBefore.status === 200, ownerSeesBefore.data);

  await dbClient.query("UPDATE memberships SET status = 'disabled' WHERE id = $1", [owner.membershipId]);

  const ownerBlockedAfter = await api("GET", `/public/books/${permalink}`, { token: owner.token });
  check(
    "sau khi Admin thu hoi membership: JWT cu (chua het han) khong con duoc xem qua nhu owner (403 privateBook)",
    ownerBlockedAfter.status === 403 && ownerBlockedAfter.data?.privateBook === true,
    ownerBlockedAfter.data
  );

  await dbClient.query("UPDATE memberships SET status = 'active' WHERE id = $1", [owner.membershipId]);
  const ownerSeesRestored = await api("GET", `/public/books/${permalink}`, { token: owner.token });
  check("khoi phuc membership active -> owner xem lai duoc", ownerSeesRestored.status === 200, ownerSeesRestored.data);

  // ===================== SEC-02: tenant suspended chi chan Dashboard, khong chan public reader =====================
  console.log("\n=== SEC-02b: tenant suspended -> chan Dashboard/API quan tri, KHONG chan public reader ===");
  const tenant2 = await createTenantAndOwner(adminToken, dbClient, "Sec02Tenant");
  const book2 = await api("POST", "/books", { token: tenant2.token, tenantId: tenant2.tenantId, json: { title: `SEC-02b Public ${tenant2.suffix}` } });
  const book2Id = book2.data.id;
  const permalink2 = `${book2.data.permalink_slug}-${book2.data.permalink_suffix}`;
  await uploadAndPublish(book2Id, tenant2.token, tenant2.tenantId, "sec02b.pdf");

  await api("PATCH", `/admin/tenants/${tenant2.tenantId}`, { token: adminToken, json: { status: "suspended" } });

  const dashboardBlocked = await api("GET", `/books/${book2Id}`, { token: tenant2.token, tenantId: tenant2.tenantId });
  check(
    "tenant suspended: Creator KHONG con GET duoc sach qua Dashboard (403), truoc day la 200",
    dashboardBlocked.status === 403,
    dashboardBlocked.data
  );
  const patchBlocked = await api("PATCH", `/books/${book2Id}`, { token: tenant2.token, tenantId: tenant2.tenantId, json: { title: "Doi ten khi suspended" } });
  check("tenant suspended: Creator KHONG con PATCH duoc sach (403)", patchBlocked.status === 403, patchBlocked.data);

  const publicStillWorks = await api("GET", `/public/books/${permalink2}`);
  check(
    "tenant suspended: nguoi doc cong khai VAN xem duoc sach da publish (quyet dinh 2026-09-21: suspend khong chan public reader)",
    publicStillWorks.status === 200 && publicStillWorks.data.pages.length > 0,
    publicStillWorks.data
  );

  await api("PATCH", `/admin/tenants/${tenant2.tenantId}`, { token: adminToken, json: { status: "active" } });
  const dashboardRestored = await api("GET", `/books/${book2Id}`, { token: tenant2.token, tenantId: tenant2.tenantId });
  check("khoi phuc tenant active -> Creator vao lai Dashboard binh thuong", dashboardRestored.status === 200, dashboardRestored.data);

  // ===================== SEC-01: Cache-Control theo protected vs public =====================
  console.log("\n=== SEC-01: Cache-Control khong con public/immutable cho sach co mat khau/Private ===");
  const publicAssetRes = await api("GET", `/public/books/${permalink2}`);
  const publicAssetId = publicAssetRes.data.pages[0]?.imageAssetId;
  const publicAssetHeaders = await fetch(`${BASE}/public/books/${permalink2}/assets/${publicAssetId}`);
  check(
    "sach cong khai thuong: cache public nhung buoc tai xac thuc de doi Public -> Private khong lo cache cu",
    publicAssetHeaders.headers.get("cache-control") === "public, max-age=0, must-revalidate",
    publicAssetHeaders.headers.get("cache-control")
  );

  await api("PUT", `/books/${book2Id}/settings`, { token: tenant2.token, tenantId: tenant2.tenantId, json: { password: "CacheTest123!" } });
  const protectedAssetRes = await api("GET", `/public/books/${permalink2}`, { token: tenant2.token });
  const protectedAssetId = protectedAssetRes.data.pages[0]?.imageAssetId;
  const protectedHeaders = await fetch(`${BASE}/public/books/${permalink2}/assets/${protectedAssetId}?token=${encodeURIComponent(tenant2.token)}`);
  check(
    "sach vua bat mat khau: Cache-Control tro thanh private, no-store (truoc day van public, max-age=3600, immutable)",
    protectedHeaders.headers.get("cache-control") === "private, no-store",
    protectedHeaders.headers.get("cache-control")
  );
  const manifestHeaders = await fetch(`${BASE}/public/books/${permalink2}`, { headers: { Authorization: `Bearer ${tenant2.token}` } });
  check(
    "manifest (GET /public/books/:permalink) cua sach co mat khau cung private, no-store",
    manifestHeaders.headers.get("cache-control") === "private, no-store",
    manifestHeaders.headers.get("cache-control")
  );
  await api("PUT", `/books/${book2Id}/settings`, { token: tenant2.token, tenantId: tenant2.tenantId, json: { removePassword: true } });

  // ===================== SEC-03: login throttle theo (ip,email), khong khoa email khac =====================
  console.log("\n=== SEC-03: dang nhap sai lien tiep -> 429; email KHAC (cung tien trinh test = cung IP) khong bi anh huong ===");
  const throttleEmail = `sec03-throttle-${uniqueSuffix()}@test.local`;
  let lastLoginAttempt;
  for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
    lastLoginAttempt = await api("POST", "/auth/login", { json: { email: throttleEmail, password: `sai-${i}` } });
  }
  check(
    `sau ${LOGIN_MAX_ATTEMPTS} lan dang nhap sai lien tiep cung email -> lan cuoi 429`,
    lastLoginAttempt.status === 429,
    lastLoginAttempt.data
  );
  const otherEmailLogin = await api("POST", "/auth/login", { json: { email: ADMIN_EMAIL, password: "sai-mat-khau-random" } });
  check(
    "email KHAC (dung Admin that) tu cung tien trinh test (cung dia chi IP) van 401 binh thuong, KHONG bi 429 lay",
    otherEmailLogin.status === 401,
    otherEmailLogin.data
  );
  const adminStillLogsIn = await api("POST", "/auth/login", { json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  check("Admin van dang nhap dung mat khau binh thuong sau do (khong bi khoa lay)", !!adminStillLogsIn.data?.accessToken, adminStillLogsIn.data);

  await dbClient.end();

  console.log(`\n=== KET QUA SEC AUDIT E2E: ${passed} PASS / ${failed} FAIL ===`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("SEC AUDIT E2E TEST SCRIPT ERROR:", err);
  process.exit(1);
});
