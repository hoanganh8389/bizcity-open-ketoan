# 04. Nhập mua hàng — `purchase`

Hàng mua từ nhà cung cấp nhập vào kho. Mẫu: [`vi-du/nhap-mua.json`](vi-du/nhap-mua.json).

```json
{
  "docType": "purchase",
  "docKey": "kho:KHO01:purchase:9001",
  "version": 1,
  "branchCode": "CN01",
  "docNo": "NM0009001",
  "docDate": "2026-10-03",
  "partner": { "code": "NCC-ABC", "name": "Công ty CP Sữa ABC", "taxCode": "0300588569" },
  "invoice": { "no": "0004567", "serial": "C26TAB", "form": "1", "date": "2026-10-03" },
  "lines": [
    { "lineKey": "1", "sku": "SUA400", "name": "Sữa bột 400g", "unit": "Lon", "qty": 24,
      "amountBeforeTax": 7200000, "taxCode": "V08", "taxAmount": 576000 },
    { "lineKey": "2", "sku": "SUA900", "name": "Sữa bột 900g", "unit": "Lon", "qty": 12,
      "amountBeforeTax": 7320000, "taxCode": "V08", "taxAmount": 585600 }
  ],
  "payments": [],
  "totals": { "beforeTax": 14520000, "tax": 1161600, "total": 15681600 }
}
```

## Trường riêng

Dòng hàng, `totals`, `payments` cùng khuôn với [hoá đơn bán](02-ban-hang.md#trường-riêng-ngoài-trường-chung), khác ở:

| Trường | Ghi chú |
|---|---|
| `branchCode` | Chi nhánh / kho **nhận hàng** |
| `partner` | **Nhà cung cấp**. `code` ổn định (mã NCC hoặc mã số thuế). Bỏ trống → "Nhà cung cấp lẻ" |
| `invoice` | **Hoá đơn đầu vào** của nhà cung cấp. Có thì chứng từ vào sổ hoá đơn và **Báo cáo thuế vào**. Chưa có hoá đơn (hàng về trước) thì bỏ trống, khi có hoá đơn gửi lại `version` mới kèm `invoice` |
| `lines[].qty` | Số lượng nhập (bắt buộc có để tính tồn kho, giá vốn) |
| `lines[].amountBeforeTax` | Tiền hàng **chưa thuế, đã trừ chiết khấu**: đây là **giá nhập kho** |
| `lines[].taxCode` | Loại thuế **đầu vào**: `V05`, `V08`, `V10` (hàng không chịu thuế: dùng mã kế toán khai) |
| `payments` | Tiền **trả ngay** cho nhà cung cấp. Bỏ trống = mua chịu (ghi nợ phải trả) |
| `lines[].cost`, `isGift` | Không dùng |

## Ghi sổ

| Phần | Nợ | Có |
|---|---|---|
| Tiền hàng | 1561 hàng hoá (theo nhóm hàng); lý do có tài khoản chi phí riêng thì vào chi phí | 3312 phải trả người bán (theo nhà cung cấp) |
| Thuế | 1331 thuế GTGT được khấu trừ | 3312 |
| Trả tiền ngay | 3312 | Tài khoản tiền của hình thức |

Hàng vào kho theo số lượng và giá nhập: dùng để tính tồn kho và giá vốn bình quân cuối tháng.
