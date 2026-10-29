# 09. Danh mục phải khớp

Chứng từ chỉ gửi **mã**; mã phải có sẵn ở phần mềm kế toán. Bên gửi đọc danh mục để đối chiếu trước khi gửi.

| Danh mục | Đọc | Tạo / sửa | Mã mặc định |
|---|---|---|---|
| Chi nhánh, kho, cửa hàng | `GET /api/v1/branches` | `POST /api/v1/branches` `{ "code", "name", "accountingUnitCode" }` (quyền `catalog:write`) | Mã cửa hàng của hệ thống bán hàng (ví dụ `26001`) |
| Loại thuế | `GET /api/v1/tax-codes` | Kế toán khai | Bán ra: `KCT`, `R00`, `R05`, `R08`, `R10`. Mua vào: `V05`, `V08`, `V10` |
| Hình thức thanh toán | `GET /api/v1/posting/payment-methods` | Kế toán khai | `TM` tiền mặt, `CK` chuyển khoản, `QR`, `POS` quẹt thẻ, `VOUCHER`, `CONGNO` ghi nợ, `DOI_TRU` đối trừ |
| Lý do | `GET /api/v1/posting/reasons` | Kế toán khai | Bán `XBA`, bán nội bộ `XCN`, trả lại `NTH1`, nhập mua `NMH1`, trả NCC `XTR1`, chuyển kho `XCKho`, điều chỉnh tăng `NDC`, giảm `XDC`, chuyển tiền `CTIEN`, thu tiền khách `TTKH`, trả tiền NCC `TTNCC` |
| Đối tượng (khách, NCC) | `GET /api/v1/partners` | **Tự tạo** theo `partner` trong chứng từ; một đối tượng `PUT /api/v1/partners/:code`; **đồng bộ hàng loạt** `PUT /api/v1/partners` `{ "partners": [{ "code", "name", "kind", "taxCode", "groupCode", … }] }` (tối đa 1000) | |
| Nhóm đối tượng | `GET /api/v1/partner-groups` | `PUT /api/v1/partner-groups/:code` `{ "name", "parentCode", "kind" }` | `KH-LE`, `KH-BUON`, `NCC-HH`, `NCC-TSDV`, `CHU-NHA`, `NHAN-VIEN`, `CQNN`, `NOI-BO`, `GOP-VON` |
| Mặt hàng | `GET /api/v1/products?search=&brand=&industry=&group=&type=&postingGroup=&status=` | **Tự thêm** khi chứng từ mang mã hàng mới (chỉ thêm, không ghi đè); **đồng bộ hàng loạt** `PUT /api/v1/products` `{ "source", "products": [{ "sku", "name", "unit", "postingGroupCode", "brandCode", "brandName", "industryCode", "industryName", "groupCode", "groupName", "typeCode", "typeName", "isActive" }] }` (tối đa 2000; trường trống không xoá thông tin cũ; mã phân loại chưa có thì tự thêm); một mặt hàng `PUT /api/v1/products/:sku` | |
| Nhãn / ngành / nhóm / loại hàng | `GET /api/v1/item-classes/:kind` (`brand`, `industry`, `group`, `type`) | `PUT /api/v1/item-classes/:kind/:code` `{ "name", "parentCode", "isActive" }` | |

## Bút toán mẫu, bút toán lặp, cấn trừ công nợ

| Việc | Đường dẫn |
|---|---|
| Bút toán mẫu | `GET /api/v1/voucher-templates?docType=&status=`, `GET /api/v1/voucher-templates/:code`, `PUT /api/v1/voucher-templates/:code` (thân như phiếu nhập tay, không có `docDate`; `amount` được bằng 0; thêm `name`, `isActive`) |
| Bút toán lặp | `GET/POST /api/v1/voucher-recurrences`, `PUT/DELETE /api/v1/voucher-recurrences/:id` `{ "templateCode", "frequency": "monthly"|"quarterly"|"yearly", "dayOfMonth", "startMonth": "YYYY-MM", "endMonth", "branchCode" }` |
| Kỳ đến hạn | `GET /api/v1/voucher-recurrences/due?to=YYYY-MM-DD` |
| Sinh phiếu | `POST /api/v1/voucher-recurrences/generate` `{ "items": [{ "recurrenceId", "period": "YYYY-MM" }] }` — mỗi kỳ một giao dịch, kỳ đã sinh trả lỗi, không sinh trùng |
| Số dư công nợ một đối tượng | `GET /api/v1/partners/:code/balances?asOf=YYYY-MM-DD&branchCode=` — số dương = dư Nợ, số âm = dư Có |
| Cấn trừ công nợ | `POST /api/v1/vouchers` với `docType: "manual"`, `purpose: "offset"`; dòng phiếu có `partnerCode` (bên Nợ) và `creditPartnerCode` (bên Có, trống = như bên Nợ) |
| Lợi nhuận năm trước | `POST /api/v1/closing/year-end` `{ "year", "branchCodes", "fromAccount": "4212", "toAccount": "4211", "dryRun" }` |

