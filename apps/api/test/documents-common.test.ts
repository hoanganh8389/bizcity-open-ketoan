/**
 * documents.* (PHASES 2.7, bizcity_document@1 §3, §7): đánh số, phiên bản, liên kết, đính kèm chung — qua ctx.documents trong
 * action của module và qua HTTP cho giao diện.
 */
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { z } from 'zod';
import { db } from '../src/db/client.js';
import { defineAction, runAction, type ActionContext } from '../src/core/actions.js';
import type { AuthContext, Permission } from '../src/core/auth.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;
let dataDir: string;
const oldDataDir = process.env.DATA_DIR;
const auth = (): AuthContext => ({ tenantId, actor: 'user:test', actorName: 'Test', kind: 'user', role: null, permissions: new Set<Permission>(['documents:write', 'documents:read']) });

/** Action giả của module hop-dong: chạy hàm f với ctx thật trong giao dịch của action. */
function run<T>(f: (c: ActionContext) => Promise<T>, opts: { dryRun?: boolean } = {}) {
  const def = defineAction({
    id: 'hop-dong.contract.thu', title: 'Thử chứng từ chung', permission: 'documents:write', effect: 'write', idempotency: 'natural', sideEffects: ['documents'], dryRun: true,
    input: z.object({}), output: z.any(), expose: {},
    handler: (c) => f(c),
  });
  return runAction(def, {}, { auth: auth(), requestId: `dc-${Math.random()}`, dryRun: opts.dryRun });
}

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'bizcity-att-'));
  process.env.DATA_DIR = dataDir;
  ctx = await setupTenant();
  tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
});
afterAll(async () => {
  await ctx.app.close();
  if (oldDataDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = oldDataDir;
  await rm(dataDir, { recursive: true, force: true });
});

describe('documents.numbering', () => {
  it('cấp số theo dãy + năm, tự gắn module; giao dịch huỷ (dry-run) thì số không bị dùng', async () => {
    expect((await run((c) => c.documents.nextNumber('HD', { date: '2026-03-01' }))).data).toBe('HD-2026-0001');
    expect((await run((c) => c.documents.nextNumber('HD', { date: '2026-12-31' }))).data).toBe('HD-2026-0002');
    expect((await run((c) => c.documents.nextNumber('HD', { date: '2027-01-02', width: 6 }))).data).toBe('HD-2027-000001');
    await run((c) => c.documents.nextNumber('HD', { date: '2026-05-05' }), { dryRun: true });
    expect((await run((c) => c.documents.nextNumber('HD', { date: '2026-05-05' }))).data).toBe('HD-2026-0003');
    const seq = await db.selectFrom('document_sequences').select(['doc_type', 'year', 'last_no']).where('tenant_id', '=', tenantId).where('doc_type', '=', 'hop-dong:hd').orderBy('year').execute();
    expect(seq.map((r) => [r.year, Number(r.last_no)])).toEqual([[2026, 3], [2027, 1]]);
    await expect(run((c) => c.documents.nextNumber('hd'))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('documents.versions', () => {
  it('phiên bản tăng khi nội dung đổi, trùng nội dung thì giữ số cũ; chỉ thêm', async () => {
    const ref = 'hop-dong.contract:1';
    expect((await run((c) => c.documents.saveVersion(ref, { total: 100, lines: [{ a: 1 }] }))).data).toBe(1);
    expect((await run((c) => c.documents.saveVersion(ref, { lines: [{ a: 1 }], total: 100 }))).data).toBe(1); // khác thứ tự khoá, cùng nội dung
    expect((await run((c) => c.documents.saveVersion(ref, { total: 120, lines: [{ a: 1 }] }))).data).toBe(2);
    const list = (await run((c) => c.documents.versions(ref))).data;
    expect(list.map((v: { version: number }) => v.version)).toEqual([1, 2]);
    await expect(sql`UPDATE document_versions SET snapshot = '{}' WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/chỉ được thêm/);
    await expect(sql`DELETE FROM document_versions WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/chỉ được thêm/);
    const http = await call(ctx, 'GET', `/api/v1/document-versions/2?docRef=${encodeURIComponent(ref)}`);
    expect(http.body.data).toMatchObject({ version: 2, snapshot: { total: 120 } });
  });

  it('chỉ ghi chứng từ của chính module', async () => {
    await expect(run((c) => c.documents.saveVersion('quy.payment-request:9', { x: 1 }))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(run((c) => c.documents.saveVersion('hop-dong-sai', { x: 1 }))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('documents.links', () => {
  it('gắn liên kết, gắn lặp giữ một dòng, đọc cả hai chiều', async () => {
    await run(async (c) => {
      await c.documents.link('hop-dong.installment:5', 'hop-dong.contract:1', 'source');
      await c.documents.link('hop-dong.installment:5', 'hop-dong.contract:1', 'source');
      await c.documents.link('hop-dong.installment:5', 'ledger.event:hop-dong.installment:5:payment', 'ledger');
    });
    const http = await call(ctx, 'GET', `/api/v1/document-links?docRef=${encodeURIComponent('hop-dong.contract:1')}`);
    expect(http.body.data.links).toEqual([expect.objectContaining({ from: 'hop-dong.installment:5', to: 'hop-dong.contract:1', role: 'source' })]);
    const out = (await run((c) => c.documents.links('hop-dong.installment:5'))).data;
    expect(out.map((l: { role: string }) => l.role).sort()).toEqual(['ledger', 'source']);
    await expect(run((c) => c.documents.link('hop-dong.contract:1', 'hop-dong.contract:2', 'khac' as never))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(run((c) => c.documents.link('quy.payment-request:1', 'hop-dong.contract:1', 'source'))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('documents.attachments', () => {
  it('đính tệp qua HTTP, gửi lại cùng tệp → tệp cũ; tải về khớp băm; gỡ thì không còn trong danh sách', async () => {
    const ref = 'hop-dong.contract:1';
    const content = Buffer.from('Hợp đồng mẫu — bản scan giả lập');
    const body = { docRef: ref, kind: 'contract-scan', fileName: 'hop dong 01.pdf', contentType: 'application/pdf', dataBase64: content.toString('base64') };
    const a = await call(ctx, 'POST', '/api/v1/document-attachments', body);
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    expect(a.body.data).toMatchObject({ docRef: ref, kind: 'contract-scan', sizeBytes: content.length, sha256: createHash('sha256').update(content).digest('hex'), created: true });
    const again = await call(ctx, 'POST', '/api/v1/document-attachments', body);
    expect(again.body.data).toMatchObject({ id: a.body.data.id, created: false });

    const file = await ctx.app.inject({ method: 'GET', url: `/api/v1/document-attachments/${a.body.data.id}/file`, headers: { authorization: `Bearer ${ctx.token}` } });
    expect(file.statusCode).toBe(200);
    expect(file.rawPayload.equals(content)).toBe(true);
    expect(file.headers['content-type']).toContain('application/pdf');

    const list = await call(ctx, 'GET', `/api/v1/document-attachments?docRef=${encodeURIComponent(ref)}`);
    expect(list.body.data.files).toHaveLength(1);
    const arch = await call(ctx, 'POST', `/api/v1/document-attachments/${a.body.data.id}/archive`, {});
    expect(arch.body.data.archivedAt, JSON.stringify(arch.body)).toBeTruthy();
    expect((await call(ctx, 'GET', `/api/v1/document-attachments?docRef=${encodeURIComponent(ref)}`)).body.data.files).toEqual([]);
    const row = await db.selectFrom('document_attachments').select(['archived_at']).where('id', '=', a.body.data.id).executeTakeFirstOrThrow();
    expect(row.archived_at).not.toBeNull(); // không xoá cứng
  });

  it('ctx.documents.attach trong action; tệp rỗng / loại sai bị từ chối', async () => {
    const att = (await run((c) => c.documents.attach('hop-dong.contract:2', { fileName: 'bao-gia.txt', contentType: 'text/plain', data: Buffer.from('báo giá') }, { kind: 'quote' }))).data;
    expect(att).toMatchObject({ docRef: 'hop-dong.contract:2', kind: 'quote', fileName: 'bao-gia.txt' });
    expect(att).not.toHaveProperty('created');
    await expect(run((c) => c.documents.attach('hop-dong.contract:2', { fileName: 'r.txt', data: Buffer.alloc(0) }))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(run((c) => c.documents.attach('hop-dong.contract:2', { fileName: 'r.txt', data: Buffer.from('x') }, { kind: 'Sai Loai' }))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
