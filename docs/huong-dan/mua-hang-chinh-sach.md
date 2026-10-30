# Chính sách mua hàng (MH04)

> Số liệu là **số liệu thật** của đơn vị: phiếu mua **duyệt là ghi sổ** (bút toán, công nợ, kho). Ở bản thử muốn có sẵn 25 tình huống để tập: màn **Tổng quan mua hàng (MH00)** → **Nạp dữ liệu mẫu** (xoá được bằng **Xoá dữ liệu mẫu**).

Mọi điều kiện mua hàng khai ở **một nơi**. Mỗi chính sách gồm:

| Phần | Nghĩa |
|---|---|
| Loại | CK thương mại trên đơn · **CK theo mã hàng (bảng nhiều mã)** · bậc số lượng · CKTT · KM mua X tặng Y · thưởng doanh số theo kỳ · chỉ tiêu nhãn · thưởng theo giai đoạn · hạn mức công nợ · điều khoản thanh toán · chỉ tiêu cung ứng (tồn max khai riêng ở màn **Tồn max MH16**) |
| Phạm vi | NCC, nhãn hàng, mã hàng, chi nhánh (trống = mọi) |
| Hiệu lực | Từ ngày – đến ngày; trạng thái Đang áp / Tắt. **Phiếu áp chính sách theo NGÀY CHỨNG TỪ ghi trên phiếu**, không theo ngày bấm (xem mục *Chương trình theo giai đoạn*) |
| Ưu tiên | Khi hai chính sách cùng phạm vi |
| Nội dung | Ô nhập theo từng loại: % chiết khấu, bảng bậc số lượng, mua X tặng Y, hạn mức và phần chia cho chi nhánh… — dưới form có câu tóm tắt để kiểm lại |

**Bảng tổng:** STT, NCC (nút ⓘ xem thông tin NCC), loại, nội dung, hiệu lực, trạng thái, người tạo / ngày giờ tạo, người sửa / ngày giờ sửa và cột **Thay đổi gần nhất (đổi gì)** — ví dụ "Sửa bởi Kế toán 24/10 10:15: Nội dung: Hạn mức 600 triệu → 700 triệu". Mở một chính sách: cuối form có **Lịch sử thay đổi** đầy đủ.

**Thêm chính sách nhanh:**
1. Chọn **Loại** — dưới ô có một câu giải thích loại đó dùng khi nào.
2. Chọn phạm vi (NCC, nhãn, mã hàng, chi nhánh) — để trống là áp cho tất cả.
3. Bấm một **Mẫu nhanh** (ví dụ *CK 7% trên đơn*, *10 ngày làm việc từ ngày HĐ*, *Mua 10 tặng 1*) rồi sửa lại số.
4. Đọc dòng **Phần mềm sẽ hiểu là…** để kiểm lại.
5. **Mã** và **Tên** tự đặt theo loại + phạm vi + nội dung (ví dụ `CK-ANLENE`, *Chiết khấu 7% trên tổng đơn — Công ty Trung Hậu*); gõ đè nếu muốn. Hiệu lực mặc định từ đầu tháng này.

## Chương trình theo giai đoạn — áp theo ngày chứng từ
Mọi chính sách (chiết khấu, bậc số lượng, khuyến mại, CKTT, hạn mức, điều khoản…) chọn theo **ngày chứng từ** ghi trên đơn / phiếu. Đơn mới tự điền ngày hôm nay, **sửa được**: nhập kho muộn cho hàng mua trong chương trình đã qua thì ghi đúng ngày chứng từ, phiếu tự lấy chương trình của ngày đó.

Ví dụ chương trình 2 giai đoạn của một nhãn:

| Sản phẩm | CKTM / thùng · Giai đoạn 1 (01/09–21/09) | Giai đoạn 2 (22/09–28/09) |
|---|---|---|
| Similac | 105.000 | 84.000 |

Cách khai: tạo **hai chính sách Chiết khấu theo mã hàng**, mỗi giai đoạn một chính sách:
- Chính sách 1: hiệu lực 01/09–21/09, dòng mã Similac ghi *Giảm tiền / ĐVT* 105.000, ĐVT **Thùng**.
- Chính sách 2: hiệu lực 22/09–28/09, cùng mã ghi 84.000 / Thùng.

