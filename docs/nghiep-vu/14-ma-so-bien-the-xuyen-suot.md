# 14. Mã số, Biến thể và item_id xuyên suốt ERP – WordPress

<!-- [2026-11-09 10:00 AM Nguyễn Văn Thủy] PHASE-026 — tài liệu xuyên suốt mã số cha – con giữa ERP và các plugin WordPress (đóng góp) -->

Phương án và lý do: tài liệu 12. Theo dõi tiến độ: tài liệu 13. File này ghi **luật dùng chung** cho cả hai hệ.
Bản tương ứng phía WordPress: `tgs_shop_management/docs/ma-hang-so-va-bien-the.md`.

## 1. Luật

1. Mã hàng chỉ là số. Mã con = mã cha + 2 số thứ tự, **không mang nghĩa**.
2. Mọi biến thể đều là **sản phẩm con**. Người dùng gõ tên tuỳ ý và tích **Biến thể**.
3. Phần mềm chỉ đọc **ô Biến thể**. Không đọc tên, không đọc chữ cuối mã.
4. Mọi mặt hàng có **`item_id`** bất biến. Đổi mã, đổi tên, đổi biến thể đều không đổi `item_id`. Biến thể đi theo mặt hàng, không đi theo mã.
5. Không gộp hàng Nội bộ với hàng có sang thuế.
6. **Ô Gửi lên thuế là căn cứ duy nhất cho mọi việc tách khỏi thuế.** Mọi mặt hàng (cả mã cha) có ô này, mặc định bật. Tắt thì không lên hoá đơn thuế: dòng 0đ tách sang bill Z, dòng có thu tiền ở lại bill chính nhưng bị loại khỏi hoá đơn. Biến thể Nội bộ luôn tắt, khoá ở CSDL. Phần mềm không cần biết biến thể là gì để quyết định thuế. (09/11/2026, migration 0093)
7. Mã cha luôn là hàng Thường, không có Biến thể; vẫn có ô Gửi lên thuế.

**Quy tắc thuế theo mã (chốt 09–10/11/2026):**

1. "Không gửi thuế" gắn vào **mã**, không gắn vào chương trình hay từng lần bán. Mỗi mã đi trọn một đường thuế: nhập có hoá đơn vào mã nào thì xuất có hoá đơn từ mã đó. Có vậy tồn thuế, giá vốn, ngân sách quà mới đối chiếu được.
2. Ô **Gửi lên thuế** là căn cứ duy nhất để tách khỏi thuế. Nội bộ luôn tắt.
3. **Mặt hàng đã có nhập xuất thì không đổi được ô Gửi lên thuế**, kể cả gián tiếp qua đổi biến thể sang / khỏi Nội bộ. Cần đường thuế khác thì tạo mã con mới; hàng đang có chuyển bằng phiếu chuyển đổi.
4. **Quà phải là mã không gửi thuế** (mã quà con, Nội bộ). Tặng mã có gửi thuế: hệ thống bán hàng cảnh báo (mặc định) hoặc chặn.
5. **Mua hàng, kho theo đường thuế** (10/11/2026): hàng mua có hoá đơn chỉ vào mã gửi thuế; hàng / quà không hoá đơn chỉ vào mã không gửi thuế; xuất quà chỉ từ mã không gửi thuế. Sai thì chặn và chỉ mã đúng cùng họ, chưa có mã thì báo khai báo danh mục tạo sản phẩm con. Loại dòng phiếu mua suy theo ô của mặt hàng, không theo chữ cuối mã. Kịch bản test: NT-MH-003.
6. Hết tồn mã quà thì lập **phiếu chuyển đổi** mã chính → mã quà cùng họ, có duyệt, ngân sách. Chưa làm: chờ kế toán chốt cách ghi sổ thuế.

## 2. Biến thể

Cột *Sang thuế* là giá trị ban đầu của ô **Gửi lên thuế** (`products.send_to_tax`); trừ Nội bộ, người dùng tắt được.

