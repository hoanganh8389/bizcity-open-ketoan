/**
 * Tài khoản ngân hàng (kế hoạch Đợt 1, hạng mục 1.4): mỗi tài khoản ngân hàng gắn một TK 112 chi tiết;
 * hình thức thanh toán trỏ về tài khoản ngân hàng thì tài khoản kế toán lấy theo.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const bank = (over: Record<string, unknown> = {}) => ({ bankName: 'Vietcombank', bankBranch: 'Hà Nội', accountNo: '0011000123456', holder: 'Công ty Cổ phần Đầu tư Thế Giới Sữa', accountCode: '11210005', ...over });

beforeAll(async () => {
  ctx = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Tài khoản ngân hàng', () => {
  it('chỉ gắn tài khoản 112 chi tiết, có trong danh mục', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/bank-accounts/X1', bank({ accountCode: '1111' }))).status).toBe(400);
    expect((await call(ctx, 'PUT', '/api/v1/bank-accounts/X2', bank({ accountCode: '112' }))).status).toBe(400);
    const ok = await call(ctx, 'PUT', '/api/v1/bank-accounts/VCB', bank());
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  });

  it('một TK kế toán chỉ gắn một tài khoản ngân hàng đang dùng', async () => {
    const dup = await call(ctx, 'PUT', '/api/v1/bank-accounts/BIDV', bank({ bankName: 'BIDV', accountNo: '999' }));
    expect(dup.status).toBe(400);
    expect(JSON.stringify(dup.body)).toMatch(/đã gắn với tài khoản ngân hàng VCB/);
    expect((await call(ctx, 'PUT', '/api/v1/bank-accounts/BIDV', bank({ bankName: 'BIDV', accountNo: '999', accountCode: '11210006' }))).status).toBe(200);
    const list = await call(ctx, 'GET', '/api/v1/bank-accounts?search=bidv');
    expect(list.body.data).toEqual([expect.objectContaining({ code: 'BIDV', accountCode: '11210006', isActive: true })]);
  });

  it('hình thức thanh toán trỏ về tài khoản ngân hàng: tài khoản kế toán lấy theo, đổi theo', async () => {
    const pm = await call(ctx, 'PUT', '/api/v1/posting/payment-methods/CK', { name: 'Chuyển khoản', accountCode: '1111', bankAccountCode: 'VCB' });
    expect(pm.status, JSON.stringify(pm.body)).toBe(200);
    let methods = (await call(ctx, 'GET', '/api/v1/posting/payment-methods')).body.data;
    expect(methods.find((m: { code: string }) => m.code === 'CK')).toMatchObject({ accountCode: '11210005', bankAccountCode: 'VCB' });
    // Ngừng BIDV để giải phóng 11210006, rồi chuyển VCB sang 11210006.
    expect((await call(ctx, 'PUT', '/api/v1/bank-accounts/BIDV', bank({ bankName: 'BIDV', accountNo: '999', accountCode: '11210006', isActive: false }))).status).toBe(200);
    expect((await call(ctx, 'PUT', '/api/v1/bank-accounts/VCB', bank({ accountCode: '11210006' }))).status).toBe(200);
    methods = (await call(ctx, 'GET', '/api/v1/posting/payment-methods')).body.data;
    expect(methods.find((m: { code: string }) => m.code === 'CK')).toMatchObject({ accountCode: '11210006' });
    expect((await call(ctx, 'PUT', '/api/v1/posting/payment-methods/QR', { name: 'QR', accountCode: '1111', bankAccountCode: 'KHONG-CO' })).status).toBe(400);
  });
});
