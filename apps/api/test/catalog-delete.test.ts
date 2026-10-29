/**
 * Nút Xoá và loại cha ở các màn danh mục: loại tài sản (ACC37), loại thuế (ACC43).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;

beforeAll(async () => {
  ctx = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Loại tài sản: loại cha, xoá', () => {
  it('loại cha khai tài khoản tổng hợp sau khi có loại con; chặn xoá loại cha, xoá được loại con chưa dùng', async () => {
    const parent = await call(ctx, 'POST', '/api/v1/asset-categories', { code: 'NHOM-TS', name: 'Nhóm tài sản thử', kind: 'fixed_asset', assetAccount: '2112', depreciationAccount: '2141', expenseAccount: '6424' });
    expect(parent.status, JSON.stringify(parent.body)).toBe(201);
    const child = await call(ctx, 'POST', '/api/v1/asset-categories', { code: 'MAY-THU', name: 'Máy thử', kind: 'fixed_asset', assetAccount: '2112', depreciationAccount: '2141', expenseAccount: '6424', parentCode: 'NHOM-TS' });
    expect(child.status, JSON.stringify(child.body)).toBe(201);
    expect((await call(ctx, 'POST', '/api/v1/asset-categories', { code: 'X', name: 'X', kind: 'tool', depreciationAccount: '2421', expenseAccount: '6423', parentCode: 'KHONG-CO' })).status).toBe(400);
    // Đã có loại con: sửa loại cha sang tài khoản tổng hợp 211 được.
    const edit = await call(ctx, 'PATCH', '/api/v1/asset-categories/NHOM-TS', { code: 'NHOM-TS', name: 'Nhóm tài sản thử', kind: 'fixed_asset', assetAccount: '211', depreciationAccount: '2141', expenseAccount: '6424' });
    expect(edit.status, JSON.stringify(edit.body)).toBe(200);
    const list = (await call(ctx, 'GET', '/api/v1/asset-categories')).body.data;
    expect(list.find((c: { code: string }) => c.code === 'MAY-THU')).toMatchObject({ parentCode: 'NHOM-TS' });
    expect((await call(ctx, 'DELETE', '/api/v1/asset-categories/NHOM-TS')).status).toBe(409);
    expect((await call(ctx, 'DELETE', '/api/v1/asset-categories/MAY-THU')).status).toBe(200);
    expect((await call(ctx, 'DELETE', '/api/v1/asset-categories/NHOM-TS')).status).toBe(200);
  });
});

describe('Loại thuế: xoá', () => {
  it('xoá loại thuế chưa dùng; mã không có báo không tìm thấy', async () => {
    expect((await call(ctx, 'POST', '/api/v1/tax-codes', { code: 'THU5', name: 'Thử 5%', rate: 5, direction: 'output', accountCode: '33311', reportGroup: '5' })).status).toBe(201);
    expect((await call(ctx, 'DELETE', '/api/v1/tax-codes/THU5')).status).toBe(200);
    expect((await call(ctx, 'DELETE', '/api/v1/tax-codes/THU5')).status).toBe(404);
  });
});

describe('Đối tượng, nhóm đối tượng', () => {
  it('lưu thông tin công ty, quản lý; ghi người tạo; xoá đối tượng chưa có trên sổ, chặn đối tượng đã ghi sổ', async () => {
    const r = await call(ctx, 'PUT', '/api/v1/partners/NCC-THU', { name: 'NCC thử', kind: 'supplier', phone: '0241234567', mobile: '0901234567', companyName: 'Công ty TNHH Thử', companyAddress: 'Hà Nội', position: 'Giám đốc', contactName: 'Nguyễn A', shortName: 'THU', fax: '0247654321', website: 'thu.vn', branchCode: 'CN01' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ mobile: '0901234567', companyName: 'Công ty TNHH Thử', position: 'Giám đốc', branchCode: 'CN01', createdBy: expect.any(String) });
    expect(r.body.data.createdBy).not.toBe('');
    const found = (await call(ctx, 'GET', '/api/v1/partners?search=0901234567')).body.data;
    expect(found.map((p: { code: string }) => p.code)).toEqual(['NCC-THU']);
    expect((await call(ctx, 'DELETE', '/api/v1/partners/NCC-THU')).status).toBe(200);
    await call(ctx, 'PUT', '/api/v1/partners/NCC-SO', { name: 'NCC có sổ', kind: 'supplier' });
    const v = await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'payment', branchCode: 'CN01', docDate: '2026-10-05', description: 'Trả NCC', partnerCode: 'NCC-SO', lines: [{ debitAccount: '3312', creditAccount: '1111', amount: 1000 }] });
    expect(v.status, JSON.stringify(v.body)).toBe(201);
    const blocked = await call(ctx, 'DELETE', '/api/v1/partners/NCC-SO');
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toMatch(/đã có trên sổ/);
  });

  it('xoá nhóm: chặn nhóm đang có đối tượng', async () => {
    await call(ctx, 'PUT', '/api/v1/partner-groups/NHOM-THU', { name: 'Nhóm thử' });
    await call(ctx, 'PUT', '/api/v1/partners/KH-NHOM', { name: 'KH nhóm', groupCode: 'NHOM-THU' });
    expect((await call(ctx, 'DELETE', '/api/v1/partner-groups/NHOM-THU')).status).toBe(409);
    await call(ctx, 'PUT', '/api/v1/partners/KH-NHOM', { name: 'KH nhóm', groupCode: null });
    expect((await call(ctx, 'DELETE', '/api/v1/partner-groups/NHOM-THU')).status).toBe(200);
  });
});
