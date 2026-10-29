# Phân cấp chi nhánh – shop (MH15)

Mua hàng làm ở **chi nhánh cha**: NCC giao về kho của chi nhánh cha, rồi kho chia xuống các **shop**. Màn này khai shop nào thuộc chi nhánh cha nào. Tồn max, chuyển hàng xuống shop và công thức đặt hàng đều tính theo cây này.

Chỉ có **2 cấp**: chi nhánh cha → shop. Một chi nhánh cha có thể có tới khoảng 70 shop.

## Màn hình

| Phần | Làm gì |
|---|---|
| **Cột trái: Chưa xếp** | Các chi nhánh chưa có chỗ trong cây. Mỗi dòng có ô **Xếp vào…** để chọn chi nhánh cha, hoặc chọn **★ Làm chi nhánh cha**. |
| **Cột phải: Cây** | Mỗi chi nhánh cha là một khối vàng, ghi rõ các kho và số shop. Bấm vào khối để mở danh sách shop. |
| **Kéo thả** | Kéo một shop sang chi nhánh cha khác, hoặc kéo về cột trái để bỏ khỏi chi nhánh cha. |
| **✕ trên shop** | Bỏ shop khỏi chi nhánh cha. |
| **Bỏ cấp cha** | Chỉ làm được khi chi nhánh cha không còn shop nào. |

Mọi thay đổi chỉ được ghi khi bấm **Lưu phân cấp**. Thanh trên có đếm số thay đổi chưa lưu; muốn huỷ thì bấm **Bỏ thay đổi**.

## Tự xếp theo mã

Nút **Tự xếp theo mã** xếp theo quy ước mã chi nhánh:
- mã dạng `xx000` (ví dụ `08000`) là **chi nhánh cha**;
- mã 5 số có cùng 2 số đầu (ví dụ `08001`, `08017Plus`) là **shop** của chi nhánh cha đó.

Nút này chỉ xếp các chi nhánh **chưa xếp**. Chi nhánh đã xếp tay thì giữ nguyên.

## Nhập / xuất Excel

- **Xuất Excel**: tải toàn bộ cây ra tệp gồm các cột mã, tên, cấp, chi nhánh cha, kho.
- **Nhập Excel**: dùng các cột *Mã chi nhánh*, *Cấp* (Chi nhánh cha / Shop) và *Mã chi nhánh cha*. Bấm **Tải file mẫu** để có tệp đúng cột. Sau khi nhập, kiểm lại trên màn rồi bấm **Lưu phân cấp**.

## Lưu ý

- Mỗi shop cần có ít nhất một kho, khai ở **Danh mục kho (DM12)**. Shop thường chỉ có một kho, và kho đó là chuẩn để tính tồn và max của shop.
- Chi nhánh cha thường có nhiều kho: kho hàng, kho khuyến mại, kho chờ xử lý… Chọn kho nào tính tồn ở **Công thức đặt hàng (MH18)**.
