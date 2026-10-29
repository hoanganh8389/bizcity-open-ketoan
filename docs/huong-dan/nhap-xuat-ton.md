# Báo cáo nhập xuất tồn hàng hoá (ACC83)

Tồn đầu, nhập, xuất, tồn cuối của từng mặt hàng ở từng chi nhánh trong khoảng ngày, kèm phần mua hàng và giá vốn hàng bán.

## Xem theo

Ô **Xem theo** chọn cách gom:

| Chọn | Mỗi dòng là |
|---|---|
| Mặt hàng (chi tiết) | Một mặt hàng ở một chi nhánh (mặc định) |
| Nhóm hàng, Loại hàng, Nhãn hiệu, Ngành hàng | Một phân loại hàng (khai ở danh mục **Mặt hàng**); hàng chưa phân loại gom vào dòng "(chưa phân loại)" |
| Nhóm hạch toán | Một bộ tài khoản của mặt hàng: hàng hoá thường, hàng khuyến mại, công cụ dụng cụ… (mặt hàng chưa gán nhóm gom vào dòng trống) |
| Chi nhánh | Một chi nhánh |
| Nhà cung cấp, Nhóm nhà cung cấp | Chỉ phần **mua hàng** trong kỳ (nhập mua trừ hàng trả nhà cung cấp), theo đối tượng của phiếu nhập |

Khi gom, cột **Số lượng** cộng thẳng các mặt hàng (khác đơn vị tính chỉ để tham khảo); cột **Giá trị** mới là số so sánh được.

## Cách đọc

| Cột | Gồm |
|---|---|
| Nhập | Nhập mua, khách trả hàng, chuyển kho đến, điều chỉnh tăng |
| Xuất | Bán hàng, trả nhà cung cấp, chuyển kho đi, điều chỉnh giảm |
| Tồn cuối | Tồn đầu + nhập − xuất |
| Mua hàng (trừ trả lại) | Nhập mua − trả nhà cung cấp trong kỳ |
| Giá vốn hàng bán | Xuất bán − khách trả lại trong kỳ, theo giá vốn |

Ở cách xem chi tiết, hai cột mua hàng, giá vốn ẩn sẵn; bật ở nút chọn cột của bảng.

- **Giá trị** lấy theo chứng từ; phần chứng từ chưa có giá trị thì lấy số lượng × đơn giá vốn của tháng (màn **Tính giá vốn**).
- Tháng chưa tính giá vốn thì có dòng nhắc "chưa có giá trị": số lượng vẫn đúng, giá trị chưa đủ.
- Hàng đã xuất khỏi kho nhưng cửa hàng nhận chưa xác nhận thì chưa vào cột nhập của cửa hàng đó (xem số dư tài khoản 1579).

## Căn cứ pháp lý

Chuẩn mực kế toán số 02 — Hàng tồn kho; Thông tư 99/2025/TT-BTC, Phụ lục III (sổ kế toán). Xem thêm màn **Căn cứ pháp lý** (TI11), trang *Hàng tồn kho và giá vốn*.
