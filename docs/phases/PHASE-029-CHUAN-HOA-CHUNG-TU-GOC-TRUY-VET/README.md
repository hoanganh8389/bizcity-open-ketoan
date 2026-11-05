# PHASE-029 — Chuẩn hoá chứng từ gốc và truy vết: DOC-01..06, một cổng lịch sử chứng từ
<!-- [2026-11-05 07:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — mở phase từ đánh giá DANH-GIA-TRACE-CHUNG-TU-GOC (chủ dự án: "code hoàn thiện phần chuẩn hóa chứng từ gốc này để 100% các modules, plugins, api vào phải tuân thủ"); chữ chốt thiết kế + giữ chỗ trước code (R-FLOW) -->

> **Trạng thái:** 🟡 W0 tài liệu 2026-11-05 · **Code:** W1 giữ chỗ (nhánh `feat/phase-029-w1-lich-su-chung-tu`); W2 chờ các dòng giữ chỗ đang giữ `actions.ts`, `kernel/src/index.ts`, `document.service.ts` nhả
> **Mức Kernel:** W1 K2 (route Kernel chỉ đọc + chẩn đoán + phép kiểm tĩnh, không migration); W2 K2–K3 (ghi vết lúc module nộp sổ, cột người sửa / lý do)
> **Mục tiêu:** Mọi dòng bút toán truy vết ngược được về chứng từ gốc **đúng phiên bản đã tạo ra nó**; từ một chứng từ gốc truy vấn được cả quá trình lập, sửa, duyệt, ghi sổ, điều chỉnh, đảo. **Tuân thủ bằng cấu trúc, không bằng lời nhắc:** mọi đường nộp (API, MCP, module, app ngoài, POS, trợ lý) đều đi qua `eventStore` / `postDocumentIn`, nên cổng lịch sử dựng từ nguồn thẩm quyền phủ **100 %** `docKey`; phép kiểm chặn đường ghi lệch.
> **Việc lộ trình:** —
> **Checklist công bố:** —
> **Nền:** [DANH-GIA-TRACE-CHUNG-TU-GOC-2026-11-05](../../audits/DANH-GIA-TRACE-CHUNG-TU-GOC-2026-11-05.md) · [BIZCITY-DOCUMENT-v1 §7.2](../../contracts/BIZCITY-DOCUMENT-v1.md) · [ADR-0021](../../adr/ADR-0021-accounting-continuity-lien-tuc-ke-toan.md) (R-CONT)
> **Phụ thuộc:** PHASE-004 (một cửa ghi sổ), PHASE-010 (`documents.*`)
> **Luật đi kèm:** [R-FLOW](../../rules/RULE-FLOW.md), [R-LEDGER](../../rules/RULE-LEDGER.md)

| Tài liệu | Một câu |
|---|---|
| [00-MASTER-PLAN](00-MASTER-PLAN.md) | quyết định D029-*, chữ chốt W1 (API, chẩn đoán, phép kiểm), W2–W3, bảng "ai tuân thủ bằng cách nào" |
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | việc con `S029-*`, log |

## Trả lời ngắn

- **Có thêm bảng "Universal Documents" không?** Không. Dùng `accounting_events`, `accounting_event_versions`, `ledger_entries.event_version`, `posting_log`, `audit_logs`, `document_links`.
- **Module cộng đồng có phải nhớ gọi gì không?** W1: không — cổng đọc dựng từ sổ và sự việc. W2: runtime tự ghi `saveVersion` + liên kết `ledger` khi `ctx.ledger.submit`.
- **Ép 100 % thế nào?** Ba lớp: (1) cấu trúc — một cửa ghi, CSDL chặn sửa / xoá; (2) chẩn đoán dữ liệu `ENTRY_NO_EVENT`, `ENTRY_NO_VERSION`, `ENTRY_VERSION_UNKNOWN`, `EVENT_ENTRIES_STALE` trên mọi bản cài; (3) phép kiểm tĩnh `SC-DOC-7` chặn đường ghi mới lệch.
