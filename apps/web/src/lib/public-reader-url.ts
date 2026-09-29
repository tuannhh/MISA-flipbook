/**
 * Origin CONG KHAI dung cho link chia se / ma nhung. Dashboard chay tren mang noi bo MISA nen
 * window.location.origin la dia chi noi bo - nguoi ngoai khong mo duoc. NEXT_PUBLIC_PUBLIC_BASE_URL
 * (dat luc build web, vd https://flipbook.misa.vn) tro toi domain public-edge; trong = dung origin hien tai.
 */
export function publicOrigin(): string {
  const configured = (process.env.NEXT_PUBLIC_PUBLIC_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  return typeof window !== "undefined" ? window.location.origin : "";
}

/** Canonical public routes. Keep all share/embed builders on this utility. */
export function publicReaderPath(permalink: string): string {
  return `/${encodeURIComponent(permalink)}`;
}

export function publicEmbedPath(permalink: string): string {
  return `${publicReaderPath(permalink)}/embed`;
}

export function publicEmbedCode(permalink: string, origin: string): string {
  const src = new URL(publicEmbedPath(permalink), origin).toString();
  return `<iframe src="${src}" style="width:100%;aspect-ratio:16/9;border:0" allowfullscreen loading="lazy"></iframe>`;
}

export function canonicalReaderUrl(permalink: string, origin: string): string {
  return new URL(publicReaderPath(permalink), origin).toString();
}
