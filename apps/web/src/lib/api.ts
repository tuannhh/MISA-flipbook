// Dashboard browser auth is an HttpOnly cookie through same-origin `/api`. Bearer
// remains available for API clients; this helper deliberately never stores a JWT.
import { COOKIE_SESSION_TOKEN, getCsrfToken } from "./auth";
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  status: number;
  // Than JSON goc tu loi (vd { passwordRequired: true } hoac { retryAfterSeconds }) -
  // de FE phan biet cac truong hop 403/429 cu the thay vi chi dua vao chuoi message.
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

interface RequestOpts {
  method?: string;
  body?: unknown;
  tenantId?: string | null;
  token?: string | null;
  isForm?: boolean;
}

export async function apiFetch<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.token && opts.token !== COOKIE_SESSION_TOKEN) headers["Authorization"] = `Bearer ${opts.token}`;
  if (opts.tenantId) headers["x-tenant-id"] = opts.tenantId;
  const method = opts.method ?? "GET";
  if (!["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) {
    const csrfToken = getCsrfToken();
    if (csrfToken) headers["x-csrf-token"] = csrfToken;
  }

  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    if (opts.isForm) {
      body = opts.body as FormData;
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
  }

  const res = await fetch(`${API_BASE}${path}`, { method, headers, body, credentials: "include" });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    let data: unknown;
    try {
      data = await res.json();
      const parsed = data as { message?: string | string[] };
      message = Array.isArray(parsed.message) ? parsed.message.join("; ") : parsed.message ?? message;
    } catch {
      // body khong phai JSON - giu message mac dinh
    }
    throw new ApiError(res.status, message, data);
  }
  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as T;
  }
  return undefined as T;
}

export function assetUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/**
 * CHI dung trong Server Component (vd generateMetadata) - code chay o server BEN
 * TRONG container Docker cua apps/web, khong the goi "localhost:3000" nhu trinh duyet
 * (do la port cua chinh container web, khong phai api - xem chu thich trong
 * infra/docker/docker-compose.yml tai service "web"). API_INTERNAL_BASE_URL la bien
 * moi truong RUNTIME rieng (khac NEXT_PUBLIC_API_BASE_URL duoc inline luc build cho
 * trinh duyet), tro thang toi service "api" qua Docker network noi bo.
 */
export function serverApiBase(): string {
  return process.env.API_INTERNAL_BASE_URL ?? API_BASE;
}
