# Phân loại dài hạn (B01)

Theo Thông tư 99, Báo cáo tình hình tài chính tách **ngắn hạn** và **dài hạn**:
- **Ngắn hạn**: phần thu hồi hoặc thanh toán trong vòng 12 tháng kể từ ngày lập báo cáo.
- **Dài hạn**: phần còn lại, sau 12 tháng.

Phần mềm không biết kỳ hạn của từng khoản phải thu, phải trả hay khoản vay. Vì vậy mặc định mọi số dư đều được trình bày là **ngắn hạn**, và kế toán khai phần dài hạn ở màn này.

## Cách khai

1. Chọn **ngày lập báo cáo**. Ngày này phải đúng ngày cuối kỳ của Báo cáo tình hình tài chính, ví dụ 31/12/2026.
2. Mỗi dòng gồm:
   - **tài khoản**;
   - **đối tượng** (để trống nghĩa là cả tài khoản);
   - **phần dài hạn**;
   - ghi chú, ví dụ số hợp đồng và lịch trả.
3. Bấm **Ghi**. Cột **Số dư thực tế** cho biết số dư tại ngày đó để đối chiếu.
4. **Khai cả ngày cuối năm trước** (ví dụ 31/12/2025) để cột "Số đầu năm" của báo cáo cũng được tách đúng.

Báo cáo chuyển số đã khai từ chỉ tiêu ngắn hạn sang chỉ tiêu dài hạn tương ứng, ví dụ:

| Tài khoản | Dư Nợ: ngắn hạn → dài hạn | Dư Có: ngắn hạn → dài hạn |
|---|---|---|
| 131 | 131 → 211 | 312 → 332 |
| 331 | 132 → 212 | 311 → 331 |
| 138, 244, 338 | 135 → 215 | 320 → 338 |
| 3387 | | 319 → 337 |
| 335 | | 316 → 334 |
| 341 (vay) | | 321 → 339 |
| 352 | | 322 → 343 |

Bảng đầy đủ nằm ở cuối màn.

## Phần mềm tự tách, không cần khai

- **Chi phí chờ phân bổ (242)**: 2421x là ngắn hạn, 2422x là dài hạn. Với các khoản có thẻ công cụ dụng cụ hoặc chi phí trả trước, phần mềm tách theo lịch phân bổ: phần phân bổ trong 12 tháng tới là ngắn hạn.
- **Vay dài hạn 34112**: lên thẳng chỉ tiêu 339.

## Lưu ý

- Nếu số khai lớn hơn số dư thực tế, báo cáo chỉ chuyển tối đa bằng số dư và hiện cảnh báo "vượt số dư".
- Chỉ tách khi xem **cả đơn vị**. Khi lọc theo chi nhánh, mọi số dư trình bày là ngắn hạn.
- Báo cáo tình hình tài chính (ACC8) có dòng "Đã tách ngắn hạn / dài hạn…". Mở dòng đó để xem từng khoản đã chuyển.

## Căn cứ pháp lý

Thông tư 99/2025/TT-BTC, Phụ lục IV — hướng dẫn lập Báo cáo tình hình tài chính (phân loại ngắn hạn, dài hạn theo thời hạn còn lại 12 tháng). Xem thêm màn **Căn cứ pháp lý** (TI11).
