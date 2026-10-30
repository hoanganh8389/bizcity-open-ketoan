# PHASE-003 · 40 — Master checklist

> Nguồn trạng thái **việc con** duy nhất của phase. "Xong" của việc lộ trình do bảng điểm tính, không do bảng này. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.

<!-- [2026-10-30] Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| ID | Việc | Lộ trình / G | Code | Trạng thái |
|---|---|---|---|---|
| S003-1 | `assertLedgerInvariants()` sau mọi tệp test | 2.2 | có | ✅ `apps/api/test/helpers.ts`, `test/setup.ts` |
| S003-2 | Runtime action + 11 action yêu cầu thanh toán làm mẫu | 2.5 | có | ✅ `test/actions.test.ts` |
| S003-3 | Bằng chứng chuỗi băm + `GET /evidence/:id` | 2.6 | có | ✅ `test/evidence.test.ts`, DG-EVD-1 |
| S003-4 | `GET /system/capabilities` có schema, quyền, `sideEffects` | 2.9 | có | ✅ `test/diagnostics.test.ts` |
| S003-5 | Tự chẩn đoán trong app + R-DIAG-4 | 2.10 | có | ✅ (màn xem lịch sử: nợ N003-6) |
| S003-6 | MCP đọc `accounting.*` | 2.11 | có | ✅ `test/mcp.test.ts` (khoá `mcp_…` riêng: nợ N003-1) |
| S003-7 | MCP sinh từ registry action + xác nhận | 2.12 | có | ✅ CONF-MCP-1, -3, -4 (CONF-MCP-5: PHASE-009) |
| S003-8 | Mã lỗi + quan sát + bộ giám sát | 2.13 | có | ✅ `test/observability.test.ts`, SC-ERR-1 |
| S003-9 | Domain Contract `bizcity_domain@1` | G2-01 | có | ✅ |
| S003-10 | Capability Contract qua `/system/capabilities` | G2-02 | có | ✅ |
| S003-11 | Idempotency `docKey` + `version`, `Idempotency-Key` | G1-04 | có | ✅ |
| S003-12 | Audit Ledger | G1-07 | có | ✅ |
| S003-13 | Health L0 / L1 / L3 + `/metrics` | G1-09 | có | ✅ |
| S003-14 | Prometheus + Grafana + cảnh báo | G2-07 | có | 🟡 cấu hình đã kiểm; chưa chạy với API thật (T003-1) |
| S003-15 | Mã lỗi chuẩn + quan sát | G2-08 | có | ✅ |

## Ca bằng chứng

| ID | Ca | Mong đợi | Trạng thái |
|---|---|---|---|
| T003-1 | Bật `infrastructure/monitoring` với API dev đã áp 0030–0037 | Grafana thấy số đo, cảnh báo `LedgerIntegrityError` im lặng | ☐ |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-10-30 | Claude Code | Mở thư mục phase; trạng thái chụp từ bảng điểm (CSDL `ketoan_test`). |
