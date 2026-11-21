/**
 * Nghiệp vụ đơn đặt hàng (phiếu NT-BH-023, chốt 17/11/2026). Mọi action ghi chạy trong MỘT giao dịch của runtime: phần dữ liệu module
 * (ctx.data.module) và chứng từ giữ hàng nộp sổ (ctx.ledger.submit) cùng commit hoặc cùng huỷ.
 *
 *   Nháp (= báo giá có hạn, in được) ──Gửi──► kiểm hạn mức + nợ quá hạn ──vướng──► Chờ duyệt ──Duyệt (KTT / chủ, không tự duyệt)──┐
 *                                                    └──không vướng──► Đã gửi (open) ◄───────────────────────────────────────────┘
 *   Đã gửi: giữ hàng = chứng từ chuyển kho cùng chi nhánh từ kho bán sang kho KCB (cấu hình bizcity.phieu_ban.hold_warehouses);
 *           sửa số lượng → chuyển bù; Giao (nhiều lần, ≤ số còn lại, khoá theo đơn) → phiếu bán BH10 NHÁP xuất từ kho KCB nối số đơn;
 *           giao đủ → Đã đóng; bấm Đóng → trả phần còn giữ về kho bán; Huỷ chỉ khi chưa giao gì.
 *   Phiếu bán nháp sinh từ đơn bị xoá → trả lại số đã giao (hàng vẫn ở KCB nên giữ lại cho đơn; đơn đã đóng tay thì chuyển về kho bán).
 *   Lịch sử: mọi lần lập / sửa / gửi / duyệt / từ chối / giữ / giao / đóng / huỷ ghi order_events (người, lúc, cũ → mới).
 *
 * NT-BH-032 (chốt 18/11/2026) — giao hàng hai bước qua kho KHG "Kho hàng gửi bán" (cấu hình bizcity.phieu_ban.ship_warehouses):
 *   Chuyến giao: Chờ lấy hàng (giữ chỗ số lượng, hàng còn ở KCB) ──Đi giao──► Đang giao (chuyển kho KCB → KHG, chưa doanh thu)
 *     ──Đã giao──► phiếu bán BH10 NHÁP xuất từ KHG (+ dòng phí ship = mã dịch vụ bizcity.phieu_ban.ship_fee_sku, + thanh toán COD theo
 *                  hình thức bizcity.phieu_ban.cod_methods của hãng) — kế toán duyệt → doanh thu + giá vốn + phải thu hãng
 *     ──Hoàn────► chuyển kho KHG → KCB, hàng giữ lại cho đơn (đơn vẫn mở). Chờ lấy → Hoàn: chỉ trả chỗ, không chứng từ.
 *   Đóng / huỷ đơn còn chuyến Chờ lấy / Đang giao → chặn (PHIEU_BAN_ORDER_STATE): cập nhật Đã giao / Hoàn trước.
 *   "Giao" cũ (deliverOrder) giữ nguyên = giao tại quầy (khách nhận ngay): phiếu bán nháp xuất thẳng từ KCB.
 *   Copy đơn: đơn → đơn mới nháp; phiếu BH10 đã duyệt / đơn máy bán (action đọc pos.order.lines) → đơn mới; giá + khuyến mại tính lại.
 */
// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: nghiệp vụ đơn đặt hàng (đóng góp)
import { randomUUID } from 'node:crypto';
import { Errors, roundMoney, type ActionContext } from '@bizcity/module-sdk';
import { computeDoc, type DocInput, type Kind } from './domain/doc.js';
import {
  anyDelivered, anyShipping, applyDelivery, creditReasons, debtOf, deliveryLines, diffOrder, duplicatesOf, expired, feeBeforeTax, fullyDelivered, mergeProgress,
  normPhone, normShipping, parseCarrierMap, parseHoldMap, r4, rebalanceHolds, reserveShipment, returnDelivery, shipmentDelivered, shipmentReturned, toHoldDoc,
  undeliveredValue, SELF_CARRIER, SHIPMENT_LABEL, SHIPMENT_NEXT,
  type Change, type Move, type OrderBody, type OrderInput, type OrderLine, type OrderStatus, type Shipping, type ShipmentStatus, type Short,
} from './domain/order.js';
import {
  addEvent, branchPriceRatios, branchPrices, getOrder, getShipment, insertOrder, insertShipment, listOrders, livestreamByPhone, lockedWarehouseStock, openOrdersOf,
  orderByNo, orderEvents, partnerByPhone, partnerTerms, shipmentByDoc, shipmentsOf, shippingOf, takeOrderNo, toOrder, toShipment, updateOrder, updateShipment,
  warehousesOf, writeOf, type OrderFilter, type OrderRow, type ShipLog,
} from './order-store.js';
import { giftWarehouseOf, saveDraftIn, withChannel } from './service.js';
import { activeMethods, branchExists, catalogFor, deleteDoc, getDoc, partnerByCode, saleByNo, serviceSkus, taxRates, type Tx } from './store.js';

export const HOLD_WAREHOUSES = 'bizcity.phieu_ban.hold_warehouses';
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-032: khoá cấu hình giao hàng (chọn ở BH17) (đóng góp)
export const SHIP_WAREHOUSES = 'bizcity.phieu_ban.ship_warehouses';
export const SHIP_FEE_SKU = 'bizcity.phieu_ban.ship_fee_sku';
export const COD_METHODS = 'bizcity.phieu_ban.cod_methods';
/** Khoá dòng phí ship trên phiếu bán của chuyến giao. */
export const SHIP_LINE_KEY = 'SHIP';
export const APPROVE_PERMISSION = 'phieu-ban:order-approve';

const fail = (problems: string[]): never => { throw Errors.validation(problems.join(' · '), { items: problems }); };
const stateError = (r: Pick<OrderRow, 'order_no' | 'status'>, want: string) =>
  Errors.conflict(`Đơn ${r.order_no} đang ở trạng thái "${STATUS_LABEL[r.status]}" — ${want}`, { reason: 'PHIEU_BAN_ORDER_STATE', status: r.status });
export const STATUS_LABEL: Record<OrderStatus, string> = { draft: 'Nháp', pending: 'Chờ duyệt', open: 'Đã gửi', closed: 'Đã đóng', cancelled: 'Đã huỷ' };

/** Ngày hôm nay theo giờ Việt Nam (YYYY-MM-DD). */
export const vnToday = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const NEED_PARTNER = 'Phiếu còn ghi nợ (thu chưa đủ) phải chọn khách hàng';

/** Kiểm + tính đơn ở máy chủ (cùng bộ tính phiếu bán BH10): kho bán, giá theo cửa hàng khi dòng để trống, thuế, khuyến mại. */
async function prepareOrder(tx: Tx, input: OrderInput) {
  if (!(await branchExists(tx, input.branchCode))) fail([`Cửa hàng ${input.branchCode} không có / ngừng dùng`]);
  const wh = await warehousesOf(tx, input.branchCode);
  const warehouseCode = input.warehouseCode || wh.def;
  const problems: string[] = [];
  if (!warehouseCode) problems.push(`Cửa hàng ${input.branchCode} chưa có kho mặc định — chọn kho bán`);
  else if (!wh.active.some((w) => w.code === warehouseCode)) problems.push(`Kho ${warehouseCode} không thuộc cửa hàng ${input.branchCode} hoặc đã ngừng dùng`);
  if (input.validUntil && input.validUntil < input.orderDate) problems.push('Hạn hiệu lực trước ngày đơn');
  const phone = normPhone(input.customer?.phone) || null;
  if (!input.partner?.code && !input.customer?.name && !phone) problems.push('Đơn chưa có khách: chọn mã khách hoặc nhập tên / số điện thoại người đặt');
  const prices = await branchPrices(tx, input.branchCode, input.lines.filter((l) => l.unitPrice === undefined && !l.isGift).map((l) => l.sku));
  const lines = input.lines.map((l) => (l.unitPrice === undefined && !l.isGift ? { ...l, unitPrice: prices.get(l.sku) ?? 0 } : l));
  const catalog = await catalogFor(tx, lines.map((l) => l.sku));
  const partner = input.partner?.code ? await partnerByCode(tx, input.partner.code) : null;
  const doc: DocInput = { docDate: input.orderDate, branchCode: input.branchCode, lines, payments: [], policyRefs: input.policyRefs, note: input.note,
    ...(input.partner?.code ? { partner: { code: input.partner.code } } : {}) } as DocInput;
  const c = computeDoc(doc, { catalog, taxRates: await taxRates(tx), methods: await activeMethods(tx), partner });
  problems.push(...c.problems.filter((p) => p !== NEED_PARTNER));
  if (problems.length) fail(problems);
  const customer = input.customer?.name || phone ? { ...(input.customer?.name ? { name: input.customer.name } : {}), ...(phone ? { phone } : {}) } : undefined;
  return {
    warehouseCode, phone, partnerCode: c.body.partner?.code ?? null, lines: c.body.lines, shipping: normShipping(input.shipping),
    head: { partner: c.body.partner, customer, totals: c.body.totals, note: c.body.note, policyRefs: c.body.policyRefs },
  };
}

