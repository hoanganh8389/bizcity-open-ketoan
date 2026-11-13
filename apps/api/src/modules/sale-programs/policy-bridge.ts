// @bizcity-layer D modules/ban-hang
// [2026-11-12 09:40 PM Võ Hoàng] POS-KM — S031-15 phần chương trình bán (PHASE-031 · 00 §17 mục 2–4): nối BH12 với Rule Contract — đọc nội dung bản, kiểm hạn mức chi nhánh, tự trừ / trả hạn mức khi phiếu bán ghi sổ / huỷ (đóng góp)
/**
 * CHƯƠNG TRÌNH BÁN ↔ CHÍNH SÁCH.
 *
 *   - Bộ đọc nội dung: bản BH12 ở sổ đăng ký là `store = module` (nội dung ở `sale_programs`). Trả nội dung hiện tại của chương trình
 *     CHỈ KHI băm khớp băm của bản được hỏi — bản cũ đã bị sửa đè thì `null` (không tính được, không đoán).
 *   - Bộ kiểm áp được: chương trình có hạn mức theo cửa hàng → cần `branchCode`; chưa giao / hết hạn mức / đã ngừng → bỏ qua kèm lý do.
 *   - Người nghe `bizcity.ledger.entry.posted` / `.reversed` của phiếu bán VÀ phiếu trả (00 §18): ghi lượt dùng theo (phiếu, dòng) từ các dòng có
 *     `policyRef.key` = mã chương trình; huỷ thì trả lại. Không chặn khi vượt hạn mức (đã bán thật — chốt 05/11), báo cáo hiện phần vượt.
 */
import { sql } from 'kysely';
import { contentHash } from '@bizcity/platform/core/documents';
import { defineSubscriber } from '@bizcity/platform/core/events';
import type { PolicyEnvelope } from '@bizcity/platform/core/policies';
import type { Db } from '@bizcity/platform/db/client';
import { registerPolicyAvailability, registerPolicyContentReader } from '../system/rule-contracts/index.js';
import { consume, programContent, release } from './sale-programs.service.js';

const OWNER = 'ban-hang';
const idOf = (e: PolicyEnvelope) => (e.storeRef.startsWith('sale_programs:') ? e.storeRef.slice('sale_programs:'.length) : null);

type Row = { id: string; code: string; is_active: boolean } & Record<string, unknown>;
async function rowOf(trx: Db, tenantId: string, e: PolicyEnvelope): Promise<Row | null> {
  const id = idOf(e);
  if (!id || !/^\d+$/.test(id)) return null;
  return (await sql<Row>`SELECT p.*, p.id::text AS id, p.buy_qty::text AS buy_qty, p.gift_qty::text AS gift_qty, p.discount_pct::text AS discount_pct,
      p.discount_amount::text AS discount_amount, p.sale_price::text AS sale_price, p.valid_from::text AS valid_from, p.valid_to::text AS valid_to
    FROM sale_programs p WHERE p.tenant_id = ${tenantId} AND p.id = ${id}`.execute(trx)).rows[0] ?? null;
}

export async function readProgramContent(trx: Db, tenantId: string, e: PolicyEnvelope): Promise<unknown | null> {
  const row = await rowOf(trx, tenantId, e);
  if (!row) return null;
  const content = programContent(row);
  return contentHash(content) === e.contentHash ? content : null;
}

export async function programAvailability(trx: Db, tenantId: string, e: PolicyEnvelope, at: { branchCode?: string }) {
  if (!idOf(e)) return {};
  const row = await rowOf(trx, tenantId, e);
  if (!row) return { skip: 'chương trình bán không còn trong BH12' };
  if (!row.is_active) return { skip: `chương trình ${row.code} đã ngừng` };
  if (!at.branchCode) return { skip: 'chương trình bán có hạn mức theo cửa hàng — cần branchCode' };
  const q = (await sql<{ quota_qty: string; used_qty: string }>`SELECT quota_qty::text, used_qty::text FROM sale_program_quotas
    WHERE tenant_id = ${tenantId} AND program_id = ${row.id} AND branch_code = ${at.branchCode}`.execute(trx)).rows[0];
  if (!q) return { skip: `cửa hàng ${at.branchCode} không được giao hạn mức của chương trình ${row.code}` };
  const quota = Number(q.quota_qty), used = Number(q.used_qty);
  if (used >= quota) return { skip: `cửa hàng ${at.branchCode} đã hết hạn mức chương trình ${row.code} (đã dùng ${used} / ${quota})` };
  return { info: { quota: { branchCode: at.branchCode, quotaQty: quota, usedQty: used, remaining: quota - used } } };
}

