# [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
# [2026-10-29 11:31 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — bộ kiểm chuẩn xanh, gia cố R-API-6, R-BOUND-2, R-SEC-11, R-REL-1.
# [2026-11-01 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — gói @bizcity/platform: cài, build, chép dist cùng contracts (D010-7 chặng 2)
# [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — gói @bizcity/kernel: cài, build sau platform, chép dist (D010-7 chặng 3)
# [2026-11-02 01:05 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — workspace @bizcity/module-sdk: chép package.json để npm ci khớp lockfile; image api chép registry cấu hình (ctx.settings.get)
# [2026-11-02 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — gói dữ liệu luật @bizcity/vn-rulepacks (JSON + engine.mjs, không build) cho Conformance Engine (ADR-0012 T7)
# [2026-11-02 08:12 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — 2.8: gói @bizcity/mua-hang-domain (modules/mua-hang/domain) tách khỏi contracts: cài, build, chép dist
# API: dựng TypeScript → chạy Node. Cùng image chạy job db-migrate (node dist/db/setup.js: migration + seed) và máy chủ API.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/platform/package.json packages/platform/
COPY packages/kernel/package.json packages/kernel/
COPY packages/module-sdk/package.json packages/module-sdk/
COPY modules/mua-hang/domain/package.json modules/mua-hang/domain/
COPY packages/vn-rulepacks packages/vn-rulepacks
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W3: module SDK (modules/<key>/, mỗi module một gói npm) và ui-kit — cả thư mục, vì danh sách module là của từng bản cài
COPY packages/ui-kit packages/ui-kit
COPY packages/cli/package.json packages/cli/
COPY modules modules
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY packages/platform packages/platform
COPY packages/kernel packages/kernel
COPY packages/module-sdk packages/module-sdk
COPY apps/api apps/api
RUN npm run build -w @ketoan/contracts && npm run build -w @bizcity/mua-hang-domain && npm run build -w @bizcity/platform && npm run build -w @bizcity/kernel && npm run build -w @bizcity/module-sdk && npm run build -w @ketoan/api \
 && for d in modules/*/; do if [ -f "$d/bizcity.module.json" ]; then npm run build -w "./$d" || exit 1; fi; done

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/platform/package.json packages/platform/
COPY packages/kernel/package.json packages/kernel/
COPY packages/module-sdk/package.json packages/module-sdk/
COPY modules/mua-hang/domain/package.json modules/mua-hang/domain/
COPY packages/vn-rulepacks packages/vn-rulepacks
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --no-audit --no-fund -w @ketoan/api -w @ketoan/contracts -w @bizcity/mua-hang-domain -w @bizcity/platform -w @bizcity/kernel -w @bizcity/module-sdk -w @bizcity/vn-rulepacks && npm cache clean --force
COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY --from=build /app/modules/mua-hang/domain/dist modules/mua-hang/domain/dist
COPY --from=build /app/packages/platform/dist packages/platform/dist
COPY --from=build /app/packages/kernel/dist packages/kernel/dist
COPY --from=build /app/apps/api/dist apps/api/dist
# [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W3: SDK + module SDK đã dựng (manifest, dist, migrations) — API nạp modules/<key>/dist/api/index.js
COPY --from=build /app/packages/module-sdk/dist packages/module-sdk/dist
COPY --from=build /app/modules modules
# Thư mục cơ sở dữ liệu (migrations, seeds) — đường dẫn /app/db (packages/platform/src/db/paths.ts: dist/db cách gốc 4 cấp như cũ).
COPY db/migrations db/migrations
COPY db/seeds db/seeds
# [2026-10-30 10:52 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — gói định khoản nền cài khi khởi tạo đơn vị (seed).
COPY db/packs db/packs
# Phiên bản Standard trả ở /api/v1/system/health (apps/api/src/core/version.ts, R-REL-1).
COPY docs/standard/bizcity-standard.json docs/standard/bizcity-standard.json
# [2026-11-05 08:43 AM Nguyễn Văn Thủy] PHASE-026 — bảng trụ cột cho HT10 (packages/platform/src/core/version.ts đọc lúc chạy); thiếu tệp thì màn báo NOT_FOUND (đóng góp)
COPY docs/standard/tru-cot.json docs/standard/tru-cot.json
# Registry khoá cấu hình cho ctx.settings.get (packages/platform/src/core/settings.ts).
COPY docs/contracts/bizcity-settings.registry.json docs/contracts/bizcity-settings.registry.json
COPY docker/api-entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh
WORKDIR /app/apps/api
EXPOSE 4100
ENTRYPOINT ["/entrypoint.sh"]
