// @bizcity-layer P module-sdk
// [2026-11-09 09:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W4a (S031-28, chữ chốt PHASE-031 · 00 §12): đọc sổ đăng ký, chứng từ đã áp, theo dõi thực hiện, truy vết ngược
/**
 * Truy vấn chỉ đọc cho màn *Chính sách* và *Theo dõi thực hiện chính sách*. Nguồn duy nhất: `policy_registry` (phong bì) và khung nhìn
 * `bizcity_read.policy_application` (chứng từ đã áp). Không bảng tổng hợp, không job: đo ở quy mô lớn rồi mới quyết view vật chất hoá (S031-24).
 * Mọi truy vấn lọc `tenant_id` (R-TEN) và chạy trên giao dịch của action.
 */
import { sql } from 'kysely';
import type { Db } from '@bizcity/platform/db/client';
import { Errors } from '@bizcity/platform/core/errors';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const today = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10); // ngày giờ Việt Nam
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export interface RegistryVersion {
  version: number; effectiveFrom: string | null; effectiveTo: string | null; status: 'published' | 'retired'; contentHash: string;
  scope: Record<string, unknown>; publishedBy: string; publishedAt: string; reason: string | null; applied: number;
}
export interface RegistryPolicy {
  policyId: string; policyKey: string; ownerModule: string; ruleContract: string; versions: RegistryVersion[];
  current: number | null; gaps: { after: number; from: string; to: string }[]; expiresOn: string | null;
}

type RegRow = {
  policy_id: string; policy_key: string; owner_module: string; rule_contract: string; version: number; effective_from: string | null; effective_to: string | null;
  status: 'published' | 'retired'; content_hash: string; scope: Record<string, unknown>; published_by: string; published_at: unknown; reason: string | null; applied: number;
};

/** Khoảng trống giữa hai bản liền nhau (ngày chứng từ nào cũng phải có đúng một bản — sổ đăng ký tự đóng bản cũ nên khoảng trống chỉ do nhập tay). */
export function findGaps(vs: { version: number; effectiveFrom: string | null; effectiveTo: string | null }[]): { after: number; from: string; to: string }[] {
  const out: { after: number; from: string; to: string }[] = [];
  for (let i = 0; i + 1 < vs.length; i += 1) {
    const cur = vs[i]!, next = vs[i + 1]!;
    if (cur.effectiveTo && next.effectiveFrom) {
      const from = addDays(cur.effectiveTo, 1), to = addDays(next.effectiveFrom, -1);
      if (from <= to) out.push({ after: cur.version, from, to });
    }
  }
  return out;
}

