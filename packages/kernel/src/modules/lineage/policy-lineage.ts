// @bizcity-layer K kernel/lineage
// [2026-11-21 09:05 AM Võ Hoàng] PHASE-031 — S031-23 (bizcity_lineage@1 0.4.0-draft): làn `policy` — truy ngược chính sách đã áp, chỉ đọc, không hàm CSDL mới
/**
 * LÀN CHÍNH SÁCH của truy vết (PHASE-031 · 20 §2). CHỈ ĐỌC. Nối bằng khoá thật, không bảng / hàm CSDL mới:
 *   dòng sổ   ledger_lines → ledger_entries.event_id (+ policy_version = bản chính sách ĐỊNH KHOẢN)
 *   sự việc   accounting_events: payload.policyRefs (cấp phiếu, có băm), payload.lines[].policyRef (cấp dòng), policy_check (kết quả L4b)
 *   chính sách policy_registry (phong bì: băm, hiệu lực, người phát hành, căn cứ pháp lý) — đọc như L4b (intake/policy-check.ts), không đọc bảng module
 * Dòng sổ chưa mang lineKey của dòng chứng từ: nối dòng sổ ↔ dòng chứng từ bằng mã hàng + cờ quà (source_line_key giá vốn có đuôi `:gift`),
 * chỉ khi nối được DUY NHẤT; còn lại để null và nói rõ ở `notes`.
 */
import { sql } from 'kysely';
import type { Db } from '@bizcity/platform/db/client';
import { Errors } from '@bizcity/platform/core/errors';
import type { LineagePolicyApplied, LineagePolicyTag, LineagePolicyVerdict, PolicyLineage, PolicyLineageRef } from '@ketoan/contracts';

type SentRef = { key?: unknown; version?: unknown; hash?: unknown; policyId?: unknown };
type LineRef = { key?: unknown; version?: unknown; line?: unknown };
type CheckRef = { key?: string; version?: number; ok?: boolean; codes?: string[] };
export type PolicyCheckValue = { checkedAt?: string; mode?: string; findings?: { code?: string }[]; refs?: CheckRef[] } | null;

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const asRefs = (v: unknown): SentRef[] => (Array.isArray(v) ? (v as SentRef[]).filter((r) => r && typeof r.key === 'string' && Number.isInteger(Number(r.version))) : []);
const lineRefOf = (v: unknown): { key: string; version: number; line: string | null } | null => {
  const r = v as LineRef | null | undefined;
  if (!r || typeof r.key !== 'string' || !Number.isInteger(Number(r.version))) return null;
  return { key: r.key, version: Number(r.version), line: typeof r.line === 'string' ? r.line : null };
};

/** Kết quả L4b của một tham chiếu (key@version) trong policy_check của sự việc. */
export function verdictOf(check: PolicyCheckValue, key: string, version: number): { verdict: LineagePolicyVerdict; codes: string[] } {
  if (!check || !Array.isArray(check.refs)) return { verdict: 'none', codes: [] };
  const hit = check.refs.find((r) => r.key === key && Number(r.version) === version);
  if (!hit) return { verdict: 'none', codes: [] };
  const codes = Array.isArray(hit.codes) ? hit.codes : [];
  return { verdict: hit.ok === false || codes.length ? 'warn' : 'pass', codes };
}

/** Chính sách gắn vào một dòng chứng từ: policyRef của dòng; dòng không nêu thì mọi policyRefs của phiếu. */
export function policyTagsOf(lineRef: unknown, docRefs: unknown, check: PolicyCheckValue): LineagePolicyTag[] {
  const own = lineRefOf(lineRef);
  if (own) return [{ key: own.key, version: own.version, line: own.line, scope: 'line', ...verdictOf(check, own.key, own.version) }];
  return asRefs(docRefs).map((r) => {
    const key = String(r.key), version = Number(r.version);
    return { key, version, line: null, scope: 'doc' as const, ...verdictOf(check, key, version) };
  });
}

type Envelope = {
  policy_id: string; policy_key: string; version: number; rule_contract: string; owner_module: string; status: string; content_hash: string;
  effective_from: string | null; effective_to: string | null; published_by: string; published_at: unknown; legal_ref: string | null; reason: string | null;
};

