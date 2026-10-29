# Khoá API (HT02)

Khoá để hệ thống khác (phần mềm bán hàng, công cụ báo cáo…) kết nối vào phần mềm kế toán mà không cần tài khoản người dùng. Chỉ **Chủ sở hữu** thấy màn hình này.

## Tạo khoá

1. Bấm **Tạo khoá**, đặt tên dễ nhận biết (ví dụ "Hệ thống bán hàng").
2. Chọn phạm vi, chỉ chọn đúng việc hệ thống đó cần:

| Phạm vi | Cho phép |
|---|---|
| Gửi chứng từ | Gửi, sửa, huỷ chứng từ |
| Đọc báo cáo, sổ sách | Xem danh mục, chứng từ, sổ cái, báo cáo |
| Tạo/sửa danh mục | Tạo chi nhánh, đối tượng… khi hệ thống nguồn phát sinh mới |

3. Khoá hiện ra **một lần duy nhất**. Sao chép ngay và dán vào cấu hình của hệ thống kia. Phần mềm không lưu khoá gốc nên không xem lại được; mất thì tạo khoá mới.

Hệ thống kết nối gửi khoá trong tiêu đề `X-Api-Key`. Chi tiết từng đường dẫn xem ở nút **Tài liệu API**.

## Thu hồi

Bấm **Thu hồi** khi khoá bị lộ hoặc không dùng nữa. Có hiệu lực ngay: hệ thống đang dùng khoá đó sẽ bị từ chối cho đến khi được cấp khoá mới.

Nên dùng mỗi hệ thống một khoá riêng để thu hồi cái này không ảnh hưởng cái kia. Cột "Dùng gần nhất" cho biết khoá nào còn đang hoạt động.
