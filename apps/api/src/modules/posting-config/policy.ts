// @bizcity-layer K kernel/config
// [2026-10-30 09:03 PM Johnny Chu - Chu Hoàng Anh] PHASE-005 — chính sách kế toán có phiên bản + ngày hiệu lực (ADR-0009).
/**
 * CHÍNH SÁCH KẾ TOÁN CÓ PHIÊN BẢN (ADR-0009, C-9 / STD-CMP-9; PHASE-005, PHASES 2.14).
 *
 * Bản chụp = phần cấu hình định khoản quyết định tài khoản: lý do, nhóm hạch toán, tài khoản ngầm định, hình thức thanh toán,
 * mã thuế, tài khoản ngân hàng (dòng đang dùng). Hệ thống tài khoản và gán mặt hàng → nhóm là danh mục, không chụp.
 *
 *   selectPolicy(trx, tenant, live, asOf)  — gọi mỗi lần định khoản:
 *     1. cấu hình đang dùng (live) khác băm bản đứng đầu → tự chụp bản `amend` CÙNG ngày hiệu lực với bản đứng đầu
 *        (sửa cấu hình = sửa chế độ đang áp; chưa có bản nào → bản `initial` hiệu lực từ 1900-01-01);
 *     2. chọn bản áp cho ngày hạch toán asOf: effective_from ≤ asOf lớn nhất, bằng nhau thì version lớn nhất;
 *     3. bản đó là bản đứng đầu → dùng live (cùng nội dung); không thì dùng bản chụp của nó.
 *   publishPolicy()  — đổi chế độ: chụp live thành bản `publish` với ngày hiệu lực mới (không rơi vào kỳ đã khoá).
 * Chứng từ cũ định khoản lại vẫn theo bản của ngày hạch toán → không bị quy tắc mới làm đổi số (rủi ro C-9).
 */
import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import type { Db } from '../../db/client.js';
import type { PaymentMethod, PostingReason, ProductPostingGroup } from '../../db/types.js';
import { Errors } from '../../core/errors.js';

export const POLICY_EPOCH = '1900-01-01';

/** Dòng cấu hình đã đọc từ CSDL (hoặc từ bản chụp) — đầu vào duy nhất để dựng PostingConfig. */
export interface PolicyRaw {
  reasons: PostingReason[];
  groups: ProductPostingGroup[];
  paymentMethods: PaymentMethod[];
  taxCodes: { code: string; name: string; rate: string; direction: string; account_code: string | null; report_group: string }[];
  defaults: { key: string; account_code: string }[];
  bankAccounts: { code: string; account_code: string }[];
}

export interface PolicyVersionRow { version: number; effective_from: string; kind: 'initial' | 'amend' | 'publish'; hash: string; created_at: Date; note: string; created_by: string }

const keyOf = (r: Record<string, unknown>) => String(r.code ?? r.key ?? '');
/** Chuẩn hoá: bỏ cột đơn vị / thời gian, sắp theo mã, khoá theo thứ tự chữ — băm không đổi khi chỉ thứ tự đọc đổi. */
function normalize(raw: PolicyRaw): Record<string, unknown[]> {
  const clean = (rows: object[]) => rows
    .map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'tenant_id' && !k.endsWith('_at')).sort(([a], [b]) => (a < b ? -1 : 1))))
    .sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
  return {
    reasons: clean(raw.reasons), groups: clean(raw.groups), paymentMethods: clean(raw.paymentMethods),
    taxCodes: clean(raw.taxCodes), defaults: clean(raw.defaults), bankAccounts: clean(raw.bankAccounts),
  };
}

export function policyHash(raw: PolicyRaw): string {
  return 'sha256:' + createHash('sha256').update(JSON.stringify(normalize(raw))).digest('hex');
}

const head = (db: Db, tenantId: string) => db.selectFrom('posting_policy_versions')
  .select(['version', 'effective_from', 'kind', 'hash', 'created_at', 'note', 'created_by'])
  .where('tenant_id', '=', tenantId).orderBy('version', 'desc').limit(1).executeTakeFirst() as Promise<PolicyVersionRow | undefined>;

