FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY *.sql ./
COPY run.js ./
CMD ["node", "run.js"]
