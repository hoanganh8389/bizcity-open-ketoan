# PHASE-038 — Checklist
<!-- [2026-11-21 01:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — W0: checklist bước thắng nhỏ, mỗi bước một PR người vận hành dùng được -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> Thiết kế: [README](README.md). Giữ chỗ trước khi code: [CLAIMS.md](../CLAIMS.md) (R-FLOW).

Thứ tự theo giá trị: B1 một mình đã giải được sự cố 2026-11-21 (biết vì sao API không lên).

| Mã | Bước | Việc | Phạm vi | Xong khi | Trạng thái |
|---|---|---|---|---|---|
| S038-1 | W0 | Phase, quyết định D038-1..4 | `docs/phases/PHASE-038-*/**`; `docs/phases/README.md` | chủ dự án duyệt | 🟡 |
| S038-2 | B1 | `logging:` json-file có trần cho mọi dịch vụ; bind mount `${LOG_HOST_DIR:-./logs}` → `/app/logs` cho `api`, `db-migrate`; `LOG_DIR`, `LOG_FILE_LEVEL` vào `env.ts`; `.gitignore` `logs/` | `docker-compose.yml`; `packages/platform/src/config/env.ts`; `.env.example`; `.gitignore` | `docker compose config` hợp lệ; dựng lại không mất log cũ | ☐ |
| S038-3 | B1 | Logger multistream → `logs/api-loi.log` (≥ warn, xoay vòng, cùng `redact`) | `apps/api/src/app.ts`; `packages/platform/src/core/**` (logger) | test: 5xx ghi một dòng có `reqId`, `traceId`, `err.stack`, không có thân yêu cầu | ☐ |
| S038-4 | B1 | Lỗi khởi động ghi `fatal` đồng bộ vào `api-loi.log` với `evt: bizcity.system.start_failed` + `reason` | `apps/api/src/main.ts` | test: còn migration chưa áp → dòng `MIGRATION_PENDING` có trong tệp trước khi thoát | ☐ |
| S038-5 | B1 | Job `db-migrate` ghi `logs/db-migrate.log` (commit, migration áp, lỗi đầy đủ) | `apps/api/src/db/setup.ts` | migration hỏng → tệp có tên migration + mã PG | ☐ |
| S038-6 | B2 | nginx `web`: `web-loi.log` (error_log + truy cập ≥ 500); `error_page 502 503 504` trả JSON `GATEWAY_UNAVAILABLE` | `docker/nginx.conf`; `docker-compose.yml` (mount); `packages/contracts/src/errors.ts` | dừng `api` → `/api/v1/system/health` trả JSON có mã; tệp có dòng upstream | ☐ |
| S038-7 | B3 | `scripts/lay-log.sh` theo README §4.4 | `scripts/lay-log.sh` | chạy được khi `api` chết; gói không chứa giá trị `.env` | ☐ |
| S038-8 | B3 | Sổ tay: mục "Lấy log gửi về" trong runbook aaPanel + DEPLOY §4; OBSERVABILITY §2 thêm `logs/`; log aaPanel `/www/wwwlogs/` | `docs/trien-khai.md`; `docs/ops/DEPLOY.md`; `docs/ops/OBSERVABILITY.md`; `docs/ops/SO-TAY-DIEU-TRA-LOI.md` | người vận hành làm theo không cần hỏi | ☐ |
| S038-9 | B4 | Giao diện: một khay "Không kết nối được máy chủ phần mềm" cho `GATEWAY_UNAVAILABLE` / 5xx không JSON; lùi dần lời gọi lặp | `apps/web/src/lib/api.ts`; khay lỗi; `presence` | 29 yêu cầu hỏng → 1 khay; ping không dội | ☐ |
| S038-10 | B5 | Luật R-OBS-10 (bản cài có `logs/` cố định, có trần) + check SC-OBS-3 (compose khai `logging:` và mount `LOG_HOST_DIR`) + CHANGELOG "Nâng cấp cần làm" | `docs/rules/**`; `tests/conformance/**`; `CHANGELOG.md` | SC-OBS-3 xanh trên main | ☐ |

<!-- [2026-11-21 02:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — thêm S038-11..15 từ nghiên cứu 10 (lỗ hổng G2–G13) -->
| Mã | Bước | Việc | Phạm vi | Xong khi | Trạng thái |
|---|---|---|---|---|---|
| S038-11 | B1 | Bộ bắt `uncaughtException` / `unhandledRejection` ghi `fatal` đồng bộ (R-LOG-3); `version`, `commit` trong mọi dòng (R-LOG-5); Node `--enable-source-maps` + giữ `.map` trong ảnh (R-LOG-8) | `apps/api/src/main.ts`; `apps/api/src/app.ts`; `docker/api.Dockerfile`; `docker/api-entrypoint.sh` | stack trong log trỏ tệp `.ts`; promise không bắt → dòng `fatal` trong tệp | ☐ |
| S038-12 | B1b | `logError` chung: `err` chuẩn (type, stack, `cause` lồng, `pgCode`), `errFp`, `evt`; `redact` một danh sách dùng chung; sửa `events.ts` bỏ `String(err)` | `packages/platform/src/core/**` (logger); `packages/platform/src/core/events.ts` | test che từng trường nhạy cảm; subscriber lỗi có stack + `traceId` sự kiện gốc | ☐ |
| S038-13 | B4b | (nếu duyệt D038-5) ErrorBoundary theo màn, `window.onerror`, `unhandledrejection` → `POST /api/v1/system/client-errors` → `logs/web-client.log` | `apps/web/src/**` (khung app); `apps/api/src/modules/system/**` | lỗi render → màn có mã tra cứu, không trắng; một dòng trong tệp | ☐ |
| S038-14 | B5 | Luật R-LOG-1..11 + SC-LOG-1..3; rà 16 chỗ nuốt lỗi (ghi `warn` hoặc chú thích `nuot-loi:`) | `docs/rules/RULE-LOG.md`; `tests/conformance/**`; các tệp ở 10 §4 G6 | SC-LOG xanh trên main | ☐ |
| S038-15 | ngoài | Promtail (hết hỗ trợ 2026-03-02) → Grafana Alloy; sửa cảnh báo / dashboard dùng số đo Promtail | `infrastructure/monitoring/**` — giao chủ PHASE-018 | log vẫn vào Loki, dashboard 06 chạy | ☐ |

## Nhật ký

- 2026-11-21 — Nghiên cứu [10](10-NGHIEN-CUU-GHI-LOG.md): 13 lỗ hổng G1–G13, chuẩn R-LOG nháp, trần `logs/` 200 MB (D038-2 chốt).

- 2026-11-21 — W0 mở sau sự cố go-live ketoan.btnet.vn (503 toàn bộ `/api/v1/*`).
