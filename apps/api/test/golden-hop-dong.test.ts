/**
 * Ca chuẩn Hợp đồng — kịch bản nghiệm thu GC-1..GC-12 (docs/standard/GOLDEN-CASE-HOP-DONG.md §6), PHASE-014 W4 / PHASES 4.5.
 * Chạy trên module modules/hop-dong do Claude sinh ra; chưa có module → bỏ qua. Không đọc mã của module: chỉ gọi HTTP / MCP như
 * người dùng, đọc bảng của Core (sổ, bằng chứng, thông báo, phiên bản, đính kèm) để đối chiếu. Hợp đồng HTTP của module theo
 * manifest mẫu (docs/standard/examples/hop-dong.bizcity.module.json):
 *   POST /contracts · PUT /contracts/:id · POST /contracts/:id/{submit,approve,attachments} · GET /installments/due
 *   POST /installments/:installmentId/payments · POST /installments/:installmentId/cancel-payment
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runModuleMigrations } from '@bizcity/platform/db/module-db';
import { buildApp } from '../src/app.js';
import { syncBundled } from '../src/core/module-lifecycle.js';
import { dispatchOnce, emitEvent } from '../src/core/events.js';
import { db } from '../src/db/client.js';
import { setupTenant, type TestCtx } from './helpers.js';

const DIR = fileURLToPath(new URL('../../../modules/hop-dong/', import.meta.url));
const HAS = existsSync(path.join(DIR, 'bizcity.module.json'));
const M = '/api/v1/m/hop-dong';
const CONSUMERS = ['hop-dong.remind-due', 'hop-dong.notify-due', 'hop-dong.on-ledger-posted', 'hop-dong.on-ledger-reversed'];
const day = (offset: number) => new Date(Date.now() + 7 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!HAS)('Ca chuẩn Hợp đồng — GC-1..GC-12', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  const tok: Record<'owner' | 'ktt' | 'kt', string> = { owner: '', ktt: '', kt: '' };
  let k = 0;
  const req = (who: keyof typeof tok, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown, key?: string) =>
    app.inject({ method, url, payload: payload as never, headers: { authorization: `Bearer ${tok[who]}`, 'idempotency-key': key ?? `gc-${++k}-${Date.now()}` } });
  const dispatch = () => dispatchOnce({ consumers: CONSUMERS, tenantId, limit: 100 });
  const contract = async (who: keyof typeof tok, total: number, amounts: number[], dues = [2, 40, 70]) => {
    const r = await req(who, 'POST', `${M}/contracts`, { branchCode: 'CN01', partnerCode: 'KH-HD', title: `Bảo trì ${total}`, totalAmount: total, installments: amounts.map((a, i) => ({ dueDate: day(dues[i] ?? 90), amount: a })) });
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data as { id: string; docNo: string; installments: { id: string; seq: number }[] };
  };
  const activeEntries = async (docKey: string) => Number((await sql<{ n: string }>`SELECT count(*) AS n FROM ledger_entries e JOIN accounting_events a ON a.id = e.event_id
    WHERE a.tenant_id = ${tenantId} AND a.doc_key = ${docKey} AND e.status = 'posted' AND e.reverses_entry_id IS NULL`.execute(db)).rows[0]!.n);
  /** Bút toán đảo của chứng từ (đảo đúng một lần). */
  const reversals = async (docKey: string) => Number((await sql<{ n: string }>`SELECT count(*) AS n FROM ledger_entries e JOIN accounting_events a ON a.id = e.event_id
    WHERE a.tenant_id = ${tenantId} AND a.doc_key = ${docKey} AND e.reverses_entry_id IS NOT NULL`.execute(db)).rows[0]!.n);

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('hop-dong', path.join(DIR, 'migrations'), { reads: ['bizcity_read.partners'] });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:golden', trx as never); });
    app = await buildApp();
    tok.owner = ctx.token;
    for (const [who, role] of [['ktt', 'chief_accountant'], ['kt', 'accountant']] as const) {
      expect((await req('owner', 'POST', '/api/v1/users', { email: `${who}@hd.local`, fullName: who, role, password: 'Matkhau@123' })).statusCode).toBe(201);
      tok[who] = (await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email: `${who}@hd.local`, password: 'Matkhau@123' } })).json().data.token;
    }
    expect((await req('owner', 'PUT', '/api/v1/partners/KH-HD', { name: 'Khách hợp đồng', kind: 'customer' })).statusCode).toBeLessThan(300);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  let c1: Awaited<ReturnType<typeof contract>>;

  it('GC-1: tổng kỳ ≠ giá trị hợp đồng → gửi duyệt bị chặn (VALIDATION_ERROR)', async () => {
    c1 = await contract('kt', 30_000_000, [10_000_000, 10_000_000, 9_000_000]);
    expect(c1.docNo).toMatch(/^HD-\d{4}-\d{4}$/);
    const r = await req('kt', 'POST', `${M}/contracts/${c1.id}/submit`);
    expect(r.json().error?.code, r.body).toBe('VALIDATION_ERROR');
  });

  it('GC-2: người lập tự duyệt → FORBIDDEN (tách nhiệm); người khác duyệt được', async () => {
    const u = await req('kt', 'PUT', `${M}/contracts/${c1.id}`, { installments: [2, 40, 70].map((d) => ({ dueDate: day(d), amount: 10_000_000 })) });
    expect(u.statusCode, u.body).toBe(200);
    c1 = u.json().data;
    expect((await req('kt', 'POST', `${M}/contracts/${c1.id}/submit`)).statusCode).toBe(200);
    // người lập (kế toán) không có quyền duyệt; chủ đơn vị tự lập rồi tự duyệt hợp đồng khác → tách nhiệm
    const own = await contract('owner', 5_000_000, [5_000_000]);
    expect((await req('owner', 'POST', `${M}/contracts/${own.id}/submit`)).statusCode).toBe(200);
    const self = await req('owner', 'POST', `${M}/contracts/${own.id}/approve`);
    expect(self.json().error?.code, self.body).toBe('FORBIDDEN');
    const ok = await req('ktt', 'POST', `${M}/contracts/${c1.id}/approve`);
    expect(ok.json().data?.status, ok.body).toBe('active');
  });

  it('GC-3: hợp đồng ≥ ngưỡng: duyệt một cấp vẫn chờ cấp 2', async () => {
    const big = await contract('kt', 150_000_000, [150_000_000]);
    expect((await req('kt', 'POST', `${M}/contracts/${big.id}/submit`)).json().data.levelsRequired).toBe(2);
    const l1 = await req('ktt', 'POST', `${M}/contracts/${big.id}/approve`);
    expect(l1.json().data?.status, l1.body).not.toBe('active');
    expect((await req('ktt', 'POST', `${M}/contracts/${big.id}/approve`)).json().error?.code).toBe('FORBIDDEN');
    expect((await req('owner', 'POST', `${M}/contracts/${big.id}/approve`)).json().data?.status).toBe('active');
  });

  it('GC-4: đính kèm bản scan, sửa nháp → 2 phiên bản, tệp vẫn gắn', async () => {
    const d = await contract('kt', 1_000_000, [1_000_000]);
    const pdf = Buffer.from('%PDF-1.4\n%hop dong\n').toString('base64');
    expect((await req('kt', 'POST', `${M}/contracts/${d.id}/attachments`, { fileName: 'hop-dong.pdf', contentType: 'application/pdf', dataBase64: pdf })).statusCode).toBe(200);
    expect((await req('kt', 'PUT', `${M}/contracts/${d.id}`, { title: 'Bảo trì (sửa)' })).statusCode).toBe(200);
    const ref = `hop-dong.contract:${d.id}`;
    const v = await sql<{ n: string }>`SELECT count(*) AS n FROM document_versions WHERE tenant_id = ${tenantId} AND doc_ref = ${ref}`.execute(db);
    const a = await sql<{ n: string }>`SELECT count(*) AS n FROM document_attachments WHERE tenant_id = ${tenantId} AND doc_ref = ${ref}`.execute(db);
    expect([Number(v.rows[0]!.n), Number(a.rows[0]!.n)]).toEqual([2, 1]);
  });

  it('GC-5: đồng hồ ngày — mỗi kỳ đến hạn trong 3 ngày: 1 sự kiện due, 1 thông báo; giao lại đồng hồ không báo lần hai', async () => {
    for (let i = 0; i < 2; i++) {
      await db.transaction().execute((trx) => emitEvent(trx, { tenantId, type: 'bizcity.clock.daily', subject: `clock:${day(0)}:${i}`, source: 'bizcity.platform', actor: { kind: 'system', id: 'test' }, data: { date: day(0) } }));
      await dispatch();
      await dispatch();
    }
    // hai hợp đồng hiệu lực (GC-2 và GC-3) có kỳ đến hạn trong 3 ngày → 2 kỳ; mỗi kỳ đúng một sự kiện, một thông báo
    const due = await sql<{ subject: string; n: string }>`SELECT subject, count(*) AS n FROM event_outbox WHERE tenant_id = ${tenantId} AND type = 'hop-dong.installment.due' GROUP BY subject`.execute(db);
    expect(due.rows.length).toBe(2);
    expect(due.rows.every((r) => Number(r.n) === 1)).toBe(true);
    expect(due.rows.map((r) => r.subject)).toContain(`hop-dong.installment:${c1.installments[0]!.id}`);
    const n = await req('kt', 'GET', '/api/v1/notifications');
    expect(n.json().data.items.filter((x: { source: string }) => x.source === 'hop-dong')).toHaveLength(2);
  });

  let payKey = '';
  it('GC-6 + GC-8: ghi nhận thu kỳ 1 (phiếu thu chờ duyệt) → kỳ collecting, sự việc pending, chưa bút toán; gửi lại cùng khoá → cùng phản hồi', async () => {
    expect((await req('owner', 'PUT', '/api/v1/settings/posting-modes', { customer_payment: 'approve' })).statusCode).toBe(200);
    const body = { paidDate: day(0), methodCode: 'TM' };
    const r1 = await req('kt', 'POST', `${M}/installments/${c1.installments[0]!.id}/payments`, body, 'gc6-payment-key');
    expect(r1.statusCode, r1.body).toBe(200);
    expect(r1.json().data).toMatchObject({ status: 'collecting', ledgerStatus: 'pending' });
    payKey = r1.json().data.ledgerDocKey;
    expect(await activeEntries(payKey)).toBe(0);
    const r2 = await req('kt', 'POST', `${M}/installments/${c1.installments[0]!.id}/payments`, body, 'gc6-payment-key');
    expect(r2.json().data).toEqual(r1.json().data);
    const ev = await sql<{ n: string }>`SELECT count(*) AS n FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${payKey}`.execute(db);
    expect(Number(ev.rows[0]!.n)).toBe(1);
  });

  it('GC-7: kế toán duyệt phiếu thu → có bút toán; kỳ paid; sự kiện installment.paid', async () => {
    const id = (await sql<{ id: string }>`SELECT id::text FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${payKey}`.execute(db)).rows[0]!.id;
    expect((await req('owner', 'POST', '/api/v1/documents/post', { ids: [id] })).statusCode).toBe(200);
    expect(await activeEntries(payKey)).toBeGreaterThan(0);
    await dispatch();
    const due = await req('kt', 'GET', `${M}/installments/due`);
    expect(due.json().data.items.find((x: { id: string }) => x.id === c1.installments[0]!.id)).toBeUndefined();
    const paid = await sql<{ n: string }>`SELECT count(*) AS n FROM event_outbox WHERE tenant_id = ${tenantId} AND type = 'hop-dong.installment.paid'`.execute(db);
    expect(Number(paid.rows[0]!.n)).toBe(1);
  });

  it('GC-9: huỷ thu kỳ 1 → bút toán đảo đúng một lần; kỳ về scheduled', async () => {
    expect((await req('owner', 'PUT', '/api/v1/settings/posting-modes', { customer_payment: 'auto' })).statusCode).toBe(200);
    const r = await req('ktt', 'POST', `${M}/installments/${c1.installments[0]!.id}/cancel-payment`, { reason: 'Khách chuyển nhầm' });
    expect(r.statusCode, r.body).toBe(200);
    await dispatch();
    expect(await activeEntries(payKey)).toBe(0);
    expect(await reversals(payKey)).toBe(1);
    const due = await req('kt', 'GET', `${M}/installments/due`);
    expect(due.json().data.items.find((x: { id: string }) => x.id === c1.installments[0]!.id)?.status).toBe('scheduled');
  });

  it('GC-10: ghi nhận thu trong kỳ đã khoá → PERIOD_LOCKED; kỳ không đổi', async () => {
    expect((await req('owner', 'POST', '/api/v1/periods/locks', { year: 2026, month: 1 })).statusCode).toBe(200);
    const r = await req('kt', 'POST', `${M}/installments/${c1.installments[1]!.id}/payments`, { paidDate: '2026-01-15', methodCode: 'TM' });
    expect(r.json().error?.code, r.body).toBe('PERIOD_LOCKED');
    const due = await req('kt', 'GET', `${M}/installments/due`);
    expect(due.json().data.items.find((x: { id: string }) => x.id === c1.installments[1]!.id)?.status).toBe('scheduled');
  });

  it('GC-11: xoá khách đang có hợp đồng ở Danh mục → Core từ chối (referenceCheck của module)', async () => {
    // khách riêng chỉ có hợp đồng nháp (chưa có gì trên sổ) — để chính hook của module là lý do từ chối
    expect((await req('owner', 'PUT', '/api/v1/partners/KH-HD2', { name: 'Khách chỉ có hợp đồng', kind: 'customer' })).statusCode).toBeLessThan(300);
    expect((await req('kt', 'POST', `${M}/contracts`, { branchCode: 'CN01', partnerCode: 'KH-HD2', title: 'Nháp', totalAmount: 1_000_000, installments: [{ dueDate: day(30), amount: 1_000_000 }] })).statusCode).toBe(200);
    const r = await req('owner', 'DELETE', '/api/v1/partners/KH-HD2');
    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().error.message).toMatch(/hop-dong/);
  });

  it('GC-12: AI gọi record-payment qua MCP → không tự ghi được (quyền rủi ro cao: Core chặn; rủi ro thường: chỉ đề xuất chờ xác nhận); kỳ không đổi', async () => {
    const tool = async (name: string, args: unknown, meta?: unknown) => (await app.inject({ method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${tok.owner}` },
      payload: { jsonrpc: '2.0', id: ++k, method: 'tools/call', params: { name, arguments: args, ...(meta ? { _meta: meta } : {}) } } as never })).json().result;
    const list = (await app.inject({ method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${tok.owner}` }, payload: { jsonrpc: '2.0', id: ++k, method: 'tools/list' } as never })).json().result.tools as { name: string }[];
    const name = list.map((t) => t.name).find((n) => n.startsWith('hop_dong') && n.includes('record_payment'));
    expect(name, `MCP chưa có công cụ record-payment: ${list.map((t) => t.name).filter((n) => n.startsWith('hop_dong')).join(', ')}`).toBeDefined();
    const args = { installmentId: c1.installments[2]!.id, paidDate: day(0), methodCode: 'TM' };
    const p = await tool(name!, args);
    const outcome = p.structuredContent?.data?.status ?? p.structuredContent?.code;
    expect(['needs_confirmation', 'FORBIDDEN'], JSON.stringify(p)).toContain(outcome);
    const due = await req('kt', 'GET', `${M}/installments/due`);
    expect(due.json().data.items.find((x: { id: string }) => x.id === c1.installments[2]!.id)?.status).toBe('scheduled');
  });
});
