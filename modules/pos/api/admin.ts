/**
 * Đọc quản trị bán lẻ (phiếu NT-BH-008) — kế toán / quản lý xem đơn, phiếu trả, ca, tổng quan của NHIỀU chi nhánh (quyền module
 * `pos:report`). Chỉ đọc bảng của module; trạng thái chứng từ sổ là trạng thái lúc nộp (doc_status). Chạy trong ctx.data.module.
 */
import { sql, type ActionContext } from '@bizcity/module-sdk';
import { dashboard, orderPayments, type OrderSnap, type ReturnSnap } from './domain/shifts.js';
import { methodsOf, summaryOf, type ShiftRow } from './shifts.js';

type Tx = Parameters<Parameters<ActionContext['data']['module']>[0]>[0];

/** "CN01,CN02" → ['CN01','CN02']; rỗng = mọi chi nhánh. */
export const branchList = (s?: string) => [...new Set((s ?? '').split(',').map((x) => x.trim()).filter(Boolean))].slice(0, 500);
const inBranches = (col: string, list: string[]) => (list.length ? sql`AND ${sql.ref(col)} IN (${sql.join(list)})` : sql``);

export type Range = { from: string; to: string; branches: string[] };
export type Page = { page: number; pageSize: number };

export async function adminOrders(tx: Tx, f: Range & Page & { q?: string; status?: string; cashier?: string }) {
  const q = f.q?.trim();
  const where = sql`o.business_date BETWEEN ${f.from} AND ${f.to} ${inBranches('o.branch_code', f.branches)}
    ${f.status ? sql`AND o.status = ${f.status}` : sql``}
    ${f.cashier ? sql`AND o.cashier_name ILIKE ${`%${f.cashier.trim()}%`}` : sql``}
    ${q ? sql`AND (o.code ILIKE ${`%${q}%`} OR o.snapshot->'customer'->>'phone' ILIKE ${`%${q}%`} OR o.snapshot->'customer'->>'name' ILIKE ${`%${q}%`})` : sql``}`;
  const agg = (await sql<{ n: string; total: string | null; returned: string | null }>`
    SELECT count(*) AS n, sum(o.total) FILTER (WHERE o.status = 'completed') AS total,
           (SELECT sum(r.refund_total) FROM mod_pos.returns r WHERE r.order_id IN (SELECT o.order_id FROM mod_pos.orders o WHERE ${where})) AS returned
      FROM mod_pos.orders o WHERE ${where}`.execute(tx)).rows[0]!;
  const rows = (await sql<{
    order_id: string; code: string; branch_code: string; business_date: string; created_at: Date; status: string; total: string; tax_total: string;
    doc_key: string; doc_status: string; cashier_name: string | null; snapshot: OrderSnap & Record<string, unknown>; draft: { shiftId?: string };
  }>`
    SELECT o.order_id, o.code, o.branch_code, o.business_date::text AS business_date, o.created_at, o.status, o.total, o.tax_total, o.doc_key,
           o.doc_status, o.cashier_name, o.snapshot, o.draft
      FROM mod_pos.orders o WHERE ${where}
     ORDER BY o.created_at DESC, o.id DESC LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`.execute(tx)).rows;
  const { cashCode, methodNames } = await methodsOf(tx);
  const total = Number(agg.total ?? 0);
  const returned = Number(agg.returned ?? 0);
  return {
    items: rows.map((r) => {
      const snap = r.snapshot as OrderSnap & { customer?: { name?: string; phone?: string }; lines?: unknown[] };
      return {
        id: r.order_id, code: r.code, branchCode: r.branch_code, businessDate: r.business_date, createdAt: r.created_at.toISOString(), status: r.status,
        total: Number(r.total), taxTotal: Number(r.tax_total), docKey: r.doc_key, docStatus: r.doc_status, cashier: r.cashier_name ?? '',
        shiftId: r.draft?.shiftId ?? '', customerName: snap.customer?.name ?? '', customerPhone: snap.customer?.phone ?? '',
        payments: orderPayments(snap, cashCode).map((p) => ({ ...p, name: methodNames[p.method] ?? p.method })), lines: snap.lines ?? [],
      };
    }),
    meta: { page: f.page, pageSize: f.pageSize, total: Number(agg.n), sums: { orders: Number(agg.n), total, returned, net: total - returned } },
  };
}

