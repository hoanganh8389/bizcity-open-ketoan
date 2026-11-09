# PHASE-029 · 35 — Gói K3: người tạo sự việc, khoá kỳ ở CSDL, xoá an toàn
<!-- [2026-11-07 03:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — chốt gói K3 (S029-6, S029-12, S029-17 và D030-16 / S030-42): một người duyệt theo R-KER-2 bản smallwin -->

**Chủ dự án chốt 2026-11-07** (Johnny Chu – Chu Hoàng Anh): *"ko cần đến cần 2 người lõi, smallwin là rule nhé bro, đừng phức tạp quá. Tuy chí quan trọng là hệ thống phải dễ dùng. Đồng ý phương án bro đề xuất."* Gói này thay cho bước "chủ ký K3" đang chặn S029-6, S029-12, S029-17. Người duyệt theo [R-KER-2](../../rules/RULE-KERNEL.md) bản mới: một người, không cần hai người nhóm Lõi, không cần ADR riêng. Thay vào đó mỗi PR có mục **K3** trong mô tả (đụng gì, số đo trên dữ liệu thật, đường lui), và migration kiểm dữ liệu trước, dừng khi có dòng vi phạm, không tự sửa.

## 1. Số đo (CSDL `ketoan_test`, 2026-11-07)

| Đo | Kết quả | Ý nghĩa |
|---|---|---|
| Sự việc (`accounting_events`) thiếu `created_by` | **1.484 / 68.923**: khấu hao 792, giá vốn 692 | Chỉ sự việc do tác vụ hệ thống sinh. Điền được theo `doc_type`, không đoán người |
| Phiên bản sự việc (`accounting_event_versions`) | 5.513 dòng; chưa có cột người / lý do | S029-6 thêm cột; dòng cũ để rỗng (không bịa) |
| Bút toán tạo **sau** lúc khoá kỳ (khoá chung) | **0** (trên 591 bút toán thuộc kỳ đã khoá, 534 dòng khoá) | Trigger khoá kỳ ở CSDL không chặn dữ liệu cũ nào: lớp ứng dụng đã chặn đúng, trigger chỉ chặn đường vòng |
| Trigger hiện có trên `ledger_entries` | `ledger_entries_no_update`, `ledger_entries_no_truncate` | Chưa có trigger khoá kỳ |

## 2. Ba đợt

| Đợt | Việc | Mức | Chặn bởi | Trạng thái |
|---|---|---|---|---|
| **1** | **D030-16 / S030-42**: `accounting_events.created_by` bắt buộc. Mã ghi `auth.actor` cho mọi sự việc (kể cả sự việc do tác vụ sinh, vì tác vụ luôn chạy dưới một danh tính). Migration điền dòng cũ bằng `system:<doc_type>` (`system:depreciation`, `system:cogs`) rồi `SET NOT NULL` theo khuôn 0077 | K3, chỉ thêm chặt | — | giữ chỗ |
| **1** | **S029-17**: trigger `BEFORE INSERT` trên `ledger_entries`. Chặn bút toán có kỳ thuộc khoá **khớp** (khoá chung, hoặc đúng chi nhánh, hoặc đúng loại chứng từ: cùng điều kiện với `periodRepository.isLocked`). Câu lỗi tiếng Việt, mã `PERIOD_LOCKED` | K3, chỉ thêm chặt | — | giữ chỗ |
| 2 | **S029-6**: `accounting_event_versions.created_by`, `.reason`; cảnh báo `IN-DOC-REASON` (warn) khi phiên bản ≥ 2 không có lý do | K3, chỉ thêm | lý do phải đi từ cửa nạp: chạm `document.service.ts` đang chờ S029-5 | chờ |
| 3 | **S029-12**: xoá an toàn ở CSDL (thu hồi `DELETE`, hàm xoá đọc `md_references`, bỏ `CASCADE`) | K3 | S026-11 (chỉ mục tham chiếu) | chờ |

Đợt 1 làm trước vì đã đo được, không phụ thuộc ai, và mỗi việc một migration nhỏ.

## 3. Đường lui

- **0081 (`created_by NOT NULL`)**: `ALTER TABLE accounting_events ALTER COLUMN created_by DROP NOT NULL` trả lại như cũ. Các dòng đã điền `system:<doc_type>` giữ nguyên; đó là thông tin đúng, không cần gỡ.
- **0082 (trigger khoá kỳ)**: `DROP TRIGGER`. Không đổi dòng nào.
- Cả hai không đổi bút toán đã ghi ([R-KER-4](../../rules/RULE-KERNEL.md)).

## 4. Golden

| Mã | Đạt khi |
|---|---|
| T029-K3-1 | Mọi sự việc mới (chứng từ nhận từ nguồn, khấu hao, giá vốn, khoá sổ) có `created_by` khác rỗng |
| T029-K3-2 | Migration 0081 trên CSDL có sự việc rỗng `created_by`: điền `system:<doc_type>`, rồi `NOT NULL`. Chèn rỗng sau đó bị CSDL từ chối |
| T029-K3-3 | Chèn thẳng (bỏ qua ứng dụng) một bút toán vào kỳ đã khoá chung → CSDL từ chối, mã `PERIOD_LOCKED` |
| T029-K3-4 | Khoá riêng một chi nhánh / một loại chứng từ chỉ chặn đúng chi nhánh / loại đó |
| T029-K3-5 | Mở khoá kỳ (xoá dòng khoá) → ghi lại được; cặp bút toán đảo cho kỳ đang mở không bị chặn |
