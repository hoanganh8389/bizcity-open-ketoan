/**
 * Báo cáo khách hàng (phiếu NT-BH-034 §2 B) — lấy từng lần mua / trả của khách: đơn máy bán (bảng của module) + phiếu bán BH10, voucher,
 * điểm qua action ĐỌC của module phieu-ban / voucher / loyalty (không đọc bảng của module khác). Module chưa bật / người xem thiếu quyền
 * đọc → phần đó lấy theo bản chụp đơn (voucher, điểm) hoặc bỏ (phiếu BH10), meta báo 'unavailable'. Giá trị quà theo giá bán của cửa hàng
 * (`bizcity_read.branch_prices`). Chạy trong ctx.data.module (RLS lọc theo đơn vị).
 */
// [2026-11-19 Võ Hoàng] NGHIEM-THU — NT-BH-034: số liệu báo cáo khách hàng (đóng góp)
import { roundMoney, sql, type ActionContext } from '@bizcity/module-sdk';
import { branchList } from './admin.js';
import { orderChannelSql } from './channels.js';
import { channelKey } from './domain/channels.js';
import { isGiftLine, withGiftValues, type Purchase, type PurchaseLine } from './domain/customer-report.js';
import { todayVn } from './read.js';

type Tx = Parameters<Parameters<ActionContext['data']['module']>[0]>[0];
type Src = 'ok' | 'unavailable';

type SnapLine = {
  sku: string; name?: string; unitName?: string; unitQty: number; unitPrice?: number; amount?: number; taxAmount?: number; isGift?: boolean;
  promoDiscount?: number; voucherDiscount?: number; policyRef?: { key: string };
};
type Snap = {
  customer?: { id?: string; name?: string; phone?: string }; saleSource?: string; lines?: SnapLine[]; zBill?: { lines?: SnapLine[] };
  voucherUses?: { code: string; campaignName?: string; amount: number }[]; loyalty?: { earned?: number; redeemed?: number };
};

export type CustomerFilter = { from: string; to: string; branches: string[]; channels: string[]; customer?: string };

/** Tham số chung của hai action báo cáo khách: khoảng ngày (mặc định hôm nay), chi nhánh trong phạm vi người xem, kênh. */
export function customerFilter(ctx: ActionContext, i: { from?: string; to?: string; branchCodes?: string; channels?: string }): CustomerFilter & { empty: boolean } {
  const from = i.from ?? todayVn();
  let branches = branchList(i.branchCodes);
  const scope = ctx.branchScope;
  if (scope) branches = branches.length ? branches.filter((b) => scope.includes(b)) : [...scope];
  return { from, to: i.to ?? from, branches, channels: branchList(i.channels).map((c) => c.toUpperCase()), empty: scope !== null && branches.length === 0 };
}

function posLine(l: SnapLine): PurchaseLine {
  const qty = Number(l.unitQty);
  const unitPrice = Number(l.unitPrice ?? 0);
  const amount = roundMoney(Number(l.amount ?? 0) + Number(l.taxAmount ?? 0));
  const gift = isGiftLine({ isGift: l.isGift, amount, qty, unitPrice });
  return {
    sku: l.sku, name: l.name ?? l.sku, unit: l.unitName ?? '', qty, unitPrice, discount: gift ? 0 : roundMoney(Math.max(0, unitPrice * qty - amount)),
    amount, isGift: gift, promo: l.policyRef?.key ?? null,
  };
}

