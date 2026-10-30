# PHASE-004 · 70 — Phản tư PHASE-003 và sổ nợ chuyển sang

> Nguồn: [PHASE-003 · 40-MASTER-CHECKLIST](../PHASE-003-ACTION-BANG-CHUNG-MCP-DOC/40-MASTER-CHECKLIST.md). Trạng thái từng dòng vẫn ở đó; tệp này chốt lại và chuyển nợ.

## 1. PHASE-003 đã làm gì (2026-10-29 → 2026-10-30)

| Mảng | Kết quả | Bằng chứng |
|---|---|---|
| Action | `defineAction`: quyền, idempotency cùng giao dịch, dry-run, `sideEffects` bắt buộc; 11 action yêu cầu thanh toán | `test/actions.test.ts`, migration `0035` |
| Bằng chứng | `audit_logs` chỉ thêm, chuỗi băm theo đơn vị, biên nhận | `test/evidence.test.ts`, DG-EVD-1 (4.244 dòng) |
| Tự chẩn đoán | L1 / L3 trong app, `diagnostic_runs`, khoá kỳ bị chặn khi L3 lỗi | `test/diagnostics.test.ts`, SC-DIAG-1 |
| MCP | `POST /mcp`, 4 công cụ đọc `accounting.*`, khung `confirm_token` | `test/mcp.test.ts` |
| Lỗi, quan sát | danh mục mã lỗi một nguồn, `requestId`, `/metrics`, 6 dashboard, 8 cảnh báo | `test/observability.test.ts`, SC-ERR-1 |
| Toàn bộ | vitest 709/709 xanh; `assertLedgerInvariants` sau mọi tệp test | CI |

## 2. Điều rút ra

| # | Điều | Áp dụng ở 004 |
|---|---|---|
| R1 | Lane diagnostics chỉ đáng tin trên CSDL **đã áp đủ migration**. CSDL dev ở `0029` cho KHÔNG ĐẠT giả | đo mốc W0 trên `ketoan_test` tạo lại, ghi rõ CSDL trong khối bằng chứng |
| R2 | Sửa `packages/contracts` phải build lại `dist` trước khi test API | nếu W1 thêm kiểu vào contracts: `npm run build -w @ketoan/contracts` |
| R3 | Kiểm nâng cấp tìm ra lỗi thật mà test thường không thấy (`main` không cài sạch được) | sau W5 chạy `scripts/kiem-nang-cap.sh` từ `ccfc341` |
| R4 | Hook toàn cục `afterAll` chạy sau khi tệp test đã đóng pool → kiểm bất biến dùng pool riêng | test của `eventStore.commit` dùng `helpers.ts` sẵn có, không mở pool mới |
| R5 | Script chạy nền trên Windows (`npx tsx`) không chết khi kill | công cụ đo mốc chạy `node` trực tiếp |

## 3. Sổ nợ N003-* (chuyển sang phase khác)

| # | Nợ | Chuyển tới |
|---|---|---|
| N003-1 | Khoá `mcp_…` có phạm vi riêng | PHASE-009 (S009-5) |
| N003-2 | CONF-MCP-5: action chạm sổ phơi cho AI | PHASE-009 (S009-4) |
| N003-3 | Tách `core/actions.ts`, `core/audit.ts` thành gói | PHASE-010 (S010-4) |
| N003-4 | `correlation_id` có cột nhưng chưa gán | PHASE-006 (S006-8) |
| N003-5 | Chạy `infrastructure/monitoring` với API thật | PHASE-003 T003-1 (cần CSDL dev áp 0030–0037: PHASE-001 S001-11) |
| N003-6 | Màn xem lịch sử tự chẩn đoán | PHASE-013 (giao diện) |
| N003-7 | AP-6 chưa có cách thực thi (SC-CMP-2) | PHASE-006 (S006-7) |
