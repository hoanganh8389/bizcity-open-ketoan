/**
 * Kiểm thử: tạo đối tượng như màn "Khách hàng / Nhà cung cấp" HTsoft — gợi ý mã theo nhóm, chặn trùng mã, tra trùng số
 * điện thoại / mã số thuế, các trường thêm (ngày sinh, giới tính, alias, khách hàng tiềm năng, loại khách hàng).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../src/db/client.js';
import { nextCodeFrom } from '../src/modules/partners/partner-code.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
  await closeDb();
});

describe('Dãy mã', () => {
  it('chọn dãy đông nhất, giữ độ dài', () => {
    expect(nextCodeFrom(['NC100641', 'NC100642', 'NC209000', 'XDCB009'])).toMatchObject({ code: 'NC100643', series: 'NC1xxxxx', count: 2 });
    expect(nextCodeFrom(['202AA000295', '202AA000009', 'KH103389'])).toMatchObject({ code: '202AA000296' });
    expect(nextCodeFrom(['KH0099'])?.code).toBe('KH0100');
    expect(nextCodeFrom(['KH9999'])?.code).toBe('KH10000');
    expect(nextCodeFrom(['KHSHOPEE', 'C HIỀN'])).toBeNull();
    // Số điện thoại làm mã (khách lẻ POS) không phải dãy mã.
    expect(nextCodeFrom(['0912345678', '0987654321', '0901111111', 'KH000007'])?.code).toBe('KH000008');
    expect(nextCodeFrom(['0912345678'])).toBeNull();
  });
});

describe('Tạo đối tượng', () => {
  const create = (body: Record<string, unknown>) => call(ctx, 'POST', '/api/v1/partners', body);

  it('gợi ý mã theo nhóm; nhóm chưa có mã thì theo loại, rồi tiền tố mặc định', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/partner-groups/NCC-HH', { name: 'NCC hàng hoá', kind: 'supplier' })).status).toBe(200);
    expect((await call(ctx, 'PUT', '/api/v1/partner-groups/CHU-NHA', { name: 'Chủ nhà', kind: 'supplier' })).status).toBe(200);
    const empty = await call(ctx, 'GET', '/api/v1/partners/next-code?groupCode=NCC-HH&kind=supplier');
    expect(empty.body.data).toMatchObject({ basis: 'default', code: 'NCC000001' });
    for (const [code, groupCode] of [['NC100641', 'NCC-HH'], ['NC100642', 'NCC-HH'], ['NC400638', 'CHU-NHA']]) {
      expect((await create({ code, name: `NCC ${code}`, kind: 'supplier', groupCode })).status).toBe(201);
    }
    expect((await call(ctx, 'GET', '/api/v1/partners/next-code?groupCode=NCC-HH&kind=supplier')).body.data).toMatchObject({ code: 'NC100643', basis: 'group' });
    expect((await call(ctx, 'GET', '/api/v1/partners/next-code?groupCode=CHU-NHA&kind=supplier')).body.data).toMatchObject({ code: 'NC400639', basis: 'group' });
    // Mã gợi ý đã bị dùng ở nhóm khác: tăng tiếp.
    expect((await create({ code: 'NC100643', name: 'Lạc nhóm', kind: 'supplier', groupCode: 'CHU-NHA' })).status).toBe(201);
    expect((await call(ctx, 'GET', '/api/v1/partners/next-code?groupCode=NCC-HH&kind=supplier')).body.data.code).toBe('NC100644');
    expect((await call(ctx, 'GET', '/api/v1/partners/next-code?kind=internal')).body.data).toMatchObject({ basis: 'default', code: 'NB000001' });
  });

  it('một đối tượng nhiều vai trò: NCC vừa là khách hàng hiện ở cả hai danh sách; bỏ tích thì chỉ còn NCC', async () => {
    expect((await create({ code: 'NCC-KH-1', name: 'Đại lý vừa mua vừa bán', kind: 'supplier', alsoKinds: ['customer'] })).status).toBe(201);
    const inList = async (kind: string) => ((await call(ctx, 'GET', `/api/v1/partners?kind=${kind}&search=NCC-KH-1`)).body.data as { code: string; alsoKinds: string[] }[]).map((p) => p.code);
    expect(await inList('supplier')).toContain('NCC-KH-1');
    expect(await inList('customer')).toContain('NCC-KH-1');
    expect((await call(ctx, 'PUT', '/api/v1/partners/NCC-KH-1', { name: 'Đại lý vừa mua vừa bán', kind: 'supplier', alsoKinds: [] })).status).toBe(200);
    expect(await inList('customer')).not.toContain('NCC-KH-1');
    expect(await inList('supplier')).toContain('NCC-KH-1');
  });

  it('tạo mới trùng mã thì báo lỗi, không ghi đè', async () => {
    const dup = await create({ code: 'NC100641', name: 'Tên khác', kind: 'customer' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toContain('NCC NC100641');
    const kept = await call(ctx, 'GET', '/api/v1/partners?search=NC100641');
    expect(kept.body.data[0]).toMatchObject({ name: 'NCC NC100641', kind: 'supplier' });
  });

  it('hai người tạo cùng mã một lúc: một người được, người kia báo trùng', async () => {
    const [a, b] = await Promise.all([create({ code: 'NCC-DONG-THOI', name: 'Người A', kind: 'supplier' }), create({ code: 'NCC-DONG-THOI', name: 'Người B', kind: 'supplier' })]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const winner = a.status === 201 ? 'Người A' : 'Người B';
    expect((await call(ctx, 'GET', '/api/v1/partners?search=NCC-DONG-THOI')).body.data[0].name).toBe(winner);
  });

  it('lưu và trả các trường thêm', async () => {
    const res = await create({
      code: 'KH000001', name: 'Nguyễn Thị A', kind: 'customer', mobile: '0912000111', taxCode: '0101234567',
      birthDate: '1990-05-20', gender: 'female', alias: 'Chị A bỉm sữa', isProspect: true, customerType: 'personal',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ birthDate: '1990-05-20', gender: 'female', alias: 'Chị A bỉm sữa', isProspect: true, customerType: 'personal', createdBy: expect.any(String) });
    expect((await call(ctx, 'GET', '/api/v1/partners?search=bỉm')).body.data.map((p: any) => p.code)).toEqual(['KH000001']);
  });

  it('tra trùng số điện thoại, mã số thuế', async () => {
    expect((await call(ctx, 'GET', '/api/v1/partners/lookup?phone=0912000111')).body.data.map((p: any) => p.code)).toEqual(['KH000001']);
    expect((await call(ctx, 'GET', '/api/v1/partners/lookup?taxCode=0101234567')).body.data.map((p: any) => p.code)).toEqual(['KH000001']);
    expect((await call(ctx, 'GET', '/api/v1/partners/lookup?phone=0912000111&exclude=KH000001')).body.data).toEqual([]);
    expect((await call(ctx, 'GET', '/api/v1/partners/lookup')).body.data).toEqual([]);
  });

  it('mã số thuế là duy nhất: tạo / sửa sang MST đã có ở đối tượng khác thì báo trùng; giữ nguyên MST cũ vẫn sửa được', async () => {
    const dup = await create({ code: 'NC-TRUNG-MST', name: 'Trùng MST', kind: 'supplier', taxCode: '0101234567' });
    expect(dup.status).toBe(409);
    expect(JSON.stringify(dup.body)).toContain('KH000001');
    expect((await create({ code: 'NC-MST-KHAC', name: 'MST khác', kind: 'supplier', taxCode: '0109999999' })).status).toBe(201);
    expect((await call(ctx, 'PUT', '/api/v1/partners/NC-MST-KHAC', { name: 'MST khác', kind: 'supplier', taxCode: '0101234567' })).status).toBe(409);
    expect((await call(ctx, 'PUT', '/api/v1/partners/NC-MST-KHAC', { name: 'MST khác (đổi tên)', kind: 'supplier', taxCode: '0109999999' })).status).toBe(200);
    expect((await call(ctx, 'PUT', '/api/v1/partners/NC-MOI-PUT', { name: 'Tạo bằng PUT', kind: 'supplier', taxCode: '0109999999' })).status).toBe(409);
  });

  it('sửa bằng PUT vẫn như cũ; xoá ngày sinh', async () => {
    const res = await call(ctx, 'PUT', '/api/v1/partners/KH000001', { name: 'Nguyễn Thị A', kind: 'customer', birthDate: '', gender: '' });
    expect(res.status).toBe(200);
    const p = (await call(ctx, 'GET', '/api/v1/partners?search=KH000001')).body.data[0];
    expect(p).toMatchObject({ birthDate: null, gender: '', alias: 'Chị A bỉm sữa', isProspect: true });
  });
});
