#!/usr/bin/env node
"use strict";

/**
 * Test tich hop THAT cho luong P2: upload -> job -> preview -> publish -> reader
 * cong khai, cong voi cai dat sach (allowDownload/thumbnail). Tiep noi phong cach
 * cua api_e2e.test.js (P1) - goi HTTP that, khong mock.
 *
 * Dieu kien truoc khi chay: giong api_e2e.test.js (postgres/redis/migrate/api da
 * len, co dispatcher + worker-convert + pdf-worker dang chay that de job co the
 * chuyen tu 'queued' sang 'done').
 */

const fs = require("fs");
const path = require("path");

const BASE = process.env.API_BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@misa.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeThisAdminPw123!";
const FIXTURE_DIR = path.resolve(__dirname, "../fixtures/pdf");
const VALID_PDF = process.env.FIXTURE_PDF_VALID ?? path.join(FIXTURE_DIR, "sample_vi_text.pdf");
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS ?? 30000);

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
    // no body (vd StreamableFile) - text/status van du de kiem tra
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

async function main() {
  console.log(`API_BASE_URL = ${BASE}`);
  const suffix = uniqueSuffix();

  const adminLogin = await api("POST", "/auth/login", { json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  const adminToken = adminLogin.data?.accessToken;
  check("Admin login thanh cong", !!adminToken, adminLogin);

  const tenant = await api("POST", "/admin/tenants", { token: adminToken, json: { name: `P2 Tenant ${suffix}` } });
  const tenantId = tenant.data.id;
  const user = await api("POST", "/admin/users", {
    token: adminToken,
    json: { email: `p2-${suffix}@test.local`, password: "CreatorP2Pass123!" },
  });
  await api("POST", "/admin/memberships", { token: adminToken, json: { tenantId, userId: user.data.id } });
  const login = await api("POST", "/auth/login", { json: { email: `p2-${suffix}@test.local`, password: "CreatorP2Pass123!" } });
  const token = login.data.accessToken;

  console.log("\nTest: Sach moi tao (draft) chua publish -> public reader phai 404.");
  const book = await api("POST", "/books", { token, tenantId, json: { title: `P2 Demo ${suffix}` } });
  const bookId = book.data.id;
  const permalink = `${book.data.permalink_slug}-${book.data.permalink_suffix}`;
  const draftPublic = await api("GET", `/public/books/${permalink}`);
  check("draft chua publish -> public 404", draftPublic.status === 404, draftPublic);

  console.log("\nTest: Upload PDF that, cho job xong, xem truoc revision.");
  const validBuf = fs.readFileSync(VALID_PDF);
  const form = new FormData();
  form.append("file", new Blob([validBuf], { type: "application/pdf" }), "book.pdf");
  const upload = await api("POST", `/books/${bookId}/upload`, { token, tenantId, form });
  check("upload thanh cong, job queued", upload.status === 201 && upload.data?.jobState === "queued", upload);
  const revisionId = upload.data.revisionId;

  const job = await waitJobDone(upload.data.jobId, token, tenantId);
  check("job hoan tat 'done' (co dispatcher+worker-convert+pdf-worker that chay)", job.state === "done", job);

  const preview = await api("GET", `/books/${bookId}/preview?revisionId=${revisionId}`, { token, tenantId });
  check("preview tra ve dung so trang > 0", preview.status === 200 && preview.data.pages.length > 0, preview.data);
  check(
    "moi trang co imageAssetId va thumbAssetId",
    preview.data.pages.every((p) => p.imageAssetId && p.thumbAssetId),
    preview.data.pages
  );

  console.log("\nTest: Publish revision chua 'ready' (id gia) -> 404; publish dung -> 200.");
  const badPublish = await api("POST", `/books/${bookId}/publish`, {
    token,
    tenantId,
    json: { revisionId: "00000000-0000-0000-0000-000000000000" },
  });
  check("publish revision khong ton tai -> 404", badPublish.status === 404, badPublish);

  const publish = await api("POST", `/books/${bookId}/publish`, { token, tenantId, json: { revisionId } });
  check(
    "publish thanh cong -> status=published",
    (publish.status === 200 || publish.status === 201) && publish.data.status === "published",
    publish.data
  );
  check("cover_asset_id tu dong co gia tri sau publish", !!publish.data.cover_asset_id, publish.data);

  console.log("\nTest: Public reader (khong token) xem duoc sach vua publish.");
  const publicBook = await api("GET", `/public/books/${permalink}`);
  check(
    "public book tra ve dung so trang, khong lo allowDownload=true mac dinh",
    publicBook.status === 200 && publicBook.data.pages.length === preview.data.pages.length && publicBook.data.allowDownload === false,
    publicBook.data
  );

  const firstImageId = publicBook.data.pages[0].imageAssetId;
  const publicAsset = await api("GET", `/public/books/${permalink}/assets/${firstImageId}`);
  check("public asset (page_image) tra ve 200", publicAsset.status === 200, publicAsset);

  const bogusAsset = await api("GET", `/public/books/${permalink}/assets/00000000-0000-0000-0000-000000000000`);
  check("public asset id sai -> 404 (khong lo du lieu)", bogusAsset.status === 404, bogusAsset);

  console.log("\nTest: Upload revision #2 (chua publish) -> public reader VAN chi thay revision #1 da publish.");
  const form2 = new FormData();
  form2.append("file", new Blob([validBuf], { type: "application/pdf" }), "book-v2.pdf");
  const upload2 = await api("POST", `/books/${bookId}/upload`, { token, tenantId, form: form2 });
  await waitJobDone(upload2.data.jobId, token, tenantId);
  const publicAfterV2 = await api("GET", `/public/books/${permalink}`);
  check(
    "public reader khong tu dong nhay sang revision #2 chua publish",
    publicAfterV2.status === 200 && publicAfterV2.data.pages.length === publicBook.data.pages.length,
    publicAfterV2.data
  );

  console.log("\nTest: Cai dat sach (allowDownload, thumbnail).");
  const putSettings = await api("PUT", `/books/${bookId}/settings`, { token, tenantId, json: { allowDownload: true } });
  check("bat allowDownload thanh cong", putSettings.status === 200 && putSettings.data.allow_download === true, putSettings.data);

  const publicAfterSettings = await api("GET", `/public/books/${permalink}`);
  check("public reader phan anh dung allowDownload=true", publicAfterSettings.data.allowDownload === true, publicAfterSettings.data);

  const badThumb = await api("PUT", `/books/${bookId}/settings`, {
    token,
    tenantId,
    json: { thumbnailAssetId: "00000000-0000-0000-0000-000000000000" },
  });
  check("chon thumbnailAssetId khong hop le -> 400", badThumb.status === 400, badThumb);

  console.log(`\n=== KET QUA P2 E2E: ${passed} PASS / ${failed} FAIL ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("P2 E2E TEST SCRIPT ERROR:", err);
  process.exit(1);
});
