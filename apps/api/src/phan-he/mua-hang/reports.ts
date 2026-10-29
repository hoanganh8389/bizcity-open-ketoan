/**
 * Báo cáo phân hệ Mua hàng — đọc SỔ THẬT (công nợ theo chứng từ, biến động kho) + chứng từ mua hàng:
 *   creditOverview   hạn mức NCC / nhãn theo chi nhánh: nợ đã ghi, đang chờ, còn lại; chỉ tiêu cung ứng
 *   dueList          khoản phải trả NCC đang mở (mọi nguồn), từng đợt lịch trả, nhóm tuổi nợ, cảnh báo
 *   lotStock         tồn theo lô / hạn dùng: lô từ phiếu nhập, số tồn thật từ kho, phần đã xuất trừ theo FEFO
 *   giftLedger       nhập - xuất - tồn quà theo nguồn / chương trình / VAT / chi nhánh
 *   rebatePreview    doanh số mua thuần kỳ (nhập − trả), mức thưởng, phân bổ theo mã
 *   costAllocation   phân bổ chi phí mua hàng vào phiếu nhập; realCost giá vốn thực tế từng mã
 */
import { sql } from 'kysely';
import {
  AGING_BUCKETS, agingBucket, allocate, baseUnitOf, ratioOf, brandMix, brandShare, computeDoc, creditStatus, daysBetween, expiryState, orderProgress, orderReconcile, rebateFor, sameInvoice, scheduleStatus,
  type LotStock, type Policy,
} from '@ketoan/contracts/mua-hang';
import { toNumber, type Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { apBalance, openOf, openOfBrand, pendingOf, type Ctx } from './analysis.js';
import { refReceipts, spreadOverMany } from './posting.js';
import { unitsForOrders, unitsOf } from './gia-mua.js';
import { noDueDate, type StoredDoc } from './store.js';

const evs = (ds: StoredDoc[]) => ds.flatMap((d) => d.links.map((l) => l.eventId)).filter(Boolean);
export const today = () => new Date().toISOString().slice(0, 10);

/** Hạn mức nhãn đang bị chiếm ở một chi nhánh: nợ nhãn đã ghi (số dư đầu + phiếu đã duyệt còn mở) và phiếu đang chờ. */
export async function brandBranchUsage(trx: Db, tenantId: string, ctx: Ctx, brand: string, branch: string, asOf = today()) {
  const docs = ctx.docs.filter((d) => d.branchCode === branch && d.status === 'approved' && ['receipt', 'return', 'exchange', 'cost'].includes(d.kind));
  const current = (ctx.settings.brandOpening[brand]?.[branch] ?? 0) + (await openOfBrand(trx, tenantId, docs, brand));
  return { current, pending: pendingOf(ctx.docs, (d) => d.branchCode === branch, asOf, undefined, (d) => brandShare(d, brand)) };
}

export async function creditOverview(trx: Db, tenantId: string, ctx: Ctx, asOf = today()) {
  const limits = ctx.policies.filter((p) => p.kind === 'credit_limit' && p.isActive);
  const partners = [];
  for (const p of limits.filter((x) => x.scope.partnerCode && !x.scope.brandCode)) {
    const code = p.scope.partnerCode!;
    const s = creditStatus(p, await apBalance(trx, tenantId, code, asOf), pendingOf(ctx.docs, (d) => d.partnerCode === code, asOf), 0)!;
    partners.push({ policy: p.code, partnerCode: code, ...s });
  }
  const brands = [];
  for (const p of limits.filter((x) => x.scope.brandCode && !x.scope.partnerCode)) {
    const brand = p.scope.brandCode!;
    const rule = p.rule as { limit: number; branches?: Record<string, number> };
    const rows = [];
    for (const [branch, lim] of Object.entries(rule.branches ?? {})) {
      const u = await brandBranchUsage(trx, tenantId, ctx, brand, branch, asOf);
      rows.push({ branchCode: branch, ...creditStatus({ ...p, rule: { ...rule, limit: lim, branches: {} } }, u.current, u.pending, 0)! });
    }
    const allocated = Object.values(rule.branches ?? {}).reduce((a, b) => a + b, 0);
    brands.push({ policy: p.code, id: p.id, brandCode: brand, limit: rule.limit, allocated, unallocated: rule.limit - allocated, branches: rows });
  }
  const supply = ctx.policies.filter((p) => p.kind === 'supply_target' && p.isActive).map((p) => {
    const period = String(p.rule.period);
    return {
      // Chỉ tiêu theo NCC (phạm vi có NCC): chỉ cộng phiếu nhập của NCC đó.
      policy: p.code, name: p.name, brandCode: p.scope.brandCode, partnerCode: p.scope.partnerCode, period,
      branches: Object.entries((p.rule.branches as Record<string, number>) ?? {}).map(([branch, target]) => {
        const done = Math.round(ctx.docs.filter((d) => d.kind === 'receipt' && d.status === 'approved' && d.branchCode === branch && d.docDate.startsWith(period) && (!p.scope.partnerCode || d.partnerCode === p.scope.partnerCode)).reduce((s, d) => s + d.totals.beforeTax * (p.scope.brandCode ? brandShare(d, p.scope.brandCode) : 1), 0));
        return { branchCode: branch, target, done, pct: target ? Math.round((done / target) * 1000) / 10 : 0 };
      }),
    };
  });
  return { asOf, partners, brands, supply };
}

export interface DueRow { debtItemId: string; partnerCode: string; partnerName: string; branchCode: string; docNo: string; purchaseDocId?: string; docDate: string; seq?: number; dueDate: string; amount: number; paid: number; remaining: number; bucket: number; daysOverdue: number; daysToDue: number }

export async function dueList(trx: Db, tenantId: string, ctx: Ctx, f: { partnerCode?: string; asOf?: string } = {}) {
  const asOf = f.asOf ?? today();
  let q = trx.selectFrom('debt_items as i').innerJoin('partners as p', 'p.id', 'i.partner_id').innerJoin('branches as b', 'b.id', 'i.branch_id').leftJoin('accounting_events as e', 'e.id', 'i.event_id')
    .select(['i.id', 'i.event_id', 'i.doc_no', 'i.doc_date', 'i.due_date', 'i.amount', 'i.settled_amount', 'i.account_code', 'p.code as partner_code', 'p.name as partner_name', 'b.code as branch_code', 'e.doc_type', sql<string | null>`e.payload->>'dueDate'`.as('explicit_due')])
    .where('i.tenant_id', '=', tenantId).where('i.side', '=', 'credit').where('i.account_code', 'like', '331%').where(sql<boolean>`i.amount > i.settled_amount`);
  if (f.partnerCode) q = q.where('p.code', '=', f.partnerCode);
  const items = await q.orderBy('i.due_date').execute();
  const byEvent = new Map<string, StoredDoc>();
  for (const d of ctx.docs) for (const l of d.links) byEvent.set(l.eventId, d);
  const rows: DueRow[] = [];
  for (const i of items) {
    const amount = toNumber(i.amount), paid = toNumber(i.settled_amount);
    const doc = byEvent.get(String(i.event_id));
    const base = { debtItemId: String(i.id), partnerCode: i.partner_code, partnerName: i.partner_name, branchCode: i.branch_code, docNo: i.doc_no, purchaseDocId: doc?.id, docDate: String(i.doc_date).slice(0, 10) };
    // Số dư đầu kỳ không khai hạn: như công nợ cố định (cùng cách tính với cảnh báo nợ quá hạn trên phiếu — openDueOf).
    const openingNoDue = !doc && i.doc_type === 'opening' && !/^\d{4}-\d{2}-\d{2}$/.test(i.explicit_due ?? '');
    if (openingNoDue || (doc?.kind === 'receipt' && noDueDate(doc))) {
      // Công nợ cố định / số dư đầu kỳ không hạn: không tính hạn — xếp "Chưa đến hạn", không có ngày hạn.
      rows.push({ ...base, dueDate: '', amount, paid, remaining: amount - paid, bucket: 0, daysOverdue: 0, daysToDue: 0 });
    } else if (doc?.schedule?.length && doc.kind === 'receipt') {
      for (const s of scheduleStatus(doc.schedule, paid, asOf)) {
        if (s.remaining <= 0) continue;
        rows.push({ ...base, seq: s.seq, dueDate: s.dueDate, amount: s.amount, paid: s.paid, remaining: s.remaining, bucket: agingBucket(s.dueDate, asOf), daysOverdue: s.daysOverdue, daysToDue: daysBetween(asOf, s.dueDate) });
      }
    } else {
      const due = String(i.due_date).slice(0, 10);
      rows.push({ ...base, dueDate: due, amount, paid, remaining: amount - paid, bucket: agingBucket(due, asOf), daysOverdue: Math.max(0, daysBetween(due, asOf)), daysToDue: daysBetween(asOf, due) });
    }
  }
  const buckets = AGING_BUCKETS.map((label, i) => ({ label, amount: rows.filter((r) => r.bucket === i).reduce((s, r) => s + r.remaining, 0), count: rows.filter((r) => r.bucket === i).length }));
  return { asOf, rows, buckets };
}

export async function lotStock(trx: Db, tenantId: string, ctx: Ctx, asOf = today()) {
  // Lô nhận vào từ phiếu mua đã duyệt (nhập, nhận về khi đổi), trừ lô trả đi.
  const lots = new Map<string, LotStock>();
  const fromIn = new Set<string>();
  const lotUnits = await unitsOf(trx, tenantId, ctx.docs.filter((x) => x.status === 'approved' && ['receipt', 'return', 'exchange'].includes(x.kind)).flatMap((x) => x.lines.map((l) => l.sku)));
  for (const d of ctx.docs.filter((x) => x.status === 'approved' && ['receipt', 'return', 'exchange'].includes(x.kind))) {
    for (const l of computeDoc(d, [], { units: lotUnits }).lines) {
      if (!l.lotNo || !l.expDate || !l.sku) continue;
      const out = d.kind === 'return' || l.dir === 'out';
      const k = `${d.branchCode}|${l.sku}|${l.lotNo}`;
      const cur = lots.get(k) ?? { sku: l.sku, lotNo: l.lotNo, expDate: l.expDate, mfgDate: l.mfgDate, branchCode: d.branchCode, qty: 0, unitCost: l.realUnitCost, partnerCode: d.partnerCode, docNo: d.docNo, receivedAt: d.docDate };
      // Nguồn của lô = phiếu NHẬN lô vào sớm nhất (phiếu trả đi đọc trước thì không được ghi làm nguồn).
      if (!out && (!fromIn.has(k) || d.docDate < cur.receivedAt)) { Object.assign(cur, { expDate: l.expDate, mfgDate: l.mfgDate, unitCost: l.realUnitCost, partnerCode: d.partnerCode, docNo: d.docNo, receivedAt: d.docDate }); fromIn.add(k); }
      cur.qty += out ? -l.qty : l.qty;
      lots.set(k, cur);
    }
  }
  // Số tồn thật của kho (mọi nguồn: bán, chuyển, kiểm kê…) → phân cho các lô, lô hạn XA giữ lại trước (đã xuất theo FEFO).
  const pairs = [...new Set([...lots.values()].map((l) => `${l.branchCode}|${l.sku}`))];
  const onHand = new Map<string, number>();
  if (pairs.length) {
    const rows = await trx.selectFrom('inventory_movements as m').innerJoin('branches as b', 'b.id', 'm.branch_id')
      .select(['b.code as branch_code', 'm.sku', sql<string>`SUM(m.qty)`.as('qty')])
      .where('m.tenant_id', '=', tenantId).where('m.sku', 'in', [...new Set([...lots.values()].map((l) => l.sku))]).where('m.doc_date', '<=', asOf)
      .groupBy(['b.code', 'm.sku']).execute();
    for (const r of rows) onHand.set(`${r.branch_code}|${r.sku}`, toNumber(r.qty));
  }
  const out = [];
  for (const key of pairs) {
    const group = [...lots.values()].filter((l) => `${l.branchCode}|${l.sku}` === key && l.qty > 0).sort((a, b) => b.expDate.localeCompare(a.expDate));
    let stock = onHand.get(key) ?? group.reduce((s, l) => s + l.qty, 0);
    for (const l of group) {
      const keep = Math.max(0, Math.min(l.qty, stock));
      stock -= keep;
      if (keep > 0) out.push({ ...l, received: l.qty, qty: keep, ...expiryState(l.expDate, asOf) });
    }
  }
  return { asOf, lots: out.sort((a, b) => a.expDate.localeCompare(b.expDate)) };
}

export function giftLedger(ctx: Ctx, f: { from?: string; to?: string } = {}) {
  type Row = { sku: string; name: string; branchCode: string; source: string; program: string; hasVat: boolean; openQty: number; inQty: number; outQty: number; onHand: number; unitValue: number; docs: string[] };
  const rows: Row[] = [];
  const row = (sku: string, name: string, branchCode: string, source: string, program: string, hasVat: boolean) => {
    let r = rows.find((x) => x.sku === sku && x.branchCode === branchCode && x.program === program && x.source === source && x.hasVat === hasVat);
    if (!r) rows.push((r = { sku, name, branchCode, source, program, hasVat, openQty: 0, inQty: 0, outQty: 0, onHand: 0, unitValue: 0, docs: [] }));
    return r;
  };
  // Đầu kỳ = phát sinh trước "từ ngày"; trong kỳ = từ ngày → đến ngày.
  const docs = ctx.docs.filter((x) => x.status === 'approved' && (!f.to || x.docDate <= f.to)).sort((a, b) => a.docDate.localeCompare(b.docDate));
  for (const d of docs) {
    const before = Boolean(f.from && d.docDate < f.from);
    for (const l of d.lines) {
      if (d.kind === 'gift_out') {
        // Một mã quà có thể nằm ở nhiều dòng (nguồn / có VAT / không VAT): trừ lần lượt nhập trước xuất trước, dòng hết thì
        // sang dòng kế; xuất vượt tổng tồn thì phần dư ghi vào dòng cuối (âm — kiểm tra xuất vượt tồn đã chặn khi duyệt).
        const cands = rows.filter((x) => x.sku === l.sku && x.branchCode === d.branchCode && (!l.program || x.program === l.program));
        if (!cands.length) cands.push(row(l.sku, l.name, d.branchCode, 'promo_consumer', l.program ?? '', false));
        let left = l.qty;
        cands.forEach((r, k) => {
          const take = k === cands.length - 1 ? left : Math.min(left, Math.max(0, r.openQty + r.inQty - r.outQty));
          if (!take) return;
          left -= take;
          if (before) r.openQty -= take; else { r.outQty += take; r.docs.push(d.docNo); }
        });
        continue;
      }
      const isGiftDoc = Boolean(d.gift) || d.kind === 'gift_in';
      if (!isGiftDoc && l.lineType !== 'gift_consumer') continue;
      if (!['receipt', 'gift_in'].includes(d.kind)) continue;
      const r = row(l.sku, l.name, d.branchCode, d.gift?.source ?? (d.kind === 'gift_in' ? 'ncc_extra' : 'promo_consumer'), l.program ?? d.gift?.program ?? '', d.gift?.hasVat ?? false);
      if (before) r.openQty += l.qty; else { r.inQty += l.qty; r.docs.push(d.docNo); }
      if (l.price) r.unitValue = l.price;
    }
  }
  rows.forEach((r) => { r.onHand = r.openQty + r.inQty - r.outQty; });
  // Ngân sách quà theo chương trình: giá trị đã xuất tặng so với ngân sách.
  const budgets = ctx.policies.filter((p) => p.kind === 'gift_budget' && p.isActive).map((p) => {
    const program = String(p.rule.program);
    const used = rows.filter((r) => r.program === program).reduce((s, r) => s + r.outQty * r.unitValue, 0);
    const bought = rows.filter((r) => r.program === program).reduce((s, r) => s + r.inQty * r.unitValue, 0);
    const amount = Number(p.rule.amount);
    return { policy: p.code, name: p.name, program, amount, bought, used, left: amount - used, pct: amount ? Math.round((used / amount) * 1000) / 10 : 0 };
  });
  return { rows, budgets };
}

/** Kỳ: '2026-10' (tháng), '2026-Q4' (quý), '2026' (năm) → khoảng ngày. */
export function periodRange(period: string): [string, string] {
  if (/^\d{4}-\d{2}$/.test(period)) { const [y, m] = period.split('-').map(Number) as [number, number]; return [`${period}-01`, new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)]; }
  const q = /^(\d{4})-Q([1-4])$/.exec(period);
  if (q) { const y = Number(q[1]), s = (Number(q[2]) - 1) * 3 + 1; return [`${y}-${String(s).padStart(2, '0')}-01`, new Date(Date.UTC(y, s + 2, 0)).toISOString().slice(0, 10)]; }
  if (/^\d{4}$/.test(period)) return [`${period}-01-01`, `${period}-12-31`];
  throw Errors.validation('Kỳ theo dạng YYYY-MM, YYYY-Qn hoặc YYYY');
}

