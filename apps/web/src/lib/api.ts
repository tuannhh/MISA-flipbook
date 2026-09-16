// FE goi BE (apps/api) THUAN TUY qua HTTP/JSON voi Bearer JWT - khong SSR-proxy,
// khong session/cookie chia se giua 2 app (yeu cau "tach rieng FE va BE").
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
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
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  if (opts.tenantId) headers["x-tenant-id"] = opts.tenantId;

  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    if (opts.isForm) {
      body = opts.body as FormData;
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
  }

  const res = await fetch(`${API_BASE}${path}`, { method: opts.method ?? "GET", headers, body });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      message = Array.isArray(data.message) ? data.message.join("; ") : data.message ?? message;
    } catch {
      // body khong phai JSON - giu message mac dinh
    }
    throw new ApiError(res.status, message);
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
