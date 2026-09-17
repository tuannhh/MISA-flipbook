// Port truc tiep tu ui/components/XTag.vue
export type XTagColor = "brand" | "success" | "warning" | "danger" | "info" | "neutral";

const COLOR_CLASSES: Record<XTagColor, string> = {
  brand: "bg-[var(--xds-brand-100)] text-[var(--xds-brand-700)]",
  success: "bg-[var(--xds-success-soft)] text-[var(--xds-success)]",
  warning: "bg-[var(--xds-warning-soft)] text-[var(--xds-warning)]",
  danger: "bg-[var(--xds-danger-soft)] text-[var(--xds-danger)]",
  info: "bg-[var(--xds-info-soft)] text-[var(--xds-info)]",
  neutral: "bg-[var(--xds-bg-disabled)] text-[var(--xds-text)]",
};

export function XTag({
  color = "neutral",
  size = "md",
  children,
}: {
  color?: XTagColor;
  size?: "sm" | "md";
  children: React.ReactNode;
}) {
  return (
    <span
      className={`xds-tag inline-flex max-w-full min-w-0 select-none items-center gap-1 whitespace-nowrap rounded px-2 text-[12px] font-medium leading-none ${
        size === "sm" ? "h-5" : "h-6"
      } ${COLOR_CLASSES[color]}`}
    >
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}
