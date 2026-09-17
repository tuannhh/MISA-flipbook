import { ReactNode } from "react";

// Port truc tiep tu ui/components/XEmptyState.vue - "initial" (chua tung co du
// lieu, chi hien nut Them/Import) vs "no-result" (da tung co, gio rong do xoa/loc).
const EMPTY_STATE_ICONS: Record<"initial" | "no-result", string[]> = {
  initial: ["M4 6a8 3 0 1 0 16 0a8 3 0 1 0 -16 0", "M4 6v6a8 3 0 0 0 16 0v-6", "M4 12v6a8 3 0 0 0 16 0v-6"],
  "no-result": ["M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0", "M21 21l-6 -6"],
};

export function XEmptyState({
  type = "initial",
  title,
  description,
  actions,
}: {
  type?: "initial" | "no-result";
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 pb-10 pt-[120px] text-center">
      <svg
        width={48}
        height={48}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mb-4 text-[var(--xds-text-placeholder)]"
        aria-hidden="true"
      >
        {EMPTY_STATE_ICONS[type].map((d, i) => (
          <path key={i} d={d} />
        ))}
      </svg>
      <p className="text-[13px] font-semibold leading-[18px] text-[var(--xds-text)]">{title}</p>
      {description && (
        <p className="mt-1 max-w-[360px] text-[13px] leading-[18px] text-[var(--xds-text-placeholder)]">{description}</p>
      )}
      {actions && <div className="mt-6 flex items-center justify-center gap-2">{actions}</div>}
    </div>
  );
}
