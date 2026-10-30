# Bộ kiểm cài đặt module (Conformance)
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-10-29 10:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — chuẩn MCP, gói định khoản theo ngành, kết nối Cell. -->

> Thực thi nguyên tắc **P3: AI viết code, Core quyết định hợp lệ.** Không module nào được cài nếu chưa có báo cáo kiểm **ĐẠT** khớp với băm mã nguồn của nó.
> Lệnh hiện có: `node tests/conformance/selfcheck.mjs --module modules/<key>` (Phase 4: `bizcity module check`, gọi cùng các check) · Mã nguồn bộ kiểm: [tests/conformance/](../../tests/conformance/README.md) ([ADR-0006](../adr/ADR-0006-bo-kiem-chuan-mot-cho.md)).

## 1. Bốn cổng bắt buộc

| Cổng | Câu hỏi | Nhóm kiểm |
|---|---|---|
| **1. Manifest** | Module khai đủ, đúng khuôn, không xin cái Core không có? | CONF-MAN |
| **2. Tĩnh** (đọc code, chưa chạy) | Có import / ghi / gọi thứ không được phép không? | CONF-STATIC |
| **3. Migration** | Bảng có đúng chuẩn dữ liệu, cô lập đơn vị, chú thích? | CONF-MIG |
| **4. Chạy thật** (PostgreSQL thật, Core thật) | Quyền, cô lập, idempotency, bằng chứng, sổ cái còn đúng? | CONF-RUN, CONF-UPG |

## 2. Danh sách kiểm

### CONF-MAN — manifest

| Mã | Kiểm | Luật |
|---|---|---|
| CONF-MAN-1 | Hợp lệ theo `BIZCITY-MODULE-v1.schema.json`; `key` = tên thư mục; `id` chưa có | STD-MOD-1 |
| CONF-MAN-2 | `standard` khớp Standard của Core; mọi `requires.capabilities` có trạng thái `available` | VERSIONING §3 |
| CONF-MAN-3 | Mọi action ghi có `permission`; quyền mới có tiền tố `<key>:` | STD-MOD-4, STD-ACT-2 |
| CONF-MAN-4 | Mọi trạng thái trong workflow thuộc 5 nhóm chuẩn; transition có quyền | STD-DOC-4 |
| CONF-MAN-5 | `actions[]` trong manifest = tập action `defineAction` trong code; `id` đúng dạng | STD-ACT-6 |
| CONF-MAN-6 | Action có `ctx.ledger.submit` khai lỗi `PERIOD_LOCKED`, `POSTING_FAILED`; `docType` có trong `ledger.submits` | STD-ACT-8 |
| CONF-MAN-7 | Slot, hook khai đều có trong danh sách của Extension | STD-EXT-1 |
| CONF-MAN-8 | Có `masterdata.referenceCheck` nếu bảng có cột tham chiếu mã danh mục | STD-EXT-4 |

### CONF-STATIC — đọc mã nguồn

| Mã | Kiểm | Luật |
|---|---|---|
| CONF-STATIC-1 | Chỉ import `@bizcity/module-sdk`, `@bizcity/ui-kit`, thư viện ngoài trong danh sách cho phép; không đường dẫn ra ngoài thư mục module | STD-MOD-3, LAYOUT-2 |
| CONF-STATIC-2 | Bảng bị ghi ⊆ `data.tables`; sự kiện phát ⊆ `events.emits`; `docType` nộp ⊆ `ledger.submits` | STD-MOD-2, STD-DATA-3 |
| CONF-STATIC-3 | Không tạo kết nối CSDL, không `SET`/`set_config`, không SQL thô ngoài `ctx.data.tx` | STD-DATA-2 |
| CONF-STATIC-4 | Không import / gọi Cell ngoài `ctx.ai.*` | P1 |
| CONF-STATIC-5 | Năng lực dùng trong code (`ctx.documents.attach` → `documents.attachments`…) ⊆ `requires.capabilities` | STD-MOD-5 |
| CONF-STATIC-6 | Cột `pii` khai trong zod khớp danh sách che trong bằng chứng | STD-DATA-10 |
| CONF-STATIC-7 | Không bảng đính kèm, chữ ký, phiên bản tự chế (tên bảng chứa `attachment`, `signature`, `version`) | STD-DOC-7 |
| CONF-STATIC-8 | Không `app.get/post/…` Fastify tay | STD-ACT-1 |
| CONF-STATIC-9 | Không `reply.status`, không `throw new Error` trong handler (chỉ `Errors.*`) | STD-ACT-5 |
| CONF-STATIC-10 | Không `fetch`/HTTP trong action handler | STD-EVT-1 |
| CONF-STATIC-11 | Không `setInterval`, `setTimeout` dài, thư viện cron | STD-EVT-6 |
| CONF-STATIC-12 | Không ghi `audit_logs` / bảng bằng chứng | STD-EVD-3 |
| CONF-STATIC-13 | Không `appendFile`/`writeFile` cho nhật ký nghiệp vụ | STD-EVD-4 |

