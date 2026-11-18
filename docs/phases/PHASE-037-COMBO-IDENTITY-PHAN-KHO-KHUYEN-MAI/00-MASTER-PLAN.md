# PHASE-037 · 00 — Kế hoạch: Combo Identity, phân kho, nguồn quà
<!-- [2026-11-17 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-037 — W0: hiện trạng đọc mã, sáu bất biến, sáu định danh, phân tích ba kiểu combo (một combo hai mặt), D037-1..16, đợt W0–W7, bước thắng nhỏ B1..B10, Q037-1..9 -->

> **Tình trạng: W0 CHỐT 2026-11-17 — chưa có mã, chưa có migration.** <!-- [2026-11-17 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-037 — chốt W0: sáu câu trả lời của chủ dự án; thêm B2 chuyển mã nhóm 8, B3 phân kho chính; §10 kế hoạch chuyển nhóm 8 --> Chủ dự án duyệt sáu điểm ([ADR-0035 · Chủ dự án duyệt](../../adr/ADR-0035-combo-identity-phan-kho-nguon-qua.md)). Tài liệu này là đầu bài cho dev, không phải xác nhận hệ thống đã làm được.

## 1. Hiện trạng (đọc mã `origin/main` `2b7fa083`, 2026-11-17)

| Chỗ | Đang có | Thiếu so với đề bài |
|---|---|---|
| Danh mục | Mã hàng **nhóm 8 = combo** ("từ 2 hàng bán trở lên thành bộ, có thể bán tách"; phá combo cần chứng từ) | Combo đang **là mặt hàng** — đúng điều đề bài muốn bỏ |
| Chính sách bán | `sale.promo.buy_x_get_y@1`, `sale.promo.combo@1` (theo `sku`), `sale_programs` + hạn mức theo chi nhánh | Không có `itemId` ở `combo@1`; không có lần thực hiện nối về kho |
| Chính sách mua | Bản chính sách mua vào sổ đăng ký với `purchase.<kind>@1` (`promo_gift`, `qty_tier`…) | **Chưa có khuôn luật** nào thực thi phía mua |
| Dòng quà đầu vào | `lineType = gift_seller \| gift_consumer` trong dữ liệu riêng của phiếu mua | Không nằm ở khuôn chứng từ chung; không có "giữ hộ" |
| Khuôn chứng từ | Dòng mua / bán có `itemId?`, `warehouseCode?`, `isGift`, `excludeFromCost?`, `policyRef?`, `lotNo?`; chứng từ có `policyRefs[]` | Không có tham chiếu combo, vai trò dòng, nguồn quà, dòng nguồn; dòng chuyển kho / điều chỉnh **không có `itemId`** |
| Phân kho | `warehouses.uid` (`kho_…`), `type_code`; `warehouse_types` 12 loại có `can_sell`, `owned`; `warehouse_type_ops` | Đủ để làm `phankho_id`; chưa có quyền dùng theo nguồn trong cùng một phân kho |
| Giá vốn quà | `exclude_cost` (0023), `gift_qty` (0024); dòng bán `is_gift` lấy **bể quà giá 0 trước** | Bể gộp theo mặt hàng: không biết quà xuất là của phiếu nào, chương trình nào |
| Lô | `item_lots`, `inventory_lot_moves` (0098) | — |
| Lớp giá vốn, phân bổ | chỉ có ở tài liệu PHASE-032 | Giá vốn theo nguồn phải chờ PHASE-032 B6 |
| Căn cứ | Danh mục văn bản có TT 99/2025, NĐ 123/2020, NĐ 70/2025, NĐ 181/2025 | **Chưa có** văn bản về khuyến mại (NĐ 81/2018 và sửa đổi) |

## 2. Sáu bất biến (R-COMBO-1..6, chủ dự án nêu 2026-11-17)

| Luật | Bắt buộc |
|---|---|
| **R-COMBO-1 Identity** | `combo_id` không phải `item_id`. Mọi thành phần vật chất có `item_id` hiện hữu. Không tạo mặt hàng vì lý do đóng gói thương mại, tỷ lệ tặng hay đổi giá. |
| **R-COMBO-2 Version** | `combo_id` ổn định; bản đã phát hành bất biến theo ngày / phạm vi hiệu lực; sửa thành phần / điều kiện / định giá → bản mới. Dòng chứng từ giữ ảnh chụp `combo_id@version`, băm. |
| **R-COMBO-3 Conservation** | Mọi bộ được nhập / lắp / tách bảo toàn số lượng theo từng `item_id`, lô và đơn vị gốc, trừ khi có nghiệp vụ biến đổi vật lý được chứng từ hoá riêng. Tách combo thông thường không tạo doanh thu, giá vốn, thuế. |
| **R-COMBO-4 Traceability** | Từng dòng tặng / miễn phí nối về `receiptLineRef`, `originalLineRef`, `combo_instance_id`, lô và phân bổ giá trị; không truy bằng ký tự cuối mã hàng hay chỉ bằng `isGift`. |
| **R-COMBO-5 One accounting truth** | Inventory Engine chịu trách nhiệm số lượng / lô / giá; Accounting Kernel duy nhất ghi sổ cái qua cửa nạp; Policy Registry xác định chính sách; cổng kiểm chuẩn nhắc / giữ luồng sai; không tự sinh số tài khoản trong mã combo. |
| **R-COMBO-6 Accounting–tax separation** | Hạch toán giá trị hàng nhận / bán, hình thức khuyến mại, hoá đơn và thuế là các quyết định khác nhau, theo quy định / ngày hiệu lực / căn cứ và người quyết định. `isGift`, loại phân kho không có quyền tự đưa dòng vào / ra tờ khai. |

Bốn luật rút thêm từ đề bài (R-COMBO-7..10: hai mặt và kế thừa phải phát hành · phân kho là một vị trí tồn · nguồn quà có tên · hết combo bán rời): [RULE-COMBO](../../rules/RULE-COMBO.md).

## 3. Sáu định danh không trộn

1. `item_id` — **cái gì**: ULID không đổi; mỗi quy cách vật lý thương mại khác nhau là một mặt hàng riêng (sữa 800 g và 1,6 kg là hai mặt hàng).
2. `combo_id` — **thoả thuận nào**: ULID của gói / quy tắc, không là mặt hàng.
3. `combo_version` — **bản nào**: thành phần, điều kiện, chính sách, hiệu lực chốt tại ngày.
4. `combo_instance_id` — **lần nào**: việc thực hiện combo trong đơn mua / nhận hàng / bán hàng.
5. `phankho_id` (nguồn ngoài gửi **mã phân kho**) — **ở đâu**: tuỳ chọn; giữ lô và nguồn sở hữu.
6. `lot_id` + `source_line_ref` + `allocation_id` — **lô nào, từ đâu, mang giá trị nào**: để trả hàng / đảo chiều đúng gốc.

**Không có `combo_item_id`.** Nhà cung cấp dán mã vạch trên lốc 4 lon → `combo_codes` (hoặc `external_combo_ref`), không ghi như mã hàng. Sản phẩm thật sự được sản xuất / đóng gói thành thực thể tồn kho không tách được → ADR lắp ráp riêng; không lách luật này.

## 4. Ranh giới sở hữu

| Hạng mục | Chủ | Được làm | Không được làm |
|---|---|---|---|
| Item Master | Core Master Data | Phân giải `item_id` tại ngày; quản lý biến thể, mã có phiên bản | Tạo `item_id` cho combo; đổi định danh vì khuyến mại |
| Sổ combo (định nghĩa, phiên bản, mã combo) | Kernel masterdata, phiên bản trên Policy Registry | Cấu hình, phát hành, kiểm điều kiện, gắn đối tác | Sửa bản đã phát hành; quyết định tài khoản |
| Mua hàng | module mua hàng | Đơn mua / phiếu nhận có dòng hàng thật, vai trò dòng, nguồn quà | Ghi thẳng bảng Engine / sổ cái |
| Bán hàng, POS | module bán hàng, `modules/pos` | Gợi ý combo, giải ra dòng hàng thật, giữ ảnh chụp bản | Chỉ gửi một dòng "mã combo"; tự sửa trị giá kế toán |
| Inventory Engine | Kernel | Lô, lượng, giá trị, nguồn nhập, phân bổ | Ghi `ledger_lines` |
| Accounting Kernel | Kernel | Lý do → luật định khoản → ghi / đảo bút toán | Đoán pháp lý từ loại phân kho |
| Thuế | quy định có phiên bản + người quyết định | Kiểm đầu vào / đầu ra, hoá đơn, tờ khai | Âm thầm loại doanh thu / quà khỏi thuế |

## 5. Combo cài mua + bán, chỉ mua, hay chỉ bán? — phân tích và phương án chọn

**Ba tình huống thật phải phục vụ:**

| Tình huống | Mua | Bán | Ví dụ |
|---|---|---|---|
| A · Nhà cung cấp đưa combo, công ty bán đúng combo đó | theo combo | theo combo, áp theo đầu vào | NCC 3 tặng 1 → cửa hàng cũng bán mua 3 tặng 1 |
| B · Nhà cung cấp đưa combo, công ty tách bán rời | theo combo | không | NCC 12 tặng 1 → nhập 13 lon, bán lẻ từng lon |
| C · Công ty tự đặt combo | không | theo combo | Tự làm "mua 4 lon tặng 1 bình nước" từ hàng sẵn có |
| D · Nhà cung cấp đưa combo, công ty bán theo combo **khác hình** | theo combo | theo combo, tự điều chỉnh | NCC 12 tặng 1 → công ty dùng lon tặng để bán mua 3 tặng 1 |

**Bốn phương án đã xét:**

| Phương án | Mô tả | Được | Mất |
|---|---|---|---|
| P1 | Một `combo_id`, một trường `direction` (`mua` / `ban` / `ca_hai`), một bộ thành phần | Đơn giản | Không tả được D (hai mặt khác thành phần); thuế – kế toán hai đầu dùng chung một ô → trái R-COMBO-6; kế thừa thành ngầm định |
| P2 | Hai combo riêng (mua, bán), nối bằng liên kết tài trợ | Tách bạch tuyệt đối | A phải chép thành phần hai lần, dễ lệch; truy vết qua bảng nối; người dùng thấy hai combo cho một chương trình |
| **P3 (chọn)** | **Một `combo_id`, hai mặt**: `matMua?`, `matBan?`; mỗi mặt có thành phần, chính sách, cách xử lý kế toán – thuế riêng; mặt bán khai **quan hệ với đầu vào** | Một định danh xuyên suốt cho truy vết; tả được A, B, C, D; kế toán – thuế tách theo mặt | Một bản combo chụp cả hai mặt: đổi một mặt là ra bản mới của cả combo (chấp nhận — lần thực hiện ghi rõ mặt nào) |
| P4 | Combo chỉ là chính sách trong Policy Registry, không có sổ combo | Không thêm bảng | Không có lần thực hiện, không nối mua – bán, không có mã combo để quét |

**Chọn P3 (D037-3).** Hình dạng:

```text
combo (combo_id, nguon = ncc | cong_ty)
└─ bản v (hash, hiệu lực, phạm vi chi nhánh / kênh / đối tác)
   ├─ matMua?  { thanhPhan[], policyRef (purchase.promo_gift@1), nguonQuaMacDinh,
   │             cachTinhGiaTri (ref), cachTinhThue (ref) }
   └─ matBan?  { thanhPhan[], policyRef (sale.promo.*@1), hanMuc?,
                 quanHeDauVao = ap_dung_theo | tu_dieu_chinh | doc_lap,
                 khiHetNguon = dung_tang | lay_hang_thuong,
                 cachTinhGiaTri (ref), cachTinhThue (ref) }
```

| Kiểu (suy ra, không nhập tay) | Mặt có | `quanHeDauVao` | Tình huống |
|---|---|---|---|
| `mua_ban` | mua + bán | `ap_dung_theo` hoặc `tu_dieu_chinh` | A, D |
| `chi_mua` | mua | — | B |
| `chi_ban` | bán | `doc_lap` | C |

**Vì sao vẫn truy được và vẫn linh hoạt:**

- **Phiên bản:** mọi lần thực hiện ghi `combo_id@version#hash` + mặt (`mua` / `ban`).
- **`item_id`, quà:** thành phần của từng mặt trỏ `item_id`; dòng quà mang vai trò dòng và nguồn quà.
- **Kho:** dòng thực hiện mang `phankho_id`, lô, dòng nguồn.
- **Có lên thuế hay không:** mỗi dòng thực hiện lưu **quyết định thuế** (`taxDecision`: có / không / chờ) kèm bản quy định và căn cứ — đọc ra được, không phải suy lại.
- **Linh hoạt:** B không cần mặt bán — nhập xong hàng là hàng thường theo `item_id`, bán rời ngay. C không cần mặt mua. A / D thêm mặt bán khi công ty quyết định. Thêm mặt bán sau = bản mới; phiếu nhập cũ giữ bản cũ.
- **Hết combo:** mặt bán có `hanMuc` và (nếu áp theo) hạn mức theo nguồn quà; hết → bán rời (R-COMBO-10).

## 6. Quyết định thiết kế (D037 — chờ duyệt)

Bảng đầy đủ D037-1..16 ở [ADR-0035](../../adr/ADR-0035-combo-identity-phan-kho-nguon-qua.md). Tóm tắt theo nhóm:

| Nhóm | Mã | Một câu |
|---|---|---|
| Định danh | D037-1, 2, 5, 6 | Combo không phải mặt hàng; `bizcity_combo@1` là hợp đồng liên kết; mỗi lần thực hiện có `combo_instance_id`; `item_id` của quà giữ nguyên |
| Cấu hình | D037-3, 4 | Một combo hai mặt; phiên bản đi trên Policy Registry |
| Kho | D037-7, 8, 11, 12 | `phankho_id` = `warehouses.uid`; phân kho tuỳ chọn; tách bộ không là nghiệp vụ kho; đổi mục đích dùng có người quyết định |
| Quà | D037-9, 10 | Năm nguồn quà; ba công tắc định giá · ghi tồn · lên thuế là chính sách có phiên bản |
| Bán | D037-13, 15 | Bán kèm tặng ≠ tặng độc lập; hết combo bán rời, máy bán gợi ý combo |
| Dữ liệu cũ | D037-14, 16 | Mã nhóm 8 chuyển hết sang combo ngay (§10); đường `exclude_cost` / `gift_qty` không bị viết lại |

## 7. Lộ trình theo đợt

| Đợt | Đầu ra | Xong khi |
|---|---|---|
| **W0 — Đặc tả** | Bộ tài liệu này, ADR-0035, R-COMBO, hợp đồng nháp; rà mã cũ (`exclude_cost`, `gift_qty`, `lineType`, mã nhóm 8, `sale.promo.combo@1`) | Chủ dự án duyệt D037; Q037 có người trả hoặc mặc định tạm |
| **W1 — Hợp đồng & sổ combo** | Khuôn `bizcity_combo@1` (zod, JSON Schema), sổ combo trên Policy Registry, `combo_codes`, phân giải mã combo → `item_id`; năm nguồn quà; màn *Combo* và *Nguồn quà & cách xử lý*; **chuyển hết mã nhóm 8** (§10); phân kho chính mặc định | Không thể dùng combo làm mặt hàng (test + ràng buộc CSDL) |
| **W2 — Đầu vào** | Đơn mua / phiếu nhận có lần thực hiện combo, vai trò dòng, nguồn quà, dòng nguồn; Rule Contract mặt mua; cổng nhắc | 3+1 / 4+1 / 12+1 / sữa tặng xe đi hết mua → kho → hạch toán |
| **W3 — Kho** | Phân kho theo nguồn, tách bộ, chuyển phân kho, đổi mục đích dùng; `itemId` trên phiếu chuyển / điều chỉnh; giá vốn theo nguồn (cùng PHASE-032) | Tách / chuyển không đổi Σ lượng, Σ giá trị |
| **W4 — Đầu ra (công ty tự đặt)** | Mặt bán `doc_lap`; máy bán gợi ý combo theo mã hàng, giải ra dòng hàng thật; hết combo bán rời; bán / tặng / trả | Một phiếu bán hiện dòng combo, sổ giữ dòng hàng thật |
| **W5 — Kế thừa đầu vào → đầu ra** *(đợt riêng)* | Mặt bán `ap_dung_theo` / `tu_dieu_chinh`; hạn mức theo nguồn quà; truy một mạch mua → bán | Bộ ca K1..K12 đạt ([25](25-KE-THUA-DAU-VAO-DAU-RA.md)) |
| **W6 — Đối soát & báo cáo** | Báo cáo nguồn quà, phân kho, phân bổ, chứng từ thuế; điều kiện khoá sổ; kiểm đa đơn vị và tải | 0 lệch lượng / giá trị giữa sổ chi tiết và sổ cái |
| **W7 — Tương thích** | Chuyển từ `exclude_cost` / `gift_qty`; chạy song song, so, bật theo đơn vị | Kỳ đã khoá không đổi; tắt được cho nghiệp vụ tương lai |

## 8. Bước thắng nhỏ (R-FLOW-9)

Mỗi bước một nhánh ngắn, một PR; sau khi gộp có một người dùng được một thứ. Bước nhỏ không nới lõi: chữ chốt (R-FLOW-2) và K3 giữ nguyên.

| Bước | Người dùng dùng được gì sau bước này | Việc (40) | Mức | Cần câu trả lời / mặc định tạm |
|---|---|---|---|---|
| **B1** | Dev đọc được luật và khuôn: R-COMBO và CANON §0.11, `bizcity_combo@1` nháp, 26 ca vàng + 12 ca kế thừa mô tả bằng số | S037-1, S037-2 | K0 | — |
| **B2** | Kế toán mở màn **Combo**: tạo combo (thành phần chọn từ danh mục, không có nút tạo mặt hàng), phát hành bản, xem dòng thời gian. **Không tạo được mã nhóm 8 mới**; danh sách mã nhóm 8 cũ hiện kèm nút *Chuyển sang combo* | S037-4, S037-5, S037-6, S037-32 (phần chặn + danh sách) | K2 | — |
| **B2b** | **Mã nhóm 8 đã chuyển hết**: mỗi mã thành một combo, tồn đã tách sang mặt hàng thành phần bằng chứng từ, mã cũ ngừng dùng ([§10](#10-chuyển-hết-mã-nhóm-8-sang-combo-d037-14)) | S037-32 | K3 | Thủy chốt bảng thành phần từng mã |
| **B3** | **Phân kho chính** có sẵn ở mọi chi nhánh (`phankho_id = 0`); kế toán quản trị tạo thêm và cấu hình phân kho. Màn **Nguồn quà & cách xử lý**: năm nguồn, ba công tắc, căn cứ, ngày hiệu lực. Phiếu mua hiện tên nguồn quà tiếng Việt thay cho `gift_seller` / `gift_consumer` (dữ liệu không đổi) | S037-35, S037-7, S037-8 | K1–K2 | Q037-2 mặc định tạm: giữ đúng cách tính hôm nay |
| **B4** | **Nhập theo combo**: phiếu nhận chọn combo, tự ra các dòng hàng thật có vai trò dòng; mở lại thấy bản combo đã áp | S037-9..12 | K3 | Q037-1 mặc định tạm: quà kèm mua thuộc sở hữu công ty |
| **B5** | **Hành trình mặt hàng** có thẻ *Nguồn combo*: lon này từ phiếu nhận nào, combo nào, được mua hay được tặng | S037-13, S037-24 (phần đọc) | K1 | — |
| **B6** | **Quà giữ hộ** nhập vào phân kho giữ hộ, không vào tồn của công ty; bán thử bị giữ lại kèm cách gỡ | S037-14, S037-15 | K2 | Q037-3 |
| **B7** | **Máy bán gợi ý combo**: gõ mã hàng thấy combo 3, 5, 12…; chọn là ra dòng hàng thật; hết combo thì bán rời | S037-18, S037-19, S037-20 | K2 | — |
| **B8** | **Giá vốn theo nguồn**: bấm dòng giá vốn của lon quà thấy phiếu nhận gốc; số tháng so khớp đường cũ trước khi đổi | S037-16, S037-17 | K3 | phụ thuộc PHASE-032 B6; Q037-6 |
| **B9** | **Bán theo chính sách nhà cung cấp**: phát hành mặt bán *áp dụng theo*; báo cáo *đã nhận bao nhiêu quà — đã phát bao nhiêu* | S037-21..23 | K3 | Q037-4, Q037-7 |
| **B10** | **Khoá sổ biết combo nào chưa chốt**; báo cáo nguồn quà; chuyển dữ liệu cũ theo đơn vị | S037-25..34 | K2–K3 | Q037-5 |

## 9. Câu hỏi phải có người trả (Q037)

| Mã | Câu hỏi | Ai trả | Mặc định tạm (dùng khi chưa trả) |
|---|---|---|---|
| Q037-1 | Trong hợp đồng nhà cung cấp, quà thuộc sở hữu công ty (bán / tặng tuỳ ý) hay phải phát cho người tiêu dùng? | Kế toán + người mua hàng, **khai trong chính sách mua** (màn có ô chọn nguồn quà); chính sách bán được *áp dụng theo* hoặc *tự điều chỉnh* | Hàng tặng kèm mua → `qua_ncc_cho_nguoi_ban`; không ghi gì → `chua_ro` và nhắc |
| Q037-2 | Giá trị hàng nhận thêm tính thế nào theo TT 99/2025 ở từng trường hợp (cùng mặt hàng / khác mặt hàng); nguồn giá trị hợp lý lấy ở đâu? | Kế toán trưởng | Giữ cách hôm nay: `gift_seller` chia đều theo lượng, `gift_consumer` không định giá; ca vàng G6 / G4 là vectơ kiểm phương pháp, không phải kết luận |
| Q037-3 | Quà giữ hộ: có đơn vị nào cần *định giá* hoặc *ghi tồn* hoặc *lên thuế*? | Thuy2k + kế toán trưởng | không · không · không; đổi bằng chính sách có phiên bản |
| Q037-4 | Khuyến mại đầu ra: công ty là bên tổ chức hay thực hiện thay nhà cung cấp? Ai lập hoá đơn, ai đăng ký / thông báo chương trình? | Kế toán trưởng | Công ty là bên bán và lập hoá đơn; mặt bán luôn tính thuế theo quy định đầu ra tại ngày |
| Q037-5 | Kỳ đã dùng `exclude_cost` / `gift_qty`: đọc bằng đường nào, chuyển từ ngày nào? | Kế toán trưởng + nhóm Lõi | Kỳ đã khoá giữ đường cũ; chuyển từ đầu kỳ mở kế tiếp sau khi so khớp |
| Q037-6 | Giá vốn theo nguồn: làm bản tối thiểu có vết nguồn trước, hay chờ lớp + phân bổ của PHASE-032? | Nhóm Lõi + Thuy2k | Làm vết nguồn trước (B5), con số giá vốn đổi khi PHASE-032 B6 xong (B8) |
| Q037-7 | Mặt bán *áp dụng theo* hết nguồn quà: dừng tặng hay lấy hàng thường (thành *quà công ty*)? | ✅ **Chủ dự án 2026-11-17** | **Mặc định `dung_tang`** + nhắc `IN-COMBO-009`; `lay_hang_thuong` là lựa chọn bật theo từng combo khi phát hành mặt bán |
| Q037-8 | Văn bản về khuyến mại (NĐ 81/2018 và các sửa đổi), giá tính thuế hàng khuyến mại: ai rà và đưa vào danh mục văn bản? | Kế toán trưởng (R-VNC) | Mã kiểm ghi căn cứ `NOI-BO`; không tự kết luận thuế |
| Q037-9 | Mã nhóm 8 đang có: ánh xạ sang `combo_codes` hay để nguyên là mặt hàng? | ✅ **Chủ dự án 2026-11-17** | **Chuyển hết sang combo ngay** (đang giai đoạn phát triển) — §10. Còn mở cho Thủy: bảng thành phần từng mã. Hàng có tem (`T`) không thuộc nhóm 8, chờ ADR lắp ráp |
| Q037-10 | Phân kho mặc định khi đơn vị không cài gì? | ✅ **Chủ dự án 2026-11-17** | **`phankho_id = 0` = phân kho chính** của chi nhánh, cấu hình mặc định; kế toán quản trị tự tạo thêm và cấu hình |

**Mặc định an toàn khi chưa có câu trả lời:** không tự gán giá vốn 0; không tự gán giá tính thuế 0; không tự xuất bán từ nguồn không sở hữu; chứng từ thiếu căn cứ vẫn vào sổ kèm lời nhắc (R-GATE-9), trừ sáu lỗi toàn vẹn chặn ngay ở [RULE-COMBO](../../rules/RULE-COMBO.md). Phần đã cho qua bị bắt lại lúc khoá sổ (`CT-COMBO-006`, chủ dự án 2026-11-17).

## 10. Chuyển hết mã nhóm 8 sang combo (D037-14)
<!-- [2026-11-17 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-037 — kế hoạch chuyển mã nhóm 8 (chủ dự án: chuyển luôn vì đang giai đoạn dev) -->

Chủ dự án 2026-11-17: *"Chuyển hết mã nhóm 8 cũ sang combo ngay vì phần mềm đang trong giai đoạn dev, chuyển luôn là ok."* Chuyển nhanh, nhưng **không** chuyển bằng cách sửa thẳng bảng: mọi thay đổi tồn đi chứng từ, mã cũ ngừng dùng chứ không xoá (ECP-13, R-LEDGER).

**Hiện trạng trong mã:** `modules/mua-hang/domain/src/ma-hang.ts` nhận diện nhóm 8 là `SkuKind = 'combo'` (*"nội bộ nhập theo mã combo; phá combo phải có chứng từ và được duyệt"*). Tài liệu nghiệp vụ nói *"kẹp quà / combo theo hoá đơn"* — hoá đơn nhà cung cấp có thể ghi một dòng mã combo.

| Bước | Việc | Ai | Kiểm |
|---|---|---|---|
| 1 | Liệt kê mọi mã nhóm 8 của từng đơn vị: tồn hiện tại, có chứng từ chưa, chứng từ ở kỳ nào (mở / khoá), có trong chương trình bán / chính sách mua không | nhóm Lõi (script chỉ đọc) | báo cáo trong `evidence/` |
| 2 | Chốt **bảng thành phần** từng mã: mã combo cũ → các `item_id` thật + lượng + vai trò dòng (mua / tặng). Thành phần chưa có trong danh mục thì tạo mặt hàng thật qua `core.item.*` (đó là hàng thật, không phải mã combo) | **Thuy2k** | mỗi mã có ít nhất một thành phần; không thành phần nào là mã nhóm 8 |
| 3 | Tạo combo + bản v1 cho mỗi mã; mã cũ thành `combo_codes` (để quét, để đọc hoá đơn cũ) | action `core.combo.publish` | không `item_id` mới nào sinh từ combo (RG-1) |
| 4 | Mã cũ còn tồn: **chứng từ tách bộ** qua cửa nạp ở kỳ mở — xuất mã cũ, nhập các thành phần, **giá trị chuyển nguyên** (chia theo bảng thành phần), không doanh thu, không giá vốn bán | nhóm Lõi + Thuy2k | Σ giá trị trước = sau; tồn mã cũ về 0; `doi-chieu-ke-toan.sql` đạt |
| 5 | Mã cũ **ngừng dùng**; chặn tạo mã nhóm 8 mới ở Gate A (mã kiểm danh mục mới, mức chặn) | nhóm Lõi | thử tạo mã nhóm 8 → bị chặn, có lý do + cách gỡ |
| 6 | Chương trình bán / chính sách mua đang trỏ mã nhóm 8 → bản mới trỏ combo hoặc thành phần | Kiên (bán hàng), Thủy (mua hàng) | không chính sách hiệu lực nào còn trỏ mã đã ngừng |
| 7 | Hoá đơn nhà cung cấp ghi dòng mã combo: **giữ nguyên dòng hoá đơn** làm chứng từ thuế; phiếu nhận ghi các dòng thành phần, nối bằng `combo_instance_id`; đối chiếu hoá đơn ↔ kho theo lần thực hiện | Thuy2k (mua hàng, hoá đơn XML) | bảng kê mua vào khớp hoá đơn; kho theo thành phần |
| 8 | Tài liệu: `docs/nghiep-vu/11`, `docs/core/03`, `docs/huong-dan/mua-hang-dat-hang.md`, `docs/api/14-mua-hang.md` bỏ "combo là mã hàng nhóm 8", trỏ R-COMBO | người đang giữ tệp | SC-DOC-4 xanh |

**Không làm:** không `UPDATE` / `DELETE` dòng sổ hay dòng kho cũ; không đổi `item_id` của mã cũ thành của thành phần; không chạy lại kỳ đã khoá. Kỳ đã khoá vẫn đọc ra mã nhóm 8 như lúc ghi.

**Lưu ý cho người đóng góp** (issue nhắc Thủy, Hoàng, Kiên):

- **Thủy** (danh mục, mua hàng, kho, giá vốn): bảng thành phần từng mã; phiếu nhận theo combo; hoá đơn XML có dòng combo (dòng MH22 đang giữ chỗ — phối hợp, không sửa chồng); `docs/nghiep-vu/11`, `12`, `14` nằm trong phạm vi giữ chỗ của Thủy, Thủy tự sửa; màn *Nguồn quà & cách xử lý*.
- **Hoàng** (Policy Registry, bàn giao PHASE-031): Rule Contract `core.combo.definition@1`, `core.combo.gift_treatment@1`, `purchase.promo_gift@1`; `sale.promo.combo@1` thêm `itemId`.
- **Kiên** (bán hàng, POS, phân quyền màn): máy bán và phiếu bán BH10 gợi ý combo, giải dòng, hết combo bán rời; quyền màn *Combo*, *Nguồn quà & cách xử lý*, *Phân kho*. Dòng NT-HT-003 đang giữ nhiều tệp bán hàng — làm sau khi trả chỗ.
- Mọi người: **không tạo mã hàng cho combo**, không viết `if (isGift) cost = 0`, phân kho trống = phân kho chính (CANON §0.11, R-COMBO).
