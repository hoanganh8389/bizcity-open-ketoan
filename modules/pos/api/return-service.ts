/**
 * Hoàn hàng tại quầy (kế hoạch module POS đợt W2, phiếu NT-BH-005): đọc đơn gốc + phần đã trả, lập phiếu trả, nộp chứng từ
 * `sale_return` nối đơn gốc (originalDocKey). Dùng chung cho POST /returns và phiếu trả của POST /exchanges.
 */
import { Errors, sql, z, type ActionContext } from '@bizcity/module-sdk';
import { loyaltyGiftIndex } from './domain/order.js';
import {
  buyerTaxCodeOf, computeReturn, returnDeadline, returnDocKey, returnableLines, daysSince, taxInvoiceMessage, toSaleReturnDocument,
  type ReturnedSoFar, type SoldLine,
} from './domain/returns.js';
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027: phiếu hoàn theo dạng của cửa hàng ({shop}.B{5 số} hoặc TH…) (đóng góp)
import { issueCodes } from './codes.js';
import { schemeOf } from './domain/codes.js';
import { activePaymentMethods, catalogFor, resolveBranch, todayVn } from './read.js';
import { returnBadWarehouses, returnDays, shopCodes } from './settings.js';
import { isUniqueViolation, lockKey, raise } from './order-service.js';
import { releaseUses } from './promo.js';

type Tx = Parameters<Parameters<ActionContext['data']['module']>[0]>[0];

/** Hạn trả theo ngày bán (họp kế toán 04/11: tham số, hiện 3 ngày). Cùng số với bootstrap.returnPolicy.days. */
/** Mặc định hạn trả khi chưa đặt Cài đặt bán hàng (giữ cho test thuần / gọi không có ctx). */
export const RETURN_DAYS = 3;

export const returnDraftSchema = z.object({
  id: z.string().trim().min(8).max(64),
  orderId: z.string().trim().min(1).max(64),
  /** Chi nhánh nhận trả: module chưa đọc header X-Branch (D-MP-8) nên máy gửi ở thân. */
  branchCode: z.string().trim().min(1).max(32).optional(),
  // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-024 Q3: mỗi dòng trả có tình trạng (mặc định nguyên vẹn) (đóng góp)
  lines: z.array(z.object({
    lineId: z.string().min(1).max(64), qty: z.number().gt(0, 'Số lượng trả phải lớn hơn 0'),
    condition: z.enum(['good', 'bad'], { message: 'Tình trạng hàng trả: good (nguyên vẹn) hoặc bad (lỗi / hết hạn)' }).optional(),
  })).min(1, 'Chưa chọn hàng trả').max(500),
  refundMethod: z.string().trim().min(1).max(32),
  reason: z.string().trim().min(1, 'Thiếu lý do trả hàng').max(500),
  note: z.string().max(1000).optional(),
  approval: z.object({ by: z.string().trim().max(200), note: z.string().trim().max(500) }).optional(),
}).passthrough();
export type ReturnDraft = z.infer<typeof returnDraftSchema>;

export type OrderRow = { order_id: string; code: string; branch_code: string; business_date: string; status: string; customer_code: string | null; doc_key: string; snapshot: Record<string, unknown>; version: number };

/** Đơn theo id hoặc mã phiếu (mã chỉ duy nhất trong một chi nhánh → kèm branch khi tra theo mã). */
export async function findOrder(tx: Tx, idOrCode: string, branch?: string): Promise<OrderRow> {
  const byId = (await sql<OrderRow>`
    SELECT order_id, code, branch_code, business_date::text AS business_date, status, customer_code, doc_key, snapshot, version
      FROM mod_pos.orders WHERE order_id = ${idOrCode}`.execute(tx)).rows[0];
  if (byId) return byId;
  const rows = (await sql<OrderRow>`
    SELECT order_id, code, branch_code, business_date::text AS business_date, status, customer_code, doc_key, snapshot, version
      FROM mod_pos.orders WHERE upper(code) = upper(${idOrCode}) ${branch ? sql`AND branch_code = ${branch}` : sql``} ORDER BY id LIMIT 2`.execute(tx)).rows;
  if (rows.length > 1) throw Errors.validation(`Mã phiếu ${idOrCode} có ở nhiều chi nhánh — gửi kèm branch`, { reason: 'POS_BRANCH_REQUIRED' });
  if (!rows.length) throw Errors.notFound(`đơn ${idOrCode}`);
  return rows[0]!;
}