type DocLine = { lineKey?: string; sku?: string; qty?: number; amountBeforeTax?: number; discount?: number; isGift?: boolean; policyRef?: { key?: string; line?: string } };
type DocPayload = { branchCode?: string; docDate?: string; docNo?: string; originalDocKey?: string; lines?: DocLine[] };
const ACTOR = 'subscriber:ban-hang.sale-program-usage';
const parse = (p: DocPayload | string) => (typeof p === 'string' ? JSON.parse(p) : p) as DocPayload;

// [2026-11-13 10:40 AM Võ Hoàng] POS-KM2 — PHASE-031 · 00 §18 mục 5 (đóng góp): một hàm đối chiếu cho bán / huỷ / trả / huỷ trả.
/**
 * Lượt dùng hạn mức của một phiếu bán = số lượng các dòng có chương trình trên phiếu (khi phiếu đang ghi sổ) − tổng số đã trả của
 * dòng đó qua các phiếu trả ĐÃ GHI SỔ (dòng phiếu trả mang khoá dòng của đơn gốc). Phiếu bán không còn ghi sổ → trả hết.
 */
export async function reconcileSaleUsage(tx: Db, tenantId: string, saleDocKey: string): Promise<void> {
  const sale = (await sql<{ payload: DocPayload | string; status: string; doc_type: string }>`SELECT payload, status, doc_type FROM accounting_events
    WHERE tenant_id = ${tenantId} AND doc_key = ${saleDocKey}`.execute(tx)).rows[0];
  if (!sale || sale.doc_type !== 'sale' || sale.status !== 'posted') { await release(tx, tenantId, ACTOR, saleDocKey); return; }
  const p = parse(sale.payload);
  if (!p.branchCode || !p.docDate) return;
  const returned = new Map<string, number>();
  const rets = (await sql<{ payload: DocPayload | string }>`SELECT payload FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_type = 'sale_return'
    AND status = 'posted' AND payload->>'originalDocKey' = ${saleDocKey}`.execute(tx)).rows;
  for (const r of rets) for (const l of parse(r.payload).lines ?? []) if (l.lineKey && (l.qty ?? 0) > 0) returned.set(l.lineKey, (returned.get(l.lineKey) ?? 0) + l.qty!);
  const lines = (p.lines ?? []).filter((l) => l.policyRef?.key && l.lineKey && (l.qty ?? 0) > 0)
    .map((l) => ({ lineKey: l.lineKey!, program: l.policyRef!.key!, sku: l.sku, qty: Math.round(((l.qty ?? 0) - (returned.get(l.lineKey!) ?? 0)) * 10_000) / 10_000, amount: Math.max(0, Number(l.discount ?? 0)) }))
    .filter((l) => l.qty > 0);
  await consume(tx, tenantId, ACTOR, { branchCode: p.branchCode, docKey: saleDocKey, docNo: p.docNo, docDate: p.docDate, source: 'ledger', lines }, { force: true });
}

export const saleProgramUsageSubscriber = defineSubscriber({
  id: 'ban-hang.sale-program-usage', module: OWNER, on: ['bizcity.ledger.entry.posted', 'bizcity.ledger.entry.reversed'],
  handle: async (ctx, evt) => {
    const d = evt.data as { docKey?: string; docType?: string };
    if (!d.docKey) return;
    if (d.docType === 'sale') { await reconcileSaleUsage(ctx.tx, ctx.tenantId, d.docKey); return; }
    if (d.docType !== 'sale_return') return;
    const ret = (await sql<{ payload: DocPayload | string }>`SELECT payload FROM accounting_events WHERE tenant_id = ${ctx.tenantId} AND doc_key = ${d.docKey}`.execute(ctx.tx)).rows[0];
    const original = ret ? parse(ret.payload).originalDocKey : undefined;
    if (original) await reconcileSaleUsage(ctx.tx, ctx.tenantId, original);
  },
});

let wired = false;
/** Gọi khi nạp route BH12 (mỗi tiến trình một lần; buildApp gọi lại trong test thì bỏ qua). */
export function wireSaleProgramPolicies(): void {
  if (wired) return;
  wired = true;
  registerPolicyContentReader(OWNER, readProgramContent);
  registerPolicyAvailability(OWNER, programAvailability);
}
