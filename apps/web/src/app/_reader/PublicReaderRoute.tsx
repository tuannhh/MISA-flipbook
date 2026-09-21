import type { Metadata } from "next";
import { assetUrl, serverApiBase } from "@/lib/api";
import { PublicBookReader } from "@/components/PublicBookReader";

interface PublicReaderMetadata {
  title: string;
  hasPreviewImage: boolean;
}

export async function publicReaderMetadata(permalink: string): Promise<Metadata> {
  try {
    const response = await fetch(`${serverApiBase()}/public/books/${encodeURIComponent(permalink)}/metadata`, {
      cache: "no-store",
    });
    if (!response.ok) return { title: "MISA Flipbook" };
    const meta = (await response.json()) as PublicReaderMetadata;
    if (meta.title === "MISA Flipbook") return { title: meta.title };
    const description = `Doc "${meta.title}" duoi dang flipbook truc tuyen tren MISA Flipbook.`;
    const image = meta.hasPreviewImage ? assetUrl(`/public/books/${encodeURIComponent(permalink)}/preview-image`) : undefined;
    return {
      title: `${meta.title} - MISA Flipbook`,
      description,
      openGraph: { title: meta.title, description, type: "article", images: image ? [{ url: image }] : undefined },
    };
  } catch {
    return { title: "MISA Flipbook" };
  }
}

export function PublicReaderRoute({ permalink, embed = false, initialPage }: { permalink: string; embed?: boolean; initialPage?: number }) {
  return <PublicBookReader permalink={permalink} embed={embed} initialPage={initialPage} />;
}