export async function rebatePreview(trx: Db, tenantId: string, ctx: Ctx, p: Policy, period: string, manualTotal?: number) {
  const [from, to] = periodRange(period);
  const match = (d: StoredDoc) => d.status === 'approved' && d.docDate >= from && d.docDate <= to && (d.kind === 'receipt' || d.kind === 'return')
    && (!p.scope.brandCode || brandShare(d, p.scope.brandCode) > 0) && (!p.scope.partnerCode || d.partnerCode === p.scope.partnerCode);
  // Thưởng theo nhãn: chỉ cộng các dòng thuộc nhãn (nhãn của mặt hàng; phiếu cũ chưa ghi nhãn dòng thì theo nhãn phiếu).
  const inBrand = (l: { brandCode?: string }, d: StoredDoc) => !p.scope.brandCode || (l.brandCode ?? d.brandCode) === p.scope.brandCode;
  const byDay: Record<number, number> = {};
  const skus = new Map<string, { sku: string; name: string; purchased: number; qty: number }>();
  // Theo ngày: giá trị mua từng mã (thưởng giai đoạn chỉ chia cho hàng mua trong giai đoạn được thưởng).
  const skuDay = new Map<string, Map<number, number>>();
  for (const d of ctx.docs.filter(match)) {
    const sign = d.kind === 'return' ? -1 : 1;
    const c = computeDoc(d, []);
    const day = Number(d.docDate.slice(8, 10));
    byDay[day] = (byDay[day] ?? 0) + sign * c.lines.filter((l) => inBrand(l, d)).reduce((s, l) => s + l.beforeTax, 0);
    for (const l of c.lines.filter((x) => x.lineType !== 'gift_consumer' && x.sku && inBrand(x, d))) {
      const r = skus.get(l.sku) ?? { sku: l.sku, name: l.name, purchased: 0, qty: 0 };
      r.purchased += sign * l.beforeTax; r.qty += sign * l.qty; skus.set(l.sku, r);
      const m = skuDay.get(l.sku) ?? new Map<number, number>(); m.set(day, (m.get(day) ?? 0) + sign * l.beforeTax); skuDay.set(l.sku, m);
    }
  }
  const docsTotal = Object.values(byDay).reduce((a, b) => a + b, 0);
  const sales = { total: manualTotal ?? docsTotal, byDay: manualTotal !== undefined ? undefined : byDay };
  const r = rebateFor(p, sales);
  const rows = [...skus.values()].filter((x) => x.purchased > 0);
  const onHand = new Map<string, number>();
  if (rows.length) {
    const inv = await trx.selectFrom('inventory_movements').select(['sku', sql<string>`SUM(qty)`.as('qty')]).where('tenant_id', '=', tenantId).where('sku', 'in', rows.map((x) => x.sku)).where('doc_date', '<=', to).groupBy('sku').execute();
    for (const x of inv) onHand.set(x.sku, toNumber(x.qty));
  }
  const inRange = (sku: string, from: number, to: number) => [...(skuDay.get(sku) ?? new Map<number, number>())].filter(([d]) => d >= from && d <= to).reduce((t, [, v]) => t + v, 0);
  // Thưởng giai đoạn: mỗi giai đoạn có thưởng chia cho hàng mua TRONG giai đoạn đó (giai đoạn không đạt không nhận phần nào).
  const parts = r.stages?.length && sales.byDay
    ? r.stages.reduce((acc, st) => { const w = rows.map((x) => Math.max(0, inRange(x.sku, st.from, st.to))); const p = w.some((x) => x > 0) ? allocate(st.amount, w) : allocate(st.amount, rows.map((x) => x.purchased)); return acc.map((v, i) => v + p[i]!); }, rows.map(() => 0))
    : allocate(r.amount, rows.map((x) => x.purchased));
  const allocation = rows.map((x, i) => {
    const amount = parts[i]!; const held = Math.max(0, Math.min(onHand.get(x.sku) ?? 0, x.qty));
    const stock = x.qty ? Math.round((amount * held) / x.qty) : 0;
    return { ...x, onHand: held, amount, stock, sold: amount - stock };
  });
  const existing = ctx.docs.find((d) => d.kind === 'rebate' && d.status !== 'cancelled' && d.rebate?.policyCode === p.code && d.rebate?.period === period);
  return { policy: p.code, kind: p.kind, period, from, to, docsTotal, base: r.base, rate: r.rate, amount: r.amount, detail: r.detail, byDay, allocation, existing: existing ? { id: existing.id, docNo: existing.docNo } : null };
}

