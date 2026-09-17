#!/usr/bin/env node
"use strict";

/**
 * P5 (UAT/phat hanh) - lap day cac khoang trong con thieu trong "Ma tran nghiem thu bat
 * buoc" (ROADMAP.md) MA test duoc bang HTTP API, khong can thiet bi/trinh duyet that:
 *
 *   1. "Gioi han": upload PDF mã hoa/corrupt qua DUNG pipeline that (upload -> job ->
 *      worker-convert -> pdf-worker), khong chi doc bang pypdf script rieng nhu P0 -
 *      xac nhan job ket thuc 'failed' CO KIEM SOAT (khong treo, khong lam sap worker),
 *      book khong bi publish nham voi noi dung loi.
 *   2. "Quyen": Creator B (khac tenant) doi ID stats cua sach Tenant A (GET
 *      /books/:id/stats) - phai 404, khong duoc lo so lieu tenant khac (api_e2e.test.js
 *      da test job/asset id, stats id chua tung test).
 *   3. "Replace": publish DONG THOI 2 revision khac nhau cung 1 sach (race condition) -
 *      xac nhan trang thai cuoi cung NHAT QUAN (dung 1 trong 2 revisionId, khong bi
 *      "nua nay nua kia" - vd published_revision_id khop voi 1 trong 2 gia tri gui len,
 *      khong phai gia tri la/null).
 *
 * Dieu kien truoc khi chay: giong api_e2e.test.js (Postgres/Redis/migrate/api/dispatcher/
 * worker-convert/pdf-worker da len qua infra/docker). Script tu tao tenant/user rieng,
 * KHONG don dep, chi chay tren DB dev.
 */

const fs = require("fs");
const path = require("path");

const BASE = process.env.API_BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@misa.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeThisAdminPw123!";
const FIXTURE_DIR = path.resolve(__dirname, "../fixtures/pdf");
const VALID_PDF = path.join(FIXTURE_DIR, "sample_vi_text.pdf");
const ENCRYPTED_PDF = path.join(FIXTURE_DIR, "sample_encrypted.pdf");
const CORRUPTED_PDF = path.join(FIXTURE_DIR, "sample_corrupted.pdf");

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

async function uploadPdf(token, tenantId, bookId, filePath) {
  const form = new FormData();
  const buf = fs.readFileSync(filePath);
  form.append("file", new Blob([buf]), path.basename(filePath));
  return api("POST", `/books/${bookId}/upload`, { token, tenantId, form });
}

