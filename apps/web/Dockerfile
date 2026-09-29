FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY next.config.js tsconfig.json tailwind.config.ts postcss.config.js ./
COPY src ./src
COPY public ./public
COPY messages ./messages

# Next.js inline bien NEXT_PUBLIC_* vao bundle client LUC BUILD (khong doc lai luc
# chay container) - vi vay phai truyen qua build ARG, khac voi cac service khac
# trong repo nay chi can ENV luc runtime.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
# P6: Facebook App ID that (developers.facebook.com) de dung Share Dialog qua FB SDK -
# de rong = fallback link sharer.php (van hoat dong, khong can app). Xem lib/facebookShare.ts.
ARG NEXT_PUBLIC_FACEBOOK_APP_ID=
ENV NEXT_PUBLIC_FACEBOOK_APP_ID=${NEXT_PUBLIC_FACEBOOK_APP_ID}
# Domain cong khai (link chia se / ma nhung). De trong = dung origin hien tai.
ARG NEXT_PUBLIC_PUBLIC_BASE_URL=
ENV NEXT_PUBLIC_PUBLIC_BASE_URL=${NEXT_PUBLIC_PUBLIC_BASE_URL}
RUN npm run build

FROM node:22-slim
RUN groupadd --system app && useradd --system --gid app --home-dir /app app
WORKDIR /app
# Runtime chay bang `node`, khong can npm: go npm (kem theo image node) de loai bo cac goi bundled
# co CVE (tar, brace-expansion, picomatch...) khoi image cuoi. Dependency cua app da duoc Trivy/npm audit xac nhan sach.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER app
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["node", "server.js"]
