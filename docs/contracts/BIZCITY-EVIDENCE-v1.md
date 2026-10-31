# `bizcity_evidence@1` — Evidence Contract
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-10-30 11:27 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — bằng chứng chỉ thêm, chuỗi băm theo đơn vị, biên nhận (PHASES 2.6). -->

> **Phiên bản:** 1.0.0-draft · 2026-10-29 · **Trạng thái:** Đề xuất · **Thuộc:** [Standard v1](../standard/README.md) (hợp đồng 6/7)
> **Luật nền:** R-TEN ("mọi thao tác ghi có nhật ký"), R-LEDGER (sổ chỉ thêm) · **Năng lực:** `evidence.receipt`

## 1. Mục đích

Trả lời được, cho **mọi** thao tác ghi: **ai** (người, khoá API, AI qua kênh nào), **làm gì** (action nào, trên chứng từ nào), **khi nào**, **kết quả** (thành công / mã lỗi, thay đổi gì), và đưa cho người gọi một **biên nhận** kiểm lại được. Khi AI thao tác thay người, đây là thứ cho phép chủ doanh nghiệp tin và kiểm.

## 2. Hiện trạng: 6 nơi, 2 nơi là tệp (A-18)

| Nơi | Ghi gì | Giữ ở Standard v1 |
|---|---|---|
| `audit_logs` (`core/audit.ts`, gọi tay) | actor, action, object, before/after | **Nâng cấp** thành bảng bằng chứng chung (§4) |
| `posting_log` | mỗi lần định khoản / ghi lại | Giữ: bằng chứng chuyên sâu của Kernel, nối bằng `docKey` |
| `accounting_event_versions` | ảnh chụp từng phiên bản sự việc | Giữ: thuộc Document của Kernel |
| `period_lock_events` | khoá / mở kỳ | Giữ, đồng thời ghi một bản ghi bằng chứng chung |
| `phan-he/mua-hang/log.ts` → `<DATA_DIR>/mua-hang/<tenant>/<yyyy-mm>.jsonl` | sự kiện mua hàng | **Bỏ**: chuyển vào bảng bằng chứng (STD-EVD-4) |
| `addins/tro-ly/store.ts` → JSONL | kho tri thức (không phải bằng chứng) | Không thuộc Evidence; chuyển về Cell / bảng của add-in |

## 3. Bản ghi bằng chứng

```json
{
  "id": "48213",
  "tenantId": "1",
  "at": "2026-11-05T08:14:22.531Z",
  "actor": { "kind": "ai", "id": "apikey:17", "name": "Trợ lý Zalo", "via": "cell:zalo-hub", "onBehalfOf": "user:5" },
  "action": "hop-dong.installment.record-payment",
  "module": { "id": "acme.hop-dong", "version": "0.1.0" },
  "subject": "hop-dong.installment:118",
  "requestId": "req-8f2c…",
  "correlationId": "0192f3a4-…",
  "idempotencyKey": "zalo-msg-77612",
  "inputHash": "sha256:9a1c…",
  "result": { "ok": true, "code": null },
  "changes": { "before": { "status": "pending" }, "after": { "status": "paid" } },
  "ledger": { "docKey": "hop-dong.installment:118:payment", "version": 1, "status": "posted" },
  "dryRun": false,
  "prevHash": "sha256:51be…",
  "hash": "sha256:c07d…"
}
```

**Biên nhận** trả trong `meta.receipt` của phản hồi action:

```json
{ "receipt": { "evidenceId": "48213", "hash": "sha256:c07d…", "at": "2026-11-05T08:14:22.531Z" } }
```

Ai giữ biên nhận (người dùng, Cell, plugin WP) có thể hỏi lại `GET /api/v1/evidence/48213` và kiểm `hash` khớp. Chuỗi băm (`prevHash` → `hash`) theo từng đơn vị cho phép phát hiện sửa / xoá bản ghi ở giữa (`bizcity evidence verify`).

> **Đã có (PHASES 2.6, 2026-10-30):**
> - **Bảng:** migration `0036_bang_chung.sql` thêm các cột §5, trigger `audit_logs_chain` (tính `chain_seq`, `prev_hash`, `hash` cho **mọi** dòng, kể cả `writeAudit()` cũ) và trigger chỉ thêm. Hàm `audit_log_hash(dòng)` dùng chung cho trigger và kiểm.
> - **Thứ tự chuỗi:** theo `chain_seq` (cấp dưới khoá theo đơn vị), không theo `id`.
> - **Runtime action** (`core/actions.ts`) ghi bằng chứng (STD-EVD-1, kể cả lỗi nghiệp vụ) và trả `meta.receipt`.
> - **Kiểm lại:** `GET /api/v1/evidence/:id` trả `verify.hashValid`, `verify.linked`. Kiểm cả chuỗi: tự chẩn đoán `EVIDENCE_CHAIN` (DG-EVD-1).
> - **Chưa có:** `correlation_id` từ Cell, actor `ai` + `via` / `onBehalfOf` (Phase 5, Cell); che `pii` trong `changes` (STD-EVD-5); `bizcity evidence verify` (CLI, Phase 4).

