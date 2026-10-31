# PHASE-003 — Action runtime, bằng chứng chuỗi băm, tự chẩn đoán, MCP đọc, mã lỗi + quan sát
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — thư mục phase PHASE-001…017, SC-PHASE-1. -->

> **Trạng thái:** ✅ đủ tín hiệu lộ trình; nợ nhỏ chuyển sang PHASE-004 / 006 / 009 / 010 (xem 70-REFLECT-003 ở PHASE-004)
> **Giai đoạn:** Phase 2 của [PHASES](../../standard/PHASES.md) · **Code:** có · **Tiến độ tín hiệu (2026-10-30):** 100%
> **Mục tiêu:** Mặt tiền Platform cho mọi thao tác ghi: `defineAction` (quyền, idempotency, dry-run, bằng chứng), tự chẩn đoán L1 / L3, MCP đọc cho AI, mã lỗi và quan sát chuẩn.
> **Việc lộ trình:** 2.2, 2.5, 2.6, 2.9, 2.10, 2.11, 2.12, 2.13
> **Checklist công bố:** G1-04, G1-07, G1-09, G2-01, G2-02, G2-07, G2-08
> **Tuân thủ / nguyên tắc:** C-2, C-3, C-4 đạt · C-8 một phần · AP-1, AP-4, AP-7
> **Phụ thuộc phase:** 001

<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| Tài liệu | Một câu |
|---|---|
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con duy nhất của phase + ca bằng chứng + log |

## Hiện trạng đọc mã

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | Runtime action: idempotency bằng dòng `action_requests` cùng giao dịch, dry-run bằng rollback, `sideEffects` bắt buộc | `apps/api/src/core/actions.ts`, migration `0035` |
| F2 | Bằng chứng chỉ thêm, chuỗi băm theo đơn vị (trigger `audit_log_chain`), biên nhận | `core/audit.ts`, migration `0036`, `modules/system/evidence.routes.ts` |
| F3 | Tự chẩn đoán L1 / L3, `diagnostic_runs`, khoá kỳ bị chặn khi L3 lỗi (R-DIAG-4) | `modules/system/diagnostics.ts`, `modules/ledger/ledger.diagnostics.ts`, migration `0034` |
| F4 | MCP JSON-RPC `POST /mcp`, 4 công cụ đọc `accounting.*`, khung `confirm_token` 900 s | `modules/system/mcp.routes.ts`, `modules/reports/report.actions.ts`, migration `0037` |
| F5 | Danh mục mã lỗi một nguồn, `requestId`, `/metrics`, bộ giám sát 6 dashboard + 8 cảnh báo | `packages/contracts/src/errors.ts`, `core/metrics.ts`, `infrastructure/monitoring/` |

## Xong khi

Phase xong khi mọi việc lộ trình ở trên **done** trên bảng điểm (`node tests/conformance/selfcheck.mjs`, tín hiệu ở [roadmap.json](../../standard/roadmap.json)) và mọi mã checklist công bố chuyển **có** trong [Bản công bố §6](../../CONG-BO-KIEN-TRUC.md). Trạng thái hôm nay: 2.2 ✅ · 2.5 ✅ · 2.6 ✅ · 2.9 ✅ · 2.10 ✅ · 2.11 ✅ · 2.12 ✅ · 2.13 ✅.
