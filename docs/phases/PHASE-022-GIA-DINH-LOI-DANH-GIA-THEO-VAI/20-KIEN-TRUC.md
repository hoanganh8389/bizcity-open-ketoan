# PHASE-022 · 20 — Kiến trúc: phương án khắc phục có cấu trúc, bộ chạy giả định lỗi, Bàn đánh giá
<!-- [2026-11-02 07:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — kiến trúc: bizcity_remedy@1 cho mọi kiểm, SC-FIX-1, bộ chạy giả định lỗi (danh mục JSON + một tệp vitest + scenario-board.json), API core.review.board, ba vai là lăng kính, liên kết PHASE-020 / 021. -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> Nguyên tắc: không bộ chạy thứ hai, không luật mới trong Core, một nguồn luật cho cảnh báo lúc nhập và lượt định kỳ (R-VNC-10, ADR-0012 T1).

## 1. Ba mảnh, một danh mục

```text
                 ┌──────────────────────────── danh mục ca F22-* (10-DANH-MUC-GIA-DINH) ───────────────────────────┐
                 │  tình huống · mã phát hiện · mức · vai · hậu quả · remedy · kiểm lại · công thức gây lỗi          │
                 └───────────────┬───────────────────────────────┬───────────────────────────────┬─────────────────┘
                                 │                               │                               │
         (A) remedy có cấu trúc  │       (B) bộ chạy giả định lỗi │        (C) Bàn đánh giá (HT08) │
   DiagCheck.remedy · IN-* · ca  │   lane scenario (CI / --certify)│   bản cài: đọc lượt chẩn đoán +│
   rulepack — SC-FIX-1 chặn thiếu│   gây lỗi trên đơn vị test, mong│   kiểm chuẩn + bảng kiểm khoá kỳ│
                                 │   đợi đúng mã → scenario-board  │   → checklist theo vai          │
```

## 2. (A) Phương án khắc phục có cấu trúc — `bizcity_remedy@1`

### 2.1 Khuôn

```ts
// packages/contracts/src/remedy.ts (W1)
export interface Remedy {
  /** Các bước đánh số, mỗi bước một câu có động từ. Ít nhất 1. */
  steps: RemedyStep[];
  /** Ai làm được (vai tối thiểu); bước cần quyền cao hơn ghi ở step.role. */
  owner: 'creator' | 'accountant' | 'chief_accountant' | 'owner' | 'operator' | 'core_team';
  /** Kiểm lại: mã kiểm chạy lại (một mã) hoặc màn có số liệu đã đổi. */
  verify: { code?: string; screen?: ScreenRef };
  /** Lỗi Tier 0 (sổ sai): true ⇒ bước đầu luôn là "dừng ghi sổ, báo nhóm Lõi kèm mã tra cứu" (R-FIX-2). */
  stopTheLine?: boolean;
}
export interface RemedyStep { text: string; screen?: ScreenRef; role?: Remedy['owner'] }
export interface ScreenRef { code: string; path: string; label: string }   // vd { code: 'ACC49', path: '/nghiep-vu/tinh-gia-von', label: 'Tính giá vốn' }
```

- Câu `fix` hôm nay giữ nguyên (hậu quả + tóm tắt); `remedy` là phần **làm gì**.
- Màn tham chiếu bằng **mã màn + đường dẫn**; giao diện tự đổi thành nút. Đường dẫn phải có trong menu (check SC-FIX-1 đối chiếu `phan-he/*/menu.ts`).
- Không có trường nào chứa SQL / lệnh sửa dữ liệu: phương án đi qua màn hoặc API công khai (R-FIX-2).

### 2.2 Nơi khai

| Loại kiểm | Nơi khai `remedy` |
|---|---|
| Tự chẩn đoán (`DiagCheck`, L1 / L3 / L5) | thuộc tính `remedy` của chính check (`packages/kernel/src/modules/*/*.diagnostics.ts`, `packages/platform/src/system/diagnostics.ts`) |
| Tiền kiểm `IN-*` (PHASE-021) | mục danh mục `packages/contracts/src/intake-findings.ts` (cùng chỗ khai mức, lớp, trang bài học) |
| Ca rulepack (PHASE-020) | `scenario.remedy` trong tệp ca — dùng khi ca không có kiểm riêng (vd ca chỉ có bằng chứng build) |
| Bảng kiểm trước khoá kỳ | mỗi mục `CheckItem` thêm `remedy` (thay cho chỉ có `link`) |
| Phân hệ / app ngoài | manifest `bizcity.module.json` → `diagnostics[].remedy` (Q022-4, sau phase này) |

### 2.3 Check SC-FIX-1 (block)

- Mọi `DiagCheck` mức `warn` / `error`, mọi mã `IN-*` mức `block` / `warn`, mọi mục bảng kiểm khoá kỳ: có `remedy.steps.length ≥ 1`, có `verify`.
- `stopTheLine: true` bắt buộc với kiểm Tier 0 (`LEDGER_*`, `EVENT_POSTED_VERSION`, `EVIDENCE_CHAIN`, `LEDGER_TRIGGERS`…) — đối chiếu bảng tier ở lane diagnostics.
- `screen.path` có trong menu; `verify.code` là mã kiểm có thật.
- Tự kiểm: `fixtures/repo-bad` có một check thiếu `remedy`, một check `path` không có trong menu.

## 3. (B) Bộ chạy giả định lỗi — lane `scenario`

### 3.1 Danh mục máy đọc

`tests/conformance/scenarios/<nhóm>/<mã ca>.json`, khuôn `bizcity_fault_case@1`:

```json
{
  "contract": "bizcity_fault_case@1",
  "id": "F22-STK-01",
  "title": "Tồn kho âm theo mặt hàng × kho × ngày",
  "group": "STK",
  "personas": ["chief_accountant", "tax_inspector"],
  "level": "warn",
  "clock": "2026-11-02",
  "setup": [ { "profile": { "regime": "vn-tt99-2025", "entityType": "enterprise", "effectiveFrom": "2026-01-01" } } ],
  "inject": [
    { "post": "/api/v1/documents", "body": { "$fixture": "sale", "docKey": "BAN-0303", "docDate": "2026-03-03", "qty": 2 } }
  ],
  "expect": [
    { "diag": "INVENTORY_NEGATIVE", "level": "warn", "count": 1, "sampleMatches": "^CN01:.+:SUA01@2026-03-03$" }
  ],
  "fix": [
    { "post": "/api/v1/documents", "body": { "$fixture": "purchase", "docKey": "NHAP-0301", "docDate": "2026-03-01", "qty": 2 } }
  ],
  "afterFix": [ { "diag": "INVENTORY_NEGATIVE", "level": "pass" } ]
}
```

- **`inject`** chỉ đi cổng công khai (HTTP `/api/v1`, đơn vị test riêng, R-VNC-7). Ca phải "gây lỗi ở CSDL" (trigger, RLS, lệch số dư) thì `inject` là **lệnh bị chặn**, `expect` là mã lỗi: `{ "status": 422, "code": "UNBALANCED_ENTRY" }` — chứng minh rào chắn còn.
- **`fix` + `afterFix`**: chạy đúng phương án khắc phục (qua API) rồi kiểm lại — chứng minh **phương án đúng**, không chỉ phát hiện đúng (R-FIX-4).
- Ca ○ / ☐ có tệp với `"status": "planned"` + lý do; bộ chạy ghi ○, không tính lỗi.

### 3.2 Chạy

- `apps/api/test/fault-scenarios.test.ts`: đọc mọi tệp, mỗi ca một `it(...)`, dùng `setupTenant()` + đồng hồ cố định; sinh `tests/conformance/output/latest/scenario-board.json`.
- `node tests/conformance/selfcheck.mjs --scenarios` đọc `scenario-board.json`, in bảng điểm checklist theo nhóm và theo vai (khuôn `bizcity_scoreboard@1`, không gộp với điểm Tuân chuẩn).
- CI: chạy cùng `npm test`; ca có `expect` sai (không phát hiện được, hoặc phương án không làm hết lỗi) là **FAIL** chặn merge.

### 3.3 Kết quả một ca

| Trạng thái | Nghĩa |
|---|---|
| ✔ phát hiện + khắc phục | `expect` khớp, `afterFix` khớp |
| ⛔ chặn đúng | lệnh gây lỗi bị từ chối đúng mã |
| ✘ không phát hiện | `expect` không khớp — thiếu kiểm hoặc kiểm sai |
| ✘ phương án sai | phát hiện đúng nhưng `afterFix` vẫn còn lỗi |
| ○ chưa kiểm được | `status: planned`, có lý do + ticket |

## 4. (C) Bàn đánh giá trên bản cài — `core.review.board`

### 4.1 Dữ liệu

`GET /api/v1/system/review-board?persona=chief_accountant|auditor|tax_inspector` (action `core.review.board`, quyền `review:read` — Q022-1):

1. Lượt tự chẩn đoán L1 + L3 gần nhất (`diagnostic_runs`) và L5 (lượt kiểm chuẩn gần nhất).
2. Lượt kiểm chuẩn gần nhất (`conformance_runs`) — ca rulepack, trạng thái duyệt.
3. Bảng kiểm trước khoá kỳ của tháng đang mở gần nhất (`GET /api/v1/periods/check`).
4. Danh mục ca (gói trong mã: `packages/kernel/src/modules/review/catalog.ts`, sinh từ `tests/conformance/scenarios/*.json` lúc build — một nguồn).

Trả về: nhóm → ca → `{ status, detectedBy[], count, sample[], remedy, verify, lastCheckedAt }`. Không số tiền (R-DIAG-6).

### 4.2 Vai là lăng kính

```ts
// packages/kernel/src/modules/review/personas.ts
export const PERSONAS = {
  chief_accountant: { order: ['DOC', 'STK', 'CLOSE', 'TAX', 'DEBT', 'CASH', 'FA', 'LEDGER', 'ENV', 'SEC'], intro: 'Việc còn tồn trước khi khoá kỳ, nộp tờ khai' },
  auditor:          { order: ['LEDGER', 'ENV', 'SEC', 'CLOSE', 'DOC', 'DEBT', 'CASH', 'STK', 'TAX', 'FA'], intro: 'Sổ có toàn vẹn, bằng chứng liền mạch, phân quyền đúng' },
  tax_inspector:    { order: ['TAX', 'STK', 'CASH', 'FA', 'DEBT', 'DOC', 'CLOSE', 'LEDGER'], intro: 'Tự rà trước: hoá đơn, thuế suất, khấu trừ, giá vốn, quỹ — không phải kết luận của cơ quan thuế' },
} as const;
```

Ca hiện với vai nếu `personas` của ca chứa vai đó; vai đậm trong danh mục = đưa lên đầu nhóm.

### 4.3 "Kiểm lại" một mã

`POST /api/v1/system/review-board/recheck { code }` → `runDiagnostics(scope, { layer, codes: [code] })` (giao dịch READ ONLY), lưu một lượt chẩn đoán `trigger: 'manual'`; trả trạng thái mới của các ca dùng mã đó. Không chạy cả bộ, không ghi gì khác.

### 4.4 Biên bản

`GET /api/v1/system/review-board/report?persona=…&format=pdf`: danh sách ca theo vai, trạng thái, phương án, các lần xác nhận cảnh báo (người, lý do, lúc) từ `audit_logs` (`core.conformance.acknowledge`). Không số tiền, chỉ mã chứng từ. Có dòng "Không phải kết luận của cơ quan nhà nước" (D022-5, D022-6).

## 5. Liên kết PHASE-020 / PHASE-021 (hai phương án, một nguồn luật)

| Lỗi | Lúc nhập (PHASE-021, mức `warn`) | Định kỳ / theo yêu cầu (PHASE-020) |
|---|---|---|
| Một chứng từ: thuế suất giảm sai thời gian, hoá đơn thiếu trường, lập hoá đơn muộn, chưa khai hồ sơ cho ngày đó | `IN-VAT-*`, `IN-INV-*` ở lớp L4 (ticket S021-25) gọi **cùng hàm** với `VAT_REDUCED_RATE`, `INVOICE_FIELDS`, `INVOICE_ISSUE_DATE`, `PROFILE_DECLARED` | lượt đêm vẫn bắt (chứng từ cũ, sửa sau) |
| Theo thời gian / nhiều chứng từ: treo quá hạn, chờ hoá đơn, cuối kỳ, tồn âm do phiếu đến sau, công nợ ≠ sổ | — | chỉ ở đây |

Tách hàm kiểm theo **một chứng từ** ra khỏi câu SQL theo phạm vi (vd `reducedRateFinding(line, params)`, `taxIssues(row)` đã có) để cả hai đường gọi chung.

## 6. Không làm

- Không "nút sửa nhanh" ghi sổ thay người; mọi bước sửa qua màn / API có quyền và bằng chứng sẵn có.
- Không điểm tổng hợp kiểu "đơn vị đạt 87% thanh tra".
- Không thêm luật kế toán / thuế vào Kernel: ngưỡng luật là tham số rulepack; ngưỡng nội bộ là tham số ca (duyệt tại đơn vị).
