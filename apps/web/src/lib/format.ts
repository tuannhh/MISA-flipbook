// F12: dung luong hien thi kieu KB/MB/GB, lam tron 1 chu so thap phan.
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

// F13-simplification: hien thi ngay kieu Viet Nam (dd/MM/yyyy) - dung cho "Ngay dang"
// trong danh sach sach Admin. Nhan chuoi ISO timestamptz tu API (vd "2026-09-17T...").
export function formatDateVN(isoString: string | null): string {
  if (!isoString) return "—";
  const d = new Date(isoString);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}
