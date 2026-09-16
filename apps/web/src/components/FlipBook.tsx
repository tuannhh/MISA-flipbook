"use client";
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import HTMLFlipBook from "react-pageflip";
import type { ReaderPage } from "@/lib/types";
import { useSimpleReaderMode } from "@/lib/useSimpleReaderMode";

/**
 * Reader dung react-pageflip (bao StPageFlip, MIT license - xem MEMORYBANK.md muc
 * "Sua ADR-P2-flip": ban dau du an tu choi "turn.js/react-pageflip" chung mot nhom
 * vi ly do license, nhung StPageFlip/react-pageflip THAT SU la MIT (dung thuong mai
 * duoc), khac voi turn.js (license thuong mai rieng) - da xac minh lai license truoc
 * khi doi. Ly do doi: hieu ung CSS 3D tu viet truoc day (rotateY phang + shade tinh)
 * khong dat do "cong/mem nhu giay that + bong do dong" nguoi dung yeu cau (doi chieu
 * Heyzine), va co 1 loi thuc te: co che "doi rAF kep" de kich hoat CSS transition bi
 * dung/nhay cung khi rAF khong chay dung nhip (dung nhu da ghi trong MEMORYBANK.md
 * ve gioi han cong cu trinh duyet tu dong) - StPageFlip tu quan ly animation bang
 * requestAnimationFrame loop rieng, khong phu thuoc React transition timing, on dinh
 * hon nhieu.
 *
 * Mo hinh trang: showCover=true nen trang dau/cuoi la "hard page" don, giua la spread
 * 2 trang - dung PLAN.md muc 4 ("bia dau/cuoi xu ly rieng"). Kich thuoc sach (width/
 * height) lay theo ty le trang HIEN TAI (PDF co the co trang lech ty le/xoay - anh
 * tung trang van giu dung ty le rieng qua object-fit:contain + rotate trong o vuong
 * chung, khong keo meo).
 */

const SPREAD_MIN_WIDTH = 900; // PLAN.md: "Desktop du rong mo spread hai trang"
const BASE_UNIT = 600; // don vi tinh ty le, khong phai px that (size="stretch" se scale)

interface PageProps {
  imageUrl: string | null;
  rotation?: number;
  alt: string;
}

const Page = forwardRef<HTMLDivElement, PageProps>(function Page({ imageUrl, rotation, alt }, ref) {
  return (
    <div className="flipbook-page" ref={ref}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={alt}
          draggable={false}
          style={{ transform: rotation ? `rotate(${rotation}deg)` : undefined }}
        />
      ) : (
        <div className="flipbook-blank" aria-hidden />
      )}
    </div>
  );
});

// Kieu tra ve cua pageFlip() (react-pageflip khong export type PageFlip rieng qua
// entrypoint chinh) - chi khai bao dung phan phuong thuc thuc su dung toi.
interface PageFlipApi {
  flipNext(): void;
  flipPrev(): void;
}

