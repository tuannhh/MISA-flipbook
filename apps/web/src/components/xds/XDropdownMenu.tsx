"use client";
import { ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "./icons/XIcon";
import type { IconName } from "./icons/paths";

// Ban rut gon cua ui/components/XDropdownMenu.vue - giu dung phan quan trong nhat
// cho UX (dinh vi theo activator, dong khi click ngoai/Esc, radius 12px popup),
// bo qua dieu huong ban phim mui ten day du cua ban goc de gon nhe cho quy mo app.
export interface XDropdownItem {
  key: string;
  label: string;
  icon?: IconName;
  href?: string;
  target?: string;
  rel?: string;
  danger?: boolean;
  onSelect?: () => void;
}

export function XDropdownMenu({
  items,
  align = "end",
  children,
}: {
  items: XDropdownItem[];
  align?: "end" | "start";
  children: (props: { open: boolean; toggle: () => void }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const activatorRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function updatePosition() {
    const anchor = activatorRef.current?.firstElementChild as HTMLElement | null;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const menuWidth = menuRef.current?.offsetWidth ?? 200;
    const left = align === "end" ? rect.right - menuWidth : rect.left;
    setPos({ top: rect.bottom + 4, left: Math.min(Math.max(left, 8), window.innerWidth - 8 - menuWidth) });
  }

  useEffect(() => {
    if (!open) return;
    updatePosition();
    function onDocMouseDown(e: MouseEvent) {
      if (activatorRef.current?.contains(e.target as Node) || menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeydown);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeydown);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <span ref={activatorRef} className="contents">
        {children({ open, toggle: () => setOpen((v) => !v) })}
      </span>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: "fixed", top: pos.top, left: pos.left }}
            className="z-[1000] max-h-[320px] min-w-[180px] overflow-y-auto rounded-xl border border-[var(--xds-border)] bg-[var(--xds-bg)] py-1 shadow-lg outline-none"
          >
            {items.map((item) =>
              item.href ? (
                <a
                  key={item.key}
                  href={item.href}
                  target={item.target}
                  rel={item.rel}
                  role="menuitem"
                  className={`flex h-8 cursor-pointer items-center gap-2 whitespace-nowrap px-3 text-[13px] leading-[18px] hover:bg-[var(--xds-bg-hover-soft)] ${
                    item.danger ? "text-[var(--xds-danger)]" : "text-[var(--xds-text)]"
                  }`}
                  onClick={() => setOpen(false)}
                >
                  {item.icon && <XIcon name={item.icon} size={16} className={item.danger ? "" : "text-[var(--xds-icon-neutral)]"} />}
                  <span className="flex-1">{item.label}</span>
                </a>
              ) : (
                <div
                  key={item.key}
                  role="menuitem"
                  className={`flex h-8 cursor-pointer items-center gap-2 whitespace-nowrap px-3 text-[13px] leading-[18px] hover:bg-[var(--xds-bg-hover-soft)] ${
                    item.danger ? "text-[var(--xds-danger)]" : "text-[var(--xds-text)]"
                  }`}
                  onClick={() => {
                    item.onSelect?.();
                    setOpen(false);
                  }}
                >
                  {item.icon && <XIcon name={item.icon} size={16} className={item.danger ? "" : "text-[var(--xds-icon-neutral)]"} />}
                  <span className="flex-1">{item.label}</span>
                </div>
              )
            )}
          </div>,
          document.body
        )}
    </>
  );
}
