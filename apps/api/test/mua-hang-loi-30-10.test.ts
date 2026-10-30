/**
 * Lỗi đợt test 30/10 (25 trường hợp mua hàng): mỗi lỗi một phép thử tái hiện đúng thao tác, trên dữ liệu mẫu nạp vào một đơn vị mới.
 * Mã hàng / NCC riêng cho từng phép thử để số liệu không lẫn phiếu mẫu.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeDoc, type PDoc, type Policy } from '@ketoan/contracts/mua-hang';
import { call, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
type Check = { code: string; level: string; text: string; blocking?: boolean };
type Doc = { id: string; docNo: string; status: string; totals: { total: number }; override?: unknown; checks?: Check[] };
const save = async (body: Record<string, unknown>) => { const r = await call(t, 'POST', '/api/v1/purchase/documents', body); expect(r.status, JSON.stringify(r.body)).toBe(201); return r.body.data as Doc; };
const approve = async (id: string) => { const r = await call(t, 'POST', `/api/v1/purchase/documents/${id}/approve`); expect(r.status, JSON.stringify(r.body)).toBe(200); return r.body.data as Doc; };
const analyze = async (body: Record<string, unknown>) => (await call(t, 'POST', '/api/v1/purchase/analyze', body)).body.data.checks as Check[];
const policy = async (p: Record<string, unknown>) => { const r = await call(t, 'POST', '/api/v1/purchase/policies', { scope: {}, isActive: true, priority: 0, validFrom: null, validTo: null, ...p }); expect(r.status, JSON.stringify(r.body)).toBe(201); };
const NGOAI_DON = { reason: 'Phép thử: nhập ngoài đơn' };
const SKU = 'T3010A';
const line = (qty: number, price: number, o: Record<string, unknown> = {}) => ({ lineKey: `l${Math.random().toString(36).slice(2, 8)}`, sku: SKU, name: 'Hàng thử 30/10', unit: 'Lon', qty, price, taxCode: 'V08', lineType: 'buy', ...o });
const receipt = (partnerCode: string, docDate: string, lines: unknown[], o: Record<string, unknown> = {}) =>
  ({ kind: 'receipt', outsideOrder: NGOAI_DON, docDate, branchCode: 'CN-NA', partnerCode, priceIncludesVat: false, orderDiscount: {}, lines, ...o });

beforeAll(async () => {
  t = await setupTenant();
  const s = await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' });
  expect(s.status, JSON.stringify(s.body)).toBe(200);
  const p = await call(t, 'PUT', `/api/v1/catalog/products/${SKU}?new=1`, { name: 'Hàng thử 30/10', unit: 'Lon', taxInCode: 'V08', units: [{ unit: 'Lon', ratio: 1, isDefault: true, isPurchaseDefault: true }, { unit: 'Thùng', ratio: 12 }] });
  expect(p.status, JSON.stringify(p.body)).toBe(200);
  for (const code of ['NCC-A3010', 'NCC-HM3010', 'NCC-OV3010', 'NCC-RB3010', 'NCC-LO3010', 'NCC-QA3010']) await call(t, 'PUT', `/api/v1/partners/${code}`, { name: `NCC thử ${code}`, kind: 'supplier' });
}, 90_000);
afterAll(async () => { await t.app.close(); });

describe('Đợt test 30/10', () => {
  it('ACC83 — phân bổ chi phí (+) và giảm giá sau mua (−) không có số lượng vẫn vào TT nhập / TT tồn cuối, khớp cột Mua hàng', async () => {
    const r = await approve((await save(receipt('NCC-A3010', '2026-10-05', [line(10, 100_000)]))).id);
    await approve((await save({ kind: 'cost', docDate: '2026-10-06', branchCode: 'CN-NA', partnerCode: 'NCC-A3010', priceIncludesVat: false, refIds: [r.id], amount: 500_000, costType: 'van_chuyen', basis: 'value', lines: [] })).id);
    await approve((await save({ kind: 'rebate', docDate: '2026-10-07', branchCode: 'CN-NA', partnerCode: 'NCC-A3010', priceIncludesVat: false, refIds: [r.id], amount: 200_000, basis: 'value', lines: [] })).id);
    const rep = await call(t, 'GET', `/api/v1/inventory/stock-movement?from=2026-10-01&to=2026-10-31&branchCodes=CN-NA&search=${SKU}`);
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    const rows = (rep.body.data.rows ?? rep.body.data) as { sku: string; inQty: number; inValue: number; closingValue: number; purchaseValue: number }[];
    const row = rows.find((x) => x.sku === SKU)!;
    expect(row.inQty).toBe(10);
    expect(row.inValue).toBe(1_300_000); // 1.000.000 + 500.000 − 200.000
    expect(row.closingValue).toBe(1_300_000);
    expect(row.purchaseValue).toBe(row.inValue);
  });

  it('TH03 — hạn mức NCC đã hết hiệu lực không chặn duyệt; còn hiệu lực thì vẫn chặn', async () => {
    await policy({ code: 'HM3010', kind: 'credit_limit', name: 'Hạn mức thử 1 triệu (01–02/10)', scope: { partnerCode: 'NCC-HM3010' }, validFrom: '2026-10-01', validTo: '2026-10-02', rule: { limit: 1_000_000, warnPct: 90 } });
    const inWindow = await analyze(receipt('NCC-HM3010', '2026-10-02', [line(50, 100_000)]));
    expect(inWindow.some((c) => c.blocking && /hạn mức/.test(c.text))).toBe(true);
    const after = await save(receipt('NCC-HM3010', '2026-10-10', [line(50, 100_000)]));
    expect((await approve(after.id)).status).toBe('approved');
  });

  it('TH13 — bỏ duyệt đơn đã duyệt ngoại lệ thì xoá dấu duyệt ngoại lệ; duyệt thường lại không mang dấu cũ', async () => {
    await policy({ code: 'OV3010', kind: 'credit_limit', name: 'Hạn mức thử 1 triệu', scope: { partnerCode: 'NCC-OV3010' }, validFrom: '2026-10-01', rule: { limit: 1_000_000, warnPct: 90 } });
    const o = await save({ kind: 'order', docDate: '2026-10-10', branchCode: 'CN-NA', partnerCode: 'NCC-OV3010', priceIncludesVat: false, lines: [line(20, 100_000)] });
    const ov = await call(t, 'POST', `/api/v1/purchase/documents/${o.id}/override`, { reason: 'Phép thử duyệt ngoại lệ' });
    expect(ov.status, JSON.stringify(ov.body)).toBe(200);
    expect((await call(t, 'GET', `/api/v1/purchase/documents/${o.id}`)).body.data.doc.override).toBeTruthy();
    expect((await call(t, 'POST', `/api/v1/purchase/documents/${o.id}/unapprove`, {})).status).toBe(200);
    expect((await call(t, 'GET', `/api/v1/purchase/documents/${o.id}`)).body.data.doc.override).toBeFalsy();
    const pols = (await call(t, 'GET', '/api/v1/purchase/policies')).body.data as Policy[];
    const p = pols.find((x) => x.code === 'OV3010')!;
    expect((await call(t, 'PUT', `/api/v1/purchase/policies/${p.id}`, { ...p, rule: { limit: 10_000_000, warnPct: 90 }, validFrom: p.validFrom ?? null, validTo: p.validTo ?? null })).status).toBe(200);
    await approve(o.id);
    expect((await call(t, 'GET', `/api/v1/purchase/documents/${o.id}`)).body.data.doc.override).toBeFalsy();
  });

  it('TH24 — MH11 theo NCC: Còn nợ NCC trừ cả khoản thưởng chưa gắn phiếu nhập', async () => {
    await approve((await save(receipt('NCC-RB3010', '2026-10-05', [line(10, 100_000)]))).id); // 1.000.000 + VAT 80.000
    await approve((await save({ kind: 'rebate', docDate: '2026-10-31', branchCode: 'CN-NA', partnerCode: 'NCC-RB3010', priceIncludesVat: false, amount: 100_000, lines: [],
      rebate: { policyCode: 'THU-3010', period: '2026-10', base: 1_000_000, rate: 10, detail: [] }, allocation: [{ sku: SKU, amount: 100_000 }] })).id);
    const s = await call(t, 'GET', '/api/v1/purchase/summary?from=2026-10-01&to=2026-10-31&groupBy=partner');
    const row = (s.body.data.rows as { key: string; openDebt: number }[]).find((x) => x.key === 'NCC-RB3010')!;
    expect(row.openDebt).toBe(980_000);
  });

  it('TH19 — FEFO: trả NCC lô hạn xa khi còn lô hạn gần thì cảnh báo; lô đã hết hạn không tính là "nên xuất trước"', async () => {
    await approve((await save(receipt('NCC-LO3010', '2026-10-05', [
      line(5, 100_000, { lotNo: 'L0', expDate: '2026-10-08' }), line(5, 100_000, { lotNo: 'L1', expDate: '2026-12-01' }), line(5, 100_000, { lotNo: 'L2', expDate: '2027-06-01' }),
    ]))).id);
    const ret = (lotNo: string) => ({ kind: 'return', docDate: '2026-10-20', branchCode: 'CN-NA', partnerCode: 'NCC-LO3010', priceIncludesVat: false, reason: 'Phép thử FEFO', lines: [line(1, 100_000, { lotNo })] });
    const far = await analyze(ret('L2'));
    expect(far.find((c) => c.code === 'fefo')?.text).toMatch(/L1/);
    expect((await analyze(ret('L1'))).some((c) => c.code === 'fefo')).toBe(false); // L0 đã hết hạn → L1 là lô nên xuất trước
  });

  it('TH20 — mua / nhận quà làm vượt ngân sách chương trình thì cảnh báo ngay trên phiếu', async () => {
    await policy({ code: 'NS3010', kind: 'gift_budget', name: 'Ngân sách quà thử 1 triệu', validFrom: '2026-10-01', validTo: '2026-12-31', rule: { program: 'P3010', amount: 1_000_000 } });
    const gift = (qty: number) => ({ kind: 'gift_in', docDate: '2026-10-05', branchCode: 'CN-NA', partnerCode: 'NCC-QA3010', priceIncludesVat: false, gift: { source: 'ncc_program', program: 'P3010', hasVat: false },
      lines: [line(qty, 100_000, { taxCode: 'KKKN', lineType: 'gift_consumer', program: 'P3010' })] });
    await approve((await save(gift(8))).id); // 800.000
    const w = (await analyze(gift(3))).find((c) => c.code === 'gift_budget_over');
    expect(w?.level).toBe('warn');
    expect(w?.text).toMatch(/1\.100\.000/);
    expect((await analyze(gift(2))).some((c) => c.code === 'gift_budget_over')).toBe(false); // đúng bằng ngân sách
  });

  it('Phần trăm có số lẻ hiển thị kiểu Việt Nam (2,5%) trong diễn giải chính sách', () => {
    const p: Policy = { id: 'q', code: 'BAC25', kind: 'qty_tier', name: 'Bậc thử', scope: { sku: SKU }, isActive: true, rule: { tiers: [{ from: 0, pct: 2.5 }] } };
    const d: PDoc = { id: 'd', kind: 'receipt', status: 'draft', docNo: '', docDate: '2026-10-05', branchCode: 'CN-NA', partnerCode: 'N1', priceIncludesVat: false, lines: [line(10, 100_000) as PDoc['lines'][number]] };
    expect(computeDoc(d, [p]).trace.map((x) => x.text).join(' ')).toContain('CK 2,5%');
  });
});
