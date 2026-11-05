# 06 · Xương cá: định danh xuyên suốt cho mặt hàng và danh mục
<!-- [2026-11-05 12:05 PM Nguyễn Văn Thủy] PHASE-026 — chữ chốt thiết kế đợt xương cá: đổi mã, gộp nhiều lần, item_id trên bảng cấu hình, hợp đồng cho hệ ngoài; tài liệu sống của đợt (đóng góp) -->

> Tài liệu sống, cập nhật theo từng đợt. Luật gốc: [R-ITEM](../rules/RULE-ITEM.md), [ADR-0017](../adr/ADR-0017-dinh-danh-hang-hoa-bat-bien.md), [PHASE-024 · 70](../phases/PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/70-LO-TRINH-ON-DINH-CORE.md), [PHASE-026 · 20](../phases/PHASE-026-MASTER-DATA-GOVERNANCE/20-KIEN-TRUC.md). Khác nhau thì luật gốc thắng.

## 1. Mô hình

```
                       XƯƠNG SỐNG: item_id (IT biết, không bao giờ đổi)
 ══════════════════════════════════════════════════════════════════════════►
    │          │            │            │            │            │
  Đơn mua   Nhập kho     Sổ kho       Bút toán     Giá vốn     Trả hàng
  item_id   item_id      item_id      item_id      item_id     item_id
  + mã      + mã         + mã         + mã         + mã        + mã
```

| Lớp | Là gì | Ai dùng | Đổi được không |
|---|---|---|---|
| `item_id` | ULID 26 ký tự, xương sống | Hệ thống, hệ ngoài | Không bao giờ |
| Mã (`item_codes`) | SKU, mã vạch, bí danh, mã hệ ngoài, theo ngày hiệu lực | Người dùng, hệ ngoài | Có, theo phiên bản |
| Cha – con (`parent_item_id`) | Họ mặt hàng | Báo cáo, truy vết | Có |
| Gộp (`merged_into_item_id`) | Mặt hàng này đã gộp vào mặt hàng nào | Hệ thống, báo cáo gộp | Một lần cho mỗi mặt hàng |

Người dùng chỉ thấy và gõ **mã**. `item_id` chỉ hiện ở chỗ dành cho IT.

### Ba cách hỏi

| Câu hỏi | Lọc theo | Kết quả |
|---|---|---|
| Toàn bộ lịch sử sản phẩm, gồm mã cũ | `item_id` | Một dòng liền qua các lần đổi mã |
| Chỉ phần phát sinh dưới một mã | Ảnh chụp mã trên dòng | Chỉ các dòng lúc đó mang mã này |
| Cả họ, hoặc gộp | `parent_item_id`, `bizcity_item_family()` | Cộng dồn, không sửa dòng nào |

## 2. Quyết định đã chốt (05/11/2026)

| # | Quyết định | Lý do |
|---|---|---|
| Q1 | **Không thêm cột JSON lịch sử trên `items`**. Lịch sử mã ở `item_codes`; thay đổi khác ở `audit_logs.before_data / after_data` | Dòng riêng thì CSDL chặn được trùng mã; `items` không phình |
| Q2 | **Gộp được nhiều lần liên tiếp**: A → B, sau đó B → C. A vẫn giữ `merged_into = B`, không viết lại; đích cuối tính bằng cách đi theo chuỗi | Giữ đúng lịch sử từng lần gộp |
| Q3 | **Mã cha có cả hai dạng**: mã cha bán thật có tồn, và cha thuần không phát sinh. Cả hai là một dòng `items`, con trỏ `parent_item_id` | Không đổi dữ liệu đang có, vẫn truy vết được |
| Q4 | **Hệ ngoài (WooCommerce, phần mềm khác) cũng đi theo `item_id`**: lưu `item_id` hoặc khai `external:<nguồn>` | Đổi mã, gộp mã không làm đứt tích hợp |
| Q5 | **Mã không dùng lại cho hàng khác** khi hàng cũ còn sống hoặc đã gộp. Mã của mặt hàng đã xoá khi chưa phát sinh vẫn tạo lại được như hiện tại | Một mã tại một ngày trỏ một hàng (DG-ITEM-1) |
| Q6 | **Danh mục không tự sinh bút toán.** Gộp bị chặn khi mặt hàng nguồn còn tồn; chuyển tồn là chứng từ riêng do kế toán lập | "Danh mục không bao giờ tự sinh bút toán" (AGENTS), DG-ITEM-4 |

