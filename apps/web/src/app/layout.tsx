import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MISA Flipbook",
  description: "Upload PDF, xuat ban flipbook, doc tren desktop/mobile.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