export function costAllocation(ctx: Ctx, costId: string, basis?: 'value' | 'qty') {
  const costs = ctx.docs.filter((d) => d.kind === 'cost' && d.status !== 'cancelled');
  const cost = costs.find((d) => d.id === costId);
  if (!cost) throw Errors.notFound('phiếu chi phí');
  const receipts = refReceipts(cost, ctx.docs);
  const warnings: string[] = [];
  for (const c of costs.filter((x) => !x.refIds?.length)) warnings.push(`Chi phí ${c.docNo} (${(c.amount ?? 0).toLocaleString('vi-VN')}) chưa gắn phiếu nhập — chưa phân bổ vào giá vốn`);
  const count = new Map<string, number>();
  for (const c of costs) for (const r of c.refIds ?? []) count.set(r, (count.get(r) ?? 0) + 1);
  for (const [r, n] of count) if (n > 1) warnings.push(`Phiếu nhập ${ctx.docs.find((d) => d.id === r)?.docNo ?? r} có ${n} phiếu chi phí — kiểm tra phân bổ trùng`);
  if (!receipts.length) return { cost, receipts: [], rows: [], warnings };
  const b = basis ?? cost.basis ?? 'value';
  const qtyOf = new Map<string, number>();
  for (const r of receipts) for (const l of computeDoc(r, []).lines.filter((x) => x.lineType !== 'gift_consumer')) qtyOf.set(l.sku, (qtyOf.get(l.sku) ?? 0) + l.qty);
  const rows = spreadOverMany(receipts, cost.amount ?? 0, b).rows.map((p) => {
    const q = qtyOf.get(p.sku) ?? 0;
    return { ...p, ratio: 0, unitBefore: q ? p.value / q : 0, unitAfter: q ? (p.value + p.amount) / q : 0 };
  });
  const tot = rows.reduce((s, r) => s + (b === 'qty' ? r.qty : r.value), 0);
  rows.forEach((r) => { r.ratio = tot ? Math.round(((b === 'qty' ? r.qty : r.value) / tot) * 10000) / 100 : 0; });
  return { cost, receipts: receipts.map((r) => ({ id: r.id, docNo: r.docNo, docDate: r.docDate, partnerCode: r.partnerCode })), basis: b, rows, warnings };
}

