# Lãi gộp (BH04)

Doanh thu thuần trừ giá vốn của hàng bán, xem theo mặt hàng, nhóm / loại / nhãn / ngành hàng, chi nhánh, bộ phận (cửa hàng), khách hàng, nhóm khách, tháng.

## Cách tính

| Cột | Gồm |
|---|---|
| Doanh thu thuần | Tiền hàng trước thuế (đã trừ chiết khấu trên hoá đơn) của hàng bán, trừ hàng bị trả lại |
| Giá vốn | Giá vốn gửi kèm chứng từ bán; chứng từ không có giá vốn thì lấy số lượng × đơn giá vốn bình quân của tháng (màn **Tính giá vốn**, như báo cáo nhập xuất tồn). Hàng trả lại trừ giá vốn |
| Trong đó giá vốn hàng tặng | Giá vốn của dòng quà tặng (doanh thu 0), làm giảm lãi gộp. Cột ẩn sẵn, bật ở nút chọn cột |
| Lãi gộp, % lãi gộp | Doanh thu thuần − giá vốn; % trên doanh thu thuần. Âm thì tô đỏ |

- Tháng chưa tính giá vốn thì có dòng nhắc số dòng bán "chưa có giá vốn": lãi gộp đang cao hơn thực tế, cần tính giá vốn trước khi xem.
- Lọc **Loại** (bán / trả lại) và **Phạm vi** (mọi chứng từ / có hoá đơn / nội bộ) như Tổng hợp bán hàng.
- **Theo bộ phận**: lấy bộ phận của chi nhánh (danh mục Chi nhánh). Chi nhánh chưa gắn bộ phận gom vào dòng trống.

Lãi gộp ở đây tính từ dòng hàng bán; số trên sổ cái (giá vốn đã ghi sổ sau khi tính giá vốn) xem ở **Kết quả kinh doanh theo cửa hàng (KQ01)**.
