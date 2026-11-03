/**
 * Bể chờ đầu vào (PHASE-021 W2, PHASES 2.18; ADR-0014 D2, D10; RULE-INTAKE-1/2/7/12):
 *   T021-1  cửa nạp từ chối → mã lỗi cũ + error.intake (id, điểm, phát hiện); details giữ khuôn cũ; mục bể có nguyên văn; KHÔNG sự việc
 *   T021-2  gửi lại cùng nguyên văn khi mục mở → attempt_no + 1, không thêm dòng
 *   T021-5  nguồn gửi lại cùng docKey đã sửa → mục 'fixed_at_source', event_id
 *           nạp lô: dòng bị từ chối có intakeId; core.document.submit: từ chối → bể (kênh submit), dry-run không ghi bể
 *           Kiểm thử: phát hiện + điểm, save → mục 'trial' (gộp trùng)
 *   T021-10 đơn vị khác không đọc được mục bể
 *   T021-11 dọn theo hạn giữ: mục đóng quá 90 ngày, mục thử quá 7 ngày bị xoá; mục mở, sự việc không đổi
 *   T021-12 nguyên văn không lọt vào outbox
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { deleteExpiredIntake } from '../src/kernel/public.js';
import { saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let other: TestCtx;
let tenantId = '';
const H = (t = ctx.token) => ({ authorization: `Bearer ${t}` });
const post = (url: string, payload: unknown, t?: string) => ctx.app.inject({ method: 'POST', url, payload: payload as never, headers: H(t) });
const inbox = (id: string) => db.selectFrom('intake_inbox').selectAll().where('id', '=', id).executeTakeFirst();
const eventOf = (docKey: string) => db.selectFrom('accounting_events').select(['id', 'status']).where('tenant_id', '=', tenantId).where('doc_key', '=', docKey).executeTakeFirst();

beforeAll(async () => {
  ctx = await setupTenant();
  other = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
  await other.app.close();
});

describe('Cửa nạp từ chối → bể chờ', () => {
  const bad = saleDoc({ docKey: 'bc:CN01:B1', docNo: 'B1', docDate: '05/10/2026', description: 'BI-MAT-BC-001' });

  it('T021-1: 400 + error.intake (id, điểm 0, IN-SHAPE-003); details giữ khuôn mảng câu cũ; mục có nguyên văn; không sự việc', async () => {
    const res = await post('/api/v1/documents', bad);
    expect(res.statusCode).toBe(400);
    const e = res.json().error;
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(e.details) && e.details.some((x: string) => x.startsWith('Ngày chứng từ'))).toBe(true);
    expect(e.intake).toMatchObject({ id: expect.any(String), score: 0, attempt: 1, url: `/api/v1/intake/${e.intake.id}` });
    expect(e.intake.findings.map((f: { code: string }) => f.code)).toContain('IN-SHAPE-003');
    const row = await inbox(e.intake.id);
    expect(row).toMatchObject({ status: 'open', channel: 'api', doc_key: 'bc:CN01:B1', doc_type: 'sale', attempt_no: 1 });
    expect(row!.payload_raw).toMatchObject({ docDate: '05/10/2026', description: 'BI-MAT-BC-001' });
    expect(row!.door_error).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await eventOf('bc:CN01:B1')).toBeUndefined();
  });

  it('T021-2: gửi lại cùng nguyên văn → cùng mục, attempt 2, không thêm dòng', async () => {
    const res = await post('/api/v1/documents', bad);
    const n = await db.selectFrom('intake_inbox').select(db.fn.countAll().as('n')).where('tenant_id', '=', tenantId).where('doc_key', '=', 'bc:CN01:B1').executeTakeFirstOrThrow();
    expect(Number(n.n)).toBe(1);
    expect(res.json().error.intake.attempt).toBe(2);
  });

  it('T021-5: nguồn gửi lại đúng cùng docKey → fixed_at_source, có event_id', async () => {
    const fixed = { ...bad, docDate: '2026-10-05' };
    expect((await post('/api/v1/documents', fixed)).statusCode).toBe(200);
    const ev = await eventOf('bc:CN01:B1');
    const row = await db.selectFrom('intake_inbox').select(['status', 'event_id', 'resolved_at']).where('tenant_id', '=', tenantId).where('doc_key', '=', 'bc:CN01:B1').executeTakeFirstOrThrow();
    expect(row).toMatchObject({ status: 'fixed_at_source', event_id: ev!.id });
    expect(row.resolved_at).toBeTruthy();
  });

  it('nạp lô: dòng bị từ chối có intakeId (kênh batch), dòng đúng vẫn vào', async () => {
    const res = await post('/api/v1/documents/batch', { documents: [saleDoc({ docKey: 'bc:CN01:L1', docNo: 'L1', branchCode: 'KHONG-CO' }), saleDoc({ docKey: 'bc:CN01:L2', docNo: 'L2' })] });
    const [r1, r2] = res.json().data;
    expect(r1).toMatchObject({ status: 'error', intakeId: expect.any(String) });
    expect(r2.status).not.toBe('error');
    expect(await inbox(r1.intakeId)).toMatchObject({ channel: 'batch', status: 'open' });
  });

  it('core.document.submit: từ chối → bể (kênh submit); dry-run không ghi bể', async () => {
    const doc = saleDoc({ docKey: 'bc:CN01:S1', docNo: 'S1', totals: { beforeTax: 1, tax: 14815, total: 14816 } });
    const dry = await post('/api/v1/documents/submit?dryRun=1', { document: doc });
    expect(dry.statusCode).toBeGreaterThanOrEqual(400);
    expect(dry.json().error.intake).toBeUndefined();
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/documents/submit', payload: { document: doc } as never, headers: { ...H(), 'idempotency-key': 'bc-submit-0001' } });
    expect(res.statusCode).toBe(400);
    const id = res.json().error.intake.id;
    expect(await inbox(id)).toMatchObject({ channel: 'submit', status: 'open' });
    expect((res.json().error.intake.findings as { code: string }[]).map((f) => f.code)).toContain('IN-SUM-001');
  });

  it('core.document.submit sai khuôn: details là mảng câu nêu trường sai (trước: object flatten() — giao diện không hiện được)', async () => {
    const { docDate: _bo, ...doc } = saleDoc({ docKey: 'bc:CN01:S2', docNo: 'S2' });
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/documents/submit', payload: { document: doc } as never, headers: { ...H(), 'idempotency-key': 'bc-submit-0002' } });
    expect(res.statusCode).toBe(400);
    const details = res.json().error.details;
    expect(Array.isArray(details), JSON.stringify(details)).toBe(true);
    expect(details).toContain('Ngày chứng từ: thiếu');
  });
});

describe('API bể chờ', () => {
  it('danh sách lọc status=open kèm mã phát hiện; chi tiết có nguyên văn', async () => {
    const list = await ctx.app.inject({ method: 'GET', url: '/api/v1/intake?status=open', headers: H() });
    expect(list.statusCode, list.body).toBe(200);
    const row = list.json().data.find((r: { doc_key: string }) => r.doc_key === 'bc:CN01:S1');
    expect(row.codes).toContain('IN-SUM-001');
    const one = await ctx.app.inject({ method: 'GET', url: `/api/v1/intake/${row.id}`, headers: H() });
    expect(one.json().data.payload_raw).toMatchObject({ docKey: 'bc:CN01:S1' });
  });

  it('Kiểm thử: phát hiện + điểm, không sự việc; save → mục trial, gửi trùng gộp', async () => {
    const doc = saleDoc({ docKey: 'bc:CN01:T1', docNo: 'T1', branchCode: 'KHONG-CO' });
    const r1 = await post('/api/v1/intake/preflight', { document: doc, save: true });
    expect(r1.statusCode, r1.body).toBe(200);
    expect(r1.json().data).toMatchObject({ score: 0, trialId: expect.any(String), attempt: 1 });
    const r2 = await post('/api/v1/intake/preflight', { document: doc, save: true });
    expect(r2.json().data).toMatchObject({ trialId: r1.json().data.trialId, attempt: 2 });
    expect(await inbox(r1.json().data.trialId)).toMatchObject({ status: 'trial', channel: 'trial' });
    expect(await eventOf('bc:CN01:T1')).toBeUndefined();
  });

  it('T021-10: đơn vị khác không đọc được mục bể', async () => {
    const list = await ctx.app.inject({ method: 'GET', url: '/api/v1/intake?status=open', headers: H() });
    const id = list.json().data[0].id;
    expect((await ctx.app.inject({ method: 'GET', url: `/api/v1/intake/${id}`, headers: H(other.token) })).statusCode).toBe(404);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/intake', headers: H(other.token) })).json().data).toEqual([]);
  });

  it('T021-12: nguyên văn không lọt vào outbox', async () => {
    const leaked = await db.selectFrom('event_outbox').select(db.fn.countAll().as('n')).where('tenant_id', '=', tenantId).where(sql<boolean>`strpos(event_outbox::text, 'BI-MAT-BC-001') > 0`).executeTakeFirstOrThrow();
    expect(Number(leaked.n)).toBe(0);
  });
});

describe('Hạn giữ (T021-11)', () => {
  it('xoá mục đóng quá 90 ngày, mục thử quá 7 ngày; mục mở và sự việc không đổi', async () => {
    const old = new Date(Date.now() - 100 * 86_400_000);
    await db.updateTable('intake_inbox').set({ resolved_at: old }).where('tenant_id', '=', tenantId).where('status', '=', 'fixed_at_source').execute();
    await db.updateTable('intake_inbox').set({ last_seen_at: new Date(Date.now() - 8 * 86_400_000) }).where('tenant_id', '=', tenantId).where('status', '=', 'trial').execute();
    const openBefore = await db.selectFrom('intake_inbox').select(db.fn.countAll().as('n')).where('tenant_id', '=', tenantId).where('status', '=', 'open').executeTakeFirstOrThrow();
    const evBefore = await db.selectFrom('accounting_events').select(db.fn.countAll().as('n')).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
    const n = await db.transaction().execute((trx) => deleteExpiredIntake(trx, tenantId, 90, 7));
    expect(n).toBeGreaterThanOrEqual(2);
    expect(await db.selectFrom('intake_inbox').select('id').where('tenant_id', '=', tenantId).where('status', 'in', ['fixed_at_source', 'trial']).execute()).toEqual([]);
    const openAfter = await db.selectFrom('intake_inbox').select(db.fn.countAll().as('n')).where('tenant_id', '=', tenantId).where('status', '=', 'open').executeTakeFirstOrThrow();
    const evAfter = await db.selectFrom('accounting_events').select(db.fn.countAll().as('n')).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
    expect(Number(openAfter.n)).toBe(Number(openBefore.n));
    expect(Number(evAfter.n)).toBe(Number(evBefore.n));
  });
});
