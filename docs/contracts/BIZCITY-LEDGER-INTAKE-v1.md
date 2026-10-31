# `bizcity_ledger_intake@1` — Khuôn sự việc gửi vào sổ
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-10-31 08:24 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — 1.1.0: §7.1 đọc sổ — ledger.query (ctx.ledger.query, ledgerQuery, khung nhìn bizcity_read.*) -->

> **Phiên bản:** 1.1.0 · 2026-10-31 · **Trạng thái:** Ổn định (§7.1 mới, bổ sung)
> **Nguồn sự thật:** `packages/contracts/src/documents.ts` (`ingestDocumentSchema`) · **JSON Schema:** [BIZCITY-LEDGER-INTAKE-v1.schema.json](BIZCITY-LEDGER-INTAKE-v1.schema.json)
> **Luật:** [R-EVENT](../rules/RULE-EVENT.md) · **Hướng dẫn chi tiết từng loại kèm JSON mẫu:** [../api/](../api/README.md)
> **Đổi tên (2026-10-29, trước khi phát hành):** trước đây gọi là `bizcity_event@1`. Tên `bizcity_event` nay dành cho **sự kiện miền** của Standard v1 ([BIZCITY-EVENT-v1.md](BIZCITY-EVENT-v1.md)). Hợp đồng này là **cửa nạp của nhân sổ cái**: phân hệ trong tiến trình gọi qua `ctx.ledger.submit()` của SDK, không gọi thẳng.

## 1. Ý nghĩa

Một `bizcity_ledger_intake` mô tả **một sự việc kinh tế đã xảy ra** ở nguồn: bán gì, mua gì, chuyển gì, thu chi bao nhiêu, bằng mã nào. **Không** chứa tài khoản Nợ / Có. Lõi định khoản theo cấu hình của đơn vị nhận.

## 2. Cửa vào

| Lời gọi | Nội dung | Kết quả |
|---|---|---|
| `POST /api/v1/documents` | một sự việc | `data: IngestResult` |
| `POST /api/v1/documents/batch` | `{ "documents": [ … ] }` ≤ 200 | `data: IngestResult[]`, `meta` đếm theo `status` |
| `POST /api/v1/documents/cancel` | `{ "docKey", "reason" }` | huỷ (tự động) hoặc Chờ huỷ (chế độ chờ) |
| Phân hệ trong tiến trình | `postDocumentIn(trx, auth, doc, { post?, hold? })` | `IngestResult` |
| Kéo qua [bizcity_connector@1](BIZCITY-CONNECTOR-v1.md) | `documents[]` cùng khuôn | luôn `pending` |

Xác thực: `X-Api-Key` có phạm vi `documents:write`. Header tuỳ chọn `X-Bizcity-Contract: bizcity_ledger_intake@1` (Giai đoạn 2: lõi kiểm major).

## 3. Phần chung (mọi `docType`)

| Trường | Kiểu | Bắt buộc | Nghĩa |
|---|---|---|---|
| `docType` | enum | ✓ | `sale` · `sale_return` · `purchase` · `purchase_return` · `transfer` · `stock_adjustment` · `cash_transfer` · `customer_payment` · `supplier_payment` |
| `docKey` | chuỗi 3–160 | ✓ | Khoá **duy nhất, bất biến** của chứng từ ở nguồn. Mẫu: `<nguồn>:<chi nhánh/blog>:<loại>:<id>` |
| `version` | số nguyên ≥ 1 | | Mặc định 1. Tăng khi nội dung đổi (khuyên: tăng theo băm nội dung) |
| `branchCode` | chuỗi ≤ 32 | ✓ | Mã chi nhánh (hoặc `external_ref` / mã có đuôi chữ — xem `findBranch`) |
| `docNo` | chuỗi ≤ 64 | ✓ | Số phiếu ở nguồn |
| `docDate` | `YYYY-MM-DD` / ISO 8601 | ✓ | Ngày chứng từ = ngày hạch toán |
| `reasonCode` | chuỗi ≤ 32 | | Lý do định khoản; trống = lý do mặc định của `docType` |
| `description` | chuỗi ≤ 1000 | | Diễn giải |
| `internalOnly` | bool | | `true` = không vào sổ hoá đơn, không sang sổ thuế |
| `partner` | `{ code, name, taxCode?, address?, email?, phone? }` | | Khách / NCC. Trống → "Khách lẻ" / "Nhà cung cấp lẻ". Tự tạo / cập nhật theo `code` |
| `employee` | `{ code, name }` | | Nhân viên phụ trách; ghi vào chiều `dims.employee` mọi dòng sổ |
| `invoice` | `{ no, serial, form, date, status, … }` | | Hoá đơn đã phát hành; `status`: `valid` · `replaced` · `adjusted` · `cancelled` |
| `dueDate` | ngày | | Hạn thanh toán của khoản công nợ phát sinh |
| `sourceSystem` | chuỗi ≤ 32 | | Mặc định `external`; nên đặt mã kết nối |
| `sourceRef` | `{ type, id, label?, url? }` | | Phiếu gốc ở nguồn (tra cứu, lọc, mở phiếu) — không dùng định khoản |
| `extra` | object | | Dữ liệu riêng của nguồn, lưu nguyên |

