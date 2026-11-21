/**
 * Hoàn hàng tại quầy (kế hoạch module POS đợt W2, phiếu NT-BH-005): đọc đơn gốc + phần đã trả, lập phiếu trả, nộp chứng từ
 * `sale_return` nối đơn gốc (originalDocKey). Dùng chung cho POST /returns và phiếu trả của POST /exchanges.
 */
import { Errors, sql, z, type ActionContext } from '@bizcity/module-sdk';
import { loyaltyGiftIndex } from './domain/order.js';
import {
  buyerTaxCodeOf, computeReturn, daysOf, otherShopProblem, returnDeadline, returnDocKey, returnableLines, daysSince, taxInvoiceMessage, toSaleReturnDocument,
  type ReturnedSoFar, type SoldLine,
} from './domain/returns.js';
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027: phiếu hoàn theo dạng của cửa hàng ({shop}.B{5 số} hoặc TH…) (đóng góp)
import { issueCodes } from './codes.js';
import { schemeOf } from './domain/codes.js';
import { activePaymentMethods, branchTaxCodeOf, catalogFor, resolveBranch, sameTaxBranches, todayVn } from './read.js';
import { giftWarehouses, returnBadWarehouses, returnDaysPolicy } from './settings.js';
// [2026-11-21 Võ Hoàng] NGHIEM-THU — NT-BH-035 Q2: quà khách trả về kho quà KKM của cửa hàng nhận (đóng góp)
import { warehousesFor } from './catalog.js';
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-030: trả khác shop cùng MST, quá hạn theo yêu cầu đã duyệt, hạn trả theo shop (đóng góp)
import { approvalsOfOrder, markApprovalUsed, verifyApprovalForReturn } from './return-approval.js';
import type { BranchRow } from './domain/order.js';
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
  /** NT-BH-030 Q2: quá hạn → id yêu cầu trả quá hạn đã được duyệt (thay ô gõ tên người duyệt). Dòng phiếu phải khớp yêu cầu. */
  approvalId: z.string().trim().min(8).max(64).optional(),
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

/**
 * Đơn cho màn hoàn hàng (NT-BH-030 Q1): theo id; theo mã phiếu thì tìm ở cửa hàng đang trả trước, không có thì ở các cửa hàng cùng MST.
 * Cùng mã ở nhiều cửa hàng cùng MST → POS_BRANCH_REQUIRED (tra theo SĐT khách để chọn đúng đơn).
 */
