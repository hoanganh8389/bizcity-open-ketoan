// [2026-11-15 03:40 PM Võ Hoàng] LOYALTY — NT-BH-020 bước 1: truy cập CSDL của module gom một chỗ (đóng góp)
/** Mọi câu SQL của module `loyalty` (bảng mod_loyalty.*, khung nhìn bizcity_read.*). */
import { sql, type ActionContext } from '@bizcity/module-sdk';
import type { LoyaltyProgram } from './domain/engine.js';
import type { LedgerEntry } from './domain/ledger.js';

export type Tx = Parameters<Parameters<ActionContext['data']['module']>[0]>[0];

/** Khoá theo khách trong giao dịch: hai sự kiện cùng khách ghi lần lượt (số dư, lô không lệch). */
export async function lockCustomer(tx: Tx, code: string): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(hashtext(${`loyalty:customer:${code}`}))`.execute(tx);
}

export type ProgramRow = { version: string; storeId: number; program: LoyaltyProgram; receivedAt: string };

/** Chính sách mới nhất của chi nhánh; chưa có → null (không tích). */
export async function latestProgram(tx: Tx, branchCode: string): Promise<ProgramRow | null> {
  const r = (await sql<{ version: string; store_id: number; program: LoyaltyProgram; received_at: string }>`
    SELECT version, store_id, program, received_at::text FROM mod_loyalty.programs
     WHERE branch_code = ${branchCode} ORDER BY received_at DESC LIMIT 1`.execute(tx)).rows[0];
  return r ? { version: r.version, storeId: Number(r.store_id), program: r.program, receivedAt: r.received_at } : null;
}

/** Cửa hàng đã có chính sách: phiên bản mới nhất, lúc nhận. */
export async function programBranches(tx: Tx): Promise<{ branchCode: string; version: string; receivedAt: string }[]> {
  return (await sql<{ branch_code: string; version: string; received_at: string }>`
    SELECT DISTINCT ON (branch_code) branch_code, version, received_at::text FROM mod_loyalty.programs
     ORDER BY branch_code, received_at DESC`.execute(tx)).rows.map((r) => ({ branchCode: r.branch_code, version: r.version, receivedAt: r.received_at }));
}

/** Lưu một phiên bản chính sách; trùng phiên bản → false (không đổi gì). */
export async function saveProgram(tx: Tx, tenantId: string, row: { branchCode: string; version: string; storeId: number; program: LoyaltyProgram; by: string }): Promise<boolean> {
  const r = await sql`
    INSERT INTO mod_loyalty.programs (tenant_id, branch_code, version, store_id, program, received_by)
    VALUES (${tenantId}, ${row.branchCode}, ${row.version}, ${row.storeId}, ${JSON.stringify(row.program)}::jsonb, ${row.by})
    ON CONFLICT (tenant_id, branch_code, version) DO NOTHING`.execute(tx);
  return Number(r.numAffectedRows ?? 0) > 0;
}

export async function branchExists(tx: Tx, code: string): Promise<boolean> {
  return (await sql`SELECT 1 FROM bizcity_read.branches WHERE code = ${code}`.execute(tx)).rows.length > 0;
}

export async function partnerExists(tx: Tx, code: string): Promise<boolean> {
  return (await sql`SELECT 1 FROM bizcity_read.partners WHERE code = ${code}`.execute(tx)).rows.length > 0;
}

export type Entry = LedgerEntry & { meta?: Record<string, unknown> };

type EntryRow = {
  entry_id: string; kind: LedgerEntry['kind']; points: string; at: string; expires_at: string | null; allocations: { lotId: string; points: number }[] | null;
  ref_type: 'order' | 'return' | 'manual'; ref_id: string; ref_code: string | null; note: string | null; meta: Record<string, unknown> | null;
};

const iso = (s: string) => new Date(s).toISOString();

/** Sổ điểm của một khách, theo thời gian. */
export async function entriesOf(tx: Tx, partnerCode: string): Promise<Entry[]> {
  const rows = (await sql<EntryRow>`
    SELECT entry_id, kind, points, at::text, expires_at::text, allocations, ref_type, ref_id, ref_code, note, meta
      FROM mod_loyalty.entries WHERE partner_code = ${partnerCode} ORDER BY at, created_at`.execute(tx)).rows;
  return rows.map((r) => ({
    id: r.entry_id, kind: r.kind, points: Number(r.points), at: iso(r.at), expiresAt: r.expires_at ? iso(r.expires_at) : null,
    ...(r.allocations ? { allocations: r.allocations } : {}),
    ref: { type: r.ref_type, id: r.ref_id, ...(r.ref_code ? { code: r.ref_code } : {}) },
    ...(r.note ? { note: r.note } : {}), ...(r.meta ? { meta: r.meta } : {}),
  }));
}

/** Dòng đã có của chứng từ gốc (chống ghi hai lần). */
export async function entryByRef(tx: Tx, refType: string, refId: string, kind: string): Promise<{ entry: Entry; partnerCode: string } | null> {
  const r = (await sql<{ partner_code: string; entry_id: string }>`
    SELECT partner_code, entry_id FROM mod_loyalty.entries WHERE ref_type = ${refType} AND ref_id = ${refId} AND kind = ${kind}`.execute(tx)).rows[0];
  if (!r) return null;
  const entry = (await entriesOf(tx, r.partner_code)).find((e) => e.id === r.entry_id);
  return entry ? { entry, partnerCode: r.partner_code } : null;
}

export async function insertEntry(tx: Tx, tenantId: string, e: {
  id: string; partnerCode: string; kind: LedgerEntry['kind']; points: number; at: string; expiresAt?: string | null;
  allocations?: { lotId: string; points: number }[]; ref: { type: 'order' | 'return' | 'manual'; id: string; code?: string };
  branchCode?: string; programVersion?: string; meta?: Record<string, unknown>; note?: string;
}): Promise<boolean> {
  const r = await sql`
    INSERT INTO mod_loyalty.entries (tenant_id, entry_id, partner_code, kind, points, at, expires_at, allocations, ref_type, ref_id, ref_code,
                                     branch_code, program_version, meta, note)
    VALUES (${tenantId}, ${e.id}, ${e.partnerCode}, ${e.kind}, ${e.points}, ${e.at}, ${e.expiresAt ?? null},
            ${e.allocations ? JSON.stringify(e.allocations) : null}::jsonb, ${e.ref.type}, ${e.ref.id}, ${e.ref.code ?? null},
            ${e.branchCode ?? null}, ${e.programVersion ?? null}, ${e.meta ? JSON.stringify(e.meta) : null}::jsonb, ${e.note ?? null})
    ON CONFLICT (tenant_id, ref_type, ref_id, kind) DO NOTHING`.execute(tx);
  return Number(r.numAffectedRows ?? 0) > 0;
}

/** Tổng tiền đã trả của đơn ở các phiếu trả đã hoàn điểm trước đó (meta.refundTotal). */
export async function refundedBefore(tx: Tx, orderId: string): Promise<number> {
  const r = (await sql<{ v: string | null }>`
    SELECT sum((meta->>'refundTotal')::numeric) AS v FROM mod_loyalty.entries WHERE kind = 'reverse' AND meta->>'orderId' = ${orderId}`.execute(tx)).rows[0];
  return Number(r?.v ?? 0);
}

// [2026-11-15 07:15 PM Võ Hoàng] LOYALTY — NT-BH-020 bước 2: voucher đổi điểm (đóng góp)
type VoucherDb = {
  code: string; partner_code: string | null; name: string; discount_type: 'fixed' | 'percent'; discount_value: string; max_discount: string;
  min_order_amount: string; expires_at: string | null; status: 'active' | 'used'; used_order_id: string | null; used_order_code: string | null;
};
const toVoucher = (r: VoucherDb) => ({
  code: r.code, name: r.name, partnerCode: r.partner_code, discountType: r.discount_type, discountValue: Number(r.discount_value),
  maxDiscount: Number(r.max_discount), minOrderAmount: Number(r.min_order_amount), expiresAt: r.expires_at ? iso(r.expires_at) : null,
  status: r.status, usedOrderId: r.used_order_id, usedOrderCode: r.used_order_code,
});
export type StoredVoucher = ReturnType<typeof toVoucher>;
const VCOLS = sql`code, partner_code, name, discount_type, discount_value, max_discount, min_order_amount, expires_at::text, status, used_order_id, used_order_code`;

export async function voucherByCode(tx: Tx, code: string): Promise<StoredVoucher | null> {
  const r = (await sql<VoucherDb>`SELECT ${VCOLS} FROM mod_loyalty.vouchers WHERE code = ${code.trim().toUpperCase()}`.execute(tx)).rows[0];
  return r ? toVoucher(r) : null;
}

export async function vouchersOf(tx: Tx, partnerCode: string): Promise<StoredVoucher[]> {
  return (await sql<VoucherDb>`SELECT ${VCOLS} FROM mod_loyalty.vouchers WHERE partner_code = ${partnerCode} ORDER BY created_at DESC LIMIT 50`.execute(tx)).rows.map(toVoucher);
}

export async function insertVoucher(tx: Tx, tenantId: string, v: {
  code: string; partnerCode: string; name: string; discountType: 'fixed' | 'percent'; discountValue: number; maxDiscount: number;
  minOrderAmount: number; expiresAt: string | null; rewardIndex: string; orderId: string; orderCode: string;
}): Promise<void> {
  await sql`
    INSERT INTO mod_loyalty.vouchers (tenant_id, code, partner_code, name, discount_type, discount_value, max_discount, min_order_amount, expires_at,
                                      reward_index, issued_order_id, issued_order_code)
    VALUES (${tenantId}, ${v.code}, ${v.partnerCode}, ${v.name}, ${v.discountType}, ${v.discountValue}, ${v.maxDiscount}, ${v.minOrderAmount},
            ${v.expiresAt}, ${v.rewardIndex}, ${v.orderId}, ${v.orderCode})
    ON CONFLICT (tenant_id, code) DO NOTHING`.execute(tx);
}

/** Đánh dấu voucher đã dùng ở đơn; đơn khác đã dùng trước → ghi chú (dùng trùng ở hai máy cùng lúc), không ghi đè. */
export async function markVoucherUsed(tx: Tx, code: string, order: { id: string; code: string; at: string }): Promise<'used' | 'again' | 'other' | 'missing'> {
  const v = await voucherByCode(tx, code);
  if (!v) return 'missing';
  if (v.usedOrderId === order.id) return 'again';
  if (v.status === 'used') {
    const note = `Dùng trùng ở đơn ${order.code} (đã dùng ở ${v.usedOrderCode ?? '?'})`;
    await sql`UPDATE mod_loyalty.vouchers SET note = concat_ws(' · ', note, ${note}) WHERE code = ${v.code}`.execute(tx);
    return 'other';
  }
  await sql`UPDATE mod_loyalty.vouchers SET status = 'used', used_order_id = ${order.id}, used_order_code = ${order.code}, used_at = ${order.at}
             WHERE code = ${v.code} AND status = 'active'`.execute(tx);
  return 'used';
}
