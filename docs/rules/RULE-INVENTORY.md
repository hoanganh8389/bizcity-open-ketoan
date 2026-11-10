# RULE · Inventory Engine — kho, lô, lớp giá vốn (R-INV)
<!-- [2026-11-09 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — luật R-INV theo ADR-0033: Engine giữ số lượng · lô · giá trị, không ghi sổ cái; mã hàng ≠ mã tài khoản; quy tắc xuất lô tách khỏi tính giá; đảo chiều hoàn đúng phân bổ gốc; kết chuyển sau khi giá vốn kỳ chốt -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Cấp:** Tier 1 (R-INV-1…9) · **Trạng thái:** **chấp nhận 2026-11-09** ([ADR-0033](../adr/ADR-0033-inventory-engine-gia-von-kho.md); thi hành theo bước thắng nhỏ, có hiệu lực từng luật khi bước tương ứng có mã) · **Thi hành:** [PHASE-032](../phases/PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/README.md). Cột "Kiểm bằng" ghi phép kiểm **sẽ có**; chưa có mã nào hôm nay.
> Luật nền: [R-ITEM](RULE-ITEM.md) (R-ITEM-0, R-ITEM-10), [R-CONT](RULE-CONTINUITY.md), [R-LEDGER](RULE-LEDGER.md), [R-POST](RULE-POSTING.md).

## Nguyên tắc một câu

> **Inventory Engine biết hàng ở đâu, thuộc lô nào, đáng giá bao nhiêu và vì sao; Accounting Kernel là nơi duy nhất ghi sổ cái. Cái bất biến là `item_id` và chuỗi tham chiếu chứng từ — không phải một số hiệu tài khoản.**

## Bốn liên tục Engine phải bảo vệ

| Liên tục | Câu hỏi phải trả lời được | Khoá | Mã kiểm |
|---|---|---|---|
| **Identity** | Đây là hàng nào, dù đã đổi mã / tên / nhóm / biến thể? | `item_id` (R-ITEM-0) | `DG-ITEM-*`, `CT-MD-*` |
| **Inventory** | Hàng đang ở đâu, lô nào, nhập từ đâu, đã xuất cho giao dịch nào, còn bao nhiêu? | (`warehouse`, `item_id`, `lot_id`), `document_line_id` | `CT-INV-*` |
| **Cost** | Giá gốc bao nhiêu, phân bổ ra sao, điều chỉnh tác động thế nào? | `valuation_layer_id`, `cost_allocation_id`, `policy_version` | `CT-COST-*` |
| **Accounting** | Ánh xạ đúng tài khoản, ghi sổ, đối chiếu, kết chuyển, khoá kỳ — không đứt lịch sử? | `journal_entry_id`, (`chart_version`, `account_code`) | `CT-LIN-*`, `CT-REC-*`, `DG-CLOSE-*` |

## Luật

| Mã | Luật | Thể hiện khi làm việc | Kiểm bằng |
|---|---|---|---|
| **R-INV-1** | **Engine không ghi sổ cái; module không ghi Engine.** Bảng Engine (`item_lots`, `inventory_lot_moves` <!-- [2026-11-11 02:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-032 — D032-15: lô của Engine = item_lots + inventory_lot_moves (0098, Thuy2k, PHASE-026); bỏ kế hoạch inventory_lots (chủ dự án 2026-11-11) -->, `inventory_movements`, `valuation_layers`, `cost_allocations`, `costing_runs`) chỉ do `packages/kernel/src/modules/inventory/**` ghi, trong cùng giao dịch với chứng từ (R-LEDGER-11). Engine lập `CostingResult` và đưa vào `eventStore`; không import `ledgerService`, không `UPDATE` `ledger_*`. Module (module Kho ở `modules/<key>/` — đề xuất, chưa tách; POS, plugin) kể sự việc qua cửa nạp, đọc qua `bizcity_read.*` / `bizcity_inventory@1` | Phiếu bán hàng ở module không có ô "giá vốn"; màn Tính giá vốn hiện *"Kết quả đã kiểm → Kernel lập phiếu giá vốn"* | SC-INV-1 (tĩnh: import), SC-MOD-2, `db-rules.test.ts` (quyền ghi bảng) |
| **R-INV-2** | **Mã hàng ≠ mã tài khoản.** Bảng Engine không có cột tài khoản; tài khoản chỉ xuất hiện trên dòng sổ cái, tra tại ngày theo lý do → nhóm hạch toán → chế độ (R-POST-2, R-ITEM-4). Không dùng 156 / 632 / 511 (hay bất kỳ số hiệu nào) làm định danh, nhóm, tiền tố hay thuộc tính cố định của hàng; không đặt tên lô, nhóm, mã theo tài khoản | Thẻ mặt hàng: *"Hạch toán hôm nay: nhóm X → kho … / giá vốn … / doanh thu …, theo chế độ v… từ ngày …"*; đổi chế độ không sửa thẻ, chỉ thêm phiên bản | SC-INV-2 (migration mới của `inventory_*`, `valuation_*` không có cột `account*`); grep tài liệu `docs/**` cụm "hàng 156", "nhóm 632" (SC-DOC) |
| **R-INV-3** | **Lô là vật lý, lớp là giá trị.** `item_lots` ghi số lô, hạn, tên lúc mua (trạng thái: thêm ở W1); `inventory_lot_moves` ghi lô nằm ở chi nhánh · kho nào, bao nhiêu (D032-15); `valuation_layers` ghi phiếu nhập nào góp bao nhiêu tiền. Một lô có thể thuộc một lớp (FIFO / đích danh) hay một bể (bình quân). Theo dõi lô là thuộc tính phân loại của mặt hàng (`lot_tracking`), có phiên bản | Mặt hàng `required` mà dòng không có lô → `IN-INV-010`; mặt hàng `none` có lô → lưu, không kiểm | `IN-INV-010`, `CT-INV-001` (số dư lô âm), `CT-INV-002` (lô hết hạn còn `available`) |
| **R-INV-4** | **Đảo chiều hoàn đúng gốc.** Khách trả, trả nhà cung cấp, huỷ hàng đã bán, điều chỉnh của một dòng cũ mang `original_line_ref` và hoàn **đúng `cost_allocation` gốc** theo tỷ lệ số lượng, cùng `policy_version` — không lấy giá hiện tại, không lấy giá nhập gần nhất. Trả một phần: phần còn được trả = số lượng gốc − đã trả (không âm). Hàng trả không bán được → lô `quarantine` | Phiếu khách trả có ô *Đơn bán gốc* bắt buộc chọn (hoặc ghi lý do không có); hiện *"giá vốn hoàn: 5 × 100.000 theo phân bổ của BH-… (bể 10/2026)"* | `CT-COST-010` (đảo chiều không có gốc), `CT-COST-011` (hoàn vượt số lượng gốc), golden T032-G1 / G2 / G3 |
| **R-INV-5** | **Quy tắc xuất lô ≠ phương pháp tính giá.** FIFO / FEFO theo lô là chính sách vận hành (`core.inventory.lot_picking@1`, `suggest` mặc định); phương pháp tính giá là chính sách kế toán (`core.costing.method@1`, mặc định bình quân tháng, R-CONT-3). Đổi một cái không đổi cái kia. Chọn lô khác gợi ý được phép khi `suggest`, ghi lý do; `enforce` → giữ chờ duyệt | Màn xuất hàng: cột *Gợi ý lô* (FEFO / FIFO) + lý do khi chọn khác; màn chính sách hiện hai chính sách riêng | `IN-INV-011`, T032-G4 |
| **R-INV-6** | **Lớp và phân bổ chỉ thêm, có phiên bản** (R-CONT-2): tính lại = `costing_run` mới, phân bổ cũ `superseded_by`; không `UPDATE` số, không `DELETE`. Σ phân bổ hiện hành của một dòng xuất = giá vốn đã ghi sổ của dòng đó; Σ `qty` phân bổ của một lớp ≤ `qty_in` | Màn Tính giá vốn: *Lần tính* với trạng thái `draft · settled · superseded`, so sánh hai lần | trigger chỉ thêm; `CT-COST-002`, `CT-COST-003` |
| **R-INV-7** | **Cost Settlement trước Period Closing.** Kết chuyển, khoá kỳ đọc `costing_runs` của (nhóm tính giá, kỳ): chưa `settled` hoặc còn `CT-COST-*` chặn chưa chấp nhận → Sẵn sàng khoá kỳ **chặn có lý do**; người có `periods:lock` chấp nhận có ghi lý do (R-CONT-6). Tính lại sau kết chuyển → kết chuyển của kỳ đánh dấu lệch, không tự ghi lại | Nút *Kết chuyển* mờ, kèm *"Giá vốn 11/2026 chưa chốt — 12 dòng xuất chưa phân bổ"* và lối đi thẳng | `DG-CLOSE-1` (kết chuyển trước settle), `DG-CLOSE-2` (giá vốn đổi sau kết chuyển) |
| **R-INV-8** | **Chuyển kho giữ giá trị; giữa pháp nhân theo bản chất giao dịch.** Cùng đơn vị kế toán: phân bổ chuyển lớp, giá trị ghi sổ không đổi, hàng đang chuyển theo lý do. Khác pháp nhân: cặp chứng từ bán / mua nội bộ theo `core.intercompany.pricing@1`, công nợ nội bộ theo lý do; bên nhận có lớp `receipt` mới | Phiếu chuyển hiện *"cùng đơn vị kế toán — giữ giá trị"* hay *"khác pháp nhân — lập cặp chứng từ"* trước khi ghi | `CT-INV-003` (dư TK hàng đang chuyển ≠ Σ phiếu chuyển chưa nhận), `CT-INV-005` (phiếu đi đường quá N ngày), T032-G6 / G7 |
| **R-INV-9** | **Đổi mã, đổi phương pháp không viết lại lịch sử** (R-ITEM-0, R-CONT-9). Đổi SKU giữ `item_id`, lô, lớp, phân bổ, số dư, chứng từ. Đổi phương pháp tính giá = phiên bản chính sách + ngày hiệu lực + người duyệt + lý do; kỳ chuyển đổi tạo lớp `opening`; kỳ đã khoá không tính lại | Màn chính sách: dòng thời gian phiên bản; thẻ mặt hàng: lịch sử mã, tồn không đổi | T032-G8, T032-G9 (Golden, chặn phát hành) |

## Mã kiểm (đặt trước, PHASE-032 thi hành)

| Mã | Lớp | Mức | Nghĩa |
|---|---|---|---|
| IN-INV-010 | L3 | warn (`strict` → hold) | mặt hàng theo dõi lô bắt buộc mà dòng không ghi `lotNo` / `expDate` |
| IN-INV-011 | L4 | warn (`enforce` → hold) | lô xuất khác gợi ý của quy tắc xuất lô, không ghi lý do |
| IN-INV-012 | L3 | block | `lotNo` / `expDate` trên dòng xuất trỏ lô của `item_id` khác, hoặc lô `disposed` |
| IN-INV-013 | L4 | warn | xuất lô đã hết hạn tại `docDate` (cho phép khi lý do là huỷ / trả) |
| CT-INV-001 | C | error | số dư (kho, item, lô) âm tại một ngày |
| CT-INV-002 | C | warn | lô quá hạn còn `available` |
| CT-INV-003 | C | error | dư tài khoản hàng đang chuyển ≠ Σ giá trị phiếu chuyển đã xuất, chưa nhận tại ngày khoá (hàng đi đường qua ngày khoá là **hợp lệ**, không đòi về 0) <!-- [2026-11-09 11:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — sửa CT-INV-003 theo góc nhìn kế toán (60 §4) --> |
| CT-INV-005 | C | warn | phiếu chuyển đã xuất, chưa nhận quá N ngày (tham số `core.inventory.lot_picking@1` / chính sách kho, mặc định 7) |
| CT-INV-004 | C | error | Σ số dư lô ≠ số dư kho theo item (sổ lô ≠ sổ kho) |
| CT-COST-001 | C | error | dòng xuất trong kỳ không có phân bổ hiện hành |
| CT-COST-002 | C | error | Σ `qty` phân bổ của lớp > `qty_in` |
| CT-COST-003 | C | error | Σ phân bổ hiện hành của dòng xuất ≠ giá vốn trên sổ |
| CT-COST-004 | C | error | giá trị tồn theo lớp ≠ số dư tài khoản hàng tồn kho (nhóm tính giá × tài khoản) — R-CONT-5 |
| CT-COST-005 | C | warn | lớp còn lượng nhưng đơn giá 0 (chưa có giá) |
| CT-COST-010 | C | warn | nghiệp vụ đảo chiều không có `original_line_ref` (hoàn theo chính sách dự phòng) |
| CT-COST-011 | C | error | hoàn vượt số lượng / giá trị còn được hoàn của dòng gốc |
| CT-COST-012 | C | error | phân bổ của dòng xuất dùng `policy_version` khác bản hiệu lực tại `docDate` |
| DG-CLOSE-1 | L3 | error | kết chuyển kỳ chạy khi `costing_run` chưa `settled` |
| DG-CLOSE-2 | L3 | warn | giá vốn kỳ đổi sau khi đã kết chuyển |
| SC-INV-1 | tĩnh | block | `modules/inventory/**` không import `ledger.service`; ngoài `modules/inventory` không ghi bảng Engine |
| SC-INV-2 | tĩnh | block | migration bảng Engine không có cột `account*` |

## Liên quan

[ADR-0033](../adr/ADR-0033-inventory-engine-gia-von-kho.md) · [ADR-0021](../adr/ADR-0021-accounting-continuity-lien-tuc-ke-toan.md) D025-2 · [PHASE-025 · 10](../phases/PHASE-025-ACCOUNTING-CONTINUITY/10-MO-HINH-DU-LIEU.md) (mười một định danh) · [PHASE-030 · 51](../phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/51-BP-KHO.md) (blueprint module Kho) · `bizcity_inventory@1`.
