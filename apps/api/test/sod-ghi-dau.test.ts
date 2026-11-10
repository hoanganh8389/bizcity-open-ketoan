// [2026-11-10 10:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — S029-25 đợt 1 (RV-R1-11, DOCUMENT 1.4.0 §5.1, R-WF-17): tách nhiệm ghi dấu (sod: warn); T029-SOD-1…5
/**
 * Quyết định chủ dự án 2026-11-10: người lập tự duyệt chưa bị chặn, chỉ ghi dấu để kế toán trưởng rà.
 *   T029-SOD-1  engine: sod: warn cho chuyển; trong action ghi dòng workflow.sod.self_approve vào notes.audit; allowed() không ghi; ngoài action không ghi
 *   T029-SOD-2  sod: true vẫn chặn; người khác người lập thì không có dấu
 *   T029-SOD-3  duyệt phiếu mua hàng bởi chính người lập (REST thật): duyệt được, bằng chứng có dấu
 *   T029-SOD-4  duyệt phiếu kế toán: nháp người dùng tự lập → có dấu; nháp trợ lý AI đề xuất → không có dấu (STD-MCP-6)
 *   T029-SOD-6  trạm ACC14 (chờ duyệt): người gửi tự định khoản có dấu; chứng từ khoá API gửi thì không
 *   T029-SOD-5  chẩn đoán LEDGER_SELF_APPROVED (cảnh báo) đếm đúng các lần trên, mẫu theo <loại>:<mã>
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseWorkflow, SELF_APPROVE_NOTE } from '@bizcity/platform/core/workflow';
import { runInActionScope, type ActionScope } from '@bizcity/platform/core/audit';
import { LEDGER_DIAGNOSTICS } from '@bizcity/kernel/modules/ledger/ledger.diagnostics';
import { voucherService } from '../src/kernel/public.js';
import type { AuthContext } from '../src/core/auth.js';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

const WF = (sod: string) => parseWorkflow(`type: thu.phieu
states:
  draft: { group: draft }
  approved: { group: approved }
transitions:
  approve: { from: [draft], to: approved, permission: documents:write, ledger: true, sod: ${sod} }
`, 'thu.workflow.yaml');
const actor = (id: string) => ({ id, can: () => true });
const inAction = async <T>(fn: () => T): Promise<[T, ActionScope]> => { const scope: ActionScope = { audit: [] }; const r = await runInActionScope(scope, async () => fn()); return [r, scope]; };

describe('T029-SOD — engine', () => {
  it('T029-SOD-1 sod: warn cho chuyển, ghi dấu trong action; allowed() và ngoài action không ghi', async () => {
    const wf = WF('warn');
    const doc = { id: '42', status: 'draft', createdBy: 'user:1' };
    const [step, scope] = await inAction(() => wf.plan('approve', doc, actor('user:1')));
    expect(step).toMatchObject({ to: 'approved', ledger: true, selfApproved: true });
    expect(scope.audit).toEqual([{ action: SELF_APPROVE_NOTE, objectType: 'thu.phieu', objectId: '42', after: { verb: 'approve', from: 'draft', to: 'approved', createdBy: 'user:1' } }]);
    const [allowed, s2] = await inAction(() => wf.allowed(doc, actor('user:1')));
    expect([allowed, s2.audit]).toEqual([['approve'], []]);
    expect(wf.plan('approve', doc, actor('user:1')).selfApproved).toBe(true); // ngoài action: vẫn cho, không có chỗ ghi
  });

  it('T029-SOD-2 sod: true vẫn chặn; người khác người lập không có dấu', async () => {
    expect(() => WF('true').plan('approve', { status: 'draft', createdBy: 'user:1' }, actor('user:1'))).toThrow(/tách nhiệm/);
    const [step, scope] = await inAction(() => WF('warn').plan('approve', { status: 'draft', createdBy: 'user:1' }, actor('user:2')));
    expect([step.selfApproved, scope.audit]).toEqual([undefined, []]);
  });
});

let ctx: TestCtx;
let tenantId = '';
const notesOf = async (action: string, objectId: string) => {
  const rows = await db.selectFrom('audit_logs').select('after_data').where('tenant_id', '=', tenantId).where('action', '=', action).where('object_id', '=', objectId).where('result_ok', '=', true).execute();
  return rows.flatMap((r) => ((r.after_data as { notes?: { audit?: { action: string }[] } } | null)?.notes?.audit ?? [])).filter((n) => n.action === SELF_APPROVE_NOTE);
};
const diag = () => db.transaction().execute((trx) => LEDGER_DIAGNOSTICS.find((c) => c.code === 'LEDGER_SELF_APPROVED')!.run(trx, { tenantId } as never)) as Promise<{ count: number; sample?: string[] }>;

describe('T029-SOD — luồng thật', () => {
  let purchaseId = '';
  let ownDraft = '';
  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
    expect((await call(ctx, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' })).status).toBe(200);
    await call(ctx, 'PUT', '/api/v1/partners/NCC-SOD', { name: 'NCC tách nhiệm', kind: 'supplier' });
  }, 60_000);
  afterAll(async () => { await ctx.app.close(); });

  it('T029-SOD-3 duyệt phiếu mua hàng bởi chính người lập: được duyệt, bằng chứng có dấu', async () => {
    const line = { lineKey: 'a', sku: '110154035', name: 'Anlene Gold', unit: 'Lon', qty: 2, price: 100000, taxCode: 'V08', lineType: 'buy', lotNo: 'L', expDate: '2028-01-01' };
    const r = await call(ctx, 'POST', '/api/v1/purchase/documents', { kind: 'receipt', outsideOrder: { reason: 'Phép thử' }, docDate: '2026-10-27', branchCode: 'CN-NA', partnerCode: 'NCC-SOD', priceIncludesVat: false, lines: [line] });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    purchaseId = String(r.body.data.id);
    const ok = await call(ctx, 'POST', `/api/v1/purchase/documents/${purchaseId}/approve`);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(await notesOf('mua-hang.purchase.documents-approve', purchaseId)).toEqual([expect.objectContaining({ objectType: 'mua-hang.purchase-document', objectId: purchaseId })]);
  });

  it('T029-SOD-4 duyệt phiếu kế toán: nháp tự lập có dấu; nháp AI đề xuất không có dấu', async () => {
    await call(ctx, 'PUT', '/api/v1/partners/NCC01', { name: 'Nhà cung cấp 01', kind: 'supplier' });
    // Cùng người với token REST: actor = user:<sub> của JWT
    const sub = (JSON.parse(Buffer.from(ctx.token.split('.')[1]!, 'base64url').toString('utf8')) as { sub: string }).sub;
    const me: AuthContext = { tenantId, actor: `user:${sub}`, actorName: 'test', kind: 'user', permissions: new Set(['*']) } as unknown as AuthContext;
    const voucher = { docType: 'manual', branchCode: 'CN01', docDate: '2026-10-08', description: 'Tự lập', partnerCode: 'NCC01', docNo: 'PK-SOD-1', lines: [{ debitAccount: '64211', creditAccount: '335', amount: 1000 }] };
    const d = await db.transaction().execute((trx) => voucherService.draftIn(trx, me, voucher as never));
    ownDraft = d.docKey;
    const ok = await call(ctx, 'POST', `/api/v1/vouchers/${d.id}/approve`, {});
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(await notesOf('accounting.journal.approve', d.docKey)).toHaveLength(1);

    // Nháp do trợ lý AI đề xuất (MCP) rồi người dùng duyệt: luồng chuẩn, không phải tự duyệt
    let seq = 0;
    const tool = async (args: unknown, meta?: unknown) => (await ctx.app.inject({ method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${ctx.token}` },
      payload: { jsonrpc: '2.0', id: ++seq, method: 'tools/call', params: { name: 'accounting.journal.post', arguments: args, ...(meta ? { _meta: meta } : {}) } } as never })).json().result;
    const args = { voucher: { ...voucher, docNo: 'PK-SOD-AI', description: 'AI đề xuất' } };
    const p = await tool(args);
    await tool(args, { confirm_token: p.structuredContent.data.confirm_token, client: 'claude' });
    const ev = await db.selectFrom('accounting_events').select(['id', 'doc_key', 'created_by']).where('tenant_id', '=', tenantId).where('doc_no', '=', 'PK-SOD-AI').executeTakeFirstOrThrow();
    expect(ev.created_by).toBe(me.actor);
    expect((await call(ctx, 'POST', `/api/v1/vouchers/${ev.id}/approve`, {})).status).toBe(200);
    expect(await notesOf('accounting.journal.approve', ev.doc_key)).toEqual([]);
  });

  // [2026-11-10 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — S029-25 đợt 1b: trạm ACC14
  it('T029-SOD-6 trạm ACC14 (chế độ chờ duyệt): người gửi tự định khoản có dấu; chứng từ khoá API gửi thì không', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/settings/posting-modes', { sale: 'approve' })).status).toBe(200);
    const mine = await call(ctx, 'POST', '/api/v1/documents', saleDoc({ docKey: 'pos:CN01:SOD-U', docNo: 'SOD-U', docDate: '2026-10-09' }));
    const viaKey = await call(ctx, 'POST', '/api/v1/documents', saleDoc({ docKey: 'pos:CN01:SOD-K', docNo: 'SOD-K', docDate: '2026-10-09' }), { authorization: '', 'x-api-key': ctx.apiKey });
    expect([mine.status, viaKey.status], JSON.stringify([mine.body, viaKey.body])).toEqual([200, 200]);
    const evs = await db.selectFrom('accounting_events').select(['id', 'doc_key', 'status', 'created_by']).where('tenant_id', '=', tenantId).where('doc_key', 'in', ['pos:CN01:SOD-U', 'pos:CN01:SOD-K']).execute();
    expect(evs.map((e) => e.status)).toEqual(['pending', 'pending']);
    const st = await call(ctx, 'POST', '/api/v1/documents/post', { ids: evs.map((e) => e.id) });
    expect(st.status, JSON.stringify(st.body)).toBe(200);
    expect(st.body.data.posted).toBe(2);
    const rows = await db.selectFrom('audit_logs').select('after_data').where('tenant_id', '=', tenantId).where('action', '=', 'core.document.post-many').where('result_ok', '=', true).execute();
    const notes = rows.flatMap((r) => ((r.after_data as { notes?: { audit?: { action: string; objectId?: string }[] } } | null)?.notes?.audit ?? [])).filter((n) => n.action === SELF_APPROVE_NOTE);
    expect(notes.map((n) => n.objectId)).toEqual(['pos:CN01:SOD-U']);
  });

  it('T029-SOD-5 chẩn đoán LEDGER_SELF_APPROVED đếm đúng ba lần tự duyệt', async () => {
    const r = await diag();
    expect(r.count).toBe(3);
    expect([...(r.sample ?? [])].sort()).toEqual([`accounting.journal:${ownDraft}`, `mua-hang.purchase-document:${purchaseId}`, 'document.sale:pos:CN01:SOD-U'].sort());
    const check = LEDGER_DIAGNOSTICS.find((c) => c.code === 'LEDGER_SELF_APPROVED')!;
    expect([check.level, check.layer]).toEqual(['warn', 'L3']);
  });
});
