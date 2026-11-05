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

### 3.1. CSDL (migration 0068, 0069, 0070, 0071)

```sql
ALTER TABLE items ADD COLUMN merged_into_item_id text, ADD COLUMN merged_at date;
-- guard: đã gộp thì không đổi; không tự trỏ; đích cùng đơn vị, không vòng
ALTER TABLE items ADD COLUMN root_item_id text;   -- 0069, đích cuối lưu sẵn, trigger giữ khớp

bizcity_item_root(item_id) → text           -- đi theo merged_into tới đích cuối
bizcity_item_family(item_id) → setof text   -- mọi mặt hàng thuộc cùng chuỗi gộp

-- item_id + trigger + khoá ngoại + chỉ mục trên các bảng còn khoá theo mã
supplier_products, supplier_item_aliases, supplier_invoice_lines,
stock_levels, stock_sku_settings, tax_invoice_lines

inventory_movements_cur                     -- 0069: sổ kho với sku = mã hiện hành, snapshot_sku = mã lúc ghi
bizcity_item_current_sku(tenant, sku, ngày) -- 0069: mã hiện hành khi chỉ có mã
products.item_id                            -- 0070: dòng danh mục trỏ thẳng định danh, trigger cấp, không đổi được
bizcity_items_of_codes(tenant, mã[])        -- 0070: mã bất kỳ → cả chuỗi gộp, dùng khi lọc sổ theo mặt hàng
bizcity_item_sku_at(item_id, ngày)          -- 0070: định danh → mã tại ngày, dùng cho cửa nạp nhận itemId
itemId trên dòng JSON                       -- 0070: purchase_documents, transfer_requests, stock_max_requests, trigger gắn
sales_lines.item_id, bizcity_read.*         -- 0070: khung nhìn đọc có item_id; thêm bizcity_read.items, item_codes
bizcity_item_search_text, products_search   -- 0071: tìm theo một phần mã, tên, ghi chú bằng chỉ mục trigram (cần pg_trgm)
```

Không gắn định danh vào `accounting_events.payload`, `document_versions.snapshot`: đây là nguyên bản nguồn, là căn cứ so nội dung phiếu. Định danh nằm trên dòng sổ, dòng kho, dòng hoá đơn sinh ra từ phiếu. `purchase_policies` giữ mã hiện hành trong JSON, đổi mã và gộp mã thì đổi theo.

**Bảng cấu hình** (`product_units`, `product_prices`, `supplier_products`, `supplier_item_aliases`, `stock_levels`, `stock_sku_settings`, `products.parent_sku`) mô tả hiện tại, nên cột `sku` luôn theo **mã hiện hành**: đổi mã thì tự cập nhật. **Bảng lịch sử** (sổ cái, sổ kho, dòng hoá đơn, chứng từ) giữ nguyên ảnh chụp mã.

### 3.2. Thao tác

Đường dẫn đặt dưới `/api/v1/items/`, tên bằng tên action.

| Action | Việc |
|---|---|
| `core.item.rename-code` | Đổi SKU, hiệu lực từ hôm nay, bắt buộc lý do |
| `core.item.add-code` | Thêm mã vạch, bí danh, `external:<nguồn>` |
| `core.item.retire-code` | Đóng mã vạch, bí danh, mã ngoài từ hôm nay. Mã hàng chính không đóng riêng |
| `core.item.classify` | Đổi nhóm hạch toán, thuế từ hôm nay; chứng từ trước đó giữ phân loại cũ |
| `core.item.upsert` | Như `core.product.upsert`, trả về `itemId` |
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
| Cửa nạp, dòng gửi `itemId` | `sku` trống thì lấy mã tại ngày chứng từ. Có cả hai mà khác mặt hàng thì từ chối, vào bể chờ |
| Cửa nạp, mã đã đổi / đã gộp | Tra `bizcity_item_at`; đã có định danh thì **không tạo mặt hàng mới**. Dòng ghi `item_id` đúng, kèm đúng mã nguồn đã gửi |
| Tạo mặt hàng trùng mã cũ của hàng còn sống / đã gộp | Từ chối, báo mã hiện hành (Q5) |
| Định khoản | Tra phân loại theo `bizcity_item_at` tại ngày (S024-8) |

