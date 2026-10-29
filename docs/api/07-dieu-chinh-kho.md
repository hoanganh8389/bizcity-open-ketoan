# 07. Điều chỉnh kho — `stock_adjustment`

Kiểm kê thừa / thiếu, hàng hỏng, hàng hết hạn huỷ, xuất dùng nội bộ. Mỗi phiếu **một chiều**: tăng hoặc giảm.

Mẫu: [`vi-du/dieu-chinh-kho-giam.json`](vi-du/dieu-chinh-kho-giam.json) (kiểm kê thiếu), [`vi-du/dieu-chinh-kho-tang.json`](vi-du/dieu-chinh-kho-tang.json) (kiểm kê thừa, chưa có giá).

```json
{
  "docType": "stock_adjustment",
  "docKey": "kho:adjust:KK-CN02-1025",
  "version": 1,
  "branchCode": "CN02",
  "docNo": "KK-CN02-1025",
  "docDate": "2026-10-25",
  "direction": "decrease",
  "lines": [{ "lineKey": "1", "sku": "SUA400", "name": "Sữa bột 400g", "unit": "Lon", "qty": 1, "amount": 300000 }],
  "totals": { "total": 300000 }
}
```

## Trường riêng

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `direction` | `increase` · `decrease` | ✓ | Tăng (thừa) hay giảm (thiếu, hỏng, xuất dùng) |
| `reasonCode` | chuỗi | | Lý do. Bỏ trống → `NDC` (tăng) / `XDC` (giảm). Muốn ghi vào chi phí (ví dụ hàng hỏng vào 632, xuất dùng vào 641) thì nhờ kế toán khai lý do riêng có tài khoản đối ứng, rồi gửi mã đó |
| `partner` | đối tượng | | Người chịu trách nhiệm (nếu có) |
| `lines[]` | | ✓ | Khuôn như [chuyển kho](06-chuyen-kho.md#trường-riêng): `lineKey`, `sku`, `qty` (dương), `amount` (giá vốn; 0 = chờ định giá) |
| `totals.total` | tiền | ✓ | Bằng tổng `amount` |

## Ghi sổ

| Chiều | Nợ | Có |
|---|---|---|
| Tăng | 1561 | 3381 tài sản thừa chờ xử lý (hoặc tài khoản của lý do) |
| Giảm | 1381 tài sản thiếu chờ xử lý (hoặc tài khoản của lý do) | 1561 |