Chiết khấu theo % (vd 2,5% giai đoạn 1, 1% giai đoạn 2) khai giống vậy ở cột **% CK**. Chương trình cho cả nhãn thì dùng **CK thương mại trên đơn** với phạm vi nhãn hàng.

Kết quả theo ngày chứng từ:
- Đơn ngày 10/09, 2 thùng: giảm 210.000.
- Cùng ngày nhưng phiếu ghi 96 Hộp (1 thùng = 48 hộp): vẫn giảm 210.000, vì phần mềm tự quy đổi theo tỉ lệ ĐVT.
- Đơn ngày 25/09: giảm 84.000 × 2 = 168.000.
- Ngoài hai giai đoạn: không giảm.

## Chiết khấu thương mại trên đơn — điều kiện áp

- **Theo %** hoặc **Số tiền cố định** trên tổng đơn.
- **Áp khi tổng đơn từ**: đơn đạt mức này mới tự áp. Để trống: CK % áp mọi đơn; CK số tiền chỉ áp khi tiền hàng lớn hơn số CK (đơn 1 lon 528.000 không bị trừ 2 triệu).
- Chưa đủ điều kiện → phiếu không tự áp, bảng khuyến mại gợi ý "mua thêm …". Trên từng phiếu vẫn bỏ tích được (cột **Áp** ở bảng khuyến mại của phiếu).

## Cách áp: ☑ Áp riêng, ☑ Cộng dồn

Form chương trình chiết khấu / khuyến mại có khối **Cách áp** với hai ô tích:

**☑ Áp riêng** (CK theo mã, bậc số lượng, CK trên đơn, mua X tặng Y)

- Tích: mã hàng nhận chương trình này thì **không nhận chương trình nào khác**; mã khác vẫn áp bình thường. Ví dụ CK 7% riêng mã A tích "Áp riêng" + CK 2% chung → mã A chỉ 7%, mã B được 2%.
- Bỏ tích (mặc định) = **áp đồng thời**: cộng với các chương trình khác (mã A được cả 7% và 2%).
- Hai chương trình áp riêng cùng khớp một mã: lấy chương trình **ưu tiên** cao hơn; bằng nhau thì lấy chương trình **lợi hơn** (giảm nhiều tiền hơn / quà giá trị hơn).

**☑ Cộng dồn** — đủ điều kiện mấy lần thì hưởng mấy lần

- **Mua X tặng Y** (mặc định tích): mua 2 tặng 1 → mua 4 tặng 2, mua 5 tặng 2. Bỏ tích → mua bao nhiêu cũng chỉ tặng 1 lần.
- **CK số tiền trên đơn có "Áp khi tổng đơn từ"** (mặc định bỏ tích): giảm 2 triệu khi đơn từ 50 triệu; tích → đơn 100 triệu giảm 4 triệu, 160 triệu giảm 6 triệu; bỏ tích → chỉ giảm 2 triệu.
- CK theo %, bậc số lượng, CK theo mã: không có ô này (vốn tính theo tiền / từng ĐVT — mua nhiều thì tự giảm nhiều).

## Mua X tặng Y: bảng mua – tặng theo ĐVT

Một chính sách "Khuyến mại mua X tặng Y" là **một bảng nhiều dòng**, mỗi dòng:

| Cột | Ý nghĩa |
|---|---|
| Mua mã · SL mua · ĐVT mua | Mua đủ bấy nhiêu theo ĐVT này (Thùng / Lốc / Hộp… — ĐVT đã khai ở danh mục mặt hàng) |
| Tặng mã · SL tặng · ĐVT tặng | Được tặng bấy nhiêu theo ĐVT này; trống mã = tặng chính mã mua |
| ☑ Cộng dồn | Đủ mấy lần tặng mấy lần (mua 1 Thùng tặng 2 Hộp → mua 3 Thùng tặng 6 Hộp); bỏ tích = chỉ tặng một lần |
| ☑ Áp riêng | Mã nhận dòng này thì không nhận chương trình chiết khấu / khuyến mại nào khác (kể cả các dòng khác của bảng) |
| Nghĩa là | Phần mềm đọc lại dòng thành câu, kèm quy đổi: "Mua 1 Thùng (= 48 Hộp) 140181006 → tặng 2 Hộp cùng mã · cộng dồn: mua 2 tặng 4" |

