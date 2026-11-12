# NT-BH-010 · Hoá đơn điện tử cho đơn máy bán POS
<!-- [2026-11-12 11:50 PM Võ Hoàng] NGHIEM-THU — tạo phiếu: người mua trên hoá đơn điện tử lưu ở đơn module pos, đi theo bản sao sổ sang website để plugin hoá đơn phát hành. (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng — module `pos`; phát hành hoá đơn ở website (plugin hoá đơn Viettel, không sửa) |
| Màn hình | Máy bán POS React: nút *Hoá đơn VAT* ở hộp *Đã chốt đơn* và ở chi tiết đơn |
| Bộ phận yêu cầu | Phòng kế toán (thuế), bộ phận bán lẻ |
| Ngày tạo | 12/11/2026 |
| Trạng thái | Nháp — mặc định tạm, phòng kế toán sửa sau |

## 1. Mục đích quản trị
Khách cần hoá đơn VAT: thông tin người mua (MST, tên công ty, địa chỉ, email) lưu ở **đơn** trong phần mềm kế toán — một nguồn — rồi đi theo bản sao sổ sang website, nơi plugin hoá đơn phát hành như POS cũ. Quà sữa dưới 24 tháng không đưa lên hoá đơn (chốt B4).

## 2. Khai báo trước
- Bản sao sổ sang website đang chạy (app `tgs-wp`, phiếu NT-BH-005 phần bản sao).
- Plugin hoá đơn đã cấu hình cho cửa hàng.

## 3. Các bước thao tác
1. Sau khi chốt đơn, thu ngân bấm *Hoá đơn VAT*, nhập MST `0101234567`, tên công ty, địa chỉ, email; bấm *Phát hành*.
2. Máy lưu người mua vào đơn; website nhận bản sao mới; máy tra phiếu bán trên website rồi gọi plugin phát hành.

## 4. Số liệu đầu vào
Một đơn đã hoàn tất 660.000 (2 hộp, thuế 8 %).

## 5. Kết quả mong đợi

| # | Kiểm | Kết quả |
|---|---|---|
| 1 | Lưu người mua | Đơn có `invoiceBuyer` {MST, tên công ty, địa chỉ, email}; gửi lại cùng nội dung → không đổi gì |
| 2 | MST sai khuôn (không 10 / 13 số) | Từ chối ngay (`VALIDATION_ERROR`, ô MST) |
| 3 | Đơn chưa hoàn tất / đã huỷ | Từ chối (`POS_ORDER_CANCELLED` / chưa hoàn tất) |
| 4 | Bản sao website | Phiếu bán bản sao có `invoice_buyer` trong meta (lần ghi bản sao kế tiếp, cùng `local_ledger_id`) |
| 5 | Tra phiếu bán trên website | `GET /wp-json/tgs-pos/v1/einvoice/sale/{orderId}` trả `saleLedgerId`, `mirrored: true` |
| 6 | Dòng quà dưới 24 tháng | Nằm trong `excludedSkus`, không đưa lên hoá đơn |

## 6. Trường hợp lệch chuẩn

| # | Tình huống | Xử lý |
|---|---|---|
| 1 | Bản sao chưa về kịp | Máy hỏi lại sau vài giây (`mirrored: false`) |
| 2 | Plugin hoá đơn báo lỗi | Như POS cũ: báo lỗi, thử lại; đơn không đổi |

## 7. Kết quả chạy
| Mục | Mong đợi | Thực tế | Lệch | Ghi chú |
|---|---|---|---|---|
| §5 dòng 1, 6 (lưu người mua, quà dưới 24 tháng) | đơn có `invoiceBuyer` (MST, công ty, địa chỉ, email, `excludedSkus`); gửi lại không đổi | đúng | — | test NT-BH-010, 12/11 |
| §5 dòng 2–3 (MST sai, đơn chưa xong / đã huỷ) | `VALIDATION_ERROR`; chưa hoàn tất từ chối; `POS_ORDER_CANCELLED` | đúng | — | |
| §5 dòng 4 (bản sao website) | bản sao mang người mua, cùng phiếu | sự kiện phiên bản 2 phát đúng; website đè theo phiên bản (tgs_pos 4651051) | — | chạy thật Docker + LocalWP: đợt kế |
| §5 dòng 5 (tra phiếu trên website) | `mirrored: true` | chưa chạy | — | phần website, chạy cùng lần thử thật |

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 12/11/2026 | Tạo phiếu |
| 12/11/2026 | Ghi kết quả chạy (test NT-BH-010 2/2) |