/** Đơn máy bán đã hoàn tất (ngày bán) + phiếu trả (ngày trả; khách, kênh của đơn gốc). */
async function posPurchases(tx: Tx, f: CustomerFilter): Promise<Purchase[]> {
  const inB = (col: string) => (f.branches.length ? sql`AND ${sql.ref(col)} IN (${sql.join(f.branches)})` : sql``);
  const byCust = (col: string) => (f.customer !== undefined ? sql`AND coalesce(${sql.ref(col)}, '') = ${f.customer}` : sql``);
  const orders = (await sql<{ order_id: string; code: string; d: string; branch_code: string; customer_code: string | null; snapshot: Snap; total: string }>`
    SELECT o.order_id, o.code, o.business_date::text AS d, o.branch_code, o.customer_code, o.snapshot, o.total FROM mod_pos.orders o
     WHERE o.status = 'completed' AND o.business_date BETWEEN ${f.from}::date AND ${f.to}::date ${inB('o.branch_code')} ${byCust('o.customer_code')}
     ORDER BY o.business_date, o.code`.execute(tx)).rows;
  const returns = (await sql<{ return_id: string; code: string; d: string; branch_code: string; customer_code: string | null; customer: Snap['customer'] | null; order_code: string; refund_total: string; channel: string }>`
    SELECT r.return_id, r.code, r.business_date::text AS d, r.branch_code, o.customer_code, o.snapshot->'customer' AS customer, o.code AS order_code, r.refund_total,
           ${orderChannelSql('o.snapshot')} AS channel
      FROM mod_pos.returns r JOIN mod_pos.orders o ON o.order_id = r.order_id
     WHERE r.business_date BETWEEN ${f.from}::date AND ${f.to}::date ${inB('r.branch_code')} ${byCust('o.customer_code')}
     ORDER BY r.business_date, r.code`.execute(tx)).rows;
  return [
    ...orders.map((o): Purchase => {
      const lines = [...(o.snapshot.lines ?? []), ...(o.snapshot.zBill?.lines ?? [])].map(posLine);
      const goods = roundMoney(lines.filter((l) => !l.isGift).reduce((s, l) => s + l.unitPrice * l.qty, 0));
      const paid = roundMoney(lines.filter((l) => !l.isGift).reduce((s, l) => s + l.amount, 0));
      return {
        source: 'pos', kind: 'sale', refId: o.order_id, refCode: o.code, date: o.d, branchCode: o.branch_code, channel: channelKey(o.snapshot.saleSource),
        customerCode: o.customer_code ?? '', customerName: o.customer_code ? (o.snapshot.customer?.name ?? '') : '', phone: o.snapshot.customer?.phone ?? '',
        goods, discount: roundMoney(Math.max(0, goods - paid)), total: Number(o.total), returns: 0,
        vouchers: (o.snapshot.voucherUses ?? []).map((v) => ({ code: v.code, campaignName: v.campaignName ?? '', amount: Number(v.amount) })),
        pointsEarned: Number(o.snapshot.loyalty?.earned ?? 0), pointsRedeemed: Number(o.snapshot.loyalty?.redeemed ?? 0), lines,
      };
    }),
    ...returns.map((r): Purchase => ({
      source: 'pos', kind: 'return', refId: r.return_id, refCode: r.code, date: r.d, branchCode: r.branch_code, channel: r.channel,
      customerCode: r.customer_code ?? '', customerName: r.customer_code ? (r.customer?.name ?? '') : '', phone: r.customer?.phone ?? '',
      goods: 0, discount: 0, total: 0, returns: Number(r.refund_total), originalCode: r.order_code, vouchers: [], pointsEarned: 0, pointsRedeemed: 0, lines: [],
    })),
  ];
}

type PbDoc = {
  id: string; kind: 'sale' | 'sale_return'; docNo: string; docDate: string; branchCode: string; partnerCode: string; partnerName: string; channel: string;
  originalDocNo: string | null; total: number; goods: number; discount: number; lines: PurchaseLine[]; vouchers: { code: string; campaignName: string; amount: number }[];
};
type VoucherUse = { code: string; campaignName: string; source: string; refId: string; amount: number };
type PointRow = { refId: string; earned: number; redeemed: number };

/** Gọi action đọc của module khác; module chưa bật / thiếu quyền đọc → null. */
async function tryCall<T>(ctx: ActionContext, id: string, input: Record<string, unknown>): Promise<T | null> {
  try {
    return await ctx.actions.call<T>(id, input);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code !== 'NOT_FOUND' && code !== 'FORBIDDEN') throw e;
    return null;
  }
}

/**
 * Mọi lần mua / trả của khách trong bộ lọc (đã gắn voucher, điểm, giá trị quà). `meta`: nguồn phieu-ban / voucher / loyalty có đọc được
 * không (unavailable → voucher, điểm của đơn máy bán lấy theo bản chụp đơn lúc bán).
 */
