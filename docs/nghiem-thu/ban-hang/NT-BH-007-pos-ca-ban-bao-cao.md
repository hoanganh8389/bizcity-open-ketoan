# NT-BH-007 · Ca bán và báo cáo bán hàng của máy bán POS
<!-- [2026-11-12 03:10 PM Võ Hoàng] NGHIEM-THU — tạo phiếu: kế hoạch module POS đợt W3 — mở / chốt ca, đếm két, danh sách đơn, tổng quan bán hàng của chi nhánh. (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng — module `pos` (kế hoạch module POS đợt W3) |
| Màn hình | Máy bán POS React: *Chốt ca*, *Đơn hàng*, *Tổng quan* |
| Bộ phận yêu cầu | Bộ phận bán lẻ (cửa hàng trưởng), phòng kế toán (đối chiếu tiền mặt) |
| Ngày tạo | 12/11/2026 |
| Trạng thái | Nháp |

Căn cứ: màn Chốt ca / Tổng quan của POS hiện tại; hợp đồng máy bán `openapi/pos.yaml` (Ca bán, Báo cáo).

## 1. Mục đích quản trị
Mỗi ca bán biết rõ: tiền mặt đầu ca, tiền mặt thu và chi trong ca, tiền phải có trong két, tiền đếm thực tế và chênh lệch; ai mở, ai chốt, chốt lúc nào. Cửa hàng trưởng xem doanh thu theo ngày, theo hình thức thanh toán, nguồn bán, giờ, mặt hàng bán chạy. Số liệu lấy từ đơn và phiếu trả đã ghi sổ (NT-BH-004, NT-BH-005), không nhập tay.

## 2. Khai báo trước
- Chi nhánh `CN01`, hình thức `TM` (tiền mặt), `CK`; mặt hàng như NT-BH-004.
- Một chi nhánh chỉ có **một ca đang mở** tại một thời điểm.

## 3. Các bước thao tác
1. Thu ngân mở ca, nhập tiền đầu ca.
2. Bán, trả hàng trong ca (như NT-BH-004 / 005).
3. Mở *Chốt ca*: xem số liệu tới lúc này; đếm két, nhập tiền đếm được, ghi chú; bấm *Chốt ca*.
4. Cửa hàng trưởng mở *Đơn hàng* (lọc ngày, mã đơn / SĐT, trạng thái) và *Tổng quan* (khoảng ngày).

## 4. Số liệu đầu vào
Tiền đầu ca 1.000.000. Trong ca: đơn A 660.000 (TM 330.000 + CK 330.000); đơn B 325.000 tiền mặt (khách đưa 500.000, thối 175.000); trả 1 hộp đơn B, hoàn tiền mặt 325.000. Tiền đếm được 1.320.000.

## 5. Kết quả mong đợi

| # | Kiểm | Kết quả |
|---|---|---|
| 1 | Mở ca | Ca mới, giờ mở, người mở, tiền đầu ca 1.000.000 |
| 2 | Mở ca lần hai khi đang có ca mở | Từ chối (`POS_SHIFT_ALREADY_OPEN`) |
| 3 | Số đơn / doanh thu ca | 2 đơn, 985.000 |
| 4 | Theo hình thức | TM 655.000 (330.000 + 325.000), CK 330.000 |
| 5 | Tiền mặt thu từ đơn (đã trừ thối) | 655.000 |
| 6 | Tiền mặt chi hoàn | 325.000 |
| 7 | Tiền phải có trong két | 1.000.000 + 655.000 − 325.000 = 1.330.000 |
| 8 | Chốt ca, đếm được 1.320.000 | Chênh lệch −10.000 (thiếu); lưu giờ chốt, người chốt, ghi chú |
| 9 | Chốt ca không ghi sổ | Chốt ca **không** lập chứng từ; chênh lệch tiền xử lý theo mục *Nghiệp vụ cần chốt* |
| 10 | Đơn hàng | Danh sách đơn của chi nhánh, mới nhất trước; tổng tiền của cả kết quả lọc |
| 11 | Tổng quan ngày | Số đơn 2, doanh thu 985.000, trả 1 phiếu 325.000, thuần 660.000; theo hình thức, nguồn bán, giờ, mặt hàng bán chạy |
| 12 | Máy chi nhánh `CN01` | Chỉ thấy ca, đơn, tổng quan của `CN01` |

## 6. Trường hợp lệch chuẩn

| # | Tình huống | Xử lý |
|---|---|---|
| 1 | Chốt ca khi còn đơn chờ trả tiền QR | Báo việc còn dở; chỉ chốt được khi chọn chốt bất chấp + ghi lý do |
| 2 | Chốt ca đã chốt | Từ chối (`POS_SHIFT_CLOSED`); gửi lại cùng khoá idempotency → trả biên bản cũ |
| 3 | Bán khi chưa mở ca | **Đợt này:** vẫn nhận đơn (như hiện tại, đơn gắn ca theo ngày); bắt buộc mở ca trước khi bán là câu hỏi bên dưới |
| 4 | Gửi lại yêu cầu mở / chốt (mất mạng) | Không tạo ca thứ hai, không chốt hai lần |

## 7. Nghiệp vụ cần chốt (phòng kế toán / bán lẻ)

| # | Câu hỏi | Mặc định tạm của đợt này |
|---|---|---|
| Q1 | Chênh lệch két khi chốt ca có lập phiếu thu / chi (thừa, thiếu tiền) không, tài khoản nào? | Không lập chứng từ; chỉ lưu biên bản ca, kế toán xử lý tay |
| Q2 | Có bắt buộc mở ca trước khi bán không? | Không bắt buộc |
| Q3 | Một chi nhánh nhiều máy bán: một ca chung hay mỗi máy một ca? | Một ca chung / chi nhánh |

## 8. Kết quả chạy
| Mục | Mong đợi | Thực tế | Lệch | Ghi chú |
|---|---|---|---|---|
| §5 dòng 1–2 (mở ca) | ca mới; mở lần hai `POS_SHIFT_ALREADY_OPEN` | đúng | — | test NT-BH-007 |
| §5 dòng 3–7 (số liệu ca) | 2 đơn 985.000; TM 655.000, CK 330.000; phải có 1.330.000 | đúng | — | |
| §5 dòng 8–9 (chốt ca) | thiếu 10.000; không lập chứng từ; chốt lại `POS_SHIFT_CLOSED` | đúng | — | |
| §5 dòng 10–11 (đơn hàng, tổng quan) | danh sách + tổng; tổng quan thuần 660.000 | đúng | — | |
| Chạy thật máy bán | mở ca 1.000.000 → bán 14.000 tiền mặt → phải có 1.014.000 → chốt khớp | đúng | — | e2e thật |

## 9. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 10. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 12/11/2026 | Tạo phiếu |
| 12/11/2026 | Ghi kết quả chạy (test tích hợp + chạy thật) |
