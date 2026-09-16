"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch, ApiError, assetUrl } from "@/lib/api";
import type { PublicBook } from "@/lib/types";

const SWIPE_THRESHOLD_PX = 50;

export default function PublicReaderPage() {
  const { permalink } = useParams<{ permalink: string }>();
  const [book, setBook] = useState<PublicBook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<PublicBook>(`/public/books/${permalink}`)
      .then((b) => {
        setBook(b);
        if (typeof document !== "undefined") document.title = `${b.title} - MISA Flipbook`;
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Khong tai duoc sach."));
  }, [permalink]);

  const goTo = useCallback(
    (next: number) => {
      if (!book) return;
      const clamped = Math.max(0, Math.min(book.pages.length - 1, next));
      setIndex(clamped);
    },
    [book]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") goTo(index + 1);
      if (e.key === "ArrowLeft") goTo(index - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, goTo]);

  const currentPage = useMemo(() => book?.pages[index] ?? null, [book, index]);

  if (error) {
    return (
      <div className="reader" style={{ alignItems: "center", justifyContent: "center", color: "#fff" }}>
        <p>{error}</p>
      </div>
    );
  }

  if (!book || !currentPage) {
    return (
      <div className="reader" style={{ alignItems: "center", justifyContent: "center", color: "#fff" }}>
        <p>Dang tai sach...</p>
      </div>
    );
  }

  return (
    <div className="reader">
      <div className="reader-top">
        <span>{book.title}</span>
        <span>
          Trang {currentPage.page} / {book.pages.length}
        </span>
      </div>
      <div
        className="reader-stage"
        onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchStartX === null) return;
          const dx = e.changedTouches[0].clientX - touchStartX;
          if (dx > SWIPE_THRESHOLD_PX) goTo(index - 1);
          else if (dx < -SWIPE_THRESHOLD_PX) goTo(index + 1);
          setTouchStartX(null);
        }}
      >
        {index > 0 && (
          <div className="nav-zone left" onClick={() => goTo(index - 1)} aria-label="Trang truoc">
            &#8249;
          </div>
        )}
        {currentPage.imageAssetId && (
          <img
            key={currentPage.page}
            src={assetUrl(`/public/books/${permalink}/assets/${currentPage.imageAssetId}`)}
            alt={`Trang ${currentPage.page}`}
            style={{
              transform: currentPage.rotation ? `rotate(${currentPage.rotation}deg)` : undefined,
            }}
          />
        )}
        {index < book.pages.length - 1 && (
          <div className="nav-zone right" onClick={() => goTo(index + 1)} aria-label="Trang sau">
            &#8250;
          </div>
        )}
      </div>
      <div className="reader-bottom">
        Vuot trai/phai hoac dung phim mui ten de lat trang &middot; MISA Flipbook
      </div>
    </div>
  );
}
