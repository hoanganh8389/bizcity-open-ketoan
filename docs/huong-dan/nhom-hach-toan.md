# Mặt hàng – tài khoản (ACC17)

Màn có hai thẻ.

## Thẻ "Mặt hàng – tài khoản"

- **Bên trái**: cây nhóm hàng. Bấm một nhóm để xem mặt hàng của nhóm đó và mọi nhóm con. Bấm "Nhóm hàng" để xem tất cả. Ô "Tìm nhóm" lọc cây theo tên.
- **Bên phải**: lưới gồm Mã hàng, Tên hàng, Ghi chú, TK kho, TK giá vốn, TK doanh thu, TK chiết khấu, TK hàng bán trả lại, Mã VAT ra, Thuế TTĐB, Mã VAT vào.
- **Sửa trên lưới**: bấm đúp vào ô. Gõ xong bấm Enter, hoặc bấm ra ngoài; Esc để bỏ. Ô đã sửa hiện màu, dòng đã sửa tô vàng. Bấm **Ghi** để lưu, **Huỷ thay đổi** để bỏ hết.
- **Gán cùng giá trị**: lọc lưới (hàng lọc dưới tiêu đề) để còn đúng các mặt hàng cần đổi. Chọn cột, nhập giá trị, rồi bấm Gán. Kiểm tra lại rồi bấm Ghi.
- **Tìm file excel để nhập**: dòng tiêu đề trong tệp phải trùng tên cột của lưới và phải có cột "Mã hàng". Ô trống giữ nguyên giá trị cũ. **Tạo mẫu nhập liệu** xuất lưới đang xem để làm mẫu.
- **Tìm**: tìm theo mã, tên, ghi chú trên mọi nhóm hàng.

Mỗi lần hiện tối đa 5.000 mặt hàng. Nhiều hơn thì chọn nhóm con hoặc tìm để thu hẹp.

### Tài khoản đi theo nhóm hạch toán

Bộ định khoản đọc tài khoản theo **nhóm hạch toán** của mặt hàng. Khi sửa tài khoản của một mặt hàng, phần mềm gán mặt hàng sang nhóm có đúng bộ năm tài khoản mới. Nếu chưa có nhóm như vậy, phần mềm tự tạo nhóm mới mã `NHT-Txxx` và báo sau khi ghi.

Không chấp nhận: tài khoản tổng hợp, tài khoản không có trong danh mục, mã VAT ra không phải loại thuế đầu ra, mã VAT vào không phải loại thuế đầu vào. Dòng lỗi được giữ lại để sửa tiếp.

## Thẻ "Nhóm hạch toán"

Danh sách các bộ tài khoản. Bấm đúp một dòng để sửa.

| Tài khoản | Dùng khi |
|---|---|
| TK kho | Ghi giảm kho khi bán, ghi tăng khi nhập lại |
| TK giá vốn | Ghi giá vốn hàng bán |
| TK doanh thu | Ghi doanh thu (nếu lý do không chỉ định) |
| TK chiết khấu | Chiết khấu ghi riêng |
| TK hàng bán trả lại | Ghi giảm doanh thu khi khách trả hàng |

Có đúng **một nhóm mặc định**: mặt hàng chưa gán nhóm dùng nhóm này. Khi đặt nhóm khác làm mặc định, nhóm cũ tự bỏ cờ.

**Quay về dữ liệu gốc** đặt lại nhóm hạch toán, loại thuế, ghi chú, thuế TTĐB của mặt hàng theo tệp gốc. Nhóm tự tạo không còn mặt hàng dùng thì bị xoá.
