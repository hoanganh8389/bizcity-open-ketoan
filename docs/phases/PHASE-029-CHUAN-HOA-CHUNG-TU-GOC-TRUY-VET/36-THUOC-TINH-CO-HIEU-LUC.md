# PHASE-029 · 36 — Thuộc tính có hiệu lực của đối tượng / chi nhánh / kho và tên lúc ghi trên sổ cái (S029-19, E3)
<!-- [2026-11-08 04:51 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — chữ chốt S029-19: bản thuộc tính có hiệu lực + ảnh chụp tên đối tượng lúc ghi; hai đợt -->

**Vì sao.** Đổi tên đối tượng hôm nay ghi đè cột `partners.name`: mọi báo cáo từ đó hiện **tên mới** cho cả chứng từ cũ, và dòng sổ cái không nhớ tên đối tượng lúc ghi (chỉ có `partner_id`). Đây là K-4 của [đánh giá nền móng](20-DANH-GIA-NEN-MONG.md) (ECP-03, ví dụ P001). Mặt hàng đã giải xong (0072 `ledger_lines.product_name`); đối tượng, chi nhánh, kho còn thiếu. Nền đã có: `entity_codes` (S026-4, 0085) lo **mã**; việc này lo **tên, MST, địa chỉ**.

Theo smallwin: **hai đợt nhỏ**, mỗi đợt một PR. Đợt 1 là phần sổ cái cần ngay và không đổi cách báo cáo nào; đợt 2 mới đổi báo cáo.

## 1. Đợt 1 — bảng thuộc tính + tên lúc ghi (không đổi báo cáo)

**`entity_attributes`** (migration 0086), cùng khuôn `entity_codes`:

| Cột | Ý nghĩa |
|---|---|
| `tenant_id`, `entity_type` (`partner` · `branch` · `warehouse`), `entity_id` | thực thể, giống `entity_codes` |
| `name` · `tax_code` · `address` | thuộc tính có hiệu lực (kho: chỉ `name`, `address`; `tax_code` NULL) |
| `valid_from` · `valid_to` | hiệu lực `[từ, đến)`, `valid_to` NULL = hiện hành |
| `created_by` · `created_at` · `note` | người, lúc, ghi chú (vd "đổi tên từ …") |

- **Chỉ thêm**; UPDATE duy nhất là đóng `valid_to` (và ghi chú); không xoá, không TRUNCATE; chặn chồng hiệu lực một thực thể; thực thể phải có thật cùng đơn vị. RLS như `item_codes`.
- **Đồng bộ ở mọi đường ghi** (trigger trên `partners` / `branches` / `warehouses`): thêm → bản đầu từ `1970-01-01`; đổi `name` / `tax_code` / `address` → đóng bản cũ, thêm bản mới từ **hôm nay** (hoặc sau bản cũ ít nhất 1 ngày); xoá thực thể → đóng. Cột trên bảng thực thể vẫn là **ảnh chụp hiện hành** (giữ nguyên cho mọi nơi đang đọc).
- Điền ban đầu từ dòng đang có (`system:backfill`), chạy lại an toàn.
- **Tra theo ngày:** `resolveEntity(type, ref, asOf)` trả thêm `attributes` hiệu lực tại `asOf` (bản gần nhất nếu thực thể đã đóng trước ngày đó).

**Tên đối tượng lúc ghi** (cùng khuôn 0072): thêm `ledger_lines.partner_name` và `ledger_entries.partner_name`, **trigger BEFORE INSERT** điền theo `partner_id`: tên hiệu lực tại **ngày chứng từ** của bút toán (`entity_attributes`), không có thì tên hiện tại. Không đổi về sau; bút toán đảo mang tên của bút toán gốc. Dòng đã ghi giữ nguyên, cột để trống (báo cáo đợt 2 đọc `COALESCE(partner_name, tên hiện tại)`). Tên **không** vào dấu vân tay bút toán: đổi tên rồi định khoản lại vẫn giữ bút toán cũ.

**Mức K3** ([RULE-KERNEL](../../rules/RULE-KERNEL.md), một người duyệt): thêm cột và trigger trên `ledger_*` (lớp bảo vệ). Giảm rủi ro: cột nullable chỉ **thêm**, trigger chỉ điền khi rỗng lúc INSERT, không đụng dòng đã ghi, `ledger_*_no_update` giữ nguyên. Đường lui: `DROP TRIGGER` hai trigger, `DROP COLUMN` hai cột, `DROP TABLE entity_attributes` (không ai khác phụ thuộc trong đợt 1).

**Golden T029-ECP-P001 (phần sổ cái):** đổi tên đối tượng giữa kỳ → bút toán ghi trước ngày đổi mang tên cũ, sau ngày đổi mang tên mới; bút toán đảo mang tên bút toán gốc; `resolveEntity` ở ngày cũ ra tên cũ.

## 2. Đợt 2 — báo cáo đọc tên theo ngày (PR riêng, chờ đợt 1)

Báo cáo đọc `COALESCE(l.partner_name, p.name)` thay cho `p.name`: nhóm sổ nhật ký, công nợ, đối chiếu. **Mỗi PR một nhóm báo cáo**, mở bằng nhóm công nợ (`debt-reports.ts`) vì đây là nơi tên đối tượng lệch dễ gây tranh cãi nhất. Chi tiết và phạm vi tệp chốt ở PR giữ chỗ của đợt 2, sau khi đợt 1 vào `main`.

## 3. Ngoài phạm vi (cố ý)

- Gộp đối tượng theo khuôn 0068 (S029-20) — việc riêng.
- Đơn vị tính, lý do, `dimension:<kind>` — chưa có `entity_codes` cho chúng.
- `partner_code` ảnh chụp trên dòng sổ — mã đã có `entity_codes` để tra theo ngày; chụp thêm khi có nhu cầu báo cáo thật.

## 4. Quyết định cần chủ dự án

| Mã | Hỏi | Đề xuất |
|---|---|---|
| D029-19-1 | Tên lúc ghi lấy theo **ngày chứng từ** hay **lúc ghi sổ**? | Ngày chứng từ: chứng từ nhập muộn vẫn mang tên đúng tại ngày phát sinh |
| D029-19-2 | Cột `partner_name` đặt ở dòng sổ, đầu bút toán, hay cả hai? | Cả hai (đầu bút toán cho sổ nhật ký, dòng cho công nợ); cùng một trigger hàm |
| D029-19-3 | Có lưu `phone` / `email` của đối tượng thành thuộc tính có hiệu lực không? | Không đợt này: chỉ `name`, `tax_code`, `address` (đủ cho chứng từ và báo cáo) |
