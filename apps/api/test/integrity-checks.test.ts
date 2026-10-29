/**
 * Tiện ích kiểm tra toàn vẹn sổ trong báo cáo Kiểm tra chứng từ (kế hoạch Đợt 2, hạng mục 2.6).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const ret = (docNo: string, originalDocKey?: string) => ({
  docType: 'sale_return', docKey: `pos:CN01:${docNo}`, originalDocKey, branchCode: 'CN01', docNo, docDate: '2026-10-08',
  partner: { code: 'KH-KT', name: 'Khách kiểm tra' },
  lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', qty: 1, amountBeforeTax: 100000, taxCode: 'R08', taxAmount: 8000 }],
  payments: [{ methodCode: 'TM', amount: 108000 }],
  totals: { beforeTax: 100000, tax: 8000, total: 108000 },
});
const checks = async () => (await call(ctx, 'GET', '/api/v1/reports/document-checks?from=2026-10-01&to=2026-10-31')).body.data;

beforeAll(async () => {
  ctx = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Kiểm tra toàn vẹn sổ', () => {
  it('phiếu trả lại không nối được phiếu gốc: thiếu mã, chưa nhận, phiếu gốc đã huỷ', async () => {
    expect((await call(ctx, 'POST', '/api/v1/documents', saleDoc())).body.data.status).toBe('posted');
    for (const d of [ret('TL-OK', 'pos:CN01:HD0001'), ret('TL-THIEU'), ret('TL-CHUA', 'pos:CN01:KHONG-CO')]) {
      const r = await call(ctx, 'POST', '/api/v1/documents', d);
      expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted');
    }
    let d = await checks();
    expect(d.orphanReturns.rows.map((r: { docNo: string; note: string }) => [r.docNo, r.note])).toEqual([
      ['TL-CHUA', 'Chưa nhận phiếu gốc pos:CN01:KHONG-CO'], ['TL-THIEU', 'Không gửi mã phiếu gốc'],
    ]);
    await call(ctx, 'POST', '/api/v1/documents/cancel', { docKey: 'pos:CN01:HD0001', reason: 'thử' });
    d = await checks();
    expect(d.orphanReturns.rows.find((r: { docNo: string }) => r.docNo === 'TL-OK').note).toBe('Phiếu gốc pos:CN01:HD0001 đã huỷ');
  });

  it('chứng từ khớp bút toán, sổ tổng hợp khớp sổ chi tiết', async () => {
    const d = await checks();
    expect(d.entryMismatch.count).toBe(0);
    expect(d.balanceMismatch.count).toBe(0);
  });
});
