# 06. Chuyển kho — `transfer`

Hàng chuyển từ một chi nhánh / kho sang chi nhánh khác (phiếu xuất kho kiêm vận chuyển nội bộ). Không có doanh thu, không có thuế.

Một phiếu chuyển đi qua **hai bước**, gửi **cùng `docKey`**:

| Bước | Gửi | File mẫu |
|---|---|---|
| 1. Kho xuất hàng lên xe | `version: 1`, `status: "shipped"` | [`vi-du/chuyen-kho-da-xuat.json`](vi-du/chuyen-kho-da-xuat.json) |
| 2. Cửa hàng xác nhận đã nhận | `version: 2`, `status: "received"` (giữ nguyên các trường khác, sửa số lượng nếu nhận khác) | [`vi-du/chuyen-kho-da-nhan.json`](vi-du/chuyen-kho-da-nhan.json) |

Hệ thống gửi không có bước xác nhận thì gửi một lần với `status: "received"` (mặc định).

```json
{
  "docType": "transfer",
  "docKey": "kho:transfer:CK0001",
  "version": 1,
  "branchCode": "CN01",
  "toBranchCode": "CN02",
  "docNo": "CK0001",
  "docDate": "2026-10-06",
  "status": "shipped",
  "lines": [
    { "lineKey": "1", "sku": "SUA400", "name": "Sữa bột 400g", "unit": "Lon", "qty": 10, "amount": 3000000 },
    { "lineKey": "2", "sku": "SUA900", "name": "Sữa bột 900g", "unit": "Lon", "qty": 4, "amount": 0 }
  ],
  "totals": { "total": 3000000 }
}
```

## Trường riêng

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `branchCode` | chuỗi | ✓ | Chi nhánh / kho **xuất** |
| `toBranchCode` | chuỗi | ✓ | Chi nhánh / cửa hàng **nhận** (bằng `branchCode` = chuyển giữa hai kho cùng chi nhánh) |
| `status` | `shipped` · `received` | | Mặc định `received` |
| `lines` | mảng, 1–2000 | ✓ | |
| `lines[].lineKey` | chuỗi ≤ 64 | ✓ | |
| `lines[].sku` | chuỗi ≤ 64 | ✓ | Mã hàng |
| `lines[].name`, `unit` | chuỗi | | |
| `lines[].qty` | số | ✓ | Số lượng chuyển (dương) |
| `lines[].amount` | tiền | | Giá trị theo **giá vốn**. Không biết giá vốn thì gửi **0**: cuối tháng phần mềm định giá theo giá vốn bình quân |
| `lines[].warehouseCode` | chuỗi | | Kho **xuất** của chi nhánh xuất. Trống = kho mặc định của chi nhánh |
| `lines[].toWarehouseCode` | chuỗi | | Kho **nhận** của chi nhánh nhận. Trống = kho mặc định. Chuyển giữa hai kho trong **cùng chi nhánh** (`toBranchCode` = `branchCode`): ghi cả hai, khác nhau (không ghi thì coi như xuất / nhận cùng kho mặc định, tồn không đổi) |
| `totals.total` | tiền | ✓ | Bằng tổng `amount` các dòng |
| `partner`, `invoice`, `payments` | | | Không dùng |
| `docDate` | ngày | ✓ | Ngày xuất kho. Bước 2 giữ nguyên ngày này |

## Ghi sổ

| Bút toán tại | Khi nào | Nợ | Có |
|---|---|---|---|
| Chi nhánh **xuất** | Ngay từ bước 1 | 1579 hàng đang chuyển | 1561 |
| Chi nhánh **nhận** | Khi `status = received` | 1561 | 1579 |

- Hai chi nhánh thuộc **hai đơn vị hạch toán khác nhau** thì dùng 13681 thay cho 1579.
- Số dư 1579 = hàng đã xuất mà nơi nhận chưa xác nhận. Kế toán theo dõi số dư này để nhắc cửa hàng.
- Dòng `amount = 0` chưa ghi sổ ngay; hàng vẫn được tính vào tồn kho từng chi nhánh, giá trị có khi tính giá vốn cuối tháng.
