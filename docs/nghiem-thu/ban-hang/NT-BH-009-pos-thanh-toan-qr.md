# NT-BH-009 · Thanh toán QR chuyển khoản ở máy bán POS
<!-- [2026-11-12 11:50 PM Võ Hoàng] NGHIEM-THU — tạo phiếu: đơn trả bằng QR chuyển khoản qua module pos (chờ tiền → xác nhận → hoàn tất / huỷ). (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng — module `pos`; cổng QR ở website (`tgs_pos`, VietQR + sao kê VietinBank) |
| Màn hình | Máy bán POS React: nút *QR chuyển khoản* (F7), hộp mã QR, *Xác nhận đã nhận tiền*, *Tạo mã mới*, *Huỷ đơn* |
| Bộ phận yêu cầu | Bộ phận bán lẻ, phòng kế toán (đối soát tiền về tài khoản) |
| Ngày tạo | 12/11/2026 |
| Trạng thái | Nháp — mặc định tạm, phòng kế toán sửa sau |

## 1. Mục đích quản trị
Khách trả bằng QR thì đơn chỉ hoàn tất khi tiền về (ngân hàng báo có) hoặc thu ngân xác nhận đã thấy tiền (như POS cũ, có ghi ai bấm, lúc nào). Đơn không trả thì huỷ được, sổ không còn doanh thu ảo.

## 2. Khai báo trước
- Hình thức thanh toán `QR` (Quét mã QR) — tài khoản do kế toán đặt ở định khoản mặc định (tiền gửi chờ đối soát hoặc tiền gửi ngân hàng).
- Cổng QR của website đã nối tài khoản nhận tiền của cửa hàng.

## 3. Các bước thao tác
1. Thu ngân bán 2 hộp 330.000, bấm *QR chuyển khoản*: máy hiện mã QR 660.000, hạn 5 phút.
2. Khách chuyển khoản; website thấy giao dịch khớp mã phiếu + đúng tiền → máy báo đã nhận tiền → đơn hoàn tất.
3. Ca khác: khách chuyển nhưng ngân hàng chưa báo — thu ngân xem tài khoản, bấm *Xác nhận đã nhận tiền* (ghi chú).
4. Ca khác: hết hạn, bấm *Tạo mã mới*; hoặc khách không trả, bấm *Huỷ đơn*.

## 4. Số liệu đầu vào
Đơn 2 hộp × 330.000 = 660.000, trả QR toàn bộ; đơn chia tiền 330.000 tiền mặt + 330.000 QR.

## 5. Kết quả mong đợi

| # | Kiểm | Kết quả |
|---|---|---|
| 1 | Gửi đơn QR | Đơn **Chờ trả tiền**, có mã phiếu; chứng từ bán nộp ngay (hình thức QR), có phần `qr` {số tiền, hạn} |
| 2 | Ngân hàng báo có đúng tiền | Đơn **Hoàn tất**, `qr.paidAt`, nguồn = ngân hàng; website nhận bản sao sổ (như đơn thường) |
| 3 | Thu ngân bấm xác nhận | Hoàn tất, ghi người xác nhận, giờ, ghi chú, nguồn = bấm tay |
| 4 | Xác nhận lại lần nữa | Trả đơn đã hoàn tất, không ghi gì thêm |
| 5 | Số tiền báo về khác phần QR | Từ chối `POS_PAYMENT_MISMATCH` |
| 6 | Tạo mã mới trong ngày bán | Dời hạn thêm 5 phút |
| 7 | Tạo mã mới / bấm tay sau ngày bán | Từ chối `POS_QR_EXPIRED` (ngân hàng báo có thì vẫn nhận — khách đã trả tiền) |
| 8 | Huỷ đơn chờ | Đơn **Đã huỷ**, chứng từ bán bị đảo (hoặc chờ kế toán huỷ nếu loại chứng từ đặt chờ duyệt) |
| 9 | Báo tiền về cho đơn đã huỷ | Từ chối `POS_ORDER_CANCELLED` — kế toán hoàn tiền tay |
| 10 | Chốt ca khi còn đơn chờ | Chặn chốt thường, chỉ chốt bất chấp + lý do (NT-BH-007) |

## 6. Trường hợp lệch chuẩn

| # | Tình huống | Xử lý |
|---|---|---|
| 1 | Website không gọi được máy chủ kế toán khi ngân hàng báo có | Máy bán (đang mở hộp QR) chuyển tiếp xác nhận; website giữ trạng thái đã trả để đối soát |
| 2 | Đơn chia tiền (TM + QR) | Phần QR quyết định trạng thái; phần tiền mặt ghi như thường |

**Giới hạn đợt này (đề xuất lên Core):** website chưa tự gọi được module (khoá app chỉ xin được quyền Core — `APP_SCOPES`), nên xác nhận đi qua máy bán của thu ngân, ghi rõ nguồn (ngân hàng / bấm tay). Khi Core cho app xin quyền module, cổng website gọi thẳng như thiết kế ban đầu.

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
