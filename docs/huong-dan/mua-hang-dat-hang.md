# Phân tích đặt hàng (MH02) và đơn đặt mua

Luồng chuẩn: **Tồn max (MH16) → Phân tích đặt hàng (MH02) → Đơn đặt gửi NCC (mẫu Excel) → Phiếu nhập kho (lập từ đơn) → Trả tiền NCC.**

## 0. Phân tích đặt hàng — SL cần nhập theo công thức của chi nhánh cha

1. Chọn **Chi nhánh cha** (nơi mua hàng về rồi chia xuống shop). Bảng tính cho mọi mã có tồn max / tồn / bán / đơn đang về trong cây chi nhánh đó.
2. Bảng nhóm theo **Nhãn │ Mã NCC – Tên NCC** (dòng đỏ), mỗi mã một dòng, các cột tô màu quen dùng:

| Cột | Nghĩa |
|---|---|
| **SL cần nhập** (cam) | Theo công thức (MH18). Số âm (trong ngoặc) = đang dư. **Bấm vào số** để xem từng thành phần cộng / trừ ra sao. |
| BH tháng liền kề | Bán tháng trước của mọi shop — chỉ tham khảo |
| Doanh số N ngày | Bán N ngày gần nhất của mọi shop — phần dự phòng |
| Tồn max kho · **Tồn kho** (vàng) | Max và tồn của các kho chi nhánh cha chọn ở công thức |
| Hàng đang đi đường | Đã xuất nhưng nơi nhận chưa xác nhận (về kho + xuống shop; rê chuột xem tách) |
| **SL mua chưa nhập kho** (xanh) | Phần chưa về của mọi đơn đặt đang mở, **mọi NCC** — trừ để không đặt trùng (rê chuột xem từng đơn) |
| Tồn max shop · Tồn shop | Tổng max và tồn của mọi shop con |
| SL đặt | Gợi ý làm tròn theo thùng; bấm một trong hai số (làm tròn xuống / lên, vd **30 / 36**) hoặc gõ số |

   - **NCC của mã** chọn theo: mã đã từng nhập → NCC **lần nhập gần nhất**; chưa nhập lần nào → NCC có **bảng giá đang hiệu lực mới nhất** (hồ sơ NCC → Mặt hàng & giá mua). Cột *NCC chọn theo* ghi rõ nguồn và mã có mấy NCC khai bán ("· 2 NCC").
   - Mọi cột số lượng theo **ĐVT nhỏ nhất** (cột *ĐVT*); *Quy cách* cho biết 1 thùng bao nhiêu, lập đơn đúng bội số thùng thì dòng ghi theo Thùng.
   - **Họ mã:** theo ô **Mã hàng cha** của mặt hàng (tự quét theo mã: đuôi Z, Q, K, M, B… — hoặc chọn tay) — mã con — bảng chỉ hiện **mã cha**, mọi số (tồn, max, bán, đi đường, đơn đang đặt, SL cần nhập) đã **cộng dồn cả họ**; dưới tên mã cha ghi từng mã con: kho · shop · bán · đang đặt. Hàng tặng / kẹp quà còn nhiều thì mã cha không bị đề xuất nhập thêm. Ô tìm gõ mã con cũng ra mã cha. Mã đuôi **T (có tem)** đặt riêng với NCC nên **không gộp** — dòng riêng, đứng cạnh mã gốc. Mỗi mã con ghi đủ: kho · shop · max kho · max shop · đi đường · chưa về · bán · tháng trước. Lập đơn đặt: dòng mã cha mang theo danh sách mã con.
   - **Số liệu tồn lưu theo lúc đặt:** đơn đặt lưu số liệu phân tích (cần nhập, tồn, max, đi đường, bán, họ mã) của từng dòng **lúc lập / lưu đơn** — dòng thêm tay hay điền từ NCC hiện **ngay** bảng *Phân tích thông minh* (SL cần nhập, tồn kho, chưa nhập kho, bán tháng trước, doanh số 1 tuần, max kho, đi đường, max shop, tồn shop + họ mã). Mở lại đơn vẫn là số lúc đặt (như thuế). Phiếu nhập lập từ đơn lấy lại **thuế suất theo mặt hàng lúc nhập kho** rồi lưu vào phiếu.
3. Ô màu trên cùng lọc nhanh: **Mã cần nhập**, **Mã đang dư**, **Đang có đơn chưa về**, **Chưa rõ NCC** (mã chưa nhập lần nào, chưa khai NCC bán — khai ở hồ sơ NCC → Mặt hàng & giá mua).
4. Tích các mã cần đặt → **Lập đơn đặt**: mỗi NCC một đơn nháp; dòng mang sẵn quy cách, ghi chú mặt hàng NCC, mã / tên hàng bên NCC và số liệu tồn (in trên đơn gửi NCC). Đặt đúng bội số thùng thì dòng ghi theo Thùng.
5. Mở đơn vừa lập: thêm **Ngân sách mua** (còn / vượt bao nhiêu), **Ngày giao**, **Giao tại kho**, ghi chú từng dòng, **dòng hàng mới chưa có mã** → **Xem mẫu đơn gửi NCC** / **Xuất Excel mẫu NCC** (đúng mẫu NCC nhận: cột cần nhập nền cam, tồn kho nền vàng, phân tích thông minh, tổng trị giá).

**Hàng mới chưa có mã:** trong đơn bấm **+ Hàng mới chưa có mã** → ghi tên theo NCC, mã bên NCC, ĐVT, quy cách. Đơn vẫn lưu / gửi NCC được. Hàng về: lập phiếu nhập từ đơn → dòng hàng mới hiện **Hàng mới — gắn mã** → chọn mã vừa tạo ở Danh mục mặt hàng (bắt buộc trước khi duyệt phiếu nhập); lưu phiếu nhập thì mã được **ghi ngược vào đơn đặt**.

