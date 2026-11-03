// @bizcity-layer K kernel/intake
// [2026-11-03 12:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-28 / 29 (ADR-0019, R-GATE-4 / R-GATE-6): mặt hàng nháp ở Gate B — cửa nạp từ chối (IN-ITEM-009), tiền kiểm báo cùng mã, bể chờ kiểm lại khi mặt hàng được kích hoạt
/**
 * Nối Gate A (danh mục) với Gate B (cửa nạp + bể chờ):
 *   draftSkus()            mã hàng nào trong danh sách đang NHÁP (products.is_draft, migration 0061) và vì sao
 *   assertNoDraftItems()   cửa nạp: chứng từ có mặt hàng nháp → VALIDATION_ERROR kèm phát hiện IN-ITEM-009 (bể chờ giữ nguyên văn)
 *   (kiểm lại bể khi mặt hàng kích hoạt: recheckInboxForSkus ở inbox.ts — tránh vòng import với preflight)
 *   itemAutoCreate()       chế độ tự thêm mặt hàng từ chứng từ (tenants.settings.item.autoCreate: on | off, mặc định on — D024-3, R-GATE-9)
 *   remindAutoCreated()    chế độ on: mặt hàng vừa tự thêm thiếu ĐVT / ghi theo nhóm mặc định → thông báo cho người có catalog:write (nhắc, không chặn)
 *   assertKnownItems()     cửa nạp, chế độ off: mã lạ → VALIDATION_ERROR kèm IN-ITEM-001 (bể chờ giữ; createDraftItemsFromLines tạo nháp)
 * Chỉ cờ NHÁP mới chặn (R-GATE-4): mặt hàng đang dùng có cảnh báo mềm (vd chưa phân loại, dùng nhóm mặc định) không bị giữ.
 */
import { intakeFinding, skusOf, type IngestDocument, type IntakeFinding } from '@ketoan/contracts';
import { sql } from 'kysely';
import { Errors } from '@bizcity/platform/core/errors';
import { sendNotification } from '@bizcity/platform/core/notify';
import type { Db } from '@bizcity/platform/db/client';

export async function draftSkus(trx: Db, tenantId: string, skus: readonly string[]): Promise<Map<string, string[]>> {
  if (!skus.length) return new Map();
  const rows = await trx.selectFrom('products').select(['sku', 'draft_codes']).where('tenant_id', '=', tenantId)
    .where('sku', 'in', [...skus]).where('is_draft', '=', true).execute();
  return new Map(rows.map((r) => [r.sku, r.draft_codes ?? []]));
}

/** Phát hiện IN-ITEM-009 cho từng mặt hàng nháp trên chứng từ. */
export async function draftItemFindings(trx: Db, tenantId: string, skus: readonly string[]): Promise<IntakeFinding[]> {
  const drafts = await draftSkus(trx, tenantId, skus);
  return [...drafts].map(([sku, codes]) => intakeFinding('IN-ITEM-009', 'lines[].sku', { got: sku, expected: `mặt hàng đã kích hoạt${codes.length ? ` (còn thiếu: ${codes.join(', ')})` : ''}` }));
}

/** Cửa nạp: không ghi sổ chứng từ có mặt hàng nháp (R-GATE-6). */
export async function assertNoDraftItems(trx: Db, tenantId: string, doc: IngestDocument): Promise<void> {
  const findings = await draftItemFindings(trx, tenantId, skusOf(doc));
  if (!findings.length) return;
  const skus = findings.map((f) => String(f.got)).join(', ');
  throw Errors.validation(`Mặt hàng còn nháp, chưa kích hoạt: ${skus} (IN-ITEM-009) — sửa khai báo mặt hàng ở danh mục rồi nộp lại`, { findings });
}


// [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — D024-3 (R-ITEM-6): đơn vị tắt tự thêm mặt hàng → mã lạ thành mặt hàng NHÁP + chứng từ vào bể chờ (IN-ITEM-001)
export type ItemAutoCreate = 'on' | 'off';

/** Chế độ tự thêm mặt hàng từ chứng từ của đơn vị (bizcity.item.auto_create). Không khai = on (như trước D024-3). */
export async function itemAutoCreate(trx: Db, tenantId: string): Promise<ItemAutoCreate> {
  const t = await trx.selectFrom('tenants').select(sql<string | null>`settings #>> '{item,autoCreate}'`.as('mode')).where('id', '=', tenantId).executeTakeFirst();
  return t?.mode === 'off' ? 'off' : 'on';
}

