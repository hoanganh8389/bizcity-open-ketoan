# Tài khoản ngầm định

Mỗi nghiệp vụ (bán hàng, mua hàng, chuyển kho…) ghi Nợ gì, Có gì, và tài khoản lấy từ đâu. Chứng từ từ cửa hàng, kho, mua hàng vào sổ theo đúng màn này.

## Đọc màn

- **Bên trái**: các nghiệp vụ. Bấm một nghiệp vụ để xem.
- **Bảng giữa**: các dòng sổ của nghiệp vụ. Mỗi dòng có:
  - **Bên**: Nợ hay Có.
  - **Dòng sổ**: dòng này để làm gì.
  - **Số tiền**: tiền hàng, tiền thuế, tổng tiền, số đã thu / trả, giá vốn.
  - **Lấy theo**: tài khoản lấy từ đâu.
  - **Tài khoản**: tài khoản đang dùng.
  - **Khi nào**: dòng chỉ có trong trường hợp nào (trống = luôn có).
- Dưới bảng là danh sách **nguồn** của nghiệp vụ: hình thức thanh toán, loại kho, loại thuế, mục đích xuất — mỗi dòng tài khoản của nó.
- **Tất cả tài khoản của quy tắc** ở cuối màn: mọi tài khoản đổi được, kèm phạm vi và nghiệp vụ dùng.

Dòng **đỏ** là tài khoản chưa đặt hoặc là tài khoản tổng hợp — chứng từ dùng tới sẽ báo lỗi khi ghi sổ. Sửa ngay.

## Đổi tài khoản

1. Bấm **Đổi** ở dòng "Tài khoản của quy tắc".
2. Chọn tài khoản. Ô chỉ cho chọn **tài khoản chi tiết** trong **phạm vi đầu số** của dòng đó (ví dụ doanh thu chỉ chọn trong 511).
3. **Ghi**.

Chứng từ ghi sổ từ lúc đổi theo tài khoản mới. Bút toán đã ghi không tự đổi; cần thì định khoản lại ở **Định khoản tự động (ACC14)**.

Khung Nợ / Có không đổi được: đó là nguyên tắc hạch toán của phần mềm.

## Tài khoản lấy theo nguồn khác

| Lấy theo | Sửa ở |
|---|---|
| Hình thức thanh toán (tiền mặt, chuyển khoản, QR…) | Hình thức thanh toán |
| Loại kho của phân kho | Loại kho |
| Loại thuế của dòng | Loại thuế |

Nguồn chưa khai tài khoản thì dùng **tài khoản dự phòng** ghi cạnh dòng.

## Mục đích xuất

Ở nghiệp vụ **Xuất kho không bán** và **Nhập kho khác**. Phiếu ghi mục đích nào (hủy hàng hỏng, dùng cho bộ phận bán hàng, tặng khách dùng thử…) thì ghi vào tài khoản của mục đích đó. Phiếu không ghi mục đích: thiếu / thừa chờ xử lý.

- **Thêm**: mã, tên, dùng cho phiếu giảm / tăng kho, tài khoản đối ứng.
- **Sửa**: mở xem, bấm Sửa. Mã không đổi được.
- Không xoá: bỏ tích **Đang dùng** để ngừng. Phiếu cũ giữ nguyên.

## Xem thử bút toán

Chọn chi nhánh, mã hàng, tiền hàng, loại thuế, số thu ngay / trả lại (hoặc mục đích, với phiếu kho), bấm **Xem thử**. Màn hiện bút toán sẽ ghi và báo **Cân** khi Nợ = Có. Không lưu gì, không ghi sổ.
