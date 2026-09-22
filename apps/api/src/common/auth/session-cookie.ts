import { randomBytes, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";

/**
 * A Dashboard JWT is held in an HttpOnly same-origin cookie, never browser
 * storage. Bearer auth remains supported for API/CLI clients and integration
 * tests, but browser code deliberately uses this cookie path.
 */
export const DASHBOARD_SESSION_COOKIE = "misa_flipbook_session";
export const CSRF_COOKIE = "misa_flipbook_csrf";
export const CSRF_HEADER = "x-csrf-token";

export function readCookie(req: Pick<Request, "headers">, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const item of raw.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 1 || item.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(item.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function requestUsesSecureCookie(req: Request): boolean {
  // Production must set AUTH_COOKIE_SECURE=true. req.secure additionally makes
  // the safe choice when a correctly trusted TLS proxy reports HTTPS.
  return process.env.AUTH_COOKIE_SECURE === "true" || req.secure;
}

export function issueBrowserSession(res: Response, req: Request, jwt: string): void {
  const secure = requestUsesSecureCookie(req);
  res.cookie(DASHBOARD_SESSION_COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/api",
    maxAge: Number(process.env.JWT_EXPIRES_IN_SECONDS ?? 8 * 60 * 60) * 1000,
  });
  res.cookie(CSRF_COOKIE, randomBytes(32).toString("base64url"), {
    httpOnly: false,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: Number(process.env.JWT_EXPIRES_IN_SECONDS ?? 8 * 60 * 60) * 1000,
  });
}

export function clearBrowserSession(res: Response, req: Request): void {
  const secure = requestUsesSecureCookie(req);
  res.clearCookie(DASHBOARD_SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure, path: "/api" });
  res.clearCookie(CSRF_COOKIE, { httpOnly: false, sameSite: "lax", secure, path: "/" });
}

export function csrfTokensMatch(expected: string | undefined, supplied: string | undefined): boolean {
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}