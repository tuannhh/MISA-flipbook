"use client";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import HTMLFlipBook from "react-pageflip";
import { useTranslations } from "next-intl";
import type { ReaderPage } from "@/lib/types";
import { useSimpleReaderMode } from "@/lib/useSimpleReaderMode";
import { XIcon } from "@/components/xds/icons/XIcon";
import { XButton } from "@/components/xds/XButton";
import { XDialog } from "@/components/xds/XDialog";
import { XDropdownMenu } from "@/components/xds/XDropdownMenu";
import { XInput } from "@/components/xds/XInput";
import { useToast } from "@/components/xds/XToast";
import { getFacebookAppId, shareViaFacebookDialog } from "@/lib/facebookShare";

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

// F17: zoom in/out cho reader (react-pageflip/StPageFlip khong ho tro zoom san - da
// doc het node_modules/react-pageflip/build/settings.d.ts de xac nhan truoc khi tu
// lam them lop nay). Dung CSS transform (scale+translate) tren chinh root element
// cua HTMLFlipBook (qua prop style - xem build/index.js: props.style gan thang vao
// div goc ma StPageFlip quan ly) vi transform khong lam thay doi offsetWidth/
// clientWidth nen KHONG kich hoat lai ResizeObserver/tinh toan "stretch" ben trong
// thu vien - an toan voi co che size hien co, khong can bao mount lai.
const ZOOM_MIN = 1;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.5;

// F10 Muc A: quy doi rect_norm (da normalize theo dung khung hinh THI GIAC cua trang,
// xem _normalize_rect trong services/pdf-worker/app/convert.py) thanh vi tri % tren
// .flipbook-page - phai tinh lai vung anh thuc su hien thi (object-fit:contain co the
// letterbox 2 ben) vi tat ca trang dung chung 1 ty le khung (pageAspect tu trang dau),
// khong phai ty le rieng cua tung trang khi trang do bi xoay/khac ty le.
function computeImageBox(ownAspect: number, containerAspect: number) {
  if (!Number.isFinite(ownAspect) || ownAspect <= 0) return { left: 0, top: 0, width: 1, height: 1 };
  if (ownAspect >= containerAspect) {
    const height = containerAspect / ownAspect;
    return { left: 0, top: (1 - height) / 2, width: 1, height };
  }
  const width = ownAspect / containerAspect;
  return { left: (1 - width) / 2, top: 0, width, height: 1 };
}

// Chi so (0-based) cua trang TRAI trong spread chua `index`, voi showCover: bia dung mot minh
// ([0]) roi tung cap [1,2], [3,4]... Deep-link ?page=, resize, doi che do 1<->2 trang co the cho
// mot chi so CHAN (thuoc ve cap [le, chan]); StPageFlip tu dua ve dau spread nhung KHONG phat
// su kien "flip" nen phai tu chuan hoa, neu khong nhan/nut Truoc-Sau lech voi anh dang hien.
function spreadStartIndex(index: number) {
  if (index <= 0) return 0;
  return index % 2 === 1 ? index : index - 1;
}

// Cua so tai anh lazy + trang dang hien duoc dua qua Context (khong qua props) de mang
// `children` cua HTMLFlipBook on dinh: react-pageflip goi updateFromHtml() (huy + dung lai toan
// bo trang, reset ve trang hien tai) moi khi `children` doi tham chieu - neu doi giua luc
// dang lat thi hoat anh bi reset (nhay trang khong den dich, anh chong lan, nut Sau "chet").
interface ReaderWindow {
  first: number;
  last: number;
  shown: number;
  spread: boolean;
}
const ReaderWindowContext = createContext<ReaderWindow>({ first: 0, last: -1, shown: 0, spread: false });

interface PageProps {
  index: number;
  pageNumber: number;
  total: number;
  assetId: string | null;
  assetUrl: (assetId: string) => string;
  rotation?: number;
  widthPt: number;
  heightPt: number;
  pageAspect: number;
  links?: ReaderPage["links"];
  media?: ReaderPage["media"];
  onGoToPage?: (pageNumber: number) => void;
}

