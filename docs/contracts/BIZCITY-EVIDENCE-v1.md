# `bizcity_evidence@1` — Evidence Contract
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-10-30 11:27 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — bằng chứng chỉ thêm, chuỗi băm theo đơn vị, biên nhận (PHASES 2.6). -->

<!-- [2026-11-06 07:15 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — ADR-0030: bản niêm phong theo ngày; STD-EVD-4 có ngoại lệ hẹp; STD-EVD-9..10; §8 -->
<!-- [2026-11-06 10:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-30b–c có mã: bỏ chữ "đề xuất" ở SC-EVD-1 / SC-EVD-9 / EVIDENCE_SEAL_*; §8 ghi rõ ranh giới ngày theo số thứ tự, ghi một lần bằng link, chữ ký chưa bật ở v1 -->

> **Phiên bản:** 1.2.0-draft · 2026-11-06 · **Trạng thái:** Đề xuất · **Thuộc:** [Standard v1](../standard/README.md) (hợp đồng 6/7)
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
| `DATA_DIR/bang-chung/<đơn vị>/<yyyy>/<mm>/<dd>.jsonl` + `.manifest.json` (1.2.0) | **bản niêm phong theo ngày**, sinh từ `audit_logs`, không phải nơi ghi | **Thêm** (§8, [ADR-0030](../adr/ADR-0030-ban-niem-phong-bang-chung.md)) |

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

**Ghi chú nhật ký nghiệp vụ `changes.notes.audit[]`** (1.1.0, theo [ACTION §4.4](BIZCITY-ACTION-v1.md)): khi một service mà action gọi dùng `writeAudit`, runtime không chèn dòng `audit_logs` thứ hai mà thêm vào bằng chứng của chính action: `{ "action": "branch.update", "objectType": "branch", "objectId": "CN01", "before": {…}, "after": {…} }`. Ngoại lệ là các tên có chỗ đọc khai ở `AUDIT_KEEP` (ba tên ban đầu ở ACTION §4.4) — những tên đó vẫn ghi dòng riêng. Ghi chú nằm trong nội dung bằng chứng nên được băm cùng; lớn hơn 64 KB thì bị lược thành `{ "omitted": true, "bytes": … }`.


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
| STD-EVD-4 | 1 | Không ghi nhật ký nghiệp vụ ra tệp, **trừ bản niêm phong do tác vụ `evidence.seal` của Platform xuất từ bảng bằng chứng (§8)**. Tệp khác chỉ cho log kỹ thuật (pino). Module không bao giờ ghi tệp bằng chứng | CONF-STATIC-13 / `SC-EVD-1` (grep `appendFile` …; miễn đúng một tệp Platform do ADR-0030 chốt: `packages/platform/src/core/evidence-export.ts`) |
| STD-EVD-5 | 1 | `changes` chỉ chứa trường thay đổi; trường `pii` ghi băm (`sha256:…`) thay giá trị; không bao giờ ghi mật khẩu, khoá, token | CONF-RUN-13 |
| STD-EVD-6 | 1 | Actor AI ghi đủ `kind: 'ai'`, `via`, `onBehalfOf` (người dùng chủ của khoá / kênh) | CONF-RUN-14 |
| STD-EVD-7 | 1 | Action đọc dữ liệu nhạy cảm (xuất danh sách khách, xuất sổ) khai `evidence: 'sensitive'` → cũng ghi bằng chứng | review |
| STD-EVD-8 | 2 | Bằng chứng giữ tối thiểu 10 năm (theo thời hạn lưu chứng từ kế toán); phân vùng theo năm khi lớn | vận hành |
| STD-EVD-9 | 1 | Bản niêm phong chỉ sinh **từ** bảng bằng chứng sau khi ngày đã đóng, ghi **một lần** (tệp tạm mở cờ loại trừ `wx` + `fsync`, rồi `link` sang tên thật — `link` không bao giờ đè tệp có sẵn), không bao giờ ghi đè; tệp tự kiểm được không cần CSDL; manifest nối ngày bằng `prevManifestSha256`; thất bại niêm phong không chặn nghiệp vụ và không bao giờ được đọc ngược để quyết quyền hay ghi sổ | `SC-EVD-9`, `EVIDENCE_SEAL_*` |
| STD-EVD-10 | 2 | `GET /api/v1/evidence/verify` và `bizcity evidence verify` so ba chiều (chuỗi trong CSDL · từng tệp · manifest ↔ CSDL ↔ tệp), chỉ đọc, không trả nội dung dòng | `EVIDENCE_SEAL_*` (DG-EVD-2..5), `apps/api/test/evidence-seal.test.ts`, `packages/cli/test/evidence-seal.test.mjs` |

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

## 7. Nhật ký thay đổi
<!-- [2026-11-03 11:58 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — mở nhật ký thay đổi; 1.1.0-draft thêm changes.notes.audit[] -->

| Phiên bản | Ngày | Thay đổi |
|---|---|---|
| 1.0.0-draft | 2026-10-29 | Khởi tạo (Standard v1, hợp đồng 6/7) |
| 1.1.0-draft | 2026-11-03 | Thêm `changes.notes.audit[]` — nhật ký nghiệp vụ do service ghi trong lúc chạy action, thay cho dòng `audit_logs` thứ hai (ACTION §4.4, phương án C) |
| 1.2.0-draft | 2026-11-06 | **Bản niêm phong theo ngày** ([ADR-0030](../adr/ADR-0030-ban-niem-phong-bang-chung.md), chủ dự án chọn Q030-5 = B): STD-EVD-4 có ngoại lệ hẹp (một tác vụ Platform xuất từ bảng), thêm STD-EVD-9..10, §8 (khuôn dòng, manifest, thuật toán băm `hashVersion` 1, mã chẩn đoán). Chỉ thêm, tương thích |

## 8. Bản niêm phong theo ngày (1.2.0, [ADR-0030](../adr/ADR-0030-ban-niem-phong-bang-chung.md))

Bảng `audit_logs` vẫn là **nơi ghi duy nhất**. Bản niêm phong là bản lưu trữ **sinh ra từ** bảng, để kiểm độc lập với CSDL. Chưa là năng lực dành cho module: do Platform làm.

**Vị trí.** `DATA_DIR/bang-chung/<đơn vị>/<yyyy>/<mm>/<dd>.jsonl` và `<dd>.manifest.json` (ngày theo UTC+7, ngoài thư mục web, quyền `0640`). Tác vụ `evidence.seal` chạy sau 00:30, chốt ngày `D−1`, an toàn khi chạy lại.

**Ranh giới ngày theo số thứ tự.** `created_at` là giờ *bắt đầu* giao dịch nên số thứ tự (`chain_seq`) có thể xen giữa hai ngày. Gọi `cut(D)` = `chain_seq` lớn nhất có `created_at` trước hết ngày `D` (UTC+7); ngày `D` gồm các dòng `chain_seq ∈ (cut(D−1), cut(D)]`. Các ngày vì vậy nối liền, không sót dòng; dòng trước migration 0036 (không có chuỗi) không được niêm phong. Ngày đầu tiên là ngày của `created_at` nhỏ nhất trong các dòng có chuỗi. Bản cài cũ bật niêm phong lần đầu chốt tối đa 400 ngày mỗi lượt.

**Dòng tệp** (`hashVersion: 1`): mỗi dòng một bản ghi, JSON không khoảng trắng thừa, UTF-8, kết thúc `
`:

```json
{"hashVersion":1,"id":"48213","tenantId":"1","chainSeq":9120,"prevHash":"sha256:51be…","createdAtHash":"2026-11-05T08:14:22.531000Z","actor":"apikey:17","actorKind":"ai","actorVia":"cell:zalo-hub","onBehalfOf":"user:5","action":"hop-dong.installment.record-payment","moduleId":"acme.hop-dong","moduleVersion":"0.1.0","objectType":"hop-dong.installment","objectId":"118","subject":"hop-dong.installment:118","requestId":"req-8f2c…","correlationId":"0192f3a4-…","idempotencyKey":"zalo-msg-77612","inputHash":"sha256:9a1c…","resultOk":true,"resultCode":null,"dryRun":false,"beforeDataText":"{\"status\": \"pending\"}","afterDataText":"{\"status\": \"paid\"}","hash":"sha256:c07d…"}
```

`beforeDataText` / `afterDataText` là chuỗi `jsonb::text` **nguyên văn** của PostgreSQL (khoá sắp theo độ dài rồi byte, có khoảng trắng sau `:` và `,`), để bộ kiểm không phải tái tạo định dạng đó. Cột ngoài băm (vd `trace_id`) được ghi để đọc nhưng **toàn vẹn của chúng không được niêm phong**.

**Thuật toán băm `hashVersion: 1`** (đúng hàm `audit_log_hash`, migration 0036): `"sha256:" + hex(sha256(utf8(` các trường sau **nối bằng ký tự `U+001F`**, trường rỗng / `NULL` thành chuỗi rỗng `))`, theo đúng thứ tự: `id`, `tenant_id`, `chain_seq`, `prev_hash`, `createdAtHash`, `actor`, `actor_kind`, `actor_via`, `on_behalf_of`, `action`, `module_id`, `module_version`, `object_type`, `object_id`, `subject`, `request_id`, `correlation_id`, `idempotency_key`, `input_hash`, `result_ok` (`true`/`false`), `result_code`, `dry_run` (`true`/`false`), `before_data` (`jsonb::text`), `after_data` (`jsonb::text`). Chuỗi: `prev_hash` của dòng sau = `hash` của dòng trước (dòng đầu của đơn vị có `prev_hash` rỗng). **Đã kiểm 2026-11-06:** tính lại bằng Node theo đúng mô tả trên cho 3.000 dòng ngẫu nhiên của CSDL test, khớp 3.000 / 3.000 với `hash` đã lưu.

**Manifest `bizcity_evidence_seal@1`:**

```json
{"contract":"bizcity_evidence_seal@1","tenant":"1","date":"2026-11-05","hashVersion":1,"firstSeq":9120,"lastSeq":9391,"rows":272,"prevHashOfFirst":"sha256:51be…","lastHash":"sha256:ab12…","fileSha256":"sha256:77e0…","prevManifestSha256":"sha256:0c4d…","sealedAt":"2026-11-06T17:31:05.120Z","sealer":"platform","alg":"sha256","signature":null}
```

Ngày không có dòng nào: `rows: 0`, `firstSeq` / `lastSeq` null, `lastHash` = `lastHash` của ngày trước, để chuỗi liên tục. `signature` tuỳ chọn `{ alg: "hmac-sha256" | "ed25519", keyId, value }`, khoá lấy từ biến môi trường — **bản mã đầu (S030-30b) luôn ghi `null`**; bật chữ ký là việc sau (khai biến môi trường).

**Mã chẩn đoán** (L3, chỉ đọc): `EVIDENCE_SEAL_MISSING` (ngày đã đóng quá 2 ngày chưa niêm phong) · `EVIDENCE_SEAL_FILE` (tệp thiếu / hỏng / sai băm) · `EVIDENCE_SEAL_DB` (CSDL lệch tệp) · `EVIDENCE_SEAL_CHAIN` (manifest nối sai).