/** Dòng bán của đơn: bản chụp đơn + dòng đơn đã lưu (mã thuế, định danh). Đơn trước khi có order_lines: mã thuế theo danh mục. */
export async function soldLinesOf(tx: Tx, order: OrderRow): Promise<SoldLine[]> {
  type SnapLine = { lineId: string; sku: string; name?: string; unitName: string; unitQty: number; unitRatio?: number; amount: number; taxAmount: number; taxRate: number; itemId?: string; isGift?: boolean; giftKey?: string; promotionId?: number };
  // Dòng bill Z (NT-BH-019) nằm ở zBill của bản chụp nhưng vẫn là dòng của chứng từ bán: trả được như dòng quà.
  const snap = order.snapshot as { lines?: SnapLine[]; zBill?: { lines?: SnapLine[] } };
  const snapLines = [...(snap.lines ?? []), ...(snap.zBill?.lines ?? [])];
  const zIds = new Set((snap.zBill?.lines ?? []).map((l) => l.lineId));
  const saved = new Map((await sql<{ line_key: string; tax_code: string; item_id: string | null }>`
    SELECT line_key, tax_code, item_id FROM mod_pos.order_lines WHERE order_id = ${order.order_id}`.execute(tx)).rows.map((r) => [r.line_key, r]));
  const missing = snapLines.filter((l) => !saved.has(l.lineId)).map((l) => l.sku);
  const catalog = missing.length ? await catalogFor(tx, missing) : new Map();
  return snapLines.map((l) => {
    const s = saved.get(l.lineId);
    return {
      lineId: l.lineId, sku: l.sku, name: l.name ?? l.sku, unitName: l.unitName, unitRatio: l.unitRatio ?? 1, soldQty: Number(l.unitQty),
      net: Number(l.amount), tax: Number(l.taxAmount), taxRate: Number(l.taxRate),
      taxCode: s?.tax_code ?? catalog.get(l.sku)?.taxCode ?? '', itemId: s?.item_id ?? l.itemId ?? null,
      // [2026-11-15 01:45 PM Võ Hoàng] POS-BILLZ — NT-BH-019 bước 2: dòng bill Z là dòng quà trên chứng từ bán → trả cũng là dòng quà (đóng góp)
      isGift: l.isGift === true || zIds.has(l.lineId), ...(l.promotionId !== undefined ? { promotionId: l.promotionId } : {}),
      // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-024 Q2: quà đổi điểm (giftKey lp:…) không trả được (đóng góp)
      ...(loyaltyGiftIndex(l) !== null ? { loyaltyGift: true } : {}),
    };
  });
}

/** Phần đã trả của từng dòng (cộng các phiếu trả trước). */
export async function returnedOf(tx: Tx, orderId: string): Promise<Map<string, ReturnedSoFar>> {
  const rows = (await sql<{ line_key: string; qty: string; refund: string; net: string }>`
    SELECT line_key, SUM(unit_qty) AS qty, SUM(refund) AS refund, SUM(refund_net) AS net
      FROM mod_pos.return_lines WHERE order_id = ${orderId} GROUP BY line_key`.execute(tx)).rows;
  return new Map(rows.map((r) => [r.line_key, { qty: Number(r.qty), refund: Number(r.refund), net: Number(r.net) }]));
}

/**
 * Kho KTL nhận hàng lỗi của cửa hàng (NT-BH-024 Q3): kho khai ở khoá `bizcity.pos.return_bad_warehouses` phải thuộc cửa hàng, đang
 * dùng và khác kho bán mặc định. Không dùng được → code null, issue nêu lý do (chưa khai thì issue trống).
 */
export async function badWarehouseOf(tx: Tx, map: ReadonlyMap<string, string>, branchCode: string): Promise<{ code: string | null; issue?: string }> {
  const code = map.get(branchCode);
  if (!code) return { code: null };
  const w = (await sql<{ is_active: boolean | null; is_default: boolean | null }>`
    SELECT is_active, is_default FROM bizcity_read.warehouses WHERE branch_code = ${branchCode} AND code = ${code}`.execute(tx)).rows[0];
  if (!w) return { code: null, issue: `kho ${code} không thuộc cửa hàng` };
  if (w.is_active === false) return { code: null, issue: `kho ${code} đã ngừng dùng` };
  if (w.is_default) return { code: null, issue: `kho ${code} là kho bán mặc định` };
  return { code };
}

