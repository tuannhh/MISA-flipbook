#!/usr/bin/env node
"use strict";

/**
 * Exercises the real public edge: /api prefix stripping, proxy security headers
 * and the one-hop trust-proxy rule used by login rate limiting. The client sends a
 * forged X-Forwarded-For value; Nginx must overwrite it, otherwise the next request
 * without that header would evade the account/source counter.
 */

const BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8080/api";
const LOGIN_MAX = Number(process.env.LOGIN_MAX_ATTEMPTS ?? 10);
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

async function login(email, extraHeaders = {}) {
  const response = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify({ email, password: "not-the-password" }),
  });
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

async function main() {
  const origin = new URL(BASE).origin;
  const health = await fetch(`${origin}/health`);
  check("proxy exposes API health without the /api prefix", health.status === 200, { status: health.status });
  check(
    "proxy sets nosniff at the public edge",
    health.headers.get("x-content-type-options") === "nosniff",
    { header: health.headers.get("x-content-type-options") }
  );
  check(
    "proxy strips reader query grants from cross-origin referrers",
    health.headers.get("referrer-policy") === "strict-origin-when-cross-origin",
    { header: health.headers.get("referrer-policy") }
  );

  const email = `proxy-xff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
  let last;
  for (let attempt = 0; attempt < LOGIN_MAX; attempt += 1) {
    last = await login(email, { "X-Forwarded-For": "203.0.113.99" });
  }
  check(`proxy route blocks the ${LOGIN_MAX}th bad login`, last.status === 429, last);

  const noSpoof = await login(email);
  check(
    "forged X-Forwarded-For cannot switch the trusted client source",
    noSpoof.status === 429,
    noSpoof
  );

  console.log(`\n=== PROXY SECURITY: ${passed} PASS / ${failed} FAIL ===`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error("PROXY SECURITY TEST ERROR:", error);
  process.exit(1);
});
