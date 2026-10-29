# Báo cáo lưu chuyển tiền tệ (ACC13)

Mẫu B03-DN theo **phương pháp trực tiếp**: tiền thu vào, chi ra trong kỳ, chia theo ba hoạt động kinh doanh, đầu tư, tài chính. "Tiền" là các tài khoản 111, 112, 113.

## Cách tính

Mỗi dòng tiền (dòng ghi Nợ hoặc Có tài khoản 111, 112, 113) được xếp vào một chỉ tiêu, theo thứ tự:

1. **Mã chỉ tiêu ghi trên dòng phiếu** (ô "Lưu chuyển tiền tệ" khi lập phiếu thu, chi, báo có, báo nợ — bấm "Khoản mục, bộ phận" để hiện ô này).
2. **Mã lưu chuyển tiền tệ của lý do** của chứng từ (khai ở Lý do - Tài khoản ACC18).
3. Không có mã thì phần mềm **tự xếp theo tài khoản đối ứng**: thu từ 511, 3331, 131 → chỉ tiêu 01; chi cho 331, 15x, 1331 → 02; chi lương 334 → 03; chi phí đi vay 635 → 04; thuế TNDN 3334 → 05; mua tài sản 211, 213, 241 → 21; vay 341 → 33 (thu) / 34 (trả); còn lại → 06 (thu khác) hoặc 07 (chi khác).

Số của chỉ tiêu = tổng (Nợ − Có) của các dòng tiền mang mã đó: tiền vào là số dương, tiền ra là số âm.

- Tiền chuyển giữa hai tài khoản tiền (rút tiền gửi về quỹ, nộp tiền vào ngân hàng) **không** vào báo cáo.
- **Tiền đầu kỳ (60)** = số dư tài khoản tiền trước "Từ ngày". **Tiền cuối kỳ (70)** = 50 + 60 + 61.

## Kiểm tra

- Nếu tiền cuối kỳ theo báo cáo lệch số dư thật của tài khoản tiền, màn hình báo đỏ kèm số lệch.
- Nếu có dòng tiền phải tự xếp, màn hình nêu tổng số tiền đó để bạn soát và gán mã đúng trên phiếu hoặc trên lý do.

## Căn cứ pháp lý

Thông tư 99/2025/TT-BTC, Phụ lục IV — mẫu B03-DN. Xem thêm màn **Căn cứ pháp lý** (TI11), trang *Hệ thống tài khoản và báo cáo tài chính*.
