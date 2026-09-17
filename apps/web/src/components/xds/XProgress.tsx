// Port truc tiep tu ui/components/XProgress.vue
export function XProgress({ value, label }: { value: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="flex w-full items-center gap-2">
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--xds-bg-disabled)]"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-[var(--xds-brand-600)] transition-[width] duration-300 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {label && <span className="shrink-0 text-[12px] leading-[18px] text-[var(--xds-text)]">{label}</span>}
    </div>
  );
}
