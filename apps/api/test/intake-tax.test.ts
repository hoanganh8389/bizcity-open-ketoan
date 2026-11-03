/**
 * Cảnh báo thuế / hoá đơn / hồ sơ kế toán lúc nhập (PHASE-021 S021-25; PHASE-022 S022-8 "một nguồn luật"):
 *   IN-VAT-001 thuế suất giảm ngoài khoảng ngày · IN-INV-001 hoá đơn mua thiếu trường · IN-INV-002 hoá đơn sau ngày giao ·
 *   IN-CFG-001 chưa khai hồ sơ kế toán. Mức warn: cửa nạp vẫn nhận; điểm trừ theo trọng số (IN-CFG-001 trọng số 0).
 *   Hàm kiểm theo một chứng từ (tax.findings.ts) là nguồn chung của tự chẩn đoán thuế và Trạm tiền kiểm.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INTAKE_CATALOG } from '@ketoan/contracts';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';
import { invoiceFieldIssues, invoiceIssuedAfterDelivery, outsideReducedWindow, reducedRateWindow } from '../src/kernel/public.js';

let ctx: TestCtx;
let k = 0;
const pre = async (document: unknown) => {
  const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/intake/preflight', payload: { document, post: false } as never, headers: { authorization: `Bearer ${ctx.token}` } });
  expect(res.statusCode, res.body).toBe(200);
  return res.json().data as { score: number; findings: { code: string; severity: string; path: string | null }[] };
};
const sale = (over: Record<string, unknown> = {}) => { k += 1; return saleDoc({ docKey: `tx:CN01:${k}`, docNo: `TX${k}`, ...over }); };
const purchase = (over: Record<string, unknown> = {}) => {
  k += 1;
  return {
    docType: 'purchase', docKey: `tx:CN01:M${k}`, version: 1, branchCode: 'CN01', docNo: `MUA${k}`, docDate: '2026-10-05',
    partner: { code: 'NCC-TX', name: 'Nhà cung cấp thử', taxCode: '0312345678' },
    invoice: { no: `88800${k}`, serial: 'C26TMM', form: '1', date: '2026-10-05' },
    lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty: 1, amountBeforeTax: 100000, taxCode: 'V10', taxAmount: 10000 }],
    payments: [], totals: { beforeTax: 100000, tax: 10000, total: 110000 }, ...over,
  };
};
const codes = (r: { findings: { code: string }[] }) => r.findings.map((f) => f.code);

beforeAll(async () => {
  ctx = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Hàm kiểm theo một chứng từ (S022-8)', () => {
  it('khoảng giảm thuế đọc từ tham số rulepack, không viết cứng', () => {
    const w = reducedRateWindow();
    expect(w).toEqual({ rate: 8, from: '2025-07-01', to: '2026-12-31' });
    expect(outsideReducedWindow('2026-12-31', w)).toBe(false);
    expect(outsideReducedWindow('2027-01-01', w)).toBe(true);
    expect(outsideReducedWindow('2025-06-30', w)).toBe(true);
  });
  it('trường hoá đơn dùng lại taxIssues; ngày hoá đơn sau ngày giao', () => {
    expect(invoiceFieldIssues({ direction: 'input', serial: '', name: '', taxCode: '' })).toEqual(['Thiếu ký hiệu hoá đơn', 'Thiếu tên người bán', 'Thiếu mã số thuế người bán']);
    expect(invoiceFieldIssues({ direction: 'input', serial: 'C26TMM', name: 'A', taxCode: '0312345678' })).toEqual([]);
    expect(invoiceFieldIssues({ direction: 'output', serial: 'C26TMM', name: '', taxCode: '' })).toEqual([]); // hoá đơn bán không đòi tên / MST người mua
    expect(invoiceIssuedAfterDelivery('2026-10-08', '2026-10-05')).toBe(true);
    expect(invoiceIssuedAfterDelivery('2026-10-05T09:00:00', '2026-10-05')).toBe(false);
  });
});

describe('IN-VAT-001', () => {
  it('bán ngày 2027-01-05 dùng loại thuế 8% (R08) → cảnh báo, trỏ dòng; trong khoảng giảm thì không', async () => {
    const late = await pre(sale({ docDate: '2027-01-05', invoice: { no: '7770101', serial: 'C27TAA', form: '1', date: '2027-01-05' } }));
    expect(late.findings.find((f) => f.code === 'IN-VAT-001')).toMatchObject({ severity: 'warn', path: 'lines[0].taxCode' });
    expect(codes(await pre(sale()))).not.toContain('IN-VAT-001');
  });
});

describe('IN-INV-001 / IN-INV-002', () => {
  it('hoá đơn mua thiếu ký hiệu và mã số thuế → IN-INV-001; đủ thì không', async () => {
    const bad = await pre(purchase({ invoice: { no: '8880001', serial: '', form: '1', date: '2026-10-05' }, partner: { code: 'NCC-TX', name: 'Nhà cung cấp thử' } }));
    const f = bad.findings.find((x) => x.code === 'IN-INV-001');
    expect(f, JSON.stringify(bad.findings)).toMatchObject({ severity: 'warn', path: 'invoice' });
    expect(codes(await pre(purchase()))).not.toContain('IN-INV-001');
  });

  it('chứng từ mua không có số hoá đơn không bị nhắc (chưa có hoá đơn là việc khác)', async () => {
    const r = await pre(purchase({ invoice: undefined }));
    expect(codes(r)).not.toContain('IN-INV-001');
  });

  it('hoá đơn bán lập sau ngày chứng từ 3 ngày → IN-INV-002 (điểm trừ đúng trọng số); cùng ngày thì không', async () => {
    const r = await pre(sale({ invoice: { no: '7770202', serial: 'C26TAA', form: '1', date: '2026-10-08' } }));
    expect(codes(r)).toContain('IN-INV-002');
    expect(r.score).toBe(100 - INTAKE_CATALOG['IN-INV-002'].weight);
    expect(codes(await pre(sale({ invoice: { no: '7770203', serial: 'C26TAA', form: '1', date: '2026-10-05' } })))).not.toContain('IN-INV-002');
  });
});

describe('IN-CFG-001', () => {
  it('chưa khai hồ sơ kế toán → cảnh báo nhưng không trừ điểm; khai rồi thì hết', async () => {
    const before = await pre(sale());
    expect(before.findings.find((f) => f.code === 'IN-CFG-001')).toMatchObject({ severity: 'warn', path: 'docDate' });
    expect(before.score).toBe(100); // trọng số 0: lỗi cấu hình đơn vị, không phải lỗi người lập
    const pub = await call(ctx, 'POST', '/api/v1/accounting/profile/publish', { effectiveFrom: '2025-01-01', fiscalYearStartMonth: 1, regime: 'vn-tt99-2025', entityType: 'enterprise', note: 'Khai hồ sơ cho test tiền kiểm' });
    expect(pub.status, JSON.stringify(pub.body)).toBeLessThan(300);
    expect(codes(await pre(sale()))).not.toContain('IN-CFG-001');
    // Ngày trước hiệu lực của hồ sơ vẫn báo
    expect(codes(await pre(sale({ docDate: '2024-12-31', invoice: { no: '7770303', serial: 'C24TAA', form: '1', date: '2024-12-31' } })))).toContain('IN-CFG-001');
  });
});

describe('Cửa nạp vẫn nhận (mức warn)', () => {
  it('chứng từ có IN-INV-002 vẫn vào sổ', async () => {
    const d = sale({ invoice: { no: '7770404', serial: 'C26TAA', form: '1', date: '2026-10-08' } });
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: d as never, headers: { authorization: `Bearer ${ctx.token}` } });
    expect(res.statusCode, res.body).toBe(200);
    expect(await db.selectFrom('accounting_events').select('id').where('doc_key', '=', d.docKey as string).executeTakeFirst()).toBeTruthy();
  });
});
