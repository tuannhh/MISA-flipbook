"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, TransitionEvent as ReactTransitionEvent } from "react";
import type { ReaderPage } from "@/lib/types";
import { useSimpleReaderMode } from "@/lib/useSimpleReaderMode";

/**
 * Reader voi hieu ung lat trang 3D that (khong phai slideshow/crossfade).
 *
 * Mo hinh vat ly duoc chon (ghi lai de doi sau khong phai doan lai tu dau):
 * - Mobile (mot trang): moi trang la 1 "la" ban le tai canh TRAI, giong nhu so
 *   xoay/lich de ban - lat toi rotateY 0->-180, lat lui rotateY 0->+180. Don gian,
 *   nhat quan ca 2 chieu, khong can lop "static-under" rieng vi mat sau cua la
 *   chinh la trang dich, nam dung vi tri no vua roi khoi.
 * - Desktop/tablet (spread 2 trang): trang phai lat quanh gay sach (canh trai cua
 *   no) khi lat toi, trang trai lat quanh gay sach (canh phai) khi lat lui - dung
 *   mo hinh sach that, mat sau cua la la trang moi xuat hien o phia doi dien.
 * - Bia truoc/bia sau (mot trang dung rieng theo PLAN.md muc 4) la truong hop bien:
 *   la phu tron ca 2 slot khi mo bia ra, va DON GIAN HOA mat sau thanh "giay lot"
 *   (khong co anh that) khi gap tu spread dong lai bia - tranh hien anh sai ty le
 *   luc la chi rong bang 1 nua nhung dich lai la trang bia rong day du. Day la
 *   don gian hoa co chu dich, ghi ro o day va trong MEMORYBANK.md, khong phai loi.
 *
 * Khong dung thu vien ngoai (turn.js/react-pageflip) - tu build bang CSS 3D transform
 * thuan de kiem soat license (du an da tu choi PyMuPDF vi AGPL o P0, giu tinh than
 * do voi FE) va de hieu/sua duoc toan bo logic.
 */

const SPREAD_MIN_WIDTH = 900; // PLAN.md: "Desktop du rong mo spread hai trang"
const TOGGLE_MIN_WIDTH = 640; // PLAN.md: "tablet co chon 1/2 trang theo chieu rong thuc te"
const DEAD_ZONE_PX = 6;
const DRAG_SETTLE_MS = 340;
const PROGRAMMATIC_FLIP_MS = 600;
// Ease-out mem (khong phai "material standard" cu, giam cam giac may moc/cung):
// tang toc rat nhanh luc dau roi giam toc dan deu, khong co doan giua tuyen tinh.
const FLIP_EASING = "cubic-bezier(0.22, 0.61, 0.36, 1)";

/** requestAnimationFrame nhung co setTimeout du phong - rAF khong dam bao chay neu
 * pane/tab khong duoc trinh duyet ve (production: minimize, chuyen tab; da tu gap
 * khi kiem thu qua browser tool tu dong), con setTimeout thi luon chay. */
