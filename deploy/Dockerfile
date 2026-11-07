# 섯다 서버 컨테이너 이미지 (저장소 루트에서 빌드: docker build -f deploy/Dockerfile -t seotda .)
FROM node:22-alpine AS base
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server ./server
COPY public ./public
EXPOSE 3000
ENV PORT=3000 HOST=0.0.0.0 TRUST_PROXY=1
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "server/index.js"]
