FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY *.sql ./
COPY run.js ./
# Khong chay bang root (Trivy DS-0002); run.js chi doc *.sql va ket noi DB.
USER node
CMD ["node", "run.js"]
