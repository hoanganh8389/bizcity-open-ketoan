# API tích hợp: gửi chứng từ vào phần mềm kế toán

Dành cho hệ thống nghiệp vụ (bán hàng, kho…) cần đẩy chứng từ sang kế toán.

> **Bộ tài liệu chi tiết cho bên gửi, mỗi loại chứng từ một trang kèm file JSON mẫu đã kiểm tự động: [`docs/api/`](api/README.md).** Trang này là bản tóm tắt. Danh sách mọi API, thử trực tiếp: `/api/docs`.

## 1. Quy ước chung

| | |
|---|---|
| Địa chỉ gốc | `https://<máy chủ>/api/v1` |
| Xác thực | Header `X-Api-Key: <khoá>` (khoá gắn với một đơn vị) |
| Kiểu dữ liệu | JSON, UTF-8. Tiền là số (đồng). Ngày `YYYY-MM-DD` hoặc ISO 8601 |
| Phản hồi | Thành công `{ "ok": true, "data": …, "meta": … }` · Thất bại `{ "ok": false, "error": { "code", "message", "details" } }` |

Mã lỗi ổn định: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `PERIOD_LOCKED`, `POSTING_FAILED`, `UNBALANCED_ENTRY`, `INTERNAL_ERROR`.

## 2. Nguyên tắc gửi

1. **Chỉ gửi sự việc**: bán gì, bao nhiêu, thuế bao nhiêu, thu bằng gì. Không gửi tài khoản Nợ/Có.
2. **Số tiền đã chốt ở nguồn**, đúng như trên hoá đơn đã phát hành. Kế toán không tính lại thuế.
3. **`docKey` duy nhất và ổn định** cho mỗi chứng từ (ví dụ `btsoft:<shop>:sale:<id>`).
4. **`version` tăng dần** khi nội dung đổi. Gửi lại cùng version → `unchanged`. Version mới → khi định khoản lại, kế toán ghi số âm bút toán cũ rồi ghi bút toán mới. Version nhỏ hơn bản đang có → `409 CONFLICT`.
5. Mọi **mã** (chi nhánh, loại thuế, hình thức thanh toán, lý do) phải có trong danh mục bên kế toán.

> **Nhận, định khoản và số liệu thuế.** Chứng từ gửi sang được lưu làm chứng từ nguồn và hiện ở màn **Định khoản tự động (ACC14)**; mặc định kế toán chọn chứng từ rồi định khoản (loại chứng từ đặt chế độ định khoản ngay thì ghi sổ luôn). Mỗi đơn vị có **một sổ kế toán** (sổ nhật ký chung). Chứng từ có hoá đơn vào thêm **sổ hoá đơn**; số liệu thuế lấy từ **hệ thống thuế** — một cơ sở dữ liệu riêng, được chuyển định kỳ các phiếu bán, phiếu trả có số hoá đơn. Phiếu `internalOnly` không vào sổ hoá đơn, không chuyển sang hệ thống thuế.

## 3. Gửi chứng từ

`POST /documents` (một chứng từ) · `POST /documents/batch` (`{ "documents": [ … ] }`, tối đa 200)

### Hoá đơn bán hàng

