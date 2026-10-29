# 01. Quy ước chung

## Địa chỉ và xác thực

| | |
|---|---|
| Địa chỉ gốc | `https://<máy chủ>/api/v1` |
| Xác thực | Header `X-Api-Key: <khoá>`. Mỗi khoá gắn với **một đơn vị** (công ty); chứng từ tự vào đúng đơn vị của khoá |
| Quyền của khoá | `documents:write` gửi, huỷ, đọc chứng từ · `reports:read` đọc báo cáo để đối chiếu · `catalog:write` tạo chi nhánh, đối tượng |
| Kiểu dữ liệu | JSON, UTF-8, header `Content-Type: application/json` |

## Gửi chứng từ

| Lời gọi | Dùng khi |
|---|---|
| `POST /documents` | Gửi một chứng từ |
| `POST /documents/batch` | Gửi nhiều chứng từ: `{ "documents": [ … ] }`, tối đa **200** chứng từ một lần |
| `POST /documents/cancel` | Huỷ chứng từ: `{ "docKey": "…", "reason": "…" }` (xem [08-sua-huy.md](08-sua-huy.md)) |

Loại chứng từ chọn bằng trường `docType`:

| `docType` | Chứng từ | Trang |
|---|---|---|
| `sale` | Hoá đơn bán hàng | [02](02-ban-hang.md) |
| `sale_return` | Hàng bán trả lại | [03](03-tra-hang-ban.md) |
| `purchase` | Nhập mua hàng | [04](04-nhap-mua.md) |
| `purchase_return` | Trả hàng nhà cung cấp | [05](05-tra-hang-ncc.md) |
| `transfer` | Chuyển kho giữa chi nhánh | [06](06-chuyen-kho.md) |
| `stock_adjustment` | Điều chỉnh kho, kiểm kê | [07](07-dieu-chinh-kho.md) |
| `cash_transfer` | Chuyển tiền giữa chi nhánh, nộp / rút ngân hàng | [10](10-chuyen-tien.md) |
| `customer_payment` | Thu tiền khách trả nợ (kể cả thu hộ) | [11](11-thu-tien-khach.md) |
| `supplier_payment` | Trả tiền nhà cung cấp (kể cả trả hộ) | [12](12-tra-tien-ncc.md) |

## Kiểu giá trị

| Kiểu | Quy tắc |
|---|---|
| Tiền | Số (không phải chuỗi), đơn vị **đồng**. Dùng số đã làm tròn như trên hoá đơn |
| Số lượng | Số, được có phần lẻ |
| Ngày | `YYYY-MM-DD`, hoặc ISO 8601 đầy đủ (`2026-10-09T14:30:00+07:00`); phần mềm lấy phần ngày |
| Mã | Chuỗi, bỏ khoảng trắng hai đầu. Phân biệt chữ hoa, chữ thường |

## Trường chung của mọi chứng từ

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `docType` | chuỗi | ✓ | Xem bảng trên |
| `docKey` | chuỗi 3–160 | ✓ | **Khoá duy nhất, không bao giờ đổi** của chứng từ ở hệ thống gửi. Gợi ý: `<hệ thống>:<chi nhánh>:<loại>:<id>`, ví dụ `pos:26001:sale:3058` |
| `version` | số nguyên ≥ 1 | | Mặc định 1. Tăng lên mỗi khi nội dung chứng từ đổi |
| `branchCode` | chuỗi ≤ 32 | ✓ | Mã chi nhánh / cửa hàng (đã khai báo ở danh mục) |
| `docNo` | chuỗi ≤ 64 | ✓ | Số phiếu in trên giấy |
| `docDate` | ngày | ✓ | Ngày chứng từ, quyết định kỳ kế toán |
| `reasonCode` | chuỗi ≤ 32 | | Lý do (quyết định tài khoản). Bỏ trống → lý do mặc định của loại chứng từ |
| `description` | chuỗi ≤ 1000 | | Diễn giải |
| `partner` | đối tượng | | Khách hàng / nhà cung cấp: `code` (ổn định, ví dụ số điện thoại, mã NCC), `name`, `taxCode`, `address`, `email`, `phone`. Đối tượng tự được tạo / cập nhật theo `code` |
| `employee` | đối tượng | | Nhân viên phụ trách (người bán, người thu tiền): `code` (ổn định, ví dụ tên đăng nhập), `name`. Ghi vào mọi dòng sổ của chứng từ để xem công nợ theo nhân viên; mã chưa có thì tự thêm vào danh mục Nhân viên |
| `invoice` | đối tượng | | Hoá đơn đã phát hành (xem trang của từng loại) |
| `internalOnly` | true / false | | `true` = chứng từ nội bộ: không vào sổ hoá đơn, không chuyển sang hệ thống thuế |
| `sourceSystem` | chuỗi ≤ 32 | | Tên hệ thống gửi (để tra cứu) |
| `extra` | đối tượng | | Dữ liệu riêng của bên gửi, lưu nguyên để tra cứu, **không dùng để định khoản** |

