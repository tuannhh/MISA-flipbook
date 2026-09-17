"use client";
import { ReactNode } from "react";
import { XIcon } from "@/components/xds/icons/XIcon";

// Top bar rieng cho mobile (mobile-native-app.md / mobile-pwa.md): 56px + safe
// area, nut Back 48x48, tieu de rut gon 1 dong, toi da 2 hanh dong ben phai.
// KHONG dung XHeaderBar desktop tren mobile - day la thanh phan rieng.
export function MobileTopBar({
  title,
  onBack,
  actions,
}: {
  title: string;
  onBack?: () => void;
  actions?: ReactNode;
}) {
  return (
    <header
      className="flex shrink-0 items-center gap-1 border-b border-[var(--xds-border-light)] bg-[var(--xds-bg)] px-2"
      style={{
        height: "calc(56px + var(--xds-mobile-safe-top))",
        paddingTop: "var(--xds-mobile-safe-top)",
      }}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Quay lại"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-[var(--xds-icon-neutral)] hover:bg-[var(--xds-bg-hover-soft)]"
        >
          <XIcon name="chevron-left" size={24} />
        </button>
      )}
      <h1 className="xds-mobile-single-line min-w-0 flex-1 px-1 text-[20px] font-semibold leading-7 text-[var(--xds-text)]">
        {title}
      </h1>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  );
}
