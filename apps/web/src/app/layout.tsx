import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { XToastProvider } from "@/components/xds/XToast";
import "./globals.css";

export const metadata: Metadata = {
  title: "MISA Flipbook",
  description: "Upload PDF, xuat ban flipbook, doc tren desktop/mobile.",
};

// viewport-fit=cover: can cho .xds-mobile-app dung dung env(safe-area-inset-*)
// tren thiet bi co notch/thanh cu chi (mobile-pwa.md).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Khong dung routing [locale] - locale doc tu cookie o src/i18n/request.ts,
  // KHONG anh huong cau truc URL (permalink /read/:permalink giu nguyen, F02).
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <XToastProvider>{children}</XToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
