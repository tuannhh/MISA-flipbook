import { LOCALE_COOKIE, type Locale } from "./config";

// Doi ngon ngu KHONG doi URL (khong tien to /vi//en/) - chi ghi cookie roi
// router.refresh() de Server Component doc lai locale qua request.ts. Permalink
// /read/:permalink (F02) khong bi anh huong vi cau truc URL khong doi.
export function setLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
}