- **Quy về ĐVT nhỏ nhất khi tính**: chính sách ghi "mua 1 Thùng", phiếu ghi 12 Lốc hay 48 Hộp đều đủ; nhiều dòng phiếu cùng mã khác ĐVT được cộng lại.
- Một mã nhiều dòng (vd mua 1 Thùng tặng 2 Hộp; mua 5 Thùng tặng thêm 1 bình) thì các dòng **áp đồng thời**; muốn chỉ lấy dòng lợi nhất thì tích **Áp riêng** ở dòng đó.
- Thêm dòng: **Thêm dòng**, **Thêm nhiều mã từ danh mục…**, **Nhập Excel…** (có hướng dẫn cột và file mẫu: Mã hàng mua, SL mua, ĐVT mua, Mã hàng tặng, SL tặng, ĐVT tặng, Cộng dồn, Áp riêng, Ghi chú — mã / ĐVT chưa khai báo đỏ). **Xuất Excel** ra đúng bộ cột để sửa rồi nhập lại.
- Khi lưu, phần mềm kiểm mã và ĐVT có trong danh mục; sai thì báo đúng dòng.
- Trên phiếu: dòng quà tự thêm đúng **ĐVT tặng**; NCC giao quà ghi ĐVT khác (vd 1 Thùng quà thay vì 48 Hộp) vẫn quy đổi để so thiếu / thừa; nút "Sửa về …" đặt cả số lượng và ĐVT tặng.
- Chính sách cũ (một dòng "mua 10 tặng 1") vẫn chạy y nguyên; mở ra sửa thì tự chuyển thành bảng (ĐVT để "ĐVT trên phiếu" như cách tính cũ).

## Trên phiếu: phần mềm tự áp theo hàng chính trong bảng

- Chỉ **dòng hàng mua** quyết định khuyến mại; dòng quà (kể cả quà cùng mã) không tính là hàng mua, nên không bao giờ tặng chồng lên quà.
- Thêm / sửa số lượng hàng chính → chiết khấu, bậc, quà tự tính lại; quà tự thêm có chữ "tự", hàng chính bị xoá thì quà tự gỡ.
- **Bỏ tích** một chương trình trong bảng khuyến mại → CK / quà của nó gỡ ngay, sửa số lượng sau đó cũng không tự áp lại; **tích lại** → áp theo số lượng hàng chính lúc đó.
- Mã đang nhận chương trình áp riêng: các chương trình khác của mã đó nằm ở nhóm **Không áp (đang áp riêng)**, ô tích bị khoá; bỏ tích chương trình áp riêng thì các chương trình khác tự áp lại.
- Quà NCC giao thiếu / thừa: sửa số lượng dòng quà, phần mềm giữ nguyên và báo ở nhóm **Cần xem** (bấm "Sửa về …" nếu muốn theo đúng chương trình).
- Phiếu đã duyệt giữ nguyên số đã chốt dù sau đó sửa chương trình (đổi áp riêng / cộng dồn / tắt).

CK thanh toán đúng hạn và thưởng cuối kỳ không xét áp riêng / cộng dồn (tính lúc trả tiền / cuối kỳ).

## Danh sách chính sách: lọc và xem nhanh

- Lọc theo **NCC**, **loại**, **☑ Áp riêng / ☐ Áp đồng thời**, **☑ Cộng dồn / ☐ Chỉ một lần**, **trạng thái**.
- Cột **Áp riêng** và **Cộng dồn** hiện ô tích (chỉ để xem; sửa thì bấm đúp mở chính sách); "—" là loại không có lựa chọn đó.
- Nút **Xem ý nghĩa các loại**: bảng giải thích từng loại chính sách, loại nào có Áp riêng / Cộng dồn, số chính sách mỗi loại — bấm một loại để lọc theo loại đó. Chọn một loại ở ô lọc thì dòng giải thích của loại đó hiện ngay dưới.

## Chiết khấu theo mã hàng — một chính sách, hàng nghìn mã

Dùng khi NCC cho chiết khấu **riêng từng mã** (CTKM tháng, bảng giá ưu đãi…). Không phải tạo mỗi mã một chính sách.