/** Phần một phiếu chi phí / chiết khấu bổ sung phân bổ vào các mã của MỘT phiếu nhập (phiếu tham chiếu nhiều phiếu nhập thì tách đúng phần). */
function partFor(adj: StoredDoc, receiptId: string, docs: StoredDoc[]): Map<string, number> {
  const m = new Map<string, number>();
  const rs = refReceipts(adj, docs);
  if (!rs.some((r) => r.id === receiptId)) return m;
  for (const p of spreadOverMany(rs, adj.amount ?? 0, adj.basis ?? 'value').parts) if (p.receiptId === receiptId) m.set(p.sku, (m.get(p.sku) ?? 0) + p.amount);
  return m;
}

export async function realCost(trx: Db, tenantId: string, ctx: Ctx, receiptId: string) {
  const r = ctx.docs.find((d) => d.id === receiptId && d.kind === 'receipt');
  if (!r) throw Errors.notFound('phiếu nhập');
  // SL theo ĐVT nhỏ nhất: dòng mua theo Thùng + quà theo Lon cùng mã cộng đúng (giá vốn / ĐVT nhỏ nhất).
  const units = await unitsOf(trx, tenantId, r.lines.map((l) => l.sku));
  const calc = computeDoc(r, [], { units });
  const base = (sku: string, unit: string, q: number) => q * (ratioOf(units[sku] ?? [], unit) || 1);
  const adj = ctx.docs.filter((d) => (d.kind === 'cost' || (d.kind === 'rebate' && !d.rebate)) && d.status === 'approved' && (d.refIds ?? []).includes(r.id));
  const bySku = new Map<string, { sku: string; name: string; unit: string; qty: number; giftQty: number; gross: number; disc: number; before: number; cost: number; rebate: number }>();
  for (const l of calc.lines.filter((x) => x.lineType !== 'gift_consumer' && x.sku)) {
    const x = bySku.get(l.sku) ?? { sku: l.sku, name: l.name, unit: baseUnitOf(units[l.sku] ?? []) || l.unit, qty: 0, giftQty: 0, gross: 0, disc: 0, before: 0, cost: 0, rebate: 0 };
    const vat = r.priceIncludesVat && l.beforeTax ? 1 + l.tax / l.beforeTax : 1;
    if (l.lineType === 'buy') x.qty += base(l.sku, l.unit, l.qty); else x.giftQty += base(l.sku, l.unit, l.qty);
    x.gross += Math.round(l.gross / vat); x.disc += Math.round((l.lineDiscount + l.orderDiscount) / vat); x.before += l.beforeTax;
    bySku.set(l.sku, x);
  }
  for (const a of adj) for (const [sku, amt] of partFor(a, r.id, ctx.docs)) { const x = bySku.get(sku); if (x) { if (a.kind === 'cost') x.cost += amt; else x.rebate += amt; } }
  return { receipt: { id: r.id, docNo: r.docNo, docDate: r.docDate, partnerCode: r.partnerCode }, adjustments: adj.map((a) => ({ docNo: a.docNo, kind: a.kind, amount: a.amount })), rows: [...bySku.values()] };
}

