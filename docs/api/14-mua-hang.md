# 14. Phân hệ Mua hàng — API (`/api/v1/purchase/*`)

API **đã chạy**. Các màn MH00, MH03–MH10 gọi trực tiếp.

- Nghiệp vụ, bảng, hạch toán: [08-mua-hang](../nghiep-vu/08-mua-hang.md).
- Mã nguồn: `apps/api/src/phan-he/mua-hang/`.

| Tệp | Nội dung |
|---|---|
| `store.ts` | Lưu bảng, khuôn kiểm |
| `analysis.ts` | Phân tích bằng số liệu sổ |
| `posting.ts` | Duyệt = ghi sổ |
| `service.ts` | Lưu, duyệt, bỏ duyệt |
| `reports.ts` | Báo cáo |
| `log.ts` | Nhật ký JSONL |
| `demo.ts` | Dữ liệu mẫu |
| `routes.ts` | Route |

- **Bộ tính dùng chung** (máy chủ + giao diện): `packages/contracts/src/mua-hang/engine.ts`, nhập bằng `@ketoan/contracts/mua-hang`. Khuôn `PDoc`, `PLine`, `Policy`.
- **Bảng:** `db/migrations/0010_mua_hang.sql`.
- **Kiểm thử:** `apps/api/test/mua-hang.test.ts`.

Phản hồi theo [quy ước chung](01-quy-uoc.md): `{ ok: true, data }`; lỗi `{ ok: false, error: { code, message, details? } }`, `message` tiếng Việt hiện thẳng lên màn.

## Chứng từ

| Lệnh | Đường dẫn | Việc | Quyền |
|---|---|---|---|
| GET | `/api/v1/purchase/documents?kind=&status=&partnerCode=&from=&to=` | Danh sách (mới nhất trước); `kind` nhiều loại cách dấu phẩy | `documents:read` |
| GET | `/api/v1/purchase/documents/:id` | `{ doc, analysis }` | `documents:read` |
| POST | `/api/v1/purchase/documents` | Thêm (nháp); `docNo` trống → tự cấp `<tiền tố><yy><mm><4 số>` (DH, NM, TN, DO, QT, XQ, CP, TT, UT, UC) | `documents:write` |
| PUT | `/api/v1/purchase/documents/:id` | Sửa (nháp / chờ duyệt) | `documents:write` |
| POST | `/api/v1/purchase/analyze` | Body `PDoc` → `analysis`, **không lưu**. Màn gọi sau mỗi lần sửa (chờ 400 ms) | `documents:read` |
| POST | `/api/v1/purchase/documents/:id/submit` | Gửi duyệt | `documents:write` |
| POST | `/api/v1/purchase/documents/:id/approve` | **Duyệt = ghi sổ.** Còn cảnh báo chặn → 409, `details: { checks, canOverride }` | `documents:write` |
| POST | `/api/v1/purchase/documents/:id/override` | Duyệt ngoại lệ vượt hạn mức, body `{ reason }` (≥ 3 ký tự). Chỉ khi mọi cảnh báo chặn là vượt hạn mức. Ghi `audit_logs` + JSONL | `payments:approve` |
| POST | `/api/v1/purchase/documents/:id/unapprove` | Bỏ duyệt: huỷ các chứng từ kế toán trong `links`, về nháp. Phiếu khác đang dựa vào (trả hàng, chi phí…) → 409 | `documents:write` |
| POST | `/api/v1/purchase/documents/:id/cancel` | Huỷ phiếu chưa duyệt (không xoá) | `documents:write` |

### Khuôn gửi lên (`PDoc`)

```json
{
  "kind": "receipt", "docNo": "", "docDate": "2026-10-01", "branchCode": "CN-NA", "partnerCode": "NCC-TRUNGHAU", "brandCode": "ANLENE",
  "priceIncludesVat": true,
  "invoice": { "no": "3181", "serial": "TH/26E", "date": "2026-10-01", "total": 39082320 },
  "orderDiscount": { "pct": 7 },
  "term": { "basis": "invoice_date", "days": 10, "workingDays": true },
  "cktt": { "pct": 2 },
  "refIds": ["12"],
  "lines": [
    { "lineKey": "a1", "sku": "110154035", "name": "Anlene Gold hương vani 800g", "unit": "Lon", "qty": 60, "price": 528000, "taxCode": "V08",
      "lineType": "buy", "lotNo": "AG2608A", "expDate": "2028-02-28" }
  ],
  "note": "…"
}
```

