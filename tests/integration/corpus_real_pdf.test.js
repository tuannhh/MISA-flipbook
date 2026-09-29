#!/usr/bin/env node
"use strict";

/**
 * Test CONVERT voi PDF that (mac dinh D:/test flipbook/...pdf, ~190MB / 140 trang) chay tren stack
 * Docker that qua reverse proxy. Doi chung DOC LAP voi pipeline bang pypdf + pypdfium2
 * (corpus_fidelity.py) - khong tin manifest do chinh pipeline sinh ra.
 *
 *   CORPUS_PDF=<duong dan> API_BASE_URL=http://127.0.0.1:8080/api SEED_ADMIN_PASSWORD=... node corpus_real_pdf.test.js
 *
 * Neu khong co file PDF corpus (vd CI) -> SKIP, exit 0.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const corpus = require("./lib/corpus.js");

const { api, BASE, CORPUS_PDF } = corpus;
const TMP = path.join(os.tmpdir(), "misa-corpus-work");
const CONVERT_BUDGET_MS = Number(process.env.CORPUS_CONVERT_BUDGET_MS ?? 240000);
const MAE_LIMIT = Number(process.env.CORPUS_MAE_LIMIT ?? 8);

let passed = 0;
let failed = 0;
function check(label, ok, extra) {
  if (ok) {
    console.log("  PASS: " + label);
    passed += 1;
  } else {
    console.log("  FAIL: " + label + (extra !== undefined ? " -- " + JSON.stringify(extra).slice(0, 600) : ""));
    failed += 1;
  }
}

function py(args) {
  const r = spawnSync("python", [path.join(__dirname, "corpus_fidelity.py"), ...args], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  if (r.status !== 0) throw new Error("corpus_fidelity.py " + args[0] + " loi: " + r.stderr);
  return JSON.parse(r.stdout);
}

function webpSize(buf) {
  if (buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const kind = buf.toString("ascii", 12, 16);
  if (kind === "VP8 ") return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (kind === "VP8L") {
    const b = buf.readUInt32LE(21);
    return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1];
  }
  if (kind === "VP8X") return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  return null;
}

function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

async function pool(items, size, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    })
  );
  return results;
}

async function convertVariant(creds, file, title) {
  const { token, tenantId } = creds;
  const book = await api("POST", "/books", { token, tenantId, json: { title } });
  const up = await corpus.uploadPdf({ token, tenantId, bookId: book.data.id, file });
  if (up.status !== 201) return { up };
  const { job, ms } = await corpus.waitJob(up.data.jobId, token, tenantId);
  if (job.state !== "done") return { up, job, ms, bookId: book.data.id };
  const pub = await api("POST", "/books/" + book.data.id + "/publish", { token, tenantId, json: { revisionId: up.data.revisionId } });
  const permalink = book.data.permalink_slug + "-" + book.data.permalink_suffix;
  const pubBook = await api("GET", "/public/books/" + permalink);
  return { up, job, ms, pub, permalink, manifest: pubBook.data, bookId: book.data.id };
}

async function main() {
  if (!corpus.corpusAvailable()) {
    console.log("SKIP: khong tim thay PDF corpus tai " + CORPUS_PDF + " (dat CORPUS_PDF=...).");
    return;
  }
  console.log("API_BASE_URL = " + BASE);
  console.log("CORPUS_PDF   = " + CORPUS_PDF);
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });

  console.log("");
  console.log("Test 1: nguon su that doc lap tu PDF goc (pypdf/pypdfium2).");
  const info = py(["info", CORPUS_PDF]);
  const srcBytes = fs.statSync(CORPUS_PDF).size;
  console.log("  (PDF: " + (srcBytes / 1048576).toFixed(1) + " MiB, " + info.pageCount + " trang)");
  check("doc duoc so trang goc > 0", info.pageCount > 0, info.pageCount);

  console.log("");
  console.log("Test 2: upload + convert PDF that qua pipeline (dispatcher -> worker-convert -> pdf-worker).");
  const samples = [];
  const st = await corpus.prepareCorpusBook({
    fresh: true,
    onJobSample: (j, ms) => j && samples.push({ ms, progress: j.progress ?? j.progress_pct ?? null, state: j.state }),
  });
  console.log("  (upload " + st.uploadMs + "ms, convert " + st.convertMs + "ms, " + st.pageCount + " trang)");
  check("upload stream file lon thanh cong nhanh (< 60s)", st.uploadMs < 60000, st.uploadMs);
  check("convert xong trong ngan sach thoi gian (" + CONVERT_BUDGET_MS / 1000 + "s)", st.convertMs < CONVERT_BUDGET_MS, st.convertMs);
  const progressVals = samples.map((s) => s.progress).filter((v) => typeof v === "number");
  if (progressVals.length > 1) {
    check("tien trinh job khong bao gio lui (monotonic)", progressVals.every((v, i) => i === 0 || v >= progressVals[i - 1]), progressVals);
    check("tien trinh ket thuc o 100", progressVals[progressVals.length - 1] === 100, progressVals.slice(-3));
  } else {
    console.log("  (bo qua kiem tien trinh: job API khong tra so lieu tien trinh dang so)");
  }

  console.log("");
  console.log("Test 3: manifest cong khai khop PDF goc (so trang, kich thuoc, thu tu, tai nguyen).");
  const pubRes = await api("GET", "/public/books/" + st.permalink);
  const pages = pubRes.data.pages;
  check("so trang manifest = so trang PDF goc", pages.length === info.pageCount, [pages.length, info.pageCount]);
  check("trang danh so lien tuc 1..N", pages.every((p, i) => p.page === i + 1), pages.map((p) => p.page).slice(0, 5));
  check(
    "widthPt/heightPt khop PDF goc (sai so <= 0.5pt)",
    pages.every((p, i) => Math.abs(p.widthPt - info.pages[i].w) <= 0.5 && Math.abs(p.heightPt - info.pages[i].h) <= 0.5),
    pages.slice(0, 2)
  );
  const ids = pages.flatMap((p) => [p.imageAssetId, p.thumbAssetId]);
  check("moi trang co du imageAssetId + thumbAssetId", ids.every(Boolean), ids.filter((x) => !x).length);
  check("khong trung asset id giua cac trang", new Set(ids).size === ids.length, [new Set(ids).size, ids.length]);
  const srcLinks = info.pages.reduce((n, p) => n + p.annotLinks, 0);
  const mfLinks = pages.reduce((n, p) => n + (p.links ? p.links.length : 0), 0);
  check("so link trong manifest <= so Link annotation cua PDF goc (khong bia them)", mfLinks <= srcLinks, [mfLinks, srcLinks]);

  console.log("");
  console.log("Test 4: tai TOAN BO " + ids.length + " anh (doc + thumb) - trang thai, dinh dang, kich thuoc that.");
  const imgDir = path.join(TMP, "imgs");
  fs.mkdirSync(imgDir, { recursive: true });
  const tokenQ = "?token=" + encodeURIComponent(pubRes.data.readerToken);
  const jobs = pages.flatMap((p) => [
    { page: p.page, kind: "reading", id: p.imageAssetId },
    { page: p.page, kind: "thumb", id: p.thumbAssetId },
  ]);
  const t0 = Date.now();
  const fetched = await pool(jobs, 10, async (j) => {
    const res = await fetch(BASE + "/public/books/" + st.permalink + "/assets/" + j.id + tokenQ);
    const buf = Buffer.from(await res.arrayBuffer());
    const num = String(j.page).padStart(3, "0");
    const file = j.kind === "reading" ? "page-" + num + ".webp" : "page-" + num + "-thumb.jpg";
    fs.writeFileSync(path.join(imgDir, file), buf);
    return { ...j, status: res.status, ct: res.headers.get("content-type"), cc: res.headers.get("cache-control"), buf };
  });
  console.log("  (tai " + jobs.length + " anh trong " + (Date.now() - t0) + "ms)");
  const bad = (pred) => fetched.filter((f) => !pred(f)).map((f) => f.kind + "#" + f.page);
  check("moi anh tra ve HTTP 200", bad((f) => f.status === 200).length === 0, bad((f) => f.status === 200).slice(0, 5));
  check(
    "anh doc: Content-Type image/webp + magic RIFF/WEBP",
    bad((f) => f.kind !== "reading" || (/image.webp/.test(f.ct || "") && webpSize(f.buf))).length === 0,
    bad((f) => f.kind !== "reading" || webpSize(f.buf)).slice(0, 5)
  );
  check(
    "thumb: Content-Type image/jpeg + magic JPEG",
    bad((f) => f.kind !== "thumb" || (/image.jpeg/.test(f.ct || "") && jpegSize(f.buf))).length === 0,
    bad((f) => f.kind !== "thumb" || jpegSize(f.buf)).slice(0, 5)
  );
  const reading = fetched.filter((f) => f.kind === "reading");
  const thumbs = fetched.filter((f) => f.kind === "thumb");
  check(
    "anh doc rong 1600px, cao dung ty le trang goc (sai so <= 2px)",
    reading.every((f) => {
      const s = webpSize(f.buf);
      const src = info.pages[f.page - 1];
      return s && s[0] === 1600 && Math.abs(s[1] - Math.ceil((1600 * src.h) / src.w)) <= 2;
    }),
    reading.filter((f) => !webpSize(f.buf) || webpSize(f.buf)[0] !== 1600).map((f) => f.page).slice(0, 5)
  );
  check(
    "thumb rong ~320px",
    thumbs.every((f) => {
      const s = jpegSize(f.buf);
      return s && Math.abs(s[0] - 320) <= 1;
    }),
    thumbs.slice(0, 2).map((f) => jpegSize(f.buf))
  );
  check("khong anh nao qua nho (< 4KB) - phat hien trang render hong", fetched.every((f) => f.buf.length >= 4096), fetched.filter((f) => f.buf.length < 4096).map((f) => f.kind + "#" + f.page));
  check("moi anh co Cache-Control", fetched.every((f) => !!f.cc), fetched.filter((f) => !f.cc).length);
  const shas = new Map();
  for (const f of reading) {
    const h = crypto.createHash("sha256").update(f.buf).digest("hex");
    shas.set(h, (shas.get(h) || []).concat(f.page));
  }
  const dup = [...shas.values()].filter((v) => v.length > 1);
  console.log("  (nhom trang co anh giong het nhau: " + JSON.stringify(dup) + " - hop le neu PDF goc co trang giong nhau)");

  console.log("");
  console.log("Test 5: DO TRUNG THUC noi dung - so anh phuc vu voi ban render tham chieu doc lap.");
  const cmp = py(["compare", CORPUS_PDF, imgDir]);
  const worst = cmp.pages.map((r) => ({ page: r.page, mae: r.reading.mae })).sort((a, b) => b.mae - a.mae).slice(0, 3);
  console.log("  (MAE xau nhat: " + JSON.stringify(worst) + ")");
  check("moi trang doc co MAE <= " + MAE_LIMIT + "/255 so voi ban render tham chieu", cmp.pages.every((r) => r.reading.mae <= MAE_LIMIT), worst);
  check("moi thumb co MAE <= " + MAE_LIMIT * 1.5 + "/255", cmp.pages.every((r) => r.thumb.mae <= MAE_LIMIT * 1.5), cmp.pages.filter((r) => r.thumb.mae > MAE_LIMIT * 1.5).map((r) => r.page));
  const blank = cmp.pages.filter((r) => r.reading.refStd > 8 && r.reading.imgStd < 0.4 * r.reading.refStd).map((r) => r.page);
  check("khong trang nao bi render TRANG TRON khi ban goc co noi dung", blank.length === 0, blank);
  const skew = cmp.pages.filter((r) => r.reading.aspectErr > 0.005 || r.thumb.aspectErr > 0.01).map((r) => r.page);
  check("sai lech ty le khung hinh <= 0.5%", skew.length === 0, skew);

  console.log("");
  console.log("Test 6: Range request + isolation asset (bao mat/luu luong).");
  const first = pages[0].imageAssetId;
  const range = await fetch(BASE + "/public/books/" + st.permalink + "/assets/" + first + tokenQ, { headers: { Range: "bytes=0-99" } });
  const rbuf = Buffer.from(await range.arrayBuffer());
  check(
    "Range bytes=0-99 -> 206 + 100 byte + Content-Range",
    range.status === 206 && rbuf.length === 100 && (range.headers.get("content-range") || "").startsWith("bytes 0-99/"),
    [range.status, rbuf.length, range.headers.get("content-range")]
  );
  const bogus = await fetch(BASE + "/public/books/" + st.permalink + "/assets/00000000-0000-0000-0000-000000000000" + tokenQ);
  check("asset id gia -> 404", bogus.status === 404, bogus.status);
  const noToken = await fetch(BASE + "/public/books/" + st.permalink + "/assets/" + first);
  check("sach cong khai KHONG mat khau: doc anh khong can token (dung thiet ke P2)", noToken.status === 200, noToken.status);
  const other = await corpus.createCreator(await corpus.adminLogin(), "Corpus Other");
  const otherBook = await api("POST", "/books", { token: other.token, tenantId: other.tenantId, json: { title: "Sach khac" } });
  const cross = await api("GET", "/books/" + otherBook.data.id + "/assets/" + first, { token: other.token, tenantId: other.tenantId });
  check("Creator tenant khac KHONG doc duoc asset cua sach corpus (404)", cross.status === 404, cross.status);

  console.log("");
  console.log("Test 7: bien so trang (1..5), trang xoay, trang ngang/doc hon hop - cat tu PDF that.");
  const vdir = path.join(TMP, "variants");
  const variants = py(["variants", CORPUS_PDF, vdir]);
  const creds = st.creds;
  const vres = {};
  for (const [name, meta] of Object.entries(variants)) {
    const r = await convertVariant(creds, meta.path, "Variant " + name);
    vres[name] = r;
    const okDone = r.job && r.job.state === "done";
    check(name + ": convert 'done'", okDone, r.job || r.up);
    if (!okDone) continue;
    check(name + ": manifest co dung " + meta.pages + " trang", r.manifest.pages.length === meta.pages, r.manifest.pages.length);
    check(name + ": moi trang co du 2 asset", r.manifest.pages.every((p) => p.imageAssetId && p.thumbAssetId), null);
  }
  if (vres["rotated-mixed.pdf"]?.manifest) {
    const rp = vres["rotated-mixed.pdf"].manifest.pages;
    check(
      "rotated: /Rotate 90 -> trang tro thanh NGANG (w>h), rotation=0 (khong xoay lan 2)",
      rp[1].widthPt > rp[1].heightPt && rp.every((p) => p.rotation === 0),
      rp.map((p) => [Math.round(p.widthPt), Math.round(p.heightPt), p.rotation])
    );
    check("rotated: /Rotate 180 giu nguyen huong doc (doc)", rp[2].widthPt < rp[2].heightPt, [rp[2].widthPt, rp[2].heightPt]);
  }
  if (vres["landscape-mixed.pdf"]?.manifest) {
    const lp = vres["landscape-mixed.pdf"].manifest.pages;
    check(
      "landscape-mixed: trang 3 ngang, trang khac doc (giu dung tung trang)",
      lp[2].widthPt > lp[2].heightPt && lp[0].widthPt < lp[0].heightPt,
      lp.map((p) => [Math.round(p.widthPt), Math.round(p.heightPt)])
    );
  }

  const pw = vres["pages-3.pdf"];
  if (pw?.manifest) {
    console.log("");
    console.log("Test 7b: bat mat khau tren sach vua convert -> anh bi chan khi khong co token, co token thi doc duoc.");
    const setPw = await api("PUT", "/books/" + pw.bookId + "/settings", { token: creds.token, tenantId: creds.tenantId, json: { password: "MatKhauCorpus123" } });
    check("dat mat khau thanh cong", setPw.status === 200 && setPw.data.has_password === true, setPw.status);
    const imgId = pw.manifest.pages[0].imageAssetId;
    const blocked = await fetch(BASE + "/public/books/" + pw.permalink + "/assets/" + imgId);
    check("co mat khau + KHONG token -> anh bi chan (401/403)", [401, 403].includes(blocked.status), blocked.status);
    const ver = await api("POST", "/public/books/" + pw.permalink + "/verify-password", { json: { password: "MatKhauCorpus123" } });
    const okImg = await fetch(BASE + "/public/books/" + pw.permalink + "/assets/" + imgId + "?token=" + encodeURIComponent(ver.data?.readerToken || ""));
    check("co mat khau + token hop le -> doc duoc anh (200, webp)", okImg.status === 200 && /image.webp/.test(okImg.headers.get("content-type") || ""), okImg.status);
  }

  console.log("");
  console.log("Test 8: PDF bi cat cut (5MB dau cua file that) -> job FAILED co kiem soat, khong treo.");
  const trunc = path.join(TMP, "truncated.pdf");
  const fd = fs.openSync(CORPUS_PDF, "r");
  const head = Buffer.alloc(5 * 1024 * 1024);
  fs.readSync(fd, head, 0, head.length, 0);
  fs.closeSync(fd);
  fs.writeFileSync(trunc, head);
  const tr = await convertVariant(creds, trunc, "Truncated");
  check("upload file cat cut duoc nhan (201) roi job ket thuc 'failed' (khong 'done', khong treo)", tr.up.status === 201 && tr.job && tr.job.state === "failed", tr.job || tr.up);
  const after = await api("GET", "/public/books/" + st.permalink);
  check("loi convert sach khac KHONG anh huong sach corpus dang publish", after.status === 200 && after.data.pages.length === info.pageCount, after.status);

  console.log("");
  console.log("=== KET QUA CORPUS CONVERT: " + passed + " PASS / " + failed + " FAIL ===");
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
