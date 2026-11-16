// [2026-11-13 08:00 PM kiennt] NT-HT-003 — phân hệ Bán hàng đăng ký màn BH10 / BH11 / BH12; lệnh cửa nạp (theo loại phiếu) và lệnh chương trình bán gác theo thao tác (đóng góp)
/**
 * Kiểm:
 * - GET /api/v1/man-hinh có 3 màn Bán hàng, quyền gác đúng;
 * - Kế toán làm mọi thao tác như cũ (documents:write kéo theo quyền chi tiết);
 * - vai trò hạn chế Cấm một quyền chi tiết chặn ĐÚNG thao tác đó (403), thao tác khác vẫn làm được;
 * - Người xem không ghi được.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const ids: Record<string, string> = {};
const tokens: Record<string, string> = {};
const ok = <T>(r: { status: number; body: { data: T } }) => { expect(r.status, JSON.stringify(r.body).slice(0, 500)).toBeLessThan(300); return r.body.data; };
const as = (who: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => call(ctx, method, url, payload, { authorization: `Bearer ${tokens[who]}` });
const today = new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const ct = (code: string) => ({ code, name: `Chương trình ${code}`, programKind: 'KM-CTY', mode: 'discount', sku: 'SUA01', discountPct: 5, validFrom: today, validTo: addDays(today, 30), quotas: [{ branchCode: 'CN01', quotaQty: 10 }] });
const ban = (n: number) => saleDoc({ docKey: `pqbh:CN01:HD${n}`, docNo: `PQ${n}`, invoice: undefined });

async function addUser(key: string, role: string) {
  const email = `${key}@pqbh.local`;
  const u = ok(await call<{ data: { id: string } }>(ctx, 'POST', '/api/v1/users', { email, fullName: key, role, password: 'Pqbh@12345' }));
  ids[key] = String(u.id);
  tokens[key] = (await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password: 'Pqbh@12345' } })).json().data.token;
}

beforeAll(async () => {
  ctx = await setupTenant();
  const tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  for (const [sku, name] of [['SUA01', 'Sữa bột 900g'], ['QUA01', 'Quà tặng']]) {
    await sql`INSERT INTO products (tenant_id, sku, name, unit) VALUES (${tenantId}, ${sku}, ${name}, 'Hộp') ON CONFLICT (tenant_id, sku) DO NOTHING`.execute(db);
  }
  await addUser('ketoan', 'accountant');
  await addUser('xem', 'viewer');
  await addUser('han', 'accountant');
  // Kế toán + vai trò hạn chế: Cấm sửa chương trình bán, Cấm huỷ hoá đơn bán hàng
  const r = ok(await call<{ data: { id: string } }>(ctx, 'POST', '/api/v1/roles', { code: 'han_che_ban_hang', label: 'Hạn chế bán hàng', kind: 'restriction', reason: 'Vai trò thử Bán hàng' }));
  for (const permission of ['ban-hang:chuong-trinh-sua', 'ban-hang:hoa-don-huy']) {
    ok(await call(ctx, 'POST', `/api/v1/roles/${r.id}/rules`, { permission, effect: 'deny', reason: 'Luật thử Bán hàng' }));
  }
  ok(await call(ctx, 'POST', `/api/v1/users/${ids.han}/roles`, { tenantRoleId: r.id, reason: 'Gán thử' }));
});
afterAll(async () => { await ctx.app.close(); });

describe('Bán hàng — màn × thao tác', () => {
  it('GET /man-hinh có BH10 / BH11 / BH12 kèm quyền gác', async () => {
    const ds = ok(await call<{ data: { key: string; ma: string; thaoTac: Record<string, { quyen: string }> }[] }>(ctx, 'GET', '/api/v1/man-hinh'));
    const pb = ds.find((m) => m.key === 'ban-hang.phieu-ban')!;
    expect(pb.ma).toBe('BH10');
    expect(pb.thaoTac.them!.quyen).toBe('ban-hang:hoa-don-lap');
    expect(pb.thaoTac.duyet!.quyen).toBe('ban-hang:hoa-don-duyet');
    expect(ds.find((m) => m.key === 'ban-hang.tra-lai')!.thaoTac.huy!.quyen).toBe('ban-hang:tra-hang-huy');
    expect(ds.find((m) => m.key === 'ban-hang.chuong-trinh')!.thaoTac.hanMuc!.quyen).toBe('ban-hang:chuong-trinh-han-muc');
  });

  it('quyền hiệu lực: Kế toán có đủ quyền chi tiết; Người xem chỉ quyền xem', async () => {
    const kt = (ok(await as('ketoan', 'GET', '/api/v1/auth/me')) as { permissions: string[] }).permissions;
    expect(kt).toEqual(expect.arrayContaining(['ban-hang:hoa-don-sua', 'ban-hang:hoa-don-duyet', 'ban-hang:chuong-trinh-lap', 'ban-hang:chuong-trinh-sua', 'ban-hang:chuong-trinh-han-muc']));
    const xem = (ok(await as('xem', 'GET', '/api/v1/auth/me')) as { permissions: string[] }).permissions;
    expect(xem).toEqual(expect.arrayContaining(['ban-hang:hoa-don-xem', 'ban-hang:tra-hang-xem', 'ban-hang:chuong-trinh-xem']));
    expect(xem).not.toContain('ban-hang:chuong-trinh-lap');
    expect(xem).not.toContain('ban-hang:hoa-don-lap');
  });

  it('Kế toán: chương trình bán thêm / sửa / đổi hạn mức; phiếu bán lập / huỷ như cũ', async () => {
    const p = ok(await as('ketoan', 'POST', '/api/v1/sale-programs', ct('PQ-KT'))) as { id: string };
    ok(await as('ketoan', 'PUT', `/api/v1/sale-programs/${p.id}`, { ...ct('PQ-KT'), name: 'Đã sửa' }));
    ok(await as('ketoan', 'PUT', `/api/v1/sale-programs/${p.id}/quotas`, { quotas: [{ branchCode: 'CN01', quotaQty: 20 }] }));
    ok(await as('ketoan', 'POST', '/api/v1/documents', ban(1)));
    ok(await as('ketoan', 'POST', '/api/v1/documents/cancel', { docKey: 'pqbh:CN01:HD1', reason: 'Thử huỷ' }));
    ok(await as('ketoan', 'GET', '/api/v1/documents?docType=sale'));
  });

  it('Cấm "sửa chương trình" + "huỷ hoá đơn": đúng hai lệnh đó 403, lệnh khác vẫn làm được', async () => {
    const p = ok(await as('han', 'POST', '/api/v1/sale-programs', ct('PQ-HAN'))) as { id: string };
    const sua = await as('han', 'PUT', `/api/v1/sale-programs/${p.id}`, { ...ct('PQ-HAN'), name: 'Sửa bị chặn' });
    expect(sua.status).toBe(403);
    expect(JSON.stringify(sua.body)).toContain('ban-hang:chuong-trinh-sua');
    ok(await as('han', 'PUT', `/api/v1/sale-programs/${p.id}/quotas`, { quotas: [{ branchCode: 'CN01', quotaQty: 5 }] }));
    ok(await as('han', 'POST', '/api/v1/documents', ban(2)));
    expect((await as('han', 'POST', '/api/v1/documents/cancel', { docKey: 'pqbh:CN01:HD2', reason: 'Thử huỷ' })).status).toBe(403);
  });

  it('Người xem: xem được, không ghi được (chương trình bán, phiếu bán)', async () => {
    ok(await as('xem', 'GET', '/api/v1/sale-programs'));
    ok(await as('xem', 'GET', '/api/v1/documents?docType=sale'));
    expect((await as('xem', 'POST', '/api/v1/sale-programs', ct('PQ-XEM'))).status).toBe(403);
    expect((await as('xem', 'POST', '/api/v1/documents', ban(3))).status).toBe(403);
  });
});
