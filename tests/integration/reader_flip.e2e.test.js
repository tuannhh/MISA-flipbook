#!/usr/bin/env node
"use strict";

/**
 * Test LAT TRANG end-to-end tren trinh duyet THAT (Chrome he thong qua playwright-core), doc
 * sach corpus 140 trang + cac sach 1..5 trang da convert tu PDF that. Sau MOI lan lat kiem
 * tra cac BAT BIEN:
 *   I1 nhan "Trang A-B / T" == tap trang cua anh dang hien thi
 *   I2 anh dang hien thi da tai xong, khong con o giu cho (blank)
 *   I3 thanh tien trinh == round(trang cuoi dang thay / T * 100)
 *   I4 nut Truoc/Sau ton tai dung luc (khong "nut chet" o dau/cuoi sach)
 *   I5 che do desktop hien 2 trang (bia/bia sau 1 trang), mobile luon 1 trang
 *   I6 khong loi console / pageerror / request anh 4xx-5xx
 *
 *   WEB_BASE_URL=http://127.0.0.1:8080 API_BASE_URL=http://127.0.0.1:8080/api \
 *   SEED_ADMIN_PASSWORD=... node reader_flip.e2e.test.js
 *
 * Yeu cau: Google Chrome cai tren may (channel "chrome"), hoac dat CHROME_PATH. Khong co PDF
 * corpus -> SKIP (exit 0).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { chromium } = require("playwright-core");
const corpus = require("./lib/corpus.js");

const WEB = process.env.WEB_BASE_URL ?? "http://127.0.0.1:8080";
const SHOTS = path.join(os.tmpdir(), "misa-flip-shots");
const QUICK = process.env.FLIP_QUICK === "1";

let passed = 0;
let failed = 0;
const failures = [];
function check(label, ok, extra) {
  if (ok) {
    console.log("  PASS: " + label);
    passed += 1;
  } else {
    console.log("  FAIL: " + label + (extra !== undefined ? " -- " + JSON.stringify(extra).slice(0, 700) : ""));
    failed += 1;
    failures.push(label);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const opts = { headless: true };
  if (process.env.CHROME_PATH) opts.executablePath = process.env.CHROME_PATH;
  else opts.channel = "chrome";
  return chromium.launch(opts);
}

/* ------------------------------------------------------------------ do trang thai reader */
function readState() {
  const stage = document.querySelector(".reader-stage");
  if (!stage) return { error: "no-stage" };
  const sr = stage.getBoundingClientRect();
  const label = (document.querySelector(".reader-page-label")?.textContent || "").trim();
  const m = label.match(/(\d+)(?:-(\d+))?\s*\/\s*(\d+)/);
  const visible = (el) => {
    if (el.getClientRects().length === 0) return null;
    const r = el.getBoundingClientRect();
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    if (r.width < 20 || cx < sr.x || cx > sr.right || cy < sr.y || cy > sr.bottom) return null;
    return r;
  };
  const imgs = [];
  for (const img of document.querySelectorAll(".flipbook-page img")) {
    const r = visible(img);
    if (!r) continue;
    const a = (img.alt || "").match(/(\d+)/);
    imgs.push({ page: a ? Number(a[1]) : null, loaded: img.complete && img.naturalWidth > 0, x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) });
  }
  let blanks = 0;
  for (const b of document.querySelectorAll(".flipbook-page .flipbook-blank")) if (visible(b)) blanks += 1;
  imgs.sort((a, b) => a.x - b.x);
  const progress = document.querySelector(".reader-progress");
  return {
    label,
    from: m ? Number(m[1]) : null,
    to: m ? Number(m[2] || m[1]) : null,
    total: m ? Number(m[3]) : null,
    imgs,
    blanks,
    progress: progress ? Number(progress.getAttribute("aria-valuenow")) : null,
    hasPrev: !!document.querySelector(".nav-zone.left"),
    hasNext: !!document.querySelector(".nav-zone.right"),
    vw: window.innerWidth,
  };
}

async function state(page) {
  return page.evaluate(readState);
}

/** Cho den khi trang thai on dinh (cung nhan + cung anh) lien tuc quiet ms. */
async function settle(page, { quiet = 1000, timeout = 10000 } = {}) {
  const t0 = Date.now();
  let last = "";
  let since = Date.now();
  let s;
  while (Date.now() - t0 < timeout) {
    s = await state(page);
    const sig = JSON.stringify([s.label, s.imgs.map((i) => [i.page, i.loaded]), s.blanks]);
    if (sig !== last) {
      last = sig;
      since = Date.now();
    } else if (Date.now() - since >= quiet && s.imgs.length > 0) {
      s.settleMs = Date.now() - t0 - quiet;
      return s;
    }
    await sleep(60);
  }
  s.settleMs = Date.now() - t0;
  s.unsettled = true;
  return s;
}

