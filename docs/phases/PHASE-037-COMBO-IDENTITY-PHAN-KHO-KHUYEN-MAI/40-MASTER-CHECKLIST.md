# PHASE-037 · 40 — Checklist
<!-- [2026-11-17 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-037 — việc con S037-*, ca vàng T037-G*, ca kế thừa T037-K*, cổng phát hành, nhật ký -->

Ký hiệu: ☐ chưa · 🟡 đang · ✅ xong · ⛔ chờ chủ hoặc người ngoài nhóm. **Có tài liệu không có nghĩa đã có chức năng**: chỉ ghi ✅ khi có PR đã merge, test trên CSDL thật và bằng chứng.

## Việc

| ID | Việc | Đợt | Ưu tiên | Code? | Trạng thái |
|---|---|---|---|---|---|
| S037-1 | README, [00](00-MASTER-PLAN.md), [10](10-KIEN-TRUC-DU-LIEU.md), [20](20-NGHIEP-VU-KE-TOAN-THUE.md), [25](25-KE-THUA-DAU-VAO-DAU-RA.md), [30](30-FRAMEWORK-CONTRACT.md), checklist; ADR-0035, RULE-COMBO, `BIZCITY-COMBO-v1` nháp; CANON v1.7 | W0 | P0 | không | ✅ 2026-11-17 |
| S037-2 | Chủ dự án duyệt D037-1..16; trả Q037-1..9 (hoặc nhận mặc định tạm) | W0 | P0 | không | ✅ 2026-11-17 — sáu điểm (ADR-0035 · Chủ dự án duyệt); Q037-7, -9, -10 đã trả, còn lại mặc định tạm <!-- [2026-11-17 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-037 — S037-2 chốt --> |
| S037-3 | Rà mã cũ thành bảng tác động: `exclude_cost`, `gift_qty`, "lấy quà giá 0 trước", `lineType`, mã nhóm 8, `sale.promo.combo@1`, `sale_programs`, `warehouse_type_ops`; bộ dữ liệu thật đã ẩn danh làm ca kiểm {kho} | W0 | P0 | không | ☐ |
| S037-4 | Khuôn `bizcity_combo@1` (zod, kiểu, JSON Schema), ca mẫu hợp lệ / không hợp lệ {danh-muc} | W1 | P0 | có | ☐ |
| S037-5 | Sổ combo trên Policy Registry: `core.combo.definition@1`, bảng `combo_*`, `combo_codes`, RLS, trigger bản đã phát hành không sửa {danh-muc} | W1 | P0 | có | ☐ |
| S037-6 | Màn *Combo* (hai thẻ Mua · Bán, dòng thời gian phiên bản, không nút tạo mặt hàng); phân giải mã combo / mã vạch → bản → từng `item_id` {danh-muc} | W1 | P0 | có | ☐ |
| S037-7 | Năm nguồn quà ở khuôn chung; ánh xạ `lineType` (`gift_seller` · `gift_consumer`) → `commercialRole` + `giftSource`, dữ liệu không đổi {mua-hang} | W1 | P0 | có | ☐ |
| S037-8 | Chính sách `core.combo.gift_treatment@1` (định giá · ghi tồn · lên thuế) + màn *Nguồn quà & cách xử lý* {mua-hang} | W1 | P0 | có | ☐ |
| S037-9 | Mở rộng khuôn chứng từ: `comboInstances[]`, `comboInstanceId`, `comboLineRef`, `commercialRole`, `giftSource`, `receiptSourceRef`, tham chiếu cách xử lý; `itemId` ở dòng chuyển kho / điều chỉnh; nguồn cũ vẫn hợp lệ {chung-tu} | W2 | P0 | có | ☐ |
| S037-10 | Rule Contract `purchase.promo_gift@1` (spec, vectors) cho mặt mua {mua-hang} | W2 | P0 | có | ☐ |
| S037-11 | Phiếu nhận / đơn mua theo combo: chọn combo ra dòng hàng thật, lưu lần thực hiện cùng giao dịch chứng từ; 3+1, 4+1, 12+1, sữa tặng xe, quà không phải hàng {mua-hang} | W2 | P0 | có | ☐ |
| S037-12 | Mã kiểm `IN-COMBO-001..011` ở cửa nạp + thư viện mã (căn cứ, cách sửa, màn sửa); mức theo R-GATE-9 {chung-tu} | W2 | P0 | có | ☐ |
| S037-13 | Thẻ *Nguồn combo* ở Hành trình mặt hàng (chỉ đọc) {kho} | W2 | P1 | có | ☐ |
| S037-14 | Quà giữ hộ: nhập vào phân kho `KNB`, không vào tồn của công ty; phiếu phát hộ / hoàn trả; bán bị giữ `IN-COMBO-006` {kho} | W3 | P0 | có | ☐ |
| S037-15 | Tách bộ (`core.combo.unbundle`), chuyển phân kho giữ nguồn, đổi mục đích dùng (`core.combo.repurpose`) có căn cứ {kho} | W3 | P0 | có | ☐ |
| S037-16 | Phân bổ nguồn (`receipt_origin` hoặc gộp `valuation_layer_sources`), thứ tự lấy nguồn khi xuất, ánh xạ dòng nguồn bền; giá vốn theo nguồn — phụ thuộc PHASE-032 B6 {kho} | W3 | P0 | có | ⛔ chờ PHASE-032 B6 (phần giá vốn); phần vết nguồn làm trước |
| S037-17 | Chạy song song đường cũ (`exclude_cost` / `gift_qty`) và đường nguồn; báo cáo lệch theo (mặt hàng, tháng) {kho} | W3 | P0 | có | ☐ |
| S037-18 | `core.combo.suggest` + `GET /combos/suggest`; máy bán và phiếu bán BH10 gõ mã hàng thấy combo 3, 5, 12… {ban-hang} | W4 | P0 | có | ☐ |
| S037-19 | Mặt bán `doc_lap`: giải ra dòng hàng thật có `comboInstanceId`; `itemId` cho `sale.promo.combo@1`; bán kèm tặng ≠ tặng độc lập {ban-hang} | W4 | P0 | có | ☐ |
| S037-20 | Hạn mức mặt bán; hết combo bán rời (`IN-COMBO-009`), nhả giữ chỗ; không chứng từ phá combo {ban-hang} | W4 | P0 | có | ☐ |
| S037-21 | Mặt bán `ap_dung_theo` / `tu_dieu_chinh`: `inheritsFrom`, kiểm khớp lúc phát hành, lời nhắc khi bản nguồn đổi {ban-hang} | W5 | P0 | có | ☐ |
| S037-22 | Hạn mức theo nguồn quà (tính từ sổ), khoá khi ghi, `IN-COMBO-008`, `CT-COMBO-005`; hành vi ngoại tuyến {ban-hang} | W5 | P0 | có | ☐ |
| S037-23 | Bộ ca K1..K12 thành dữ liệu dùng chung cho Core và máy bán; phá thử; chạy bóng một kỳ {ban-hang} | W5 | P0 | có | ☐ |
| S037-24 | Truy vết một mạch `core.combo.trace`: hoá đơn NCC → phiếu nhận → combo → mặt hàng → lô → phân kho → giá vốn → bút toán → hoá đơn bán; độ phủ `known · estimated · unknown` {bao-cao} | W6 | P1 | có | ☐ |
| S037-25 | Báo cáo: nhập theo combo của nhà cung cấp; kho quà theo mặt hàng × nguồn × phân kho; đã nhận – đã phát; bán tách; lãi gộp theo combo; chứng từ thuế của quà {bao-cao} | W6 | P1 | có | ☐ |
| S037-26 | Điều kiện khoá sổ `CT-COMBO-006` (combo còn dòng chưa quyết định sở hữu / giá trị / thuế) vào sổ điều kiện khoá sổ {tong-hop} | W6 | P0 | có | ☐ |
| S037-27 | Phép đối soát `CT-COMBO-001..004` (bảo toàn lượng, độ phủ nguồn, tồn theo phân kho, giá trị phân bổ đầu vào) {kho} | W6 | P0 | có | ☐ |
| S037-28 | Đa đơn vị (RLS), đồng thời, gửi lại, tải: 10.000 bộ / 100.000 dòng / nhiều chi nhánh {he-thong} | W6 | P0 | có | ☐ |
| S037-29 | Trả hàng theo combo: khách trả cả bộ / một phần, trả nhà cung cấp phần quà; về đúng nguồn, lô, phân bổ gốc {ban-hang} | W6 | P0 | có | ☐ |
| S037-30 | Phép kiểm tĩnh SC-COMBO-1..3 + ca tự kiểm {he-thong} | W6 | P0 | có | ☐ |
| S037-31 | Chuyển từ `exclude_cost` / `gift_qty`: ngày hiệu lực theo đơn vị, không tính lại kỳ đã khoá, dòng không truy được ghi `unknown` {kho} | W7 | P0 | có | ☐ |
| S037-32 | **Chuyển hết mã nhóm 8 sang combo** (D037-14, [00 §10](00-MASTER-PLAN.md)): liệt kê, bảng thành phần (Thủy), tạo combo + `combo_codes`, chứng từ tách bộ cho tồn, ngừng dùng mã cũ, Gate A chặn mã nhóm 8 mới, đổi chính sách đang trỏ mã cũ {danh-muc} <!-- [2026-11-17 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-037 — S037-32 chuyển nhóm 8 ngay --> | W1 | P0 | có | ☐ |
| S037-35 | **Phân kho chính** `phankho_id = 0`: mỗi chi nhánh đúng một phân kho chính đang dùng (`is_default`), phân giải ở biên API; màn kế toán quản trị tạo thêm / cấu hình phân kho {kho} <!-- [2026-11-17 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-037 — S037-35 phân kho chính --> | W1 | P0 | có | ☐ |
| S037-33 | Cờ theo đơn vị (`combo_contract_v1`, `combo_inherit_v1`), chạy bóng, số đo `cost_diff`, `qty_diff`, độ phủ truy vết {he-thong} | W7 | P0 | có | ☐ |
| S037-34 | Hướng dẫn (`docs/huong-dan/`), cập nhật `docs/nghiep-vu/11`, `docs/core/03`; đưa văn bản về khuyến mại vào danh mục văn bản sau khi rà {thue} | W7 | P1 | không | ⛔ chờ kế toán trưởng rà văn bản (Q037-8) |

## Ca vàng (chặn phát hành)

| ID | Cho → Khi | Phải đúng | Đợt |
|---|---|---|---|
| T037-G1 | NCC 3+1 cùng mặt hàng, trả 300.000, nhận 4 | Một `item_id`, hai dòng nguồn, một lần thực hiện; Q = 4, V = 300.000; không có mặt hàng combo | W2 |
| T037-G2 | NCC 4+1 cùng mặt hàng, rồi bán rời 1 | Tồn 5 → 4; giá vốn theo chính sách / lớp; không tự chọn "quà giá 0" vì chữ gift | W2–W3 |
| T037-G3 | 12+1 và 3+1 cùng ngày cùng mặt hàng | Hai lần thực hiện, hai nguồn; xuất theo lô / nguồn; không ghi trùng | W2 |
| T037-G4 | Mua 4 lon 800 g hoặc 3 lon 1,6 kg, tặng xe | Ba `item_id` riêng; một combo có nhóm lựa chọn; xe không phải combo; phân bổ 960.000 / 240.000 khi chọn phương pháp giá trị hợp lý | W2 |
| T037-G5 | Quà là voucher dịch vụ | `benefitRef`; tồn không tăng | W2 |
| T037-G6 | Nhập 3+1, hai chính sách định giá khác nhau | Phân bổ đều: 75.000 / lon; không định giá quà: 100.000 × 3 + 0; cả hai Σ = 300.000; không suy `unitPrice = 0` → giá vốn 0 | W3 |
| T037-G7 | Cùng mặt hàng / lô ở phân kho `KHH` và `KKM` | Báo cáo tồn cộng một lần; chuyển `KKM` → `KHH` ra − vào + bằng nhau, không doanh thu | W3 |
| T037-G8 | Quà giữ hộ ở `KNB`, máy bán cố bán | Giữ `IN-COMBO-006`; không doanh thu / giá vốn / thuế sai; chứng từ nằm ở bể chờ | W3 |
| T037-G9 | Không tách phân kho, có nguồn và ràng buộc | Vẫn biết nguồn nhà cung cấp / chương trình và quyền dùng | W3 |
| T037-G10 | Đổi mã hàng sau khi nhận combo | Nguồn, giá trị, trả hàng vẫn theo `item_id`; truy được mã cũ và mới | W2 |
| T037-G11 | Tách bộ 4+1 tại chỗ, rồi chuyển 2 lon sang phân kho khác | Tách không sinh dòng kho; chuyển là cặp ± đúng lượng, lô; không doanh thu | W3 |
| T037-G12 | Công ty bán mua 3 tặng 1 theo mặt bán | Sổ gồm dòng hàng thật; phân bổ theo cách xử lý đầu ra; thuế theo quy định đầu ra, không lấy của đầu vào | W4 |
| T037-G13 | Công ty tặng không điều kiện | Cách xử lý khác bán kèm tặng; có căn cứ | W4 |
| T037-G14 | Khách trả một phần bộ, quà phải thu hồi | Không hoàn vượt; đảo đúng phân bổ gốc; có xử lý phần quà chưa thu hồi | W6 |
| T037-G15 | Trả nhà cung cấp một phần quà đã nhận | Về đúng nguồn / lô; giá trị và thuế điều chỉnh theo chứng từ; không sửa sổ cũ | W6 |
| T037-G16 | Gửi lại 100 lần cùng `docKey` / `version` / khoá | Một bộ lần thực hiện, một lần nhập / xuất, một sự kiện | W2 |
| T037-G17 | Hai máy bán cùng lấy lon quà cuối | Một giao dịch có quà; tồn không âm | W4 |
| T037-G18 | Bản 1 hiệu lực ngày 15, bản 2 ngày 20 | Phiếu ngày 15 gắn bản 1, ngày 20 bản 2; bản 1 không bị sửa | W1 |
| T037-G19 | Cố sửa bản đã phát hành; cố xoá mặt hàng / lô đã có lần thực hiện | CSDL và API từ chối; lịch sử còn nguyên | W1 |
| T037-G20 | Đơn vị A dùng mặt hàng / phân kho / lần thực hiện của B | RLS + khoá ngoại chặn cả đọc và ghi | W6 |
| T037-G21 | Dữ liệu cũ có `gift_qty`, không có dòng nguồn | Độ phủ `unknown`; không tự gán nguồn; sổ kỳ đã khoá không đổi | W7 |
| T037-G22 | Cuối kỳ còn nguồn quà chưa định giá | `CT-COMBO-006` hiện ở Sẵn sàng khoá kỳ, dẫn tới đúng dòng | W6 |
| T037-G23 | 10.000 bộ / 100.000 dòng / nhiều chi nhánh, gửi lại và truy vết | Đạt ngưỡng đã chốt; chỉ mục có `tenant_id`; không khoá cả bảng | W6 |
| T037-G24 | Bản cài cũ không gửi `comboRef` | Luồng cũ vẫn chạy; độ phủ ghi `legacy` | W2 |
| T037-G25 | Công ty tự đặt combo hạn mức 10 bộ; bán bộ thứ 11 | Bộ 11 bán rời theo giá thường, không `comboInstanceId`, `IN-COMBO-009`; không chứng từ phá combo | W4 |
| T037-G26 | Gõ mã `I-MILK800` trên máy bán ngày có ba combo 3 / 5 / 12 | Gợi ý đủ ba, sắp 3 → 5 → 12; combo hết hạn mức hiện mờ kèm lý do | W4 |

Ca kế thừa **T037-K1..K12**: [25 §6](25-KE-THUA-DAU-VAO-DAU-RA.md).

## Yêu cầu kiểm ở CI

- Đơn vị: khuôn zod, số thập phân, tỷ lệ, vai trò dòng, nhóm lựa chọn, bản / băm, phân giải phân kho.
- Tích hợp PostgreSQL thật: combo + mặt hàng + phân kho / lô + mua / bán + `accounting_events`, `inventory_movements`, phiên bản chứng từ, outbox.
- RLS / quyền: cô lập `tenant_id`; module ngoài chỉ gọi action.
- Đồng thời: nhiều phiên bán song song, khoá đúng mức (mặt hàng, lô, phân kho, nguồn).
- Tương thích: cùng bộ dữ liệu trước / sau khi bật; giá vốn kỳ mở so khớp; **kỳ đã khoá không đổi**.
- Bằng chứng: `conformance-report.json`, nhật ký migration, một đường truy vết mẫu, kết quả số của ca vàng, bảng độ phủ và tải — đặt ở `evidence/`.

## Cổng phát hành

**RG-1** không `item_id` nào sinh ra khi phát hành combo · **RG-2** không mã combo nào import / ghi `ledger_*` hay bảng Engine · **RG-3** tồn không đếm đôi theo phân kho, tổng bảo toàn · **RG-4** chưa có quy định thuế đã rà thì không tự gán giá tính thuế 0, không tự loại khỏi tờ khai · **RG-5** bản / băm / truy vết bất biến, RLS · **RG-6** có sao lưu và so song song; không chạy lại kỳ đã khoá · **RG-7** G1..G26 + K1..K12 đạt · **RG-8** tài liệu khớp trạng thái mã.

**Bật dần:** cờ theo đơn vị; lần đầu chạy bóng so với luồng cũ; chỉ bật ghi thật khi kế toán trưởng của đơn vị xem báo cáo lệch. Tắt được cho nghiệp vụ tương lai, **không xoá / sửa dữ liệu đã ghi**.

## Chia PR để không chồng việc

1. **PR037-A** (tài liệu): bộ này. Không mã.
2. **PR037-B** hợp đồng + sổ combo (S037-4..8).
3. **PR037-C** đầu vào (S037-9..13).
4. **PR037-D** kho, nguồn (S037-14..17).
5. **PR037-E** đầu ra công ty tự đặt (S037-18..20).
6. **PR037-F** kế thừa (S037-21..23).
7. **PR037-G** đối soát, khoá sổ, báo cáo, tương thích (S037-24..34).

Mỗi PR mã: giữ chỗ ở [CLAIMS](../CLAIMS.md) trước (R-FLOW-1), chữ chốt cho thứ dùng chung trước (R-FLOW-2), nhánh ngắn theo bước thắng nhỏ ở [00 §8](00-MASTER-PLAN.md).

## Người duyệt

- [ ] **Kiến trúc (nhóm Lõi):** combo là thoả thuận thương mại; định danh hàng giữ nguyên; không kho / sổ song song.
- [ ] **Danh mục – mua hàng – kho (Thuy2k):** nguồn và lô tách bạch cả khi cùng mặt hàng; phân kho là lựa chọn; mã nhóm 8.
- [ ] **Kế toán trưởng:** cách tính giá trị hàng nhà cung cấp tặng; doanh thu bán có điều kiện; ba công tắc mặc định.
- [ ] **Thuế:** hồ sơ chương trình, vai trò tổ chức, hoá đơn, quy định có phiên bản.
- [ ] **Bán hàng / POS:** gợi ý combo, hết combo bán rời, ngoại tuyến.

## Nhật ký

- 2026-11-17 — W0 đề xuất <!-- [2026-11-17 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-037 — nhật ký W0 -->: chủ dự án nêu đề bài (combo_id ≠ item_id, phankho_id, sáu bất biến, mua theo chính sách – bán theo chính sách, công ty tự đặt combo, hết combo bán rời; chỉ làm tài liệu). Đọc mã `2b7fa083`: "combo" đang là mã nhóm 8 và `sale.promo.combo@1`; phân kho = `warehouses.uid` + `type_code`; quà đầu vào là `lineType` của module mua hàng; giá vốn quà là `exclude_cost` + `gift_qty`. Đề xuất ADR-0035 (D037-1..16), R-COMBO-1..10, `bizcity_combo@1` 0.1.0-draft, một combo hai mặt, năm nguồn quà, ba công tắc, đợt W0–W7, B1..B10, G1..G26, K1..K12; chờ duyệt.
- 2026-11-17 — W0 chốt <!-- [2026-11-17 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-037 — nhật ký chốt W0 -->: chủ dự án duyệt sáu điểm — (1) một combo hai mặt; (2) chuyển hết mã nhóm 8 sang combo ngay vì đang giai đoạn phát triển, Thủy / Hoàng / Kiên lưu ý theo issue; (3) nhắc mặc định, phần đã cho qua bắt lại lúc khoá sổ; (4) phân kho = kho đang có, không bắt buộc tách, mặc định `phankho_id = 0` là phân kho chính, kế toán quản trị tự tạo / cấu hình, kho cha – con để việc riêng; (5) ba công tắc là chính sách có phiên bản theo nguồn quà, thêm Rule Contract + màn cấu hình, đưa vào CANON (§0.11); (6) hết quà đã nhận mặc định dừng tặng, lấy hàng thường bật theo từng combo. ADR-0035, R-COMBO chấp nhận; `bizcity_combo@1` 0.2.0-draft; thêm S037-35, S037-32 lên W1.
