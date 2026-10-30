# Tổng hợp bán hàng (BH02)

Cộng số liệu bán hàng theo một góc nhìn. Chọn góc nhìn ở hàng thẻ phía trên bảng:

| Thẻ | Dùng để |
|---|---|
| Theo ngày | Xem doanh số từng ngày, đối chiếu với báo cáo cuối ngày của cửa hàng |
| Theo tháng | So sánh các tháng |
| Theo chi nhánh | So sánh doanh thu giữa các cửa hàng |
| Theo mặt hàng | Mặt hàng nào bán nhiều, trả lại nhiều |
| Theo khách hàng | Doanh số từng khách |
| Theo loại thuế | Doanh thu tách theo thuế suất |
| Theo nhãn / ngành / nhóm / loại hàng | Doanh thu theo phân loại mặt hàng |
| Theo nhóm khách | Doanh thu theo nhóm khách hàng |
| Theo bộ phận (cửa hàng) | Doanh thu theo bộ phận của chi nhánh (điểm bán, HO…) |

## Các cột

| Cột | Ý nghĩa |
|---|---|
| Số CT bán | Số chứng từ bán có trong nhóm |
| SL bán, Doanh số bán | Số lượng và tiền hàng trước thuế của hàng bán ra |
| SL trả lại, Hàng trả lại | Số lượng và tiền hàng trước thuế của hàng khách trả |
| **Doanh thu thuần** | Doanh số bán − Hàng trả lại |
| Thuế GTGT | Thuế của hàng bán trừ thuế của hàng trả lại |
| Tổng thanh toán | Doanh thu thuần + Thuế GTGT |

## Lưu ý

- Chọn thẻ nào thì dòng **Tổng cộng** cũng ra cùng một số.
- Doanh thu thuần ở đây khớp với sổ cái: phát sinh Có tài khoản 511 trừ phát sinh Nợ tài khoản 521 trên [Bảng cân đối số phát sinh](can-doi-phat-sinh.md) cùng kỳ. Lệch là có chứng từ đang lỗi chưa ghi sổ: xem ở Danh sách chứng từ, lọc trạng thái "Lỗi".
- Ô **Phạm vi** = "Có hoá đơn" cho số khớp với Bảng kê hoá đơn bán ra.
- Muốn xem từng dòng hàng tạo nên một con số, mở **Báo cáo bán hàng (BH01)** với cùng điều kiện lọc.
- Doanh thu trừ giá vốn (lãi gộp) xem ở **Lãi gộp (BH04)**.

## Theo phiếu (mặc định)

Thẻ **Theo phiếu** liệt kê mỗi hoá đơn bán / phiếu trả lại một dòng: ngày, số phiếu, loại (bán / trả lại), ký hiệu và số hoá đơn, chi nhánh, khách hàng, số lượng, tiền hàng, thuế, tổng thanh toán, **đã thu**, **ghi nợ** và **hình thức thanh toán**. Phiếu trả lại ghi số âm. Bấm một dòng để mở chứng từ gốc.

Các thẻ còn lại gom số liệu theo ngày, tháng, chi nhánh, mặt hàng, khách hàng, loại thuế; tổng cộng ở mọi thẻ như nhau.

