# 07. Điều chỉnh kho — `stock_adjustment`

Kiểm kê thừa / thiếu, hàng hỏng, hàng hết hạn huỷ, xuất dùng nội bộ, tặng khách. Mỗi phiếu **một chiều**: tăng hoặc giảm.

<!-- [2026-11-15 Nguyễn Văn Thủy] purposeCode (mục đích xuất) thay lý do để quyết tài khoản đối ứng (đóng góp) -->
**Mục đích xuất** (`purposeCode`) quyết tài khoản đối ứng. Danh sách mục đích đọc ở `GET /api/v1/posting/purposes` (trang [17](17-quy-tac-hach-toan.md)).

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
| `purposeCode` | chuỗi | | Mục đích xuất: `HUY` hủy hàng hỏng, `DUNG-BH` dùng cho bộ phận bán hàng, `TANG-KH` tặng khách dùng thử… Bỏ trống → thừa / thiếu chờ xử lý. Mã phải có và đang dùng, đúng chiều phiếu |
| `reasonCode` | chuỗi | | Nhãn để lọc báo cáo. **Không đổi tài khoản** |
| `partner` | đối tượng | | Người chịu trách nhiệm (nếu có) |
| `lines[]` | | ✓ | Khuôn như [chuyển kho](06-chuyen-kho.md#trường-riêng): `lineKey`, `sku`, `qty` (dương), `amount` (giá vốn; 0 = chờ định giá) |
| `totals.total` | tiền | ✓ | Bằng tổng `amount` |

## Ghi sổ

| Chiều | Nợ | Có |
|---|---|---|
| Tăng | TK kho theo loại kho | TK của mục đích; không mục đích → 3381 thừa chờ xử lý |
| Giảm | TK của mục đích; không mục đích → 1381 thiếu chờ xử lý | TK kho theo loại kho |

Ví dụ giảm kho, `"purposeCode": "HUY"` → Nợ 6328 / Có 1561. Tài khoản cụ thể xem ở màn **Quy tắc hạch toán (ACC41)** hoặc `GET /api/v1/posting/scheme`.
