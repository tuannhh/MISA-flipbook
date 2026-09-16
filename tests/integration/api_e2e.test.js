#!/usr/bin/env node
"use strict";

/**
 * Test tich hop THAT qua HTTP API (khong chi DB truc tiep nhu tenant_isolation.test.js).
 * Kiem tra ca chuoi: auth JWT -> DbContextInterceptor -> membership check -> RLS.
 *
 * Dieu kien truoc khi chay:
 *   - Postgres + Redis da len (infra/docker), migration da ap dung (infra/migrations).
 *   - Da seed 1 system admin (apps/api/scripts/seed-admin.ts).
 *   - API dang chay (node apps/api/dist/main.js) tai API_BASE_URL.
 *
 * Bien moi truong:
 *   API_BASE_URL (mac dinh http://localhost:3000)
 *   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (tai khoan admin da seed)
 *   FIXTURE_PDF_VALID / FIXTURE_PDF_INVALID (duong dan file test)
 *
 * Ghi chu: script nay TAO du lieu that (tenant/user moi, email ngau nhien) trong DB
 * dich va KHONG tu don dep — chi chay tren DB dev/CI dung mot lan, khong chay tren
 * production.
 */

const fs = require("fs");
const path = require("path");

const BASE = process.env.API_BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@misa.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeThisAdminPw123!";
const FIXTURE_DIR = path.resolve(__dirname, "../fixtures/pdf");
const VALID_PDF = process.env.FIXTURE_PDF_VALID ?? path.join(FIXTURE_DIR, "sample_vi_text.pdf");
const INVALID_PDF =
  process.env.FIXTURE_PDF_INVALID ?? path.join(FIXTURE_DIR, "sample_wrong_mime.pdf");

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

async function api(method, urlPath, { token, tenantId, json, form } = {}) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (tenantId) headers["x-tenant-id"] = tenantId;
  let body;
  if (json) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
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

