// [2026-11-21 Nguyễn Văn Thủy] Báo cáo hợp đồng & chính sách (MH32, MH34) trên dữ liệu 25 tình huống — hai lượt không / có hợp đồng (đóng góp)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

type Exec = { policy: string; kind: string; contractCode: string; base: number; entitled: number; received: number; remaining: number; status: string; docs: { docNo: string; amount: number }[] };
type Price = { docNo: string; contractCode: string; sku: string; agreed: number | null; actual: number; diff: number | null; diffPct: number | null; source: string; actualFrom: string };
type Hd = { code: string; partnerCode: string; ordered: number; received: number; invoiced: number; paid: number; debt: number; invoices: number };

for (const mode of ['none', 'contract'] as const) describe(`Báo cáo hợp đồng & chính sách — ${mode === 'none' ? 'không hợp đồng' : 'có hợp đồng'}`, () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await setupTenant();
    const s = await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#', mode });
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    expect(s.body.data.errors).toEqual([]);
  }, 120_000);
  afterAll(async () => { await t.app.close(); });

  it('MH32: ưu đãi trừ thẳng hoá đơn = đã nhận đủ; thưởng tháng 10 Trung Hậu 9.000.000; chứng từ đi kèm; lọc hợp đồng xuyên suốt', async () => {
    const r = await call<{ data: Exec[] }>(t, 'GET', '/api/v1/purchase/policy-execution?from=2026-10-01&to=2026-10-31');
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(200);
    const rows = r.body.data;
    // Chiết khấu / bậc SL / tặng hàng theo chính sách (VD2 bậc 5%, TH14 mua X tặng Y…): trừ ngay trên hoá đơn → đã nhận đủ, có chứng từ.
    const tren = rows.filter((x) => ['trade_discount', 'item_discount', 'qty_tier', 'promo_gift'].includes(x.kind) && x.entitled > 0);
    expect(tren.length).toBeGreaterThan(0);
    for (const x of tren) { expect(x).toMatchObject({ status: 'du', remaining: 0 }); expect(x.received).toBe(x.entitled); expect(x.docs.length).toBeGreaterThan(0); }
    // TH8: chưa lập phiếu thưởng → tạm tính từ phiếu nhập; NCC chốt doanh số 300 triệu, lập + duyệt phiếu thưởng 9.000.000 → được hưởng = đã nhận.
    expect(rows.find((x) => x.policy === 'TH-THUONG-T')).toBeTruthy();
    const pv = (await call(t, 'POST', '/api/v1/purchase/rebates/preview', { policyCode: 'TH-THUONG-T', period: '2026-10', manualTotal: 300000000 })).body.data;
    const rb = await call(t, 'POST', '/api/v1/purchase/documents', { kind: 'rebate', docDate: '2026-10-23', branchCode: 'CN-NA', partnerCode: 'NCC-TRUNGHAU', amount: 9000000, taxCode: 'V08', invoice: { no: 'DC0001', date: '2026-10-23' }, rebate: { policyCode: 'TH-THUONG-T', period: '2026-10', base: pv.base, rate: pv.rate, detail: pv.detail }, allocation: pv.allocation, lines: [] });
    expect(rb.status, JSON.stringify(rb.body).slice(0, 300)).toBe(201);
    const cho = (await call<{ data: Exec[] }>(t, 'GET', '/api/v1/purchase/policy-execution?from=2026-10-01&to=2026-10-31')).body.data.find((x) => x.policy === 'TH-THUONG-T')!;
    expect(cho).toMatchObject({ entitled: 9_000_000, received: 0, remaining: 9_000_000, status: 'con', base: 300_000_000 });
    expect((await call(t, 'POST', `/api/v1/purchase/documents/${rb.body.data.id}/approve`, {})).status).toBe(200);
    const th = (await call<{ data: Exec[] }>(t, 'GET', '/api/v1/purchase/policy-execution?from=2026-10-01&to=2026-10-31')).body.data.find((x) => x.policy === 'TH-THUONG-T')!;
    expect(th).toMatchObject({ entitled: 9_000_000, received: 9_000_000, remaining: 0, status: 'du' });
    // Hợp đồng xuyên suốt: lượt có hợp đồng thì chính sách của NCC nằm trong hợp đồng; lọc "không theo hợp đồng" không còn chính sách đó.
    if (mode === 'contract') {
      expect(th.contractCode).toBe('HD-NCC-TRUNGHAU');
      const ngoai = (await call<{ data: Exec[] }>(t, 'GET', '/api/v1/purchase/policy-execution?from=2026-10-01&to=2026-10-31&contractCode=')).body.data;
      expect(ngoai.some((x) => x.policy === 'TH-THUONG-T')).toBe(false);
    } else expect(th.contractCode).toBe('');
  });

  it('MH34: giá thoả thuận ↔ giá thực tế; VD4 mua cao hơn giá cố định 3,9%; nguồn giá ghi rõ', async () => {
    const r = await call<{ data: Price[] }>(t, 'GET', '/api/v1/purchase/contract-prices?from=2026-10-01&to=2026-10-31');
    expect(r.status).toBe(200);
    const rows = r.body.data;
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.some((x) => (x.diffPct ?? 0) > 3 && (x.diffPct ?? 0) < 5)).toBe(true);
    expect(rows.every((x) => x.source.length > 0)).toBe(true);
    // Giá thực tế ghi rõ nguồn: hoá đơn NCC (chính thức) hoặc phiếu nhập (tạm).
    expect(rows.every((x) => x.actualFrom === 'hoa-don' || x.actualFrom === 'phieu-nhap')).toBe(true);
    if (mode === 'contract') expect(rows.filter((x) => x.contractCode).length).toBeGreaterThan(0);
  });

  it('MH35: đã đặt / đã nhận / đã nhận hoá đơn / đã thanh toán / còn phải trả — mỗi số một nguồn; lọc không theo hợp đồng', async () => {
    const r = await call<{ data: Hd[] }>(t, 'GET', '/api/v1/purchase/contract-execution?from=2026-01-01&to=2026-12-31&partnerCode=NCC-TRUNGHAU');
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(200);
    const row = r.body.data.find((x) => (mode === 'contract' ? x.code === 'HD-NCC-TRUNGHAU' : x.code === ''))!;
    expect(row.received).toBeGreaterThan(0);
    expect(row.ordered).toBeGreaterThan(0);
    expect(row.invoiced).toBeGreaterThanOrEqual(0);
    expect(row.debt).toBeGreaterThan(0);
    const ngoai = (await call<{ data: Hd[] }>(t, 'GET', '/api/v1/purchase/contract-execution?from=2026-01-01&to=2026-12-31&contractCode=')).body.data;
    expect(ngoai.every((x) => x.code === '')).toBe(true);
    if (mode === 'contract') expect(ngoai.some((x) => x.partnerCode === 'NCC-TRUNGHAU')).toBe(false);
  });

  it('lọc chi nhánh / kho: chỉ phiếu của chi nhánh chọn; MH35 còn phải trả theo phiếu trong phạm vi', async () => {
    const all = (await call<{ data: { branchCode: string }[] }>(t, 'GET', '/api/v1/purchase/contract-prices?from=2026-01-01&to=2026-12-31')).body.data;
    const cn = all[0]?.branchCode;
    expect(cn).toBeTruthy();
    const loc = (await call<{ data: { branchCode: string }[] }>(t, 'GET', `/api/v1/purchase/contract-prices?from=2026-01-01&to=2026-12-31&branchCodes=${cn}`)).body.data;
    expect(loc.length).toBeGreaterThan(0);
    expect(loc.every((x) => x.branchCode === cn)).toBe(true);
    expect((await call<{ data: unknown[] }>(t, 'GET', '/api/v1/purchase/contract-prices?from=2026-01-01&to=2026-12-31&branchCodes=KHONG-CO')).body.data.length).toBe(0);
    const r = await call<{ data: Hd[] }>(t, 'GET', `/api/v1/purchase/contract-execution?from=2026-01-01&to=2026-12-31&branchCodes=${cn}`);
    expect(r.status).toBe(200);
    const p = await call<{ data: unknown[] }>(t, 'GET', `/api/v1/purchase/policy-execution?from=2026-01-01&to=2026-12-31&branchCodes=${cn}&warehouseCodes=KHONG-CO`);
    expect(p.status).toBe(200);
  });
});
