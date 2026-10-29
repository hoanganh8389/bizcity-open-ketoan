# Chi phí theo khoản mục và bộ phận (ACC44)

Tổng chi phí trong kỳ gom theo **khoản mục**, **bộ phận**, **hợp đồng** đã nhập trên từng dòng phiếu.

## Cách dùng

- Ô **Tài khoản chi phí**: đầu số tài khoản cần xem, mặc định `64` (641 và 642). Nhập `642` để chỉ xem chi phí quản lý, `635` chi phí tài chính, `511` nếu muốn xem doanh thu theo bộ phận.
- Chọn góc nhìn ở hàng thẻ: theo khoản mục, theo bộ phận, khoản mục × bộ phận, tài khoản × khoản mục, theo hợp đồng.
- Cột **Tỷ trọng** là phần trăm của dòng trên tổng.

## Dòng "(chưa phân loại)"

Là các dòng sổ cái của tài khoản đó **không gắn mã**: phiếu nhập khi chưa khai danh mục, hoặc bút toán tự động từ hệ thống bán hàng. Muốn hết dòng này thì mở lại phiếu, đánh dấu **Khoản mục, bộ phận, hợp đồng**, nhập mã rồi **Ghi lại**.

## Các báo cáo chi tiết theo khoản mục, bộ phận

| Màn | Mã | Nội dung |
|---|---|---|
| Chi tiết chi phí theo khoản mục, bộ phận | ACC47 | Từng dòng phát sinh của tài khoản chi phí, kèm TK đối ứng, khoản mục, bộ phận, nhân viên; lọc theo khoản mục, bộ phận, chi nhánh |
| Tổng hợp theo nhân viên, hợp đồng, bộ phận | ACC69 | Phát sinh Nợ, Có của từng tài khoản theo nhân viên, hợp đồng, bộ phận hoặc khoản mục ghi trên dòng phiếu |
| Sổ nhật ký chi tiền theo khoản mục | ACC75 | Mỗi lần chi tiền một dòng, chia số tiền theo khoản mục gốc (khoản mục cha cao nhất); dòng thuế đi theo khoản mục của dòng chi phí nên số chi gồm cả thuế; không tính chuyển tiền nội bộ |
| Tài khoản chi phí và khoản mục | ACC90 | Chi phí theo tài khoản × khoản mục (tuỳ chọn thêm bộ phận), mỗi chi nhánh một cột |

## Lưu ý

- Số tiền là phát sinh Nợ trừ Có, không tính bút toán kết chuyển.
- Tổng ở đây bằng phát sinh thuần của nhóm tài khoản đó trên **Bảng cân đối số phát sinh (ACC10)** trước kết chuyển.