/** Mã hàng chưa có trong danh mục. */
export async function unknownSkus(trx: Db, tenantId: string, skus: readonly string[]): Promise<string[]> {
  if (!skus.length) return [];
  const have = new Set((await trx.selectFrom('products').select('sku').where('tenant_id', '=', tenantId).where('sku', 'in', [...skus]).execute()).map((p) => p.sku));
  return skus.filter((s) => !have.has(s));
}

/** Cửa nạp: đơn vị đã tắt tự thêm mặt hàng thì không nhận mã lạ (D024-3). */
export async function assertKnownItems(trx: Db, tenantId: string, doc: IngestDocument): Promise<void> {
  const skus = skusOf(doc);
  if (!skus.length || (await itemAutoCreate(trx, tenantId)) === 'on') return;
  const unknown = await unknownSkus(trx, tenantId, skus);
  if (!unknown.length) return;
  const findings = unknown.map((s) => intakeFinding('IN-ITEM-001', 'lines[].sku', { got: s, expected: 'mặt hàng đã khai trong danh mục' }));
  throw Errors.validation(`Mã hàng chưa có trong danh mục: ${unknown.join(', ')} (IN-ITEM-001) — đơn vị đã tắt tự thêm mặt hàng; đã tạo mặt hàng nháp, kế toán kích hoạt rồi nộp lại`, { findings });
}

/**
 * Bể chờ giữ chứng từ có IN-ITEM-001: tạo mặt hàng NHÁP từ dòng (tên, ĐVT của dòng) để kế toán chỉ cần kiểm rồi kích hoạt.
 * Chỉ thêm, không ghi đè mặt hàng đã có. Gọi trong giao dịch của bể chờ (giao dịch cửa nạp đã huỷ).
 */
export async function createDraftItemsFromLines(trx: Db, tenantId: string, raw: unknown, skus: readonly string[]): Promise<string[]> {
  if (!skus.length) return [];
  const lines = ((raw as { lines?: unknown } | null)?.lines ?? []) as { sku?: unknown; name?: unknown; unit?: unknown }[];
  const seen = new Map<string, { name: string; unit: string }>();
  for (const l of Array.isArray(lines) ? lines : []) {
    const sku = typeof l?.sku === 'string' ? l.sku.trim() : '';
    if (sku && skus.includes(sku) && !seen.has(sku)) seen.set(sku, { name: typeof l.name === 'string' ? l.name.slice(0, 255) : '', unit: typeof l.unit === 'string' ? l.unit.trim().slice(0, 32) : '' });
  }
  if (!seen.size) return [];
  const rows = await trx.insertInto('products')
    .values([...seen].map(([sku, v]) => ({ tenant_id: tenantId, sku, name: v.name, unit: v.unit, source_system: 'document', is_draft: true, draft_codes: ['IN-ITEM-001'] })))
    .onConflict((oc) => oc.columns(['tenant_id', 'sku']).doNothing())
    .returning('sku').execute();
  return rows.map((r) => r.sku);
}

// [2026-11-03 01:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — R-GATE-9 mặc định cho phép, nhắc khi sai
/**
 * Mặt hàng vừa tự thêm từ chứng từ (chế độ on): cho vào sổ như cũ, nhưng NHẮC kế toán — mỗi chứng từ một thông báo, liệt kê mặt hàng
 * và điều cần kiểm (thiếu đơn vị tính; chưa có nhóm hạch toán nên ghi theo nhóm mặc định — R-ITEM-8). Gửi lại cùng phiên bản không nhắc lại.
 */
export async function remindAutoCreated(trx: Db, tenantId: string, doc: { docKey: string; docNo: string; version: number }, items: readonly { sku: string; unit: string }[]): Promise<void> {
  if (!items.length) return;
  const def = await trx.selectFrom('product_posting_groups').select('code').where('tenant_id', '=', tenantId).where('is_default', '=', true).executeTakeFirst();
  const group = def ? `ghi theo nhóm mặc định ${def.code}` : 'chưa có nhóm hạch toán, đơn vị chưa có nhóm mặc định';
  const lines = items.map((i) => `${i.sku} (${[i.unit.trim() ? '' : 'thiếu đơn vị tính', group].filter(Boolean).join('; ')})`);
  const body = `${lines.slice(0, 10).join(' · ')}${lines.length > 10 ? ` · và ${lines.length - 10} mặt hàng khác` : ''}. Kiểm đơn vị tính và nhóm hạch toán để kho, giá vốn không ghi sai.`;
  await sendNotification(trx, tenantId, 'core', {
    to: { permission: 'catalog:write' },
    title: `Chứng từ ${doc.docNo} đã tự thêm ${items.length} mặt hàng — cần kiểm`.slice(0, 200),
    body, link: '/danh-muc/mat-hang', dedupeKey: `auto-items:${doc.docKey}:${doc.version}`,
  });
}
