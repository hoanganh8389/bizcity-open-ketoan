// @bizcity-layer D modules/ban-hang
// [2026-11-12 09:40 PM Võ Hoàng] POS-KM — S031-15 phần chương trình bán (PHASE-031 · 00 §17 mục 2–4): nối BH12 với Rule Contract — đọc nội dung bản, kiểm hạn mức chi nhánh, tự trừ / trả hạn mức khi phiếu bán ghi sổ / huỷ (đóng góp)
/**
 * CHƯƠNG TRÌNH BÁN ↔ CHÍNH SÁCH.
 *
 *   - Bộ đọc nội dung: bản BH12 ở sổ đăng ký là `store = module` (nội dung ở `sale_programs`). Trả nội dung hiện tại của chương trình
 *     CHỈ KHI băm khớp băm của bản được hỏi — bản cũ đã bị sửa đè thì `null` (không tính được, không đoán).
 *   - Bộ kiểm áp được: chương trình có hạn mức theo cửa hàng → cần `branchCode`; chưa giao / hết hạn mức / đã ngừng → bỏ qua kèm lý do.
 *   - Người nghe `bizcity.ledger.entry.posted` (phiếu bán) / `.reversed` (huỷ): ghi lượt dùng theo (phiếu, dòng) từ các dòng có
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
type DocPayload = { branchCode?: string; docDate?: string; docNo?: string; lines?: DocLine[] };

export const saleProgramUsageSubscriber = defineSubscriber({
  id: 'ban-hang.sale-program-usage', module: OWNER, on: ['bizcity.ledger.entry.posted', 'bizcity.ledger.entry.reversed'],
  handle: async (ctx, evt) => {
    const d = evt.data as { docKey?: string; docType?: string };
    if (d.docType !== 'sale' || !d.docKey) return;
    const actor = 'subscriber:ban-hang.sale-program-usage';
    if (evt.type === 'bizcity.ledger.entry.reversed') { await release(ctx.tx, ctx.tenantId, actor, d.docKey); return; }
    const doc = (await sql<{ payload: DocPayload | string }>`SELECT payload FROM accounting_events WHERE tenant_id = ${ctx.tenantId} AND doc_key = ${d.docKey}`.execute(ctx.tx)).rows[0];
    if (!doc) return;
    const p = (typeof doc.payload === 'string' ? JSON.parse(doc.payload) : doc.payload) as DocPayload;
    const lines = (p.lines ?? []).filter((l) => l.policyRef?.key && l.lineKey && (l.qty ?? 0) > 0)
      .map((l) => ({ lineKey: l.lineKey!, program: l.policyRef!.key!, sku: l.sku, qty: l.qty!, amount: Math.max(0, Number(l.discount ?? 0)) }));
    if (!p.branchCode || !p.docDate) return;
    await consume(ctx.tx, ctx.tenantId, actor, { branchCode: p.branchCode, docKey: d.docKey, docNo: p.docNo, docDate: p.docDate, source: 'ledger', lines }, { force: true });
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