### CONF-MIG — migration (chạy trên CSDL tạm rồi đọc `pg_catalog`)

| Mã | Kiểm | Luật |
|---|---|---|
| CONF-MIG-1 | Chỉ DDL trên `mod_<key>`; số tệp liên tục, không trùng; tệp đã phát hành không đổi (so băm với bản trước) | STD-DATA-7 |
| CONF-MIG-2 | Mọi bảng có `tenant_id NOT NULL` + FK `tenants`, RLS bật, có chính sách theo `bizcity.tenant_id` | STD-DATA-1 |
| CONF-MIG-3 | Đủ cột chuẩn; chỉ mục bắt đầu bằng `tenant_id` | STD-DATA-4 |
| CONF-MIG-4 | Tiền `numeric(18,2)`; không `float`/`real`/`money` | STD-DATA-5 |
| CONF-MIG-5 | Không FK tới bảng ngoài schema mình trừ `public.tenants` | STD-DATA-6 |
| CONF-MIG-6 | Mọi bảng, cột có `COMMENT`, có chữ tiếng Việt có dấu | STD-DATA-8 |

### CONF-RUN — chạy trên Core thật (Kernel + module, PostgreSQL thật, hai đơn vị A, B)

| Mã | Kiểm | Luật |
|---|---|---|
| CONF-RUN-1 | Mỗi action: gọi bằng người dùng không quyền → 403 `FORBIDDEN`; bằng khoá API thiếu phạm vi → 403 | STD-ACT-2 |
| CONF-RUN-2 | Dữ liệu tạo ở đơn vị A: đơn vị B không đọc, không sửa được (qua action **và** qua SQL trong `ctx.data.tx` của B) | STD-DATA-1 |
| CONF-RUN-3 | Phản hồi khớp zod `output` cho bộ input mẫu (sinh từ zod + mẫu module cung cấp) | STD-ACT-3 |
| CONF-RUN-4 | Mỗi action ghi gọi 2 lần cùng `Idempotency-Key` → cùng phản hồi, dữ liệu không nhân đôi; khác nội dung → `IDEMPOTENCY_CONFLICT` | STD-ACT-4 |
| CONF-RUN-5 | Kịch bản chạm sổ: duyệt → `posted`; sửa sau duyệt → bút toán cũ bị đảo đúng một lần, bút toán mới ghi; huỷ → đảo | STD-DOC-1, STD-DOC-5 |
| CONF-RUN-6 | Không xoá được bản ghi đang được tham chiếu | STD-DATA-9 |
| CONF-RUN-7 | Mỗi lần sửa chứng từ có phiên bản mới trong `document_versions` | STD-DOC-2 |
| CONF-RUN-8 | Ghi chứng từ ngày trong kỳ đã khoá → `PERIOD_LOCKED`; ngoài cửa sổ `dataLock` → bị chặn | STD-DOC-6 |
| CONF-RUN-9 | Mỗi action có `dryRun`: chạy dry-run → không bảng nào đổi, không sự kiện nào ra outbox | STD-ACT-7 |
| CONF-RUN-10 | Mỗi subscriber: giao cùng sự kiện 2 lần → hiệu ứng 1 lần | STD-EVT-2 |
| CONF-RUN-11 | Mỗi action ghi → đúng 1 bản ghi bằng chứng (cả khi lỗi nghiệp vụ) | STD-EVD-1 |
| CONF-RUN-12 | `UPDATE`/`DELETE` bảng bằng chứng bị chặn | STD-EVD-2 |
| CONF-RUN-13 | Bằng chứng không chứa giá trị `pii` thô, không chứa khoá / token | STD-EVD-5 |
| CONF-RUN-14 | Gọi qua actor AI giả lập: bằng chứng có `kind: ai`, `via`, `onBehalfOf`; action `propose` chỉ tạo `draft` | STD-EVD-6, Action §6 |
| CONF-RUN-15 | Hook chạy quá giờ bị cắt đúng như Extension §4 | STD-EXT-2 |
| CONF-RUN-16 | Toàn bộ CONF-RUN chạy lại khi không có biến Cell → đạt | P1, STD-EXT-5 |
| CONF-RUN-17 | Sau toàn bộ kịch bản: `assertLedgerInvariants(A)`, `(B)` đạt; bộ test Kernel hiện có không đỏ | Tier 0 Kernel |

### CONF-UPG — nâng cấp

