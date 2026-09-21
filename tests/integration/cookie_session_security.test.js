#!/usr/bin/env node
"use strict";

/**
 * Real HTTP release check for the Dashboard HttpOnly-cookie session. Run through
 * the Nginx edge, not a mocked Nest application:
 *   API_BASE_URL=http://127.0.0.1:13000 \
 *   SEED_ADMIN_EMAIL=review-admin@misa.local SEED_ADMIN_PASSWORD=... \
 *   node tests/integration/cookie_session_security.test.js
 */

const BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8080";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@misa.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeThisAdminPw123!";
const TRUSTED_ORIGIN = process.env.CORS_ORIGIN ?? "http://127.0.0.1:13000";
let passed = 0;
let failed = 0;

function check(label, condition, extra) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed += 1;
  } else {
    console.error(`  FAIL: ${label}${extra === undefined ? "" : ` -- ${JSON.stringify(extra)}`}`);
    failed += 1;
  }
}

function setCookies(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const raw = headers.get("set-cookie");
  return raw ? [raw] : [];
}

function cookiePair(cookies, name) {
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));
  return cookie?.split(";", 1)[0];
}

function cookieValue(pair) {
  return pair?.slice(pair.indexOf("=") + 1);
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, options);
  let data = null;
  try {
    data = await response.json();
  } catch {
    // Response may be empty (for example a CORS preflight).
  }
  return { response, data, cookies: setCookies(response.headers) };
}

async function main() {
  console.log(`API_BASE_URL = ${BASE}`);
  const login = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const legacyToken = login.data?.accessToken;
  const session = cookiePair(login.cookies, "misa_flipbook_session");
  const csrf = cookiePair(login.cookies, "misa_flipbook_csrf");
  check("login returns compatibility bearer token", Boolean(legacyToken), login.data);
  check("login emits HttpOnly Dashboard session cookie", Boolean(session) && login.cookies.some((value) => /^misa_flipbook_session=/.test(value) && /HttpOnly/i.test(value) && /SameSite=Lax/i.test(value) && /Path=\/api/i.test(value)), login.cookies);
  check("login emits readable CSRF cookie separately", Boolean(csrf) && login.cookies.some((value) => /^misa_flipbook_csrf=/.test(value) && !/HttpOnly/i.test(value) && /SameSite=Lax/i.test(value) && /Path=\//i.test(value)), login.cookies);
  check("login response cannot be cached", login.response.headers.get("cache-control") === "private, no-store", login.response.headers.get("cache-control"));

  const cookie = [session, csrf].filter(Boolean).join("; ");
  const me = await request("/api/me", { headers: { cookie } });
  check("GET /me accepts the HttpOnly session cookie", me.response.status === 200 && me.data?.isSystemAdmin === true, me.data);

  const denied = await request("/api/admin/tenants", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: `CSRF blocked ${Date.now()}` }),
  });
  check("cookie-authenticated write without CSRF header is rejected", denied.response.status === 403, denied.data);

  const allowed = await request("/api/admin/tenants", {
    method: "POST",
    headers: { cookie, "content-type": "application/json", "x-csrf-token": cookieValue(csrf) },
    body: JSON.stringify({ name: `CSRF allowed ${Date.now()}` }),
  });
  check("cookie-authenticated write with matching CSRF header is accepted", allowed.response.status === 201 && Boolean(allowed.data?.id), allowed.data);

  const bearerMe = await request("/api/me", { headers: { authorization: `Bearer ${legacyToken}` } });
  check("existing bearer API clients remain compatible", bearerMe.response.status === 200, bearerMe.data);

  const trustedPreflight = await fetch(`${BASE}/api/admin/tenants`, {
    method: "OPTIONS",
    headers: {
      origin: TRUSTED_ORIGIN,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type,x-csrf-token",
    },
  });
  check("trusted CORS origin receives credentialed preflight", trustedPreflight.headers.get("access-control-allow-origin") === TRUSTED_ORIGIN && trustedPreflight.headers.get("access-control-allow-credentials") === "true", {
    origin: trustedPreflight.headers.get("access-control-allow-origin"),
    credentials: trustedPreflight.headers.get("access-control-allow-credentials"),
  });

  const untrustedPreflight = await fetch(`${BASE}/api/admin/tenants`, {
    method: "OPTIONS",
    headers: {
      origin: "https://evil.example",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type,x-csrf-token",
    },
  });
  check("untrusted origin receives no CORS grant", !untrustedPreflight.headers.get("access-control-allow-origin"), untrustedPreflight.headers.get("access-control-allow-origin"));

  const logout = await request("/api/auth/logout", {
    method: "POST",
    headers: { cookie, "x-csrf-token": cookieValue(csrf) },
  });
  check("logout clears the browser session", logout.response.status === 201 && logout.cookies.some((value) => /^misa_flipbook_session=;/.test(value)), logout.cookies);
  check("logout response cannot be cached", logout.response.headers.get("cache-control") === "private, no-store", logout.response.headers.get("cache-control"));

  const afterLogout = await request("/api/me");
  check("a request without cookie or bearer is unauthorized", afterLogout.response.status === 401, afterLogout.data);

  console.log(`\n=== COOKIE / CSRF / CORS: ${passed} PASS / ${failed} FAIL ===`);
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error("COOKIE SESSION TEST ERROR:", error);
  process.exit(1);
});