/**
 * TỔNG HỢP MUA HÀNG trong kỳ theo NCC / nhãn / ngành / nhóm / mã / chi nhánh (phiếu đã duyệt):
 * SL mua, SL tặng, tiền hàng trước CK, chiết khấu, giá trị nhập, thuế, hàng trả, chi phí phân bổ, thưởng / CK sau mua phân bổ,
 * giá trị thuần, giá vốn thực tế / ĐVT, còn nợ NCC (phần chưa trả của phiếu nhập chia theo giá trị dòng).
 */
export async function purchaseSummary(trx: Db, tenantId: string, ctx: Ctx, f: { from: string; to: string; groupBy: 'partner' | 'brand' | 'industry' | 'group' | 'sku' | 'branch' }) {
  const inRange = ctx.docs.filter((d) => d.status === 'approved' && d.docDate >= f.from && d.docDate <= f.to);
  const skus = [...new Set(ctx.docs.flatMap((d) => d.lines.map((l) => l.sku)).concat(ctx.docs.flatMap((d) => (d.allocation ?? []).map((a) => a.sku))))];
  const prods = skus.length ? await trx.selectFrom('products').select(['sku', 'name', 'brand_code', 'industry_code', 'group_code']).where('tenant_id', '=', tenantId).where('sku', 'in', skus).execute() : [];
  const pmap = new Map(prods.map((p) => [p.sku, p]));
  // Tên nhãn / ngành / nhóm hàng (danh mục DM11) để báo cáo hiện cả mã lẫn tên, không chỉ mã số.
  const classKind = f.groupBy === 'brand' || f.groupBy === 'industry' || f.groupBy === 'group' ? f.groupBy : null;
  const classNames = new Map<string, string>();
  if (classKind) {
    const codes = [...new Set(prods.map((p) => (classKind === 'brand' ? p.brand_code : classKind === 'industry' ? p.industry_code : p.group_code)).filter((x): x is string => Boolean(x)))];
    const found = codes.length ? await trx.selectFrom('item_classes').select(['kind', 'code', 'name', 'parent_code']).where('tenant_id', '=', tenantId).where('code', 'in', codes).where('kind', 'in', [classKind, 'group']).execute() : [];
    // Nhóm hàng trùng tên ở các nhãn khác nhau (vd "Sữa người lớn" của Fonterra và của Abbott) → ghi kèm tên nhãn / ngành cha.
    const parents = classKind === 'group' ? [...new Set(found.map((r) => r.parent_code).filter((x): x is string => Boolean(x)))] : [];
    const parentName = new Map((parents.length ? await trx.selectFrom('item_classes').select(['code', 'name']).where('tenant_id', '=', tenantId).where('code', 'in', parents).where('kind', '=', 'group').execute() : []).map((r) => [r.code, r.name]));
    for (const r of found) {
      if (r.kind !== classKind && classNames.has(r.code)) continue;
      const up = classKind === 'group' && r.parent_code ? parentName.get(r.parent_code) : undefined;
      classNames.set(r.code, up ? `${r.name} · ${up}` : r.name);
    }
  }
  // Số lượng cộng theo ĐVT NHỎ NHẤT (dòng nhập theo Thùng quy ra Lon) để cộng được giữa các phiếu; giữ thêm số theo ĐVT trên
  // hoá đơn (ĐVT của dòng phiếu) để đối chiếu với hoá đơn NCC.
  const units = await unitsOf(trx, tenantId, skus);
  const toBase = (sku: string, unit: string, qty: number) => qty * (ratioOf(units[sku] ?? [], unit) || 1);
  type Agg = { key: string; label: string; name: string; baseUnits: Set<string>; invoice: Map<string, number>; buyQty: number; giftQty: number; consumerGiftQty: number; returnQty: number; gross: number; discount: number; net: number; tax: number; returns: number; cost: number; rebate: number; openDebt: number; docs: Map<string, { id: string; docNo: string; kind: string; docDate: string }> };
  const rows = new Map<string, Agg>();
  /** [mã, tên] của dòng gom; label = "mã — tên" (mẫu in dùng). */
  const keyOf = (d: StoredDoc, sku: string): [string, string] => {
    const p = pmap.get(sku);
    const cls = (code: string | null | undefined, none: string): [string, string] => (code ? [code, classNames.get(code) ?? '(chưa khai tên ở DM11)'] : ['', none]);
    switch (f.groupBy) {
      case 'partner': return [d.partnerCode, ''];
      case 'branch': return [d.branchCode, ''];
      case 'brand': return cls(p?.brand_code, '(chưa có nhãn)');
      case 'industry': return cls(p?.industry_code, '(chưa có ngành)');
      case 'group': return cls(p?.group_code, '(chưa có nhóm)');
      default: return [sku, p?.name ?? ''];
    }
  };
  const agg = (d: StoredDoc, sku: string) => {
    const [k, name] = keyOf(d, sku);
    const label = k && name ? `${k} — ${name}` : k || name;
    let a = rows.get(k);
    if (!a) rows.set(k, (a = { key: k, label, name, baseUnits: new Set(), invoice: new Map(), buyQty: 0, giftQty: 0, consumerGiftQty: 0, returnQty: 0, gross: 0, discount: 0, net: 0, tax: 0, returns: 0, cost: 0, rebate: 0, openDebt: 0, docs: new Map() }));
    a.docs.set(d.id, { id: d.id, docNo: d.docNo, kind: d.kind, docDate: d.docDate });
    return a;
  };
  for (const d of inRange) {
    if (d.kind === 'receipt' || d.kind === 'return' || d.kind === 'exchange') {
      const c = computeDoc(d, []);
      // Còn nợ NCC: phiếu nhập = phần chưa trả; phiếu trả = khoản giảm nợ chưa trừ vào hoá đơn nào (số âm — trả không gắn
      // phiếu gốc); trả gắn phiếu gốc đã trừ thẳng vào nợ của phiếu nhập nên ở đây còn 0.
      const open = d.kind === 'receipt' || d.kind === 'return' ? await openOf(trx, tenantId, d.links.map((l) => l.eventId)) : 0;
      const total = c.beforeTax + c.tax;
      for (const l of c.lines.filter((x) => x.sku)) {
        const a = agg(d, l.sku);
        const bq = toBase(l.sku, l.unit, l.qty);
        a.baseUnits.add(baseUnitOf(units[l.sku] ?? []) || l.unit);
        const out = d.kind === 'return' || l.dir === 'out';
        if (out) { a.returnQty += bq; a.returns += l.beforeTax; if (total && d.kind === 'return') a.openDebt += Math.round((open * (l.beforeTax + l.tax)) / total); continue; }
        if (l.lineType === 'buy') { a.buyQty += bq; a.invoice.set(l.unit, (a.invoice.get(l.unit) ?? 0) + l.qty); } else a.giftQty += bq;
        if (l.lineType === 'gift_consumer') { a.consumerGiftQty += bq; continue; }
        const vat = d.priceIncludesVat && l.beforeTax ? 1 + l.tax / l.beforeTax : 1;
        a.gross += Math.round(l.gross / vat); a.discount += Math.round((l.lineDiscount + l.orderDiscount) / vat); a.net += l.beforeTax; a.tax += l.tax;
        if (total) a.openDebt += Math.round((open * (l.beforeTax + l.tax)) / total);
      }
    }
    if ((d.kind === 'cost' || d.kind === 'rebate') && d.allocation?.length) {
      const ref = refReceipts(d, ctx.docs)[0] as StoredDoc | undefined;
      for (const al of d.allocation) {
        const a = agg(f.groupBy === 'partner' && ref ? ref : d, al.sku);
        if (d.kind === 'cost') a.cost += al.amount; else a.rebate += al.amount;
      }
    }
  }
  const r4 = (x: number) => Math.round(x * 10000) / 10000;
  const list = [...rows.values()].map(({ docs, baseUnits, invoice, ...r }) => {
    const inv = [...invoice.entries()].filter(([, q]) => q);
    const units = { baseUnit: baseUnits.size === 1 ? [...baseUnits][0]! : baseUnits.size ? 'nhiều ĐVT' : '', invoiceUnit: inv.map(([u]) => u).join(', '),
      invoiceQty: inv.length === 1 ? r4(inv[0]![1]) : null, invoiceQtyText: inv.map(([u, q]) => `${r4(q).toLocaleString('vi-VN')} ${u}`).join(' + ') };
    Object.assign(r, { buyQty: r4(r.buyQty), giftQty: r4(r.giftQty), returnQty: r4(r.returnQty), consumerGiftQty: r4(r.consumerGiftQty) });
    const value = r.net - r.returns + r.cost - r.rebate;
    // Giá vốn / ĐVT: KM người bán chia vào giá (tính vào SL), KM người tiêu dùng không chia (như giá vốn thực tế của phiếu).
    const qty = r.buyQty + r.giftQty - r.consumerGiftQty - r.returnQty;
    // docList: các phiếu góp vào dòng (bấm mở phiếu ở MH11).
    return { ...r, ...units, documents: docs.size, docList: [...docs.values()].sort((x, y) => x.docDate.localeCompare(y.docDate) || x.docNo.localeCompare(y.docNo)), value, unitCost: f.groupBy === 'sku' && qty ? Math.round((value / qty) * 100) / 100 : null };
  }).sort((a, b) => b.value - a.value);
  return { from: f.from, to: f.to, groupBy: f.groupBy, rows: list };
}

