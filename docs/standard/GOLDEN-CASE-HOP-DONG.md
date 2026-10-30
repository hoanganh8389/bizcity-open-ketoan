# Ca chuẩn: module Hợp đồng do Claude Code sinh ra
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->

> Ca này là **phép thử nghiệm thu** của Standard v1. Standard chỉ lên 1.0.0 khi ca này đạt (Phase 4, [PHASES.md](PHASES.md)).
> Manifest đầy đủ: [examples/hop-dong.bizcity.module.json](examples/hop-dong.bizcity.module.json) (đã kiểm theo schema).

## 1. Lời yêu cầu

Developer tải Bizcity Core về và nói với Claude Code:

> Hãy tạo module quản lý hợp đồng cho Bizcity Core. Có khách hàng, hợp đồng, kỳ thanh toán, file đính kèm, trạng thái duyệt, nhắc thanh toán. Tuân thủ toàn bộ Bizcity Framework Standard.

## 2. Claude đọc gì, theo thứ tự

| # | Tệp | Lấy được gì |
|---|---|---|
| 1 | `AGENTS.md` | Bốn câu không thương lượng; "module mới → làm theo `docs/standard/`"; lệnh phải chạy |
| 2 | `docs/standard/README.md` | 3 nguyên tắc, 7 hợp đồng, module chỉ thấy `ctx` |
| 3 | Tệp này | Một ví dụ làm mẫu: yêu cầu → quyết định → tệp |
| 4 | `docs/contracts/BIZCITY-*-v1.md` (7 tệp) | Luật `STD-*` từng phần |
| 5 | `GET /api/v1/system/capabilities` hoặc `bizcity-standard.json` | Năng lực Core đang có |
| 6 | `bizcity module new hop-dong` | Khung thư mục từ `templates/starter-module/` |

Claude **không** cần đọc `packages/kernel`, `ledger.service.ts`, luật định khoản. Đó là chủ đích.

## 3. Từ yêu cầu tới quyết định

| Yêu cầu | Làm thế nào | Hợp đồng | Không làm (và vì sao) |
|---|---|---|---|
| **Khách hàng** | Dùng danh mục đối tượng chuẩn. Đọc qua `bizcity_read.partners`; khách mới tạo bằng `ctx.actions.call('core.partner.upsert')`. Thêm tab "Hợp đồng" vào hồ sơ khách (`partner.detail.tab`) | Data §3, Extension §3 | Không tạo bảng `customers`: kế toán là chủ danh mục, công nợ khách phải về đúng một mã |
| **Hợp đồng** | Loại chứng từ `hop-dong.contract`, bảng `mod_hop_dong.contracts`, số `HD-{yyyy}-{0000}` qua `nextNumber`, phiên bản mỗi lần sửa | Document §3–4, Data | Không tự đếm số, không ghi `document_sequences` |
| **Kỳ thanh toán** | Bảng `mod_hop_dong.installments` (thuộc hợp đồng: khoá ngoại trong schema mình). Mỗi kỳ là loại chứng từ `hop-dong.installment` có luồng riêng | Document, Data | — |
| **File đính kèm** | `ctx.documents.attach(docRef, file, { kind })` | Document STD-DOC-7 | Không tạo bảng `contract_attachments` (A-19) |
| **Trạng thái duyệt** | Workflow YAML: `draft → submitted → approved → active → closed`, `cancelled`; tách nhiệm người lập / người duyệt; duyệt cấp 2 khi giá trị ≥ `bizcity.hop_dong.second_approval_amount` | Document §5 | Không tự viết cột `status` + `if` rải rác |
| **Nhắc thanh toán** | Subscriber `bizcity.clock.daily` → tìm kỳ đến hạn trong `remind_days` → phát `hop-dong.installment.due` → subscriber gọi `core.notify.send` (trong ứng dụng; có Cell thì gửi Zalo cho người phụ trách) | Event §4, Extension §5 | Không `setInterval`, không gửi tin nhắn trong action |
| **Thu tiền một kỳ** (suy ra từ "kỳ thanh toán") | Action `record-payment` (quyền `hop-dong:collect`, idempotency bắt buộc) → `ctx.ledger.submit({ docType: 'customer_payment', docKey: 'hop-dong.installment:<id>:payment', partner, methodCode, totals })` → kỳ sang `collecting`. Nghe `bizcity.ledger.entry.posted` cùng `docKey` → kỳ sang `paid`, phát `hop-dong.installment.paid` | Action, Ledger intake, Event §7 | Không viết tài khoản 111/112/131. Core tra theo `methodCode` và cấu hình |
| **Bằng chứng** | Tự động: mọi action ghi có bản ghi + biên nhận | Evidence | Không gọi `writeAudit`, không ghi tệp log |

