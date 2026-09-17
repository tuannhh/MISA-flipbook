// Port truc tiep tu ui/components/XSwitch.vue - on = --xds-success (xanh la),
// KHONG phai brand; day la component duy nhat dung opacity cho disabled.
export function XSwitch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
}) {
  return (
    <label className={`inline-flex select-none items-center gap-2 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--xds-brand-600)] ${
          checked ? "border-transparent bg-[var(--xds-success)]" : "border-[var(--xds-border)] bg-[var(--xds-bg-disabled)]"
        }`}
      >
        <span
          className={`absolute h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`}
        />
      </button>
      {label && <span className="text-[13px] leading-[18px]">{label}</span>}
    </label>
  );
}
