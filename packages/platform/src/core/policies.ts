// @bizcity-layer P bizcity.config
// [2026-11-08 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W3b (S031-26, chữ chốt PHASE-031 · 00 §11): bizcity.policy.published / .retired qua outbox, cùng giao dịch với việc ghi
// [2026-11-07 09:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W1 (S031-4, chữ chốt PHASE-031 · 00 §7): sổ đăng ký chính sách — đăng ký bản, đóng bản cũ, tìm bản hiệu lực tại ngày chứng từ, liệt kê, ngừng
/**
 * SỔ ĐĂNG KÝ CHÍNH SÁCH (Policy Registry, ADR-0031; bảng policy_registry, migration 0079).
 *
 * Module chủ giữ NỘI DUNG chính sách; ở đây chỉ giữ PHONG BÌ của từng bản: khoá, bản, phạm vi, hiệu lực của bản theo ngày
 * chứng từ, băm nội dung, Rule Contract, người phát hành. Bản đã phát hành không sửa (trigger chặn): đổi = đăng ký bản mới,
 * bản trước tự đóng ở ngày trước hiệu lực bản mới, nên mọi ngày có đúng một bản (T031-TR-2).
 *
 * Gọi trong giao dịch của action ghi nội dung, để nội dung và phong bì cùng thành công hoặc cùng lùi.
 */
import { sql } from 'kysely';
import type { Db } from '../db/client.js';
import { contentHash } from './documents.js';
import { Errors } from './errors.js';
import { emitEvent, type EventActorKind } from './events.js';

export type PolicyStore = 'module' | 'settings' | 'inline';

/** "user:5" / "apikey:3" → tác nhân của sự kiện; chuỗi khác (test, hệ thống) là system. */
function eventActor(actor: string | undefined): { kind: EventActorKind; id: string } {
  const m = /^(user|apikey):(.+)$/.exec(actor ?? '');
  return m ? { kind: m[1] as EventActorKind, id: m[2]! } : { kind: 'system', id: actor || 'system' };
}

export interface PolicyEnvelope {
  policyKey: string;
  policyId: string;
  version: number;
  ownerModule: string;
  ruleContract: string;
  scope: Record<string, unknown>;
  /** Hiệu lực của bản theo ngày chứng từ (YYYY-MM-DD); null = từ đầu / chưa đóng. */
  effectiveFrom: string | null;
  effectiveTo: string | null;
  status: 'published' | 'retired';
  store: PolicyStore;
  storeRef: string;
  contentHash: string;
  legalRef: string | null;
  publishedBy: string;
  publishedAt: string;
  reason: string | null;
}

