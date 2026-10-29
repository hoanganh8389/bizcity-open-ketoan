# Chứng từ kế toán (ACC3) và các màn kiểm tra (ACC3A, ACC3B, ACC3C)

Làm lại màn **Chứng từ kế toán** trong Tiện ích của HTsoft (CtrlLedger). Bốn mục dùng chung một màn, chỉ khác điều kiện lọc:

| Mục | Mã | Hiện chứng từ nào |
|---|---|---|
| Chứng từ kế toán | ACC3 | Mọi chứng từ kế toán đang hiệu lực |
| CT kế toán bị mất liên kết phiếu gốc | ACC3A | Bút toán còn hiệu lực mà phiếu gốc không còn, đã huỷ, nguồn đã báo xoá (chờ huỷ), hoặc là bút toán của phiên bản cũ |
| CT kế toán lệch giữa thân và chi tiết | ACC3B | Tổng tiền thân bút toán khác tổng Nợ các dòng, hoặc tổng Nợ khác tổng Có (sổ bình thường luôn trống) |
| CT kế toán lệch so với phiếu gốc | ACC3C | Tổng tiền phiếu gốc khác giá trị phiếu trên sổ: thường là phiếu gốc có **bản mới chưa định khoản lại** |

Có ở **Kế toán → 9. Tiện ích → Chứng từ kế toán**; mục Chứng từ kế toán còn ở **1. Chứng từ và định khoản**. Màn tra bút toán cũ (xem cả bút toán đã đảo) nay là **Bút toán sổ cái (SC01)**.

## Bảng lọc (bên trái)

Từ ngày, Đến ngày (theo **ngày chứng từ**), Tìm số chứng từ (số chứng từ, số bút toán hoặc số hoá đơn), Số tài khoản (chứng từ có dòng vào tài khoản đó, gồm tài khoản con), Loại chứng từ, Chi nhánh (tích chọn). Bấm **Tìm**. Số chứng từ và tài khoản xét trên cả chứng từ: lọc tài khoản 1111 ra phiếu bán thì dòng phiếu vẫn đủ bút toán bán hàng và thu tiền. Khoảng ngày quá rộng (trên 50.000 bút toán) thì chỉ hiện phần đầu và báo thu hẹp khoảng ngày.

## Lưới chứng từ

Mỗi dòng **một phiếu gốc** (một phiếu bán có bút toán bán hàng và bút toán thu tiền vẫn là một dòng). Cột như HTsoft:

| Cột | Ý nghĩa |
|---|---|
| Chọn | Tích để Xoá nhiều chứng từ; ô ở tiêu đề tích tất cả đang hiện |
| Ngày chứng từ, Ngày ghi sổ, Số chứng từ, Số VAT | Của chứng từ |
| Tổng tiền trên phiếu | Tổng tiền của phiếu gốc (phiếu không có phiếu gốc: tổng tiền bút toán) |
| Ngân hàng | Tài khoản ngân hàng của các dòng hạch toán |
| Diễn giải, Chi nhánh lập, Lý do, Kiểu | Kiểu = loại chứng từ |
| Tổng nợ, Tổng có | Cộng các dòng hạch toán |
| Chênh lệch | ACC3, ACC3A: Nợ − Có. ACC3B: thân − chi tiết. ACC3C: phiếu gốc − giá trị trên sổ |
| Tiền kho | Tiền giá vốn / kho của chứng từ |
| UserID | Người lập; "Tích hợp" là chứng từ hệ thống bán hàng gửi sang |
| Tình trạng phiếu gốc | Chỉ ở ACC3A |

Dòng **Tổng cộng** ở cuối. Bấm một dòng: lưới dưới hiện **chi tiết hạch toán** (tài khoản, Nợ, Có, đối tượng, mặt hàng, khoản mục, bộ phận, hợp đồng, nhân viên). Bấm đúp: mở phiếu gốc.

## Xoá = bỏ định khoản

HTsoft xoá bút toán khỏi sổ cái, giữ phiếu gốc. Ở đây sổ cái chỉ thêm nên **Xoá** là **bỏ định khoản**:

1. Tích các chứng từ, bấm **Xoá**, nhập lý do.
2. Bút toán được đảo (ghi số âm), sổ hoá đơn và biến động kho của chứng từ được gỡ.
3. Chứng từ về **Chờ định khoản** ở **Định khoản tự động (ACC14)**; định khoản lại ở đó. Nhật ký định khoản ghi "Bỏ định khoản".

Chỉ áp cho chứng từ hệ thống bán hàng gửi sang. Phiếu lập tay sửa / huỷ ở màn phiếu; kết chuyển huỷ ở ACC6; giá vốn tính lại ở ACC49; khấu hao ở ACC31; số dư đầu ở ACC15. Kỳ đã khoá, hoặc vướng khoá dữ liệu theo ngày / luật "kế toán viên không được huỷ phiếu" (ACC2) thì không bỏ định khoản được. Chỉ người dùng có quyền lập, sửa chứng từ mới bỏ định khoản; hệ thống bán hàng (khoá API) không gọi được.

## Khác HTsoft

- HTsoft bắt Từ ngày và Đến ngày cùng một năm (sổ chia bảng theo năm); ở đây không cần.
- ACC3C của HTsoft so từng dòng giá vốn với số lượng × giá vốn; ở đây so tổng tiền phiếu gốc với giá trị phiếu trên sổ (tiền hàng + thuế; phiếu thu chi: số tiền). Phiếu chuyển kho, điều chỉnh kho, giá vốn, kết chuyển, khấu hao, số dư đầu không có tổng tiền để so nên không kiểm.
