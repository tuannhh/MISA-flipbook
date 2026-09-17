import { TextareaHTMLAttributes } from "react";

// Port truc tiep tu ui/components/XTextarea.vue
interface XTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> {
  error?: string;
  className?: string;
}

export function XTextarea({ error, disabled, maxLength, value, rows = 3, className, ...rest }: XTextareaProps) {
  const length = typeof value === "string" ? value.length : 0;
  return (
    <div className="relative w-full">
      <textarea
        rows={rows}
        maxLength={maxLength}
        value={value}
        disabled={disabled}
        className={`w-full resize-y rounded-lg border bg-[var(--xds-bg)] px-3 py-[7px] text-[13px] leading-[18px] text-[var(--xds-text)] outline-none transition-colors placeholder:text-[var(--xds-text-placeholder)] ${
          error
            ? "border-[var(--xds-danger)]"
            : "border-[var(--xds-border)] focus:border-[var(--xds-brand-600)] focus:shadow-[0_0_0_2px_var(--xds-brand-100)]"
        } ${disabled ? "cursor-not-allowed bg-[var(--xds-bg-disabled)]" : ""} ${maxLength ? "pb-5" : ""} ${className ?? ""}`}
        onFocus={(e) => e.target.select()}
        {...rest}
      />
      {maxLength && (
        <span
          className="pointer-events-none absolute bottom-2 right-3 text-[12px] leading-4 text-[var(--xds-text-placeholder)]"
          title={`Còn lại ${maxLength - length} ký tự`}
        >
          {length}/{maxLength}
        </span>
      )}
      {error && <p className="mt-1 text-[12px] leading-4 text-[var(--xds-danger)]">{error}</p>}
    </div>
  );
}