## 4. Luật

| Mã | Cấp | Luật | Kiểm bằng |
|---|---|---|---|
| STD-EVD-1 | 0 | Mọi action `effect: 'write'` sinh **đúng một** bản ghi bằng chứng, kể cả khi thất bại vì lỗi nghiệp vụ (`result.ok = false`, `code`), trừ `VALIDATION_ERROR` trước khi vào handler | CONF-RUN-11 |
| STD-EVD-2 | 0 | Bảng bằng chứng chỉ thêm: trigger chặn `UPDATE`, `DELETE`, `TRUNCATE` như sổ cái. Không có ngoại lệ purge trong v1 | CONF-RUN-12, trigger |
| STD-EVD-3 | 0 | Bằng chứng do runtime ghi; module **không** ghi trực tiếp và không tắt được. Module chỉ bổ sung qua `ctx.evidence.note(key, value)` (ghi vào `changes.notes`) | CONF-STATIC-12 |
| STD-EVD-4 | 1 | Không ghi nhật ký nghiệp vụ ra tệp. Tệp chỉ cho log kỹ thuật (pino) | CONF-STATIC-13 (grep `appendFile` trong module) |
| STD-EVD-5 | 1 | `changes` chỉ chứa trường thay đổi; trường `pii` ghi băm (`sha256:…`) thay giá trị; không bao giờ ghi mật khẩu, khoá, token | CONF-RUN-13 |
| STD-EVD-6 | 1 | Actor AI ghi đủ `kind: 'ai'`, `via`, `onBehalfOf` (người dùng chủ của khoá / kênh) | CONF-RUN-14 |
| STD-EVD-7 | 1 | Action đọc dữ liệu nhạy cảm (xuất danh sách khách, xuất sổ) khai `evidence: 'sensitive'` → cũng ghi bằng chứng | review |
| STD-EVD-8 | 2 | Bằng chứng giữ tối thiểu 10 năm (theo thời hạn lưu chứng từ kế toán); phân vùng theo năm khi lớn | vận hành |

## 5. Bảng

Phase 2 **mở rộng** `audit_logs` thay vì tạo bảng mới (giữ dữ liệu cũ, không đổi tên — ADR-0002), migration thêm cột:

| Cột mới | Kiểu |
|---|---|
| `actor_kind` | `text CHECK (actor_kind IN ('user','apikey','ai','system'))` |
| `actor_via`, `on_behalf_of` | `text NULL` |
| `module_id`, `module_version` | `text NULL` (`core` cho Core) |
| `subject` | `text NULL` (`docRef` / `docKey`) |
| `request_id`, `correlation_id`, `idempotency_key` | `text NULL` |
| `input_hash` | `text NULL` |
| `result_ok` | `boolean NOT NULL DEFAULT true` |
| `result_code` | `text NULL` |
| `dry_run` | `boolean NOT NULL DEFAULT false` |
| `prev_hash`, `hash` | `text NULL` (bản ghi cũ để NULL; chuỗi bắt đầu từ bản ghi đầu tiên sau migration) |

Thêm trigger chỉ thêm (`audit_logs_no_update`, `audit_logs_no_truncate`). Hash tính trong cùng giao dịch, khoá theo đơn vị (`pg_advisory_xact_lock(tenant_id)`) để chuỗi không rẽ nhánh.

## 6. Ánh xạ với sổ cái

Bằng chứng **không thay** sổ cái và không thay `posting_log`. Ba lớp bổ sung nhau:

```
evidence (ai bấm "ghi nhận thanh toán", lúc nào, qua Zalo hay giao diện)
   └─ ledger.docKey ──► accounting_events / versions (nội dung sự việc từng phiên bản)
                           └─► posting_log (mỗi lần định khoản: luật nào, kết quả)
                                  └─► ledger_entries / lines (bút toán, chỉ thêm)
```

Từ một dòng sổ cái lần ngược được tới người / AI đã gây ra nó, và ngược lại.