```json
{
  "docType": "sale",
  "docKey": "btsoft:95:sale:3058",
  "version": 1,
  "branchCode": "26001",
  "docNo": "26001AA20515",
  "docDate": "2026-10-09",
  "partner": { "code": "0912345678", "name": "Nguyễn Văn A", "taxCode": "0101234567" },
  "invoice": { "no": "0054969", "serial": "C26TNH", "form": "1", "date": "2026-10-09", "status": "valid" },
  "lines": [
    { "lineKey": "7062", "sku": "100861007", "name": "Sữa bột 400g", "unit": "Lon", "qty": 1,
      "amountBeforeTax": 398148, "taxCode": "R08", "taxAmount": 31852 },
    { "lineKey": "7063", "sku": "QT01", "name": "Quà tặng", "qty": 1,
      "amountBeforeTax": 0, "taxCode": "R08", "taxAmount": 0, "isGift": true }
  ],
  "payments": [ { "methodCode": "TM", "amount": 430000, "reference": "PT0002" } ],
  "totals": { "beforeTax": 398148, "tax": 31852, "total": 430000 }
}
```

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| `docType` | ✓ | `sale` hoặc `sale_return` |
| `docKey`, `branchCode`, `docNo`, `docDate` | ✓ | |
| `version` | | Mặc định 1 |
| `partner` | | Bỏ trống → "Khách lẻ". `code` ổn định (thường là số điện thoại) |
| `invoice` | | Có hoá đơn hợp lệ → chứng từ vào **sổ hoá đơn** và được chuyển sang hệ thống thuế. `status`: `valid`, `replaced`, `adjusted`, `cancelled` |
| `internalOnly` | | `true` = phiếu nội bộ: không vào sổ hoá đơn, không chuyển sang hệ thống thuế |
| `lines[].amountBeforeTax` | ✓ | Tiền trước thuế, **đã trừ chiết khấu**, làm tròn như trên hoá đơn |
| `lines[].taxCode`, `taxAmount` | ✓ | Mã loại thuế đã khai báo; tiền thuế của dòng |
| `lines[].isGift` | | Hàng tặng (0 đồng) |
| `lines[].cost` | | Giá vốn của dòng nếu đã có; bỏ trống thì ghi giá vốn sau |
| `payments[]` | | Mỗi khoản thu: `methodCode` đã khai báo + `amount` |
| `totals` | ✓ | Phải bằng tổng các dòng (kiểm tới xu); `total = beforeTax + tax` |
| `reasonCode` | | Bỏ trống → lý do mặc định của loại chứng từ |
| `extra` | | Dữ liệu riêng của nguồn, lưu để tra cứu |

### Hàng bán trả lại / điều chỉnh giảm

Như trên với `"docType": "sale_return"`, thêm `originalDocKey` (khoá hoá đơn gốc). Số tiền gửi **dương** (số hàng trả); `payments` là tiền trả lại khách.

### Nhập mua hàng

`"docType": "purchase"`, cùng khuôn với hoá đơn bán:

- `partner` là **nhà cung cấp** (bỏ trống → "Nhà cung cấp lẻ"); `invoice` là **hoá đơn đầu vào** (có thì vào sổ hoá đơn và Báo cáo thuế vào).
- Dòng hàng dùng **loại thuế đầu vào** (`V05`, `V08`, `V10`…); `amountBeforeTax` là tiền hàng chưa thuế, đã trừ chiết khấu.
- `payments` là tiền trả ngay (bỏ trống = mua chịu, ghi nợ nhà cung cấp).
- Định khoản: Nợ 1561 (kho của nhóm hàng) / Có 3312; thuế Nợ 1331 / Có 3312; trả tiền Nợ 3312 / Có tiền.

### Trả hàng nhà cung cấp

`"docType": "purchase_return"`, như nhập mua, thêm `originalDocKey` (khoá phiếu nhập gốc). Số tiền gửi **dương**. Định khoản ngược: Nợ 3312 / Có 1561, Có 1331.

### Chuyển kho

```json
{
  "docType": "transfer",
  "docKey": "kho:CK0001",
  "version": 1,
  "branchCode": "KHO-TONG",
  "toBranchCode": "26001",
  "docNo": "CK0001",
  "docDate": "2026-10-06",
  "status": "shipped",
  "lines": [{ "lineKey": "1", "sku": "SUA01", "name": "Sữa bột 900g", "unit": "Hộp", "qty": 10, "amount": 700000 }],
  "totals": { "total": 700000 }
}
```

| Trường | | Ghi chú |
|---|---|---|
| `branchCode` | ✓ | Chi nhánh **xuất** |
| `toBranchCode` | ✓ | Chi nhánh **nhận** |
| `status` | | `shipped` hàng đã lên đường; `received` cửa hàng đã nhận (mặc định) |
| `lines[].qty` | ✓ | Số lượng (dương) |
| `lines[].amount` | | Giá trị theo **giá vốn**; để 0 nếu chưa có → phần mềm định giá khi tính giá vốn cuối tháng |
| `totals.total` | ✓ | Bằng tổng `amount` các dòng |

