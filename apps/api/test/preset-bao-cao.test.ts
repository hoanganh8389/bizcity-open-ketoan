// [2026-11-16 09:03 AM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-6 (B4, chữ chốt PHASE-036 · 00 §13): T036-1 — nạp gói thuong-mai-ban-le 1.1 trên đơn vị sạch → báo cáo đích có số, đối chiếu L3 đạt, chạy lại thêm 0 dòng sổ
/**
 * T036-1. Dữ liệu trong test là gói mẫu hư cấu (presets/thuong-mai-ban-le). Báo cáo gọi đúng API của màn đích
 * (mã màn ở PHASE-036 · 00 §5; ACC55 sổ quỹ, BH04 lãi gộp, ACC29 sổ tài sản — §5 cũ ghi nhầm ACC80 / BH05 / ACC28, cả ba vẫn được gọi).
 * Đối chiếu kế toán bằng mã chẩn đoán L3 (cùng ý scripts/doi-chieu-ke-toan.sql, chạy trên mọi bản cài — docs/ops/DIAGNOSTICS.md §2a).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { runDiagnostics } from '../src/modules/system/diagnostics.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

const PRESET = 'thuong-mai-ban-le';
let ctx: TestCtx;
let tenantId = '';
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
const monthStart = (back: number) => { const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))]; const k = y * 12 + m - 1 - back; return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}-01`; };
const FROM = monthStart(2);

type Run = { status: string; steps: { key: string; total: number; written: number; skipped: number; failed: number; firstError: unknown }[] };
async function applyAndWait(key: string): Promise<Run> {
  const a = await call(ctx, 'POST', `/api/v1/setup/presets/${PRESET}/apply`, {}, { 'idempotency-key': key });
  expect(a.status, JSON.stringify(a.body)).toBe(202);
  for (let i = 0; i < 1500; i++) {
    const r = await call(ctx, 'GET', `/api/v1/setup/runs/${a.body.data.runId}`);
    if (r.body.data.status !== 'running') return r.body.data as Run;
    await new Promise((res) => setTimeout(res, 200));
  }
  throw new Error('lần chạy không xong');
}
const ledgerLines = async () => Number((await sql<{ n: string }>`SELECT count(*) AS n FROM ledger_lines WHERE tenant_id = ${tenantId}`.execute(db)).rows[0]!.n);

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
}, 60_000);
afterAll(async () => { await ctx.app.close(); });

describe('T036-1 — gói thuong-mai-ban-le 1.1 trên đơn vị sạch', () => {
  it('nạp xong không mục nào lỗi; khối cuối kỳ chạy', async () => {
    const run = await applyAndWait('t036-1');
    expect(run.status).toBe('done');
    for (const s of run.steps) expect(s.failed, `${s.key}: ${JSON.stringify(s.firstError)}`).toBe(0);
    expect(run.steps.map((s) => s.key)).toEqual(['settings', 'branches', 'partners', 'products', 'openings', 'documents', 'assets', 'close']);
    expect(run.steps.find((s) => s.key === 'close')!.written).toBeGreaterThan(0);
    const notPosted = await sql<{ n: string }>`SELECT count(*) AS n FROM accounting_events WHERE tenant_id = ${tenantId} AND status <> 'posted'`.execute(db);
    expect(Number(notPosted.rows[0]!.n)).toBe(0);
  }, 300_000);

  it('đối chiếu L3: sổ cân, công nợ ↔ 131 / 331, thuế đầu vào ↔ sổ hoá đơn, kho ↔ 156, làm tròn', async () => {
    const codes = ['LEDGER_BALANCED', 'DEBT_MATCH_LEDGER', 'VAT_INPUT_INVOICE_MATCH', 'INVENTORY_LEDGER_MISMATCH', 'LEDGER_ROUNDING'];
    const rep = await runDiagnostics({ tenantId, from: monthStart(3), to: today }, { layer: 'L3', codes });
    for (const c of rep.checks) expect(['pass', 'empty'], `${c.code}: ${c.level} ${c.count} ${JSON.stringify(c.sample)}`).toContain(c.level);
    expect(rep.checks.map((c) => c.code).sort()).toEqual([...codes].sort());
  });

  it('báo cáo đích có số', async () => {
    const get = async (path: string) => {
      const r = await call(ctx, 'GET', path);
      expect(r.status, `${path}: ${JSON.stringify(r.body).slice(0, 300)}`).toBe(200);
      return r.body.data;
    };
    const range = `from=${FROM}&to=${today}`;
    const prev = monthStart(1);
    const n = (x: unknown) => Number(x ?? 0);
    const rowsOf = (d: { rows?: unknown[] }) => d.rows?.length ?? 0;

    const checks: [string, () => Promise<boolean>][] = [
      ['ACC8 B01', async () => n((await get(`/api/v1/reports/balance-sheet?${range}`)).totals?.assets) > 0],
      ['ACC9 B02', async () => (await get(`/api/v1/reports/income-statement?${range}`)).rows.some((r: { code: string; current: number }) => r.code === '10' && n(r.current) > 0)],
      ['ACC13 B03', async () => (await get(`/api/v1/reports/cash-flow?${range}`)).rows.some((r: { value: number }) => n(r.value) !== 0)],
      ['ACC10 cân đối phát sinh', async () => rowsOf(await get(`/api/v1/reports/trial-balance?${range}&postingOnly=false`)) > 0],
      ['ACC88 sổ cái', async () => rowsOf(await get(`/api/v1/reports/account-ledger?account=111&kind=ledger&${range}`)) > 0],
      ['ACC89 nhật ký chung', async () => rowsOf(await get(`/api/v1/reports/journal?${range}&pageSize=1000`)) > 0],
      ['ACC38 công nợ phải thu', async () => rowsOf(await get(`/api/v1/reports/partner-balances?account=131&${range}`)) > 0],
      ['ACC38 công nợ phải trả', async () => rowsOf(await get(`/api/v1/reports/partner-balances?account=331&${range}`)) > 0],
      ['ACC67 tuổi nợ', async () => rowsOf(await get(`/api/v1/reports/aging-due?account=131&asOf=${today}`)) > 0],
      ['ACC83 nhập xuất tồn', async () => rowsOf(await get(`/api/v1/inventory/stock-movement?${range}`)) > 0],
      ['ACC82 thẻ kho', async () => rowsOf(await get(`/api/v1/inventory/item-ledger?sku=MAU-SP-16&${range}`)) > 0],
      ['ACC55 sổ quỹ tiền mặt', async () => rowsOf(await get(`/api/v1/reports/account-ledger?account=111&kind=cash&${range}`)) > 0],
      ['ACC80 số dư tiền', async () => rowsOf(await get(`/api/v1/reports/cash-balances?from=${today}&to=${today}&accounts=111,112,113`)) > 0],
      ['BH02 bán hàng tổng hợp', async () => rowsOf(await get(`/api/v1/reports/sales-summary?${range}&groupBy=document`)) > 0],
      ['BH04 lãi gộp', async () => n((await get(`/api/v1/reports/gross-profit?${range}&groupBy=product`)).totals?.revenue) > 0],
      ['BH05 thu tiền bán hàng', async () => rowsOf(await get(`/api/v1/reports/sales-receipts?${range}`)) > 0],
      ['ACC66 tờ khai GTGT tháng trước', async () => (await get(`/api/v1/vat-returns/build?periodKind=month&year=${prev.slice(0, 4)}&period=${Number(prev.slice(5, 7))}`)).salesList?.length > 0],
      ['ACC64 bảng kê mua vào', async () => (await get(`/api/v1/reports/sales-invoices?${range}&direction=input`)).groups?.length > 0],
      ['ACC65 bảng kê bán ra', async () => (await get(`/api/v1/reports/sales-invoices?${range}&direction=output`)).groups?.length > 0],
      ['ACC28 thẻ tài sản cố định', async () => (await get('/api/v1/assets?kind=fixed_asset')).length === 2],
      ['ACC29 sổ tài sản', async () => rowsOf(await get(`/api/v1/assets/register?${range}&kind=fixed_asset`)) > 0],
      ['Tổng quan', async () => (await get(`/api/v1/reports/dashboard?${range}`)).days?.some((d: { revenue: number }) => n(d.revenue) > 0)],
    ];
    const empty: string[] = [];
    for (const [name, ok] of checks) if (!(await ok())) empty.push(name);
    expect(empty, 'báo cáo còn trống').toEqual([]);
  }, 120_000);

  it('chạy lại → thêm 0 dòng sổ; cuối kỳ bỏ qua vì chứng từ đều unchanged', async () => {
    const before = await ledgerLines();
    const run = await applyAndWait('t036-1-lan-2');
    expect(run.status).toBe('done');
    expect(run.steps.reduce((x, s) => x + s.written, 0), JSON.stringify(run.steps)).toBe(0);
    const close = run.steps.find((s) => s.key === 'close')!;
    expect(close).toMatchObject({ written: 0, skipped: close.total });
    expect(close.total).toBeGreaterThan(0);
    expect(await ledgerLines()).toBe(before);
  }, 300_000);
});