/** Kiem tra bat bien; tra ve mang loi (rong = OK). */
function invariants(s, { total, mobile, expectPages }) {
  const errs = [];
  if (s.error) return [s.error];
  if (s.unsettled) errs.push("khong on dinh sau timeout");
  if (s.total !== total) errs.push("nhan tong trang " + s.total + " != " + total);
  const shown = s.imgs.map((i) => i.page);
  const expected = [];
  for (let p = s.from; p <= s.to; p++) expected.push(p);
  if (JSON.stringify(shown) !== JSON.stringify(expected)) errs.push("I1 nhan " + s.label + " nhung anh dang thay = " + JSON.stringify(shown));
  if (s.imgs.some((i) => !i.loaded)) errs.push("I2 anh chua tai xong: " + JSON.stringify(s.imgs.filter((i) => !i.loaded).map((i) => i.page)));
  if (s.blanks > 0) errs.push("I2 con " + s.blanks + " o giu cho trang trong dang hien");
  const wantProgress = Math.min(100, Math.round((s.to / total) * 100));
  if (s.progress !== wantProgress) errs.push("I3 tien trinh " + s.progress + " != " + wantProgress);
  if (s.hasPrev !== s.from > 1) errs.push("I4 nut Truoc=" + s.hasPrev + " nhung trang dau=" + s.from);
  if (s.hasNext !== s.to < total) errs.push("I4 nut Sau=" + s.hasNext + " nhung trang cuoi=" + s.to);
  if (mobile && s.imgs.length !== 1) errs.push("I5 mobile phai 1 trang, dang hien " + s.imgs.length);
  if (s.imgs.length === 2 && Math.abs(s.imgs[0].w - s.imgs[1].w) > 3) errs.push("I5 2 trang khac be rong " + s.imgs.map((i) => i.w));
  if (s.imgs.length === 2 && Math.abs(s.imgs[0].x + s.imgs[0].w - s.imgs[1].x) > 4) errs.push("I5 2 trang khong sat nhau (khe/chong lan)");
  if (expectPages && !expectPages.every((p) => shown.includes(p))) errs.push("khong thay trang muc tieu " + JSON.stringify(expectPages) + " (dang thay " + JSON.stringify(shown) + ")");
  return errs;
}

async function newSession(browser, { mobile = false, width = 1440, height = 900 } = {}) {
  const ctx = await browser.newContext(
    mobile
      ? { viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "vi-VN" }
      : { viewport: { width, height }, locale: "vi-VN" }
  );
  const page = await ctx.newPage();
  const issues = [];
  page.on("pageerror", (e) => issues.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") issues.push("console.error: " + m.text().slice(0, 200));
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url().startsWith(WEB)) issues.push("HTTP " + r.status() + " " + r.url().replace(WEB, "").slice(0, 120));
  });
  return { ctx, page, issues };
}

async function openBook(page, permalink, query = "") {
  await page.goto(WEB + "/read/" + permalink + query, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".flipbook-book", { timeout: 20000 });
  return settle(page, { quiet: 700 });
}

/** Hop bao cua cac trang DANG HIEN (khong phai khung stage) - de keo tu goc trang that. */
async function visiblePageRect(page) {
  return page.evaluate(() => {
    const rects = [...document.querySelectorAll(".flipbook-page img")]
      .filter((i) => i.getClientRects().length > 0)
      .map((i) => i.getBoundingClientRect())
      .filter((r) => r.width > 20 && r.x + r.width / 2 > 0 && r.x + r.width / 2 < window.innerWidth);
    const x0 = Math.min(...rects.map((r) => r.x));
    const y0 = Math.min(...rects.map((r) => r.y));
    const x1 = Math.max(...rects.map((r) => r.right));
    const y1 = Math.max(...rects.map((r) => r.bottom));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  });
}

async function dragMouse(page, x0, y0, x1, y1, steps = 18) {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
    await sleep(12);
  }
  await page.mouse.up();
}

async function clickNext(page) {
  await page.locator(".nav-zone.right").click({ timeout: 4000 });
}
async function clickPrev(page) {
  await page.locator(".nav-zone.left").click({ timeout: 4000 });
}

async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, name + ".png");
  await page.screenshot({ path: file }).catch(() => {});
  return file;
}

