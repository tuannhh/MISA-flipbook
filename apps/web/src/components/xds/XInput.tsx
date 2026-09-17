import { InputHTMLAttributes, ReactNode, useRef, useState } from "react";
import { XIcon } from "./icons/XIcon";

// Port truc tiep tu ui/components/XInput.vue
interface XInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "size" | "prefix"> {
  error?: string;
  clearable?: boolean;
  onClear?: () => void;
  prefix?: ReactNode;
  suffix?: ReactNode;
  containerClassName?: string;
}

export function XInput({
  error,
  clearable = false,
  onClear,
  prefix,
  suffix,
  disabled,
  readOnly,
  type = "text",
  value,
  onChange,
  containerClassName,
  onFocus,
  ...rest
}: XInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const actualType = isPassword && showPassword ? "text" : type;
  const hasValue = value !== "" && value !== null && value !== undefined;
  const showClear = clearable && hasValue && !disabled && !readOnly;

  return (
    <div className="w-full">
      <div
        className={`flex h-[var(--xds-input-height)] w-full items-center gap-2 rounded-lg border bg-[var(--xds-bg)] px-3 transition-colors ${
          error ? "border-[var(--xds-danger)]" : "border-[var(--xds-border)]"
        } ${
          disabled
            ? "cursor-not-allowed bg-[var(--xds-bg-disabled)]"
            : !readOnly && !error
              ? "hover:border-[var(--xds-brand-600)] focus-within:border-[var(--xds-brand-600)] focus-within:shadow-[0_0_0_3px_rgba(4,153,228,0.12)]"
              : ""
        } ${containerClassName ?? ""}`}
      >
        {prefix && (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--xds-icon-neutral)] [&>svg]:h-4 [&>svg]:w-4">
            {prefix}
          </span>
        )}

        <input
          ref={inputRef}
          type={actualType}
          disabled={disabled}
          readOnly={readOnly}
          value={value}
          onChange={onChange}
          className={`h-full w-full min-w-0 flex-1 bg-transparent text-[13px] leading-[18px] text-[var(--xds-text)] outline-none placeholder:text-[var(--xds-text-placeholder)] ${disabled ? "cursor-not-allowed" : ""}`}
          onFocus={(e) => {
            e.target.select();
            onFocus?.(e);
          }}
          {...rest}
        />

        {showClear && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Xóa nội dung"
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--xds-icon-neutral)] hover:text-[var(--xds-text)]"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onClear?.();
              inputRef.current?.focus();
            }}
          >
            <XIcon name="x" size={12} />
          </button>
        )}

        {isPassword && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--xds-icon-neutral)] hover:text-[var(--xds-text)]"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowPassword((v) => !v)}
          >
            <XIcon name={showPassword ? "eye-off" : "eye"} size={16} />
          </button>
        )}

        {suffix && (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--xds-icon-neutral)] [&>svg]:h-4 [&>svg]:w-4">
            {suffix}
          </span>
        )}
      </div>

      {error && <p className="mt-1 text-[12px] leading-4 text-[var(--xds-danger)]">{error}</p>}
    </div>
  );
}
