import type { Metadata } from "next";
import { assetUrl, serverApiBase } from "@/lib/api";
import type { PublicBook } from "@/lib/types";
import { PublicBookReader } from "@/components/PublicBookReader";

interface RouteParams {
  params: Promise<{ permalink: string }>;
}

/**
 * F08 (PLAN.md muc 5): "Metadata Open Graph duoc render server-side de bot doc duoc".
 * Server Component (khong "use client") de generateMetadata chay tren server that -
 * bot mang xa hoi doc <head> tra ve tu HTML dau tien, khong doi JS client chay.
 *
 * fetch() o day dung serverApiBase() (Docker network noi bo toi service "api"), KHAC
 * voi assetUrl() dung trong gia tri og:image (phai la URL cong khai qua internet cho
 * bot fetch duoc anh, khong phai hostname noi bo).
 *
 * Sach co mat khau: public_get_book/getAuthorizedBook (BE) tra ve 403, fetch o day
 * that bai -> roi ve tieu de chung "MISA Flipbook" - dung y PLAN.md "mac dinh hien thi
 * ten ung dung/anh chung" cho sach co mat khau, KHONG lo tieu de/thumbnail that.
 * (Chua lam: co che Creator chu dong "cho phep lo tieu de" rieng cho sach co mat khau
 * qua book_settings.public_preview - cot nay da co san trong schema tu P1 nhung CHUA
 * duoc dung o dau, ghi ro trong MEMORYBANK.md la gioi han con mo.)
 */
async function fetchPublicBookForMeta(permalink: string): Promise<PublicBook | null> {
  try {
    const res = await fetch(`${serverApiBase()}/public/books/${permalink}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as PublicBook;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { permalink } = await params;
  const book = await fetchPublicBookForMeta(permalink);
  if (!book) {
    return { title: "MISA Flipbook" };
  }
  const thumbAssetId = book.pages[0]?.thumbAssetId;
  const ogImage = thumbAssetId ? assetUrl(`/public/books/${permalink}/assets/${thumbAssetId}`) : undefined;
  return {
    title: `${book.title} - MISA Flipbook`,
    description: `Doc "${book.title}" duoi dang flipbook truc tuyen tren MISA Flipbook.`,
    openGraph: {
      title: book.title,
      description: `Doc "${book.title}" duoi dang flipbook truc tuyen tren MISA Flipbook.`,
      type: "article",
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
  };
}

export default async function PublicReaderPage({ params }: RouteParams) {
  const { permalink } = await params;
  return <PublicBookReader permalink={permalink} />;
}