const bodyOf = (p: Awaited<ReturnType<typeof prepareOrder>>, lines: OrderLine[], deliveries: OrderBody['deliveries'], copiedFrom?: OrderBody['copiedFrom']): OrderBody => ({
  ...(p.head.partner ? { partner: p.head.partner } : {}), ...(p.head.customer ? { customer: p.head.customer } : {}),
  lines, totals: p.head.totals, ...(p.head.note ? { note: p.head.note } : {}), ...(p.head.policyRefs?.length ? { policyRefs: p.head.policyRefs } : {}), deliveries,
  ...(copiedFrom ? { copiedFrom } : {}),
});

const headOf = (r: { partner_code: string | null; valid_until: string | null; warehouse_code: string; branch_code: string; order_date: string; phone: string | null; body: OrderBody }) => ({
  partner: r.partner_code, validUntil: r.valid_until, warehouse: r.warehouse_code, branch: r.branch_code, orderDate: r.order_date, phone: r.phone, note: r.body.note ?? null,
});

function ev(tx: Tx, ctx: ActionContext, orderId: string, action: string, changes: Change[] = [], note?: string | null) {
  return addEvent(tx, { tenantId: ctx.tenant.id, orderId, actor: ctx.actor.id, actorName: ctx.actor.name, action, changes, note });
}

const moveChanges = (moves: readonly Move[], field: string): Change[] => moves.map((m) => ({ field: `${field} ${m.sku}`, from: null, to: m.qty }));

type HoldDoc = ReturnType<typeof toHoldDoc>;
/** Nộp các chứng từ giữ / trả hàng (sau phần dữ liệu module, cùng giao dịch). Chế độ ghi sổ "chờ duyệt" của loại chuyển kho → chờ ở ACC14. */
async function submitHolds(ctx: ActionContext, docs: readonly HoldDoc[]) {
  const out: { docKey: string; docNo: string; status: string }[] = [];
  for (const d of docs) {
    if (!d.lines.length) continue;
    const r = await ctx.ledger.submit(d);
    out.push({ docKey: d.docKey, docNo: d.docNo, status: r.status });
  }
  if (out.length) ctx.meta('holdDocs', out);
  return out;
}

/** Chứng từ giữ / trả từ kết quả cân giữ hàng; tăng số lần (hold_seq). */
function holdDocsOf(r: OrderRow, holdWh: string, plan: { hold: Move[]; release: Move[] }, seq: number) {
  const docs: HoldDoc[] = [];
  const date = vnToday();
  if (plan.release.length) docs.push(toHoldDoc({ orderId: r.order_id, orderNo: r.order_no, seq: ++seq, branchCode: r.branch_code, docDate: date, from: holdWh, to: r.warehouse_code, moves: plan.release, release: true }));
  if (plan.hold.length) docs.push(toHoldDoc({ orderId: r.order_id, orderNo: r.order_no, seq: ++seq, branchCode: r.branch_code, docDate: date, from: r.warehouse_code, to: holdWh, moves: plan.hold, release: false }));
  return { docs, seq };
}

async function stockFor(tx: Tx, r: Pick<OrderRow, 'branch_code' | 'warehouse_code'>, skus: readonly string[]) {
  const wh = await warehousesOf(tx, r.branch_code);
  return lockedWarehouseStock(tx, r.branch_code, r.warehouse_code, r.warehouse_code === wh.def, skus);
}

/** Kho KCB giữ hàng của cửa hàng (cấu hình). Chưa khai → PHIEU_BAN_NO_HOLD_WAREHOUSE. */
async function holdWarehouseOf(tx: Tx, r: Pick<OrderRow, 'branch_code' | 'warehouse_code' | 'hold_warehouse_code'>, map: Map<string, string>): Promise<string> {
  const code = r.hold_warehouse_code || map.get(r.branch_code);
  const wh = await warehousesOf(tx, r.branch_code);
  if (!code || !wh.active.some((w) => w.code === code) || code === r.warehouse_code) {
    throw Errors.validation(`Cửa hàng ${r.branch_code} chưa có kho loại KCB (hàng chờ bán) để giữ hàng — khai ở danh mục kho rồi chọn ở thẻ "Cài đặt" của màn Đơn đặt hàng${code ? ` (kho ${code} không dùng được: không thuộc cửa hàng, đã ngừng hoặc trùng kho bán)` : ''}`,
      { reason: 'PHIEU_BAN_NO_HOLD_WAREHOUSE', branchCode: r.branch_code });
  }
  return code;
}

async function holdMapOf(ctx: ActionContext) {
  // Cài đặt đọc ngoài giao dịch của module (vai trò module không đọc bảng cấu hình của Core).
  return parseHoldMap(await ctx.settings.get<unknown>(HOLD_WAREHOUSES));
}

// ------------------------------------------------------------------ đọc

export async function listOrdersOf(ctx: ActionContext, f: OrderFilter) {
  return ctx.data.module(async (tx) => {
    const r = await listOrders(tx, f);
    ctx.meta('total', r.total);
    ctx.meta('page', f.page);
    ctx.meta('pageSize', f.pageSize);
    return r.rows.map(toOrder);
  });
}

export async function orderDetail(ctx: ActionContext, id: string) {
  // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-032: chi tiết đơn kèm các chuyến giao (đóng góp)
  return ctx.data.module(async (tx) => ({ ...toOrder(await getOrder(tx, id)), shipments: (await shipmentsOf(tx, id)).map(toShipment) }));
}

export async function orderHistory(ctx: ActionContext, id: string) {
  return ctx.data.module(async (tx) => {
    const r = await getOrder(tx, id);
    return { orderNo: r.order_no, events: await orderEvents(tx, id) };
  });
}

/** Cấu hình kho giữ hàng + kho của các cửa hàng (cho thẻ Cài đặt của màn). */
export async function holdSettings(ctx: ActionContext) {
  const map = await holdMapOf(ctx);
  // NT-BH-032: kèm cấu hình giao hàng (kho KHG, mã phí ship, hình thức COD theo hãng — chọn ở BH17).
  return { key: HOLD_WAREHOUSES, holdWarehouses: Object.fromEntries(map), ship: await shipSettings(ctx) };
}

// ------------------------------------------------------------------ lập / sửa / gộp

export type DupMode = { onDuplicate: 'ask' | 'keep' | 'merge'; mergeInto?: string; copiedFrom?: OrderBody['copiedFrom'] };

/** Lập đơn nháp. Đơn livestream cùng SĐT + cùng mã trong 24 giờ: ask → trả `duplicates` (không lập); keep → lập riêng; merge → gộp vào đơn cũ. */
export async function createOrder(ctx: ActionContext, input: OrderInput, dup: DupMode = { onDuplicate: 'ask' }) {
  const r = await ctx.data.module(async (tx) => {
    const p = await prepareOrder(tx, input);
    if (input.source === 'livestream' && p.phone && dup.onDuplicate !== 'keep') {
      const d = duplicatesOf(await livestreamByPhone(tx, p.phone), p.lines.map((l) => l.sku), new Date());
      if (dup.onDuplicate === 'merge' && (dup.mergeInto || d[0])) return { kind: 'merge' as const, target: dup.mergeInto ?? d[0]!.orderId };
      if (d.length && dup.onDuplicate === 'ask') return { kind: 'dup' as const, duplicates: d };
    }
    const id = randomUUID();
    const no = await takeOrderNo(tx, ctx.tenant.id, input.branchCode, input.orderDate);
    const lines: OrderLine[] = p.lines.map((l) => ({ ...l, delivered: 0, held: 0 }));
    await insertOrder(tx, id, ctx.tenant.id, no, {
      branchCode: input.branchCode, warehouseCode: p.warehouseCode, orderDate: input.orderDate, validUntil: input.validUntil ?? null, status: 'draft',
      source: input.source, partnerCode: p.partnerCode, phone: p.phone, body: bodyOf(p, lines, [], dup.copiedFrom), actor: ctx.actor.id,
      shipping: p.shipping, copiedFrom: dup.copiedFrom ? `${dup.copiedFrom.kind}:${dup.copiedFrom.no}` : null,
    });
    await ev(tx, ctx, id, dup.copiedFrom ? 'copy' : 'create', [], dup.copiedFrom ? `Copy từ ${dup.copiedFrom.no}` : input.source === 'livestream' ? 'Đơn livestream' : null);
    return { kind: 'created' as const, order: toOrder(await getOrder(tx, id)) };
  });
  if (r.kind === 'dup') return { created: false, duplicates: r.duplicates };
  if (r.kind === 'merge') return { created: false, merged: true, order: await mergeInto(ctx, r.target, input) };
  return { created: true, order: r.order };
}