/** Mọi chính sách của đơn vị, mỗi bản kèm số chứng từ đã áp; bản đang hiệu lực hôm nay; khoảng trống; ngày hết hạn nếu bản cuối đã có hạn. */
export async function policyRegistry(trx: Db, tenantId: string, f: { owner?: string; status?: 'published' | 'retired'; q?: string }): Promise<{ items: RegistryPolicy[] }> {
  const conds = [sql`r.tenant_id = ${tenantId}`];
  if (f.owner) conds.push(sql`r.owner_module = ${f.owner}`);
  if (f.status) conds.push(sql`r.status = ${f.status}`);
  if (f.q) conds.push(sql`(r.policy_key ILIKE ${'%' + escapeLike(f.q) + '%'} OR r.policy_id ILIKE ${'%' + escapeLike(f.q) + '%'})`);
  const { rows } = await sql<RegRow>`
    SELECT r.policy_id, r.policy_key, r.owner_module, r.rule_contract, r.version, r.effective_from::text AS effective_from, r.effective_to::text AS effective_to,
           r.status, r.content_hash, r.scope, r.published_by, r.published_at, r.reason,
           (SELECT count(DISTINCT a.event_id)::int FROM bizcity_read.policy_application a
             WHERE a.tenant_id = r.tenant_id AND a.version = r.version
               AND (a.policy_id = r.policy_id OR (a.policy_id IS NULL AND a.policy_key = r.policy_key))) AS applied
      FROM policy_registry r WHERE ${sql.join(conds, sql` AND `)}
     ORDER BY r.policy_key, r.policy_id, r.version`.execute(trx);
  const t = today();
  const by = new Map<string, RegistryPolicy>();
  for (const r of rows) {
    let p = by.get(r.policy_id);
    if (!p) { p = { policyId: r.policy_id, policyKey: r.policy_key, ownerModule: r.owner_module, ruleContract: r.rule_contract, versions: [], current: null, gaps: [], expiresOn: null }; by.set(r.policy_id, p); }
    p.versions.push({
      version: Number(r.version), effectiveFrom: r.effective_from, effectiveTo: r.effective_to, status: r.status, contentHash: r.content_hash, scope: r.scope ?? {},
      publishedBy: r.published_by, publishedAt: r.published_at instanceof Date ? r.published_at.toISOString() : String(r.published_at), reason: r.reason, applied: Number(r.applied),
    });
  }
  const items = [...by.values()];
  for (const p of items) {
    const live = [...p.versions].reverse().find((v) => v.status === 'published' && (v.effectiveFrom === null || v.effectiveFrom <= t) && (v.effectiveTo === null || v.effectiveTo >= t));
    p.current = live?.version ?? null;
    p.gaps = findGaps(p.versions);
    const last = p.versions.at(-1)!;
    p.expiresOn = last.status === 'published' ? last.effectiveTo : null;
  }
  return { items };
}

export interface ApplicationRow { eventId: number; docKey: string; docType: string; docDate: string | null; sourceSystem: string; status: string; version: number; codes: string[]; ok: boolean }

/** Chứng từ đã áp một chính sách (tuỳ chọn một bản), mới nhất trước; `cursor` = event_id của dòng cuối trang trước. */
export async function policyApplications(trx: Db, tenantId: string, policyId: string, f: { version?: number; cursor?: number; limit: number }): Promise<{ items: ApplicationRow[]; next: number | null }> {
  const key = (await sql<{ policy_key: string }>`SELECT policy_key FROM policy_registry WHERE tenant_id = ${tenantId} AND policy_id = ${policyId} LIMIT 1`.execute(trx)).rows[0]?.policy_key;
  if (!key) throw Errors.notFound(`chính sách ${policyId}`);
  const conds = [sql`a.tenant_id = ${tenantId}`, sql`(a.policy_id = ${policyId} OR (a.policy_id IS NULL AND a.policy_key = ${key}))`];
  if (f.version) conds.push(sql`a.version = ${f.version}`);
  if (f.cursor) conds.push(sql`a.event_id < ${f.cursor}`);
  const { rows } = await sql<{ event_id: string; doc_key: string; doc_type: string; doc_date: string | null; source_system: string; status: string; version: number; codes: string[]; ok: boolean }>`
    SELECT a.event_id::text AS event_id, a.doc_key, a.doc_type, a.doc_date::text AS doc_date, a.source_system, a.status, a.version, a.codes, a.ok
      FROM bizcity_read.policy_application a WHERE ${sql.join(conds, sql` AND `)}
     ORDER BY a.event_id DESC LIMIT ${f.limit + 1}`.execute(trx);
  const page = rows.slice(0, f.limit);
  return {
    items: page.map((r) => ({ eventId: Number(r.event_id), docKey: r.doc_key, docType: r.doc_type, docDate: r.doc_date, sourceSystem: r.source_system, status: r.status, version: Number(r.version), codes: r.codes ?? [], ok: r.ok })),
    next: rows.length > f.limit ? Number(page[page.length - 1]!.event_id) : null,
  };
}

export interface TrackingFilter { from?: string; to?: string; branch?: string; source?: string; owner?: string }

