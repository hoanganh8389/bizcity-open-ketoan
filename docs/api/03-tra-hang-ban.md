# 03. Hàng bán trả lại — `sale_return`

Khách trả hàng, hoặc hoá đơn điều chỉnh giảm. Mẫu: [`vi-du/tra-hang-ban.json`](vi-du/tra-hang-ban.json).

Khuôn **giống hệt hoá đơn bán** ([02](02-ban-hang.md)), khác ở:

| Trường | Ghi chú |
|---|---|
| `docType` | `"sale_return"` |
| `originalDocKey` | `docKey` của phiếu bán gốc (nên gửi để tra cứu) |
| `lines` | Ít nhất 1 dòng. Số tiền, số lượng gửi **số dương** (số hàng trả) |
| `payments` | Tiền **trả lại khách** (nếu có) |
| `docDate` | **Ngày trả hàng** (không phải ngày bán): doanh thu giảm vào kỳ của ngày trả |

## Ghi sổ

| Phần | Nợ | Có |
|---|---|---|
| Giảm doanh thu | 52131 hàng bán bị trả lại | 1311 |
| Giảm thuế | 33311 | 1311 |
| Trả tiền khách | 1311 | Tài khoản tiền |
| Nhập lại kho | 1561 | 6321 (cuối tháng, khi tính giá vốn) |

Có `invoice` (hoá đơn điều chỉnh giảm) thì lên bảng kê bán ra với số âm.