- Phía xuất ghi khi định khoản phiếu: Nợ 1579 hàng đang chuyển / Có 1561. Khi cửa hàng xác nhận, gửi lại **cùng `docKey`, `version` tăng, `status: "received"`**: phía nhận ghi Nợ 1561 / Có 1579. Hai chi nhánh khác đơn vị hạch toán thì dùng 13681 thay cho 1579.
- Không có doanh thu, không có thuế.

### Điều chỉnh kho

`"docType": "stock_adjustment"`, thêm `"direction": "increase"` (kiểm kê thừa…) hoặc `"decrease"` (kiểm kê thiếu, hàng hỏng, xuất dùng…). Dòng hàng như chuyển kho (`sku`, `qty`, `amount`). Định khoản: tăng Nợ 1561 / Có 3381; giảm Nợ 1381 / Có 1561 (đổi tài khoản đối ứng bằng `reasonCode` có khai tài khoản riêng, ví dụ xuất dùng vào 641).

### Kết quả

```json
{ "ok": true, "data": { "docKey": "btsoft:95:sale:3058", "version": 1, "status": "posted", "entryIds": ["…", "…"] } }
```

| `status` | Nghĩa | Việc phía gửi |
|---|---|---|
| `pending` | Đã nhận, chờ kế toán định khoản ở **Định khoản tự động (ACC14)** | Ghi nhận xong |
| `posted` | Đã nhận và ghi sổ ngay (loại chứng từ đặt định khoản ngay) | Ghi nhận xong |
| `unchanged` | Đã có đúng phiên bản này | Ghi nhận xong |
| `error` | Nhận được nhưng chưa ghi sổ (`error.code`, `error.message`) | Không cần gửi lại ngay: kế toán sửa cấu hình rồi định khoản lại ở ACC14. Gửi lại cũng an toàn |

Lô: `data` là mảng kết quả từng chứng từ, `meta` đếm theo trạng thái. Chứng từ lỗi không chặn chứng từ khác.

## 4. Huỷ chứng từ

`POST /documents/cancel` `{ "docKey": "…", "reason": "…" }` — kế toán ghi số âm toàn bộ bút toán và bỏ khỏi sổ hoá đơn.

## 5. Danh mục cần khớp

| Danh mục | Lấy / tạo |
|---|---|
| Chi nhánh | `GET /branches` · `POST /branches` `{ code, name }` (khoá cần phạm vi `catalog:write`) |
| Loại thuế | `GET /tax-codes` — mặc định KCT, R00, R05, R08, R10 |
| Hình thức thanh toán | `GET /posting/payment-methods` — mặc định TM, CK, QR, POS, VOUCHER, CONGNO, DOI_TRU |
| Đối tượng | Tự tạo theo `partner` trong chứng từ; hoặc `PUT /partners/:code` |

## 6. Đọc lại để đối chiếu

| Việc | Lời gọi |
|---|---|
| Trạng thái chứng từ | `GET /documents?search=<docKey>` |
| Bảng kê bán ra | `GET /reports/sales-invoices?from=&to=&branchCodes=` |
| Cân đối phát sinh | `GET /reports/trial-balance?from=&to=` |

## 7. Ví dụ gửi từ WordPress

Plugin `tgs_accounting_bridge` (trong hệ thống bán hàng) là bản mẫu đầy đủ: đọc phiếu, dựng khuôn này, tự tăng phiên bản theo mã băm nội dung, gửi theo lô 100, ghi nhật ký, tự huỷ phiếu đã xoá.

```bash
php wp-content/plugins/tgs_accounting_bridge/tools/day-ke-toan.php --blog=95 --from=2026-10-01 --to=2026-10-09 --dry
```