/** TỔNG HỢP THƯỞNG trong tháng: mọi chính sách thưởng đang áp (kỳ tháng / quý / năm chứa tháng đó) — được hưởng bao nhiêu, đã lập / đã hạch toán chưa. */
export async function rebateOverview(trx: Db, tenantId: string, ctx: Ctx, month: string) {
  const out = [];
  for (const p of ctx.policies.filter((x) => ['period_rebate', 'target_rebate', 'stage_rebate'].includes(x.kind) && x.isActive)) {
    const kind = String(p.rule.period ?? 'month');
    const period = kind === 'year' ? month.slice(0, 4) : kind === 'quarter' ? `${month.slice(0, 4)}-Q${Math.floor((Number(month.slice(5, 7)) - 1) / 3) + 1}` : month;
    const r = await rebatePreview(trx, tenantId, ctx, p, period);
    const doc = ctx.docs.find((d) => d.kind === 'rebate' && d.status !== 'cancelled' && d.rebate?.policyCode === p.code && d.rebate?.period === period);
    const target = Number(p.rule.target ?? 0);
    out.push({
      policy: p.code, name: p.name, kind: p.kind, brandCode: p.scope.brandCode, partnerCode: p.scope.partnerCode, period, base: r.base, target: target || null,
      // Cắt (không làm tròn lên) 2 số lẻ — 549.999.999 / 500 triệu hiện 109,99%, khớp với mức thưởng thực tính.
      completion: target ? Math.floor((r.base / target) * 10000) / 100 : null, rate: r.rate, amount: r.amount,
      doc: doc ? { id: doc.id, docNo: doc.docNo, status: doc.status, amount: doc.amount ?? 0, diff: r.amount - (doc.amount ?? 0) } : null,
    });
  }
  return out;
}