/** Màn hoàn hàng: phần còn trả được, hạn, lý do không trả được ở cửa hàng này. */
export async function returnableOf(tx: Tx, order: OrderRow, branchCode: string, days = RETURN_DAYS, today = todayVn(), badMap: ReadonlyMap<string, string> = new Map()) {
  const lines = returnableLines(await soldLinesOf(tx, order), await returnedOf(tx, order.order_id));
  const blockers: { code: string; message: string }[] = [];
  if (order.status !== 'completed') blockers.push({ code: 'NOT_COMPLETED', message: 'Đơn chưa hoàn tất / đã huỷ: không trả hàng' });
  if (order.branch_code !== branchCode) blockers.push({ code: 'OTHER_SHOP', message: `Đơn của chi nhánh ${order.branch_code}: đợt này chỉ trả ở cửa hàng đã bán` });
  // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-024: cờ cho máy bán báo sớm — đơn có MST, kho hàng lỗi của cửa hàng (đóng góp)
  const taxCode = buyerTaxCodeOf(order.snapshot);
  if (taxCode) blockers.push({ code: 'TAX_INVOICE', message: taxInvoiceMessage(taxCode) });
  const bad = await badWarehouseOf(tx, badMap, branchCode);
  return {
    order: order.snapshot, lines, warnings: [] as string[], deadline: returnDeadline(order.business_date, days),
    late: daysSince(order.business_date, today) > days, blockers, promoSkus: {} as Record<string, string[]>,
    taxInvoice: taxCode ? { taxCode } : null,
    badWarehouse: bad.code,
  };
}

export type CreatedReturn = { snapshot: Record<string, unknown>; docKey: string; refundTotal: number; branchCode: string; replayed: boolean };