/** Nhay den trang qua hop thoai dieu huong (giong nguoi dung that). */
async function jumpViaDialog(page, target) {
  await page.getByRole("button", { name: /điều hướng|trang|navigator|page/i }).first().click();
  const input = page.locator("input[type=number]").first();
  await input.fill(String(target));
  await input.press("Enter");
  await sleep(150);
}

/* ------------------------------------------------------------------ cac kich ban */
async function walkAll(page, total, mobile, label) {
  const bad = [];
  let s = await settle(page);
  let steps = 0;
  let maxSettle = 0;
  const seen = [];
  const limit = QUICK ? 14 : total + 5;
  while (s.hasNext && steps < limit) {
    const prevTo = s.to;
    await clickNext(page);
    s = await settle(page);
    steps += 1;
    maxSettle = Math.max(maxSettle, s.settleMs || 0);
    seen.push(s.label);
    const errs = invariants(s, { total, mobile });
    if (errs.length) bad.push({ step: steps, label: s.label, errs });
    if (s.to <= prevTo) {
      bad.push({ step: steps, label: s.label, errs: ["bam Sau nhung khong tien (van " + s.label + ")"] });
      break;
    }
  }
  console.log("  (" + label + ": " + steps + " lan lat, settle lon nhat " + maxSettle + "ms)");
  return { bad, steps, final: s, seen };
}

async function walkBack(page, total, mobile, label) {
  const bad = [];
  let s = await settle(page);
  let steps = 0;
  const limit = QUICK ? 14 : total + 5;
  while (s.hasPrev && steps < limit) {
    const prevFrom = s.from;
    await clickPrev(page);
    s = await settle(page);
    steps += 1;
    const errs = invariants(s, { total, mobile });
    if (errs.length) bad.push({ step: steps, label: s.label, errs });
    if (s.from >= prevFrom) {
      bad.push({ step: steps, label: s.label, errs: ["bam Truoc nhung khong lui (van " + s.label + ")"] });
      break;
    }
  }
  console.log("  (" + label + ": " + steps + " lan lat lui)");
  return { bad, steps, final: s };
}