/** Gộp dòng của đơn mới vào đơn cũ (cùng mã, cùng giá → cộng số lượng; khác → thêm dòng). Đơn cũ phải còn Nháp / Chờ duyệt / Đã gửi. */
async function mergeInto(ctx: ActionContext, targetId: string, add: OrderInput) {
  const t = await ctx.data.module(async (tx) => getOrder(tx, targetId));
  if (!['draft', 'pending', 'open'].includes(t.status)) throw stateError(t, 'không gộp thêm được');
  const lines = t.body.lines.map((l) => ({
    lineKey: l.lineKey, sku: l.sku, qty: l.qty, unitPrice: l.unitPrice, discount: l.discount, taxCode: l.taxCode, ...(l.isGift ? { isGift: true } : {}),
    ...(l.policyRef ? { policyRef: l.policyRef } : {}),
  }));
  let n = lines.length;
  for (const a of add.lines) {
    const same = lines.find((l) => l.sku === a.sku && !l.isGift && !a.isGift && !l.policyRef && (a.unitPrice === undefined || a.unitPrice === l.unitPrice));
    if (same) { same.qty = r4(same.qty + a.qty); same.discount = (same.discount ?? 0) + (a.discount ?? 0); continue; }
    while (lines.some((l) => l.lineKey === `L${n + 1}`)) n++;
    lines.push({ ...a, lineKey: `L${++n}` } as never);
  }
  const input: OrderInput = {
    orderDate: t.order_date, branchCode: t.branch_code, warehouseCode: t.warehouse_code, validUntil: t.valid_until ?? undefined, source: t.source,
    ...(t.partner_code ? { partner: { code: t.partner_code } } : {}), ...(t.body.customer ? { customer: t.body.customer } : {}),
    lines: lines as OrderInput['lines'], note: t.body.note, policyRefs: t.body.policyRefs, shipping: shippingOf(t) ?? undefined,
  };
  return updateOrderFlow(ctx, targetId, input, 'merge');
}

/** Sửa đơn (Nháp / Chờ duyệt / Đã gửi). Chờ duyệt sửa → về Nháp (gửi lại). Đã gửi: không đổi cửa hàng / kho / khách; số lượng đổi → chuyển bù. */
export async function updateOrderFlow(ctx: ActionContext, id: string, input: OrderInput, action: 'update' | 'merge' = 'update') {
  const plan = await ctx.data.module(async (tx) => {
    const cur = await getOrder(tx, id, true);
    if (!['draft', 'pending', 'open'].includes(cur.status)) throw stateError(cur, 'không sửa được');
    const p = await prepareOrder(tx, { ...input, source: cur.source });
    if (cur.status === 'open') {
      const bad: string[] = [];
      if (input.branchCode !== cur.branch_code) bad.push('cửa hàng');
      if (p.warehouseCode !== cur.warehouse_code) bad.push('kho bán');
      if (p.partnerCode !== cur.partner_code) bad.push('khách');
      if (bad.length) fail([`Đơn đã gửi (đang giữ hàng) — không đổi ${bad.join(', ')}; đóng đơn rồi lập đơn mới`]);
    }
    const m = mergeProgress(cur.body.lines, p.lines);
    if (m.problems.length) fail(m.problems);
    let lines = m.lines;
    let docs: HoldDoc[] = [];
    let seq = cur.hold_seq;
    let short: Short[] = [];
    const extra: Change[] = [];
    if (cur.status === 'open') {
      const holdWh = cur.hold_warehouse_code!;
      // [2026-11-21 Võ Hoàng] NGHIEM-THU — NT-BH-035: dòng dịch vụ không giữ hàng / không báo thiếu tồn (đóng góp)
      const skip = await serviceSkus(tx, lines.map((l) => l.sku), input.orderDate);
      const rb = rebalanceHolds(lines, await stockFor(tx, cur, [...lines, ...m.removed].map((l) => l.sku)), { removed: m.removed, skip });
      lines = rb.lines;
      short = rb.short;
      ({ docs, seq } = holdDocsOf(cur, holdWh, rb, seq));
      extra.push(...moveChanges(rb.hold, 'held+'), ...moveChanges(rb.release, 'held-'));
    }
    const body = bodyOf(p, lines, cur.body.deliveries, cur.body.copiedFrom);
    const status: OrderStatus = cur.status === 'pending' ? 'draft' : cur.status;
    await updateOrder(tx, id, {
      branchCode: input.branchCode, warehouseCode: p.warehouseCode, orderDate: input.orderDate, validUntil: input.validUntil ?? null, status, source: cur.source,
      partnerCode: p.partnerCode, phone: p.phone, body, holdSeq: seq, ...(status !== cur.status ? { pendingReasons: null } : {}), actor: ctx.actor.id,
      shipping: p.shipping,
    });
    const changes = diffOrder({ head: headOf(cur), lines: cur.body.lines }, { head: headOf({ ...cur, partner_code: p.partnerCode, valid_until: input.validUntil ?? null,
      warehouse_code: p.warehouseCode, branch_code: input.branchCode, order_date: input.orderDate, phone: p.phone, body }), lines });
    // NT-BH-032: thông tin giao đổi → ghi lịch sử từng ô.
    const before = shippingOf(cur);
    for (const f of ['receiver', 'phone', 'address', 'fee', 'carrier', 'trackingNo', 'cod'] as const) {
      const x = before?.[f] ?? (f === 'fee' || f === 'cod' ? 0 : null);
      const y = p.shipping?.[f] ?? (f === 'fee' || f === 'cod' ? 0 : null);
      if (x !== y) changes.push({ field: `shipping ${f}`, from: x, to: y });
    }
    await ev(tx, ctx, id, action, [...changes, ...extra], status !== cur.status ? 'Sửa đơn chờ duyệt — đơn về Nháp, gửi lại để kiểm hạn mức' : null);
    return { docs, short };
  });
  await submitHolds(ctx, plan.docs);
  if (plan.short.length) ctx.meta('stockShort', plan.short);
  return orderDetail(ctx, id);
}

// ------------------------------------------------------------------ gửi / duyệt / từ chối

/** Gửi: hạn hiệu lực, kho KCB, hạn mức + nợ quá hạn của khách → Chờ duyệt (kèm lý do) hoặc Đã gửi (giữ hàng). */
export async function sendOrder(ctx: ActionContext, id: string) {
  const map = await holdMapOf(ctx);
  const today = vnToday();
  const pre = await ctx.data.module(async (tx) => {
    const r = await getOrder(tx, id, true);
    if (r.status !== 'draft') throw stateError(r, 'chỉ gửi được đơn nháp');
    if (expired(r.valid_until, today)) {
      throw Errors.validation(`Đơn ${r.order_no} đã hết hạn hiệu lực (${r.valid_until}) — gia hạn (sửa hạn hiệu lực) hoặc lập đơn mới`, { reason: 'PHIEU_BAN_ORDER_EXPIRED', validUntil: r.valid_until });
    }
    const holdWh = await holdWarehouseOf(tx, r, map);
    const terms = r.partner_code ? await partnerTerms(tx, r.partner_code) : null;
    const openOthers = r.partner_code ? roundSum((await openOrdersOf(tx, r.partner_code, id)).map((o) => undeliveredValue(o.body))) : 0;
    return { r, holdWh, terms, openOthers };
  });
  let reasons: string[] = [];
  if (pre.terms && pre.r.partner_code) {
    try {
      const bal = await ctx.actions.call<{ rows?: { partnerCode?: string; debit?: number; closingDebit?: number; closingCredit?: number }[] }>(
        'accounting.debts.partner-balances', { from: addDays(today, -(pre.terms.termDays - 1)), to: today, hideZero: false });
      const d = debtOf(bal.rows ?? [], pre.r.partner_code);
      reasons = creditReasons({ limit: pre.terms.creditLimit, debt: d.debt, openOthers: pre.openOthers, thisOrder: undeliveredValue(pre.r.body), overdue: d.overdue, termDays: pre.terms.termDays });
    } catch (e) {
      // Không đọc được công nợ (vd người gửi không có quyền xem báo cáo): không đoán là "không nợ" — chuyển duyệt.
      reasons = [`Không đọc được công nợ của khách (${(e as Error).message}) — cần kế toán trưởng / chủ đơn vị duyệt`];
    }
  }
  if (reasons.length) {
    await ctx.data.module(async (tx) => {
      const r = await getOrder(tx, id, true);
      await updateOrder(tx, id, { ...writeOf(r, ctx.actor.id), status: 'pending', pendingReasons: reasons });
      await ev(tx, ctx, id, 'send', [{ field: 'status', from: 'draft', to: 'pending' }], reasons.join(' · '));
    });
    return orderDetail(ctx, id);
  }
  return goOpen(ctx, id, pre.holdWh, 'send');
}

const roundSum = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100;

