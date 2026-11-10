# Tài khoản ngầm định (ACC41)

<!-- [2026-11-11 Nguyễn Văn Thủy] PHASE-026 — danh sách định khoản theo loại chứng từ, thêm / sửa (đóng góp) -->

Mỗi dòng là một **định khoản mặc định** của một loại chứng từ: **TK Nợ** và **TK Có**. Lọc theo **Loại chứng từ**: Bán hàng, Mua hàng, Nhập xuất kho, Thu chi tiền, Khác.

## Dòng có sẵn

Là định khoản phần mềm dùng khi không có gì chỉ định khác. Bấm **Sửa** để đổi tài khoản.

- Một tài khoản có thể dùng ở nhiều dòng. Ví dụ *Phải thu khách hàng 1311* dùng ở bán hàng, khách trả hàng, thu tiền. Sửa ở một dòng là đổi ở mọi dòng dùng chung; hộp sửa ghi rõ các dòng đó.
- Ô ghi *theo HTTT*: tài khoản tiền lấy theo **Hình thức thanh toán** (tiền mặt 1111, chuyển khoản 112…).
- Thuế: loại thuế có tài khoản riêng thì theo loại thuế.

## Thêm tài khoản ngầm định

Dùng cho trường hợp riêng. Ví dụ hàng khuyến mại ghi doanh thu 51113, giá vốn 6323.

1. **Dựa trên dòng**: chọn dòng có sẵn cần đổi, ví dụ *Bán hàng — tiền hàng*.
2. **Áp cho loại hàng** và / hoặc **Áp cho biến thể** (Chia giá, Khuyến mại, Kẹp quà, Tem, Nội bộ…).
3. **TK Nợ / TK Có** điền sẵn theo dòng gốc. Đổi bên cần đổi; bên giữ nguyên đi theo dòng gốc.

Dòng thêm hiện ngay dưới dòng gốc, bắt đầu bằng ↳. Không được trùng điều kiện với dòng đã thêm. Bấm **Sửa** để đổi hoặc **Xoá**; áp ngay.

## Thứ tự ưu tiên

Dòng thêm khớp loại hàng / biến thể của mặt hàng thì dùng dòng đó; khớp nhiều điều kiện hơn thì thắng. Không khớp thì theo dòng có sẵn.

## Công tắc lý do hạch toán

Khoá `bizcity.posting.use_reasons`, đổi ở Trung tâm cấu hình. Mặc định **tắt**.

- **Tắt**: phần mềm không đọc lý do, nhóm hạch toán, tài khoản theo mặt hàng. Doanh thu, trả lại, giá vốn, kho lấy ở màn này.
- **Bật**: như phần mềm cũ. Doanh thu, giá vốn, kho theo nhóm hạch toán của mặt hàng; tài khoản trên lý do đè lên các dòng ở đây.
