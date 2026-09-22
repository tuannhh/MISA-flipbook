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
