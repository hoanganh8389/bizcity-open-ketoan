# 17. Quy tắc hạch toán — đọc quy tắc, mục đích xuất, xem thử bút toán
<!-- [2026-11-15 Nguyễn Văn Thủy] API Quy tắc hạch toán cho hệ thống nguồn (đóng góp) -->

Bên gửi **không gửi tài khoản**. Trang này để bên gửi biết chứng từ mình gửi sẽ thành bút toán gì, và thử trước khi gửi thật.
Nguyên tắc đầy đủ: [docs/nghiep-vu/24-quy-tac-hach-toan.md](../nghiep-vu/24-quy-tac-hach-toan.md).

| API | Quyền | Dùng để |
|---|---|---|
| `GET /api/v1/posting/scheme` | đọc danh mục | Khung Nợ / Có của từng nghiệp vụ + tài khoản đang dùng của mọi nguồn |
| `GET /api/v1/posting/purposes` | đọc danh mục | Danh sách mục đích xuất (mã gửi trong `purposeCode` của `stock_adjustment`) |
| `POST /api/v1/posting/scheme/preview` | ghi chứng từ | Gửi một chứng từ, nhận lại bút toán sẽ ghi. **Không lưu, không ghi sổ** |
| `PUT /api/v1/posting/scheme/accounts/:key` | cấu hình | Đổi tài khoản của quy tắc (màn ACC41 dùng; hệ thống nguồn không cần) |
| `PUT /api/v1/posting/purposes/:code` | cấu hình | Thêm / sửa mục đích xuất (màn ACC41 dùng) |

## Đọc quy tắc

```json
GET /api/v1/posting/scheme
{
  "ok": true,
  "data": {
    "businesses": [
      { "code": "sale", "name": "Bán hàng", "docType": "sale", "description": "…",
        "groups": [
          { "name": "Doanh thu", "lines": [
            { "side": "debit",  "role": "Phải thu khách", "amount": "total", "source": "rule", "key": "receivable" },
            { "side": "credit", "role": "Doanh thu",      "amount": "goods", "source": "rule", "key": "revenue" },
            { "side": "credit", "role": "Thuế đầu ra",    "amount": "tax",   "source": "tax",  "key": "tax_output" } ] } ] } ],
    "keys": [ { "key": "revenue", "label": "Doanh thu bán hàng", "range": ["511"], "accountCode": "51111", "accountName": "…", "status": "ok" } ],
    "sources": { "paymentMethods": [ … ], "warehouseTypes": [ … ], "taxCodes": [ … ], "purposes": [ … ] }
  }
}
```

| Trường của dòng | Nghĩa |
|---|---|
| `side` | `debit` Nợ · `credit` Có |
| `amount` | `goods` tiền hàng · `tax` tiền thuế · `total` tổng · `paid` số đã thu / trả · `cost` giá vốn |
| `source` | Tài khoản lấy từ đâu: `rule` tài khoản của quy tắc (`keys[key]`) · `payment` hình thức thanh toán · `warehouse` loại kho của phân kho · `tax` loại thuế · `purpose` mục đích xuất |
| `key` | Khoá tài khoản của quy tắc; với nguồn khác là **tài khoản dự phòng** khi nguồn đó chưa khai tài khoản |
| `when` | Khi nào có dòng này (trống = luôn có) |

`status` của tài khoản: `ok` · `missing` chưa đặt · `unknown` không có trong hệ thống tài khoản · `summary` là tài khoản tổng hợp · `fallback` nguồn chưa khai, dùng dự phòng.

## Mục đích xuất

Phiếu `stock_adjustment` (xuất kho không bán, nhập kho khác) gửi `purposeCode` để chọn tài khoản đối ứng:

```json
{ "docType": "stock_adjustment", "direction": "decrease", "purposeCode": "HUY", "…": "…" }
```