async function insertVersion(db: Db, tenantId: string, v: { version: number; effectiveFrom: string; kind: PolicyVersionRow['kind']; raw: PolicyRaw; hash: string; note: string; actor: string }) {
  await db.insertInto('posting_policy_versions').values({
    tenant_id: tenantId, version: v.version, effective_from: v.effectiveFrom, kind: v.kind, snapshot: JSON.stringify(normalize(v.raw)),
    hash: v.hash, note: v.note, created_by: v.actor,
  }).execute();
}

/** Bản đứng đầu khớp cấu hình đang dùng (tự chụp initial / amend nếu cần). Khoá theo đơn vị để hai lượt định khoản không chụp trùng. */
export async function ensureHead(trx: Db, tenantId: string, live: PolicyRaw, actor: string): Promise<PolicyVersionRow> {
  const h = policyHash(live);
  const cur = await head(trx, tenantId);
  if (cur && cur.hash === h) return cur;
  await sql`SELECT pg_advisory_xact_lock(727005, ${Number(tenantId)})`.execute(trx);
  const again = await head(trx, tenantId);
  if (again && again.hash === h) return again;
  await insertVersion(trx, tenantId, {
    version: (again?.version ?? 0) + 1, effectiveFrom: again ? String(again.effective_from).slice(0, 10) : POLICY_EPOCH,
    kind: again ? 'amend' : 'initial', raw: live, hash: h, note: again ? 'Tự chụp sau khi sửa cấu hình định khoản' : 'Bản đầu: cấu hình đang dùng', actor,
  });
  return (await head(trx, tenantId))!;
}

/** Cấu hình áp cho ngày hạch toán asOf + số phiên bản (ghi vào posting_log, ledger_entries). */
export async function selectPolicy(trx: Db, tenantId: string, live: PolicyRaw, asOf: string, actor: string): Promise<{ raw: PolicyRaw; version: number }> {
  const top = await ensureHead(trx, tenantId, live, actor);
  const pick = await trx.selectFrom('posting_policy_versions').select(['version', 'snapshot'])
    .where('tenant_id', '=', tenantId).where('effective_from', '<=', asOf)
    .orderBy('effective_from', 'desc').orderBy('version', 'desc').limit(1).executeTakeFirst();
  // Ngày trước mọi bản (chỉ khi bản đầu là publish hiệu lực sau ngày đó): dùng bản sớm nhất.
  const row = pick ?? await trx.selectFrom('posting_policy_versions').select(['version', 'snapshot'])
    .where('tenant_id', '=', tenantId).orderBy('effective_from').orderBy('version').limit(1).executeTakeFirstOrThrow();
  if (row.version === top.version) return { raw: live, version: top.version };
  return { raw: row.snapshot as unknown as PolicyRaw, version: row.version };
}

/** Phát hành chế độ mới: chụp cấu hình đang dùng, hiệu lực từ effectiveFrom (không rơi vào kỳ đã khoá). */
export async function publishPolicy(trx: Db, tenantId: string, live: PolicyRaw, a: { effectiveFrom: string; note: string; actor: string }): Promise<PolicyVersionRow> {
  const [y, m] = a.effectiveFrom.split('-').map(Number) as [number, number];
  const locked = await trx.selectFrom('period_locks as l').innerJoin('fiscal_periods as p', 'p.id', 'l.period_id')
    .select('l.id').where('l.tenant_id', '=', tenantId).where('p.year', '=', y).where('p.month', '=', m).limit(1).executeTakeFirst();
  if (locked) throw Errors.validation(`Kỳ ${String(m).padStart(2, '0')}/${y} đã khoá (một phần hoặc toàn bộ): ngày hiệu lực của chính sách mới phải ở kỳ chưa khoá`);
  // Bảo đảm có bản đầu (từ 1900-01-01) trước bản phát hành: chứng từ trước ngày hiệu lực mới vẫn có chính sách để theo.
  const cur = await ensureHead(trx, tenantId, live, a.actor);
  await insertVersion(trx, tenantId, { version: cur.version + 1, effectiveFrom: a.effectiveFrom, kind: 'publish', raw: live, hash: policyHash(live), note: a.note, actor: a.actor });
  return (await head(trx, tenantId))!;
}

export async function listPolicyVersions(db: Db, tenantId: string): Promise<PolicyVersionRow[]> {
  return db.selectFrom('posting_policy_versions').select(['version', 'effective_from', 'kind', 'hash', 'created_at', 'note', 'created_by'])
    .where('tenant_id', '=', tenantId).orderBy('version', 'desc').execute() as Promise<PolicyVersionRow[]>;
}
