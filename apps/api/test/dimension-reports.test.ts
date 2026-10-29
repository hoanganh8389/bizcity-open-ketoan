/**
 * Báo cáo theo khoản mục, bộ phận, nhân viên (ACC47, ACC69, ACC75, ACC90).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const R = 'from=2026-10-01&to=2026-10-31';
const v = (docType: string, description: string, lines: Record<string, unknown>[]) =>
  call(ctx, 'POST', '/api/v1/vouchers', { docType, branchCode: 'CN01', docDate: '2026-10-10', description, lines });

beforeAll(async () => {
  ctx = await setupTenant();
  await call(ctx, 'POST', '/api/v1/branches', { code: 'CN02', name: 'Cửa hàng 02' });
  await call(ctx, 'PUT', '/api/v1/dimensions/cost_item/KM-DV', { name: 'Chi phí dịch vụ mua ngoài' });
  await call(ctx, 'PUT', '/api/v1/dimensions/cost_item/KM-DIEN', { name: 'Tiền điện', parentCode: 'KM-DV' });
  await call(ctx, 'PUT', '/api/v1/dimensions/cost_item/KM-VPP', { name: 'Văn phòng phẩm' });
  await call(ctx, 'PUT', '/api/v1/dimensions/department/BP-BH', { name: 'Bộ phận bán hàng' });
  await call(ctx, 'PUT', '/api/v1/dimensions/department/BP-QL', { name: 'Bộ phận quản lý' });
  await call(ctx, 'PUT', '/api/v1/dimensions/employee/NV01', { name: 'Nguyễn An' });
  await call(ctx, 'PUT', '/api/v1/partners/NCC-DIEN', { name: 'Điện lực', kind: 'supplier' });
  // Chi tiền điện có thuế: Nợ 64211 + Nợ 1331 / Có 1111 (một Có nhiều Nợ).
  const r1 = await v('payment', 'Tiền điện tháng 10', [{ debitAccount: '64211', creditAccount: '1111', amount: 1000000, costItem: 'KM-DIEN', department: 'BP-BH', employee: 'NV01', taxCode: 'V10', taxAmount: 100000 }]);
  expect(r1.status, JSON.stringify(r1.body)).toBe(201);
  const r2 = await v('payment', 'Mua văn phòng phẩm', [{ debitAccount: '64231', creditAccount: '1111', amount: 300000, costItem: 'KM-VPP', department: 'BP-QL' }]);
  expect(r2.status, JSON.stringify(r2.body)).toBe(201);
  const r3 = await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'manual', branchCode: 'CN02', docDate: '2026-10-12', description: 'Trích điện CN02', lines: [{ debitAccount: '64211', creditAccount: '33111', partnerCode: 'NCC-DIEN', amount: 500000, costItem: 'KM-DIEN', department: 'BP-BH' }] });
  expect(r3.status, JSON.stringify(r3.body)).toBe(201);
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Báo cáo theo khoản mục, bộ phận', () => {
  it('ACC47 chi tiết: lọc khoản mục, bộ phận; có TK đối ứng, tên khoản mục, nhân viên', async () => {
    const rows = (await call(ctx, 'GET', `/api/v1/reports/expense-detail?${R}&account=642&costItems=KM-DIEN`)).body.data;
    expect(rows.map((r: { branchCode: string; debit: number }) => [r.branchCode, r.debit])).toEqual([['CN01', 1000000], ['CN02', 500000]]);
    expect(rows[0]).toMatchObject({ counterAccounts: '1111', costItemName: 'Tiền điện', departmentName: 'Bộ phận bán hàng', employeeName: 'Nguyễn An' });
    expect((await call(ctx, 'GET', `/api/v1/reports/expense-detail?${R}&account=642&departments=BP-BH&branchCodes=CN02`)).body.data).toHaveLength(1);
  });

  it('ACC69 tổng hợp theo bộ phận, nhân viên', async () => {
    const dep = (await call(ctx, 'GET', `/api/v1/reports/dimension-summary?${R}&dimension=department&account=642`)).body.data;
    expect(dep).toEqual([expect.objectContaining({ code: 'BP-BH', name: 'Bộ phận bán hàng', accountCode: '64211', debit: 1500000, net: 1500000 }), expect.objectContaining({ code: 'BP-QL', accountCode: '64231', debit: 300000 })]);
    const emp = (await call(ctx, 'GET', `/api/v1/reports/dimension-summary?${R}&dimension=employee&account=642`)).body.data;
    expect(emp.map((r: { code: string; accountCode: string }) => `${r.code}:${r.accountCode}`)).toEqual(['NV01:64211']);
  });

  it('ACC75 nhật ký chi tiền theo khoản mục: gom về khoản mục gốc, gồm cả thuế của dòng chi phí', async () => {
    const d = (await call(ctx, 'GET', `/api/v1/reports/cash-payments-by-item?${R}`)).body.data;
    expect(d.columns).toEqual([{ code: 'KM-DV', name: 'Chi phí dịch vụ mua ngoài' }, { code: 'KM-VPP', name: 'Văn phòng phẩm' }]);
    const dien = d.rows.find((r: { description: string }) => r.description.includes('điện'));
    // Dòng thuế mang khoản mục của dòng chi phí: số chi cho khoản mục gồm cả thuế (tiền thực chi).
    expect(dien).toMatchObject({ total: 1100000, other: 0, otherAccounts: '' });
    expect(dien.byItem['KM-DV']).toBe(1100000);
    expect(d.rows).toHaveLength(2);
  });

  it('ACC90 tổng hợp theo tài khoản × khoản mục, cột chi nhánh', async () => {
    const d = (await call(ctx, 'GET', `/api/v1/reports/expense-item-branch?${R}&account=642`)).body.data;
    expect(d.branches).toEqual(['CN01', 'CN02']);
    expect(d.rows.find((r: { costItemCode: string }) => r.costItemCode === 'KM-DIEN')).toMatchObject({ accountCode: '64211', total: 1500000, byBranch: { CN01: 1000000, CN02: 500000 } });
    const byDep = (await call(ctx, 'GET', `/api/v1/reports/expense-item-branch?${R}&account=642&byDepartment=true`)).body.data;
    expect(byDep.rows.find((r: { costItemCode: string }) => r.costItemCode === 'KM-DIEN')).toMatchObject({ departmentCode: 'BP-BH' });
  });
});
