# `bizcity_action@1` — Action Contract
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-10-30 10:29 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — tự chẩn đoán L1 / L3, diagnostic_runs, khoá kỳ chặn khi sổ lỗi (PHASES 2.10). -->
<!-- [2026-10-30 11:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — runtime action defineAction, idempotency, dry-run (PHASES 2.5). -->
<!-- [2026-10-30 12:50 PM Johnny Chu - Chu Hoàng Anh] CONG-BO — bản công bố kiến trúc: 4 lớp hợp đồng, luật hạ tầng, checklist nhận việc. -->

> **Phiên bản:** 1.0.0-draft · 2026-10-29 · **Trạng thái:** Đề xuất · **Thuộc:** [Standard v1](../standard/README.md) (hợp đồng 4/7)
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
  sideEffects: ['documents', 'ledger'],            // write bắt buộc: documents | ledger | masterdata | settings | external
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
| 10 | Commit (hoặc rollback nếu `dryRun`) → trả `{ ok, data, meta: { receipt, requestId, dryRun? } }` | |

Handler **không** gọi `requirePermission`, `writeAudit`, `reply.status`, không tự mở giao dịch.

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
     - runtime ở `apps/api/src/core/actions.ts` (tách thành gói `packages/actions` cùng 2.3);
     - bảng `action_requests` (migration 0035);
     - 11 action `quy.payment-request.*`, giữ nguyên đường dẫn;
     - test `apps/api/test/actions.test.ts` (CONF-RUN-1, -4, -9).
   - Giao diện gửi `Idempotency-Key` cho mọi lệnh ghi; form giữ một khoá mỗi lần mở.
   - Còn thiếu cho đủ §4: biên nhận bằng chứng (2.6), outbox sự kiện (Phase 3), kiểm module bật / năng lực (Phase 3).
2. Phase 3: chuyển mọi route `phan-he/*`; route `modules/*` của Kernel chuyển khi tách Kernel.
3. Phase 5: `adapters/cell` đọc registry action → MCP.