async function main() {
  if (!corpus.corpusAvailable()) {
    console.log("SKIP: khong co PDF corpus (" + corpus.CORPUS_PDF + ").");
    return;
  }
  console.log("WEB_BASE_URL = " + WEB);
  fs.rmSync(SHOTS, { recursive: true, force: true });

  console.log("");
  console.log("Chuan bi du lieu: sach corpus 140 trang + sach 1..5 trang (convert that qua pipeline).");
  const st = await corpus.prepareCorpusBook();
  const total = st.pageCount;
  console.log("  corpus: " + st.permalink + " (" + total + " trang, " + (st.cached ? "dung lai" : "moi convert") + ")");
  const vb = await corpus.prepareVariantBooks(st, ["pages-1.pdf", "pages-2.pdf", "pages-3.pdf", "pages-4.pdf", "pages-5.pdf"]);

  const browser = await launch();
  try {
    /* =========================== DESKTOP =========================== */
    const d = await newSession(browser);
    const dp = d.page;

    console.log("");
    console.log("D1: mo sach, trang bia don, tai xong, khong loi.");
    let s = await openBook(dp, st.permalink);
    check("mo sach -> nhan 'Trang 1 / " + total + "' (bia 1 trang)", s.from === 1 && s.to === 1, s.label);
    check("bat bien khi mo (bia)", invariants(s, { total }).length === 0, invariants(s, { total }));
    check("desktop 1440px: che do 2 trang (1 anh cho bia, khong bi cat)", s.imgs.length === 1 && s.imgs[0].w > 200, s.imgs);

    console.log("");
    console.log("D2: duyet TUAN TU toan bo sach bang nut 'Sau' (moi buoc kiem bat bien).");
    let r = await walkAll(dp, total, false, "D2 tien");
    check("D2: khong buoc nao vi pham bat bien", r.bad.length === 0, r.bad.slice(0, 4));
    check("D2: ket thuc dung o trang cuoi (" + total + ")" + (QUICK ? " (QUICK: bo qua)" : ""), QUICK || r.final.to === total, r.final.label);
    check("D2: so lan lat = " + Math.ceil((total - 1) / 2) + " (bia -> cac spread -> trang cuoi)" + (QUICK ? " (QUICK: bo qua)" : ""), QUICK || r.steps === Math.ceil((total - 1) / 2), r.steps);
    if (r.bad.length) await shot(dp, "D2-fail");

    console.log("");
    console.log("D3: duyet NGUOC toan bo sach bang nut 'Truoc'.");
    r = await walkBack(dp, total, false, "D3 lui");
    check("D3: khong buoc nao vi pham bat bien", r.bad.length === 0, r.bad.slice(0, 4));
    check("D3: ve dung trang bia", r.final.from === 1 && r.final.to === 1, r.final.label);
    if (r.bad.length) await shot(dp, "D3-fail");

    console.log("");
    console.log("D4: phim mui ten + bien dau/cuoi.");
    await dp.keyboard.press("ArrowLeft");
    s = await settle(dp);
    check("ArrowLeft o bia -> khong doi, khong loi", s.from === 1 && invariants(s, { total }).length === 0, s.label);
    for (let i = 0; i < 6; i++) {
      await dp.keyboard.press("ArrowRight");
      await sleep(80);
    }
    s = await settle(dp);
    check("6 lan ArrowRight (nhanh) -> trang thai nhat quan", invariants(s, { total }).length === 0, [s.label, invariants(s, { total })]);
    const afterRight = s.to;
    for (let i = 0; i < 3; i++) {
      await dp.keyboard.press("ArrowLeft");
      await sleep(80);
    }
    s = await settle(dp);
    check("3 lan ArrowLeft (nhanh) -> lui, nhat quan", invariants(s, { total }).length === 0 && s.to < afterRight, [s.label, invariants(s, { total })]);

    console.log("");
    console.log("D5: nhay trang qua hop thoai dieu huong (chan/le, dau/cuoi, xuoi/nguoc).");
    const targets = QUICK ? [2, 3, 50, 140, 1] : [2, 3, 4, 5, 50, 51, 100, 139, 140, 1, 71, 70, 2, 138, 3];
    const jumpBad = [];
    for (const t of targets) {
      try {
        await jumpViaDialog(dp, t);
        s = await settle(dp, { quiet: 700 });
        const errs = invariants(s, { total, expectPages: [t] });
        if (errs.length) jumpBad.push({ target: t, label: s.label, errs });
      } catch (e) {
        jumpBad.push({ target: t, errs: ["loi thao tac: " + e.message.slice(0, 120)] });
      }
    }
    check("D5: nhay toi " + targets.length + " trang -> dung trang muc tieu va nhat quan", jumpBad.length === 0, jumpBad.slice(0, 4));
    if (jumpBad.length) await shot(dp, "D5-fail");

    console.log("");
    console.log("D6: deep-link ?page=N (chan, le, biên, khong hop le).");
    const deepBad = [];
    for (const n of [1, 2, 3, 4, 5, 70, 71, 139, 140]) {
      const ds = await openBook(dp, st.permalink, "?page=" + n);
      const errs = invariants(ds, { total, expectPages: [n] });
      if (errs.length) deepBad.push({ page: n, label: ds.label, errs });
    }
    check("D6: ?page=N (N hop le) mo dung trang N, nhan/anh/tien trinh nhat quan", deepBad.length === 0, deepBad.slice(0, 5));
    if (deepBad.length) await shot(dp, "D6-fail");
    const invalid = [];
    for (const q of ["0", "-3", "abc", "9999", "2.5"]) {
      const ds = await openBook(dp, st.permalink, "?page=" + q);
      const errs = invariants(ds, { total });
      if (errs.length || ds.from !== 1) invalid.push({ q, label: ds.label, errs });
    }
    check("D6: ?page khong hop le -> ve bia, khong vo", invalid.length === 0, invalid);

    console.log("");
    console.log("D7: bam/lat rat nhanh (stress) roi kiem tra tinh nhat quan sau khi yen.");
    await openBook(dp, st.permalink);
    for (let i = 0; i < 25; i++) {
      await dp.locator(".nav-zone.right").click({ timeout: 4000, force: true }).catch(() => {});
      await sleep(40);
    }
    s = await settle(dp, { quiet: 900, timeout: 15000 });
    check("D7: 25 lan bam 'Sau' cach 40ms -> yen o trang thai nhat quan", invariants(s, { total }).length === 0, [s.label, invariants(s, { total })]);
    check("D7: dat den it nhat trang 10 (khong 'ket' do bam nhanh)", s.to >= 10, s.label);
    const mid = s.to;
    for (let i = 0; i < 25; i++) {
      await dp.locator(".nav-zone.left").click({ timeout: 4000, force: true }).catch(() => {});
      await sleep(40);
    }
    s = await settle(dp, { quiet: 900, timeout: 15000 });
    check("D7: 25 lan bam 'Truoc' nhanh -> nhat quan va lui", invariants(s, { total }).length === 0 && s.to < mid, [s.label, invariants(s, { total })]);

    console.log("");
    console.log("D8: keo chuot tu giua san khau (goc trang bi nut nav-zone 25% hai mep che - thiet ke co san).");
    await openBook(dp, st.permalink, "?page=20");
    let pr = await visiblePageRect(dp);
    const before = (await settle(dp)).label;
    await dragMouse(dp, pr.x + pr.w - 190, pr.y + pr.h - 70, pr.x + 60, pr.y + pr.h - 90);
    s = await settle(dp, { quiet: 900 });
    // Thu vien co the de lai phan tu gap ngoai tam nhin (khong thay duoc), nhung nhan phai van dung & khong loi
    check("D8: keo chuot giua san khau khong lam sai nhan trang / khong loi", s.label === before || s.from > 20, [before, s.label]);
    await clickNext(dp);
    s = await settle(dp, { quiet: 900 });
    check("D8: sau khi keo, bam 'Sau' van lat dung, nhat quan", s.from > 20 && invariants(s, { total }).length === 0, [s.label, invariants(s, { total })]);
    const fwd = s.from;
    await clickPrev(dp);
    s = await settle(dp, { quiet: 900 });
    check("D8: sau khi keo, bam 'Truoc' van lui dung, nhat quan", s.from < fwd && invariants(s, { total }).length === 0, [s.label, invariants(s, { total })]);

    console.log("");
    console.log("D9: doi kich thuoc cua so (spread <-> 1 trang) giua chung khi dang doc.");
    await openBook(dp, st.permalink, "?page=50");
    let cur = await settle(dp, { quiet: 700 });
    const resizeBad = [];
    for (const w of [1100, 800, 500, 1440]) {
      await dp.setViewportSize({ width: w, height: 900 });
      await sleep(300);
      cur = await settle(dp, { quiet: 800 });
      const errs = invariants(cur, { total, expectPages: [50] });
      if (errs.length) resizeBad.push({ width: w, label: cur.label, errs });
    }
    check("D9: resize 1100/800/500/1440px -> van dung trang 50 va nhat quan", resizeBad.length === 0, resizeBad);
    if (resizeBad.length) await shot(dp, "D9-fail");
    await dp.setViewportSize({ width: 1440, height: 900 });

    console.log("");
    console.log("D10: zoom (slider) roi lat trang, roi ve 100%.");
    await openBook(dp, st.permalink, "?page=20");
    const slider = dp.locator("input.reader-zoom-slider");
    await slider.fill("2");
    await sleep(500);
    s = await settle(dp, { quiet: 700 });
    check("D10: zoom 2x giu nguyen trang dang doc (20)", invariants(s, { total, expectPages: [20] }).length === 0, [s.label, invariants(s, { total, expectPages: [20] })]);
    await clickNext(dp);
    s = await settle(dp, { quiet: 800 });
    check("D10: dang zoom bam 'Sau' van lat duoc, nhat quan", s.from > 20 && invariants(s, { total }).length === 0, [s.label, invariants(s, { total })]);
    await slider.fill("1");
    await sleep(400);
    s = await settle(dp, { quiet: 700 });
    check("D10: ve 100% giu dung trang, nhat quan", invariants(s, { total }).length === 0, [s.label, invariants(s, { total })]);

    console.log("");
    console.log("D10b: zoom 2x roi keo (pan) khong lam lat trang ngoai y muon; bam Truoc van hoat dong.");
    await openBook(dp, st.permalink, "?page=30");
    await dp.locator("input.reader-zoom-slider").fill("2");
    await sleep(600);
    const z0 = await settle(dp, { quiet: 800 });
    const stageBox = await dp.locator(".reader-stage").boundingBox();
    await dragMouse(dp, stageBox.x + stageBox.width / 2, stageBox.y + stageBox.height / 2, stageBox.x + stageBox.width / 2 - 200, stageBox.y + stageBox.height / 2 - 80);
    const z1 = await settle(dp, { quiet: 800 });
    check("D10b: keo pan khi zoom KHONG lat trang", z1.label === z0.label, [z0.label, z1.label]);
    await clickPrev(dp);
    const z2 = await settle(dp, { quiet: 1000 });
    check("D10b: dang zoom bam 'Truoc' lat lui duoc (khong bi pointer-capture nuot click)", z2.from < z0.from, [z0.label, z2.label]);
    await dp.locator("input.reader-zoom-slider").fill("1");

    console.log("");
    console.log("D10c: che do giam chuyen dong (prefers-reduced-motion) = 'don gian': lat bang nut/phim van dung.");
    const rm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", locale: "vi-VN" });
    const rp = await rm.newPage();
    const rmIssues = [];
    rp.on("pageerror", (e) => rmIssues.push(e.message));
    await openBook(rp, st.permalink);
    const rmBad = [];
    let rs = await settle(rp, { quiet: 500 });
    for (let i = 0; i < 6; i++) {
      await clickNext(rp);
      rs = await settle(rp, { quiet: 500 });
      const errs = invariants(rs, { total });
      if (errs.length) rmBad.push({ i, label: rs.label, errs });
    }
    await jumpViaDialog(rp, 77);
    rs = await settle(rp, { quiet: 600 });
    const je = invariants(rs, { total, expectPages: [77] });
    if (je.length) rmBad.push({ jump: 77, label: rs.label, errs: je });
    check("D10c: reduced-motion: 6 lan Sau + nhay trang 77 nhat quan, khong loi", rmBad.length === 0 && rmIssues.length === 0, [rmBad.slice(0, 3), rmIssues]);
    await rm.close();

    console.log("");
    console.log("D11: sach it trang (1..5) - bien bia/bia sau va 'nut chet'.");
    for (const n of [1, 2, 3, 4, 5]) {
      const b = vb["pages-" + n + ".pdf"];
      if (!b) {
        check("sach " + n + " trang co san", false, "thieu du lieu");
        continue;
      }
      const vs = await openBook(dp, b.permalink);
      const rr = await walkAll(dp, n, false, "pages-" + n + " tien");
      check("pages-" + n + ": duyet tien khong vi pham bat bien", rr.bad.length === 0, rr.bad.slice(0, 3));
      check("pages-" + n + ": trang cuoi dat toi trang " + n + " va KHONG con nut Sau", rr.final.to === n && !rr.final.hasNext, [rr.final.label, rr.final.hasNext]);
      if (n > 1) {
        const bb = await walkBack(dp, n, false, "pages-" + n + " lui");
        check("pages-" + n + ": duyet lui ve bia, nhat quan", bb.bad.length === 0 && bb.final.from === 1, bb.bad.slice(0, 3));
      } else {
        check("pages-1: sach 1 trang khong co nut Truoc/Sau", !vs.hasPrev && !vs.hasNext, vs);
      }
    }

    console.log("");
    console.log("D13: che do toan man hinh (Fullscreen API) - vao/ra, lat trang, dong bo trang thai.");
    await openBook(dp, st.permalink, "?page=30");
    const fsState = () => dp.evaluate(() => ({
      fs: document.fullscreenElement ? document.fullscreenElement.className : null,
      btn: document.querySelector('button[aria-label*="toàn màn hình"]')?.getAttribute("aria-label") || null,
    }));
    const fsBtn = dp.locator('button[aria-label="Xem toàn màn hình"]');
    check("D13: co nut 'Xem toàn màn hình'", (await fsBtn.count()) === 1);
    await fsBtn.click();
    await sleep(800);
    let fst = await fsState();
    check("D13: vao fullscreen -> fullscreenElement la khung reader, nut doi thanh 'Thoát'", !!fst.fs && /reader/.test(fst.fs) && fst.btn === "Thoát toàn màn hình", fst);
    s = await settle(dp, { quiet: 900 });
    check("D13: vao fullscreen giu nguyen trang (30), nhat quan", s.from === 30 && invariants(s, { total }).length === 0, [s.label, invariants(s, { total })]);
    await clickNext(dp);
    s = await settle(dp, { quiet: 900 });
    check("D13: dang fullscreen bam 'Sau' van lat, nhat quan", s.from > 30 && invariants(s, { total }).length === 0, [s.label, invariants(s, { total })]);
    await jumpViaDialog(dp, 80);
    s = await settle(dp, { quiet: 1000, timeout: 15000 });
    check("D13: dang fullscreen nhay toi trang 80 dung, nhat quan", (s.from === 80 || s.to === 80) && invariants(s, { total }).length === 0, [s.label, invariants(s, { total })]);
    await dp.keyboard.press("ArrowLeft");
    await sleep(1200);
    s = await settle(dp, { quiet: 900 });
    check("D13: dang fullscreen phim mui ten lui trang, nhat quan", s.to < 80 && invariants(s, { total }).length === 0, [s.label, invariants(s, { total })]);
    await dp.locator('button[aria-label="Thoát toàn màn hình"]').click();
    await sleep(800);
    fst = await fsState();
    check("D13: bam nut 'Thoát' -> ra fullscreen, nut tro lai 'Xem'", fst.fs === null && fst.btn === "Xem toàn màn hình", fst);
    s = await settle(dp, { quiet: 900 });
    check("D13: sau khi thoat fullscreen van nhat quan", invariants(s, { total }).length === 0, [s.label, invariants(s, { total })]);
    // Thoat bang duong khac (Esc cua trinh duyet -> exitFullscreen): UI phai tu dong bo
    await fsBtn.click();
    await sleep(800);
    await dp.evaluate(() => document.exitFullscreen());
    await sleep(800);
    fst = await fsState();
    check("D13: thoat fullscreen ngoai nut (Esc/exitFullscreen) -> nut tu dong bo ve 'Xem'", fst.fs === null && fst.btn === "Xem toàn màn hình", fst);

    console.log("");
    console.log("D14: fullscreen trong iframe nhung (ma nhung co/khong allowfullscreen).");
    {
      // Chrome chan trang host gia lap -> localhost (Local Network Access): tat co nay rieng cho browser nay.
      const b2 = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" }), headless: true, args: ["--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests"] });
      const embedSrc = WEB + "/read/" + st.permalink + "/embed";
      const embedResult = {};
      for (const allow of ["allowfullscreen", ""]) {
        const c2 = await b2.newContext({ viewport: { width: 1200, height: 800 } });
        const p2 = await c2.newPage();
        await p2.route("http://localhost:9999/", (r) => r.fulfill({ contentType: "text/html", body: '<body><iframe id="f" src="' + embedSrc + '" ' + allow + ' style="width:100%;aspect-ratio:16/9;border:0"></iframe></body>' }));
        await p2.goto("http://localhost:9999/");
        const fr = p2.frameLocator("#f");
        await fr.locator(".flipbook-book").waitFor({ timeout: 20000 });
        await sleep(1500);
        await fr.locator('button[aria-label="Xem toàn màn hình"]').click();
        await sleep(1000);
        const top = await p2.evaluate(() => document.fullscreenElement?.id || null);
        const lab = await fr.locator('button[aria-label*="toàn màn hình"]').getAttribute("aria-label");
        let flipOk = null;
        if (allow) {
          await fr.locator(".nav-zone.right").click();
          await sleep(1500);
          flipOk = /Trang 2-3|Trang 2/.test(await fr.locator(".reader-page-label").textContent());
          await fr.locator('button[aria-label="Thoát toàn màn hình"]').click();
          await sleep(800);
          embedResult.exitLabel = await fr.locator('button[aria-label*="toàn màn hình"]').getAttribute("aria-label");
        }
        embedResult[allow || "none"] = { top, lab, flipOk };
        await c2.close();
      }
      await b2.close();
      check("D14: iframe co allowfullscreen -> vao fullscreen, nut doi 'Thoát', lat trang duoc, thoat ve 'Xem'",
        embedResult.allowfullscreen.top === "f" && embedResult.allowfullscreen.lab === "Thoát toàn màn hình" && embedResult.allowfullscreen.flipOk === true && embedResult.exitLabel === "Xem toàn màn hình", embedResult);
      check("D14: iframe THIEU allowfullscreen -> trinh duyet tu choi, nut giu nguyen, khong loi",
        embedResult.none.top === null && embedResult.none.lab === "Xem toàn màn hình", embedResult.none);
    }

    console.log("");
    console.log("D12: loi trinh duyet trong toan bo phien desktop.");
    check("khong pageerror/console.error/HTTP>=400 nao", d.issues.length === 0, d.issues.slice(0, 6));
    await d.ctx.close();

    /* =========================== MOBILE =========================== */
    console.log("");
    console.log("M1: mobile 390x844 (cam ung) - luon 1 trang, duyet tuan tu.");
    const m = await newSession(browser, { mobile: true, width: 390, height: 844 });
    const mp = m.page;
    s = await openBook(mp, st.permalink);
    check("mobile mo sach -> Trang 1, 1 anh, nhat quan", s.from === 1 && invariants(s, { total, mobile: true }).length === 0, [s.label, invariants(s, { total, mobile: true })]);
    const mw = await walkAll(mp, total, true, "M1 tien");
    check("M1: duyet tien toan bo sach mobile, moi buoc nhat quan (1 trang)", mw.bad.length === 0, mw.bad.slice(0, 4));
    check("M1: den dung trang cuoi " + total + (QUICK ? " (QUICK: bo qua)" : ""), QUICK || mw.final.to === total, mw.final.label);
    const mb = await walkBack(mp, total, true, "M1 lui");
    check("M1: duyet lui ve bia, nhat quan", mb.bad.length === 0 && mb.final.from === 1, mb.bad.slice(0, 4));
    if (mw.bad.length || mb.bad.length) await shot(mp, "M1-fail");

    console.log("");
    console.log("M2: vuot (swipe) cam ung that qua CDP.");
    await openBook(mp, st.permalink);
    const cdp = await m.ctx.newCDPSession(mp);
    async function swipe(x1, x2, y) {
      // Thu vien chi nhan vuot HOAN TAT trong 250ms (swipeTimeout): 5 buoc, khong tre.
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x1, y }] });
      for (let i = 1; i <= 5; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x1 + ((x2 - x1) * i) / 5, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    let sw = await settle(mp);
    const swipeBad = [];
    for (let i = 0; i < 4; i++) {
      const b0 = sw.to;
      await swipe(300, 60, 450); // bat dau ngoai nut nav-zone o hai mep
      sw = await settle(mp, { quiet: 700 });
      const errs = invariants(sw, { total, mobile: true });
      if (sw.to !== b0 + 1) errs.push("vuot trai khong sang trang ke (" + b0 + " -> " + sw.to + ")");
      if (errs.length) swipeBad.push({ i, label: sw.label, errs });
    }
    check("M2: 4 lan vuot trai -> tien tung trang mot, nhat quan", swipeBad.length === 0, swipeBad);
    const back = [];
    for (let i = 0; i < 4; i++) {
      const b0 = sw.to;
      await swipe(120, 330, 450);
      sw = await settle(mp, { quiet: 700 });
      const errs = invariants(sw, { total, mobile: true });
      if (sw.to !== b0 - 1) errs.push("vuot phai khong ve trang truoc (" + b0 + " -> " + sw.to + ")");
      if (errs.length) back.push({ i, label: sw.label, errs });
    }
    check("M2: 4 lan vuot phai -> lui tung trang mot, ve bia", back.length === 0 && sw.to === 1, back);

    console.log("");
    console.log("M3: nhay trang + deep-link tren mobile.");
    const mj = [];
    for (const t of [2, 3, 70, 140, 1, 99]) {
      try {
        await jumpViaDialog(mp, t);
        const js = await settle(mp, { quiet: 700 });
        const errs = invariants(js, { total, mobile: true, expectPages: [t] });
        if (errs.length) mj.push({ target: t, label: js.label, errs });
      } catch (e) {
        mj.push({ target: t, errs: ["loi thao tac: " + e.message.slice(0, 120)] });
      }
    }
    check("M3: nhay 6 trang tren mobile dung trang muc tieu, nhat quan", mj.length === 0, mj);
    const md = [];
    for (const n of [1, 2, 3, 139, 140]) {
      const ds = await openBook(mp, st.permalink, "?page=" + n);
      const errs = invariants(ds, { total, mobile: true, expectPages: [n] });
      if (errs.length) md.push({ page: n, errs });
    }
    check("M3: ?page=N tren mobile dung, nhat quan", md.length === 0, md);

    console.log("");
    console.log("M4: xoay man hinh doc <-> ngang giua chung khi dang doc (van 1 trang, giu trang).");
    await openBook(mp, st.permalink, "?page=30");
    const rot = [];
    for (const [w, h] of [[844, 390], [390, 844], [844, 390], [360, 640]]) {
      await mp.setViewportSize({ width: w, height: h });
      await sleep(300);
      const rs = await settle(mp, { quiet: 800 });
      const errs = invariants(rs, { total, mobile: true, expectPages: [30] });
      if (errs.length) rot.push({ size: w + "x" + h, label: rs.label, errs });
    }
    check("M4: xoay 844x390 / 390x844 / 360x640 -> van trang 30, 1 trang, nhat quan", rot.length === 0, rot);
    if (rot.length) await shot(mp, "M4-fail");

    console.log("");
    console.log("M5: loi trinh duyet trong toan bo phien mobile.");
    check("khong pageerror/console.error/HTTP>=400 nao (mobile)", m.issues.length === 0, m.issues.slice(0, 6));
    await m.ctx.close();
  } finally {
    await browser.close();
  }

  console.log("");
  console.log("=== KET QUA LAT TRANG E2E: " + passed + " PASS / " + failed + " FAIL ===");
  if (failed > 0) {
    console.log("Anh chup loi (neu co): " + SHOTS);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
