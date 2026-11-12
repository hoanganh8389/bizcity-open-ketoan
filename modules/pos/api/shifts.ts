/**
 * Ca bán, danh sách đơn, tổng quan (phiếu NT-BH-007) — đọc / ghi bảng của module (mod_pos.shifts, orders, returns). Không ghi sổ.
 * Chạy trong ctx.data.module (RLS lọc theo đơn vị).
 */
import { randomUUID } from 'node:crypto';
import { Errors, sql, type ActionContext } from '@bizcity/module-sdk';
import { paymentKind } from './domain/order.js';
import { dashboard, shiftNumbers, type OrderSnap, type ReturnSnap } from './domain/shifts.js';
import { lockKey } from './order-service.js';
import { activePaymentMethods } from './read.js';

type Tx = Parameters<Parameters<ActionContext['data']['module']>[0]>[0];
export type ShiftRow = {
  shift_id: string; branch_code: string; status: 'open' | 'closed'; opened_at: Date; opened_by_name: string; opening_cash: string;
  closed_at: Date | null; report: Record<string, unknown> | null;
};

/** Mã tiền mặt + tên các hình thức thanh toán của đơn vị (để in tên ở ca / tổng quan). */
export async function methodsOf(tx: Tx): Promise<{ cashCode: string; methodNames: Record<string, string> }> {
  const list = await activePaymentMethods(tx);
  return { cashCode: list.find((m) => paymentKind(m.code) === 'cash')?.code ?? 'TM', methodNames: Object.fromEntries(list.map((m) => [m.code, m.name])) };
}

export async function openShiftOf(tx: Tx, branch: string): Promise<ShiftRow | null> {
  return (await sql<ShiftRow>`
    SELECT shift_id, branch_code, status, opened_at, opened_by_name, opening_cash, closed_at, report
      FROM mod_pos.shifts WHERE branch_code = ${branch} AND status = 'open'`.execute(tx)).rows[0] ?? null;
}

async function windowData(tx: Tx, branch: string, from: Date, to: Date | null): Promise<{ orders: OrderSnap[]; returns: ReturnSnap[] }> {
  const until = to ?? new Date('9999-12-31T00:00:00Z');
  const orders = (await sql<{ snapshot: OrderSnap; status: string }>`
    SELECT snapshot, status FROM mod_pos.orders WHERE branch_code = ${branch} AND created_at >= ${from} AND created_at <= ${until} ORDER BY created_at`.execute(tx))
    .rows.map((r) => ({ ...r.snapshot, status: r.status }));
  const returns = (await sql<{ refund_method: string; refund_total: string }>`
    SELECT refund_method, refund_total FROM mod_pos.returns WHERE branch_code = ${branch} AND created_at >= ${from} AND created_at <= ${until}`.execute(tx))
    .rows.map((r) => ({ refundMethod: r.refund_method, refundTotal: Number(r.refund_total) }));
  return { orders, returns };
}

export async function summaryOf(tx: Tx, s: ShiftRow) {
  const data = await windowData(tx, s.branch_code, s.opened_at, s.closed_at);
  const n = shiftNumbers({ openingCash: Number(s.opening_cash), ...data, ...(await methodsOf(tx)) });
  return { id: s.shift_id, openedAt: s.opened_at.toISOString(), cashier: s.opened_by_name, openingCash: Number(s.opening_cash), ...n };
}

export async function currentShift(tx: Tx, branch: string) {
  const s = await openShiftOf(tx, branch);
  return s ? summaryOf(tx, s) : null;
}

export async function openShift(tx: Tx, tenantId: string, branch: string, actor: { id: string; name: string }, openingCash: number) {
  await lockKey(tx, `pos:shift:${branch}`);
  const cur = await openShiftOf(tx, branch);
  if (cur) throw Errors.conflict(`Chi nhánh ${branch} đang có ca mở — chốt ca đó trước`, { reason: 'POS_SHIFT_ALREADY_OPEN', shiftId: cur.shift_id });
  const id = randomUUID();
  const row = (await sql<{ opened_at: Date }>`
    INSERT INTO mod_pos.shifts (tenant_id, shift_id, branch_code, status, opened_by, opened_by_name, opening_cash)
    VALUES (${tenantId}, ${id}, ${branch}, 'open', ${actor.id}, ${actor.name}, ${openingCash})
    RETURNING opened_at`.execute(tx)).rows[0]!;
  return { id, openedAt: row.opened_at.toISOString() };
}

