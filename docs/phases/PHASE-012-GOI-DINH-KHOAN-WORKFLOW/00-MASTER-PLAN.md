# PHASE-012 — Kế hoạch: gói định khoản cài / xem trước / gỡ
<!-- [2026-10-30 10:11 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — thiết kế cài / gỡ gói định khoản (D012-1…5), câu hỏi Q012-1. -->

> **Ký hiệu:** ☐ chưa làm · 🟡 có mã + test · ✅ có bằng chứng · ⛔ chờ chủ · ❌ huỷ.
> Hợp đồng: [`bizcity_posting_template@1`](../../contracts/BIZCITY-POSTING-TEMPLATE-v1.md) §5 STD-TPL-1…9; [ADR-0009](../../adr/ADR-0009-chinh-sach-ke-toan-co-phien-ban.md) Q-5.

## 1. Thiết kế đã chọn (D012-*)

| # | Quyết định | Lý do |
|---|---|---|
| D012-1 | Bảng `config_packs` (migration `0042`, RLS): một dòng mỗi gói của đơn vị — nội dung gói (`manifest`, kể cả gợi ý AI và tình huống mẫu), các mục đã đụng (`items`: add / update / keep / conflict), bản chính sách lần cài phát hành | gỡ đúng phần gói đã thêm; `posting.reason.suggest` (S012-4) đọc `ai.*` từ manifest, không thêm cột vào `posting_reasons` |
| D012-2 | Cài = action `core.template.install` (`settings:write`, `ai: deny`, dry-run): xem trước = chạy thật trong giao dịch rồi huỷ; xác nhận = cùng đường, ghi một giao dịch, bằng chứng mang id action | STD-TPL-5 — đúng tên bằng chứng `core.template.install` của hợp đồng |
| D012-3 | Mục gói khác cấu hình đơn vị → **conflict, giữ nguyên**; người cài liệt kê `overwrite: ["reason:XBA", …]` để ghi đè từng mục. Mục thuộc gói khác đã cài chỉ ghi đè được khi gói khai `overrides` | STD-TPL-7, §4 phân tầng |
| D012-4 | Trước khi ghi: `ensureHead` chốt cấu hình đang áp; sau khi ghi, cấu hình đổi → `publishPolicy({ pinned })` phát hành **một** bản `publish`, `note = "Cài gói <id>@<phiên bản>"`, hiệu lực từ `effectiveFrom` (mặc định hôm nay, không rơi vào kỳ khoá). Gỡ cũng phát hành bản "Gỡ gói …" | ADR-0009 Q-5; STD-TPL-6: chứng từ trước ngày hiệu lực định khoản lại vẫn theo bản cũ |
| D012-5 | Gỡ = ngừng dùng (`is_active = false`) mục gói THÊM mà chưa phát sinh: lý do (`ledger_entries.reason_code`), mã thuế (`ledger_lines.tax_code`), tài khoản (`ledger_lines`), hình thức TT (`payload.payments[].methodCode`). Nhóm hạch toán, tài khoản ngầm định giữ nguyên. Gói đang là gói nền của gói khác không gỡ được | STD-TPL-8, R-MD |

## 2. Câu hỏi cần chủ chốt

| # | Câu hỏi | Gợi ý |
|---|---|---|
| Q012-1 | S012-3b: gói nền `bizcity.vn-tt99.nen` (thay phần cấu hình định khoản của `db/seed.ts`) đặt ở đâu, và đơn vị đang chạy được ghi nhận "đã cài gói nền" thế nào? | tệp `db/packs/vn-tt99-nen.posting-pack.json` (dữ liệu, cùng chỗ seed); đơn vị mới cài qua `installPack` lúc tạo; đơn vị cũ: lệnh `npm run pack:adopt` ghi dòng `config_packs` với mọi mục `keep` (không đổi cấu hình, không phát hành bản) |