## 4. Phần riêng theo `docType`

| `docType` | Trường riêng (bắt buộc in đậm) | Tổng |
|---|---|---|
| `sale` | **`lines[]`** (dòng hàng, có thể rỗng), `payments[]`, `offsets[{docKey, amount}]` (đối trừ đổi trả) | **`totals{beforeTax, tax, total}`** |
| `sale_return` | `originalDocKey`, **`lines[]`** ≥ 1, `payments[]` (tiền trả khách) | **`totals`** như trên |
| `purchase` | **`lines[]`** ≥ 1 (loại thuế đầu vào), `payments[]` (trả ngay) | **`totals`** |
| `purchase_return` | `originalDocKey`, **`lines[]`** ≥ 1, `payments[]` | **`totals`** |
| `transfer` | `leg` (`out`/`in`), `toBranchCode`, `fromBranchCode`, `status` (`shipped`/`received`), **`lines[]`** (dòng kho) | **`totals{total}`** |
| `stock_adjustment` | **`direction`** (`increase`/`decrease`/`mixed`), **`lines[]`** (dòng kho; `mixed` thì `qty` có dấu) | **`totals{total}`** |
| `cash_transfer` | **`toBranchCode`**, `fromMethodCode`, `toMethodCode`, `fromBankCode`, `toBankCode`, `toReasonCode`, `status` (`sent`/`received`) | **`totals{total > 0}`** |
| `customer_payment`, `supplier_payment` | **`methodCode`**, `direction` (`in`/`out`), `lines[]` phân bổ `{lineKey, amount, branchCode?, invoiceDocKey?}` | **`totals{total > 0}`**, tổng phân bổ ≤ tổng |

Dòng hàng (`sale`…`purchase_return`): **`lineKey`**, `sku`, `name`, `unit`, `qty` (ĐVT nhỏ nhất), `unitQty`, `unitRatio`, `unitPrice`, **`amountBeforeTax`** (đã trừ chiết khấu, tròn như hoá đơn), `discount`, **`taxCode`**, `taxAmount`, `warehouseCode`, `isGift`, `excludeFromCost`, `lotNo`, `expDate`, `note`, `cost`.

Dòng kho (`transfer`, `stock_adjustment`): **`lineKey`**, **`sku`**, `name`, `unit`, **`qty`**, `amount` (giá vốn; 0 = định giá cuối tháng), `warehouseCode`.

## 5. Kiểm ở cửa

1. Khuôn zod (sai → `VALIDATION_ERROR`, `details` liệt kê trường).
2. Tổng tới xu: mua bán `Σ amountBeforeTax = totals.beforeTax`, `Σ taxAmount = totals.tax`, `beforeTax + tax = total`; phiếu kho `Σ |amount| = |total|`; thanh toán `Σ phân bổ ≤ total`.
3. Chi nhánh tìm được. Mã khác (lý do, thuế, hình thức, hàng) kiểm lúc định khoản — thiếu thì `error` / xem trước báo lỗi, **không** từ chối nhận (R-MD-5).

