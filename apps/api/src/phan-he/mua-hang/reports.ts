// @bizcity-layer D modules/mua-hang
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
  type TraceItem, TAX_RATE, priceFor, AGING_BUCKETS, agingBucket, allocate, baseUnitOf, ratioOf, brandMix, brandShare, computeDoc, creditStatus, daysBetween, expiryState, invoiceDueDate, orderInvoice, orderProgress, orderReconcile, rebateFor, sameInvoice, scheduleStatus,
  type LotStock, type Policy,
  scopeBranches, deliveryBranches, contractApplies } from '@bizcity/mua-hang-domain';
import { toNumber, type Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { apBalance, contractUsage, looseDebt, openOf, soleContract, openOfBrand, pendingOf, type Ctx } from './analysis.js';
import { refReceipts, spreadOverMany } from './posting.js';
import { listSupplierProducts, unitsForOrders, unitsOf } from './gia-mua.js';
import { noDueDate, type StoredDoc } from './store.js';
// [2026-11-05 01:50 PM Nguyễn Văn Thủy] PHASE-026 — S026-21: sổ kho theo mã hiện hành (đóng góp)
import { theoMa } from './ma-hien-hanh.js';

const evs = (ds: StoredDoc[]) => ds.flatMap((d) => d.links.map((l) => l.eventId)).filter(Boolean);
export const today = () => new Date().toISOString().slice(0, 10);

/** Hạn mức nhãn đang bị chiếm ở một chi nhánh: nợ nhãn đã ghi (số dư đầu + phiếu đã duyệt còn mở) và phiếu đang chờ. */
export async function brandBranchUsage(trx: Db, tenantId: string, ctx: Ctx, brand: string, branch: string, asOf = today()) {
  const docs = ctx.docs.filter((d) => d.branchCode === branch && d.status === 'approved' && ['receipt', 'return', 'exchange', 'cost'].includes(d.kind));
  const current = (ctx.settings.brandOpening[brand]?.[branch] ?? 0) + (await openOfBrand(trx, tenantId, docs, brand));
  return { current, pending: pendingOf(ctx.docs, (d) => d.branchCode === branch, asOf, undefined, (d) => brandShare(d, brand)) };
}

export async function creditOverview(trx: Db, tenantId: string, ctx: Ctx, asOf = today()) {
  // Hạn mức còn hiệu lực ở ngày xem (từ / đến), không chỉ đang bật.
  const limits = ctx.policies.filter((p) => p.kind === 'credit_limit' && p.isActive && (!p.validFrom || p.validFrom <= asOf) && (!p.validTo || p.validTo >= asOf));
  const partners = [];
  for (const p of limits.filter((x) => x.scope.partnerCode && !x.scope.brandCode)) {
    const code = p.scope.partnerCode!;
    // [2026-11-21 Nguyễn Văn Thủy] hạn mức của hợp đồng tính trên phiếu thuộc hợp đồng; không gắn hợp đồng = hạn mức chung / ngoài hợp đồng (đóng góp)
    const cc = p.scope.contractCode;
    const cuaHd = (d: StoredDoc) => d.partnerCode === code && Boolean(d.contractCode);
    const u = cc ? await contractUsage(trx, tenantId, ctx.docs, cc, asOf)
      : { current: (await apBalance(trx, tenantId, code, asOf)) - (await openOf(trx, tenantId, ctx.docs.filter((d) => cuaHd(d) && d.status === 'approved' && d.docDate <= asOf).flatMap((d) => d.links.map((l) => l.eventId)).filter(Boolean)))
          - ((await soleContract(trx, tenantId, code, asOf)) ? await looseDebt(trx, tenantId, code, ctx.docs, asOf) : 0),
          pending: pendingOf(ctx.docs, (d) => d.partnerCode === code && !d.contractCode, asOf) };
    const s = creditStatus(p, u.current, u.pending, 0)!;
    partners.push({ policy: p.code, partnerCode: code, contractCode: cc ?? '', ...s });
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

export interface DueRow { debtItemId: string; partnerCode: string; partnerName: string; branchCode: string; docNo: string; purchaseDocId?: string; contractCode: string; docDate: string; seq?: number; dueDate: string; amount: number; paid: number; remaining: number; bucket: number; daysOverdue: number; daysToDue: number }

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
    const base = { debtItemId: String(i.id), partnerCode: i.partner_code, partnerName: i.partner_name, branchCode: i.branch_code, docNo: i.doc_no, purchaseDocId: doc?.id, contractCode: doc?.contractCode ?? '', docDate: String(i.doc_date).slice(0, 10) };
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
    const rows = await trx.selectFrom('inventory_movements_cur as m').innerJoin('branches as b', 'b.id', 'm.branch_id')
      .select(['b.code as branch_code', 'm.sku', sql<string>`SUM(m.qty)`.as('qty')])
      .where('m.tenant_id', '=', tenantId).where(theoMa(tenantId, [...new Set([...lots.values()].map((l) => l.sku))], 'm.item_id')).where('m.doc_date', '<=', asOf)
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

/** Mã NCC và mọi cấp đơn vị con của nó (cha – con, 0132). */
async function partnerFamily(trx: Db, tenantId: string, code: string): Promise<string[]> {
  const r = await sql<{ code: string }>`
    WITH RECURSIVE t AS (
      SELECT uid, code FROM partners WHERE tenant_id = ${tenantId} AND code = ${code}
      UNION ALL
      SELECT p.uid, p.code FROM partners p JOIN t ON p.parent_uid = t.uid WHERE p.tenant_id = ${tenantId}
    ) SELECT code FROM t`.execute(trx);
  return r.rows.length ? r.rows.map((x) => x.code) : [code];
}

export async function rebatePreview(trx: Db, tenantId: string, ctx: Ctx, p: Policy, period: string, manualTotal?: number) {
  const [from, to] = periodRange(period);
  // [2026-11-13 Nguyễn Văn Thủy] ký với công ty mẹ, tính trên cả nhóm: cộng phiếu của NCC ký và mọi đơn vị con (đóng góp)
  const partners = p.scope.partnerCode ? (p.rule.family ? await partnerFamily(trx, tenantId, p.scope.partnerCode) : [p.scope.partnerCode]) : null;
  const match = (d: StoredDoc) => d.status === 'approved' && d.docDate >= from && d.docDate <= to && (d.kind === 'receipt' || d.kind === 'return')
    && (!p.scope.brandCode || brandShare(d, p.scope.brandCode) > 0) && (!partners || partners.includes(d.partnerCode)) && (!scopeBranches(p.scope).length || scopeBranches(p.scope).includes(d.branchCode))
    && contractApplies(p, d.contractCode); // thưởng của hợp đồng X chỉ tính phiếu thuộc X; thưởng ngoài hợp đồng chỉ tính phiếu không theo hợp đồng
  // Thưởng theo nhãn: chỉ cộng các dòng thuộc nhãn (nhãn của mặt hàng; phiếu cũ chưa ghi nhãn dòng thì theo nhãn phiếu).
  const inBrand = (l: { brandCode?: string }, d: StoredDoc) => !p.scope.brandCode || (l.brandCode ?? d.brandCode) === p.scope.brandCode;
  const byDay: Record<number, number> = {};
  const skus = new Map<string, { sku: string; name: string; purchased: number; qty: number }>();
  // Theo ngày: giá trị mua từng mã (thưởng giai đoạn chỉ chia cho hàng mua trong giai đoạn được thưởng).
  const skuDay = new Map<string, Map<number, number>>();
  /** Doanh số theo từng đơn vị (NCC ký / đơn vị con) và theo chi nhánh bên mình — xem ai đóng góp bao nhiêu. */
  const byPartner = new Map<string, number>(), byBranch = new Map<string, number>();
  for (const d of ctx.docs.filter(match)) {
    const sign = d.kind === 'return' ? -1 : 1;
    const c = computeDoc(d, []);
    const day = Number(d.docDate.slice(8, 10));
    const v = sign * c.lines.filter((l) => inBrand(l, d)).reduce((s, l) => s + l.beforeTax, 0);
    byDay[day] = (byDay[day] ?? 0) + v;
    byPartner.set(d.partnerCode, (byPartner.get(d.partnerCode) ?? 0) + v);
    byBranch.set(d.branchCode, (byBranch.get(d.branchCode) ?? 0) + v);
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
    const inv = await trx.selectFrom('inventory_movements_cur').select(['sku', sql<string>`SUM(qty)`.as('qty')]).where('tenant_id', '=', tenantId).where(theoMa(tenantId, rows.map((x) => x.sku))).where('doc_date', '<=', to).groupBy('sku').execute();
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
  const top = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).map(([code, value]) => ({ code, value }));
  const branches = top(byBranch);
  const parties = {
    signedWith: p.scope.partnerCode ?? null, family: Boolean(p.rule.family && p.scope.partnerCode), members: partners ?? [],
    payer: String(p.rule.payer ?? '') || p.scope.partnerCode || null,
    receiver: String(p.rule.receiver ?? '') || scopeBranches(p.scope)[0] || branches[0]?.code || null,
  };
  return { policy: p.code, kind: p.kind, period, from, to, docsTotal, base: r.base, rate: r.rate, amount: r.amount, detail: r.detail, byDay, allocation, byPartner: top(byPartner), byBranch: branches, parties, existing: existing ? { id: existing.id, docNo: existing.docNo } : null };
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
      // Còn nợ NCC của chính phiếu này: cước chưa trả (+), thưởng / giảm giá chưa trừ vào hoá đơn nào (−) — chia theo phân bổ;
      // gom theo NCC thì ghi vào NCC của phiếu (người được trả / người giảm nợ), không phải NCC của phiếu nhập gốc.
      const open = await openOf(trx, tenantId, d.links.map((l) => l.eventId));
      const allocTotal = d.allocation.reduce((s, x) => s + x.amount, 0);
      for (const al of d.allocation) {
        const a = agg(f.groupBy === 'partner' && ref ? ref : d, al.sku);
        if (d.kind === 'cost') a.cost += al.amount; else a.rebate += al.amount;
        if (open && allocTotal) agg(d, al.sku).openDebt += Math.round((open * al.amount) / allocTotal);
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
      policy: p.code, name: p.name, kind: p.kind, brandCode: p.scope.brandCode, partnerCode: p.scope.partnerCode, parties: r.parties, period, base: r.base, target: target || null,
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
  const orders = ctx.docs.filter((d) => d.kind === 'order' && d.status === 'approved' && (inRange(d) || (Boolean(f.branchCode) && inRange({ ...d, branchCode: f.branchCode! }) && deliveryBranches(d).includes(f.branchCode!))));
  const recIds = new Set(orders.flatMap((o) => ctx.docs.filter((d) => d.kind === 'receipt' && (d.refIds ?? []).includes(o.id)).map((d) => d.id)));
  const units = await unitsOf(trx, tenantId, ctx.docs.filter((d) => d.kind === 'order' || recIds.has(d.id)).flatMap((d) => d.lines.map((l) => l.sku)));
  // [2026-11-20 khanhtd] MUA-HANG — mỗi dòng mang tình trạng hoá đơn của đơn (gom phiếu nhập của đơn); phiếu ngoài đơn: hoá đơn của chính phiếu (đóng góp)
  type Inv = { state: 'chua_nhap' | 'chua_co' | 'mot_phan' | 'du'; text: string };
  const invOf = new Map(orders.map((o) => { const x = orderInvoice(o, ctx.docs)!; return [o.id, { state: x.state, text: x.text } as Inv]; }));
  // [2026-11-21 Nguyễn Văn Thủy] đơn giao nhiều chi nhánh: mỗi dòng = đơn × CHI NHÁNH NHẬN × mã (phiếu nhập của chi nhánh đó) (đóng góp)
  const rows = orders.flatMap((o) => { const ns = deliveryBranches(o); const many = ns.length > 1 || Boolean(o.deliveryBranch);
    return (many ? ns : [undefined]).flatMap((b) => orderReconcile(o, ctx.docs, units, b).map((l) => ({ orderId: o.id, orderNo: o.docNo, orderDate: o.docDate, partnerCode: o.partnerCode, branchCode: b ?? o.branchCode, ...l, invoice: invOf.get(o.id)! })))
      .filter((r) => !f.branchCode || r.branchCode === f.branchCode || o.branchCode === f.branchCode); });
  // Phiếu nhập ngoài đơn (không gắn đơn nào): mỗi mã một dòng, tình trạng "ngoài đơn".
  const outside = ctx.docs.filter((d) => d.kind === 'receipt' && d.status !== 'cancelled' && !(d.refIds ?? []).length && d.lines.some((l) => l.lineType === 'buy') && inRange(d));
  for (const d of outside) for (const l of d.lines.filter((x) => x.lineType === 'buy' && x.sku)) {
    const approved = d.status === 'approved';
    rows.push({ orderId: '', orderNo: '', orderDate: d.docDate, partnerCode: d.partnerCode, branchCode: d.branchCode, sku: l.sku, name: l.name, unit: l.unit, ordered: 0, received: approved ? l.qty : 0, pending: approved ? 0 : l.qty, diff: approved ? l.qty : 0,
      state: 'ngoai_don', orderPrice: null, receivedPrice: approved ? l.price : null, priceDiffPct: null, swappedTo: [], receipts: [{ id: d.id, docNo: d.docNo, docDate: d.docDate, status: d.status, sku: l.sku, qty: l.qty, unit: l.unit, price: l.price }],
      outsideReason: d.outsideOrder?.reason ?? '', invoice: (d.invoice?.no ? { state: 'du', text: `Có HĐ ${d.invoice.serial ? `${d.invoice.serial}-` : ''}${d.invoice.no}` } : { state: 'chua_co', text: 'Chưa có HĐ' }) as Inv } as (typeof rows)[number]);
  }
  const count = (s: string) => rows.filter((r) => r.state === s).length;
  const invCount = (s: Inv['state']) => [...invOf.values()].filter((x) => x.state === s).length;
  return { rows, orders: orders.length, outsideReceipts: outside.length, invoiceSummary: { chua_nhap: invCount('chua_nhap'), chua_co: invCount('chua_co'), mot_phan: invCount('mot_phan'), du: invCount('du') }, summary: { du: count('du'), thieu: count('thieu'), thua: count('thua'), ngoai_don: count('ngoai_don'), doi_ma: count('doi_ma'), lech_gia: rows.filter((r) => r.priceDiffPct !== null && Math.abs(r.priceDiffPct) >= 0.01).length } };
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
  if (pending.length) items.push({ key: 'pending', level: 'warn', text: 'Chứng từ chờ duyệt', count: pending.length, path: '/mua-hang/tong-hop?trang-thai=pending_approval' });
  // [2026-11-21 Nguyễn Văn Thủy] phiếu vượt hạn mức công nợ chưa được duyệt ngoại lệ — người có quyền phải duyệt hoặc giảm đơn (đóng góp)
  const overLimit = ctx.docs.filter((d) => (d.status === 'draft' || d.status === 'pending_approval') && !d.override && (d.checks ?? []).some((c) => c.code === 'credit_exceeded'));
  if (overLimit.length) items.push({ key: 'credit_over', level: 'error', text: 'Vượt hạn mức công nợ NCC — chờ duyệt ngoại lệ', count: overLimit.length, amount: overLimit.reduce((s, d) => s + d.totals.total, 0), path: '/mua-hang/tong-hop?loi=1' });
  // [2026-11-21 Nguyễn Văn Thủy] phiếu nhập lệch SL thực nhận ↔ hoá đơn (đóng góp)
  const invQty = ctx.docs.filter((d) => d.kind === 'receipt' && d.status !== 'cancelled' && !d.override && (d.checks ?? []).some((c) => c.code === 'inv_qty_diff'));
  if (invQty.length) items.push({ key: 'inv_qty_diff', level: 'error', text: 'Phiếu nhập lệch SL thực nhận ↔ hoá đơn', count: invQty.length, path: '/mua-hang/doi-chieu-hoa-don?trang=lech' });
  if (blocked.length) items.push({ key: 'blocked', level: 'error', text: 'Phiếu còn lỗi chặn duyệt (hạn mức, lô, trùng hoá đơn…)', count: blocked.length, path: '/mua-hang/tong-hop?loi=1' });
  if (overdue.length) items.push({ key: 'overdue', level: 'error', text: 'Khoản nợ NCC quá hạn', count: overdue.length, amount: sum(overdue), path: '/mua-hang/han-muc?tab=den-han' });
  if (dueToday.length) items.push({ key: 'due', level: 'warn', text: 'Khoản nợ NCC đến hạn hôm nay', count: dueToday.length, amount: sum(dueToday), path: '/mua-hang/han-muc?tab=den-han' });
  if (soon.length) items.push({ key: 'soon', level: 'info', text: `Khoản nợ sắp đến hạn (${ctx.settings.warnDays} ngày tới)`, count: soon.length, amount: sum(soon), path: '/mua-hang/han-muc?tab=den-han' });
  if (openOrders.length) items.push({ key: 'orders', level: 'info', text: 'Đơn đặt hàng chưa nhận đủ hàng', count: openOrders.length, amount: openOrders.reduce((s, d) => { const p = orderProgress(d, ctx.docs, undefined, orderUnits); return s + (p.ordered ? (d.totals.total * p.remaining) / p.ordered : 0); }, 0), path: '/mua-hang/tong-hop?loai=order' });
  const exp = lots.filter((l) => l.level === 'expired'), near = lots.filter((l) => l.level === 'm7' || l.level === 'm15' || l.level === 'm30');
  if (exp.length) items.push({ key: 'expired', level: 'error', text: 'Lô hàng đã hết hạn còn tồn', count: exp.length, path: '/mua-hang/lo-han' });
  if (near.length) items.push({ key: 'near', level: 'warn', text: 'Lô hàng còn ≤ 30 ngày hết hạn', count: near.length, path: '/mua-hang/lo-han' });
  if (rebates.length) items.push({ key: 'rebates', level: 'info', text: 'Thưởng đã đạt chưa lập / chưa hạch toán / có chênh', count: rebates.length, amount: rebates.reduce((s, r) => s + r.amount, 0), path: '/mua-hang/thuong' });
  if (costs.length) items.push({ key: 'costs', level: 'warn', text: 'Chi phí mua hàng chưa phân bổ vào phiếu nhập', count: costs.length, path: '/mua-hang/phan-bo' });
  // Phiếu nhập ngoài đơn (ngoại lệ, đã duyệt) kế toán chưa rà soát — xử lý riêng.
  const outside = ctx.docs.filter((d) => d.kind === 'receipt' && d.status === 'approved' && d.outsideOrder?.by && !d.outsideOrder.reviewedBy);
  if (outside.length) items.push({ key: 'outside', level: 'warn', text: 'Phiếu nhập ngoài đơn (không theo đơn đặt) chưa rà soát', count: outside.length, amount: outside.reduce((s, d) => s + d.totals.total, 0), path: '/mua-hang/tong-hop?ngoai-don=cho' });
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
  // [2026-11-20 Nguyễn Văn Thủy] SOÁT THIẾU / LỆCH theo cột "Kiểm soát hệ thống" của 11 bước mua hàng (motamuahangsau): Bàn làm việc
  // gắn từng việc vào đúng bước (B1 hồ sơ NCC, B2–3 hợp đồng & giá, B5–6 đơn đặt, B8 nhập kho ↔ hoá đơn, B10 trả hàng, B11 thanh lý) (đóng góp)
  const live = ctx.docs.filter((d) => d.status !== 'cancelled');
  const used = [...new Set(live.map((d) => d.partnerCode).filter(Boolean))];
  if (used.length) {
    const sups = await trx.selectFrom('partners').select(['code', 'tax_code']).where('tenant_id', '=', tenantId).where('code', 'in', used).execute();
    const noTax = sups.filter((x) => !String(x.tax_code ?? '').trim());
    if (noTax.length) items.push({ key: 'ncc_no_tax', level: 'warn', text: 'NCC đã có chứng từ mà chưa khai mã số thuế', count: noTax.length, path: '/mua-hang/nha-cung-cap' });
    const byTax = new Map<string, number>();
    for (const x of sups) { const t = String(x.tax_code ?? '').trim(); if (t) byTax.set(t, (byTax.get(t) ?? 0) + 1); }
    const dupTax = [...byTax.values()].filter((n) => n > 1).length;
    if (dupTax) items.push({ key: 'ncc_dup_tax', level: 'error', text: 'Mã số thuế trùng giữa các NCC', count: dupTax, path: '/mua-hang/nha-cung-cap' });
  }
  const contracts = (await trx.selectFrom('dimensions').select(['code', 'extra']).where('tenant_id', '=', tenantId).where('kind', '=', 'contract')
    .where(sql<boolean>`extra->>'type' = 'goods_supplier'`).execute()).map((c) => ({ code: c.code, x: (c.extra ?? {}) as Record<string, unknown> }));
  const endOf = (c: { x: Record<string, unknown> }) => (typeof c.x.endDate === 'string' ? c.x.endDate.slice(0, 10) : '');
  const activeC = contracts.filter((c) => c.x.status !== 'liquidated' && c.x.status !== 'draft');
  const in30 = new Date(Date.parse(asOf) + 30 * 86400000).toISOString().slice(0, 10);
  const expired = activeC.filter((c) => endOf(c) && endOf(c) < asOf);
  const expiring = activeC.filter((c) => endOf(c) && endOf(c) >= asOf && endOf(c) <= in30);
  if (expired.length) items.push({ key: 'contract_expired', level: 'warn', text: 'Hợp đồng đã hết hạn chưa thanh lý', count: expired.length, path: '/mua-hang/hop-dong' });
  if (expiring.length) items.push({ key: 'contract_expiring', level: 'info', text: 'Hợp đồng hết hạn trong 30 ngày tới', count: expiring.length, path: '/mua-hang/hop-dong' });
  if (activeC.length) {
    const priced = new Set((await trx.selectFrom('supplier_products').select('contract_code').where('tenant_id', '=', tenantId).where('is_active', '=', true)
      .where('contract_code', 'in', activeC.map((c) => c.code)).execute()).map((r) => r.contract_code));
    const noPrice = activeC.filter((c) => !priced.has(c.code));
    if (noPrice.length) items.push({ key: 'contract_no_price', level: 'warn', text: 'Hợp đồng chưa khai bảng giá mua', count: noPrice.length, path: '/mua-hang/hop-dong' });
  }
  const orderNoContract = live.filter((d) => d.kind === 'order' && !d.contractCode);
  if (orderNoContract.length) items.push({ key: 'order_no_contract', level: 'warn', text: 'Đơn đặt hàng không gắn hợp đồng (giá không lấy theo hợp đồng)', count: orderNoContract.length, path: '/mua-hang/tong-hop?loai=order' });
  const priceDiff = live.filter((d) => (d.kind === 'order' || d.kind === 'receipt') && (d.checks ?? []).some((c) => c.code === 'price_fixed'));
  if (priceDiff.length) items.push({ key: 'price_diff', level: 'warn', text: 'Đơn / phiếu nhập có giá lệch hợp đồng', count: priceDiff.length, path: '/mua-hang/doi-chieu' });
  const orderPending = ctx.docs.filter((d) => d.kind === 'order' && d.status === 'pending_approval');
  if (orderPending.length) items.push({ key: 'order_pending', level: 'warn', text: 'Đơn đặt hàng chờ duyệt', count: orderPending.length, path: '/mua-hang/tong-hop?loai=order&trang-thai=pending_approval' });
  // Hoá đơn đầu vào theo kế hoạch của đơn (phiếu nhập kế thừa): cùng hàng mà chưa có → thiếu; nhận sau N ngày → chờ (trong hạn) / quá hạn; không lấy → bỏ qua.
  const byIdDoc = new Map(ctx.docs.map((d) => [d.id, d]));
  const planOf = (d: StoredDoc) => d.invoicePlan ?? (d.refIds?.[0] ? byIdDoc.get(d.refIds[0])?.invoicePlan : undefined);
  const rcptNoInv = ctx.docs.filter((d) => d.kind === 'receipt' && d.status === 'approved' && !d.invoice?.no && planOf(d)?.mode !== 'none');
  const hanHd = (d: StoredDoc) => invoiceDueDate(planOf(d), d.docDate, d.refIds?.[0] ? byIdDoc.get(d.refIds[0])?.docDate : undefined);
  const invLate = rcptNoInv.filter((d) => planOf(d)?.mode === 'later' && hanHd(d) < asOf);
  const invWait = rcptNoInv.filter((d) => planOf(d)?.mode === 'later' && hanHd(d) >= asOf);
  const invMissing = rcptNoInv.filter((d) => planOf(d)?.mode !== 'later');
  const tong = (ds: StoredDoc[]) => ds.reduce((s, d) => s + d.totals.total, 0);
  if (invLate.length) items.push({ key: 'inv_late', level: 'error', text: 'Phiếu nhập quá hạn nhận hoá đơn NCC', count: invLate.length, amount: tong(invLate), path: '/mua-hang/doi-chieu-hoa-don?trang=qua-han' });
  if (invMissing.length) items.push({ key: 'receipt_no_invoice', level: 'warn', text: 'Phiếu nhập chưa có hoá đơn NCC (hoá đơn giao kèm hàng)', count: invMissing.length, amount: tong(invMissing), path: '/mua-hang/doi-chieu-hoa-don?trang=thieu' });
  if (invWait.length) items.push({ key: 'inv_wait', level: 'info', text: 'Phiếu nhập chờ hoá đơn NCC (còn trong hạn)', count: invWait.length, amount: tong(invWait), path: '/mua-hang/doi-chieu-hoa-don?trang=cho' });
  const returnNoRef = live.filter((d) => d.kind === 'return' && !d.refIds?.length);
  if (returnNoRef.length) items.push({ key: 'return_no_ref', level: 'error', text: 'Phiếu trả hàng chưa gắn phiếu nhập gốc', count: returnNoRef.length, path: '/mua-hang/tong-hop?loai=return' });
  const drafts = ctx.docs.filter((d) => d.status === 'draft');
  if (drafts.length) items.push({ key: 'drafts', level: 'info', text: 'Phiếu nháp chưa gửi duyệt', count: drafts.length, path: '/mua-hang/tong-hop?trang-thai=draft' });
  return { asOf, byKind, items };
}

// [2026-11-21 Nguyễn Văn Thủy] TÌNH HÌNH THỰC HIỆN CHÍNH SÁCH MUA HÀNG (MH32): doanh số đủ điều kiện, được hưởng, đã nhận, còn phải nhận — theo NCC / hợp đồng → chính sách → chứng từ (đóng góp)
export interface PolicyExecDoc { docNo: string; docId: string; docDate: string; branchCode: string; kind: string; base: number; amount: number; note: string }
export interface PolicyExecRow {
  policy: string; name: string; kind: string; partnerCode: string; contractCode: string; brandCode: string; validFrom: string; validTo: string;
  /** Doanh số trước thuế của các phiếu được áp (thưởng: doanh số kỳ tính thưởng). */
  base: number; entitled: number; received: number; remaining: number;
  /** Dự kiến: tạm tính theo doanh số hiện tại, chưa xác nhận (thưởng chưa lập phiếu; CKTT chưa thanh toán). */ expected: number;
  /** Đã xác nhận: số hai bên đã chốt (chiết khấu trên hoá đơn; phiếu thưởng đã lập; CKTT đã trừ khi trả tiền). */ confirmed: number;
  /** Cách nhận: trừ thẳng trên hoá đơn / trừ khi thanh toán đúng hạn / phiếu thưởng cuối kỳ / hàng tặng. */
  method: string; status: 'du' | 'con' | 'du-kien' | 'chua-dat'; docs: PolicyExecDoc[]; note: string;
}
const DOC_KINDS = ['trade_discount', 'item_discount', 'qty_tier', 'payment_discount', 'promo_gift'];
const REBATE_KINDS = ['period_rebate', 'target_rebate', 'stage_rebate'];
/** Các kỳ (YYYY-MM / YYYY-Qn / YYYY) của chính sách thưởng giao với [from, to]. */
function periodsIn(kind: string, from: string, to: string): string[] {
  const out = new Set<string>();
  let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
  const ey = Number(to.slice(0, 4)), em = Number(to.slice(5, 7));
  for (let i = 0; i < 240 && (y < ey || (y === ey && m <= em)); i++) {
    out.add(kind === 'year' ? String(y) : kind === 'quarter' ? `${y}-Q${Math.floor((m - 1) / 3) + 1}` : `${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return [...out];
}

export async function policyExecution(trx: Db, tenantId: string, ctx: Ctx, f: { from: string; to: string; partnerCode?: string; contractCode?: string }): Promise<PolicyExecRow[]> {
  const inRange = (d: StoredDoc) => d.docDate >= f.from && d.docDate <= f.to;
  const pols = ctx.policies.filter((p) => (DOC_KINDS.includes(p.kind) || REBATE_KINDS.includes(p.kind))
    && (!f.partnerCode || p.scope.partnerCode === f.partnerCode) && (f.contractCode === undefined || (p.scope.contractCode ?? '') === f.contractCode)
    && (!p.validFrom || p.validFrom <= f.to) && (!p.validTo || p.validTo >= f.from));
  const receipts = ctx.docs.filter((d) => d.kind === 'receipt' && d.status === 'approved' && inRange(d));
  const calcOf = new Map(receipts.map((d) => [d.id, computeDoc(d, [])]));
  const rows: PolicyExecRow[] = [];
  for (const p of pols) {
    const base0 = { policy: p.code, name: p.name, kind: p.kind, partnerCode: p.scope.partnerCode ?? '', contractCode: p.scope.contractCode ?? '', brandCode: p.scope.brandCode ?? '', validFrom: p.validFrom ?? '', validTo: p.validTo ?? '', note: '' };
    if (DOC_KINDS.includes(p.kind)) {
      const docs: PolicyExecDoc[] = [];
      let received = 0;
      for (const d of receipts) {
        const tr = ((d.policyTrace ?? []) as TraceItem[]).filter((t) => t.policy === p.code);
        if (!tr.length) continue;
        const c = calcOf.get(d.id)!;
        let amount = 0, note = '';
        if (p.kind === 'trade_discount') { amount = tr.reduce((t, x) => t + (x.amount ?? 0), 0) || c.orderDiscount; note = 'trừ trên hoá đơn'; }
        else if (p.kind === 'item_discount' || p.kind === 'qty_tier') {
          const skus = new Set(tr.map((x) => x.text.split(':')[0]!.trim()));
          amount = c.lines.filter((l) => skus.has(l.sku)).reduce((t, l) => t + l.lineDiscount, 0); note = 'trừ trên hoá đơn';
        } else if (p.kind === 'payment_discount') {
          amount = (c as { ckttExpected?: number }).ckttExpected ?? tr.reduce((t, x) => t + (x.amount ?? 0), 0);
          const paid = ctx.docs.filter((x) => x.kind === 'payment' && x.status === 'approved' && (x.refIds ?? []).includes(d.id)).reduce((t, x) => t + (x.ckttAmount ?? 0), 0);
          received += Math.min(amount, paid); note = paid ? `đã trừ khi thanh toán ${paid.toLocaleString('vi-VN')}` : 'chờ thanh toán đúng hạn';
        } else if (p.kind === 'promo_gift') {
          const gifts = c.lines.filter((l) => l.lineType !== 'buy' && (l.program === p.code || !l.program));
          const price = (sku: string) => { const b = c.lines.find((l) => l.sku === sku && l.lineType === 'buy'); return b && b.qty ? b.beforeTax / b.qty : 0; };
          amount = Math.round(gifts.reduce((t, l) => t + l.qty * price(l.sku), 0));
          note = `hàng tặng ${gifts.reduce((t, l) => t + l.qty, 0).toLocaleString('vi-VN')} (theo giá mua)`;
        }
        if (p.kind !== 'payment_discount') received += amount;
        docs.push({ docNo: d.docNo, docId: d.id, docDate: d.docDate, branchCode: d.branchCode, kind: d.kind, base: Math.round(d.totals.beforeTax), amount: Math.round(amount), note });
      }
      const entitled = docs.reduce((t, x) => t + x.amount, 0);
      // Chiết khấu / tặng trên hoá đơn: xác nhận = đã nhận ngay (không còn phải nhận, không cộng trùng vào công nợ). CKTT: đã trừ khi trả tiền = xác nhận + đã nhận;
      // phần chưa thanh toán còn là dự kiến (chỉ hưởng nếu trả đúng hạn).
      const nhan = Math.round(received);
      const expected = p.kind === 'payment_discount' ? Math.max(0, Math.round(entitled - nhan)) : 0;
      rows.push({ ...base0, base: docs.reduce((t, x) => t + x.base, 0), entitled, expected, confirmed: nhan, received: nhan, remaining: 0,
        method: p.kind === 'payment_discount' ? 'Trừ khi thanh toán đúng hạn' : p.kind === 'promo_gift' ? 'Hàng tặng kèm phiếu nhập' : 'Trừ thẳng trên hoá đơn',
        status: !docs.length ? 'chua-dat' : expected > 0.5 ? 'du-kien' : 'du', docs });
    } else {
      const docs: PolicyExecDoc[] = [];
      let base = 0, entitled = 0, received = 0, expected = 0, confirmed = 0;
      for (const per of periodsIn(String(p.rule.period ?? 'month'), f.from, f.to)) {
        // Kỳ đã có phiếu thưởng: số NCC chốt trên phiếu là số được hưởng; chưa có thì tạm tính từ phiếu nhập đã duyệt.
        const phieu = ctx.docs.filter((x) => x.kind === 'rebate' && x.status !== 'cancelled' && x.rebate?.policyCode === p.code && x.rebate.period === per);
        if (phieu.length) { base += phieu.reduce((t, d) => t + (d.rebate?.base ?? 0), 0); const c = phieu.reduce((t, d) => t + (d.amount ?? 0), 0); entitled += c; confirmed += c; }
        const pv = phieu.length ? { base: 0, amount: 0 } : await rebatePreview(trx, tenantId, ctx, p, per);
        base += pv.base; entitled += pv.amount; expected += pv.amount;
        for (const d of phieu) {
          if (d.status === 'approved') received += d.amount ?? 0;
          docs.push({ docNo: d.docNo || '(nháp)', docId: d.id, docDate: d.docDate, branchCode: d.branchCode, kind: d.kind, base: d.rebate?.base ?? 0, amount: d.amount ?? 0, note: `kỳ ${per} · ${d.status === 'approved' ? 'đã hạch toán' : 'chưa duyệt'}` });
        }
        if (pv.amount > 0 && !docs.some((x) => x.note.startsWith(`kỳ ${per}`))) docs.push({ docNo: '', docId: '', docDate: '', branchCode: '', kind: 'rebate', base: pv.base, amount: pv.amount, note: `kỳ ${per} · chưa lập phiếu thưởng` });
      }
      // Còn phải nhận = phần đã xác nhận (phiếu thưởng) chưa hạch toán; phần dự kiến (chưa lập phiếu) để riêng.
      const remaining = Math.max(0, Math.round(confirmed - received));
      rows.push({ ...base0, base: Math.round(base), entitled: Math.round(entitled), expected: Math.round(expected), confirmed: Math.round(confirmed), received: Math.round(received), remaining,
        method: 'Phiếu thưởng cuối kỳ (giảm công nợ)', status: entitled <= 0 ? 'chua-dat' : remaining > 0.5 ? 'con' : expected > 0.5 ? 'du-kien' : 'du', docs });
    }
  }
  return rows;
}

// [2026-11-21 Nguyễn Văn Thủy] ĐỐI CHIẾU GIÁ MUA THEO HỢP ĐỒNG (MH34): giá thoả thuận (hợp đồng / giá NCC ngoài hợp đồng) ↔ giá thực tế SAU CK, TRƯỚC VAT —
// chính thức theo HOÁ ĐƠN NCC (MH22, nối với phiếu nhập qua document_links attachesTo); chưa có hoá đơn thì tạm theo phiếu nhập; quy cùng ĐVT (đóng góp)
export interface PriceCheckRow {
  docId: string; docNo: string; docDate: string; branchCode: string; partnerCode: string; contractCode: string; sku: string; name: string; unit: string; qty: number;
  agreed: number | null; actual: number; diff: number | null; diffPct: number | null; diffAmount: number | null; source: string;
  /** Giá thực tế lấy từ: hoá đơn NCC (chính thức) / phiếu nhập (tạm, chưa có hoá đơn). */
  actualFrom: 'hoa-don' | 'phieu-nhap'; invoiceNos: string;
}
/** Dòng hoá đơn NCC (không tính hàng tặng) đính vào từng phiếu nhập (document_links attachesTo của sổ chứng từ chung). */
async function invoiceLinesOfReceipts(trx: Db, tenantId: string, receiptIds: string[]) {
  const out = new Map<string, { invoiceNo: string; sku: string; unit: string; qty: number; net: number }[]>();
  if (!receiptIds.length) return out;
  const rows = (await sql<{ rid: string; no: string; sku: string | null; unit: string | null; qty: string; price: string; disc: string }>`
    SELECT substr(l.to_ref, length('mua-hang.document:') + 1) AS rid, CASE WHEN i.invoice_series <> '' THEN i.invoice_series || '-' || i.invoice_no ELSE i.invoice_no END AS no,
           x.sku, x.unit, x.qty::text AS qty, x.price::text AS price, x.discount_amount::text AS disc
      FROM document_links l
      JOIN supplier_invoices i ON i.tenant_id = l.tenant_id AND i.id = substr(l.from_ref, length('mua-hang.invoice:') + 1)::bigint AND i.status = 'active'
      JOIN supplier_invoice_lines x ON x.tenant_id = i.tenant_id AND x.invoice_id = i.id AND NOT x.is_gift
     WHERE l.tenant_id = ${tenantId} AND l.role = 'attachesTo' AND l.from_ref LIKE 'mua-hang.invoice:%'
       AND l.to_ref = ANY(${receiptIds.map((r) => `mua-hang.document:${r}`)}::text[])`.execute(trx)).rows;
  for (const r of rows) {
    if (!r.sku) continue;
    const qty = toNumber(r.qty);
    (out.get(r.rid) ?? out.set(r.rid, []).get(r.rid)!).push({ invoiceNo: r.no, sku: r.sku, unit: r.unit ?? '', qty, net: qty * toNumber(r.price) - toNumber(r.disc) });
  }
  return out;
}
export async function contractPriceCheck(trx: Db, tenantId: string, ctx: Ctx, f: { from: string; to: string; partnerCode?: string; contractCode?: string }): Promise<PriceCheckRow[]> {
  const docs = ctx.docs.filter((d) => d.kind === 'receipt' && d.status === 'approved' && d.docDate >= f.from && d.docDate <= f.to
    && (!f.partnerCode || d.partnerCode === f.partnerCode) && (f.contractCode === undefined || (d.contractCode ?? '') === f.contractCode));
  if (!docs.length) return [];
  const skus = [...new Set(docs.flatMap((d) => d.lines.filter((l) => l.lineType === 'buy' && l.sku).map((l) => l.sku)))];
  const prices = await listSupplierProducts(trx, tenantId, { skus, withGeneral: true, all: true });
  const units = await unitsOf(trx, tenantId, skus);
  const invLines = await invoiceLinesOfReceipts(trx, tenantId, docs.map((d) => d.id));
  const out: PriceCheckRow[] = [];
  for (const d of docs) {
    const calc = computeDoc(d, []);
    d.lines.forEach((l, idx) => {
      if (l.lineType !== 'buy' || !l.sku || !(l.qty > 0)) return;
      const rate = (TAX_RATE as Record<string, number>)[l.taxCode] ?? 0;
      const chuaThue = (v: number, gom: boolean) => (gom ? v / (1 + rate / 100) : v);
      const us = units[l.sku] ?? [];
      const ratio = (u: string) => us.find((x) => x.unit.trim().toLowerCase() === u.trim().toLowerCase())?.ratio;
      // Giá thực tế sau CK, trước VAT, theo ĐVT của dòng: ưu tiên hoá đơn NCC đính vào phiếu (quy ĐVT), không có thì phiếu nhập (tạm).
      const hdl = (invLines.get(d.id) ?? []).filter((x) => x.sku === l.sku);
      const rl = ratio(l.unit);
      const baseQty = hdl.reduce((t, x) => t + x.qty * (ratio(x.unit || l.unit) ?? NaN), 0);
      let actual: number; let actualFrom: PriceCheckRow['actualFrom'] = 'phieu-nhap';
      if (hdl.length && rl && baseQty > 0 && Number.isFinite(baseQty)) { actual = (hdl.reduce((t, x) => t + x.net, 0) / baseQty) * rl; actualFrom = 'hoa-don'; }
      else { const c = calc.lines[idx]; actual = c && l.qty ? c.beforeTax / l.qty : chuaThue(l.price, d.priceIncludesVat); }
      actual = Math.round(actual * 100) / 100;
      const hit = priceFor(prices, { date: d.docDate, partnerCode: d.partnerCode, sku: l.sku, unit: l.unit, contractCode: d.contractCode || undefined }, us);
      const agreed = hit ? Math.round(chuaThue(hit.price, Boolean(hit.row.priceIncludesVat)) * 100) / 100 : null;
      const diff = agreed !== null ? Math.round((actual - agreed) * 100) / 100 : null;
      out.push({
        docId: d.id, docNo: d.docNo, docDate: d.docDate, branchCode: d.branchCode, partnerCode: d.partnerCode, contractCode: d.contractCode ?? '', sku: l.sku, name: l.name, unit: l.unit, qty: l.qty,
        agreed, actual, diff, diffPct: agreed ? Math.round((diff! / agreed) * 10000) / 100 : null, diffAmount: diff !== null ? Math.round(diff * l.qty) : null,
        source: !hit ? 'chưa khai giá thoả thuận' : hit.row.contractCode ? `giá hợp đồng ${hit.row.contractCode}` : hit.row.partnerCode ? 'giá NCC (ngoài hợp đồng)' : 'giá chung',
        actualFrom, invoiceNos: [...new Set(hdl.map((x) => x.invoiceNo))].join(', '),
      });
    });
  }
  return out;
}

// [2026-11-21 Nguyễn Văn Thủy] TÌNH HÌNH THỰC HIỆN HỢP ĐỒNG (MH35): đã đặt (đơn) · đã nhận (phiếu nhập − trả) · đã nhận hoá đơn (hoá đơn NCC đính vào phiếu, mỗi hoá đơn
// tính một lần) · đã thanh toán (phiếu trả / ứng tiền) · còn phải trả (sổ công nợ) — mỗi con số một nguồn chứng từ, không cộng trùng (đóng góp)
export interface ContractExecRow { code: string; name: string; partnerCode: string; startDate: string; endDate: string; status: string; value: number | null;
  ordered: number; received: number; invoiced: number; paid: number; debt: number; progress: number | null; remainingValue: number | null; receipts: number; invoices: number }
/** Hoá đơn NCC (id, tổng tiền) đính vào từng phiếu nhập. */
async function invoiceTotalsOfReceipts(trx: Db, tenantId: string, receiptIds: string[]) {
  const out = new Map<string, { id: string; total: number }[]>();
  if (!receiptIds.length) return out;
  const rows = (await sql<{ rid: string; id: string; total: string }>`
    SELECT substr(l.to_ref, length('mua-hang.document:') + 1) AS rid, i.id::text AS id, i.total::text AS total
      FROM document_links l JOIN supplier_invoices i ON i.tenant_id = l.tenant_id AND i.id = substr(l.from_ref, length('mua-hang.invoice:') + 1)::bigint AND i.status = 'active'
     WHERE l.tenant_id = ${tenantId} AND l.role = 'attachesTo' AND l.from_ref LIKE 'mua-hang.invoice:%' AND l.to_ref = ANY(${receiptIds.map((r) => `mua-hang.document:${r}`)}::text[])`.execute(trx)).rows;
  for (const r of rows) (out.get(r.rid) ?? out.set(r.rid, []).get(r.rid)!).push({ id: r.id, total: toNumber(r.total) });
  return out;
}
export async function contractExecution(trx: Db, tenantId: string, ctx: Ctx, f: { from: string; to: string; partnerCode?: string; contractCode?: string }): Promise<ContractExecRow[]> {
  const hds = (await sql<{ code: string; name: string; partner: string; start: string | null; end: string | null; status: string | null; value: string | null }>`
    SELECT code, name, extra->>'partnerCode' AS partner, NULLIF(extra->>'startDate', '') AS start, NULLIF(extra->>'endDate', '') AS "end", extra->>'status' AS status, NULLIF(extra->>'value', '') AS value
      FROM dimensions WHERE tenant_id = ${tenantId} AND kind = 'contract' AND extra->>'type' = 'goods_supplier'`.execute(trx)).rows
    .filter((c) => (!f.partnerCode || c.partner === f.partnerCode) && (!f.contractCode || c.code === f.contractCode));
  const inK = (d: StoredDoc) => d.status === 'approved' && d.docDate >= f.from && d.docDate <= f.to;
  const linked = await invoiceTotalsOfReceipts(trx, tenantId, ctx.docs.filter((d) => d.kind === 'receipt' && inK(d)).map((d) => d.id));
  const tinh = (pick: (d: StoredDoc) => boolean, debt: number) => {
    const ds = ctx.docs.filter((d) => pick(d) && inK(d));
    const t = (k: string[]) => ds.filter((d) => k.includes(d.kind)).reduce((s, d) => s + d.totals.total, 0);
    const rec = ds.filter((d) => d.kind === 'receipt');
    const inv = new Map<string, number>();
    for (const r of rec) for (const x of linked.get(r.id) ?? []) inv.set(x.id, x.total);
    return { ordered: Math.round(t(['order'])), received: Math.round(t(['receipt']) - t(['return'])), invoiced: Math.round([...inv.values()].reduce((a, b) => a + b, 0)),
      paid: Math.round(ds.filter((d) => d.kind === 'payment' || d.kind === 'prepayment').reduce((s, d) => s + (d.amount ?? 0) + (d.ckttAmount ?? 0), 0)), debt: Math.round(debt), receipts: rec.length, invoices: inv.size };
  };
  const out: ContractExecRow[] = [];
  if (f.contractCode !== '') for (const c of hds) {
    const u = await contractUsage(trx, tenantId, ctx.docs, c.code, f.to);
    const v = c.value ? Number(c.value) : null;
    const x = tinh((d) => d.contractCode === c.code, u.current);
    out.push({ code: c.code, name: c.name, partnerCode: c.partner, startDate: c.start ?? '', endDate: c.end ?? '', status: c.status ?? 'active', value: v, ...x,
      progress: v ? Math.round((x.received / v) * 1000) / 10 : null, remainingValue: v !== null ? v - x.received : null });
  }
  if (!f.contractCode) {
    const nccs = [...new Set(ctx.docs.filter((d) => !d.contractCode && inK(d) && (!f.partnerCode || d.partnerCode === f.partnerCode) && ['order', 'receipt', 'return', 'payment', 'prepayment'].includes(d.kind)).map((d) => d.partnerCode))];
    for (const ncc of nccs) {
      const hdOpen = await openOf(trx, tenantId, ctx.docs.filter((d) => d.partnerCode === ncc && d.contractCode && d.status === 'approved' && d.docDate <= f.to).flatMap((d) => d.links.map((l) => l.eventId)).filter(Boolean));
      const loose = (await soleContract(trx, tenantId, ncc, f.to)) ? await looseDebt(trx, tenantId, ncc, ctx.docs, f.to) : 0;
      const x = tinh((d) => !d.contractCode && d.partnerCode === ncc, (await apBalance(trx, tenantId, ncc, f.to)) - hdOpen - loose);
      out.push({ code: '', name: 'Không theo hợp đồng', partnerCode: ncc, startDate: '', endDate: '', status: '', value: null, ...x, progress: null, remainingValue: null });
    }
  }
  return out;
}
