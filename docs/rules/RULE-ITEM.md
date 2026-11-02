# RULE-ITEM — Định danh hàng hoá, mã hàng, phân loại hạch toán (R-ITEM)
<!-- [2026-11-02 09:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — luật R-ITEM theo ADR-0017: bất biến định danh, sáu nguyên tắc Item Master & Accounting Classification, hành vi cụ thể khi người dùng làm việc -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> Cấp: **0** cho R-ITEM-0 (bất biến), **1** cho R-ITEM-1…9. Nguồn: [ADR-0017](../adr/ADR-0017-dinh-danh-hang-hoa-bat-bien.md). Thi hành: [PHASE-024](../phases/PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/README.md). Trạng thái: **chấp nhận về nguyên tắc, chưa có mã** — bảng "Kiểm bằng" ghi kiểm sẽ có.

## 1. Bất biến (Tier 0)

| Mã | Luật | Cấp |
|---|---|---|
| R-ITEM-0 | **Item Identity is Immutable. Item Code is Versioned. Posted Ledger is Immutable.** — định danh hàng hoá bất biến; mã hàng có phiên bản và ngày hiệu lực; sổ đã ghi không đổi theo danh mục | 0 |

| Vế | Nghĩa trong hệ thống | Kiểm bằng |
|---|---|---|
| Định danh bất biến | `items.item_id` cấp một lần (ULID), không `UPDATE`, không dùng lại sau khi ngừng; mọi liên kết kế toán (sổ phụ kho, dòng sổ, giá vốn, giá bán, ĐVT) trỏ `item_id`, không trỏ mã | trigger `items_identity_immutable`; DG-ITEM-3 |
| Mã có phiên bản | `item_codes` chỉ thêm; mỗi mã có `valid_from` / `valid_to`; tại một ngày, một `(đơn vị, kind, code)` trỏ đúng **một** item | trigger chỉ thêm; DG-ITEM-1 (trùng hiệu lực) |
| Sổ đã ghi không đổi | sửa / đổi / gộp / ngừng mã, đổi nhóm hạch toán, đổi loại đối tượng **không** chạm `ledger_*`, `inventory_movements`, `inventory_costs` đã ghi; muốn sửa sổ thì lập chứng từ mới (R-LEDGER) | trigger sổ cái; DG-LEDGER-*; `assertLedgerInvariants` |

## 2. Sáu nguyên tắc (R-ITEM-1…6)

| Mã | Luật | Thể hiện khi người dùng làm việc | Kiểm bằng |
|---|---|---|---|
| R-ITEM-1 | Mỗi đối tượng hàng hoá có định danh duy nhất, không phụ thuộc tên hay vị trí nhóm hàng | Thẻ mặt hàng hiện `item_id` và **lịch sử mã**; đổi tên, chuyển nhóm hàng không đổi gì ở sổ; nút "Đổi mã" hỏi ngày hiệu lực | DG-ITEM-1, SC-ITEM-1 |
| R-ITEM-2 | Cấu trúc phân cấp (ngành – nhóm – sản phẩm – biến thể) để tìm, lọc, báo cáo — **không** làm khoá liên kết kế toán | Cây danh mục kéo thả được; chuyển cành không sinh phiếu, không đổi sổ; báo cáo theo nhóm lấy theo nhóm **tại ngày** (ảnh chụp) hoặc nhóm hiện tại — người xem chọn, mặc định "tại ngày" | SC-ITEM-2 (mã không là khoá ngoại ở bảng sổ) |
| R-ITEM-3 | Biến thể phân biệt được về tồn kho (màu, size, lô có giá khác) là item riêng có `parent_item_id`; thuộc tính trưng bày không tách item | Form biến thể hỏi "Có theo dõi tồn riêng không?"; sổ kho hiện theo biến thể, gộp theo cha khi xem tổng | DG-ITEM-5 (biến thể trùng thuộc tính) |
| R-ITEM-4 | Tài khoản kế toán xác định qua **chính sách hạch toán** (phân loại → nhóm hạch toán → tài khoản, theo chế độ có phiên bản), không suy từ tiền tố / đuôi mã | Quy tắc mã (`skuInfo`) chỉ **điền sẵn** phân loại lúc tạo mặt hàng, người dùng xác nhận; thẻ mặt hàng hiện "Hạch toán: nhóm X → 156 / 632 / 511, theo chế độ v3 từ 01/10/2026"; dòng khuyến mại mà phân loại không phải `gift` → cảnh báo IN-ITEM-006 | SC-ITEM-3 (luật định khoản không import `skuInfo`); test luật |
| R-ITEM-5 | Thay đổi danh mục không làm sai hoặc viết lại lịch sử đã ghi sổ | Mọi thay đổi có ngày hiệu lực; màn "Lịch sử" của mặt hàng liệt kê từng lần đổi (ai, khi nào, từ → đến); "Gộp mã" chỉ tạo bí danh, kèm xem trước số dòng sổ bị ảnh hưởng = 0 | trigger; DG-ITEM-3; `assertLedgerInvariants` |
| R-ITEM-6 | Dữ liệu từ POS, ERP, kho, plugin phải qua validation (Item Resolution + IN-ITEM-*) trước khi ảnh hưởng Ledger | Mã lạ / mã hết hiệu lực / mã trỏ hai item / thiếu ĐVT / chưa phân loại → chứng từ vào **Trạm tiền kiểm** với mã lỗi, lý do, nút sửa; không tự thêm mặt hàng (trừ khi đơn vị bật `bizcity.item.auto_create`) | SC-ITEM-1, DG-INTAKE-1, test cửa nạp |

## 3. Luật thi hành (R-ITEM-7…9)

| Mã | Luật | Kiểm bằng |
|---|---|---|
| R-ITEM-7 | Phân loại hạch toán có **phiên bản theo ngày hiệu lực** và được chụp vào chính sách kế toán (ADR-0009); định khoản lại chứng từ cũ dùng phân loại tại ngày hạch toán | `policy.test.ts` mở rộng; DG-ITEM-2 |
| R-ITEM-8 | Mặt hàng "chưa phân loại" được phép tồn tại nhưng **không được định khoản lặng lẽ** bằng nhóm mặc định: chứng từ dùng nó → `IN-ITEM-004` warn ở trạm, `DG-ITEM-2` đếm; nhóm mặc định chỉ áp khi đơn vị bật `bizcity.item.default_group_fallback` (mặc định tắt cho đơn vị mới, bật cho đơn vị đang chạy tới khi phân loại xong) | DG-ITEM-2; số đo `bizcity_items_unclassified` |
| R-ITEM-9 | Plugin / module / preset gửi hàng hoá theo `bizcity_item_master@1`; không ghi bảng `items*`, `products*`; muốn tạo mặt hàng thì gọi `core.item.upsert` (có validation) | SC-ITEM-1, SC-MOD-2 |

## 4. Mã kiểm (đặt trước, PHASE-024 thi hành)

| Mã | Lớp | Mức | Nghĩa |
|---|---|---|---|
| IN-ITEM-001 | L3 | block | mã không tra được ra item (không có, hoặc ngoài khoảng hiệu lực tại `docDate`) |
| IN-ITEM-002 | L3 | block | mã trỏ nhiều item tại `docDate` (dữ liệu danh mục lỗi — kèm remedy mở thẻ mặt hàng) |
| IN-ITEM-003 | L3 | block | ĐVT trên dòng không khai cho item (thay IN-MD-003) |
| IN-ITEM-004 | L3 | warn | item chưa phân loại hạch toán (dùng nhóm mặc định nếu đơn vị cho phép) |
| IN-ITEM-005 | L3 | warn | mã gửi là mã **đã ngừng** (có bí danh) — Core đã đổi sang item đích, nguồn nên cập nhật |
| IN-ITEM-006 | L3 | warn | cờ dòng (`isGift`, `excludeFromCost`) lệch phân loại / lý do |
| IN-ITEM-007 | L3 | hint | mã sai quy tắc đặt mã của đơn vị (`SKU_RULE`, thay IN-MD-002) |
| IN-ITEM-008 | L3 | block | plugin gửi `itemId` không thuộc đơn vị |
| DG-ITEM-1 | L3 | error | hai mã cùng `kind` + `code` trùng khoảng hiệu lực |
| DG-ITEM-2 | L3 | warn | item chưa phân loại mà có phát sinh trong kỳ |
| DG-ITEM-3 | L3 | error | dòng sổ / sổ kho có `item_id` không khớp mã hiệu lực tại ngày hạch toán, hoặc `item_id` không tồn tại |
| DG-ITEM-4 | L3 | error | item ngừng (`retired_at`) còn tồn kho ≠ 0 hoặc còn phát sinh sau ngày ngừng |
| DG-ITEM-5 | L3 | warn | hai biến thể cùng cha trùng toàn bộ thuộc tính phân biệt |
| SC-ITEM-1 | tĩnh | block | preset / module / fixture gửi hàng đúng `bizcity_item_master@1` (schema) |
| SC-ITEM-2 | tĩnh | block | không bảng sổ nào khai khoá ngoại tới `products.sku`; migration mới không thêm cột `sku` làm khoá liên kết |
| SC-ITEM-3 | tĩnh | block | `packages/kernel/src/modules/posting/**` không import `@bizcity/mua-hang-domain` (`skuInfo`) |
