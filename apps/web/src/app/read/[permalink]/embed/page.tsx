"use client";
import { useParams } from "next/navigation";
import { PublicBookReader } from "@/components/PublicBookReader";

// F09: trang danh rieng cho iframe embed (Dashboard sinh code <iframe src=".../embed">).
// Dung chung PublicBookReader nen giu nguyen kiem tra mat khau/quyen tai nhu trang doc
// thuong - "khong lo noi dung qua duong embed rieng" la yeu cau ro trong PLAN.md F09.
export default function EmbedReaderPage() {
  const { permalink } = useParams<{ permalink: string }>();
  return <PublicBookReader permalink={permalink} embed />;
}
