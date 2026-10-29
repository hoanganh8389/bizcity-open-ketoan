# 11. Thu tiền khách hàng — `customer_payment`

Khách trả nợ (hoá đơn bán chịu đã gửi trước đó). Dùng cho cả **thu hộ**: khách trả tiền tại cửa hàng A cho hoá đơn của cửa hàng B. Mẫu [`vi-du/thu-tien-khach.json`](vi-du/thu-tien-khach.json).

Tiền thu ngay lúc bán thì **không** dùng phiếu này: gửi trong `payments` của hoá đơn bán.

```json
{
  "docType": "customer_payment",
  "docKey": "quy:CN01:customer_payment:2201",
  "version": 1,
  "branchCode": "CN01",
  "docNo": "PT0002201",
  "docDate": "2026-10-15",
  "partner": { "code": "0912345678", "name": "Nguyễn Văn A" },
  "methodCode": "CK",
  "lines": [
    { "lineKey": "1", "amount": 1200000, "invoiceDocKey": "pos:CN01:sale:3101" },
    { "lineKey": "2", "amount": 800000, "branchCode": "CN02", "invoiceDocKey": "pos:CN02:sale:887" }
  ],
  "totals": { "total": 2000000 }
}
```

## Trường riêng

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `branchCode` | chuỗi | ✓ | Chi nhánh **thu tiền** (nơi lập phiếu, nơi nhận tiền) |
| `partner` | đối tượng | nên có | Khách hàng trả nợ (`code` phải trùng mã khách trên hoá đơn bán). Bỏ trống → "Khách lẻ" |
| `methodCode` | chuỗi | ✓ | Hình thức thu: quyết định tài khoản tiền (`TM`, `CK`, `QR`, `POS`…) |
| `lines` | mảng ≤ 2000 | | Phân bổ tiền thu cho từng khoản nợ. Bỏ trống = cả phiếu trả cho công nợ tại chi nhánh lập phiếu |
| `lines[].lineKey` | chuỗi ≤ 64 | ✓ | |
| `lines[].amount` | tiền > 0 | ✓ | Số tiền trả cho khoản này |
| `lines[].branchCode` | chuỗi | | Chi nhánh **đang giữ công nợ** (hoá đơn). Bỏ trống = chi nhánh lập phiếu. **Khác chi nhánh lập phiếu = thu hộ** |
| `lines[].invoiceDocKey` | chuỗi | | `docKey` hoá đơn được trả (để tra cứu) |
| `lines[].description` | chuỗi | | |
| `totals.total` | tiền > 0 | ✓ | Tổng tiền thu. Phải **≥ tổng phân bổ**; phần thừa ghi giảm công nợ khách tại chi nhánh lập phiếu |

## Ghi sổ

| Khoản | Bút toán tại | Nợ | Có |
|---|---|---|---|
| Công nợ cùng chi nhánh | Chi nhánh lập phiếu | Tiền | 1311 (theo khách) |
| **Thu hộ** chi nhánh B | Chi nhánh lập phiếu (A) | Tiền | 33681 phải trả nội bộ (đối tượng: B) |
| | Chi nhánh B | 13681 phải thu nội bộ (đối tượng: A) | 1311 (theo khách) |
| Thu thừa | Chi nhánh lập phiếu | Tiền | 1311 (theo khách) |

Sau khi thu hộ: công nợ khách ở B đã giảm; A đang giữ tiền của B (33681 ở A, 13681 ở B). Hai chi nhánh thanh toán cho nhau bằng phiếu [chuyển tiền](10-chuyen-tien.md) hoặc phiếu kế toán bù trừ.
