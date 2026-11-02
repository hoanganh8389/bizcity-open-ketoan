// @bizcity-layer K kernel/intake
// [2026-11-03 12:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-28 / 29 (ADR-0019, R-GATE-4 / R-GATE-6): mặt hàng nháp ở Gate B — cửa nạp từ chối (IN-ITEM-009), tiền kiểm báo cùng mã, bể chờ kiểm lại khi mặt hàng được kích hoạt
/**
 * Nối Gate A (danh mục) với Gate B (cửa nạp + bể chờ):
 *   draftSkus()            mã hàng nào trong danh sách đang NHÁP (products.is_draft, migration 0061) và vì sao
 *   assertNoDraftItems()   cửa nạp: chứng từ có mặt hàng nháp → VALIDATION_ERROR kèm phát hiện IN-ITEM-009 (bể chờ giữ nguyên văn)
 *   (kiểm lại bể khi mặt hàng kích hoạt: recheckInboxForSkus ở inbox.ts — tránh vòng import với preflight)
 * Chỉ cờ NHÁP mới chặn (R-GATE-4): mặt hàng đang dùng có cảnh báo mềm (vd chưa phân loại, dùng nhóm mặc định) không bị giữ.
 */
import { intakeFinding, skusOf, type IngestDocument, type IntakeFinding } from '@ketoan/contracts';
import { Errors } from '@bizcity/platform/core/errors';
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

