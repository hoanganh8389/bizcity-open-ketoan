/**
 * Kế hoạch tài chính (KT-30), định mức chi phí (KT-32), cảnh báo (KT-31).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const plus = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** Ngày "sắp đến hạn": vài ngày tới nhưng không sang tháng sau (chạy cuối tháng thì là ngày cuối tháng). */
const soon = (() => { const d = plus(3); return d.slice(0, 7) === today.slice(0, 7) ? d : (() => { const e = new Date(Date.parse(`${today.slice(0, 7)}-01T00:00:00Z`)); e.setUTCMonth(e.getUTCMonth() + 1); e.setUTCDate(0); return e.toISOString().slice(0, 10); })(); })();
const nextMonth = (() => { const d = new Date(Date.parse(`${today.slice(0, 7)}-01T00:00:00Z`)); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); })();
const manual = (docDate: string, description: string, lines: Record<string, unknown>[], extra: Record<string, unknown> = {}) =>
  call(ctx, 'POST', '/api/v1/vouchers', { docType: 'manual', branchCode: 'CN01', docDate, description, lines, ...extra });

beforeAll(async () => {
  ctx = await setupTenant();
  await call(ctx, 'PUT', '/api/v1/partners/KH-01', { name: 'Khách 01', kind: 'customer' });
  await call(ctx, 'PUT', '/api/v1/partners/NCC-01', { name: 'NCC 01', kind: 'supplier' });
  await call(ctx, 'PUT', '/api/v1/dimensions/cost_item/KM-DIEN', { name: 'Tiền điện' });
  await call(ctx, 'PUT', '/api/v1/dimensions/cost_item/KM-NUOC', { name: 'Tiền nước' });
  // Phải thu đến hạn tháng sau, phải trả đến hạn tháng sau; một khoản quá hạn, một khoản sắp đến hạn.
  expect((await manual(today, 'Bán chịu', [{ debitAccount: '1311', creditAccount: '51111', amount: 10000000, partnerCode: 'KH-01' }], { dueDate: `${nextMonth}-10` })).status).toBe(201);
  expect((await manual(today, 'Mua dịch vụ', [{ debitAccount: '64211', creditAccount: '33111', amount: 4000000, partnerCode: 'NCC-01', costItem: 'KM-DIEN' }], { dueDate: `${nextMonth}-20` })).status).toBe(201);
  expect((await manual(plus(-20), 'Bán chịu cũ', [{ debitAccount: '1311', creditAccount: '51111', amount: 3000000, partnerCode: 'KH-01' }], { dueDate: plus(-5) })).status).toBe(201);
  expect((await manual(today, 'Mua sắp đến hạn', [{ debitAccount: '64211', creditAccount: '33111', amount: 1500000, partnerCode: 'NCC-01', costItem: 'KM-NUOC' }], { dueDate: soon })).status).toBe(201);
  // Hợp đồng thuê: một kỳ tháng sau, một kỳ sắp đến; hợp đồng sắp hết hạn.
  await call(ctx, 'PUT', '/api/v1/dimensions/contract/HD-THUE', { name: 'Thuê shop', extra: { type: 'rent', partnerCode: 'NCC-01', endDate: plus(20) } });
  await call(ctx, 'PUT', '/api/v1/contracts/HD-THUE/schedules', { schedules: [
    { seq: 1, dueDate: soon, amount: 20000000, taxAmount: 2000000 },
    // Kỳ 2 ngày 28 tháng sau: luôn thuộc tháng sau và luôn ngoài khoảng cảnh báo 15 ngày (ngày 05 lọt vào khi chạy cuối tháng).
    { seq: 2, dueDate: `${nextMonth}-28`, amount: 20000000, taxAmount: 2000000 },
  ] });
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Kế hoạch thu chi', () => {
  it('điền từ khoản công nợ đến hạn và lịch hợp đồng; điền lại không trùng; thêm dòng tay; so thực hiện', async () => {
    const fill = await call(ctx, 'POST', '/api/v1/cash-plans/fill', { period: nextMonth });
    expect(fill.status, JSON.stringify(fill.body)).toBe(200);
    expect(fill.body.data).toMatchObject({ debts: 2, contracts: 1 });
    expect((await call(ctx, 'POST', '/api/v1/cash-plans/fill', { period: nextMonth })).body.data.removed).toBe(0);
    expect((await call(ctx, 'POST', '/api/v1/cash-plans', { period: nextMonth, branchCode: 'CN01', direction: 'out', description: 'Lương', amount: 30000000 })).status).toBe(201);
    const rows = (await call(ctx, 'GET', `/api/v1/cash-plans?from=${nextMonth}&to=${nextMonth}`)).body.data;
    expect(rows.map((r: { direction: string; amount: number; source: string }) => `${r.direction}:${r.amount}:${r.source}`).sort()).toEqual(['in:10000000:debt', 'out:22000000:contract', 'out:30000000:manual', 'out:4000000:debt']);

    const rep = (await call(ctx, 'GET', `/api/v1/reports/cash-plan-vs-actual?from=${nextMonth}&to=${nextMonth}`)).body.data.rows;
    const cn01 = rep.find((r: { branchCode: string }) => r.branchCode === 'CN01');
    expect(cn01).toMatchObject({ planIn: 10000000, planOut: 34000000, actualIn: 0, actualOut: 0 });
    expect(rep.find((r: { branchCode: string }) => r.branchCode === '')).toMatchObject({ planOut: 22000000 });
  });
});

