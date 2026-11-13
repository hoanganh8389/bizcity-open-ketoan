// [2026-11-11 Nguyễn Văn Thủy] Hồ sơ in (HT16): gộp mặc định ← cả đơn vị ← chi nhánh, chỉ lưu phần khác mặc định (đóng góp)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => { ctx = await setupTenant(); });
afterAll(async () => { await ctx.app.close(); });

describe('Hồ sơ in', () => {
  it('chưa thiết lập: trả mặc định, đủ 5 chức danh ký', async () => {
    const r = await call(ctx, 'GET', '/api/v1/print-profile');
    expect(r.status).toBe(200);
    expect(r.body.data.effective.show).toMatchObject({ nameAddress: true, logo: true, align: 'left' });
    expect(r.body.data.effective.signers.map((s: { role: string }) => s.role)).toEqual(['director', 'chief_accountant', 'storekeeper', 'cashier', 'preparer']);
    expect(r.body.data.effective.signers[0]).toMatchObject({ title: 'Giám đốc', name: '' });
  });

  it('cả đơn vị rồi chi nhánh ghi đè; chuỗi rỗng không xoá giá trị cả đơn vị', async () => {
    const t = await call(ctx, 'PUT', '/api/v1/print-profile', { branchCode: '', profile: { company: { reportName: 'CÔNG TY THỬ', phone: '0241' }, show: { phone: true }, signers: [{ role: 'director', name: 'Nguyễn Văn A' }, { role: 'cashier', title: '', name: '' }] } });
    expect(t.status, JSON.stringify(t.body)).toBe(200);
    expect(t.body.data.profile.signers).toEqual([{ role: 'director', title: '', name: 'Nguyễn Văn A' }]);
    const b = await call(ctx, 'PUT', '/api/v1/print-profile', { branchCode: 'CN01', profile: { company: { reportName: '', address: 'Số 1 Phố Thử' }, signers: [{ role: 'director', title: 'Giám đốc chi nhánh', name: 'Trần B' }] } });
    expect(b.status, JSON.stringify(b.body)).toBe(200);
    const r = await call(ctx, 'GET', '/api/v1/print-profile?branchCode=CN01');
    const e = r.body.data.effective;
    expect(e.company).toMatchObject({ reportName: 'CÔNG TY THỬ', phone: '0241', address: 'Số 1 Phố Thử' });
    expect(e.show.phone).toBe(true);
    expect(e.signers[0]).toEqual({ role: 'director', title: 'Giám đốc chi nhánh', name: 'Trần B' });
    expect(r.body.data.branch).toMatchObject({ company: { address: 'Số 1 Phố Thử' } });
    // Chi nhánh khác vẫn theo cả đơn vị
    const t2 = await call(ctx, 'GET', '/api/v1/print-profile');
    expect(t2.body.data.effective.signers[0]).toEqual({ role: 'director', title: 'Giám đốc', name: 'Nguyễn Văn A' });
  });

  it('bỏ hồ sơ riêng chi nhánh thì về theo cả đơn vị; chặn chức danh lạ, chi nhánh không có', async () => {
    expect((await call(ctx, 'DELETE', '/api/v1/print-profile?branchCode=CN01')).status).toBe(200);
    const r = await call(ctx, 'GET', '/api/v1/print-profile?branchCode=CN01');
    expect(r.body.data.branch).toBeNull();
    expect(r.body.data.effective.company.address).toBe('');
    expect((await call(ctx, 'PUT', '/api/v1/print-profile', { profile: { signers: [{ role: 'boss', name: 'x' }] } })).status).toBe(400);
    expect((await call(ctx, 'PUT', '/api/v1/print-profile', { branchCode: 'KHONGCO', profile: {} })).status).toBe(400);
  });
});