| Trường | Loại phiếu | Ghi chú |
|---|---|---|
| `orderDiscount` | nhập, đặt, trả | **Bỏ trống** = theo chính sách NCC; `{}` = không chiết khấu |
| `term` | nhập, đặt | Bỏ trống = theo chính sách `payment_term` |
| `lines[].lineType` | hàng | `buy` · `gift_seller` (KM người bán, chia giá) · `gift_consumer` (KM người tiêu dùng / quà) |
| `lines[].dir` | đổi hàng | `out` (trả đi) / `in` (nhận về) |
| `lines[].price` | nhận / xuất quà | Giá trị hợp lý / ĐVT |
| `settle` | đổi hàng | `offset` (bù trừ) · `pay` (trả thêm) · `refund` (NCC hoàn) |
| `amount`, `method` | ứng trước, trả tiền, chi phí, thưởng | Số tiền; `bank` / `cash` |
| `ckttAmount` | trả tiền | CKTT được hưởng; `refIds` = phiếu nhập được hưởng |
| `taxCode`, `basis`, `costType` | chi phí | Thuế dịch vụ (V05 / V08 / V10, trống = không thuế); phân bổ theo `value` / `qty`; loại chi phí (`van_chuyen`, `boc_xep`, `luu_kho`, `bao_hiem`, `kiem_dinh`, `khac`). `refIds` = **một hay nhiều** phiếu nhập |
| `rebate`, `allocation` | thưởng | Từ `rebates/preview`; một chính sách + một kỳ chỉ một phiếu (409). Không có `rebate` mà có `refIds` = **chiết khấu / giảm giá sau mua**: máy chủ tự phân bổ vào các mã của các phiếu nhập |
| `taxCode` + `invoice` | thưởng / CK sau mua | Có hoá đơn điều chỉnh giảm: giảm 1331 (`total` = tiền + thuế) |
| `schedule` | nhập | Lịch trả nhiều đợt |
| `gift` | nhận quà, nhập quà tự mua | `{ source: ncc_program \| ncc_extra \| self_buy, program, hasVat }` |

### Kết quả trả về

**Chứng từ đã lưu** (`StoredDoc`) = `PDoc` + các trường:
- `totals { beforeTax, tax, total }`, `dueDate` — máy chủ tính;
- `revision`;
- `links [{ docKey, docNo, eventId, role }]` — chứng từ kế toán đã sinh;
- `checks` — cảnh báo lúc lưu / duyệt;
- `policyTrace`;
- `isDemo`, `approvedBy`, `approvedAt`.

**`analysis`:**

```json
{
  "calc": { "gross": 42024000, "orderDiscount": 2941680, "beforeTax": 36187333, "tax": 2894987, "payable": 39082320, "dueDate": "2026-10-15", "ckttExpected": 781646, "lines": [ … ], "trace": [ … ] },
  "checks": [ { "level": "error", "code": "credit_exceeded", "text": "…", "blocking": true } ],
  "credit": [ { "scope": "NCC Công ty Thắng Bảo", "limit": 600000000, "current": 550000000, "openOrders": 0, "thisDoc": 108000000, "after": 658000000, "exceeded": 58000000, "warn": true } ],
  "entries": [ { "debit": "1561", "credit": "3312", "amount": 36187333, "text": "…" } ],
  "prepayment": 0,
  "priceHistory": { "110154035": [ { "date": "2026-10-03", "docNo": "NM2610002", "partnerCode": "…", "unitPrice": 528000, "includesVat": true, "discountPct": 3.93 } ] },
  "accounts": { "stock": "1561", "payable": "3312", "vatIn": "1331", "bank": "…", "cash": "…", "giftIncome": "71153", "giftExpense": "64184", "finIncome": "5152" }
}
```

Nguồn số liệu:
- `credit.current` = công nợ theo chứng từ trên 331* tới ngày phiếu;
- `openOrders` = phiếu chờ duyệt + đơn đặt đã duyệt chưa nhận hàng;
- hạn mức nhãn × chi nhánh = số dư đầu (cài đặt) + phần **chưa trả** của phiếu nhập của nhãn tại chi nhánh;
- `priceHistory` = phiếu nhập của phân hệ + hàng nhập mua từ nguồn khác.

