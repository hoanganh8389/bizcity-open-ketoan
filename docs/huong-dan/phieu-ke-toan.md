# Phiếu kế toán (ACC16)

Bút toán do kế toán tự định khoản, dùng cho các nghiệp vụ **không qua tiền** và không có chứng từ tự động: trích trước, phân bổ chi phí, điều chỉnh, bù trừ công nợ, kết chuyển thủ công…

Khoản có thu, chi tiền thì dùng **Phiếu thu / Phiếu chi** (tiền mặt) hoặc **Phiếu báo có / Phiếu báo nợ** (ngân hàng) để lên sổ quỹ đúng loại phiếu.

## Danh sách phiếu

Giống danh sách phiếu thu, phiếu chi: bảng lọc bên trái (Từ ngày, Đến ngày, Chi nhánh, Tìm kiếm, In các phiếu đã chọn), thanh nút **Thêm, Sửa, Copy, Xóa, Nạp, In, Xuất**. Cột: Chọn, Số phiếu, Diễn giải, Tổng tiền, Chi nhánh, Lý do, Mã NV, Tên NV, Tiền tệ, Tỷ giá, Ngày tạo, User tạo, Ngày chứng từ.

## Lập phiếu

Bấm **Thêm**. Form "Phiếu kế toán khác" có thanh nút **Ghi, Ghi và tạo mới, Xóa, In, Xuất, Đóng**.

1. **Đầu phiếu**: Số chứng từ (để trống thì tự cấp `PK26-000001`…), Ngày chứng từ, Diễn giải, Lý do, Nhân viên (Tên NV tự hiện), Tiền tệ, Chi nhánh.
2. **Lưới trên – dòng phiếu**: bấm **Thêm chi tiết phiếu**, chọn **Tài khoản**, nhập số tiền vào **PS Nợ** hoặc **PS Có** (mỗi dòng chỉ một bên), Đối tượng, thuế và hoá đơn nếu có, Nhân viên, Diễn giải, Bộ phận, Hợp đồng, Khoản mục. Cột **Tk đối ứng** tóm tắt các tài khoản đối ứng của dòng.
3. **Lưới dưới – tài khoản đối ứng** của dòng đang chọn ở lưới trên: bấm **Thêm chi tiết phiếu** ở lưới dưới, số tiền còn thiếu được điền sẵn; chọn tài khoản, sửa số tiền, đối tượng… Dòng ghi PS Nợ thì tài khoản đối ứng ghi Có và ngược lại.
4. Bấm **Ghi**. Phiếu được lưu và vào danh sách **Định khoản tự động (ACC14)**; ghi sổ khi kế toán định khoản (loại phiếu đặt chế độ ghi ngay thì ghi sổ luôn).

Ví dụ trích trước chi phí 150.000: dòng 335 PS Có 150.000; tài khoản đối ứng 64211 100.000 và 64212 50.000 (ghi Nợ).

## Quy tắc kiểm tra

- Chỉ dùng **tài khoản chi tiết** đang sử dụng. Chọn tài khoản tổng hợp (có tài khoản con) sẽ bị từ chối.
- Tài khoản theo dõi đối tượng (131, 331, 335…) bắt buộc chọn **Đối tượng công nợ**.
- Mỗi dòng nhập PS Nợ hoặc PS Có, không nhập cả hai; số tiền lớn hơn 0. Cần ghi giảm thì nhập sang bên ngược lại.
- Tổng tiền các tài khoản đối ứng phải bằng số tiền của dòng; có tiền thuế thì phải chọn loại thuế.
- Tài khoản bắt buộc bộ phận / khoản mục / hợp đồng thì phải chọn.
- Kỳ đã khoá sổ thì không lập, sửa, huỷ được.

## Sửa và huỷ

Giống phiếu thu, phiếu chi: mở phiếu, sửa rồi **Ghi**, hoặc **Xóa**.

Kế toán viên chỉ sửa / huỷ được phiếu do mình lập; phiếu của người khác mở ra chỉ xem (có dòng báo tên người lập). Kế toán trưởng và chủ sở hữu sửa / huỷ được mọi phiếu.

## Lập nhanh

- **Lập từ mẫu…** (trên thanh nút của danh sách): điền sẵn từ bút toán mẫu, xem [Bút toán mẫu, bút toán lặp](but-toan-mau.md).
- **Cấn trừ công nợ (BT03)**: lập phiếu bù trừ phải thu – phải trả, xem [Cấn trừ công nợ](can-tru-cong-no.md).