describe('Định mức chi phí', () => {
  it('khai định mức, chép sang tháng khác, so thực tế', async () => {
    const m = today.slice(0, 7);
    expect((await call(ctx, 'PUT', '/api/v1/cost-norms', { period: m, items: [{ branchCode: 'CN01', costItemCode: 'KM-DIEN', amount: 3000000 }, { branchCode: null, costItemCode: 'KM-NUOC', amount: 2000000 }] })).status).toBe(200);
    expect((await call(ctx, 'PUT', '/api/v1/cost-norms', { period: m, items: [{ costItemCode: 'KHONG-CO', amount: 1 }] })).status).toBe(400);
    expect((await call(ctx, 'POST', '/api/v1/cost-norms/copy', { from: m, to: [nextMonth] })).body.data).toEqual({ copied: 2, months: 1 });
    expect((await call(ctx, 'GET', `/api/v1/cost-norms?period=${nextMonth}`)).body.data).toHaveLength(2);

    const rep = (await call(ctx, 'GET', `/api/v1/reports/cost-vs-norm?from=${m}&to=${m}`)).body.data.rows;
    const dien = rep.find((r: { branchCode: string; costItemCode: string }) => r.branchCode === 'CN01' && r.costItemCode === 'KM-DIEN');
    expect(dien).toMatchObject({ norm: 3000000, actual: 4000000, diff: 1000000, over: true, costItemName: 'Tiền điện' });
    const nuoc = rep.find((r: { branchCode: string; costItemCode: string }) => r.branchCode === '' && r.costItemCode === 'KM-NUOC');
    expect(nuoc).toMatchObject({ norm: 2000000, actual: 1500000, diff: -500000, over: false, pct: 75 });
  });

  it('định mức theo bộ phận: so với chi phí của bộ phận đó; "mọi bộ phận" so với tổng; bộ phận lạ bị từ chối', async () => {
    const m = today.slice(0, 7);
    await call(ctx, 'PUT', '/api/v1/dimensions/cost_item/KM-VPP', { name: 'Văn phòng phẩm' });
    await call(ctx, 'PUT', '/api/v1/dimensions/department/BP-QL', { name: 'Bộ phận quản lý' });
    await call(ctx, 'PUT', '/api/v1/dimensions/department/BP-BH', { name: 'Bộ phận bán hàng' });
    expect((await manual(today, 'VPP quản lý', [{ debitAccount: '64231', creditAccount: '1111', amount: 700000, costItem: 'KM-VPP', department: 'BP-QL' }])).status).toBe(201);
    expect((await manual(today, 'VPP bán hàng', [{ debitAccount: '64231', creditAccount: '1111', amount: 200000, costItem: 'KM-VPP', department: 'BP-BH' }])).status).toBe(201);
    expect((await call(ctx, 'PUT', '/api/v1/cost-norms', { period: m, items: [{ branchCode: 'CN01', departmentCode: 'KHONG-CO', costItemCode: 'KM-VPP', amount: 1 }] })).status).toBe(400);
    const put = await call(ctx, 'PUT', '/api/v1/cost-norms', { period: m, items: [
      { branchCode: 'CN01', departmentCode: 'BP-QL', costItemCode: 'KM-VPP', amount: 500000 },
      { branchCode: null, departmentCode: null, costItemCode: 'KM-VPP', amount: 1000000 },
    ] });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect((await call(ctx, 'GET', `/api/v1/cost-norms?period=${m}`)).body.data.find((n: { departmentCode: string | null }) => n.departmentCode === 'BP-QL')).toMatchObject({ branchCode: 'CN01', amount: 500000 });
    const rep = (await call(ctx, 'GET', `/api/v1/reports/cost-vs-norm?from=${m}&to=${m}`)).body.data.rows.filter((r: { costItemCode: string }) => r.costItemCode === 'KM-VPP');
    expect(rep).toEqual([
      expect.objectContaining({ branchCode: '', departmentCode: '', norm: 1000000, actual: 900000, over: false }),
      expect.objectContaining({ branchCode: 'CN01', departmentCode: 'BP-QL', departmentName: 'Bộ phận quản lý', norm: 500000, actual: 700000, diff: 200000, over: true }),
    ]);
  });
});

describe('Cảnh báo', () => {
  it('công nợ quá hạn, sắp đến hạn; kỳ thanh toán hợp đồng; hợp đồng sắp hết hạn', async () => {
    const a = (await call(ctx, 'GET', '/api/v1/alerts')).body.data;
    expect(a.receivable.overdue).toEqual({ count: 1, amount: 3000000 });
    expect(a.payable.dueSoon).toEqual({ count: 1, amount: 1500000 });
    expect(a.contractPayments).toEqual([expect.objectContaining({ contractCode: 'HD-THUE', seq: 1, amount: 22000000 })]);
    expect(a.contractsExpiring).toEqual([expect.objectContaining({ code: 'HD-THUE' })]);
  });

  it('lỗi kiểm tra dữ liệu trả câu tiếng Việt (danh sách rỗng, thiếu trường)', async () => {
    const empty = await call(ctx, 'PUT', '/api/v1/cost-norms', { period: '2026-10', items: [] });
    expect(empty.status).toBe(400);
    expect(empty.body.error.details).toEqual(['Danh sách: phải có ít nhất 1 dòng']);
    const blank = await call(ctx, 'PUT', '/api/v1/cost-norms', { period: '2026-10', items: [{ costItemCode: '', amount: 1 }] });
    expect(blank.body.error.details).toEqual(['Danh sách › dòng 1 › Khoản mục: không được để trống']);
  });
});
