# Tài khoản ngầm định (ACC41)

<!-- [2026-11-11 Nguyễn Văn Thủy] PHASE-026 — danh sách định khoản theo loại chứng từ, thêm / sửa (đóng góp) -->

Mỗi dòng là một **định khoản mặc định** của một loại chứng từ: **TK Nợ** và **TK Có**. Lọc theo **Loại chứng từ**: Bán hàng, Mua hàng, Nhập xuất kho, Thu chi tiền, Khác.

## Dòng có sẵn

Là định khoản phần mềm dùng khi không có gì chỉ định khác. Bấm **Sửa** để đổi tài khoản.

- Một tài khoản có thể dùng ở nhiều dòng. Ví dụ *Phải thu khách hàng 1311* dùng ở bán hàng, khách trả hàng, thu tiền. Sửa ở một dòng là đổi ở mọi dòng dùng chung; hộp sửa ghi rõ các dòng đó.
- Ô ghi *theo HTTT*: tài khoản tiền lấy theo **Hình thức thanh toán** (tiền mặt 1111, chuyển khoản 112…).
- Thuế: loại thuế có tài khoản riêng thì theo loại thuế.

## Công tắc lý do hạch toán

Khoá `bizcity.posting.use_reasons`, đổi ở Trung tâm cấu hình. Mặc định **tắt**.

- **Tắt**: phần mềm không đọc lý do, nhóm hạch toán, tài khoản theo mặt hàng. Doanh thu, trả lại, giá vốn, kho lấy ở màn này.
- **Bật**: như phần mềm cũ. Doanh thu, giá vốn, kho theo nhóm hạch toán của mặt hàng; tài khoản trên lý do đè lên các dòng ở đây.
