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

module.exports = nextConfig;
