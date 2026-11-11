// [2026-11-11 Nguyễn Văn Thủy] NHẬP EXCEL ĐỐI TƯỢNG (POST /api/v1/partners/import) cho trình nhập dùng chung (đóng góp)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const imp = async (body: Record<string, unknown>) => { const r = await call(ctx, 'POST', '/api/v1/partners/import', body); expect(r.status, JSON.stringify(r.body)).toBe(200); return r.body.data as { created: number; updated: number; failed: number; rows: { row: number; code: string; action: string; errors: string[]; values: Record<string, string> }[] }; };
const get = async (code: string) => ((await call(ctx, 'GET', `/api/v1/partners?search=${code}&status=all`)).body.data as Record<string, unknown>[]).find((p) => p.code === code);

beforeAll(async () => {
  ctx = await setupTenant();
  await call(ctx, 'PUT', '/api/v1/partner-groups/NKH', { name: 'Khách sỉ', kind: 'customer', isActive: true });
  await call(ctx, 'POST', '/api/v1/partners', { code: 'KHCU', name: 'Khách cũ', kind: 'customer', taxCode: '0100000001', phone: '0901' });
});
afterAll(async () => { await ctx.app.close(); });

describe('Nhập Excel đối tượng', () => {
  it('chạy thử: kiểm từng dòng, không ghi', async () => {
    const o = await imp({ dryRun: true, rows: [
      { row: 2, code: 'KH01', name: 'Khách một', kind: 'Khách hàng', groupCode: 'Khách sỉ', taxCode: '0100000002' },
      { row: 3, code: 'KH02', name: '', kind: 'KH' },
      { row: 4, code: 'KH03', name: 'Trùng MST', taxCode: '0100000001' },
      { row: 5, code: 'KH01', name: 'Trùng mã' },
      { row: 6, code: 'KH04', name: 'Sai', kind: 'xyz', email: 'abc', paymentTermDays: '-1', isActive: 'có lẽ' },
    ] });
    expect(o.rows.map((r) => r.action)).toEqual(['create', 'error', 'error', 'error', 'error']);
    expect(o.rows[0]!.values.groupCode).toBe('NKH — Khách sỉ');
    expect(o.rows[1]!.errors.join()).toContain('phải có tên');
    expect(o.rows[2]!.errors.join()).toContain('đã có ở đối tượng KHCU');
    expect(o.rows[3]!.errors.join()).toContain('Trùng mã với dòng 2');
    expect(o.rows[4]!.errors.length).toBe(4);
    expect(await get('KH01')).toBeUndefined();
  });

  it('ghi: dòng đúng vào sổ, dòng lỗi bỏ qua; mã trống tự cấp; ô trống giữ nguyên khi cập nhật', async () => {
    const o = await imp({ dryRun: false, rows: [
      { row: 2, code: 'KH01', name: 'Khách một', groupCode: 'NKH', paymentTermDays: '30', creditLimit: '5.000.000' },
      { row: 3, code: '', name: 'Khách tự cấp mã', kind: 'Khách hàng' },
      { row: 4, code: 'KHCU', name: '', address: 'Hà Nội' },
      { row: 5, code: 'KH09', name: '' },
    ] });
    expect([o.created, o.updated, o.failed]).toEqual([2, 1, 1]);
    const auto = o.rows.find((r) => r.row === 3)!;
    expect(auto.code).toMatch(/^KH/);
    expect((await get(auto.code))?.name).toBe('Khách tự cấp mã');
    const kh01 = await get('KH01');
    expect(kh01).toMatchObject({ name: 'Khách một', groupCode: 'NKH', paymentTermDays: 30, creditLimit: 5000000, isActive: true });
    expect(await get('KHCU')).toMatchObject({ name: 'Khách cũ', address: 'Hà Nội', phone: '0901', taxCode: '0100000001' });
  });

  it('chỉ thêm mới / chỉ cập nhật', async () => {
    const a = await imp({ dryRun: true, mode: 'create', rows: [{ row: 2, code: 'KHCU', name: 'x' }] });
    expect(a.rows[0]!.errors.join()).toContain('đã có');
    const b = await imp({ dryRun: true, mode: 'update', rows: [{ row: 2, code: 'KHMOI', name: 'x' }] });
    expect(b.rows[0]!.errors.join()).toContain('chưa có');
    const c = await imp({ dryRun: true, mode: 'update', rows: [{ row: 2, code: 'KHCU', note: 'ghi chú mới' }] });
    expect(c.rows[0]!.action).toBe('update');
  });

  it('nhà cung cấp: tên / địa chỉ vào thông tin công ty (dùng trên hoá đơn)', async () => {
    await imp({ dryRun: false, rows: [{ row: 2, code: 'NCC01', name: 'Công ty CP Sữa', kind: 'Nhà cung cấp', address: 'Bắc Ninh', taxCode: '0100000003' }] });
    expect(await get('NCC01')).toMatchObject({ kind: 'supplier', companyName: 'Công ty CP Sữa', companyAddress: 'Bắc Ninh' });
  });
});
