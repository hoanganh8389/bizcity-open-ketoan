# 13. Phiếu nhập tay trong phần mềm — hợp đồng đề xuất (`/api/v1/trade-documents`)

> **Mua hàng, trả hàng NCC không dùng hợp đồng này**: làm ở phân hệ Mua hàng, API thật `/api/v1/purchase/*` — xem [14-mua-hang](14-mua-hang.md).

Các màn **Phiếu bán hàng (BH10), Hàng bán trả lại (BH11), Phiếu chuyển kho (KHO01)** đang chạy bằng **dữ liệu giả** (JSON mẫu ở trình duyệt). Tài liệu này là **hợp đồng** để viết API thật. Viết đúng hợp đồng thì giao diện **không phải sửa gì**: vào **API → Nguồn dữ liệu màn hình (API03)**, bật "API thật" cho loại phiếu là chạy.

- Mã giao diện gọi API: `apps/web/src/lib/tradeDocs.ts` (`tradeApi`, phần `source === 'api'`).
- Dữ liệu mẫu (đúng khuôn JSON): `apps/web/src/phan-he/ban-hang/phieu-ban/mau-*.json`, `phan-he/kho/chuyen-kho/mau-chuyen-kho.json`.
- Viết endpoint ở thư mục **`apps/api/src/phan-he/api/`** (khu của phân hệ API), khai vào `phan-he/api/index.ts`.

## Endpoint

Một tài nguyên chung cho 5 loại phiếu, phân biệt bằng `docType` (`sale`, `sale_return`, `purchase`, `purchase_return`, `transfer`).

| Lệnh | Đường dẫn | Việc | Quyền |
|---|---|---|---|
| GET | `/api/v1/trade-documents?docType=&from=&to=&branchCodes=&status=&search=&page=&pageSize=` | Danh sách (mới nhất trước) | `documents:read` |
| GET | `/api/v1/trade-documents/:id` | Một phiếu đầy đủ | `documents:read` |
| POST | `/api/v1/trade-documents` | Thêm (trạng thái `draft`) — `docNo` trống thì tự cấp | `documents:write` |
| PUT | `/api/v1/trade-documents/:id` | Sửa (chỉ phiếu `draft`) | `documents:write` |
| DELETE | `/api/v1/trade-documents/:id` | Xoá (chỉ phiếu `draft`) | `documents:write` |
| POST | `/api/v1/trade-documents/:id/approve` | Duyệt → đưa vào kế toán (xem dưới) | `documents:write` |
| POST | `/api/v1/trade-documents/:id/unapprove` | Bỏ duyệt → huỷ bút toán (ghi số âm), về `draft` | `documents:write` |

Tham số danh sách: `from`, `to` (ngày `YYYY-MM-DD`, lọc `docDate`); `branchCodes` (mã cách nhau dấu phẩy, trống = mọi chi nhánh); `status` (`draft` · `approved`, trống = cả hai); `search` (số phiếu, mã / tên đối tượng, số hoá đơn, ghi chú).

Phản hồi theo [quy ước chung](01-quy-uoc.md): `{ ok: true, data, meta }` — danh sách có `meta.total`; lỗi `{ ok: false, error: { code, message } }` (màn hiện nguyên `message`, viết tiếng Việt).

## Khuôn JSON (`TradeDoc`)

```json
{
  "id": "1024",
  "docType": "sale",
  "status": "draft",
  "docNo": "BH2600002",
  "docDate": "2026-10-22",
  "branchCode": "00001Premium",
  "partner": { "code": "232AA000185", "name": "Trần Văn An", "taxCode": "0101234567" },
  "invoice": { "no": "0001235", "serial": "C26TAA", "date": "2026-10-22" },
  "lines": [
    { "lineKey": "L1", "sku": "100021004", "name": "Biomil Plus 2 800g", "unit": "Lon", "qty": 3,
      "unitPrice": 670000, "discount": 30000, "amountBeforeTax": 1980000, "taxCode": "R08", "taxAmount": 158400 },
    { "lineKey": "L2", "sku": "100021001", "name": "Biomil Plus 1 400g", "unit": "Lon", "qty": 1,
      "unitPrice": 340000, "amountBeforeTax": 0, "taxCode": "R08", "taxAmount": 0, "isGift": true }
  ],
  "payments": [ { "methodCode": "CK", "amount": 1000000, "reference": "FT26296000123" } ],
  "totals": { "beforeTax": 1980000, "tax": 158400, "total": 2138400 },
  "note": "Khách lấy hoá đơn, chuyển khoản một phần",
  "createdAt": "2026-10-22T09:12:00.000Z",
  "updatedAt": "2026-10-22T09:12:00.000Z"
}
```

