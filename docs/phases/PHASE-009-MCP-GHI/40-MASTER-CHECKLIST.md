# PHASE-009 · 40 — Master checklist
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — thư mục phase PHASE-001…017, SC-PHASE-1. -->
<!-- [2026-10-30 08:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-009 — MCP ghi: lập nháp, đề xuất huỷ, luôn chờ duyệt; ADR-0009 đề xuất. -->

> Nguồn trạng thái **việc con** duy nhất của phase. "Xong" của việc lộ trình do bảng điểm tính, không do bảng này. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.

<!-- [2026-10-30 08:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-009 — Chủ: "tiếp tục" ⇒ code S009-1, -3, -4. -->
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| ID | Việc | Lộ trình / G | Code | Trạng thái |
|---|---|---|---|---|
| S009-1 | `accounting.document.create_draft` (sự việc giữ chờ duyệt) | 2.16 | có | ✅ `test/mcp-write.test.ts`: xem trước có bút toán cân, không lưu; xác nhận → `pending` dù chế độ Tự động, 0 bút toán; bằng chứng actor `ai` |
<!-- [2026-10-30 10:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-009 — Chủ "code tiếp các phase tiếp" ⇒ Q009-1 theo gợi ý (a), code S009-2. -->
| S009-2 | `accounting.journal.post` (ghi nháp đã được người duyệt) | 2.16 · G2-04 | có | ✅ `test/mcp-journal.test.ts` 5 ca: xem trước có bút toán cân, không lưu; xác nhận → `pending`, 0 bút toán, bằng chứng actor `ai`; trạm ACC14 không tự ghi nháp; duyệt (`POST /api/v1/vouchers/:id/approve`, `ai: deny`) → ghi qua eventStore, duyệt lại không ghi thêm; nháp sai tài khoản bị chặn ở xem trước; huỷ nháp không đảo gì |
| S009-3 | `accounting.entry.reverse` (đề xuất huỷ có lý do) | 2.16 | có | ✅ xem trước liệt kê bút toán sẽ đảo; xác nhận → "Chờ huỷ", sổ giữ nguyên; `destructiveHint` |
| S009-4 | CONF-MCP-5: không công cụ nào trỏ action duyệt / khoá kỳ / cấu hình / người dùng; không công cụ `ai: execute` | 2.16 · G2-04 | có | ✅ test |
| S009-5 | Khoá `mcp_…` có phạm vi | — | chưa | ⛔ Q009-2 (gợi ý: cùng PHASE-015) |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-10-30 | Claude Code | Mở thư mục phase; trạng thái chụp từ bảng điểm (CSDL `ketoan_test`). |
| 2026-10-30 | Claude Code | Chủ "tiếp tục" ⇒ code S009-1, S009-3, S009-4 (D009-1…6). `test/mcp-write.test.ts` 4 ca + `mcp.test.ts` xanh. Lộ trình 2.16 done (tín hiệu: hai công cụ có test). G2-04 vẫn **một phần** vì `journal.post` chờ Q009-1. |
| 2026-10-30 22:10 | Claude Code | Chủ "code tiếp các phase tiếp" ⇒ Q009-1 chốt theo gợi ý (a) (D009-7…9), code S009-2: `voucherService.draftIn` / `approve`, `modules/vouchers/voucher.actions.ts`. G2-04 → **có**. |
| 2026-10-30 | Claude Code | vitest đầy đủ: 90/91 tệp xong, 708 test xanh; worker tinypool tự thoát trên Windows giữa `api-examples.test.ts` (17 test chưa chạy, 0 sai) — chạy riêng tệp đó 17/17 xanh ⇒ 725/725. `selfcheck --strict`, `--self-test`, `kiem-chuan.sh` ĐẠT. |
