"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, ApiError, assetUrl } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { canonicalReaderUrl } from "@/lib/public-reader-url";
import type { PublicBook } from "@/lib/types";
import { FlipBook } from "@/components/FlipBook";
import { XInput } from "@/components/xds/XInput";
import { XButton } from "@/components/xds/XButton";

interface PasswordRequiredBody {
  passwordRequired?: boolean;
  privateBook?: boolean;
}

function tokenStorageKey(permalink: string): string {
  return `flipbook-access-token:${permalink}`;
}

// F06: GA4 - chi nhan 1 ID dung dinh dang chinh thuc cua Google, KHONG bao gio nhan/eval
// JavaScript tuy y tu du lieu sach. Tu kiem tra lai o FE (BE da validate khi luu) truoc
// khi chen vao script - phong truong hop du lieu cu/loi tu nguon khac.
const GA4_MEASUREMENT_ID_RE = /^G-[A-Za-z0-9]{4,20}$/;

function useGoogleAnalytics(gaId: string | null | undefined) {
  useEffect(() => {
    if (!gaId || !GA4_MEASUREMENT_ID_RE.test(gaId)) return;
    const loader = document.createElement("script");
    loader.async = true;
    loader.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
    const inline = document.createElement("script");
    inline.text = [
      "window.dataLayer = window.dataLayer || [];",
      "function gtag(){dataLayer.push(arguments);}",
      "gtag('js', new Date());",
      `gtag('config', ${JSON.stringify(gaId)});`,
    ].join("\n");
    document.head.appendChild(loader);
    document.head.appendChild(inline);
    return () => {
      loader.remove();
      inline.remove();
    };
  }, [gaId]);
}

/**
 * Logic doc sach cong khai dung chung cho /read/:permalink (trang doc binh thuong)
 * va /read/:permalink/embed (F09, nhung trong iframe nhung site khac) - F05 yeu cau
 * ca 2 duong deu phai giu nguyen kiem tra mat khau ("giu day du mat khau/quyen" trong
 * PLAN.md), nen tach logic fetch/xac thuc ra day thay vi chep lai 2 lan.
 */
