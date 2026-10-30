# PHASE-009 — MCP ghi: chỉ đề xuất, luôn chờ người duyệt
<!-- [2026-10-30 08:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-009 — MCP ghi: lập nháp, đề xuất huỷ, luôn chờ duyệt; ADR-0009 đề xuất. -->

> **Ký hiệu:** ☐ chưa làm · 🟡 có mã + test · ✅ có bằng chứng · ⛔ chờ chủ · ❌ huỷ.
> Hợp đồng: [`bizcity_mcp@1`](../../contracts/BIZCITY-MCP-v1.md) STD-MCP-4, -6, -9; [Bản công bố §2.1](../../CONG-BO-KIEN-TRUC.md).

<!-- [2026-10-30 08:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-009 — Chủ: "tiếp tục" sau PHASE-006 (đề xuất làm 009 + soạn ADR cho 005) ⇒ code. -->

## 1. Thiết kế đã chọn (D009-*)

| # | Quyết định | Lý do |
|---|---|---|
| D009-1 | Công cụ ghi là **action** (`modules/documents/document.actions.ts`, `expose: { mcp: true, ai: 'propose' }`); MCP tự sinh công cụ, xác nhận, idempotency, bằng chứng như mọi action | không viết tay đường MCP riêng (PHASES 2.12) |
| D009-2 | `accounting.document.create-draft` (công cụ `…create_draft`) nhận chứng từ đúng khuôn `bizcity_ledger_intake@1` và đi `postDocumentIn` với `hold` → **luôn** `pending`, kể cả loại chứng từ đặt chế độ "Tự động" | STD-MCP-6: AI không đưa gì thẳng vào sổ |
| D009-3 | Bản xem trước = định khoản **thật** trong giao dịch rồi huỷ (`draftDocumentIn({ preview: true })`), trả các dòng bút toán | STD-MCP-4: người dùng thấy đúng bút toán sẽ ghi theo cấu hình của đơn vị |
| D009-4 | `accounting.entry.reverse` = `requestCancelIn(…, { hold: true })`: luôn vào "Chờ huỷ", không theo chế độ Tự động; bắt buộc lý do ≥ 5 ký tự; không áp cho kết chuyển / giá vốn / khấu hao / số dư đầu (huỷ ở màn của chúng); `destructiveHint` | huỷ là việc của kế toán; AI chỉ đề xuất |
| D009-5 | Thêm `expose.destructive` vào ActionDef → `annotations.destructiveHint` | client MCP cảnh báo rõ trước khi xác nhận |
| D009-6 | `zodToJson` hỗ trợ `ZodDiscriminatedUnion` (`oneOf`) | AI thấy đủ khuôn từng loại chứng từ trong `inputSchema` |

## 2. Câu hỏi cần chủ chốt

| # | Câu hỏi | Gợi ý |
|---|---|---|
| Q009-1 | `accounting.journal.post` (phiếu kế toán AI đề xuất): phiếu kế toán tay hiện **ghi sổ ngay** khi lập (`vouchers`), chưa có trạng thái nháp. Làm (a) thêm trạng thái "nháp chờ duyệt" cho phiếu tay (sự việc `pending`, người có quyền bấm duyệt mới ghi qua `eventStore`), hay (b) chỉ cho AI lập phiếu theo **lý do** (`reasonCode`, không số tài khoản) qua một `docType` khuôn nạp mới (vd `journal`) để luật định khoản quyết tài khoản? | (a) trước — phiếu kế toán tay có tài khoản là do kế toán quyết; AI đề xuất, người duyệt sửa được trước khi ghi. (b) cần gói định khoản có lý do cho từng nghiệp vụ (PHASE-012) |
| Q009-2 | Khoá `mcp_…` riêng có phạm vi (S009-5): làm cùng kết nối Cell bốn bước (PHASE-015) hay làm trước? | cùng PHASE-015 — dùng chung luồng cấp khoá |
