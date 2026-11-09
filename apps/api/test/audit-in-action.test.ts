// [2026-11-04 09:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 8b: thử nhật ký nghiệp vụ trong action theo ACTION 1.3.0 §4.4 (phương án C)
/**
 * writeAudit chạy trong action ghi: tên ngoài AUDIT_KEEP vào changes.notes.audit[] của bằng chứng (không dòng audit_logs thứ hai),
 * tên trong AUDIT_KEEP vẫn ghi dòng riêng; mục lô (savepoint) bị huỷ thì ghi chú bỏ theo; notes lớn hơn 64 KB bị lược; ngoài action như cũ.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { db } from '../src/db/client.js';
import { defineAction, runAction, type ActionContext } from '../src/core/actions.js';
import { writeAudit, isAuditKept } from '../src/core/audit.js';
import type { AuthContext, Permission } from '../src/core/auth.js';
import { auditRows, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const auth = (): AuthContext => ({ tenantId, actor: 'user:test', actorName: 'Test', kind: 'user', role: null, permissions: new Set<Permission>(['documents:write', 'documents:read']) });
const entry = (action: string, objectId: string, extra: Record<string, unknown> = {}) => ({ tenantId, actor: 'user:test', action, objectType: 'thing', objectId, before: { v: 1 }, after: { v: 2, ...extra } });

async function run(f: (c: ActionContext) => Promise<unknown>) {
  const def = defineAction({
    id: 'hop-dong.contract.audit', title: 'Thử nhật ký', permission: 'documents:write', effect: 'write', idempotency: 'natural', sideEffects: ['documents'],
    input: z.object({}), output: z.any(), expose: {},
    handler: (c) => f(c),
  });
  return runAction(def, {}, { auth: auth(), requestId: `aa-${Math.random()}` });
}
const evidenceOf = (receipt: string) => db.selectFrom('audit_logs').select(['after_data']).where('id', '=', receipt).executeTakeFirstOrThrow();
const countByName = async (action: string) =>
  Number((await db.selectFrom('audit_logs').select(db.fn.countAll().as('n')).where('tenant_id', '=', tenantId).where('action', '=', action).executeTakeFirstOrThrow()).n);

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
});
afterAll(async () => {
  await ctx.app.close();
});

describe('AUDIT_KEEP', () => {
  it('khớp tên chính xác, mẫu *.hậu-tố kèm objectType, và từ chối tên khác', () => {
    expect(isAuditKept({ action: 'costing.fill', objectType: 'x' })).toBe(true);
    expect(isAuditKept({ action: 'ledger.entry.header_update', objectType: 'ledger_entry' })).toBe(true); // S004-15a
    expect(isAuditKept({ action: 'settings.item-auto-create', objectType: 'x' })).toBe(true);
    expect(isAuditKept({ action: 'receipt.update', objectType: 'source_document' })).toBe(true);
    expect(isAuditKept({ action: 'receipt.update', objectType: 'branch' })).toBe(false);
    expect(isAuditKept({ action: 'branch.create', objectType: 'branch' })).toBe(false);
  });
});

describe('writeAudit trong action', () => {
  it('tên ngoài sổ → notes.audit[] của bằng chứng, không dòng audit_logs riêng', async () => {
    const r = await run(async (c) => { await writeAudit(c.data.tx as never, entry('thu.cu-a', 'A1')); return { ok: true }; });
    expect(await countByName('thu.cu-a')).toBe(0);
    const ev = (await evidenceOf(r.meta.receipt!.evidenceId)).after_data as { notes: { audit: unknown[] } };
    expect(ev.notes.audit).toEqual([{ action: 'thu.cu-a', objectType: 'thing', objectId: 'A1', before: { v: 1 }, after: { v: 2 } }]);
    expect(await auditRows(tenantId, 'thu.cu-a', 'A1')).toHaveLength(1);
  });

  it('tên trong sổ → vẫn một dòng audit_logs riêng', async () => {
    await run(async (c) => { await writeAudit(c.data.tx as never, entry('costing.fill', 'K1')); return { ok: true }; });
    expect(await countByName('costing.fill')).toBe(1);
    expect(await auditRows(tenantId, 'costing.fill', 'K1')).toHaveLength(1);
  });

  it('mục lô bị huỷ (savepoint) bỏ ghi chú theo; mục đúng giữ', async () => {
    const r = await run(async (c) => {
      await c.data.item(async (tx) => { await writeAudit(tx as never, entry('thu.lo', 'OK')); });
      await c.data.item(async (tx) => { await writeAudit(tx as never, entry('thu.lo', 'XAU')); throw new Error('mục lỗi'); });
      return { ok: true };
    });
    const ev = (await evidenceOf(r.meta.receipt!.evidenceId)).after_data as { notes: { audit: Array<{ objectId: string }> } };
    expect(ev.notes.audit.map((n) => n.objectId)).toEqual(['OK']);
  });

  it('ghi chú lớn hơn 64 KB → { omitted: true, bytes }', async () => {
    const r = await run(async (c) => { await writeAudit(c.data.tx as never, entry('thu.lon', 'BIG', { blob: 'x'.repeat(70 * 1024) })); return { ok: true }; });
    const ev = (await evidenceOf(r.meta.receipt!.evidenceId)).after_data as { notes: { audit: { omitted: boolean; bytes: number } } };
    expect(ev.notes.audit).toMatchObject({ omitted: true, bytes: expect.any(Number) });
    expect(ev.notes.audit.bytes).toBeGreaterThan(64 * 1024);
  });

  it('action không gọi writeAudit → bằng chứng không có notes', async () => {
    const r = await run(async () => ({ ok: true }));
    expect((await evidenceOf(r.meta.receipt!.evidenceId)).after_data).not.toHaveProperty('notes');
  });

  it('ngoài action: ghi dòng audit_logs như cũ', async () => {
    await db.transaction().execute((trx) => writeAudit(trx as never, entry('thu.ngoai', 'N1')));
    expect(await countByName('thu.ngoai')).toBe(1);
  });
});
