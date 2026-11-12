/**
 * Nhận một đơn bán (dùng chung cho POST /orders và đơn mới của POST /exchanges). Gọi trong handler của action ghi: runtime bọc
 * cả handler trong một giao dịch, nên kiểm + cấp mã + nộp chứng từ sale + lưu đơn cùng thành công hoặc cùng huỷ.
 */
import { Errors, sql, type ActionContext } from '@bizcity/module-sdk';
import { codePeriod, computeOrder, parseCode, saleDocKey, toOrderSnapshot, toSaleDocument, type OrderProblem } from './domain/order.js';
import type { OrderDraft } from './domain/schema.js';
import { lastCode, takeCodes } from './codes.js';
import { activePaymentMethods, catalogFor, partnerByCode, resolveBranch } from './read.js';
import { posSettings } from './settings.js';
import { openShiftOf } from './shifts.js';

export const EINVOICE_NONE = { required: false, lines: [] as unknown[], warnings: [] as string[] };

/**
 * Lỗi nghiệp vụ → Errors.*: `details = { reason, ...dữ liệu }` — danh sách (mã hàng…) ở `items`, dữ liệu dạng object trải
 * phẳng cạnh `reason`. Không dùng `details.context` vì khoá đó chỉ dành cho ngữ cảnh chứng từ (BIZCITY-ERRORS §4b).
 */
export function raise(p: OrderProblem): never {
  const extra = p.details === undefined ? {} : Array.isArray(p.details) ? { items: p.details } : (p.details as Record<string, unknown>);
  const details = { ...extra, reason: p.reason };
  throw p.kind === 'conflict' ? Errors.conflict(p.message, details) : Errors.validation(p.message, details);
}

/** Vi phạm UNIQUE (23505) — hai máy gửi đồng thời vượt qua bước kiểm. */
export const isUniqueViolation = (err: unknown) => (err as { code?: string } | null)?.code === '23505';

/** Khoá theo giao dịch (tự nhả lúc commit / huỷ): hai lần gửi cùng khoá chạy nối tiếp. */
export async function lockKey(tx: Parameters<Parameters<ActionContext['data']['module']>[0]>[0], key: string): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`.execute(tx);
}

export type CreatedOrder = { order: Record<string, unknown>; nextReservedCodes: string[]; einvoiceReview: typeof EINVOICE_NONE; replayed: boolean };

export async function createOrder(ctx: ActionContext, draft: OrderDraft, opts: { exchange?: { credit: number; returnDocKey: string } } = {}): Promise<CreatedOrder> {
  const { requireOpenShift } = await posSettings(ctx);
  const prepared = await ctx.data.module(async (tx) => {
    await lockKey(tx, `pos:order:${draft.id}`);
    const old = (await sql<{ snapshot: Record<string, unknown>; same: boolean }>`
      SELECT snapshot, draft = ${JSON.stringify(draft)}::jsonb AS same FROM mod_pos.orders WHERE order_id = ${draft.id}`.execute(tx)).rows[0];
    if (old && !old.same) {
      throw Errors.conflict(`Đơn ${draft.id} đã nhận với nội dung khác — máy phải tạo đơn mới (id mới) thay vì sửa đơn đã gửi`, { reason: 'POS_ORDER_ID_REUSED', orderId: draft.id });
    }
    if (old) return { kind: 'replay', snapshot: old.snapshot } as const;

    const branch = await resolveBranch(tx, draft.branchCode);
    // Cài đặt bán hàng bắt buộc mở ca (NT-BH-011): đơn ngoại tuyến gửi bù vẫn nhận — hàng đã bán thật.
    if (requireOpenShift && !draft.offlineCreatedAt && !(await openShiftOf(tx, branch.code))) {
      throw Errors.conflict(`Chi nhánh ${branch.code} chưa mở ca — mở ca rồi mới bán (Cài đặt bán hàng)`, { reason: 'POS_SHIFT_REQUIRED', branchCode: branch.code });
    }
    const catalog = await catalogFor(tx, draft.lines.map((l) => l.sku));
    const paymentMethods = await activePaymentMethods(tx);
    const partner = 'partnerId' in draft.customer ? await partnerByCode(tx, draft.customer.partnerId) : null;
    const computed = computeOrder({ draft, catalog, paymentMethods, partner, ...(opts.exchange ? { exchange: opts.exchange } : {}) });
    if ('problem' in computed) raise(computed.problem);

    // Mã phiếu: dùng số máy đã được cấp trước (đúng khuôn, đã cấp, chưa dùng); không thì cấp số mới. Khoá theo số để hai máy
    // cùng dùng một số đã cấp không cùng qua bước "chưa dùng".
    const period = codePeriod(draft.businessDate);
    let code: string | undefined;
    const reservedNo = draft.reservedCode ? parseCode('sale', period, draft.reservedCode) : null;
    if (reservedNo !== null && reservedNo <= (await lastCode(tx, branch.code, 'sale', period))) {
      await lockKey(tx, `pos:code:${branch.code}:${draft.reservedCode!}`);
      const used = (await sql<{ n: number }>`
        SELECT 1 AS n FROM mod_pos.orders WHERE branch_code = ${branch.code} AND code = ${draft.reservedCode!}`.execute(tx)).rows.length > 0;
      if (!used) code = draft.reservedCode!;
    }
    code ??= (await takeCodes(tx, ctx.tenant.id, branch.code, 'sale', period, 1))[0]!;
    return { kind: 'new', computed, branch, code } as const;
  });
  if (prepared.kind === 'replay') return { order: prepared.snapshot, nextReservedCodes: [], einvoiceReview: EINVOICE_NONE, replayed: true };

  const { computed, branch, code } = prepared;
  const doc = toSaleDocument(computed, { draft, branchCode: branch.code, code });
  const submitted = await ctx.ledger.submit(doc);
  const order = toOrderSnapshot(computed, { draft, code, branch, createdAt: new Date().toISOString() });

  try {
    await ctx.data.module(async (tx) => {
      await sql`
        INSERT INTO mod_pos.orders (tenant_id, order_id, branch_code, code, business_date, status, customer_code,
                                    subtotal, tax_total, total, doc_key, doc_status, snapshot, draft, created_by, cashier_name)
        VALUES (${ctx.tenant.id}, ${draft.id}, ${branch.code}, ${code}, ${draft.businessDate}, ${order.status},
                ${computed.customer?.code ?? null}, ${computed.subtotal}, ${computed.taxTotal}, ${computed.total},
                ${saleDocKey(branch.code, draft.id)}, ${submitted.status}, ${JSON.stringify(order)}::jsonb,
                ${JSON.stringify(draft)}::jsonb, ${ctx.actor.id}, ${ctx.actor.name || null})`.execute(tx);
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
  // Bản sao WP (local_ledger) nhận qua webhook app: sự kiện ghi cùng giao dịch (outbox) — đơn hỏng thì không có sự kiện.
  // Đơn QR chờ tiền: chưa có bản sao (website chỉ ghi đơn đã hoàn tất) — phát lúc xác nhận tiền về (NT-BH-009).
  if (order.status === 'completed') await ctx.events.emit('pos.order.recorded', { orderId: draft.id, code, branchCode: branch.code, docKey: doc.docKey, version: 1, cashier: { name: ctx.actor.name }, order }, {
    subject: `pos.order:${draft.id}`, dedupeKey: `pos.order.recorded:${draft.id}`,
  });
  return { order, nextReservedCodes: [], einvoiceReview: EINVOICE_NONE, replayed: false };
}
