"use client";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { XDialog } from "./XDialog";
import { XButton } from "./XButton";
import { setLocaleCookie } from "@/i18n/switchLocale";
import type { Locale } from "@/i18n/config";

// Dialog "Cai dat" toi gian mo tu nut Settings (gear) tren XHeaderBar - chi gom
// bo chon ngon ngu (Viet/Anh). Khong lam chon theme/mat do hien thi (ngoai pham
// vi yeu cau hien tai, xem ke hoach muc 5 "Khong lam").
export function XSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();

  function chooseLocale(next: Locale) {
    if (next === locale) return;
    setLocaleCookie(next);
    router.refresh();
  }

  return (
    <XDialog open={open} onOpenChange={onOpenChange} title={t("settingsTitle")} width={360} footer={<></>}>
      <div className="pb-2">
        <p className="mb-2 text-[13px] font-medium text-[var(--xds-text)]">{t("language")}</p>
        <div className="flex gap-2">
          <XButton
            variant={locale === "vi" ? "primary" : "neutral"}
            className="flex-1"
            onClick={() => chooseLocale("vi")}
          >
            {t("vietnamese")}
          </XButton>
          <XButton
            variant={locale === "en" ? "primary" : "neutral"}
            className="flex-1"
            onClick={() => chooseLocale("en")}
          >
            {t("english")}
          </XButton>
        </div>
      </div>
    </XDialog>
  );
}