export interface RegisterPolicyInput {
  tenantId: string;
  ownerModule: string;
  policyKey: string;
  policyId: string;
  version: number;
  ruleContract: string;
  scope?: Record<string, unknown>;
  effectiveFrom: string | null;
  store: PolicyStore;
  storeRef?: string;
  /** Nội dung để băm; lưu vào cột content chỉ khi store = inline. */
  content: unknown;
  /** Băm có sẵn của module (vd bản nạp ngược); bỏ trống thì băm content bằng contentHash. */
  hash?: string;
  actor: string;
  reason?: string | null;
  legalRef?: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const day = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

type Row = {
  policy_key: string; policy_id: string; version: number; owner_module: string; rule_contract: string; scope: Record<string, unknown>;
  effective_from: unknown; effective_to: unknown; status: 'published' | 'retired'; store: PolicyStore; store_ref: string; content_hash: string;
  legal_ref: string | null; published_by: string; published_at: unknown; reason: string | null;
};
const COLS = sql`policy_key, policy_id, version, owner_module, rule_contract, scope, effective_from::text AS effective_from, effective_to::text AS effective_to,
  status, store, store_ref, content_hash, legal_ref, published_by, published_at, reason`;
const toEnvelope = (r: Row): PolicyEnvelope => ({
  policyKey: r.policy_key, policyId: r.policy_id, version: Number(r.version), ownerModule: r.owner_module, ruleContract: r.rule_contract, scope: r.scope ?? {},
  effectiveFrom: day(r.effective_from), effectiveTo: day(r.effective_to), status: r.status, store: r.store, storeRef: r.store_ref, contentHash: r.content_hash,
  legalRef: r.legal_ref, publishedBy: r.published_by, publishedAt: r.published_at instanceof Date ? r.published_at.toISOString() : String(r.published_at), reason: r.reason,
});

/** Mọi bản của một chính sách, bản cũ trước. */
export async function listPolicyVersions(trx: Db, tenantId: string, policyId: string): Promise<PolicyEnvelope[]> {
  const r = await sql<Row>`SELECT ${COLS} FROM policy_registry WHERE tenant_id = ${tenantId} AND policy_id = ${policyId} ORDER BY version`.execute(trx);
  return r.rows.map(toEnvelope);
}

/** Bản phủ ngày chứng từ `at` (kể cả bản đã ngừng — chứng từ cũ vẫn trỏ được). */
export async function resolvePolicy(trx: Db, tenantId: string, policyId: string, at: string): Promise<PolicyEnvelope | undefined> {
  if (!DATE_RE.test(at)) throw Errors.validation(`Ngày "${at}" sai khuôn YYYY-MM-DD`);
  const r = await sql<Row>`
    SELECT ${COLS} FROM policy_registry
    WHERE tenant_id = ${tenantId} AND policy_id = ${policyId}
      AND (effective_from IS NULL OR effective_from <= ${at}::date) AND (effective_to IS NULL OR effective_to >= ${at}::date)
    ORDER BY version DESC LIMIT 1`.execute(trx);
  return r.rows[0] ? toEnvelope(r.rows[0]) : undefined;
}

/**
 * Đăng ký một bản. Bản 1 được hiệu lực từ đầu (effectiveFrom null); bản sau có effectiveFrom không sớm hơn bản trước
 * (không viết lại quá khứ) và đóng bản trước ở effectiveFrom − 1 ngày trong cùng giao dịch.
 */
export async function registerPolicyVersion(trx: Db, input: RegisterPolicyInput): Promise<PolicyEnvelope> {
  const { tenantId, policyId, version } = input;
  if (input.effectiveFrom !== null && !DATE_RE.test(input.effectiveFrom)) throw Errors.validation(`Ngày áp "${input.effectiveFrom}" sai khuôn YYYY-MM-DD`);
  const prev = (await listPolicyVersions(trx, tenantId, policyId)).at(-1);
  let closes: { version: number; effectiveTo: string } | null = null;
  if (version !== (prev?.version ?? 0) + 1) throw Errors.conflict(`Chính sách ${input.policyKey}: bản ${version} không nối tiếp bản ${prev?.version ?? 0} — có người vừa lưu, tải lại rồi lưu lại`);
  if (prev) {
    if (input.effectiveFrom === null) throw Errors.validation(`Chính sách ${input.policyKey}: bản ${version} phải có ngày áp cho chứng từ`);
    // Cùng ngày áp với bản trước được (sửa nhiều lần trong ngày): bản trước thành khoảng rỗng, không ngày nào chọn nó.
    if (prev.effectiveFrom !== null && input.effectiveFrom < prev.effectiveFrom) {
      throw Errors.validation(`Chính sách ${input.policyKey}: ngày áp ${input.effectiveFrom} sớm hơn ngày áp của bản ${prev.version} (${prev.effectiveFrom}) — không viết lại quá khứ`);
    }
    if (prev.effectiveTo !== null) throw Errors.conflict(`Chính sách ${input.policyKey}: bản ${prev.version} đã đóng ở ${prev.effectiveTo} — không nối thêm bản`);
    const closed = await sql<{ effective_to: string }>`UPDATE policy_registry SET effective_to = ${input.effectiveFrom}::date - 1
      WHERE tenant_id = ${tenantId} AND policy_id = ${policyId} AND version = ${prev.version} AND effective_to IS NULL
      RETURNING effective_to::text AS effective_to`.execute(trx);
    closes = closed.rows[0] ? { version: prev.version, effectiveTo: closed.rows[0].effective_to } : null;
  }
  const hash = input.hash ?? contentHash(input.content);
  const inline = input.store === 'inline' ? JSON.stringify(input.content ?? null) : null;
  const r = await sql<Row>`
    INSERT INTO policy_registry (tenant_id, policy_key, policy_id, version, owner_module, rule_contract, scope, effective_from, store, store_ref, content, content_hash, legal_ref, published_by, reason)
    VALUES (${tenantId}, ${input.policyKey}, ${policyId}, ${version}, ${input.ownerModule}, ${input.ruleContract}, ${JSON.stringify(input.scope ?? {})}::jsonb,
            ${input.effectiveFrom}::date, ${input.store}, ${input.storeRef ?? ''}, ${inline}::jsonb, ${hash}, ${input.legalRef ?? null}, ${input.actor}, ${input.reason?.trim() || null})
    RETURNING ${COLS}`.execute(trx);
  const env = toEnvelope(r.rows[0]!);
  // Chỉ định danh + băm, KHÔNG nội dung: nguồn nhận sự kiện rồi tải lại bằng GET /api/v1/policies (một nguồn sự thật, 00 §11).
  await emitEvent(trx, {
    tenantId, type: 'bizcity.policy.published', subject: `policy:${policyId}`, source: 'bizcity.platform', actor: eventActor(input.actor),
    dedupeKey: `policy.published:${policyId}:${version}`,
    data: { policyId, policyKey: env.policyKey, version, ownerModule: env.ownerModule, ruleContract: env.ruleContract, effectiveFrom: env.effectiveFrom, contentHash: env.contentHash, closes },
  });
  return env;
}

// [2026-11-08 01:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W3a (S031-13, chữ chốt PHASE-031 · 00 §9): liệt kê bản đang hiệu lực kèm nội dung inline; phát hành một bản inline
export interface PublishedPolicy extends PolicyEnvelope {
  /** Nội dung khi `store = inline`; null khi nội dung ở bảng của module chủ. */
  content: unknown;
}

/**
 * Các bản `published` phủ ngày `at` (hiệu lực của BẢN, theo ngày chứng từ). Mỗi chính sách tối đa một bản vì sổ đăng ký bảo đảm
 * mỗi ngày đúng một bản. `ruleContractPrefix` lọc theo miền, vd "sale." (bản ngừng và bản ngoài ngày không có mặt).
 */
export async function listPublishedPolicies(trx: Db, tenantId: string, opts: { at: string; ruleContractPrefix?: string }): Promise<PublishedPolicy[]> {
  if (!DATE_RE.test(opts.at)) throw Errors.validation(`Ngày "${opts.at}" sai khuôn YYYY-MM-DD`);
  const prefix = opts.ruleContractPrefix ? `${opts.ruleContractPrefix.replace(/[\\%_]/g, '\\$&')}%` : '%';
  const r = await sql<Row & { content: unknown }>`
    SELECT ${COLS}, content FROM policy_registry
    WHERE tenant_id = ${tenantId} AND status = 'published'
      AND (effective_from IS NULL OR effective_from <= ${opts.at}::date) AND (effective_to IS NULL OR effective_to >= ${opts.at}::date)
      AND rule_contract LIKE ${prefix}
    ORDER BY policy_key, version`.execute(trx);
  return r.rows.map((x) => ({ ...toEnvelope(x), content: x.content ?? null }));
}

export interface PublishInlineInput {
  tenantId: string;
  /** Module chủ (vd ban-hang): phần đầu của policyId. */
  ownerModule: string;
  policyKey: string;
  ruleContract: string;
  scope?: Record<string, unknown>;
  /** Bắt buộc: chính sách inline không có "áp từ đầu" như bản nạp ngược của mua hàng. */
  effectiveFrom: string;
  content: unknown;
  actor: string;
  reason?: string | null;
  legalRef?: string | null;
}

/** policyId ổn định của một chính sách inline: <module>:inline:<mã>. */
export const inlinePolicyId = (ownerModule: string, policyKey: string) => `${ownerModule}:inline:${policyKey}`;

/**
 * Phát hành một bản chính sách inline (nội dung ở cột content). Bản kế = bản cuối + 1; bản trước tự đóng ở ngày áp − 1
 * (registerPolicyVersion). Chính sách đã ngừng không nhận thêm bản — dùng mã mới.
 */
export async function publishInlinePolicy(trx: Db, input: PublishInlineInput): Promise<PolicyEnvelope> {
  if (!DATE_RE.test(input.effectiveFrom)) throw Errors.validation(`Ngày áp "${input.effectiveFrom}" sai khuôn YYYY-MM-DD`);
  const policyId = inlinePolicyId(input.ownerModule, input.policyKey);
  const prev = (await listPolicyVersions(trx, input.tenantId, policyId)).at(-1);
  if (prev?.status === 'retired') throw Errors.conflict(`Chính sách ${input.policyKey} đã ngừng — không phát hành thêm bản, dùng mã mới`);
  return registerPolicyVersion(trx, {
    tenantId: input.tenantId, ownerModule: input.ownerModule, policyKey: input.policyKey, policyId, version: (prev?.version ?? 0) + 1,
    ruleContract: input.ruleContract, scope: input.scope, effectiveFrom: input.effectiveFrom, store: 'inline', storeRef: '',
    content: input.content, actor: input.actor, reason: input.reason, legalRef: input.legalRef,
  });
}

/** Ngừng chính sách: các bản đang dùng được chuyển retired; chứng từ cũ vẫn trỏ được. Trả số bản đổi. */
export async function retirePolicy(trx: Db, tenantId: string, policyId: string, actor?: string): Promise<number> {
  const r = await sql<{ version: number }>`UPDATE policy_registry SET status = 'retired' WHERE tenant_id = ${tenantId} AND policy_id = ${policyId} AND status = 'published' RETURNING version`.execute(trx);
  if (!r.rows.length) return 0;
  const last = Math.max(...r.rows.map((x) => Number(x.version)));
  await emitEvent(trx, {
    tenantId, type: 'bizcity.policy.retired', subject: `policy:${policyId}`, source: 'bizcity.platform', actor: eventActor(actor),
    dedupeKey: `policy.retired:${policyId}:${last}`, data: { policyId, retiredVersions: r.rows.map((x) => Number(x.version)).sort((a, b) => a - b) },
  });
  return r.rows.length;
}