/** Lập phiếu trả: kiểm → cấp mã TH → nộp sale_return → lưu phiếu + dòng. Đổi hàng: tiền hoàn thành đối trừ (không trả tiền). */
export async function createReturn(ctx: ActionContext, draft: ReturnDraft, opts: { exchangeOrderId?: string } = {}): Promise<CreatedReturn> {
  const exchange = opts.exchangeOrderId !== undefined;
  // Hạn trả lấy ở Cài đặt bán hàng (BH17, khoá bizcity.pos.return_days; mặc định 3 ngày).
  const days = await returnDays(ctx);
  // Kho KTL nhận hàng lỗi theo cửa hàng (BH17, khoá bizcity.pos.return_bad_warehouses) — cài đặt đọc ngoài giao dịch của module.
  const badMap = await returnBadWarehouses(ctx);
  const shops = await shopCodes(ctx);
  const prepared = await ctx.data.module(async (tx) => {
    await lockKey(tx, `pos:return:${draft.id}`);
    const old = (await sql<{ snapshot: Record<string, unknown>; same: boolean; doc_key: string; refund_total: string; branch_code: string }>`
      SELECT snapshot, draft = ${JSON.stringify(draft)}::jsonb AS same, doc_key, refund_total, branch_code FROM mod_pos.returns WHERE return_id = ${draft.id}`.execute(tx)).rows[0];
    if (old && !old.same) throw Errors.conflict(`Phiếu trả ${draft.id} đã nhận với nội dung khác — lập phiếu mới`, { reason: 'POS_RETURN_ID_REUSED', returnId: draft.id });
    if (old) return { kind: 'replay', old } as const;

    const branch = await resolveBranch(tx, draft.branchCode);
    const order = await findOrder(tx, draft.orderId);
    // Hai phiếu trả cùng đơn chạy song song: nối tiếp theo đơn để không trả quá số đã bán.
    await lockKey(tx, `pos:order:${order.order_id}`);
    const lines = await soldLinesOf(tx, order);
    const done = await returnedOf(tx, order.order_id);
    const today = todayVn();
    const bad = draft.lines.some((l) => l.condition === 'bad') ? await badWarehouseOf(tx, badMap, branch.code) : { code: null };
    const computed = computeReturn({
      draft, order: { status: order.status, branchCode: order.branch_code, businessDate: order.business_date, buyerTaxCode: buyerTaxCodeOf(order.snapshot) }, lines, done,
      branchCode: branch.code, today, days, paymentMethods: await activePaymentMethods(tx), exchange,
      badWarehouse: bad.code, ...(bad.issue ? { badWarehouseIssue: bad.issue } : {}),
    });
    if ('problem' in computed) raise(computed.problem);
    const code = (await issueCodes(tx, ctx.tenant.id, branch.code, 'return', today, 1, schemeOf(shops, branch.code)))[0]!;
    return { kind: 'new', order, branch, computed, code, today } as const;
  });
  if (prepared.kind === 'replay') {
    return { snapshot: prepared.old.snapshot, docKey: prepared.old.doc_key, refundTotal: Number(prepared.old.refund_total), branchCode: prepared.old.branch_code, replayed: true };
  }

  const { order, branch, computed, code, today } = prepared;
  const customer = (order.snapshot as { customer?: { id: string; name: string; phone: string } }).customer ?? { id: '', name: 'Khách lẻ', phone: '' };
  const doc = toSaleReturnDocument(computed, {
    id: draft.id, branchCode: branch.code, code, businessDate: today, reason: draft.reason, originalDocKey: order.doc_key,
    partner: customer.id ? { code: customer.id, name: customer.name, ...(customer.phone ? { phone: customer.phone } : {}) } : null,
  });
  const submitted = await ctx.ledger.submit(doc);
  const snapshot = {
    id: draft.id, code, orderId: order.order_id, orderCode: order.code, createdAt: new Date().toISOString(), businessDate: today,
    // NT-BH-024: tình trạng + kho nhận của từng dòng (BH14 hiện cột Tình trạng / Kho nhận; nguyên vẹn = kho bán mặc định).
    customer, lines: computed.lines.map((l) => ({
      lineId: l.lineId, sku: l.sku, name: l.name, unitName: l.unitName, unitRatio: l.unitRatio, qty: l.qty, isGift: l.isGift, refund: l.refund,
      condition: l.condition, ...(l.warehouseCode ? { warehouseCode: l.warehouseCode } : {}),
    })),
    refundTotal: computed.refundTotal, refundMethod: draft.refundMethod, reason: draft.reason, ...(draft.note ? { note: draft.note } : {}),
    flags: { promoReview: false, loyaltyReview: false }, warnings: [] as string[],
    ...(computed.late && draft.approval ? { approval: draft.approval } : {}),
    branch: { code: branch.code, name: branch.name, taxCode: branch.taxCode },
    ...(opts.exchangeOrderId ? { exchangeOrderId: opts.exchangeOrderId } : {}),
  };
  let orderFullyReturned = false;
  try {
    orderFullyReturned = await ctx.data.module(async (tx) => {
      await sql`
        INSERT INTO mod_pos.returns (tenant_id, return_id, order_id, branch_code, code, business_date, refund_method, refund_total, refund_net,
                                     refund_tax, reason, approved_by, approval_note, exchange_order_id, doc_key, doc_status, snapshot, draft, created_by, cashier_name)
        VALUES (${ctx.tenant.id}, ${draft.id}, ${order.order_id}, ${branch.code}, ${code}, ${today}, ${draft.refundMethod}, ${computed.refundTotal},
                ${computed.net}, ${computed.tax}, ${draft.reason}, ${computed.late ? draft.approval?.by ?? null : null}, ${computed.late ? draft.approval?.note ?? null : null},
                ${opts.exchangeOrderId ?? null}, ${doc.docKey}, ${submitted.status}, ${JSON.stringify(snapshot)}::jsonb, ${JSON.stringify(draft)}::jsonb, ${ctx.actor.id}, ${ctx.actor.name || null})`.execute(tx);
      for (const l of computed.lines) {
        await sql`
          INSERT INTO mod_pos.return_lines (tenant_id, return_id, order_id, line_key, item_id, sku, unit_qty, refund, refund_net, refund_tax)
          VALUES (${ctx.tenant.id}, ${draft.id}, ${order.order_id}, ${l.lineId}, ${l.itemId}, ${l.sku}, ${l.qty}, ${l.refund}, ${l.refundNet}, ${l.refundTax})`.execute(tx);
      }
      // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: trả cả đơn (mọi dòng bán đã trả hết) → trả lượt khuyến mại của đơn (đóng góp)
      const left = returnableLines(await soldLinesOf(tx, order), await returnedOf(tx, order.order_id));
      const full = left.filter((l) => !l.isGift).every((l) => l.returnableQty <= 0);
      if (full) await releaseUses(tx, 'pos', order.order_id, 'return');
      return full;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw Errors.conflict(`Mã phiếu trả ${code} hoặc phiếu ${draft.id} vừa được máy khác dùng — gửi lại`, { reason: 'POS_CODE_TAKEN', code });
    throw err;
  }
  ctx.evidence.note('pos.return', { code, docKey: doc.docKey, docStatus: submitted.status, refundTotal: computed.refundTotal, orderCode: order.code });
  await ctx.events.emit('pos.return.recorded', {
    returnId: draft.id, code, orderId: order.order_id, orderCode: order.code, branchCode: branch.code, docKey: doc.docKey,
    originalDocKey: order.doc_key, version: 1, cashier: { name: ctx.actor.name }, return: snapshot,
    // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: đơn gốc đã trả hết → module voucher thu hồi voucher lần mua sau chưa dùng (đóng góp)
    orderFullyReturned,
  }, { subject: `pos.return:${draft.id}`, dedupeKey: `pos.return.recorded:${draft.id}` });
  return { snapshot, docKey: doc.docKey, refundTotal: computed.refundTotal, branchCode: branch.code, replayed: false };
}
