# PHASE-030 · 23 — Hàng việc: view `bizcity_read.document_queue`, ba API `core.queue.*`, nguồn mới cho thanh "Việc cần làm" (chữ chốt S030-31)
<!-- [2026-11-06 07:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-31: chữ chốt hàng việc theo R-FLOW-2 — view chỉ đọc gộp trạng thái của bốn bảng có sẵn, API tổng hợp / danh sách / việc của tôi, nguồn mới cho useViec; chưa mã -->

> Nối tiếp [21 §4](21-SO-CONG-VA-BANG-DIEU-HANH.md) (bàn điều hành HT11, khối ① *Hàng việc*) và [16](16-CHUAN-CHUNG-TU-DUNG-CHUNG.md) (5 nhóm trạng thái). **Việc này làm được ngay**: chỉ **đọc** các bảng đã có, không cần `defineDocument`, sổ cổng hay PHASE-028.
> Mọi chỗ "đã có" dẫn tệp:dòng trên `main` (`a9ae6ae`). Mã đi PR riêng sau khi dòng giữ chỗ S030-31 và tài liệu này vào `main`.

## 0. Trả lời ngắn

1. Hôm nay **không có nơi nào** trả lời "bao nhiêu chứng từ đang nháp / chờ duyệt / chờ ghi sổ / ở bể chờ": `reportService.dashboard` chỉ đếm `accounting_events` (`apps/api/src/phan-he/ke-toan/reports/report.service.ts:648-658`), thanh "Việc cần làm" lấy từ ba nguồn rời nhau (`/purchase/todo`, `/reports/dashboard`, `/alerts`, `apps/web/src/layout/rail/useViec.ts`). Không có API đếm cho `payment_requests`, `purchase_documents`.
2. Đề xuất **một view chỉ đọc** `bizcity_read.document_queue` gộp bốn bảng có sẵn về **một hình**: 5 nhóm trạng thái chuẩn ([16 §3](16-CHUAN-CHUNG-TU-DUNG-CHUNG.md)) + một cờ (`held` ở bể chờ, `blocked` bị chặn / lỗi, `returned` bị trả lại), và **ba API đọc** `core.queue.summary | items | mine`.
3. Thanh "Việc cần làm" thêm một nguồn (`/queue/mine`) và bỏ dòng `so:loi` đang trùng ý. Màn HT11 (S030-32) đọc cùng view, không thêm nguồn.
4. **View là chỗ tạm cho phân hệ cũ.** Bốn nguồn dưới đây là các bảng hiện có. Khi `defineDocument` có (P-030-1, `module_documents`), chứng từ mới tự nằm trong đó và view thêm **một** nhánh `UNION`; nhánh của `payment_requests` / `purchase_documents` được bỏ khi hai phân hệ chuyển sang `modules/` (ADR-0024).

## 1. Bốn nguồn → một hình

### 1.1 Chỉ lấy việc đang mở

Hàng việc là việc **cần ai đó làm gì**; chứng từ xong (`posted`, `paid`, `cancelled`) không có mặt. Số liệu "đã xong" thuộc khối ② (cổng) của HT11, đọc từ bằng chứng.

| Nguồn (`source`) | Bảng | Dòng lấy | Chỉ mục sẵn có |
|---|---|---|---|
| `payment_request` | `payment_requests` | `status IN (draft, submitted, approved1, approved, rejected)` | `payment_requests_status (tenant_id, status, due_date)` — `0005:679` |
| `purchase_document` | `purchase_documents` | `status IN (draft, pending_approval)` | `purchase_documents_status_idx (tenant_id, status, kind)` — `0010:40` |
| `accounting_event` | `accounting_events` | `status IN (pending, error)` | `accounting_events_status` một phần, `WHERE status <> 'posted'` — `0005:649` |
| `intake` | `intake_inbox` | `status = 'open'` (`trial` là chạy thử `preflight`, giữ 7 ngày, không phải việc cần làm) | `intake_inbox_status_idx (tenant_id, status, received_at DESC)` — `0059:45` |

`purchase_documents.status = 'approved'` **không** vào hàng việc: duyệt phiếu mua là điểm ghi nhận, đã ghi sổ ([19 §1](19-RA-SOAT-DUYET-VA-GHI-SO.md)). `payment_requests.status = 'approved'` **có** vào: đã duyệt nhưng **chưa chi**, nên chưa chạm sổ.

### 1.2 Ánh xạ trạng thái

| `source` | Trạng thái gốc | `status_group` | `flag` | Việc tiếp theo là gì |
|---|---|---|---|---|
| `payment_request` | `draft` | `draft` | — | lập xong, trình |
| | `rejected` | `draft` | `returned` | sửa lại, trình lại (R-WF-10) |
| | `submitted`, `approved1` | `pending` | — | duyệt (cấp 1 / cấp 2) |
| | `approved` | `approved` | — | **chi tiền** (điểm ghi nhận) |
| `purchase_document` | `draft` | `draft` | — | trình / duyệt |
| | `pending_approval` | `pending` | — | duyệt |
| `accounting_event` | `pending` | `pending` | `held` | định khoản (ACC14) |
| | `error` | `draft` | `blocked` | sửa rồi ghi lại |
| `intake` | `open` | `pending` | `held` | sửa ở trạm tiền kiểm rồi nộp lại |

### 1.3 Khuôn view

```sql
-- db/migrations/0076_hang_viec.sql (số lấy bằng scripts/so-tiep-theo.mjs; E2 giữ 0074, W2 giữ 0075)
CREATE OR REPLACE VIEW bizcity_read.document_queue WITH (security_invoker = true) AS
  SELECT tenant_id, 'payment_request'::text AS source, id::text AS source_id,
         'quy.payment_request:' || id AS doc_ref, 'payment_request'::text AS doc_type,
         request_no AS doc_no, request_date AS doc_date, branch_code, amount,
         status AS status_raw, <ánh xạ §1.2> AS status_group, <ánh xạ> AS flag,
         created_by, created_at, coalesce(submitted_at, updated_at) AS waiting_since
    FROM public.payment_requests WHERE status IN ('draft','submitted','approved1','approved','rejected')
  UNION ALL … purchase_documents (doc_ref 'mua-hang.document:<id>', doc_type = kind, amount = total) …
  UNION ALL … accounting_events (doc_ref = doc_key, branch_code qua JOIN branches, amount = total, created_by, waiting_since = received_at) …
  UNION ALL … intake_inbox (doc_ref = doc_key, doc_no = doc_key, amount NULL, branch_code NULL, created_by = actor, waiting_since = received_at) …;
-- COMMENT ON VIEW / COLUMN bằng tiếng Việt (R-DB); trigger INSTEAD OF reject_write như các view bizcity_read khác (0043).
```

| Cột | Nghĩa |
|---|---|
| `tenant_id` | đơn vị; RLS của bảng gốc áp qua `security_invoker` |
| `source`, `source_id` | nguồn và khoá trong bảng nguồn (để mở đúng màn) |
| `doc_ref` | khoá ổn định dạng [`bizcity_document@1`](../../contracts/BIZCITY-DOCUMENT-v1.md) §3 (`quy.payment_request:42`). Với phân hệ cũ là khoá **tổng hợp** để màn HT11 và liên kết dùng được sớm; khi chuyển sang `defineDocument` thì thành `docRef` thật mà không đổi giá trị |
| `doc_type`, `doc_no`, `doc_date`, `branch_code`, `amount` | để hiện và lọc; `NULL` khi nguồn không có |
| `status_raw` | trạng thái gốc của nguồn |
| `status_group`, `flag` | §1.2 |
| `created_by` | `user:<id>` / `apikey:<id>` (cả hai bảng phân hệ ghi `ctx.actor.id` / `auth.actor` dạng này) |
| `created_at`, `waiting_since` | thời điểm lập; **thời điểm bắt đầu chờ ở trạng thái hiện tại** (dùng cho tuổi) |

Không có cột nào mang nội dung chứng từ (dòng hàng, ghi chú, payload) — R-SEC-10, R-INTAKE-12.

## 2. API: `core.queue.*`

Ba action đọc, `defineAction` theo mẫu `apps/api/src/modules/system/findings.routes.ts`, tệp mới `apps/api/src/modules/system/queue.routes.ts`: `effect: 'read'`, `permission: 'documents:read'`, `expose: { http, mcp: true, ai: 'read' }`. Tuổi tính ở SQL theo giờ Việt Nam (`waiting_since AT TIME ZONE 'Asia/Ho_Chi_Minh'`).

### 2.1 `GET /api/v1/queue/summary`

Tham số: `branch?`, `source?`. Trả:

```json
{ "asOf": "2026-11-06T12:15:00.000Z", "total": 87,
  "byGroup": { "draft": 38, "pending": 21, "approved": 9 },
  "byFlag":  { "held": 7, "blocked": 12, "returned": 4 },
  "bySource": [ { "source": "payment_request", "draft": 6, "pending": 9, "approved": 3, "held": 0, "blocked": 0, "returned": 1,
                  "aging": { "d1": 6, "d3": 9, "d7": 3, "over7": 1 }, "oldestDays": 12 } ] }
```

Tuổi: `d1` ≤ 1 ngày, `d3` 1–3, `d7` 3–7, `over7` > 7 (ngày dương lịch, tính từ `waiting_since`). Tổng các bucket bằng số dòng của nguồn.

### 2.2 `GET /api/v1/queue/items`

Tham số: `group?`, `flag?`, `source?`, `branch?`, `age?` (`d1|d3|d7|over7`), `q?` (khớp `doc_no`, ≤ 64 ký tự), `limit?` (mặc định 50, tối đa 100), `cursor?`. Trả `{ items: QueueItem[], next: string | null }`, sắp theo `waiting_since` **tăng dần** (cũ nhất lên trước), khoá `(waiting_since, source, source_id)`. `QueueItem` = các cột §1.3 trừ `tenant_id`, thêm `ageDays` và `path`.

`path`: đường dẫn màn hình để bấm vào, **một bảng ánh xạ duy nhất ở mã** (`source` → đường dẫn). Giá trị đầu: `payment_request` → `/cong-no/yeu-cau-thanh-toan`, `accounting_event` và `intake` → `/chung-tu` (ACC14, trạm tiền kiểm nằm trong đó); `purchase_document` → màn danh sách mua hàng tương ứng, xác nhận khi code.

### 2.3 `GET /api/v1/queue/mine`

Việc của **người đang đăng nhập**, chia bốn phần, kèm mảng `viec` đã đúng hình `Viec` của thanh mép phải (`key, level, text, count, amount?, path, groups`):

| Phần | Điều kiện | Mức | Câu chữ mẫu |
|---|---|---|---|
| `returned` | `flag = returned` và `created_by` = tôi | `warn` | "Đề nghị thanh toán bị trả lại, cần sửa" |
| `drafts` | `status_group = draft`, `flag IS NULL`, `created_by` = tôi | `info`; `warn` nếu > 3 ngày | "Nháp chưa trình" |
| `waiting` | `status_group = pending`, `flag IS NULL`, `created_by` = tôi | `info` | "Đang chờ người duyệt" |
| `toApprove` | `status_group IN (pending, approved)` và `created_by` ≠ tôi và **tôi có quyền làm bước tiếp theo** (bảng dưới) | `warn`; `error` nếu > 7 ngày | "Chờ bạn duyệt" |
| `blocked`, `held` | `flag IN (blocked, held)` cho người có `documents:write` | `error` / `warn` | "Chứng từ lỗi cần ghi sổ lại" / "Ở bể chờ cần sửa" |

**Quyền làm bước tiếp theo** (đúng như thi hành hôm nay; chuyển sang `authorize` của PHASE-028 khi cầu nối có, [R-WF-15](../../rules/RULE-WORKFLOW.md) — chỉ đổi hàm kiểm, không đổi hình trả về):

| Nguồn / trạng thái | Quyền |
|---|---|
| `payment_request` / `submitted` | `payments:approve` |
| `payment_request` / `approved1` | `payments:approve-final` |
| `payment_request` / `approved` (chi tiền) | `documents:write` |
| `purchase_document` / `pending_approval` | `documents:write` |
| `accounting_event` / `pending`, `error`; `intake` | `documents:write` |

**Tách nhiệm:** hàng việc **không đưa việc của chính người lập vào `toApprove`** — đây là lựa chọn hiển thị theo ý định tách nhiệm ([22 §3 #5](22-DANH-GIA-GON-PHAN-QUYEN.md)), **không** phải hệ thống đã chặn: hôm nay hai luồng (`payment-request.workflow.yaml`, `purchase-document.workflow.yaml`) chưa bật `sod`, nên người lập có quyền vẫn tự duyệt được nếu mở thẳng chứng từ. Bật `sod` là việc của S029-25 / S030-27, không thuộc S030-31.

**Chưa làm ở bản này:** lọc theo phạm vi chi nhánh / kho của người dùng (cần `scopeOf` của PHASE-028 được nối). Hôm nay người xem thấy hàng việc của **cả đơn vị** theo quyền; ghi rõ ở mô tả action.

## 3. Giao diện

- `apps/web/src/layout/rail/useViec.ts`: thêm một `useQuery` cho `/api/v1/queue/mine`, gộp `viec` vào `items` với khoá `hv:*`. Nhóm của từng việc: `payment_request` → `cong-no`; `purchase_document` → `mua-hang`; `accounting_event`, `intake` → `tong-hop`. Nguồn lỗi hoặc không có quyền thì bỏ qua (đúng khuôn của hook).
- **Bỏ** dòng `so:loi` (*"Chứng từ lỗi cần ghi sổ lại"*, đếm `documents.error` của dashboard) vì `blocked` của hàng việc đã cùng số liệu; để hai dòng là đếm đôi.
- Màn HT11 ([21 §4](21-SO-CONG-VA-BANG-DIEU-HANH.md)) là S030-32: dùng `queue/summary` và `queue/items`, không thêm nguồn dữ liệu.

## 4. Kiểm

Một tệp `apps/api/test/hang-viec.test.ts` (CSDL test thật), mã golden `T030-QUEUE-*`:

| Mã | Cho – khi – thì |
|---|---|
| T030-QUEUE-1 | tạo mỗi nguồn ở từng trạng thái gốc → view trả đúng `status_group` và `flag` theo §1.2; `purchase_documents.approved`, `payment_requests.paid`, `accounting_events.posted` **không** có mặt |
| T030-QUEUE-2 | `queue/summary`: các bucket tuổi cộng lại bằng tổng của nguồn; đổi `waiting_since` lùi 2 / 5 / 9 ngày rơi đúng `d3` / `d7` / `over7` |
| T030-QUEUE-3 | `queue/mine`: người lập thấy nháp, bị trả lại, chờ duyệt của mình; **không** thấy việc của mình ở `toApprove`; người có `payments:approve` thấy `submitted`, người chỉ có `payments:approve-final` thấy `approved1` và không thấy `submitted` |
| T030-QUEUE-4 | cô lập đơn vị: dữ liệu của đơn vị khác không xuất hiện trong view lẫn API (RLS qua `security_invoker`) |
| T030-QUEUE-5 | view chỉ đọc: `INSERT` / `UPDATE` / `DELETE` vào `bizcity_read.document_queue` bị từ chối |
| T030-QUEUE-6 | `queue/items` phân trang theo con trỏ ổn định (không lặp, không sót khi có dòng cùng `waiting_since`); `limit` > 100 bị từ chối |
| T030-QUEUE-7 | số dòng và thời gian ở 5.000 dòng mỗi nguồn nằm trong ngân sách (đo bằng `EXPLAIN`, mọi nhánh dùng chỉ mục §1.1, không quét tuần tự bảng lớn) |

Chạy `node tests/conformance/selfcheck.mjs --strict` và `npm run typecheck`. `SC-DATA-3` (COMMENT mọi cột) và `SC-DATA-7` (khớp kiểu `db/types.ts`) phải đạt; view đọc bằng `sql` thô nên **không** chạm `packages/platform/src/db/types.ts` (đang có dòng giữ chỗ PHASE-026 đợt 3).

## 5. Phạm vi và rủi ro

| Mục | Ghi chú |
|---|---|
| Migration | một tệp `0076_hang_viec.sql`: chỉ `CREATE VIEW`, `COMMENT`, trigger chặn ghi. Không đổi bảng gốc, không dữ liệu |
| Lớp | view đọc bảng phân hệ cũ (`payment_requests`, `purchase_documents`) từ schema `bizcity_read`. Chấp nhận **tạm** vì phân hệ cũ đóng băng ([ADR-0024](../../adr/ADR-0024-phan-he-nam-o-modules-phan-he-dong-bang.md)); nhánh bỏ khi chuyển. Không phân hệ nào bị sửa |
| Hiệu năng | bốn nhánh đều dẫn bằng `(tenant_id, status…)`; kiểm bằng T030-QUEUE-7 trước khi merge |
| Quyền | `documents:read` mở cho vai trò xem; số liệu và số chứng từ vốn đã xem được ở các màn nguồn. Không có nội dung chứng từ |
| Sau PHASE-028 | `toApprove` đổi từ kiểm quyền phẳng sang `batchAuthorize` theo tài nguyên; thêm lọc theo phạm vi (`scopeOf`) |
| Sau P-030-1 | thêm nhánh `module_documents` vào view; bỏ hai nhánh phân hệ cũ khi chuyển |

## 6. Việc

| Mã | Việc | Chủ |
|---|---|---|
| S030-31 | **cả đợt:** migration 0076, `queue.routes.ts` (3 action), đăng ký trong `system.routes.ts` (một dòng `mountActions`, như `notifyActions`), `useViec.ts`, `hang-viec.test.ts` | Platform + web (một PR code sau khi tài liệu này và dòng giữ chỗ vào `main`). `CHANGELOG.md` đang thuộc dòng S030-19: thêm mục của S030-31 bằng một lần mở rộng phạm vi **sau khi** S030-19 trả chỗ |
| S030-32 | HT11 dùng `summary` / `items` | web, sau S030-31 |