**Mã cảnh báo:**

| Mã | Chặn duyệt | Ý nghĩa |
|---|---|---|
| `lot_missing` | **có** | Thiếu số lô / hạn dùng (mặt hàng có chính sách theo dõi lô) |
| `expired` | **có** | Lô đã hết hạn |
| `invoice_dup` | **có** | Trùng số hoá đơn cùng NCC |
| `credit_exceeded` | **có** — trừ duyệt ngoại lệ | Vượt hạn mức |
| `cktt_invalid` | **có** | CKTT sai phiếu / quá hạn / sai số / trả thiếu |
| `amount_missing` | **có** | Chưa nhập số tiền |
| `return_over` | **có** | Trả / đổi trả đi nhiều hơn số còn lại của phiếu nhập gốc |
| `gift_over` | **có** | Xuất quà vượt tồn quà (theo chương trình) tại chi nhánh |
| `gift_value` | **có** | Nhận quà chưa có giá trị hợp lý |
| `rebate_unassigned` | **có** | Chiết khấu sau mua chưa gắn phiếu nhập |
| `credit_overdue` | không | NCC đang có nợ quá hạn |
| `gift_program` | không | Chương trình quà chưa có quà nhập |
| `cost_unassigned` | **có** | Chi phí chưa gắn phiếu nhập |
| `price_fixed`, `price_last` | không | Lệch giá cố định / lần nhập gần nhất |
| `gift_qty` | không | Thiếu / thừa quà theo chương trình |
| `near_expiry` | không | Cận date |
| `invoice_total` | không | Lệch tổng hoá đơn |
| `po_over`, `po_price` | không | Nhận nhiều hơn phần còn lại của đơn / lệch đơn giá so với đơn |
| `po_partial`, `po_match` | không | Thông tin: giao một phần (còn bao nhiêu) / nhận đủ đơn |
| `code_swap` | **có** (duyệt ngoại lệ được) | Nhập đổi mã so với đơn đặt (mã thường ↔ K/M/Q/T) |
| `discount_over` | **có** | Chiết khấu trên đơn lớn hơn tiền hàng |
| `credit_near` | không | Dùng ≥ 90% hạn mức |
| `po_match`, `no_invoice`, `prepayment` | không (thông tin) | Khớp đơn đặt / chưa có hoá đơn / có tiền ứng trước |

### Duyệt → chứng từ kế toán

Tất cả chạy trong **một giao dịch**: lỗi bất kỳ bước nào thì không ghi gì.

| Loại | Chứng từ kế toán (`docKey`) |
|---|---|
| Nhập mua | `purchase` `mh:<id>` (version = `revision`), `sourceSystem = erp`; đối trừ ứng trước của cùng đơn đặt |
| Trả NCC | `purchase_return` `mh:<id>`, `originalDocKey = mh:<phiếu gốc>` |
| Đổi hàng | `purchase_return` `mh:<id>:tra` + `purchase` `mh:<id>:nhan` + đối trừ; `pay` → phiếu chi chênh lệch; `refund` → phiếu thu |
| Nhận / xuất quà | `stock_adjustment` tăng / giảm, lý do `NQUA` / `XQUA` (tự thêm vào Cấu hình hạch toán nếu chưa có) |
| Chi phí | `purchase` của đơn vị dịch vụ: dòng SL 0 theo mã của phiếu nhập (phân bổ, tổng khớp tới đồng) |
| Thưởng | `purchase_return` dòng SL 0 theo mã (phân bổ của phiếu) |
| Ứng trước | Phiếu chi / báo nợ, mục đích `deposit_paid` |
| Trả tiền | Phiếu chi / báo nợ, `settle` các khoản nợ đang mở (ưu tiên `refIds`, rồi hạn sớm trước), phần dư thành trả trước; CKTT → phiếu kế toán Nợ 331 / Có 515 trừ khoản nợ phiếu nhập |
| Đơn đặt | Không ghi sổ |

## Chính sách

