/**
 * Kiểm thử: Sổ nhật ký bán hàng (ACC84) — cột Tài khoản (doanh thu) / TK đối ứng (phải thu) khi hoá đơn có dòng hàng tiền âm
 * (bút toán đổi bên: Nợ doanh thu / Có phải thu) và các bộ lọc tài khoản, mặt hàng, khách hàng.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const OCT = 'from=2026-10-01&to=2026-10-31';
const send = (doc: unknown) => ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: doc as never, headers: { 'x-api-key': ctx.apiKey } });
const journal = async (extra = '') => (await call(ctx, 'GET', `/api/v1/reports/sales-journal?${OCT}${extra}`)).body.data;
const rowOf = (d: any, docNo: string) => d.branches.flatMap((b: any) => b.rows).find((r: any) => r.docNo === docNo);

beforeAll(async () => {
  ctx = await setupTenant();
  // HD1: một dòng bán, một dòng trả lại trong cùng hoá đơn (tiền âm).
  expect((await send(saleDoc({
    docKey: 'pos:CN01:HD1', docNo: 'HD1',
    lines: [
      { lineKey: 'l1', sku: 'SUA01', name: 'Sữa', unit: 'Hộp', qty: 2, amountBeforeTax: 185185, taxCode: 'R08', taxAmount: 14815 },
      { lineKey: 'l2', sku: 'SUA02', name: 'Sữa trả lại', unit: 'Hộp', qty: -1, amountBeforeTax: -92593, taxCode: 'R08', taxAmount: -7407 },
    ],
    payments: [{ methodCode: 'TM', amount: 100000 }], totals: { beforeTax: 92592, tax: 7408, total: 100000 },
  }))).json().data.status).toBe('posted');
  // HD2: cả hoá đơn chỉ có dòng tiền âm.
  expect((await send(saleDoc({
    docKey: 'pos:CN01:HD2', docNo: 'HD2', partner: { code: '0987654321', name: 'Trần Thị B' }, invoice: undefined,
    lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Điều chỉnh giảm', unit: 'Hộp', qty: -1, amountBeforeTax: -50000, taxCode: 'R08', taxAmount: -4000 }],
    payments: [], totals: { beforeTax: -50000, tax: -4000, total: -54000 },
  }))).json().data.status).toBe('posted');
});
afterAll(async () => {
  await ctx.app.close();
  await closeDb();
});

describe('Tài khoản (doanh thu) và TK đối ứng (phải thu) như HTsoft', () => {
  it('dòng tiền âm: vẫn ghi Nợ phải thu, đối ứng doanh thu, số tiền âm', async () => {
    const r = rowOf(await journal(), 'HD1');
    expect(r).toMatchObject({ account: '51111', contraAccount: '1311', otherAccount: '', reasonCode: 'XBA', goods: 92592, other: 0, total: 92592 });
  });

  it('hoá đơn chỉ có dòng tiền âm', async () => {
    const r = rowOf(await journal(), 'HD2');
    expect(r).toMatchObject({ account: '51111', contraAccount: '1311', goods: -50000, other: 0, total: -50000, partnerCode: '0987654321' });
  });

  it('tổng cộng khớp các dòng', async () => {
    const d = await journal();
    expect(d.totals).toEqual({ goods: 42592, finished: 0, service: 0, other: 0, total: 42592 });
    expect(d.documents).toBe(2);
  });
});

describe('Bộ lọc', () => {
  it('lọc tài khoản ghi Nợ hoặc doanh thu', async () => {
    expect((await journal('&account=1311')).documents).toBe(2);
    expect((await journal('&account=5111')).documents).toBe(2);
    expect((await journal('&account=5113')).documents).toBe(0);
  });

  it('lọc mặt hàng: chỉ phần doanh thu của mặt hàng đó', async () => {
    const d = await journal('&productSkus=SUA02');
    expect(d.documents).toBe(1);
    expect(rowOf(d, 'HD1')).toMatchObject({ account: '51111', contraAccount: '1311', goods: -92593, total: -92593 });
  });

  it('lọc khách hàng', async () => {
    const d = await journal('&partnerCode=0987654321');
    expect(d.branches.flatMap((b: any) => b.rows).map((r: any) => r.docNo)).toEqual(['HD2']);
  });
});
