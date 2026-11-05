# PHASE-029 — Enterprise Continuity: chuẩn hoá chứng từ gốc và truy vết (luồng D), bốn nhóm nền móng doanh nghiệp (luồng E)
<!-- [2026-11-05 07:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — mở phase từ đánh giá DANH-GIA-TRACE-CHUNG-TU-GOC (chủ dự án: "code hoàn thiện phần chuẩn hóa chứng từ gốc này để 100% các modules, plugins, api vào phải tuân thủ"); chữ chốt thiết kế + giữ chỗ trước code (R-FLOW) -->
<!-- [2026-11-05 09:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — mở rộng thành Enterprise Continuity theo ADR-0028 (chủ dự án: "Những gì còn lại của code base so với tài liệu … xây thành tài liệu 29, update canon"); giữ tên thư mục để không đứt dẫn chiếu của luồng D -->

> **Phạm vi (từ 2026-11-05 tối):** phase này mang **Enterprise Continuity** ([ADR-0028](../../adr/ADR-0028-enterprise-continuity-nen-mong-doanh-nghiep.md), luật [R-ECP](../../rules/RULE-ENTERPRISE-CONTINUITY.md)). **Luồng D** = chứng từ gốc và truy vết (W1–W3, phần dưới đây). **Luồng E** = phần nền móng chưa phase nào giữ (E1–E9, [30](30-LO-TRINH-NEN-MONG.md)). Tên thư mục giữ nguyên để không đứt dẫn chiếu của luồng D.
> **Trạng thái:** 🟡 W0 tài liệu 2026-11-05 · **Code:** W1 giữ chỗ (nhánh `feat/phase-029-w1-lich-su-chung-tu`); W2 chờ các dòng giữ chỗ đang giữ `actions.ts`, `kernel/src/index.ts`, `document.service.ts` nhả; luồng E chưa giữ chỗ
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
| [20-DANH-GIA-NEN-MONG](20-DANH-GIA-NEN-MONG.md) | rà codebase so với 17 trụ cột: đã chắc, khoảng cách K-1..K-16, tài liệu lệch mã |
| [30-LO-TRINH-NEN-MONG](30-LO-TRINH-NEN-MONG.md) | luồng E1–E9, ưu tiên, mức Kernel, phụ thuộc phase khác |
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | việc con `S029-*`, log |
| [standard/NEN-MONG-DOANH-NGHIEP](../../standard/NEN-MONG-DOANH-NGHIEP.md) · [standard/DU-LIEU-GOC](../../standard/DU-LIEU-GOC.md) | bản đồ bốn nhóm nền móng; danh sách dữ liệu gốc và sáu thao tác vòng đời |

## Trả lời ngắn

- **Có thêm bảng "Universal Documents" cho truy vết không?** Không — luồng D dựng từ nguồn có sẵn. (Luồng E4 đề xuất riêng một bảng đầu chứng từ + thuộc tính cho **chứng từ nghiệp vụ của module**, chốt bằng PR tài liệu riêng; `accounting_events` vẫn là sự thật kế toán.) Luồng D dùng `accounting_events`, `accounting_event_versions`, `ledger_entries.event_version`, `posting_log`, `audit_logs`, `document_links`.
- **Module cộng đồng có phải nhớ gọi gì không?** W1: không — cổng đọc dựng từ sổ và sự việc. W2: runtime tự ghi `saveVersion` + liên kết `ledger` khi `ctx.ledger.submit`.
- **Ép 100 % thế nào?** Ba lớp: (1) cấu trúc — một cửa ghi, CSDL chặn sửa / xoá; (2) chẩn đoán dữ liệu `LEDGER_ORPHAN` (có sẵn), `ENTRY_NO_VERSION`, `ENTRY_VERSION_UNKNOWN`, `EVENT_ENTRIES_STALE` trên mọi bản cài; (3) phép kiểm tĩnh `SC-DOC-7` chặn đường ghi mới lệch.