function nextPaint(cb: () => void) {
  let done = false;
  const fire = () => {
    if (done) return;
    done = true;
    cb();
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(fire);
  setTimeout(fire, 32);
}

type Spread = { kind: "single"; page: ReaderPage } | { kind: "pair"; left: ReaderPage; right: ReaderPage };

function computeSpreads(pages: ReaderPage[]): Spread[] {
  if (pages.length === 0) return [];
  const spreads: Spread[] = [{ kind: "single", page: pages[0] }];
  let i = 1;
  while (i < pages.length) {
    if (i === pages.length - 1) {
      spreads.push({ kind: "single", page: pages[i] });
      i += 1;
    } else {
      spreads.push({ kind: "pair", left: pages[i], right: pages[i + 1] });
      i += 2;
    }
  }
  return spreads;
}

type Dir = -1 | 1; // -1 = lat toi (next), 1 = lat lui (prev)

interface FlightPlan {
  dir: Dir;
  leafSlot: "left" | "right" | "full";
  originSide: "left" | "right";
  frontUrl: string | null;
  backUrl: string | null; // null = dung "giay lot" don gian hoa (bia) thay vi anh that
  staticLeftUrl: string | null;
  staticRightUrl: string | null;
  targetPageNumber: number;
  leafWidthPx: number;
}

interface Flight extends FlightPlan {
  progress: number; // 0..1
  animated: boolean;
  pendingCommit: boolean;
  durationMs: number;
}

interface Size {
  w: number;
  h: number;
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
  const [containerSize, setContainerSize] = useState<Size>({ w: 0, h: 0 });
  const [viewOverride, setViewOverride] = useState<"auto" | "single" | "spread">("auto");
  const [currentPageNumber, setCurrentPageNumber] = useState(pages[0]?.page ?? 1);
  const [flight, setFlight] = useState<Flight | null>(null);
  const flightRef = useRef<Flight | null>(null);
  const dragOriginXRef = useRef<number | null>(null);

  const spreads = useMemo(() => computeSpreads(pages), [pages]);
  const pageNumToIndex = useMemo(() => new Map(pages.map((p, i) => [p.page, i])), [pages]);
  const hasAnyPair = spreads.some((s) => s.kind === "pair");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const mode: "single" | "spread" =
    viewOverride === "single" ? "single" : viewOverride === "spread" ? "spread" : containerSize.w >= SPREAD_MIN_WIDTH && hasAnyPair ? "spread" : "single";

  const pageImg = useCallback((p: ReaderPage | null | undefined) => (p?.imageAssetId ? imageUrl(p.imageAssetId) : null), [imageUrl]);

  const spreadOfPage = useCallback(
    (pageNumber: number): { spread: Spread; index: number } | null => {
      for (let idx = 0; idx < spreads.length; idx += 1) {
        const s = spreads[idx];
        if (s.kind === "single" ? s.page.page === pageNumber : s.left.page === pageNumber || s.right.page === pageNumber) {
          return { spread: s, index: idx };
        }
      }
      return null;
    },
    [spreads]
  );

  const currentIndex = pageNumToIndex.get(currentPageNumber) ?? 0;
  const currentPage = pages[currentIndex] ?? null;

  // Kich thuoc "to sach" (sheet) vua khung, giu dung ty le trang - tu tinh bang JS
  // (khong dua vao object-fit cua <img>) vi can biet chinh xac be rong 1 slot de
  // tinh progress keo/tha.
  const pageAspect = currentPage && currentPage.heightPt > 0 ? currentPage.widthPt / currentPage.heightPt : 0.75;
  const contentAspect = mode === "spread" ? pageAspect * 2 : pageAspect;
  let sheetW = containerSize.w;
  let sheetH = containerSize.w / (contentAspect || 0.75);
  if (contentAspect > 0 && sheetH > containerSize.h && containerSize.h > 0) {
    sheetH = containerSize.h;
    sheetW = sheetH * contentAspect;
  }
  const slotW = mode === "spread" ? sheetW / 2 : sheetW;

  const startFlight = useCallback(
    (dir: Dir): FlightPlan | null => {
      if (mode === "single") {
        const targetIdx = currentIndex - dir;
        if (targetIdx < 0 || targetIdx >= pages.length) return null;
        const tgt = pages[targetIdx];
        return {
          dir,
          leafSlot: "full",
          originSide: "left",
          frontUrl: pageImg(currentPage),
          backUrl: pageImg(tgt),
          staticLeftUrl: null,
          staticRightUrl: null,
          targetPageNumber: tgt.page,
          leafWidthPx: sheetW,
        };
      }

      const found = spreadOfPage(currentPageNumber);
      if (!found) return null;
      const { spread: curSpread, index: curIdx } = found;
      const tgtIdx = curIdx - dir;
      if (tgtIdx < 0 || tgtIdx >= spreads.length) return null;
      const tgtSpread = spreads[tgtIdx];

      if (curSpread.kind === "pair" && tgtSpread.kind === "pair") {
        if (dir === -1) {
          return {
            dir,
            leafSlot: "right",
            originSide: "left",
            frontUrl: pageImg(curSpread.right),
            backUrl: pageImg(tgtSpread.left),
            staticLeftUrl: pageImg(curSpread.left),
            staticRightUrl: pageImg(tgtSpread.right),
            targetPageNumber: tgtSpread.left.page,
            leafWidthPx: slotW,
          };
        }
        return {
          dir,
          leafSlot: "left",
          originSide: "right",
          frontUrl: pageImg(curSpread.left),
          backUrl: pageImg(tgtSpread.right),
          staticLeftUrl: pageImg(tgtSpread.left),
          staticRightUrl: pageImg(curSpread.right),
          targetPageNumber: tgtSpread.left.page,
          leafWidthPx: slotW,
        };
      }

      if (curSpread.kind === "single") {
        // Dang o bia, mo ra spread ben canh - la phu tron ca 2 slot.
        const pair = tgtSpread as Extract<Spread, { kind: "pair" }>;
        return {
          dir,
          leafSlot: "full",
          originSide: dir === -1 ? "left" : "right",
          frontUrl: pageImg(curSpread.page),
          backUrl: null,
          staticLeftUrl: pageImg(pair.left),
          staticRightUrl: pageImg(pair.right),
          targetPageNumber: pair.left.page,
          leafWidthPx: sheetW,
        };
      }

      // curSpread la pair, tgtSpread la bia (single) - leaf chi 1 nua, don gian hoa mat sau.
      const pair = curSpread;
      const single = tgtSpread as Extract<Spread, { kind: "single" }>;
      if (dir === -1) {
        return {
          dir,
          leafSlot: "right",
          originSide: "left",
          frontUrl: pageImg(pair.right),
          backUrl: null,
          staticLeftUrl: pageImg(pair.left),
          staticRightUrl: null,
          targetPageNumber: single.page.page,
          leafWidthPx: slotW,
        };
      }
      return {
        dir,
        leafSlot: "left",
        originSide: "right",
        frontUrl: pageImg(pair.left),
        backUrl: null,
        staticLeftUrl: null,
        staticRightUrl: pageImg(pair.right),
        targetPageNumber: single.page.page,
        leafWidthPx: slotW,
      };
    },
    [mode, currentIndex, currentPage, pages, spreadOfPage, currentPageNumber, spreads, pageImg, sheetW, slotW]
  );

  const setFlightBoth = (f: Flight | null) => {
    flightRef.current = f;
    setFlight(f);
  };

  const triggerFlip = useCallback(
    (dir: Dir) => {
      if (flightRef.current) return; // dang co thao tac khac chay
      if (simple) {
        const plan = startFlight(dir);
        if (!plan) return;
        setCurrentPageNumber(plan.targetPageNumber);
        return;
      }
      const plan = startFlight(dir);
      if (!plan) return;
      setFlightBoth({ ...plan, progress: 0, animated: false, pendingCommit: true, durationMs: PROGRAMMATIC_FLIP_MS });
      // Can 1 nhip de trinh duyet ve xong trang thai "progress 0" truoc khi bat
      // transition, neu khong trinh duyet co the gop 2 lan set lien tiep lam mat
      // hieu ung. Dung nextPaint (rAF + setTimeout du phong) thay vi rAF don thuan:
      // rAF co the bi treo vo thoi han khi pane khong duoc ve (da gap that khi tu
      // kiem thu qua cong cu tu dong - xem MEMORYBANK.md), setTimeout thi khong.
      nextPaint(() =>
        nextPaint(() => {
          const f = flightRef.current;
          if (!f) return;
          setFlightBoth({ ...f, progress: 1, animated: true });
        })
      );
    },
    [simple, startFlight]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") triggerFlip(-1);
      if (e.key === "ArrowLeft") triggerFlip(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [triggerFlip]);

  // Luoi an toan: "transitionend" duoc biet la khong dang tin cay tuyet doi (tab mat
  // focus/bi throttle, transition bi ngat boi mot lan re-render khac, quirk trinh
  // duyet...). Neu sau thoi gian animation + bien do ma chua co onTransitionEnd nao
  // don dep flight, tu ep hoan tat/huy de khong bao gio ket cung o giua chung lat trang.
  useEffect(() => {
    if (!flight || !flight.animated) return;
    const timer = setTimeout(() => {
      const f = flightRef.current;
      if (!f || !f.animated) return;
      if (f.pendingCommit) setCurrentPageNumber(f.targetPageNumber);
      setFlightBoth(null);
    }, flight.durationMs + 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight?.animated, flight?.durationMs, flight?.pendingCommit, flight?.targetPageNumber]);

  function onPointerDown(e: ReactPointerEvent) {
    if (simple || flightRef.current?.animated) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragOriginXRef.current = e.clientX;
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (simple || dragOriginXRef.current === null) return;
    const dx = e.clientX - dragOriginXRef.current;
    if (!flightRef.current) {
      if (Math.abs(dx) < DEAD_ZONE_PX) return;
      const dir: Dir = dx < 0 ? -1 : 1;
      const plan = startFlight(dir);
      if (!plan) {
        dragOriginXRef.current = null;
        return;
      }
      setFlightBoth({ ...plan, progress: 0, animated: false, pendingCommit: false, durationMs: DRAG_SETTLE_MS });
      return;
    }
    const f = flightRef.current;
    const traveled = f.dir === -1 ? -dx : dx;
    const progress = Math.max(0, Math.min(1, f.leafWidthPx > 0 ? traveled / f.leafWidthPx : 0));
    setFlightBoth({ ...f, progress });
  }

  function endDrag() {
    dragOriginXRef.current = null;
    const f = flightRef.current;
    if (!f || f.animated) return;
    const commit = f.progress > 0.5;
    const target = commit ? 1 : 0;
    const duration = Math.max(120, Math.round(DRAG_SETTLE_MS * Math.abs(target - f.progress)));
    setFlightBoth({ ...f, animated: true, progress: target, pendingCommit: commit, durationMs: duration });
  }

  function onLeafTransitionEnd(e: ReactTransitionEvent) {
    if (e.propertyName !== "transform") return;
    const f = flightRef.current;
    if (!f || !f.animated) return;
    if (f.pendingCommit) setCurrentPageNumber(f.targetPageNumber);
    setFlightBoth(null);
  }

  const canGoPrev = mode === "single" ? currentIndex > 0 : (spreadOfPage(currentPageNumber)?.index ?? 0) > 0;
  const canGoNext =
    mode === "single" ? currentIndex < pages.length - 1 : (spreadOfPage(currentPageNumber)?.index ?? 0) < spreads.length - 1;

  const angle = flight ? flight.dir * flight.progress * 180 : 0;
  const shadeOpacity = flight ? Math.sin(Math.min(1, flight.progress) * Math.PI) * 0.4 : 0;

  const restingSpread = mode === "spread" ? spreadOfPage(currentPageNumber)?.spread ?? null : null;

  const pageLabel = (() => {
    if (mode === "single" || !restingSpread) return `Trang ${currentPage?.page ?? "-"} / ${pages.length}`;
    if (restingSpread.kind === "single") return `Trang ${restingSpread.page.page} / ${pages.length}`;
    return `Trang ${restingSpread.left.page}-${restingSpread.right.page} / ${pages.length}`;
  })();

  function renderImg(url: string | null, rotation: number | undefined, alt: string) {
    if (!url) return <div className="flipbook-blank" aria-hidden />;
    return (
      <img
        src={url}
        alt={alt}
        draggable={false}
        style={{ transform: rotation ? `rotate(${rotation}deg)` : undefined }}
      />
    );
  }

  return (
    <div className="reader">
      <div className="reader-top">
        <span>{title}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span>{pageLabel}</span>
          {containerSize.w >= TOGGLE_MIN_WIDTH && hasAnyPair && (
            <div className="flipbook-view-toggle" role="group" aria-label="Che do xem">
              <button
                type="button"
                className={mode === "single" ? "active" : ""}
                onClick={() => setViewOverride("single")}
              >
                1 trang
              </button>
              <button
                type="button"
                className={mode === "spread" ? "active" : ""}
                onClick={() => setViewOverride("spread")}
              >
                2 trang
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        className="reader-stage flipbook-stage"
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {canGoPrev && (
          <button type="button" className="nav-zone left" onClick={() => triggerFlip(1)} aria-label="Trang truoc">
            &#8249;
          </button>
        )}
        {canGoNext && (
          <button type="button" className="nav-zone right" onClick={() => triggerFlip(-1)} aria-label="Trang sau">
            &#8250;
          </button>
        )}

        {sheetW > 0 && sheetH > 0 && (
          <div className="flipbook-sheet" style={{ width: sheetW, height: sheetH, perspective: sheetW * 2.5 }}>
            {/* Lop nghi (khong dang lat): don gian, re, dung khi khong co flight */}
            {!flight &&
              (mode === "single" ? (
                <div className="flipbook-slot" style={{ left: 0, width: sheetW }}>
                  {renderImg(pageImg(currentPage), currentPage?.rotation, `Trang ${currentPage?.page}`)}
                </div>
              ) : restingSpread?.kind === "single" ? (
                <div className="flipbook-slot" style={{ left: 0, width: sheetW }}>
                  {renderImg(pageImg(restingSpread.page), restingSpread.page.rotation, `Trang ${restingSpread.page.page}`)}
                </div>
              ) : restingSpread ? (
                <>
                  <div className="flipbook-slot" style={{ left: 0, width: slotW }}>
                    {renderImg(pageImg(restingSpread.left), restingSpread.left.rotation, `Trang ${restingSpread.left.page}`)}
                  </div>
                  <div className="flipbook-slot" style={{ left: slotW, width: slotW }}>
                    {renderImg(pageImg(restingSpread.right), restingSpread.right.rotation, `Trang ${restingSpread.right.page}`)}
                  </div>
                </>
              ) : null)}

            {/* Lop tinh ben duoi, duoc lo dan ra khi la lat di qua */}
            {flight && flight.staticLeftUrl && (
              <div className="flipbook-slot" style={{ left: 0, width: slotW }}>
                {renderImg(flight.staticLeftUrl, undefined, "")}
              </div>
            )}
            {flight && flight.staticRightUrl && (
              <div className="flipbook-slot" style={{ left: slotW, width: slotW }}>
                {renderImg(flight.staticRightUrl, undefined, "")}
              </div>
            )}

            {flight && (
              <div
                className="flipbook-leaf"
                onTransitionEnd={onLeafTransitionEnd}
                style={{
                  left: flight.leafSlot === "left" ? 0 : flight.leafSlot === "right" ? slotW : 0,
                  width: flight.leafSlot === "full" ? sheetW : slotW,
                  transformOrigin: flight.originSide === "left" ? "left center" : "right center",
                  transform: `rotateY(${angle}deg)`,
                  transition: flight.animated ? `transform ${flight.durationMs}ms ${FLIP_EASING}` : "none",
                }}
              >
                {/* Lop bo/uon nhe rieng, khong dung chung transform voi leaf (leaf dang
                    ban transform cho rotateY qua transition) - mo phong giay hoi vong
                    khi lat thay vi mot mat phang cung xoay quanh ban le. Chi ap dung khi
                    dang o giai doan "tha tay/an nut" (animated), luc keo tay truc tiep
                    giu phang de dung 1:1 voi ngon tay. */}
                <div
                  className="flipbook-leaf-inner"
                  style={
                    flight.animated ? { animation: `flipbook-bend ${flight.durationMs}ms ${FLIP_EASING}` } : undefined
                  }
                >
                  <div className="flipbook-face front">
                    {renderImg(flight.frontUrl, undefined, "")}
                    <div
                      className="flipbook-shade"
                      style={
                        flight.animated
                          ? { animation: `flipbook-shade-pulse ${flight.durationMs}ms ${FLIP_EASING}` }
                          : { opacity: shadeOpacity }
                      }
                    />
                  </div>
                  <div className={`flipbook-face back${flight.backUrl ? "" : " endpaper"}`}>
                    {flight.backUrl ? renderImg(flight.backUrl, undefined, "") : null}
                    <div
                      className="flipbook-shade"
                      style={
                        flight.animated
                          ? { animation: `flipbook-shade-pulse ${flight.durationMs}ms ${FLIP_EASING}` }
                          : { opacity: shadeOpacity }
                      }
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
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
