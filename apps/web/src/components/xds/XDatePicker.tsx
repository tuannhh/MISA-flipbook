"use client";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { XIcon } from "./icons/XIcon";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDate(d: Date | null): string {
  return d ? `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}` : "";
}

function parseDate(text: string): Date | null {
  const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDay(a: Date | null, b: Date | null): boolean {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

// Port truc tiep tu ui/components/XDatePicker.vue - dinh dang dd/MM/yyyy, go tay hoac
// chon tren lich popover, KHONG co nut Dong y (chon ngay = submit + dong popover luon).
export function XDatePicker({
  value,
  placeholder = "dd/mm/yyyy",
  disabled = false,
  error,
  min,
  max,
  onChange,
}: {
  value: Date | null;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  min?: Date | null;
  max?: Date | null;
  onChange: (value: Date | null) => void;
}) {
  const today = startOfDay(new Date());
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"days" | "months" | "years">("days");
  const [inputText, setInputText] = useState(formatDate(value));
  const [viewMonth, setViewMonth] = useState((value ?? today).getMonth());
  const [viewYear, setViewYear] = useState((value ?? today).getFullYear());
  const [yearPageStart, setYearPageStart] = useState(0);
  const [popoverStyle, setPopoverStyle] = useState<{ position: "fixed"; left: number; top: number }>();
  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputText(formatDate(value));
  }, [value]);

  function isOutOfRange(d: Date): boolean {
    if (min && startOfDay(d) < startOfDay(min)) return true;
    if (max && startOfDay(d) > startOfDay(max)) return true;
    return false;
  }

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
    setPopoverStyle({ position: "fixed", left, top: openUp ? rect.top - popH - gap : rect.bottom + gap });
  }

  function openPopover() {
    if (disabled || open) return;
    setOpen(true);
    setView("days");
    const base = value ?? today;
    setViewMonth(base.getMonth());
    setViewYear(base.getFullYear());
  }

  function closePopover() {
    setOpen(false);
    setView("days");
  }

  function setValue(d: Date | null) {
    if (!isSameDay(d, value)) onChange(d);
    setInputText(formatDate(d));
  }

  function selectDay(d: Date, isDisabled: boolean) {
    if (isDisabled) return;
    setValue(startOfDay(d));
    closePopover();
  }

  function selectToday() {
    if (isOutOfRange(today)) return;
    setValue(today);
    closePopover();
  }

  function changeMonth(dir: 1 | -1) {
    const d = new Date(viewYear, viewMonth + dir, 1);
    setViewMonth(d.getMonth());
    setViewYear(d.getFullYear());
  }

  function openYearsView() {
    setYearPageStart(viewYear - (viewYear % 12));
    setView("years");
  }

  function commitInput() {
    const text = inputText.trim();
    if (!text) {
      setValue(null);
      return;
    }
    const d = parseDate(text);
    if (d && !isOutOfRange(d)) {
      setValue(d);
      setViewMonth(d.getMonth());
      setViewYear(d.getFullYear());
    } else {
      setInputText(formatDate(value));
    }
  }

  function clear() {
    setValue(null);
    inputRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) closePopover();
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
  }, [open, view]);

  const first = new Date(viewYear, viewMonth, 1);
  const offset = (first.getDay() + 6) % 7;
  const dayCells = Array.from({ length: 42 }, (_, i) => {
    const date = new Date(viewYear, viewMonth, 1 - offset + i);
    return {
      date,
      inMonth: date.getMonth() === viewMonth,
      isToday: isSameDay(date, today),
      isSelected: isSameDay(date, value),
      isDisabled: isOutOfRange(date),
    };
  });
  const yearCells = Array.from({ length: 12 }, (_, i) => yearPageStart + i);

  return (
    <div className="w-full">
      <div
        ref={triggerRef}
        className={`flex h-[var(--xds-input-height)] w-full items-center gap-2 rounded-lg border bg-[var(--xds-bg)] px-3 transition-colors ${
          error ? "border-[var(--xds-danger)]" : "border-[var(--xds-border)]"
        } ${
          disabled
            ? "cursor-not-allowed bg-[var(--xds-bg-disabled)]"
            : !error
              ? "hover:border-[var(--xds-brand-600)] focus-within:border-[var(--xds-brand-600)]"
              : ""
        }`}
        onClick={() => !disabled && inputRef.current?.focus()}
      >
        <XIcon name="calendar" size={16} className="text-[var(--xds-icon-neutral)]" />
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          placeholder={placeholder}
          disabled={disabled}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="dialog"
          className={`h-full w-full min-w-0 flex-1 bg-transparent text-[13px] leading-[18px] text-[var(--xds-text)] outline-none placeholder:text-[var(--xds-text-placeholder)] ${disabled ? "cursor-not-allowed" : ""}`}
          onChange={(e) => setInputText(e.target.value)}
          onFocus={(e) => {
            e.target.select();
            openPopover();
          }}
          onBlur={commitInput}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitInput();
              closePopover();
            } else if (e.key === "Escape") {
              e.preventDefault();
              closePopover();
            }
          }}
        />
        {value && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Xóa ngày"
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--xds-icon-neutral)] hover:text-[var(--xds-text)]"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              clear();
            }}
          >
            <XIcon name="x" size={12} />
          </button>
        )}
      </div>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Chọn ngày"
            style={popoverStyle}
            className="z-[1000] w-[240px] rounded-xl border border-[var(--xds-border)] bg-[var(--xds-bg)] py-2 shadow-lg"
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="flex items-center justify-between px-2 pb-2">
              <button
                type="button"
                aria-label="Tháng trước"
                className="flex h-6 w-6 items-center justify-center rounded text-[var(--xds-icon-neutral)] hover:bg-[var(--xds-bg-hover-soft)]"
                onClick={() => (view === "years" ? setYearPageStart((s) => s - 12) : view === "months" ? setViewYear((y) => y - 1) : changeMonth(-1))}
              >
                <XIcon name="chevron-left" size={16} />
              </button>
              <div className="flex items-center gap-1 text-[13px] leading-[18px] font-medium text-[var(--xds-text)]">
                {view === "days" && (
                  <>
                    <button type="button" className="rounded px-1 py-0.5 hover:bg-[var(--xds-bg-hover-soft)]" onClick={() => setView("months")}>
                      Tháng {viewMonth + 1},
                    </button>
                    <button type="button" className="rounded px-1 py-0.5 hover:bg-[var(--xds-bg-hover-soft)]" onClick={openYearsView}>
                      {viewYear}
                    </button>
                  </>
                )}
                {view === "months" && (
                  <button type="button" className="rounded px-1 py-0.5 hover:bg-[var(--xds-bg-hover-soft)]" onClick={openYearsView}>
                    {viewYear}
                  </button>
                )}
                {view === "years" && (
                  <span className="px-1 py-0.5">
                    {yearPageStart} - {yearPageStart + 11}
                  </span>
                )}
              </div>
              <button
                type="button"
                aria-label="Tháng sau"
                className="flex h-6 w-6 items-center justify-center rounded text-[var(--xds-icon-neutral)] hover:bg-[var(--xds-bg-hover-soft)]"
                onClick={() => (view === "years" ? setYearPageStart((s) => s + 12) : view === "months" ? setViewYear((y) => y + 1) : changeMonth(1))}
              >
                <XIcon name="chevron-right" size={16} />
              </button>
            </div>

            <div className="border-t border-[var(--xds-border)]" />

            {view === "days" && (
              <>
                <div className="grid grid-cols-7 px-2 pt-2">
                  {WEEKDAYS.map((wd) => (
                    <div
                      key={wd}
                      className={`flex h-8 w-8 items-center justify-center text-[13px] leading-[18px] font-medium ${wd === "CN" ? "text-[var(--xds-danger)]" : "text-[var(--xds-text)]"}`}
                    >
                      {wd}
                    </div>
                  ))}
                  {dayCells.map((cell) => (
                    <button
                      key={cell.date.getTime()}
                      type="button"
                      disabled={cell.isDisabled}
                      aria-label={formatDate(cell.date)}
                      className={`flex h-8 w-8 items-center justify-center rounded text-[13px] leading-[18px] ${
                        cell.isSelected
                          ? "bg-[var(--xds-brand-600)] font-medium text-white"
                          : cell.isDisabled
                            ? "cursor-not-allowed text-[var(--xds-text-placeholder)]"
                            : cell.isToday
                              ? "border border-[var(--xds-brand-600)] font-medium text-[var(--xds-brand-600)] hover:bg-[var(--xds-bg-hover-soft)]"
                              : cell.inMonth
                                ? "text-[var(--xds-text)] hover:bg-[var(--xds-bg-hover-soft)]"
                                : "text-[var(--xds-text-placeholder)] hover:bg-[var(--xds-bg-hover-soft)]"
                      }`}
                      onClick={() => selectDay(cell.date, cell.isDisabled)}
                    >
                      {cell.date.getDate()}
                    </button>
                  ))}
                </div>
                <div className="mt-2 border-t border-[var(--xds-border)]" />
                <div className="flex justify-center px-2 pt-2">
                  <button
                    type="button"
                    className="rounded px-2 py-1 text-[13px] leading-[18px] font-medium text-[var(--xds-brand-600)] hover:bg-[var(--xds-bg-hover-soft)]"
                    onClick={selectToday}
                  >
                    Hôm nay
                  </button>
                </div>
              </>
            )}

            {view === "months" && (
              <div className="grid grid-cols-3 gap-1 px-2 pt-2">
                {Array.from({ length: 12 }, (_, i) => i).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`flex h-8 items-center justify-center rounded text-[13px] leading-[18px] ${
                      m === viewMonth ? "bg-[var(--xds-brand-600)] font-medium text-white" : "text-[var(--xds-text)] hover:bg-[var(--xds-bg-hover-soft)]"
                    }`}
                    onClick={() => {
                      setViewMonth(m);
                      setView("days");
                    }}
                  >
                    Thg {m + 1}
                  </button>
                ))}
              </div>
            )}

            {view === "years" && (
              <div className="grid grid-cols-3 gap-1 px-2 pt-2">
                {yearCells.map((y) => (
                  <button
                    key={y}
                    type="button"
                    className={`flex h-8 items-center justify-center rounded text-[13px] leading-[18px] ${
                      y === viewYear ? "bg-[var(--xds-brand-600)] font-medium text-white" : "text-[var(--xds-text)] hover:bg-[var(--xds-bg-hover-soft)]"
                    }`}
                    onClick={() => {
                      setViewYear(y);
                      setView("months");
                    }}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}
          </div>,
          document.body
        )}

      {error && <p className="mt-1 text-[12px] leading-4 text-[var(--xds-danger)]">{error}</p>}
    </div>
  );
}
