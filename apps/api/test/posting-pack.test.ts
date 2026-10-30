/**
 * Gói định khoản cài / xem trước / gỡ (bizcity_posting_template@1 §5, PHASES 3.11; PHASE-012 S012-3):
 * xem trước không ghi gì; cài giữ mục khác cấu hình đơn vị (STD-TPL-7) trừ khi chọn ghi đè; cài = phát hành MỘT bản chính sách kế toán,
 * bản cũ được chốt trước (ADR-0009 Q-5, STD-TPL-6); STD-TPL-2, -3, -9 chặn gói hỏng; gỡ chỉ ngừng dùng mã gói thêm mà chưa phát sinh (STD-TPL-8).
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

const EXAMPLE = JSON.parse(readFileSync(new URL('../../../docs/standard/examples/vn-tt99-thuong-mai.posting-pack.json', import.meta.url), 'utf8'));
const NOTE = `Cài gói định khoản ${EXAMPLE.id}@${EXAMPLE.version}`;

let ctx: TestCtx;
let tenantId = '';
const reason = (code: string) => db.selectFrom('posting_reasons').selectAll().where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
const versions = () => db.selectFrom('posting_policy_versions').select(['version', 'kind', 'note', 'hash', 'effective_from']).where('tenant_id', '=', tenantId).orderBy('version').execute();
const item = (items: { kind: string; code: string; action: string }[], kind: string, code: string) => items.find((i) => i.kind === kind && i.code === code)?.action;
const mini = (over: Record<string, unknown> = {}) => ({
  contract: 'bizcity_posting_template@1', id: 'test.vn-tt99.thu', version: '1.0.0', title: 'Gói thử', publisher: { id: 'test', name: 'Thử' },
  regime: 'vn-tt99-2025', industries: ['dich-vu'], reasons: [{ code: 'TDV9', name: 'Thu phí dịch vụ', kind: 'receipt', counterAccount: '1311' }], ...over,
});

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Gói định khoản', () => {
  it('xem trước (dryRun): thêm / giữ / xung đột, không ghi gì', async () => {
    const before = await versions();
    const r = await call(ctx, 'POST', '/api/v1/posting/packs/install?dryRun=1', { pack: EXAMPLE });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const items = r.body.data.items;
    expect(item(items, 'account', '11211')).toBe('add');
    expect(item(items, 'reason', 'CMH')).toBe('add');
    expect(item(items, 'reason', 'XBA')).toBe('conflict'); // lý do đơn vị đã có, khác gói → giữ (STD-TPL-7)
    expect(item(items, 'paymentMethod', 'CK')).toBe('conflict');
    expect(item(items, 'taxCode', 'V08')).toBe('keep');
    expect(item(items, 'default', 'cash')).toBe('keep');
    expect(r.body.data.policyVersion).toBeGreaterThan(0);
    expect(r.body.meta.dryRun).toBe(true);
    expect(await reason('CMH')).toBeUndefined();
    expect(await versions()).toEqual(before);
    expect((await call(ctx, 'GET', '/api/v1/posting/packs')).body.data).toEqual([]);
  });

  it('cài: ghi mục add, giữ xung đột, chốt bản cũ rồi phát hành một bản chính sách; bằng chứng core.template.install', async () => {
    const xba = await reason('XBA');
    const r = await call(ctx, 'POST', '/api/v1/posting/packs/install', { pack: EXAMPLE });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(await reason('CMH')).toMatchObject({ is_active: true, counter_account: '3312' });
    expect(await reason('XBA')).toEqual(xba);
    expect(await db.selectFrom('accounts').select(['parent_code', 'is_posting']).where('tenant_id', '=', tenantId).where('code', '=', '11211').executeTakeFirst()).toEqual({ parent_code: '1121', is_posting: true });
    const group = await db.selectFrom('product_posting_groups').select('is_default').where('tenant_id', '=', tenantId).where('code', '=', 'NHT01').executeTakeFirstOrThrow();
    expect(group.is_default).toBe(false); // đơn vị đã có nhóm mặc định

    const vs = await versions();
    const pub = vs.at(-1)!;
    expect(pub).toMatchObject({ version: r.body.data.policyVersion, kind: 'publish', note: NOTE });
    expect(vs.at(-2)!.hash).not.toBe(pub.hash); // bản trước giữ cấu hình cũ cho chứng từ trước ngày hiệu lực
    const list = (await call(ctx, 'GET', '/api/v1/posting/packs')).body.data;
    expect(list).toEqual([expect.objectContaining({ packId: EXAMPLE.id, status: 'installed', policyVersion: pub.version })]);
    const proof = await db.selectFrom('audit_logs').select(['action', 'object_id']).where('id', '=', r.body.meta.receipt.evidenceId).executeTakeFirstOrThrow();
    expect(proof).toEqual({ action: 'core.template.install', object_id: `${EXAMPLE.id}@${EXAMPLE.version}` });
  });

  it('cài lại có chọn ghi đè: chỉ mục được chọn đổi; mục gói đã thêm vẫn tính là của gói', async () => {
    const r = await call(ctx, 'POST', '/api/v1/posting/packs/install', { pack: EXAMPLE, overwrite: ['reason:TTBHK'] });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(item(r.body.data.items, 'reason', 'TTBHK')).toBe('update');
    expect(await reason('TTBHK')).toMatchObject({ cashflow_code: null });
    const row = await db.selectFrom('config_packs').select('items').where('tenant_id', '=', tenantId).where('pack_id', '=', EXAMPLE.id).executeTakeFirstOrThrow();
    expect(item(row.items as never, 'reason', 'CMH')).toBe('add');
    expect((await call(ctx, 'POST', '/api/v1/posting/packs/install', { pack: EXAMPLE, overwrite: ['reason:KHONGCO'] })).status).toBe(400);
  });

  it('gói hỏng bị chặn, không ghi gì: tài khoản lạ (STD-TPL-2), hai lý do mặc định (STD-TPL-3), docType / gói nền chưa có (STD-TPL-9)', async () => {
    const bad = await call(ctx, 'POST', '/api/v1/posting/packs/install', { pack: mini({ reasons: [{ code: 'TDV9', name: 'Thu phí', kind: 'receipt', counterAccount: '99999' }] }) });
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    const dup = await call(ctx, 'POST', '/api/v1/posting/packs/install', { pack: mini({ reasons: [{ code: 'XBA9', name: 'Bán hàng 2', kind: 'out', counterAccount: '1311', flags: { default: 'sale' } }] }) });
    expect(dup.body.error.code).toBe('VALIDATION_ERROR');
    expect(dup.body.error.message).toMatch(/sale → /);
    expect(await reason('XBA9')).toBeUndefined();
    const cap = await call(ctx, 'POST', '/api/v1/posting/packs/install', { pack: mini({ requires: { docTypes: ['payroll'] } }) });
    expect(cap.body.error.code).toBe('CAPABILITY_MISSING');
    const base = await call(ctx, 'POST', '/api/v1/posting/packs/install', { pack: mini({ extends: ['bizcity.vn-tt99.nen@^1'] }) });
    expect(base.body.error.code).toBe('CAPABILITY_MISSING');
  });

  it('gỡ: mã chưa phát sinh ngừng dùng, mã đã dùng giữ nguyên, phát hành bản "Gỡ gói"', async () => {
    const pay = await call(ctx, 'POST', '/api/v1/vouchers', {
      docType: 'payment', branchCode: 'CN01', docDate: '2026-10-08', description: 'Trả tiền điện cửa hàng', reasonCode: 'CDV01',
      lines: [{ debitAccount: '64173', creditAccount: '1111', amount: 3200000 }],
    });
    expect(pay.status, JSON.stringify(pay.body)).toBe(201);
    const r = await call(ctx, 'POST', '/api/v1/posting/packs/uninstall', { packId: EXAMPLE.id });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(item(r.body.data.items, 'reason', 'CDV01')).toBe('keep');
    expect(item(r.body.data.items, 'reason', 'CMH')).toBe('update');
    expect(await reason('CMH')).toMatchObject({ is_active: false });
    expect(await reason('CDV01')).toMatchObject({ is_active: true });
    expect(item(r.body.data.items, 'group', 'NHT01')).toBe('keep');
    expect((await versions()).at(-1)).toMatchObject({ kind: 'publish', note: `Gỡ gói định khoản ${EXAMPLE.id}@${EXAMPLE.version}` });
    expect((await call(ctx, 'GET', '/api/v1/posting/packs')).body.data[0]).toMatchObject({ status: 'uninstalled' });
    expect((await call(ctx, 'POST', '/api/v1/posting/packs/uninstall', { packId: EXAMPLE.id })).status).toBe(409);
  });

  it('AI không cài / gỡ gói: hai action không có trong tools/list', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${ctx.token}` }, payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' } as never });
    const names = (res.json().result.tools as { name: string }[]).map((t) => t.name);
    expect(names).toContain('core.template.list');
    expect(names.filter((n) => n.startsWith('core.template.install') || n.startsWith('core.template.uninstall'))).toEqual([]);
  });
});
