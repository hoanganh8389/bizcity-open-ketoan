# PHASE-037 — Combo Identity: combo không phải mặt hàng; phân kho, nguồn quà và đường truy từ nhà cung cấp tới khách
<!-- [2026-11-17 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-037 — W0: đề bài chủ dự án 2026-11-17 (combo_id ≠ item_id; phankho_id; sáu bất biến R-COMBO; mua theo chính sách, bán theo chính sách; công ty tự đặt combo, hết combo bán rời); ADR-0035 đề xuất -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Việc lộ trình:** — (nối tiếp chuẩn định danh PHASE-024 / 026; mở rộng PHASE-031 Policy Registry và PHASE-032 Inventory Engine)
> **Phân hệ:** danh-muc · mua-hang · kho · ban-hang
> **Checklist công bố:** —
> **Trạng thái:** 🟡 **W0 chốt 2026-11-17** <!-- [2026-11-17 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-037 — chốt W0 — sáu câu trả lời của chủ dự án --> — chủ dự án duyệt sáu điểm (một combo hai mặt; chuyển hết mã nhóm 8 ngay; nhắc mặc định, bắt lại lúc khoá sổ; phân kho chính `phankho_id = 0`; ba công tắc vào CANON §0.11; hết quà dừng tặng mặc định). ADR-0035 chấp nhận. **Chưa có mã, chưa có migration.** Q037 còn lại giao Thủy và kế toán trưởng, có mặc định tạm.
> **Phụ trách cần phối hợp:** nhóm Lõi (hợp đồng, cửa nạp, Policy Registry) · **Thuy2k** (Nguyễn Văn Thủy — danh mục, mua hàng, kho, giá vốn; màn cấu hình nguồn quà) · người làm bán hàng / POS · kế toán trưởng (cách tính giá trị, thuế).
> **ADR:** [ADR-0035](../../adr/ADR-0035-combo-identity-phan-kho-nguon-qua.md) (chấp nhận 2026-11-17) · **CANON:** [§0.11](../../00-CANON.md) hàng tặng · **Luật:** [R-COMBO](../../rules/RULE-COMBO.md) (mới) · **Hợp đồng:** [`bizcity_combo@1`](../../contracts/BIZCITY-COMBO-v1.md) 0.1.0-draft.
> **Tệp:** [00 — Kế hoạch](00-MASTER-PLAN.md) · [10 — Kiến trúc dữ liệu](10-KIEN-TRUC-DU-LIEU.md) · [20 — Nghiệp vụ, kế toán, thuế](20-NGHIEP-VU-KE-TOAN-THUE.md) · [25 — Kế thừa đầu vào → đầu ra](25-KE-THUA-DAU-VAO-DAU-RA.md) · [30 — Hợp đồng & API](30-FRAMEWORK-CONTRACT.md) · [40 — Checklist](40-MASTER-CHECKLIST.md)

## Đề bài (chủ dự án, 2026-11-17)

1. Nhà cung cấp bán 3 tặng 1, 4 tặng 1, 12 tặng 1, mua sữa tặng xe chòi chân. Nếu mỗi chương trình sinh một mặt hàng `COMBO-3+1`, `COMBO-4+1`… thì danh mục thành rác: nhập một mã, xuất mã khác; lô, hạn dùng, hoá đơn đầu vào, giá vốn, kê khai, hàng trả không truy xuyên suốt được.
2. **Cùng một lon sữa không biến thành mặt hàng khác** chỉ vì được nhập miễn phí, nằm trong combo, được tách ra hay bán lẻ. Quà là hàng thật (xe chòi chân) thì có `item_id` thật.
3. Thêm **Combo Contract** làm lớp liên kết giữa Item Master, Inventory Engine, Policy Registry và Accounting Kernel; mở rộng hợp đồng đang có, **không** dựng thêm hệ thống khuyến mại hay sổ kho song song.
4. **Giá bán bằng 0 không có nghĩa giá vốn bằng 0**; dòng "tặng" trên hoá đơn không tự quyết định cách hạch toán. Chính sách ghi nhận đầu vào tách khỏi chính sách đầu ra.
5. Truy được **mua theo chính sách, bán theo chính sách**, cả luồng combo từ đầu vào tới đầu ra. Công ty tự đặt combo và bán theo combo; **hết combo thì tự bán rời tiếp**.
6. Phase này **chỉ làm tài liệu**: cập nhật CANON, ra luật cho anh em dev tuân thủ, và hợp đồng để dựa vào đó dựng phần cài đặt mã hàng, combo, chính sách; áp cho mua, theo dõi kho, tính giá vốn, định giá, bán hàng.

## Một câu chốt

**Combo là thoả thuận thương mại có phiên bản, không phải mặt hàng.** Hàng thật luôn mang `item_id` của chính nó; `combo_id` nói các dòng hàng đi cùng nhau theo thoả thuận nào, `combo_instance_id` nói lần nào; `phankho_id` nói hàng ở đâu; **nguồn quà** nói hàng từ đâu, của ai. Không cái nào trong số đó tự quyết định giá vốn hay thuế.

## Trả lời ngắn

| Câu hỏi | Trả lời | Ở đâu |
|---|---|---|
| Hôm nay hệ thống hiểu "combo" thế nào? | Hai nghĩa rời nhau: **mã hàng nhóm 8** (combo là một mã, "phá combo" cần chứng từ) và luật giá `sale.promo.combo@1` (theo `sku`, không vết kho). Quà đầu vào phân loại ở module mua hàng (`gift_seller` / `gift_consumer`); giá vốn quà là cờ `exclude_cost` + bể `gift_qty` gộp theo mặt hàng | [00 §1](00-MASTER-PLAN.md) |
| Mã nhóm 8 (combo đang là mã hàng) thì sao? | **Chuyển hết sang combo ngay** (đang giai đoạn phát triển): mỗi mã thành một combo, tồn tách sang thành phần bằng chứng từ, mã cũ ngừng dùng, không tạo mã nhóm 8 mới | D037-14, [00 §10](00-MASTER-PLAN.md) |
| Combo có tạo mặt hàng mới không? | **Không.** Chỉ tạo `item_id` khi có một hàng vật chất thật sự khác chưa có trong danh mục | R-COMBO-1, D037-1 |
| Mã vạch dán trên lốc 4 lon lưu ở đâu? | `combo_codes` — mã của combo, không phải mã hàng | [10 §3](10-KIEN-TRUC-DU-LIEU.md) |
| `phankho_id` là gì, có thêm bảng không? | Là **`warehouses.uid`** (`kho_…`) đang có; loại phân kho là `type_code` đang có (`KHH` hàng bán, `KKM` khuyến mại, `KNB` giữ hộ, `KCC` chờ chứng từ…). Không thêm bảng, không kho cha – con. Nguồn ngoài gửi mã phân kho, Core phân giải ra định danh. **Mặc định `phankho_id = 0` = phân kho chính** của chi nhánh; kế toán quản trị tự tạo thêm và cấu hình | D037-7, [10 §2](10-KIEN-TRUC-DU-LIEU.md) |
| Có bắt buộc tách phân kho khuyến mại? | Không. Tách để dễ quản trị; không tách vẫn truy được nguồn qua dòng nhận và phân bổ | D037-8 |
| Combo cài mua + bán, chỉ mua, hay chỉ bán? | **Một combo hai mặt**: mặt mua và / hoặc mặt bán, mỗi mặt có thành phần và chính sách riêng. Ba kiểu suy ra: *mua & bán* · *chỉ mua (nhập rồi tách bán rời)* · *chỉ bán (công ty tự đặt)* | D037-3, [00 §5](00-MASTER-PLAN.md) |
| Bán theo chính sách của nhà cung cấp được không? | Được, bằng cách **phát hành mặt bán "áp dụng theo"**: kế thừa thành phần, tỷ lệ, thời gian, hạn mức theo nguồn quà; **không** kế thừa cách tính giá trị và thuế. Đợt riêng (W5), có bộ ca kiểm K1..K12. Hết quà đã nhận: mặc định dừng tặng, bật *lấy hàng thường* theo từng combo | R-COMBO-7, [25](25-KE-THUA-DAU-VAO-DAU-RA.md) |
| Quà có mấy nguồn, tên gì? | Năm: *Hàng nhà cung cấp tặng kèm mua* · *Quà nhà cung cấp cho người tiêu dùng* · *Quà nhà cung cấp gửi giữ hộ* · *Quà công ty tự đặt* · *Chưa rõ nguồn* | R-COMBO-9 |
| Quà giữ hộ có định giá, ghi tồn, lên thuế không? | Mặc định **không · không · không**. Đơn vị đổi bằng chính sách có phiên bản *Nguồn quà & cách xử lý* (ba công tắc, có căn cứ); Thuy2k dựng màn. Đây là luật nền ở **CANON §0.11** | D037-10, [20 §2a](20-NGHIEP-VU-KE-TOAN-THUE.md) |
| Giá vốn lon được tặng bằng 0? | Không mặc định. Ví dụ trả 300.000 nhận 4 lon → 75.000 / lon khi chính sách là phân bổ đều; con số thật theo phương pháp tính giá và chính sách đang hiệu lực | [20 §2](20-NGHIEP-VU-KE-TOAN-THUE.md) |
| Hết combo thì sao? | Bán rời theo giá thường, không cần chứng từ phá combo — tồn vốn đã theo `item_id`. Máy bán gõ mã hàng sẽ gợi ý combo 3, 5, 12… còn dùng được | R-COMBO-10, [30 §5](30-FRAMEWORK-CONTRACT.md) |
| Có chặn bán hàng không? | Mặc định không (R-GATE-9). Chỉ chặn lỗi toàn vẹn: combo đứng chỗ mặt hàng, sai băm, lệch lượng, trùng lần thực hiện, bán hàng không sở hữu. Phần đã cho qua bị **bắt lại lúc khoá sổ** (`CT-COMBO-006`) | [RULE-COMBO](../../rules/RULE-COMBO.md) |
| Dữ liệu cũ (`exclude_cost`, `gift_qty`)? | Giữ nguyên, vẫn đọc được; chuyển từ một ngày hiệu lực, chạy song song để so; không tính lại kỳ đã khoá; không bịa nguồn | D037-14, D037-16 |
| Làm theo thứ tự nào? | Bước thắng nhỏ B1..B10, mỗi bước một PR người dùng dùng được | [00 §8](00-MASTER-PLAN.md) |

## Đã có trong mã — phải dùng lại

1. `bizcity_item_master@1`: `items.item_id` bất biến, mã có phiên bản; không lấy mã làm định danh.
2. `warehouses` (`uid`, `type_code`), `warehouse_types` (`can_sell`, `owned`), `warehouse_type_ops` (0121, 0128): **đây là phân kho**.
3. `item_lots`, `inventory_lot_moves` (0098): lô.
4. Policy Registry (`policy_registry`, `policyRefs` ở chứng từ, `POST /api/v1/policies/evaluate`) và các Rule Contract bán: `sale.promo.buy_x_get_y@1`, `sale.promo.combo@1`, `sale.program.gift@1`…
5. `sale_programs` + hạn mức (`sale_program_quotas`, `sale_program_usage`) nối sổ đăng ký qua `policy-bridge.ts`.
6. Khuôn chứng từ `packages/contracts/src/documents.ts`: dòng có `itemId`, `warehouseCode`, `isGift`, `excludeFromCost`, `policyRef`, `lotNo`.
7. Module mua hàng: `lineType` (`buy` · `gift_seller` · `gift_consumer`), chính sách mua có phiên bản (`purchase.<kind>@1`, chưa có khuôn luật).
8. `modules/pos/`: tìm hàng theo mã / mã vạch (`catalog-search`, `catalog-barcode`), dòng đơn mang `policyRef`.

**Chưa có, phải đánh dấu chờ:** lớp giá vốn + phân bổ (`valuation_layers`, `cost_allocations` — PHASE-032 B6); `itemId` trên phiếu chuyển kho / điều chỉnh; Rule Contract mặt mua; văn bản về khuyến mại trong [danh mục văn bản](../../can-cu/01-danh-muc-van-ban.md).

## Điều không được hiểu sai

- `isGift = true` hay giá dòng bằng 0 **không** có nghĩa giá vốn bằng 0, cũng **không** có nghĩa giá tính thuế bằng 0.
- Nhà cung cấp tặng doanh nghiệp và doanh nghiệp tặng khách là **hai sự việc**; chính sách đầu vào không tự mở chính sách đầu ra.
- Quy tắc xuất lô (FEFO / FIFO theo lô) ≠ phương pháp tính giá (R-INV-5) ≠ phân kho (vị trí). Phân kho không phải "tài khoản kho".
- Không sửa chứng từ / bút toán đã ghi; không chạy lại kỳ đã khoá.
- Đây là **đặc tả để duyệt và giao việc**; `bizcity_combo@1` chưa có mã chạy.

## Liên hệ

[PHASE-024](../PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/README.md) · [PHASE-025](../PHASE-025-ACCOUNTING-CONTINUITY/README.md) · [PHASE-026](../PHASE-026-MASTER-DATA-GOVERNANCE/README.md) · [PHASE-029](../PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/README.md) · [PHASE-031](../PHASE-031-POLICY-REGISTRY-RULE-CONTRACTS/README.md) · [PHASE-032](../PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/README.md).
