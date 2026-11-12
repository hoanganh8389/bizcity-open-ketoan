# NT-BH-003 · Khuyến mại ở máy bán POS theo Chương trình bán (BH12)
<!-- [2026-11-12 08:45 PM Võ Hoàng] NGHIEM-THU — tạo phiếu: máy bán áp chương trình bán khai ở BH12, Core tính quà / giảm giá, trừ hạn mức theo cửa hàng (S031-15 / S031-16 phần chương trình bán; đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng — Chương trình bán (BH12, Core) + module `pos` + máy bán POS React |
| Màn hình | BH12 *Chương trình bán* (khai, hạn mức, **Thử tính**); máy bán: giỏ hàng tự hiện quà / giảm giá, dòng quà 0đ |
| Bộ phận yêu cầu | Bộ phận kinh doanh (khai chương trình), bộ phận bán lẻ, phòng kế toán (định khoản theo loại chương trình) |
| Ngày tạo | 12/11/2026 |
| Trạng thái | Nháp — mặc định tạm, phòng kế toán sửa sau |

## 1. Mục đích quản trị
Chương trình khuyến mại khai **một nơi** (BH12) và **một luật tính** (Core): máy bán, cửa nạp chứng từ và báo cáo cùng ra một kết quả. Mỗi dòng quà / dòng giảm giá trên phiếu bán ghi rõ chương trình nào, bản nào — kế toán định khoản theo loại chương trình, bộ phận kinh doanh xem chương trình đã dùng bao nhiêu ở từng cửa hàng. Plugin chính sách bán của website (`tgs_selling_policy`) đóng băng, không nhận chương trình mới.

## 2. Khai báo trước
- BH12: loại chương trình (KM-NCC, KM-CTY, XA-DATE…) đã có quy tắc định khoản (B1); tài khoản quà do kế toán đặt.
- Chương trình **tặng hàng**: mặt hàng mua, số lượng mua, hàng tặng, số lượng tặng, thời gian, hạn mức từng cửa hàng. Đợt này luôn **tặng lặp lại** (mua 4 tặng 2), không trần quà; ô *Tặng một lần* / *Trần quà trên đơn* / *Kênh bán* ở BH12 làm đợt sau.
- Chương trình **giảm giá**: mặt hàng, đúng một cách giảm (phần trăm / số tiền trên một đơn vị / giá bán chương trình), thời gian, hạn mức từng cửa hàng.
- Hàng tặng là hàng Nội bộ / không gửi thuế (mã Z, quà dưới 24 tháng) thì vẫn tặng được; dòng đó không lên hoá đơn điện tử (chốt 10/11).

## 3. Các bước thao tác
1. Bộ phận kinh doanh mở BH12, tạo chương trình *Mua 2 hộp SUA330 tặng 1 hộp QUA01*, hạn mức CN01 = 10, CN02 = 5. Bấm **Thử tính** với giỏ 4 hộp ở CN01 → thấy "tặng 2 QUA01".
2. Tạo chương trình *Giảm 10 % SUA900* ở CN01, hạn mức 20.
3. Thu ngân CN01 quét 4 hộp SUA330 và 1 hộp SUA900: máy tự thêm dòng quà 2 × QUA01 0đ (ghi tên chương trình) và giảm 10 % dòng SUA900.
4. Thu tiền → phiếu bán gửi kế toán có dòng quà, dòng giảm, mỗi dòng mang mã + bản chương trình.
5. BH12 thấy CN01 đã dùng 2 / 10 quà, 1 / 20 giảm giá. Huỷ đơn → trả lại hạn mức.

## 4. Số liệu đầu vào
- SUA330 giá 330.000 / hộp, SUA900 giá 900.000 / hộp, QUA01 (quà, không gửi thuế).
- Đơn: 4 SUA330 + 1 SUA900 → tiền hàng 2.220.000, giảm 90.000, phải thu 2.130.000; quà 2 QUA01 0đ.

## 5. Kết quả mong đợi

| # | Kiểm | Kết quả |
|---|---|---|
| 1 | Core tính chương trình tặng hàng của BH12 (`POST /api/v1/policies/evaluate`) | 4 SUA330 → `gifts` 2 QUA01 kèm `policyRef` {mã CT, bản, `line: gift`}; 3 SUA330 → 1 QUA01 (dư 1 không đủ lần hai) |
| 2 | Core tính chương trình giảm giá | SUA900 giá 900.000 × 10 % → `discounts` 90.000 trên dòng; giảm theo số tiền / theo giá chương trình tương tự; giá chương trình cao hơn giá bán → không giảm |
| 3 | Hạn mức cửa hàng | CN02 hết hạn mức (hoặc không được giao) → chương trình nằm ở `skipped` với lý do; CN01 còn → áp |
| 4 | Thử tính ở BH12 | Cùng kết quả như dòng 1–3 (một hàm tính) |
| 5 | Máy bán gửi đơn có quà / giảm | Đơn nhận; phiếu bán có dòng quà 0đ (`isGift`, `policyRef` line gift), dòng giảm (`policyRef` line discount), đầu phiếu `policyRefs`; cửa nạp không báo lệch (IN-POL-001..004) |
| 6 | Trừ hạn mức | Phiếu bán ghi sổ → CN01 đã dùng tăng đúng số quà / số hàng giảm; gửi lại cùng phiếu không trừ thêm |
| 7 | Huỷ đơn | Hạn mức trả lại đủ |
| 8 | Dòng quà / dòng giảm thiếu chương trình | Từ chối `POS_GIFT_WITHOUT_POLICY` (quà 0đ phải có căn cứ) |
| 9 | Hàng tặng không gửi thuế (mã Z) | Đơn nhận; dòng quà ghi không gửi thuế, không lên hoá đơn điện tử |
| 10 | Sửa chương trình | Bản mới ở sổ đăng ký; đơn trước đó vẫn trỏ bản cũ, truy vết được |

## 6. Trường hợp lệch chuẩn

| # | Tình huống | Xử lý |
|---|---|---|
| 1 | Hai máy cùng bán khi hạn mức còn 1 | Cả hai đơn vẫn nhận (đã bán thật); hạn mức ghi vượt, báo cáo BH12 hiện phần vượt (chốt 05/11: "vượt ít thì báo cáo") |
| 2 | Máy mất mạng, tự tính theo bản đã tải | Đơn gửi bù vẫn nhận; cửa nạp tính lại theo đúng bản máy nêu, lệch thì vào hàng *Chờ kế toán xem* (IN-POL-004), không chặn bán |
| 3 | Khách trả hàng có quà | Như hiện nay (NT-BH-005): trả hàng chính phải trả kèm phần quà vượt suất. Trả lại hạn mức theo phiếu trả: **đợt sau** |
| 4 | Thu ngân cần gọi Core tính | Vé đăng nhập của máy bán thêm quyền đọc danh mục `catalog:read` (chỉ đọc) để gọi `policies/evaluate` |

**Ngoài đợt này (đợt sau, cùng nơi khai BH12):** chương trình có bậc (mua nhiều giảm nhiều), quà theo tổng đơn, voucher / mã giảm giá, combo, mua bất kỳ tặng món rẻ nhất, theo khung giờ / thứ trong tuần / sinh nhật khách; áp riêng (không cộng dồn); trần pháp lý NĐ81; công cụ chuyển chương trình cũ từ plugin website sang BH12.

## 7. Kết quả chạy
| Mục | Mong đợi | Thực tế | Lệch | Ghi chú |
|---|---|---|---|---|

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 12/11/2026 | Tạo phiếu |