/**
 * ĐỐI CHIẾU ĐƠN ĐẶT ↔ PHIẾU NHẬP (MH21) — theo vết: mỗi dòng = một đơn × một mã (đặt / đã nhận / đang chờ / chênh / lệch giá /
 * đổi mã / mã giao ngoài đơn + các phiếu nhập), kèm phiếu nhập NGOÀI ĐƠN (không theo đơn nào) trong kỳ. Lọc theo ngày đơn (phiếu
 * ngoài đơn: ngày phiếu), NCC, chi nhánh.
 */
export async function orderReconcileReport(trx: Db, tenantId: string, ctx: Ctx, f: { from?: string; to?: string; partnerCode?: string; branchCode?: string }) {
  const inRange = (d: StoredDoc) => (!f.from || d.docDate >= f.from) && (!f.to || d.docDate <= f.to) && (!f.partnerCode || d.partnerCode === f.partnerCode) && (!f.branchCode || d.branchCode === f.branchCode);
  const orders = ctx.docs.filter((d) => d.kind === 'order' && d.status === 'approved' && inRange(d));
  const recIds = new Set(orders.flatMap((o) => ctx.docs.filter((d) => d.kind === 'receipt' && (d.refIds ?? []).includes(o.id)).map((d) => d.id)));
  const units = await unitsOf(trx, tenantId, ctx.docs.filter((d) => d.kind === 'order' || recIds.has(d.id)).flatMap((d) => d.lines.map((l) => l.sku)));
  const rows = orders.flatMap((o) => orderReconcile(o, ctx.docs, units).map((l) => ({ orderId: o.id, orderNo: o.docNo, orderDate: o.docDate, partnerCode: o.partnerCode, branchCode: o.branchCode, ...l })));
  // Phiếu nhập ngoài đơn (không gắn đơn nào): mỗi mã một dòng, tình trạng "ngoài đơn".
  const outside = ctx.docs.filter((d) => d.kind === 'receipt' && d.status !== 'cancelled' && !(d.refIds ?? []).length && d.lines.some((l) => l.lineType === 'buy') && inRange(d));
  for (const d of outside) for (const l of d.lines.filter((x) => x.lineType === 'buy' && x.sku)) {
    const approved = d.status === 'approved';
    rows.push({ orderId: '', orderNo: '', orderDate: d.docDate, partnerCode: d.partnerCode, branchCode: d.branchCode, sku: l.sku, name: l.name, unit: l.unit, ordered: 0, received: approved ? l.qty : 0, pending: approved ? 0 : l.qty, diff: approved ? l.qty : 0,
      state: 'ngoai_don', orderPrice: null, receivedPrice: approved ? l.price : null, priceDiffPct: null, swappedTo: [], receipts: [{ id: d.id, docNo: d.docNo, docDate: d.docDate, status: d.status, sku: l.sku, qty: l.qty, unit: l.unit, price: l.price }],
      outsideReason: d.outsideOrder?.reason ?? '' } as (typeof rows)[number]);
  }
  const count = (s: string) => rows.filter((r) => r.state === s).length;
  return { rows, orders: orders.length, outsideReceipts: outside.length, summary: { du: count('du'), thieu: count('thieu'), thua: count('thua'), ngoai_don: count('ngoai_don'), doi_ma: count('doi_ma'), lech_gia: rows.filter((r) => r.priceDiffPct !== null && Math.abs(r.priceDiffPct) >= 0.01).length } };
}

/**
 * VIỆC CẦN LÀM của phân hệ Mua hàng (trang Quy trình): phần mềm tự gom những việc kế toán phải xử lý, khỏi đi tìm từng màn.
 * Kèm số chứng từ theo loại / trạng thái để hiện trên từng bước của sơ đồ.
 */