const Page = forwardRef<HTMLDivElement, PageProps>(function Page(
  { index, pageNumber, total, assetId, assetUrl, rotation = 0, widthPt, heightPt, pageAspect, links, media, onGoToPage },
  ref
) {
  const t = useTranslations("reader");
  const win = useContext(ReaderWindowContext);
  const imageUrl = assetId && index >= win.first && index <= win.last ? assetUrl(assetId) : null;
  const active = index === win.shown || (win.spread && win.shown > 0 && index === win.shown + 1);
  const alt = t("pageLabelSingle", { page: pageNumber, total });
  const mediaRefs = useRef<Array<HTMLMediaElement | null>>([]);
  // PageFlip keeps some hidden page nodes mounted. Media must never continue
  // playing after its page is no longer visible, and we never autoplay it.
  useEffect(() => {
    if (active) return;
    mediaRefs.current.forEach((element) => element?.pause());
  }, [active]);
  const rotated = rotation === 90 || rotation === 270;
  const ownAspect = rotated ? heightPt / widthPt : widthPt / heightPt;
  const box = computeImageBox(ownAspect, pageAspect);
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
      {media?.map((item, i) => {
        if (!item.mediaAssetId) return null;
        const [x0, y0, x1, y1] = item.rectNorm;
        const style = {
          left: `${(box.left + x0 * box.width) * 100}%`,
          top: `${(box.top + y0 * box.height) * 100}%`,
          width: `${(x1 - x0) * box.width * 100}%`,
          height: `${(y1 - y0) * box.height * 100}%`,
        };
        const stopPageFlip = (event: ReactPointerEvent<HTMLElement>) => event.stopPropagation();
        const source = assetUrl(item.mediaAssetId);
        return (
          <div
            key={`media-${i}`}
            className={`flipbook-media-overlay is-${item.kind}`}
            style={style}
            onPointerDown={stopPageFlip}
            onClick={(event) => event.stopPropagation()}
          >
            {item.kind === "audio" ? (
              <audio
                ref={(element) => {
                  mediaRefs.current[i] = element;
                }}
                controls
                controlsList="nodownload"
                preload="none"
                aria-label="Audio trong PDF"
              >
                <source src={source} type={item.contentType} />
              </audio>
            ) : (
              <video
                ref={(element) => {
                  mediaRefs.current[i] = element;
                }}
                controls
                controlsList="nodownload"
                playsInline
                preload="none"
                aria-label="Video trong PDF"
              >
                <source src={source} type={item.contentType} />
              </video>
            )}
          </div>
        );
      })}
      {links?.map((link, i) => {
        // internal_goto chua resolve duoc so trang (target=null) hoac unsupported_action
        // (Muc C, PLAN.md) - khong render vung bam, khong the hien loi cho nguoi doc.
        if (link.target == null) return null;
        const [x0, y0, x1, y1] = link.rect_norm;
        const style = {
          left: `${(box.left + x0 * box.width) * 100}%`,
          top: `${(box.top + y0 * box.height) * 100}%`,
          width: `${(x1 - x0) * box.width * 100}%`,
          height: `${(y1 - y0) * box.height * 100}%`,
        };
        if (link.type === "external_uri" && typeof link.target === "string") {
          return (
            <a
              key={i}
              className="flipbook-link-overlay"
              style={style}
              href={link.target}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            />
          );
        }
        if (link.type === "internal_goto" && typeof link.target === "number") {
          const targetPage = link.target;
          return (
            <button
              key={i}
              type="button"
              className="flipbook-link-overlay"
              style={style}
              onClick={(e) => {
                e.stopPropagation();
                onGoToPage?.(targetPage);
              }}
            />
          );
        }
        return null;
      })}
    </div>
  );
});

// Kieu tra ve cua pageFlip() (react-pageflip khong export type PageFlip rieng qua
// entrypoint chinh) - chi khai bao dung phan phuong thuc thuc su dung toi.
interface PageFlipApi {
  flipNext(): void;
  flipPrev(): void;
  flip(pageIndex: number): void;
}

