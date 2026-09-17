import { ButtonHTMLAttributes, ReactNode } from "react";
import { XSpinner } from "./XSpinner";

// Port truc tiep tu ui/components/XButton.vue - giu nguyen ten variant/size va
// chuoi class Tailwind (tham chieu var(--xds-*), khong hard-code hex).
export type XButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "neutral"
  | "ghost"
  | "success"
  | "warning"
  | "danger"
  | "ai"
  | "link"
  | "icon";

interface XButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: XButtonVariant;
  size?: "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

function sizeClasses(variant: XButtonVariant, size: "md" | "lg") {
  if (variant === "icon") {
    return size === "lg"
      ? "h-[calc(var(--xds-btn-height)+8px)] w-[calc(var(--xds-btn-height)+8px)]"
      : "h-[var(--xds-btn-height)] w-[var(--xds-btn-height)]";
  }
  return size === "lg"
    ? "h-[calc(var(--xds-btn-height)+8px)] min-w-[88px] px-4"
    : "h-[var(--xds-btn-height)] min-w-[80px] px-[14px]";
}

function variantClasses(variant: XButtonVariant, disabled: boolean) {
  if (disabled) {
    if (variant === "link" || variant === "icon" || variant === "ghost") {
      return "text-[var(--xds-text-placeholder)] cursor-not-allowed";
    }
    return "bg-[var(--xds-bg-disabled)] text-[var(--xds-text-placeholder)] cursor-not-allowed";
  }
  switch (variant) {
    case "primary":
      return "bg-[var(--xds-brand-600)] text-white hover:bg-[var(--xds-brand-700)] active:bg-[var(--xds-brand-800)]";
    case "outline":
      return "bg-[var(--xds-bg)] text-[var(--xds-brand-600)] border border-[var(--xds-brand-600)] hover:bg-[var(--xds-bg-brand-brand-light)] active:bg-[var(--xds-brand-100)]";
    case "neutral":
    case "secondary":
      return "bg-[var(--xds-bg)] text-[var(--xds-text)] border border-[var(--xds-border)] hover:bg-[var(--xds-bg-hover-soft)] active:bg-[var(--xds-brand-100)]";
    case "ghost":
      return "bg-transparent text-[var(--xds-text-secondary)] hover:bg-[var(--xds-bg-hover-soft)] active:bg-[var(--xds-brand-100)]";
    case "success":
      return "bg-[var(--xds-success)] text-white hover:brightness-95 active:brightness-90";
    case "warning":
      return "bg-[var(--xds-warning)] text-white hover:brightness-95 active:brightness-90";
    case "danger":
      return "bg-[var(--xds-danger)] text-white hover:brightness-95 active:brightness-90";
    case "ai":
      return "text-white bg-[linear-gradient(110deg,#1482FF_0%,#CF11FF_100%)] hover:brightness-90 active:brightness-80";
    case "link":
      return "text-[var(--xds-brand-600)] hover:underline active:text-[var(--xds-brand-800)]";
    case "icon":
      return "text-[var(--xds-icon-neutral)] hover:bg-[var(--xds-bg-hover-soft)] active:bg-[var(--xds-brand-100)]";
    default:
      return "bg-[var(--xds-bg)] text-[var(--xds-text)] border border-[var(--xds-border)] hover:bg-[var(--xds-bg-hover-soft)] active:bg-[var(--xds-brand-100)]";
  }
}

export function XButton({
  variant = "secondary",
  size = "md",
  loading = false,
  disabled = false,
  icon,
  className,
  children,
  type = "button",
  ...rest
}: XButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`xds-button inline-flex max-w-full shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-[13px] font-medium leading-[18px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--xds-brand-600)] ${sizeClasses(variant, size)} ${variantClasses(variant, isDisabled)} ${className ?? ""}`}
      {...rest}
    >
      {loading ? (
        <XSpinner size={16} />
      ) : icon ? (
        <span className="inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children !== undefined && <span className="min-w-0 truncate">{children}</span>}
    </button>
  );
}