| Mã gốc | Mục đích | Chiều |
|---|---|---|
| `HUY` | Hủy hàng hỏng, hết hạn | giảm |
| `MAT` | Mất, thất thoát hàng | giảm |
| `TANG-KH` | Tặng khách dùng thử, marketing | giảm |
| `DUNG-BH` | Dùng cho bộ phận bán hàng | giảm |
| `DUNG-QL` | Dùng cho bộ phận quản lý | giảm |
| `DAO-TAO` | Đào tạo bộ phận bán hàng | giảm |
| `THUONG-NV` | Thưởng, tặng nhân viên bằng hàng | giảm |
| `NGOAI-GIAO` | Ngoại giao, biếu tặng | giảm |
| `THUA-TN` | Hàng thừa ghi thu nhập khác | tăng |

Danh sách thật của đơn vị: `GET /api/v1/posting/purposes`. Không gửi `purposeCode` → thừa / thiếu chờ xử lý. Mã không có, đã ngừng dùng hoặc sai chiều → chứng từ vào hàng chờ với lỗi định khoản.

## Xem thử bút toán

Gửi đúng khuôn chứng từ như khi gửi thật (`docKey` bất kỳ, sẽ được thay):

```json
POST /api/v1/posting/scheme/preview
{ "document": {
    "docType": "sale", "docKey": "thu", "branchCode": "08000", "docNo": "THU", "docDate": "2026-11-15",
    "lines": [ { "lineKey": "1", "sku": "SUA01", "name": "Sữa bột", "unit": "Hộp", "qty": 1,
                 "amountBeforeTax": 100000, "taxCode": "R08", "taxAmount": 8000, "cost": 70000 } ],
    "payments": [ { "methodCode": "TM", "amount": 108000 } ],
    "totals": { "beforeTax": 100000, "tax": 8000, "total": 108000 } } }
```

```json
{ "ok": true, "data": { "ok": true, "entries": [
  { "docType": "sale", "lines": [
      { "accountCode": "1311",  "debit": 108000, "credit": 0,      "description": "Doanh thu bán hàng" },
      { "accountCode": "51111", "debit": 0,      "credit": 100000, "description": "Doanh thu bán hàng" },
      { "accountCode": "33311", "debit": 0,      "credit": 8000,   "description": "Thuế GTGT đầu ra" },
      { "accountCode": "6321",  "debit": 70000,  "credit": 0,      "description": "Giá vốn hàng bán" },
      { "accountCode": "1561",  "debit": 0,      "credit": 70000,  "description": "Giá vốn hàng bán" } ] },
  { "docType": "customer_payment", "lines": [
      { "accountCode": "1111", "debit": 108000, "credit": 0 },
      { "accountCode": "1311", "debit": 0,      "credit": 108000 } ] } ] } }
```

Cấu hình thiếu (ví dụ hình thức thanh toán chưa khai) → `data.ok = false`, `data.error` nêu chỗ thiếu. Số liệu trên là minh hoạ; tài khoản thật theo cấu hình của đơn vị.

## Các tình huống bán hàng quy về loại chứng từ nào

| Tình huống ở quầy | Gửi |
|---|---|
| Bán thu đủ / thu một phần / bán nợ | `sale` — `payments` là các khoản thu ngay; thiếu bao nhiêu thành công nợ khách |
| Thu nợ sau, khách đặt cọc | `customer_payment` |
| Đổi hình thức thanh toán của bill đã gửi | Gửi lại `sale` cùng `docKey`, `version` + 1 |
| Khách trả hàng, trả lại tiền | `sale_return` có `payments` |
| Khách trả hàng, trừ công nợ | `sale_return` không `payments` |
| Đổi hàng | `sale_return` (hàng cũ) + `sale` (hàng mới) |
| Hoàn tiền riêng (trả tiền thừa) | `customer_payment` với `"direction": "out"` |
| Hàng tặng kèm | Dòng của `sale` với `"isGift": true`, 0 đồng |
| Bill nội bộ không sang thuế | `sale` với `"internalOnly": true` |
