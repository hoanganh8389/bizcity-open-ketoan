# `bizcity_item_master@1` — Item Master: định danh bất biến, mã có phiên bản, phân loại theo ngày
<!-- [2026-11-03 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — B2a (S024-4 / 5 / 6): hợp đồng Item Master phần dữ liệu + Item Resolver; chạy song song với products (ADR-0017, R-ITEM) -->

<!-- [2026-11-04 12:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — B2b: 0.2.0-draft — item_id trên bảng sổ / kho (0066) -->
<!-- [2026-11-04 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-3: 0.3.0-draft — họ mặt hàng theo định danh (0067) -->
> **Phiên bản:** 0.3.0-draft · 2026-11-04 · **Trạng thái:** Đề xuất (B2a + B2b phần 1: dữ liệu, Item Resolver, `item_id` trên dòng sổ / kho; `products` vẫn là bảng)
> **Nguồn sự thật:** `packages/contracts/src/item-master.ts` (kiểu) · `db/migrations/0065_mat_hang_dinh_danh.sql` (bảng, bất biến) · `packages/kernel/src/modules/masterdata/item-resolver.ts`
> **Luật:** [R-ITEM](../rules/RULE-ITEM.md) · **Quyết định:** [ADR-0017](../adr/ADR-0017-dinh-danh-hang-hoa-bat-bien.md), [ADR-0018](../adr/ADR-0018-danh-muc-co-phien-ban-toan-framework.md) · **Kế hoạch:** [PHASE-024 · 70 §3](../phases/PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/70-LO-TRINH-ON-DINH-CORE.md)

## 1. Ý nghĩa

**Item Identity is Immutable. Item Code is Versioned. Posted Ledger is Immutable.** Một mặt hàng có **một `item_id`** (ULID) không đổi suốt vòng đời; mã hàng (sku, mã vạch, bí danh, mã của hệ thống ngoài) chỉ là **cách tra**, có ngày hiệu lực; phân loại hạch toán đổi theo ngày. Đổi mã, gộp mã, đổi nhóm hạch toán không viết lại lịch sử.

## 2. Bảng (migration 0065)

| Bảng | Giữ gì | Bất biến ở CSDL |
|---|---|---|
| `items` | `item_id` (ULID), tên, đơn vị gốc, `status` (`draft` · `active` · `retired`), `draft_codes`, thuộc tính, nguồn. **Không có cột mã** | không đổi / xoá `item_id`, đơn vị, ngày tạo; không `TRUNCATE`; ngừng dùng = `status = retired` |
| `item_codes` | `(kind, code, valid_from, valid_to)` → `item_id`; `kind` = `sku` · `barcode` · `alias` · `external:<nguồn>` | **chỉ thêm**: UPDATE duy nhất là đóng `valid_to` (một lần); không xoá; **chặn chồng hiệu lực** cùng `(đơn vị, loại, mã)` — một mã tại một ngày trỏ ≤ 1 mặt hàng (DG-ITEM-1); khoá ngoại ghép `(tenant_id, item_id)` |
| `item_classification` | theo ngày: `kind` (hàng hoá, nguyên vật liệu, dịch vụ…; NULL = chưa phân loại), nhóm hạch toán, thuế vào / ra, thuế TTĐB, theo dõi (`track`), `policy_version` | bản của ngày trước là lịch sử (không sửa / xoá); chỉ chỉnh được bản đang mở **bắt đầu / tạo hôm nay**; chặn chồng hiệu lực |

Cô lập đơn vị bằng RLS (như 0041). `item_id`: ULID Crockford base32, 26 ký tự, sắp theo thời gian (`bizcity_ulid()`).

## 3. Chạy song song với `products` (B2a)

`products` **chưa đổi**. Trigger `products_items_sync` giữ ba bảng trên khớp **mọi đường ghi mặt hàng** (form, Excel, đồng bộ POS, module, `ensureProducts`…) — không có cửa phụ (R-GATE-1):

| `products` | `items` / `item_codes` / `item_classification` |
|---|---|
| thêm | tạo mặt hàng mới + mã `sku` (từ 1970-01-01) + mã `barcode` (nếu có) + phân loại hiện hành |
| đổi `sku` | **đóng** mã cũ, **thêm** mã mới từ hôm nay, `item_id` giữ nguyên (ghi chú "đổi mã từ …") |
| đổi mã vạch | đóng mã vạch cũ, thêm mã mới; hai mặt hàng **trùng mã vạch** không làm hỏng việc ghi: mặt hàng sau ghi `attributes.barcodeConflict` để kế toán xử lý (DG-ITEM-1) |
| đổi tên, đơn vị, nhóm hàng, nháp, ngừng dùng | cập nhật `items` (nháp → `draft`, ngừng → `retired`) |
| đổi nhóm hạch toán, thuế, theo dõi | phân loại: trong ngày tạo → chỉnh bản đang mở; ngày khác → **đóng bản cũ, thêm bản mới từ hôm nay** (lịch sử giữ nguyên) |
| xoá | `status = retired`, đóng mọi mã; `item_id` không bao giờ dùng lại |

Điền ban đầu: `bizcity_items_backfill([tenant])` (chạy ở cuối migration; chạy lại an toàn, trả số mặt hàng mới điền). Trigger bỏ khi mọi đường ghi đã chuyển sang `items` (S024-11) — `products` thành khung nhìn sau đó (70 §3.2.1 G1).

Tạo lại một mã đã xoá: mặt hàng **mới**, mã bắt đầu từ ngày mã cũ đóng (không chồng hiệu lực). Mã đang mở của **mặt hàng mồ côi** (§3a) → khai mặt hàng với mã đó thì **nhận lại** định danh, không tạo mới. Khoá chống chồng hiệu lực theo (đơn vị, loại mã) — khoá theo từng mã làm cạn bảng khoá khi nạp hàng chục nghìn mặt hàng.

**Chi phí đo trên 2.000 mặt hàng qua `PUT /api/v1/products`:** gửi lại y nguyên +0%, đổi tên +12%, thêm mới +40% (3,3 s → 4,6 s).

## 3a. `item_id` trên dòng sổ / kho (migration 0066, B2b)

| Bảng | Ngày dùng để tra mã | Ghi chú |
|---|---|---|
| `ledger_lines` | `posting_date` | **chỉ thêm**: ngoại lệ duy nhất là điền `item_id` từ rỗng, một lần; đổi / xoá `item_id`, đổi `product_sku` bị chặn |
| `inventory_movements` | `doc_date` | bảng dẫn xuất (ghi lại theo chứng từ) |
| `inventory_costs` | ngày 1 của tháng | bảng dẫn xuất (ghi lại theo lần tính giá) |
| `product_units`, `product_prices` | hôm nay | |

- Cột mã (`product_sku` / `sku`) **giữ lại = ảnh chụp mã tại ngày**; liên kết kế toán đi theo `item_id` (R-ITEM-1). Khoá ngoại ghép `(tenant_id, item_id) → items`.
- `bizcity_item_at(tenant, sku, ngày)`: mã có hiệu lực tại ngày; không có thì mã gần nhất; không có mã → NULL.
- Dòng mới: trigger `bizcity_set_item_id` gắn theo mã tại ngày. Mã chưa có trong danh mục lúc ghi (mặt hàng tự thêm SAU khi ghi sổ) → `bizcity_item_fill_refs` điền khi mặt hàng được tạo / đổi mã.
- Điền ngược: theo mã hiệu lực tại ngày, rồi mã gần nhất; mã có trong sổ / kho / đơn vị / giá mà **không có trong danh mục** → **mặt hàng mồ côi** (`status = retired`, `attributes.orphan`, `bizcity_items_adopt_orphans`); còn dòng có mã mà thiếu `item_id` → migration dừng.

## 4. Item Resolver (`resolveItem` / `resolveItems`, Kernel, chỉ đọc)

`(ItemRef, asOf)` → `ResolveResult`. `ItemRef` = `{ itemId? | sku? | barcode? | external? }`; thứ tự: itemId → sku (và bí danh) → barcode → mã ngoài.

| Kết quả | Khi |
|---|---|
| `ok` + `itemId`, `code` (mã hiệu lực tại ngày), `classification` (bản hiệu lực tại ngày), `units` (đơn vị → hệ số), `status`, `unclassified`, `alias?` | tra ra |
| `IN-ITEM-001` | mã chưa có trong danh mục |
| `IN-ITEM-002` | mã **có** nhưng không hiệu lực tại ngày — `detail` nêu các khoảng hiệu lực |
| `IN-ITEM-008` | `itemId` không thuộc đơn vị / sai khuôn |

`unclassified` = chưa có bản phân loại hoặc `kind` NULL: **không được định khoản lặng lẽ bằng nhóm mặc định** (R-ITEM-8). `resolveItems` gom một truy vấn cho cả chứng từ. Mã `IN-ITEM-002` / `008` khai vào thư viện mã khi tích hợp tiền kiểm (S024-7).

## 5. Chưa có (các bước sau)

Hợp đồng nhập / xuất cho plugin (`itemId`, `barcode` trên dòng hàng của `bizcity_ledger_intake`), action `core.item.*` (S024-11), đệm theo phiên bản danh mục + span `intake.item.resolve` (S024-6 phần còn lại), `products` thành khung nhìn (B2b-2, sau S024-11), giá vốn và báo cáo kho gom theo `item_id` (70 §3.2.1 G2).

## 6. Bảo đảm

- Test `apps/api/test/item-master.test.ts` (18 ca): đồng bộ, đổi mã, xoá, mã vạch trùng, bất biến ở CSDL, điền ban đầu, Resolver.
- Test `apps/api/test/item-id-so-kho.test.ts` (6 ca): mặt hàng tự thêm sau chứng từ được điền `item_id`, đổi mã giữa kỳ cùng định danh + Hành trình nối mã cũ / mới, sổ cái chặn đổi `item_id` / mã, mặt hàng mồ côi được nhận lại, xoá rồi tạo lại cùng mã, trigger gắn `item_id` dòng mới.
- Mọi bảng / cột có `COMMENT ON` (SC-DATA-3); bảng khai ở `schema-catalog`.

## 7. Changelog

- **0.3.0-draft (2026-11-04):** họ mặt hàng theo định danh — `items.parent_item_id` điền + giữ khớp từ `products.parent_sku` (0067), đổi mã không đứt họ, chặn tự trỏ / vòng / khác đơn vị; Gate A `ITEM-HINT-003` (đổi ĐVT gốc của mặt hàng đã có nhập xuất).
- **0.2.0-draft (2026-11-04):** B2b phần 1 — `item_id` trên `ledger_lines`, `inventory_movements`, `inventory_costs`, `product_units`, `product_prices` (0066); mặt hàng mồ côi; tạo lại mã đã xoá không chồng hiệu lực; khoá chống chồng hiệu lực theo đơn vị.
- **0.1.0-draft (2026-11-03):** B2a — `items`, `item_codes`, `item_classification`, trigger đồng bộ, điền ban đầu, Item Resolver.
