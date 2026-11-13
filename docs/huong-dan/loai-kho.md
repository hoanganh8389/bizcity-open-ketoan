# Loại kho

Mỗi kho thuộc **một loại**. Loại quyết định hàng trong kho được bán hay không, có thuộc sở hữu không, và kho được dùng cho nghiệp vụ nào.

## Loại kho

| Ô | Nghĩa |
|---|---|
| Được bán | Hàng trong kho loại này được bán (tính vào tồn bán được) |
| Thuộc sở hữu | Hàng của đơn vị: tính giá vốn, ghi sổ kho. Bỏ tích = hàng nhận giữ hộ, chỉ theo dõi số lượng, không bán |
| Theo dõi hạn dùng | Cảnh báo hàng cận hạn, hết hạn |
| TK kho | Đầu số tài khoản kho (156, 157…). Trống = theo Tài khoản ngầm định |

Có sẵn 12 loại gốc (KHH hàng kinh doanh, KKM khuyến mại, KHG gửi bán, KTL trả lại, KCL cách ly, KLO lỗi, KHHAN cận hạn, KHHSD hết hạn, KDC điều chuyển, KNB nhận giữ hộ, KCB chờ bán, KCC chờ chứng từ). Thêm loại mới bằng nút **Thêm**.

Luật:
- Hàng không thuộc sở hữu thì không được bán.
- Loại gốc không đổi mã.
- Ngừng dùng một loại chỉ khi không còn kho đang theo dõi thuộc loại đó.

## Nghiệp vụ dùng loại kho

Mỗi nghiệp vụ (nhập mua, trả NCC, bán, khách trả, chuyển kho, xuất khác…) có danh sách loại kho dùng được, **theo thứ tự ưu tiên**:
- Loại đứng đầu: chứng từ tự chọn kho thuộc loại này của chi nhánh.
- Ô chọn kho chỉ hiện kho thuộc loại có trong danh sách; ghi chứng từ với kho loại khác thì bị chặn.
- Bấm ← → để đổi thứ tự, × để bỏ, **+ thêm loại** để thêm.

Ví dụ: Khách trả hàng = KTL, KHH → phiếu khách trả tự vào kho hàng trả lại; nhập mua không vào được kho hàng lỗi.

## Kho

Ở Danh mục kho, mỗi kho chọn **Loại kho**. Nút **Tạo nhanh bộ kho**: chọn chi nhánh, tích các loại cần → tạo các kho một lần (mã = mã chi nhánh + loại); loại chi nhánh đã có kho thì bỏ qua.
