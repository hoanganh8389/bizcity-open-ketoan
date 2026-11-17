# ADR-0035 · Combo Identity — combo là thoả thuận thương mại có phiên bản, không phải mặt hàng; phân kho là vị trí tồn; nguồn quà có tên; kế toán tách khỏi thuế
<!-- [2026-11-17 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-037 — ADR-0035 đề xuất: combo_id ≠ item_id; combo có phiên bản trên Policy Registry; một combo hai mặt mua / bán, kế thừa phải phát hành; phankho_id = warehouses.uid; năm nguồn quà; ba công tắc định giá · ghi tồn · lên thuế là chính sách có phiên bản -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

- Trạng thái: <!-- [2026-11-17 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-037 — chủ dự án duyệt sáu điểm: một combo hai mặt; chuyển hết mã nhóm 8 ngay; nhắc mặc định, bắt lại lúc khoá sổ; phân kho = kho đang có, mặc định phankho_id = 0; ba công tắc vào CANON §0.11; hết nguồn quà dừng tặng mặc định, bật lấy hàng thường theo từng combo --> **Chấp nhận** 2026-11-17 (chủ dự án duyệt sáu điểm — mục *Chủ dự án duyệt* cuối tệp; D037-7, D037-10, D037-14, D037-15 sửa theo câu trả lời). Q037 còn lại giao người trả, có **mặc định tạm**. Phần K3 (migration, khuôn chứng từ, cách tính giá vốn quà) vẫn qua chữ chốt từng bước (R-FLOW-2).
- Nguồn: chủ dự án 2026-11-17 — *"Cùng một lon sữa PediaSure không biến thành mặt hàng khác chỉ vì được nhập miễn phí, nằm trong combo, được tách ra hay bán lẻ. Ngay cả khi nhận quà là xe chòi chân, xe vẫn phải có item_id riêng vì đó là một hàng hoá thực tế khác."* · *"Giá bán bằng 0 không đồng nghĩa giá vốn bằng 0, và một dòng 'tặng' trên hoá đơn không tự quyết định cách hạch toán."* · *"Trace được mua theo chính sách, bán theo chính sách. Truy đường luồng combo từ đầu vào đến đầu ra. Hoặc công ty chủ động setup được combo và bán theo combo, nhưng khi hết combo, tự tách ra bán tiếp."*
- Ngày: 2026-11-17 · Người quyết: Johnny Chu – Chu Hoàng Anh · Mức Kernel: ADR này **K0** (nguyên tắc + ranh giới). Thi hành có phần **K3** (migration sổ combo, mở rộng khuôn chứng từ, đổi cách xử lý quà trong tính giá vốn) — chữ chốt riêng từng bước (R-FLOW-2).
- Luật / hợp đồng liên quan: [R-COMBO](../rules/RULE-COMBO.md) (mới), [R-ITEM](../rules/RULE-ITEM.md), [R-INV](../rules/RULE-INVENTORY.md), [R-CONT](../rules/RULE-CONTINUITY.md), [R-GATE](../rules/RULE-GATE.md), [`bizcity_combo@1`](../contracts/BIZCITY-COMBO-v1.md) (mới, nháp), [`bizcity_item_master@1`](../contracts/BIZCITY-ITEM-MASTER-v1.md), [`bizcity_policy@1`](../contracts/BIZCITY-POLICY-v1.md), [`bizcity_inventory@1`](../contracts/BIZCITY-INVENTORY-v1.md), [`bizcity_ledger_intake@1`](../contracts/BIZCITY-LEDGER-INTAKE-v1.md).
- Nền: [ADR-0017](ADR-0017-dinh-danh-hang-hoa-bat-bien.md), [ADR-0018](ADR-0018-danh-muc-co-phien-ban-toan-framework.md), [ADR-0020](ADR-0020-ton-chi-core-nguoi-dung-quyet-dinh-mot-ngon-ngu-ma.md), [ADR-0022](ADR-0022-quan-tri-du-lieu-goc-nen-mong.md), [ADR-0031](ADR-0031-policy-registry-rule-contracts.md), [ADR-0033](ADR-0033-inventory-engine-gia-von-kho.md).

## Bối cảnh

Đọc mã `origin/main` `2b7fa083` (2026-11-17):

- **Chữ "combo" đang có hai nghĩa, không nghĩa nào có định danh.** (a) Nhóm mã hàng 8 — *"từ 2 hàng bán trở lên thành bộ, có thể bán tách"*, "phá combo phải có chứng từ" ([nghiep-vu/11](../nghiep-vu/11-hang-hoa-gia-von-tu-goc.md)): combo **là một mã hàng**. (b) Rule Contract `sale.promo.combo@1` (`apps/api/src/modules/system/rule-contracts/sale-promo.ts`): một luật giá theo `sku`, không có `itemId`, không có vết kho.
- **Quà đầu vào phân loại ở module mua hàng**, không ở khuôn chung: `lineType = gift_seller | gift_consumer | buy` nằm trong dữ liệu riêng của phiếu mua; khuôn chứng từ chung (`packages/contracts/src/documents.ts`) chỉ có `isGift`, `excludeFromCost`, `policyRef`.
- **Giá vốn của quà là một cờ và một bể.** `inventory_movements.exclude_cost` (0023), `inventory_costs.gift_qty` (0024); `costing.service.ts` cho dòng bán `is_gift` *lấy từ bể quà giá 0 trước*, hết mới lấy hàng thường. Bể gộp theo (đơn vị hạch toán, mặt hàng): hai nhà cung cấp, hai chương trình cùng một mặt hàng thì **không biết lon quà vừa xuất là của phiếu nào**.
- **Phân kho đã có và đã có định danh.** "Phân kho" trong mã là *một kho của chi nhánh* (`warehouses`, `apps/api/test/phan-kho.test.ts`), có `uid` dạng `kho_<ULID>` (0121) và `type_code` (0128: `KHH` hàng bán, `KKM` khuyến mại, `KNB` nhận giữ hộ, `KCL` cách ly, `KCC` chờ chứng từ… với `can_sell`, `owned`). **Không có kho cha – con.**
- **Chính sách mua chưa có Rule Contract.** Module mua hàng đăng ký bản chính sách vào sổ với `ruleContract: purchase.<kind>@1` (`promo_gift`, `qty_tier`…) nhưng chưa có khuôn luật nào thực thi; `BIZCITY-POLICY-v1 §8` ghi rõ *"chưa có bọc cho chính sách mua hàng"*.
- **Lớp giá vốn và phân bổ chưa có bảng** (`valuation_layers`, `cost_allocations` mới ở tài liệu PHASE-032). Lô có (`item_lots`, `inventory_lot_moves`, 0098).
- **Phiếu chuyển kho / điều chỉnh** (`stockLineSchema`) chưa có `itemId`.

Hệ quả nếu để nguyên: mỗi chương trình 3+1, 4+1, 12+1 sinh một mã hàng nhóm 8; nhập một mã, xuất mã khác; lô, hoá đơn đầu vào, giá vốn, kê khai, hàng trả không truy xuyên suốt được.

## Phản biện (trước khi chốt)

1. **Combo có cần là thực thể riêng không, hay chỉ cần chính sách khuyến mại?** Cần. Chính sách nói *luật*; combo còn phải nói *lần thực hiện* (`combo_instance_id`) ở cả mua và bán, và nối hai đầu. Policy Registry giữ phiên bản và băm; sổ combo giữ thành phần có `item_id` và các lần thực hiện. Không dựng bộ phiên bản thứ hai (LEAN-3).
2. **Một `combo_id` cho cả mua và bán, hay hai combo nối nhau?** Một `combo_id`, **hai mặt** (xem D037-3). Hai combo nối bằng liên kết thì truy "mua theo chính sách → bán theo chính sách" phải qua một bảng nối và dễ đứt; một trường `direction` thì không tả được ca hai mặt khác thành phần. Hai mặt cho phép: chỉ mua (nhập rồi tách bán rời), chỉ bán (công ty tự đặt), cả hai.
3. **Kế thừa đầu vào → đầu ra có trái "tách kế toán khỏi thuế" không?** Không, nếu kế thừa **điều kiện thương mại** và **không kế thừa kết luận kế toán – thuế**, và nếu kế thừa là một bản phát hành có chủ đích (R-COMBO-7). Nhà cung cấp tặng doanh nghiệp và doanh nghiệp tặng khách là hai sự việc.
4. **`phankho_id` có phải kho con mới?** Không. Chính là `warehouses.uid` đang có. Thêm bảng "phân kho" hay cột kho cha sẽ tạo chiều tồn thứ hai (đếm đôi). Nhu cầu "kho vật lý lớn chứa nhiều phân kho" hôm nay đã được chi nhánh + nhiều kho đáp ứng.
5. **Giữ hộ có định giá / ghi tồn / lên thuế không là cấu hình của kho hay của chính sách?** Của chính sách có phiên bản, phạm vi theo nguồn quà (và loại phân kho nếu cần). Đặt cờ trên kho thì đổi cờ là đổi lịch sử, và không trả lời được "vì sao dòng này không lên tờ khai".
6. **Có chặn mặc định không?** Không (ADR-0020, R-GATE-9). Chỉ chặn lỗi toàn vẹn: combo đứng chỗ mặt hàng, sai băm, lệch lượng, trùng lần thực hiện, sai đơn vị, bán hàng không sở hữu. Còn lại nhắc kèm cách sửa; đơn vị tự bật mức chặt.
7. **Mã nhóm 8 đang dùng thì sao?** Phần mềm đang trong giai đoạn phát triển, nên **chuyển hết ngay** (chủ dự án 2026-11-17) thay vì chạy hai kiểu song song. "Chuyển" vẫn theo ECP-13: mã cũ **ngừng dùng**, không xoá; tồn đang nằm trên mã cũ được tách sang mặt hàng thành phần bằng **chứng từ** qua cửa nạp, không sửa thẳng bảng; sổ đã ghi không viết lại. Hàng có tem (`T`) không thuộc nhóm 8 và vẫn là bài toán lắp ráp — ADR riêng.

## Quyết định

| Mã | Quyết định |
|---|---|
| **D037-1** | **Combo không phải mặt hàng.** Sáu định danh tách bạch: `item_id` · `combo_id` · `combo_version` · `combo_instance_id` · `phankho_id` · (`lot_id` + `source_line_ref` + `allocation_id`). Không có `combo_item_id` (R-COMBO-1). |
| **D037-2** | **`bizcity_combo@1` là hợp đồng liên kết** giữa Item Master, Policy Registry, Inventory Engine và cửa nạp. Nó không giữ sổ kho, không giữ sổ cái, không có trường tài khoản (R-COMBO-5). |
| **D037-3** | **Một combo, hai mặt.** Mỗi bản combo khai `matMua` và / hoặc `matBan`; mỗi mặt có thành phần (`item_id`, lượng, vai trò dòng), chính sách (`policyRef`) và cách xử lý kế toán – thuế riêng. **Kiểu combo suy ra** từ mặt có mặt: `mua_ban` · `chi_mua` · `chi_ban`. Nguồn combo: `ncc` (nhà cung cấp đưa) hoặc `cong_ty` (công ty tự đặt). Lý do chọn và phương án loại: [PHASE-037 · 00 §5](../phases/PHASE-037-COMBO-IDENTITY-PHAN-KHO-KHUYEN-MAI/00-MASTER-PLAN.md). |
| **D037-4** | **Phiên bản combo đi trên Policy Registry** (Rule Contract `core.combo.definition@1`): băm, hiệu lực, phát hành, sự kiện dùng lại của sổ đăng ký. Sổ combo chỉ thêm phần typed (thành phần, mã combo) và các lần thực hiện. Mặt mua dùng Rule Contract mua (`purchase.promo_gift@1` — phải viết khuôn luật thật); mặt bán dùng `sale.promo.buy_x_get_y@1` / `sale.promo.combo@1` đã có, bổ sung `itemId`. |
| **D037-5** | **Mỗi lần thực hiện có `combo_instance_id`**; dòng chứng từ (đơn mua, phiếu nhận, phiếu bán, phiếu tặng, phiếu trả) giữ `comboInstanceId`, `comboLineRef`, `comboRef {comboId, version, hash}`. Gửi lại cùng khoá → cùng kết quả, không nhân đôi. |
| **D037-6** | **`item_id` của quà giữ nguyên.** Cùng mặt hàng vừa mua vừa được tặng = hai dòng nguồn khác **vai trò dòng** (`mua` · `tang`), cùng định danh. Hàng tặng tách ra bán được như mọi hàng khác, theo quyền dùng của nguồn. |
| **D037-7** | **`phankho_id` = `warehouses.uid`** (đã có); loại phân kho = `type_code` (đã có). Nguồn ngoài gửi **mã phân kho** (`warehouseCode`, tức "client phankho_id"), Core phân giải ra định danh rồi lưu định danh (R-MD). Không thêm bảng phân kho, không thêm kho cha – con (cần thì mở việc riêng), không có chiều tồn thứ hai (R-COMBO-8). **Mặc định `phankho_id = 0` = phân kho chính** (chủ dự án 2026-11-17): ở biên API, `0` hoặc bỏ trống nghĩa là *phân kho mặc định của chi nhánh* (`warehouses.is_default`, đã có); Core phân giải ra `uid` thật và lưu `uid`, **không lưu số 0** làm khoá. Mỗi chi nhánh luôn có một phân kho chính với cấu hình mặc định (loại `KHH`), nên đơn vị không cài gì luồng vẫn chạy. Kế toán quản trị **tự tạo thêm phân kho và cấu hình** (loại, được bán, sở hữu, theo dõi hạn) khi cần. |
| **D037-8** | **Không bắt buộc dùng phân kho khuyến mại.** Không tách thì vẫn lưu `origin_ref`, `stock_role`, quyền dùng qua phân bổ nguồn. Phân kho để dễ quản trị, không phải điều kiện đúng sổ. |
| **D037-9** | **Năm nguồn quà, tên tiếng Việt** (`qua_ncc_cho_nguoi_ban` · `qua_ncc_cho_ntd` · `qua_ncc_giu_ho` · `qua_cong_ty` · `chua_ro`), là thuộc tính của **dòng nhận / phân bổ**, không phải nhóm vĩnh viễn của mặt hàng (R-COMBO-9). |
| **D037-10** | **Ba công tắc là chính sách có phiên bản.** `core.combo.gift_treatment@1`: với mỗi nguồn quà (tuỳ chọn thu hẹp theo loại phân kho, nhà cung cấp, combo) trả lời *định giá · ghi tồn của doanh nghiệp · lên thuế*, kèm căn cứ và ngày hiệu lực. Mặc định an toàn ở R-COMBO-9. Người phụ trách danh mục – mua hàng – kho (Thuy2k) dựng màn cấu hình. **Đưa vào [CANON §0.11](../00-CANON.md)** (chủ dự án 2026-11-17: *"vì nó quan trọng, để anh em dev tuân thủ"*); chi tiết khuôn luật, thứ tự ưu tiên, mặc định ở [PHASE-037 · 20 §2a](../phases/PHASE-037-COMBO-IDENTITY-PHAN-KHO-KHUYEN-MAI/20-NGHIEP-VU-KE-TOAN-THUE.md). |
| **D037-11** | **Tách bộ (`unbundle`) không là nghiệp vụ kho.** Chỉ nhả quan hệ giữ bộ / giữ chỗ; không movement, không doanh thu, không giá vốn. Chuyển phân kho nếu có đi chứng từ chuyển kho sẵn có, giữ giá trị (R-INV-8). |
| **D037-12** | **Đổi mục đích dùng** (quà bị ràng → hàng bán) là một hành động có người quyết định, có căn cứ, có vết; **không** tự xảy ra chỉ vì hàng được chuyển từ phân kho khuyến mại sang phân kho hàng bán. |
| **D037-13** | **Bán kèm tặng và tặng độc lập là hai cách xử lý khác nhau**; thuế và hoá đơn theo quy định hiệu lực tại ngày chứng từ, không suy từ `isGift`. |
| **D037-14** | **Chuyển hết mã nhóm 8 sang combo ngay** (chủ dự án 2026-11-17 — đang giai đoạn phát triển). Mỗi mã nhóm 8: tạo combo (thành phần là mặt hàng thật), mã cũ thành `combo_codes`; tồn trên mã cũ tách sang thành phần bằng **chứng từ tách bộ** qua cửa nạp (giá trị chuyển nguyên sang thành phần, không doanh thu, không giá vốn); mã cũ **ngừng dùng** (ECP-13), không xoá; kỳ đã khoá không đổi. Từ đó **không tạo mã nhóm 8 mới** (Gate A chặn). Dòng hoá đơn NCC ghi mã combo giữ nguyên làm chứng từ thuế; sổ kho đi theo thành phần, nối hai bên bằng `combo_instance_id`. Các bước, người làm, lưu ý: [PHASE-037 · 00 §10](../phases/PHASE-037-COMBO-IDENTITY-PHAN-KHO-KHUYEN-MAI/00-MASTER-PLAN.md). |
| **D037-15** | **Hết combo thì bán rời** (R-COMBO-10). Máy bán có lệnh gợi ý combo theo mặt hàng (`core.combo.suggest`). **Hết nguồn quà đã nhận** (mặt bán *áp dụng theo*): mặc định **dừng tặng, bán rời** (`dung_tang`); bật **lấy hàng thường làm quà** (`lay_hang_thuong`, thành *quà công ty tự đặt*) **theo từng combo** khi phát hành mặt bán (chủ dự án 2026-11-17). |
| **D037-16** | **Đường cũ không bị viết lại.** `exclude_cost`, `gift_qty`, "lấy quà giá 0 trước" tiếp tục đọc được cho kỳ đã có; chuyển sang nguồn / phân bổ từ một ngày hiệu lực, chạy song song để so trước khi đổi; kỳ đã khoá không tính lại; dòng không truy được ghi độ phủ `unknown`, không bịa nguồn. |

## Hệ quả

**Được:** danh mục không phình theo chương trình; một lon sữa có một lịch sử xuyên suốt từ nhà cung cấp tới khách; trả hàng / đảo chiều về đúng dòng gốc; trả lời được *"dòng này vì sao (không) có giá vốn, (không) lên thuế"* bằng một bản chính sách; công ty tự đặt combo mà không đụng danh mục; hết combo không phải làm chứng từ phá bộ.

**Mất / phải làm:** thêm sổ combo và các lần thực hiện; mở rộng khuôn chứng từ (trường tuỳ chọn, tương thích ngược); viết Rule Contract cho mặt mua; thêm `itemId` vào phiếu chuyển kho / điều chỉnh; phần giá vốn theo nguồn **phụ thuộc PHASE-032** (lớp + phân bổ); một đợt riêng cho kế thừa đầu vào → đầu ra với bộ ca kiểm kỹ; chuyển dữ liệu cũ có kiểm song song.

**Việc:** [PHASE-037 · 40](../phases/PHASE-037-COMBO-IDENTITY-PHAN-KHO-KHUYEN-MAI/40-MASTER-CHECKLIST.md) S037-1..34.

## Phương án đã cân nhắc

| Phương án | Vì sao không chọn |
|---|---|
| Mỗi combo một mã hàng (như nhóm 8 hôm nay) + bảng định mức | Danh mục phình; nhập một mã xuất mã khác; lô, hoá đơn, giá vốn đứt; "phá combo" thành chứng từ thường xuyên |
| Chỉ dùng chính sách khuyến mại (`policyRef`) không có `combo_instance` | Không nối được lần mua với lần bán; nhiều chương trình cùng mặt hàng lẫn nguồn quà |
| Hai combo riêng (mua, bán) nối bằng liên kết tài trợ | Truy vết qua bảng nối; ca "áp dụng theo" phải chép thành phần hai lần và có thể lệch |
| Một `combo_id` với một trường `direction` | Không tả được hai mặt có thành phần / chính sách khác nhau; kế thừa thành ngầm định |
| Bảng `phan_kho` mới hoặc kho cha – con | Hai chiều tồn, đếm đôi; đã có `warehouses.uid` + `type_code` |
| Cờ trên kho: không định giá / không lên thuế | Đổi cờ là đổi lịch sử; không có căn cứ, không có phiên bản; trái R-COMBO-6 |

## Câu hỏi mở

Danh sách Q037-1..9 kèm mặc định tạm và câu đã trả: [PHASE-037 · 00 §9](../phases/PHASE-037-COMBO-IDENTITY-PHAN-KHO-KHUYEN-MAI/00-MASTER-PLAN.md).

## Chủ dự án duyệt (2026-11-17)
<!-- [2026-11-17 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-037 — ghi lại sáu câu trả lời của chủ dự án -->

| # | Câu hỏi | Chủ dự án chọn | Ghi vào |
|---|---|---|---|
| 1 | Combo cài mua + bán, chỉ mua, hay chỉ bán | **Một combo, hai mặt** (mặt mua, mặt bán; mỗi mặt có thành phần, chính sách, cách tính thuế riêng) | D037-3 |
| 2 | Mã nhóm 8 | **Chuyển hết sang combo ngay** — đang giai đoạn phát triển; Thủy, Hoàng, Kiên lưu ý theo issue chủ dự án nhắc | D037-14, Q037-9 |
| 3 | Mức chặn | **Nhắc mặc định, chỉ chặn lỗi toàn vẹn; phần đã cho qua bị bắt lại lúc khoá sổ** | R-COMBO mã kiểm, `CT-COMBO-006` |
| 4 | Phân kho | **Kho đang có; không bắt buộc tách; kho cha – con là việc riêng sau này. Mặc định `phankho_id = 0` là phân kho chính**; kế toán quản trị tự tạo thêm và cấu hình; không cài gì thì cấu hình mặc định vẫn chạy | D037-7, D037-8 |
| 5 | Quà: định giá · ghi tồn · lên thuế | **Chính sách có phiên bản theo nguồn quà, ba công tắc, mỗi công tắc có căn cứ và ngày hiệu lực; thêm Rule Contract và màn cấu hình; đưa vào CANON** | D037-10, CANON §0.11 |
| 6 | Hết quà đã nhận khi bán theo NCC | **Mặc định dừng tặng; lấy hàng thường làm quà là lựa chọn bật theo từng combo** | D037-15 |
