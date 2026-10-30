# 02. Hoá đơn bán hàng — `sale`

Một phiếu bán / hoá đơn bán lẻ, bán buôn. Mẫu: [`vi-du/ban-hang.json`](vi-du/ban-hang.json).

```json
{
  "docType": "sale",
  "docKey": "pos:CN01:sale:3058",
  "version": 1,
  "branchCode": "CN01",
  "docNo": "CN01AA20515",
  "docDate": "2026-10-09",
  "partner": { "code": "0912345678", "name": "Nguyễn Văn A", "taxCode": "0101234567" },
  "invoice": { "no": "0054969", "serial": "C26TNH", "form": "1", "date": "2026-10-09", "status": "valid" },
  "lines": [
    { "lineKey": "7062", "sku": "SUA400", "name": "Sữa bột 400g", "unit": "Lon", "qty": 1,
      "amountBeforeTax": 398148, "taxCode": "R08", "taxAmount": 31852 },
    { "lineKey": "7063", "sku": "QT01", "name": "Quà tặng kèm", "unit": "Cái", "qty": 1,
      "amountBeforeTax": 0, "taxCode": "R08", "taxAmount": 0, "isGift": true }
  ],
  "payments": [
    { "methodCode": "TM", "amount": 230000 },
    { "methodCode": "QR", "amount": 200000, "reference": "FT26282123456" }
  ],
  "totals": { "beforeTax": 398148, "tax": 31852, "total": 430000 }
}
```

## Trường riêng (ngoài [trường chung](01-quy-uoc.md#trường-chung-của-mọi-chứng-từ))

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `partner` | đối tượng | | Người mua. Bỏ trống → "Khách lẻ" |
| `employee` | đối tượng | | Nhân viên lập phiếu: `{ "code": "nv.lan", "name": "Nguyễn Thị Lan" }` (xem Quy ước chung) |
| `invoice.no` | chuỗi ≤ 32 | ✓ nếu có `invoice` | Số hoá đơn |
| `invoice.serial`, `invoice.form` | chuỗi ≤ 32 | | Ký hiệu, mẫu số hoá đơn |
| `invoice.date` | ngày | ✓ nếu có `invoice` | Ngày hoá đơn (bảng kê thuế lọc theo ngày này) |
| `invoice.status` | `valid` · `replaced` · `adjusted` · `cancelled` | | Mặc định `valid`. `cancelled` thì không vào sổ hoá đơn, không chuyển sang hệ thống thuế |
| `invoice.buyerName`, `buyerLegalName`, `buyerTaxCode`, `buyerAddress` | chuỗi | | Thông tin người mua in trên hoá đơn (bảng kê thuế dùng) |
| `invoice.relatedInvoiceNo`, `relation` | chuỗi, `replaces` · `adjusts` | | Hoá đơn này thay thế / điều chỉnh hoá đơn nào |
| `lines` | mảng, tối đa 2000 | ✓ | Dòng hàng |
| `lines[].lineKey` | chuỗi ≤ 64 | ✓ | Khoá dòng ở hệ thống gửi |
| `lines[].sku`, `name`, `unit`, `qty` | | | Mã hàng, tên, đơn vị tính, số lượng. `sku` quyết định nhóm tài khoản doanh thu / giá vốn |
| `lines[].unitPrice` | tiền | | Đơn giá (chỉ để tham khảo) |
| `lines[].amountBeforeTax` | tiền | ✓ | Tiền hàng **trước thuế, đã trừ chiết khấu**, làm tròn như hoá đơn |
| `lines[].discount` | tiền | | Chiết khấu của dòng (thông tin; đã trừ trong `amountBeforeTax`) |
| `lines[].taxCode` | chuỗi ≤ 16 | ✓ | Loại thuế đầu ra: `KCT`, `R00`, `R05`, `R08`, `R10` |
| `lines[].taxAmount` | tiền | | Tiền thuế của dòng. Mặc định 0 |
| `lines[].isGift` | true / false | | Hàng tặng, khuyến mãi (tiền 0) |
| `lines[].cost` | tiền | | Giá vốn của dòng nếu đã biết. **Thường bỏ trống**: cuối tháng phần mềm tự tính giá vốn bình quân |
| `lines[].warehouseCode` | chuỗi | | Kho xuất hàng (trả lại: kho nhận hàng trả). Trống = kho mặc định của chi nhánh — sổ kho ghi theo kho này |
| `lines[].lotNo` | chuỗi | | Số lô (thông tin) |
| `payments` | mảng | | Các khoản thu. Bỏ trống = bán chịu (ghi công nợ) |
| `payments[].methodCode` | chuỗi | ✓ | Hình thức thanh toán: `TM`, `CK`, `QR`, `POS`, `VOUCHER`, `CONGNO`, `DOI_TRU`… |
| `payments[].amount` | tiền | ✓ | |
| `payments[].reference`, `paidAt` | | | Mã giao dịch, thời điểm thu |
| `totals.beforeTax`, `tax`, `total` | tiền | ✓ | Phải bằng tổng các dòng (tới đồng lẻ); `total = beforeTax + tax` |

## Phần mềm kế toán ghi sổ thế nào

| Phần | Nợ | Có |
|---|---|---|
| Tiền hàng | 1311 phải thu khách | 51111 doanh thu (theo nhóm hàng) |
| Thuế | 1311 | 33311 thuế GTGT đầu ra |
| Thu tiền (mỗi khoản, trừ hình thức "ghi nợ") | Tài khoản tiền của hình thức (1111, 112…) | 1311 |
| Giá vốn | 6321 | 1561 (cuối tháng, khi tính giá vốn) |

Có hoá đơn hợp lệ → thêm một dòng ở bảng kê hoá đơn bán ra (sổ hoá đơn), và phiếu được chuyển sang hệ thống thuế.

## Bán nội bộ cho chi nhánh khác

Một chi nhánh bán hàng cho chi nhánh khác **theo giá bán** (mẫu [`vi-du/ban-noi-bo.json`](vi-du/ban-noi-bo.json)): gửi như hoá đơn bán, thêm

- `"reasonCode": "XCN"`;
- `partner.code` = `CN-<mã chi nhánh mua>` (ví dụ `CN-CN02`), để công nợ nội bộ theo dõi đúng chi nhánh.

Ghi sổ: Nợ 13681 phải thu nội bộ / Có 51116 doanh thu nội bộ; thuế như thường; **giá vốn ghi ngay bằng giá bán**: Nợ 6326 / Có 1561. Hàng bán kiểu này **không tính vào đơn giá vốn bình quân** của tháng.

## Lỗi hay gặp

- `Tổng tiền chứng từ không khớp`: cộng lại `amountBeforeTax`, `taxAmount` các dòng cho bằng `totals`.
- `Loại thuế R8 chưa khai báo`: dùng đúng mã `R08`.
- `Hình thức thanh toán MOMO chưa khai báo`: nhờ kế toán thêm hình thức này, hoặc dùng mã đã có.
