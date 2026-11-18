/**
 * Chương trình khuyến mại (phiếu NT-BH-025): bản nháp + duyệt, nhật ký, cảnh báo trùng, hạn mức lượt theo cửa hàng, lượt đã dùng,
 * báo cáo. Bảng của module: mod_pos.promo_drafts / promo_draft_log / promo_quotas / promo_uses. Phát hành vào sổ chính sách vẫn là
 * màn gọi POST /api/v1/policies bằng quyền người duyệt (module không ghi bảng Core); đọc chính sách qua action đọc core.policy.list.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: nháp / duyệt / trùng / hạn mức / báo cáo khuyến mại (đóng góp)
import { randomUUID } from 'node:crypto';
import { Errors, sql, type ActionContext } from '@bizcity/module-sdk';
import {
  EDITABLE, overlapOf, quotaFor, quotaMessage, quotaRows, skusOf, windowOf,
  type DraftContent, type DraftStatus, type Overlap, type PromoShape, type PromoUse, type Quota, type QuotaShort,
} from './domain/promo.js';
import { todayVn } from './read.js';

export type Tx = Parameters<Parameters<ActionContext['data']['module']>[0]>[0];

/** Khoá theo giao dịch (như lockKey của order-service — chép lại để không import vòng). */
const lockKey = async (tx: Tx, key: string) => { await sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`.execute(tx); };

type DraftRow = {
  draft_id: string; policy_key: string; rule_contract: string; params: Record<string, unknown>; branch_codes: string[]; effective_from: string;
  reason: string | null; quota: Quota | null; status: DraftStatus; source: string; source_ref: string | null; created_by: string; created_by_name: string | null;
  created_at: Date; updated_by: string; updated_at: Date; approved_by: string | null; approved_by_name: string | null; approved_at: Date | null;
  reject_reason: string | null; published_version: number | null; published_at: Date | null;
};
const COLS = sql`draft_id::text AS draft_id, policy_key, rule_contract, params, branch_codes, effective_from::text AS effective_from, reason, quota, status, source,
  source_ref, created_by, created_by_name, created_at, updated_by, updated_at, approved_by, approved_by_name, approved_at, reject_reason, published_version, published_at`;

export function toDraft(r: DraftRow) {
  return {
    id: r.draft_id, key: r.policy_key, ruleContract: r.rule_contract, params: r.params, branchCodes: r.branch_codes ?? [], effectiveFrom: r.effective_from,
    reason: r.reason ?? '', quota: r.quota, status: r.status, source: r.source, sourceRef: r.source_ref,
    createdBy: r.created_by, createdByName: r.created_by_name ?? '', createdAt: r.created_at.toISOString(),
    updatedBy: r.updated_by, updatedAt: r.updated_at.toISOString(),
    approvedBy: r.approved_by, approvedByName: r.approved_by_name ?? '', approvedAt: r.approved_at?.toISOString() ?? null,
    rejectReason: r.reject_reason ?? '', publishedVersion: r.published_version, publishedAt: r.published_at?.toISOString() ?? null,
  };
}
export type Draft = ReturnType<typeof toDraft>;

async function getRow(tx: Tx, id: string, lock = false): Promise<DraftRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw Errors.notFound(`bản nháp khuyến mại ${id}`);
  const r = (await sql<DraftRow>`SELECT ${COLS} FROM mod_pos.promo_drafts WHERE draft_id = ${id}::uuid ${lock ? sql`FOR UPDATE` : sql``}`.execute(tx)).rows[0];
  if (!r) throw Errors.notFound(`bản nháp khuyến mại ${id}`);
  return r;
}

async function log(tx: Tx, ctx: ActionContext, key: string, action: string, draftId: string | null, note?: string) {
  await sql`INSERT INTO mod_pos.promo_draft_log (tenant_id, draft_id, policy_key, action, actor, actor_name, note)
    VALUES (${ctx.tenant.id}, ${draftId}::uuid, ${key}, ${action}, ${ctx.actor.id}, ${ctx.actor.name || null}, ${note ?? null})`.execute(tx);
}

export async function listDrafts(tx: Tx, f: { status?: string; q?: string }) {
  const q = f.q?.trim();
  const rows = (await sql<DraftRow>`SELECT ${COLS} FROM mod_pos.promo_drafts
     WHERE true ${f.status ? sql`AND status = ${f.status}` : sql`AND status <> 'published'`}
       ${q ? sql`AND (policy_key ILIKE ${`%${q}%`} OR coalesce(reason, '') ILIKE ${`%${q}%`})` : sql``}
     ORDER BY updated_at DESC LIMIT 500`.execute(tx)).rows;
  return rows.map(toDraft);
}

export async function getDraft(tx: Tx, id: string) {
  const r = await getRow(tx, id);
  const logRows = (await sql<{ action: string; actor: string; actor_name: string | null; note: string | null; at: Date }>`
    SELECT action, actor, actor_name, note, at FROM mod_pos.promo_draft_log WHERE policy_key = ${r.policy_key} ORDER BY at, id`.execute(tx)).rows;
  return { ...toDraft(r), log: logRows.map((l) => ({ action: l.action, actor: l.actor, actorName: l.actor_name ?? '', note: l.note ?? '', at: l.at.toISOString() })) };
}

const openOf = async (tx: Tx, key: string) => (await sql<DraftRow>`
  SELECT ${COLS} FROM mod_pos.promo_drafts WHERE policy_key = ${key} AND status IN ('draft', 'pending', 'approved', 'rejected') FOR UPDATE`.execute(tx)).rows[0];

/** Lưu nháp: thêm (id trống — mã đã có nháp đang mở thì báo) hoặc sửa nháp đang sửa được. `submit` = gửi duyệt luôn. */
export async function saveDraft(tx: Tx, ctx: ActionContext, c: DraftContent, opts: { id?: string; submit?: boolean }) {
  await lockKey(tx, `pos:promo-draft:${c.key}`);
  const status: DraftStatus = opts.submit ? 'pending' : 'draft';
  if (opts.id) {
    const cur = await getRow(tx, opts.id, true);
    if (!EDITABLE.includes(cur.status)) throw Errors.conflict(`Bản nháp ${cur.policy_key} đang ở trạng thái "${cur.status}" — không sửa được`, { reason: 'POS_PROMO_DRAFT_STATE', status: cur.status });
    if (cur.policy_key !== c.key) throw Errors.validation('Không đổi mã khuyến mại của bản nháp — lập nháp mới', { field: 'key' });
    await sql`UPDATE mod_pos.promo_drafts SET rule_contract = ${c.ruleContract}, params = ${JSON.stringify(c.params)}::jsonb,
        branch_codes = ${JSON.stringify(c.branchCodes)}::jsonb, effective_from = ${c.effectiveFrom}, reason = ${c.reason ?? null},
        quota = ${c.quota ? JSON.stringify(c.quota) : null}::jsonb, status = ${status}, updated_by = ${ctx.actor.id}, updated_at = now()
      WHERE draft_id = ${opts.id}::uuid`.execute(tx);
    await log(tx, ctx, c.key, opts.submit ? 'submit' : 'update', opts.id);
    return toDraft(await getRow(tx, opts.id));
  }
  const open = await openOf(tx, c.key);
  if (open) throw Errors.conflict(`Mã ${c.key} đã có bản nháp đang mở — sửa bản nháp đó`, { reason: 'POS_PROMO_DRAFT_STATE', status: open.status, draftId: open.draft_id });
  const id = randomUUID();
  await insertDraft(tx, ctx, id, c, status, 'screen', null);
  await log(tx, ctx, c.key, 'create', id);
  if (opts.submit) await log(tx, ctx, c.key, 'submit', id);
  return toDraft(await getRow(tx, id));
}

async function insertDraft(tx: Tx, ctx: ActionContext, id: string, c: DraftContent, status: DraftStatus, source: string, sourceRef: string | null) {
  await sql`INSERT INTO mod_pos.promo_drafts (draft_id, tenant_id, policy_key, rule_contract, params, branch_codes, effective_from, reason, quota, status,
      source, source_ref, created_by, created_by_name, updated_by)
    VALUES (${id}::uuid, ${ctx.tenant.id}, ${c.key}, ${c.ruleContract}, ${JSON.stringify(c.params)}::jsonb, ${JSON.stringify(c.branchCodes)}::jsonb,
      ${c.effectiveFrom}, ${c.reason ?? null}, ${c.quota ? JSON.stringify(c.quota) : null}::jsonb, ${status}, ${source}, ${sourceRef},
      ${ctx.actor.id}, ${ctx.actor.name || null}, ${ctx.actor.id})`.execute(tx);
}

/** Nhận nháp hàng loạt (lệnh chuyển chương trình cũ của website): đã chuyển (cùng sourceRef) hoặc mã đang có nháp mở → bỏ qua, nêu lý do. */
export async function importDrafts(tx: Tx, ctx: ActionContext, source: string, items: (DraftContent & { sourceRef: string })[]) {
  const created: { sourceRef: string; key: string; id: string }[] = [];
  const skipped: { sourceRef: string; key: string; reason: string }[] = [];
  for (const it of items) {
    await lockKey(tx, `pos:promo-draft:${it.key}`);
    const done = (await sql<{ draft_id: string }>`SELECT draft_id::text AS draft_id FROM mod_pos.promo_drafts WHERE source_ref = ${it.sourceRef}`.execute(tx)).rows[0];
    if (done) { skipped.push({ sourceRef: it.sourceRef, key: it.key, reason: 'đã chuyển lần trước' }); continue; }
    if (await openOf(tx, it.key)) { skipped.push({ sourceRef: it.sourceRef, key: it.key, reason: `mã ${it.key} đang có bản nháp mở` }); continue; }
    const id = randomUUID();
    await insertDraft(tx, ctx, id, it, 'draft', 'migrate', it.sourceRef);
    await log(tx, ctx, it.key, 'import', id, `${source}: ${it.sourceRef}`);
    created.push({ sourceRef: it.sourceRef, key: it.key, id });
  }
  return { created, skipped };
}

/** Duyệt: người khác người lập; ghi hạn mức lượt theo cửa hàng; trả nội dung để màn phát hành bằng quyền người duyệt. */
export async function approveDraft(tx: Tx, ctx: ActionContext, id: string, note?: string) {
  const r = await getRow(tx, id, true);
  if (!['pending', 'draft', 'rejected'].includes(r.status)) throw Errors.conflict(`Bản nháp ${r.policy_key} đang ở trạng thái "${r.status}" — không duyệt được`, { reason: 'POS_PROMO_DRAFT_STATE', status: r.status });
  if (r.created_by === ctx.actor.id) throw Errors.forbidden(`Người lập khuyến mại ${r.policy_key} không tự duyệt — nhờ người có quyền Duyệt khuyến mại khác duyệt`);
  await sql`UPDATE mod_pos.promo_drafts SET status = 'approved', approved_by = ${ctx.actor.id}, approved_by_name = ${ctx.actor.name || null}, approved_at = now(),
      updated_by = ${ctx.actor.id}, updated_at = now() WHERE draft_id = ${id}::uuid`.execute(tx);
  await sql`DELETE FROM mod_pos.promo_quotas WHERE policy_key = ${r.policy_key}`.execute(tx);
  for (const q of quotaRows(r.quota)) {
    await sql`INSERT INTO mod_pos.promo_quotas (tenant_id, policy_key, branch_code, quota, draft_id)
      VALUES (${ctx.tenant.id}, ${r.policy_key}, ${q.branch}, ${q.quota}, ${id}::uuid)`.execute(tx);
  }
  await log(tx, ctx, r.policy_key, 'approve', id, note);
  return toDraft(await getRow(tx, id));
}

/** Màn đã phát hành xong (POST /api/v1/policies): ghi bản đã phát hành. */
export async function markPublished(tx: Tx, ctx: ActionContext, id: string, version: number) {
  const r = await getRow(tx, id, true);
  if (r.status === 'published') return toDraft(r);
  if (r.status !== 'approved') throw Errors.conflict(`Bản nháp ${r.policy_key} chưa duyệt`, { reason: 'POS_PROMO_DRAFT_STATE', status: r.status });
  await sql`UPDATE mod_pos.promo_drafts SET status = 'published', published_version = ${version}, published_at = now(), updated_by = ${ctx.actor.id}, updated_at = now()
    WHERE draft_id = ${id}::uuid`.execute(tx);
  await log(tx, ctx, r.policy_key, 'publish', id, `bản ${version}`);
  return toDraft(await getRow(tx, id));
}

/** Từ chối: về trạng thái "từ chối" kèm lý do — người lập sửa rồi gửi lại. Người lập không tự từ chối. */
export async function rejectDraft(tx: Tx, ctx: ActionContext, id: string, reason: string) {
  const r = await getRow(tx, id, true);
  if (!['pending', 'draft', 'approved'].includes(r.status)) throw Errors.conflict(`Bản nháp ${r.policy_key} đang ở trạng thái "${r.status}" — không từ chối được`, { reason: 'POS_PROMO_DRAFT_STATE', status: r.status });
  if (r.created_by === ctx.actor.id) throw Errors.forbidden(`Người lập khuyến mại ${r.policy_key} không tự từ chối / duyệt`);
  await sql`UPDATE mod_pos.promo_drafts SET status = 'rejected', reject_reason = ${reason}, approved_by = NULL, approved_by_name = NULL, approved_at = NULL,
      updated_by = ${ctx.actor.id}, updated_at = now() WHERE draft_id = ${id}::uuid`.execute(tx);
  await log(tx, ctx, r.policy_key, 'reject', id, reason);
  return toDraft(await getRow(tx, id));
}

/** Ghi nhật ký ngừng (màn phát hành bản "ngừng" qua sổ chính sách). */
export async function logStop(tx: Tx, ctx: ActionContext, key: string, from: string) {
  await log(tx, ctx, key, 'stop', null, `từ ${from}`);
}

// ── Cảnh báo trùng ─────────────────────────────────────────────────────────────────────────────────────────────────────
type PolicyView = { policyKey: string; ruleContract: string; params: Record<string, unknown> | null; scope?: { branchCodes?: string[] }; effectiveFrom: string | null; effectiveTo?: string | null };

/** Chương trình đang áp / sắp áp (sổ chính sách, đọc qua core.policy.list) + nháp chờ duyệt cùng mã hàng, cùng cửa hàng, giao thời gian. */
export async function overlapsFor(ctx: ActionContext, me: Omit<PromoShape, 'from' | 'to'> & { effectiveFrom: string }, excludeDraftId?: string): Promise<Overlap[]> {
  const w = windowOf(me.params, me.effectiveFrom);
  const shape: PromoShape = { ...me, ...w };
  const today = todayVn();
  const dates = [...new Set([w.from > today ? w.from : today, ...(w.to && w.to > today ? [w.to] : [])])];
  const seen = new Map<string, PolicyView>();
  for (const at of dates) {
    const r = await ctx.actions.call<{ items: PolicyView[] }>('core.policy.list', { domain: 'sale', at });
    for (const p of r.items) if (p.params && p.ruleContract.startsWith('sale.promo.') && !seen.has(p.policyKey)) seen.set(p.policyKey, p);
  }
  const out: Overlap[] = [];
  for (const p of seen.values()) {
    const other: PromoShape = { key: p.policyKey, contract: p.ruleContract, params: p.params!, branchCodes: p.scope?.branchCodes ?? [], ...windowOf(p.params!, p.effectiveFrom, p.effectiveTo ?? null) };
    const o = overlapOf(shape, other);
    if (o) out.push({ key: other.key, source: 'published', status: 'published', name: String(p.params!.name ?? ''), branches: other.branchCodes, from: other.from, to: other.to, skus: o.skus });
  }
  const drafts = await ctx.data.module(async (tx) => (await sql<DraftRow>`SELECT ${COLS} FROM mod_pos.promo_drafts
    WHERE status IN ('pending', 'approved') ${excludeDraftId ? sql`AND draft_id <> ${excludeDraftId}::uuid` : sql``}`.execute(tx)).rows);
  for (const d of drafts) {
    const other: PromoShape = { key: d.policy_key, contract: d.rule_contract, params: d.params, branchCodes: d.branch_codes ?? [], ...windowOf(d.params, d.effective_from) };
    const o = overlapOf(shape, other);
    if (o) out.push({ key: other.key, source: 'draft', status: d.status, name: d.reason ?? '', branches: other.branchCodes, from: other.from, to: other.to, skus: o.skus });
  }
  // Tên của chương trình đã phát hành: lý do của nháp đã phát hành gần nhất (màn lưu tên ở lý do).
  const names = await ctx.data.module(async (tx) => new Map((await sql<{ policy_key: string; reason: string | null }>`
    SELECT DISTINCT ON (policy_key) policy_key, reason FROM mod_pos.promo_drafts WHERE status = 'published' ORDER BY policy_key, published_at DESC`.execute(tx)).rows
    .map((r) => [r.policy_key, r.reason ?? ''])));
  for (const o of out) if (!o.name) o.name = names.get(o.key) ?? '';
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/** Câu cảnh báo trùng: "Giảm 10 % SUA330 (KM-A; CN01; 2026-11-20–2026-11-30)". */
export const overlapText = (o: Overlap) => `${o.name || o.key} (${o.key}; ${o.branches.length ? o.branches.join(', ') : 'mọi cửa hàng'}; ${o.from || '…'}–${o.to ?? 'không hạn'})`;

export function shapeOfDraft(d: Pick<Draft, 'key' | 'ruleContract' | 'params' | 'branchCodes' | 'effectiveFrom'>) {
  return { key: d.key, contract: d.ruleContract, params: d.params, branchCodes: d.branchCodes, effectiveFrom: d.effectiveFrom };
}
export { skusOf };

// ── Hạn mức lượt ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** Hạn mức + lượt đã dùng (chưa trả) của các chương trình ở một cửa hàng; chỉ chương trình có hạn mức. `excludeRef`: bỏ đơn / phiếu đang xét. */
export async function quotaState(tx: Tx, branch: string, keys: readonly string[], excludeRef?: string): Promise<{ key: string; quota: number; used: number; left: number }[]> {
  const list = [...new Set(keys)].sort();
  if (!list.length) return [];
  const qs = (await sql<{ policy_key: string; branch_code: string; quota: number }>`
    SELECT policy_key, branch_code, quota FROM mod_pos.promo_quotas WHERE policy_key IN (${sql.join(list)}) AND branch_code IN (${branch}, '*')`.execute(tx)).rows;
  const out: { key: string; quota: number; used: number; left: number }[] = [];
  for (const key of list) {
    const quota = quotaFor(qs.filter((q) => q.policy_key === key), branch);
    if (quota === undefined) continue;
    const used = Number((await sql<{ n: string }>`SELECT count(*) AS n FROM mod_pos.promo_uses
      WHERE policy_key = ${key} AND branch_code = ${branch} AND released_at IS NULL ${excludeRef ? sql`AND ref_id <> ${excludeRef}` : sql``}`.execute(tx)).rows[0]!.n);
    out.push({ key, quota, used, left: Math.max(0, quota - used) });
  }
  return out;
}

/**
 * Máy bán nhận đơn: khoá cửa hàng × chương trình (thứ tự mã cố định) tới hết giao dịch — hai máy cùng áp một chương trình chạy nối
 * tiếp, đơn sau thấy lượt của đơn trước (như khoá tồn NT-BH-021). Trả chương trình đã hết lượt.
 */
export async function checkQuota(tx: Tx, branch: string, keys: readonly string[], orderId: string): Promise<QuotaShort[]> {
  const list = [...new Set(keys)].sort();
  for (const k of list) await lockKey(tx, `pos:promo:${branch}:${k}`);
  return (await quotaState(tx, branch, list, orderId)).filter((s) => s.used >= s.quota).map(({ key, quota, used }) => ({ key, quota, used }));
}
export { quotaMessage };

/** Ghi lượt dùng (mỗi đơn × chương trình một dòng; ghi lại = cập nhật, bỏ trả lượt). */
export async function recordUses(tx: Tx, tenantId: string | number, u: { source: 'pos' | 'phieu-ban'; refId: string; refCode: string; branch: string; date: string; uses: PromoUse[]; offlineOver?: string[] }) {
  for (const x of u.uses) {
    await sql`INSERT INTO mod_pos.promo_uses (tenant_id, policy_key, branch_code, source, ref_id, ref_code, business_date, discount, gift_qty, offline_over)
      VALUES (${tenantId}, ${x.key}, ${u.branch}, ${u.source}, ${u.refId}, ${u.refCode}, ${u.date}, ${x.discount}, ${x.giftQty}, ${(u.offlineOver ?? []).includes(x.key)})
      ON CONFLICT (tenant_id, source, ref_id, policy_key) DO UPDATE SET branch_code = EXCLUDED.branch_code, ref_code = EXCLUDED.ref_code,
        business_date = EXCLUDED.business_date, discount = EXCLUDED.discount, gift_qty = EXCLUDED.gift_qty, released_at = NULL, release_reason = NULL`.execute(tx);
  }
}

/** Trả lượt của một đơn / phiếu (trả cả đơn, huỷ đơn chờ thanh toán, bỏ duyệt phiếu bán). */
export async function releaseUses(tx: Tx, source: 'pos' | 'phieu-ban', refId: string, reason: string) {
  await sql`UPDATE mod_pos.promo_uses SET released_at = now(), release_reason = ${reason}
    WHERE source = ${source} AND ref_id = ${refId} AND released_at IS NULL`.execute(tx);
}

// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-030 Q4: bỏ duyệt phiếu trả BH11 đã trả lượt → lấy lại lượt của phiếu bán gốc (đóng góp)
/** Lấy lại lượt đã trả vì trả hàng (release_reason = 'return') của một đơn / phiếu — phiếu trả bị bỏ duyệt. */
export async function restoreReturnedUses(tx: Tx, source: 'pos' | 'phieu-ban', refId: string) {
  await sql`UPDATE mod_pos.promo_uses SET released_at = NULL, release_reason = NULL
    WHERE source = ${source} AND ref_id = ${refId} AND release_reason = 'return'`.execute(tx);
}

// ── Báo cáo ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Theo chương trình × cửa hàng × kỳ: số đơn áp, đơn đã trả lượt, tiền giảm, số quà (đơn còn tính); lượt đang dùng / hạn mức (mọi kỳ). */
export async function promoReport(tx: Tx, f: { from: string; to: string; branches: string[]; key?: string }) {
  const rows = (await sql<{ policy_key: string; branch_code: string; orders: string; released: string; discount: string | null; gifts: string | null; offline: string }>`
    SELECT policy_key, branch_code, count(*) FILTER (WHERE released_at IS NULL) AS orders, count(*) FILTER (WHERE released_at IS NOT NULL) AS released,
           sum(discount) FILTER (WHERE released_at IS NULL) AS discount, sum(gift_qty) FILTER (WHERE released_at IS NULL) AS gifts,
           count(*) FILTER (WHERE offline_over) AS offline
      FROM mod_pos.promo_uses
     WHERE business_date BETWEEN ${f.from} AND ${f.to} ${f.branches.length ? sql`AND branch_code IN (${sql.join(f.branches)})` : sql``}
       ${f.key ? sql`AND policy_key ILIKE ${`%${f.key.trim()}%`}` : sql``}
     GROUP BY policy_key, branch_code ORDER BY policy_key, branch_code`.execute(tx)).rows;
  const names = new Map((await sql<{ policy_key: string; reason: string | null }>`
    SELECT DISTINCT ON (policy_key) policy_key, reason FROM mod_pos.promo_drafts ORDER BY policy_key, updated_at DESC`.execute(tx)).rows.map((r) => [r.policy_key, r.reason ?? '']));
  const out = [];
  for (const r of rows) {
    const st = (await quotaState(tx, r.branch_code, [r.policy_key]))[0];
    const usedAll = st?.used ?? Number((await sql<{ n: string }>`SELECT count(*) AS n FROM mod_pos.promo_uses
      WHERE policy_key = ${r.policy_key} AND branch_code = ${r.branch_code} AND released_at IS NULL`.execute(tx)).rows[0]!.n);
    out.push({
      key: r.policy_key, name: names.get(r.policy_key) ?? '', branchCode: r.branch_code, orders: Number(r.orders), released: Number(r.released),
      discount: Number(r.discount ?? 0), gifts: Number(r.gifts ?? 0), offlineOver: Number(r.offline), used: usedAll, quota: st?.quota ?? null, left: st ? st.left : null,
    });
  }
  return out;
}

/** Đơn / phiếu đã áp một chương trình ở một cửa hàng trong kỳ (bấm xem đơn ở báo cáo). */
export async function promoReportOrders(tx: Tx, f: { key: string; branch: string; from: string; to: string }) {
  return (await sql<{ source: string; ref_id: string; ref_code: string | null; business_date: string; discount: string; gift_qty: string; offline_over: boolean; released_at: Date | null; release_reason: string | null }>`
    SELECT source, ref_id, ref_code, business_date::text AS business_date, discount, gift_qty, offline_over, released_at, release_reason FROM mod_pos.promo_uses
     WHERE policy_key = ${f.key} AND branch_code = ${f.branch} AND business_date BETWEEN ${f.from} AND ${f.to} ORDER BY business_date, id`.execute(tx)).rows
    .map((r) => ({
      source: r.source, refId: r.ref_id, code: r.ref_code ?? '', businessDate: r.business_date, discount: Number(r.discount), gifts: Number(r.gift_qty),
      offlineOver: r.offline_over, released: r.released_at !== null, releaseReason: r.release_reason ?? '',
    }));
}
