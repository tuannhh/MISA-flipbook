FROM node:22-slim
RUN groupadd --system app && useradd --system --gid app --home-dir /app app
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
RUN mkdir -p /data/storage && chown -R app:app /app /data/storage
USER app
ENV NODE_ENV=production
CMD ["node", "src/index.js"]
