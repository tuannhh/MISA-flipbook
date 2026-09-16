"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch, ApiError, assetUrl } from "@/lib/api";
import type { PublicBook } from "@/lib/types";
import { FlipBook } from "@/components/FlipBook";

export default function PublicReaderPage() {
  const { permalink } = useParams<{ permalink: string }>();
  const [book, setBook] = useState<PublicBook | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<PublicBook>(`/public/books/${permalink}`)
      .then((b) => {
        setBook(b);
        if (typeof document !== "undefined") document.title = `${b.title} - MISA Flipbook`;
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Khong tai duoc sach."));
  }, [permalink]);

  if (error) {
    return (
      <div className="reader" style={{ alignItems: "center", justifyContent: "center", color: "#fff" }}>
        <p>{error}</p>
      </div>
    );
  }

  if (!book || book.pages.length === 0) {
    return (
      <div className="reader" style={{ alignItems: "center", justifyContent: "center", color: "#fff" }}>
        <p>Dang tai sach...</p>
      </div>
    );
  }

  return (
    <FlipBook
      title={book.title}
      pages={book.pages}
      imageUrl={(assetId) => assetUrl(`/public/books/${permalink}/assets/${assetId}`)}
    />
  );
}
