"use client";
import { ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "./icons/XIcon";

// Port truc tiep tu ui/components/XDialog.vue. Khong dung <Transition>/Teleport
// cua Vue - dung createPortal + CSS transition don gian (opacity/scale) tuong duong.
export function XDialog({
  open,
  onOpenChange,
  title,
  width = "480px",
  type = "default",
  confirmText,
  cancelText = "Hủy",
  onConfirm,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  width?: string | number;
  type?: "default" | "confirm" | "danger";
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusDialog = window.setTimeout(() => {
      const initial = dialogRef.current?.querySelector<HTMLElement>("[autofocus], [data-dialog-initial-focus]");
      const fallback = dialogRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
      );
      (initial ?? fallback ?? dialogRef.current)?.focus();
    }, 0);
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) {
        e.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeydown);
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(focusDialog);
      document.removeEventListener("keydown", onKeydown);
      document.body.style.overflow = "";
      returnFocusRef.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const widthStyle = typeof width === "number" ? `${width}px` : width;
  const primaryLabel = confirmText || (type === "danger" ? "Xóa" : type === "confirm" ? "Đồng ý" : "Đóng");
  const showCancel = type !== "default";

  function handleConfirm() {
    onConfirm?.();
    onOpenChange(false);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="flex max-h-[calc(100vh-64px)] w-full flex-col rounded-lg bg-[var(--xds-bg)] shadow-xl"
        style={{ maxWidth: widthStyle }}
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-4">
          <h3 className="line-clamp-2 text-[16px] font-semibold leading-[22px] text-[var(--xds-text)]">{title}</h3>
          <button
            type="button"
            className="-mr-1 -mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--xds-icon-neutral)] hover:bg-[var(--xds-bg-hover-soft)] hover:text-[var(--xds-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--xds-brand-600)]"
            aria-label="Đóng"
            onClick={() => onOpenChange(false)}
          >
            <XIcon name="x" size={16} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-2 text-[13px] leading-[18px] text-[var(--xds-text)]">{children}</div>

        <div className="flex items-center justify-end gap-2 px-5 pb-4 pt-3">
          {footer !== undefined ? (
            footer
          ) : (
            <>
              {showCancel && (
                <button
                  type="button"
                  className="h-8 min-w-[80px] rounded-lg border border-[var(--xds-border)] bg-[var(--xds-bg)] px-[14px] text-[13px] font-medium leading-[18px] text-[var(--xds-text)] hover:bg-[var(--xds-bg-hover-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--xds-brand-600)]"
                  onClick={() => onOpenChange(false)}
                >
                  {cancelText}
                </button>
              )}
              <button
                type="button"
                className={`h-8 min-w-[80px] rounded-lg px-[14px] text-[13px] font-medium leading-[18px] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--xds-brand-600)] ${
                  type === "danger"
                    ? "bg-[var(--xds-danger)] hover:brightness-95 active:brightness-90"
                    : "bg-[var(--xds-brand-600)] hover:bg-[var(--xds-brand-700)] active:bg-[var(--xds-brand-800)]"
                }`}
                onClick={handleConfirm}
              >
                {primaryLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
