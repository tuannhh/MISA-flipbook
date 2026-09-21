#!/usr/bin/env node
"use strict";

/**
 * Security regression: when Redis is unavailable, rate limiting must still block
 * repeated login attempts. This exercises the HTTP API over the real Docker network;
 * no Redis or service method is mocked.
 *
 * The test intentionally runs with Redis stopped by CI/the reviewer. A per-account
 * fallback protects a targeted account; a separate source counter blocks spraying
 * attempts over many email addresses. A successful login resets both counters.
 */

const BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:3000";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@misa.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeThisAdminPw123!";
const ACCOUNT_MAX = Number(process.env.LOGIN_MAX_ATTEMPTS ?? 10);
const SOURCE_MAX = Number(process.env.LOGIN_IP_MAX_ATTEMPTS ?? 30);

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

async function login(email, password) {
  const response = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { status: response.status, data };
}

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@rate-limit.invalid`;
}

async function main() {
  console.log(`API_BASE_URL = ${BASE}; Redis is expected to be unavailable.`);

  const targetedEmail = uniqueEmail("target");
  let targetedLast;
  for (let i = 0; i < ACCOUNT_MAX; i += 1) {
    targetedLast = await login(targetedEmail, `incorrect-${i}`);
  }
  check(`fallback blocks the ${ACCOUNT_MAX}th failed attempt for one account`, targetedLast.status === 429, targetedLast);

  const validLogin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  check("valid login remains available before source-wide limit and clears its counters", !!validLogin.data?.accessToken, validLogin);

  let sprayLast;
  for (let i = 0; i < SOURCE_MAX; i += 1) {
    sprayLast = await login(uniqueEmail(`spray-${i}`), "incorrect");
  }
  check(`fallback blocks the ${SOURCE_MAX}th sprayed login from one source`, sprayLast.status === 429, sprayLast);

  console.log(`\n=== RATE LIMIT FALLBACK: ${passed} PASS / ${failed} FAIL ===`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error("RATE LIMIT FALLBACK TEST ERROR:", error);
  process.exit(1);
});