/** Các ô theo dõi tính được từ dữ liệu có sẵn (00 §12 mục 2). Tỉ lệ khi mẫu số 0 trả null, không chia cho 0. */
export async function policyTracking(trx: Db, tenantId: string, f: TrackingFilter) {
  const to = f.to ?? today();
  const from = f.from ?? addDays(to, -29);
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw Errors.validation('from / to phải dạng YYYY-MM-DD');
  if (from > to) throw Errors.validation('from không được sau to');
  const base = [sql`a.tenant_id = ${tenantId}`, sql`a.doc_date BETWEEN ${from}::date AND ${to}::date`];
  if (f.source) base.push(sql`a.source_system = ${f.source}`);
  if (f.branch) base.push(sql`a.branch_id = (SELECT id FROM branches WHERE tenant_id = ${tenantId} AND code = ${f.branch})`);
  if (f.owner) base.push(sql`EXISTS (SELECT 1 FROM policy_registry r WHERE r.tenant_id = a.tenant_id AND r.owner_module = ${f.owner} AND (r.policy_id = a.policy_id OR (a.policy_id IS NULL AND r.policy_key = a.policy_key)))`);
  const W = sql.join(base, sql` AND `);

  const pass = (await sql<{ events: number; passed: number; total: string | null }>`
    SELECT count(*)::int AS events, count(*) FILTER (WHERE all_ok)::int AS passed, sum(total)::text AS total FROM (
      SELECT a.event_id, bool_and(a.ok) AS all_ok, max(e.total) AS total
        FROM bizcity_read.policy_application a JOIN accounting_events e ON e.id = a.event_id AND e.tenant_id = a.tenant_id
       WHERE ${W} GROUP BY a.event_id) q`.execute(trx)).rows[0]!;

  const codes = (await sql<{ code: string; n: number }>`
    SELECT c AS code, count(*)::int AS n FROM bizcity_read.policy_application a, unnest(a.codes) AS c WHERE ${W} GROUP BY c ORDER BY n DESC, c`.execute(trx)).rows;

  const stale = (await sql<{ source_system: string; policy_key: string; stale: number; last_sent: number }>`
    SELECT a.source_system, a.policy_key, count(*) FILTER (WHERE 'IN-POL-003' = ANY(a.codes))::int AS stale, max(a.version)::int AS last_sent
      FROM bizcity_read.policy_application a WHERE ${W}
     GROUP BY a.source_system, a.policy_key HAVING count(*) FILTER (WHERE 'IN-POL-003' = ANY(a.codes)) > 0
     ORDER BY stale DESC, a.source_system, a.policy_key`.execute(trx)).rows;

  // Độ phủ: chỉ miền bán (doc_type 'sale') có Rule Contract `sale.*` hiệu lực trong kỳ; miền khác chưa có Rule Contract nên chưa tính.
  const hasSalePolicy = (await sql`SELECT 1 FROM policy_registry WHERE tenant_id = ${tenantId} AND rule_contract LIKE 'sale.%' AND status = 'published'
      AND (effective_from IS NULL OR effective_from <= ${to}::date) AND (effective_to IS NULL OR effective_to >= ${from}::date) LIMIT 1`.execute(trx)).rows.length > 0;
  const coverage = hasSalePolicy ? (await sql<{ source_system: string; events: number; with_refs: number }>`
    SELECT e.source_system, count(*)::int AS events,
           count(*) FILTER (WHERE jsonb_array_length(COALESCE(e.payload->'policyRefs', '[]'::jsonb)) > 0)::int AS with_refs
      FROM accounting_events e WHERE e.tenant_id = ${tenantId} AND e.doc_type = 'sale' AND e.status <> 'cancelled' AND e.doc_date BETWEEN ${from}::date AND ${to}::date
       ${f.source ? sql`AND e.source_system = ${f.source}` : sql``}
     GROUP BY e.source_system ORDER BY e.source_system`.execute(trx)).rows : [];

  const reg = await policyRegistry(trx, tenantId, f.owner ? { owner: f.owner } : {});
  const t = today();
  const soon = addDays(t, 30);
  const timeline = reg.items.flatMap((p) => p.versions.filter((v) => (v.effectiveFrom === null || v.effectiveFrom <= to) && (v.effectiveTo === null || v.effectiveTo >= from))
    .map((v) => ({ policyId: p.policyId, policyKey: p.policyKey, version: v.version, effectiveFrom: v.effectiveFrom, effectiveTo: v.effectiveTo, status: v.status })));
  const health = {
    expiringSoon: reg.items.filter((p) => p.expiresOn && p.expiresOn >= t && p.expiresOn <= soon).map((p) => ({ policyId: p.policyId, policyKey: p.policyKey, expiresOn: p.expiresOn! })),
    noPublished: reg.items.filter((p) => !p.versions.some((v) => v.status === 'published')).map((p) => ({ policyId: p.policyId, policyKey: p.policyKey })),
    gaps: reg.items.filter((p) => p.gaps.length).map((p) => ({ policyId: p.policyId, policyKey: p.policyKey, gaps: p.gaps })),
  };
  const ratio = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 10000) / 10000 : null);
  return {
    range: { from, to },
    applied: { events: pass.events, total: pass.total == null ? 0 : Number(pass.total) },
    pass: { events: pass.events, passed: pass.passed, rate: ratio(pass.passed, pass.events) },
    codes,
    coverage: coverage.map((c) => ({ sourceSystem: c.source_system, events: c.events, withRefs: c.with_refs, rate: ratio(c.with_refs, c.events) })),
    stale,
    timeline,
    health,
  };
}

