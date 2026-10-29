# Công nợ theo nhân viên (ACC48)

Xem số dư và phát sinh công nợ (mặc định tài khoản **131**) gom theo **nhân viên phụ trách**, chi tiết từng khách hàng của nhân viên đó. Dùng để giao việc thu nợ và xem nhân viên nào đang để khách nợ nhiều.

## Nhân viên lấy từ đâu

- **Chứng từ từ hệ thống bán hàng** (phiếu bán, phiếu hoàn): nhân viên là **người lập phiếu** trên hệ thống bán hàng. Mã nhân viên là tên đăng nhập. Nhân viên chưa có trong **Danh mục nhân viên (DM04)** thì được tự thêm.
- **Phiếu thu, chi, báo nợ, báo có, phiếu kế toán nhập tay**: chọn nhân viên ở từng dòng, phần **Chiều phân tích** dưới dòng phiếu.
  - Tài khoản bật **Theo dõi nhân viên** (ở Danh mục tài khoản) thì bắt buộc chọn, nếu danh mục nhân viên đã có mã.
- Dòng sổ không có nhân viên (số dư đầu kỳ, chứng từ gửi sang trước khi có thông tin nhân viên…) gom vào dòng **(chưa gắn nhân viên)**.

## Danh mục nhân viên (DM04)

Lưới: Mã NV, Tên NV, Địa chỉ, Điện thoại, Di động, Chức vụ, Email, Theo dõi, Nhóm NV, Chi nhánh làm việc, Ghi chú, Mã phòng ban. Form: Mã NV*, Tên NV, Ghi chú, Địa chỉ, Điện thoại, Di động, Email, Chức vụ, Nhóm, Làm việc tại CN, Mã phòng ban, Theo dõi. Chỉ xoá được nhân viên chưa có trên sổ.

## Cách xem

1. Chọn tài khoản (131 phải thu khách hàng; 331 phải trả người bán…), khoảng ngày, chi nhánh.
2. Chọn một nhân viên, hoặc để trống để xem tất cả. Chọn **(Chưa gắn nhân viên)** để xem riêng các khoản chưa có nhân viên.
3. Bỏ **Chi tiết từng đối tượng** để chỉ xem một dòng cho mỗi nhân viên.
4. Bấm một dòng đối tượng để mở **Sổ chi tiết công nợ** của khách đó.

## Lưu ý

- Số liệu là **phát sinh theo nhân viên ghi trên chứng từ**. Khách trả nợ qua phiếu thu do nhân viên khác lập thì phần trả đó tính cho nhân viên lập phiếu thu. Vì vậy một nhân viên có thể có dư Có (đã thu tiền của khách do người khác bán). Cộng tất cả nhân viên luôn bằng số dư của tài khoản.
- Muốn tính đúng "nhân viên bán, nhân viên đó chịu nợ" thì phiếu thu nợ cần ghi cùng nhân viên với phiếu bán.
- Chứng từ đã gửi trước khi hệ thống bán hàng bắt đầu gửi kèm nhân viên: gửi lại chứng từ (bản mới) là có nhân viên.
