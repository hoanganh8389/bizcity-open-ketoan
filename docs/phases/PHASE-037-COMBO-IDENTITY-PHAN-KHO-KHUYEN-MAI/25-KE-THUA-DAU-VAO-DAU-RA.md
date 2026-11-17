# PHASE-037 · 25 — Bán theo chính sách của nhà cung cấp: kế thừa đầu vào → đầu ra (đợt W5)
<!-- [2026-11-17 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-037 — W0: phân tích kế thừa chính sách đầu vào sang đầu ra — cái gì kế thừa, cái gì không, ba quan hệ ap_dung_theo / tu_dieu_chinh / doc_lap, hạn mức theo nguồn quà, mười rủi ro, bộ ca K1..K12, quy trình kiểm thử -->

> **Đợt riêng (W5), làm sau khi đầu vào (W2), kho (W3) và đầu ra công ty tự đặt (W4) đã chạy.** Lý do tách: đây là chỗ duy nhất hai sự việc pháp lý – kế toán khác nhau (nhà cung cấp tặng công ty; công ty tặng khách) chạm nhau. Làm sai là lệch hạn mức quà, lệch thuế đầu ra, hoặc bán hàng không thuộc sở hữu.

## 1. Đề bài

Chủ dự án 2026-11-17: *"Lớp policy registry có thể kế thừa, áp dụng chương trình để POS ánh xạ, bán hàng theo chính sách được policy registry đồng ý áp dụng từ đầu vào phía nhà cung cấp."* · *"Chính sách bán hàng có quyền áp dụng theo hoặc tự điều chỉnh."* · đồng thời: *"Phase 037 phải tách chính sách ghi nhận đầu vào của nhà cung cấp khỏi chính sách đầu ra."*

Hai yêu cầu không mâu thuẫn nếu phân biệt **điều kiện thương mại** (kế thừa được) với **kết luận kế toán – thuế** (không kế thừa).

## 2. Kế thừa cái gì

| Nội dung | `ap_dung_theo` | `tu_dieu_chinh` | `doc_lap` |
|---|---|---|---|
| Thành phần, tỷ lệ (mua X tặng Y) | **chép từ mặt mua**, kiểm khớp lúc phát hành | khai lại; ghi khác ở đâu, vì sao | khai mới |
| Thời gian | nằm **trong** thời gian của mặt mua (kéo dài hơn phải ghi lý do → thành `tu_dieu_chinh`) | tự đặt | tự đặt |
| Phạm vi chi nhánh / kênh | ⊆ phạm vi mặt mua | tự đặt | tự đặt |
| Nguồn quà khi phát | **đúng nguồn đã nhận** của các lần thực hiện mặt mua | chọn: nguồn đã nhận hoặc hàng thường | hàng thường (*quà công ty tự đặt*) |
| Hạn mức quà | ≤ Σ quà đã nhận từ nguồn − đã phát − đã trả nhà cung cấp (tính, không nhập tay) | tự đặt; nếu dùng nguồn đã nhận thì vẫn ≤ nguồn | `hanMuc` tự đặt |
| Quyền dùng của nguồn | theo nguồn (giữ hộ → chỉ phát hộ, không bán) | theo nguồn | — |
| **Cách tính giá trị (kế toán)** | **không kế thừa** — theo quy định đầu ra | không kế thừa | theo quy định đầu ra |
| **Cách tính thuế, hoá đơn** | **không kế thừa** — theo quy định đầu ra tại ngày bán | không kế thừa | theo quy định đầu ra |
| **Giá bán** | không kế thừa — bảng giá bán của công ty | — | — |

**Luật:** kế thừa là một **bản phát hành** của mặt bán (có người phát hành, ngày hiệu lực, băm), mang `inheritsFrom { comboId, version, hash, side: 'mua' }`. Nhập hàng theo combo của nhà cung cấp **không** tự bật mặt bán (R-COMBO-7).

## 3. Trong Policy Registry

```text
purchase.promo_gift@1   NCC-3P1 v1  (mặt mua)         ── phát hành khi có thoả thuận với NCC
        ▲ inheritsFrom
sale.promo.buy_x_get_y@1  BAN-3P1 v1 (mặt bán, ap_dung_theo) ── phát hành khi công ty quyết định bán theo
        ▲ policyRef
POS: GET /policies → evaluate → dòng quà có policyRef + comboInstanceId → POST /documents
```

- Hai bản chính sách, hai `policyId`, hai lịch sử phiên bản; **một `combo_id`** nối chúng.
- Máy bán không biết gì về mặt mua: nó lấy bản bán đã phát hành như mọi chính sách (`bizcity_policy@1`), ngoại tuyến vẫn tính được.
- Cửa nạp kiểm lại: tham chiếu chính sách (`IN-POL-001..003` đã có) + điều kiện kế thừa (`IN-COMBO-008`).
- Bản mặt mua bị thay (nhà cung cấp đổi chương trình) → bản mặt bán *áp dụng theo* **không tự đổi**; Core nhắc người phụ trách (*"chương trình nguồn đã đổi, mặt bán đang theo bản cũ"*) kèm nút phát hành bản bán mới. Người dùng quyết định (ADR-0020).

## 4. Hạn mức theo nguồn quà

```text
được_phát(combo, item, chi nhánh, tại ngày)
  = Σ quà đã nhận  (dòng vai trò `tang` của các lần thực hiện mặt mua, đã ghi sổ)
  − Σ quà đã phát  (dòng quà của các lần thực hiện mặt bán, đã ghi sổ; phiếu trả của khách cộng lại)
  − Σ quà đã trả nhà cung cấp
  − Σ quà đã đổi mục đích dùng (chuyển thành hàng bán)
```

- Tính từ sổ, **không lưu số dư riêng** (cùng nguyên tắc với phân bổ nguồn, [10 §4.3](10-KIEN-TRUC-DU-LIEU.md)); hạn mức theo chi nhánh của `sale_programs` (đang có) dùng tiếp cho phần "tự đặt".
- Hai máy bán cùng lấy lon quà cuối: khoá theo (mặt hàng, phân kho, lô, nguồn) lúc ghi; một giao dịch được, giao dịch kia nhận `IN-COMBO-009` và bán rời / bán không quà theo `khiHetNguon`.
- Máy bán ngoại tuyến có thể phát vượt trong lúc mất mạng → khi đồng bộ, cửa nạp ghi nhận phần vượt theo `khiHetNguon`: `dung_tang` → nhắc `IN-COMBO-008` (mức warn, chứng từ vẫn ghi, quà lấy từ hàng thường và đánh dấu để người phụ trách xử lý); đơn vị bật `strict` thì giữ ở bể chờ.
- Đối soát cuối kỳ: `CT-COMBO-005` (đã phát > đã nhận) là lỗi toàn vẹn phải giải trình.

## 5. Mười rủi ro và cách chặn

| # | Rủi ro | Cách xử lý | Ca |
|---|---|---|---|
| 1 | Phát quà nhiều hơn số đã nhận | hạn mức theo nguồn + khoá khi ghi + `CT-COMBO-005` | K3, K4 |
| 2 | Lấy thuế đầu vào làm thuế đầu ra ("NCC tặng nên bán ra cũng thuế 0") | mặt bán luôn tính thuế theo quy định đầu ra; `taxDecision` lưu riêng trên dòng bán | K5 |
| 3 | Bán / tặng quà giữ hộ như hàng của mình | nguồn `qua_ncc_giu_ho` chỉ ra kho bằng phiếu phát hộ; bán → `IN-COMBO-006` giữ | K6 |
| 4 | Mặt bán chạy quá thời gian nhà cung cấp cam kết | kiểm lúc phát hành; quá hạn → `IN-COMBO-008` | K2 |
| 5 | Nhà cung cấp đổi chương trình giữa chừng | bản mới của mặt mua; phiếu cũ giữ bản cũ; nhắc cập nhật mặt bán | K7 |
| 6 | Cùng mặt hàng có hàng thường và hàng quà: tặng nhầm hàng thường | thứ tự lấy nguồn: quà của combo trước; hết thì theo `khiHetNguon` | K8 |
| 7 | Khách trả hàng: quà quay về đâu | phiếu trả theo dòng gốc → về đúng nguồn, cộng lại hạn mức | K9 |
| 8 | Trả nhà cung cấp phần quà đã nhận | trừ hạn mức; nếu đã phát rồi → không cho trả vượt phần còn lại | K10 |
| 9 | Nhiều chi nhánh dùng chung nguồn quà | hạn mức tính theo phạm vi của bản bán; chuyển quà giữa chi nhánh đi phiếu chuyển kho, nguồn đi theo | K11 |
| 10 | Tự điều chỉnh làm khác hình (12+1 → 3+1) rồi mất dấu nguồn | `tu_dieu_chinh` bắt buộc ghi khác ở đâu, vì sao; vẫn một `combo_id`; nguồn quà vẫn là nguồn đã nhận | K12 |

## 6. Bộ ca kiểm K1..K12 (chặn phát hành đợt W5)

Dùng chung dữ liệu: `I-MILK800`; nhà cung cấp A; combo `C3P1` mặt mua "mua 3 tặng 1", hiệu lực 01–30/11/2026; chi nhánh HN01, HN02.

| Ca | Cho → Khi | Phải đúng |
|---|---|---|
| **T037-K1** | Nhập 30 + 10 theo `C3P1@v1`; phát hành mặt bán `ap_dung_theo`; bán 3 lon | Phiếu bán có 3 dòng mua + 1 dòng tặng cùng `item_id`; dòng tặng trỏ nguồn của phiếu nhận; truy một mạch phiếu bán → combo → phiếu nhận → nhà cung cấp |
| **T037-K2** | Như K1; bán ngày 02/12 (ngoài thời gian mặt mua) | Không áp combo; `skipped` nêu lý do; bán rời theo giá thường |
| **T037-K3** | Đã nhận 10 quà, đã phát 10; bán thêm 3 lon | `IN-COMBO-009`; theo `dung_tang`: không dòng quà; theo `lay_hang_thuong`: dòng quà nguồn *quà công ty tự đặt* |
| **T037-K4** | Còn 1 quà; hai máy bán cùng bán 3 lon cùng lúc | Đúng một phiếu có quà từ nguồn; tồn không âm; `CT-COMBO-005` sạch |
| **T037-K5** | Phiếu nhận ghi dòng tặng thuế 0; bán theo `ap_dung_theo` | Thuế dòng tặng ở phiếu bán do quy định đầu ra quyết định; `taxDecision` và `tax_basis_ref` của dòng bán **khác** của dòng nhận; không có đường mã chép thuế từ đầu vào |
| **T037-K6** | Quà nhận là *giữ hộ* (phân kho `KNB`); phát hành mặt bán `ap_dung_theo`; máy bán phát quà | Ra kho bằng lý do phát hộ; không doanh thu, không giá vốn của công ty; cố bán lon đó → `IN-COMBO-006` giữ |
| **T037-K7** | Ngày 15 nhà cung cấp đổi thành 4 tặng 1 (`v2`); mặt bán còn theo `v1` | Phiếu nhận ngày 16 gắn `v2`; phiếu bán vẫn tính theo bản bán đang hiệu lực; có lời nhắc cập nhật; không bản nào bị sửa |
| **T037-K8** | Kho có 20 lon mua thường + 5 lon quà cùng lô; bán combo 3 tặng 1 | Dòng tặng lấy từ 5 lon quà; 3 dòng mua lấy theo quy tắc xuất lô trong hàng bán được |
| **T037-K9** | Khách trả cả bộ 3 + 1 của K1 | Hàng về đúng nguồn / lô; hạn mức quà +1; giá vốn hoàn theo phân bổ gốc (R-INV-4) |
| **T037-K10** | Đã nhận 10 quà, đã phát 7; trả nhà cung cấp 5 quà | Chỉ trả được 3; phần vượt `CT-COST-011`; hạn mức về 0 |
| **T037-K11** | HN01 nhận 10 quà, chuyển 4 sang HN02; bản bán phạm vi cả hai | HN02 phát tối đa 4; nguồn trên dòng bán ở HN02 vẫn là phiếu nhận của HN01 |
| **T037-K12** | Nhập 12 + 1; mặt bán `tu_dieu_chinh` "mua 3 tặng 1" dùng lon quà | Bản bán ghi khác ở tỷ lệ + lý do; hạn mức = 1; dòng tặng trỏ nguồn 12 + 1; cùng `combo_id` |

## 7. Quy trình kiểm thử của đợt W5

1. **Ca chuẩn dùng chung** (như `vectors` của Rule Contract): K1..K12 viết thành dữ liệu; hàm thuần của Core và `POST /policies/evaluate` cùng chạy bộ này; máy bán (PHP / JS) phải ra đúng kết quả trước khi được bật.
2. **PostgreSQL thật**, đơn vị sạch, đi hết cửa nạp → sổ; sau mỗi ca chạy `doi-chieu-ke-toan.sql` và các mã `CT-COMBO-*`, `CT-INV-*`, `CT-COST-*`.
3. **Phá thử** (như PHASE-036): bỏ kiểm hạn mức, chép thuế từ đầu vào, bỏ khoá khi ghi — mỗi lần phá ít nhất một ca phải đỏ.
4. **Đồng thời và gửi lại:** K4 chạy 50 lần; gửi lại cùng phiếu 100 lần chỉ ra một lần thực hiện.
5. **Ngoại tuyến:** máy bán dùng bản đã tải, đồng bộ muộn sau khi hết nguồn / hết hạn → đúng hành vi ở §4.
6. **Chạy bóng theo đơn vị:** bật cờ `combo_inherit_v1` ở chế độ chỉ ghi nhận (không đổi phiếu bán), so *quà lẽ ra được phát* với *quà đã phát theo chương trình bán hiện có* trong ít nhất một kỳ; kế toán trưởng xem báo cáo lệch rồi mới bật thật.
7. **Người rà:** nhóm Lõi (cửa nạp, hạn mức, khoá) + Thuy2k (mua hàng, kho) + người làm POS; biên bản ở `docs/audits/`.