## 6. Kết quả (`IngestResult`)

| Trường | Nghĩa |
|---|---|
| `docKey`, `version` | Như gửi |
| `status` | `pending` (chờ ở ACC14) · `posted` (đã vào sổ) · `unchanged` (đã có đúng phiên bản) · `error` (đã lưu, chưa vào sổ) |
| `entryIds[]` | Bút toán đã ghi |
| `kept`, `updated`, `reversed` | Khi định khoản lại: số bút toán giữ, cập nhật thông tin đầu, bị đảo |
| `error{code, message}` | Khi `status = error` |

Phiên bản nhỏ hơn bản đang có → HTTP `409 CONFLICT` (không phải `IngestResult`).

## 7. Bảo đảm của lõi

- Gửi lại cùng `docKey` + `version` bao nhiêu lần cũng **không ghi trùng**.
- Phiên bản mới thay hẳn phiên bản cũ trên sổ (đảo + ghi mới) khi được định khoản; lịch sử giữ ở `accounting_event_versions`.
- Không bao giờ xoá sự việc đã nhận; huỷ để lại dấu vết đầy đủ.

### 7.1 Đọc sổ (`ledger.query`, từ 1.1.0)

Nộp vào bằng cửa nạp thì đọc ra cũng qua bề mặt của lõi — không ai ngoài Kernel đọc bảng `ledger_*` (R-BOUND-3, SC-KERNEL-7 chặn).

| Ai đọc | Bằng gì | Ở đâu |
|---|---|---|
| Module, action | `ctx.ledger.query(q)` trong giao dịch của action | `apps/api/src/core/actions.ts`; Kernel đăng ký ở `app.ts` |
| Mã nội bộ ngoài Kernel (phân hệ, add-in) | `ledgerQuery.query(db, tenantId, q)` | `apps/api/src/kernel/public.ts` |
| Báo cáo cần SQL riêng | SQL trên khung nhìn chỉ đọc `bizcity_read.ledger_entries`, `bizcity_read.ledger_lines`, `bizcity_read.ledger_balances_daily`; tài khoản đối ứng bằng `otherSide()` | migration `0043_doc_so_cai.sql` |

Câu hỏi `q` (`ledgerQuerySchema`, `packages/contracts/src/ledger-query.ts`) hỏi theo **mã**: `to` (bắt buộc), `from`, `accounts` (đầu số), `partnerCode`, `branchCodes`, `dimension` ({mã chiều: mã giá trị}), `sku`, `groupBy` (`account` | `partner` | `branch`, mặc định `account`). Kết quả mỗi dòng: mã theo `groupBy` + `opening` (Nợ − Có trước `from`), `debit`, `credit`, `closing`, số đồng, cộng trừ bằng xu.

Bảo đảm:
- Mã không tồn tại → `NOT_FOUND`, không trả 0 (R-REV-13). Sai khuôn ngày, `from` sau `to` → `VALIDATION_ERROR`.
- Bút toán đã đảo và bút toán đảo đều được cộng — chúng triệt tiêu nhau, số dư bằng số đang hiệu lực.
- Có `dimension` hoặc `sku` → đọc dòng sổ; còn lại đọc số dư ngày (nhanh). Hai đường cho cùng số.
- Khung nhìn chạy bằng quyền người gọi (`security_invoker`): RLS theo đơn vị vẫn áp. Ghi qua khung nhìn bị trigger chặn. Không đưa `content_hash` / `body_hash` ra.
- Kernel đổi cấu trúc bảng sổ thì sửa khung nhìn trong migration mới; cột của khung nhìn chỉ **thêm**, không bớt / đổi nghĩa trong `@1`.

## 8. Changelog

- **1.1.0 (2026-10-31):** §7.1 đọc sổ — năng lực `ledger.query` (PHASES 3.7, PHASE-012 S012-2): `ctx.ledger.query`, `ledgerQuery`, khung nhìn chỉ đọc `bizcity_read.*`. Khuôn nộp không đổi.
- **1.0.0 (2026-10-28):** Đặt tên hợp đồng cho khuôn `IngestDocument` đang chạy; nội dung không đổi.