async function waitJobTerminal(token, tenantId, jobId, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await api("GET", `/jobs/${jobId}`, { token, tenantId });
    if (res.data && (res.data.state === "done" || res.data.state === "failed")) {
      return res.data;
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return null;
}

async function main() {
  console.log(`API_BASE_URL = ${BASE}`);

  const adminLogin = await api("POST", "/auth/login", { json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  const adminToken = adminLogin.data?.accessToken;
  check("Admin login thanh cong", !!adminToken, adminLogin);

  const suffix = uniqueSuffix();

  // --- Fixtures: 1 tenant + 1 Creator (dung cho ca 3 nhom test) ---
  const tenantA = await api("POST", "/admin/tenants", { token: adminToken, json: { name: `P5 Tenant A ${suffix}` } });
  const tenantAId = tenantA.data.id;
  const userA = await api("POST", "/admin/users", {
    token: adminToken,
    json: { email: `p5-a-${suffix}@test.local`, password: "CreatorAP5Pass123!" },
  });
  await api("POST", "/admin/memberships", { token: adminToken, json: { tenantId: tenantAId, userId: userA.data.id } });
  const loginA = await api("POST", "/auth/login", { json: { email: `p5-a-${suffix}@test.local`, password: "CreatorAP5Pass123!" } });
  const tokenA = loginA.data.accessToken;

  const tenantB = await api("POST", "/admin/tenants", { token: adminToken, json: { name: `P5 Tenant B ${suffix}` } });
  const tenantBId = tenantB.data.id;
  const userB = await api("POST", "/admin/users", {
    token: adminToken,
    json: { email: `p5-b-${suffix}@test.local`, password: "CreatorBP5Pass123!" },
  });
  await api("POST", "/admin/memberships", { token: adminToken, json: { tenantId: tenantBId, userId: userB.data.id } });
  const loginB = await api("POST", "/auth/login", { json: { email: `p5-b-${suffix}@test.local`, password: "CreatorBP5Pass123!" } });
  const tokenB = loginB.data.accessToken;

  console.log("\n=== Nhom 1: 'Gioi han' - PDF ma hoa/corrupt qua DUNG pipeline that ===");
  {
    const book = await api("POST", "/books", { token: tokenA, tenantId: tenantAId, json: { title: `Sach ma hoa ${suffix}` } });
    const bookId = book.data.id;
    const up = await uploadPdf(tokenA, tenantAId, bookId, ENCRYPTED_PDF);
    check("upload PDF ma hoa -> 201 (chap nhan upload, loi se lo o buoc convert)", up.status === 201, up);
    if (up.data?.jobId) {
      const job = await waitJobTerminal(tokenA, tenantAId, up.data.jobId);
      check("job PDF ma hoa ket thuc 'failed' co kiem soat (khong treo qua 30s)", job?.state === "failed", job);
      check("job co thong diep loi (khong rong)", !!job?.error, job);
    } else {
      check("job PDF ma hoa ket thuc 'failed' co kiem soat (khong treo qua 30s)", false, up);
    }
    const bookAfter = await api("GET", `/books/${bookId}`, { token: tokenA, tenantId: tenantAId });
    check("sach KHONG bi chuyen sang 'published' sau job loi", bookAfter.data?.status !== "published", bookAfter);
  }
  {
    const book = await api("POST", "/books", { token: tokenA, tenantId: tenantAId, json: { title: `Sach corrupt ${suffix}` } });
    const bookId = book.data.id;
    const up = await uploadPdf(tokenA, tenantAId, bookId, CORRUPTED_PDF);
    if (up.data?.jobId) {
      const job = await waitJobTerminal(tokenA, tenantAId, up.data.jobId);
      check("job PDF corrupt ket thuc 'failed' co kiem soat (khong treo qua 30s)", job?.state === "failed", job);
    } else {
      check("upload PDF corrupt van tra jobId de theo doi", false, up);
    }
    // He thong (dispatcher/worker-convert) van song binh thuong sau 2 job loi lien tiep -
    // xac nhan bang cach upload tiep 1 file HOP LE va cho job 'done'.
    const bookOk = await api("POST", "/books", { token: tokenA, tenantId: tenantAId, json: { title: `Sach hop le sau loi ${suffix}` } });
    const upOk = await uploadPdf(tokenA, tenantAId, bookOk.data.id, VALID_PDF);
    const jobOk = upOk.data?.jobId ? await waitJobTerminal(tokenA, tenantAId, upOk.data.jobId) : null;
    check("worker-convert VAN xu ly binh thuong file hop le sau 2 job loi lien tiep (khong bi 'chet' theo)", jobOk?.state === "done", jobOk);
  }

  console.log("\n=== Nhom 2: 'Quyen' - doi ID stats sang sach cua tenant khac ===");
  {
    const book = await api("POST", "/books", { token: tokenA, tenantId: tenantAId, json: { title: `Sach stats ${suffix}` } });
    const bookId = book.data.id;
    const ownStats = await api("GET", `/books/${bookId}/stats`, { token: tokenA, tenantId: tenantAId });
    check("chu so huu (Tenant A) doc duoc stats sach cua minh", ownStats.status === 200, ownStats);
    const crossStats = await api("GET", `/books/${bookId}/stats`, { token: tokenB, tenantId: tenantBId });
    check("Creator B (Tenant B) doi ID stats sach Tenant A -> 404 (khong lo du lieu)", crossStats.status === 404, crossStats);
  }

  console.log("\n=== Nhom 3: 'Replace' - publish DONG THOI 2 revision khac nhau ===");
  {
    const book = await api("POST", "/books", { token: tokenA, tenantId: tenantAId, json: { title: `Sach publish dong thoi ${suffix}` } });
    const bookId = book.data.id;
    const up1 = await uploadPdf(tokenA, tenantAId, bookId, VALID_PDF);
    const job1 = await waitJobTerminal(tokenA, tenantAId, up1.data.jobId);
    check("upload revision #1 thanh cong", job1?.state === "done", job1);
    const up2 = await uploadPdf(tokenA, tenantAId, bookId, VALID_PDF);
    const job2 = await waitJobTerminal(tokenA, tenantAId, up2.data.jobId);
    check("upload revision #2 thanh cong", job2?.state === "done", job2);

    const revs = await api("GET", `/books/${bookId}/revisions`, { token: tokenA, tenantId: tenantAId });
    const readyRevs = revs.data.filter((r) => r.state === "ready");
    check("co du 2 revision 'ready' de publish dong thoi", readyRevs.length === 2, revs.data);
    const [revX, revY] = readyRevs.map((r) => r.id);

    const [pubX, pubY] = await Promise.all([
      api("POST", `/books/${bookId}/publish`, { token: tokenA, tenantId: tenantAId, json: { revisionId: revX } }),
      api("POST", `/books/${bookId}/publish`, { token: tokenA, tenantId: tenantAId, json: { revisionId: revY } }),
    ]);
    check("ca 2 lenh publish dong thoi deu tra ve 200/201 (khong loi 500/deadlock)", [pubX.status, pubY.status].every((s) => s === 200 || s === 201), [pubX, pubY]);

    const final = await api("GET", `/books/${bookId}`, { token: tokenA, tenantId: tenantAId });
    const finalRevId = final.data?.published_revision_id;
    check(
      "trang thai CUOI CUNG nhat quan: published_revision_id la 1 trong 2 gia tri gui len (khong null/rac)",
      finalRevId === revX || finalRevId === revY,
      { finalRevId, revX, revY }
    );
    check("status cuoi cung la 'published' (khong bi ket giua chung)", final.data?.status === "published", final.data);
  }

  console.log("\n=== Nhom 4: 'Download' - Range request tren endpoint tai PDF goc ===");
  {
    const book = await api("POST", "/books", { token: tokenA, tenantId: tenantAId, json: { title: `Sach range ${suffix}` } });
    const bookId = book.data.id;
    const up = await uploadPdf(tokenA, tenantAId, bookId, VALID_PDF);
    const job = await waitJobTerminal(tokenA, tenantAId, up.data.jobId);
    check("upload de test Range thanh cong", job?.state === "done", job);
    const revs = await api("GET", `/books/${bookId}/revisions`, { token: tokenA, tenantId: tenantAId });
    const revId = revs.data[0].id;
    await api("PUT", `/books/${bookId}/settings`, { token: tokenA, tenantId: tenantAId, json: { allowDownload: true } });
    const pub = await api("POST", `/books/${bookId}/publish`, { token: tokenA, tenantId: tenantAId, json: { revisionId: revId } });
    const bookInfo = pub.data;
    const permalink = `${bookInfo.permalink_slug}-${bookInfo.permalink_suffix}`;

    const fullRes = await fetch(`${BASE}/public/books/${permalink}/download`);
    const fullBuf = Buffer.from(await fullRes.arrayBuffer());
    check("download khong Range -> 200, tra ve toan bo file", fullRes.status === 200 && fullBuf.length > 100, { status: fullRes.status, len: fullBuf.length });

    const rangeRes = await fetch(`${BASE}/public/books/${permalink}/download`, { headers: { Range: "bytes=0-99" } });
    const rangeBuf = Buffer.from(await rangeRes.arrayBuffer());
    const gotPartial = rangeRes.status === 206 && rangeBuf.length === 100;
    check(
      "co header Range=bytes=0-99: neu tra 206 thi PHAI dung 100 byte dau (khong duoc tra 206 nhung du lieu sai)",
      rangeRes.status !== 206 || rangeBuf.length === 100,
      { status: rangeRes.status, len: rangeBuf.length }
    );
    console.log(
      `  GHI NHAN (khong phai loi): server ${gotPartial ? "CO ho tro" : "CHUA ho tro"} Range request (206 Partial Content) - status thuc te: ${rangeRes.status}, so byte tra ve: ${rangeBuf.length}/${fullBuf.length}`
    );
    // Du server co ho tro Range hay khong, dieu BAT BUOC la khong duoc lo NHIEU HON file
    // that hoac sai lech noi dung khi CO gui header Range.
    check("du co/khong ho tro Range, KHONG tra ve nhieu hon dung luong file that", rangeBuf.length <= fullBuf.length, { rangeLen: rangeBuf.length, fullLen: fullBuf.length });
  }

  console.log("\n=== Nhom 5: 'Gioi han' - upload PDF VUOT dung luong toi da (PDF_MAX_BYTES that) ===");
  {
    const MAX_BYTES = 209715200; // gia tri that dang cau hinh trong infra/docker/.env (PDF_MAX_BYTES)
    const oversizedBuf = Buffer.alloc(MAX_BYTES + 1024 * 1024, 0x41); // vuot ~1MB
    Buffer.from("%PDF-1.4\n").copy(oversizedBuf, 0);
    const book = await api("POST", "/books", { token: tokenA, tenantId: tenantAId, json: { title: `Sach vuot dung luong ${suffix}` } });
    const bookId = book.data.id;
    const form = new FormData();
    form.append("file", new Blob([oversizedBuf]), "oversized.pdf");
    const t0 = Date.now();
    let up;
    try {
      up = await api("POST", `/books/${bookId}/upload`, { token: tokenA, tenantId: tenantAId, form });
    } catch (err) {
      up = { status: -1, data: { message: String(err) } };
    }
    const elapsedMs = Date.now() - t0;
    check(
      `upload file vuot ${(MAX_BYTES / 1024 / 1024).toFixed(0)}MB bi TU CHOI co kiem soat (400/413), khong phai 200/500`,
      up.status === 400 || up.status === 413,
      up
    );
    console.log(`  GHI NHAN: xu ly tu choi file vuot dung luong mat ${elapsedMs}ms, status thuc te: ${up.status}`);
    // He thong van song sau khi bi day 1 file ~200MB - xac nhan bang 1 upload hop le tiep theo.
    const okUp = await uploadPdf(tokenA, tenantAId, bookId, VALID_PDF);
    const okJob = okUp.data?.jobId ? await waitJobTerminal(tokenA, tenantAId, okUp.data.jobId) : null;
    check("API van hoat dong binh thuong sau khi nhan 1 file ~200MB bi tu choi (khong bi treo/OOM)", okJob?.state === "done", okJob);
  }

  console.log(`\n=== KET QUA P5 UAT: ${passed} PASS / ${failed} FAIL ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Loi khong mong doi:", err);
  process.exit(1);
});