| `variantCode` | Tên | Đuôi cũ | Sang thuế |
|---|---|---|---|
| `normal` | Thường | | Theo hoá đơn |
| `internal` | Nội bộ | Z | **Không bao giờ**: tách bill Z, 0 đồng |
| `clip` | Kẹp quà | Q | Theo hoá đơn |
| `expiry` | Cận date | B | Mã cha (thường). Hàng sắp hết hạn: giá bán riêng, áp chương trình; quầy có cả mã thường và mã cận date, nhân viên chọn khi bán; chuyển từ mã thường bằng phiếu chuyển đổi (0094) |
| `program` | Theo chương trình | T | Theo hoá đơn, mã cha |
| `share` | Chia giá | K | Theo hoá đơn, mã cha |
| `promo` | Khuyến mại | M | Theo hoá đơn, mã cha |
| `legacy` | Đuôi khác | C, D… | Chưa xếp loại |

Nguồn: bảng `item_variant_kinds` (migration 0092). Mã cũ còn đuôi được điền ô theo đuôi khi thêm mới và lúc chạy migration.

## 3. Dòng dữ liệu

```
ERP products.variant_code + send_to_tax + items.item_id
  │  GET /api/v1/catalog/feed/products  →  itemId, parentItemId, variantCode, sendToTax
  ▼
WordPress wp_global_product_name.global_product_item_id / _parent_item_id / _variant / _send_tax   (tgs_accounting_bridge)
  │  TGS_Item_Variant::sends_tax / of / item_id                                         (tgs_shop_management, một chỗ)
  ▼
POS tách bill Z · ép 0đ · hoá đơn Viettel loại dòng Nội bộ · chính sách quà < 24 tháng · hoàn hàng
  │  chứng từ gửi về ERP: mỗi dòng kèm itemId                                         (TGS_Acc_Mapper::lines)
  ▼
ERP khớp dòng theo itemId (sku chỉ để đọc; có cả hai thì phải cùng một mặt hàng)
```

## 4. Chỗ trong code

| Hệ | Chỗ | Việc |
|---|---|---|
| ERP | `apps/api/src/modules/catalog/san-pham-con.ts` | Thêm sản phẩm con, danh mục biến thể, khoá gộp |
| ERP | `catalog.service.ts` `saveProduct` / `feedProducts` | Lưu `variantCode`, gửi `itemId`, `variantCode` |
| ERP | `item.actions.ts` `core.item.rename-code` | Đổi mã, biến thể giữ nguyên |
| ERP | `apps/web/src/features/catalog/ThemSanPhamCon.tsx`, `ProductFullForm.tsx` | Form Tên + Biến thể; ô Biến thể sửa được |
| WP | `tgs_shop_management/functions/class-tgs-item-variant.php` | **Nơi duy nhất** trả lời biến thể, item_id |
| WP | `tgs_accounting_bridge` `TGS_Acc_Catalog_Sync`, `TGS_Acc_Mapper` | Kéo cột; gửi itemId trên dòng |
| WP | `tgs_pos`, `tgs-viettel-invoice`, `tgs_selling_policy` | Gọi `TGS_Item_Variant`, không đọc đuôi |

## 5. Không nhầm

- Chữ `Z` cuối **mã phiếu** (bill tách = mã phiếu cha + `Z`) là quy ước mã phiếu, giữ nguyên.
- `global_product_parent_sku` phía WordPress là mã con theo hạn sử dụng (barcode đặc biệt), **không phải** mã cha ERP. Họ mã ERP đi qua `parent_item_id`.

## 6. Kiểm tra đã chạy (09/11/2026, local)

- ERP: `apps/api/test/san-pham-con.test.ts` 43 ca đạt. Gồm thêm con với mọi biến thể, đổi Z, M, Q, T, K sang mã số giữ biến thể, sửa ô, luồng kéo có `itemId` / `variantCode`.
- WordPress: migration điền ô cho 20.579 mã (14 giây); 2.421 mã Z đều là Nội bộ, lệch 0; hàm PHP khớp SQL 100%.
- WordPress, 14 ca đạt:
  - Mã số thuần tích Nội bộ tách sang bill Z.
  - Mã đuôi Z nhưng ô ghi Thường thì không tách, chứng tỏ không còn đọc đuôi.
  - Danh sách POS có `variant`, `item_id`.
  - Mapper gửi `itemId` khi đã có.
- Chưa thử: quầy bán thật trên trình duyệt, production.