| Mã | Kiểm | Luật |
|---|---|---|
| CONF-UPG-1 | Có migration mới → `version` tăng ≥ minor; action / sự kiện công khai bị bỏ → tăng major | STD-MOD-6 |
| CONF-UPG-2 | Cài bản trước, tạo dữ liệu mẫu, nâng lên bản này → CONF-RUN vẫn đạt; sự kiện đổi khuôn có bản cũ song song | STD-EVT-4 |

## 3. Báo cáo

`bizcity module check` in bảng cho người đọc và ghi `modules/<key>/.bizcity/check-report.json`:

```json
{
  "module": "acme.hop-dong", "version": "0.1.0", "sourceHash": "sha256:7e0b…",
  "core": { "standard": "1.0.0", "kernel": "1.0.0" },
  "result": "pass",
  "checks": [
    { "id": "CONF-MAN-1", "result": "pass" },
    { "id": "CONF-RUN-4", "result": "pass", "detail": "7 action ghi × 2 lần" },
    { "id": "CONF-MIG-2", "result": "waived", "waiver": { "rule": "STD-DATA-1", "adr": "ADR-0007" } }
  ],
  "ranAt": "2026-11-05T09:00:00Z"
}
```

Kết quả: `pass` / `fail` / `waived` (miễn trừ có ADR, chỉ cho luật Tier 1). Bất kỳ `fail` nào, hoặc `waived` một luật Tier 0, thì `result = fail`.

## 4. Cổng cài đặt

| Bước | Core làm |
|---|---|
| 1 | Tính `sourceHash` của thư mục module (bỏ `.bizcity/`, `node_modules/`) |
| 2 | Đòi `check-report.json` có `result: pass`, `sourceHash` khớp, `core.standard` khớp Standard đang chạy. Lệch → từ chối, in lệnh chạy lại |
| 3 | Chạy migration trong một giao dịch; tạo role / GRANT |
| 4 | Đăng ký quyền, sự kiện, action, slot; ghi bằng chứng `core.module.install` |
| 5 | Module ở trạng thái **cài nhưng chưa bật**; chủ đơn vị bật ở màn Hệ thống |

Môi trường dev có `bizcity dev --unsafe-skip-check` để thử nhanh, nhưng Core in cảnh báo đỏ và không cho bật trên đơn vị có `BOOK_MODE=tax` hoặc có dữ liệu thật (có bút toán).

## 5. Dùng ngay khi chưa có CLI

Bộ kiểm `tests/conformance/` (khởi tạo 2026-10-29) đã chạy các CONF-* đọc được bằng mã tĩnh. Mỗi check khai `conf: [...]`, nên bảng điểm tự đếm số CONF-* đã có check.

| Cổng | Đã có check (lane selfcheck) | Chưa có |
|---|---|---|
| CONF-MAN | SC-CON-2 (MAN-1, 2, 3, 4, 6, 7) | MAN-5, MAN-8; SC-MOD-3 đo độ sẵn sàng manifest cho phân hệ hiện có |
| CONF-STATIC | SC-MOD-1 (STATIC-1), SC-MOD-2 + SC-KERNEL-1..3 (STATIC-2), SC-API-1 (STATIC-9), SC-EVT-1 (STATIC-11), SC-EVD-1 (STATIC-13) | STATIC-3..8, 10, 12 |
| CONF-MIG (đọc tệp) | SC-DATA-1, 2 (MIG-1), SC-DATA-3 (MIG-6), SC-DATA-4 (MIG-4), SC-DATA-5 (MIG-2 phần `tenant_id`); SC-DATA-6 đo RLS | MIG-3, MIG-5; bản chính xác trên `pg_catalog` |
| CONF-RUN | lane diagnostics DG-* (toàn vẹn sổ của RUN-5, RUN-17) | RUN-1..16 → lane `runtime` Phase 4 |
| Gói định khoản | SC-TPL-1 (STD-TPL-1..4, 9) — `--module <thư mục gói>` kiểm một gói | chạy tình huống mẫu qua Kernel thật (lane `runtime`) |
| MCP | — | CONF-MCP-1..6 ([bizcity_mcp@1 §7](../contracts/BIZCITY-MCP-v1.md)): tĩnh khi có registry action, chạy ở lane `runtime` |

Test vitest vẫn là phần chạy thật:

| Kiểm | Công cụ hiện có |
|---|---|
| CONF-STATIC-1 (một phần) | `apps/api/test/phan-he-ranh-gioi.test.ts` |
| CONF-STATIC-2 (một phần: ghi bảng nhân) | `scripts/kiem-chuan.sh` |
| CONF-RUN-1 (một phần) | `access.test.ts`, `edit-permission.test.ts` |
| CONF-RUN-17 (một phần) | `db-rules.test.ts`, `ledger-flow.test.ts`; `assertLedgerInvariants` là việc Phase 2 |