| Lệnh | Đường dẫn | Việc | Quyền |
|---|---|---|---|
| GET | `/api/v1/purchase/policies` | Danh sách | `documents:read` |
| POST / PUT | `/api/v1/purchase/policies[/:id]` | Thêm / sửa. `rule` kiểm theo khuôn của `kind`; hạn mức: tổng phân bổ chi nhánh ≤ hạn mức | `catalog:write` |
| POST | `/api/v1/purchase/policies/:id/transfer-limit` | Body `{ from: '' \| mã CN, to, amount }`; không chuyển quá phần còn; JSONL `limit_transfer` (trước / sau) | `catalog:write` |

Khuôn `rule` từng loại: tài liệu 08 mục 4.2.

## Báo cáo

| Lệnh | Đường dẫn | Việc |
|---|---|---|
| GET | `/api/v1/purchase/credit?asOf=` | Hạn mức NCC (nợ theo sổ + đang chờ), hạn mức nhãn theo chi nhánh, chỉ tiêu cung ứng |
| GET | `/api/v1/purchase/due?partnerCode=&asOf=` | Khoản phải trả NCC đang mở (mọi nguồn), tách đợt theo lịch trả, 6 nhóm tuổi nợ |
| GET | `/api/v1/purchase/lots?asOf=` | Tồn theo lô: lô từ phiếu nhập, tồn thật từ kho chia FEFO; mức cận date |
| GET | `/api/v1/purchase/gifts?from=&to=` | `{ rows, budgets }`: nhập - xuất - tồn quà (đầu kỳ khi có `from`) theo nguồn / chương trình / VAT / chi nhánh; ngân sách quà theo chương trình |
| GET | `/api/v1/purchase/summary?from=&to=&groupBy=sku\|group\|industry\|brand\|partner\|branch` | Tổng hợp mua hàng: SL mua / tặng / trả, tiền hàng, CK, giá trị nhập, thuế, hàng trả, chi phí, thưởng, giá trị thuần, giá vốn TT / ĐVT, còn nợ NCC |
| GET | `/api/v1/purchase/rebates/overview?month=YYYY-MM` | Mọi chính sách thưởng trong tháng (quý / năm theo kỳ chứa tháng): doanh số, % hoàn thành, được hưởng, phiếu đã lập / đã hạch toán / chênh |
| POST | `/api/v1/purchase/rebates/preview` | Body `{ policyCode, period (YYYY-MM \| YYYY-Qn \| YYYY), manualTotal? }` → doanh số mua thuần (nhập − trả), mức, tiền thưởng, phân bổ theo mã, `existing` (đã tính kỳ này) |
| GET | `/api/v1/purchase/allocations/:costId?basis=` | Phân bổ phiếu chi phí: tỷ lệ, giá vốn / ĐVT trước / sau; cảnh báo chưa gắn / trùng |
| GET | `/api/v1/purchase/real-cost/:receiptId` | Giá vốn thực tế từng mã |
| GET | `/api/v1/purchase/logs?event=&from=&to=` | Nhật ký JSONL (mới nhất trước) |
| GET | `/api/v1/purchase/scenarios` | 25 tình huống — phép thử công thức |

## Cài đặt, dữ liệu mẫu

| Lệnh | Đường dẫn | Việc | Quyền |
|---|---|---|---|
| GET / PUT | `/api/v1/purchase/settings` | `{ holidays: [YYYY-MM-DD], warnDays, brandOpening: { nhãn: { mã CN: số dư } }, accounts: { stock, vatIn, payable, cash, bank, giftIncome, giftExpense, finIncome } }`; GET trả thêm `resolvedAccounts` (tài khoản đang dùng) | đọc `documents:read`, ghi `settings:write` |
| POST | `/api/v1/purchase/demo/seed` | Nạp 25 tình huống + ví dụ bổ sung VD1–VD8 (`db/seeds/mua-hang/*.json`) vào **sổ thật** của đơn vị đang đăng nhập. Thân: `{ password, reset }` — sai mật khẩu → 403; đã nạp → 409, `reset: true` = xoá bản cũ rồi nạp. Mã hàng đã có trong danh mục thì dòng phiếu lấy tên / ĐVT theo danh mục | `settings:write` |
| POST | `/api/v1/purchase/demo/clear` | Thân `{ password }`. Bỏ duyệt (đảo bút toán) và xoá chứng từ / chính sách tình huống, đảo số dư đầu kỳ mẫu | `settings:write` |
| GET | `/api/v1/purchase/price-history/:sku?asOf&limit` | Các lần nhập gần nhất của một mã: ngày, phiếu, NCC, ĐVT, SL, đơn giá thực tế sau CK | `purchase:read` |

