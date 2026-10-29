/**
 * Bổ sung danh mục: thông tin ngân hàng, đối tượng, nhóm cơ quan thuế / bảo hiểm; báo cáo lãi lỗ theo hợp đồng.
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

describe('Bổ sung danh mục', () => {
  it('nhóm cơ quan thuế, bảo hiểm thuộc nhóm cơ quan nhà nước', async () => {
    const g = (await call(ctx, 'GET', '/api/v1/partner-groups')).body.data;
    expect(g.filter((x: { parentCode: string | null }) => x.parentCode === 'CQNN').map((x: { code: string }) => x.code).sort()).toEqual(['CQ-BHXH', 'CQ-THUE']);
  });

  it('đối tượng: người đại diện, tài khoản ngân hàng, giới hạn số phiếu nợ; chứng từ không ghi đè', async () => {
    const r = await call(ctx, 'PUT', '/api/v1/partners/NCC-01', { name: 'Công ty Sữa', kind: 'supplier', contactName: 'Bà Lan', bankAccountNo: '0011002233', bankAccountHolder: 'CONG TY SUA', bankName: 'Vietcombank Hà Nội', maxOpenDocs: 5 });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ contactName: 'Bà Lan', bankAccountNo: '0011002233', bankName: 'Vietcombank Hà Nội', maxOpenDocs: 5 });
    await call(ctx, 'PUT', '/api/v1/partners', { partners: [{ code: 'NCC-01', name: 'Công ty Sữa Việt', kind: 'supplier' }] });
    const p = (await call(ctx, 'GET', '/api/v1/partners?search=NCC-01')).body.data[0];
    expect(p).toMatchObject({ name: 'Công ty Sữa Việt', bankAccountNo: '0011002233', maxOpenDocs: 5 });
  });

  it('ngân hàng: địa chỉ, điện thoại, người liên hệ', async () => {
    const r = await call(ctx, 'PUT', '/api/v1/bank-accounts/VCB', { bankName: 'Vietcombank', accountNo: '001100', accountCode: '11210005', bankAddress: '198 Trần Quang Khải', bankPhone: '024 3934 3137', contact: 'Chị Hoa' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await call(ctx, 'GET', '/api/v1/bank-accounts')).body.data[0]).toMatchObject({ bankAddress: '198 Trần Quang Khải', bankPhone: '024 3934 3137', contact: 'Chị Hoa' });
  });
});

describe('Lãi lỗ theo hợp đồng', () => {
  it('doanh thu trừ chi phí của dòng phiếu có gắn hợp đồng; chi tiết theo tài khoản', async () => {
    await call(ctx, 'PUT', '/api/v1/partners/KH-HD', { name: 'Khách hợp đồng', kind: 'customer' });
    expect((await call(ctx, 'PUT', '/api/v1/dimensions/contract/HD-01', { name: 'Hợp đồng cung cấp sữa', extra: { type: 'sale', partnerCode: 'KH-HD', value: 50000000, employeeCode: 'NV01' } })).status).toBe(200);
    const v = await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'manual', branchCode: 'CN01', docDate: '2026-10-10', description: 'Hợp đồng HD-01', lines: [
      { debitAccount: '1111', creditAccount: '51111', amount: 10000000, contract: 'HD-01' },
      { debitAccount: '64211', creditAccount: '1111', amount: 3000000, contract: 'HD-01' },
      { debitAccount: '64211', creditAccount: '1111', amount: 999, description: 'Không gắn hợp đồng' },
    ] });
    expect(v.status, JSON.stringify(v.body)).toBe(201);
    const range = 'from=2026-10-01&to=2026-10-31';
    const sum = (await call(ctx, 'GET', `/api/v1/reports/profit-by-contract?${range}`)).body.data;
    expect(sum.rows).toEqual([expect.objectContaining({ contractCode: 'HD-01', contractType: 'sale', partnerName: 'Khách hợp đồng', contractValue: 50000000, revenue: 10000000, cost: 3000000, profit: 7000000 })]);
    expect(sum.totals).toEqual({ revenue: 10000000, cost: 3000000, profit: 7000000 });
    const detail = (await call(ctx, 'GET', `/api/v1/reports/profit-by-contract?${range}&detail=true`)).body.data;
    expect(detail.rows.map((r: { accountCode: string; profit: number }) => [r.accountCode, r.profit])).toEqual([['51111', 10000000], ['64211', -3000000]]);
  });
});

describe('Thông tin đơn vị', () => {
  it('chủ sở hữu sửa tên, mã số thuế, địa chỉ; tên mới hiện ở phiên đăng nhập', async () => {
    const r = await call(ctx, 'PUT', '/api/v1/tenant', { name: 'Công ty Cổ phần Đầu tư Thế Giới Sữa', taxCode: '0106933743', address: 'Số 17 Ngõ 84 Phố Ngọc Khánh, Phường Giảng Võ, Quận Ba Đình, Hà Nội', phone: '1900 636 605' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await call(ctx, 'GET', '/api/v1/tenant')).body.data).toMatchObject({ name: 'Công ty Cổ phần Đầu tư Thế Giới Sữa', taxCode: '0106933743' });
    expect((await call(ctx, 'GET', '/api/v1/auth/me')).body.data.tenant.name).toBe('Công ty Cổ phần Đầu tư Thế Giới Sữa');
    expect((await call(ctx, 'PUT', '/api/v1/tenant', { name: 'X', taxCode: '123' })).status).toBe(400);
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PzWvWQAAAABJRU5ErkJggg==';
    const withLogo = await call(ctx, 'PUT', '/api/v1/tenant', { name: 'Công ty Cổ phần Đầu tư Thế Giới Sữa', logo: png });
    expect(withLogo.body.data.logo).toBe(png);
    expect((await call(ctx, 'PUT', '/api/v1/tenant', { name: 'Công ty Cổ phần Đầu tư Thế Giới Sữa' })).body.data.logo).toBe(png);
    expect((await call(ctx, 'PUT', '/api/v1/tenant', { name: 'Công ty', logo: 'data:image/svg+xml;base64,PHN2Zz4=' })).status).toBe(400);
    expect((await call(ctx, 'PUT', '/api/v1/tenant', { name: 'Công ty Cổ phần Đầu tư Thế Giới Sữa', logo: null })).body.data.logo).toBeNull();
  });
});

describe('Nhóm công cụ dụng cụ, mục đích sử dụng', () => {
  it('danh mục có sẵn hai nhóm; thẻ công cụ gắn nhóm, mục đích; mã lạ bị từ chối', async () => {
    const groups = (await call(ctx, 'GET', '/api/v1/dimensions/tool_group')).body.data.map((d: { code: string }) => d.code);
    expect(groups).toEqual(expect.arrayContaining(['PB001', 'PB002']));
    expect((await call(ctx, 'PUT', '/api/v1/dimensions/usage_purpose/MD-BH', { name: 'Dùng cho bán hàng' })).status).toBe(200);
    const card = { code: 'TU02', name: 'Tủ mát', kind: 'tool', categoryCode: 'CCDC-DH', branchCode: 'CN01', startDate: '2026-10-01',
      originalCost: 2400000, usefulLifeMonths: 24, depreciationAccount: '24228', expenseAccount: '64231' };
    const add = await call(ctx, 'POST', '/api/v1/assets', { ...card, toolGroupCode: 'PB001', usagePurposeCode: 'MD-BH' });
    expect(add.status, JSON.stringify(add.body)).toBe(201);
    const row = (await call(ctx, 'GET', '/api/v1/assets?kind=tool')).body.data.find((a: { code: string }) => a.code === 'TU02');
    expect(row).toMatchObject({ toolGroupCode: 'PB001', usagePurposeCode: 'MD-BH' });
    expect((await call(ctx, 'POST', '/api/v1/assets', { ...card, code: 'TU03', toolGroupCode: 'KHONG-CO' })).status).toBe(400);
  });
});