/** Vào Đã gửi: giữ hàng (chuyển kho bán → KCB số còn lại), ghi lịch sử. */
async function goOpen(ctx: ActionContext, id: string, holdWh: string, action: 'send' | 'approve', note?: string) {
  const plan = await ctx.data.module(async (tx) => {
    const r = await getOrder(tx, id, true);
    // [2026-11-21 Võ Hoàng] NGHIEM-THU — NT-BH-035: dòng dịch vụ không giữ hàng / không báo thiếu tồn (đóng góp)
    const skip = await serviceSkus(tx, r.body.lines.map((l) => l.sku), vnToday());
    const rb = rebalanceHolds(r.body.lines, await stockFor(tx, r, r.body.lines.map((l) => l.sku)), { skip });
    const { docs, seq } = holdDocsOf({ ...r, hold_warehouse_code: holdWh }, holdWh, rb, r.hold_seq);
    await updateOrder(tx, id, {
      ...writeOf(r, ctx.actor.id), status: 'open', body: { ...r.body, lines: rb.lines }, holdWarehouseCode: holdWh, holdSeq: seq, pendingReasons: null,
      ...(action === 'approve' ? { approvedBy: ctx.actor.id } : {}),
    });
    await ev(tx, ctx, id, action, [{ field: 'status', from: r.status, to: 'open' }], note ?? null);
    if (rb.hold.length) await ev(tx, ctx, id, 'hold', moveChanges(rb.hold, 'held+'), `${r.warehouse_code} → ${holdWh}`);
    return { docs, short: rb.short };
  });
  await submitHolds(ctx, plan.docs);
  if (plan.short.length) ctx.meta('stockShort', plan.short);
  return orderDetail(ctx, id);
}

/** Duyệt đơn chờ duyệt (quyền phieu-ban:order-approve — kế toán trưởng / chủ đơn vị; người lập không tự duyệt). */
export async function approveOrder(ctx: ActionContext, id: string, note: string) {
  const map = await holdMapOf(ctx);
  const holdWh = await ctx.data.module(async (tx) => {
    const r = await getOrder(tx, id, true);
    if (r.status !== 'pending') throw stateError(r, 'chỉ duyệt đơn chờ duyệt');
    if (r.created_by === ctx.actor.id) throw Errors.forbidden(`Người lập đơn ${r.order_no} không tự duyệt — nhờ kế toán trưởng / chủ đơn vị khác duyệt`);
    return holdWarehouseOf(tx, r, map);
  });
  return goOpen(ctx, id, holdWh, 'approve', note);
}

/** Từ chối đơn chờ duyệt: về Nháp, ghi lý do. */
export async function rejectOrder(ctx: ActionContext, id: string, note: string) {
  await ctx.data.module(async (tx) => {
    const r = await getOrder(tx, id, true);
    if (r.status !== 'pending') throw stateError(r, 'chỉ từ chối đơn chờ duyệt');
    if (r.created_by === ctx.actor.id) throw Errors.forbidden(`Người lập đơn ${r.order_no} không tự từ chối / duyệt`);
    await updateOrder(tx, id, { ...writeOf(r, ctx.actor.id), status: 'draft', body: { ...r.body, rejection: { by: ctx.actor.name, at: new Date().toISOString(), note } } });
    await ev(tx, ctx, id, 'reject', [{ field: 'status', from: 'pending', to: 'draft' }], note);
  });
  return orderDetail(ctx, id);
}

// ------------------------------------------------------------------ giao / đóng / huỷ

const shippingOpen = (r: Pick<OrderRow, 'order_no' | 'status'>) => Errors.conflict(
  `Đơn ${r.order_no} còn chuyến giao Chờ lấy hàng / Đang giao — cập nhật chuyến Đã giao hoặc Hoàn trước khi đóng / huỷ đơn`,
  { reason: 'PHIEU_BAN_ORDER_STATE', status: r.status, cause: 'shipping' });

/** Giao một lần: số ≤ còn lại (khoá theo đơn) → phiếu bán BH10 nháp xuất từ kho KCB, nối số đơn; giao đủ → Đã đóng. */
export async function deliverOrder(ctx: ActionContext, id: string, input: { docDate?: string; lines: { lineKey: string; qty: number }[] }) {
  return ctx.data.module(async (tx) => {
    const r = await getOrder(tx, id, true);
    if (r.status !== 'open') throw stateError(r, 'chỉ giao đơn đã gửi / đã duyệt');
    if (!r.partner_code) fail([`Đơn ${r.order_no} chưa có mã khách — sửa đơn chọn khách trước khi giao`]);
    const a = applyDelivery(r.body.lines, input.lines);
    if (a.problems.length) fail(a.problems);
    if (a.over.length) {
      throw Errors.validation(`Giao vượt số còn lại của đơn ${r.order_no}: ${a.over.map((o) => `${o.sku} giao ${o.qty}, còn ${o.remaining}`).join('; ')}`,
        { reason: 'PHIEU_BAN_OVER_REMAINING', items: a.over });
    }
    const before = new Map(r.body.lines.map((l) => [l.lineKey, l.delivered]));
    const used = new Set(r.body.lines.filter((l) => a.delivered.some((d) => d.lineKey === l.lineKey)).map((l) => l.policyRef?.key).filter(Boolean));
    const sale = {
      docDate: input.docDate || vnToday(), branchCode: r.branch_code, warehouseCode: r.hold_warehouse_code ?? r.warehouse_code, partner: { code: r.partner_code },
      lines: deliveryLines(r.body.lines, a.delivered, before), payments: [], note: `Giao theo đơn đặt hàng ${r.order_no}`,
      ...(r.body.policyRefs?.some((p) => used.has(p.key)) ? { policyRefs: r.body.policyRefs.filter((p) => used.has(p.key)) } : {}),
    } as DocInput;
    const doc = await saveDraftIn(tx, ctx, 'sale', sale, undefined, { order: { id: r.order_id, no: r.order_no } });
    const done = fullyDelivered(a.lines);
    const deliveries = [...r.body.deliveries, { docId: doc.id, docNo: doc.docNo, at: new Date().toISOString(), by: ctx.actor.name, lines: a.delivered }];
    await updateOrder(tx, id, { ...writeOf(r, ctx.actor.id), status: done ? 'closed' : 'open', body: { ...r.body, lines: a.lines, deliveries }, ...(done ? { closeReason: 'delivered' } : {}) });
    await ev(tx, ctx, id, 'deliver', a.delivered.map((d) => ({ field: `delivered ${d.sku}`, from: before.get(d.lineKey) ?? 0, to: r4((before.get(d.lineKey) ?? 0) + d.qty) })), `Phiếu bán nháp ${doc.docNo}`);
    if (done) await ev(tx, ctx, id, 'close', [{ field: 'status', from: 'open', to: 'closed' }], 'Giao đủ');
    return { order: toOrder(await getOrder(tx, id)), doc };
  });
}

/** Đóng đơn đang mở: phần chưa giao thôi giữ — chuyển từ KCB về kho bán. */
export async function closeOrder(ctx: ActionContext, id: string, note: string) {
  const plan = await ctx.data.module(async (tx) => {
    const r = await getOrder(tx, id, true);
    if (r.status !== 'open') throw stateError(r, 'chỉ đóng đơn đã gửi');
    // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-032: còn chuyến giao chưa xong (hàng ở KCB chờ lấy / ở KHG) → chặn (đóng góp)
    if (anyShipping(r.body.lines)) throw shippingOpen(r);
    return endHolding(tx, ctx, r, 'closed', note);
  });
  await submitHolds(ctx, plan.docs);
  return orderDetail(ctx, id);
}

/** Huỷ đơn chưa giao gì (Nháp / Chờ duyệt / Đã gửi); đã giao một phần → dùng Đóng đơn. */
export async function cancelOrder(ctx: ActionContext, id: string, note: string) {
  const plan = await ctx.data.module(async (tx) => {
    const r = await getOrder(tx, id, true);
    if (!['draft', 'pending', 'open'].includes(r.status)) throw stateError(r, 'không huỷ được');
    if (anyShipping(r.body.lines)) throw shippingOpen(r);
    if (anyDelivered(r.body.lines) || r.body.deliveries.some((d) => !d.returned)) {
      throw Errors.conflict(`Đơn ${r.order_no} đã giao một phần — không huỷ được; dùng Đóng đơn (phần đã giao giữ nguyên)`, { reason: 'PHIEU_BAN_ORDER_STATE', status: r.status });
    }
    if (r.status !== 'open') {
      await updateOrder(tx, id, { ...writeOf(r, ctx.actor.id), status: 'cancelled' });
      await ev(tx, ctx, id, 'cancel', [{ field: 'status', from: r.status, to: 'cancelled' }], note);
      return { docs: [] as HoldDoc[] };
    }
    return endHolding(tx, ctx, r, 'cancelled', note);
  });
  await submitHolds(ctx, plan.docs);
  return orderDetail(ctx, id);
}

async function endHolding(tx: Tx, ctx: ActionContext, r: OrderRow, status: 'closed' | 'cancelled', note: string) {
  const holdWh = r.hold_warehouse_code ?? '';
  const rb = rebalanceHolds(r.body.lines, new Map(), { releaseAll: true });
  const { docs, seq } = holdWh ? holdDocsOf(r, holdWh, rb, r.hold_seq) : { docs: [] as HoldDoc[], seq: r.hold_seq };
  await updateOrder(tx, r.order_id, { ...writeOf(r, ctx.actor.id), status, body: { ...r.body, lines: rb.lines }, holdSeq: seq, ...(status === 'closed' ? { closeReason: 'manual' } : {}) });
  if (rb.release.length) await ev(tx, ctx, r.order_id, 'release', moveChanges(rb.release, 'held-'), `${holdWh} → ${r.warehouse_code}`);
  await ev(tx, ctx, r.order_id, status === 'closed' ? 'close' : 'cancel', [{ field: 'status', from: r.status, to: status }], note);
  return { docs };
}

