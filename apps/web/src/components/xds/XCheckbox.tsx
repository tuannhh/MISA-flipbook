// Port truc tiep tu ui/components/XCheckbox.vue
export function XCheckbox({
  checked,
  onChange,
  disabled,
  error,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  error?: string;
  label?: React.ReactNode;
}) {
  const boxClass = checked
    ? disabled
      ? "border-[var(--xds-bg-disabled)] bg-[var(--xds-bg-disabled)]"
      : "border-[var(--xds-brand-600)] bg-[var(--xds-brand-600)]"
    : `${error ? "border-[var(--xds-danger)]" : "border-[var(--xds-border)]"} ${
        disabled ? "bg-[var(--xds-bg-disabled)]" : "bg-[var(--xds-bg)] hover:border-[var(--xds-brand-600)]"
      }`;

  return (
    <>
      <label className={`inline-flex items-start gap-2 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className={`mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${boxClass}`}>
          {checked && (
            <svg width={12} height={12} viewBox="0 0 16 16" fill="none" className={disabled ? "text-[var(--xds-text-placeholder)]" : "text-[var(--xds-bg)]"}>
              <path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        {label && (
          <span className={`select-none text-[13px] leading-[18px] ${disabled ? "text-[var(--xds-text-placeholder)]" : "text-[var(--xds-text)]"}`}>
            {label}
          </span>
        )}
      </label>
      {error && <p className="mt-1 text-[12px] leading-4 text-[var(--xds-danger)]">{error}</p>}
    </>
  );
}
