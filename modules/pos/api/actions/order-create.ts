/**
 * POST /api/v1/m/pos/orders — nhận đơn bán tại quầy (kế hoạch module POS đợt W1, phiếu NT-BH-004).
 *
 * Một giao dịch (runtime bọc cả handler): kiểm + tính lại tiền theo danh mục kế toán → cấp mã phiếu → nộp chứng từ `sale`
 * (ctx.ledger.submit) → lưu đơn + dòng đơn ở mod_pos. Lỗi ở bước nào (kể cả định khoản) thì không bước nào được ghi.
 * Gửi lại cùng id đơn, cùng nội dung → trả đơn cũ; cùng id mà khác nội dung → CONFLICT (không trả nhầm đơn cũ).
 */
import { Errors, defineAction, sql, z } from '@bizcity/module-sdk';
import { codePeriod, computeOrder, parseCode, saleDocKey, toOrderSnapshot, toSaleDocument, type OrderProblem } from '../domain/order.js';
import { orderDraftSchema } from '../domain/schema.js';
import { lastCode, takeCodes } from '../codes.js';
import { activePaymentMethods, catalogFor, partnerByCode, resolveBranch } from '../read.js';

const EINVOICE_NONE = { required: false, lines: [] as unknown[], warnings: [] as string[] };

/**
 * Lỗi nghiệp vụ → Errors.*: `details = { reason, ...dữ liệu }` — danh sách (mã hàng…) ở `items`, dữ liệu dạng object trải
 * phẳng cạnh `reason`. Không dùng `details.context` vì khoá đó chỉ dành cho ngữ cảnh chứng từ (BIZCITY-ERRORS §4b).
 */
function raise(p: OrderProblem): never {
  const extra = p.details === undefined ? {} : Array.isArray(p.details) ? { items: p.details } : (p.details as Record<string, unknown>);
  const details = { ...extra, reason: p.reason };
  throw p.kind === 'conflict' ? Errors.conflict(p.message, details) : Errors.validation(p.message, details);
}

/** Vi phạm UNIQUE (23505) — hai máy gửi đồng thời vượt qua bước kiểm. */
const isUniqueViolation = (err: unknown) => (err as { code?: string } | null)?.code === '23505';