// ------------------------------------------------------------------ phiếu bán nháp sinh từ đơn

/**
 * Sửa phiếu bán nháp đã nối đơn: số lượng mới của lần giao phải ≤ số còn lại (tính cả phần của chính lần giao); chỉ mặt hàng của đơn.
 * Đơn đã đóng tay / huỷ → không đổi số lượng (xoá phiếu nháp để trả hàng về kho bán).
 */
async function syncLinkedEdit(tx: Tx, ctx: ActionContext, d: { docId: string; orderId: string; lines: { lineKey: string; sku: string; qty: number }[] }) {
  const r = await getOrder(tx, d.orderId, true);
  const idx = r.body.deliveries.findIndex((x) => x.docId === d.docId && !x.returned);
  if (idx < 0) return;
  const old = r.body.deliveries[idx]!;
  // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-032: dòng phí ship không phải hàng của đơn; phiếu của chuyến giao không đổi số lượng hàng (đóng góp)
  d = { ...d, lines: d.lines.filter((l) => l.lineKey !== SHIP_LINE_KEY) };
  const sum = (ls: readonly { lineKey: string; qty: number }[]) => { const m = new Map<string, number>(); for (const l of ls) m.set(l.lineKey, r4((m.get(l.lineKey) ?? 0) + l.qty)); return m; };
  const a = sum(old.lines);
  const b = sum(d.lines);
  const byKey = new Map(r.body.lines.map((l) => [l.lineKey, l]));
  const bad = d.lines.filter((l) => byKey.get(l.lineKey)?.sku !== l.sku).map((l) => `dòng ${l.lineKey} (${l.sku}) không có trong đơn ${r.order_no}`);
  if (bad.length) fail([`Phiếu giao theo đơn chỉ gồm mặt hàng của đơn: ${bad.join('; ')}`]);
  const same = a.size === b.size && [...a].every(([k, q]) => b.get(k) === q);
  if (same) return;
  if (old.shipmentId) {
    throw Errors.conflict(`Phiếu ${old.docNo} là phiếu của chuyến giao (hàng đã giao từ kho KHG) — không đổi số lượng hàng; khách không nhận thì xoá phiếu nháp rồi cập nhật chuyến Hoàn`,
      { reason: 'PHIEU_BAN_SHIPMENT_STATE', status: 'delivered' });
  }
  const reopenable = r.status === 'open' || (r.status === 'closed' && r.close_reason === 'delivered');
  if (!reopenable) throw stateError(r, 'không đổi số lượng phiếu giao; xoá phiếu nháp để trả hàng về kho bán');
  const back = returnDelivery(r.body.lines, old.lines, true);
  const again = applyDelivery(back.lines, d.lines);
  if (again.over.length) {
    throw Errors.validation(`Giao vượt số còn lại của đơn ${r.order_no}: ${again.over.map((o) => `${o.sku} giao ${o.qty}, còn ${o.remaining}`).join('; ')}`,
      { reason: 'PHIEU_BAN_OVER_REMAINING', items: again.over });
  }
  const done = fullyDelivered(again.lines);
  const deliveries = r.body.deliveries.map((x, i) => (i === idx ? { ...x, lines: again.delivered } : x));
  await updateOrder(tx, r.order_id, { ...writeOf(r, ctx.actor.id), status: done ? 'closed' : 'open', body: { ...r.body, lines: again.lines, deliveries }, closeReason: done ? 'delivered' : null });
  await ev(tx, ctx, r.order_id, 'update_delivery', [...new Set([...a.keys(), ...b.keys()])].map((k) => ({ field: `delivered ${byKey.get(k)?.sku ?? k}`, from: a.get(k) ?? 0, to: b.get(k) ?? 0 })), `Sửa phiếu bán nháp ${old.docNo}`);
}

/** Lưu phiếu bán / trả nháp (action doc.create / doc.update): phiếu nối đơn thì báo đơn số lượng mới của lần giao. */
export async function saveSaleDraft(ctx: ActionContext, kind: Kind, input0: DocInput, id?: string) {
  // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-031: kênh bán chọn từ danh mục của module pos (đóng góp)
  const input = await withChannel(ctx, input0, id);
  // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-028: dòng quà của phiếu bán tự vào kho quà (KKM) của cửa hàng — hỏi module pos ngoài giao dịch (đóng góp)
  const giftWarehouse = await giftWarehouseOf(ctx, kind, input.branchCode, input.lines);
  return ctx.data.module(async (tx) => saveDraftIn(tx, ctx, kind, input, id, { onLinkedEdit: (t, d) => syncLinkedEdit(t, ctx, d), giftWarehouse }));
}

/** Xoá phiếu nháp. Phiếu sinh từ đơn → trả lại số đã giao: đơn còn mở / đã giao đủ → giữ lại hàng (đang ở KCB), đơn đóng tay → chuyển về kho bán. */
export async function deleteSaleDraft(ctx: ActionContext, docId: string) {
  const plan = await ctx.data.module(async (tx) => {
    const d = await getDoc(tx, docId, true);
    if (d.status !== 'draft') throw Errors.conflict('Phiếu đã duyệt không xoá được — bỏ duyệt trước');
    await deleteDoc(tx, docId);
    const link = d.body.order;
    if (!link) return { docs: [] as HoldDoc[] };
    const r = await getOrder(tx, link.id, true);
    const idx = r.body.deliveries.findIndex((x) => x.docId === docId && !x.returned);
    if (idx < 0) return { docs: [] as HoldDoc[] };
    const del = r.body.deliveries[idx]!;
    // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-032: xoá phiếu nháp của chuyến giao → chuyến về Đang giao (hàng vẫn ở KHG), đơn mở lại nếu đã đóng vì giao đủ (đóng góp)
    if (del.shipmentId) {
      const sh = await shipmentByDoc(tx, docId);
      const lines = shipmentDelivered(r.body.lines, del.lines, true);
      const deliveries = r.body.deliveries.map((x, i) => (i === idx ? { ...x, returned: true } : x));
      const reopen = r.status === 'closed' && r.close_reason === 'delivered';
      await updateOrder(tx, r.order_id, { ...writeOf(r, ctx.actor.id), status: reopen ? 'open' : r.status, body: { ...r.body, lines, deliveries }, ...(reopen ? { closeReason: null } : {}) });
      if (sh) {
        const log: ShipLog[] = [...sh.log, { at: new Date().toISOString(), by: ctx.actor.id, byName: ctx.actor.name, from: 'delivered', to: 'shipping', note: `Xoá phiếu bán nháp ${d.doc_no}` }];
        await updateShipment(tx, sh.shipment_id, { status: 'shipping', carrier: sh.carrier_code, trackingNo: sh.tracking_no, shipWarehouse: sh.ship_warehouse_code, saleDocId: null, saleDocNo: null, log, actor: ctx.actor.id });
      }
      await ev(tx, ctx, r.order_id, 'delivery_returned', del.lines.map((l) => ({ field: `delivered ${l.sku}`, from: l.qty, to: 0 })),
        `Xoá phiếu bán nháp ${d.doc_no} của chuyến giao ${sh ? sh.seq : ''} — chuyến về Đang giao, hàng vẫn ở kho KHG`);
      return { docs: [] as HoldDoc[] };
    }
    const keep = r.status === 'open' || (r.status === 'closed' && r.close_reason === 'delivered');
    const back = returnDelivery(r.body.lines, del.lines, keep);
    const deliveries = r.body.deliveries.map((x, i) => (i === idx ? { ...x, returned: true } : x));
    let docs: HoldDoc[] = [];
    let seq = r.hold_seq;
    if (back.release.length && r.hold_warehouse_code) ({ docs, seq } = holdDocsOf(r, r.hold_warehouse_code, { hold: [], release: back.release }, seq));
    const status: OrderStatus = keep ? 'open' : r.status;
    await updateOrder(tx, r.order_id, { ...writeOf(r, ctx.actor.id), status, body: { ...r.body, lines: back.lines, deliveries }, holdSeq: seq, ...(keep ? { closeReason: null } : {}) });
    await ev(tx, ctx, r.order_id, 'delivery_returned', del.lines.map((l) => ({ field: `delivered ${l.sku}`, from: l.qty, to: 0 })),
      `Xoá phiếu bán nháp ${d.doc_no}${keep ? (r.status === 'closed' ? ' — đơn mở lại, hàng giữ lại ở kho KCB' : ' — hàng giữ lại ở kho KCB') : ' — chuyển hàng về kho bán'}`);
    return { docs };
  });
  await submitHolds(ctx, plan.docs);
  return { deleted: true };
}

// ------------------------------------------------------------------ nạp đơn livestream

/** Nạp nhiều đơn livestream một lần (từ bảng Excel dán / tải ở màn). Trùng → theo onDuplicate; báo kết quả từng đơn. */
export async function importOrders(ctx: ActionContext, rows: OrderInput[], dup: DupMode) {
  const out: Record<string, unknown>[] = [];
  for (const [i, row] of rows.entries()) {
    const r = await createOrder(ctx, { ...row, source: 'livestream' }, { onDuplicate: dup.onDuplicate });
    out.push({ index: i, ...r });
  }
  return {
    created: out.filter((x) => x.created).length, merged: out.filter((x) => x.merged).length,
    duplicates: out.filter((x) => !x.created && !x.merged).length, results: out,
  };
}