| Trường | Loại phiếu | Ghi chú |
|---|---|---|
| `id` | mọi | Máy chủ cấp (chuỗi). Gửi lên khi thêm: bỏ trống |
| `status` | mọi | `draft` (nháp) · `approved` (đã duyệt, đã vào kế toán). Máy chủ quản lý — chỉ đổi qua approve / unapprove |
| `docNo` | mọi | Số phiếu, duy nhất theo `docType` + chi nhánh. Trống → tự cấp `<đầu số><năm 2 số><5 số>`: BH, TL, MH, TN, CK |
| `docDate`, `branchCode` | mọi | Bắt buộc. `branchCode` phải có ở danh mục Chi nhánh (DM02) |
| `toBranchCode` | transfer | Bắt buộc. Bằng `branchCode` = chuyển giữa hai kho trong cùng chi nhánh (khi đó API phải kiểm `warehouseCode` ≠ `toWarehouseCode`, báo lỗi nếu trùng / thiếu) |
| `warehouseCode` | mọi | Kho ở đầu phiếu (bán: kho xuất · trả lại / mua: kho nhận · chuyển kho: kho **xuất**). Trống = kho mặc định của chi nhánh. Phải là kho đang dùng của `branchCode`. Khi gửi vào cổng chứng từ: ghi xuống **mọi dòng** `lines[].warehouseCode` |
| `toWarehouseCode` | transfer | Kho **nhận** của `toBranchCode`; trống = kho mặc định. Ghi xuống `lines[].toWarehouseCode` |
| `partner` | sale, sale_return (trống = khách lẻ); purchase, purchase_return (bắt buộc) | Mã phải có ở danh mục đối tượng; `name`, `taxCode` để hiện nhanh |
| `invoice` | sale, sale_return, purchase, purchase_return | Hoá đơn (nếu có) |
| `originalDocNo` | sale_return, purchase_return | Số phiếu gốc (tham khảo) |
| `dueDate` | purchase, purchase_return | Hạn thanh toán |
| `lines[]` | mọi | ≥ 1 dòng; `sku` có ở danh mục mặt hàng; `qty > 0`. Chuyển kho: không tiền (`amountBeforeTax` = 0, không thuế) |
| `lines[].amountBeforeTax` | trừ transfer | = `round(qty × unitPrice − discount)`, hàng tặng (`isGift`) = 0 |
| `lines[].taxCode`, `taxAmount` | trừ transfer | Bán / trả lại: `R08`, `R10`, `R05`, `R00`, `KCT`. Mua / trả NCC: `V08`, `V10`, `V05`, `V00`, `KKKN`. `taxAmount = round(amountBeforeTax × thuế suất)` |
| `payments[]` | sale (thu), sale_return (trả khách) | Trống = công nợ. Tổng ≤ `totals.total` |
| `totals` | mọi | Máy chủ **tính lại** từ dòng (không tin số gửi lên); `total = beforeTax + tax` |

Luật kiểm tra (trả 400 kèm câu tiếng Việt): thiếu trường bắt buộc; mã chi nhánh / đối tượng / mặt hàng không có; chuyển kho cùng nơi xuất nhận; sửa / xoá phiếu đã duyệt (409 "Phiếu đã duyệt: bỏ duyệt rồi mới sửa được"); trùng số phiếu (409).

## Duyệt → vào kế toán

Duyệt = dựng chứng từ theo **đúng khuôn cổng nhận chứng từ** ([02-ban-hang](02-ban-hang.md), [03-tra-hang-ban](03-tra-hang-ban.md), [04-nhap-mua](04-nhap-mua.md), [05-tra-hang-ncc](05-tra-hang-ncc.md), [06-chuyen-kho](06-chuyen-kho.md)) rồi gọi lõi `postDocumentIn` (thư mục `apps/api/src/modules/documents`), với:

- `docKey` = `erp:<branchCode>:<docType>:<id>` (cố định theo phiếu) — sửa lại rồi duyệt lần nữa thì tăng `version` (lõi tự đảo bút toán cũ);
- `sourceSystem` = `erp` (nguồn "nhập tay trong phần mềm" ở trạm ACC14).

Bỏ duyệt = gọi huỷ chứng từ theo `docKey` ([08-sua-huy](08-sua-huy.md)), về `draft`.

## Bảng dữ liệu (gợi ý — người phụ trách DB quyết)

`trade_documents` (tenant_id, id, doc_type, status, doc_no, doc_date, branch_code, to_branch_code, partner jsonb, invoice jsonb, original_doc_no, due_date, payments jsonb, totals jsonb, note, created_by, timestamps; unique (tenant_id, doc_type, branch_code, doc_no)) + `trade_document_lines` (document_id, line_no, lineKey, sku, name, unit, qty, unit_price, discount, amount_before_tax, tax_code, tax_amount, is_gift). Migration mới: `db/migrations/0010_…sql`.

## Thử

1. **Thử API (API01)**: chọn `POST /api/v1/trade-documents`, dán một phiếu trong tệp `mau-*.json` (bỏ `id`), Gửi.
2. **Nguồn dữ liệu màn hình (API03)**: bật "API thật" cho loại phiếu, mở màn phiếu, thêm / sửa / xoá / duyệt như người dùng.
