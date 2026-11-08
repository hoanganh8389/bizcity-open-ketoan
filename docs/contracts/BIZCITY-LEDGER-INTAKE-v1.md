# `bizcity_ledger_intake@1` — Khuôn sự việc gửi vào sổ
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-10-31 08:24 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — 1.1.0: §7.1 đọc sổ — ledger.query (ctx.ledger.query, ledgerQuery, khung nhìn bizcity_read.*) -->
<!-- [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — §7.1: ledgerQuery mở ở gốc gói @bizcity/kernel -->
<!-- [2026-11-02 01:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 1.2.0: §2 thêm cửa core.document.submit (runtime action) và ctx.ledger.submit (module, ADR-0011 D5) -->
<!-- [2026-11-02 08:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — 1.3.0: §2 lỗi cửa nạp có error.intake (bể chờ), lô có intakeId -->

<!-- [2026-11-02 08:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 1.3.0: docType manual_journal (PHASES 3.15, ADR-0015 Q1, K2) -->

<!-- [2026-11-02 11:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — gộp main sau PHASE-011 (manual_journal lấy 1.3.0): error.intake lên 1.4.0 -->

> **Phiên bản:** 1.5.0 · 2026-11-05 · **Trạng thái:** Ổn định (1.4.0: §2 lỗi cửa nạp thêm `error.intake`; 1.3.0: thêm `docType` `manual_journal`; khuôn các loại cũ không đổi)
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
| `POST /api/v1/documents/submit` (action `core.document.submit`, từ 1.2.0) | `{ "document": … }`; `Idempotency-Key` tuỳ chọn; `?dryRun=1` | `data: { docKey, version, status, entries }`, `meta.receipt` (biên nhận bằng chứng). Lỗi định khoản trả mã lỗi, **không** lưu chứng từ trạng thái `error` (khác `POST /documents`) — dùng cho app ngoài tiến trình (ADR-0011 mức 2) |
| Module (`@bizcity/module-sdk`, từ 1.2.0) | `ctx.ledger.submit(doc)` trong action ghi | `IngestResult`; `docKey` phải `<module>:…`, `sourceSystem` = mã module; cùng giao dịch với dữ liệu module (ADR-0011 D5) |
| Phân hệ trong tiến trình (cũ) | `postDocumentIn(trx, auth, doc, { post?, hold? })` | `IngestResult` |
| Kéo qua [bizcity_connector@1](BIZCITY-CONNECTOR-v1.md) | `documents[]` cùng khuôn | luôn `pending` |

Từ 1.3.0: cửa nạp từ chối vì nội dung (`VALIDATION_ERROR`, `CONFLICT`; không gồm chạy thử) thì giữ chứng từ ở bể chờ và thêm `error.intake = { id, attempt, score, findings, url }` vào phản hồi; dòng lỗi của lô có `intakeId`. Mã HTTP, `error.details` không đổi ([BIZCITY-INTAKE-FINDINGS-v1 §5](BIZCITY-INTAKE-FINDINGS-v1.md)).

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

### 3.1 Tham chiếu chính sách (1.6.0-draft)
<!-- [2026-11-07 10:32 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W2a chữ chốt (S031-8, ADR-0031 D-POL-5): policyRefs đầu phiếu, policyRef ở dòng; tuỳ chọn, nguồn cũ không đổi -->

> **Trạng thái:** đề xuất (PHASE-031 · 00 §8). Có hiệu lực khi mã W2a merge; đến lúc đó cửa nạp **bỏ qua** hai trường này như trường lạ của `extra`.

| Trường | Kiểu | Bắt buộc | Nghĩa |
|---|---|---|---|
| `policyRefs` | `{ key, version, hash, policyId? }[]` ≤ 50 | | Chính sách nghiệp vụ đã phát hành mà nguồn dùng để lập chứng từ này ([ADR-0031](../adr/ADR-0031-policy-registry-rule-contracts.md)). `key` = mã chính sách ở sổ đăng ký; `version` ≥ 1; `hash` = `contentHash` của bản (64 hex, lấy từ sổ đăng ký chính sách — API đọc cho nguồn ngoài ở PHASE-031 W3 — hoặc từ vết của module); `policyId` khi nguồn biết định danh |
| `lines[].policyRef` | `{ key, version, line? }` | | Dòng này sinh ra từ chính sách nào (vd dòng quà tặng). `key` phải có trong `policyRefs` |

Cửa nạp lưu nguyên văn trong `payload`, kiểm ở tầng L4 (`IN-POL-001` tham chiếu / băm sai, `IN-POL-002` bản không hiệu lực tại `docDate`, `IN-POL-003` đã có bản mới hơn — đều `warn`, cửa nạp vẫn nhận) và ghi kết quả vào `policy_check` của sự việc. Đơn vị đặt `bizcity.intake.policy_check = strict` thì sự việc có các mã này **chờ duyệt** thay vì ghi ngay. Không gửi `policyRefs` → như mọi bản trước.

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
| `manual_journal` (từ 1.3.0) | **`lines[]`** ≥ 1 dòng `{**lineKey**, **reasonCode**, **amount** > 0, partnerCode?, description?}` — **khuôn đóng**: dòng / phiếu có trường lạ (số tài khoản, `taxCode`…) hay có `invoice` → `VALIDATION_ERROR` | **`totals{total > 0}`** = Σ `amount` |

Dòng hàng (`sale`…`purchase_return`): **`lineKey`**, `sku`, `itemId` (định danh, gửi kèm hoặc thay `sku`; có cả hai mà khác mặt hàng thì từ chối), `name`, `unit`, `qty` (ĐVT nhỏ nhất), `unitQty`, `unitRatio`, `unitPrice`, **`amountBeforeTax`** (đã trừ chiết khấu, tròn như hoá đơn), `discount`, **`taxCode`**, `taxAmount`, `warehouseCode`, `isGift`, `excludeFromCost`, `lotNo`, `expDate`, `note`, `cost`.

Dòng kho (`transfer`, `stock_adjustment`): **`lineKey`**, **`sku`**, `name`, `unit`, **`qty`**, `amount` (giá vốn; 0 = định giá cuối tháng), `warehouseCode`.

**Phiếu kế toán module lập (`manual_journal`, [ADR-0015](../adr/ADR-0015-chot-sdk-v1-moi-thu-qua-be-su-kien.md) Q1, đặc tả [50-DAC-TA-MANUAL-JOURNAL](../phases/PHASE-011-MODULE-SDK/50-DAC-TA-MANUAL-JOURNAL.md)):** module (`ctx.ledger.submit`) nộp phân bổ trả trước, trích trước, kết chuyển doanh thu chưa thực hiện… Mỗi dòng ghi **Nợ** `debit_account` / **Có** `credit_account` của lý do loại `journal` (kế toán khai ở Lý do – tài khoản, ACC18, hoặc gói định khoản), cả phiếu một bút toán. Lý do lạ / khác loại `journal` → lỗi định khoản. `partnerCode` phải có sẵn (không tự thêm); không có thì dùng `partner` của phiếu; tài khoản theo dõi đối tượng mà thiếu → sổ chặn. Chế độ định khoản mặc định **chờ duyệt** như mọi loại. Lõi `ke-toan` tự chọn tài khoản bằng phiếu kế toán của mình (`/api/v1/vouchers`), không qua loại này.

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
| Mã nội bộ ngoài Kernel (phân hệ, add-in) | `ledgerQuery.query(db, tenantId, q)` | `@bizcity/kernel` (trước: `apps/api/src/kernel/public.ts` |
| Báo cáo cần SQL riêng | SQL trên khung nhìn chỉ đọc `bizcity_read.ledger_entries`, `bizcity_read.ledger_lines`, `bizcity_read.ledger_balances_daily`; tài khoản đối ứng bằng `otherSide()` | migration `0043_doc_so_cai.sql` |

Câu hỏi `q` (`ledgerQuerySchema`, `packages/contracts/src/ledger-query.ts`) hỏi theo **mã**: `to` (bắt buộc), `from`, `accounts` (đầu số), `partnerCode`, `branchCodes`, `dimension` ({mã chiều: mã giá trị}), `sku`, `groupBy` (`account` | `partner` | `branch`, mặc định `account`). Kết quả mỗi dòng: mã theo `groupBy` + `opening` (Nợ − Có trước `from`), `debit`, `credit`, `closing`, số đồng, cộng trừ bằng xu.

Bảo đảm:
- Mã không tồn tại → `NOT_FOUND`, không trả 0 (R-REV-13). Sai khuôn ngày, `from` sau `to` → `VALIDATION_ERROR`.
- Bút toán đã đảo và bút toán đảo đều được cộng — chúng triệt tiêu nhau, số dư bằng số đang hiệu lực.
- Có `dimension` hoặc `sku` → đọc dòng sổ; còn lại đọc số dư ngày (nhanh). Hai đường cho cùng số.
- Khung nhìn chạy bằng quyền người gọi (`security_invoker`): RLS theo đơn vị vẫn áp. Ghi qua khung nhìn bị trigger chặn. Không đưa `content_hash` / `body_hash` ra.
- Kernel đổi cấu trúc bảng sổ thì sửa khung nhìn trong migration mới; cột của khung nhìn chỉ **thêm**, không bớt / đổi nghĩa trong `@1`.

## 8. Changelog

- **1.5.0 (2026-11-05):** <!-- [2026-11-05 04:45 PM Nguyễn Văn Thủy] PHASE-026 — S024-11, S026-14, S026-19..23: phủ kín định danh, đo tải (đóng góp) --> dòng hàng nhận thêm `itemId` (tuỳ chọn, không phá khuôn cũ); hỏi sổ theo `sku` lấy cả mã cũ, mã đã gộp của mặt hàng.
- **1.4.0 (2026-11-02):** §2 lỗi cửa nạp thêm `error.intake` (bể chờ `intake_inbox`), dòng lỗi lô thêm `intakeId`; `POST /documents` kiểm khuôn trong cửa nạp (sai khuôn vẫn `VALIDATION_ERROR`, `details` là mảng câu như cũ). Tương thích: bên gọi cũ bỏ qua trường mới (PHASE-021 W2, ADR-0014 D2).
- **1.3.0 (2026-11-02):** thêm `docType` `manual_journal` (§4): dòng theo lý do `journal`, không số tài khoản, không thuế, khuôn đóng; năng lực `ledger.manual-journal` available (PHASES 3.15, K2). Lý do có thêm `kind: journal` + `debitAccount` / `creditAccount` (migration 0058, `bizcity_posting_template@1`).
- **1.2.0 (2026-11-02):** §2 thêm hai cửa cùng đường vào Kernel (`submitDocumentIn` → `postDocumentIn`): action `core.document.submit` (Idempotency-Key, biên nhận, dry-run; lỗi không lưu chứng từ) và `ctx.ledger.submit` cho module (tiền tố `docKey`, `sourceSystem` = module). Khuôn chứng từ không đổi (PHASE-011, ADR-0011 D5).

- **1.1.0 (2026-10-31):** §7.1 đọc sổ — năng lực `ledger.query` (PHASES 3.7, PHASE-012 S012-2): `ctx.ledger.query`, `ledgerQuery`, khung nhìn chỉ đọc `bizcity_read.*`. Khuôn nộp không đổi.
- **1.0.0 (2026-10-28):** Đặt tên hợp đồng cho khuôn `IngestDocument` đang chạy; nội dung không đổi.