Mật khẩu nạp dữ liệu đặt bằng biến môi trường `PURCHASE_SEED_PASSWORD` (không đặt thì dùng mật khẩu mặc định đã thống nhất nội bộ).

### Mặt hàng & giá mua (bảng `supplier_products`, migration 0013)

| Phương thức | Đường dẫn | Việc | Quyền |
|---|---|---|---|
| GET | `/api/v1/purchase/supplier-products?partnerCode&withGeneral&sku&all` | Dòng mặt hàng & giá mua theo NCC (`withGeneral=1` kèm giá chung) hoặc theo mã; trả `{ rows, units }` (ĐVT của các mã) | `documents:read` |
| POST | `/api/v1/purchase/supplier-products` | `{ rows: [{ id?, partnerCode (null = giá chung), sku, unit, isDefaultUnit, nccSku, price (null = chỉ khai có bán), priceIncludesVat, warnPct, validFrom, validTo, note, isActive }] }`. ĐVT phải có ở mặt hàng (sai → 400 kèm danh sách ĐVT đúng). Không `id`: trùng NCC × mã × ĐVT (× hiệu lực nếu ghi) thì cập nhật. Ghi nhật ký `supplier_products` | `catalog:write` |
| GET | `/api/v1/purchase/units?skus=a,b` | ĐVT các mã: tỉ lệ về ĐVT nhỏ nhất, bán chính, mua mặc định | `documents:read` |

Giá áp cho dòng phiếu (`priceFor`): dòng của đúng NCC thắng giá chung; đúng ĐVT thắng; còn hiệu lực; hiệu lực mới nhất. Dòng phiếu ĐVT khác thì quy đổi theo tỉ lệ (chỉ khi cả hai ĐVT có ở mặt hàng). Ghi sổ kho quy SL về ĐVT nhỏ nhất. Hai loại chính sách cũ `purchase_price`, `supplier_item` đã chuyển vào bảng này và bỏ.

## Nhà cung cấp, đặt hàng, đính kèm (đợt "đi từ nhà cung cấp")

| Phương thức | Đường dẫn | Việc | Quyền |
|---|---|---|---|
| GET | `/api/v1/purchase/suppliers?scope=active\|all` | Mỗi NCC một dòng: nợ 331, quá hạn, sắp đến hạn, hạn mức / đã dùng, điều khoản bằng chữ, số chính sách, hợp đồng đến, đơn đang mở, nhập gần nhất, mua tháng này | `documents:read` |
| GET | `/api/v1/purchase/suppliers/:code` | Hồ sơ NCC: thông tin danh mục, các con số trên, trạng thái hạn mức, mua theo tháng, nhật ký của NCC | `documents:read` |
| POST | `/api/v1/purchase/products-lookup` | `{ skus }` → tên, ĐVT, thuế đầu vào, nhãn (nhập Excel) | `documents:read` |
| GET / POST | `/api/v1/purchase/attachments` | Liệt kê (`ownerType` partner \| document \| policy, `ownerId`) / gửi tệp `{ ownerType, ownerId, kind, fileName, mime, dataBase64 }` (≤ 15 MB) | đọc / `documents:write` |
| GET / DELETE | `/api/v1/purchase/attachments/:id/file` · `/api/v1/purchase/attachments/:id` | Tải nội dung / xoá tệp | đọc / `documents:write` |

**Chính sách mới:** `contract` (`{ no, signedOn, note }`, hiệu lực = validFrom/validTo). Mọi chính sách trả thêm `createdBy`, `createdAt`, `updatedBy`, `updatedAt`.

**Điều khoản thanh toán** (`payment_term` và `term` của phiếu): `{ basis: receipt_date | invoice_date | order_date | fixed | immediate | prepay, days, dayType: working | working6 | calendar, payDays?: number[], monthDay?: number }` — xem bộ máy `dueDateFor`. Phiếu thêm `receivedDate` (ngày nhận đủ hàng và hồ sơ) và `invoiceFix: { from, to }` (hoá đơn sai phải điều chỉnh, hạn lùi đúng số ngày).

