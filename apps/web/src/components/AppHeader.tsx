"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { XHeaderBar } from "@/components/xds/XHeaderBar";
import { XSettingsDialog } from "@/components/xds/XSettingsDialog";
import { XDropdownMenu } from "@/components/xds/XDropdownMenu";
import { XIcon } from "@/components/xds/icons/XIcon";

// Header desktop dung chung cho dashboard + chi tiet sach (P1-6, khong dung
// Sidebar - app chi co 1 khu vuc dieu huong phang, xem ke hoach muc 4).
export function AppHeader({ onLogoClick, onLogout }: { onLogoClick?: () => void; onLogout: () => void }) {
  const t = useTranslations("common");
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <XHeaderBar
        appName={t("appName")}
        onLogoClick={onLogoClick}
        onSettingsClick={() => setSettingsOpen(true)}
        user={
          <XDropdownMenu
            items={[{ key: "logout", label: t("logout"), icon: "logout", danger: true, onSelect: onLogout }]}
          >
            {({ toggle }) => (
              <button
                type="button"
                onClick={toggle}
                title={t("logout")}
                aria-label={t("logout")}
                className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-white/20 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <span className="flex h-full w-full items-center justify-center">
                  <XIcon name="dots-vertical" size={18} />
                </span>
              </button>
            )}
          </XDropdownMenu>
        }
      />
      <XSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
