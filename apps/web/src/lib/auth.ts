// Luu token/tenant o localStorage cua trinh duyet (rieng cho FE nay, khong chia
// se voi BE qua cookie/session) - FE la SPA thuan tuy goi API bang Bearer token.
const TOKEN_KEY = "misa_flipbook_token";
const TENANT_KEY = "misa_flipbook_tenant_id";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function getTenantId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TENANT_KEY);
}

export function setTenantId(id: string): void {
  window.localStorage.setItem(TENANT_KEY, id);
}

export function clearSession(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(TENANT_KEY);
}
