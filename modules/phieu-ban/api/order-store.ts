/**
 * Đọc / ghi CSDL của đơn đặt hàng (NT-BH-023) — một tệp: bảng mod_phieu_ban.orders, order_events, bộ đếm số (code_counters,
 * kind order) và đọc danh mục chuẩn (bizcity_read.*: kho, khách, giá cửa hàng, tồn). Chạy trong ctx.data.module (RLS theo đơn vị).
 */
// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: kho dữ liệu đơn đặt hàng (đóng góp)
import { Errors, sql } from '@bizcity/module-sdk';
import { periodOf } from './domain/doc.js';
import { formatOrderNo, type Change, type DupCandidate, type OrderBody, type OrderSource, type OrderStatus } from './domain/order.js';
import type { Tx } from './store.js';

export type OrderRow = {
  order_id: string; branch_code: string; warehouse_code: string; hold_warehouse_code: string | null; order_no: string; order_date: string;
  valid_until: string | null; status: OrderStatus; source: OrderSource; partner_code: string | null; phone: string | null; body: OrderBody;
  total: string; hold_seq: number; pending_reasons: string[] | null; close_reason: string | null;
  created_by: string; created_at: Date; updated_by: string; updated_at: Date; approved_by: string | null; approved_at: Date | null;
};

const COLS = sql`order_id::text, branch_code, warehouse_code, hold_warehouse_code, order_no, order_date::text, valid_until::text, status, source,
  partner_code, phone, body, total, hold_seq, pending_reasons, close_reason, created_by, created_at, updated_by, updated_at, approved_by, approved_at`;

/** Khuôn trả cho màn. */
export function toOrder(r: OrderRow) {
  return {
    id: r.order_id, orderNo: r.order_no, orderDate: r.order_date, validUntil: r.valid_until, status: r.status, source: r.source,
    branchCode: r.branch_code, warehouseCode: r.warehouse_code, holdWarehouseCode: r.hold_warehouse_code, phone: r.phone, ...r.body,
    total: Number(r.total), pendingReasons: r.pending_reasons ?? [], closeReason: r.close_reason,
    createdBy: r.created_by, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
    ...(r.approved_at ? { approvedBy: r.approved_by, approvedAt: r.approved_at.toISOString() } : {}),
  };
}

/** Một đơn. lock: khoá theo đơn (khoá tư vấn + FOR UPDATE) — hai người giao / sửa cùng lúc chạy nối tiếp. */
export async function getOrder(tx: Tx, id: string, lock = false): Promise<OrderRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw Errors.notFound(`đơn đặt hàng ${id}`);
  if (lock) await sql`SELECT pg_advisory_xact_lock(hashtext(${`phieu-ban:order:${id}`}))`.execute(tx);
  const r = (await sql<OrderRow>`SELECT ${COLS} FROM mod_phieu_ban.orders WHERE order_id = ${id}::uuid ${lock ? sql`FOR UPDATE` : sql``}`.execute(tx)).rows[0];
  if (!r) throw Errors.notFound(`đơn đặt hàng ${id}`);
  return r;
}

export type OrderFilter = { from?: string; to?: string; branches: string[]; status?: string; source?: string; search?: string; page: number; pageSize: number };
export async function listOrders(tx: Tx, f: OrderFilter): Promise<{ rows: OrderRow[]; total: number }> {
  const q = f.search?.trim();
  const where = sql`TRUE
    ${f.from ? sql`AND order_date >= ${f.from}::date` : sql``} ${f.to ? sql`AND order_date <= ${f.to}::date` : sql``}
    ${f.branches.length ? sql`AND branch_code IN (${sql.join(f.branches)})` : sql``}
    ${f.status ? sql`AND status = ${f.status}` : sql``} ${f.source ? sql`AND source = ${f.source}` : sql``}
    ${q ? sql`AND (order_no ILIKE ${`%${q}%`} OR coalesce(partner_code, '') ILIKE ${`%${q}%`} OR coalesce(phone, '') ILIKE ${`%${q}%`}
              OR body->'partner'->>'name' ILIKE ${`%${q}%`} OR body->'customer'->>'name' ILIKE ${`%${q}%`} OR coalesce(body->>'note', '') ILIKE ${`%${q}%`})` : sql``}`;
  const total = Number((await sql<{ n: string }>`SELECT count(*) AS n FROM mod_phieu_ban.orders WHERE ${where}`.execute(tx)).rows[0]!.n);
  const rows = (await sql<OrderRow>`SELECT ${COLS} FROM mod_phieu_ban.orders WHERE ${where}
    ORDER BY order_date DESC, created_at DESC LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`.execute(tx)).rows;
  return { rows, total };
}

