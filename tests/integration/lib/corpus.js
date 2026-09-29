"use strict";
// Ha tang dung chung cho test corpus PDF that (convert + lat trang). Khong mock: goi API that
// qua reverse proxy. PDF that khong nam trong repo (qua nang) - chi ra duong dan qua CORPUS_PDF.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8080/api";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@misa.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeThisAdminPw123!";
const CORPUS_PDF = process.env.CORPUS_PDF ?? "D:/test flipbook/Sách kỷ yếu 70 năm thành lập Cục QLGSKTKT.pdf";
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS ?? 300000);
const STATE_FILE = path.join(os.tmpdir(), "misa-corpus-state.json");

async function api(method, urlPath, { token, tenantId, json, form, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenantId) headers["x-tenant-id"] = tenantId;
  let body;
  if (json) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form) body = form;
  const res = await fetch(`${BASE}${urlPath}`, { method, headers, body });
  if (raw) return res;
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* khong co body JSON */
  }
  return { status: res.status, data, headers: res.headers };
}

function corpusAvailable() {
  return fs.existsSync(CORPUS_PDF);
}

/** Doc thong tin THAT tu PDF goc bang pypdf (doc lap voi pipeline can kiem tra). */
function readPdfInfo() {
  const script = path.join(__dirname, "..", "corpus_fidelity.py");
  const r = spawnSync("python", [script, "info", CORPUS_PDF], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`corpus_fidelity.py info loi: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

async function waitJob(jobId, token, tenantId, onSample) {
  const t0 = Date.now();
  const deadline = t0 + JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await api("GET", `/jobs/${jobId}`, { token, tenantId });
    if (onSample) onSample(res.data, Date.now() - t0);
    if (res.data?.state === "done" || res.data?.state === "failed") return { job: res.data, ms: Date.now() - t0 };
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Job ${jobId} khong xong sau ${JOB_TIMEOUT_MS}ms`);
}

