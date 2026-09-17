// Luu token/tenant o localStorage cua trinh duyet (rieng cho FE nay, khong chia
// se voi BE qua cookie/session) - FE la SPA thuan tuy goi API bang Bearer token.
const TOKEN_KEY = "misa_flipbook_token";
const TENANT_KEY = "misa_flipbook_tenant_id";
// F13: co "la Admin he thong" - chi la tien ich hien/an dieu huong o FE, KHONG phai
// nguon xac thuc (moi endpoint /admin/* van tu assertAdmin() lai o BE qua JWT+DB).
const IS_ADMIN_KEY = "misa_flipbook_is_admin";

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

export function getIsAdmin(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(IS_ADMIN_KEY) === "1";
}

export function setIsAdmin(value: boolean): void {
  window.localStorage.setItem(IS_ADMIN_KEY, value ? "1" : "0");
}

export function clearSession(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(TENANT_KEY);
  window.localStorage.removeItem(IS_ADMIN_KEY);
}