export function PublicBookReader({ permalink, embed = false, initialPage }: { permalink: string; embed?: boolean; initialPage?: number }) {
  const t = useTranslations("reader");
  const [book, setBook] = useState<PublicBook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  // This is a short-lived, book/revision-scoped reader credential. It is never the
  // Creator/Admin login JWT, even when the owner opens a private book.
  const [readerToken, setReaderToken] = useState<string | null>(null);
  const [privateBlocked, setPrivateBlocked] = useState(false);
  const lastPingedPageRef = useRef<number | null>(null);
  const openPingedRef = useRef(false);

  // F12: ghi nhan "luot xem trang" - 1 ping moi khi sang trang/spread MOI (bo qua neu
  // trung trang vua ping, tranh dem trung khi remount noi bo cua react-pageflip, vd luc
  // bat/tat zoom F17). Fire-and-forget: khong cho loi thong ke lam gian doan trai nghiem doc.
  const pingPageView = useCallback(
    (page: number) => {
      if (lastPingedPageRef.current === page) return;
      lastPingedPageRef.current = page;
      apiFetch(`/public/books/${permalink}/events`, {
        method: "POST",
        token: readerToken,
        body: { eventType: "page_view", page },
      }).catch(() => {});
    },
    [permalink, readerToken]
  );

  const load = useCallback(
    (token?: string | null, triedLoginToken = false) => {
      setError(null);
      apiFetch<PublicBook>(`/public/books/${permalink}`, token ? { token } : {})
        .then((b) => {
          setBook(b);
          setReaderToken(b.readerToken);
          if (typeof window !== "undefined") sessionStorage.setItem(tokenStorageKey(permalink), b.readerToken);
          setPasswordRequired(false);
          setPrivateBlocked(false);
          if (!embed && typeof document !== "undefined") document.title = `${b.title} - MISA Flipbook`;
        })
        .catch((err) => {
          if (err instanceof ApiError && err.status === 403) {
            const body = err.body as PasswordRequiredBody;
            if (body?.privateBook) {
              // Sach dang Private (F16): thu lai 1 lan bang JWT dang nhap thuong (neu co
              // va chua thu) de nguoi la owner/admin van xem duoc qua chinh permalink nay -
              // xem logic tuong ung o public-books.controller.ts (resolveActor).
              const loginToken = !triedLoginToken ? getToken() : null;
              if (loginToken && loginToken !== token) {
                // The API exchanges this dashboard JWT for a limited reader token in
                // its JSON response. Do not retain or append the login credential.
                load(loginToken, true);
                return;
              }
              setPrivateBlocked(true);
              return;
            }
            if (body?.passwordRequired) {
              setPasswordRequired(true);
              return;
            }
          }
          setError(err instanceof ApiError ? err.message : t("errorLoadBook"));
        });
    },
    [permalink, embed, t]
  );

  useEffect(() => {
    const stored = typeof window !== "undefined" ? sessionStorage.getItem(tokenStorageKey(permalink)) : null;
    if (stored) setReaderToken(stored);
    load(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permalink]);

  useGoogleAnalytics(book?.gaId);

  useEffect(() => {
    if (!book || !readerToken || openPingedRef.current) return;
    openPingedRef.current = true;
    apiFetch(`/public/books/${permalink}/events`, {
      method: "POST",
      token: readerToken,
      body: { eventType: "open" },
    }).catch(() => {});
  }, [book, permalink, readerToken]);

  useEffect(() => {
    openPingedRef.current = false;
    lastPingedPageRef.current = null;
  }, [permalink]);

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    if (!passwordInput) return;
    setVerifying(true);
    setPasswordError(null);
    try {
      const res = await apiFetch<{ readerToken: string }>(`/public/books/${permalink}/verify-password`, {
        method: "POST",
        body: { password: passwordInput },
      });
      sessionStorage.setItem(tokenStorageKey(permalink), res.readerToken);
      setReaderToken(res.readerToken);
      setPasswordInput("");
      load(res.readerToken);
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : t("errorVerify"));
    } finally {
      setVerifying(false);
    }
  }

  if (privateBlocked) {
    return (
      <div className="reader" style={{ alignItems: "center", justifyContent: "center" }}>
        <div className="w-full max-w-[340px] rounded-lg bg-[var(--xds-bg)] p-5 text-center shadow-[var(--xds-shadow-dialog)]">
          <h2 className="mb-1 text-[16px] font-semibold leading-[22px] text-[var(--xds-text)]">{t("privateBookTitle")}</h2>
          <p className="text-[13px] text-[var(--xds-text-secondary)]">{t("privateBookDesc")}</p>
        </div>
      </div>
    );
  }

  if (passwordRequired) {
    return (
      <div className="reader" style={{ alignItems: "center", justifyContent: "center" }}>
        <form
          onSubmit={submitPassword}
          className="w-full max-w-[340px] rounded-lg bg-[var(--xds-bg)] p-5 shadow-[var(--xds-shadow-dialog)]"
        >
          <h2 className="mb-1 text-[16px] font-semibold leading-[22px] text-[var(--xds-text)]">{t("passwordRequiredTitle")}</h2>
          <p className="mb-4 text-[13px] text-[var(--xds-text-secondary)]">{t("passwordRequiredDesc")}</p>
          <XInput
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder={t("passwordPlaceholder")}
            autoFocus
            error={passwordError ?? undefined}
          />
          <XButton variant="primary" type="submit" size="lg" loading={verifying} disabled={!passwordInput} className="mt-4 w-full">
            {verifying ? t("unlocking") : t("unlock")}
          </XButton>
        </form>
      </div>
    );
  }

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
        <p>{t("loadingBook")}</p>
      </div>
    );
  }

  const tokenSuffix = readerToken ? `?token=${encodeURIComponent(readerToken)}` : "";
  // Trong embed (F09), link "chia se" nen tro ve trang doc day du (khong phai chinh
  // URL embed) - nguon chia se hop ly la ban thuc su, khong phai khung nhung ben trong
  // site khac. Ngoai embed, dung dung URL hien tai.
  const shareUrl = typeof window !== "undefined" ? canonicalReaderUrl(permalink, window.location.origin) : undefined;

  return (
    <FlipBook
      title={book.title}
      pages={book.pages}
      initialPage={initialPage}
      imageUrl={(assetId) => assetUrl(`/public/books/${permalink}/assets/${assetId}`) + tokenSuffix}
      shareUrl={embed ? undefined : shareUrl}
      downloadUrl={book.allowDownload ? assetUrl(`/public/books/${permalink}/download`) + tokenSuffix : null}
      backgroundUrl={book.hasBackground ? assetUrl(`/public/books/${permalink}/background`) + tokenSuffix : null}
      onPageChange={pingPageView}
    />
  );
}