**Mã hàng / hàng tặng:** `skuInfo` đọc mã theo quy tắc mã hàng (K chia giá, M khuyến mại, Q kẹp quà, T có tem, nhóm 8 combo, Q… quà KM); `autoLineType`: giá 0 = hàng tặng (mặc định chia giá, theo chính sách KM của NCC, mã M luôn là quà cho khách).

**Đặt hàng:** `orderProgress` (đã nhận / còn lại, nhận bằng mã đổi đuôi vẫn trừ đơn), `receiptFromOrder` (phiếu nhập chép phần còn lại), `importRows` + `docsFromImport` (đọc Excel theo tên cột, gom NCC + chi nhánh + số HĐ), `orderReconcile` (đối chiếu đơn ↔ phiếu nhập, MH21).


### Xoá, danh mục ĐVT, cấu trúc CSDL (26/10/2026)

| Phương thức | Đường dẫn | Việc | Quyền |
|---|---|---|---|
| DELETE | `/api/v1/purchase/policies/:id` | Xoá chính sách **chưa áp** vào phiếu nào. Đã áp (vết tính `policyTrace`, chương trình KM trên dòng, phiếu thưởng) thì trả 409, chỉ tắt được. Ghi nhật ký `policy_deleted` | `catalog:write` |
| DELETE | `/api/v1/purchase/supplier-products/:id` | Xoá hẳn một dòng mặt hàng & giá mua (phiếu đã lập giữ đơn giá riêng) | `catalog:write` |
| POST | `/api/v1/purchase/units` | `{ skus }` → ĐVT nhiều mã (danh sách dài) | `documents:read` |
| GET | `/api/v1/purchase/db-schema` | Cấu trúc CSDL phân hệ đọc thẳng từ PostgreSQL: bảng theo 3 lớp, cột + chú thích, chỉ mục, trigger, số dòng của đơn vị; danh sách migration | `documents:read` |
| GET | `/api/v1/unit-names` | Danh mục tên ĐVT + số mặt hàng đang dùng mỗi tên | `catalog:read` |
| POST | `/api/v1/unit-names` | `{ name, note?, isActive? }` — tên 1–32 ký tự, không trùng (không phân biệt hoa thường) | `catalog:write` |
| PATCH | `/api/v1/unit-names/:id` | Sửa tên / ghi chú / đang dùng. Tên đang có mặt hàng dùng thì không đổi được (409) | `catalog:write` |
| DELETE | `/api/v1/unit-names/:id` | Xoá tên chưa mặt hàng nào dùng (đang dùng thì 409) | `catalog:write` |

Kiểm tra thêm của `POST /supplier-products`:
- ngày `validTo` phải lớn hơn hoặc bằng `validFrom`;
- `isDefaultUnit` chỉ dùng cho dòng có `partnerCode`;
- trong một lần lưu, hai dòng trùng NCC × mã × ĐVT × hiệu lực thì trả 400.

Tiến độ đơn đặt (`orderProgress`) và đối chiếu đơn ↔ phiếu nhập (`po_partial`, `po_over`, `po_price`) đều so theo **ĐVT nhỏ nhất**. Từng dòng có thêm `baseUnit`, `orderedBase`, `receivedBase`, `remainingBase`.

### Chiết khấu theo mã hàng, nhãn hàng chính của NCC (26/10/2026)

- Loại chính sách `item_discount`, `rule = { items: [{ sku, pct? | amount?, unit?, minQty?, note? }] }`.
  - Tối đa 10.000 dòng.
  - Mỗi dòng có đúng một trong hai: `pct` hoặc `amount`.
  - Không trùng `sku × unit × minQty`.
  - Bộ máy (`itemDiscountFor`) áp CK cho từng dòng mua khớp mã (khớp ĐVT nếu có ghi, SL ≥ `minQty`; nhiều dòng thì lấy `minQty` cao nhất đạt được).
  - CK % nhập tay trên dòng phiếu thắng.
  - Thứ tự: `item_discount` → `qty_tier`.