/** Phong bì của bản `key@version`: ưu tiên policyId nguồn gửi (định danh), không có thì theo mã. */
async function envelopeOf(trx: Db, tenantId: string, key: string, version: number, policyId: string | null): Promise<Envelope | undefined> {
  return (await sql<Envelope>`
    SELECT policy_id, policy_key, version, rule_contract, owner_module, status, content_hash, effective_from::text AS effective_from,
           effective_to::text AS effective_to, published_by, published_at, legal_ref, reason
      FROM policy_registry
     WHERE tenant_id = ${tenantId} AND version = ${version} AND ${policyId ? sql`policy_id = ${policyId}` : sql`policy_key = ${key}`}
     ORDER BY policy_id LIMIT 1`.execute(trx)).rows[0];
}
const iso = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));

/** Một sự kiện của Hành trình để gom làn `policy`. */
export interface PolicyLaneInput { at: string; qty: number; isGift: boolean; policy: LineagePolicyTag[]; docRefs: unknown }

/** Gom làn `policy` của Hành trình: mỗi bản đã áp một dòng, kèm phong bì sổ đăng ký. */
export async function policyLane(trx: Db, tenantId: string, events: PolicyLaneInput[]): Promise<LineagePolicyApplied[]> {
  const by = new Map<string, { key: string; version: number; policyId: string | null; hash: string | null; events: number; giftQty: number; warn: number; first: string; last: string }>();
  for (const e of events) {
    for (const t of e.policy) {
      const id = `${t.key}@${t.version}`;
      const sent = asRefs(e.docRefs).find((r) => r.key === t.key && Number(r.version) === t.version);
      let g = by.get(id);
      if (!g) { g = { key: t.key, version: t.version, policyId: null, hash: null, events: 0, giftQty: 0, warn: 0, first: e.at, last: e.at }; by.set(id, g); }
      if (sent && typeof sent.policyId === 'string' && !g.policyId) g.policyId = sent.policyId;
      if (sent && typeof sent.hash === 'string' && !g.hash) g.hash = sent.hash;
      g.events += 1;
      if (e.isGift && t.scope === 'line') g.giftQty += Math.abs(e.qty);
      if (t.verdict === 'warn') g.warn += 1;
      if (e.at < g.first) g.first = e.at;
      if (e.at > g.last) g.last = e.at;
    }
  }
  const out: LineagePolicyApplied[] = [];
  for (const g of [...by.values()].slice(0, 50)) {
    const env = await envelopeOf(trx, tenantId, g.key, g.version, g.policyId);
    out.push({
      policyKey: g.key, version: g.version, policyId: env?.policy_id ?? null, ruleContract: env?.rule_contract ?? null, ownerModule: env?.owner_module ?? null,
      status: env?.status ?? null, contentHash: env?.content_hash ?? null, hashMatches: env ? (g.hash === null ? null : g.hash === env.content_hash) : null,
      effectiveFrom: env?.effective_from ?? null, effectiveTo: env?.effective_to ?? null, publishedBy: env?.published_by ?? null, publishedAt: iso(env?.published_at),
      legalRef: env?.legal_ref ?? null, events: g.events, giftQty: g.giftQty, warnEvents: g.warn, first: g.first, last: g.last,
    });
  }
  return out.sort((a, b) => a.policyKey.localeCompare(b.policyKey) || a.version - b.version);
}

export interface PolicyLineageQuery { eventId?: number; docKey?: string; entryNo?: string; lineKey?: string }

type DocLine = { lineKey?: unknown; sku?: unknown; qty?: unknown; isGift?: unknown; policyRef?: unknown };