## 3. Hình dạng cụ thể

### 3.1. CSDL (migration 0070, 0071)

```sql
ALTER TABLE items ADD COLUMN merged_into_item_id text, ADD COLUMN merged_at date;
-- guard: đã gộp thì không đổi; không tự trỏ; đích cùng đơn vị, không vòng
ALTER TABLE items ADD COLUMN root_item_id text;   -- 0071, đích cuối lưu sẵn, trigger giữ khớp

bizcity_item_root(item_id) → text           -- đi theo merged_into tới đích cuối
bizcity_item_family(item_id) → setof text   -- mọi mặt hàng thuộc cùng chuỗi gộp

-- item_id + trigger + khoá ngoại + chỉ mục trên các bảng còn khoá theo mã
supplier_products, supplier_item_aliases, supplier_invoice_lines,
stock_levels, stock_sku_settings, tax_invoice_lines

inventory_movements_cur                     -- 0071: sổ kho với sku = mã hiện hành, snapshot_sku = mã lúc ghi
bizcity_item_current_sku(tenant, sku, ngày) -- 0071: mã hiện hành cho bảng chưa có item_id (sales_lines)
```

**Bảng cấu hình** (`product_units`, `product_prices`, `supplier_products`, `supplier_item_aliases`, `stock_levels`, `stock_sku_settings`, `products.parent_sku`) mô tả hiện tại, nên cột `sku` luôn theo **mã hiện hành**: đổi mã thì tự cập nhật. **Bảng lịch sử** (sổ cái, sổ kho, dòng hoá đơn, chứng từ) giữ nguyên ảnh chụp mã.

### 3.2. Thao tác

Đường dẫn đặt dưới `/api/v1/items/`, tên bằng tên action.

| Action | Việc |
|---|---|
| `core.item.rename-code` | Đổi SKU, hiệu lực từ hôm nay, bắt buộc lý do |
| `core.item.add-code` | Thêm mã vạch, bí danh, `external:<nguồn>` |
| `core.item.merge-preview` | Chỉ đọc: tồn, số dòng, lỗi chặn, xung đột cấu hình |
| `core.item.merge` | Gộp A vào B từ hôm nay, bắt buộc lý do |
| `resolve` · đọc theo `itemId` · `history` | Tra mã tại ngày, đọc mặt hàng, lịch sử |

### 3.3. Gộp A vào B từ ngày D

| Việc | Cách làm |
|---|---|
| Chặn | A hoặc B không tồn tại, trùng nhau, A đã gộp, B đã gộp hoặc ngừng, A còn tồn, khác ĐVT gốc. Gộp không ghi sổ nên không cần xét khoá kỳ |
| Mặt hàng A | `status = retired`, `merged_into_item_id = B`, `merged_at = D` |
| Mã của A | Đóng mọi mã đang mở từ ngày D. SKU và bí danh thành `alias` của B từ D; mã vạch, mã ngoài chuyển sang B giữ nguyên loại |
| Con của A | `parent_item_id` chuyển sang B |
| Cấu hình của A | Chuyển sang B; dòng trùng khoá thì giữ của B, báo trong kết quả |
| Dòng `products` của A | Xoá; lịch sử nằm ở `items`, `item_codes`, `audit_logs` |
| Sổ cũ của A | Không đụng |

Gộp tiếp B vào C từ ngày D2: mã của B thành bí danh của C. Bí danh A đang trỏ về B giữ nguyên, hệ thống đi theo chuỗi gộp tại ngày nên không viết lại gì. Tra mã A: trước D1 ra A, từ D1 đến trước D2 ra B, từ D2 ra C. Sổ của A và B giữ nguyên. Báo cáo gom một dòng dùng `items.root_item_id`, lưu sẵn đích cuối để nối theo tập.

### 3.4. Mã cũ đi vào hệ thống

