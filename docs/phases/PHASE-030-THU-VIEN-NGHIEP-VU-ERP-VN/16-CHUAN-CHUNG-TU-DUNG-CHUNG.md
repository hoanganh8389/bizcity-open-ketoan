# PHASE-030 · 16 — Chuẩn chứng từ dùng chung: một lớp chứng từ, workflow YAML, chính sách duyệt, hai con trỏ phiên bản
<!-- [2026-11-06 01:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — trả lời "xây chuẩn chứng từ thế nào để module trong core dùng lại": nối tiếp bizcity_document@1 (1.3.0-draft), không viết lại; đề xuất 1.4.0 — defineDocument, luồng điều chỉnh hai con trỏ, chính sách duyệt, ranh giới bút toán tay -->

> **Vị trí:** đề xuất cho [`bizcity_document@1`](../../contracts/BIZCITY-DOCUMENT-v1.md) bản **1.4.0-draft**. Khi nhóm Lõi duyệt, nội dung §2–§6 chuyển vào hợp đồng (PR chốt thiết kế, R-FLOW §3); tài liệu này giữ phần lý do và bằng chứng.
> **Luật nền đã có, không đổi:** STD-DOC-1..8, DOC-01..06 (hợp đồng chứng từ) · R-WF-1..9 · R-POST-2 · R-EVENT-3/8 · ADR-0015 (mọi thứ chạm sổ đi bể sự kiện).
> **Bối cảnh:** [15 §0](15-KINH-NGHIEM-COT-LOI.md) — Erp-vn hỏng vì không có lớp chứng từ chung; ý hay nhất của nó là "bản đang sửa / bản lên báo cáo".

## 0. Trả lời ngắn

open-ketoan **đã có khoảng 70 % chuẩn chứng từ**: hợp đồng `bizcity_document@1` có `docRef`, cột chuẩn (`version`, `posted_version`), 5 nhóm trạng thái, workflow YAML (`levels`, `sod`, `requires`, `ledger`), số chứng từ, phiên bản, liên kết, đính kèm, ký, cổng lịch sử. Chỗ còn thiếu làm module phải tự viết lại (đúng lỗi của Erp-vn):

| Thiếu | Hậu quả nếu không làm | Đề xuất |
|---|---|---|
| Không có **một lời khai chứng từ** — mỗi module tự viết action lập / sửa / gửi / duyệt / huỷ, tự lưu trạng thái, tự gọi `saveVersion`, `nextNumber`, `dataLock`, `ledger.submit` | 5 module thì 5 cách, quên một bước là mất truy vết | §2 `defineDocument` |
| `ctx.documents.transition` ⏳, manifest `documents[].workflow` chưa được runtime tự nạp | workflow YAML là tuỳ chọn trên thực tế | §3 bắt buộc + tự nạp |
| **Điều chỉnh sau duyệt** chỉ có ở Kernel (`version` / `posted_version`), chưa có luồng chuẩn ở chứng từ module | sửa 3 lần = đảo 3 lần + ghi 3 lần | §4 hai con trỏ |
| Ngưỡng duyệt nằm rải (`payment_request_settings`, `purchase_policies`), engine authz PHASE-028 chưa nối | mỗi module một bảng ngưỡng | §5 chính sách duyệt |
| Ranh giới "bút toán tay" chưa viết thành một chỗ | dev tưởng "không số TK" là cấm hạch toán tay | §6 |

## 1. Ba loại chứng từ, một khuôn

| Loại | Ví dụ | Ai lập | Chạm sổ | Số TK |
|---|---|---|---|---|
| **A. Chứng từ nghiệp vụ** (module) | đơn bán, phiếu kiểm kê, bảng lương, đề nghị tạm ứng | người dùng qua action module | chỉ ở chuyển khai `ledger: true` → `ctx.ledger.submit` | **không bao giờ** — chỉ `reasonCode` |
| **B. Phiếu kế toán do module lập** | phân bổ trả trước, trích trước, kết chuyển lương | module | `docType: manual_journal` | **không** — khuôn `strict` từ chối `account`, `debitAccount` (`packages/contracts/src/documents.ts:299-324`) |
| **C. Phiếu kế toán thủ công** | bút toán điều chỉnh của kế toán | người dùng trên màn phiếu kế toán | `docType: manual` | **có** — số TK là **dữ liệu người nhập**, không phải hằng trong mã |

Cả ba dùng **cùng** vòng đời (§3), cùng hai con trỏ (§4), cùng chính sách duyệt (§5), cùng khoá kỳ theo `doc_date`, cùng bằng chứng.

## 2. `defineDocument` — một lời khai, nền làm phần chung

Học từ Erp-vn theo hướng ngược lại: nó có 94 lần khai `company_id`, 26 lần `approved_by`, 76 hàm ghi đè `write`. Ở đây module **chỉ khai phần khác nhau**:

```ts
// modules/kho/api/documents/stock-count.document.ts
import { defineDocument, z } from '@bizcity/module-sdk';

export const stockCount = defineDocument({
  type: 'kho.stock_count',                       // docRef = kho.stock_count:<id>
  series: 'KK',                                  // số KK-2026-0001, cấp lúc duyệt (K-030-11)
  workflow: new URL('./stock-count.workflow.yaml', import.meta.url),
  content: z.object({ warehouse: z.string(), countedAt: z.string(), lines: z.array(lineSchema) }),
  lineKey: (l) => l.lineKey,                     // STD-DOC §4: khoá dòng ổn định
  approval: 'kho.kiem_ke.duyet',                 // khoá chính sách duyệt (§5), không ngưỡng trong mã
  check: (doc, ctx) => checkStockCount(doc, ctx),    // hàm thuần → findings[] (STD-030-8)
  ledger: {                                      // chỉ khi chuyển có `ledger: true`
    docType: 'stock_adjustment',
    build: (doc) => toIntake(doc),               // trả bizcity_ledger_intake@1, reasonCode NDC / XDC
  },
  revision: true,                                // cho phép điều chỉnh sau duyệt (§4)
});
```

Nền (Platform) sinh và giữ đúng **một** cách làm cho mọi chứng từ:

| Bước nền làm | Đã có để dựa vào | Mới |
|---|---|---|
| Action `create / update / <transition> / revise / promote / discard-revision` cho mỗi `type`, đều đi `runAction` (quyền, bằng chứng, idempotency) | `defineAction`, `runAction`, `writeEvidence` | sinh tự động từ YAML |
| Kiểm khoá ngày + khoá kỳ cho `doc_date` **trước** khi lưu (STD-DOC-6, STD-030-4) | `dataLock`, `period_locks` | gọi bắt buộc trong khuôn |
| Gọi `check()` → `findings[]`; `block` dừng, `warn` cần lý do, `info` hiện | `bizcity_findings@1`, `notifyFinding` | mã module khai trong manifest `findings[]` |
| `wf.plan()` (SoD, cấp, lý do) → lưu trạng thái + dòng lịch sử trạng thái | `Workflow.plan` | bảng `document_status_history` (P-030-1) |
| `saveVersion` mỗi lần nội dung đổi | `ctx.documents.saveVersion` | tự gọi khi `versioned` (đã hứa ở §7.1, chưa làm) |
| Cấp số | `ctx.documents.nextNumber` | thời điểm cấp theo `series.at: approve` |
| Nộp sổ ở chuyển `ledger: true`: `ctx.ledger.submit({ docKey: docRef, version, … })` + liên kết `ledger` | `ctx.ledger.submit` (W2a tự `saveVersion` + link) | — |
| `GET /documents/:docRef` chung: đầu phiếu, trạng thái, `version`, `postedVersion`, `revision`, lịch sử, liên kết, bút toán theo phiên bản | `/documents/history` (Kernel) | đọc chung cho chứng từ module |

Bảng đầu phiếu **chung** `module_documents` (đơn vị, chi nhánh, `doc_ref`, `doc_no`, `doc_date`, `status`, `status_group`, `version`, `posted_version`, `revision_version`, `revision_status`, `created_by/at`, `approved_by/at`, `posted_at`, `amount` để tra chính sách). Nội dung riêng của module vẫn ở `mod_<key>.*`, nối bằng `doc_ref`. Nhờ vậy danh sách "chứng từ chờ tôi duyệt", "chứng từ có bản điều chỉnh", báo cáo trạng thái… là **một** truy vấn cho mọi module.

## 3. Workflow YAML cho từng loại chứng từ (bắt buộc)

Luật: mọi `type` trong manifest `documents[]` **phải** có `workflow` (R-WF-1 đã nói, nay thành lỗi `block` của `bizcity module check`), runtime **tự nạp** từ manifest, và không có đường nào khác để đổi `status`.

Khuôn chung (mở rộng hợp đồng §5.1, chỉ thêm khoá):

```yaml
# modules/kho/api/documents/stock-count.workflow.yaml
type: kho.stock_count
label: Phiếu kiểm kê
states:
  draft:     { group: draft,     label: Nháp }
  counting:  { group: draft,     label: Đang đếm, locks: [ "kho:{warehouse}" ] }   # mới: khoá tài nguyên khi ở trạng thái này
  submitted: { group: pending,   label: Chờ duyệt }
  approved:  { group: approved,  label: Đã duyệt }
  done:      { group: done,      label: Đã điều chỉnh kho }
  cancelled: { group: cancelled, label: Đã huỷ }
transitions:
  start:   { from: [draft], to: counting, permission: "kho:write" }
  submit:  { from: [counting], to: submitted, permission: "kho:write" }
  approve: { from: [submitted], to: approved, policy: kho.kiem_ke.duyet, sod: true, ledger: true }   # mới: policy thay levels cứng
  reject:  { from: [submitted], to: counting, permission: "kho:approve", requires: [reason] }
  finish:  { from: [approved], to: done, by: event, on: "bizcity.ledger.entry.posted" }
  cancel:  { from: [draft, counting, submitted], to: cancelled, permission: "kho:approve", requires: [reason] }
revision:                                             # mới: luồng điều chỉnh chuẩn (§4)
  from: [approved, done]
  policy: kho.kiem_ke.dieu_chinh
  requires: [reason]
```

Luật đi kèm đã vào [R-WF](../../rules/RULE-WORKFLOW.md) theo [ADR-0029](../../adr/ADR-0029-loi-bat-bien-nghiep-vu-linh-hoat.md) (2026-11-06): R-WF-10 từ chối về nhóm `draft` (Erp-vn có cả `action_reject → draft` lẫn `action_refuse → refused`), R-WF-11 ngưỡng qua `policy:`, R-WF-12 khoá tài nguyên (`DOC-LOCK-002`), R-WF-13 / -14 hai lần đóng băng, R-WF-15 quyền chuyển do PHASE-028 quyết, R-WF-16 tự xác nhận. R-WF-3 nay nói **duyệt ≠ ghi sổ**: điểm ghi nhận khai theo từng loại chứng từ.

Một trang tra cho người dùng: mỗi YAML sinh một sơ đồ trạng thái (dùng ở bản mẫu [mockups](mockups/thu-vien-nghiep-vu.html) mục *Chuẩn chứng từ*), nên tài liệu luồng (R-WF-5) không lệch khỏi mã.

## 4. Hai con trỏ: bản đang sửa và bản trên sổ

### 4.1 Vấn đề

Không có hai con trỏ thì chứng từ đã ghi sổ mà sai: sửa lần 1 → đảo + ghi; phát hiện sai tiếp → đảo + ghi; trưởng phòng trả lại → đảo + ghi. Sổ có 6 bút toán rác, báo cáo nhảy theo từng lần sửa, kế toán khó đối chiếu. Erp-vn tránh bằng cách tách `current_version_id` (bản đang sửa) và `report_version_id` (bản lên báo cáo): sửa bao nhiêu lần cũng không chạm sổ, chỉ khi **đẩy** bản mới lên mới đảo + ghi một lần (`lfood_voucher/models/voucher.py:234-299`, `lfood_ledger/models/sources.py:40-53`).

### 4.2 Thiết kế cho open-ketoan

Hai con trỏ **đã có tên** trong hợp đồng: `version` (mới nhất) và `posted_version` (trên sổ). Thêm một trạng thái phụ `revision_status` để tách "đang điều chỉnh" khỏi trạng thái chính:

```
              trạng thái chính: approved (không đổi suốt quá trình điều chỉnh)
posted_version ── v3 ───────────────────────────────────────────────┐── v4
version        ── v3 ── revise ─▶ v4 (nháp) ─ sửa ─▶ v4 ─ sửa ─▶ v4 ─┤
revision       ── none ─────────▶ draft ─── submit ─▶ pending ─ approve ─▶ none
sổ             ── bút toán v3 ─────────────────────────────── đảo v3 + ghi v4 (một giao dịch)
báo cáo        ── đọc v3 ──────────────────────────────────────── đọc v4
```

| Bước | Ai | Điều kiện | Chạm sổ |
|---|---|---|---|
| `revise(reason)` | người có quyền sửa | trạng thái chính ∈ `revision.from`; chưa có bản điều chỉnh mở; `doc_date` của bản mới không rơi vào kỳ khoá | không — tạo `version = posted_version + 1`, `revision_status = draft` |
| sửa nhiều lần | như trên | `revision_status = draft` | không — mỗi lần lưu là cùng v4 (ảnh chụp lưu ở `document_versions`, diff xem được) |
| `submit-revision` | người lập | `check()` không còn `block` | không |
| `approve-revision` | theo `revision.policy`, SoD với người điều chỉnh | — | **có, đúng một lần**: `ctx.ledger.submit({ docKey, version: 4 })` → Kernel đảo bút toán v3 + ghi v4 trong cùng giao dịch, `posted_version = 4` |
| `reject-revision(reason)` | người duyệt | — | không — về `draft` của bản điều chỉnh |
| `discard-revision(reason)` | người lập / người duyệt | — | không — `version` quay về `posted_version`, v4 ở lại trong lịch sử với nhãn *bỏ* |

Bất biến (kiểm bằng golden **T030-CORE-5**, mở rộng):

1. Trong lúc `revision_status ≠ none`: số bút toán của `docKey` **không đổi**, mọi báo cáo đọc `posted_version`.
2. `approve-revision` sinh **đúng** một bút toán đảo và các bút toán của bản mới; `assertLedgerInvariants` xanh.
3. Không có hai bản điều chỉnh mở cùng lúc trên một chứng từ (finding `DOC-REV-002`).
4. Bản điều chỉnh có ngày trong kỳ đã khoá → `PERIOD_LOCKED` ngay ở `revise`, không đợi tới lúc duyệt.
5. Chữ ký gắn với v3 vẫn hiệu lực cho v3; v4 cần ký lại (STD-DOC-8).

Phía Kernel đã có gần đủ: `accounting_event_versions`, `posted_version`, đảo theo `content_hash`, chế độ giữ `hold`. Phần còn lại là **K-030-8** ([15 §3](15-KINH-NGHIEM-COT-LOI.md)): `promote` nguyên tử và sửa hàng loạt có `batchId` (học `lfood_voucher/wizards/bulk.py`). **Không** học cách đảo của Erp-vn: nó đảo theo ngày hạch toán cũ, và khi kỳ cũ khoá thì tự đổi sang hôm nay; ở đây kỳ khoá thì báo lỗi.

Áp cho chứng từ chưa duyệt: không cần hai con trỏ — `draft` / `pending` sửa tự do, chưa có bút toán.

## 5. Chính sách duyệt dùng chung

Học từ chỗ Erp-vn sai: 18 hàm duyệt / từ chối tự viết, 92 lời gọi `has_group` cứng, ngưỡng so `> limit > 0` ở chứng từ (`lfood_voucher/models/voucher.py:189`) nhưng `> limit` ở đơn mua (`lfood_purchase/models/purchase.py:316`), không kiểm người lập ≠ người duyệt.

### 5.1 Dữ liệu

Chính sách là **tham số có ngày hiệu lực** (cùng kho với P-030-2 / E2), phạm vi đơn vị → chi nhánh:

```json
{ "key": "ban_hang.order.duyet", "effectiveFrom": "2026-11-01", "scope": "tenant",
  "bands": [
    { "from": 0,           "to": 50000000,  "levels": [] },
    { "from": 50000000,    "to": 200000000, "levels": [ { "permission": "ban-hang:approve" } ] },
    { "from": 200000000,   "to": null,      "levels": [ { "permission": "ban-hang:approve" }, { "role": "chief_accountant" } ] }
  ],
  "sod": true, "basis": "amount", "reasonOnReject": true }
```

- So ngưỡng một kiểu cho mọi nơi: `from ≤ số tiền < to` (nửa mở), số tiền lấy từ `module_documents.amount` hoặc hàm `amount(doc)` khai trong `defineDocument`.
- Ngưỡng 0 nghĩa là "mọi chứng từ" — ghi rõ trong dữ liệu, không suy từ `> 0`.

### 5.2 Engine

- `policy.levelsFor(doc, at)` → `levelsRequired` (R-WF-6 đã quy định ngưỡng là cấu hình; nay thành một chỗ cho mọi module).
- Quyết định "ai được duyệt bước này" đi engine authz PHASE-028 (`authorize`, `explain` ở `packages/platform/src/core/authz/engine.ts:143-221`) — **nối vào `runAction`**, hiện chỉ test gọi.
- `explain()` trả câu cho người dùng, ví dụ: *"Đơn 120 tr ≥ ngưỡng 50 tr của chính sách ban_hang.order.duyet (hiệu lực 01/11/2026) → cần 1 cấp: quyền Duyệt bán hàng; người lập không được tự duyệt."* Câu này hiện ở tab *Duyệt* của màn chứng từ và trong finding `DOC-APPROVE-001`.
- Mỗi bước duyệt là một dòng lịch sử trạng thái + một bằng chứng (R-WF-7); người duyệt vượt quyền nhận `FORBIDDEN` kèm `explain`.
- `payment_request_settings.second_level_from` và `purchase_policies` chuyển dần về khoá chính sách (`quy.de_nghi_tt.duyet`, `mua_hang.don.duyet`) khi hai luồng đó rời `phan-he/`.

## 6. Bút toán tay: được, nhưng đi đúng cửa

Câu hỏi của chủ dự án: *"chứng từ có thể manual bút toán được, nhưng liên quan tới nguyên tắc chứng từ phía dưới"*.

- **Luật "không số TK" là luật về mã**, không cấm kế toán hạch toán tay. R-POST-2 cấm literal trong luật định khoản; STD-030-2 mở rộng cấm cho mã module.
- **Kế toán hạch toán tay** dùng loại C (`manual`): người dùng chọn tài khoản trên màn, số TK là dữ liệu của chứng từ. Nó vẫn đi đủ chuẩn: workflow YAML (`draft → pending → approved`, đã có `voucher approve`), chính sách duyệt (ví dụ `ke_toan.phieu.duyet`: trên 100 tr cần kế toán trưởng), hai con trỏ khi sửa sau duyệt, khoá kỳ, chỉ người lập sửa (`assertCanModify`).
- **Module muốn ra bút toán không theo nghiệp vụ chuẩn** dùng loại B (`manual_journal`): dòng theo `reasonCode`, kế toán trưởng khai lý do ↔ tài khoản trong posting pack. Ví dụ: trích trước tiền điện mỗi tháng → một lý do trích trước (mã đặt tên khi làm K-030-3, **chưa có** trong `vn-tt99-nen`); đổi tài khoản 335 sang tài khoản chi tiết thì sửa pack, không sửa mã.
- **Không** có loại thứ tư: module không được tự lập loại C thay người dùng. Trợ lý AI chỉ được **đề xuất** loại C ở trạng thái chờ (`hold`, STD-MCP-6).

## 7. Đường đi cho một dev (ví dụ: dev cộng đồng làm module kho)

1. `git pull origin main`, đọc blueprint [51 §KHO07](51-BP-KHO.md) và tài liệu này.
2. Tạo `stock-count.workflow.yaml` theo §3 (chép khuôn, đổi tên trạng thái).
3. Tạo `stock-count.document.ts` theo §2: `content` (zod), `check` (hàm thuần, trả finding mã `KHO-COUNT-*`), `ledger.build` (chỉ `reasonCode`).
4. Thêm khoá chính sách duyệt vào manifest `settings[]`; khai mã finding vào manifest `findings[]`.
5. Không viết action lập / duyệt / huỷ, không gọi `saveVersion`, `nextNumber`, `dataLock` — nền làm.
6. Chạy `bizcity module check kho`: YAML hợp lệ, không literal số TK, golden `T030-KHO-6/7` xanh, `assertLedgerInvariants` xanh.

## 8. Việc và ai làm

| Mã | Việc | Tầng | Phụ thuộc |
|---|---|---|---|
| DOC-030-1 | `defineDocument` + bảng `module_documents`, `document_status_history`; `GET /documents/:docRef` | Platform | — |
| DOC-030-2 | Runtime tự nạp `documents[].workflow`; khoá YAML `policy`, `locks`, `revision`; `by: event` | Platform | DOC-030-1 |
| DOC-030-3 | Luồng điều chỉnh §4 + K-030-8 `promote` nguyên tử | Platform + Kernel | DOC-030-1 |
| DOC-030-4 | Chính sách duyệt §5 + nối authz PHASE-028 vào `runAction` | Platform | P-030-2 (tham số) |
| DOC-030-5 | Chuyển `payment-request`, `purchase-document`, phiếu kế toán `manual` sang khuôn chung (giữ hành vi, thêm hai con trỏ) | Platform | DOC-030-1..4 |
| DOC-030-6 | Hợp đồng `bizcity_document@1` 1.4.0-draft + R-WF-10..12 | tài liệu | nhóm Lõi duyệt |

Không việc nào ở đây là code trong PHASE-030; mỗi dòng mở phase / dòng CLAIMS riêng (R-FLOW).
