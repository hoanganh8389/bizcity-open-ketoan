# `bizcity_document@1` — Document Contract

> **Phiên bản:** 1.0.0-draft · 2026-10-29 · **Trạng thái:** Đề xuất · **Thuộc:** [Standard v1](../standard/README.md) (hợp đồng 3/7)
> **Luật nền:** [R-WF](../rules/RULE-WORKFLOW.md), [R-EVENT](../rules/RULE-EVENT.md) · **Năng lực:** `documents.numbering`, `documents.versions`, `documents.links`, `documents.attachments`, `documents.signatures`, `documents.workflow`, `ledger.submit`

## 1. Mục đích

Chuẩn chung cho **mọi chứng từ nghiệp vụ** (hợp đồng, đơn mua, đề nghị thanh toán, phiếu chăm sóc khách…): đầu phiếu, dòng, trạng thái, phiên bản, tham chiếu, đính kèm, ký. Chứng từ kế toán (`accounting_events`) là **một trường hợp đặc biệt** của chuẩn này, do Kernel giữ.

## 2. Hai loại "chứng từ", một chuẩn

| | Chứng từ nghiệp vụ (module) | Sự việc kế toán (Kernel) |
|---|---|---|
| Ở đâu | bảng `mod_<key>.*` của module | `accounting_events` + `accounting_event_versions` |
| Ai ghi | module, qua action | chỉ Kernel, qua `ctx.ledger.submit` |
| Sửa được không | được, mỗi lần sửa tăng `version` | không sửa; phiên bản mới → Kernel đảo bút toán cũ, ghi bút toán mới |
| Nối nhau | `docKey` của sự việc = `docRef` của chứng từ nghiệp vụ | |

Chứng từ nghiệp vụ **không** sinh bút toán. Chỉ khi chuyển sang trạng thái khai ở `ledger[].on` thì module nộp một sự việc kế toán. Đó là điểm chạm duy nhất với sổ cái.

## 3. Danh tính và tham chiếu

- **`docRef`** = `<key>.<loại>:<id>`, vd `hop-dong.contract:42`. Ổn định, dùng làm `docKey` khi nộp sổ (thêm hậu tố nếu một chứng từ sinh nhiều sự việc: `hop-dong.installment:118:payment`).
- **Số chứng từ** (`docNo`) cấp bằng `ctx.documents.nextNumber(series)` (dãy `document_sequences` hiện có, theo đơn vị + năm). Module không tự đếm, không ghi `document_sequences` (đang vi phạm ở `mua-hang/store.ts:266`, `quy/payment-requests/payment-request.routes.ts:49`).
- **Liên kết** giữa chứng từ: `ctx.documents.link(from, to, role)` với `role` ∈ `source` (lập từ), `reverses`, `replaces`, `settles` (thanh toán cho), `attachesTo`, `ledger` (sự việc kế toán sinh ra). Bảng chung `document_links` (Platform).

## 4. Cột chuẩn của bảng đầu phiếu

| Cột | Kiểu | Nghĩa |
|---|---|---|
| `id`, `tenant_id`, `created_*`, `updated_*` | theo [Data](BIZCITY-DATA-v1.md) | |
| `doc_no` | `text` | số do `nextNumber` cấp; `UNIQUE (tenant_id, doc_no)` |
| `doc_date` | `date` | ngày chứng từ (luật khoá theo ngày áp vào đây) |
| `branch_code` | `text` | chi nhánh (mã danh mục chuẩn), nếu nghiệp vụ có chi nhánh |
| `status` | `text` + `CHECK` | trạng thái (§5) |
| `version` | `integer` | tăng mỗi lần nội dung đổi |
| `posted_version` | `integer NULL` | phiên bản đã nộp sổ gần nhất (nếu chứng từ chạm sổ) |

Dòng chứng từ: bảng riêng, có `line_key text` ổn định trong phiếu (không dùng số thứ tự làm khoá), `UNIQUE (tenant_id, <doc>_id, line_key)`.

## 5. Trạng thái

Mỗi loại chứng từ có máy trạng thái khai báo. Trạng thái riêng của module được, nhưng **mỗi trạng thái phải thuộc một nhóm chuẩn** để Core, báo cáo chung và AI hiểu thống nhất:

| Nhóm chuẩn | Ý nghĩa | Sửa nội dung | Chạm sổ |
|---|---|---|---|
| `draft` | đang soạn, bị trả lại | được | không |
| `pending` | chờ duyệt (một hoặc nhiều cấp) | không (rút về `draft` để sửa) | không |
| `approved` | đã duyệt, có hiệu lực | chỉ qua "điều chỉnh" → `version` mới | **có thể** (theo `ledger[].on`) |
| `done` | đã hoàn tất (đã chi, đã thanh lý…) | không | có thể |
| `cancelled` | đã huỷ | không | huỷ sự việc đã nộp → bút toán đảo |

