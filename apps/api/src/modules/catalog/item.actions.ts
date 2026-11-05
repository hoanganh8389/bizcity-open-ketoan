// @bizcity-layer M data/masterdata
// [2026-11-05 12:45 PM Nguyễn Văn Thủy] PHASE-024 — S024-11, S026-22 (docs/core/06-xuong-ca-dinh-danh.md): core.item.rename-code, add-code, merge-preview, merge (đóng góp)
/**
 * MẶT HÀNG THEO ĐỊNH DANH (bizcity_item_master@1). Người dùng gọi bằng mã, hệ ngoài gọi bằng mã hoặc itemId; mọi thao tác giữ `item_id`.
 *   - Đổi mã: đóng mã cũ, mở mã mới từ hôm nay; bảng cấu hình theo mã mới; sổ cũ giữ ảnh chụp.
 *   - Gộp: A vào B, gộp tiếp được; sổ cũ không đụng; A còn tồn thì chặn (chuyển tồn là chứng từ riêng, danh mục không sinh bút toán).
 * Logic trên CSDL nằm ở migration 0070 (bizcity_item_merge, trigger đổi mã) để mọi đường ghi cùng một luật.
 */
import { sql } from 'kysely';
import { z } from 'zod';
import { defineAction, type AnyActionDef } from '../../core/actions.js';
import { Errors } from '../../core/errors.js';
import type { Db } from '../../db/client.js';
import { isItemId, ITEM_CODE_KIND_RE } from '@ketoan/contracts';

const tags = ['Mặt hàng'];
const refShape = { itemId: z.string().trim().max(26).optional(), sku: z.string().trim().max(160).optional() };
const reason = z.string().trim().min(5, 'Lý do ít nhất 5 ký tự').max(500);

/** Mã (kể cả mã cũ, mã đã gộp) hoặc itemId → mặt hàng có hiệu lực hôm nay, đi theo chuỗi gộp. */
async function resolveRef(tx: Db, tenantId: string, ref: { itemId?: string; sku?: string }, label: string): Promise<{ itemId: string; sku: string }> {
  if (!ref.itemId && !ref.sku) throw Errors.validation(`${label}: cần mã hàng hoặc itemId`);
  if (ref.itemId && !isItemId(ref.itemId)) throw Errors.validation(`${label}: itemId không đúng khuôn`);
  const r = (await sql<{ id: string | null }>`
    SELECT ${ref.itemId
      ? sql`(SELECT bizcity_item_walk(i.item_id, CURRENT_DATE) FROM items i WHERE i.tenant_id = ${tenantId} AND i.item_id = ${ref.itemId})`
      : sql`bizcity_item_at(${tenantId}::bigint, ${ref.sku!}, CURRENT_DATE)`} AS id`.execute(tx)).rows[0];
  if (!r?.id) throw Errors.notFound(`${label} ${ref.itemId ?? ref.sku}`);
  const code = (await sql<{ code: string }>`SELECT code FROM item_codes WHERE item_id = ${r.id} AND kind = 'sku' AND valid_to IS NULL`.execute(tx)).rows[0];
  if (!code) throw Errors.notFound(`${label} ${ref.itemId ?? ref.sku}: không còn mã đang dùng`);
  return { itemId: r.id, sku: code.code };
}

/** Người thao tác và lý do cho trigger trong giao dịch này (item_codes.created_by, note). */
async function setSession(tx: Db, actor: string, note: string): Promise<void> {
  await sql`SELECT set_config('bizcity.actor', ${actor}, true), set_config('bizcity.note', ${note}, true)`.execute(tx);
}

const openFrom = async (tx: Db, itemId: string) =>
  (await sql<{ valid_from: string }>`SELECT valid_from::text FROM item_codes WHERE item_id = ${itemId} AND kind = 'sku' AND valid_to IS NULL`.execute(tx)).rows[0]?.valid_from ?? '';