async function main() {
  console.log(`API_BASE_URL = ${BASE}`);

  const health = await api("GET", "/health");
  check("GET /health tra ve 200", health.status === 200);

  const adminLogin = await api("POST", "/auth/login", {
    json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  check("Admin login thanh cong", adminLogin.status === 201 || adminLogin.status === 200, adminLogin);
  const adminToken = adminLogin.data?.accessToken;

  const suffix = uniqueSuffix();
  const tenantA = await api("POST", "/admin/tenants", {
    token: adminToken,
    json: { name: `E2E Tenant A ${suffix}` },
  });
  check("Admin tao Tenant A", tenantA.status === 201 || tenantA.status === 200, tenantA);
  const tenantAId = tenantA.data.id;

  const tenantB = await api("POST", "/admin/tenants", {
    token: adminToken,
    json: { name: `E2E Tenant B ${suffix}` },
  });
  const tenantBId = tenantB.data.id;

  const userA = await api("POST", "/admin/users", {
    token: adminToken,
    json: { email: `e2e-a-${suffix}@test.local`, password: "CreatorAPass123!" },
  });
  const userAId = userA.data.id;

  const userB = await api("POST", "/admin/users", {
    token: adminToken,
    json: { email: `e2e-b-${suffix}@test.local`, password: "CreatorBPass123!" },
  });
  const userBId = userB.data.id;

  await api("POST", "/admin/memberships", {
    token: adminToken,
    json: { tenantId: tenantAId, userId: userAId },
  });
  await api("POST", "/admin/memberships", {
    token: adminToken,
    json: { tenantId: tenantBId, userId: userBId },
  });

  const loginA = await api("POST", "/auth/login", {
    json: { email: `e2e-a-${suffix}@test.local`, password: "CreatorAPass123!" },
  });
  const tokenA = loginA.data.accessToken;
  const loginB = await api("POST", "/auth/login", {
    json: { email: `e2e-b-${suffix}@test.local`, password: "CreatorBPass123!" },
  });
  const tokenB = loginB.data.accessToken;

  console.log("\nTest: GET /me tra ve dung membership cua Creator A.");
  const meA = await api("GET", "/me", { token: tokenA });
  check(
    "me.memberships chua dung 1 tenant A",
    meA.data.memberships.length === 1 && meA.data.memberships[0].tenantId === tenantAId,
    meA.data
  );

  console.log("\nTest: tao sach thieu x-tenant-id bi tu choi 400.");
  const noTenant = await api("POST", "/books", { token: tokenA, json: { title: "Khong co tenant" } });
  check("thieu x-tenant-id -> 400", noTenant.status === 400, noTenant);

  console.log("\nTest: Creator A tao sach trong Tenant A thanh cong, permalink dung dinh dang F02.");
  const createBook = await api("POST", "/books", {
    token: tokenA,
    tenantId: tenantAId,
    json: { title: "Ky yeu 70 nam MISA" },
  });
  check("tao sach thanh cong (201/200)", createBook.status === 201 || createBook.status === 200, createBook);
  const bookId = createBook.data?.id;
  check(
    "permalink_suffix dai 8 ky tu a-z0-9",
    /^[a-z0-9]{8}$/.test(createBook.data?.permalink_suffix ?? "")
  );

  console.log("\nTest: Creator B (khac tenant, chua co membership Tenant A) bi 403 khi tu xung Tenant A.");
  const bListTenantA = await api("GET", "/books", { token: tokenB, tenantId: tenantAId });
  check("Creator B claim Tenant A -> 403", bListTenantA.status === 403, bListTenantA);

  console.log("\nTest: Creator B dung dung Tenant B cua minh -> list rong (khong thay sach Tenant A).");
  const bListTenantB = await api("GET", "/books", { token: tokenB, tenantId: tenantBId });
  check(
    "Creator B list Tenant B rong",
    Array.isArray(bListTenantB.data) && bListTenantB.data.length === 0,
    bListTenantB.data
  );

  console.log("\nTest: Creator B khong GET duoc truc tiep sach cua Tenant A (404, khong duoc 200).");
  const bGetBookA = await api("GET", `/books/${bookId}`, { token: tokenB, tenantId: tenantBId });
  check("Creator B GET sach Tenant A -> 404", bGetBookA.status === 404, bGetBookA);

  console.log("\nTest: Upload PDF gia (sai chu ky) bi tu choi 400.");
  const invalidBuf = fs.readFileSync(INVALID_PDF);
  const invalidForm = new FormData();
  invalidForm.append(
    "file",
    new Blob([invalidBuf], { type: "application/pdf" }),
    "fake.pdf"
  );
  const badUpload = await api("POST", `/books/${bookId}/upload`, {
    token: tokenA,
    tenantId: tenantAId,
    form: invalidForm,
  });
  check("upload file gia -> 400", badUpload.status === 400, badUpload);

  console.log("\nTest: Upload PDF that -> tao revision + job 'queued'.");
  const validBuf = fs.readFileSync(VALID_PDF);
  const validForm = new FormData();
  validForm.append("file", new Blob([validBuf], { type: "application/pdf" }), "book.pdf");
  const goodUpload = await api("POST", `/books/${bookId}/upload`, {
    token: tokenA,
    tenantId: tenantAId,
    form: validForm,
  });
  check(
    "upload that thanh cong, job state = queued",
    goodUpload.status === 201 && goodUpload.data?.jobState === "queued",
    goodUpload
  );

  const jobId = goodUpload.data?.jobId;
  if (jobId) {
    const jobStatusOwn = await api("GET", `/jobs/${jobId}`, { token: tokenA, tenantId: tenantAId });
    check("Creator A xem duoc job cua minh", jobStatusOwn.status === 200, jobStatusOwn);

    const jobStatusOther = await api("GET", `/jobs/${jobId}`, { token: tokenB, tenantId: tenantBId });
    check("Creator B KHONG xem duoc job cua Tenant A", jobStatusOther.status === 404, jobStatusOther);
  } else {
    check("co jobId de kiem tra tiep", false, goodUpload);
  }

  console.log(`\n=== KET QUA E2E: ${passed} PASS / ${failed} FAIL ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("E2E TEST SCRIPT ERROR:", err);
  process.exit(1);
});