// ------------------------------------------------------------------ chuyến giao (NT-BH-032)
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-032: chuyến giao hai bước qua kho KHG, phí ship, COD (đóng góp)

/** Cấu hình giao hàng (đọc ngoài giao dịch của module — vai trò module không đọc bảng cấu hình của Core). */
async function shipConfigOf(ctx: ActionContext) {
  const [wh, fee, cod] = await Promise.all([ctx.settings.get<unknown>(SHIP_WAREHOUSES), ctx.settings.get<unknown>(SHIP_FEE_SKU), ctx.settings.get<unknown>(COD_METHODS)]);
  return { warehouses: parseHoldMap(wh), feeSku: typeof fee === 'string' ? fee.trim() : '', cod: parseCarrierMap(cod) };
}
type ShipConfig = Awaited<ReturnType<typeof shipConfigOf>>;

/** Kho KHG (hàng gửi bán) của cửa hàng. Chưa khai / khai sai → PHIEU_BAN_NO_SHIP_WAREHOUSE (không đi giao được). */
async function shipWarehouseOf(tx: Tx, r: Pick<OrderRow, 'branch_code' | 'warehouse_code' | 'hold_warehouse_code'>, cfg: ShipConfig): Promise<string> {
  const code = cfg.warehouses.get(r.branch_code);
  const wh = await warehousesOf(tx, r.branch_code);
  if (!code || !wh.active.some((w) => w.code === code) || code === r.warehouse_code || code === r.hold_warehouse_code) {
    throw Errors.validation(`Cửa hàng ${r.branch_code} chưa có kho loại KHG (hàng gửi bán) để đi giao — khai kho KHG ở danh mục kho (DM18) rồi chọn ở Cài đặt bán hàng (BH17)${code ? ` (kho ${code} không dùng được: không thuộc cửa hàng, đã ngừng hoặc trùng kho bán / kho giữ hàng)` : ''}`,
      { reason: 'PHIEU_BAN_NO_SHIP_WAREHOUSE', branchCode: r.branch_code });
  }
  return code;
}

// [2026-11-21 Võ Hoàng] NGHIEM-THU — NT-BH-035 §3.3: BH17 nhắc khi mã phí ship chưa là mặt hàng dịch vụ (dịch vụ không ghi thẻ kho) (đóng góp)
/**
 * Cấu hình kho KHG, mã phí ship, hình thức COD theo hãng (cho màn). `shipFeeWarning`: mã phí ship đã khai mà chưa phân loại là dịch vụ
 * (tại hôm nay) → dòng phí ship vẫn sinh thẻ kho / giá vốn như hàng hoá; màn nhắc kế toán phân loại lại. Trống = ổn / chưa khai.
 */
export async function shipSettings(ctx: ActionContext) {
  const c = await shipConfigOf(ctx);
  const isService = c.feeSku ? (await ctx.data.module(async (tx) => serviceSkus(tx, [c.feeSku], vnToday()))).has(c.feeSku) : false;
  const shipFeeWarning = c.feeSku && !isService
    ? `Mã phí ship ${c.feeSku} chưa phân loại là mặt hàng dịch vụ — dòng phí ship vẫn ghi thẻ kho và giá vốn như hàng hoá. Cần phân loại mặt hàng này là "Dịch vụ" (loại mặt hàng theo ngày hiệu lực) thì dòng phí ship mới không ghi kho.`
    : null;
  return {
    keys: { shipWarehouses: SHIP_WAREHOUSES, shipFeeSku: SHIP_FEE_SKU, codMethods: COD_METHODS }, shipWarehouses: Object.fromEntries(c.warehouses), shipFeeSku: c.feeSku || null,
    shipFeeIsService: c.feeSku ? isService : null, shipFeeWarning, codMethods: Object.fromEntries(c.cod),
  };
}

const shipLog = (ctx: ActionContext, from: ShipmentStatus | null, to: ShipmentStatus, note?: string | null, docNo?: string): ShipLog => ({
  at: new Date().toISOString(), by: ctx.actor.id, byName: ctx.actor.name, from, to, ...(note ? { note } : {}), ...(docNo ? { docNo } : {}),
});
const overError = (no: string, over: { lineKey: string; sku: string; qty: number; remaining: number }[]) =>
  Errors.validation(`Giao vượt số còn lại của đơn ${no}: ${over.map((o) => `${o.sku} giao ${o.qty}, còn ${o.remaining}`).join('; ')}`, { reason: 'PHIEU_BAN_OVER_REMAINING', items: over });

export type ShipmentInput = { lines: { lineKey: string; qty: number }[]; carrier?: string; trackingNo?: string; fee?: number; cod?: number; note?: string };

/**
 * Lập chuyến giao (Chờ lấy hàng): mỗi dòng ≤ số còn lại (khoá theo đơn). Hãng / mã vận đơn / phí ship / COD mặc định theo thông tin giao
 * của đơn — phí và COD chỉ mặc định cho chuyến đầu chưa hoàn (chuyến sau 0 trừ khi nhập). Cửa hàng chưa khai kho KHG → không lập được.
 */
export async function createShipment(ctx: ActionContext, id: string, input: ShipmentInput) {
  const cfg = await shipConfigOf(ctx);
  const sid = randomUUID();
  await ctx.data.module(async (tx) => {
    const r = await getOrder(tx, id, true);
    if (r.status !== 'open') throw stateError(r, 'chỉ giao đơn đã gửi / đã duyệt');
    if (!r.partner_code) fail([`Đơn ${r.order_no} chưa có mã khách — sửa đơn chọn khách trước khi giao`]);
    await shipWarehouseOf(tx, r, cfg);
    const a = reserveShipment(r.body.lines, input.lines);
    if (a.problems.length) fail(a.problems);
    if (a.over.length) throw overError(r.order_no, a.over);
    const all = await shipmentsOf(tx, id);
    const info = shippingOf(r);
    const firstLive = !all.some((x) => x.status !== 'returned');
    const carrier = (input.carrier?.trim() || info?.carrier || SELF_CARRIER).toUpperCase();
    const fee = roundMoney(input.fee ?? (firstLive ? info?.fee ?? 0 : 0));
    const cod = roundMoney(input.cod ?? (firstLive ? info?.cod ?? 0 : 0));
    const seq = all.reduce((m, x) => Math.max(m, x.seq), 0) + 1;
    await insertShipment(tx, {
      id: sid, tenantId: ctx.tenant.id, orderId: id, seq, carrier, trackingNo: input.trackingNo?.trim() || (firstLive ? info?.trackingNo ?? null : null), fee, cod,
      lines: a.ship, log: [shipLog(ctx, null, 'waiting', input.note)], actor: ctx.actor.id,
    });
    await updateOrder(tx, id, { ...writeOf(r, ctx.actor.id), body: { ...r.body, lines: a.lines } });
    await ev(tx, ctx, id, 'ship_create', a.ship.map((l) => ({ field: `shipping ${l.sku}`, from: null, to: l.qty })), `Chuyến ${seq} — ${SHIPMENT_LABEL.waiting}${input.note ? `: ${input.note}` : ''}`);
  });
  ctx.meta('shipmentId', sid);
  return orderDetail(ctx, id);
}

/**
 * Đổi trạng thái chuyến (người dùng cập nhật tay — chưa nối API hãng):
 *   Chờ lấy → Đang giao: chứng từ chuyển kho KCB → KHG (chưa doanh thu).
 *   Đang giao → Đã giao: phiếu bán BH10 nháp xuất từ KHG — dòng hàng như đơn + dòng phí ship + thanh toán COD theo hãng.
 *   Đang giao → Hoàn: chứng từ chuyển kho KHG → KCB, hàng giữ lại cho đơn. Chờ lấy → Hoàn: trả chỗ, không chứng từ.
 */