| Đường vào | Hành vi |
|---|---|
| Cửa nạp, mã đã đổi / đã gộp | Tra `bizcity_item_at`; đã có định danh thì **không tạo mặt hàng mới**. Dòng ghi `item_id` đúng, kèm đúng mã nguồn đã gửi |
| Tạo mặt hàng trùng mã cũ của hàng còn sống / đã gộp | Từ chối, báo mã hiện hành (Q5) |
| Định khoản | Tra phân loại theo `bizcity_item_at` tại ngày (S024-8) |

### 3.5. Hợp đồng cho hệ ngoài (WooCommerce, phần mềm khác)

1. Lần đầu: gọi `resolve` bằng mã → lưu `itemId`; hoặc khai `core.item.add-code` với `kind = external:woocommerce`, `code = <id bên đó>`.
2. Gửi chứng từ: gửi mã như cũ, đổi mã không vỡ.
3. Đồng bộ danh mục: nguồn đổi trả thêm `itemId`, `mergedIntoItemId`.
4. Gặp `mergedIntoItemId` khác rỗng: bên ngoài chuyển sang mặt hàng đích, giữ bản ghi cũ để tra lịch sử.

Bản ghi đọc ổn định:

```json
{ "itemId": "01J…", "sku": "B001", "name": "…", "status": "active", "parentItemId": null, "mergedIntoItemId": null,
  "rootItemId": "01J…", "codes": [{ "kind": "sku", "code": "A001", "validFrom": "1970-01-01", "validTo": "2026-07-01" }] }
```

## 4. Quy tắc khi viết code mới

1. Khoá nối dữ liệu mới là `item_id`. Bảng mới có `sku` thì đó chỉ là ảnh chụp, kèm `item_id`.
2. Báo cáo gom theo `item_id`, hiển thị mã hiện hành. Lọc "theo mã" dùng ảnh chụp; lọc "theo sản phẩm" dùng `item_id`.
3. Không sửa dòng đã ghi sổ.
4. Mọi thay đổi danh mục qua action có lý do và nhật ký `object_id = item_id`.
5. Danh sách mặt hàng không tải cả danh mục về trình duyệt; lọc nhóm ở server.
6. Áp dụng cùng mẫu cho đối tượng, chi nhánh, kho qua `entity_codes` (S026-4).

## 5. Tiến độ

Cập nhật 05/11/2026. Nhánh `feat/xuong-ca-dinh-danh`, dựa trên `feat/phase-026-p0-dot1` và `feat/phase-026-p0-dot4`, **chưa vào main**.

| Mã | Việc | Trạng thái |
|---|---|---|
| S026-3 | Cha – con theo định danh (0067) | Có sẵn trên nhánh dot1 |
| S024-8 | Định khoản theo phân loại tại ngày | Có sẵn trên nhánh dot4 |
| S026-19 | 0070, 0071: gộp nhiều lần, `item_id` trên bảng cấu hình, đồng bộ mã | Có code và test |
| S024-11 | Đổi mã, thêm mã, xem trước gộp, gộp, đọc | Có code và test. Còn `upsert`, `retire-code`, `classify`; `products` chưa thành khung nhìn |
| S026-20 | Cửa nạp và đường tạo mặt hàng gặp mã cũ | Có code và test |
| S026-21 | Báo cáo theo mã hiện hành: mua hàng, kho, bán hàng, lãi gộp | Có code, một phần có test. Còn soát công nợ, thuế |
| S026-22 | Hệ ngoài: đọc theo định danh, mã external, nguồn đổi | Có code và test. Cửa nạp chưa nhận `itemId` |
| S026-23 | Đổi mã, Gộp mã, Lịch sử trên form | Có code, đã qua typecheck, chưa thử trên trình duyệt |
| S026-14 | Đo 21 triệu dòng, xử lý nút nghẽn | Chưa làm |
| Sau | Chứng từ chuyển tồn tự động khi gộp; đổi mã có ngày tương lai; nhóm hàng và kho theo định danh | Chưa làm |

## 6. Kiểm chứng

- Test (chưa tách, sẽ có ở `apps/api/test/` tên xuong-ca-dinh-danh): gồm đổi mã, gộp, gộp hai lần, mã cũ qua cửa nạp, cấu hình đi theo mã mới.
- Bộ kiểm: `node tests/conformance/selfcheck.mjs`.