const renameCode = defineAction({
  id: 'core.item.rename-code', title: 'Đổi mã hàng', tags,
  description: 'Đóng mã cũ, mở mã mới từ hôm nay, giữ nguyên định danh. Sổ cũ giữ mã cũ; đơn vị tính, bảng giá, giá NCC, tồn max theo mã mới.',
  permission: 'catalog:write', effect: 'write', idempotency: 'natural', sideEffects: ['masterdata'], dryRun: true,
  input: z.object({ ...refShape, newSku: z.string().trim().min(1).max(64), reason }),
  output: z.object({ itemId: z.string(), fromSku: z.string(), toSku: z.string(), validFrom: z.string(), reason: z.string() }),
  expose: { http: { method: 'POST', path: '/api/v1/items/rename-code' }, ai: 'deny' },
  evidence: { objectType: 'item', objectId: (_i, o) => o.itemId },
  handler: async (ctx, i) => {
    const tx = ctx.data.tx;
    const tenantId = ctx.tenant.id;
    const cur = await resolveRef(tx, tenantId, i, 'Mặt hàng');
    // Gửi lại sau khi đã đổi: trạng thái đã đúng.
    if (cur.sku === i.newSku) return { itemId: cur.itemId, fromSku: cur.sku, toSku: i.newSku, validFrom: await openFrom(tx, cur.itemId), reason: i.reason };
    const busy = await tx.selectFrom('products').select('sku').where('tenant_id', '=', tenantId).where('sku', '=', i.newSku).executeTakeFirst();
    if (busy) throw Errors.conflict(`Mã ${i.newSku} đang là mặt hàng khác`);
    const taken = await sql<{ id: string | null }>`SELECT bizcity_item_code_taken(${tenantId}::bigint, ${i.newSku}) AS id`.execute(tx);
    if (taken.rows[0]?.id) throw Errors.conflict(`Mã ${i.newSku} đã từng thuộc mặt hàng khác, không dùng lại được`);
    await setSession(tx, ctx.legacyAuth.actor, i.reason);
    const n = await tx.updateTable('products').set({ sku: i.newSku, updated_at: new Date() }).where('tenant_id', '=', tenantId).where('sku', '=', cur.sku).executeTakeFirst();
    if (!Number(n.numUpdatedRows)) throw Errors.notFound(`mặt hàng ${cur.sku} trong danh mục`);
    await sql`INSERT INTO catalog_tombstones (tenant_id, entity, key, replaced_by_item_id) VALUES (${tenantId}, 'product', ${cur.sku}, ${cur.itemId})`.execute(tx);
    const out = { itemId: cur.itemId, fromSku: cur.sku, toSku: i.newSku, validFrom: await openFrom(tx, cur.itemId), reason: i.reason };
    ctx.evidence.note('result', out);
    return out;
  },
});

const addCode = defineAction({
  id: 'core.item.add-code', title: 'Thêm mã cho mặt hàng', tags,
  description: 'Thêm mã vạch, bí danh hoặc mã của hệ ngoài (external:woocommerce…) từ hôm nay. Đổi mã hàng dùng core.item.rename-code.',
  permission: 'catalog:write', effect: 'write', idempotency: 'natural', sideEffects: ['masterdata'], dryRun: true,
  input: z.object({ ...refShape, kind: z.string().trim().regex(ITEM_CODE_KIND_RE, 'kind: barcode, alias hoặc external:<nguồn>'), code: z.string().trim().min(1).max(160), note: z.string().trim().max(500).default('') }),
  output: z.object({ itemId: z.string(), kind: z.string(), code: z.string() }),
  expose: { http: { method: 'POST', path: '/api/v1/items/add-code' }, ai: 'deny' },
  evidence: { objectType: 'item', objectId: (_i, o) => o.itemId },
  handler: async (ctx, i) => {
    if (i.kind === 'sku') throw Errors.validation('Đổi mã hàng dùng core.item.rename-code');
    const tx = ctx.data.tx;
    const tenantId = ctx.tenant.id;
    const cur = await resolveRef(tx, tenantId, i, 'Mặt hàng');
    const same = await sql<{ item_id: string }>`SELECT item_id FROM item_codes WHERE tenant_id = ${tenantId} AND kind = ${i.kind} AND code = ${i.code} AND valid_to IS NULL`.execute(tx);
    if (same.rows[0]) {
      if (same.rows[0].item_id !== cur.itemId) throw Errors.conflict(`Mã ${i.code} đang thuộc mặt hàng khác`);
      return { itemId: cur.itemId, kind: i.kind, code: i.code };
    }
    await sql`INSERT INTO item_codes (tenant_id, item_id, kind, code, valid_from, created_by, note)
      VALUES (${tenantId}, ${cur.itemId}, ${i.kind}, ${i.code},
              GREATEST(CURRENT_DATE, COALESCE((SELECT max(valid_to) FROM item_codes WHERE tenant_id = ${tenantId} AND kind = ${i.kind} AND code = ${i.code}), CURRENT_DATE)),
              ${ctx.legacyAuth.actor}, ${i.note})`.execute(tx);
    return { itemId: cur.itemId, kind: i.kind, code: i.code };
  },
});

