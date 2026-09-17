"use client";
import { ReactNode } from "react";
import { XIcon } from "./icons/XIcon";

// Port truc tiep tu ui/components/XHeaderBar.vue. showSearch mac dinh false cho
// app nay (chua co nhu cau tim kiem da sach) - khac ban goc (default true) vi
// XDS chi bat buoc vi tri/kich thuoc cum phai, khong bat buoc phai co o tim kiem.
export function XHeaderBar({
  variant = "brand",
  appName,
  onLogoClick,
  onSettingsClick,
  showSettings = true,
  actions,
  user,
}: {
  variant?: "brand" | "light";
  appName: string;
  onLogoClick?: () => void;
  onSettingsClick?: () => void;
  showSettings?: boolean;
  actions?: ReactNode;
  user?: ReactNode;
}) {
  const isBrand = variant === "brand";
  const headerClass = isBrand ? "bg-[var(--xds-brand-600)] text-white" : "border-b border-[var(--xds-border)] bg-[var(--xds-bg)] text-[var(--xds-text)]";
  const buttonClass = isBrand
    ? "text-white hover:bg-white/15 focus-visible:outline-white"
    : "text-[var(--xds-icon-neutral)] hover:bg-[var(--xds-bg-hover-soft)] focus-visible:outline-[var(--xds-brand-600)]";

  return (
    <header className={`flex h-12 w-full items-center gap-2 px-4 text-[13px] leading-[18px] ${headerClass}`}>
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          title={appName}
          onClick={onLogoClick}
          className={`flex shrink-0 items-center gap-3 rounded-lg px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${buttonClass}`}
        >
          <span className="flex h-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white px-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/misa-logo.jpg" alt="MISA" className="h-6 w-auto object-contain" />
          </span>
          <span className="hidden text-[20px] font-semibold leading-7 sm:block">{appName}</span>
        </button>
      </div>

      <div className="min-w-0 flex-1" />

      <div className="flex shrink-0 items-center gap-2">
        {actions}
        {showSettings && (
          <button
            type="button"
            title="Cài đặt"
            aria-label="Cài đặt"
            onClick={onSettingsClick}
            className={`grid h-8 w-8 place-items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${buttonClass}`}
          >
            <XIcon name="settings" size={20} />
          </button>
        )}
        {user}
      </div>
    </header>
  );
}
