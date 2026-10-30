# Báo cáo mua hàng (MH23)

Báo cáo **chi tiết từng dòng hàng** của các phiếu mua hàng — bố cục giống màn cũ: **bộ lọc bên trái** (nhà cung cấp, từ ngày – đến ngày, chi nhánh → mã kho, trạng thái, theo đơn / ngoài đơn, tìm), bấm **Tìm kiếm** để áp; **bên phải là các thẻ loại chứng từ** (Tất cả, Đơn đặt hàng, Nhập mua, Trả / đổi hàng, Quà tặng…).

Mặc định: kỳ từ đầu tháng đến hôm nay, trạng thái **Đã duyệt**, thẻ **Nhập mua**.

## Kiểu "Chi tiết dòng hàng" (mặc định)

Mỗi dòng hàng của phiếu một dòng:

| Nhóm cột | Cột |
|---|---|
| Phiếu | ngày, số phiếu, loại, trạng thái, ký hiệu HĐ, số HĐ, ngày HĐ, NCC, chi nhánh, phân kho |
| Hàng | mã, tên, loại dòng (hàng mua / KM người bán / KM người tiêu dùng), ĐVT, số lượng, SL quy ĐVT nhỏ nhất |
| Tiền | đơn giá trên phiếu + loại giá (gồm / chưa thuế), đơn giá chưa thuế, **tiền hàng trước CK (chưa thuế) − chiết khấu = tiền hàng sau CK (chưa thuế)**, thuế suất, tiền thuế, **tổng thanh toán (gồm thuế)** |
| Khác | công nợ của phiếu (tình trạng cả phiếu chứa dòng), số lô, hạn dùng |

Hàng ra (trả NCC, xuất quà, đổi hàng trả đi) ghi **số âm** để cột Cộng là số thuần. Bấm đôi một dòng để mở phiếu.

## Kiểu "Cộng dồn theo mã hàng"

Mỗi mã hàng một dòng (số lượng quy ĐVT nhỏ nhất): SL đặt, SL nhập (trong đó hàng tặng), SL trả / xuất, SL thuần, tiền hàng nhập trước CK − chiết khấu = sau CK, tiền hàng trả, tiền hàng thuần cuối, thuế, tổng thanh toán, giá nhập bình quân.

Danh sách phiếu (mỗi phiếu một dòng), lập / sửa / duyệt phiếu: **Tổng hợp mua hàng (MH11)**.
