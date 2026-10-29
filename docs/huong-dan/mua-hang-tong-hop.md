# Tổng hợp mua hàng (MH11)

Báo cáo các phiếu mua **đã duyệt** (đã vào sổ) trong kỳ, gom theo một trong các tiêu chí:

| Thẻ | Dùng để |
|---|---|
| Theo mã hàng | Giá vốn thực tế / ĐVT từng mã; so giá giữa các lần nhập |
| Theo nhóm hàng, ngành hàng | Tổng hợp theo cây danh mục hàng |
| Theo nhãn hàng | Doanh số nhập của nhãn (đối chiếu chỉ tiêu, thưởng) |
| Theo nhà cung cấp | Giá trị mua, chiết khấu được hưởng, hàng trả, còn nợ từng NCC |
| Theo chi nhánh | Giá trị nhập từng chi nhánh |

**Các cột** (tiền trước thuế):
- **SL mua / SL tặng / SL trả**: số lượng hàng mua, hàng khuyến mại nhận, hàng trả lại.
- **Tiền hàng trước CK**, **Chiết khấu**, **Giá trị nhập**: giá trị nhập = tiền hàng − chiết khấu.
- **Thuế GTGT**, **Hàng trả lại**.
- **+ Chi phí phân bổ**: vận chuyển, bốc xếp… đã phân bổ vào mã.
- **− Thưởng / CK sau mua**: thưởng cuối kỳ, chiết khấu bổ sung đã phân bổ vào mã.
- **Giá trị thuần** = giá trị nhập − hàng trả + chi phí − thưởng.
- **Giá vốn TT / ĐVT** (chỉ thẻ mã hàng) = giá trị thuần / (SL mua + SL tặng chia giá − SL trả).
- **Còn nợ NCC**: phần chưa trả của phiếu nhập, chia theo giá trị từng dòng — biết mã / nhóm / ngành nào còn nợ bao nhiêu.

Chọn khoảng ngày, bấm **Xuất Excel** để lấy file.
