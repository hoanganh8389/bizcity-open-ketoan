# Danh mục khoản mục (ACC24), hợp đồng (ACC25), bộ phận (ACC26)

Ba danh mục dùng để **phân tích** doanh thu, chi phí: cùng một tài khoản chi phí (ví dụ 6421) nhưng muốn biết tiền chi cho việc gì (khoản mục), của phòng nào (bộ phận), thuộc hợp đồng nào.

| Danh mục | Dùng để | Ví dụ |
|---|---|---|
| Khoản mục | Phân loại nội dung chi phí; có khoản mục cha – con | Lương, Thuê nhà, Điện nước, Văn phòng phẩm |
| Bộ phận | Phòng ban, cửa hàng chịu chi phí | Phòng kế toán, Phòng kinh doanh |
| Hợp đồng | Theo dõi theo từng hợp đồng; có thêm khách hàng, ngày ký, ngày kết thúc, giá trị | HĐ thuê mặt bằng 2026 |
| Vụ việc (DM06) | Gom doanh thu, chi phí của một việc có đầu có cuối; có vụ việc cha – con | Khai trương shop HN01, Sửa chữa kho tổng 2026 |
| Dự án (DM07) | Dự án đầu tư, xây dựng, triển khai; có dự án cha – con | Dự án kho tổng, Dự án phần mềm kế toán |
| Nguồn vốn (ACC20) | Nguồn tiền dùng cho chi phí, tài sản | Vốn chủ sở hữu, Vốn vay ngân hàng, Vốn tài trợ |
| Nhân viên (DM04) | Nhân viên phụ trách bán hàng, thu tiền; dùng cho Báo cáo công nợ theo nhân viên (ACC48). Nhân viên lập phiếu trên hệ thống bán hàng được tự thêm | nv.lan, nv.hung |

## Thêm, sửa

- Thanh nút: **Thêm** (Ctrl+N) · **Sửa** (Ctrl+E, hoặc bấm đúp dòng) · **Xoá** (Ctrl+Delete) · **Nạp** (F5) · **Xuất** Excel.
- Form: Mã (*), Tên, Ghi chú, mã cha (Khoản mục cha / Thuộc PB). Bộ phận có thêm Địa chỉ và Điện thoại. Mã không sửa được sau khi ghi.
- Lưới khoản mục: Mã khoản mục, Tên khoản mục, Ghi chú, Khoản mục cha. Lưới bộ phận: Mã PB, Tên PB, Địa chỉ, Điện thoại, Ghi chú, Ẩn, Bộ phận trực thuộc.
- **Xoá** chỉ được với mã chưa dùng (chưa có trên sổ, thẻ tài sản, định mức, chi nhánh, lý do, lịch hợp đồng) và chưa có mã con. Mã đã dùng thì bỏ tích **Theo dõi** để ngừng: mã ngừng không chọn được trên phiếu mới, số liệu cũ vẫn giữ.
- Nhóm CCDC (ACC19), Nguồn vốn (ACC20), Mục đích sử dụng (ACC21) dùng cùng màn: cột Mã, Tên, Mô tả.

## Dùng ở đâu

Trên hộp phiếu thu, chi, báo nợ, báo có, phiếu kế toán, đánh dấu **Khoản mục, bộ phận, hợp đồng** để nhập mã cho từng dòng (kể cả ô **Nhân viên**). Xem kết quả ở **Chi phí theo khoản mục và bộ phận (ACC44)** (có các thẻ gom theo nhân viên, vụ việc, dự án, nguồn vốn), **Báo cáo công nợ theo nhân viên (ACC48)**; ở **Sổ chi tiết tài khoản (ACC12)** bật thêm các cột chiều ở nút "Cột".

Ô **Vụ việc, Dự án, Nguồn vốn** chỉ hiện trên dòng phiếu khi danh mục tương ứng đã có mã.

## Khi nào bắt buộc

Trong **DM Tài khoản (ACC1)**, mỗi tài khoản có các ô "Theo dõi theo khoản mục / bộ phận / hợp đồng / nhân viên / vụ việc / dự án / nguồn vốn".

- Danh mục **còn trống**: phiếu chưa bắt buộc chọn chiều đó (đơn vị chưa dùng).
- Danh mục **đã có mã**: tài khoản nào bật theo dõi chiều đó thì dòng phiếu **bắt buộc** chọn, thiếu sẽ báo "tài khoản … bắt buộc phải chọn bộ phận".

Vì vậy nên khai đủ danh mục trước, rồi mới bắt đầu nhập phiếu.
