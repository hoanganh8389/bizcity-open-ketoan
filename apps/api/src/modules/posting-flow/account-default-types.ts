// @bizcity-layer D modules/ke-toan
// [2026-11-13 Nguyễn Văn Thủy] Tài khoản ngầm định theo loại chứng từ (0126) (đóng góp)
/**
 * TÀI KHOẢN NGẦM ĐỊNH THEO LOẠI (ACC41):
 *   GET  /api/v1/account-default-types              mọi loại (nhóm, tên, cột: lọc + mặc định); đơn vị chưa có thì nạp dữ liệu gốc
 *   PUT  /api/v1/account-default-types/:code       sửa cột (lọc, mặc định) của một loại; cột có bind → đồng bộ posting_defaults
 *   POST /api/v1/account-default-types/restore     quay về dữ liệu gốc (giữ tài khoản các khoá đang dùng)
 *
 * Luật: tài khoản mặc định phải có trong danh mục tài khoản và nằm trong danh sách lọc (lọc theo đầu số: "111" gồm 1111, 1112…).
 * Lọc trống = chọn được mọi tài khoản. Dòng chứng từ chọn loại → điền mặc định, chỉ cho chọn trong lọc.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db, type Db } from '../../db/client.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import { defineAction, mountActions, type AnyActionDef } from '../../core/actions.js';
import { SEEDS_DIR } from '@bizcity/platform/db/paths';
import type { AccountDefaultColumn } from '@bizcity/platform/db/types';

const SEED = 'tai-khoan-ngam-dinh-theo-loai.jsonl';
const tags = ['Tài khoản ngầm định'];

export interface AccountDefaultType { code: string; group: string; name: string; columns: AccountDefaultColumn[]; sortOrder: number; isActive: boolean; updatedBy: string; updatedAt: Date }
interface SeedRow { code: string; group: string; name: string; columns: AccountDefaultColumn[]; sort: number }

function readSeedRows(): SeedRow[] {
  const lines = readFileSync(path.join(SEEDS_DIR, SEED), 'utf8').split('\n').filter((l) => l.trim());
  return lines.map((l) => JSON.parse(l) as SeedRow & { _bang?: string }).filter((r) => !r._bang);
}

/** Tài khoản có trong lọc (theo đầu số); lọc trống = mọi tài khoản. */
export const inFilter = (acc: string, filter: string[]) => !filter.length || filter.some((f) => acc.startsWith(f));

/**
 * Mặc định gốc → tài khoản chi tiết của đơn vị: ưu tiên tài khoản đơn vị đang dùng cho bộ định khoản (vd 131 → 1311, 331 → 3312),
 * rồi đúng mã nếu là tài khoản chi tiết, rồi tài khoản chi tiết nhỏ nhất bắt đầu bằng mã đó.
 */
function fitAccount(want: string, posting: string[], inUse: string[]): string {
  if (!want) return '';
  const used = inUse.filter((a) => a.startsWith(want)).sort()[0];
  if (used) return used;
  if (posting.includes(want)) return want;
  return posting.filter((a) => a.startsWith(want)).sort()[0] ?? '';
}

async function seedTenant(trx: Db, tenantId: string, actor: string, replace: boolean): Promise<number> {
  const posting = (await trx.selectFrom('accounts').select('code').where('tenant_id', '=', tenantId).where('is_posting', '=', true).where('is_active', '=', true).execute()).map((a) => a.code);
  const bound = new Map((await trx.selectFrom('posting_defaults').select(['key', 'account_code']).where('tenant_id', '=', tenantId).execute()).map((d) => [d.key, d.account_code]));
  const inUse = [...new Set(bound.values())];
  let n = 0;
  for (const r of readSeedRows()) {
    const columns = r.columns.map((c) => ({ ...c, default: (c.bind && bound.get(c.bind)) || fitAccount(c.default, posting, inUse) }));
    const values = { grp: r.group, name: r.name, columns: JSON.stringify(columns), sort_order: r.sort, is_active: true, updated_by: actor, updated_at: new Date() };
    const q = trx.insertInto('account_default_types').values({ tenant_id: tenantId, code: r.code, created_by: actor, ...values });
    await (replace ? q.onConflict((oc) => oc.columns(['tenant_id', 'code']).doUpdateSet(values)) : q.onConflict((oc) => oc.columns(['tenant_id', 'code']).doNothing())).execute();
    n++;
  }
  return n;
}

const toDto = (r: { code: string; grp: string; name: string; columns: AccountDefaultColumn[]; sort_order: number; is_active: boolean; updated_by: string; updated_at: Date }): AccountDefaultType => ({
  code: r.code, group: r.grp, name: r.name, columns: r.columns, sortOrder: r.sort_order, isActive: r.is_active, updatedBy: r.updated_by, updatedAt: r.updated_at,
});

export async function listAccountDefaultTypes(tenantId: string, actor: string): Promise<AccountDefaultType[]> {
  const load = () => db.selectFrom('account_default_types').select(['code', 'grp', 'name', 'columns', 'sort_order', 'is_active', 'updated_by', 'updated_at'])
    .where('tenant_id', '=', tenantId).orderBy('sort_order').orderBy('name').execute();
  let rows = await load();
  if (!rows.length) {
    await db.transaction().execute((trx) => seedTenant(trx, tenantId, actor || 'Dữ liệu gốc', false));
    rows = await load();
  }
  return rows.map(toDto);
}

