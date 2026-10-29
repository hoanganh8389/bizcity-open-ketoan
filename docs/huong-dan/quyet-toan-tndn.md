# Quyết toán thuế TNDN (03/TNDN)

Lập tờ khai quyết toán thuế thu nhập doanh nghiệp năm (phần chỉ tiêu chính của mẫu 03/TNDN).

## Số liệu

- **[A1] Tổng lợi nhuận kế toán trước thuế**: chỉ tiêu 50 của Báo cáo kết quả kinh doanh, cả năm. Muốn số đúng thì đã tính giá vốn, khấu hao, phân bổ cho đủ 12 tháng.
- **Thuế suất**: gợi ý theo tổng doanh thu năm (doanh thu thuần + doanh thu tài chính + thu nhập khác):
  - đến 3 tỷ đồng: 15%;
  - trên 3 đến 50 tỷ đồng: 17%;
  - còn lại: 20%.

  Kế toán kiểm tra điều kiện áp dụng và sửa nếu cần.
- **[E] Thuế đã tạm nộp trong năm**: gợi ý bằng phát sinh Nợ 3334 trong năm trên sổ kế toán. Sửa nếu có khoản Nợ 3334 không phải tiền nộp.

## Kế toán nhập

| Chỉ tiêu | Nội dung |
|---|---|
| [B2]–[B7] | Điều chỉnh **tăng** lợi nhuận. Hay gặp nhất là **[B4] chi phí không được trừ**: phạt vi phạm hành chính, chi không có hoá đơn chứng từ hợp lệ, chi thanh toán từ 5 triệu bằng tiền mặt, khấu hao vượt mức… |
| [B9]–[B11] | Điều chỉnh **giảm** lợi nhuận |
| [B14] | Thu nhập từ chuyển nhượng bất động sản (tách khỏi hoạt động sản xuất kinh doanh) |
| [C2] | Thu nhập miễn thuế |
| [C3a] [C3b] | Lỗ các năm trước được chuyển (tối đa 5 năm), lỗ bất động sản được bù trừ |
| [C5] | Trích quỹ khoa học công nghệ |
| [C11]–[C14] | Ưu đãi thuế suất, miễn giảm, thuế đã nộp ở nước ngoài |
| [D2] | Thuế từ chuyển nhượng bất động sản |

## Kết quả

- **[D]** tổng thuế phải nộp cả năm; **[G] = [D] − [E]**: dương là còn phải nộp, âm là nộp thừa.
- **Kiểm tra tạm nộp**: tạm nộp 4 quý phải đạt ít nhất **80%** số thuế quyết toán. Thiếu thì phần thiếu tính tiền chậm nộp từ ngày kế tiếp hạn nộp thuế quý 4 (30/01 năm sau). Màn sẽ cảnh báo.
- Hạn nộp tờ khai quyết toán và tiền thuế: **ngày cuối tháng thứ 3** sau khi hết năm (31/3).
- Sau khi nộp, ghi sổ số thuế quyết toán bằng phiếu kế toán: Nợ 8211 / Có 3334 phần chênh lệch với số đã ghi trong năm.

## Lưu và nộp

- **Lưu nháp** / **Lưu chính thức**. Tờ khai chính thức bị khoá. Bấm **Mở lại để sửa** nếu chưa nộp.
- **Xuất Excel** rồi nhập số vào phần mềm khai thuế, cổng thuế điện tử.
- Phần mềm chưa lập các phụ lục chi tiết (03-1A kết quả kinh doanh, 03-2 chuyển lỗ, 03-3 ưu đãi). Lập riêng theo số đã nhập.

## Thông tin người nộp thuế

Màn **Thông tin người nộp thuế** (TT01) lưu tên, mã số thuế, địa chỉ, cơ quan thuế quản lý, đại lý thuế, người ký, in ở phần đầu tờ khai.

## Căn cứ pháp lý

Luật Thuế TNDN 67/2025/QH15 (thuế suất 15%, 17%, 20%); Luật Quản lý thuế 38/2019/QH14 (hạn nộp, tiền chậm nộp 0,03%/ngày); Nghị định 126/2020/NĐ-CP sửa đổi bởi Nghị định 91/2022/NĐ-CP (tạm nộp 80%); Thông tư 80/2021/TT-BTC (mẫu 03/TNDN). Các mức thuế suất và điều kiện áp dụng cần đối chiếu văn bản gốc và nghị định hướng dẫn trước khi nộp.
