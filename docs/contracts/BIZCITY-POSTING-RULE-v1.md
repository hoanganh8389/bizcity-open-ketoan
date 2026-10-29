# `bizcity_posting_rule@1` — Hợp đồng luật định khoản

> **Phiên bản:** 1.0.0 · 2026-10-28 · **Trạng thái:** Ổn định (nội bộ lõi) · **Luật:** [R-POST](../rules/RULE-POSTING.md)
> **Nguồn sự thật:** `modules/posting/posting.service.ts` (`RULES`), `rules/*.rule.ts`, `account-resolver.ts`, `entry-builder.ts`, `modules/ledger/ledger.types.ts`

## 1. Chữ ký

```ts
type RuleFn = (doc: IngestDocument, ctx: RuleContext) => PostingPart[];

const RULES: Record<IngestDocument['docType'], RuleFn> = { sale, sale_return, purchase, … };
```

| Vào | Nghĩa |
|---|---|
| `doc` | Sự việc đã qua kiểm khuôn + tổng tiền (`bizcity_ledger_intake@1`), đã áp `tax_info_patches` |
| `ctx` | `RuleContext`: `AccountResolver` (cấu hình đã nạp: lý do, nhóm hạch toán, mặt hàng, loại thuế, hình thức TT, tài khoản ngân hàng, ngầm định), ngữ cảnh chi nhánh / kho (`StockContext`), đối tượng đã tra |

| Ra | Nghĩa |
|---|---|
| `PostingPart[]` | Mỗi phần = một bút toán (một chi nhánh). `{ branchId?, lines: DraftLine[] , … }` |
| `DraftLine` | `accountCode`, `debit`, `credit`, `pairNo` (cặp Nợ / Có sinh cùng nhau), `part` (goods/tax/cogs/discount/payment/other), `partnerId?`, `taxCode?`, `productSku?`, `description?`, `sourceLineKey?`, `dims?`, `costFill?` (`debit`/`credit`) |

`postingService` bọc các phần thành `DraftEntry` (chi nhánh, loại / số chứng từ, ngày, hoá đơn, lý do, diễn giải) rồi gọi `ledgerService.post()`.

## 2. Nghĩa vụ của một luật

1. **Thuần**: không I/O, không đọc giờ, cùng vào → cùng ra.
2. **Cân từng phần** (lõi kiểm lại nhưng luật phải tự đúng).
3. **Không số tài khoản trong mã** — chỉ hỏi `ctx` (R-POST-2).
4. **Thiếu cấu hình → hỏi resolver**, resolver gom lỗi; luật không tự `throw` thông báo riêng cho thiếu tài khoản.
5. **Tiền tính bằng xu** (`toCents`/`fromCents`), làm tròn theo dòng nguồn, không phân bổ lại.
6. **Dòng 0 đồng** chỉ khi mang mã hàng (khuyến mãi, thuế 0%) hoặc chờ giá vốn (`costFill`).

## 3. Khoá tài khoản ngầm định (`posting_defaults.key`)

Bộ chuẩn (seed `db/seeds/tai-khoan-ngam-dinh.jsonl`, tài khoản theo TT99):

| Khoá | TK seed | Dùng cho |
|---|---|---|
| `cash` | 1111 | Tiền mặt khi hình thức TT không chỉ định |
| `receivable` | 1311 | Phải thu khách |
| `payable` | 3312 | Phải trả NCC |
| `tax_output` / `tax_input` | 33311 / 1331 | Thuế GTGT ra / vào |
| `goods_in_transit` | 1579 | Hàng đang chuyển giữa chi nhánh cùng đơn vị hạch toán |
| `internal_receivable_goods` / `internal_payable_goods` | 13681 / 33681 | Chuyển hàng khác đơn vị hạch toán |
| `internal_receivable` / `internal_payable` | 13681 / 33681 | Chuyển tiền, thu hộ, trả hộ nội bộ |
| `internal_cogs` | 6326 | Giá vốn nội bộ khi chuyển kho |
| `cash_in_transit` | 11319 | Tiền đang chuyển |
| `stock_surplus` / `stock_shortage` | 3381 / 1381 | Kiểm kê thừa / thiếu |
| `promotion_expense` | 64184 | Giá vốn hàng tặng khi lý do bật `giftCostToPromotion` |
| `commission_debit` / `commission_credit` | 6418 / 33881 | Hoa hồng |

Thêm khoá = tương thích (cập nhật seed + bảng này). Đổi nghĩa khoá = phá vỡ.

## 4. Cờ trên lý do (`posting_reasons.flags`)

| Cờ | Nghĩa |
|---|---|
| `default: "<docType>"` hoặc `"stock_adjustment:increase|decrease"` | Lý do mặc định của loại |
| `returnAtOpeningCost` | Trả NCC định giá theo tồn đầu (XTR1, XTR9) |
| `excludeFromCost` | Nhập không vào đơn giá bình quân |
| `costAtSalePrice` | Giá vốn bằng giá bán (bán nội bộ) |
| `giftCostToPromotion` | Giá vốn hàng tặng vào `promotion_expense` |
| `postToLedger` | Lý do có / không sinh bút toán |
| `costItem` | Khoản mục chi phí gắn lên dòng |

## 5. Thêm luật

Theo R-POST-9. Mẫu test tối thiểu: (1) sự việc chuẩn → `posted`, kiểm từng cặp Nợ / Có; (2) thiếu lý do mặc định → `error` có tên chỗ thiếu; (3) phiên bản 2 đổi số tiền → một bút toán đảo + một bút toán mới; (4) huỷ → đảo hết; (5) kỳ khoá → `PERIOD_LOCKED`.
