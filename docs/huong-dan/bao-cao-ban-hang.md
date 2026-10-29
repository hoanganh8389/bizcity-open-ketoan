# Báo cáo bán hàng (BH01)

Liệt kê **từng mặt hàng** đã bán và trả lại trong kỳ: mỗi dòng hàng trên chứng từ là một dòng báo cáo.

## Cách đọc

- **Hàng trả lại** có nhãn "Trả lại", số lượng và số tiền hiện **số âm**. Nhờ vậy dòng tổng cộng là số thuần (bán trừ trả lại).
- **Tiền hàng** là tiền trước thuế, đã trừ chiết khấu, đúng như trên hoá đơn. **Tổng tiền** = tiền hàng + tiền thuế.
- Hàng có nhãn "Tặng" là hàng khuyến mãi, tiền bằng 0.
- Bốn ô số phía trên và dòng tổng cộng tính trên **toàn bộ kết quả lọc**.

## Ô lọc

| Ô | Ý nghĩa |
|---|---|
| Từ ngày – Đến ngày | Theo ngày chứng từ (phiếu trả lại tính theo ngày trả) |
| Chi nhánh | Một chi nhánh hoặc tất cả |
| Loại | Bán và trả lại / chỉ bán / chỉ trả lại |
| Phạm vi | Tất cả chứng từ / chỉ chứng từ có hoá đơn / chỉ chứng từ nội bộ |
| Tìm kiếm | Mã hàng, tên hàng, số chứng từ, số hoá đơn, tên hoặc mã khách. Gõ xong bấm **Tìm** |

## Thao tác

- Bấm vào một dòng để mở chứng từ gốc và bút toán đã ghi.
- **Xuất Excel** xuất toàn bộ kết quả lọc (tối đa 50.000 dòng).

Chỉ tính chứng từ đang hiệu lực: chứng từ đã huỷ không có trong báo cáo; chứng từ sửa thì lấy nội dung mới nhất.