```yaml
# modules/hop-dong/api/documents/contract.workflow.yaml
type: hop-dong.contract
states:
  draft:     { group: draft }
  submitted: { group: pending }
  approved:  { group: approved }
  active:    { group: approved }
  closed:    { group: done }
  cancelled: { group: cancelled }
transitions:
  submit:  { from: [draft], to: submitted, permission: "hop-dong:write" }
  approve: { from: [submitted], to: approved, permission: "hop-dong:approve", sod: true }
  reject:  { from: [submitted], to: draft, permission: "hop-dong:approve", requires: [reason] }
  activate: { from: [approved], to: active, permission: "hop-dong:write" }
  close:   { from: [active], to: closed, permission: "hop-dong:approve" }
  cancel:  { from: [draft, submitted, approved], to: cancelled, permission: "hop-dong:approve", requires: [reason] }
```

`sod: true` (tách nhiệm): người duyệt khác người lập. Transition `by: event, on: "<loại sự kiện>"` không gọi được từ ngoài; runtime chạy nó khi subscriber nhận sự kiện khớp `subject` (actor `system`, vẫn có bằng chứng). Ví dụ: kỳ thanh toán sang "đã thu" khi nhận `bizcity.ledger.entry.posted`. Duyệt nhiều cấp theo ngưỡng tiền như `payment_requests` (`approved1` → `approved`) khai bằng `levels` (năng lực `documents.workflow`).

## 6. Luật

| Mã | Cấp | Luật | Kiểm bằng |
|---|---|---|---|
| STD-DOC-1 | 0 | Chứng từ nghiệp vụ chỉ chạm sổ qua `ctx.ledger.submit` / `cancel`, với `docKey` suy ra từ `docRef`, ở đúng chuyển trạng thái khai trong manifest `documents[].ledger` | CONF-STATIC-2, CONF-RUN-5 |
| STD-DOC-2 | 0 | Mỗi lần nội dung đổi: `version` tăng và ảnh chụp lưu ở `document_versions` (ai, khi nào, băm nội dung). Không ghi đè lịch sử | CONF-RUN-7 |
| STD-DOC-3 | 0 | Chuyển trạng thái chỉ qua transition đã khai; mỗi transition là một action (có quyền, bằng chứng) | CONF-RUN-1, CONF-RUN-4 |
| STD-DOC-4 | 1 | Mọi trạng thái thuộc một trong 5 nhóm chuẩn | CONF-MAN-4 |
| STD-DOC-5 | 1 | Sửa chứng từ đã `approved` có chạm sổ: phiên bản mới nộp lại cùng `docKey`, `version` mới; Kernel tự đảo bút toán cũ. Module không tự huỷ rồi tạo mới | CONF-RUN-5 |
| STD-DOC-6 | 1 | Số chứng từ chỉ cấp bằng `nextNumber`; luật khoá theo ngày (`dataLock`) và khoá kỳ áp cho `doc_date` khi ghi | CONF-RUN-8 |
| STD-DOC-7 | 1 | Đính kèm dùng năng lực chung `documents.attachments` (tệp lưu theo đơn vị, có loại, kích thước tối đa, băm); không tạo bảng đính kèm riêng | CONF-STATIC-7 |
| STD-DOC-8 | 2 | Ký theo vai dùng `documents.signatures`; chữ ký gắn với `version` lúc ký, sửa nội dung thì chữ ký cũ hết hiệu lực | review |

## 7. API SDK

```ts
ctx.documents.nextNumber('HD')                                  // 'HD-2026-0001'
ctx.documents.saveVersion(docRef, snapshot)                     // tự gọi bởi action runtime khi khai `versioned: true`
ctx.documents.transition(docRef, 'approve', { reason })         // kiểm luồng, quyền, tách nhiệm; phát sự kiện <type>.approved
ctx.documents.link(fromRef, toRef, 'settles')
ctx.documents.attach(docRef, file, { kind: 'contract-scan' })
ctx.ledger.submit({ docKey: `${docRef}:payment`, version, docType: 'customer_payment', … })  // bizcity_ledger_intake@1
```

## 8. Ánh xạ từ code hiện tại

| Hiện có | Thành |
|---|---|
| `accounting_events` (`doc_key`, `version`, `posted_version`, `status`) | giữ nguyên, là sự việc kế toán của Kernel; mẫu cho §4 |
| `accounting_event_versions` | mẫu cho `document_versions` chung |
| `payment_requests.status` 7 trạng thái | khai lại bằng workflow YAML: `draft, submitted(pending), approved1(pending), approved(approved), rejected(draft), paid(done), cancelled` |
| `document_signatures` (gắn `event_id`) | thêm cột `doc_ref`; ký được mọi chứng từ |
| `reference_documents` (`open/used/closed`) | một loại chứng từ của module Thuế dùng `document_links` |
| `purchase_attachments` | chuyển sang `attachments` chung (A-19) |
