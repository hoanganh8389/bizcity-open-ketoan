/**
 * Bằng chứng (bizcity_evidence@1, PHASES 2.6): biên nhận trong meta.receipt, GET /api/v1/evidence/:id kiểm lại được, bằng chứng cả
 * khi thất bại (STD-EVD-1, CONF-RUN-11), chỉ thêm (STD-EVD-2, CONF-RUN-12), chuỗi băm theo đơn vị phát hiện dòng bị sửa ngầm.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { PLATFORM_DIAGNOSTICS } from '../src/modules/system/diagnostics.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx, kt: TestCtx;
let tenantId = '';
const body = { requestDate: '2026-10-12', branchCode: 'CN01', partnerCode: 'NCC-BC', amount: 700000, debitAccount: '64211', description: 'Chi bằng chứng' };
const post = (c: TestCtx, url: string, payload: unknown, key: string) =>
  c.app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: `Bearer ${c.token}`, 'idempotency-key': key } });
const chain = PLATFORM_DIAGNOSTICS.find((c) => c.code === 'EVIDENCE_CHAIN')!;

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  await call(ctx, 'PUT', '/api/v1/partners/NCC-BC', { name: 'Nhà cung cấp BC', kind: 'supplier' });
  expect((await call(ctx, 'POST', '/api/v1/users', { email: 'ktbc@ketoan.local', fullName: 'ktbc', role: 'accountant', password: 'Pass@12345' })).status).toBe(201);
  const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email: 'ktbc@ketoan.local', password: 'Pass@12345' } });
  kt = { ...ctx, token: res.json().data.token };
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Bằng chứng', () => {
  it('action ghi trả biên nhận; GET /evidence/:id cho bản ghi đủ trường, băm tính lại khớp, nối đúng chuỗi', async () => {
    const res = await post(ctx, '/api/v1/payment-requests', body, 'khoa-bang-chung-01');
    expect(res.statusCode, res.body).toBe(201);
    const receipt = res.json().meta.receipt;
    expect(receipt).toMatchObject({ evidenceId: expect.stringMatching(/^\d+$/), hash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) });

    const ev = (await call(ctx, 'GET', `/api/v1/evidence/${receipt.evidenceId}`)).body.data;
    expect(ev).toMatchObject({
      id: receipt.evidenceId, action: 'quy.payment-request.create', module: 'quy', subject: `payment_request:${res.json().data.requestNo}`,
      actor: { kind: 'user' }, idempotencyKey: 'khoa-bang-chung-01', inputHash: expect.stringMatching(/^sha256:/),
      result: { ok: true, code: null }, verify: { hashValid: true, linked: true },
    });
    expect(ev.chain.hash).toBe(receipt.hash);

    // Gửi lặp: không ghi bằng chứng mới, trả lại đúng biên nhận lần đầu.
    const again = await post(ctx, '/api/v1/payment-requests', body, 'khoa-bang-chung-01');
    expect(again.json().meta).toMatchObject({ idempotency: 'replayed', receipt });
  });

  it('STD-EVD-1: thao tác bị từ chối trong handler cũng có bằng chứng (result_ok = false, mã lỗi)', async () => {
    const c = await call(kt, 'POST', '/api/v1/payment-requests', { ...body, submit: true });
    const id = c.body.data.id;
    expect((await call(kt, 'POST', `/api/v1/payment-requests/${id}/approve`)).status).toBe(403);
    expect((await call(kt, 'POST', `/api/v1/payment-requests/${id}/pay`, { docDate: '2026-10-13', moneyAccount: '1111' })).status).toBe(409);
    const fails = await db.selectFrom('audit_logs').select(['action', 'result_ok', 'result_code', 'object_id', 'hash'])
      .where('tenant_id', '=', tenantId).where('result_ok', '=', false).orderBy('id').execute();
    expect(fails.map((f) => [f.action, f.result_code, f.object_id])).toEqual([
      ['quy.payment-request.approve', 'FORBIDDEN', id],
      ['quy.payment-request.pay', 'CONFLICT', id],
    ]);
    expect(fails.every((f) => f.hash?.startsWith('sha256:'))).toBe(true);
  });

  it('writeAudit() cũ (service gọi tay) cũng vào chuỗi băm, loại người gọi suy từ actor', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/settings/data-lock', { lockUntil: null })).status).toBe(200);
    const row = await db.selectFrom('audit_logs').select(['id', 'actor_kind', 'chain_seq', 'hash']).where('tenant_id', '=', tenantId).where('action', '=', 'settings.data-lock').executeTakeFirstOrThrow();
    expect(row).toMatchObject({ actor_kind: 'user', chain_seq: expect.any(String), hash: expect.stringMatching(/^sha256:/) });
    expect((await call(ctx, 'GET', `/api/v1/evidence/${row.id}`)).body.data.verify).toEqual({ hashValid: true, linked: true });
  });

  it('STD-EVD-2: chỉ thêm — không sửa, xoá, TRUNCATE được', async () => {
    const id = (await db.selectFrom('audit_logs').select('id').where('tenant_id', '=', tenantId).executeTakeFirstOrThrow()).id;
    await expect(sql`UPDATE audit_logs SET action = 'sua' WHERE id = ${id}`.execute(db)).rejects.toThrow(/chỉ được thêm/);
    await expect(sql`DELETE FROM audit_logs WHERE id = ${id}`.execute(db)).rejects.toThrow(/chỉ được thêm/);
    await expect(sql`TRUNCATE audit_logs`.execute(db)).rejects.toThrow(/chỉ được thêm/);
  });

  it('EVIDENCE_CHAIN: chuỗi của đơn vị đạt; dòng bị sửa ngầm (vượt trigger) thì lộ ngay dòng đó', async () => {
    const pass = await db.transaction().execute((trx) => chain.run(trx, { tenantId }));
    expect(pass).toMatchObject({ count: 0 });
    expect(pass.examined).toBeGreaterThan(3);
    const victim = (await db.selectFrom('audit_logs').select('id').where('tenant_id', '=', tenantId).where('chain_seq', '=', '2').executeTakeFirstOrThrow()).id;
    // Mô phỏng kẻ có quyền superuser sửa thẳng CSDL, trong một giao dịch rồi huỷ (không để lại gì).
    let tampered: Awaited<ReturnType<typeof chain.run>> | undefined;
    await db.transaction().execute(async (trx) => {
      await sql`SET LOCAL session_replication_role = replica`.execute(trx);
      await sql`UPDATE audit_logs SET after_data = '{"sua":true}'::jsonb WHERE id = ${victim}`.execute(trx);
      tampered = await chain.run(trx, { tenantId });
      throw new Error('huỷ');
    }).catch((e: Error) => { if (e.message !== 'huỷ') throw e; });
    expect(tampered).toMatchObject({ count: 1, sample: [victim] });
    const diag = await call(ctx, 'GET', '/api/v1/system/diagnostics');
    expect(diag.body.data.checks.find((c: { code: string }) => c.code === 'EVIDENCE_CHAIN')).toMatchObject({ level: 'pass' });
  });
});
