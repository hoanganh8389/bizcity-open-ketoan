/**
 * Nhận một đơn bán (dùng chung cho POST /orders và đơn mới của POST /exchanges). Gọi trong handler của action ghi: runtime bọc
 * cả handler trong một giao dịch, nên kiểm + cấp mã + nộp chứng từ sale + lưu đơn cùng thành công hoặc cùng huỷ.
 */
import { Errors, sql, type ActionContext } from '@bizcity/module-sdk';
import { codePeriod, computeOrder, couponCodes, parseCode, saleDocKey, toOrderSnapshot, toSaleDocument, type OrderProblem } from './domain/order.js';
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

// [2026-11-15 07:50 PM Võ Hoàng] POS-LOYALTY — NT-BH-020 bước 2: hỏi module loyalty trước khi nhận đơn (đóng góp)
type QuoteReward = { index: string; kind: 'gift' | 'voucher'; points: number; sku?: string; quantity?: number; voucher?: { code: string; discountType: string; discountValue: number; maxDiscount: number; minOrderAmount: number; expiresAt: string | null } };
type Quote = { enabled: boolean; tierKey?: string; tierName?: string; balance?: number; rewards: QuoteReward[]; points: number; earned: number; voucher?: { code: string; amount: number }; problems: string[] };

/**
 * Đổi điểm / voucher / điểm đơn này (NT-BH-020 bước 2): hỏi action đọc `loyalty.redeem.quote` của module loyalty (gọi chéo theo mã,
 * quyền của thu ngân). Đơn có đổi điểm hoặc voucher mà module chưa bật / báo lỗi → chặn, nói rõ. Đơn chỉ có khách: hỏi để in điểm
 * trên bill, module chưa bật thì bỏ qua. `base`: đơn tính thử chưa có voucher (tổng để kiểm đơn tối thiểu, chia tiền giảm).
 */
async function quoteLoyalty(ctx: ActionContext, draft: OrderDraft, branchCode: string, base: ReturnType<typeof computeOrder>) {
  if ('problem' in base) raise(base.problem);
  const coupons = couponCodes(draft);
  const redeem = draft.loyalty?.redeem ?? [];
  const customer = base.customer?.code;
  if (redeem.length && !customer) throw Errors.validation('Đổi điểm phải chọn khách thành viên', { field: 'loyalty' });
  if (!customer && !coupons.length) return null;
  const must = coupons.length > 0 || redeem.length > 0;
  let q: Quote;
  try {
    q = await ctx.actions.call<Quote>('loyalty.redeem.quote', {
      ...(customer ? { customer } : {}), branch: branchCode, orderId: draft.id, orderTotal: base.total, redeem,
      items: base.lines.filter((l) => !l.draft.isGift).map((l) => ({ sku: l.item.sku, qty: l.draft.unitQty * l.unitRatio })),
      ...(coupons[0] ? { voucher: coupons[0] } : {}),
    });
  } catch (e) {
    if (!must) return null;
    throw Errors.validation(`Chưa đổi điểm / dùng voucher được: ${(e as Error).message}`, { field: coupons.length ? 'promotionSelections' : 'loyalty' });
  }
  if (q.problems.length) throw Errors.validation(q.problems.join('; '), { field: coupons.length && !redeem.length ? 'promotionSelections' : 'loyalty' });
  if (!q.enabled && !q.voucher) return null;
  const gifts = new Map(q.rewards.filter((r) => r.kind === 'gift' && r.sku).map((r) => [r.index, { sku: r.sku!, quantity: r.quantity ?? 1 }]));
  const issued = q.rewards.filter((r) => r.kind === 'voucher' && r.voucher).map((r) => r.voucher!);
  return {
    input: { gifts, ...(q.voucher ? { voucher: q.voucher } : {}) },
    snapshot: q.enabled && customer
      ? {
          earned: q.earned, redeemed: q.points, balanceAfter: (q.balance ?? 0) - q.points + q.earned, tierKey: q.tierKey ?? '', tierName: q.tierName ?? '',
          vouchers: issued.map((v) => ({ code: v.code, discountType: v.discountType, discountValue: v.discountValue, maxDiscount: v.maxDiscount, minOrderAmount: v.minOrderAmount, expiresAt: v.expiresAt })),
          rewards: q.rewards,
        }
      : undefined,
  };
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
    const base = { draft, catalog, paymentMethods, partner, ...(opts.exchange ? { exchange: opts.exchange } : {}) };
    const loyalty = await quoteLoyalty(ctx, draft, branch.code, computeOrder({ ...base, loyalty: { lenient: true } }));
    const computed = computeOrder({ ...base, ...(loyalty ? { loyalty: loyalty.input } : {}) });
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
    return { kind: 'new', computed, branch, code, loyalty } as const;
  });
  if (prepared.kind === 'replay') return { order: prepared.snapshot, nextReservedCodes: [], einvoiceReview: EINVOICE_NONE, replayed: true };

  const { computed, branch, code, loyalty } = prepared;
  const doc = toSaleDocument(computed, { draft, branchCode: branch.code, code });
  const submitted = await ctx.ledger.submit(doc);
  const order = toOrderSnapshot(computed, { draft, code, branch, createdAt: new Date().toISOString(), ...(loyalty?.snapshot ? { loyalty: loyalty.snapshot } : {}), ...(loyalty?.input.voucher ? { usedVouchers: [loyalty.input.voucher.code] } : {}) });

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