export function FlipBook({
  title,
  pages,
  imageUrl,
}: {
  title: string;
  pages: ReaderPage[];
  imageUrl: (assetId: string) => string;
}) {
  const { simple, reducedMotion } = useSimpleReaderMode();
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<{ pageFlip(): PageFlipApi } | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pageImg = useCallback((p: ReaderPage) => (p.imageAssetId ? imageUrl(p.imageAssetId) : null), [imageUrl]);

  const pageAspect = pages[0] && pages[0].heightPt > 0 ? pages[0].widthPt / pages[0].heightPt : 0.75;
  const width = BASE_UNIT;
  const height = Math.round(BASE_UNIT / pageAspect);

  // Tu dong 1/2 trang theo be rong khung (PLAN.md muc 4). Da thu them nut ep tay
  // "1 trang/2 trang" cho khoang tablet qua minWidth/maxWidth cua react-pageflip
  // (xem node_modules/page-flip/dist/js de biet co che that: size="stretch" quyet
  // dinh portrait/landscape qua "e<2*minWidth" roi "e<2*h" voi h bi tran boi maxWidth
  // va chieu cao khung) nhung minWidth cung la SAN CUNG cho kich thuoc render that -
  // ep minWidth=be rong khung lam trang bi phong to vo layout (da tu kiem thu thay
  // hong, khong phai suy doan). Bo nut ep tay, chi giu hanh vi tu dong on dinh; ghi
  // lai trong MEMORYBANK.md la gioi han con mo, chua lam duoc theo dung yeu cau.
  const isSpreadCapable = containerWidth >= SPREAD_MIN_WIDTH && pages.length > 2;

  const flippingTime = simple ? 1 : 700;

  const goNext = useCallback(() => bookRef.current?.pageFlip().flipNext(), []);
  const goPrev = useCallback(() => bookRef.current?.pageFlip().flipPrev(), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev]);

  const onFlip = useCallback((e: { data: number }) => setCurrentIndex(e.data), []);

  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < pages.length - 1;
  const currentPage = pages[currentIndex] ?? pages[0];
  const rightPage = isSpreadCapable ? pages[currentIndex + 1] : null;
  const pageLabel =
    isSpreadCapable && rightPage && currentIndex > 0 && currentIndex < pages.length - 1
      ? `Trang ${currentPage?.page}-${rightPage.page} / ${pages.length}`
      : `Trang ${currentPage?.page ?? "-"} / ${pages.length}`;

  return (
    <div className="reader">
      <div className="reader-top">
        <span>{title}</span>
        <span>{pageLabel}</span>
      </div>

      <div className="reader-stage flipbook-stage" ref={containerRef}>
        {containerWidth > 0 && pages.length > 0 && (
          <>
            {canGoPrev && (
              <button type="button" className="nav-zone left" onClick={goPrev} aria-label="Trang truoc">
                &#8249;
              </button>
            )}
            {canGoNext && (
              <button type="button" className="nav-zone right" onClick={goNext} aria-label="Trang sau">
                &#8250;
              </button>
            )}
            <HTMLFlipBook
              // StPageFlip khong tu doi portrait/landscape khi prop usePortrait doi sau
              // khi da mount (chi doc luc khoi tao/resize noi bo) - remount hoan toan
              // khi so trang HOAC che do spread hieu luc thay doi de ap dung dung
              // usePortrait; startPage giu nguyen vi tri dang doc qua lan remount.
              key={`${pages.length}-${isSpreadCapable}`}
              ref={bookRef as never}
              width={width}
              height={height}
              size="stretch"
              minWidth={200}
              maxWidth={2200}
              minHeight={Math.round(200 / pageAspect)}
              maxHeight={Math.round(2200 / pageAspect)}
              maxShadowOpacity={0.5}
              showCover
              usePortrait={!isSpreadCapable}
              mobileScrollSupport={false}
              swipeDistance={20}
              clickEventForward
              useMouseEvents={!simple}
              showPageCorners
              disableFlipByClick={false}
              flippingTime={flippingTime}
              startPage={currentIndex}
              startZIndex={0}
              autoSize
              drawShadow
              renderOnlyPageLengthChange={false}
              className="flipbook-book"
              style={{}}
              onFlip={onFlip}
            >
              {pages.map((p) => (
                <Page key={p.page} imageUrl={pageImg(p)} rotation={p.rotation} alt={`Trang ${p.page}`} />
              ))}
            </HTMLFlipBook>
          </>
        )}
      </div>

      <div className="reader-bottom">
        {simple
          ? "Dung nut mui ten hoac bam hai ben de chuyen trang (che do don gian)"
          : "Keo, vuot hoac dung phim mui ten de lat trang · MISA Flipbook"}
        {reducedMotion ? " · da tat hieu ung theo cai dat thiet bi" : ""}
      </div>
    </div>
  );
}