export async function adminReturns(tx: Tx, f: Range & Page & { q?: string }) {
  const q = f.q?.trim();
  const where = sql`r.business_date BETWEEN ${f.from} AND ${f.to} ${inBranches('r.branch_code', f.branches)}
    ${q ? sql`AND (r.code ILIKE ${`%${q}%`} OR o.code ILIKE ${`%${q}%`})` : sql``}`;
  const agg = (await sql<{ n: string; total: string | null }>`
    SELECT count(*) AS n, sum(r.refund_total) AS total FROM mod_pos.returns r JOIN mod_pos.orders o ON o.order_id = r.order_id WHERE ${where}`.execute(tx)).rows[0]!;
  const rows = (await sql<{
    return_id: string; code: string; order_code: string; order_id: string; branch_code: string; business_date: string; created_at: Date; refund_method: string;
    refund_total: string; refund_net: string; refund_tax: string; reason: string; approved_by: string | null; approval_note: string | null;
    exchange_order_id: string | null; doc_status: string; cashier_name: string | null; snapshot: { lines?: unknown[] };
  }>`
    SELECT r.return_id, r.code, o.code AS order_code, r.order_id, r.branch_code, r.business_date::text AS business_date, r.created_at, r.refund_method,
           r.refund_total, r.refund_net, r.refund_tax, r.reason, r.approved_by, r.approval_note, r.exchange_order_id, r.doc_status, r.cashier_name, r.snapshot
      FROM mod_pos.returns r JOIN mod_pos.orders o ON o.order_id = r.order_id WHERE ${where}
     ORDER BY r.created_at DESC, r.id DESC LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`.execute(tx)).rows;
  const { methodNames } = await methodsOf(tx);
  return {
    items: rows.map((r) => ({
      id: r.return_id, code: r.code, orderId: r.order_id, orderCode: r.order_code, branchCode: r.branch_code, businessDate: r.business_date,
      createdAt: r.created_at.toISOString(), refundMethod: r.refund_method, refundMethodName: methodNames[r.refund_method] ?? r.refund_method,
      refundTotal: Number(r.refund_total), refundNet: Number(r.refund_net), refundTax: Number(r.refund_tax), reason: r.reason,
      approvedBy: r.approved_by ?? '', approvalNote: r.approval_note ?? '', exchange: r.exchange_order_id !== null, docStatus: r.doc_status,
      cashier: r.cashier_name ?? '', lines: r.snapshot?.lines ?? [],
    })),
    meta: { page: f.page, pageSize: f.pageSize, total: Number(agg.n), sums: { returns: Number(agg.n), refundTotal: Number(agg.total ?? 0) } },
  };
}

/** Sổ ca: ca mở trong khoảng ngày. Ca đã chốt lấy biên bản lúc chốt; ca đang mở tính tới lúc này. */
export async function adminShifts(tx: Tx, f: Range & { diffOnly?: boolean; alert: number }) {
  const rows = (await sql<ShiftRow & { counted_cash: string | null; expected_cash: string | null; difference: string | null; forced: boolean; note: string | null; closed_by: string | null }>`
    SELECT shift_id, branch_code, status, opened_at, opened_by_name, opening_cash, closed_at, report, counted_cash, expected_cash, difference, forced, note, closed_by
      FROM mod_pos.shifts
     WHERE (opened_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN ${f.from} AND ${f.to} ${inBranches('branch_code', f.branches)}
     ORDER BY opened_at DESC LIMIT 1000`.execute(tx)).rows;
  const items = [];
  for (const s of rows) {
    const closed = s.status === 'closed' && s.report;
    const rep = (closed ? s.report : await summaryOf(tx, s)) as Record<string, unknown>;
    const difference = s.difference === null ? null : Number(s.difference);
    const item = {
      id: s.shift_id, branchCode: s.branch_code, status: s.status, openedAt: s.opened_at.toISOString(), closedAt: s.closed_at?.toISOString() ?? null,
      cashier: s.opened_by_name, openingCash: Number(s.opening_cash), orderCount: Number(rep.orderCount ?? 0), total: Number(rep.total ?? 0),
      cashSales: Number(rep.cashSales ?? 0), cashRefunds: Number(rep.cashRefunds ?? 0), expectedCash: Number(s.expected_cash ?? rep.expectedCash ?? 0),
      countedCash: s.counted_cash === null ? null : Number(s.counted_cash), difference, forced: s.forced, note: s.note ?? '',
      // Vượt ngưỡng Cài đặt bán hàng (bizcity.pos.cash_diff_alert; 0 = mọi chênh lệch).
      alert: difference !== null && difference !== 0 && Math.abs(difference) >= f.alert,
      byPayment: (rep.byPayment as unknown[]) ?? [],
    };
    if (!f.diffOnly || (difference !== null && difference !== 0)) items.push(item);
  }
  return items;
}

export async function adminDashboard(tx: Tx, f: Range, saleSourceNames: Record<string, string>) {
  const orders = (await sql<{ snapshot: OrderSnap; status: string; branch_code: string }>`
    SELECT snapshot, status, branch_code FROM mod_pos.orders WHERE business_date BETWEEN ${f.from} AND ${f.to} ${inBranches('branch_code', f.branches)}`.execute(tx)).rows;
  const returns = (await sql<{ refund_method: string; refund_total: string; branch_code: string }>`
    SELECT refund_method, refund_total, branch_code FROM mod_pos.returns WHERE business_date BETWEEN ${f.from} AND ${f.to} ${inBranches('branch_code', f.branches)}`.execute(tx)).rows;
  const ret: (ReturnSnap & { branch: string })[] = returns.map((r) => ({ refundMethod: r.refund_method, refundTotal: Number(r.refund_total), branch: r.branch_code }));
  const snaps = orders.map((o) => ({ ...o.snapshot, status: o.status, branch: o.branch_code }));
  const d = dashboard({ from: f.from, to: f.to, orders: snaps, returns: ret, ...(await methodsOf(tx)), saleSourceNames });
  const by = new Map<string, { orders: number; total: number; returnTotal: number }>();
  for (const o of snaps) if (o.status === 'completed') { const b = by.get(o.branch) ?? { orders: 0, total: 0, returnTotal: 0 }; b.orders++; b.total += o.total; by.set(o.branch, b); }
  for (const r of ret) { const b = by.get(r.branch) ?? { orders: 0, total: 0, returnTotal: 0 }; b.returnTotal += r.refundTotal; by.set(r.branch, b); }
  const names = new Map((await sql<{ code: string; name: string }>`SELECT code, name FROM bizcity_read.branches`.execute(tx)).rows.map((b) => [b.code, b.name]));
  return {
    ...d,
    byBranch: [...by].map(([code, v]) => ({ code, name: names.get(code) ?? code, ...v, net: v.total - v.returnTotal })).sort((a, b) => b.total - a.total),
  };
}
