// Dashboard auth is stored in an HttpOnly cookie issued by the same-origin API.
// This module keeps only non-secret UI state in sessionStorage. The sentinel tells
// apiFetch to use credentials without accidentally emitting a fake Bearer header.
export const COOKIE_SESSION_TOKEN = "__misa_cookie_session__";
const SESSION_MARKER_KEY = "misa_flipbook_session_marker";
const TENANT_KEY = "misa_flipbook_tenant_id";
const IS_ADMIN_KEY = "misa_flipbook_is_admin";
const LEGACY_TOKEN_KEY = "misa_flipbook_token";

function storage(): Storage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

export function getToken(): string | null {
  const value = storage()?.getItem(SESSION_MARKER_KEY);
  return value === "1" ? COOKIE_SESSION_TOKEN : null;
}

/** Marks an already-issued browser cookie; it deliberately never stores `token`. */
export function setToken(): void {
  storage()?.setItem(SESSION_MARKER_KEY, "1");
  // Remove a dashboard JWT left by an older build as soon as a user logs in again.
  if (typeof window !== "undefined") window.localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export function getTenantId(): string | null {
  return storage()?.getItem(TENANT_KEY) ?? null;
}

export function setTenantId(id: string): void {
  storage()?.setItem(TENANT_KEY, id);
}

export function getIsAdmin(): boolean {
  return storage()?.getItem(IS_ADMIN_KEY) === "1";
}

export function setIsAdmin(value: boolean): void {
  const current = storage();
  if (value) current?.setItem(IS_ADMIN_KEY, "1");
  else current?.removeItem(IS_ADMIN_KEY);
}

export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = "misa_flipbook_csrf=";
  for (const item of document.cookie.split(";")) {
    const trimmed = item.trim();
    if (!trimmed.startsWith(prefix)) continue;
    try {
      return decodeURIComponent(trimmed.slice(prefix.length));
    } catch {
      return null;
    }
  }
  return null;
}

export function clearSession(): void {
  const current = storage();
  current?.removeItem(SESSION_MARKER_KEY);
  current?.removeItem(TENANT_KEY);
  current?.removeItem(IS_ADMIN_KEY);
  if (typeof window !== "undefined") window.localStorage.removeItem(LEGACY_TOKEN_KEY);
}