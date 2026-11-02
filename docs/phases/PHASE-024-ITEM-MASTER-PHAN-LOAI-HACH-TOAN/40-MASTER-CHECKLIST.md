# PHASE-024 · 40 — Master checklist
<!-- [2026-11-02 09:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — master checklist: S024-1..18, ca bằng chứng T024-1..9, log -->

> Nguồn trạng thái **việc con** duy nhất của phase. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.
> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

## Việc con

| ID | Việc | Đợt | Ưu tiên | Code | Trạng thái |
|---|---|---|---|---|---|
| S024-1 | Tài liệu W0: [README](README.md), [00](00-MASTER-PLAN.md), [20](20-KIEN-TRUC.md), [30](30-UI-UX.md); [ADR-0017](../../adr/ADR-0017-dinh-danh-hang-hoa-bat-bien.md); [RULE-ITEM](../../rules/RULE-ITEM.md); CANON §3; roadmap 2.22 / 2.23 | W0 | P0 | — | ✅ 2026-11-02 |
| S024-2 | Bản mẫu tĩnh [mockups/item-master.html](mockups/item-master.html): Quy định (HT09) · Thẻ mặt hàng · Trace | W0 | P0 | — | ✅ 2026-11-02 — chờ chủ duyệt bố cục |
| S024-3 | Chủ duyệt D024-1..8, Q024-1..5, ADR-0018; kế toán trưởng ký đặc tả K3 (W2) | W0 | P0 | — | ✅ 2026-11-02 chủ duyệt ("đồng ý những gì bro đưa ra"); ⛔ còn kế toán trưởng ký đặc tả K3 trước W2 |
| S024-4 | Hợp đồng `bizcity_item_master@1` (`docs/contracts/BIZCITY-ITEM-MASTER-v1.md` + schema), `packages/contracts/src/item-master.ts`; `bizcity_ledger_intake@1` 1.4.0 (`itemId`, `barcode` trên dòng hàng); `bizcity-standard.json` năng lực `item.master`, `item.validation` planned | W1 | P0 | ☐ | ☐ |
| S024-5 | Migration: `items`, `item_codes` (chỉ thêm), `item_classification` (theo ngày), RLS; điền từ `products` (song song, `products` chưa đổi) | W1 | P0 | ☐ | ☐ |
| S024-6 | Item Resolver (`kernel/masterdata/item-resolver.ts`) + đệm theo phiên bản danh mục + span `intake.item.resolve` — ca T024-1 | W1 | P0 | ☐ | ☐ |
| S024-7 | Trạm tiền kiểm L3: `IN-ITEM-001..008` + remedy; bỏ `ensureProducts`, khoá `bizcity.item.auto_create` (registry settings) — ca T024-2, 3 | W1 | P0 | ☐ | ☐ |
| S024-8 | Accounting Mapping Resolver: `AccountResolver` nhận phân loại tại ngày; xung đột `IN-POST-005`; `SC-ITEM-3` — ca T024-4 | W2 | P0 | ☐ | ☐ |
| S024-9 | Migration **K3**: `item_id` ở `ledger_lines`, `inventory_movements`, `inventory_costs`, `product_units`, `product_prices`; điền ngược; trigger bất biến; `products` → khung nhìn; `db/types.ts`, `schema-catalog.ts` — ca T024-5 | W2 | P0 | ☐ | ⛔ đặc tả kế toán trưởng ký (S024-3) |
| S024-10 | `kiem-nang-cap.sh`: so tồn theo mã trước / sau nâng cấp; `DG-ITEM-3 = 0` sau điền ngược — ca T024-6 | W2 | P0 | ☐ | ☐ |
| S024-11 | Action `core.item.upsert / add-code / retire-code / classify / merge-preview / merge / validate / trace`; `core.product.upsert` chuyển tiếp; khung nhìn `bizcity_read.items*`; SDK `ctx.data` đọc được | W2 | P0 | ☐ | ☐ |
| S024-12 | Costing theo `item_id`; `bizcity_costing_*`; `costing_items_unpriced` | W2 | P1 | ☐ | ☐ |
| S024-13 | Diagnostics `DG-ITEM-1..5`, `STOCK_LEDGER_MATCH` theo item, remedy; chặn khoá kỳ với 1 / 3 / 4 — ca T024-7 | W3 | P0 | ☐ | ☐ |
| S024-14 | Ca giả định `F24-ITEM-*` (danh mục PHASE-022, lane scenario): mã lạ, mã trùng hiệu lực, đổi mã có dòng sổ, gộp mã, dịch vụ trên phiếu kho, hàng tặng sai phân loại, item ngừng còn tồn | W3 | P0 | ☐ | ☐ |
| S024-15 | Số đo `bizcity_item_*`, `bizcity_posting_mapping_*`, `bizcity_posting_default_group_fallback_total`, `bizcity_inventory_negative_items`, `bizcity_stock_ledger_mismatch_items`; dashboard 09; cảnh báo + `alerts.test.yml`; OBSERVABILITY §3 / §4 — ca T024-8 | W3 | P0 | ☐ | ☐ |
| S024-16 | `SC-ITEM-1..3` + ca tự kiểm `fixtures/repo-bad` | W3 | P0 | ☐ | ☐ |
| S024-17 | Web: HT09 Quy định, thẻ mặt hàng (3 lớp), validator trong form + nhập Excel, đổi mã / gộp mã có xem trước, trace — ca T024-9 | W4 | P0 | ☐ | ☐ |
| S024-18 | Hướng dẫn: `docs/huong-dan/mat-hang.md` (mã có phiên bản, phân loại, gộp), `quy-dinh-du-lieu-hang-hoa.md`; `docs/api/` cập nhật `itemId`; AGENTS.md "tạo mặt hàng qua `core.item.*`" | W4 | P1 | ☐ | ☐ |
| S024-19 | `bizcity_master_data@2` (Versioned Master Data Contract): khuôn chung; `partner_codes`, `branch_codes`; mã ngoài theo nguồn; `core.partner.add-code / merge-preview`; ca CA-MD-02 / -03 ([10 §5](10-DANH-MUC-CO-PHIEN-BAN.md)) | W2 | P0 | ☐ | ⛔ chủ duyệt ADR-0018 <!-- [2026-11-02 10:05 PM Johnny Chu - Chu Hoàng Anh] --> |
| S024-20 | Hạng thay đổi 0–3 + Impact + Gate A (hạng 3): `core.<entity>.impact`, `reclassify` (mô phỏng → duyệt → kích hoạt), chứng từ phân loại lại qua cửa nạp; sự kiện `bizcity.masterdata.*.changed` | W2–W3 | P0 | ☐ | ☐ |
| S024-21 | Tài khoản: phiên bản hệ thống tài khoản + ánh xạ + chứng từ chuyển số dư (nối ADR-0013); báo cáo nhiều kỳ đọc qua ánh xạ — K2 | W3 | P1 | ☐ | ☐ (có thể tách phase) |
| S024-22 | HT09 → "Quy định dữ liệu danh mục"; thẻ khách hàng / chi nhánh cùng khuôn; hộp thoại "Thay đổi" tự xếp hạng | W4 | P1 | ☐ | ☐ |
| S024-23 | Tuân thủ W0 ([50-TUAN-THU](50-TUAN-THU.md)): AGENTS.md mục "Danh mục có phiên bản", HUONG-DAN-LAM-VIEC điều cấm 11–12, CONTRIBUTING §1 | W0 | P0 | — | ✅ 2026-11-02 |
| S024-24 | `why` + `rule` trong lỗi / remedy cho IN-ITEM-*, DG-ITEM-*, trigger bất biến; SC-FIX-2 | W1–W3 | P0 | ☐ | ☐ |
| S024-25 | Manifest `conformsTo` (bizcity_module@1 1.5) bật ca chạy máy; `module check` in bảng tuân thủ; template starter có sẵn | W3 | P0 | ☐ | ☐ |
| S024-26 | HT09 cho CEO (hậu quả tiền, ai làm), hộp thoại "Thay đổi" tự xếp hạng, hướng dẫn 1 trang | W4 | P1 | ☐ | ☐ |

## Ca bằng chứng

| Ca | Kiểm gì | Đạt khi |
|---|---|---|
| T024-1 | Resolver: sku hiện hành, sku cũ tại ngày cũ, barcode, external, alias, itemId lạ | 6 trường hợp trả đúng item / đúng mã lỗi; 2.000 dòng tra ≤ 50 ms (đệm) |
| T024-2 | POS gửi mã lạ, `auto_create` tắt | không vào `accounting_events`; bể chờ có IN-ITEM-001 + remedy; tạo mặt hàng → gửi lại → posted |
| T024-3 | `auto_create` bật | mặt hàng tạo với `source_system`, chưa phân loại; IN-ITEM-004 warn; DG-ITEM-2 đếm |
| T024-4 | Đổi nhóm hạch toán từ ngày D; định khoản lại chứng từ trước D và sau D | trước D: tài khoản cũ; sau D: tài khoản mới; `policy_version` đúng |
| T024-5 | Trigger bất biến: UPDATE `item_id`, sửa `item_codes.code`, UPDATE `product_sku` dòng đã ghi | cả ba bị chặn với thông báo tiếng Việt |
| T024-6 | Nâng cấp từ bản trước (có dữ liệu mẫu) | tồn theo mã trước / sau trùng; DG-ITEM-3 = 0; `assertLedgerInvariants` xanh |
| T024-7 | Gây: mã trùng hiệu lực; item ngừng còn tồn; item chưa phân loại có phát sinh | DG-ITEM-1 / 4 error chặn khoá kỳ; DG-ITEM-2 warn; sửa xong → xanh |
| T024-8 | Số đo và cảnh báo | `/metrics` có đủ tên; `promtool test rules` đạt; dashboard 09 JSON hợp lệ (SC-OBS-1) |
| T024-9 | HT09 + thẻ + trace trên đơn vị test có lỗi gây sẵn | nguyên tắc 4, 6 hiện ⚠ / ✘ với bốn khối; bấm nút sửa mở đúng màn; trace đủ 7 bước |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-11-02 21:20 | Claude Code | Chủ chỉ đạo: ghi sáu nguyên tắc + bất biến "Item Identity is Immutable. Item Code is Versioned. Posted Ledger is Immutable." vào kiến trúc nền tảng; mở phase cho Item Master & Accounting Classification, validator, số đo, trang quy định / trace / hướng dẫn ⇒ W0: ADR-0017, RULE-ITEM, README / 00 / 20 / 30, bản mẫu, roadmap 2.22 / 2.23. |
| 2026-11-02 22:05 | Claude Code | Chủ hỏi "Versioned Master Data Contract áp cho tất cả đối tượng có hợp lý không? Phản biện" ⇒ ADR-0018 (đề xuất) + [10-DANH-MUC-CO-PHIEN-BAN](10-DANH-MUC-CO-PHIEN-BAN.md): đúng ở nguyên tắc, phân hạng A–E khi làm; tài khoản không có định danh thay thế; bốn hạng thay đổi; checklist plugin thành ca máy. S024-19..22. |
| 2026-11-02 21:50 | Claude Code | Chủ duyệt ADR-0018 và các đề xuất; hỏi cách để dev / CEO hiểu và tuân thủ ⇒ [50-TUAN-THU](50-TUAN-THU.md) năm lớp; làm ngay lớp 4 (AGENTS.md, HUONG-DAN-LAM-VIEC, CONTRIBUTING). S024-23..26. |