/** Cấp số đơn kế tiếp của cửa hàng × tháng (dùng chung bộ đếm phiếu, kind order). */
export async function takeOrderNo(tx: Tx, tenantId: string, branch: string, orderDate: string): Promise<string> {
  const period = periodOf(orderDate);
  const n = (await sql<{ last_no: number }>`
    INSERT INTO mod_phieu_ban.code_counters (tenant_id, branch_code, kind, period, last_no) VALUES (${tenantId}, ${branch}, 'order', ${period}, 1)
    ON CONFLICT (tenant_id, branch_code, kind, period) DO UPDATE SET last_no = mod_phieu_ban.code_counters.last_no + 1, updated_at = now()
    RETURNING last_no`.execute(tx)).rows[0]!.last_no;
  return formatOrderNo(period, n);
}

export type OrderWrite = {
  branchCode: string; warehouseCode: string; holdWarehouseCode?: string | null; orderDate: string; validUntil: string | null; status: OrderStatus;
  source: OrderSource; partnerCode: string | null; phone: string | null; body: OrderBody; holdSeq?: number; pendingReasons?: string[] | null;
  closeReason?: string | null; approvedBy?: string | null; actor: string;
};

export async function insertOrder(tx: Tx, id: string, tenantId: string, orderNo: string, w: OrderWrite): Promise<void> {
  await sql`INSERT INTO mod_phieu_ban.orders (order_id, tenant_id, branch_code, warehouse_code, order_no, order_date, valid_until, status, source, partner_code, phone,
      body, total, created_by, updated_by)
    VALUES (${id}::uuid, ${tenantId}, ${w.branchCode}, ${w.warehouseCode}, ${orderNo}, ${w.orderDate}::date, ${w.validUntil}::date, ${w.status}, ${w.source},
      ${w.partnerCode}, ${w.phone}, ${JSON.stringify(w.body)}::jsonb, ${w.body.totals.total}, ${w.actor}, ${w.actor})`.execute(tx);
}

export async function updateOrder(tx: Tx, id: string, w: OrderWrite): Promise<void> {
  await sql`UPDATE mod_phieu_ban.orders SET branch_code = ${w.branchCode}, warehouse_code = ${w.warehouseCode}, order_date = ${w.orderDate}::date,
      valid_until = ${w.validUntil}::date, status = ${w.status}, source = ${w.source}, partner_code = ${w.partnerCode}, phone = ${w.phone},
      body = ${JSON.stringify(w.body)}::jsonb, total = ${w.body.totals.total},
      ${w.holdWarehouseCode !== undefined ? sql`hold_warehouse_code = ${w.holdWarehouseCode},` : sql``}
      ${w.holdSeq !== undefined ? sql`hold_seq = ${w.holdSeq},` : sql``}
      ${w.pendingReasons !== undefined ? sql`pending_reasons = ${w.pendingReasons === null ? null : JSON.stringify(w.pendingReasons)}::jsonb,` : sql``}
      ${w.closeReason !== undefined ? sql`close_reason = ${w.closeReason},` : sql``}
      ${w.approvedBy !== undefined ? sql`approved_by = ${w.approvedBy}, approved_at = ${w.approvedBy ? sql`now()` : null},` : sql``}
      updated_by = ${w.actor}, updated_at = now()
    WHERE order_id = ${id}::uuid`.execute(tx);
}

/** Dữ liệu ghi lại từ một dòng đã đọc (sửa vài trường rồi ghi). */
export const writeOf = (r: OrderRow, actor: string): OrderWrite => ({
  branchCode: r.branch_code, warehouseCode: r.warehouse_code, orderDate: r.order_date, validUntil: r.valid_until, status: r.status, source: r.source,
  partnerCode: r.partner_code, phone: r.phone, body: r.body, actor,
});

export async function addEvent(tx: Tx, e: { tenantId: string; orderId: string; actor: string; actorName?: string; action: string; changes?: Change[]; note?: string | null }): Promise<void> {
  await sql`INSERT INTO mod_phieu_ban.order_events (tenant_id, order_id, actor, actor_name, action, changes, note)
    VALUES (${e.tenantId}, ${e.orderId}::uuid, ${e.actor}, ${e.actorName ?? null}, ${e.action}, ${JSON.stringify(e.changes ?? [])}::jsonb, ${e.note ?? null})`.execute(tx);
}

export async function orderEvents(tx: Tx, orderId: string) {
  return (await sql<{ event_id: string; at: Date; actor: string; actor_name: string | null; action: string; changes: Change[]; note: string | null }>`
    SELECT event_id::text, at, actor, actor_name, action, changes, note FROM mod_phieu_ban.order_events WHERE order_id = ${orderId}::uuid ORDER BY at, event_id`.execute(tx)).rows
    .map((r) => ({ id: r.event_id, at: r.at.toISOString(), actor: r.actor, actorName: r.actor_name, action: r.action, changes: r.changes, note: r.note }));
}