async function adminLogin() {
  const res = await api("POST", "/auth/login", { json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  if (!res.data?.accessToken) throw new Error(`Admin login that bai: ${res.status}`);
  return res.data.accessToken;
}

async function createCreator(adminToken, label) {
  const suffix = Math.random().toString(36).slice(2, 10);
  const tenant = await api("POST", "/admin/tenants", { token: adminToken, json: { name: `${label} ${suffix}` } });
  const email = `${label.toLowerCase().replace(/\W+/g, "-")}-${suffix}@test.local`;
  const password = "CorpusPass123!";
  const user = await api("POST", "/admin/users", { token: adminToken, json: { email, password } });
  await api("POST", "/admin/memberships", { token: adminToken, json: { tenantId: tenant.data.id, userId: user.data.id } });
  const login = await api("POST", "/auth/login", { json: { email, password } });
  return { tenantId: tenant.data.id, token: login.data.accessToken, email, password };
}

/** Upload stream (khong nap 190MB vao RAM), tra ve dung cac moc thoi gian de do hieu nang. */
async function uploadPdf({ token, tenantId, bookId, file = CORPUS_PDF }) {
  const blob = await fs.openAsBlob(file, { type: "application/pdf" });
  const form = new FormData();
  form.append("file", blob, path.basename(file));
  const t0 = Date.now();
  const res = await api("POST", `/books/${bookId}/upload`, { token, tenantId, form });
  return { ...res, uploadMs: Date.now() - t0 };
}

/** Dung 1 cuon sach corpus da publish, cache trang thai de cac test khac dung lai. */
async function prepareCorpusBook({ fresh = false, onJobSample } = {}) {
  if (!corpusAvailable()) return null;
  if (!fresh && fs.existsSync(STATE_FILE)) {
    try {
      const st = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      const check = await api("GET", `/public/books/${st.permalink}`);
      if (check.status === 200 && check.data?.pages?.length === st.pageCount) return { ...st, cached: true };
    } catch {
      /* state hong -> dung lai tu dau */
    }
  }
  const adminToken = await adminLogin();
  const creator = await createCreator(adminToken, "Corpus Real PDF");
  const { token, tenantId } = creator;
  const book = await api("POST", "/books", { token, tenantId, json: { title: "Ky yeu 70 nam corpus test" } });
  const bookId = book.data.id;
  const permalink = `${book.data.permalink_slug}-${book.data.permalink_suffix}`;
  const up = await uploadPdf({ token, tenantId, bookId });
  if (up.status !== 201) throw new Error(`Upload that bai: ${up.status} ${JSON.stringify(up.data)}`);
  const { job, ms } = await waitJob(up.data.jobId, token, tenantId, onJobSample);
  if (job.state !== "done") throw new Error(`Convert that bai: ${JSON.stringify(job)}`);
  const pub = await api("POST", `/books/${bookId}/publish`, { token, tenantId, json: { revisionId: up.data.revisionId } });
  if (![200, 201].includes(pub.status)) throw new Error(`Publish that bai: ${pub.status}`);
  const pubBook = await api("GET", `/public/books/${permalink}`);
  const st = {
    permalink,
    bookId,
    tenantId,
    revisionId: up.data.revisionId,
    pageCount: pubBook.data.pages.length,
    uploadMs: up.uploadMs,
    convertMs: ms,
    creator: { email: creator.email },
    creds: { token, tenantId },
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(st));
  return { ...st, cached: false };
}

const VARIANT_STATE_FILE = path.join(os.tmpdir(), "misa-corpus-variants.json");

/** Dung cac sach nho (1..5 trang, xoay, ngang) cat tu PDF that, publish san de test reader. Cache. */
async function prepareVariantBooks(corpusState, names) {
  let cache = {};
  try {
    cache = JSON.parse(fs.readFileSync(VARIANT_STATE_FILE, "utf8"));
  } catch {
    cache = {};
  }
  const out = {};
  const missing = [];
  for (const name of names) {
    const c = cache[name];
    if (c && c.corpusBookId === corpusState.bookId) {
      const chk = await api("GET", `/public/books/${c.permalink}`);
      if (chk.status === 200 && chk.data?.pages?.length === c.pages) {
        out[name] = c;
        continue;
      }
    }
    missing.push(name);
  }
  if (missing.length) {
    const dir = path.join(os.tmpdir(), "misa-corpus-variants");
    const r = spawnSync("python", [path.join(__dirname, "..", "corpus_fidelity.py"), "variants", CORPUS_PDF, dir], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    if (r.status !== 0) throw new Error(`variants loi: ${r.stderr}`);
    const made = JSON.parse(r.stdout);
    const { token, tenantId } = corpusState.creds ?? (await createCreator(await adminLogin(), "Corpus Variants"));
    for (const name of missing) {
      const book = await api("POST", "/books", { token, tenantId, json: { title: `Variant ${name}` } });
      const up = await uploadPdf({ token, tenantId, bookId: book.data.id, file: made[name].path });
      const { job } = await waitJob(up.data.jobId, token, tenantId);
      if (job.state !== "done") throw new Error(`Variant ${name} convert that bai`);
      await api("POST", `/books/${book.data.id}/publish`, { token, tenantId, json: { revisionId: up.data.revisionId } });
      const permalink = `${book.data.permalink_slug}-${book.data.permalink_suffix}`;
      out[name] = { permalink, pages: made[name].pages, corpusBookId: corpusState.bookId };
      cache[name] = out[name];
    }
    fs.writeFileSync(VARIANT_STATE_FILE, JSON.stringify(cache));
  }
  return out;
}

module.exports = {
  BASE, CORPUS_PDF, JOB_TIMEOUT_MS, STATE_FILE,
  api, corpusAvailable, readPdfInfo, waitJob, adminLogin, createCreator, uploadPdf, prepareCorpusBook, prepareVariantBooks,
};
