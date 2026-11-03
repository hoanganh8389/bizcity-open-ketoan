// @bizcity-layer P audit
// [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 — S023-15: ghi nhận cảnh báo mềm của form danh mục (D023-6 lý do bắt buộc, D023-7 người lưu tự chịu trách nhiệm) — dùng chung cho tài khoản (Kernel) và danh mục (Data)
/**
 * Một lần lưu bản khai báo danh mục còn cảnh báo mềm (`bizcity_catalog_hint@1`, mức `warn`) để lại MỘT dòng nhật ký:
 *   catalog.warn.ack      — người dùng đã thấy cảnh báo và ghi lý do (giao diện bắt buộc ≥ 5 ký tự);
 *   catalog.warn.unacked  — lưu qua API / plugin không kèm lý do (cảnh báo vẫn được trả trong meta.findings).
 * Không có cảnh báo mềm → không ghi gì. Cảnh báo mềm không bao giờ chặn lưu.
 */
import { warnCodes, type CatalogFinding, type CatalogWarnAck } from '@ketoan/contracts';
import type { Db } from '../db/client.js';
import type { AuthContext } from './auth.js';
import { writeAudit } from './audit.js';

export async function recordWarnAck(trx: Db, auth: AuthContext, objectType: string, objectId: string, findings: readonly CatalogFinding[], ack: CatalogWarnAck | undefined): Promise<void> {
  const codes = warnCodes(findings);
  if (!codes.length) return;
  await writeAudit(trx, {
    tenantId: auth.tenantId, actor: auth.actor, action: ack ? 'catalog.warn.ack' : 'catalog.warn.unacked', objectType, objectId,
    after: { codes, reason: ack?.reason ?? null, seen: ack?.codes ?? [], via: auth.kind },
  });
}
