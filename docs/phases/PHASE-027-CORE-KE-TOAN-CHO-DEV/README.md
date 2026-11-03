# PHASE-027 — Core kế toán cho dev: công cụ kiểm, sáu chuẩn, vai trò theo trụ cột
<!-- [2026-11-03 10:14 PM Johnny Chu - Chu Hoàng Anh] PHASE-027 — mở phase sở hữu các đợt CK-1 / CK-2 / CK-3 (đã giữ chỗ ở CLAIMS.md); ghi các quyết định và đề xuất của tài liệu "Kiện toàn framework v2" vào main trước khi code (R-FLOW) -->

> **Trạng thái:** 🟡 W0 tài liệu 2026-11-03 · **Code:** chưa vào `main` (CK-1..3 chờ PR mã sau khi tài liệu này merge)
> **Mức Kernel:** K0 cho W0; CK-1 có một API đọc mới (đối chiếu kho ↔ sổ cái) và một mã tự chẩn đoán; CK-2 / CK-3 là phép kiểm chuẩn
> **Mục tiêu:** Dev và AI xây POS, bán hàng, kho, CRM, ERP nội bộ ghi sổ đúng chuẩn **mà không phải học kế toán**: app chỉ kể sự việc, Core định khoản; mỗi bước có một lệnh trả PASS / FAIL / SKIP và mã lỗi có bước sửa.
> **Việc lộ trình:** —
> **Checklist công bố:** —
> **Quyết định:** [ADR-0023](../../adr/ADR-0023-cong-chung-tu-san-xuat-giu-cho.md) (cổng chứng từ sản xuất) · giá vốn mặc định D025-2 / D025-2b ([PHASE-025](../PHASE-025-ACCOUNTING-CONTINUITY/00-MASTER-PLAN.md)) · một khung trụ cột 0–VIII ([ADR-0022](../../adr/ADR-0022-quan-tri-du-lieu-goc-nen-mong.md), [tru-cot.json](../../standard/tru-cot.json))
> **Phụ thuộc:** PHASE-024 (`item_id` trên sổ / kho — 0065 / 0066), PHASE-021 (tiền kiểm L1–L5), PHASE-022 (ca F22 theo vai), PHASE-025 (CT-REC-001 đối chiếu tồn ↔ tài khoản kho)
> **Luật đi kèm:** [R-FLOW](../../rules/RULE-FLOW.md) (giữ chỗ ở [CLAIMS.md](../CLAIMS.md)), [RULE-QUALITY-GATE](../../rules/RULE-QUALITY-GATE.md) mục "Phép kiểm chặn mới"

| Tài liệu | Một câu |
|---|---|
| [00-MASTER-PLAN](00-MASTER-PLAN.md) | sự thật đọc mã; quyết định D027-*; sáu chuẩn C1–C6; vai trò theo trụ cột 0–VIII; công cụ kiểm và mã AC; đề xuất chờ duyệt Q027-*; không làm |
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | việc con `S027-*` (CK-1..3, đề xuất), log |

## Trả lời ngắn

- **Dev không biết kế toán dùng Core thế nào?** Gửi sự việc theo khuôn `bizcity_ledger_intake@1`, chạy lệnh kiểm, đọc mã lỗi kèm bước sửa. Không viết số tài khoản, thuế suất, giá vốn.
- **Có bao nhiêu khung trụ cột?** Một: 0–VIII. Bảng ở 00 §4 chỉ thêm cột "giúp ai việc gì", không đánh số lại.
- **Giá vốn mặc định?** Bình quân gia quyền tháng; FIFO là lựa chọn sau. Lấy lô nào ra trước (FEFO / FIFO theo lô) là việc của kho, không đổi giá vốn.
