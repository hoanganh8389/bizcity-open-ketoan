# Báo cáo hợp đồng & chính sách mua hàng (MH32 · MH33 · MH34 · MH35)

Bốn báo cáo nằm trong nhóm **Hợp đồng & chính sách** ở trang Báo cáo (Mua hàng). Bộ lọc dùng chung:
- **Kỳ** (từ – đến).
- **Nhà cung cấp**.
- **Hợp đồng**: để trống là mọi hợp đồng; chọn *Không theo hợp đồng* để xem riêng phần ngoài hợp đồng; hoặc chọn một hợp đồng.

Hợp đồng xuyên suốt: phiếu theo hợp đồng X chỉ tính cho X; phần không theo hợp đồng tính riêng.

**Xem cùng bộ lọc**: dãy nút ở đầu mỗi báo cáo chuyển sang báo cáo kia, giữ nguyên kỳ / NCC / hợp đồng. Có thể đi theo vòng: thực hiện hợp đồng → chính sách → kết quả thực hiện → chênh lệch giá → công nợ theo hợp đồng (MH30). Bộ lọc nằm trên địa chỉ trang, nên gửi đường dẫn cho người khác là mở đúng bộ lọc đó.

## MH32 · Tình hình thực hiện chính sách mua hàng
Dùng khi đối soát định kỳ với NCC: được hưởng bao nhiêu, đã nhận bao nhiêu, còn phải nhận bao nhiêu.
- **Ô tổng** ở đầu trang: Dự kiến · Đã xác nhận · Đã nhận / đối trừ · Còn phải nhận.
- **Các mức của một khoản ưu đãi**:
  - **Dự kiến**: tạm tính theo doanh số hiện tại, chưa xác nhận. Gồm thưởng của kỳ chưa lập phiếu, và CKTT của phiếu chưa thanh toán (chỉ hưởng khi trả đúng hạn).
  - **Đã xác nhận**: số hai bên đã chốt. Gồm chiết khấu / tặng thể hiện trên hoá đơn, phiếu thưởng đã lập (số NCC chốt), và CKTT đã trừ khi trả tiền.
  - **Đã nhận / đối trừ**: đã trừ trên hoá đơn, đã trừ khi thanh toán, hoặc phiếu thưởng đã hạch toán (giảm công nợ).
  - **Còn phải nhận**: phần đã xác nhận nhưng chưa nhận / đối trừ.
  - Chiết khấu đã trừ thẳng trên hoá đơn tính là đã nhận ngay, **không cộng trùng** vào khoản NCC còn phải trả.
- Cột *Loại*, *Cách nhận* ẩn sẵn, bật lại ở nút **Cột**.
- **Theo nhà cung cấp · hợp đồng**: mỗi NCC / hợp đồng một dòng. Bấm một dòng thì bảng chính sách bên dưới chỉ còn nhóm đó.
- **Từng chính sách**:
  - **Doanh số đủ ĐK** — doanh số trước thuế của các phiếu được áp; với thưởng là doanh số kỳ tính thưởng.
  - **Được hưởng**, **Đã nhận**, **Còn phải nhận**, **Tình trạng**.
  - **Cách nhận**:
    - chiết khấu trên đơn / theo mã / bậc số lượng: trừ thẳng trên hoá đơn (nhận ngay);
    - CKTT: trừ khi thanh toán đúng hạn (đã nhận = đã trừ ở phiếu trả tiền);
    - thưởng doanh số / chỉ tiêu / giai đoạn: phiếu thưởng cuối kỳ (đã nhận = phiếu thưởng đã hạch toán; kỳ chưa lập phiếu thì còn phải nhận);
    - mua X tặng Y: hàng tặng kèm phiếu nhập (tính theo giá mua).
- Bấm một chính sách để xem nội dung (kèm điều kiện kích hoạt) và từng chứng từ. Bấm số phiếu để mở phiếu.
- Lọc nhanh: *Còn phải nhận* · *Đã nhận đủ* · *Chưa đạt*.

## MH33 · Tổng hợp chính sách theo hợp đồng
Hợp đồng nào có chính sách gì: nội dung, kèm **điều kiện kích hoạt** nếu có. Mỗi dòng có phạm vi (mã / nhãn / chi nhánh), hiệu lực, trạng thái. Lọc theo loại chính sách; mặc định chỉ hiện chính sách đang áp.

## MH34 · Đối chiếu giá mua theo hợp đồng
- Mỗi dòng hàng của phiếu nhập đã duyệt trong kỳ được so hai giá:
  - **Giá thoả thuận**: giá của hợp đồng của phiếu; phiếu không theo hợp đồng thì lấy giá NCC ngoài hợp đồng.
  - **Giá thực tế**, **sau chiết khấu, trước VAT**, quy cùng ĐVT với dòng:
    - **chính thức** theo **hoá đơn NCC** (MH22) đã đính vào phiếu nhập;
    - phiếu **chưa có hoá đơn** thì so **tạm** theo phiếu nhập. Cột *Theo* ghi rõ "Hoá đơn …" hay "Phiếu nhập (tạm)".
- Cột chênh / ĐVT, %, tiền chênh. Tô đỏ là mua cao hơn thoả thuận, tô xanh là mua thấp hơn.
- Mặc định chỉ hiện dòng lệch và dòng chưa khai giá thoả thuận. Bỏ tích để xem tất cả.

## MH35 · Tình hình thực hiện hợp đồng mua hàng
- Mỗi hợp đồng một dòng. Mỗi con số lấy từ **một nguồn chứng từ**, không cộng trùng:
  - **Đã đặt**: đơn đặt hàng.
  - **Đã nhận**: phiếu nhập trừ trả hàng.
  - **Đã nhận hoá đơn**: hoá đơn NCC đính vào phiếu nhập, mỗi hoá đơn tính một lần. Không cộng với phiếu nhập thành hai lần mua.
  - **Đã thanh toán**: phiếu trả tiền / ứng trước.
  - **Còn phải trả**: theo sổ công nợ thực tế.
  - **Tiến độ** = đã nhận / giá trị hợp đồng.
- Cột hiệu lực, trạng thái, còn lại theo giá trị, số phiếu nhập, số hoá đơn ẩn sẵn, bật ở nút **Cột**.
- Phần không theo hợp đồng của từng NCC là một dòng riêng.
- Bấm số hợp đồng để mở hợp đồng.