### Vì sao kỳ có trạng thái `collecting`

Đơn vị mặc định để `customer_payment` ở chế độ **chờ duyệt** (`postingModes`, mặc định `approve`): phiếu thu nằm ở Chờ định khoản tới khi kế toán duyệt. Module không được coi là "đã thu" chỉ vì đã nộp; nó chờ sự kiện `bizcity.ledger.entry.posted`. Kế toán từ chối → nhận `bizcity.ledger.event.failed`/`reversed` → kỳ về `scheduled`. Người viết module không cần biết chi tiết này: luồng mẫu trong starter template đã làm sẵn.

### Ngoài phạm vi v1: ghi nhận doanh thu theo kỳ

Hoá đơn cho từng kỳ dùng được loại `sale` có sẵn (dòng dịch vụ, mã hàng dịch vụ trong danh mục). Còn **phân bổ doanh thu nhận trước theo thời gian** cần loại sự việc mới mà Kernel chưa có. Module **không** tự làm; Claude phải trả lời người dùng như sau và soạn đề xuất năng lực `ledger.doctype.revenue_recognition` ([VERSIONING §5](VERSIONING.md#5-thiếu-năng-lực-thì-đề-xuất-thay-đổi-core)):

> Phần ghi nhận doanh thu phân bổ theo kỳ cần Core hỗ trợ loại chứng từ mới. Tôi đã soạn đề xuất gửi nhóm Lõi; module hiện ghi nhận thu tiền và xuất hoá đơn theo kỳ.

Đây là nguyên tắc **P2** chạy trong thực tế.

## 4. Luồng kỳ thanh toán

```yaml
# modules/hop-dong/api/documents/installment.workflow.yaml
type: hop-dong.installment
states:
  scheduled:  { group: approved }    # có hiệu lực khi hợp đồng active
  collecting: { group: approved }    # đã nộp phiếu thu, chờ sổ ghi
  paid:       { group: done }
  cancelled:  { group: cancelled }
transitions:
  collect:        { from: [scheduled], to: collecting, permission: "hop-dong:collect" }     # → ctx.ledger.submit
  confirm:        { from: [collecting], to: paid, by: event, on: "bizcity.ledger.entry.posted" }
  revert:         { from: [collecting, paid], to: scheduled, by: event, on: "bizcity.ledger.entry.reversed" }
  cancel-payment: { from: [collecting, paid], to: scheduled, permission: "hop-dong:approve", requires: [reason] }  # → ctx.ledger.cancel
  cancel:         { from: [scheduled], to: cancelled, permission: "hop-dong:approve" }
```

## 5. Tệp Claude sinh ra

```
modules/hop-dong/
├── bizcity.module.json
├── README.md
├── api/
│   ├── index.ts                                 defineModule({ actions, subscribers, documents, hooks })
│   ├── schemas/{contract,installment}.ts        zod thực thể (Data §5)
│   ├── documents/contract.workflow.yaml
│   ├── documents/installment.workflow.yaml
│   ├── actions/contract-{create,update,get,list,submit,approve,reject,activate,close,cancel,attach}.ts
│   ├── actions/installment-{list-due,record-payment,cancel-payment}.ts
│   ├── subscribers/{remind-due,notify-due,on-ledger-posted,on-ledger-reversed}.ts
│   └── hooks/{partner-in-use,schedule-matches-total}.ts
├── migrations/
│   └── 0001_hop_dong.sql                        schema mod_hop_dong, 2 bảng, RLS, COMMENT
├── web/
│   ├── index.tsx                                defineWebModule({ routes, menu, slots })
│   ├── screens/{ContractList,ContractForm,DueSchedule}.tsx   chỉ @bizcity/ui-kit
│   ├── slots/{PartnerContractsTab,DueThisWeek,OpenInstallment}.tsx
│   └── print/contract.tsx
└── tests/
    └── hop-dong.test.ts                         kịch bản GC-1..GC-12 dưới đây
```

Không tệp nào ngoài `modules/hop-dong/` bị sửa. Đây là tiêu chí đo (§8).

## 6. Kịch bản nghiệm thu

Chạy bằng `bizcity module check modules/hop-dong` (toàn bộ [CONFORMANCE.md](CONFORMANCE.md)) **cộng** các kịch bản nghiệp vụ:

| Mã | Kịch bản | Kỳ vọng |
|---|---|---|
| GC-1 | Lập hợp đồng 3 kỳ, tổng kỳ ≠ giá trị hợp đồng, gửi duyệt | Hook `schedule-matches-total` chặn: `VALIDATION_ERROR` |
| GC-2 | Người lập tự duyệt | `FORBIDDEN` (tách nhiệm) |
| GC-3 | Hợp đồng ≥ ngưỡng: duyệt một cấp | vẫn `submitted` (chờ cấp 2) |
| GC-4 | Đính kèm bản scan PDF, sửa hợp đồng nháp | có 2 phiên bản, tệp vẫn gắn |
| GC-5 | Đồng hồ ngày: kỳ đến hạn trong 3 ngày | 1 sự kiện `installment.due`, 1 thông báo; giao lại đồng hồ → không thông báo lần hai |
| GC-6 | Ghi nhận thu kỳ 1 (đơn vị chế độ chờ duyệt) | kỳ `collecting`; sự việc `customer_payment` `pending`; chưa có bút toán |
| GC-7 | Kế toán duyệt phiếu thu | bút toán Nợ tiền / Có 131 theo cấu hình; kỳ `paid`; sự kiện `installment.paid` |
| GC-8 | Gửi lại GC-6 cùng `Idempotency-Key` | cùng phản hồi, không sự việc thứ hai |
| GC-9 | Huỷ thu kỳ 1 | bút toán đảo đúng một lần; kỳ `scheduled` |
| GC-10 | Ghi nhận thu trong kỳ đã khoá | `PERIOD_LOCKED`; kỳ không đổi |
| GC-11 | Xoá khách hàng đang có hợp đồng ở màn Danh mục | Core từ chối (`referenceCheck`) |
| GC-12 | Gọi `record-payment` qua actor AI (`expose.ai: propose`) | chỉ tạo bản nháp chờ người duyệt; bằng chứng `kind: ai` |

## 7. Quan hệ với code hiện có

Core **đang có** một phần nghiệp vụ hợp đồng nằm trong lõi:

| Hiện có | Ở đâu |
|---|---|
| Hợp đồng là một mã phân tích `dimensions` (`kind = 'contract'`) | `modules/dimensions/` |
| Lịch thanh toán hợp đồng `contract_schedules` (`pending/paid/cancelled`), `GET /contract-schedules?from=&to=` để nhắc hạn | `modules/dimensions/contract-schedule.routes.ts`, migration `0002` |
| Đề nghị thanh toán trỏ tới kỳ hợp đồng (`payment_requests.contract_schedule_id`) và cập nhật thẳng `contract_schedules` | `phan-he/quy/payment-requests/payment-request.routes.ts:264` |
| Kế hoạch dòng tiền lấy từ kỳ hợp đồng (`cash_plans.source_ref = 'contract:<id>'`) | `phan-he/ke-toan/planning/` |
| Test | `contract-schedules.test.ts`, `payment-requests.test.ts` |

Khuyên: ca chuẩn sinh module mới độc lập (đo được "Claude tạo được module"); sau khi đạt, **chuyển** `contract_schedules` và màn liên quan vào `modules/hop-dong`, giữ mã phân tích `contract` trong Platform để báo cáo theo hợp đồng vẫn chạy. Hai test hiện có trở thành phép thử hồi quy cho việc chuyển. **Đã chốt 2026-10-29: [ADR-0003](../adr/ADR-0003-hop-dong-thanh-module.md).**

Đo tiến độ bằng bảng điểm (`node tests/conformance/selfcheck.mjs`): mục "Ca chuẩn Hợp đồng" đếm năng lực manifest mẫu cần đã `available`; module sinh ra kiểm bằng `--module modules/hop-dong` trước khi cài.

## 8. Đo thế nào là đạt

| Tiêu chí | Ngưỡng |
|---|---|
| Lặp lại | 3 lần chạy Claude Code độc lập trên repo sạch, cùng lời yêu cầu |
| Bộ kiểm | Cả 3 lần: `bizcity module check` → `pass`, không `waived` |
| Kịch bản | GC-1..GC-12 đạt |
| Không đụng Core | `git diff --stat` chỉ có `modules/hop-dong/**` |
| Kernel | Bộ test Kernel (624 phép thử hiện có) vẫn xanh; `assertLedgerInvariants` đạt |
| Sửa tay | 0 dòng sửa tay sau khi Claude báo xong (được phép trả lời câu hỏi làm rõ của Claude) |

Lần nào không đạt: ghi lại Claude vấp ở đâu (đọc thiếu tài liệu nào, SDK thiếu gì), sửa **tài liệu / SDK / starter template**, không sửa kết quả của lần chạy.