export async function findOrderForReturn(tx: Tx, idOrCode: string, here: string): Promise<OrderRow> {
  const byId = (await sql<OrderRow>`
    SELECT order_id, code, branch_code, business_date::text AS business_date, status, customer_code, doc_key, snapshot, version
      FROM mod_pos.orders WHERE order_id = ${idOrCode}`.execute(tx)).rows[0];
  if (byId) return byId;
  const branches = await sameTaxBranches(tx, here);
  const rows = (await sql<OrderRow>`
    SELECT order_id, code, branch_code, business_date::text AS business_date, status, customer_code, doc_key, snapshot, version
      FROM mod_pos.orders WHERE upper(code) = upper(${idOrCode}) AND branch_code IN (${sql.join(branches)})
     ORDER BY (branch_code = ${here}) DESC, id LIMIT 3`.execute(tx)).rows;
  if (rows[0]?.branch_code === here) return rows[0];
  if (rows.length > 1) throw Errors.validation(`Mã phiếu ${idOrCode} có ở nhiều cửa hàng cùng MST — tra theo SĐT khách để chọn đơn`, { reason: 'POS_BRANCH_REQUIRED' });
  if (!rows.length) throw Errors.notFound(`đơn ${idOrCode} (cửa hàng ${branches.join(', ')})`);
  return rows[0]!;
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

/**
 * Màn hoàn hàng: phần còn trả được, hạn (của cửa hàng nhận), lý do không trả được ở cửa hàng này. NT-BH-030: khác cửa hàng cùng MST
 * trả được (OTHER_SHOP chỉ khi khác / chưa khai MST); `approvals` = yêu cầu trả quá hạn của đơn ở cửa hàng này (mới nhất trước).
 */
export async function returnableOf(tx: Tx, order: OrderRow, here: Pick<BranchRow, 'code' | 'taxCode'>, days = RETURN_DAYS, today = todayVn(), badMap: ReadonlyMap<string, string> = new Map()) {
  const branchCode = here.code;
  const lines = returnableLines(await soldLinesOf(tx, order), await returnedOf(tx, order.order_id));
  const blockers: { code: string; message: string }[] = [];
  if (order.status !== 'completed') blockers.push({ code: 'NOT_COMPLETED', message: 'Đơn chưa hoàn tất / đã huỷ: không trả hàng' });
  const other = otherShopProblem(order.branch_code, order.branch_code === branchCode ? '' : await branchTaxCodeOf(tx, order.branch_code), branchCode, here.taxCode);
  if (other) blockers.push({ code: 'OTHER_SHOP', message: other.message });
  // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-024: cờ cho máy bán báo sớm — đơn có MST, kho hàng lỗi của cửa hàng (đóng góp)
  const taxCode = buyerTaxCodeOf(order.snapshot);
  if (taxCode) blockers.push({ code: 'TAX_INVOICE', message: taxInvoiceMessage(taxCode) });
  const bad = await badWarehouseOf(tx, badMap, branchCode);
  return {
    order: order.snapshot, lines, warnings: [] as string[], deadline: returnDeadline(order.business_date, days),
    late: daysSince(order.business_date, today) > days, blockers, promoSkus: {} as Record<string, string[]>,
    taxInvoice: taxCode ? { taxCode } : null,
    badWarehouse: bad.code,
    days, orderBranchCode: order.branch_code, approvals: await approvalsOfOrder(tx, order.order_id, branchCode),
  };
}

export type CreatedReturn = { snapshot: Record<string, unknown>; docKey: string; refundTotal: number; branchCode: string; replayed: boolean };

/** Lập phiếu trả: kiểm → cấp mã TH → nộp sale_return → lưu phiếu + dòng. Đổi hàng: tiền hoàn thành đối trừ (không trả tiền). */
export async function createReturn(ctx: ActionContext, draft: ReturnDraft, opts: { exchangeOrderId?: string } = {}): Promise<CreatedReturn> {
  const exchange = opts.exchangeOrderId !== undefined;
  // Hạn trả lấy ở Cài đặt bán hàng (BH17, khoá bizcity.pos.return_days; mặc định 3 ngày; NT-BH-030: riêng từng shop, theo shop nhận).
  const policy = await returnDaysPolicy(ctx);
  // Kho KTL nhận hàng lỗi theo cửa hàng (BH17, khoá bizcity.pos.return_bad_warehouses) — cài đặt đọc ngoài giao dịch của module.
  const badMap = await returnBadWarehouses(ctx);
  // NT-BH-035 Q2: kho quà KKM theo cửa hàng (BH17, khoá bizcity.pos.gift_warehouses — cùng khoá máy bán dùng khi bán quà).
  const giftMap = await giftWarehouses(ctx);
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
    const days = daysOf(policy, branch.code);
    const bad = draft.lines.some((l) => l.condition === 'bad') ? await badWarehouseOf(tx, badMap, branch.code) : { code: null };
    // NT-BH-035 Q2: phiếu có dòng quà nguyên vẹn → kho quà của cửa hàng nhận. Chưa khai → như cũ (kho bán). Khai sai → POS_GIFT_WAREHOUSE
    // (như lúc bán quà, NT-BH-028) để kế toán sửa cài đặt, không để quà lặng lẽ về kho bán.
    const goodGift = draft.lines.some((l) => (l.condition ?? 'good') === 'good' && lines.find((x) => x.lineId === l.lineId)?.isGift);
    const whs = goodGift ? await warehousesFor(tx, branch.code, giftMap) : null;
    if (whs?.issue) {
      throw Errors.validation(`Kho quà của cửa hàng ${branch.code} không dùng được: ${whs.issue} — kế toán chọn lại kho khuyến mại (KKM) ở Cài đặt bán hàng (BH17)`,
        { reason: 'POS_GIFT_WAREHOUSE', branchCode: branch.code });
    }
    const orderTax = order.branch_code === branch.code ? branch.taxCode : await branchTaxCodeOf(tx, order.branch_code);
    const computed = computeReturn({
      draft, order: { status: order.status, branchCode: order.branch_code, businessDate: order.business_date, buyerTaxCode: buyerTaxCodeOf(order.snapshot), branchTaxCode: orderTax },
      lines, done, branchCode: branch.code, branchTaxCode: branch.taxCode, today, days, approved: Boolean(draft.approvalId), paymentMethods: await activePaymentMethods(tx), exchange,
      badWarehouse: bad.code, ...(bad.issue ? { badWarehouseIssue: bad.issue } : {}), giftWarehouse: whs?.gift ?? null,
    });
    if ('problem' in computed) raise(computed.problem);
    // NT-BH-030 Q2: quá hạn → yêu cầu trả quá hạn phải đã duyệt, cùng đơn, cùng cửa hàng nhận, đúng dòng / SL / tình trạng.
    const approval = computed.late ? await verifyApprovalForReturn(tx, draft.approvalId!, { orderId: order.order_id, branchCode: branch.code, lines: draft.lines }) : null;
    // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027 (18/11 anh chốt): phiếu hoàn {shop}.B{5 số} mặc định, mã chi nhánh lạ giữ TH (đóng góp)
    const code = (await issueCodes(tx, ctx.tenant.id, branch.code, 'return', today, 1, schemeOf(branch.code)))[0]!;
    return { kind: 'new', order, branch, computed, code, today, approval } as const;
  });
  if (prepared.kind === 'replay') {
    return { snapshot: prepared.old.snapshot, docKey: prepared.old.doc_key, refundTotal: Number(prepared.old.refund_total), branchCode: prepared.old.branch_code, replayed: true };
  }

  const { order, branch, computed, code, today, approval } = prepared;
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
    ...(approval ? { approval: {
      id: approval.approval_id, by: approval.decided_by_name ?? approval.decided_by ?? '', at: approval.decided_at?.toISOString() ?? null, note: approval.decision_note ?? '',
      requestedBy: approval.requested_by_name ?? approval.requested_by,
    } } : {}),
    branch: { code: branch.code, name: branch.name, taxCode: branch.taxCode },
    // NT-BH-030 Q1: trả ở cửa hàng khác cùng MST — cửa hàng bán của đơn gốc.
    ...(order.branch_code !== branch.code ? { orderBranchCode: order.branch_code } : {}),
    ...(opts.exchangeOrderId ? { exchangeOrderId: opts.exchangeOrderId } : {}),
  };
  let orderFullyReturned = false;
  try {
    orderFullyReturned = await ctx.data.module(async (tx) => {
      await sql`
        INSERT INTO mod_pos.returns (tenant_id, return_id, order_id, branch_code, code, business_date, refund_method, refund_total, refund_net,
                                     refund_tax, reason, approved_by, approval_note, exchange_order_id, doc_key, doc_status, snapshot, draft, created_by, cashier_name)
        VALUES (${ctx.tenant.id}, ${draft.id}, ${order.order_id}, ${branch.code}, ${code}, ${today}, ${draft.refundMethod}, ${computed.refundTotal},
                ${computed.net}, ${computed.tax}, ${draft.reason}, ${approval ? approval.decided_by_name ?? approval.decided_by : null}, ${approval ? approval.decision_note ?? approval.reason : null},
                ${opts.exchangeOrderId ?? null}, ${doc.docKey}, ${submitted.status}, ${JSON.stringify(snapshot)}::jsonb, ${JSON.stringify(draft)}::jsonb, ${ctx.actor.id}, ${ctx.actor.name || null})`.execute(tx);
      for (const l of computed.lines) {
        await sql`
          INSERT INTO mod_pos.return_lines (tenant_id, return_id, order_id, line_key, item_id, sku, unit_qty, refund, refund_net, refund_tax)
          VALUES (${ctx.tenant.id}, ${draft.id}, ${order.order_id}, ${l.lineId}, ${l.itemId}, ${l.sku}, ${l.qty}, ${l.refund}, ${l.refundNet}, ${l.refundTax})`.execute(tx);
      }
      if (approval) await markApprovalUsed(tx, ctx, approval.approval_id, draft.id, code);
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
