"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { XIcon } from "@/components/xds/icons/XIcon";
import { XDropdownMenu } from "@/components/xds/XDropdownMenu";
import { XSettingsDialog } from "@/components/xds/XSettingsDialog";

// Cum hanh dong ben phai MobileTopBar (toi da 2 nut theo mobile-native-app.md):
// Cai dat (gear) + menu tai khoan (Dang xuat). Dung chung cho dashboard + chi
// tiet sach o layout mobile.
export function MobileHeaderActions({ onLogout, isAdmin }: { onLogout: () => void; isAdmin?: boolean }) {
  const t = useTranslations("common");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const menuItems = isAdmin
    ? [
        { key: "admin", label: t("adminDashboard"), icon: "settings" as const, href: "/admin" },
        { key: "logout", label: t("logout"), icon: "logout" as const, danger: true, onSelect: onLogout },
      ]
    : [{ key: "logout", label: t("logout"), icon: "logout" as const, danger: true, onSelect: onLogout }];

  return (
    <>
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        title={t("settingsTitle")}
        aria-label={t("settingsTitle")}
        className="flex h-12 w-12 items-center justify-center rounded-lg text-[var(--xds-icon-neutral)] hover:bg-[var(--xds-bg-hover-soft)]"
      >
        <XIcon name="settings" size={22} />
      </button>
      <XDropdownMenu items={menuItems}>
        {({ toggle }) => (
          <button
            type="button"
            onClick={toggle}
            title={t("logout")}
            aria-label={t("logout")}
            className="flex h-12 w-12 items-center justify-center rounded-lg text-[var(--xds-icon-neutral)] hover:bg-[var(--xds-bg-hover-soft)]"
          >
            <XIcon name="dots-vertical" size={22} />
          </button>
        )}
      </XDropdownMenu>
      <XSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