export async function purchaseTodo(trx: Db, tenantId: string, ctx: Ctx, asOf = today()) {
  const byKind: Record<string, { draft: number; pending: number; approved: number }> = {};
  for (const d of ctx.docs) {
    const k = (byKind[d.kind] ??= { draft: 0, pending: 0, approved: 0 });
    if (d.status === 'draft') k.draft++; else if (d.status === 'pending_approval') k.pending++; else if (d.status === 'approved') k.approved++;
  }
  const orderUnits = await unitsForOrders(trx, tenantId, ctx.docs);
  const openOrders = ctx.docs.filter((d) => d.kind === 'order' && d.status === 'approved' && !orderProgress(d, ctx.docs, undefined, orderUnits).done);
  const blocked = ctx.docs.filter((d) => (d.status === 'draft' || d.status === 'pending_approval') && (d.checks ?? []).some((c) => c.level === 'error'));
  const due = await dueList(trx, tenantId, ctx, { asOf });
  const overdue = due.rows.filter((r) => r.bucket >= 2), dueToday = due.rows.filter((r) => r.bucket === 1), soon = due.rows.filter((r) => r.daysToDue > 0 && r.daysToDue <= ctx.settings.warnDays);
  const lots = (await lotStock(trx, tenantId, ctx, asOf)).lots;
  const rebates = (await rebateOverview(trx, tenantId, ctx, asOf.slice(0, 7))).filter((r) => r.amount > 0 && (!r.doc || r.doc.diff !== 0 || r.doc.status !== 'approved'));
  const costs = ctx.docs.filter((d) => d.kind === 'cost' && d.status !== 'cancelled' && !d.refIds?.length);
  const giftOver = giftLedger(ctx).rows.filter((r) => r.onHand < 0);
  const sum = (rs: { remaining: number }[]) => rs.reduce((s, r) => s + r.remaining, 0);
  type Item = { key: string; level: 'error' | 'warn' | 'info'; text: string; count: number; amount?: number; path: string };
  const items: Item[] = [];
  const pending = ctx.docs.filter((d) => d.status === 'pending_approval');
  if (pending.length) items.push({ key: 'pending', level: 'warn', text: 'Chứng từ chờ duyệt', count: pending.length, path: '/mua-hang/chung-tu?trang-thai=pending_approval' });
  if (blocked.length) items.push({ key: 'blocked', level: 'error', text: 'Phiếu còn lỗi chặn duyệt (hạn mức, lô, trùng hoá đơn…)', count: blocked.length, path: '/mua-hang/chung-tu?loi=1' });
  if (overdue.length) items.push({ key: 'overdue', level: 'error', text: 'Khoản nợ NCC quá hạn', count: overdue.length, amount: sum(overdue), path: '/mua-hang/han-muc?tab=den-han' });
  if (dueToday.length) items.push({ key: 'due', level: 'warn', text: 'Khoản nợ NCC đến hạn hôm nay', count: dueToday.length, amount: sum(dueToday), path: '/mua-hang/han-muc?tab=den-han' });
  if (soon.length) items.push({ key: 'soon', level: 'info', text: `Khoản nợ sắp đến hạn (${ctx.settings.warnDays} ngày tới)`, count: soon.length, amount: sum(soon), path: '/mua-hang/han-muc?tab=den-han' });
  if (openOrders.length) items.push({ key: 'orders', level: 'info', text: 'Đơn đặt hàng chưa nhận đủ hàng', count: openOrders.length, amount: openOrders.reduce((s, d) => { const p = orderProgress(d, ctx.docs, undefined, orderUnits); return s + (p.ordered ? (d.totals.total * p.remaining) / p.ordered : 0); }, 0), path: '/mua-hang/chung-tu?loai=order' });
  const exp = lots.filter((l) => l.level === 'expired'), near = lots.filter((l) => l.level === 'm7' || l.level === 'm15' || l.level === 'm30');
  if (exp.length) items.push({ key: 'expired', level: 'error', text: 'Lô hàng đã hết hạn còn tồn', count: exp.length, path: '/mua-hang/lo-han' });
  if (near.length) items.push({ key: 'near', level: 'warn', text: 'Lô hàng còn ≤ 30 ngày hết hạn', count: near.length, path: '/mua-hang/lo-han' });
  if (rebates.length) items.push({ key: 'rebates', level: 'info', text: 'Thưởng đã đạt chưa lập / chưa hạch toán / có chênh', count: rebates.length, amount: rebates.reduce((s, r) => s + r.amount, 0), path: '/mua-hang/thuong' });
  if (costs.length) items.push({ key: 'costs', level: 'warn', text: 'Chi phí mua hàng chưa phân bổ vào phiếu nhập', count: costs.length, path: '/mua-hang/phan-bo' });
  // Phiếu nhập ngoài đơn (ngoại lệ, đã duyệt) kế toán chưa rà soát — xử lý riêng.
  const outside = ctx.docs.filter((d) => d.kind === 'receipt' && d.status === 'approved' && d.outsideOrder?.by && !d.outsideOrder.reviewedBy);
  if (outside.length) items.push({ key: 'outside', level: 'warn', text: 'Phiếu nhập ngoài đơn (không theo đơn đặt) chưa rà soát', count: outside.length, amount: outside.reduce((s, d) => s + d.totals.total, 0), path: '/mua-hang/chung-tu?ngoai-don=cho' });
  if (giftOver.length) items.push({ key: 'gifts', level: 'error', text: 'Quà xuất vượt tồn', count: giftOver.length, path: '/mua-hang/qua-tang' });
  // Hoá đơn NCC (MH22): còn dòng chưa nhận diện mã → phải chọn mã (phần mềm học) thì phiếu nhập mới lấy đủ dòng; chưa có phiếu nhập → lập phiếu.
  const invs = await trx.selectFrom('supplier_invoices as i').select(['i.id', 'i.partner_code', 'i.invoice_series', 'i.invoice_no', 'i.total',
    sql<string>`(SELECT COUNT(*) FROM supplier_invoice_lines l WHERE l.invoice_id = i.id AND l.sku IS NULL)`.as('unmatched')])
    .where('i.tenant_id', '=', tenantId).where('i.status', '=', 'active').execute();
  const invUnmatched = invs.filter((x) => toNumber(x.unmatched) > 0);
  if (invUnmatched.length) items.push({ key: 'inv_unmatched', level: 'error', text: 'Hoá đơn NCC còn dòng chưa nhận diện mã — chọn mã để phần mềm học, phiếu nhập mới lấy đủ dòng', count: invUnmatched.length, amount: invUnmatched.reduce((s, x) => s + toNumber(x.total), 0), path: '/mua-hang/hoa-don-ncc?tinh-trang=chua_nhan_dien' });
  const rcpts = ctx.docs.filter((d) => d.kind === 'receipt' && d.status !== 'cancelled' && d.invoice?.no);
  const invNoReceipt = invs.filter((x) => !rcpts.some((d) => d.partnerCode === x.partner_code && sameInvoice({ no: d.invoice!.no, series: d.invoice!.serial }, { no: x.invoice_no, series: x.invoice_series })));
  if (invNoReceipt.length) items.push({ key: 'inv_no_receipt', level: 'warn', text: 'Hoá đơn NCC chưa có phiếu nhập', count: invNoReceipt.length, amount: invNoReceipt.reduce((s, x) => s + toNumber(x.total), 0), path: '/mua-hang/hoa-don-ncc?tinh-trang=chua_co_phieu' });
  const drafts = ctx.docs.filter((d) => d.status === 'draft');
  if (drafts.length) items.push({ key: 'drafts', level: 'info', text: 'Phiếu nháp chưa gửi duyệt', count: drafts.length, path: '/mua-hang/chung-tu?trang-thai=draft' });
  return { asOf, byKind, items };
}
