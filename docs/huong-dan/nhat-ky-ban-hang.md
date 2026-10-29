# Sổ nhật ký bán hàng (ACC84)

Doanh thu bán hàng của từng hoá đơn trong kỳ, chia cột theo loại doanh thu (mẫu S07-DN, như màn ACC84 của HTsoft).

## Bộ lọc

Từ ngày, Đến ngày, Chi nhánh, **Tài khoản** (đầu số tài khoản doanh thu hoặc tài khoản ghi Nợ, gồm tài khoản con: 511 lấy cả 5111, 5112, 5113; 1311 lấy hoá đơn ghi Nợ 1311), **Mặt hàng** (hoá đơn có bán mặt hàng đó), Khách hàng.

## Cách đọc

| Cột | Ý nghĩa |
|---|---|
| Ngày lập chứng từ | Ngày chứng từ được tạo trên hệ thống (ẩn sẵn, bật ở chọn cột) |
| Ngày ghi sổ | Ngày hạch toán |
| Chứng từ: Số hiệu, Ngày tháng | Số và ngày của hoá đơn bán |
| Hoá đơn: Số, Ngày | Số và ngày hoá đơn GTGT đầu ra (nếu có) |
| Diễn giải | Diễn giải chứng từ |
| Mã khách, Tên khách, Chi nhánh | |
| Phải thu từ người mua (ghi Nợ) | Tiền hàng của hoá đơn |
| Hàng hoá | Doanh thu ghi Có tài khoản 5111 |
| Thành phẩm | Doanh thu ghi Có tài khoản 5112 |
| Dịch vụ | Doanh thu ghi Có tài khoản 5113 |
| Tài khoản khác: Số tiền, Số hiệu | Doanh thu ghi Có các tài khoản khác và số hiệu các tài khoản đó |
| Tài khoản | Tài khoản doanh thu ghi Có của hoá đơn (51111, 51131…) |
| TK đối ứng | Tài khoản phải thu (hoặc tiền) ghi Nợ (1311…) |
| Lý do | Lý do xuất của hoá đơn (XBA…) |

- Mỗi hoá đơn bán hàng một dòng; số tiền là tiền hàng **chưa thuế**, đã trừ chiết khấu. Dòng hàng trả lại / điều chỉnh giảm trong hoá đơn được trừ vào doanh thu.
- Sau các dòng của mỗi chi nhánh có dòng **Cộng chi nhánh**; cuối bảng là tổng cộng.
- Lọc theo tài khoản hoặc mặt hàng thì số tiền chỉ gồm phần doanh thu của tài khoản / mặt hàng đó.
- Nút **Xuất Excel** xuất các cột đang hiện trên bảng.
- Sổ này **không gồm hàng bán trả lại** (xem ở Báo cáo bán hàng BH01, lọc loại "Trả lại").
