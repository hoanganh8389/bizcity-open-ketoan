# Quy trình danh mục

Trang chủ phân hệ **Danh mục**. Dành cho người quản trị: nhìn một lần thấy cả hệ thống cần khai báo gì, theo thứ tự nào.

## Sơ đồ

Làm **từ trái sang phải, từ trên xuống dưới**. Mọi ô đều bấm được.

| Bước | Khai gì | Phần mềm làm sẵn |
|---|---|---|
| 1. Cơ cấu tổ chức | Cây công ty → vùng → chi nhánh → tỉnh | Mã số thuế đặt ở tỉnh, cửa hàng và kho bên dưới tự theo. Đổi cơ cấu, đổi mã số thuế có ngày hiệu lực — chứng từ cũ giữ nguyên |
| 2. Chi nhánh, cửa hàng | Mã, tên, thuộc nút nào trên cây, thông tin in | Chi nhánh mới tự có bộ phận Bán hàng |
| 3. Kho | Kho của từng chi nhánh | Chứng từ không ghi kho thì vào kho mặc định |
| 4. Nhóm hàng | Ba cấp: ngành → nhãn → nhóm, mỗi cấp một mã ngắn | Mã ngắn khoá lại khi nhóm đã có mặt hàng; mọi lần sửa đều có lịch sử |
| 5. Mặt hàng | Mã, tên, đơn vị tính, thuế suất | Chọn nhóm cấp 3 là có sẵn mã kế tiếp; số lượng luôn ghi theo đơn vị nhỏ nhất |
| 6. Đối tượng | Khách hàng, nhà cung cấp, nhân viên | Khai một lần, mọi chứng từ chọn lại |
| 7. Cấu hình hạch toán | Tài khoản ngầm định, hệ thống tài khoản, biểu thuế | Chứng từ tự định khoản |
| 8. Phân quyền | *(đang phát triển)* Ai được xem, sửa chi nhánh nào, màn nào | Theo đúng nhánh trên cơ cấu |
| 9. Báo cáo tổng hợp | — | Cộng dồn theo cây: cửa hàng → tỉnh → chi nhánh → toàn công ty |

Bên phải là các báo cáo nhiều chi nhánh, nhiều kho. Hàng dưới cùng: đơn vị tính, bảng giá, bộ phận, tài khoản ngân hàng, dữ liệu gốc.

Nút **Luồng chi tiết** mở sơ đồ đầy đủ: từng bước có những khai báo kèm theo và số bản ghi đang có.

## Bộ phận là gì

Bộ phận là **phòng ban chức năng**: Ban giám đốc, Kinh doanh, Bán hàng, Mua hàng, Marketing, Văn phòng, Kế toán, Hành chính nhân sự, Công nghệ, Kho vận.

- Chi phí phát sinh **ở đâu** → xem theo cửa hàng, kho.
- Chi phí **của phòng nào** → xem theo bộ phận.
- Chi phí bán hàng hay quản lý → theo tài khoản 641 / 642.

## Làm lại từ đầu

Màn Quản lý mặt hàng / Danh mục nhóm hàng có nút **Quay về dữ liệu gốc**: xoá hẳn nhóm hàng, mặt hàng chưa phát sinh, giữ mặt hàng đã có chứng từ, nạp lại bộ mẫu nhỏ. Xem thêm *Dữ liệu gốc*.
