// @bizcity-layer M data/masterdata
// [2026-11-03 12:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-28 (ADR-0019, Gate A): khung "Vì sao" cho mặt hàng — thiếu ĐVT gốc / thiếu nhóm hạch toán (chặn → nháp), dùng nhóm mặc định (cảnh báo mềm)
/**
 * Đánh giá một bản khai báo mặt hàng (đã gộp với bản đang có) — chỉ đọc. Còn mức block → mặt hàng lưu NHÁP (products.is_draft),
 * chưa dùng được trên chứng từ (IN-ITEM-009); chỉ còn warn → đang dùng sau khi ghi lý do (D023-6).
 */
import { catalogFinding, type CatalogFinding } from '@ketoan/contracts';
import type { Db } from '../../db/client.js';
import type { AuthContext } from '../../core/auth.js';

/**
 * Mặt hàng vừa kích hoạt → bể chờ kiểm lại (Gate B, Kernel). Danh mục (lớp M) không import Kernel: hàm do phần lắp ráp đăng ký
 * (app.ts → recheckInboxForSkus của @bizcity/kernel), chưa đăng ký thì không làm gì.
 */
// [2026-11-03 12:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-29: móc kích hoạt mặt hàng → bể chờ (đảo chiều phụ thuộc M → K)
export type ItemsActivatedHook = (trx: Db, auth: AuthContext, skus: readonly string[]) => Promise<{ checked: number; cleared: number }>;
let onItemsActivated: ItemsActivatedHook = async () => ({ checked: 0, cleared: 0 });
export function registerItemsActivatedHook(fn: ItemsActivatedHook): void {
  onItemsActivated = fn;
}

export interface ItemDraft {
  sku: string;
  unit?: string | null;
  postingGroupCode?: string | null;
}

export async function itemHints(db: Db, tenantId: string, d: ItemDraft): Promise<CatalogFinding[]> {
  const out: CatalogFinding[] = [];
  if (!d.unit?.trim()) out.push(catalogFinding('ITEM-BLOCK-001', { sku: d.sku }, { field: 'unit' }));
  if (!d.postingGroupCode) {
    const def = await db.selectFrom('product_posting_groups').select('code').where('tenant_id', '=', tenantId).where('is_default', '=', true).executeTakeFirst();
    out.push(def
      ? catalogFinding('ITEM-HINT-001', { sku: d.sku, group: def.code }, { field: 'postingGroupCode' })
      : catalogFinding('ITEM-BLOCK-002', { sku: d.sku }, { field: 'postingGroupCode' }));
  }
  return out;
}

/** Mã lỗi chặn (để ghi products.draft_codes). */
export const blockCodes = (f: readonly CatalogFinding[]) => f.filter((x) => x.level === 'block').map((x) => x.code);

/**
 * Áp trạng thái Gate A cho một mặt hàng ĐÃ GHI (mọi đường lưu: sửa nhanh, form đầy đủ, nhập Excel, ĐVT thùng của mua hàng):
 * còn lỗi chặn → nháp; hết → đang dùng; vừa từ nháp sang đang dùng → bể chờ tiền kiểm lại các mục có mã này (R-GATE-6).
 */
export async function applyItemGate(trx: Db, auth: AuthContext, sku: string): Promise<{ findings: CatalogFinding[]; isDraft: boolean; wasDraft: boolean; recheck: { checked: number; cleared: number } }> {
  const row = await trx.selectFrom('products').select(['unit', 'posting_group_code', 'is_draft']).where('tenant_id', '=', auth.tenantId).where('sku', '=', sku).executeTakeFirstOrThrow();
  const findings = await itemHints(trx, auth.tenantId, { sku, unit: row.unit, postingGroupCode: row.posting_group_code });
  const blocks = blockCodes(findings);
  const isDraft = blocks.length > 0;
  await trx.updateTable('products').set({ is_draft: isDraft, draft_codes: blocks }).where('tenant_id', '=', auth.tenantId).where('sku', '=', sku).execute();
  const recheck = row.is_draft && !isDraft ? await onItemsActivated(trx, auth, [sku]) : { checked: 0, cleared: 0 };
  return { findings, isDraft, wasDraft: row.is_draft, recheck };
}

/**
 * Bản hàng loạt của applyItemGate (đồng bộ từ hệ thống bán hàng, sửa mặt hàng – tài khoản): cùng luật chặn (ITEM-BLOCK-001 / 002),
 * chỉ ghi dòng đổi trạng thái; mặt hàng vừa kích hoạt → bể chờ kiểm lại. Trả mã đang nháp sau khi áp.
 */
export async function applyItemGateBulk(trx: Db, auth: AuthContext, skus: readonly string[]): Promise<{ drafts: string[]; activated: string[]; recheck: { checked: number; cleared: number } }> {
  const none = { drafts: [], activated: [], recheck: { checked: 0, cleared: 0 } };
  if (!skus.length) return none;
  const hasDefault = Boolean(await trx.selectFrom('product_posting_groups').select('code').where('tenant_id', '=', auth.tenantId).where('is_default', '=', true).executeTakeFirst());
  const rows = await trx.selectFrom('products').select(['sku', 'unit', 'posting_group_code', 'is_draft', 'draft_codes']).where('tenant_id', '=', auth.tenantId).where('sku', 'in', [...new Set(skus)]).execute();
  const drafts: string[] = [];
  const activated: string[] = [];
  for (const r of rows) {
    const codes = [...(!r.unit.trim() ? ['ITEM-BLOCK-001'] : []), ...(!r.posting_group_code && !hasDefault ? ['ITEM-BLOCK-002'] : [])];
    const isDraft = codes.length > 0;
    if (isDraft) drafts.push(r.sku);
    if (r.is_draft && !isDraft) activated.push(r.sku);
    if (r.is_draft !== isDraft || (r.draft_codes ?? []).join() !== codes.join()) {
      await trx.updateTable('products').set({ is_draft: isDraft, draft_codes: codes }).where('tenant_id', '=', auth.tenantId).where('sku', '=', r.sku).execute();
    }
  }
  const recheck = activated.length ? await onItemsActivated(trx, auth, activated) : none.recheck;
  return { drafts, activated, recheck };
}
