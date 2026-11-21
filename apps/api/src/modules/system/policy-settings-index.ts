// @bizcity-layer P module-sdk
// [2026-11-21 05:20 PM Võ Hoàng] PHASE-031 — S031-7 (31-S031-7 §1 mục 2–3): đánh chỉ mục khoá ngưỡng duyệt (setting_values) vào sổ đăng ký chính sách, store = settings
/**
 * ĐÁNH CHỈ MỤC KHOÁ CẤU HÌNH VÀO SỔ ĐĂNG KÝ CHÍNH SÁCH (PHASE-031 · 31-S031-7). Nội dung vẫn ở `setting_values` (một nguồn); `policy_registry`
 * chỉ giữ PHONG BÌ mỗi bản: `store = settings`, `store_ref` = tên khoá, Rule Contract, băm của nội dung (dải tiền dựng từ giá trị khoá),
 * `effective_from` = ngày hiệu lực của phiên bản cấu hình. Không sửa đường ghi cấu hình của lõi: đồng bộ gọi từ phía sổ chính sách
 * (`syncSettingsPolicies`, action quản trị `core.policy.sync-settings`), chạy lại bao nhiêu lần cũng không sinh bản trùng.
 *
 * Dòng thời gian của khoá (phạm vi đơn vị): mỗi ngày hiệu lực một giá trị — phiên bản lớn nhất của ngày đó, như `getSetting`
 * (`valid_from ≤ ngày` mới nhất, cùng ngày lấy phiên bản lớn nhất). Các ngày liền nhau cùng giá trị gộp một đoạn. Khoá chưa có phiên bản
 * nào → một đoạn "từ đầu" với giá trị mặc định.
 *
 * Đồng bộ chỉ NỐI THÊM (sổ đăng ký không viết lại quá khứ — registerPolicyVersion đóng bản trước ở ngày áp − 1, trigger
 * `bizcity_policy_registry_guard` giữ bất biến): đoạn có ngày ≥ ngày áp của bản cuối mà băm khác → bản mới. Phiên bản cấu hình ghi lùi
 * về trước bản cuối không nối được → báo ở `drift` (lệch giữa sổ và cấu hình), không tự sửa.
 */
import type { Db } from '@bizcity/platform/db/client';
import { Errors } from '@bizcity/platform/core/errors';
import { contentHash } from '@bizcity/platform/core/documents';
import { settingHistory } from '@bizcity/platform/core/settings';
import { listPolicyVersions, registerPolicyVersion, type PolicyEnvelope } from '@bizcity/platform/core/policies';
import { registerSettingsPolicyReader } from './rule-contracts/index.js';
import { approvalLevels, thresholdToBands } from './rule-contracts/approval-levels.js';

/** Khoá cấu hình được đánh chỉ mục: tên khoá, module chủ (owner ở registry cấu hình), Rule Contract, cách dựng nội dung từ giá trị. */
export interface SettingsPolicyDef {
  key: string;
  ownerModule: string;
  ruleContract: string;
  /** Giá trị khi khoá chưa có phiên bản nào (mặc định ở registry cấu hình). */
  defaultValue: unknown;
  toParams(value: unknown): unknown;
}

export const SETTINGS_POLICIES: readonly SettingsPolicyDef[] = [
  { key: 'bizcity.payment.approval_thresholds', ownerModule: 'quy', ruleContract: approvalLevels.id, defaultValue: 0, toParams: thresholdToBands },
];

/** policyId ổn định của chính sách đánh chỉ mục từ khoá cấu hình: <module>:settings:<khoá>. */
export const settingsPolicyId = (d: SettingsPolicyDef) => `${d.ownerModule}:settings:${d.key}`;

interface Segment {
  /** null = từ đầu (khoá chưa có phiên bản nào). */
  from: string | null;
  value: unknown;
  params: unknown;
  hash: string;
  /** Phiên bản cấu hình làm ra đoạn này (null với giá trị mặc định). */
  source: { version: number; by: string; reason: string | null } | null;
}

/** Dòng thời gian giá trị hiệu lực của khoá ở phạm vi đơn vị, cũ trước, đã gộp đoạn liền nhau cùng giá trị. */
async function timeline(trx: Db, tenantId: string, d: SettingsPolicyDef): Promise<Segment[]> {
  const rows = (await settingHistory(trx, tenantId, d.key)).filter((r) => r.scope === 'tenant' && r.scopeId === '');
  const byDay = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const cur = byDay.get(r.validFrom);
    if (!cur || r.version > cur.version) byDay.set(r.validFrom, r);
  }
  const mk = (from: string | null, value: unknown, source: Segment['source']): Segment => {
    const params = d.toParams(value);
    return { from, value, params, hash: contentHash(params), source };
  };
  if (!byDay.size) return [mk(null, d.defaultValue, null)];
  const out: Segment[] = [];
  for (const day of [...byDay.keys()].sort()) {
    const r = byDay.get(day)!;
    const s = mk(day, r.value, { version: r.version, by: r.by, reason: r.reason });
    if (out.length && out.at(-1)!.hash === s.hash) continue;
    out.push(s);
  }
  return out;
}

/** Đoạn phủ ngày `at` (null = trước mọi phiên bản → giá trị mặc định). */
function segmentAt(segs: Segment[], d: SettingsPolicyDef, at: string | null): { params: unknown; hash: string } {
  const hit = at === null ? undefined : [...segs].reverse().find((s) => s.from !== null && s.from <= at);
  if (hit) return hit;
  if (segs[0]?.from === null) return segs[0];
  const params = d.toParams(d.defaultValue);
  return { params, hash: contentHash(params) };
}