/** Truy ngược chính sách từ một sự việc (eventId), một chứng từ (docKey) hay một bút toán (entryNo); `lineKey` thu về một dòng. */
export async function getPolicyLineage(trx: Db, tenantId: string, q: PolicyLineageQuery): Promise<PolicyLineage> {
  const from: PolicyLineage['from'] = q.eventId ? 'event' : q.docKey ? 'docKey' : q.entryNo ? 'entry' : (() => { throw Errors.validation('Cần eventId, docKey hoặc entryNo'); })();
  let eventId: string | null = null;
  if (from === 'entry') {
    const en = (await sql<{ event_id: string | null }>`SELECT event_id::text AS event_id FROM ledger_entries WHERE tenant_id = ${tenantId} AND entry_no = ${q.entryNo!} LIMIT 1`.execute(trx)).rows[0];
    if (!en) throw Errors.notFound(`bút toán ${q.entryNo}`);
    if (!en.event_id) throw Errors.notFound(`sự việc của bút toán ${q.entryNo} (bút toán không có sự việc)`);
    eventId = en.event_id;
  }
  const ev = (await sql<{
    id: string; doc_key: string; doc_no: string; doc_type: string; doc_date: string | null; version: number; status: string; source_system: string; branch: string | null;
    payload: { policyRefs?: unknown; lines?: unknown } | null; policy_check: PolicyCheckValue;
  }>`
    SELECT e.id::text AS id, e.doc_key, e.doc_no, e.doc_type, e.doc_date::text AS doc_date, e.version, e.status, e.source_system, b.code AS branch, e.payload, e.policy_check
      FROM accounting_events e LEFT JOIN branches b ON b.id = e.branch_id
     WHERE e.tenant_id = ${tenantId} AND ${from === 'docKey' ? sql`e.doc_key = ${q.docKey!}` : sql`e.id = ${eventId ?? q.eventId!}`}
     LIMIT 1`.execute(trx)).rows[0];
  if (!ev) throw Errors.notFound('sự việc');
  const check = ev.policy_check ?? null;
  const sent = asRefs(ev.payload?.policyRefs);
  const rawLines: DocLine[] = Array.isArray(ev.payload?.lines) ? (ev.payload!.lines as DocLine[]) : [];
  const allLines = rawLines.map((l, i) => ({
    lineNo: i + 1, lineKey: typeof l?.lineKey === 'string' ? l.lineKey : null, sku: typeof l?.sku === 'string' ? l.sku : '', qty: num(l?.qty), isGift: l?.isGift === true,
    policy: lineRefOf(l?.policyRef),
  }));
  const notes: string[] = [];
  const lines = q.lineKey ? allLines.filter((l) => l.lineKey === q.lineKey || String(l.lineNo) === q.lineKey) : allLines;
  if (q.lineKey && !lines.length) notes.push(`Chứng từ không có dòng ${q.lineKey}.`);

  // Tham chiếu: của phiếu (có băm) + của dòng mà phiếu không nêu (mồ côi — L4b đã báo IN-POL-001).
  const wanted = new Map<string, { key: string; version: number; hash: string | null; policyId: string | null }>();
  const lineScoped = Boolean(q.lineKey);
  for (const r of sent) {
    const key = String(r.key), version = Number(r.version);
    if (lineScoped && !lines.some((l) => !l.policy || (l.policy.key === key && l.policy.version === version))) continue;
    wanted.set(`${key}@${version}`, { key, version, hash: typeof r.hash === 'string' ? r.hash : null, policyId: typeof r.policyId === 'string' ? r.policyId : null });
  }
  for (const l of lines) if (l.policy && !wanted.has(`${l.policy.key}@${l.policy.version}`)) wanted.set(`${l.policy.key}@${l.policy.version}`, { key: l.policy.key, version: l.policy.version, hash: null, policyId: null });

  const refs: PolicyLineageRef[] = [];
  for (const w of wanted.values()) {
    const env = await envelopeOf(trx, tenantId, w.key, w.version, w.policyId);
    const d = ev.doc_date;
    refs.push({
      key: w.key, version: w.version, sentHash: w.hash, policyId: env?.policy_id ?? w.policyId, registered: Boolean(env), registryHash: env?.content_hash ?? null,
      hashMatches: env && w.hash !== null ? env.content_hash === w.hash : env ? null : false,
      covers: env && d ? (env.effective_from === null || env.effective_from <= d) && (env.effective_to === null || env.effective_to >= d) : null,
      status: env?.status ?? null, ownerModule: env?.owner_module ?? null, ruleContract: env?.rule_contract ?? null,
      effectiveFrom: env?.effective_from ?? null, effectiveTo: env?.effective_to ?? null, publishedBy: env?.published_by ?? null, publishedAt: iso(env?.published_at),
      legalRef: env?.legal_ref ?? null, reason: env?.reason ?? null, ...verdictOf(check, w.key, w.version),
      lines: allLines.filter((l) => l.policy?.key === w.key && l.policy.version === w.version).map((l) => l.lineKey ?? String(l.lineNo)),
    });
  }
  if (!wanted.size) notes.push('Chứng từ không gửi tham chiếu chính sách (policyRefs): không có chính sách nghiệp vụ để truy.');
  if (wanted.size && !check) notes.push('Chứng từ chưa có kết quả kiểm chính sách lúc nhận (policy_check trống — nhận trước PHASE-031 W2a).');

  const en = await sql<{
    entry_no: string; posting_date: string; account_code: string; debit: string; credit: string; part: string; product_sku: string | null; source_line_key: string | null;
    status: string; policy_version: number | null;
  }>`
    SELECT e.entry_no, l.posting_date::text AS posting_date, l.account_code, l.debit, l.credit, l.part, l.product_sku, l.source_line_key,
           CASE WHEN e.is_reversal THEN 'reversal' ELSE e.status END AS status, e.policy_version
      FROM ledger_entries e JOIN ledger_lines l ON l.entry_id = e.id
     WHERE e.tenant_id = ${tenantId} AND e.event_id = ${ev.id} ${from === 'entry' ? sql`AND e.entry_no = ${q.entryNo!}` : sql``}
     ORDER BY e.id, l.id LIMIT 500`.execute(trx);
  let unmatched = 0;
  const entries = en.rows.map((r) => {
    const gift = typeof r.source_line_key === 'string' && r.source_line_key.endsWith(':gift');
    const cands = r.product_sku ? allLines.filter((l) => l.sku === r.product_sku && (r.source_line_key?.startsWith('cost:') ? l.isGift === gift : true)) : [];
    const pols = [...new Set(cands.map((l) => (l.policy ? `${l.policy.key}@${l.policy.version}` : '')))];
    const one = cands.length && pols.length === 1 && pols[0] ? cands[0]!.policy : null;
    if (r.product_sku && cands.some((l) => l.policy) && !one) unmatched += 1;
    return {
      entryNo: r.entry_no, postingDate: r.posting_date, account: r.account_code, debit: num(r.debit), credit: num(r.credit), part: r.part, sku: r.product_sku,
      status: r.status, postingPolicyVersion: r.policy_version === null ? null : Number(r.policy_version), policy: one ? { key: one.key, version: one.version } : null,
    };
  });
  const filteredEntries = lineScoped ? entries.filter((x) => x.sku && lines.some((l) => l.sku === x.sku)) : entries;
  if (unmatched) notes.push(`${unmatched} dòng sổ cùng mã hàng có cả dòng theo chính sách và dòng không theo (hoặc nhiều chính sách): chưa nối được duy nhất — dòng sổ chưa mang lineKey.`);
  if (!en.rows.length) notes.push('Sự việc chưa có bút toán (chưa ghi sổ, đang chờ duyệt hoặc lỗi).');

  const allCodes = [...new Set([...(check?.findings ?? []).map((f) => f.code).filter((c): c is string => typeof c === 'string'), ...refs.flatMap((r) => r.codes)])].sort();
  return {
    from,
    event: { eventId: Number(ev.id), docKey: ev.doc_key, docNo: ev.doc_no, docType: ev.doc_type, docDate: ev.doc_date, version: Number(ev.version), status: ev.status, sourceSystem: ev.source_system, branch: ev.branch ?? '' },
    check: { checkedAt: check?.checkedAt ?? null, mode: check?.mode ?? null, verdict: !check ? 'none' : allCodes.length ? 'warn' : 'pass', codes: allCodes },
    refs, lines, entries: filteredEntries, notes,
  };
}
