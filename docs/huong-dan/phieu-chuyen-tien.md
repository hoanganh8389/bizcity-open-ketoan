# Phiếu chuyển tiền (Q2)

Chuyển tiền giữa các chi nhánh (cửa hàng nộp tiền về văn phòng, văn phòng bổ sung quỹ cửa hàng…). Phiếu **lập ở hệ thống bán hàng** (POS), tự về đây. Nhân viên cửa hàng không xác nhận: **kế toán** đối chiếu rồi xác nhận nơi nhận đã nhận tiền.

## Hai bước ghi sổ

| Bước | Khi nào | Bút toán |
|---|---|---|
| Đã chuyển | Phiếu về từ hệ thống bán hàng | Nơi chuyển: Nợ 11319 tiền đang chuyển / Có tiền (quỹ 1111 hoặc ngân hàng rút) |
| Đã nhận | Kế toán bấm **Xác nhận đã nhận tiền** | Nơi nhận: Nợ tiền (quỹ hoặc ngân hàng nộp) / Có 11319 |

Lý do thu **TBNH** (thu tiền bán hàng các chi nhánh khác) và chuyển tiền giữa hai **đơn vị hạch toán** khác nhau dùng cặp phải thu / phải trả nội bộ 13681 / 33681 thay cho 11319.

## Thao tác

1. Chọn kỳ, chi nhánh (lọc theo nơi chuyển hoặc nơi nhận).
2. Thẻ **Chờ xác nhận**: đối chiếu từng phiếu với sổ quỹ / sao kê ngân hàng nơi nhận (cột **Nộp vào**).
3. Tích các phiếu đã đúng → **Xác nhận đã nhận tiền**.
4. Xác nhận nhầm: bấm vào dòng, mở phiếu, bấm **Bỏ xác nhận** (bút toán nơi nhận bị ghi số âm).

| Cột Nhận tiền | Ý nghĩa |
|---|---|
| Chờ kế toán xác nhận | Tiền đang trên đường, nằm ở 11319 |
| Cần xác nhận lại | Đã xác nhận nhưng phiếu ở cửa hàng bị sửa số tiền / nơi nhận / ngân hàng nộp — bút toán nơi nhận đã đảo |
| Kế toán đã xác nhận | Đã ghi nơi nhận; cửa hàng không sửa được phiếu nữa |

- Tổng thẻ **Chờ xác nhận** cuối tháng phải khớp số dư tài khoản **11319** (Sổ chi tiết tài khoản ACC12).
- Cột **Định khoản** là trạng thái chứng từ ở Định khoản tự động (ACC14); phiếu đang **Chờ định khoản** thì định khoản ở ACC14 trước.
