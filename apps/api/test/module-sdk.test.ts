/**
 * @bizcity/module-sdk v0.1 + đường ghi sổ của plugin (ADR-0011 D5, D6; PHASES 3.1, 3.6, 3.14):
 *   - core.document.submit: nộp chứng từ qua runtime action — Idempotency-Key, biên nhận, dry-run, lỗi không lưu chứng từ;
 *   - module viết CHỈ bằng @bizcity/module-sdk (như plugin thật) nộp chứng từ bằng ctx.ledger.submit: docKey phải mang tiền tố
 *     module, dữ liệu module và sổ cùng commit / cùng huỷ, action đọc không nộp được;
 *   - ctx.settings.get: chỉ khoá module sở hữu, khoá lạ là lỗi;
 *   - defineModule bắt khai báo lệch manifest.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defineAction, defineModule, defineSubscriber, docRef, z, type AnyActionDef, type ModuleManifestLike } from '@bizcity/module-sdk';
import type { AuthContext } from '../src/core/auth.js';
import { runAction } from '../src/core/actions.js';
import { db } from '../src/db/client.js';
import { saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let auth: AuthContext;

const manifest: ModuleManifestLike = {
  contract: 'bizcity_module@1', id: 'acme.pos-demo', key: 'pos-demo', kind: 'module', version: '0.1.0', label: 'POS thử',
  requires: { capabilities: ['ledger.submit', 'documents.versions'] },
  actions: ['pos-demo.sale.record', 'pos-demo.sale.peek'],
};

/** Ghi ca bán của module (bảng của module giả lập bằng document_versions) rồi nộp hoá đơn vào sổ — cùng một giao dịch. */
const recordSale = defineAction({
  id: 'pos-demo.sale.record', title: 'Ghi hoá đơn bán lẻ', permission: 'documents:write', effect: 'write', idempotency: 'required',
  sideEffects: ['documents', 'ledger'], dryRun: true,
  input: z.object({ no: z.string(), docKey: z.string().optional(), total: z.number().optional() }),
  output: z.object({ status: z.string(), docKey: z.string(), version: z.number() }),
  expose: {},
  handler: async (c, input) => {
    await c.documents.saveVersion(docRef('pos-demo.sale', input.no), { no: input.no });
    const doc = saleDoc({ docKey: input.docKey ?? `pos-demo:CN01:${input.no}`, docNo: input.no });
    if (input.total) doc.totals = { ...doc.totals, total: input.total };
    const r = await c.ledger.submit(doc);
    return { status: r.status, docKey: r.docKey, version: r.version };
  },
});
const peek = defineAction({
  id: 'pos-demo.sale.peek', title: 'Đọc thử', permission: 'documents:read', effect: 'read', idempotency: 'none',
  input: z.object({}), output: z.object({ ok: z.boolean() }), expose: {},
  handler: async (c) => { await c.ledger.submit(saleDoc({ docKey: 'pos-demo:CN01:PEEK', docNo: 'PEEK' })); return { ok: true }; },
});
const readSettings = defineAction({
  id: 'mua-hang.test.settings', title: 'Đọc cấu hình', permission: 'documents:read', effect: 'read', idempotency: 'none',
  input: z.object({ key: z.string() }), output: z.object({ value: z.unknown() }), expose: {},
  handler: async (c, { key }) => ({ value: await c.settings.get(key) }),
});

const run = (def: AnyActionDef, input: unknown, opts: { key?: string; dryRun?: boolean } = {}) =>
  runAction(def, input, { auth, requestId: `test-${Math.random().toString(36).slice(2, 10)}`, idempotencyKey: opts.key, dryRun: opts.dryRun });
const eventRow = (docKey: string) => db.selectFrom('accounting_events').select(['status', 'source_system']).where('tenant_id', '=', tenantId).where('doc_key', '=', docKey).executeTakeFirst();
const versionRows = (ref: string) => db.selectFrom('document_versions').select('version').where('tenant_id', '=', tenantId).where('doc_ref', '=', ref).execute();
const submit = (payload: unknown, opts: { key?: string; dry?: boolean } = {}) => ctx.app.inject({
  method: 'POST', url: `/api/v1/documents/submit${opts.dry ? '?dryRun=1' : ''}`, payload: payload as never,
  headers: { authorization: `Bearer ${ctx.token}`, ...(opts.key ? { 'idempotency-key': opts.key } : {}) },
});

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  auth = { tenantId, actor: 'system:module-sdk-test', actorName: 'Thử SDK', kind: 'user', role: 'owner', permissions: new Set(['documents:write', 'documents:read']) } as AuthContext;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('core.document.submit (HTTP, runtime action)', () => {
  it('nộp chứng từ → posted + bút toán + biên nhận; gửi lại cùng Idempotency-Key → cùng kết quả, một sự việc', async () => {
    const body = { document: saleDoc({ docKey: 'pos:CN01:SUB-1', docNo: 'SUB-1' }) };
    const first = await submit(body, { key: 'nop-chung-tu-0001' });
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json().data).toMatchObject({ docKey: 'pos:CN01:SUB-1', status: 'posted' });
    expect(first.json().data.entries.length).toBeGreaterThan(0);
    expect(first.json().meta.receipt).toMatchObject({ evidenceId: expect.any(String), hash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) });
    const again = await submit(body, { key: 'nop-chung-tu-0001' });
    expect(again.json().meta).toMatchObject({ idempotency: 'replayed' });
    expect(again.json().data).toEqual(first.json().data);
    const n = await db.selectFrom('accounting_events').select(db.fn.countAll().as('n')).where('tenant_id', '=', tenantId).where('doc_key', '=', 'pos:CN01:SUB-1').executeTakeFirstOrThrow();
    expect(Number(n.n)).toBe(1);
  });

  it('dry-run: trả bút toán dựng thử, không để lại sự việc', async () => {
    const res = await submit({ document: saleDoc({ docKey: 'pos:CN01:SUB-DRY', docNo: 'SUB-DRY' }) }, { dry: true });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().meta).toMatchObject({ dryRun: true });
    expect(res.json().data.entries.length).toBeGreaterThan(0);
    expect(await eventRow('pos:CN01:SUB-DRY')).toBeUndefined();
  });

  it('chứng từ sai (tổng lệch dòng) → mã lỗi, KHÔNG lưu chứng từ trạng thái lỗi (khác POST /documents)', async () => {
    const doc = saleDoc({ docKey: 'pos:CN01:SUB-BAD', docNo: 'SUB-BAD' });
    const res = await submit({ document: { ...doc, totals: { ...doc.totals, total: 1 } } }, { key: 'nop-chung-tu-0002' });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.json().ok).toBe(false);
    expect(await eventRow('pos:CN01:SUB-BAD')).toBeUndefined();
  });
});

