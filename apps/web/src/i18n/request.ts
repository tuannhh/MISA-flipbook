import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, DEFAULT_LOCALE, isLocale, type Locale } from "./config";

// Khong dung routing [locale] - doc locale tu cookie, khong tu URL. Neu chua co
// cookie (lan dau ghe tham) mac dinh tieng Viet.
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const raw = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(raw) ? raw : DEFAULT_LOCALE;

  const messages = (await import(`../../messages/${locale}.json`)).default;

  return { locale, messages };
});
