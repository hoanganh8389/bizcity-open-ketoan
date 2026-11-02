/**
 * Duyệt rulepack tại bản cài (ADR-0016; PHASE-020):
 *   - chủ đơn vị / kế toán trưởng (conformance:approve) tự duyệt một rulepack nháp; kế toán viên, khoá API không duyệt được;
 *   - lượt duyệt còn hiệu lực ⇒ ca của rulepack được kết luận theo bằng chứng (PASS / FAIL / NOT_TESTED), approval = local,
 *     approvalBasis = local; nhãn PASS (nếu có) là "Đạt theo duyệt của đơn vị", không phải nhãn Bizcity;
 *   - lệch băm nội dung (cập nhật gói rulepack) ⇒ lượt duyệt hết hiệu lực, ca trở lại REVIEW_REQUIRED; thu hồi cũng vậy;
 *   - miền thuế / hoá đơn cần người duyệt thuế; bảng chỉ thêm.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const PACK = 'enterprise-period-vn';
type State = { id: string; version: string; upstreamStatus: string; hash: string; local: null | { action: string; effective: boolean; stale: boolean; accountingReviewer: string | null } };
type Case = { id: string; status: string; reason: string; approval?: string | null };
const states = async () => (await call<{ data: State[] }>(ctx, 'GET', '/api/v1/conformance/rulepacks')).body.data;
const stateOf = async () => (await states()).find((s) => s.id === PACK)!;
const run = async () => {
  const r = await call(ctx, 'POST', '/api/v1/conformance/runs', { asOf: new Date().toISOString().slice(0, 10) });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.data as { approvalBasis: string; label: string; cases: Case[] };
};
const approve = (body: Record<string, unknown>, headers: Record<string, string> = {}) => call(ctx, 'POST', '/api/v1/conformance/rulepacks/approve', { rulepackId: PACK, ...body }, headers);
const today = new Date().toISOString().slice(0, 10);
const doc = (docType: 'purchase' | 'sale', key: string, qty: number) => ({
  docType, docKey: key, branchCode: 'CN01', docNo: key, docDate: today,
  ...(docType === 'purchase' ? { partner: { code: 'NCC-01', name: 'Nhà cung cấp 01' } } : { payments: [{ methodCode: 'TM', amount: qty * 108000 }] }),
  lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty, amountBeforeTax: qty * 100000, taxCode: docType === 'purchase' ? 'V08' : 'R08', taxAmount: docType === 'purchase' ? 0 : qty * 8000 }],
  totals: { beforeTax: qty * 100000, tax: docType === 'purchase' ? 0 : qty * 8000, total: qty * (docType === 'purchase' ? 100000 : 108000) },
});

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  expect((await call(ctx, 'POST', '/api/v1/accounting/profile/publish', { effectiveFrom: `${today.slice(0, 4)}-01-01`, fiscalYearStartMonth: 1, regime: 'vn-tt99-2025', entityType: 'enterprise', note: 'Khai hồ sơ cho duyệt tại đơn vị' })).status).toBe(201);
  // Có hàng nhập trước rồi mới bán: tồn kho không âm ⇒ DG-INV-1 đạt có dữ liệu.
  expect((await call(ctx, 'POST', '/api/v1/documents', doc('purchase', 'NHAP-1', 5))).body.data.status).toBe('posted');
  expect((await call(ctx, 'POST', '/api/v1/documents', doc('sale', 'BAN-1', 2))).body.data.status).toBe('posted');
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Duyệt rulepack tại bản cài', () => {
  it('danh sách: rulepack nháp ở thượng nguồn, chưa duyệt tại đơn vị; chưa duyệt thì ca REVIEW_REQUIRED', async () => {
    expect(await stateOf()).toMatchObject({ upstreamStatus: 'draft', local: null, hash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) });
    const inv = (await run()).cases.find((c) => c.id.startsWith('vn.enterprise-period-vn.inventory.'))!;
    expect(inv).toMatchObject({ status: 'REVIEW_REQUIRED', approval: null });
  });

  it('thiếu người duyệt / lý do ⇒ 400; khoá API ⇒ 403; kế toán viên không có quyền duyệt', async () => {
    expect((await approve({ accountingReviewer: 'A', note: 'ngắn' })).status).toBe(400);
    const key = await ctx.app.inject({ method: 'POST', url: '/api/v1/conformance/rulepacks/approve', headers: { 'x-api-key': ctx.apiKey, 'idempotency-key': `k-${Date.now()}` }, payload: { rulepackId: PACK, accountingReviewer: 'Nguyễn Văn A', note: 'Đã rà 4 ca lớp Doanh nghiệp' } as never });
    expect(key.statusCode).toBe(403);
    expect((await call(ctx, 'POST', '/api/v1/users', { email: 'ktv@ketoan.local', fullName: 'Kế toán viên', role: 'accountant', password: 'Ktv@12345' })).status).toBe(201);
    const login = (await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email: 'ktv@ketoan.local', password: 'Ktv@12345' } })).json();
    expect((await approve({ accountingReviewer: 'Nguyễn Văn A', note: 'Đã rà 4 ca lớp Doanh nghiệp' }, { authorization: `Bearer ${login.data.token}` })).status).toBe(403);
  });

  it('chủ đơn vị duyệt ⇒ ca kết luận theo bằng chứng, approval local, approvalBasis local, không nhãn Bizcity', async () => {
    const r = await approve({ accountingReviewer: 'Nguyễn Văn A — kế toán trưởng', note: 'Đã rà 4 ca lớp Doanh nghiệp, ngưỡng nội bộ theo quy chế công ty' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await stateOf()).toMatchObject({ local: { action: 'approve', effective: true, stale: false, accountingReviewer: 'Nguyễn Văn A — kế toán trưởng' } });
    const d = await run();
    const inv = d.cases.find((c) => c.id.startsWith('vn.enterprise-period-vn.inventory.'))!;
    expect(inv).toMatchObject({ status: 'PASS', approval: 'local' });
    expect(inv.reason).toMatch(/duyệt tại đơn vị: Nguyễn Văn A/);
    for (const c of d.cases.filter((x) => x.id.startsWith('vn.enterprise-period-vn.'))) expect(c.status).not.toBe('REVIEW_REQUIRED');
    expect(d.approvalBasis).toBe('local');
    expect(d.label).not.toMatch(/Bizcity/);
    const ev = await db.selectFrom('audit_logs').select(['object_type', 'object_id', 'actor_kind']).where('tenant_id', '=', tenantId).where('action', '=', 'core.conformance.approve').executeTakeFirstOrThrow();
    expect(ev).toMatchObject({ object_type: 'rulepack_approval', actor_kind: 'user' });
  });

  it('lệch băm (gói rulepack đã cập nhật) ⇒ lượt duyệt hết hiệu lực, ca về REVIEW_REQUIRED', async () => {
    const s = await stateOf();
    await sql`INSERT INTO rulepack_approvals (tenant_id, rulepack_id, rulepack_version, rulepack_hash, action, accounting_reviewer, note, actor)
              VALUES (${tenantId}, ${PACK}, ${s.version}, ${'sha256:' + '0'.repeat(64)}, 'approve', 'Người duyệt bản cũ', 'Lượt duyệt của nội dung cũ', 'user:test')`.execute(db);
    expect(await stateOf()).toMatchObject({ local: { effective: false, stale: true } });
    const inv = (await run()).cases.find((c) => c.id.startsWith('vn.enterprise-period-vn.inventory.'))!;
    expect(inv).toMatchObject({ status: 'REVIEW_REQUIRED', approval: null });
  });

  it('duyệt lại rồi thu hồi ⇒ ca về REVIEW_REQUIRED; bảng chỉ thêm', async () => {
    expect((await approve({ accountingReviewer: 'Nguyễn Văn A', note: 'Duyệt lại theo nội dung đang nạp' })).status).toBe(200);
    expect((await call(ctx, 'POST', '/api/v1/conformance/rulepacks/revoke', { rulepackId: PACK, note: 'Chờ kế toán trưởng mới rà lại' })).status).toBe(200);
    expect(await stateOf()).toMatchObject({ local: { action: 'revoke', effective: false } });
    expect((await run()).cases.find((c) => c.id.startsWith('vn.enterprise-period-vn.inventory.'))!.status).toBe('REVIEW_REQUIRED');
    expect((await call(ctx, 'POST', '/api/v1/conformance/rulepacks/revoke', { rulepackId: PACK, note: 'Thu hồi lần nữa thì không có gì' })).status).toBe(409);
    await expect(sql`UPDATE rulepack_approvals SET note = 'x' WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/không sửa/);
  });

  it('miền thuế / hoá đơn: thiếu người duyệt thuế thì lượt duyệt không có hiệu lực (bộ đánh giá)', async () => {
    const engine = path.resolve(__dirname, '../../../packages/vn-rulepacks/engine.mjs');
    const { localApproval, packHash } = (await import(pathToFileURL(engine).href)) as { localApproval: (a: Map<string, unknown>, p: unknown) => unknown; packHash: (p: unknown) => string };
    const pack = { id: 'vat-test', version: '0.1.0', domain: 'tax', _cases: [] };
    const base = { version: '0.1.0', hash: packHash(pack), accounting_reviewer: 'Kế toán A', approved_at: '2026-11-02' };
    expect(localApproval(new Map([['vat-test', { ...base, tax_reviewer: null }]]), pack)).toBeNull();
    expect(localApproval(new Map([['vat-test', { ...base, tax_reviewer: 'Đại lý thuế B' }]]), pack)).not.toBeNull();
  });
});
