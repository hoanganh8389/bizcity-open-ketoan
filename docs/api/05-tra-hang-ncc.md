# 05. Trả hàng nhà cung cấp — `purchase_return`

Trả lại hàng đã mua. Mẫu: [`vi-du/tra-hang-ncc.json`](vi-du/tra-hang-ncc.json).

Khuôn **giống nhập mua** ([04](04-nhap-mua.md)), khác ở:

| Trường | Ghi chú |
|---|---|
| `docType` | `"purchase_return"` |
| `originalDocKey` | `docKey` của phiếu nhập mua gốc |
| `branchCode` | Chi nhánh / kho **xuất trả** |
| `lines` | Số lượng, số tiền gửi **số dương** (số hàng trả) |
| `invoice` | Hoá đơn xuất trả (nếu có): lên bảng kê mua vào với số âm |
| `payments` | Tiền nhà cung cấp **trả lại** (nếu có) |

## Ghi sổ

| Phần | Nợ | Có |
|---|---|---|
| Tiền hàng | 3312 (theo nhà cung cấp) | 1561 |
| Thuế | 3312 | 1331 |
| Nhà cung cấp trả lại tiền | Tài khoản tiền | 3312 |
