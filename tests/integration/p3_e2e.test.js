#!/usr/bin/env node
"use strict";

/**
 * Test tich hop THAT cho P3 (Quan ly xuat ban): F05 mat khau xem, F07 replace/rollback
 * PDF, F11 tai xuong PDF goc co dieu kien. Tiep noi phong cach cua p2_e2e.test.js -
 * goi HTTP that vao API dang chay that (khong mock), tu kiem tra ket qua bang check().
 *
 * Dieu kien truoc khi chay: giong p2_e2e.test.js (postgres/redis/migrate/api da len,
 * co dispatcher + worker-convert + pdf-worker dang chay that, VA da ap dung migration
 * 0007_book_password_protection.sql).
 */

const fs = require("fs");
const path = require("path");

const BASE = process.env.API_BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@misa.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeThisAdminPw123!";
const FIXTURE_DIR = path.resolve(__dirname, "../fixtures/pdf");
const VALID_PDF = process.env.FIXTURE_PDF_VALID ?? path.join(FIXTURE_DIR, "sample_vi_text.pdf");
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS ?? 30000);
// Phai khop mac dinh trong apps/api/src/modules/public/public-books.controller.ts
// (khong dat bien moi truong BOOK_PASSWORD_* rieng cho dev/test hien tai).
const PASSWORD_MAX_ATTEMPTS = Number(process.env.BOOK_PASSWORD_MAX_ATTEMPTS ?? 8);

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

