const createNextIntlPlugin = require("next-intl/plugin");

// Khong dung routing [locale] cua next-intl (khong tien to /vi//en/ trong URL) -
// permalink cong khai /read/:permalink phai giu nguyen bat ke locale (F02, da test).
// Locale doc/ghi qua cookie, xem src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  images: {
    // Anh trang phuc vu tu API (apps/api), khong phai domain cua Next.js - tat toi uu
    // hoa anh mac dinh cua Next (yeu cau whitelist domain) de don gian trong pilot.
    unoptimized: true,
  },
};

module.exports = withNextIntl(nextConfig);
