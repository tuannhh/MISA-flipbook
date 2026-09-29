FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim
RUN groupadd --system app && useradd --system --gid app --home-dir /app app
WORKDIR /app
COPY package.json package-lock.json ./
# Runtime chay bang `node`, khong can npm: go npm (kem theo image node) de loai bo cac goi bundled
# co CVE (tar, brace-expansion, picomatch...) khoi image cuoi. Dependency cua app da duoc Trivy/npm audit xac nhan sach.
RUN npm ci --omit=dev && npm cache clean --force \n  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build /app/dist ./dist
RUN mkdir -p /data/storage && chown -R app:app /app /data/storage
USER app
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/main.js"]