const colInput = z.object({ key: z.string().min(1).max(64), filter: z.array(z.string().trim().regex(/^[0-9]{1,12}$/, 'Lọc tài khoản chỉ gồm số tài khoản')).max(60), default: z.string().trim().max(32) });

async function saveType(trx: Db, tenantId: string, actor: string, code: string, cols: z.infer<typeof colInput>[]) {
  const cur = await trx.selectFrom('account_default_types').select(['id', 'name', 'columns']).where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
  if (!cur) throw Errors.notFound(`loại ${code}`);
  const accounts = new Map((await trx.selectFrom('accounts').select(['code', 'is_posting']).where('tenant_id', '=', tenantId).execute()).map((a) => [a.code, a.is_posting]));
  const problems: string[] = [];
  const next = cur.columns.map((c) => {
    const i = cols.find((x) => x.key === c.key);
    if (!i) return c;
    const filter = [...new Set(i.filter)];
    for (const f of filter) if (![...accounts.keys()].some((a) => a.startsWith(f))) problems.push(`${c.caption}: không có tài khoản nào bắt đầu bằng ${f}`);
    if (i.default && !accounts.has(i.default)) problems.push(`${c.caption}: tài khoản ${i.default} chưa có trong hệ thống tài khoản`);
    else if (i.default && !accounts.get(i.default)) problems.push(`${c.caption}: ${i.default} là tài khoản tổng hợp — chọn tài khoản chi tiết`);
    else if (i.default && !inFilter(i.default, filter)) problems.push(`${c.caption}: tài khoản ${i.default} không nằm trong danh sách lọc (${filter.join('; ')})`);
    if (c.bind && !i.default) problems.push(`${c.caption}: cột này bộ định khoản tự dùng, phải có tài khoản mặc định`);
    return { ...c, filter, default: i.default };
  });
  if (problems.length) throw Errors.validation(problems.join(' · '));
  await trx.updateTable('account_default_types').set({ columns: JSON.stringify(next), updated_by: actor, updated_at: new Date() }).where('id', '=', cur.id).execute();
  // Một nơi khai: cột gắn khoá → tài khoản ngầm định của bộ định khoản. Khoá dùng ở loại khác thì các loại đó đổi theo.
  for (const c of next) {
    if (!c.bind || !c.default) continue;
    await trx.insertInto('posting_defaults').values({ tenant_id: tenantId, key: c.bind, account_code: c.default })
      .onConflict((oc) => oc.columns(['tenant_id', 'key']).doUpdateSet({ account_code: c.default })).execute();
    const others = await trx.selectFrom('account_default_types').select(['id', 'columns']).where('tenant_id', '=', tenantId).where('id', '!=', cur.id).execute();
    for (const o of others) {
      if (!o.columns.some((x) => x.bind === c.bind && x.default !== c.default)) continue;
      await trx.updateTable('account_default_types').set({ columns: JSON.stringify(o.columns.map((x) => (x.bind === c.bind ? { ...x, default: c.default } : x))) }).where('id', '=', o.id).execute();
    }
  }
  await writeAudit(trx, { tenantId, actor, action: 'account_default_type.update', objectType: 'account_default_type', objectId: code, before: { columns: cur.columns }, after: { columns: next } });
  const row = await trx.selectFrom('account_default_types').select(['code', 'grp', 'name', 'columns', 'sort_order', 'is_active', 'updated_by', 'updated_at']).where('id', '=', cur.id).executeTakeFirstOrThrow();
  return toDto(row);
}

export async function accountDefaultTypeRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get('/api/v1/account-default-types', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Tài khoản ngầm định theo loại chứng từ' },
    handler: async (req) => { const a = authOf(req); return ok(await listAccountDefaultTypes(a.tenantId, a.actorName || a.actor)); },
  });
  mountActions(app, actions);
}

const actions: AnyActionDef[] = [
  defineAction({
    id: 'core.account-default-type.update', title: 'Sửa tài khoản ngầm định của một loại chứng từ', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: z.object({ code: z.string().min(1).max(80), columns: z.array(colInput).min(1).max(20) }), output: z.any(),
    expose: { http: { method: 'PUT', path: '/api/v1/account-default-types/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'account_default_type', objectId: (i) => i.code },
    handler: (ctx, i) => saveType(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actorName || ctx.legacyAuth.actor, i.code, i.columns),
  }),
  defineAction({
    id: 'core.account-default-type.restore', title: 'Quay về dữ liệu gốc tài khoản ngầm định theo loại', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: z.object({ confirm: z.literal(true) }), output: z.any(),
    expose: { http: { method: 'POST', path: '/api/v1/account-default-types/restore' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'account_default_type', objectId: () => 'restore' },
    handler: async (ctx) => ({ count: await seedTenant(ctx.data.tx, ctx.tenant.id, ctx.legacyAuth.actorName || ctx.legacyAuth.actor, true) }),
  }),
];