### 3.5. Hợp đồng cho hệ ngoài (WooCommerce, phần mềm khác)

1. Lần đầu: gọi `resolve` bằng mã → lưu `itemId`; hoặc khai `core.item.add-code` với `kind = external:woocommerce`, `code = <id bên đó>`.
2. Gửi chứng từ: gửi mã như cũ, hoặc `itemId`, hoặc cả hai. Đổi mã không vỡ.
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
   Bảng mới có cột mã hàng mà thiếu `item_id` thì test canh cửa báo đỏ.
4. Mọi thay đổi danh mục qua action có lý do và nhật ký `object_id = item_id`.
5. Danh sách mặt hàng không tải cả danh mục về trình duyệt; lọc nhóm ở server.
6. Áp dụng cùng mẫu cho đối tượng, chi nhánh, kho qua `entity_codes` (S026-4).

## 5. Tiến độ

Cập nhật 05/11/2026.

| Mã | Việc | Trạng thái |
|---|---|---|
| S026-3 | Cha – con theo định danh (0067) | Xong |
| S024-8 | Định khoản theo phân loại tại ngày | Xong |
| S026-19 | 0068, 0069, 0070: gộp nhiều lần, `item_id` trên mọi bảng có mã hàng và dòng JSON, khung nhìn đọc | Xong, có test canh cửa |
| S024-11 | `upsert`, `add-code`, `retire-code`, `classify`, `rename-code`, `merge-preview`, `merge`; `validate` và `trace` là `POST /api/v1/products/validate`, `GET /api/v1/lineage/items/:sku/history`; `bizcity_read.items`, `item_codes` | Xong. Giữ `products` là bảng ghi, không đổi thành khung nhìn (mục 7) |
| S026-20 | Cửa nạp và đường tạo mặt hàng gặp mã cũ | Xong |
| S026-21 | Báo cáo theo mặt hàng: mua hàng, kho, bán hàng, lãi gộp, sổ kế toán, đối chiếu kho, đọc sổ của Kernel | Xong. Công nợ không theo mặt hàng; thuế hiện mã lúc ghi trên hoá đơn, giữ nguyên |
| S026-22 | Hệ ngoài: đọc theo định danh, mã external, nguồn đổi, cửa nạp nhận `itemId` | Xong |
| S026-23 | Đổi mã, Gộp mã, Lịch sử trên form | Xong, đã thử trên trình duyệt |
| S026-14 | Đo 21 triệu mặt hàng, xử lý nút nghẽn | Xong phần mặt hàng. Chưa đo sổ cái lớn và 300 chi nhánh |

Chưa làm, không nằm trong đợt này:
- Chứng từ chuyển tồn khi gộp: gộp bị chặn khi còn tồn, kế toán lập chứng từ riêng (Q6).
- Đổi mã có ngày tương lai.
- Mã có phiên bản cho đối tượng, chi nhánh, kho (S026-4) và cây nhóm hàng (S026-5): đang có phiên khác giữ chỗ.

## 6. Kiểm chứng

- Test: `apps/api/test/xuong-ca-dinh-danh.test.ts`, gồm đổi mã, gộp hai lần, mã cũ qua cửa nạp, cửa nạp nhận `itemId`, sổ chi tiết qua đổi mã, JSON dòng phiếu, và test canh cửa.
- Bộ kiểm: `node tests/conformance/selfcheck.mjs`.
- Thử migration trên CSDL local thật (42.016 mặt hàng): áp đủ, không dòng nào thiếu `item_id`.
- Thử giao diện trên Chrome với CSDL test: Đổi mã, Lịch sử, Gộp mã, Lịch sử của mặt hàng giữ lại, màn TI10.