export async function setShipmentStatus(ctx: ActionContext, id: string, shipmentId: string, input: { status: ShipmentStatus; note?: string; trackingNo?: string; carrier?: string; docDate?: string }) {
  const cfg = await shipConfigOf(ctx);
  const plan = await ctx.data.module(async (tx) => {
    const r = await getOrder(tx, id, true);
    const sh = await getShipment(tx, id, shipmentId);
    if (!SHIPMENT_NEXT[sh.status].includes(input.status)) {
      throw Errors.conflict(`Chuyến ${sh.seq} của đơn ${r.order_no} đang "${SHIPMENT_LABEL[sh.status]}" — không chuyển sang "${SHIPMENT_LABEL[input.status]}"`,
        { reason: 'PHIEU_BAN_SHIPMENT_STATE', status: sh.status, to: input.status });
    }
    const carrier = (input.carrier?.trim() || sh.carrier_code || SELF_CARRIER).toUpperCase();
    const trackingNo = input.trackingNo?.trim() || sh.tracking_no;
    // [2026-11-21 Võ Hoàng] NGHIEM-THU — NT-BH-035: dòng dịch vụ không đi chứng từ chuyển kho KCB ⇄ KHG (đóng góp)
    const svc = await serviceSkus(tx, sh.lines.map((l) => l.sku), vnToday());
    const moves: Move[] = sh.lines.filter((l) => !svc.has(l.sku)).map((l) => ({ lineKey: l.lineKey, sku: l.sku, name: l.name, unit: l.unit, qty: l.qty }));
    const date = vnToday();
    let docs: HoldDoc[] = [];
    let seq = r.hold_seq;
    let shipWh = sh.ship_warehouse_code;
    let sale: { id: string; docNo: string } | null = null;
    let lines = r.body.lines;
    let body: OrderBody = r.body;
    let status: OrderStatus = r.status;
    let closeReason: string | null | undefined;
    if (input.status === 'shipping') {
      if (r.status !== 'open') throw stateError(r, 'chỉ đi giao đơn đang mở');
      shipWh = await shipWarehouseOf(tx, r, cfg);
      const from = r.hold_warehouse_code ?? r.warehouse_code;
      docs = moves.length ? [toHoldDoc({ orderId: r.order_id, orderNo: r.order_no, seq: ++seq, branchCode: r.branch_code, docDate: date, from, to: shipWh, moves, release: false, kind: 'ship' })] : [];
    } else if (input.status === 'returned') {
      // Đơn còn mở: hàng về KCB, giữ lại cho đơn. Đơn đã đóng (phiếu của chuyến bị xoá sau khi đóng tay): hàng về kho bán, không giữ.
      const keep = r.status === 'open';
      if (sh.status === 'shipping' && shipWh && moves.length) {
        const to = keep ? r.hold_warehouse_code ?? r.warehouse_code : r.warehouse_code;
        docs = [toHoldDoc({ orderId: r.order_id, orderNo: r.order_no, seq: ++seq, branchCode: r.branch_code, docDate: date, from: shipWh, to, moves, release: true, kind: 'back' })];
      }
      lines = keep ? shipmentReturned(r.body.lines, sh.lines)
        : shipmentReturned(r.body.lines, sh.lines).map((l, i) => ({ ...l, held: r.body.lines[i]!.held }));
      body = { ...r.body, lines };
    } else {
      // Đã giao: phiếu bán nháp xuất từ KHG.
      if (!r.partner_code) fail([`Đơn ${r.order_no} chưa có mã khách — sửa đơn chọn khách trước khi ghi Đã giao`]);
      const fee = Number(sh.ship_fee);
      const cod = Number(sh.cod_amount);
      const extra: DocInput['lines'] = [];
      if (fee > 0) {
        if (!cfg.feeSku) {
          throw Errors.validation('Chuyến có phí ship mà chưa khai mã dịch vụ "Phí ship thu khách" — kế toán khai ở Cài đặt bán hàng (BH17)', { reason: 'PHIEU_BAN_NO_SHIP_FEE_ITEM', fee });
        }
        const item = (await catalogFor(tx, [cfg.feeSku])).get(cfg.feeSku);
        if (!item) {
          throw Errors.validation(`Mã dịch vụ phí ship ${cfg.feeSku} (BH17) không có trong danh mục / đã ngừng / không bán — khai lại ở Cài đặt bán hàng`, { reason: 'PHIEU_BAN_NO_SHIP_FEE_ITEM', sku: cfg.feeSku });
        }
        const rate = item.taxCode ? (await taxRates(tx)).get(item.taxCode) ?? 0 : 0;
        extra.push({ lineKey: SHIP_LINE_KEY, sku: cfg.feeSku, name: item.name || 'Phí ship', qty: 1, unitPrice: feeBeforeTax(fee, rate) } as DocInput['lines'][number]);
      }
      const payments: NonNullable<DocInput['payments']> = [];
      if (cod > 0) {
        const method = cfg.cod.get(carrier);
        if (!method) {
          throw Errors.validation(`Chưa khai hình thức thanh toán "COD — ${carrier}" — kế toán khai hình thức (phải thu hãng) rồi chọn ở Cài đặt bán hàng (BH17)`, { reason: 'PHIEU_BAN_NO_COD_METHOD', carrier });
        }
        payments.push({ methodCode: method, amount: cod, reference: `COD ${carrier}${trackingNo ? ` ${trackingNo}` : ''}` });
      }
      const before = new Map(r.body.lines.map((l) => [l.lineKey, l.delivered]));
      const used = new Set(r.body.lines.filter((l) => sh.lines.some((x) => x.lineKey === l.lineKey)).map((l) => l.policyRef?.key).filter(Boolean));
      const doc = await saveDraftIn(tx, ctx, 'sale', {
        docDate: input.docDate || date, branchCode: r.branch_code, warehouseCode: shipWh ?? undefined, partner: { code: r.partner_code! },
        lines: [...deliveryLines(r.body.lines, sh.lines, before), ...extra], payments,
        note: `Giao theo đơn đặt hàng ${r.order_no} — chuyến ${sh.seq}${carrier !== SELF_CARRIER ? ` (${carrier}${trackingNo ? ` ${trackingNo}` : ''})` : ''}`,
        ...(r.body.policyRefs?.some((p) => used.has(p.key)) ? { policyRefs: r.body.policyRefs.filter((p) => used.has(p.key)) } : {}),
      } as DocInput, undefined, { order: { id: r.order_id, no: r.order_no } });
      sale = { id: doc.id, docNo: doc.docNo };
      lines = shipmentDelivered(r.body.lines, sh.lines);
      const done = fullyDelivered(lines);
      body = { ...r.body, lines, deliveries: [...r.body.deliveries, { docId: doc.id, docNo: doc.docNo, at: new Date().toISOString(), by: ctx.actor.name, lines: sh.lines.map((l) => ({ lineKey: l.lineKey, sku: l.sku, qty: l.qty })), shipmentId }] };
      if (done) { status = 'closed'; closeReason = 'delivered'; }
    }
    await updateShipment(tx, shipmentId, {
      status: input.status, carrier, trackingNo, shipWarehouse: shipWh, saleDocId: sale?.id ?? sh.sale_doc_id, saleDocNo: sale?.docNo ?? sh.sale_doc_no,
      log: [...sh.log, shipLog(ctx, sh.status, input.status, input.note, sale?.docNo ?? docs[0]?.docNo)], actor: ctx.actor.id,
    });
    await updateOrder(tx, id, { ...writeOf(r, ctx.actor.id), status, body, holdSeq: seq, ...(closeReason !== undefined ? { closeReason } : {}) });
    const what = docs[0] ? ` — chứng từ chuyển kho ${docs[0].docNo}` : sale ? ` — phiếu bán nháp ${sale.docNo}` : '';
    await ev(tx, ctx, id, 'ship_status', [{ field: `shipment ${sh.seq}`, from: sh.status, to: input.status }], `Chuyến ${sh.seq}: ${SHIPMENT_LABEL[sh.status]} → ${SHIPMENT_LABEL[input.status]}${what}${input.note ? ` · ${input.note}` : ''}`);
    if (status === 'closed' && r.status !== 'closed') await ev(tx, ctx, id, 'close', [{ field: 'status', from: r.status, to: 'closed' }], 'Giao đủ');
    return { docs, sale };
  });
  await submitHolds(ctx, plan.docs);
  if (plan.sale) ctx.meta('saleDoc', plan.sale);
  return orderDetail(ctx, id);
}

// ------------------------------------------------------------------ copy đơn (NT-BH-032 Q4)
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-032: copy đơn → đơn, hoá đơn lẻ (BH10 đã duyệt / đơn máy bán) → đơn; giá + khuyến mại tính lại (đóng góp)

export type CopyInput = { from: 'order' | 'sale' | 'pos'; id?: string; no?: string; branchCode?: string; orderDate?: string; validUntil?: string };
type PosLines = { code: string; branchCode: string; status: string; customerCode: string | null; lines: { lineKey: string; sku: string; unitQty: number; ratio: number; isGift: boolean }[] };
type Evaluated = {
  applied: { policyRef: { key: string; version: number; hash: string } }[];
  gifts: { sku: string; qty: number; policyRef: { key: string; version: number; line: 'gift' } }[];
  discounts: { lineKey: string; amount: number; policyRef: { key: string; version: number; line: 'discount' } }[];
};

const copyFail = (message: string, extra: Record<string, unknown> = {}) => Errors.validation(message, { reason: 'PHIEU_BAN_COPY_SOURCE', ...extra });

/**
 * Lập đơn nháp mới từ đơn đặt hàng / phiếu bán BH10 đã duyệt / đơn máy bán: copy mặt hàng (bỏ quà và giảm theo chương trình cũ), số lượng,
 * khách, thông tin giao (đơn → đơn; bỏ mã vận đơn); đơn giá để trống = giá cửa hàng hôm nay; khuyến mại Core tính lại theo ngày lập mới
 * (core.policy.evaluate — áp mọi chương trình đủ điều kiện như nút Áp khuyến mại). Đơn mới ghi "Copy từ <số gốc>".
 */
