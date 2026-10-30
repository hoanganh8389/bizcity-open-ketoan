# Người dùng (HT01)

Tài khoản đăng nhập của từng người trong đơn vị. Chỉ **Chủ sở hữu** thấy màn hình này.

## Vai trò

| Vai trò | Làm được gì |
|---|---|
| Chủ sở hữu | Mọi việc, kể cả quản lý người dùng, khoá API, duyệt yêu cầu thanh toán cấp 2 |
| Kế toán trưởng | Như kế toán, thêm: sửa cấu hình hạch toán, khoá/mở sổ, kết chuyển, **sửa / huỷ phiếu của người khác**, duyệt yêu cầu thanh toán (cấp 1), không bị chặn bởi khoá dữ liệu theo ngày (ACC2) |
| Kế toán | Xem sổ sách, lập chứng từ, sửa danh mục. Phiếu nhập tay (thu, chi, báo có, báo nợ, phiếu kế toán): **chỉ sửa / huỷ được phiếu do chính mình lập**; phiếu của người khác mở ra chỉ xem |
| Chỉ xem | Chỉ xem chứng từ, sổ sách, báo cáo |

## Thao tác

- **Thêm người dùng**: nhập email, họ tên, vai trò và mật khẩu ban đầu (tối thiểu 8 ký tự). Báo người đó đổi mật khẩu sau lần đăng nhập đầu.
- **Sửa**: bấm vào dòng để đổi họ tên, vai trò, hoặc đặt lại mật khẩu khi người dùng quên.
- **Khoá**: bỏ đánh dấu "Được đăng nhập". Người bị khoá không đăng nhập được nữa; lịch sử thao tác của họ vẫn giữ nguyên. Không xoá người dùng.

Đơn vị luôn phải còn ít nhất một chủ sở hữu đang hoạt động, nên không khoá hay hạ quyền được chủ sở hữu cuối cùng.

## Đổi mật khẩu của chính mình

Bấm biểu tượng chìa khoá ở góc trên bên phải, nhập mật khẩu hiện tại và mật khẩu mới.

## Đổi mật khẩu, đăng xuất các thiết bị khác

- **Đổi mật khẩu** (biểu tượng chìa khoá trên thanh trên cùng): mọi máy **khác** đang đăng nhập tài khoản này bị **đăng xuất** — máy đang dùng phần mềm thì thoát ở lần thao tác tiếp theo, máy để yên tự thoát trong khoảng 1 phút. Máy đang đổi mật khẩu vẫn làm việc bình thường.
- **Đăng xuất các thiết bị khác** (cùng hộp đổi mật khẩu): đá mọi máy khác ra mà **không đổi mật khẩu** — dùng khi tài khoản đã gửi cho nhiều người (vd tài khoản trải nghiệm) và muốn thu hồi ngay.
- Quản trị **đặt lại mật khẩu**, **khoá** hoặc **đổi vai trò** của một người dùng: mọi máy đang đăng nhập tài khoản đó bị đăng xuất ngay (đổi vai trò thì đăng nhập lại để nhận quyền mới). Chỉ sửa họ tên thì không ai bị đăng xuất.
- Đăng xuất WordPress (trang quản trị) **không** đăng xuất phần mềm kế toán — phần mềm có phiên đăng nhập riêng.
