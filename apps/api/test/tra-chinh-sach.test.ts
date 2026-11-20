// [2026-11-20 khanhtd] TRA-CUU — test tra chính sách theo mã (màn TC01): khớp bảng khuyến mại của phiếu nhập thật (đóng góp)
/**
 * TRA CHÍNH SÁCH THEO MÃ HÀNG (apps/api/src/phan-he/mua-hang/tra-chinh-sach.ts): mỗi chính sách khớp mã ra đúng một trạng thái
 * (đang áp / bị áp riêng chặn / chưa đủ điều kiện / không dùng) và câu vì sao; số tiền khớp computeDoc của phiếu nhập thật.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Policy } from '@bizcity/mua-hang-domain';
import { traChinhSach, type TraInput } from '../src/phan-he/mua-hang/tra-chinh-sach.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

const pol = (code: string, kind: Policy['kind'], rule: Record<string, unknown>, scope: Policy['scope'] = {}, priority = 0): Policy => ({ id: code, code, kind, name: `CT ${code}`, scope: { partnerCode: 'N1', ...scope }, isActive: true, rule, priority });
const tra = (policies: Policy[], o: Partial<TraInput> = {}) => traChinhSach({ sku: 'A', name: 'Hàng A', brandCode: 'TH', unit: 'Lon', qty: 10, price: 100_000, priceIncludesVat: false, date: '2026-11-20', branchCode: 'B', partnerCode: 'N1', policies, units: [{ unit: 'Lon', ratio: 1 }], ...o });
const row = (r: ReturnType<typeof tra>, code: string) => r.rows.find((x) => x.code === code);

describe('Tra chính sách theo mã — phần thuần', () => {
  it('CK theo mã 3% ÁP RIÊNG + CK trên đơn 7%: mã nhận 3%, 7% bị chặn — dù 7% lợi hơn', () => {
    const r = tra([pol('MA3', 'item_discount', { items: [{ sku: 'A', pct: 3 }], apply: 'exclusive' }), pol('CK7', 'trade_discount', { pct: 7 }, {}, 10)]);
    expect(row(r, 'MA3')).toMatchObject({ status: 'ap', winner: true, exclusive: true, amount: 30_000 });
    expect(row(r, 'CK7')).toMatchObject({ status: 'bi-chan', amount: 0, alone: { amount: 70_000 } });
    expect(row(r, 'CK7')!.reason).toContain('MA3');
    expect(r.total).toMatchObject({ gross: 1_000_000, lineDiscount: 30_000, orderDiscount: 0, after: 970_000 });
  });

  it('không tích áp riêng: CK dòng 3% và CK trên đơn 7% cùng áp', () => {
    const r = tra([pol('MA3', 'item_discount', { items: [{ sku: 'A', pct: 3 }] }), pol('CK7', 'trade_discount', { pct: 7 })]);
    expect(row(r, 'MA3')).toMatchObject({ status: 'ap', amount: 30_000 });
    expect(row(r, 'CK7')).toMatchObject({ status: 'ap', amount: 67_900 }); // 7% × 970.000
  });

  it('hai chương trình áp riêng: ưu tiên cao hơn thắng dù ít lợi hơn; ghi rõ vì sao', () => {
    const r = tra([pol('BAC5', 'qty_tier', { tiers: [{ from: 1, pct: 5 }], apply: 'exclusive' }, { sku: 'A' }), pol('MA3', 'item_discount', { items: [{ sku: 'A', pct: 3 }], apply: 'exclusive' }, {}, 1)]);
    expect(row(r, 'MA3')).toMatchObject({ status: 'ap', winner: true });
    expect(row(r, 'BAC5')).toMatchObject({ status: 'bi-chan' });
    expect(r.exclusiveNote).toContain('ưu tiên 1 > 0');
  });

  it('cùng ưu tiên: chương trình lợi hơn thắng', () => {
    const r = tra([pol('BAC5', 'qty_tier', { tiers: [{ from: 1, pct: 5 }], apply: 'exclusive' }, { sku: 'A' }), pol('MA3', 'item_discount', { items: [{ sku: 'A', pct: 3 }], apply: 'exclusive' })]);
    expect(row(r, 'BAC5')).toMatchObject({ status: 'ap', winner: true, amount: 50_000 });
    expect(r.exclusiveNote).toContain('lợi hơn');
  });

  it('bảng CK theo mã và bậc SL cùng khớp (không áp riêng): CK dòng chỉ lấy một nguồn — bậc SL "không dùng"', () => {
    const r = tra([pol('MA3', 'item_discount', { items: [{ sku: 'A', pct: 3 }] }), pol('BAC5', 'qty_tier', { tiers: [{ from: 1, pct: 5 }] }, { sku: 'A' })]);
    expect(row(r, 'MA3')!.status).toBe('ap');
    expect(row(r, 'BAC5')).toMatchObject({ status: 'khong-dung' });
    expect(row(r, 'BAC5')!.reason).toContain('MỘT nguồn');
  });

  it('SL chưa tới mức tối thiểu: "chưa đủ", gợi ý mua thêm', () => {
    const r = tra([pol('MA48', 'item_discount', { items: [{ sku: 'A', amount: 500, minQty: 48 }] })], { qty: 20 });
    expect(row(r, 'MA48')).toMatchObject({ status: 'chua-du', amount: 0 });
    expect(row(r, 'MA48')!.reason).toContain('48');
  });

  it('mua X tặng Y: đủ điều kiện thì "đang áp", quà vào tổng', () => {
    const r = tra([pol('KM', 'promo_gift', { items: [{ sku: 'A', buyQty: 5, buyUnit: 'Lon', getQty: 1, getUnit: 'Lon', repeat: true }] })]);
    expect(row(r, 'KM')!.status).toBe('ap');
    expect(row(r, 'KM')!.alone.gift).toContain('2 Lon');
    expect(r.total.gifts.length).toBe(1);
  });

  it('chính sách của NCC khác, mã khác, hết hạn không hiện; CKTT / hạn trả vào nhóm "khác"', () => {
    const r = tra([
      pol('N2', 'trade_discount', { pct: 5 }, { partnerCode: 'N2' }),
      pol('MB', 'item_discount', { items: [{ sku: 'B', pct: 3 }] }),
      { ...pol('CU', 'trade_discount', { pct: 9 }), validTo: '2026-01-01' },
      pol('TT', 'payment_discount', { pct: 2 }),
    ]);
    expect(r.rows.map((x) => x.code)).toEqual([]);
    expect(r.other.map((x) => x.code)).toEqual(['TT']);
  });
});

describe('Tra chính sách theo mã — qua API', () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await setupTenant();
    expect((await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' })).status).toBe(200);
  }, 60_000);
  afterAll(async () => { await t.app.close(); });

  it('trả NCC chọn được, đơn giá và trạng thái từng chính sách; mã không có → 404', async () => {
    await call(t, 'PUT', '/api/v1/partners/NCC-TRA', { name: 'NCC tra cứu', kind: 'supplier' });
    const P = (body: Record<string, unknown>) => call(t, 'POST', '/api/v1/purchase/policies', body);
    expect((await P({ code: 'TRA-3', kind: 'item_discount', name: 'CK 3% riêng mã', scope: { partnerCode: 'NCC-TRA' }, rule: { items: [{ sku: '110154035', pct: 3 }], apply: 'exclusive' } })).status).toBeLessThan(300);
    expect((await P({ code: 'TRA-7', kind: 'trade_discount', name: 'CK 7% đơn', scope: { partnerCode: 'NCC-TRA' }, rule: { pct: 7 } })).status).toBeLessThan(300);
    const r = await call(t, 'GET', '/api/v1/purchase/policy-lookup?sku=110154035&partnerCode=NCC-TRA&qty=10&price=100000');
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d.partners.some((p: { code: string }) => p.code === 'NCC-TRA')).toBe(true);
    expect(d.input).toMatchObject({ partnerCode: 'NCC-TRA', qty: 10, price: 100000, priceSource: 'nhap' });
    expect(d.rows.find((x: { code: string }) => x.code === 'TRA-3')).toMatchObject({ status: 'ap', winner: true, amount: 30000 });
    expect(d.rows.find((x: { code: string }) => x.code === 'TRA-7')).toMatchObject({ status: 'bi-chan' });
    expect((await call(t, 'GET', '/api/v1/purchase/policy-lookup?sku=KHONG-CO-MA')).status).toBe(404);
  });

  it('quyền: gác bằng mua-hang:chinh-sach-xem — Người xem tra được; bị Cấm quyền đó → 403 (DANG-KY-QUYEN luật 7)', async () => {
    const ok = <T>(r: { status: number; body: { data: T } }) => { expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBeLessThan(300); return r.body.data; };
    const user = async (key: string, role: string) => {
      const email = `${key}@tracuu.local`;
      const u = ok(await call<{ data: { id: string } }>(t, 'POST', '/api/v1/users', { email, fullName: key, role, password: 'Tracuu@12345' }));
      const token = (await t.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: t.tenantCode, email, password: 'Tracuu@12345' } })).json().data.token as string;
      return { id: String(u.id), token };
    };
    const url = '/api/v1/purchase/policy-lookup?sku=110154035&qty=1&price=1000';
    const xem = await user('xem', 'viewer');
    expect((await call(t, 'GET', url, undefined, { authorization: `Bearer ${xem.token}` })).status).toBe(200);
    const kt = await user('ktcam', 'accountant');
    const r = ok(await call<{ data: { id: string } }>(t, 'POST', '/api/v1/roles', { code: 'cam_xem_cs', label: 'Cấm xem chính sách', kind: 'restriction', reason: 'Vai trò thử tra cứu' }));
    ok(await call(t, 'POST', `/api/v1/roles/${r.id}/rules`, { permission: 'mua-hang:chinh-sach-xem', effect: 'deny', reason: 'Luật thử tra cứu' }));
    ok(await call(t, 'POST', `/api/v1/users/${kt.id}/roles`, { tenantRoleId: r.id, reason: 'Gán thử' }));
    expect((await call(t, 'GET', url, undefined, { authorization: `Bearer ${kt.token}` })).status).toBe(403);
  });
});