### Đo tải (05/11/2026)

Dữ liệu giả lập: 1.000.000 mã cha × 21 (cha + 20 biến thể) = 21.000.000 dòng mỗi bảng `items`, `item_codes`, `item_classification`, `products`, cùng 10.000.000 dòng `inventory_movements`. CSDL 32 GB. Máy 12 nhân, RAM 8 GB, PostgreSQL mặc định `shared_buffers` 128 MB, tức là số đo thấp hơn server cấu hình đúng. Đo xong đã xoá dữ liệu.

| Thao tác | Trước | Sau khi sửa |
|---|---|---|
| Tra mã tại ngày | 30 ms | |
| Mã → cả chuỗi gộp | 12 ms | |
| Sổ kho theo mặt hàng | 33 ms | |
| Trang 5.000 mặt hàng | 16 ms | |
| Mã con của một cha | 3 ms | |
| Thêm 2.000 mặt hàng qua trigger | 2,5 giây | |
| Đổi mã | 22 ms | |
| Gộp mã, gộp tiếp lần hai | 11–18 ms | |
| Tìm đúng mã | 76 giây | 0,19 giây |
| Tìm một phần mã | | 0,16 giây |
| Tìm hai từ | | 0,35 giây |
| Tìm từ phổ biến | | 0,04 giây |
| Mã theo nhóm (42.000 mã) | 14 giây | 0,003 giây |
| Đếm tổng danh sách | 3,5 giây | 0,008 giây, đếm tới 100.001 thì dừng |

Dựng chỉ mục tìm kiếm trên 21 triệu dòng mất 6 phút 13 giây, chiếm 853 MB. Migration 0071 dùng `CREATE INDEX` thường nên khoá ghi `products` trong lúc dựng; dữ liệu hiện tại nhỏ nên không đáng kể, danh mục đã lớn thì dựng trước bằng `CREATE INDEX CONCURRENTLY`.

**Ghi nhiều dòng:** nạp 20.000 mặt hàng trong **một giao dịch** trên CSDL gần trống mất 213 giây, vì kế hoạch truy vấn lưu sẵn chọn quét bảng trong khi bảng lớn dần. Khi CSDL đã có thống kê thì chỉ 17 giây. Theo lô 2.000 dòng, mỗi lô một giao dịch, ổn định 1,9 giây mỗi lô. Đường đồng bộ `core.product.sync` giới hạn 2.000 dòng mỗi lần nên không dính. Công cụ nạp lớn phải chia lô.

**Chưa đo:** sổ cái lớn, báo cáo cộng cả kho trên 10 triệu dòng, đồng thời nhiều người ghi, 300 chi nhánh. Khoá ghi mã (`pg_advisory_xact_lock` theo đơn vị + loại mã) cho hai người thêm mã cùng lúc đi nối đuôi; chưa đo khi ghi đồng thời cao.

## 7. Quyết định thêm khi làm

| # | Quyết định | Lý do |
|---|---|---|
| Q7 | Giữ `products` là bảng ghi, thêm `item_id`; không đổi thành khung nhìn | Đổi sang khung nhìn phải sửa mọi đường ghi và gói cài đặt, lợi ích không tương xứng; `items` vẫn là nguồn định danh |
| Q8 | `itemId` trong JSON dòng phiếu do trigger gắn, không do code từng màn | Đường ghi nào cũng có, không sót khi thêm màn mới |
| Q9 | Lọc sổ bằng mã nào cũng ra cả mặt hàng; lọc riêng phần ghi dưới đúng mã dùng `codeOnly=true` | Đúng câu hỏi thường gặp, vẫn lấy riêng được |
| Q10 | Danh sách mặt hàng phân trang 5.000 dòng; tổng đếm tới 100.001 thì dừng | Không tải cả danh mục về trình duyệt, không quét cả bảng mỗi lần mở |
