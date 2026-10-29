# API: dựng TypeScript → chạy Node. Cùng image chạy job db-migrate (node dist/db/setup.js: migration + seed) và máy chủ API.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN npm run build -w @ketoan/contracts && npm run build -w @ketoan/api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --no-audit --no-fund -w @ketoan/api -w @ketoan/contracts && npm cache clean --force
COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY --from=build /app/apps/api/dist apps/api/dist
# Thư mục cơ sở dữ liệu (migrations, seeds) — đường dẫn /app/db (apps/api/src/db/paths.ts).
COPY db/migrations db/migrations
COPY db/seeds db/seeds
# Phiên bản Standard trả ở /api/v1/system/health (apps/api/src/core/version.ts, R-REL-1).
COPY docs/standard/bizcity-standard.json docs/standard/bizcity-standard.json
COPY docker/api-entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh
WORKDIR /app/apps/api
EXPOSE 4100
ENTRYPOINT ["/entrypoint.sh"]
