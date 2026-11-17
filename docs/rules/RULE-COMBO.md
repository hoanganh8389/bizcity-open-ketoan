# RULE · Combo — định danh combo, phân kho, nguồn quà (R-COMBO)
<!-- [2026-11-17 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-037 — luật R-COMBO theo ADR-0035: combo không phải mặt hàng; combo có phiên bản; bảo toàn lượng theo item_id · lô; truy được từng dòng quà; một sự thật kế toán; tách kế toán khỏi thuế; hai mặt mua / bán, kế thừa phải phát hành; phân kho là một vị trí tồn; nguồn quà có tên; hết combo thì bán rời -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Cấp:** Tier 1 (R-COMBO-1…10) · **Trạng thái:** **Chấp nhận 2026-11-17** <!-- [2026-11-17 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-037 — R-COMBO chấp nhận cùng ADR-0035; R-COMBO-8 phân kho chính mặc định phankho_id = 0; mã nhóm 8 chuyển hết; R-COMBO-9 là CANON §0.11 --> — sáu luật đầu do chủ dự án nêu, R-COMBO-7..10 duyệt cùng D037 ([ADR-0035](../adr/ADR-0035-combo-identity-phan-kho-nguon-qua.md)); R-COMBO-9 nâng thành [CANON §0.11](../00-CANON.md). **Chưa có mã** — luật có hiệu lực từng điều khi bước tương ứng có mã. Cột "Kiểm bằng" ghi phép kiểm **sẽ có**.
> **Thi hành:** [PHASE-037](../phases/PHASE-037-COMBO-IDENTITY-PHAN-KHO-KHUYEN-MAI/README.md) · **Hợp đồng:** [`bizcity_combo@1`](../contracts/BIZCITY-COMBO-v1.md) (0.2.0-draft).
> Luật nền: [R-ITEM](RULE-ITEM.md) (R-ITEM-0, R-ITEM-10), [R-INV](RULE-INVENTORY.md), [R-CONT](RULE-CONTINUITY.md), [R-LEDGER](RULE-LEDGER.md), [R-POST](RULE-POSTING.md), [R-GATE](RULE-GATE.md) (R-GATE-9..11), [R-MD](RULE-MASTER-DATA.md).

## Nguyên tắc một câu

> **Combo là một thoả thuận thương mại có phiên bản, không phải một mặt hàng.** Hàng thật — kể cả quà — luôn mang `item_id` của chính nó; combo chỉ nói *vì sao* các dòng hàng đó đi cùng nhau, *lần nào*, *theo bản chính sách nào*. Phân kho nói hàng *ở đâu*; nguồn quà nói hàng *từ đâu, của ai*. Không cái nào trong ba thứ đó tự quyết định giá vốn hay thuế.

## Sáu định danh không trộn

| Định danh | Trả lời | Có sẵn? |
|---|---|---|
| `item_id` | Hàng gì (lon sữa 800 g, lon 1,6 kg, xe chòi chân là ba mặt hàng) | có — `bizcity_item_master@1` |
| `combo_id` | Thoả thuận / cấu hình nào (3 tặng 1, mua 4 lon tặng xe) | **mới** |
| `combo_version` (+ `hash`) | Bản nào: thành phần, điều kiện, chính sách, hiệu lực | **mới**, đi trên Policy Registry |
| `combo_instance_id` | Lần thực hiện nào trong đơn mua / phiếu nhận / phiếu bán | **mới** |
| `phankho_id` | Hàng ở phân kho nào (hàng bán, khuyến mại, giữ hộ, chờ xử lý…) | có — chính là `warehouses.uid` (`kho_…`, migration 0121); loại phân kho = `warehouses.type_code` (0128) |
| `lot_id` + `source_line_ref` + `allocation_id` | Lô nào, từ dòng chứng từ nào, mang giá trị nào | lô có (0098); phân bổ chờ PHASE-032 |

**Không có `combo_item_id`.** Mã vạch dán trên lốc 4 lon là *mã của combo* (`combo_codes`), không phải mã hàng.

## Luật

| Mã | Luật | Thể hiện khi làm việc | Kiểm bằng |
|---|---|---|---|
| **R-COMBO-1** | **Định danh.** `combo_id` không phải `item_id`. Mọi thành phần vật chất của combo trỏ một `item_id` **đã có** trong Item Master. Không tạo mặt hàng vì lý do đóng gói thương mại, tỷ lệ tặng hay đổi giá. Quà là hàng thật thì có `item_id` thật; quà không phải hàng (voucher, dịch vụ) không vào sổ kho | Màn combo không có nút *Tạo mặt hàng*; phiếu mua / bán hiện một dòng combo nhưng mở ra thấy từng dòng hàng | SC-COMBO-1 (tĩnh: mã combo không gọi `core.item.create`); `IN-COMBO-001`; T037-G1, G4, G5 |
| **R-COMBO-2** | **Phiên bản.** `combo_id` ổn định. Bản đã phát hành **không sửa**; đổi thành phần / điều kiện / giá / chính sách = bản mới có ngày hiệu lực. Dòng chứng từ giữ ảnh chụp `combo_id@version#hash` | Màn combo: dòng thời gian phiên bản; chứng từ cũ luôn mở ra đúng bản đã áp | trigger chặn `UPDATE` bản đã phát hành; `IN-COMBO-002`; T037-G18, G19 |
| **R-COMBO-3** | **Bảo toàn.** Nhập, lắp, tách, chuyển phân kho, đổi mục đích dùng đều **bảo toàn số lượng theo từng `item_id`, lô và đơn vị gốc**. Tách combo thông thường không sinh doanh thu, giá vốn, thuế. Biến đổi vật lý thật (sản xuất, đóng gói thành thực thể không tách được) là nghiệp vụ khác, có ADR riêng | Phiếu tách bộ hiện *"không đổi tồn — 4 lon trước, 4 lon sau"* | `CT-COMBO-001`; T037-G2, G7, G11 |
| **R-COMBO-4** | **Truy vết.** Mỗi dòng quà / dòng miễn phí nối được về dòng nhận gốc (`receiptLineRef`), dòng chứng từ gốc (`originalLineRef`), `combo_instance_id`, lô và phân bổ giá trị. **Không** truy bằng ký tự cuối của mã hàng, không truy chỉ bằng cờ `isGift` | Bấm một lon sữa đã bán: thấy phiếu nhận, nhà cung cấp, combo, lô, phân kho, giá vốn, bút toán | `CT-COMBO-002`, `IN-COMBO-004`; T037-G3, G10, G16 |
| **R-COMBO-5** | **Một sự thật kế toán.** Inventory Engine giữ số lượng · lô · giá trị (R-INV-1); **chỉ Accounting Kernel ghi sổ cái** qua cửa nạp; Policy Registry giữ chính sách; cổng kiểm chuẩn nhắc / giữ luồng sai. Mã combo **không** viết số tài khoản, không giữ sổ kho hay sổ khuyến mại riêng | Khuôn `bizcity_combo@1` không có trường Nợ / Có | SC-COMBO-2 (tĩnh: mã combo không import `ledger.service`, không ghi bảng Engine, không có cột `account*`); SC-INV-1 |
| **R-COMBO-6** | **Tách kế toán khỏi thuế.** Giá trị hàng nhận / bán, hình thức khuyến mại, hoá đơn và thuế là **bốn quyết định khác nhau**, mỗi cái theo quy định tại ngày chứng từ, có căn cứ và người quyết định. `isGift`, giá dòng bằng 0, loại phân kho **không** tự đưa một dòng vào hay ra khỏi giá vốn, hoá đơn, tờ khai | Phiếu hiện bốn ô riêng: *Vai trò dòng · Sở hữu · Cách tính giá trị · Cách tính thuế*, mỗi ô có căn cứ | `IN-COMBO-006`, `IN-COMBO-007`; SC-COMBO-3 (tĩnh: không có nhánh `if isGift → cost = 0 / vat = 0` ngoài đường dữ liệu cũ đã đánh dấu); T037-G6, G12, G13 |
| **R-COMBO-7** | **Hai mặt, kế thừa phải phát hành.** Một combo có **mặt mua** và / hoặc **mặt bán**; mỗi mặt có thành phần và chính sách riêng trong Policy Registry. Mặt bán *áp dụng theo* đầu vào là một **bản phát hành có chủ đích** (`quanHeDauVao = ap_dung_theo`), không phải hệ quả tự động của việc nhập hàng. Kế thừa **điều kiện thương mại** (thành phần, tỷ lệ, thời gian, hạn mức theo nguồn); **không kế thừa kết luận kế toán – thuế**: mặt bán tính lại theo quy định đầu ra tại ngày bán | Màn combo có hai thẻ *Mua* · *Bán*; thẻ Bán có lựa chọn *Áp dụng theo nhà cung cấp · Tự điều chỉnh · Công ty tự đặt* | `IN-COMBO-008`, `CT-COMBO-005`; T037-K1..K12 |
| **R-COMBO-8** | **Phân kho là một vị trí tồn.** `phankho_id` là **tuỳ chọn** và chỉ là *một* vị trí tồn (một dòng `warehouses`); không có chiều tồn thứ hai cộng song song. **Mặc định `phankho_id = 0` = phân kho chính của chi nhánh** (`is_default`, cấu hình mặc định loại `KHH`): nguồn gửi `0` hoặc bỏ trống thì Core phân giải ra phân kho chính và lưu định danh thật, không lưu số 0. Kế toán quản trị tự tạo thêm phân kho, tự cấu hình loại / được bán / sở hữu; không cài gì thì luồng vẫn chạy. Không tách phân kho thì vẫn phải lưu nguồn (`origin_ref`), vai trò tồn (`stock_role`) và quyền dùng qua phân bổ. Chuyển phân kho cùng pháp nhân giữ nguyên giá trị (R-INV-8), không là bán / tặng | Phiếu nhập: ô *Phân kho* để trống được; báo cáo tồn cộng một lần | `CT-COMBO-003`; T037-G7, G9 |
| **R-COMBO-9** | **Nguồn quà có tên.** Mỗi dòng quà mang **nguồn quà** thuộc danh sách đóng (bảng dưới). Ba câu *có định giá không · có ghi tồn của doanh nghiệp không · có lên thuế không* trả lời bằng **chính sách có phiên bản** theo nguồn quà, có căn cứ; không trả lời bằng cờ rải trong mã | Màn *Nguồn quà & cách xử lý*: mỗi nguồn ba công tắc, kèm căn cứ và ngày hiệu lực | `IN-COMBO-005`, `IN-COMBO-006`; T037-G8, G21 |
| **R-COMBO-10** | **Hết combo thì bán rời.** Combo **không giữ tồn riêng**. Hết hạn mức, hết nguồn quà, hết hiệu lực → máy bán tiếp tục bán từng mặt hàng theo giá thường, không cần chứng từ "phá combo" vì tồn vốn đã theo `item_id`. Hàng đang giữ chỗ cho combo được nhả kèm vết | Máy bán: gõ mã hàng thấy danh sách combo còn dùng được; combo hết thì mờ kèm lý do (R-BLOCK) | `IN-COMBO-009` (hint); T037-G25, G26 |

## Nguồn quà (danh sách đóng, tên tiếng Việt cho dev)

| Mã `giftSource` | Tên trên màn | Nghĩa | Tương ứng dữ liệu cũ | Mặc định định giá · ghi tồn · lên thuế |
|---|---|---|---|---|
| `qua_ncc_cho_nguoi_ban` | Hàng nhà cung cấp tặng kèm mua | Hàng nhận thêm khi mua (3 tặng 1, mua sữa tặng xe); doanh nghiệp sở hữu, được bán / tặng tuỳ ý | `lineType = gift_seller` (module mua hàng) | có · có · theo chứng từ |
| `qua_ncc_cho_ntd` | Quà nhà cung cấp cho người tiêu dùng | Nhà cung cấp giao để doanh nghiệp phát cho khách; doanh nghiệp sở hữu nhưng bị ràng mục đích | `lineType = gift_consumer`, `exclude_cost` (0023), `gift_qty` (0024) | không (giữ như đường cũ `exclude_cost`) · có · chờ (nhắc tới khi có căn cứ) |
| `qua_ncc_giu_ho` | Quà nhà cung cấp gửi giữ hộ | Không thuộc sở hữu doanh nghiệp; phát hộ / hoàn trả theo hợp đồng; nằm ở phân kho loại `KNB` | chưa có | không · không · không |
| `qua_cong_ty` | Quà công ty tự đặt | Doanh nghiệp tự làm chương trình bán; quà lấy từ hàng của mình | dòng `isGift` + `policyRef` ở phiếu bán | đã có giá vốn · đã ghi tồn · theo quy định đầu ra |
| `chua_ro` | Chưa rõ nguồn | Dữ liệu cũ không truy được dòng nhận | `gift_qty` không có dòng nguồn | giữ như sổ cũ; độ phủ truy vết `unknown` |

Mặc định là **điểm xuất phát**; đơn vị đổi bằng chính sách `core.combo.gift_treatment@1` (ba công tắc, có căn cứ, có ngày hiệu lực). Đổi công tắc không viết lại kỳ đã khoá (R-CONT-9).

## Mã kiểm (đặt trước, PHASE-037 thi hành)

Mức theo R-GATE-9: **mặc định cho phép, nhắc khi sai**; chỉ lỗi toàn vẹn / bất biến mới chặn ngay. Mỗi mã có `basis` (R-GATE-11); mã về thuế, khuyến mại ghi `NOI-BO` cho tới khi văn bản được rà và đưa vào [danh mục văn bản](../can-cu/01-danh-muc-van-ban.md).

| Mã | Lớp | Mức | Nghĩa |
|---|---|---|---|
| IN-COMBO-001 | L3 | block | gửi `comboId` vào chỗ của `itemId`, hoặc thành phần combo không phân giải được ra `item_id` |
| IN-COMBO-002 | L3 | block | `comboRef` (bản, băm) không có, sai băm, hoặc không hiệu lực tại `docDate` |
| IN-COMBO-003 | L4 | warn (`strict` → hold) | lượng / thành phần thực tế khác bản combo đã phát hành, không ghi lý do |
| IN-COMBO-004 | L4 | warn (`strict` → hold) | dòng quà vật chất không có dòng nguồn (`receiptSourceRef`) — dữ liệu cũ ghi độ phủ `unknown` |
| IN-COMBO-005 | L4 | warn | dòng quà không ghi nguồn quà; Core ghi `chua_ro` và nhắc |
| IN-COMBO-006 | L4 | hold | bán hàng thuộc nguồn `qua_ncc_giu_ho` (không sở hữu) khi chưa có chứng từ chuyển quyền |
| IN-COMBO-007 | L4 | warn (`strict` → hold) | thiếu căn cứ cho cách tính giá trị hoặc cách tính thuế của dòng quà tại ngày chứng từ; **không** tự gán giá vốn 0 hay giá tính thuế 0 |
| IN-COMBO-008 | L4 | warn (`strict` → hold) | bán theo mặt bán *áp dụng theo đầu vào* nhưng ngoài thời gian, vượt hạn mức theo nguồn, hoặc bản đầu vào đã bị thay |
| IN-COMBO-009 | L4 | hint | combo hết hạn mức / hết nguồn quà — dòng được bán rời theo giá thường |
| IN-COMBO-010 | L3 | block | phân kho không thuộc đơn vị / chi nhánh của chứng từ, hoặc đã ngừng dùng |
| IN-COMBO-011 | L3 | block | cùng `docKey` + `version` + `lineKey` phát sinh `combo_instance` thứ hai với nội dung khác (trùng nội dung → trả kết quả cũ) |
| CT-COMBO-001 | C | error | tách / lắp / chuyển phân kho làm đổi Σ lượng theo (`item_id`, lô) |
| CT-COMBO-002 | C | warn | dòng quà đã xuất không truy được về dòng nhận (đếm theo độ phủ `known · estimated · unknown`) |
| CT-COMBO-003 | C | error | Σ tồn theo phân kho ≠ tồn theo `item_id` (đếm đôi hoặc sót) |
| CT-COMBO-004 | C | error | Σ giá trị phân bổ cho các thành phần của một `combo_instance` đầu vào ≠ giá trị chứng từ mua (sau khi trừ phần không định giá theo chính sách) |
| CT-COMBO-005 | C | error | quà đã phát theo mặt bán *áp dụng theo* > quà đã nhận từ nguồn đầu vào tương ứng |
| CT-COMBO-006 | C | warn | combo còn dòng chưa có quyết định sở hữu / giá trị / thuế tại ngày khoá kỳ — thành điều kiện khoá sổ, giải trình khi khoá (R-CONT-6) |
| SC-COMBO-1 | tĩnh | block | mã combo không tạo mặt hàng |
| SC-COMBO-2 | tĩnh | block | mã combo không import `ledger.service`, không ghi bảng Engine, migration combo không có cột `account*` |
| SC-COMBO-3 | tĩnh | block (bánh cóc) | không thêm nhánh mới suy giá vốn / thuế từ `isGift`, `excludeFromCost`, `type_code` |

## Yêu cầu với anh em dev (đọc trước khi mở PR đụng mã hàng, combo, khuyến mại, kho quà)

1. **Không tạo mã hàng cho combo.** Cần "mã combo" để quét hay in → `combo_codes`. Mã nhóm 8 (combo) **chuyển hết sang combo** theo [PHASE-037 · 00 §10](../phases/PHASE-037-COMBO-IDENTITY-PHAN-KHO-KHUYEN-MAI/00-MASTER-PLAN.md): tồn tách sang thành phần bằng chứng từ, mã cũ ngừng dùng (không xoá), **không tạo mã nhóm 8 mới** (D037-14). `skuInfo` còn trả `combo` chỉ để nhận diện dữ liệu cũ, không để mở luồng mới.
2. **Cửa nạp luôn nhận dòng hàng thật.** Màn có thể gộp thành một dòng combo cho dễ nhìn; khuôn gửi đi phải có từng `itemId`, số lượng, phân kho, vai trò dòng, `comboInstanceId`.
3. **Không viết `if (isGift) cost = 0` hay `vat = 0`.** Hỏi chính sách (`gift_treatment`, quy định thuế tại ngày); không có căn cứ thì để cổng nhắc.
4. **Mua và bán là hai sự việc.** Nhập theo combo của nhà cung cấp không tự mở chương trình bán; muốn bán theo thì phát hành mặt bán.
5. **Phân kho không thay nguồn gốc.** Chuyển hàng từ kho khuyến mại sang kho hàng bán không biến quà thành hàng mua.
6. **Mọi lời nhắc đi từ thư viện mã** (`IN-COMBO-*`, `CT-COMBO-*`), không viết câu chữ riêng (R-GATE-10); màn cho kế toán dùng tên tiếng Việt ở bảng nguồn quà, không hiện mã tiếng Anh.
7. **Phân kho không bắt buộc.** Ô phân kho trống hoặc `0` = phân kho chính; không viết luồng nào đòi người dùng phải tạo phân kho mới chạy được.

## Liên quan

[ADR-0035](../adr/ADR-0035-combo-identity-phan-kho-nguon-qua.md) · [ADR-0017](../adr/ADR-0017-dinh-danh-hang-hoa-bat-bien.md) · [ADR-0031](../adr/ADR-0031-policy-registry-rule-contracts.md) · [ADR-0033](../adr/ADR-0033-inventory-engine-gia-von-kho.md) · [`bizcity_policy@1`](../contracts/BIZCITY-POLICY-v1.md) · [`bizcity_inventory@1`](../contracts/BIZCITY-INVENTORY-v1.md) · [`bizcity_item_master@1`](../contracts/BIZCITY-ITEM-MASTER-v1.md).
