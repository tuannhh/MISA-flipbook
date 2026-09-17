import type { Config } from "tailwindcss";

// Khong can theme.extend: toan bo mau/spacing/radius cua XDS doc qua var(--xds-*)
// bang cu phap arbitrary value (vd bg-[var(--xds-brand-600)]), khong qua theme().
// Xem apps/web/src/styles/xds/tokens.css + theme-blue.css la nguon token that.
const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
