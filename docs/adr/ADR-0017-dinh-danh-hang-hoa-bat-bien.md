# ADR-0017 · Định danh hàng hoá bất biến, mã hàng có phiên bản, sổ đã ghi không đổi theo danh mục
<!-- [2026-11-02 09:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — ADR-0017: bất biến cấp Kernel "Item Identity is Immutable. Item Code is Versioned. Posted Ledger is Immutable." theo chỉ đạo chủ dự án; sáu nguyên tắc Item Master & Accounting Classification -->

- Trạng thái: **Chấp nhận về nguyên tắc** — chỉ đạo của chủ dự án (Johnny Chu) 2026-11-02: *"Item Identity is Immutable. Item Code is Versioned. Posted Ledger is Immutable. … Đây nên là một Invariant cấp Kernel, bắt buộc mọi plugin POS, kho, ERP và các module cộng đồng phải tuân thủ."* Chi tiết thi hành D-1…D-9 dưới đây chờ chủ duyệt cùng [PHASE-024](../phases/PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/README.md).
- Ngày: 2026-11-02 · Người quyết: Johnny Chu – Chu Hoàng Anh · Mức Kernel: **K3** khi thi hành (thêm bất biến Tier 0, đổi khoá của sổ phụ kho / dòng sổ từ mã hàng sang định danh) — hai người Nhóm Lõi + kế toán trưởng ký đặc tả; ADR này là bước đầu.
- Phạm vi: ADR này là **thể hiện đầu tiên** (hàng hoá) của nguyên tắc chung [ADR-0018](ADR-0018-danh-muc-co-phien-ban-toan-framework.md) — Versioned Master Data Contract cho mọi đối tượng danh mục, có phân hạng; tài khoản kế toán là ngoại lệ (số hiệu, không định danh thay thế). <!-- [2026-11-02 10:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — nối ADR-0018 -->
- Luật / hợp đồng liên quan: [R-ITEM](../rules/RULE-ITEM.md) (mới), [R-MD](../rules/RULE-MASTER-DATA.md), [R-LEDGER](../rules/RULE-LEDGER.md), [R-KER](../rules/RULE-KERNEL.md), [ADR-0009](ADR-0009-chinh-sach-ke-toan-co-phien-ban.md) (chính sách có phiên bản), [ADR-0014](ADR-0014-tram-tien-kiem-be-cho-dau-vao.md) (trạm tiền kiểm), [bizcity_master_data@1](../contracts/BIZCITY-MASTER-DATA-v1.md), `bizcity_item_master@1` (đề xuất, PHASE-024).

## Bối cảnh

Sổ kế toán nhận hàng hoá từ nhiều nguồn: POS, ERP, kho, plugin cộng đồng. Hôm nay (đọc mã 2026-11-02):

| Hiện trạng | Ở đâu | Vấn đề |
|---|---|---|
| Mặt hàng khoá bằng **mã** (`products.sku`, UNIQUE theo đơn vị); `products.id` có nhưng không nơi nào dùng làm khoá liên kết | `db/migrations/0002` | Đổi mã = mất liên kết lịch sử hoặc phải sửa lịch sử |
| Dòng sổ cái, sổ phụ kho, giá vốn tháng đều ghi **mã** (`ledger_lines.product_sku`, `inventory_movements.sku`, `inventory_costs.sku`) | 0006, 0007 | Đổi mã hoặc gộp mã làm sổ kho, giá vốn, báo cáo theo mã lệch nhau |
| Mã hàng có quy tắc ngành hàng – nhãn – nhóm – số – đuôi (`skuInfo`, [ma-hang.ts](../../modules/mua-hang/domain/src/ma-hang.ts)); loại dòng (hàng thường / chia giá / khuyến mại / kẹp quà / có tem) **suy từ đuôi mã** | gói `@bizcity/mua-hang-domain` | Vi phạm nguyên tắc 4 khi suy luận ấy chạm tới định khoản (giá vốn hàng tặng vào chi phí khuyến mại) |
| Nhóm hạch toán gắn thẳng vào mặt hàng (`products.posting_group_code`); không có nhóm → nhóm mặc định, lặng lẽ | `account-resolver.ts` | Thiếu cấu hình không được nhìn thấy; đổi nhóm không có phiên bản theo ngày hạch toán riêng (ADR-0009 chỉ chụp cấu hình định khoản, không chụp phân loại mặt hàng) |
| Mã hàng lạ trên chứng từ được **tự thêm** vào danh mục (`ensureProducts`) | `document.service.ts` | Plugin ghi được danh mục qua cửa chứng từ mà không qua kiểm; danh mục nở ra mã rác |
| Biến thể = mã con có `parent_sku` (0026, 0033) | `products` | Biến thể là hàng tồn kho riêng nhưng chưa có hợp đồng nói rõ khi nào tách, khi nào gộp |

Chủ dự án yêu cầu chuẩn hoá thành **Item Master & Accounting Classification** nằm trong bộ hợp đồng Core, với sáu nguyên tắc thiết kế và một bất biến cấp Kernel.

## Quyết định

### Bất biến Tier 0 (R-ITEM-0)

> **Item Identity is Immutable. Item Code is Versioned. Posted Ledger is Immutable.**
> Định danh hàng hoá bất biến. Mã hàng được quản lý theo phiên bản và thời gian hiệu lực. Sổ sách đã ghi nhận không bị thay đổi bởi việc cập nhật danh mục.

Có kiểm tự động (trigger + DG-ITEM-* + SC-ITEM-*); vi phạm chặn merge, chặn phát hành; không ngoại lệ (CANON §2 Tier 0).

### Sáu nguyên tắc (R-ITEM-1…6, từ chỉ đạo chủ dự án)

1. Mỗi đối tượng hàng hoá có **định danh duy nhất**, không phụ thuộc tên hay vị trí nhóm hàng.
2. Danh mục có cấu trúc phân cấp nhưng **không dùng mã phân cấp làm khoá liên kết kế toán**.
3. Biến thể cần **tồn kho riêng** khi chúng là những đơn vị hàng hoá phân biệt được.
4. Tài khoản kế toán xác định qua **chính sách hạch toán**, không suy đoán chỉ từ tiền tố mã hàng.
5. Thay đổi danh mục **không làm sai hoặc viết lại** lịch sử giao dịch đã ghi sổ.
6. Dữ liệu từ POS, ERP, kho và plugin phải **vượt qua validation** trước khi ảnh hưởng đến Ledger.

### Thi hành (D-*, chờ chủ duyệt chi tiết)

| # | Quyết định | Vì sao |
|---|---|---|
| D-1 | Bảng `items` với `item_id` (ULID, cấp một lần, không sửa, không dùng lại) là **khoá liên kết duy nhất** của sổ phụ kho, dòng sổ cái, giá vốn, bảng giá, ĐVT. Mã hàng là **thuộc tính có phiên bản** ở `item_codes` (`code`, `kind` = `sku` / `barcode` / `external:<nguồn>`, `valid_from`, `valid_to`, `created_by`), chỉ thêm | nguyên tắc 1, 5; `products.id` hôm nay là bigint theo đơn vị, không mang ra ngoài được |
| D-2 | Dòng sổ cái và sổ phụ kho ghi **cả hai**: `item_id` (khoá) và `product_sku` (ảnh chụp mã tại ngày hạch toán, chỉ để đọc). Migration thêm cột, điền ngược từ mã; trigger sổ cái chặn `UPDATE item_id` / `product_sku` trên dòng đã ghi | nguyên tắc 5; báo cáo cũ không đổi cách đọc |
| D-3 | **Đổi mã** = thêm phiên bản mã mới có `valid_from`; mã cũ còn hiệu lực tới `valid_to`, vẫn tra được cho chứng từ có ngày trước đó. **Gộp mã** = đóng mã cũ, trỏ sang `item_id` đích bằng `item_codes.kind = alias` — không đổi `item_id` trên lịch sử. Không có thao tác "xoá mã đã dùng" (R-MD) | nguyên tắc 1, 2, 5 |
| D-4 | **Phân loại hạch toán** (`item_classification`): loại đối tượng (`goods` / `material` / `finished` / `service` / `tool` / `asset` / `gift` / `packaging`…), nhóm hạch toán, mã thuế vào / ra, cờ theo dõi (lô, hạn, định danh). Có **phiên bản theo ngày hiệu lực** và được chụp vào chính sách kế toán (ADR-0009) — định khoản lại chứng từ cũ dùng phân loại tại ngày hạch toán | nguyên tắc 4, 5 |
| D-5 | **Item Resolution** là bước trong cửa nạp (L3 của trạm tiền kiểm, ADR-0014): mã → `item_id` + mã hiệu lực + phân loại tại `docDate`. Không tra được → mã `IN-ITEM-*`; **không tự thêm** mặt hàng từ chứng từ nữa (bỏ `ensureProducts`), trừ khi đơn vị bật khoá `bizcity.item.auto_create` và khi đó mặt hàng mới mang `source_system`, phân loại = "chưa phân loại" và cảnh báo `IN-ITEM-004` tới khi kế toán phân loại | nguyên tắc 6 |
| D-6 | Luật định khoản chỉ đọc `classification` do Item Resolution trả; `skuInfo` và đuôi mã **chỉ để gợi ý** khi tạo mặt hàng (điền sẵn phân loại, người dùng xác nhận) và để kiểm `IN-MD-002`. Cờ `isGift` trên dòng chứng từ phải khớp phân loại `gift` hoặc lý do có cờ khuyến mại; lệch → `IN-ITEM-006` warn | nguyên tắc 4 |
| D-7 | Biến thể là **item riêng** (có `item_id` riêng, `parent_item_id`) khi phân biệt được về tồn kho (màu, size, lô sản xuất có giá khác). Thuộc tính chỉ để trưng bày (ảnh, mô tả) không tách item | nguyên tắc 3 |
| D-8 | Hợp đồng `bizcity_item_master@1`: khuôn item, mã, phân loại, biến thể, ĐVT; API `core.item.*` (upsert, add-code, retire-code, classify, merge-preview); view chỉ đọc `bizcity_read.items`, `bizcity_read.item_codes`. Plugin **không** ghi bảng `items*` (R-BOUND, SC-MOD-2) | nguyên tắc 6; module SDK 3.17 `core.product.upsert` chuyển tiếp sang `core.item.upsert` |
| D-9 | Bộ kiểm: trigger chỉ thêm cho `item_codes`; `DG-ITEM-1…5` (mã trùng hiệu lực, item không phân loại có phát sinh, dòng sổ `item_id` lệch mã, item bị xoá còn dùng, biến thể trùng); `SC-ITEM-1` (plugin / preset gửi hàng theo hợp đồng); số đo `bizcity_item_*` (PHASE-024 §Prometheus) | Tier 0 có kiểm tự động |

## Hệ quả

- **Người dùng:** đổi mã hàng là thao tác bình thường, có ngày hiệu lực, có lịch sử; không còn "đổi mã thì mất tồn". Mã lạ từ POS không lặng lẽ vào danh mục — vào trạm tiền kiểm với lý do và nút sửa.
- **Plugin:** gửi mã như cũ (`sku`, hoặc `barcode` / mã ngoài); Core tra ra định danh. Muốn chắc chắn thì gửi `itemId`. Không được ghi bảng danh mục.
- **Kernel:** thêm một trụ cột **Item Master** đứng trước Accounting Rules trong chuỗi (xem PHASE-024 §chuỗi); trigger và DG mới. Chi phí: migration K3 có điền ngược (`ledger_lines`, `inventory_movements`, `inventory_costs`, `product_units`, `product_prices`), chạy trong `kiem-nang-cap.sh` trước khi phát hành.
- **Rủi ro:** điền ngược sai → sổ kho lệch. Giảm bằng: điền ngược trong giao dịch, so tổng tồn theo mã trước / sau bằng 0, DG-ITEM-3 chạy sau nâng cấp, sao lưu trước.

## Phương án đã cân nhắc

| Phương án | Vì sao không chọn |
|---|---|
| Giữ mã làm khoá, "đổi mã" = UPDATE hàng loạt lịch sử | Viết lại sổ đã ghi — trái R-LEDGER, trái nguyên tắc 5 |
| Mã phân cấp (ngành – nhóm – số) làm khoá và suy tài khoản từ tiền tố | Chuyển nhóm hàng phải đổi mã; tài khoản theo đuôi mã là suy đoán, không phải chính sách (nguyên tắc 2, 4) |
| Để plugin tự quản danh mục, Core chỉ nhận mã | Core không kiểm được, giá vốn và đối chiếu kho không có nền chung (nguyên tắc 6) |
| Dùng `products.id` bigint hiện có làm định danh | Không ổn định giữa bản cài / khi nhập xuất dữ liệu; không mang ra plugin được. ULID chọn được thứ tự thời gian, in ra được |