**Sổ kế toán**: mỗi đơn vị có **một sổ kế toán**, mọi chứng từ (kể cả `internalOnly`) đều ghi vào đó khi được định khoản. Chứng từ có `invoice` hợp lệ và không `internalOnly` thì vào thêm **sổ hoá đơn**; phiếu bán, phiếu trả có số hoá đơn được chuyển định kỳ sang **hệ thống thuế** (một cơ sở dữ liệu riêng) thành chứng từ mới. Bên gửi không phải làm gì thêm cho việc này.

**Nhận ≠ ghi sổ**: chứng từ nhận được lưu lại và hiện ở màn **Định khoản tự động (ACC14)**; mặc định kế toán chọn chứng từ rồi định khoản (status `pending`). Loại chứng từ được đặt chế độ định khoản ngay thì ghi sổ luôn (status `posted`).

## Khuôn phản hồi

Thành công:

```json
{ "ok": true, "data": { "docKey": "pos:CN01:sale:3058", "version": 1, "status": "posted", "entryIds": ["5012", "5013"] } }
```

| `status` | Nghĩa | Bên gửi làm gì |
|---|---|---|
| `pending` | Đã nhận, chờ kế toán định khoản ở ACC14 | Đánh dấu đã gửi |
| `posted` | Đã nhận và ghi sổ ngay (loại chứng từ đặt định khoản ngay) | Đánh dấu đã gửi |
| `unchanged` | Đã có đúng phiên bản này rồi | Đánh dấu đã gửi |
| `error` | Đã nhận, chưa ghi sổ được (`error.code`, `error.message`): thiếu cấu hình, kỳ đã khoá… | Đánh dấu đã gửi. Kế toán sửa rồi định khoản lại ở ACC14, **không cần gửi lại**. Gửi lại cũng an toàn |

Thất bại (chứng từ **không được nhận**, phải sửa rồi gửi lại):

```json
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "Tổng tiền chứng từ không khớp", "details": ["Tổng thuế 31850 ≠ tổng các dòng 31852"] } }
```

| HTTP | `error.code` | Nguyên nhân thường gặp |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Sai khuôn (thiếu trường, sai kiểu), tổng tiền không khớp các dòng, chi nhánh chưa khai báo |
| 401 | `UNAUTHORIZED` | Thiếu hoặc sai khoá API |
| 403 | `FORBIDDEN` | Khoá không có quyền cần thiết |
| 409 | `CONFLICT` | Gửi `version` nhỏ hơn phiên bản phần mềm đang giữ |
| 409 | `PERIOD_LOCKED` | Huỷ chứng từ thuộc tháng đã khoá sổ (gửi chứng từ vào tháng đã khoá thì nhận `status: "error"` thay vì lỗi này) |
| 500 | `INTERNAL_ERROR` | Lỗi máy chủ: gửi lại sau |

## Gửi theo lô

`POST /documents/batch` trả `data` là **mảng kết quả theo đúng thứ tự gửi**, `meta` đếm số chứng từ theo trạng thái. Mỗi chứng từ xử lý độc lập: chứng từ sai khuôn trong lô nhận `status: "error"` (không làm hỏng cả lô).

## Gửi lại khi mạng lỗi

Không nhận được phản hồi (mất mạng, hết thời gian chờ) thì **cứ gửi lại y nguyên**. Nhờ `docKey` + `version`, chứng từ không bao giờ bị ghi hai lần.
