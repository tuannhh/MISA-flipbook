"use client";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { XIcon } from "./icons/XIcon";

export interface XSelectOption<T> {
  label: string;
  value: T;
  disabled?: boolean;
}

// Port truc tiep tu ui/components/XSelect.vue - DropDownList chuan XDS, chon tu danh
// sach (KHONG go tim), dung cho 4-8 lua chon (it hon -> Radio, nhieu hon -> Combobox).
export function XSelect<T extends string>({
  value,
  options,
  placeholder = "Chọn giá trị",
  disabled = false,
  error,
  onChange,
}: {
  value: T | null;
  options: XSelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [popoverStyle, setPopoverStyle] = useState<{ position: "fixed"; left: number; top: number; minWidth: number }>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  function updatePosition() {
    const trigger = triggerRef.current;
    const pop = popoverRef.current;
    if (!trigger || !pop) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 4;
    const popH = pop.offsetHeight;
    const popW = pop.offsetWidth;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < popH + gap && rect.top > popH + gap;
    let left = rect.left;
    if (left + popW > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - 8 - popW);
    }
    setPopoverStyle({
      position: "fixed",
      left,
      top: openUp ? rect.top - popH - gap : rect.bottom + gap,
      minWidth: rect.width,
    });
  }

  function openPopover() {
    if (disabled || open) return;
    setOpen(true);
    let idx = options.findIndex((o) => o.value === value && !o.disabled);
    if (idx < 0) idx = options.findIndex((o) => !o.disabled);
    setActiveIndex(idx);
  }

  function closePopover() {
    setOpen(false);
    setActiveIndex(-1);
  }

  function selectOption(opt: XSelectOption<T>) {
    if (opt.disabled) return;
    onChange(opt.value);
    closePopover();
    triggerRef.current?.focus();
  }

  function moveActive(dir: 1 | -1) {
    if (!options.length) return;
    let i = activeIndex;
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length;
      if (!options[i].disabled) {
        setActiveIndex(i);
        break;
      }
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        openPopover();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveActive(-1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (activeIndex >= 0) selectOption(options[activeIndex]);
        break;
      case "Escape":
        e.preventDefault();
        closePopover();
        break;
    }
  }

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        closePopover();
      }
    };
    const onReposition = () => updatePosition();
    document.addEventListener("mousedown", onDocMouseDown);
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="w-full">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        className={`flex h-[var(--xds-input-height)] w-full items-center justify-between gap-2 rounded-lg border px-3 text-left text-[13px] leading-[18px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--xds-brand-600)] ${
          error ? "border-[var(--xds-danger)]" : "border-[var(--xds-border)]"
        } ${
          disabled
            ? "cursor-not-allowed bg-[var(--xds-bg-disabled)]"
            : `cursor-pointer bg-[var(--xds-bg)]${!error ? " hover:border-[var(--xds-brand-600)]" : ""}`
        }`}
        onClick={() => (open ? closePopover() : openPopover())}
        onKeyDown={onKeyDown}
      >
        <span className={`truncate ${selectedOption && !disabled ? "text-[var(--xds-text)]" : "text-[var(--xds-text-placeholder)]"}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <XIcon name="chevron-down" size={16} className={`text-[var(--xds-icon-neutral)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            role="listbox"
            style={popoverStyle}
            className="z-[1000] max-h-[264px] w-max max-w-[min(480px,calc(100vw-16px))] overflow-y-auto rounded-xl border border-[var(--xds-border)] bg-[var(--xds-bg)] py-1 shadow-lg"
          >
            {options.length === 0 && (
              <div className="px-3 py-2 text-[13px] leading-[18px] text-[var(--xds-text-placeholder)]">Không có dữ liệu</div>
            )}
            {options.map((opt, i) => (
              <div
                key={String(opt.value)}
                role="option"
                aria-selected={opt.value === value}
                aria-disabled={opt.disabled || undefined}
                data-active={i === activeIndex}
                className={`flex h-8 items-center gap-2 whitespace-nowrap px-3 text-[13px] leading-[18px] ${
                  opt.disabled ? "cursor-not-allowed text-[var(--xds-text-placeholder)]" : "cursor-pointer"
                } ${!opt.disabled && i === activeIndex ? "bg-[var(--xds-bg-hover-soft)]" : ""} ${
                  opt.value === value && !opt.disabled
                    ? "font-medium text-[var(--xds-brand-600)]"
                    : !opt.disabled
                      ? "text-[var(--xds-text)]"
                      : ""
                }`}
                onMouseEnter={() => !opt.disabled && setActiveIndex(i)}
                onClick={() => selectOption(opt)}
              >
                <span className="flex-1">{opt.label}</span>
                {opt.value === value && <XIcon name="check" size={16} className="text-[var(--xds-brand-600)]" />}
              </div>
            ))}
          </div>,
          document.body
        )}

      {error && <p className="mt-1 text-[12px] leading-4 text-[var(--xds-danger)]">{error}</p>}
    </div>
  );
}