export async function closeShift(tx: Tx, input: { shiftId: string; countedCash: number; force?: boolean; note?: string; actorId: string }) {
  const s = (await sql<ShiftRow>`
    SELECT shift_id, branch_code, status, opened_at, opened_by_name, opening_cash, closed_at, report
      FROM mod_pos.shifts WHERE shift_id = ${input.shiftId}`.execute(tx)).rows[0];
  if (!s) throw Errors.notFound(`ca ${input.shiftId}`);
  await lockKey(tx, `pos:shift:${s.branch_code}`);
  if (s.status === 'closed') throw Errors.conflict('Ca đã chốt', { reason: 'POS_SHIFT_CLOSED', shiftId: s.shift_id });
  const closedAt = new Date();
  const summary = await summaryOf(tx, { ...s, closed_at: closedAt });
  const note = input.note?.trim() || undefined;
  if (summary.blockers.length && !input.force) {
    throw Errors.conflict('Còn việc dở trong ca — chọn chốt bất chấp và ghi lý do', { reason: 'POS_SHIFT_BLOCKED', items: summary.blockers.map((b) => b.ref) });
  }
  if (summary.blockers.length && !note) throw Errors.validation('Chốt bất chấp phải ghi lý do', { reason: 'POS_SHIFT_BLOCKED', items: summary.blockers.map((b) => b.ref) });
  const report = {
    ...summary, closedAt: closedAt.toISOString(), countedCash: input.countedCash, difference: input.countedCash - summary.expectedCash,
    forced: Boolean(input.force && summary.blockers.length), ...(note ? { note } : {}),
  };
  await sql`
    UPDATE mod_pos.shifts SET status = 'closed', closed_at = ${closedAt}, closed_by = ${input.actorId}, counted_cash = ${input.countedCash},
           expected_cash = ${summary.expectedCash}, difference = ${report.difference}, forced = ${report.forced}, note = ${note ?? null},
           report = ${JSON.stringify(report)}::jsonb
     WHERE shift_id = ${s.shift_id}`.execute(tx);
  return report;
}


export async function salesDashboard(tx: Tx, branch: string, from: string, to: string, saleSourceNames: Record<string, string>) {
  const orders = (await sql<{ snapshot: OrderSnap; status: string }>`
    SELECT snapshot, status FROM mod_pos.orders WHERE branch_code = ${branch} AND business_date BETWEEN ${from} AND ${to}`.execute(tx))
    .rows.map((r) => ({ ...r.snapshot, status: r.status }));
  const returns = (await sql<{ refund_method: string; refund_total: string }>`
    SELECT refund_method, refund_total FROM mod_pos.returns WHERE branch_code = ${branch} AND business_date BETWEEN ${from} AND ${to}`.execute(tx))
    .rows.map((r) => ({ refundMethod: r.refund_method, refundTotal: Number(r.refund_total) }));
  return dashboard({ from, to, orders, returns, ...(await methodsOf(tx)), saleSourceNames });
}

export type OrderFilter = { from: string; to: string; q?: string; status?: string; saleSource?: string; page: number; pageSize: number };

/** Danh sách đơn của chi nhánh, mới nhất trước; sums của cả kết quả lọc (khách phải trả, đã hoàn). */
export async function listOrders(tx: Tx, branch: string, f: OrderFilter) {
  const q = f.q?.trim();
  const where = sql`branch_code = ${branch} AND business_date BETWEEN ${f.from} AND ${f.to}
    ${f.status ? sql`AND status = ${f.status}` : sql``}
    ${f.saleSource ? sql`AND coalesce(snapshot->>'saleSource', 'tai_quay') = ${f.saleSource}` : sql``}
    ${q ? sql`AND (code ILIKE ${`%${q}%`} OR snapshot->'customer'->>'phone' ILIKE ${`%${q}%`} OR snapshot->'customer'->>'name' ILIKE ${`%${q}%`})` : sql``}`;
  const agg = (await sql<{ n: string; total: string | null; returned: string | null }>`
    SELECT count(*) AS n, sum(total) FILTER (WHERE status = 'completed') AS total,
           (SELECT sum(r.refund_total) FROM mod_pos.returns r WHERE r.order_id IN (SELECT order_id FROM mod_pos.orders WHERE ${where})) AS returned
      FROM mod_pos.orders WHERE ${where}`.execute(tx)).rows[0]!;
  const rows = (await sql<{ snapshot: Record<string, unknown>; status: string }>`
    SELECT snapshot, status FROM mod_pos.orders WHERE ${where}
     ORDER BY created_at DESC LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`.execute(tx)).rows;
  return {
    items: rows.map((r) => ({ ...r.snapshot, status: r.status })),
    meta: { page: f.page, pageSize: f.pageSize, total: Number(agg.n), sums: { total: Number(agg.total ?? 0), promoDiscount: 0, returnedAmount: Number(agg.returned ?? 0) } },
  };
}

