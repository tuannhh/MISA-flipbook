"use client";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "./icons/XIcon";

// Port truc tiep tu ui/components/XToast.vue - goc tren phai, toi da 3, tu dong
// dong sau 5s, rong toi da 400px. Dat <XToastProvider> 1 lan o layout goc.
type ToastType = "success" | "error" | "warning" | "info";
interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 5000;

const ToastContext = createContext<{ push: (type: ToastType, message: string) => void } | null>(null);

const ICON_BY_TYPE: Record<ToastType, string> = {
  success: "circle-check",
  error: "circle-x",
  warning: "alert-triangle",
  info: "info-circle",
};
const COLOR_BY_TYPE: Record<ToastType, string> = {
  success: "text-[var(--xds-success)]",
  error: "text-[var(--xds-danger)]",
  warning: "text-[var(--xds-warning)]",
  info: "text-[var(--xds-info)]",
};

export function XToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // Portal chi duoc tao SAU khi da hydrate xong (document luon "co" ngay o lan
  // render dau tren client, khac voi server - kiem tra truc tiep typeof document
  // trong JSX se gay lech cay giua server/client, xem loi that o XToast.tsx khi
  // test tay: "Hydration failed..." tren MOI trang vi provider nay dat o layout goc).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const remove = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (type: ToastType, message: string) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [{ id, type, message }, ...prev].slice(0, MAX_TOASTS));
      setTimeout(() => remove(id), AUTO_DISMISS_MS);
    },
    [remove]
  );

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      {mounted &&
        createPortal(
          <div className="pointer-events-none fixed right-4 top-4 z-[1100] flex flex-col items-end gap-2">
            {toasts.map((toast) => (
              <div
                key={toast.id}
                role="status"
                className="pointer-events-auto flex max-w-[400px] items-start gap-2 rounded-lg bg-[var(--xds-bg)] py-2.5 pl-3 pr-2 shadow-lg ring-1 ring-[var(--xds-border)]"
              >
                <XIcon name={ICON_BY_TYPE[toast.type] as never} size={20} className={`mt-px ${COLOR_BY_TYPE[toast.type]}`} />
                <p className="min-w-0 flex-1 text-[13px] leading-[18px] text-[var(--xds-text)]">{toast.message}</p>
                <button
                  type="button"
                  aria-label="Đóng thông báo"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--xds-icon-neutral)] hover:bg-[var(--xds-bg-hover-soft)] hover:text-[var(--xds-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--xds-brand-600)]"
                  onClick={() => remove(toast.id)}
                >
                  <XIcon name="x" size={16} />
                </button>
              </div>
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast phai duoc dung ben trong XToastProvider");
  return ctx.push;
}
