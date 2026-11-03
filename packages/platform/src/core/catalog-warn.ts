// @bizcity-layer P audit
// [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 — S023-15: ghi nhận cảnh báo mềm của form danh mục (D023-6 lý do bắt buộc, D023-7 người lưu tự chịu trách nhiệm) — dùng chung cho tài khoản (Kernel) và danh mục (Data)
/**
 * Một lần lưu bản khai báo danh mục còn cảnh báo mềm (`bizcity_catalog_hint@1`, mức `warn`) để lại MỘT dòng nhật ký:
 *   catalog.warn.ack      — người dùng đã thấy cảnh báo và ghi lý do (giao diện bắt buộc ≥ 5 ký tự);
 *   catalog.warn.unacked  — lưu qua API / plugin không kèm lý do (cảnh báo vẫn được trả trong meta.findings).
 * Không có cảnh báo mềm → không ghi gì. Cảnh báo mềm không bao giờ chặn lưu.
 */
import { applyRuleReview, hintHash, warnCodes, type CatalogFinding, type CatalogWarnAck } from '@ketoan/contracts';
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

// [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — HT09: áp bản duyệt luật nhắc của đơn vị (catalog_rule_reviews, 0062) lên phát hiện — mọi danh mục dùng chung
/**
 * Áp bản duyệt của đơn vị (HT09 "Quy định dữ liệu danh mục") lên phát hiện khung Vì sao: câu chữ kế toán trưởng sửa lại, cảnh
 * báo mềm đã hạ xuống nhắc (D023-8 — không còn bắt ghi lý do), bỏ nhãn "nháp" của luật đã duyệt. Gọi ở cuối mỗi hàm hint
 * (tài khoản, đối tượng, mặt hàng) để `/validate` và lúc lưu thấy cùng một kết quả.
 */
export async function reviewFindings(trx: Db, tenantId: string, findings: CatalogFinding[]): Promise<CatalogFinding[]> {
  if (!findings.length) return findings;
  const rows = await trx.selectFrom('catalog_rule_reviews').select(['code', 'title', 'why', 'fix', 'lowered', 'rule_hash'])
    .where('tenant_id', '=', tenantId).where('code', 'in', [...new Set(findings.map((f) => f.code))]).execute();
  if (!rows.length) return findings;
  // Bản duyệt của luật đã đổi (dấu khác) không còn áp — luật về chưa duyệt (S023-17).
  const by = new Map(rows.filter((r) => r.rule_hash === hintHash(r.code)).map((r) => [r.code, r]));
  return findings.map((f) => applyRuleReview(f, by.get(f.code)));
}