/** Đơn đang mở của khách (trừ đơn đang xét) — để cộng giá trị chưa giao khi kiểm hạn mức. */
export async function openOrdersOf(tx: Tx, partnerCode: string, exceptId: string): Promise<OrderRow[]> {
  return (await sql<OrderRow>`SELECT ${COLS} FROM mod_phieu_ban.orders WHERE partner_code = ${partnerCode} AND status = 'open' AND order_id <> ${exceptId}::uuid`.execute(tx)).rows;
}

/** Đơn livestream cùng SĐT lập trong 24 giờ (ứng viên trùng). */
export async function livestreamByPhone(tx: Tx, phone: string, exceptId?: string): Promise<DupCandidate[]> {
  return (await sql<{ order_id: string; order_no: string; status: string; created_at: Date; skus: string[] }>`
    SELECT order_id::text, order_no, status, created_at, ARRAY(SELECT DISTINCT l->>'sku' FROM jsonb_array_elements(body->'lines') l) AS skus
      FROM mod_phieu_ban.orders
     WHERE source = 'livestream' AND phone = ${phone} AND status <> 'cancelled' AND created_at >= now() - interval '24 hours'
       ${exceptId ? sql`AND order_id <> ${exceptId}::uuid` : sql``}
     ORDER BY created_at DESC`.execute(tx)).rows
    .map((r) => ({ orderId: r.order_id, orderNo: r.order_no, status: r.status, createdAt: r.created_at, skus: r.skus }));
}

// ------------------------------------------------------------------ danh mục chuẩn (chỉ đọc)

/** Hạn mức nợ và hạn thanh toán của khách. Hạn thanh toán trống / 0 → 30 ngày (hạn chung — giả định NT-BH-023). */
export async function partnerTerms(tx: Tx, code: string): Promise<{ creditLimit: number; termDays: number } | null> {
  const r = (await sql<{ credit_limit: string | null; payment_term_days: number | null }>`
    SELECT credit_limit, payment_term_days FROM bizcity_read.partners WHERE code = ${code} LIMIT 1`.execute(tx)).rows[0];
  if (!r) return null;
  return { creditLimit: Number(r.credit_limit ?? 0), termDays: r.payment_term_days && r.payment_term_days > 0 ? r.payment_term_days : 30 };
}

/** Kho của cửa hàng: kho mặc định đang dùng (không có thì kho đang dùng duy nhất). */
export async function warehousesOf(tx: Tx, branch: string) {
  const ws = (await sql<{ code: string; name: string; is_default: boolean | null; is_active: boolean | null }>`
    SELECT code, name, is_default, is_active FROM bizcity_read.warehouses WHERE branch_code = ${branch} ORDER BY code`.execute(tx)).rows;
  const active = ws.filter((w) => w.is_active !== false);
  const def = (active.find((w) => w.is_default) ?? (active.length === 1 ? active[0] : undefined))?.code ?? '';
  return { all: ws, active, def };
}

/** Giá bán theo cửa hàng (ĐVT mặc định) — điền khi dòng đơn không gửi đơn giá. */
export async function branchPrices(tx: Tx, branch: string, skus: readonly string[]): Promise<Map<string, number>> {
  const list = [...new Set(skus)];
  if (!list.length) return new Map();
  const rows = (await sql<{ sku: string; price: string | null }>`
    SELECT sku, price FROM bizcity_read.branch_prices WHERE branch_code = ${branch} AND sku IN (${sql.join(list)}) AND is_default_unit`.execute(tx)).rows;
  return new Map(rows.filter((r) => r.price !== null).map((r) => [r.sku, Number(r.price)]));
}

/**
 * Khoá chi nhánh × mã (cùng khoá với máy bán và phiếu bán — các nguồn lấy hàng một mã chạy nối tiếp) rồi đọc tồn của một kho.
 * Kho mặc định gồm cả dòng thẻ kho cũ không ghi kho (như báo cáo kho).
 */
export async function lockedWarehouseStock(tx: Tx, branch: string, warehouse: string, isDefault: boolean, skus: readonly string[]): Promise<Map<string, number>> {
  const list = [...new Set(skus)].sort();
  if (!list.length) return new Map();
  for (const sku of list) await sql`SELECT pg_advisory_xact_lock(hashtext(${`pos:stock:${branch}:${sku}`}))`.execute(tx);
  const rows = (await sql<{ sku: string; qty: string }>`
    SELECT sku, SUM(qty)::text AS qty FROM bizcity_read.stock_on_hand
     WHERE branch_code = ${branch} AND sku IN (${sql.join(list)})
       AND ${isDefault ? sql`coalesce(warehouse_code, '') IN (${warehouse}, '')` : sql`warehouse_code = ${warehouse}`}
     GROUP BY sku`.execute(tx)).rows;
  return new Map(rows.map((r) => [r.sku, Number(r.qty)]));
}