/** Bản phủ ngày `at` trong danh sách bản (bản lớn nhất có effective_from ≤ at ≤ effective_to). */
const versionAt = (vs: PolicyEnvelope[], at: string) =>
  [...vs].reverse().find((v) => (v.effectiveFrom === null || v.effectiveFrom <= at) && (v.effectiveTo === null || v.effectiveTo >= at));

export interface SettingsSyncResult {
  key: string; policyId: string; ruleContract: string;
  /** Bản vừa phát hành ở lượt này (rỗng = sổ đã khớp cấu hình). */
  published: { version: number; effectiveFrom: string | null; contentHash: string }[];
  /** Bản cuối trong sổ sau lượt này. */
  current: { version: number; effectiveFrom: string | null; contentHash: string } | null;
  /** Ngày mà giá trị cấu hình khác bản sổ đăng ký phủ ngày đó (phiên bản cấu hình ghi lùi) — không tự sửa. */
  drift: { at: string; registryVersion: number | null; registryHash: string | null; settingsHash: string }[];
  /** Không đồng bộ được (vd chính sách đã ngừng). */
  problem?: string;
}

async function syncOne(trx: Db, tenantId: string, actor: string, d: SettingsPolicyDef): Promise<SettingsSyncResult> {
  const policyId = settingsPolicyId(d);
  const segs = await timeline(trx, tenantId, d);
  let versions = await listPolicyVersions(trx, tenantId, policyId);
  const published: SettingsSyncResult['published'] = [];
  const last0 = versions.at(-1);
  const base = { key: d.key, policyId, ruleContract: d.ruleContract };
  if (last0?.status === 'retired') {
    return { ...base, published, current: { version: last0.version, effectiveFrom: last0.effectiveFrom, contentHash: last0.contentHash }, drift: [], problem: 'chính sách đã ngừng — không nối thêm bản' };
  }
  for (const s of segs) {
    const last = versions.at(-1);
    if (last) {
      // Chỉ nối thêm: đoạn bắt đầu trước ngày áp của bản cuối là quá khứ của sổ — xét ở drift.
      if (s.from === null || (last.effectiveFrom !== null && s.from < last.effectiveFrom)) continue;
      if (s.hash === last.contentHash) continue;
    }
    const src = s.source;
    const env = await registerPolicyVersion(trx, {
      tenantId, ownerModule: d.ownerModule, policyKey: d.key, policyId, version: (last?.version ?? 0) + 1, ruleContract: d.ruleContract,
      effectiveFrom: s.from, store: 'settings', storeRef: d.key, content: s.params, hash: s.hash,
      // Người phát hành = người ghi phiên bản cấu hình (người đổi thật); người chạy đồng bộ ghi ở lý do.
      actor: src?.by || actor,
      reason: src
        ? `đồng bộ từ setting_values phiên bản ${src.version}${src.reason ? ` (${src.reason})` : ''} — chạy bởi ${actor}`
        : `giá trị mặc định (khoá chưa có phiên bản) — chạy bởi ${actor}`,
    });
    published.push({ version: env.version, effectiveFrom: env.effectiveFrom, contentHash: env.contentHash });
    versions = await listPolicyVersions(trx, tenantId, policyId);
  }
  // Lệch: tại mỗi ngày đổi giá trị của cấu hình và mỗi ngày áp của bản, bản sổ phủ ngày đó phải cùng băm với cấu hình.
  const days = [...new Set([...segs.map((s) => s.from), ...versions.map((v) => v.effectiveFrom)].filter((x): x is string => x !== null))].sort();
  const drift: SettingsSyncResult['drift'] = [];
  for (const at of days) {
    const v = versionAt(versions, at);
    const want = segmentAt(segs, d, at).hash;
    if (!v) {
      // Trước bản 1 (bản 1 có ngày áp) là chưa đánh chỉ mục, không phải lệch.
      if (versions[0]?.effectiveFrom != null && at < versions[0].effectiveFrom) continue;
      drift.push({ at, registryVersion: null, registryHash: null, settingsHash: want });
    } else if (v.contentHash !== want) drift.push({ at, registryVersion: v.version, registryHash: v.contentHash, settingsHash: want });
  }
  const cur = versions.at(-1);
  return { ...base, published, current: cur ? { version: cur.version, effectiveFrom: cur.effectiveFrom, contentHash: cur.contentHash } : null, drift };
}

/**
 * Đồng bộ phong bì của các khoá cấu hình đánh chỉ mục (một khoá khi nêu `key`). Gọi trong giao dịch của action. Chạy lại không sinh
 * bản trùng (so băm với bản cuối).
 */
export async function syncSettingsPolicies(trx: Db, who: { tenantId: string; actor: string }, opts: { key?: string } = {}) {
  const defs = opts.key ? SETTINGS_POLICIES.filter((d) => d.key === opts.key) : SETTINGS_POLICIES;
  if (opts.key && !defs.length) throw Errors.validation(`Khoá "${opts.key}" chưa được đánh chỉ mục vào sổ chính sách (chỉ: ${SETTINGS_POLICIES.map((d) => d.key).join(', ')})`);
  const items: SettingsSyncResult[] = [];
  for (const d of defs) items.push(await syncOne(trx, who.tenantId, who.actor, d));
  return { items };
}

/**
 * Bộ đọc nội dung của một bản `store = settings`: dựng lại nội dung từ giá trị cấu hình hiệu lực tại ngày áp của bản, khớp băm thì trả,
 * không thì null (bản đã bị thay trong ngày / cấu hình ghi lùi — không đoán).
 */
for (const d of SETTINGS_POLICIES) {
  registerSettingsPolicyReader(d.key, async (trx, tenantId, e) => {
    const s = segmentAt(await timeline(trx, tenantId, d), d, e.effectiveFrom);
    return s.hash === e.contentHash ? s.params : null;
  });
}
