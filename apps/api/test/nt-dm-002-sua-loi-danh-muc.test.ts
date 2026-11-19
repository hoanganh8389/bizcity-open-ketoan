// [2026-11-17 07:32 PM kiennt] NT-DM-002 — thùng rác chặn xoá cha còn con / mục đang dùng (L02, L03); chống vòng nhóm đối tượng (L06) (đóng góp)
/**
 * NT-DM-002 — sửa lỗi danh mục đợt kiểm thử 17/11/2026.
 *   L02: xoá tài khoản / nhóm hàng còn mục con → bỏ qua, báo "còn mục con"; xoá cha + con cùng lượt → xoá được cả hai.
 *   L03: loại thuế không xoá được (danh mục cố định — NT-DM-012); ngân hàng HTTT đang dùng, nhóm đối tượng đang có đối tượng → bỏ qua, báo "đang được dùng".
 *   Mục không vướng vẫn vào thùng rác như cũ.
 *   L06: đặt nhóm cha của nhóm đối tượng là nhóm con / cháu của chính nó → 400.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

type Res = { done: number; skipped: { key: string; reason: string }[] };
let ctx: TestCtx;
const xoa = async (catalog: string, keys: string[]) => {
  const r = await call<{ data: Res }>(ctx, 'POST', '/api/v1/catalog-trash/trash', { catalog, keys });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data;
};
const taoTK = async (code: string, parentCode: string) => {
  const r = await call(ctx, 'POST', '/api/v1/accounts', { code, name: `TK thử ${code}`, parentCode });
  expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
};

describe('NT-DM-002 — thùng rác danh mục và nhóm đối tượng', () => {
  beforeAll(async () => { ctx = await setupTenant(); });

  it('L02: tài khoản còn TK con không xoá được; xoá con trước rồi cha thì được; cha + con cùng lượt cũng được', async () => {
    await taoTK('1387', '138');
    await taoTK('13871', '1387');
    const a = await xoa('accounts', ['1387']);
    expect(a.done).toBe(0);
    expect(a.skipped[0]!.reason).toMatch(/còn mục con \(13871\)/);
    const b = await xoa('accounts', ['1387', '13871']);
    expect(b.done).toBe(2);
    expect(b.skipped).toHaveLength(0);
  });

  it('L02: nhóm hàng còn nhóm con không xoá được', async () => {
    const put = (code: string, body: Record<string, unknown>) => call(ctx, 'PUT', `/api/v1/item-classes/group/${code}?new=1`, body);
    expect((await put('NTCHA', { name: 'Ngành thử', skuCode: '97' })).status).toBeLessThan(300);
    expect((await put('NTCON', { name: 'Nhãn thử', parentCode: 'NTCHA', skuCode: '971' })).status).toBeLessThan(300);
    const a = await xoa('item-classes.group', ['NTCHA']);
    expect(a.done).toBe(0);
    expect(a.skipped[0]!.key).toBe('Ngành thử');
    expect(a.skipped[0]!.reason).toMatch(/còn mục con \(Nhãn thử\)/);
  });

  // [2026-11-19 kiennt] NT-DM-012 — loại thuế cố định theo quy định: không còn thùng rác (không xoá được bất kể đang dùng hay không) (đóng góp)
  it('L03: loại thuế không xoá được — danh mục cố định, không có thùng rác (NT-DM-012)', async () => {
    const r = await call(ctx, 'POST', '/api/v1/catalog-trash/trash', { catalog: 'tax-codes', keys: ['R08'] });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain('chưa có thùng rác');
  });

  it('L03: ngân hàng đang được hình thức thanh toán dùng không xoá được; ngân hàng không ai dùng vẫn xoá', async () => {
    await taoTK('1128', '112');
    await taoTK('1127', '112');
    for (const [code, tk] of [['NHTHU', '1128'], ['NHRANH', '1127']]) {
      const r = await call(ctx, 'PUT', `/api/v1/bank-accounts/${code}`, { bankName: `Ngân hàng ${code}`, accountNo: '0123456789', accountCode: tk });
      expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    }
    const m = await call(ctx, 'PUT', '/api/v1/posting/payment-methods/CKTHU', { name: 'Chuyển khoản thử', accountCode: '1128', bankAccountCode: 'NHTHU' });
    expect(m.status, JSON.stringify(m.body)).toBeLessThan(300);
    const a = await xoa('bank-accounts', ['NHTHU', 'NHRANH']);
    expect(a.done).toBe(1);
    expect(a.skipped).toHaveLength(1);
    expect(a.skipped[0]!.key).toMatch(/^NHTHU/);
    expect(a.skipped[0]!.reason).toMatch(/hình thức thanh toán \(CKTHU\)/);
  });

  it('L06: không đặt nhóm cha là nhóm con / cháu của chính nó', async () => {
    const put = (code: string, body: Record<string, unknown>) => call(ctx, 'PUT', `/api/v1/partner-groups/${code}`, body);
    expect((await put('NTA', { name: 'Nhóm A' })).status).toBeLessThan(300);
    expect((await put('NTB', { name: 'Nhóm B', parentCode: 'NTA' })).status).toBeLessThan(300);
    expect((await put('NTC', { name: 'Nhóm C', parentCode: 'NTB' })).status).toBeLessThan(300);
    const vong = await put('NTA', { name: 'Nhóm A', parentCode: 'NTC' });
    expect(vong.status).toBe(400);
    expect(JSON.stringify(vong.body)).toMatch(/nhóm con \(hoặc cháu\) của NTA/);
    expect((await put('NTC', { name: 'Nhóm C', parentCode: 'NTA' })).status).toBeLessThan(300);
  });

  it('L03: nhóm đối tượng đang có đối tượng không xoá được', async () => {
    const p = await call(ctx, 'POST', '/api/v1/partners', { code: 'KHNTDM2', name: 'Khách thử NT-DM-002', kind: 'customer', groupCode: 'NTB' });
    expect(p.status, JSON.stringify(p.body)).toBeLessThan(300);
    const a = await xoa('partner-groups', ['NTB']);
    expect(a.done).toBe(0);
    expect(a.skipped[0]!.reason).toMatch(/còn mục con|đang được dùng ở đối tượng/);
  });
});
