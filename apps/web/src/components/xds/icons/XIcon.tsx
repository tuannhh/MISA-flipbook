import { ICON_PATHS, type IconName } from "./paths";

// XIcon - wrapper icon dung chung toan bo app (thay cho inline SVG/emoji/glyph
// Unicode rai rac). Chi dung icon trong bo XDS (Tabler, stroke 1.5px) - xem
// paths.ts. Mau qua currentColor (ke thua tu className cha).
export function XIcon({
  name,
  size = 20,
  className,
  title,
}: {
  name: IconName;
  size?: number;
  className?: string;
  title?: string;
}) {
  const paths = ICON_PATHS[name];
  if (!paths) return null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block shrink-0 ${className ?? ""}`}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title && <title>{title}</title>}
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