async function api(method, urlPath, { token, tenantId, json, form, asBuffer } = {}) {
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
  if (asBuffer) {
    data = Buffer.from(await res.arrayBuffer());
  } else {
    try {
      data = await res.json();
    } catch {
      // no body (vd StreamableFile khi khong asBuffer) - text/status van du de kiem tra
    }
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
  const upload = await api("POST", `/books/${bookId}/upload`, { token, tenantId, form });
  const job = await waitJobDone(upload.data.jobId, token, tenantId);
  if (job.state !== "done") throw new Error(`Job upload ${filename} that bai: ${JSON.stringify(job)}`);
  const publish = await api("POST", `/books/${bookId}/publish`, {
    token,
    tenantId,
    json: { revisionId: upload.data.revisionId },
  });
  if (publish.status >= 300) throw new Error(`Publish ${filename} that bai: ${JSON.stringify(publish.data)}`);
  return upload.data.revisionId;
}

async function main() {
  console.log(`API_BASE_URL = ${BASE}`);
  const suffix = uniqueSuffix();

  const adminLogin = await api("POST", "/auth/login", { json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  const adminToken = adminLogin.data?.accessToken;
  check("Admin login thanh cong", !!adminToken, adminLogin);

  const tenant = await api("POST", "/admin/tenants", { token: adminToken, json: { name: `P3 Tenant ${suffix}` } });
  const tenantId = tenant.data.id;
  const user = await api("POST", "/admin/users", {
    token: adminToken,
    json: { email: `p3-${suffix}@test.local`, password: "CreatorP3Pass123!" },
  });
  await api("POST", "/admin/memberships", { token: adminToken, json: { tenantId, userId: user.data.id } });
  const login = await api("POST", "/auth/login", { json: { email: `p3-${suffix}@test.local`, password: "CreatorP3Pass123!" } });
  const token = login.data.accessToken;

  // ===================== F05: mat khau xem sach =====================
  console.log("\n=== F05: mat khau xem sach ===");
  const book = await api("POST", "/books", { token, tenantId, json: { title: `P3 Password Demo ${suffix}` } });
  const bookId = book.data.id;
  const permalink = `${book.data.permalink_slug}-${book.data.permalink_suffix}`;
  const revisionV1 = await uploadAndPublish(bookId, token, tenantId, "v1.pdf");

  const publicBeforePassword = await api("GET", `/public/books/${permalink}`);
  check("truoc khi dat mat khau, public reader xem duoc thang", publicBeforePassword.status === 200, publicBeforePassword.data);

  const setPw = await api("PUT", `/books/${bookId}/settings`, { token, tenantId, json: { password: "MatKhauBiMat123" } });
  check("dat mat khau thanh cong, has_password=true", setPw.status === 200 && setPw.data.has_password === true, setPw.data);

  const blockedNoToken = await api("GET", `/public/books/${permalink}`);
  check(
    "sau khi dat mat khau, public reader khong token -> 403 passwordRequired",
    blockedNoToken.status === 403 && blockedNoToken.data?.passwordRequired === true,
    blockedNoToken.data
  );

  const wrongPw = await api("POST", `/public/books/${permalink}/verify-password`, { json: { password: "sai roi" } });
  check("sai mat khau -> 401", wrongPw.status === 401, wrongPw.data);

  const rightPw = await api("POST", `/public/books/${permalink}/verify-password`, { json: { password: "MatKhauBiMat123" } });
  check("dung mat khau -> 201/200, tra ve readerToken gioi han dung sach/revision", (rightPw.status === 200 || rightPw.status === 201) && !!rightPw.data?.readerToken, rightPw.data);
  const readerToken = rightPw.data.readerToken;

  const withToken = await api("GET", `/public/books/${permalink}?token=${encodeURIComponent(readerToken)}`);
  check("co readerToken (query) -> xem duoc sach", withToken.status === 200 && withToken.data.pages.length > 0, withToken.data);

  const withHeaderToken = await api("GET", `/public/books/${permalink}`, { token: readerToken });
  check("co readerToken (header Authorization) -> xem duoc sach", withHeaderToken.status === 200, withHeaderToken.data);

  const assetIdProtected = withToken.data.pages[0].imageAssetId;
  const assetNoToken = await api("GET", `/public/books/${permalink}/assets/${assetIdProtected}`);
  check("anh trang cua sach co mat khau, KHONG token -> tu choi (khong lo anh)", assetNoToken.status === 403 || assetNoToken.status === 404, assetNoToken.data);
  const assetWithToken = await api("GET", `/public/books/${permalink}/assets/${assetIdProtected}?token=${encodeURIComponent(readerToken)}`);
  check("anh trang co token dung -> 200", assetWithToken.status === 200, assetWithToken.data);

  console.log("\nTest: doi mat khau lam access_epoch tang -> token cu het hieu luc ngay.");
  const changePw = await api("PUT", `/books/${bookId}/settings`, { token, tenantId, json: { password: "MatKhauMoi456" } });
  check("doi mat khau thanh cong", changePw.status === 200, changePw.data);
  const oldTokenAfterChange = await api("GET", `/public/books/${permalink}`, { token: readerToken });
  check(
    "token cu (mat khau cu) bi tu choi sau khi doi mat khau (access_epoch da tang)",
    oldTokenAfterChange.status === 403 && oldTokenAfterChange.data?.passwordRequired === true,
    oldTokenAfterChange.data
  );
  const verifyOldPw = await api("POST", `/public/books/${permalink}/verify-password`, { json: { password: "MatKhauBiMat123" } });
  check("mat khau cu khong con dung sau khi doi", verifyOldPw.status === 401, verifyOldPw.data);
  const verifyNewPw = await api("POST", `/public/books/${permalink}/verify-password`, { json: { password: "MatKhauMoi456" } });
  check("mat khau moi dung", verifyNewPw.status === 200 || verifyNewPw.status === 201, verifyNewPw.data);

  console.log(`\nTest: khoa tam thoi sau ${PASSWORD_MAX_ATTEMPTS} lan sai lien tiep.`);
  let lastAttempt;
  for (let i = 0; i < PASSWORD_MAX_ATTEMPTS; i++) {
    lastAttempt = await api("POST", `/public/books/${permalink}/verify-password`, { json: { password: `sai-${i}` } });
  }
  check(
    `sau ${PASSWORD_MAX_ATTEMPTS} lan sai -> lan cuoi tra ve 429 (khoa)`,
    lastAttempt.status === 429,
    lastAttempt.data
  );
  const correctDuringLock = await api("POST", `/public/books/${permalink}/verify-password`, { json: { password: "MatKhauMoi456" } });
  check(
    "dang khoa: NHAP DUNG mat khau van bi 429 (khoa khong the bypass bang mat khau dung)",
    correctDuringLock.status === 429,
    correctDuringLock.data
  );

  console.log("\nTest: xoa mat khau -> sach cong khai lai binh thuong.");
  const removePw = await api("PUT", `/books/${bookId}/settings`, { token, tenantId, json: { removePassword: true } });
  check("xoa mat khau thanh cong, has_password=false", removePw.status === 200 && removePw.data.has_password === false, removePw.data);
  const afterRemove = await api("GET", `/public/books/${permalink}`);
  check("sau khi xoa mat khau, xem duoc khong can token", afterRemove.status === 200, afterRemove.data);

  // ===================== F11: tai xuong PDF goc co dieu kien =====================
  console.log("\n=== F11: tai xuong PDF goc ===");
  const downloadOff = await api("GET", `/public/books/${permalink}/download`);
  check("allow_download=false (mac dinh) -> tai xuong bi tu choi", downloadOff.status === 403, downloadOff.data);

  await api("PUT", `/books/${bookId}/settings`, { token, tenantId, json: { allowDownload: true } });
  const downloadOn = await api("GET", `/public/books/${permalink}/download`, { asBuffer: true });
  check(
    "allow_download=true -> tai xuong thanh cong, dung la file PDF (chu ky %PDF-)",
    downloadOn.status === 200 && Buffer.isBuffer(downloadOn.data) && downloadOn.data.subarray(0, 5).toString() === "%PDF-",
    { status: downloadOn.status, contentType: downloadOn.headers.get("content-type") }
  );
  check(
    "response co Content-Disposition attachment",
    (downloadOn.headers.get("content-disposition") ?? "").includes("attachment"),
    downloadOn.headers.get("content-disposition")
  );

  console.log("\nTest: bat lai mat khau -> tai xuong cung bi chan neu khong co token dung.");
  await api("PUT", `/books/${bookId}/settings`, { token, tenantId, json: { password: "TaiXuongCanMatKhau789" } });
  const downloadNoToken = await api("GET", `/public/books/${permalink}/download`);
  check("co mat khau + khong token -> tai xuong bi chan (403 passwordRequired)", downloadNoToken.status === 403 && downloadNoToken.data?.passwordRequired === true, downloadNoToken.data);
  const verifyForDownload = await api("POST", `/public/books/${permalink}/verify-password`, { json: { password: "TaiXuongCanMatKhau789" } });
  const downloadWithToken = await api("GET", `/public/books/${permalink}/download?token=${encodeURIComponent(verifyForDownload.data.readerToken)}`, { asBuffer: true });
  check("co mat khau + token dung -> tai xuong thanh cong", downloadWithToken.status === 200 && downloadWithToken.data.subarray(0, 5).toString() === "%PDF-", downloadWithToken.status);
  await api("PUT", `/books/${bookId}/settings`, { token, tenantId, json: { removePassword: true } });

  // ===================== F07: replace PDF / publish nguyen tu / rollback =====================
  console.log("\n=== F07: replace PDF, publish nguyen tu, rollback ===");
  const bookBefore = await api("GET", `/books/${bookId}`, { token, tenantId });
  check("truoc replace: dang publish revision v1", bookBefore.data.published_revision_id === revisionV1, bookBefore.data);

  const publicV1 = await api("GET", `/public/books/${permalink}`);
  const pageCountV1 = publicV1.data.pages.length;
  const v1ReaderToken = publicV1.data.readerToken;
  const v1FirstAssetId = publicV1.data.pages[0].imageAssetId;
  const statsBeforeEvents = await api("GET", `/books/${bookId}/stats?days=1`, { token, tenantId });
  const beforeToday = statsBeforeEvents.data.at(-1) ?? { opens: 0, page_views: 0 };
  const openOne = await api("POST", `/public/books/${permalink}/events`, { token: v1ReaderToken, json: { eventType: "open" } });
  const openDuplicate = await api("POST", `/public/books/${permalink}/events`, { token: v1ReaderToken, json: { eventType: "open" } });
  const pageOne = await api("POST", `/public/books/${permalink}/events`, { token: v1ReaderToken, json: { eventType: "page_view", page: 1 } });
  const pageDuplicate = await api("POST", `/public/books/${permalink}/events`, { token: v1ReaderToken, json: { eventType: "page_view", page: 1 } });
  const statsAfterEvents = await api("GET", `/books/${bookId}/stats?days=1`, { token, tenantId });
  const afterToday = statsAfterEvents.data.at(-1) ?? { opens: 0, page_views: 0 };
  check("reader event open/page_view duoc nhan va retry cung phien khong dem trung", openOne.data?.counted === true && openDuplicate.data?.counted === false && pageOne.data?.counted === true && pageDuplicate.data?.counted === false && Number(afterToday.opens) === Number(beforeToday.opens) + 1 && Number(afterToday.page_views) === Number(beforeToday.page_views) + 1, { openOne: openOne.data, openDuplicate: openDuplicate.data, pageOne: pageOne.data, pageDuplicate: pageDuplicate.data, beforeToday, afterToday });

  const revisionV2 = await uploadAndPublish(bookId, token, tenantId, "v2.pdf");
  const pinnedV1Asset = await api("GET", `/public/books/${permalink}/assets/${v1FirstAssetId}?token=${encodeURIComponent(v1ReaderToken)}`);
  check(
    "reader da mo revision v1 truoc khi replace van tai duoc asset v1 bang phien doc da pin (khong vo trang giua luc dang doc)",
    pinnedV1Asset.status === 200,
    pinnedV1Asset.data
  );
  check("upload+publish revision v2 thanh cong, khac id voi v1", !!revisionV2 && revisionV2 !== revisionV1, { revisionV1, revisionV2 });

  const bookAfterReplace = await api("GET", `/books/${bookId}`, { token, tenantId });
  check(
    "sau replace: published_revision_id doi sang v2, permalink KHONG doi",
    bookAfterReplace.data.published_revision_id === revisionV2 && `${bookAfterReplace.data.permalink_slug}-${bookAfterReplace.data.permalink_suffix}` === permalink,
    bookAfterReplace.data
  );

  const publicAfterReplace = await api("GET", `/public/books/${permalink}`);
  check(
    "public reader (cung permalink) doc duoc noi dung revision v2 sau replace",
    publicAfterReplace.status === 200 && publicAfterReplace.data.pages.length === pageCountV1,
    publicAfterReplace.data
  );

  console.log("\nTest: rollback ve revision v1 (publish lai id cu) -> hoat dong, khong tao revision moi.");
  const rollback = await api("POST", `/books/${bookId}/publish`, { token, tenantId, json: { revisionId: revisionV1 } });
  check("rollback ve v1 thanh cong (200/201)", rollback.status === 200 || rollback.status === 201, rollback.data);
  const bookAfterRollback = await api("GET", `/books/${bookId}`, { token, tenantId });
  check(
    "sau rollback: published_revision_id tro lai v1, permalink van khong doi",
    bookAfterRollback.data.published_revision_id === revisionV1 &&
      `${bookAfterRollback.data.permalink_slug}-${bookAfterRollback.data.permalink_suffix}` === permalink,
    bookAfterRollback.data
  );
  const publicAfterRollback = await api("GET", `/public/books/${permalink}`);
  check(
    "public reader phan anh dung sau rollback (van xem duoc, dung permalink)",
    publicAfterRollback.status === 200 && publicAfterRollback.data.pages.length === pageCountV1,
    publicAfterRollback.data
  );

  console.log("\nTest: publish 1 revisionId khong ton tai (vd danh sai id) -> 404, KHONG lam mat publish hien tai.");
  const badRollback = await api("POST", `/books/${bookId}/publish`, {
    token,
    tenantId,
    json: { revisionId: "00000000-0000-0000-0000-000000000000" },
  });
  check("publish id khong ton tai -> 404", badRollback.status === 404, badRollback.data);
  const bookAfterBadRollback = await api("GET", `/books/${bookId}`, { token, tenantId });
  check(
    "publish that bai KHONG lam thay doi revision dang publish (van la v1)",
    bookAfterBadRollback.data.published_revision_id === revisionV1,
    bookAfterBadRollback.data
  );
  const publicAfterBadRollback = await api("GET", `/public/books/${permalink}`);
  check("sach van doc duoc binh thuong sau lan publish loi", publicAfterBadRollback.status === 200, publicAfterBadRollback.data);

  console.log(`\n=== KET QUA P3 E2E: ${passed} PASS / ${failed} FAIL ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("P3 E2E TEST SCRIPT ERROR:", err);
  process.exit(1);
});