1. Hồ sơ NCC → thẻ **Chiết khấu & khuyến mại** → **+ Chiết khấu theo mã hàng (bảng nhiều mã)**. Hoặc ở màn Chính sách chọn loại này.
2. Thêm mã vào bảng, theo một trong bốn cách:
   - **+ Thêm từ danh mục…**:
     - gõ tên / mã, **không cần dấu, gõ nhiều từ được** (ví dụ `sua tuoi 110`, `biomil 400`);
     - hoặc chọn **nhãn hàng** để liệt kê cả nhãn;
     - ghi trước **% (hoặc số tiền giảm)** ở chân hộp thoại;
     - **bấm vào dòng là thêm ngay** (↑ ↓ để chọn, Enter để thêm), hoặc **Thêm tất cả … mã đang hiện**;
     - thêm xong bấm **Xong**.
     Mã đã có trong bảng hiện mờ, không thêm trùng.
   - **Nhập Excel…**: xem bảng *Hướng dẫn các cột*, bấm **Tải file mẫu**, điền vào file, kéo thả lên → **xem trước** (mã chưa có trong danh mục, dòng thiếu %, dòng trùng tô đỏ và bị bỏ qua) → **Đưa … dòng hợp lệ vào bảng**. Tích "Thay toàn bộ bảng" nếu muốn nạp lại từ đầu.
   - **Dán nhiều dòng…**: copy từ Excel theo thứ tự *Mã hàng | % chiết khấu | Giảm tiền | ĐVT | SL tối thiểu | Ghi chú*.
   - **+ Thêm dòng**: gõ tay vài mã.
3. Mỗi dòng ghi **% chiết khấu** HOẶC **Giảm tiền / ĐVT**, không ghi cả hai. Gõ ô này thì ô kia tự xoá.
   - Ghi **ĐVT** cho số tiền giảm, ví dụ 105.000 / **Thùng**. Dòng phiếu theo ĐVT khác của mã đó (Lon, Hộp, Lốc) thì **tự quy đổi** theo tỉ lệ ĐVT: 1 thùng = 48 hộp, phiếu 96 Hộp vẫn giảm 210.000. SL tối thiểu cũng tính theo ĐVT ghi ở dòng.
   - Ghi **SL tối thiểu** thì mua từ số lượng đó mới được.
   - **Một mã ghi nhiều dòng khác SL tối thiểu = bậc chiết khấu theo số lượng của riêng mã đó.**
4. Sửa nhanh:
   - ô **Lọc dòng trong bảng** để lọc các dòng đã có. Không có dòng khớp thì bấm nút **Tìm "…" trong danh mục** ngay bên dưới để thêm;
   - ô "3% / 500" + **Áp cho …** để đặt cùng mức cho tất cả / các dòng đang lọc;
   - **Xoá dòng đang lọc**;
   - **Xuất Excel** để lấy cả bảng ra sửa rồi nhập lại.
5. Đặt **Hiệu lực** (ví dụ cả tháng 11) rồi **Ghi**.

Lập phiếu nhập / đơn đặt của NCC đó, dòng nào đúng mã thì **tự được chiết khấu**. Dòng đã gõ CK % tay thì giữ CK tay. Bảng *Chính sách tự áp* bên phải phiếu ghi rõ áp từ chính sách nào.

**Phiếu chọn chính sách thế nào:** phạm vi **hẹp nhất** thắng (mã hàng > nhãn > NCC > chung), rồi tới ưu tiên; ngoài thời hạn hoặc đã tắt thì bỏ qua.

**Ví dụ:** KM *mua 10 tặng 1, chia vào giá*: chọn loại *Khuyến mại mua X tặng Y*, nhập Mua 10, Tặng 1, Loại khuyến mại *KM cho người bán — chia vào giá*.

Bấm đúp một dòng để sửa; **+ Thêm chính sách** để tạo mới. Mỗi lần sửa ghi nhật ký (MH10).

**Loại hay dùng thêm:**

| Loại | Dùng để |
|---|---|
| **Theo dõi lô / hạn dùng** | Phạm vi theo nhãn hoặc mã hàng. Bắt buộc nhập số lô + hạn dùng khi nhập; không có thì không duyệt được |
| **Ngân sách quà tặng theo chương trình** | Mã chương trình + số tiền. Màn Quà tặng (MH09) theo dõi đã dùng / còn lại |

## Xem từng dòng ưu đãi

Muốn trải mỗi chính sách ra từng dòng ưu đãi (từng mã hàng, bậc, giai đoạn, chi nhánh) để thống kê, xuất Excel: dùng **Báo cáo chi tiết chính sách mua hàng (MH14)** — Báo cáo mua hàng → Chi tiết chính sách mua hàng, hoặc nút *Xem chi tiết từng dòng (MH14)* trên màn này.