export default defineAction({
  id: 'pos.order.create', title: 'Nhận đơn bán từ máy POS', tags: ['Máy bán POS'],
  description: 'Đơn bán tại quầy → chứng từ sale (bizcity_ledger_intake@1) qua cửa nạp, cùng giao dịch với đơn.',
  permission: 'pos:sell', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'required', dryRun: true,
  // STD-ACT-8: action chạm sổ khai PERIOD_LOCKED, POSTING_FAILED.
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'PERIOD_LOCKED', 'POSTING_FAILED'],
  input: orderDraftSchema,
  output: z.object({
    order: z.record(z.unknown()),
    nextReservedCodes: z.array(z.string()),
    einvoiceReview: z.object({ required: z.boolean(), lines: z.array(z.unknown()), warnings: z.array(z.string()) }),
  }),
  expose: { http: { method: 'POST', path: '/orders', status: 201 }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'pos.order', objectId: (input) => input.id },
  handler: async (ctx, draft) => {
    const prepared = await ctx.data.module(async (tx) => {
      // Hai lần gửi cùng id đơn chạy song song: lần sau đợi lần trước xong (khoá theo giao dịch, tự nhả lúc commit / huỷ).
      await sql`SELECT pg_advisory_xact_lock(hashtext(${`pos:order:${draft.id}`}))`.execute(tx);
      const old = (await sql<{ snapshot: Record<string, unknown>; same: boolean }>`
        SELECT snapshot, draft = ${JSON.stringify(draft)}::jsonb AS same FROM mod_pos.orders WHERE order_id = ${draft.id}`.execute(tx)).rows[0];
      if (old && !old.same) {
        throw Errors.conflict(`Đơn ${draft.id} đã nhận với nội dung khác — máy phải tạo đơn mới (id mới) thay vì sửa đơn đã gửi`, { reason: 'POS_ORDER_ID_REUSED', orderId: draft.id });
      }
      if (old) return { kind: 'replay', snapshot: old.snapshot } as const;

      const branch = await resolveBranch(tx, draft.branchCode);
      const catalog = await catalogFor(tx, draft.lines.map((l) => l.sku));
      const paymentMethods = await activePaymentMethods(tx);
      const partner = 'partnerId' in draft.customer ? await partnerByCode(tx, draft.customer.partnerId) : null;
      const computed = computeOrder({ draft, catalog, paymentMethods, partner });
      if ('problem' in computed) raise(computed.problem);

      // Mã phiếu: dùng số máy đã được cấp trước (đúng khuôn, đã cấp, chưa dùng); không thì cấp số mới. Khoá theo số để hai máy
      // cùng dùng một số đã cấp không cùng qua bước "chưa dùng".
      const period = codePeriod(draft.businessDate);
      let code: string | undefined;
      const reservedNo = draft.reservedCode ? parseCode('sale', period, draft.reservedCode) : null;
      if (reservedNo !== null && reservedNo <= (await lastCode(tx, branch.code, 'sale', period))) {
        await sql`SELECT pg_advisory_xact_lock(hashtext(${`pos:code:${branch.code}:${draft.reservedCode!}`}))`.execute(tx);
        const used = (await sql<{ n: number }>`
          SELECT 1 AS n FROM mod_pos.orders WHERE branch_code = ${branch.code} AND code = ${draft.reservedCode!}`.execute(tx)).rows.length > 0;
        if (!used) code = draft.reservedCode!;
      }
      code ??= (await takeCodes(tx, ctx.tenant.id, branch.code, 'sale', period, 1))[0]!;
      return { kind: 'new', computed, branch, code } as const;
    });
    if (prepared.kind === 'replay') return { order: prepared.snapshot, nextReservedCodes: [], einvoiceReview: EINVOICE_NONE };

    const { computed, branch, code } = prepared;
    const doc = toSaleDocument(computed, { draft, branchCode: branch.code, code });
    const submitted = await ctx.ledger.submit(doc);
    const order = toOrderSnapshot(computed, { draft, code, branch, createdAt: new Date().toISOString() });

    try {
      await ctx.data.module(async (tx) => {
        await sql`
          INSERT INTO mod_pos.orders (tenant_id, order_id, branch_code, code, business_date, status, customer_code,
                                      subtotal, tax_total, total, doc_key, doc_status, snapshot, draft, created_by)
          VALUES (${ctx.tenant.id}, ${draft.id}, ${branch.code}, ${code}, ${draft.businessDate}, ${order.status},
                  ${computed.customer?.code ?? null}, ${computed.subtotal}, ${computed.taxTotal}, ${computed.total},
                  ${saleDocKey(branch.code, draft.id)}, ${submitted.status}, ${JSON.stringify(order)}::jsonb,
                  ${JSON.stringify(draft)}::jsonb, ${ctx.actor.id})`.execute(tx);
        // Dòng đơn lưu định danh mặt hàng (item_id, ADR-0017 / STD-DATA-6); mã và tên chỉ là ảnh chụp lúc bán.
        for (const l of computed.lines) {
          await sql`
            INSERT INTO mod_pos.order_lines (tenant_id, order_id, line_key, item_id, sku, item_name, unit_name, unit_qty, unit_ratio,
                                             amount, amount_before_tax, tax_amount, discount, tax_code, send_tax)
            VALUES (${ctx.tenant.id}, ${draft.id}, ${l.draft.lineId}, ${l.item.itemId}, ${l.item.sku}, ${l.item.name}, ${l.draft.unitName},
                    ${l.draft.unitQty}, ${l.unitRatio}, ${l.money.gross}, ${l.money.net}, ${l.money.tax}, ${l.money.discountNet},
                    ${l.item.taxCode}, ${l.item.sendTax})`.execute(tx);
        }
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw Errors.conflict(`Mã phiếu ${code} hoặc đơn ${draft.id} vừa được máy khác dùng — gửi lại đơn`, { reason: 'POS_CODE_TAKEN', code });
      throw err;
    }
    ctx.evidence.note('pos.order', { code, docKey: doc.docKey, docStatus: submitted.status, total: computed.total });
    return { order, nextReservedCodes: [], einvoiceReview: EINVOICE_NONE };
  },
});