export async function customerPurchases(ctx: ActionContext, f: CustomerFilter & { empty: boolean }): Promise<{ purchases: Purchase[]; meta: { phieuBan: Src; voucher: Src; loyalty: Src } }> {
  if (f.empty) return { purchases: [], meta: { phieuBan: 'ok', voucher: 'ok', loyalty: 'ok' } };
  const branchCodes = f.branches.length ? { branchCodes: f.branches.join(',') } : {};
  const pos = await ctx.data.module((tx) => posPurchases(tx, f));
  const pb = await tryCall<{ docs: PbDoc[] }>(ctx, 'phieu-ban.customer.docs', { from: f.from, to: f.to, ...branchCodes, ...(f.customer !== undefined ? { partnerCode: f.customer } : {}) });
  const docs: Purchase[] = (pb?.docs ?? []).map((d) => ({
    source: 'phieu-ban', kind: d.kind === 'sale_return' ? 'return' : 'sale', refId: d.id, refCode: d.docNo, date: d.docDate, branchCode: d.branchCode, channel: d.channel,
    customerCode: d.partnerCode, customerName: d.partnerName, phone: '', goods: d.kind === 'sale' ? d.goods : 0, discount: d.kind === 'sale' ? d.discount : 0,
    total: d.kind === 'sale' ? d.total : 0, returns: d.kind === 'sale_return' ? d.total : 0, originalCode: d.originalDocNo,
    vouchers: d.kind === 'sale' ? d.vouchers.map((v) => ({ code: v.code, campaignName: v.campaignName, amount: v.amount })) : [],
    pointsEarned: 0, pointsRedeemed: 0, lines: d.kind === 'sale' ? d.lines : [],
  }));
  let all = [...pos, ...docs];
  if (f.channels.length) all = all.filter((p) => f.channels.includes(p.channel));

  // Voucher: theo module voucher (mã đã dùng, tiền thực trừ) — thay bản chụp đơn / phiếu.
  const vu = await tryCall<{ uses: VoucherUse[] }>(ctx, 'voucher.usage.list', { from: f.from, to: f.to, ...branchCodes });
  if (vu) {
    const by = new Map<string, VoucherUse[]>();
    for (const u of vu.uses) by.set(`${u.source}:${u.refId}`, [...(by.get(`${u.source}:${u.refId}`) ?? []), u]);
    all = all.map((p) => (p.kind === 'sale' ? { ...p, vouchers: (by.get(`${p.source}:${p.refId}`) ?? []).map((u) => ({ code: u.code, campaignName: u.campaignName, amount: u.amount })) } : p));
  }
  // Điểm: theo sổ điểm (module loyalty) — thay bản chụp đơn.
  const lp = await tryCall<{ items: PointRow[] }>(ctx, 'loyalty.order.points', { from: f.from, to: f.to, ...branchCodes, ...(f.customer ? { partnerCode: f.customer } : {}) });
  if (lp) {
    const by = new Map(lp.items.map((x) => [x.refId, x]));
    all = all.map((p) => (p.source === 'pos' && p.kind === 'sale' ? { ...p, pointsEarned: by.get(p.refId)?.earned ?? 0, pointsRedeemed: by.get(p.refId)?.redeemed ?? 0 } : p));
  }

  // Giá trị quà theo giá bán của cửa hàng.
  const giftSkus = [...new Set(all.flatMap((p) => p.lines.filter((l) => l.isGift).map((l) => l.sku)))];
  const prices = new Map<string, number>();
  if (giftSkus.length) {
    const rows = await ctx.data.module(async (tx) => (await sql<{ branch_code: string; sku: string; unit: string; ratio: string; price: string | null }>`
      SELECT branch_code, sku, unit, ratio, price FROM bizcity_read.branch_prices WHERE sku IN (${sql.join(giftSkus)}) AND price IS NOT NULL`.execute(tx)).rows);
    for (const r of rows) {
      prices.set(`${r.branch_code}|${r.sku}|${r.unit}`, Number(r.price));
      if (Number(r.ratio) === 1 && !prices.has(`${r.branch_code}|${r.sku}|`)) prices.set(`${r.branch_code}|${r.sku}|`, Number(r.price));
    }
  }
  all = all.map((p) => ({ ...p, lines: withGiftValues(p.lines, (sku, unit) => prices.get(`${p.branchCode}|${sku}|${unit}`) ?? prices.get(`${p.branchCode}|${sku}|`) ?? null) }));
  all.sort((a, b) => a.date.localeCompare(b.date) || a.refCode.localeCompare(b.refCode));
  return { purchases: all, meta: { phieuBan: pb ? 'ok' : 'unavailable', voucher: vu ? 'ok' : 'unavailable', loyalty: lp ? 'ok' : 'unavailable' } };
}