export async function copyOrder(ctx: ActionContext, input: CopyInput) {
  if (!input.id && !input.no) throw copyFail('Chọn đơn / nhập số phiếu gốc để copy');
  if (input.from === 'sale' && !input.id && !input.branchCode) throw copyFail('Copy từ phiếu bán BH10: chọn cửa hàng của phiếu');
  const today = input.orderDate || vnToday();
  const cfg = input.from === 'sale' ? await shipConfigOf(ctx) : null;
  const pos = input.from === 'pos' ? await posLinesOf(ctx, input) : null;
  const src = await ctx.data.module(async (tx) => {
    if (input.from === 'order') {
      const o = input.id ? await getOrder(tx, input.id) : input.no ? await orderByNo(tx, input.no, input.branchCode) : null;
      if (!o) throw copyFail(`Không có đơn đặt hàng ${input.no ?? input.id ?? ''}`);
      const ship = shippingOf(o);
      return {
        no: o.order_no, branchCode: o.branch_code, warehouseCode: o.warehouse_code, partnerCode: o.partner_code, customer: o.body.customer,
        lines: o.body.lines.filter((l) => !(l.isGift && l.policyRef)).map((l) => ({ sku: l.sku, qty: l.qty, isGift: l.isGift && !l.policyRef })),
        shipping: ship ? { ...ship, trackingNo: undefined } : undefined, note: o.body.note,
      };
    }
    if (input.from === 'sale') {
      const d = input.id ? await getDoc(tx, input.id) : input.no && input.branchCode ? await saleByNo(tx, input.branchCode, input.no) : null;
      if (!d || d.kind !== 'sale') throw copyFail(`Không có phiếu bán ${input.no ?? input.id ?? ''} ở cửa hàng ${input.branchCode ?? ''}`);
      if (d.status !== 'approved') throw copyFail(`Phiếu bán ${d.doc_no} chưa duyệt — chỉ copy hoá đơn đã duyệt`, { status: d.status });
      return {
        no: d.doc_no, branchCode: d.branch_code, warehouseCode: undefined as string | undefined, partnerCode: d.partner_code, customer: undefined,
        lines: d.body.lines.filter((l) => !(l.isGift && l.policyRef) && l.lineKey !== SHIP_LINE_KEY && l.sku !== cfg?.feeSku).map((l) => ({ sku: l.sku, qty: l.qty, isGift: l.isGift })),
        shipping: undefined, note: undefined,
      };
    }
    const p = pos!;
    if (p.status !== 'completed') throw copyFail(`Đơn máy bán ${p.code} chưa hoàn tất / đã huỷ — không copy`, { status: p.status });
    const raw = p.customerCode ?? '';
    const partnerCode = raw ? (await partnerByCode(tx, raw))?.code ?? await partnerByPhone(tx, normPhone(raw)) : null;
    return {
      no: p.code, branchCode: p.branchCode, warehouseCode: undefined as string | undefined, partnerCode,
      customer: !partnerCode && normPhone(raw) ? { phone: normPhone(raw) } : undefined,
      lines: p.lines.filter((l) => !l.isGift).map((l) => ({ sku: l.sku, qty: r4(l.unitQty * (l.ratio || 1)), isGift: false })),
      shipping: undefined, note: undefined,
    };
  });
  if (!src.lines.length) throw copyFail(`${src.no} không có dòng hàng để copy`);
  const branchCode = input.branchCode && input.from === 'order' ? input.branchCode : src.branchCode;
  // Gộp theo mã (hoá đơn lẻ có thể nhiều dòng cùng mã / khác ĐVT) — đơn đặt hàng ghi theo ĐVT mặc định.
  const merged = new Map<string, { sku: string; qty: number; isGift: boolean }>();
  for (const l of src.lines) {
    const k = `${l.sku}|${l.isGift ? 'g' : ''}`;
    const m = merged.get(k);
    merged.set(k, m ? { ...m, qty: r4(m.qty + l.qty) } : { ...l });
  }
  const lines = [...merged.values()].map((l, i) => ({ lineKey: `L${i + 1}`, sku: l.sku, qty: l.qty, ...(l.isGift ? { isGift: true } : {}) }));
  const promo = await promoFor(ctx, branchCode, today, lines.filter((l) => !l.isGift));
  const all = [...lines.map((l) => {
    const d = promo.discounts.get(l.lineKey);
    return d ? { ...l, discount: d.discount, policyRef: d.ref } : l;
  }), ...promo.gifts.map((g, i) => ({ lineKey: `G${i + 1}`, sku: g.sku, qty: g.qty, isGift: true, policyRef: g.policyRef }))];
  const orderInput: OrderInput = {
    orderDate: today, validUntil: input.validUntil, branchCode, ...(src.warehouseCode ? { warehouseCode: src.warehouseCode } : {}), source: 'manual',
    ...(src.partnerCode ? { partner: { code: src.partnerCode } } : {}), ...(src.customer ? { customer: src.customer } : {}),
    lines: all as OrderInput['lines'], note: [`Copy từ ${src.no}`, src.note].filter(Boolean).join(' · '),
    ...(promo.policyRefs.length ? { policyRefs: promo.policyRefs } : {}), ...(src.shipping ? { shipping: src.shipping } : {}),
  };
  if (promo.skipped) ctx.meta('promoSkipped', promo.skipped);
  const r = await createOrder(ctx, orderInput, { onDuplicate: 'keep', copiedFrom: { kind: input.from, no: src.no } });
  return r.order!;
}

/** Dòng đơn máy bán theo mã (module pos — action đọc pos.order.lines; module không đọc bảng của nhau). Gọi NGOÀI ctx.data.module. */
async function posLinesOf(ctx: ActionContext, input: CopyInput): Promise<PosLines> {
  if (!input.no) throw copyFail('Copy từ đơn máy bán: nhập mã đơn');
  try {
    const r = await ctx.actions.call<PosLines | null>('pos.order.lines', { code: input.no, ...(input.branchCode ? { branch: input.branchCode } : {}) });
    if (!r) throw copyFail('Copy từ đơn máy bán: nhập mã đơn');
    return r;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'NOT_FOUND') throw copyFail(`Không có đơn máy bán ${input.no}${input.branchCode ? ` ở cửa hàng ${input.branchCode}` : ''} (hoặc module Máy bán POS chưa bật)`);
    throw e;
  }
}

/**
 * Khuyến mại tính lại theo ngày lập mới: hỏi Core (core.policy.evaluate, như nút Áp khuyến mại của BH10) bằng giá cửa hàng hôm nay (đơn
 * giá trước thuế như đơn sẽ tính × (1 + thuế suất), quy theo đơn vị nhỏ nhất). Tiền giảm gồm thuế → chiết khấu trước thuế của dòng; quà →
 * dòng quà 0đ. Core không trả lời (thiếu quyền, chưa có chính sách) → không áp, báo `promoSkipped`.
 */
async function promoFor(ctx: ActionContext, branch: string, date: string, lines: { lineKey: string; sku: string; qty: number }[]) {
  const none = { discounts: new Map<string, { discount: number; ref: { key: string; version: number; line: 'discount' } }>(), gifts: [] as Evaluated['gifts'], policyRefs: [] as { key: string; version: number; hash: string }[] };
  if (!lines.length) return { ...none, skipped: null as string | null };
  const info = await ctx.data.module(async (tx) => ({
    prices: await branchPriceRatios(tx, branch, lines.map((l) => l.sku)), catalog: await catalogFor(tx, lines.map((l) => l.sku)), rates: await taxRates(tx),
  }));
  const rateOf = (sku: string) => info.rates.get(info.catalog.get(sku)?.taxCode ?? '') ?? 0;
  const evalLines = lines.filter((l) => info.prices.has(l.sku)).map((l) => {
    const p = info.prices.get(l.sku)!;
    return { lineKey: l.lineKey, sku: l.sku, qty: r4(l.qty * p.ratio), price: p.price * (1 + rateOf(l.sku) / 100) / p.ratio };
  });
  if (!evalLines.length) return { ...none, skipped: null };
  let ev: Evaluated;
  try {
    ev = await ctx.actions.call<Evaluated>('core.policy.evaluate', { docDate: date, branchCode: branch, lines: evalLines });
  } catch (e) {
    return { ...none, skipped: `Chưa tính được khuyến mại: ${(e as Error).message}` };
  }
  const discounts = new Map<string, { discount: number; ref: { key: string; version: number; line: 'discount' } }>();
  for (const d of ev.discounts ?? []) {
    const sku = lines.find((l) => l.lineKey === d.lineKey)?.sku ?? '';
    const cur = discounts.get(d.lineKey);
    const add = roundMoney(d.amount / (1 + rateOf(sku) / 100));
    discounts.set(d.lineKey, { discount: roundMoney((cur?.discount ?? 0) + add), ref: cur?.ref ?? d.policyRef });
  }
  const gifts = ev.gifts ?? [];
  const used = new Set([...[...discounts.values()].map((d) => d.ref.key), ...gifts.map((g) => g.policyRef.key)]);
  const policyRefs = (ev.applied ?? []).map((a) => a.policyRef).filter((p) => used.has(p.key)).map((p) => ({ key: p.key, version: p.version, hash: p.hash }));
  return { discounts, gifts, policyRefs, skipped: null };
}