export function FlipBook({
  title,
  pages,
  initialPage,
  imageUrl,
  shareUrl,
  downloadUrl,
  backgroundUrl,
  onPageChange,
}: {
  title: string;
  pages: ReaderPage[];
  initialPage?: number;
  imageUrl: (assetId: string) => string;
  /** F08: URL cong khai de chia se (copy/Facebook/LinkedIn). Bo trong = an het khu chia se. */
  shareUrl?: string;
  /** F11: URL tai PDF goc, chi truyen khi allow_download=true (null/undefined = an nut tai). */
  downloadUrl?: string | null;
  /** F15: anh nen backdrop phia sau khung doc (khac han noi dung/nen tung trang PDF).
   * null/undefined = giu nen den mac dinh nhu truoc. */
  backgroundUrl?: string | null;
  /** F12: bao cho parent moi khi nguoi doc lat sang 1 trang/spread khac (so trang thuc,
   * 1-based) de ghi nhan "luot xem trang" - bo trong o reader preview cua Creator (khong
   * tinh vao thong ke cong khai). */
  onPageChange?: (page: number) => void;
}) {
  const t = useTranslations("reader");
  const { simple, reducedMotion } = useSimpleReaderMode();
  const readerRootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<{ pageFlip(): PageFlipApi } | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(() => {
    const initialIndex = initialPage === undefined ? 0 : pages.findIndex((page) => page.page === initialPage);
    return initialIndex >= 0 ? initialIndex : 0;
  });
  const [zoom, setZoom] = useState(ZOOM_MIN);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [coarsePointer, setCoarsePointer] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [pageInput, setPageInput] = useState("1");
  const [requestedIndex, setRequestedIndex] = useState<number | null>(null);
  const panDrag = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setContainerWidth(el.clientWidth);
      setContainerHeight(el.clientHeight);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarsePointer(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const pageAspect = pages[0] && pages[0].heightPt > 0 ? pages[0].widthPt / pages[0].heightPt : 0.75;
  const width = BASE_UNIT;
  const height = Math.round(BASE_UNIT / pageAspect);

  // Mobile/tablet are deliberately always one page, including landscape. A wide
  // desktop with a mouse/trackpad receives a two-page spread.
  // Khung thap va rong (iframe nhung 16:9 trong cot bai viet ~780px) cung mo spread: sach
  // da bi gioi han theo chieu cao (xem bookWidth) nen 1 trang don cung khong to hon trang
  // trong spread, chi phi khoang trong hai ben. Nguong 1.6 = moi trang spread >= ~80%
  // kich thuoc trang don.
  const wideStage = containerHeight > 0 && containerWidth >= 1.6 * containerHeight * pageAspect;
  const isSpreadCapable =
    !coarsePointer && (containerWidth >= SPREAD_MIN_WIDTH || (containerWidth >= 480 && wideStage)) && pages.length > 2;
  // Chi so trang TRAI dang hien (da chuan hoa ve dau spread khi o che do 2 trang).
  const shownIndex = isSpreadCapable ? spreadStartIndex(currentIndex) : currentIndex;
  // Keep the network window small: a 500-page catalogue no longer starts 500 image
  // downloads. requestedIndex preloads a direct jump before PageFlip reaches it.
  const loadCenter = requestedIndex ?? shownIndex;
  const firstLoadedIndex = Math.max(0, loadCenter - (isSpreadCapable ? 3 : 2));
  const lastLoadedIndex = Math.min(pages.length - 1, loadCenter + (isSpreadCapable ? 5 : 3));
  const readerWindow = useMemo<ReaderWindow>(
    () => ({ first: firstLoadedIndex, last: lastLoadedIndex, shown: shownIndex, spread: isSpreadCapable }),
    [firstLoadedIndex, lastLoadedIndex, shownIndex, isSpreadCapable]
  );
  // Trang goi qua ref de khong lam doi tham chieu `children` (xem ReaderWindowContext).
  const imageUrlRef = useRef(imageUrl);
  imageUrlRef.current = imageUrl;
  const assetUrl = useCallback((assetId: string) => imageUrlRef.current(assetId), []);
  const shownIndexRef = useRef(shownIndex);
  shownIndexRef.current = shownIndex;
  const spreadRef = useRef(isSpreadCapable);
  spreadRef.current = isSpreadCapable;
  const jumpToken = useRef(0);

  // BUG THAT phat hien 2026-09-17 (nguoi dung bao qua Chrome DevTools that o
  // iPhone 16 Pro Max 440px): page-flip's "stretch" size KHONG chi dua vao prop
  // usePortrait ma con tu tinh lai portrait/landscape rieng qua cong thuc
  // "e < 2*minWidth" (doc thang node_modules/page-flip/dist/js/page-flip.module.js,
  // khong doan) - neu container >= 2*minWidth thi VAN rendering nhu landscape (h =
  // blockWidth/2, tuc la nua be rong) DU usePortrait=true da truyen vao. minWidth cu
  // co gia tri co dinh 200 => nguong that su la 400px, nen 375px (da test truoc day)
  // tinh co vua duoi nguong con 440px (iPhone 16 Pro Max) thi vuot qua, lam trang bi
  // ep hien thi nhu dang "2 trang" (nua be rong, rat kho nhin dung nhu nguoi dung mo
  // ta). Sua: khi dang o che do portrait (khong spread), dat minWidth = be rong khung
  // hien tai (lam tron xuong boi WIDTH_BUCKET de tranh remount lien tuc do
  // ResizeObserver nhay so le 1-2px) - luon thoa "2*minWidth > containerWidth" nen
  // page-flip khong con tu y roi ve landscape; minHeight tinh tuong ung theo pageAspect
  // de khong lech ty le. Remount qua key khi bucket doi de ap dung minWidth moi (props
  // cua page-flip dong bang tu luc khoi tao, doi sau khong co tac dung - da biet tu
  // truoc). Da test that qua Claude Browser o nhieu be rong (320/375/414/440/768/900)
  // truoc khi ket luan sua xong, xem MEMORYBANK.md.
  //
  // Khung nhung 16:9 (iframe /embed, vd 960x540) bi cat tren/duoi: autoSize cua
  // page-flip dat chieu cao sach = padding-bottom % theo CHIEU NGANG (doc thang
  // page-flip.module.js), khong xet chieu cao stage => khung thap hon ~0.7 x ngang la
  // tran. Sua: tu gioi han be rong sach theo chieu cao stage (kieu object-fit:contain)
  // qua the boc .flipbook-fit; sach nho lai va can giua, nen/thanh cong cu van rong
  // full khung nhu khi fullscreen.
  const bookAspect = isSpreadCapable ? 2 * pageAspect : pageAspect;
  const bookWidth =
    containerHeight > 0 ? Math.min(containerWidth, Math.floor(containerHeight * bookAspect)) : containerWidth;
  const WIDTH_BUCKET = 20;
  // Lam tron XUONG: lam tron len co the vuot khung vai px (sach tran mep/bi cat).
  const widthBucket = Math.max(1, Math.floor(bookWidth / WIDTH_BUCKET));
  const portraitMinWidth = Math.max(200, widthBucket * WIDTH_BUCKET);
  const minWidth = isSpreadCapable ? 200 : portraitMinWidth;
  const minHeight = Math.round(minWidth / pageAspect);

  const flippingTime = simple ? 1 : 700;

  const goNext = useCallback(() => {
    jumpToken.current += 1;
    bookRef.current?.pageFlip().flipNext();
  }, []);
  const goPrev = useCallback(() => {
    jumpToken.current += 1;
    bookRef.current?.pageFlip().flipPrev();
  }, []);
  // F10 Muc A: link noi bo (internal_goto) - target la so trang 1-based (BE),
  // StPageFlip dung index 0-based khop voi thu tu pages[] truyen vao children.
  // Nhay xa: nap truoc anh trang dich (toi da ~1.5s) roi moi flip() de khong lat ra o trong;
  // KHONG doi state nao lam doi `children` ngay truoc flip (xem ReaderWindowContext).
  const goToPage = useCallback(
    (pageNumber: number) => {
      const index = pages.findIndex((page) => page.page === pageNumber);
      if (index < 0) return;
      const target = spreadRef.current ? spreadStartIndex(index) : index;
      if (target === shownIndexRef.current) return;
      const token = (jumpToken.current += 1);
      setRequestedIndex(target);
      const wanted = spreadRef.current && target > 0 ? [target, target + 1] : [target];
      const loads = wanted
        .map((i) => pages[i]?.imageAssetId)
        .filter((id): id is string => !!id)
        .map(
          (id) =>
            new Promise<void>((resolve) => {
              const img = new Image();
              img.onload = () => resolve();
              img.onerror = () => resolve();
              img.src = imageUrlRef.current(id);
            })
        );
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, 1500));
      void Promise.race([Promise.all(loads), timeout]).then(() => {
        if (token !== jumpToken.current) return;
        bookRef.current?.pageFlip().flip(target);
        // Neu thu vien khong phat "flip" (loi bat thuong) van tha cua so tai ve trang dang hien.
        setTimeout(() => {
          if (token === jumpToken.current) setRequestedIndex(null);
        }, 3000);
      });
    },
    [pages]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (e.defaultPrevented || target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev]);

  const onFlip = useCallback(
    (e: { data: number }) => {
      setCurrentIndex(e.data);
      setRequestedIndex(null);
      const p = pages[e.data];
      if (p) onPageChange?.(p.page);
    },
    [pages, onPageChange]
  );

  const maxPanFor = useCallback((z: number) => {
    const el = containerRef.current;
    if (!el || z <= ZOOM_MIN) return { x: 0, y: 0 };
    return { x: (el.clientWidth * (z - 1)) / 2, y: (el.clientHeight * (z - 1)) / 2 };
  }, []);

  const clampPan = useCallback(
    (p: { x: number; y: number }, z: number) => {
      const max = maxPanFor(z);
      return { x: Math.max(-max.x, Math.min(max.x, p.x)), y: Math.max(-max.y, Math.min(max.y, p.y)) };
    },
    [maxPanFor]
  );

  const zoomIn = useCallback(() => {
    setZoom((z) => {
      const nz = Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 10) / 10);
      setPan((p) => clampPan(p, nz));
      return nz;
    });
  }, [clampPan]);

  const zoomOut = useCallback(() => {
    setZoom((z) => {
      const nz = Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 10) / 10);
      setPan((p) => (nz === ZOOM_MIN ? { x: 0, y: 0 } : clampPan(p, nz)));
      return nz;
    });
  }, [clampPan]);

  const isZoomed = zoom > ZOOM_MIN;

  // Thanh truot zoom lien tuc (thay vi chi buoc co dinh qua +/-) - van dung chung
  // clampPan de khong keo anh ra ngoai khung khi vua keo slider vua da pan truoc do.
  const onZoomSlider = useCallback(
    (e: ReactChangeEvent<HTMLInputElement>) => {
      const nz = Math.round(Number(e.target.value) * 10) / 10;
      setZoom(nz);
      setPan((p) => (nz === ZOOM_MIN ? { x: 0, y: 0 } : clampPan(p, nz)));
    },
    [clampPan]
  );

  // Fullscreen (Fullscreen API chuan) tren toan bo khung doc (bao gom header/nut bam,
  // khong chi rieng vung trang) de nguoi dung van thao tac zoom/chia se duoc khi dang
  // fullscreen. Lang nghe "fullscreenchange" thay vi tu suy doan trang thai vi trinh
  // duyet co the tu thoat fullscreen (vd nguoi dung bam Esc) ma khong qua ham toggle.
  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(document.fullscreenElement === readerRootRef.current);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await readerRootRef.current?.requestFullscreen();
      }
    } catch {
      // Mot so trinh duyet/thiet bi tu choi Fullscreen API (vd khong co tuong tac
      // nguoi dung truc tiep truoc do) - im lang bo qua, khong chan doc sach.
    }
  }, []);

  const onStagePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!isZoomed) return;
      // setPointerCapture chuyen huong luon su kien `click` ve stage => nut Truoc/Sau, link
      // trong trang va cac control khac se khong bao gio nhan duoc click khi dang zoom.
      if ((e.target as HTMLElement).closest("button, a, input, audio, video")) return;
      panDrag.current = { startX: e.clientX, startY: e.clientY, startPanX: pan.x, startPanY: pan.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [isZoomed, pan]
  );

  const onStagePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = panDrag.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      setPan(clampPan({ x: drag.startPanX + dx, y: drag.startPanY + dy }, zoom));
    },
    [clampPan, zoom]
  );

  const onStagePointerUp = useCallback(() => {
    panDrag.current = null;
  }, []);

  const toast = useToast();
  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast("success", t("shareCopied"));
    } catch {
      toast("error", t("shareCopyFailed"));
    }
  }
  // Cung cong thuc voi embedCode() o dashboard/books/[id]/page.tsx (F09) - lap lai o day
  // vi day la 2 ngu canh khac nhau (Creator quan tri vs. bat ky ai co link cong khai
  // bam nut Chia se trong chinh reader), khong dung chung 1 component/route.
  async function copyEmbedCode() {
    if (!shareUrl) return;
    const embedUrl = new URL(shareUrl);
    embedUrl.pathname = `${embedUrl.pathname.replace(/\/$/, "")}/embed`;
    embedUrl.search = "";
    embedUrl.hash = "";
    const code = `<iframe src="${embedUrl.toString()}" style="width:100%;aspect-ratio:16/9;border:0" allowfullscreen loading="lazy"></iframe>`;
    try {
      await navigator.clipboard.writeText(code);
      toast("success", t("shareEmbedCopied"));
    } catch {
      toast("error", t("shareEmbedCopyFailed"));
    }
  }
  function openFacebookLinkFallback() {
    if (!shareUrl) return;
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }
  async function shareFacebook() {
    if (!shareUrl) return;
    const appId = getFacebookAppId();
    // Chua cau hinh App ID that (P6 - can nguoi dung tu tao Facebook App tai
    // developers.facebook.com) -> dung link sharer.php, khong can app, luon hoat dong.
    if (!appId) {
      openFacebookLinkFallback();
      return;
    }
    try {
      const opened = await shareViaFacebookDialog(appId, shareUrl);
      if (!opened) openFacebookLinkFallback();
    } catch {
      openFacebookLinkFallback();
    }
  }
  async function nativeShare() {
    if (!shareUrl) return;
    if (navigator.share) {
      // Xac nhan trong UI he dieu hanh la cua nguoi dung; khong tu bao "da dang" (PLAN.md
      // muc 5: "khong hua tu dang len profile ca nhan", chi mo giao dien chia se).
      try {
        await navigator.share({ title, url: shareUrl });
      } catch {
        // Nguoi dung tu huy share sheet - khong phai loi.
      }
    } else {
      await copyShareLink();
    }
  }

  const currentPage = pages[shownIndex] ?? pages[0];
  const rightPage = isSpreadCapable && shownIndex > 0 ? pages[shownIndex + 1] : undefined;
  const lastVisibleIndex = rightPage ? shownIndex + 1 : shownIndex;
  const canGoPrev = shownIndex > 0;
  // Sach so trang le: spread cuoi [le, chan] la trang cuoi cung - khong con gi de lat toi.
  const canGoNext = lastVisibleIndex < pages.length - 1;
  const pageLabel = rightPage
    ? t("pageLabelSpread", { from: currentPage?.page ?? 0, to: rightPage.page, total: pages.length })
    : t("pageLabelSingle", { page: currentPage?.page ?? "-", total: pages.length });

  // Thanh tien trinh doc: tinh theo trang PHAI cung (spread) khi co, de "100%" khop
  // dung luc nguoi dung thay het trang cuoi, khong dung lai o trang trai cua spread cuoi.
  const lastVisiblePage = (rightPage ?? currentPage)?.page ?? 0;
  const readingProgress = pages.length > 0 ? Math.min(100, Math.round((lastVisiblePage / pages.length) * 100)) : 0;

  // F15: lam toi anh nen bang 1 lop gradient phu len tren, giu chu tren reader-top/
  // reader-bottom (mau trang co san) va anh trang PDF (nen trang) van doc duoc ro rang.
  const readerStyle = backgroundUrl
    ? {
        backgroundImage: `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url(${backgroundUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : undefined;

  function submitPageJump() {
    const target = Number(pageInput);
    if (!Number.isInteger(target) || target < 1 || target > pages.length) return;
    goToPage(target);
    setNavigatorOpen(false);
  }

  // Mang children ON DINH (chi doi khi doi sach/kich thuoc trang/ham nhay) - xem ReaderWindowContext.
  const pageElements = useMemo(
    () =>
      pages.map((p, index) => (
        <Page
          key={p.page}
          index={index}
          pageNumber={p.page}
          total={pages.length}
          assetId={p.imageAssetId ?? null}
          assetUrl={assetUrl}
          rotation={p.rotation}
          widthPt={p.widthPt}
          heightPt={p.heightPt}
          pageAspect={pageAspect}
          links={p.links}
          media={p.media}
          onGoToPage={goToPage}
        />
      )),
    [pages, assetUrl, pageAspect, goToPage]
  );

  return (
    <div className="reader" style={readerStyle} ref={readerRootRef}>
      <div className="reader-top">
        <span className="reader-top-title">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/misa-logo.jpg" alt="MISA" className="reader-top-logo" />
          <span className="reader-top-title-text">{title}</span>
        </span>
        <span className="reader-top-right">
          <span className="reader-page-label">{pageLabel}</span>
          <button
            type="button"
            className="reader-icon-btn"
            onClick={() => {
              setPageInput(String(currentPage?.page ?? 1));
              setNavigatorOpen(true);
            }}
            aria-label={t("pageNavigator")}
            title={t("pageNavigator")}
          >
            <XIcon name="file-text" size={18} />
          </button>
          <button
            type="button"
            className="reader-icon-btn"
            onClick={zoomOut}
            disabled={zoom <= ZOOM_MIN}
            aria-label={t("zoomOut")}
            title={t("zoomOut")}
          >
            <XIcon name="zoom-out" size={18} />
          </button>
          <input
            className="reader-zoom-slider"
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={ZOOM_STEP}
            value={zoom}
            onChange={onZoomSlider}
            aria-label={t("zoomLevel")}
            title={t("zoomLevel")}
          />
          <button
            type="button"
            className="reader-icon-btn"
            onClick={zoomIn}
            disabled={zoom >= ZOOM_MAX}
            aria-label={t("zoomIn")}
            title={t("zoomIn")}
          >
            <XIcon name="zoom-in" size={18} />
          </button>
          <button
            type="button"
            className="reader-icon-btn"
            onClick={toggleFullscreen}
            aria-label={t(isFullscreen ? "fullscreenExit" : "fullscreenEnter")}
            title={t(isFullscreen ? "fullscreenExit" : "fullscreenEnter")}
          >
            <XIcon name={isFullscreen ? "minimize" : "maximize"} size={18} />
          </button>
          {downloadUrl && (
            <a className="reader-icon-btn" href={downloadUrl} download aria-label={t("download")} title={t("download")}>
              <XIcon name="download" size={18} />
            </a>
          )}
          {shareUrl && (
            <XDropdownMenu
              items={[
                { key: "copy", label: t("shareCopyLink"), icon: "copy", onSelect: copyShareLink },
                { key: "embed", label: t("shareEmbedCode"), icon: "file-text", onSelect: copyEmbedCode },
                {
                  key: "facebook",
                  label: t("shareFacebook"),
                  icon: "share",
                  onSelect: shareFacebook,
                },
                {
                  key: "linkedin",
                  label: t("shareLinkedin"),
                  icon: "share",
                  href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
                  target: "_blank",
                  rel: "noreferrer noopener",
                },
                ...(typeof navigator !== "undefined" && "share" in navigator
                  ? [{ key: "native", label: t("shareNative"), icon: "external-link" as const, onSelect: nativeShare }]
                  : []),
              ]}
            >
              {({ toggle, open }) => (
                <button
                  type="button"
                  className="reader-icon-btn"
                  onClick={toggle}
                  aria-label={t("share")}
                  aria-expanded={open}
                  title={t("share")}
                >
                  <XIcon name="share" size={18} />
                </button>
              )}
            </XDropdownMenu>
          )}
        </span>
      </div>

      <div
        className={`reader-stage flipbook-stage${isZoomed ? " is-zoomed" : ""}`}
        ref={containerRef}
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={onStagePointerUp}
        onPointerCancel={onStagePointerUp}
      >
        {containerWidth > 0 && pages.length > 0 && (
          <>
            {canGoPrev && (
              <button type="button" className="nav-zone left" onClick={goPrev} aria-label={t("prevPage")}>
                <XIcon name="chevron-left" size={28} />
              </button>
            )}
            {canGoNext && (
              <button type="button" className="nav-zone right" onClick={goNext} aria-label={t("nextPage")}>
                <XIcon name="chevron-right" size={28} />
              </button>
            )}
            <ReaderWindowContext.Provider value={readerWindow}>
            <div className="flipbook-fit" style={{ width: widthBucket * WIDTH_BUCKET }}>
            <HTMLFlipBook
              // StPageFlip khong tu doi portrait/landscape khi prop usePortrait doi sau
              // khi da mount (chi doc luc khoi tao/resize noi bo) - remount hoan toan
              // khi so trang HOAC che do spread hieu luc thay doi de ap dung dung
              // usePortrait; startPage giu nguyen vi tri dang doc qua lan remount.
              // Tuong tu voi useMouseEvents: doc code build/index.js xac nhan PageFlip
              // chi duoc "new" 1 LAN duy nhat (settings dong bang tu luc khoi tao), doi
              // prop sau do KHONG co tac dung - phai remount khi isZoomed doi trang thai
              // (bat/tat zoom) de tat that su keo-de-lat trang cua thu vien trong luc
              // pan, tranh xung dot voi pan tu viet (F17).
              // widthBucket cung remount ca o che do spread: page-flip chi tinh lai kich thuoc
              // khi window resize, khong biet .flipbook-fit vua doi be rong theo chieu cao.
              key={`${pages.length}-${isSpreadCapable}-${isZoomed}-${widthBucket}`}
              ref={bookRef as never}
              width={width}
              height={height}
              size="stretch"
              minWidth={minWidth}
              maxWidth={2200}
              minHeight={minHeight}
              maxHeight={Math.round(2200 / pageAspect)}
              maxShadowOpacity={0.5}
              showCover
              usePortrait={!isSpreadCapable}
              mobileScrollSupport={false}
              swipeDistance={20}
              clickEventForward
              useMouseEvents={!simple && !isZoomed}
              showPageCorners
              disableFlipByClick={false}
              flippingTime={flippingTime}
              startPage={shownIndex}
              startZIndex={0}
              autoSize
              drawShadow
              renderOnlyPageLengthChange={false}
              className="flipbook-book"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "center center" }}
              onFlip={onFlip}
            >
              {pageElements}
            </HTMLFlipBook>
            </div>
            </ReaderWindowContext.Provider>
          </>
        )}
      </div>

      <div
        className="reader-progress"
        role="progressbar"
        aria-label={t("readingProgress")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={readingProgress}
      >
        <div className="reader-progress-fill" style={{ width: `${readingProgress}%` }} />
      </div>

      <div className="reader-bottom">
        {simple ? t("hintSimple") : t("hintNormal")}
        {reducedMotion ? t("hintReducedMotion") : ""}
      </div>

      <XDialog
        open={navigatorOpen}
        onOpenChange={setNavigatorOpen}
        title={t("pageNavigator")}
        width="min(640px, 100%)"
        footer={
          <>
            <XButton variant="secondary" onClick={() => setNavigatorOpen(false)}>{t("closeNavigator")}</XButton>
            <XButton variant="primary" onClick={submitPageJump}>{t("goToPage")}</XButton>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submitPageJump();
          }}
        >
          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-[var(--xds-text)]">{t("pageInputLabel", { total: pages.length })}</span>
            <XInput
              autoFocus
              inputMode="numeric"
              min={1}
              max={pages.length}
              type="number"
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value)}
            />
          </label>
          <div className="reader-thumbnail-grid" aria-label={t("thumbnailList")}>
            {pages.map((page) => (
              <button
                key={page.page}
                type="button"
                className={`reader-thumbnail${page.page === currentPage?.page ? " is-current" : ""}`}
                onClick={() => {
                  goToPage(page.page);
                  setNavigatorOpen(false);
                }}
                aria-label={t("pageLabelSingle", { page: page.page, total: pages.length })}
              >
                {page.thumbAssetId && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl(page.thumbAssetId)} alt="" loading="lazy" />
                )}
                <span>{page.page}</span>
              </button>
            ))}
          </div>
        </form>
      </XDialog>
    </div>
  );
}
