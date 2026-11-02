// @bizcity-layer K kernel/conformance
// [2026-11-02 05:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — ADR-0015: duyệt rulepack tại bản cài (self-host) — đọc lượt duyệt còn hiệu lực, duyệt, thu hồi; chỉ thêm vào rulepack_approvals.
/**
 * DUYỆT RULEPACK TẠI BẢN CÀI (ADR-0015). Bản cài tự chủ: chủ đơn vị / kế toán trưởng (quyền conformance:approve) duyệt một rulepack
 * cho đơn vị mình, ghi tên người duyệt kế toán (+ người duyệt thuế với miền thuế / hoá đơn / quản lý thuế / lương).
 *
 *   approvalsOf(db, tenant)       Map(id rulepack → lượt duyệt mới nhất chưa thu hồi) — bộ đánh giá tự bỏ lượt lệch phiên bản / băm
 *   rulepackStates(db, tenant)    mọi rulepack trong kho + trạng thái duyệt thượng nguồn + duyệt tại đơn vị (còn hiệu lực hay đã lệch)
 *   approveRulepack / revokeRulepack   chỉ thêm một dòng; thu hồi là dòng mới
 *
 * Không đổi sổ, không đổi cấu hình kế toán; chỉ đổi cách Engine kết luận ca của rulepack đó cho đơn vị này. Kết quả dựa trên duyệt
 * này mang nhãn "Đạt theo duyệt của đơn vị", không bao giờ mang nhãn Bizcity.
 */
import { sql } from 'kysely';
import { localApproval, packHash, TAX_DOMAINS, type Approvals } from '@bizcity/vn-rulepacks/engine';
import type { Db } from '@bizcity/platform/db/client';
import { Errors } from '@bizcity/platform/core/errors';
import { loadKit } from './conformance.service.js';

interface Row { rulepack_id: string; rulepack_version: string; rulepack_hash: string; action: 'approve' | 'revoke'; accounting_reviewer: string | null; tax_reviewer: string | null; note: string; actor: string; created_at: Date }

/** Dòng mới nhất của mỗi rulepack trong đơn vị. */
async function latestRows(db: Db, tenantId: string): Promise<Row[]> {
  const r = await sql<Row>`
    SELECT DISTINCT ON (rulepack_id) rulepack_id, rulepack_version, rulepack_hash, action, accounting_reviewer, tax_reviewer, note, actor, created_at
      FROM rulepack_approvals WHERE tenant_id = ${tenantId}
     ORDER BY rulepack_id, id DESC`.execute(db);
  return r.rows;
}

export async function approvalsOf(db: Db, tenantId: string): Promise<Approvals> {
  const m: Approvals = new Map();
  for (const r of await latestRows(db, tenantId)) {
    if (r.action !== 'approve' || !r.accounting_reviewer) continue;
    m.set(r.rulepack_id, { version: r.rulepack_version, hash: r.rulepack_hash, accounting_reviewer: r.accounting_reviewer, tax_reviewer: r.tax_reviewer, approved_at: new Date(r.created_at).toISOString(), approved_by: r.actor });
  }
  return m;
}

export async function rulepackStates(db: Db, tenantId: string) {
  const { kit } = loadKit();
  const latest = new Map((await latestRows(db, tenantId)).map((r) => [r.rulepack_id, r]));
  const approvals = await approvalsOf(db, tenantId);
  return kit.rulepacks.map((p) => {
    const r = latest.get(p.id);
    const valid = localApproval(approvals, p);
    return {
      id: p.id, version: p.version, catalogId: p.catalog_id, title: String(p.title ?? p.id), domain: p.domain, layer: p.layer ?? null,
      upstreamStatus: p.status, needsTaxReviewer: TAX_DOMAINS.has(p.domain), hash: packHash(p), cases: p._cases.length,
      local: r ? {
        action: r.action, version: r.rulepack_version, accountingReviewer: r.accounting_reviewer, taxReviewer: r.tax_reviewer, note: r.note,
        actor: r.actor, at: new Date(r.created_at).toISOString(),
        // Lượt duyệt còn hiệu lực = đúng phiên bản + đúng băm đang nạp; lệch thì phải duyệt lại.
        effective: Boolean(valid),
        stale: r.action === 'approve' && !valid,
      } : null,
    };
  });
}

function packOf(id: string) {
  const p = loadKit().kit.rulepacks.find((x) => x.id === id);
  if (!p) throw Errors.notFound(`rulepack ${id}`);
  return p;
}

export async function approveRulepack(db: Db, tenantId: string, a: { rulepackId: string; accountingReviewer: string; taxReviewer?: string; note: string; actor: string }) {
  const p = packOf(a.rulepackId);
  if (p.status === 'approved') throw Errors.conflict(`Rulepack ${p.id}@${p.version} đã được duyệt ở thượng nguồn — không cần duyệt tại đơn vị`);
  if (p.status === 'deprecated') throw Errors.conflict(`Rulepack ${p.id}@${p.version} đã deprecated`);
  if (TAX_DOMAINS.has(p.domain) && !a.taxReviewer?.trim()) throw Errors.validation(`Rulepack miền ${p.domain}: cần người duyệt thuế`);
  await db.insertInto('rulepack_approvals').values({
    tenant_id: tenantId, rulepack_id: p.id, rulepack_version: p.version, rulepack_hash: packHash(p), action: 'approve',
    accounting_reviewer: a.accountingReviewer.trim(), tax_reviewer: a.taxReviewer?.trim() || null, note: a.note.trim(), actor: a.actor,
  }).execute();
  return { rulepackId: p.id, version: p.version, hash: packHash(p) };
}

export async function revokeRulepack(db: Db, tenantId: string, a: { rulepackId: string; note: string; actor: string }) {
  const p = packOf(a.rulepackId);
  const cur = (await latestRows(db, tenantId)).find((r) => r.rulepack_id === p.id);
  if (!cur || cur.action !== 'approve') throw Errors.conflict(`Rulepack ${p.id} chưa được duyệt tại đơn vị — không có gì để thu hồi`);
  await db.insertInto('rulepack_approvals').values({
    tenant_id: tenantId, rulepack_id: p.id, rulepack_version: cur.rulepack_version, rulepack_hash: cur.rulepack_hash, action: 'revoke',
    accounting_reviewer: null, tax_reviewer: null, note: a.note.trim(), actor: a.actor,
  }).execute();
  return { rulepackId: p.id, version: cur.rulepack_version, hash: cur.rulepack_hash };
}
