/**
 * Chứng từ nguồn (kế hoạch Đợt 3, hạng mục 3.6): nhận qua API, không ghi sổ; lập phiếu công nợ từ chứng từ nguồn.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const receipt = { kind: 'goods_receipt', docKey: 'mua:PN-001', docNo: 'PN-001', docDate: '2026-10-05', partner: { code: 'NCC-N', name: 'Nhà cung cấp N' }, branchCode: 'CN01', total: 4400000, dueDate: '2026-11-05', description: 'Nhập sữa đợt 1', payload: { lines: [{ sku: 'SUA01', qty: 10 }] } };
const list = async (q = '') => (await call(ctx, 'GET', `/api/v1/reference-documents?${q}`)).body.data;

beforeAll(async () => {
  ctx = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Chứng từ nguồn', () => {
  it('nhận hàng loạt, tự thêm đối tượng, không ghi sổ; gửi lại thì cập nhật', async () => {
    const r = await call(ctx, 'PUT', '/api/v1/reference-documents', { source: 'mua-hang', documents: [receipt, { kind: 'purchase_order', docKey: 'mua:DH-009', docNo: 'DH-009', docDate: '2026-10-01', total: 9000000 }] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await call(ctx, 'PUT', '/api/v1/reference-documents', { documents: [{ ...receipt, total: 4500000 }] })).status).toBe(200);
    const rows = await list('kind=goods_receipt');
    expect(rows).toEqual([expect.objectContaining({ docNo: 'PN-001', kindLabel: 'Phiếu nhập hàng', partnerCode: 'NCC-N', total: 4500000, status: 'open' })]);
    expect((await call(ctx, 'GET', '/api/v1/partners?search=NCC-N')).body.data[0]).toMatchObject({ kind: 'supplier' });
    expect((await call(ctx, 'GET', '/api/v1/documents')).body.data).toEqual([]);
    expect((await call(ctx, 'PUT', '/api/v1/reference-documents', { documents: [{ ...receipt, kind: 'khac' }] })).status).toBe(400);
  });

  it('lập phiếu ghi tăng công nợ từ chứng từ nguồn: chứng từ nguồn chuyển sang đã dùng, gửi lại không làm mất', async () => {
    const v = await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'manual', branchCode: 'CN01', docDate: '2026-10-06', description: 'Nhập sữa đợt 1', partnerCode: 'NCC-N', purpose: 'ap_increase', dueDate: '2026-11-05', sourceDocKey: 'mua:PN-001', reference: 'Phiếu nhập hàng PN-001', lines: [{ debitAccount: '64211', creditAccount: '33111', amount: 4500000 }] });
    expect(v.status, JSON.stringify(v.body)).toBe(201);
    expect(await list('status=open')).toEqual([expect.objectContaining({ docNo: 'DH-009' })]);
    await call(ctx, 'PUT', '/api/v1/reference-documents', { documents: [{ ...receipt, status: 'open' }] });
    expect(await list('status=used')).toEqual([expect.objectContaining({ docNo: 'PN-001', usedDocNo: v.body.data.docNo })]);
    const bad = await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'manual', branchCode: 'CN01', docDate: '2026-10-06', description: 'x', partnerCode: 'NCC-N', sourceDocKey: 'khong-co', lines: [{ debitAccount: '64211', creditAccount: '33111', amount: 1 }] });
    expect(bad.status).toBe(400);
  });

  it('đóng và mở lại chứng từ nguồn', async () => {
    const [po] = await list('status=open');
    expect((await call(ctx, 'PATCH', `/api/v1/reference-documents/${po.id}`, { status: 'closed' })).status).toBe(200);
    expect(await list('status=open')).toEqual([]);
    expect((await call(ctx, 'PATCH', `/api/v1/reference-documents/${po.id}`, { status: 'open' })).status).toBe(200);
    expect(await list('status=open')).toHaveLength(1);
  });
});
