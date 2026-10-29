/**
 * Hợp đồng mở rộng và lịch thanh toán (kế hoạch Đợt 1, hạng mục 1.3).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;

async function userCtx(email: string, role: string): Promise<TestCtx> {
  expect((await call(ctx, 'POST', '/api/v1/users', { email, fullName: email.split('@')[0], role, password: 'Pass@12345' })).status).toBe(201);
  const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password: 'Pass@12345' } });
  return { ...ctx, token: res.json().data.token };
}

beforeAll(async () => {
  ctx = await setupTenant();
  await call(ctx, 'PUT', '/api/v1/partners/CN-NHA-01', { name: 'Ông Nguyễn Văn Chủ', kind: 'supplier', groupCode: 'CHU-NHA' });
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Hợp đồng và lịch thanh toán', () => {
  it('khai hợp đồng thuê nhà, phụ lục trỏ về hợp đồng gốc', async () => {
    const extra = { type: 'rent', partnerCode: 'CN-NHA-01', signedDate: '2026-01-01', endDate: '2028-12-31', value: 720000000, landlordTax: true };
    expect((await call(ctx, 'PUT', '/api/v1/dimensions/contract/HD-THUE-01', { name: 'Thuê mặt bằng shop HN01', extra })).status).toBe(200);
    expect((await call(ctx, 'PUT', '/api/v1/dimensions/contract/HD-THUE-01-PL1', { name: 'Phụ lục tăng giá', parentCode: 'HD-THUE-01', extra: { type: 'rent' } })).status).toBe(200);
    expect((await call(ctx, 'PUT', '/api/v1/dimensions/contract/HD-VAY-01', { name: 'Vay ngân hàng', extra: { type: 'credit' } })).status).toBe(200);
    const list = await call(ctx, 'GET', '/api/v1/dimensions/contract');
    expect(list.body.data.find((c: { code: string }) => c.code === 'HD-THUE-01-PL1')).toMatchObject({ parentCode: 'HD-THUE-01' });
  });

  it('lưu lịch; trùng số kỳ bị từ chối; hợp đồng không có thì báo không tìm thấy', async () => {
    const bad = await call(ctx, 'PUT', '/api/v1/contracts/HD-THUE-01/schedules', { schedules: [{ seq: 1, dueDate: '2026-10-05', amount: 1 }, { seq: 1, dueDate: '2026-11-05', amount: 1 }] });
    expect(bad.status).toBe(400);
    expect((await call(ctx, 'PUT', '/api/v1/contracts/KHONG-CO/schedules', { schedules: [] })).status).toBe(404);
    const r = await call(ctx, 'PUT', '/api/v1/contracts/HD-THUE-01/schedules', { schedules: [
      { seq: 1, dueDate: '2026-09-05', amount: 20000000, taxAmount: 2000000, description: 'Tháng 9' },
      { seq: 2, dueDate: '2026-10-05', amount: 20000000, taxAmount: 2000000, description: 'Tháng 10' },
      { seq: 3, dueDate: '2026-11-05', amount: 20000000, taxAmount: 2000000, description: 'Tháng 11' },
    ] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await call(ctx, 'PUT', '/api/v1/contracts/HD-VAY-01/schedules', { schedules: [{ seq: 1, dueDate: '2026-10-20', amount: 50000000 }] })).status).toBe(200);
    const own = await call(ctx, 'GET', '/api/v1/contracts/HD-THUE-01/schedules');
    expect(own.body.data.map((s: { seq: number; amount: number; taxAmount: number }) => [s.seq, s.amount, s.taxAmount])).toEqual([[1, 20000000, 2000000], [2, 20000000, 2000000], [3, 20000000, 2000000]]);
  });

  it('danh sách đến hạn: lọc theo ngày, loại; đánh dấu đã trả', async () => {
    const due = await call(ctx, 'GET', '/api/v1/contract-schedules?to=2026-10-31');
    expect(due.body.data.map((s: { contractCode: string; seq: number }) => `${s.contractCode}#${s.seq}`)).toEqual(['HD-THUE-01#1', 'HD-THUE-01#2', 'HD-VAY-01#1']);
    expect(due.body.data[0]).toMatchObject({ contractType: 'rent', partnerCode: 'CN-NHA-01', partnerName: 'Ông Nguyễn Văn Chủ', overdue: true });
    const rent = await call(ctx, 'GET', '/api/v1/contract-schedules?to=2026-12-31&type=rent');
    expect(rent.body.data).toHaveLength(3);

    const paid = await call(ctx, 'PATCH', `/api/v1/contract-schedules/${due.body.data[0].id}`, { status: 'paid', paidDate: '2026-09-05', paidRef: 'UNC 15' });
    expect(paid.body.data).toMatchObject({ status: 'paid', paidDate: '2026-09-05', paidRef: 'UNC 15' });
    const after = await call(ctx, 'GET', '/api/v1/contract-schedules?to=2026-10-31');
    expect(after.body.data).toHaveLength(2);
    const all = await call(ctx, 'GET', '/api/v1/contract-schedules?to=2026-10-31&status=all');
    expect(all.body.data).toHaveLength(3);
  });

  it('lập yêu cầu thanh toán từ kỳ: một kỳ một yêu cầu; kỳ đã trả không lập được; chi xong kỳ tự sang đã trả', async () => {
    const kt = await userCtx('kt-hd@ketoan.local', 'accountant');
    const ktt = await userCtx('ktt-hd@ketoan.local', 'chief_accountant');
    const due = (await call(ctx, 'GET', '/api/v1/contract-schedules?to=2026-10-31&status=all')).body.data;
    const k2 = due.find((s: { contractCode: string; seq: number }) => s.contractCode === 'HD-THUE-01' && s.seq === 2);
    const k1 = due.find((s: { contractCode: string; seq: number }) => s.contractCode === 'HD-THUE-01' && s.seq === 1);
    const body = (id: string) => ({ requestDate: '2026-10-05', branchCode: 'CN01', partnerCode: 'CN-NHA-01', method: 'cash', description: 'Thuê nhà kỳ 2', sourceRef: 'HD-THUE-01', amount: 22000000, debitAccount: '', contractScheduleId: id, submit: true });
    const acc = (await call(ctx, 'GET', '/api/v1/accounts')).body.data.find((a: { code: string; isPosting: boolean }) => a.isPosting && a.code.startsWith('6421'));
    const b2 = { ...body(k2.id), debitAccount: acc.code };
    expect((await call(kt, 'POST', '/api/v1/payment-requests', { ...b2, contractScheduleId: k1.id })).status).toBe(409);
    const c = await call(kt, 'POST', '/api/v1/payment-requests', b2);
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    const id = c.body.data.id;
    expect((await call(kt, 'POST', '/api/v1/payment-requests', b2)).status).toBe(409);
    const listed = (await call(ctx, 'GET', '/api/v1/contract-schedules?to=2026-10-31')).body.data.find((s: { id: string }) => s.id === k2.id);
    expect(listed).toMatchObject({ paymentRequestStatus: 'submitted' });
    expect(listed.paymentRequestNo).toMatch(/^YC/);
    await call(ktt, 'POST', `/api/v1/payment-requests/${id}/approve`);
    if ((await call(ctx, 'GET', `/api/v1/payment-requests/${id}`)).body.data.status === 'approved1') await call(ctx, 'POST', `/api/v1/payment-requests/${id}/approve`);
    const paid = await call(kt, 'POST', `/api/v1/payment-requests/${id}/pay`, { docDate: '2026-10-05', moneyAccount: '1111' });
    expect(paid.status, JSON.stringify(paid.body)).toBe(200);
    const k2after = (await call(ctx, 'GET', '/api/v1/contract-schedules?to=2026-10-31&status=all')).body.data.find((s: { id: string }) => s.id === k2.id);
    expect(k2after).toMatchObject({ status: 'paid', paidDate: '2026-10-05' });
  });
});
