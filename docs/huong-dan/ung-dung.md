# Ứng dụng kết nối (TI13)

Màn này liệt kê các **app chạy riêng** mà người quản trị bản cài đã cài, ví dụ app bán lẻ tại quầy hay app đặt hàng. App chạy ở máy khác và chỉ làm việc với phần mềm kế toán qua API. App không đọc thẳng dữ liệu kế toán.

## Kết nối app

1. Bấm **Kết nối** ở dòng app. Hộp xác nhận liệt kê việc app được làm, ví dụ "Nộp chứng từ vào sổ" hay "Xem danh mục", và các sự kiện app nhận.
2. Đồng ý thì màn hiện **Khoá API** và **Bí mật webhook**. Hai giá trị này **chỉ hiện một lần**: sao chép rồi nhập vào cấu hình của app.
3. App có giao diện thì nhóm **Tiện ích** có thêm một mục mang tên app; bấm vào để mở app ngay trong phần mềm.

Chỉ người có quyền quản trị người dùng mới kết nối, tắt, bật, xoay khoá được.

## App làm được gì

- Chỉ những việc đã đồng ý lúc kết nối. App không bao giờ được quản trị người dùng, đổi cấu hình, khoá kỳ hay duyệt chi.
- Chứng từ app nộp luôn mang mã của app ở đầu (ví dụ `pos-mini:CN01:HD0001`), cột **Nguồn** là tên app. App không sửa được chứng từ của nguồn khác.
- Sổ sách vẫn do phần mềm kế toán định khoản theo luật định khoản của đơn vị.

## Tắt, bật, xoay khoá

- **Tắt:** app ngừng gọi được API và ngừng nhận sự kiện. Chứng từ và bút toán app đã nộp **giữ nguyên**.
- **Bật lại:** app dùng tiếp khoá cũ. Sự kiện phát trong lúc tắt không được gửi bù.
- **Xoay khoá:** khoá cũ hết hiệu lực ngay, màn hiện khoá mới một lần. Làm khi nghi lộ khoá hoặc khi đổi người phụ trách app.
- **Đồng ý phạm vi mới:** hiện khi app nâng cấp và xin thêm hoặc bớt quyền. Chưa đồng ý thì app vẫn chạy với phạm vi cũ.
