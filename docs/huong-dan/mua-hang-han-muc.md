# Hạn mức & công nợ đến hạn (MH05)

> Số liệu là **số liệu thật** của đơn vị: phiếu mua **duyệt là ghi sổ** (bút toán, công nợ, kho). Ở bản thử muốn có sẵn 25 tình huống để tập: màn **Tổng quan mua hàng (MH00)** → **Nạp dữ liệu mẫu** (xoá được bằng **Xoá dữ liệu mẫu**).

## Thẻ Hạn mức công nợ

- **Theo NCC**: thanh màu = nợ đã ghi **theo sổ** (công nợ tài khoản 331, mọi nguồn) + đang chờ (phiếu chờ duyệt, đơn đặt chưa nhận) / hạn mức; còn lại hoặc vượt. Ô **Tính đến ngày** xem lại tại một ngày bất kỳ.
- **Hạn mức toàn nhãn**:
  - phần đã phân bổ cho từng chi nhánh và phần chưa phân bổ;
  - **Điều chuyển hạn mức**: từ chi nhánh / phần chưa phân bổ sang chi nhánh khác. Không cho chuyển quá phần còn của nơi chuyển; mỗi lần chuyển ghi nhật ký (trước / sau).
- **Chỉ tiêu cung ứng**: giá trị đã nhập (trước thuế) so với chỉ tiêu tháng của từng chi nhánh.

Phiếu dùng tới 90% hạn mức → cảnh báo; vượt → chặn duyệt (xem MH03).

## Thẻ Đến hạn / quá hạn / tuổi nợ

- **Khoản nợ**: mọi khoản phải trả NCC đang mở trong sổ (kể cả phiếu từ hệ thống khác); phiếu nhập có lịch trả nhiều đợt tách **từng đợt**.
- **Đối trừ**: tiền trả / ứng trước / trả hàng / thưởng trừ vào khoản **hạn sớm trước** (FIFO).
- **6 nhóm tuổi nợ**: chưa đến hạn, đến hạn, quá hạn 1–7, 8–15, 16–30, > 30 ngày.
- **Cảnh báo**: quá hạn (đỏ), đến hạn hôm nay (vàng), sắp đến hạn trong 3 ngày (xanh).
- **Hạn**: theo điều khoản từng phiếu / chính sách NCC (ngày làm việc trừ T7, CN, lễ; ngày lịch; công nợ cố định).

**Thẻ Đến hạn:**
- Lọc theo nhà cung cấp và **chi nhánh**.
- Số ngày báo "sắp đến hạn" đổi ở **Cài đặt mua hàng (MH12)**.