describe('Module viết bằng @bizcity/module-sdk: ctx.ledger.submit', () => {
  it('defineModule nhận khai báo khớp manifest; bắt action sai tiền tố / chưa khai, subscriber sai module', () => {
    expect(defineModule({ manifest, actions: [recordSale, peek] }).actions).toHaveLength(2);
    expect(() => defineModule({ manifest, actions: [readSettings] })).toThrow(/phải bắt đầu "pos-demo\."[\s\S]*chưa khai trong manifest\.actions/);
    const sub = defineSubscriber({ id: 'khac.nghe', module: 'khac', on: ['bizcity.clock.daily'], handle: async () => {} });
    expect(() => defineModule({ manifest, subscribers: [sub] })).toThrow(/module "khac" ≠ "pos-demo"/);
    expect(() => defineModule({ manifest: { ...manifest, kind: 'addin' } })).toThrow(/kind "addin"/);
  });

  it('nộp chứng từ của module: posted, nguồn = mã module, dữ liệu module và sổ cùng commit', async () => {
    const r = await run(recordSale, { no: 'HD-SDK-1' }, { key: 'pos-demo-hd-0001' });
    expect(r.data).toMatchObject({ status: 'posted', docKey: 'pos-demo:CN01:HD-SDK-1' });
    expect(r.meta.receipt?.evidenceId).toBeTruthy();
    expect(await eventRow('pos-demo:CN01:HD-SDK-1')).toMatchObject({ status: 'posted', source_system: 'pos-demo' });
    expect(await versionRows('pos-demo.sale:HD-SDK-1')).toHaveLength(1);
  });

  it('docKey không mang tiền tố module → từ chối, không có gì được ghi', async () => {
    await expect(run(recordSale, { no: 'HD-SDK-2', docKey: 'pos:CN01:HD-SDK-2' }, { key: 'pos-demo-hd-0002' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await eventRow('pos:CN01:HD-SDK-2')).toBeUndefined();
    expect(await versionRows('pos-demo.sale:HD-SDK-2')).toHaveLength(0);
  });

  it('nộp sổ lỗi → cả action huỷ: bản ghi của module cũng không còn (một giao dịch)', async () => {
    await expect(run(recordSale, { no: 'HD-SDK-3', total: 1 }, { key: 'pos-demo-hd-0003' })).rejects.toBeTruthy();
    expect(await eventRow('pos-demo:CN01:HD-SDK-3')).toBeUndefined();
    expect(await versionRows('pos-demo.sale:HD-SDK-3')).toHaveLength(0);
  });

  it('dry-run của module: không sự việc, không bản ghi module', async () => {
    const r = await run(recordSale, { no: 'HD-SDK-4' }, { dryRun: true });
    expect(r.data).toMatchObject({ status: 'posted' });
    expect(await eventRow('pos-demo:CN01:HD-SDK-4')).toBeUndefined();
    expect(await versionRows('pos-demo.sale:HD-SDK-4')).toHaveLength(0);
  });

  it('action đọc không được nộp chứng từ', async () => {
    await expect(run(peek, {})).rejects.toThrow(/không được nộp chứng từ/);
    expect(await eventRow('pos-demo:CN01:PEEK')).toBeUndefined();
  });
});

describe('ctx.settings.get', () => {
  it('đọc khoá module sở hữu (mặc định khi đơn vị chưa đặt); khoá Core → FORBIDDEN; khoá lạ → VALIDATION', async () => {
    expect((await run(readSettings, { key: 'bizcity.mua_hang.settings' })).data).toEqual({ value: expect.anything() });
    await expect(run(readSettings, { key: 'bizcity.lock.period' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(run(readSettings, { key: 'bizcity.mua_hang.khong_co' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