**NCC giao thừa / thiếu:** phiếu nhập ghi đúng số thực nhận; đơn theo dõi tiến độ còn bao nhiêu chưa về (mục 3).

## 1. Lập đơn đặt hàng — bốn cách

| Cách | Khi nào | Làm |
|---|---|---|
| **Phân tích đặt hàng** (tự động) | Hàng đã có tồn max | Mục 0 ở trên: tích mã → **Lập đơn đặt** (mỗi NCC một đơn) |
| **Điền mặt hàng của NCC** (bán tự động) | NCC đã có danh mục mặt hàng / đã từng mua | Trong đơn: nút **Điền mặt hàng của NCC** → bảng mọi mã của NCC, kèm lần mua gần nhất; bấm *Điền SL lần mua trước* hoặc gõ số; ĐVT tự chọn theo ĐVT NCC hay giao (đổi được, giá quy đổi theo); đơn giá tự lấy giá cố định / lần gần nhất → **Thêm vào phiếu** |
| **Nhập từ Excel** | Đơn nhiều dòng, đã có bảng (file của NCC, file xuất phiếu nhập) | Màn Chứng từ mua hàng (hoặc hồ sơ NCC) → **Nhập từ Excel** |
| Gõ tay | Đơn ít dòng | **+ Thêm chứng từ → Đơn đặt hàng** (hoặc nút ở hồ sơ NCC) |

**Khai tồn max:** màn **Tồn max (MH16)** (hàng loạt, có gợi ý), hoặc Danh mục mặt hàng → mở mã → thẻ *Mua hàng* → **+ Thêm tồn max** — tính theo ĐVT nhỏ nhất.

## 2. Nhập từ Excel

1. Chọn **Tạo thành**: đơn đặt hàng, hoặc phiếu nhập kho (gom theo số hoá đơn).
2. Chọn **đơn giá trong tệp là** giá chưa thuế / gồm thuế; NCC và chi nhánh mặc định (khi tệp không có cột).
3. Xem bảng **Hướng dẫn các cột** (bắt buộc: Mã hàng, Số lượng; cột nào nghĩa là gì, tên khác được nhận, ví dụ) — bấm **Tải file mẫu** nếu cần. Kéo thả tệp. Phần mềm **tự nhận cột theo tên tiêu đề**: Mã NCC, Mã hàng, Tên hàng, ĐVT, Số lượng, Đơn giá, CK(%), Số HĐ, LOTNO, EXPDATE, Chi nhánh, Ngày, Ghi chú — đúng dạng file xuất phiếu nhập (ví dụ *VD1 Vinh Châu*). Tệp nhiều sheet: lấy sheet có cột "Mã hàng".
4. Xem trước: tên theo danh mục, mã chưa có trong danh mục (vàng), dòng lỗi (đỏ, bỏ qua), **dòng giá 0 = hàng tặng**.
5. **Tạo phiếu nháp** — mỗi NCC × chi nhánh (× số HĐ nếu là phiếu nhập) một phiếu; kiểm lại rồi duyệt.

## 3. Đơn đặt → phiếu nhập kho

- Mở đơn đã duyệt: cột phải **Tiến độ giao hàng** (đặt / đã nhận / còn từng mã, các phiếu nhập đã giao) → **Lập phiếu nhập kho từ đơn**: chép mã, ĐVT, **phần còn lại**, đơn giá, CK, thuế suất; hàng tặng chia theo tỷ lệ. Chỉ cần thêm số HĐ, lô, hạn dùng, ngày nhận đủ hồ sơ.
- NCC giao nhiều lần: mỗi lần lập lại từ đơn — chỉ còn phần chưa giao; đối chiếu đơn ↔ phiếu ↔ hoá đơn tính theo phần còn lại. Giao đủ thì đơn tự ghi **Đủ** (cột *Đơn: đã nhận* ở danh sách chứng từ).
- Cũng lập được từ hồ sơ NCC → *Tổng quan* → **Lập phiếu nhập** ở đơn đang chờ giao.

## 4. Mã hàng và hàng tặng (quy tắc mã hàng)

Phần mềm **tự nhận loại hàng từ mã** — không phải chọn "loại dòng":

| Mã | Nghĩa | Phần mềm |
|---|---|---|
| 9 ký tự (ngành 2 + nhãn 3 + nhóm 1 + số 3) | Hàng thường | Hàng mua |
| + **K** | Hàng chia giá | Hàng tặng chia vào giá vốn |
| + **M** | Hàng khuyến mại (0 đồng) | Quà cho người tiêu dùng, giá 0 |
| + **Q** | Hàng kẹp quà | Nhãn "Kẹp quà" (không tách; tách quà cần được duyệt) |
| + **T** | Hàng có tem | Nhãn "Có tem" |
| Nhóm **8** | Combo | Nhãn "Combo" (phá combo phải có chứng từ và được duyệt) |
| **Q** + nhãn + nhóm + số (4) | Quà khuyến mại | Quà, giá 0 |

- **Dòng đơn giá 0 = hàng tặng.** Mặc định **chia vào giá vốn** (hàng chia giá); NCC có chính sách khuyến mại cho người tiêu dùng thì theo chính sách; bỏ tích **chia vào giá vốn** nếu là quà cho khách.
- **Không nhập đổi mã:** phiếu nhập theo đơn mà dùng mã khác mã đã đặt (ví dụ đặt mã thường, nhập mã Q) → **chặn duyệt**, người có quyền **Duyệt ngoại lệ** và ghi lý do.