## Công nợ theo chứng từ, yêu cầu thanh toán, chứng từ nguồn

| Việc | Đường dẫn |
|---|---|
| Khoản công nợ | `GET /api/v1/debt-items?partnerCode=&groupCode=&account=&side=debit|credit&status=open|settled|all&purpose=&from=&to=&dueTo=&asOf=&branchCode=&search=` — `meta` có `debitRemaining`, `creditRemaining`, `overdue` |
| Đối trừ của một khoản | `GET /api/v1/debt-items/:id/allocations` |
| Đối trừ | `POST /api/v1/debt-allocations` `{ "pairs": [{ "debitItemId", "creditItemId", "amount" }], "date", "note" }`; `POST /api/v1/debt-allocations/auto` `{ "partnerCode", "account" }` (cũ trước); `DELETE /api/v1/debt-allocations/:id` |
| Phiếu thanh toán cho khoản | `POST /api/v1/vouchers` thêm `settle: [{ "debtItemId", "amount" }]`; thêm `dueDate` (hạn thanh toán), `purpose` (`ar_increase`, `ar_decrease`, `ap_increase`, `ap_decrease`, `deposit_received`, `deposit_paid`, `offset`), `sourceDocKey` |
| Hạn thanh toán trên chứng từ gửi sang | Chứng từ bán / mua gửi `dueDate` (`YYYY-MM-DD`); không gửi = ngày chứng từ + hạn của đối tượng |
| Lọc phiếu theo mục đích | `GET /api/v1/documents?purpose=deposit_paid,deposit_received` |
| Yêu cầu thanh toán | `GET/POST /api/v1/payment-requests`, `GET/PUT /api/v1/payment-requests/:id`, `POST /api/v1/payment-requests/:id/submit|approve|reject|cancel|pay`; `GET/PUT /api/v1/payment-request-settings` |
| Chứng từ nguồn | `PUT /api/v1/reference-documents` `{ "source", "documents": [{ "kind", "docKey", "docNo", "docDate", "partner": { "code", "name" }, "branchCode", "total", "dueDate", "description", "payload", "status" }] }` (tối đa 500; `kind`: `purchase_order`, `purchase_quotation`, `goods_receipt`, `purchase_return`, `sales_order`, `sales_quotation`, `goods_issue`, `sales_return`, `other`); `GET /api/v1/reference-documents`; `PATCH /api/v1/reference-documents/:id` |

Sửa / huỷ phiếu nhập tay: người dùng không có quyền `documents:edit-all` chỉ sửa / huỷ được phiếu do mình lập (403 nếu là phiếu của người khác). Khoá API có phạm vi `documents:write` không bị giới hạn này. `GET /api/v1/documents/:id` trả thêm `createdBy`, `createdByName`, `canModify`.

## Ghi chú

- **Chi nhánh và đơn vị hạch toán**: chi nhánh thuộc đơn vị hạch toán nào (`accountingUnitCode`) quyết định nhóm tính giá vốn và tài khoản dùng khi chuyển kho (cùng đơn vị: 1579; khác đơn vị: 13681).
- **Mã hàng (`sku`)**: không bắt buộc khai trước. Mã chưa gán nhóm hạch toán dùng nhóm mặc định (doanh thu 51111, giá vốn 6321, kho 1561). Kế toán gán nhóm riêng ở màn **Mặt hàng – Tài khoản** khi cần.
- **Lý do**: bỏ trống `reasonCode` là dùng lý do mặc định của loại chứng từ. Chỉ gửi `reasonCode` khi nghiệp vụ cần tài khoản khác mặc định (ví dụ xuất tặng, xuất dùng nội bộ).
- Thêm mã mới (hình thức thanh toán, lý do…) phải báo kế toán khai **trước** khi gửi chứng từ dùng mã đó; nếu không chứng từ sẽ ở trạng thái `error` chờ kế toán xử lý.