const mergeInput = z.object({
  from: z.object(refShape).describe('Mặt hàng bị gộp'), to: z.object(refShape).describe('Mặt hàng giữ lại'),
});
const BLOCK_TEXT: Record<string, string> = {
  FROM_NOT_FOUND: 'Không thấy mặt hàng bị gộp', TO_NOT_FOUND: 'Không thấy mặt hàng giữ lại', SAME_ITEM: 'Hai mã là một mặt hàng',
  FROM_ALREADY_MERGED: 'Mặt hàng bị gộp đã gộp trước đó', TO_ALREADY_MERGED: 'Mặt hàng giữ lại đã gộp vào mặt hàng khác', TO_RETIRED: 'Mặt hàng giữ lại đã ngừng dùng',
  UNIT_MISMATCH: 'Hai mặt hàng khác đơn vị tính gốc', FROM_HAS_STOCK: 'Mặt hàng bị gộp còn tồn: lập chứng từ chuyển tồn trước khi gộp',
};
const previewOut = z.object({
  fromItemId: z.string(), fromSku: z.string(), toItemId: z.string(), toSku: z.string(), canMerge: z.boolean(),
  blocks: z.array(z.object({ code: z.string(), text: z.string() })),
  stock: z.array(z.object({ branchId: z.string(), warehouseCode: z.string().nullable(), qty: z.number() })),
  ledgerLines: z.number(), movements: z.number(), children: z.number(), unitConflicts: z.number(),
});
type Check = { blocks: string[]; stock: { branchId: string; warehouseCode: string | null; qty: string | number }[]; ledgerLines: number; movements: number; children: number; unitConflicts: number };

async function preview(tx: Db, tenantId: string, i: z.infer<typeof mergeInput>) {
  const from = await resolveRef(tx, tenantId, i.from, 'Mặt hàng bị gộp');
  const to = await resolveRef(tx, tenantId, i.to, 'Mặt hàng giữ lại');
  const c = (await sql<{ c: Check }>`SELECT bizcity_item_merge_check(${tenantId}::bigint, ${from.itemId}, ${to.itemId}) AS c`.execute(tx)).rows[0]!.c;
  return {
    fromItemId: from.itemId, fromSku: from.sku, toItemId: to.itemId, toSku: to.sku, canMerge: c.blocks.length === 0,
    blocks: c.blocks.map((code) => ({ code, text: BLOCK_TEXT[code] ?? code })),
    stock: c.stock.map((s) => ({ branchId: s.branchId, warehouseCode: s.warehouseCode, qty: Number(s.qty) })),
    ledgerLines: Number(c.ledgerLines), movements: Number(c.movements), children: Number(c.children), unitConflicts: Number(c.unitConflicts),
  };
}

const mergePreview = defineAction({
  id: 'core.item.merge-preview', title: 'Xem trước gộp mã', tags,
  description: 'Chỉ đọc: lỗi chặn, tồn còn lại, số dòng lịch sử (giữ nguyên, không dòng nào bị sửa), số mã con, xung đột quy đổi.',
  permission: 'catalog:read', effect: 'read', idempotency: 'none',
  input: mergeInput, output: previewOut,
  expose: { http: { method: 'POST', path: '/api/v1/items/merge-preview' }, ai: 'read' },
  handler: async (ctx, i) => preview(ctx.data.tx, ctx.tenant.id, i),
});

const merge = defineAction({
  id: 'core.item.merge', title: 'Gộp mã', tags,
  description: 'Gộp mặt hàng vào mặt hàng khác từ hôm nay. Định danh cũ giữ lại và ngừng dùng, sổ cũ không đổi, mã cũ thành bí danh. Còn tồn thì chặn.',
  permission: 'catalog:write', effect: 'write', idempotency: 'natural', sideEffects: ['masterdata'], dryRun: true,
  input: mergeInput.extend({ reason }),
  output: z.object({ fromItemId: z.string(), toItemId: z.string(), fromSku: z.string(), toSku: z.string(), mergedAt: z.string(), droppedConfig: z.number(), reason: z.string() }),
  expose: { http: { method: 'POST', path: '/api/v1/items/merge' }, ai: 'deny' },
  evidence: { objectType: 'item', objectId: (_i, o) => o.fromItemId },
  handler: async (ctx, i) => {
    const tx = ctx.data.tx;
    const tenantId = ctx.tenant.id;
    const p = await preview(tx, tenantId, i);
    if (!p.canMerge) throw Errors.conflict(p.blocks.map((b) => b.text).join('; '));
    await setSession(tx, ctx.legacyAuth.actor, i.reason);
    const res = (await sql<{ r: { fromSku: string | null; toSku: string; droppedConfig: number; mergedAt: string } }>`
      SELECT bizcity_item_merge(${tenantId}::bigint, ${p.fromItemId}, ${p.toItemId}, ${ctx.legacyAuth.actor}, ${i.reason}) AS r`.execute(tx)).rows[0]!.r;
    await sql`INSERT INTO catalog_tombstones (tenant_id, entity, key, replaced_by_item_id) VALUES (${tenantId}, 'product', ${p.fromSku}, ${p.toItemId})`.execute(tx);
    const out = { fromItemId: p.fromItemId, toItemId: p.toItemId, fromSku: p.fromSku, toSku: res.toSku, mergedAt: res.mergedAt, droppedConfig: Number(res.droppedConfig), reason: i.reason };
    ctx.evidence.note('result', out);
    return out;
  },
});

export const itemActions: AnyActionDef[] = [renameCode, addCode, mergePreview, merge];
