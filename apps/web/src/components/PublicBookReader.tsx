"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, ApiError, assetUrl } from "@/lib/api";
import type { PublicBook } from "@/lib/types";
import { FlipBook } from "@/components/FlipBook";
import { XInput } from "@/components/xds/XInput";
import { XButton } from "@/components/xds/XButton";

interface PasswordRequiredBody {
  passwordRequired?: boolean;
}

function tokenStorageKey(permalink: string): string {
  return `flipbook-access-token:${permalink}`;
}

/**
 * Logic doc sach cong khai dung chung cho /read/:permalink (trang doc binh thuong)
 * va /read/:permalink/embed (F09, nhung trong iframe nhung site khac) - F05 yeu cau
 * ca 2 duong deu phai giu nguyen kiem tra mat khau ("giu day du mat khau/quyen" trong
 * PLAN.md), nen tach logic fetch/xac thuc ra day thay vi chep lai 2 lan.
 */
export function PublicBookReader({ permalink, embed = false }: { permalink: string; embed?: boolean }) {
  const t = useTranslations("reader");
  const [book, setBook] = useState<PublicBook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const load = useCallback(
    (token?: string | null) => {
      setError(null);
      apiFetch<PublicBook>(`/public/books/${permalink}`, token ? { token } : {})
        .then((b) => {
          setBook(b);
          setPasswordRequired(false);
          if (!embed && typeof document !== "undefined") document.title = `${b.title} - MISA Flipbook`;
        })
        .catch((err) => {
          if (err instanceof ApiError && err.status === 403 && (err.body as PasswordRequiredBody)?.passwordRequired) {
            setPasswordRequired(true);
            return;
          }
          setError(err instanceof ApiError ? err.message : t("errorLoadBook"));
        });
    },
    [permalink, embed, t]
  );

  useEffect(() => {
    const stored = typeof window !== "undefined" ? sessionStorage.getItem(tokenStorageKey(permalink)) : null;
    if (stored) setAccessToken(stored);
    load(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permalink]);

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    if (!passwordInput) return;
    setVerifying(true);
    setPasswordError(null);
    try {
      const res = await apiFetch<{ accessToken: string }>(`/public/books/${permalink}/verify-password`, {
        method: "POST",
        body: { password: passwordInput },
      });
      sessionStorage.setItem(tokenStorageKey(permalink), res.accessToken);
      setAccessToken(res.accessToken);
      setPasswordInput("");
      load(res.accessToken);
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : t("errorVerify"));
    } finally {
      setVerifying(false);
    }
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

  const tokenSuffix = accessToken ? `?token=${encodeURIComponent(accessToken)}` : "";
  // Trong embed (F09), link "chia se" nen tro ve trang doc day du (khong phai chinh
  // URL embed) - nguon chia se hop ly la ban thuc su, khong phai khung nhung ben trong
  // site khac. Ngoai embed, dung dung URL hien tai.
  const shareUrl =
    typeof window !== "undefined" ? (embed ? window.location.href.replace(/\/embed\/?$/, "") : window.location.href) : undefined;

  return (
    <FlipBook
      title={book.title}
      pages={book.pages}
      imageUrl={(assetId) => assetUrl(`/public/books/${permalink}/assets/${assetId}`) + tokenSuffix}
      shareUrl={embed ? undefined : shareUrl}
      downloadUrl={book.allowDownload ? assetUrl(`/public/books/${permalink}/download`) + tokenSuffix : null}
    />
  );
}
