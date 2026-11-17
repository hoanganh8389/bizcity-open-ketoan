# PHASE-037 · 20 — Nghiệp vụ: đầu vào, tách combo, bán ra, quà tặng, giá vốn và thuế
<!-- [2026-11-17 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-037 — W0: bốn chiều tách riêng (vai trò dòng, sở hữu, cách tính giá trị, cách tính thuế), năm nguồn quà và ba công tắc, ca số minh hoạ 3+1 / sữa tặng xe / 12+1, ma trận theo bản chất, việc của kế toán -->

> Tài liệu nghiệp vụ và **ca số minh hoạ**, không thay ý kiến của kế toán trưởng. **Mọi số tiền là giả định** để làm ca kiểm, không phải giá thật của sản phẩm nào. Văn bản pháp luật chỉ được dẫn ở mức đã có trong [danh mục văn bản](../../can-cu/01-danh-muc-van-ban.md); phần chưa rà ghi rõ *chưa rà*.

## 1. Một cờ `isGift` không kết luận được kế toán

Một dòng giá 0 có thể là sáu sự việc khác nhau:

| # | Sự việc | Nguồn quà | Điều phải xác định |
|---|---|---|---|
| 1 | Nhà cung cấp bán 3 tặng 1 (cùng mặt hàng) | Hàng nhà cung cấp tặng kèm mua | Giá trị của 4 lon phân bổ thế nào — **không** mặc định lon tặng giá vốn 0 |
| 2 | Nhà cung cấp tặng xe kèm mua sữa (khác mặt hàng) | Hàng nhà cung cấp tặng kèm mua | Xe có `item_id` riêng; ghi nhận riêng theo giá trị hợp lý hay không |
| 3 | Nhà cung cấp giao quà để công ty phát cho khách, công ty sở hữu | Quà nhà cung cấp cho người tiêu dùng | Có định giá không; có được bán không |
| 4 | Nhà cung cấp gửi quà, công ty chỉ giữ hộ | Quà nhà cung cấp gửi giữ hộ | Không phải hàng mua, không phải tài sản của công ty |
| 5 | Công ty bán 3 tặng 1 cho khách | Quà công ty tự đặt (hoặc áp theo nguồn ở 1, 3) | Bán có điều kiện mua: doanh thu, giá vốn, hoá đơn khác biếu tặng |
| 6 | Công ty biếu tặng không kèm điều kiện mua | Quà công ty tự đặt | Chi phí bán hàng; hoá đơn và thuế riêng |

Vì vậy **mỗi dòng mang bốn chiều tách riêng** (R-COMBO-6):

| Chiều | Trường | Giá trị (tên trên màn) |
|---|---|---|
| Vai trò dòng | `commercialRole` | `mua` Hàng mua · `tang` Hàng tặng · `tang_tuy_chon` Quà chọn thêm · `bao_bi` Bao bì đi kèm |
| Sở hữu | `ownership` | `so_huu` Của công ty · `giu_ho` Giữ hộ · `cho_xac_dinh` Chờ xác định |
| Cách tính giá trị | `valueTreatmentRef` | trỏ bản chính sách (phân bổ theo lượng / theo giá trị hợp lý / không định giá) |
| Cách tính thuế | `taxTreatmentRef` + `taxDecision` | trỏ bản quy định tại ngày; kết quả *có · không · chờ* lưu trên dòng |

Nguồn quà là thuộc tính của **dòng nhận / phân bổ nguồn**, không phải nhóm vĩnh viễn của mặt hàng: cùng một `item_id` hôm nay là hàng mua, mai là quà.

## 2. Năm nguồn quà và ba công tắc

Bảng đầy đủ ở [RULE-COMBO](../../rules/RULE-COMBO.md) §Nguồn quà. Ba câu hỏi cho mỗi nguồn — **cấu hình bằng chính sách có phiên bản `core.combo.gift_treatment@1`**, không bằng cờ trên kho:

| Công tắc | Bật nghĩa là | Tắt nghĩa là |
|---|---|---|
| **Định giá** | Dòng nhận có giá trị (theo cách phân bổ đã chọn), tham gia giá vốn | Lượng vào kho, giá trị 0, không tham gia đơn giá bình quân (như `exclude_cost` hôm nay) |
| **Ghi tồn của công ty** | Lượng nằm trong tồn kho của công ty, lên nhập – xuất – tồn | Theo dõi ngoài tồn sở hữu (phân kho giữ hộ); không lên giá trị hàng tồn kho |
| **Lên thuế** | Dòng xuất quà được xét hoá đơn / tờ khai theo quy định tại ngày | Không tự xét; phải có căn cứ ghi kèm — hệ thống hiện rõ trên báo cáo kiểm soát |

Mặc định cho quà giữ hộ: **tắt · tắt · tắt**. Màn *Nguồn quà & cách xử lý* (Thuy2k dựng, S037-8) cho đơn vị đổi từng công tắc, mỗi lần đổi là một bản mới có ngày hiệu lực, căn cứ, người quyết định; kỳ đã khoá không tính lại.

### 2a. Chính sách `core.combo.gift_treatment@1` — chi tiết (chủ dự án duyệt 2026-11-17, CANON §0.11)
<!-- [2026-11-17 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-037 — điểm 5: ba công tắc là chính sách có phiên bản theo nguồn quà; khuôn luật, thứ tự ưu tiên, mặc định, màn cấu hình -->

**Một dòng chính sách** (một bản có thể có nhiều dòng):

| Ô | Bắt buộc | Nghĩa |
|---|---|---|
| `nguonQua` | có | một trong năm nguồn quà |
| `loaiPhanKho[]`, `nhaCungCap[]`, `combo[]` | không | thu hẹp phạm vi; bỏ trống = mọi |
| `dinhGia` | có | `true` / `false` |
| `cachDinhGia` | khi `dinhGia = true` | `chia_deu_theo_luong` · `theo_gia_tri_hop_ly` |
| `ghiTon` | có | `true` = trong tồn kho của công ty · `false` = theo dõi ngoài tồn sở hữu |
| `lenThue` | có | `co` · `khong` · `cho` (chờ căn cứ — nhắc, không tự kết luận) |
| `canCu` | có, **riêng cho từng công tắc** | khoá trong danh mục văn bản hoặc `NOI-BO` kèm lý do |
| `hieuLucTu` | có | ngày hiệu lực của bản (đổi = bản mới, bản trước đóng ở ngày − 1) |

**Thứ tự ưu tiên khi nhiều dòng cùng khớp** (cụ thể nhất thắng, tất định):
1. khớp `combo` → 2. khớp `nhaCungCap` → 3. khớp `loaiPhanKho` → 4. chỉ khớp `nguonQua`. Cùng mức mà khác kết quả → lỗi lúc **phát hành** (không đợi tới lúc ghi chứng từ).

**Ràng buộc chéo** (kiểm lúc phát hành): `ghiTon = false` ⇒ `dinhGia = false` (hàng không thuộc tồn của công ty thì không có giá vốn); `nguonQua = qua_ncc_giu_ho` mà `ghiTon = true` ⇒ phải có căn cứ chuyển quyền sở hữu; `lenThue = khong` ⇒ `canCu` không được là `NOI-BO` trống lý do.

**Chưa có chính sách nào** (đơn vị mới) → dùng **bản mặc định smallwin** do Core cài sẵn, đúng bảng *Mặc định* ở [RULE-COMBO](../../rules/RULE-COMBO.md) §Nguồn quà — giữ nguyên cách tính hôm nay, nên cài xong luồng chạy ngay.

**Áp vào dòng:** lúc ghi chứng từ, Core tính kết quả theo `docDate` và **lưu lên dòng thực hiện**: `{ dinhGia, cachDinhGia, ghiTon, lenThue, policyRef { key, version, hash } }`. Đọc lại không phải tính lại; đổi chính sách sau không đổi dòng cũ.

**Màn *Nguồn quà & cách xử lý*** (Thủy dựng; người dùng là kế toán quản trị):
- năm hàng (năm nguồn quà, tên tiếng Việt), mỗi hàng ba công tắc + ô căn cứ cạnh từng công tắc + ngày hiệu lực;
- nút *Thêm ngoại lệ* (thu hẹp theo nhà cung cấp / combo / loại phân kho);
- *Xem trước*: đổi công tắc thì bao nhiêu dòng chưa khoá kỳ, giá trị tồn đổi bao nhiêu — trước khi phát hành;
- dòng thời gian các bản; không có nút sửa bản đã phát hành;
- quyền riêng để phát hành (phân quyền, không mã hoá theo chức danh — ADR-0020).

**Trong hợp đồng với nhà cung cấp, quà thuộc ai?** (Q037-1) — kế toán / người mua hàng **khai ngay trong chính sách mua** (mặt mua của combo chọn nguồn quà mặc định). Chính sách bán được quyền *áp dụng theo* hoặc *tự điều chỉnh* ([25](25-KE-THUA-DAU-VAO-DAU-RA.md)).

## 3. Ca vàng: nhà cung cấp bán 3 lon, tặng 1 lon (cùng mặt hàng)

**Giả định:** `I-MILK800`; đơn mua 3 lon, tổng trước thuế 300.000 đ; nhận 4 lon cùng lô; không chi phí mua thêm; không tồn đầu.

| Dòng | Lượng | Tiền trên hoá đơn NCC | Vai trò · nguồn |
|---|---:|---:|---|
| `PN-001:L1` | 3 | 300.000 | Hàng mua |
| `PN-001:L2` | 1 | 0 | Hàng tặng · Hàng nhà cung cấp tặng kèm mua |
| **Nhận thực** | **4** | **300.000** | cùng `combo_instance`, cùng `item_id` |

Với chính sách *định giá, phân bổ đều theo lượng*: giá nhập bình quân = 300.000 / 4 = **75.000 đ / lon**. Dòng tặng 0 đ trên hoá đơn **không** có nghĩa một lon có giá vốn 0.

- Tách bộ sau nhận → vẫn 4 lon `I-MILK800`.
- Bán rời 1 lon → giá vốn 75.000 (đúng trong giả định này; số thật theo phương pháp tính giá đang hiệu lực).
- Kiểm: sau nhận Q = 4, V = 300.000; sau một lần xuất Q = 3, V = 225.000; vẫn truy được phiếu nhận và dòng tặng.
- Nếu nguồn là *Quà nhà cung cấp cho người tiêu dùng* với công tắc **định giá tắt** (cách hôm nay): 3 lon × 100.000, 1 lon giá trị 0, V vẫn = 300.000. Hai chính sách cho hai dãy số khác nhau — **cả hai bảo toàn tổng giá trị**; khác nhau ở căn cứ và ở chỗ ghi rõ dòng nào.

## 4. Ca vàng: mua 4 lon sữa 800 g, tặng 1 xe chòi chân

Chương trình minh hoạ: *mua 4 lon 800 g **hoặc** 3 lon 1,6 kg thì được tặng xe*. `I-MILK800`, `I-MILK1600`, `I-RIDEON` là **ba mặt hàng riêng**. Một `combo_id`, mặt mua có hai nhóm lựa chọn (`option_group`), quà là `I-RIDEON`.

**Giả định giá:** trả 1.200.000 đ (trước thuế) cho 4 lon 800 g, nhận 1 xe; giá trị hợp lý tham chiếu: 4 lon = 1.200.000, xe = 300.000. *Nếu* chính sách chọn phân bổ theo giá trị hợp lý tương đối:

```text
Tổng giá trị hợp lý = 1.200.000 + 300.000 = 1.500.000
Sữa = 1.200.000 × 1.200.000 / 1.500.000 = 960.000   (240.000 / lon)
Xe  = 1.200.000 ×   300.000 / 1.500.000 = 240.000
Tổng sau phân bổ    = 1.200.000
```

**Đây là vectơ kiểm phương pháp phân bổ**, không khẳng định mọi trường hợp phải dùng công thức này; cách đo cụ thể do kế toán trưởng chọn theo bản chất hợp đồng (Q037-2). Thuế GTGT đầu vào theo hoá đơn nhà cung cấp; **không** lấy phân bổ nội bộ để sửa hoá đơn của nhà cung cấp.

Tồn: `I-MILK800` +4, `I-RIDEON` +1. Tách combo để bán sữa riêng: vẫn 4 sữa và 1 xe; không tự ghi doanh thu, không tự tặng xe. Xe giao hộ nhà cung cấp → nguồn *giữ hộ*, không dùng ví dụ định giá trên.

## 5. Ca vàng: 12 tặng 1 và 3 tặng 1 cùng ngày, cùng mặt hàng

- `C12P1@v1` nhận 12 + 1; `C3P1@v2` nhận 3 + 1: cùng `item_id`, **hai lần thực hiện, hai nguồn nhận**.
- Kho có thể chung một phân kho hoặc chuyển phần quà sang phân kho khuyến mại; **không cộng chéo** hạn mức quà giữa hai nguồn.
- Xuất một lon: biết lô nào, nguồn nào, tại ngày nào; không biết thì nhắc, không tự coi là quà giá 0.
- Quét mã vạch của lốc: một lần thực hiện; gửi lại không nhập trùng.

## 6. Phân kho và quyền dùng

| Tình huống | Phân kho · sở hữu | Được làm gì | Kế toán / thuế |
|---|---|---|---|
| Hàng của công ty, bán được | `KHH` | bán / tặng theo chính sách | theo giao dịch, không theo kho |
| Hàng của công ty, để dành tặng | `KKM`, hoặc chung `KHH` với ràng buộc *chỉ để tặng* trên nguồn | phát theo chương trình; muốn bán cần *đổi mục đích dùng* | giá trị tồn vẫn xác định đúng; không mặc định 0 |
| Quà nhà cung cấp gửi giữ hộ | `KNB`, sở hữu *giữ hộ* | phát hộ / hoàn trả theo hợp đồng | không ghi tồn của công ty, không tính giá vốn (mặc định; đổi bằng chính sách) |
| Hàng nhận chưa đủ chứng từ | `KCC` | chờ | sở hữu *chờ xác định* tới khi có căn cứ |
| Cách ly / cận hạn / hết hạn | `KCL` / `KHHAN` / `KHHSD` | theo kiểm chất lượng, FEFO | theo chính sách xử lý; `item_id` không đổi |

Phân kho không phải "kho ngoài sổ thuế", không phải chỗ giấu doanh thu.

## 7. Ma trận theo bản chất

| Luồng | Nguyên tắc hạch toán | Thuế / hoá đơn |
|---|---|---|
| **Nhập mua có hàng nhận thêm** | Căn cứ hợp đồng, hoá đơn, sở hữu, chế độ kế toán; Σ giá trị phân bổ = số phải trả (`CT-COMBO-004`) | Giữ nguyên thuế trên chứng từ gốc; đối chiếu hoá đơn nhà cung cấp |
| **Bán kèm quà có điều kiện mua** | Xét phân bổ số tiền thu được cho cả hàng bán và hàng khuyến mại; giá trị hàng khuyến mại vào giá vốn (TT 99/2025 — *chi tiết chờ kế toán trưởng rà, Q037-2*) | Theo quy định hiệu lực tại ngày, hồ sơ chương trình, người bán thực tế |
| **Tặng độc lập** | Trị giá xuất có thể vào chi phí bán hàng (khác bán kèm tặng) | Không tự áp giá tính thuế 0; cần quy định tại ngày và chứng cứ |
| **Phát hộ quà nhà cung cấp** | Xác định sở hữu, nghĩa vụ, phí; có thể theo dõi ngoài tài sản | Ai lập hoá đơn, ai tổ chức chương trình là điều phải xác nhận (Q037-4) |
| **Bán rời từ combo đã nhập** | Doanh thu bán thật + giá vốn của chính `item_id` / lớp gốc | Bán hàng thông thường; **không** "kế thừa" thuế 0 vì nhà cung cấp từng tặng |
| **Đổi phân kho, tách bộ** | Chỉ đổi vị trí / trạng thái; giá trị bảo toàn | Không phải bán / tặng / hoá đơn |
| **Trả hàng** | Hoàn theo dòng / lớp gốc; đảo – điều chỉnh, không sửa sổ | Chứng từ điều chỉnh, kê khai theo kỳ |

**Không ghim tài khoản trong Combo Contract.** Bút toán đi `reasonCode → luật định khoản → AccountResolver` như mọi nghiệp vụ.

## 8. Căn cứ và phiên bản quy định

| Văn bản | Trong danh mục văn bản? | Dùng cho |
|---|---|---|
| Thông tư 99/2025/TT-BTC | có | hàng tồn kho nhận thêm; khuyến mại có / không điều kiện; phân bổ doanh thu — *điều khoản cụ thể chưa đối chiếu* |
| Nghị định 181/2025/NĐ-CP, Luật Thuế GTGT 48/2024 | có | giá tính thuế hàng khuyến mại — *điều kiện áp dụng chưa đối chiếu* |
| Nghị định 123/2020/NĐ-CP, 70/2025/NĐ-CP | có | hoá đơn cho hàng tặng, khuyến mại |
| Nghị định 81/2018/NĐ-CP và các văn bản sửa đổi (khuyến mại: hình thức, hạn mức, thủ tục) | **chưa** — việc S037-34, Q037-8 | điều kiện chương trình |

Cho tới khi văn bản được rà và vào danh mục, mã `IN-COMBO-*` liên quan ghi `basis: NOI-BO` (R-GATE-11) và Core **không tự kết luận** thuế.

Trường tối thiểu của một bản quy định thuế cho khuyến mại: `effectiveFrom/To`, `legalRef`, `promotionForm` (kèm mua · không điều kiện · nhà cung cấp tài trợ), `organizerRole`, `ownership`, `invoiceTreatment`, `vatBaseMethod`, `evidenceRequired`, `decidedBy`, `version`, `contentHash`.

## 9. Việc của kế toán (theo ADR-0020: người dùng quyết định, Core chỉ đúng chỗ)

1. Nhận đơn mua / phiếu nhận / hoá đơn: hệ thống đề xuất mặt hàng, vai trò dòng, combo, lô, nguồn quà.
2. Xem trước **lượng thực, phân kho, cách tính giá trị, bút toán dự kiến**, kèm căn cứ.
3. Thiếu căn cứ → hệ thống **nhắc** kèm chỗ sửa; chứng từ vẫn ghi được (trừ sáu lỗi toàn vẹn). Đơn vị muốn chặt hơn thì bật ở cấu hình.
4. Khi bán / tặng lại: dùng chính sách đầu ra; hệ thống đối chiếu nguồn, lô, giá vốn, thuế; không dùng lại kết luận của đầu vào.
5. Trước khoá sổ: danh sách combo còn dòng chưa có quyết định sở hữu / giá trị / thuế (`CT-COMBO-006`); giải trình hoặc xử lý.

## 10. Truy vết phải trả lời được

Với một lon sữa bất kỳ đã bán: `item_id` gì; mã cũ / hiện hành; phiếu nhận nào; nhà cung cấp nào; lần thực hiện combo nào; lô và phân kho nào; giá vốn phân bổ từ đâu; bút toán nào; bán hay tặng theo chính sách nào; hoá đơn / tờ khai kỳ nào; có điều chỉnh / đảo nào sau đó. Thiếu khâu nào thì hiện **độ phủ** và lời nhắc, không tuyên bố truy vết 100 %.
