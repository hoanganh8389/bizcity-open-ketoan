# Nhập dữ liệu từ Excel (TI14)

<!-- [2026-11-11 Nguyễn Văn Thủy] hướng dẫn trình nhập Excel dùng chung (đóng góp) -->

Một cách nhập cho mọi loại: **Khách hàng, Nhà cung cấp, Mặt hàng, Kho**. Mở ở **Tiện ích → Nhập dữ liệu từ Excel**, hoặc nút **Nhập Excel** ở danh sách.

## Bốn bước

1. **Chọn tệp nguồn**: kéo thả hoặc bấm chọn tệp. Chưa có tệp thì bấm **Tải tệp mẫu** (sheet Hướng dẫn ghi cách điền từng cột). Chọn sheet, dòng tiêu đề (phần mềm tự dò). Chọn cách nhập:
   - *Thêm mới và cập nhật*: mã chưa có → thêm, mã đã có → sửa.
   - *Chỉ thêm mới*: mã đã có báo lỗi.
   - *Chỉ cập nhật*: mã chưa có báo lỗi — dùng để sửa hàng loạt.
2. **Ghép dữ liệu**: phần mềm tự ghép cột theo tên. Cột nào sai thì chọn lại ở ô *Cột trên tệp Excel*. Ô **Ngầm định** là giá trị dùng khi tệp không có cột hoặc ô trống (ví dụ Kiểu = Khách hàng). Cách ghép được nhớ cho lần sau.
3. **Kiểm tra dữ liệu**: phần mềm kiểm từng dòng, **chưa ghi gì**. Xem số dòng hợp lệ, không hợp lệ và lỗi từng dòng. Bấm **Tải tệp lỗi** để sửa trong Excel rồi nạp lại.
4. **Kết quả nhập**: bấm *Nhập … dòng hợp lệ* — dòng lỗi bỏ qua. Tải tệp kết quả hoặc mở danh sách để xem.

## Lưu ý

- Dòng cập nhật: ô trống **giữ nguyên** giá trị đang có.
- Khách hàng / NCC thêm mới để trống mã: phần mềm tự cấp mã nối dãy của nhóm.
- Mã số thuế không được trùng đối tượng khác. Mặt hàng đã có không đổi ĐVT qua Excel.
- Phiếu nhập mua, đơn đặt hàng: dùng nút **Nhập từ Excel** ở Tổng hợp mua hàng (MH11).
