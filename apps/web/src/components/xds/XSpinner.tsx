// Port truc tiep tu ui/components/XSpinner.vue
export function XSpinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={`animate-spin shrink-0 ${className ?? ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
    >
      <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={2.5} opacity={0.2} />
      <circle
        cx={12}
        cy={12}
        r={9}
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={42}
        strokeDashoffset={28}
      />
    </svg>
  );
}
