#!/usr/bin/env node
"use strict";

/**
 * F10 level B end-to-end: a PDF /Movie annotation contains a valid WAV. The real
 * worker must extract it, the public manifest must expose only its scoped asset id,
 * and HTTP byte ranges must remain behind the same password gate as page images.
 */

const fs = require("fs");
const path = require("path");

const BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8080/api";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@misa.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeThisAdminPw123!";
const FIXTURE = path.resolve(__dirname, "../fixtures/pdf/sample_embedded_audio.pdf");
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS ?? 60_000);

let passed = 0;
let failed = 0;

function check(label, condition, extra) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed += 1;
  } else {
    console.error(`  FAIL: ${label}${extra ? ` -- ${JSON.stringify(extra)}` : ""}`);
    failed += 1;
  }
}

async function api(method, route, { token, tenantId, json, body, headers = {} } = {}) {
  const requestHeaders = { ...headers };
  if (token) requestHeaders.Authorization = `Bearer ${token}`;
  if (tenantId) requestHeaders["x-tenant-id"] = tenantId;
  let requestBody = body;
  if (json !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
    requestBody = JSON.stringify(json);
  }
  const response = await fetch(`${BASE}${route}`, { method, headers: requestHeaders, body: requestBody });
  let data = null;
  if ((response.headers.get("content-type") ?? "").includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      // Preserve malformed JSON as an observable response failure for the assertion.
    }
  }
  return { response, status: response.status, data };
}

async function waitForJob(jobId, token, tenantId) {
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const current = await api("GET", `/jobs/${jobId}`, { token, tenantId });
    if (current.data?.state === "done" || current.data?.state === "failed") return current.data;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  throw new Error(`Job ${jobId} did not finish before deadline.`);
}

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function main() {
  check("media fixture exists", fs.existsSync(FIXTURE), { fixture: FIXTURE });
  if (!fs.existsSync(FIXTURE)) process.exit(1);

  const suffix = uniqueSuffix();
  const admin = await api("POST", "/auth/login", { json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  const adminToken = admin.data?.accessToken;
  check("Admin login succeeds", !!adminToken, admin.data);
  if (!adminToken) process.exit(1);

  const tenant = await api("POST", "/admin/tenants", { token: adminToken, json: { name: `Media tenant ${suffix}` } });
  const tenantId = tenant.data?.id;
  check("Admin creates media test tenant", !!tenantId, tenant.data);
  const creatorEmail = `media-creator-${suffix}@test.local`;
  const user = await api("POST", "/admin/users", {
    token: adminToken,
    json: { email: creatorEmail, password: "MediaCreatorPass123!" },
  });
  check("Admin creates media test creator", !!user.data?.id, user.data);
  const membership = await api("POST", "/admin/memberships", {
    token: adminToken,
    json: { tenantId, userId: user.data?.id },
  });
  check("Creator receives tenant membership", membership.status < 300, membership.data);
  const creator = await api("POST", "/auth/login", { json: { email: creatorEmail, password: "MediaCreatorPass123!" } });
  const creatorToken = creator.data?.accessToken;
  check("Creator login succeeds", !!creatorToken, creator.data);

  const book = await api("POST", "/books", { token: creatorToken, tenantId, json: { title: `Embedded media ${suffix}` } });
  const bookId = book.data?.id;
  const permalink = bookId ? `${book.data.permalink_slug}-${book.data.permalink_suffix}` : null;
  check("Creator creates book", !!bookId && !!permalink, book.data);

  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(FIXTURE)], { type: "application/pdf" }), "embedded-audio.pdf");
  const upload = await api("POST", `/books/${bookId}/upload`, { token: creatorToken, tenantId, body: form });
  check("upload PDF with embedded WAV succeeds", upload.status < 300 && !!upload.data?.jobId, upload.data);
  const job = await waitForJob(upload.data?.jobId, creatorToken, tenantId);
  check("worker converts embedded media PDF successfully", job?.state === "done", job);
  const publish = await api("POST", `/books/${bookId}/publish`, {
    token: creatorToken,
    tenantId,
    json: { revisionId: upload.data?.revisionId },
  });
  check("media revision publishes", publish.status < 300, publish.data);

  const publicBook = await api("GET", `/public/books/${permalink}`);
  const media = publicBook.data?.pages?.[0]?.media?.[0];
  check(
    "public manifest exposes one mapped audio asset, never raw storage path",
    publicBook.status === 200 && media?.kind === "audio" && media?.contentType === "audio/wav" && typeof media?.mediaAssetId === "string" && !Object.hasOwn(media ?? {}, "path"),
    publicBook.data?.pages?.[0]
  );

  const range = await api("GET", `/public/books/${permalink}/assets/${media?.mediaAssetId}`, {
    headers: { Range: "bytes=0-15" },
  });
  const rangeBytes = Buffer.from(await range.response.arrayBuffer());
  check(
    "public media serves a correct 206 byte range",
    range.status === 206 && range.response.headers.get("content-type")?.startsWith("audio/wav") && range.response.headers.get("content-range")?.startsWith("bytes 0-15/") && rangeBytes.subarray(0, 4).equals(Buffer.from("RIFF")),
    { status: range.status, contentRange: range.response.headers.get("content-range"), bytes: rangeBytes.length }
  );
  const invalidRange = await api("GET", `/public/books/${permalink}/assets/${media?.mediaAssetId}`, {
    headers: { Range: "bytes=999999-" },
  });
  check(
    "media rejects an unsatisfiable byte range without returning content",
    invalidRange.status === 416 && invalidRange.response.headers.get("content-range")?.startsWith("bytes */"),
    { status: invalidRange.status, contentRange: invalidRange.response.headers.get("content-range") }
  );

  const password = "MediaGatePass123!";
  const protect = await api("PUT", `/books/${bookId}/settings`, { token: creatorToken, tenantId, json: { password } });
  check("Creator protects the book with a password", protect.status < 300, protect.data);
  const blocked = await api("GET", `/public/books/${permalink}/assets/${media?.mediaAssetId}`, { headers: { Range: "bytes=0-15" } });
  check("protected media cannot be ranged without a reader grant", blocked.status === 403, { status: blocked.status, data: blocked.data });
  const verified = await api("POST", `/public/books/${permalink}/verify-password`, { json: { password } });
  const granted = await api("GET", `/public/books/${permalink}/assets/${media?.mediaAssetId}`, {
    token: verified.data?.readerToken,
    headers: { Range: "bytes=-8" },
  });
  check(
    "password reader grant authorizes suffix ranges for media",
    verified.status < 300 && granted.status === 206 && (await granted.response.arrayBuffer()).byteLength === 8,
    { verify: verified.status, range: granted.status, contentRange: granted.response.headers.get("content-range") }
  );

  console.log(`\n=== PDF EMBEDDED MEDIA E2E: ${passed} PASS / ${failed} FAIL ===`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error("PDF EMBEDDED MEDIA E2E ERROR:", error);
  process.exit(1);
});