/** Chuỗi ngược của một sự việc: mỗi policyRef → phong bì bản đó, băm khớp?, ngày chứng từ có nằm trong hiệu lực của bản đó?, kết quả kiểm lúc nhận. */
export async function policyLineage(trx: Db, tenantId: string, q: { eventId?: number; docKey?: string }) {
  if (!q.eventId && !q.docKey) throw Errors.validation('Cần eventId hoặc docKey');
  const ev = (await sql<{ id: string; doc_key: string; doc_type: string; doc_date: string | null; status: string; source_system: string; payload: { policyRefs?: { key: string; version: number; hash: string; policyId?: string }[] }; policy_check: unknown }>`
    SELECT id::text AS id, doc_key, doc_type, doc_date::text AS doc_date, status, source_system, payload, policy_check FROM accounting_events
     WHERE tenant_id = ${tenantId} AND ${q.eventId ? sql`id = ${q.eventId}` : sql`doc_key = ${q.docKey!}`} LIMIT 1`.execute(trx)).rows[0];
  if (!ev) throw Errors.notFound('sự việc');
  const refs = Array.isArray(ev.payload?.policyRefs) ? ev.payload.policyRefs : [];
  const out = [];
  for (const ref of refs) {
    const env = (await sql<{ policy_id: string; version: number; content_hash: string; effective_from: string | null; effective_to: string | null; status: string; owner_module: string }>`
      SELECT policy_id, version, content_hash, effective_from::text AS effective_from, effective_to::text AS effective_to, status, owner_module FROM policy_registry
       WHERE tenant_id = ${tenantId} AND version = ${ref.version} AND ${ref.policyId ? sql`policy_id = ${ref.policyId}` : sql`policy_key = ${ref.key}`}
       ORDER BY policy_id LIMIT 1`.execute(trx)).rows[0];
    const d = ev.doc_date;
    out.push({
      key: ref.key, version: ref.version, sentHash: ref.hash,
      registered: Boolean(env), policyId: env?.policy_id ?? null, ownerModule: env?.owner_module ?? null, status: env?.status ?? null,
      registryHash: env?.content_hash ?? null, hashMatches: env ? env.content_hash === ref.hash : false,
      covers: env && d ? (env.effective_from === null || env.effective_from <= d) && (env.effective_to === null || env.effective_to >= d) : null,
      effectiveFrom: env?.effective_from ?? null, effectiveTo: env?.effective_to ?? null,
    });
  }
  return {
    event: { eventId: Number(ev.id), docKey: ev.doc_key, docType: ev.doc_type, docDate: ev.doc_date, status: ev.status, sourceSystem: ev.source_system },
    refs: out, policyCheck: ev.policy_check ?? null,
  };
}
