/**
 * Màn Kiểm chuẩn, Posting Gate, lịch đêm (ADR-0012; PHASE-020 S020-20, S020-21):
 *   - core.conformance.list: các lượt gần đây, mới trước, có kết quả theo lớp; latest có ca kèm tên, lớp, căn cứ (điều khoản + trạng thái rà);
 *   - core.conformance.advisories: chứng từ (?date) — hồ sơ chưa khai cho ngày đó; kỳ (?year&month) — tồn kho âm, việc cuối kỳ còn thiếu
 *     của đúng tháng (không tính khoá sổ, không chờ 30 ngày); chỉ đọc, không chặn ghi sổ;
 *   - core.conformance.acknowledge: người xác nhận tiếp tục ⇒ một dòng bằng chứng; khoá API / AI không xác nhận thay;
 *     kỳ cần quyền khoá kỳ + lý do ≥ 10 ký tự;
 *   - lịch đêm: bizcity.clock.daily ⇒ một lượt Kiểm chuẩn / đơn vị / ngày, actor system:nightly.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { dispatchOnce, tickClock } from '../src/core/events.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const post = (doc: unknown) => call(ctx, 'POST', '/api/v1/documents', doc);
const sale = (key: string, date: string, qty: number) => ({
  docType: 'sale', docKey: key, branchCode: 'CN01', docNo: key, docDate: date,
  lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty, amountBeforeTax: qty * 100000, taxCode: 'R08', taxAmount: qty * 8000 }],
  payments: [{ methodCode: 'TM', amount: qty * 108000 }],
  totals: { beforeTax: qty * 100000, tax: qty * 8000, total: qty * 108000 },
});
type Adv = { code: string; title: string; why: string; count: number; sample: string[] };
const advisories = async (q: string) => {
  const r = await call<{ data: { context: Record<string, unknown>; advisories: Adv[]; latestRun: unknown } }>(ctx, 'GET', `/api/v1/conformance/advisories?${q}`);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data;
};
const codes = (a: { advisories: Adv[] }) => a.advisories.map((x) => x.code).sort();
const ack = (body: unknown, headers: Record<string, string> = {}) => call(ctx, 'POST', '/api/v1/conformance/advisories/ack', body, headers);

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Màn Kiểm chuẩn — dữ liệu', () => {
  it('list: các lượt mới trước, kết quả theo lớp; latest: ca có tên, lớp, rulepack, căn cứ điều khoản', async () => {
    expect((await call(ctx, 'GET', '/api/v1/conformance/runs')).body.data).toEqual([]);
    for (const asOf of ['2026-10-01', '2026-11-02']) expect((await call(ctx, 'POST', '/api/v1/conformance/runs', { asOf })).status).toBe(201);
    const list = (await call(ctx, 'GET', '/api/v1/conformance/runs?limit=5')).body.data as { asOf: string; layerResults: Record<string, string>; actor: string }[];
    expect(list.map((r) => r.asOf)).toEqual(['2026-11-02', '2026-10-01']);
    expect(Object.keys(list[0]!.layerResults).sort()).toEqual(['configuration', 'enterprise', 'module']);

    const latest = (await call(ctx, 'GET', '/api/v1/conformance/runs/latest')).body.data;
    expect(Object.keys(latest.layerResults).sort()).toEqual(['configuration', 'enterprise', 'module']);
    expect(latest.rulepacks.map((p: { id: string }) => p.id)).toContain('enterprise-period-vn');
    const inv = latest.cases.find((c: { id: string }) => c.id.startsWith('vn.enterprise-period-vn.inventory.'));
    expect(inv).toMatchObject({ layer: 'enterprise', rulepack: 'enterprise-period-vn', title: expect.stringMatching(/tồn kho âm/i) });
    expect(inv.legal_basis[0]).toMatchObject({ source_id: 'vn.decision.149-2001-qd-btc', provision_ref: 'VAS 02', review_status: 'pending' });
  });
});

describe('Posting Gate — cảnh báo, không chặn', () => {
  it('chứng từ: chưa khai hồ sơ ⇒ cảnh báo PROFILE_DECLARED; khai rồi thì hết cho ngày có hiệu lực, còn cho ngày trước đó', async () => {
    const before = await advisories('date=2026-03-05');
    expect(before.context).toMatchObject({ kind: 'document', date: '2026-03-05' });
    expect(codes(before)).toContain('PROFILE_DECLARED');
    expect(before.latestRun).not.toBeNull();

    expect((await call(ctx, 'POST', '/api/v1/accounting/profile/publish', { effectiveFrom: '2026-01-01', fiscalYearStartMonth: 1, regime: 'vn-tt99-2025', entityType: 'enterprise', note: 'Khai hồ sơ cho Posting Gate' })).status).toBe(201);
    expect(codes(await advisories('date=2026-03-05'))).not.toContain('PROFILE_DECLARED');
    expect(codes(await advisories('date=2025-12-31'))).toContain('PROFILE_DECLARED');

    // Có cảnh báo vẫn ghi sổ được: cảnh báo không bao giờ thành từ chối.
    expect((await post(sale('BAN-1231', '2025-12-31', 1))).body.data.status).toBe('posted');
  });

  it('kỳ: tồn kho âm + việc cuối kỳ còn thiếu của đúng tháng (không có khoa-so); tháng khác không bị kéo theo', async () => {
    expect((await post(sale('BAN-0303', '2026-03-03', 2))).body.data.status).toBe('posted');
    const mar = await advisories('year=2026&month=3');
    expect(mar.context).toMatchObject({ kind: 'period', year: 2026, month: 3 });
    expect(codes(mar)).toEqual(expect.arrayContaining(['INVENTORY_NEGATIVE', 'PERIOD_CLOSE_OPEN']));
    expect(mar.advisories.find((a) => a.code === 'PERIOD_CLOSE_OPEN')!.sample).toEqual(['CN01:2026-03:gia-von+ket-chuyen']);
    expect(codes(await advisories('year=2026&month=4'))).toEqual([]);
    expect(codes(await advisories('year=2026&month=3&branchCode=CN01'))).toContain('PERIOD_CLOSE_OPEN');
    expect((await call(ctx, 'GET', '/api/v1/conformance/advisories?year=2026')).status).toBe(400);
  });
});

describe('Xác nhận cảnh báo = bằng chứng', () => {
  it('người đăng nhập xác nhận tiếp tục ghi chứng từ ⇒ một dòng audit_logs có mã cảnh báo, chứng từ, người', async () => {
    const r = await ack({ context: { kind: 'document', docType: 'manual', docDate: '2025-12-31', docNo: 'PK0001' }, codes: ['PROFILE_DECLARED'] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toEqual({ acknowledged: true, codes: ['PROFILE_DECLARED'], context: 'document:manual:PK0001' });
    const row = await db.selectFrom('audit_logs').select(['actor_kind', 'object_type', 'object_id', 'after_data', 'result_ok'])
      .where('tenant_id', '=', tenantId).where('action', '=', 'core.conformance.acknowledge').orderBy('id', 'desc').executeTakeFirstOrThrow();
    expect(row).toMatchObject({ actor_kind: 'user', object_type: 'conformance_advisory', object_id: 'document:manual:PK0001', result_ok: true });
    expect(JSON.stringify(row.after_data)).toContain('PROFILE_DECLARED');
  });

  it('định khoản hàng loạt (ACC14): một dòng bằng chứng cho cả lô, kèm danh sách khoá chứng từ', async () => {
    const r = await ack({ context: { kind: 'documents', docKeys: ['pos:CN01:A1', 'pos:CN01:A2'], from: '2025-12-30', to: '2025-12-31' }, codes: ['PROFILE_DECLARED'] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.context).toBe('documents:2:2025-12-30..2025-12-31');
    const row = await db.selectFrom('audit_logs').select(['object_id', 'after_data']).where('tenant_id', '=', tenantId)
      .where('action', '=', 'core.conformance.acknowledge').orderBy('id', 'desc').executeTakeFirstOrThrow();
    expect(row.object_id).toBe('documents:2:2025-12-30..2025-12-31');
    expect(JSON.stringify(row.after_data)).toContain('pos:CN01:A2');
  });

  it('khoá API không xác nhận thay người', async () => {
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/v1/conformance/advisories/ack', headers: { 'x-api-key': ctx.apiKey, 'idempotency-key': `t-${Date.now()}` },
      payload: { context: { kind: 'document', docType: 'sale', docDate: '2026-03-03' }, codes: ['PROFILE_DECLARED'] } as never,
    });
    expect(res.statusCode).toBe(403);
  });

  it('kỳ: thiếu lý do ⇒ 400; có lý do ⇒ ghi bằng chứng; khoá kỳ vẫn do API khoá kỳ quyết, không đổi', async () => {
    const ctxPeriod = { kind: 'period', year: 2026, month: 3 };
    expect((await ack({ context: ctxPeriod, codes: ['INVENTORY_NEGATIVE'] })).status).toBe(400);
    const ok = await ack({ context: ctxPeriod, codes: ['PERIOD_CLOSE_OPEN', 'INVENTORY_NEGATIVE'], note: 'Đã biết tồn âm, bổ sung phiếu nhập ở kỳ sau' });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ context: 'period:2026-03', codes: ['INVENTORY_NEGATIVE', 'PERIOD_CLOSE_OPEN'] });
    expect((await call(ctx, 'POST', '/api/v1/periods/locks', { year: 2026, month: 3 })).status).toBe(200);
  });
});

describe('Lịch đêm', () => {
  it('bizcity.clock.daily ⇒ một lượt Kiểm chuẩn cho đơn vị, ngày đánh giá = ngày đồng hồ, actor system:nightly; chạy lại không thêm', async () => {
    const at = new Date('2027-01-14T19:30:00Z'); // 02:30 ngày 15/01/2027 giờ VN
    await tickClock(at, { tenantIds: [tenantId] });
    for (let i = 0; i < 30; i++) {
      await dispatchOnce();
      const d = await db.selectFrom('event_deliveries').select('status').where('tenant_id', '=', tenantId).where('consumer', '=', 'core.conformance-nightly').execute();
      if (d.length && d.every((x) => x.status !== 'pending')) break;
    }
    const runs = await db.selectFrom('conformance_runs').select(['as_of', 'actor', 'layers']).where('tenant_id', '=', tenantId).where('actor', '=', 'system:nightly').execute();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ actor: 'system:nightly', layers: ['module', 'configuration', 'enterprise'] });
    expect(new Date(runs[0]!.as_of).toISOString().slice(0, 10)).toBe('2027-01-15');
    expect(await tickClock(at, { tenantIds: [tenantId] })).toBe(0);
  });
});
