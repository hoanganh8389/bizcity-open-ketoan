# Tài khoản ngầm định (ACC41)

<!-- [2026-11-11 Nguyễn Văn Thủy] PHASE-026 — danh sách định khoản theo loại chứng từ, thêm / sửa (đóng góp) -->

Mỗi dòng là một **định khoản mặc định** của một loại chứng từ: **TK Nợ** và **TK Có**. Lọc theo **Loại chứng từ**: Bán hàng, Mua hàng, Nhập xuất kho, Thu chi tiền, Khác.

## Dòng có sẵn

Là định khoản phần mềm dùng khi không có gì chỉ định khác. Bấm **Sửa** để đổi tài khoản.

- Một tài khoản có thể dùng ở nhiều dòng. Ví dụ *Phải thu khách hàng 1311* dùng ở bán hàng, khách trả hàng, thu tiền. Sửa ở một dòng là đổi ở mọi dòng dùng chung; hộp sửa ghi rõ các dòng đó.
- Ô ghi *theo HTTT*: tài khoản tiền lấy theo **Hình thức thanh toán** (tiền mặt 1111, chuyển khoản 112…).
- Thuế: loại thuế có tài khoản riêng thì theo loại thuế.

## Thêm tài khoản ngầm định

Dùng cho trường hợp riêng của một loại chứng từ. Ví dụ hàng khuyến mại ghi doanh thu 51113, giá vốn 6323.

1. Chọn **Loại chứng từ** và **Khoản**: tiền hàng, thuế, giá vốn hoặc thanh toán.
2. Đặt **Tên định khoản**.
3. Chọn điều kiện: loại hàng, loại thuế, hàng tặng, chương trình, hình thức thanh toán, chiều chuyển kho… Ô để *mọi trường hợp* thì không xét.
4. Chọn **TK Nợ** và / hoặc **TK Có**. Ô trống thì giữ tài khoản của dòng có sẵn.

Không được trùng điều kiện với một dòng đã thêm. Sửa và xoá áp ngay.

## Thứ tự ưu tiên

1. Quy tắc ở **Thiết kế hạch toán (ACC92)**: có ngày hiệu lực, đề xuất / duyệt. Quy tắc nhiều điều kiện hơn thì thắng; cùng mức điều kiện thì quy tắc ACC92 thắng dòng thêm ở đây.
2. Dòng **thêm** ở màn này. Khớp nhiều điều kiện hơn thì thắng.
3. Dòng **có sẵn**.

## Công tắc lý do hạch toán

Khoá `bizcity.posting.use_reasons`, đổi ở Trung tâm cấu hình. Mặc định **tắt**.

- **Tắt**: phần mềm không đọc lý do, nhóm hạch toán, tài khoản theo mặt hàng. Doanh thu, trả lại, giá vốn, kho lấy ở màn này.
- **Bật**: như phần mềm cũ. Doanh thu, giá vốn, kho theo nhóm hạch toán của mặt hàng; tài khoản trên lý do đè lên các dòng ở đây.