- Nhãn hàng chỉ khai ở danh mục mặt hàng (`products.brand_code`).
  - Khi lưu / phân tích phiếu, máy chủ ghi `lines[].brandCode` theo danh mục và đặt `brandCode` của phiếu = nhãn chiếm giá trị hàng mua lớn nhất (giá trị gửi lên bị bỏ qua; phiếu không có dòng hàng giữ nhãn gửi lên).
  - Hạn mức toàn nhãn, chỉ tiêu cung ứng, thưởng theo nhãn tính theo phần nhãn trong phiếu (`brandShare`).
- `GET /api/v1/purchase/suppliers/:code/brands` → `[{ brandCode, name, skus }]`: các nhãn NCC bán (suy từ mặt hàng NCC bán / đã nhập), dùng gợi ý khi lập chính sách.
- `GET /api/v1/purchase/product-cost/:sku` → giá vốn bình quân tháng gần nhất + tạm tính theo tồn (theo ĐVT nhỏ nhất).

## Tồn max, chuyển hàng shop, công thức đặt hàng (`/api/v1/stock/*`)

Nghiệp vụ: `docs/nghiep-vu/09-ton-max-dat-hang.md`. POS / website gọi bằng khoá API (Bearer), cùng quyền như người dùng (`documents:read` / `documents:write`; phân cấp cần `catalog:write`, lưu công thức cần `settings:write`).

| Phương thức | Đường dẫn | Việc |
|---|---|---|
| GET | `/stock/hierarchy` | Chi nhánh (level `branch` / `shop` / rỗng, `parentCode`) + kho từng chi nhánh |
| PUT | `/stock/hierarchy` | `{ items: [{ code, level, parentCode }] }` — chỉ 2 cấp |
| POST | `/stock/hierarchy/auto` | `{ overwrite }` — tự xếp theo mã (`xx000` = chi nhánh cha) |
| GET | `/stock/levels?branchCodes=&skus=` | Tồn max / min |
| PUT | `/stock/levels` | `{ items: [{ branchCode, warehouseCode?, sku, max, min?, note?, remove? }], source }` — kho trống = kho mặc định |
| GET | `/stock/max-board?parentCode=&branchCode=&warehouseCode=&sku=` | Bảng tồn max: tồn, bán / ngày, gợi ý, max |
| GET / PUT | `/stock/sku-settings` | Riêng mã: `windowDays`, `coverDays`, `transferMode` (`auto` / `pack` / `unit`) |
| GET / PUT | `/stock/formulas/:branchCode` | Công thức đặt hàng (chưa lưu = công thức chuẩn) |
| GET | `/stock/order-analysis?branchCode=&sku=` | SL cần nhập từng mã + từng thành phần, gợi ý mua làm tròn thùng, NCC, giá chưa VAT |
| GET | `/stock/transfer-suggest?branchCode=&fromWarehouse=` | Đề xuất chuyển xuống shop |
| GET / POST | `/stock/transfer-requests` | Đề nghị chuyển đã chốt (lọc `from`, `to`, `status`, `branchCode`) / chốt (`{ fromBranch, fromWarehouse, shops: [{ toBranch, lines }] }`) |
| POST | `/stock/transfer-requests/:id/{done,cancel,reopen}` | Đánh dấu đã lên phiếu / huỷ / mở lại |
| GET | `/stock/max-requests?from=&to=&status=&branchCode=&kind=` | Phiếu đăng ký tồn max |
| GET | `/stock/max-requests/suggest?branchCode=` | Dòng gợi ý cho phiếu của một shop |
| POST / PUT | `/stock/max-requests[/:id]` | `{ kind: existing / new_item, branchCode, items, submit, source: erp / pos / api }` — lệch trong mức cho phép thì duyệt tự động |
| POST | `/stock/max-requests/:id/{approve,cancel}` | Duyệt = ghi tồn max; hàng mới chưa có mã chờ gắn mã (PUT lại với `sku`) |

Dòng chứng từ mua thêm: `note`, `pack`, `nccSku`, `nccName`, `barcode`, `newItem`, `refLineKey`, `stockInfo`; chứng từ thêm `budget`, `deliveryDate`, `deliveryWarehouse`. Phiếu nhập còn dòng `sku` trống → cảnh báo chặn `new_item_unlinked`; lưu phiếu nhập có `refLineKey` + `sku` thì mã ghi ngược vào dòng của đơn đặt.
