# RULE · Định khoản (R-POST)
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->

> **Cấp:** Tier 0 · **Phiên bản:** 1.0 · 2026-10-28 · **Chỉ mục:** [../00-CANON.md](../00-CANON.md)
> **Hợp đồng:** [bizcity_posting_rule@1](../contracts/BIZCITY-POSTING-RULE-v1.md) · **Mã:** `modules/posting/*`

## Luật

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **R-POST-1** | Mỗi `docType` có **đúng một** luật trong `RULES` (`posting.service.ts`). Kiểu `Record<IngestDocument['docType'], RuleFn>` buộc khai đủ khi thêm loại | `tsc` |
| **R-POST-2** | **Không viết cứng số tài khoản** trong luật. Mọi tài khoản tra qua `AccountResolver` theo thứ tự: lý do → nhóm hạch toán mặt hàng → loại thuế → hình thức thanh toán / tài khoản ngân hàng → tài khoản ngầm định (`posting_defaults`) | Grep CI: chuỗi số tài khoản (`'[1-9][0-9]{2,5}'`) trong `posting/rules/*.ts` |
| **R-POST-3** | Luật là **hàm thuần**: nhận sự việc + `RuleContext` (cấu hình đã nạp, ngữ cảnh kho / chi nhánh), trả `PostingPart[]`. Không truy vấn CSDL, không đọc giờ hệ thống, không ghi | Duyệt PR; test đơn vị luật |
| **R-POST-4** | **Thiếu cấu hình thì báo đủ**, không đoán: resolver gom mọi chỗ thiếu rồi ném `POSTING_FAILED` với danh sách ("Lý do X chưa khai báo…", "Chưa có tài khoản ngầm định receivable…") | `posting-modes.test.ts`, test lỗi cấu hình |
| **R-POST-5** | Một sự việc có thể sinh **nhiều phần** (`PostingPart`), mỗi phần một chi nhánh (chuyển kho, chuyển tiền, thu hộ). Mỗi phần thành một bút toán | `cash-internal.test.ts`, `inventory.test.ts` |
| **R-POST-6** | Dòng sổ mang đủ **chiều phân tích** cần cho báo cáo: `part` (goods / tax / cogs / discount / payment / other), đối tượng, mã hàng, mã thuế, chi nhánh, `dims` (bộ phận, nhân viên, vụ việc, dự án…) | Báo cáo theo chiều |
| **R-POST-7** | Giá vốn chưa biết lúc nhận → dòng `cost_fill` số 0, điền bằng chứng từ `cogs` khi tính giá vốn tháng. Không ước tính | `costing.test.ts` |
| **R-POST-8** | Đổi cấu hình **không** sửa bút toán đã ghi; chỉ áp cho lần định khoản sau. Muốn áp lại cho quá khứ: định khoản lại chứng từ (sinh bút toán đảo + mới) | `product-accounts.test.ts` |
| **R-POST-9** | Thêm `docType` = PR lõi riêng gồm: khuôn zod (`packages/contracts/src/documents.ts`) + luật + lý do mặc định (`flags.default = <docType>`) trong seed + test luồng + trang `docs/api/` + cập nhật `bizcity_ledger_intake@1` | Mẫu PR |
| **R-POST-10** | Bộ sổ: một sổ nhật ký chung mỗi đơn vị. Sổ thuế là **bản cài riêng** (`BOOK_MODE=tax`), không phải cờ trên bút toán | `books.test.ts` |

## Thứ tự tra tài khoản (đọc nhanh)

| Cần | Thứ tự |
|---|---|
| Đối ứng (phải thu) | `reason.counter_account` → ngầm định `receivable` |
| Doanh thu | `reason.revenue_account` → `product_posting_group.revenue_account` |
| Hàng bán trả lại | `reason.revenue_account` → `group.sales_return_account` |
| Giá vốn | `reason.expense_account` → `group.cogs_account` (hàng tặng + cờ → `promotion_expense`) |
| Kho | `group.inventory_account` |
| Thuế ra / vào | `tax_code.account_code` → `tax_output` / `tax_input` |
| Phải trả NCC | `reason.counter_account` → `payable` |
| Hàng đang chuyển | `reason.counter_account` → `goods_in_transit` |
| Điều chỉnh kho | `reason.counter_account` → `stock_surplus` / `stock_shortage` |
| Tiền | `payment_method.account_code` (đối tượng nhận hộ: `payment_method.partner_code`); chuyển tiền có mã ngân hàng → `bank_account.account_code` |

Nguồn sự thật: chú thích đầu `modules/posting/account-resolver.ts`. Đổi thứ tự = đổi hợp đồng `bizcity_posting_rule@1`.
