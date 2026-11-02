/**
 * Lớp Doanh nghiệp của Conformance Engine (ADR-0012; PHASE-020 S020-19, Q020-6):
 *   - INVENTORY_NEGATIVE: tồn âm cuối ngày theo mặt hàng × kho, số dư luỹ kế cả lịch sử trước kỳ; bổ sung phiếu nhập thì hết;
 *   - PERIOD_CLOSE_OPEN: tháng đã qua quá 30 ngày thiếu gia-von / ket-chuyen / khoa-so, giá vốn tính lại sau kết chuyển ⇒ thu-tu;
 *     tháng cần kết chuyển đọc từ bộ quy tắc mặc định khi đơn vị chưa lưu bộ riêng (không viết số tài khoản);
 *   - mức warn: không chặn khoá kỳ (chỉ lỗi mức error mới chặn, R-DIAG-4); không tự chạy việc cuối kỳ;
 *   - Engine: ca C09 lấy bằng chứng từ hai kiểm này; layer_results trả lời riêng ba câu hỏi; draft ⇒ không ca nào PASS.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { runDiagnostics } from '../src/modules/system/diagnostics.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

type Case = { id: string; status: string; reason: string; evidence: string[]; layer: string | null };
type Run = { result: string; cases: Case[]; report?: unknown };

let ctx: TestCtx;
let tenantId = '';
const post = (doc: unknown) => call(ctx, 'POST', '/api/v1/documents', doc);
const purchase = (key: string, date: string, qty: number) => ({
  docType: 'purchase', docKey: key, branchCode: 'CN01', docNo: key, docDate: date,
  partner: { code: 'NCC-01', name: 'Nhà cung cấp 01' },
  lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty, amountBeforeTax: qty * 60000, taxCode: 'V08', taxAmount: 0 }],
  totals: { beforeTax: qty * 60000, tax: 0, total: qty * 60000 },
});
const sale = (key: string, date: string, qty: number) => ({
  docType: 'sale', docKey: key, branchCode: 'CN01', docNo: key, docDate: date,
  lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty, amountBeforeTax: qty * 100000, taxCode: 'R08', taxAmount: qty * 8000 }],
  payments: [{ methodCode: 'TM', amount: qty * 108000 }],
  totals: { beforeTax: qty * 100000, tax: qty * 8000, total: qty * 108000 },
});
const diag = async (code: string, scope: { from?: string; to?: string } = {}) =>
  (await runDiagnostics({ tenantId, ...scope }, { layer: 'L3', codes: [code] })).checks[0]!;
const costing = (period: string) => call(ctx, 'POST', '/api/v1/inventory/costing', { period });
const closing = (period: string) => call(ctx, 'POST', '/api/v1/closing/run', { period, branchCodes: ['CN01'] });
const conformance = async () => {
  const r = await call<{ data: Run & { id: string } }>(ctx, 'POST', '/api/v1/conformance/runs', { asOf: '2026-11-02' });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  const row = await db.selectFrom('conformance_runs').select(['report', 'layers']).where('id', '=', r.body.data.id).executeTakeFirstOrThrow();
  return { ...r.body.data, layers: row.layers, report: row.report as { layer_results: Record<string, string>; result: string; cases: Case[] } };
};

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Conformance Engine — lớp Doanh nghiệp (trước khi có dữ liệu)', () => {
  it('chưa khai hồ sơ: ca C09 REVIEW_REQUIRED (loại pháp nhân chưa biết), có đủ ba lớp trong lượt', async () => {
    const r = await conformance();
    expect(r.layers).toEqual(['module', 'configuration', 'enterprise']);
    const c09 = r.report.cases.filter((c) => c.id.startsWith('vn.enterprise-period-vn.'));
    expect(c09).toHaveLength(4);
    for (const c of c09) expect(c).toMatchObject({ status: 'REVIEW_REQUIRED', layer: 'enterprise' });
    expect(Object.keys(r.report.layer_results).sort()).toEqual(['configuration', 'enterprise', 'module']);
  });

  it('khai TT99 (trước khi khoá kỳ nào — hồ sơ không được hiệu lực vào kỳ đã khoá): chưa có hàng thì tồn kho "đạt rỗng", không tính là đạt', async () => {
    expect((await call(ctx, 'POST', '/api/v1/accounting/profile/publish', { effectiveFrom: '2026-01-01', fiscalYearStartMonth: 1, regime: 'vn-tt99-2025', entityType: 'enterprise', note: 'Khai hồ sơ cho lớp Doanh nghiệp' })).status).toBe(201);
    const inv = (await conformance()).report.cases.find((c) => c.id.startsWith('vn.enterprise-period-vn.inventory.'))!;
    expect(inv.evidence.join(' ')).toMatch(/DG-INV-1: đạt rỗng/);
    expect(inv.reason).toMatch(/kỹ thuật: NOT_TESTED/);
  });
});

describe('INVENTORY_NEGATIVE — tồn kho âm theo mặt hàng × kho × ngày', () => {
  it('bán trước khi nhập: báo ngày âm đầu tiên; kỳ sau ngày âm thì không báo; bổ sung phiếu nhập thì hết', async () => {
    expect((await post(sale('BAN-0303', '2026-03-03', 2))).body.data.status).toBe('posted');
    expect((await post(purchase('NHAP-0305', '2026-03-05', 5))).body.data.status).toBe('posted');

    const neg = await diag('INVENTORY_NEGATIVE');
    expect(neg).toMatchObject({ level: 'warn', count: 1 });
    expect(neg.sample[0]).toMatch(/^CN01:.+:SUA01@2026-03-03$/);

    // Kỳ từ 04/03: số dư luỹ kế mang từ trước (−2 + 5 = 3) không âm ⇒ không báo, dù lịch sử trước kỳ có âm.
    expect(await diag('INVENTORY_NEGATIVE', { from: '2026-03-04' })).toMatchObject({ level: 'pass', count: 0 });

    // Phiếu nhập về trước ngày bán: hết âm. Kiểm chỉ đọc — không tự điều chỉnh gì.
    expect((await post(purchase('NHAP-0301', '2026-03-01', 2))).body.data.status).toBe('posted');
    expect(await diag('INVENTORY_NEGATIVE')).toMatchObject({ level: 'pass', count: 0 });
  });
});

describe('PERIOD_CLOSE_OPEN — việc cuối kỳ theo thứ tự', () => {
  it('tháng 03/2026: thiếu cả ba ⇒ giá vốn ⇒ kết chuyển ⇒ tính lại giá vốn (thu-tu) ⇒ kết chuyển lại ⇒ khoá: hết', async () => {
    expect((await diag('PERIOD_CLOSE_OPEN')).sample).toEqual(['CN01:2026-03:gia-von+ket-chuyen+khoa-so']);

    expect((await costing('2026-03')).status).toBe(200);
    expect((await diag('PERIOD_CLOSE_OPEN')).sample).toEqual(['CN01:2026-03:ket-chuyen+khoa-so']);

    const closed = await closing('2026-03');
    expect(closed.status, JSON.stringify(closed.body)).toBe(200);
    expect(closed.body.data[0].status).toBe('posted');
    expect((await diag('PERIOD_CLOSE_OPEN')).sample).toEqual(['CN01:2026-03:khoa-so']);

    // Thêm phiếu nhập trong tháng rồi tính lại giá vốn: kết chuyển cũ lỗi thời ⇒ thu-tu.
    expect((await post(purchase('NHAP-0320', '2026-03-20', 1))).body.data.status).toBe('posted');
    expect((await costing('2026-03')).status).toBe(200);
    expect((await diag('PERIOD_CLOSE_OPEN')).sample).toEqual(['CN01:2026-03:thu-tu+khoa-so']);
    expect((await closing('2026-03')).body.data[0].status).toBe('posted');
    expect((await diag('PERIOD_CLOSE_OPEN')).sample).toEqual(['CN01:2026-03:khoa-so']);

    // Mức warn không chặn khoá kỳ: khoá là quyết định của người dùng.
    expect((await call(ctx, 'POST', '/api/v1/periods/locks', { year: 2026, month: 3 })).status).toBe(200);
    expect(await diag('PERIOD_CLOSE_OPEN')).toMatchObject({ level: 'pass', count: 0 });
  });

  it('kỳ chưa qua 30 ngày sau cuối tháng thì chưa xét', async () => {
    const today = new Date().toISOString().slice(0, 10);
    expect((await post(sale('BAN-HOMNAY', today, 1))).body.data.status).toBe('posted');
    const d = await diag('PERIOD_CLOSE_OPEN', { from: `${today.slice(0, 7)}-01` });
    expect(d).toMatchObject({ examined: 0, count: 0 });
  });
});

describe('Conformance Engine — lớp Doanh nghiệp (sau khi có dữ liệu)', () => {
  it('bằng chứng từ kiểm L3; tồn âm ⇒ ca tồn kho FAIL, lớp Doanh nghiệp FAIL, các lớp khác giữ kết quả riêng', async () => {
    let r = await conformance();
    const inv = (x: typeof r) => x.report.cases.find((c) => c.id.startsWith('vn.enterprise-period-vn.inventory.'))!;
    const close = r.report.cases.find((c) => c.id.startsWith('vn.enterprise-period-vn.closing.'))!;
    expect(inv(r).evidence).toContain('DG-INV-1: pass');
    expect(inv(r).status).toBe('REVIEW_REQUIRED'); // đạt kỹ thuật nhưng rulepack còn draft: không PASS
    expect(close.evidence).toContain('DG-CLOSE-1: pass');

    expect((await post(sale('BAN-0402', '2026-04-02', 100))).body.data.status).toBe('posted');
    r = await conformance();
    expect(inv(r).status).toBe('FAIL');
    expect(inv(r).evidence.join(' ')).toMatch(/DG-INV-1: có phát hiện \(lớp Doanh nghiệp\)/);
    expect(r.report.layer_results.enterprise).toBe('FAIL');
    expect(r.report.layer_results.module).not.toBe('FAIL');
    expect(r.report.result).toBe('FAIL');
    expect(r.report.cases.filter((c) => c.status === 'PASS')).toEqual([]);
  });
});
