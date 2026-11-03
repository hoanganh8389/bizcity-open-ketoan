# `bizcity_action@1` — Action Contract
<!-- [2026-11-03 08:05 PM Johnny Chu - Chu Hoàng Anh] SC-DOC-4 — sửa tham chiếu đường dẫn lỗi thời sau khi tách Kernel / Platform (mã đã dời; gói đích chưa tách ghi rõ "chưa tách") -->
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-10-30 10:29 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — tự chẩn đoán L1 / L3, diagnostic_runs, khoá kỳ chặn khi sổ lỗi (PHASES 2.10). -->
<!-- [2026-10-30 11:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — runtime action defineAction, idempotency, dry-run (PHASES 2.5). -->
<!-- [2026-10-30 12:50 PM Johnny Chu - Chu Hoàng Anh] CONG-BO — bản công bố kiến trúc: 4 lớp hợp đồng, luật hạ tầng, checklist nhận việc. -->

> **Phiên bản:** 1.3.0-draft · 2026-11-03 · **Trạng thái:** Đề xuất · **Thuộc:** [Standard v1](../standard/README.md) (hợp đồng 4/7)
> **Vận chuyển HTTP:** [`bizcity_api@1`](BIZCITY-API-v1.md) · **Luật nền:** [R-API](../rules/RULE-API.md) · **Năng lực:** `actions.runtime`, `actions.idempotency`, `actions.dry-run`, `mcp.tools`

## 1. Mục đích

**Mọi thao tác** (của người qua giao diện, của hệ thống ngoài qua API, của AI qua MCP) là một **action** khai báo một lần. Từ một khai báo, Core sinh: route HTTP, mô tả OpenAPI, công cụ MCP, lời gọi trong giao diện, dòng lệnh CLI. Quyền, kiểm dữ liệu, idempotency, giao dịch, bằng chứng, lỗi chuẩn do runtime làm, module không tự viết.

## 2. Hiện trạng

| Đã có | Thiếu |
|---|---|
| Route Fastify + zod (`fastify-type-provider-zod`), OpenAPI ở `/api/docs` | Khai báo tách khỏi Fastify; một nguồn cho HTTP + MCP + CLI |
| `requirePermission('…')`, `Errors.*`, khuôn `{ ok, data, error }` | Idempotency ngoài cửa nạp sổ (A-21) |
| `writeAudit()` gọi tay ở 7 tệp phân hệ | Bằng chứng tự động cho mọi action ghi |
| `/addins/tro-ly/simulate`: chạy luật thật trong giao dịch rồi huỷ | Dry-run là tuỳ chọn chuẩn của mọi action |

## 3. Khai báo

```ts
// modules/hop-dong/api/actions/record-payment.ts
import { defineAction, z, Errors } from '@bizcity/module-sdk';

export default defineAction({
  id: 'hop-dong.installment.record-payment',      // <key>.<thực thể>.<động từ>
  title: 'Ghi nhận khách trả tiền một kỳ hợp đồng',
  input: z.object({
    installmentId: z.string(),
    paidDate: z.string().date(),
    amount: z.number().positive(),
    methodCode: z.string(),                        // mã hình thức thanh toán (danh mục chuẩn)
  }),
  output: z.object({ installmentId: z.string(), status: z.literal('paid'), ledgerDocKey: z.string() }),
  permission: 'hop-dong:collect',
  effect: 'write',                                 // read | write
  sideEffects: ['documents', 'ledger'],            // write bắt buộc: documents | ledger | masterdata | settings | external | analysis
  idempotency: 'required',                         // required | natural | none
  dryRun: true,                                    // cho phép ?dryRun=1 / dryRun trong MCP
  expose: { http: { method: 'POST', path: '/installments/:installmentId/payments' }, mcp: true, ai: 'propose' },
  errors: ['NOT_FOUND', 'CONFLICT', 'PERIOD_LOCKED', 'POSTING_FAILED'],
  async handler(ctx, input) {
    const inst = await ctx.data.tx.selectFrom('mod_hop_dong.installments') /* … */;
    if (!inst) throw Errors.notFound('kỳ thanh toán');
    if (inst.status === 'paid') throw Errors.conflict('Kỳ này đã ghi nhận thanh toán');
    const docKey = `hop-dong.installment:${inst.id}:payment`;
    await ctx.ledger.submit({ docType: 'customer_payment', docKey, version: 1, /* … mã, không tài khoản */ });
    // … cập nhật trạng thái kỳ, phát sự kiện
    return { installmentId: String(inst.id), status: 'paid', ledgerDocKey: docKey };
  },
});
```

### 3.1 Trường mở rộng của `expose.http` và thân tuỳ chọn
<!-- [2026-11-03 10:32 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6: ghi lại các khả năng đã có ở runtime (query, bodyLimit, thân tuỳ chọn) — chốt thiết kế trước (R-FLOW-2) -->

`expose.http` ngoài `method`, `path`:

| Trường | Ý nghĩa |
|---|---|
| `status: 201` | Mã trả khi thành công (mặc định 200). |
| `query: <zod object>` | Những khoá của `input` lấy từ **query string** khi method là `POST` / `PUT` / `PATCH` (ví dụ `PUT /products/:sku?new=1`); các khoá còn lại lấy từ thân. `GET` / `DELETE` luôn lấy toàn bộ `input` từ query và path. Khoá kiểu true / false dùng `queryBool` (không dùng `z.coerce.boolean()` — chuỗi `"false"` sẽ thành `true`). |
| `bodyLimit: <byte>` | Nới giới hạn thân cho thao tác nạp dữ liệu lớn (nhập danh mục, quét ảnh hoá đơn). |

**Thân tuỳ chọn:** nếu `{}` đã hợp lệ với `input` (mọi trường tuỳ chọn hoặc có giá trị mặc định) thì thân thiếu hoặc `null` được nhận như `{}`.

## 4. Runtime chạy gì, theo thứ tự

| Bước | Việc | Lỗi chuẩn |
|---|---|---|
| 1 | Xác thực: JWT người dùng, `X-Api-Key`, hoặc khoá Cell (AI) → `ctx.actor` | `UNAUTHORIZED` |
| 2 | Module có bật cho đơn vị không; năng lực đủ không | `FORBIDDEN`, `CAPABILITY_MISSING` |
| 3 | Quyền: `actor` có `permission`; nếu actor là AI thì xét thêm `expose.ai` (§6) | `FORBIDDEN` |
| 4 | Kiểm `input` bằng zod (trường lạ bị loại) | `VALIDATION_ERROR` |
| 5 | Idempotency: tra `(tenant_id, action_id, idempotency_key)` → đã có thì trả **đúng** phản hồi cũ; cùng khoá khác nội dung → lỗi | `IDEMPOTENCY_CONFLICT` |
| 6 | Mở giao dịch `ctx.data.tx` (đặt `bizcity.tenant_id`) | |
| 7 | `handler(ctx, input)` | `Errors.*` của handler |
| 8 | Ghi bằng chứng (Evidence) trong cùng giao dịch, kể cả khi handler ném lỗi nghiệp vụ (ghi ở giao dịch riêng) | |
| 9 | Ghi sự kiện vào outbox (cùng giao dịch); lưu phản hồi cho idempotency | |
| 10 | Commit (hoặc rollback nếu `dryRun`) → trả `{ ok, data, meta: { receipt, requestId, dryRun?, …ctx.meta } }` (§4.1) | |

Handler **không** gọi `requirePermission`, `writeAudit`, `reply.status`, không tự mở giao dịch.

### 4.1 `ctx.meta(key, value)` — trường bổ sung của phản hồi (1.2.0, **đã chốt**)
<!-- [2026-11-03 10:32 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6: chốt hình dạng ctx.meta trước khi chuẩn hoá mã (hai phiên đã viết hai bản khác nhau ngày 2026-11-03) -->

Handler thêm trường vào `meta` của phản hồi, ở mức trên cùng cạnh `requestId` / `receipt` — dành cho thông tin đi kèm kết quả mà không thuộc `data`, ví dụ `gate`, `findings`, `held` của cổng kiểm chuẩn Gate A khi lưu danh mục.

- **Dạng chuẩn là hàm:** `ctx.meta('findings', findings)`. Gọi nhiều lần, mỗi khoá một giá trị (gọi lại cùng khoá thì ghi đè).
- **Khoá của runtime là cấm:** `requestId`, `receipt`, `idempotency`, `dryRun`. Ghi vào đó là lỗi lập trình (ném lỗi), không phải lỗi người dùng — để không ai âm thầm đè biên nhận.
- **Chạy thử (`dryRun`) giữ meta.** Người xem trước thấy cùng `findings` như khi ghi thật.
- **Gửi lặp cùng `Idempotency-Key`** trả đúng dữ liệu và biên nhận lần đầu, **không** kèm meta bổ sung (meta không được lưu để phát lại).
- **Tương thích:** mã đã có trên `main` ghi meta bằng `Object.assign(ctx.meta, { … })` (hoặc gán `ctx.meta.<khoá> = giá trị`); runtime vẫn nhận, cùng một chỗ chứa, cùng luật khoá cấm. Mã mới dùng dạng hàm; chuyển mã cũ dần, không bắt buộc cùng lúc.

### 4.2 Action theo lô — `ctx.data.item(fn)` (**đã chốt**)

Một thao tác nhiều mục (trạm định khoản, kết chuyển nhiều chi nhánh, nhập Excel…) chạy **trong một giao dịch của action**, mỗi mục một `SAVEPOINT`:

- Mục lỗi chỉ huỷ phần của nó và trả `{ ok: false, error }` để handler báo trong kết quả; các mục khác giữ nguyên.
- Các mục đúng được lưu **cùng lúc khi cả lô xong**. Lỗi ngoài từng mục huỷ cả lô — không để lại phần đã chạy.
- Một bằng chứng cho cả lô.
- Không dùng cho cửa nạp chứng từ (chứng từ bị từ chối phải còn ở bể chờ dù yêu cầu lỗi) và kéo chứng từ từ kết nối (nguồn đã được báo "đã nhận" từng trang): hai route đó giữ là route, có lý do ghi ở `// @bizcity-route:`.
- Service dùng chung có bản `*In(trx, …)` nhận giao dịch của action và gọi `inSavepoint(trx, fn)` cho từng mục.

### 4.3 Bí mật và kích thước trong bằng chứng (**đã chốt**)

- Trường tên `key` (đúng nguyên tên), hoặc kết thúc bằng `password`, `secret`, `token`, `apikey`, `api_key`, `privatekey` (không phân biệt hoa thường) bị che thành `***` trong **bằng chứng** và trong **phản hồi lưu để phát lại**. Người gọi lần đầu nhận đủ; gửi lặp nhận bản đã che — nên khoá API chỉ trả về một lần.
- `input` trong bằng chứng lớn hơn 64 KB được thay bằng `{ omitted: true, bytes }`; `inputHash` vẫn đối chiếu được với thân gốc. (Nạp danh mục hay quét ảnh hoá đơn có thể tới hàng chục MB.)

### 4.4 Nhật ký nghiệp vụ trong action — **đã chốt, phương án C** (1.3.0)
<!-- [2026-11-03 11:58 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6: chốt phương án C — writeAudit trong action ghi vào ghi chú của bằng chứng, trừ sổ "nhật ký có người đọc"; chủ dự án đồng ý 2026-11-03 -->

**Vấn đề.** Dòng cuối §4 nói handler không gọi `writeAudit` (bằng chứng do runtime ghi, STD-EVD-3). Nhưng các service mà handler gọi vẫn gọi `writeAudit`, nên mỗi lần ghi có **hai** dòng `audit_logs`: bằng chứng của runtime (tên = id action, mang `input`) và dòng cũ (tên cũ như `branch.update`, mang `before` / `after`).

**Chỗ đọc dòng cũ theo tên** (khảo sát mã) — bỏ dòng cũ mà không tính tới sẽ làm hỏng:

| Tên hành động | Nơi đọc | Dùng để |
|---|---|---|
| `costing.fill` | `packages/kernel/.../closing.service.ts` | phát hiện kết chuyển lỗi thời (giá vốn điền lại sau lần kết chuyển) |
| `<loại>.update`, `objectType = source_document` (vd `receipt.update`) | `packages/kernel/.../document.repository.ts` | hiện "người sửa cuối" của chứng từ |
| `settings.item-auto-create` | `apps/api/.../catalog-rules.routes.ts` | hiện người và lý do đổi "tự thêm mặt hàng" lần cuối |

**Đã xem xét và không chọn:** (A) giữ nguyên — ghi trùng, trái §4; (B) bỏ `writeAudit` ở từng service bằng tham số `audit = false` — hỏng ba tính năng trên, mất ảnh `before`, phải sửa hơn 100 chỗ gọi; (D) sửa hợp đồng cho khớp thực tế — ghi trùng vĩnh viễn.

**Quyết định (C).** Trong lúc chạy một action, `writeAudit(trx, entry)` **không chèn dòng mới** mà ghi vào ghi chú của chính bằng chứng — **trừ** các mục khai ở sổ "nhật ký có người đọc".

1. **Cơ chế.** Runtime đặt bối cảnh action (AsyncLocalStorage) quanh `handler`. `writeAudit` gọi trong bối cảnh đó: nếu `entry` khớp một mục của sổ thì ghi dòng như cũ; nếu không thì thêm `{ action, objectType, objectId, before, after }` vào `changes.notes.audit[]` của bằng chứng (STD-EVD-3: module bổ sung bằng chứng qua `notes`). Ngoài bối cảnh action (route chưa là action, tác vụ nền) `writeAudit` chạy y như cũ. Không đổi chỗ gọi nào.
2. **Sổ "nhật ký có người đọc".** Hằng số `AUDIT_KEEP` trong `packages/platform/src/core/audit.ts`; mỗi mục là `{ action, objectType? }` (`action` có thể là mẫu `*.hậu-tố`). Ban đầu đúng ba mục ở bảng trên. Thêm mục = có chỗ đọc mới, kèm dòng trong bảng này.
3. **Lô.** Ghi chú nhật ký tạo trong một mục lô bị huỷ (§4.2) bị bỏ theo mục đó.
4. **Kích thước.** `notes` lớn hơn 64 KB trong bằng chứng bị thay bằng `{ omitted: true, bytes }` (giống `input`, §4.3).
5. **Chuỗi băm.** Không ảnh hưởng: trigger `audit_logs_chain` tính cho mọi dòng còn lại; ghi chú nằm trong nội dung bằng chứng đã băm.
6. **Phép kiểm tĩnh SC-AUDIT-1.** Mọi chỗ trong mã đọc `audit_logs` theo `action` (`= '…'`, `IN (…)`, `LIKE '…'`) phải khớp một mục của `AUDIT_KEEP`; chỗ đọc theo **id action** (ba phần `module.thực-thể.động-từ`, vd `core.conformance.acknowledge`) là đọc bằng chứng của runtime, được miễn.
7. **Test.** Test đang đọc `audit_logs` theo tên cũ chuyển sang helper `auditRows(action, objectId)` đọc cả dòng cũ lẫn `notes.audit[]`, để giữ ý của test và không viết lại hàng loạt.

**Hệ quả.** Thao tác đi qua action không còn dòng `audit_logs` cũ cho những tên **không** trong sổ; thông tin `before` / `after` vẫn còn trong bằng chứng. Route chưa là action vẫn ghi dòng cũ cho tới khi chuyển.

**Thứ tự làm.** Mã (đợt 8b) làm sau đợt 8a (cùng sửa `core/actions.ts`); dòng giữ chỗ 8b thêm sau khi 8a merge.

## 5. Luật

| Mã | Cấp | Luật | Kiểm bằng |
|---|---|---|---|
| STD-ACT-1 | 0 | Mọi route của module sinh từ `defineAction`; không đăng ký route Fastify tay | CONF-STATIC-8 |
| STD-ACT-2 | 0 | Mọi action có `permission` (action đọc công khai phải khai `permission: 'public'` + lý do trong manifest `waivers`) | CONF-MAN-3, CONF-RUN-1 (gọi không quyền → 403) |
| STD-ACT-3 | 0 | `input` và `output` là zod; phản hồi được kiểm theo `output` ở chế độ test | CONF-RUN-3 |
| STD-ACT-4 | 0 | Action `effect: 'write'` có `idempotency` ≠ `none`, trừ khi tự nhiên idempotent (đặt trạng thái tuyệt đối) và khai `natural` | CONF-RUN-4 (gửi 2 lần → 1 kết quả) |
| STD-ACT-5 | 1 | Chỉ ném `Errors.*`; mã lỗi thuộc tập chuẩn (§7). Chi tiết riêng của module đặt ở `error.details.reason` (chuỗi ổn định, vd `INSTALLMENT_ALREADY_PAID`) | CONF-STATIC-9 |
| STD-ACT-6 | 1 | `id` dạng `<key>.<thực thể>.<động từ>`, không đổi sau khi phát hành (đổi = major của module) | CONF-MAN-5 |
| STD-ACT-7 | 1 | Action có `dryRun: true` phải không gây hiệu ứng ngoài giao dịch (không gửi email, không gọi HTTP ngoài trong handler; việc đó làm ở subscriber) | CONF-RUN-9 |
| STD-ACT-8 | 1 | Action chạm sổ khai `errors` gồm `PERIOD_LOCKED`, `POSTING_FAILED` | CONF-MAN-6 |
| STD-ACT-9 | 0 | **Capability Contract**: action ghi khai `sideEffects` (chạm vào đâu; `ledger` = có thể sinh bút toán qua một cửa sổ cái); action đọc không có. Runtime công bố mỗi action ở `GET /system/capabilities` với input / output schema, quyền, `sideEffects`, idempotency, loại bằng chứng (`receipt` cho ghi) | `defineAction` từ chối khi nạp; `test/actions.test.ts` |

## 6. Phơi ra cho AI (MCP)

| `expose.ai` | AI (qua Cell) được | Ví dụ |
|---|---|---|
| `deny` (mặc định cho `effect: 'write'`) | không thấy công cụ | khoá kỳ, xoá danh mục |
| `read` | gọi action đọc | xem công nợ khách, số dư quỹ |
| `propose` | gọi, nhưng kết quả **luôn** là chứng từ ở nhóm `draft`, hoặc chạy `dryRun` để xem trước bút toán; người có quyền duyệt mới có hiệu lực | lập phiếu thu nháp từ tin nhắn Zalo |
| `execute` | gọi và có hiệu lực ngay | chỉ cho action đọc / đánh dấu đã xem; **cấm** cho action chạm sổ trong v1 |

Quyền `risk: high` không bao giờ cấp cho actor AI, kể cả khi khoá Cell có phạm vi rộng. Chi tiết: [../standard/CELL-MCP.md](../standard/CELL-MCP.md).

## 7. Tập mã lỗi chuẩn

Giữ nguyên các mã hiện có trong `packages/contracts/src/api.ts` và thêm (minor):

| Mã | HTTP | Khi nào |
|---|---|---|
| `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INTERNAL_ERROR` | 400, 401, 403, 404, 409, 500 | như hiện nay |
| `NOT_READY` | 503 | bản cài chưa sẵn sàng (L1, `GET /system/health/ready`); action không trả mã này |
| `PERIOD_LOCKED`, `POSTING_FAILED`, `UNBALANCED_ENTRY` | 409, 422, 422 | do Kernel đăng ký; module chỉ chuyển tiếp |
| `IDEMPOTENCY_CONFLICT` *(mới)* | 409 | cùng `Idempotency-Key`, khác nội dung |
| `CAPABILITY_MISSING` *(mới)* | 501 | module cần năng lực Core chưa có |
| `MODULE_DISABLED` *(mới)* | 403 | module chưa bật cho đơn vị |
| `RATE_LIMITED` *(mới)* | 429 | quá hạn mức (khoá API, AI) |

## 8. Idempotency qua HTTP

- Header `Idempotency-Key` (chuỗi 8–128). Action `required` thiếu header → `VALIDATION_ERROR`.
- Lưu ở bảng Platform `action_requests (tenant_id, action_id, idem_key, request_hash, status, response, created_at)`, giữ 7 ngày (khoá cấu hình `bizcity.platform.idempotency_days`).
- Cửa nạp sổ (`POST /documents`) giữ cơ chế riêng bằng `docKey` + `version` (đã có, mạnh hơn: vĩnh viễn) — không bắt buộc header.

## 9. Chuyển dần

1. Phase 2: viết `@bizcity/actions` bọc Fastify; chuyển trước các route **ghi** của `phan-he/quy` (yêu cầu thanh toán) làm mẫu vì có luồng duyệt và chạm sổ.
   - **Đã làm (PHASES 2.5):**
     - runtime ở `apps/api/src/core/actions.ts` (gói đích `packages/actions`, lộ trình 2.5, chưa tách);
     - bảng `action_requests` (migration 0035);
     - 11 action `quy.payment-request.*`, giữ nguyên đường dẫn;
     - test `apps/api/test/actions.test.ts` (CONF-RUN-1, -4, -9).
   - Giao diện gửi `Idempotency-Key` cho mọi lệnh ghi; form giữ một khoá mỗi lần mở.
   - Còn thiếu cho đủ §4: biên nhận bằng chứng (2.6), outbox sự kiện (Phase 3), kiểm module bật / năng lực (Phase 3).
2. Phase 3: chuyển mọi route `phan-he/*`; route `modules/*` của Kernel chuyển khi tách Kernel.
3. Phase 5: `adapters/cell` đọc registry action → MCP.

## 10. Nhật ký thay đổi
<!-- [2026-11-02 03:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — mở nhật ký thay đổi; 1.1.0-draft thêm sideEffect analysis. -->

| Phiên bản | Ngày | Thay đổi |
|---|---|---|
| 1.0.0-draft | 2026-10-29 | Khởi tạo (Standard v1, hợp đồng 4/7) |
| 1.1.0-draft | 2026-11-02 | Thêm `sideEffects: 'analysis'` — action chỉ lưu kết quả phân tích của Core (vd `core.conformance.run`, ADR-0012), không đổi chứng từ, sổ, danh mục, cấu hình |
| 1.2.0-draft | 2026-11-03 | Chốt `ctx.meta(key, value)` (§4.1), action theo lô `ctx.data.item` (§4.2), che bí mật và lược `input` lớn trong bằng chứng (§4.3), `expose.http.query` / `bodyLimit` và thân tuỳ chọn (§3.1). Đề xuất chờ chốt: nhật ký nghiệp vụ trong action (§4.4) |
| 1.3.0-draft | 2026-11-03 | Chốt §4.4 phương án C: `writeAudit` trong action ghi vào `changes.notes.audit[]` của bằng chứng, trừ sổ `AUDIT_KEEP` (ba mục có chỗ đọc); phép kiểm SC-AUDIT-1 |
