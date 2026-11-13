/**
 * [2026-11-13 Nguyễn Văn Thủy] Nhà cung cấp / khách hàng cha – con (0132) (đóng góp)
 * Định danh dt_ bất biến, xuyên suốt sổ cái + chứng từ mua; mã con = mã cha-001; chặn vòng lặp, chuyển cha sai;
 * MST dùng chung trong một nhóm; thưởng ký với công ty mẹ tính trên cả nhóm, lập phiếu cho bên trả + chi nhánh nhận.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { call, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
type P = { code: string; uid: string; parentCode: string | null; parentName: string | null; childCount: number; taxCode: string | null };
const one = async (code: string) => ((await call(t, 'GET', `/api/v1/partners?search=${encodeURIComponent(code)}&pageSize=50`)).body.data as P[]).find((p) => p.code === code)!;
const nextCode = async (parent: string, taxCode = '') => (await call(t, 'GET', `/api/v1/partners/next-code?parentCode=${parent}${taxCode ? `&taxCode=${taxCode}` : ''}`)).body.data.code as string;
const create = (body: Record<string, unknown>) => call(t, 'POST', '/api/v1/partners', { kind: 'supplier', ...body });

beforeAll(async () => {
  t = await setupTenant();
  const s = await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' });
  expect(s.status, JSON.stringify(s.body)).toBe(200);
}, 60_000);
afterAll(async () => { await t.app.close(); });

describe('Đối tượng cha – con', () => {
  it('định danh dt_ có sẵn, không đổi; mã con tự cấp mã cha-001, -002; MST chi nhánh lấy đúng đuôi', async () => {
    expect((await create({ code: 'NCC-ME', name: 'Công ty mẹ', taxCode: '0109998881' })).status).toBe(201);
    const me = await one('NCC-ME');
    expect(me.uid).toMatch(/^dt_[0-9A-Z]{26}$/);
    expect(await nextCode('NCC-ME')).toBe('NCC-ME-001');
    expect(await nextCode('NCC-ME', '0109998881-005')).toBe('NCC-ME-005');
    // Mã đơn vị con phải theo mã cha.
    const bad = await create({ code: 'CN-LUNG-TUNG', name: 'Chi nhánh', parentCode: 'NCC-ME' });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toMatch(/NCC-ME-/);
    expect((await create({ code: 'NCC-ME-001', name: 'Chi nhánh Hà Nội', parentCode: 'NCC-ME', taxCode: '0109998881' })).status).toBe(201);
    expect(await nextCode('NCC-ME')).toBe('NCC-ME-002');
    expect(await one('NCC-ME-001')).toMatchObject({ parentCode: 'NCC-ME', parentName: 'Công ty mẹ' });
    expect((await one('NCC-ME')).childCount).toBe(1);
    expect((await one('NCC-ME')).uid).toBe(me.uid);
    const kids = (await call(t, 'GET', '/api/v1/partners/NCC-ME/children')).body.data as P[];
    expect(kids.map((k) => k.code)).toEqual(['NCC-ME-001']);
  });

  it('MST: trong một nhóm dùng chung được, đơn vị ngoài nhóm thì báo trùng', async () => {
    expect((await create({ code: 'NCC-KHAC', name: 'Không liên quan', taxCode: '0109998881' })).status).toBe(409);
  });

  it('chặn chọn chính mình, vòng lặp, chuyển đơn vị con theo mã sang cha khác', async () => {
    expect((await call(t, 'PUT', '/api/v1/partners/NCC-ME', { name: 'Công ty mẹ', kind: 'supplier', parentCode: 'NCC-ME' })).status).toBe(400);
    expect((await call(t, 'PUT', '/api/v1/partners/NCC-ME', { name: 'Công ty mẹ', kind: 'supplier', parentCode: 'NCC-ME-001' })).status).toBe(400);
    expect((await create({ code: 'NCC-ME2', name: 'Mẹ khác' })).status).toBe(201);
    const move = await call(t, 'PUT', '/api/v1/partners/NCC-ME-001', { name: 'Chi nhánh Hà Nội', kind: 'supplier', parentCode: 'NCC-ME2' });
    expect(move.status).toBe(400);
    expect(JSON.stringify(move.body)).toMatch(/không chuyển/);
  });

  it('đơn vị cũ (mã cũ) gắn vào cha được, giữ mã; lịch sử ghi lại', async () => {
    const r = await call(t, 'PUT', '/api/v1/partners/NCC-TRUNGHAU', { kind: 'supplier', parentCode: 'NCC-ME' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await one('NCC-TRUNGHAU')).toMatchObject({ parentCode: 'NCC-ME' });
    const h = (await call(t, 'GET', '/api/v1/co-cau/history?type=partner&code=NCC-TRUNGHAU')).body.data as { changes: string[] }[];
    expect(h.some((l) => l.changes.some((c) => c.includes('NCC-ME')))).toBe(true);
  });

  it('định danh xuyên suốt: dòng sổ cái và chứng từ mua của đơn vị nhỏ nhất mang dt_ của đơn vị đó', async () => {
    const { db } = await import('../src/db/client.js');
    const uid = (await one('NCC-TRUNGHAU')).uid;
    const led = await sql<{ n: string; bad: string }>`
      SELECT count(*) AS n, count(*) FILTER (WHERE l.partner_uid IS DISTINCT FROM p.uid) AS bad
        FROM ledger_lines l JOIN partners p ON p.id = l.partner_id JOIN tenants te ON te.id = p.tenant_id
       WHERE te.code = ${t.tenantCode} AND p.code = 'NCC-TRUNGHAU'`.execute(db);
    expect(Number(led.rows[0]!.n)).toBeGreaterThan(0);
    expect(Number(led.rows[0]!.bad)).toBe(0);
    const docs = await sql<{ partner_uid: string }>`
      SELECT d.partner_uid FROM purchase_documents d JOIN tenants te ON te.id = d.tenant_id WHERE te.code = ${t.tenantCode} AND d.partner_code = 'NCC-TRUNGHAU'`.execute(db);
    expect(docs.rows.length).toBeGreaterThan(0);
    expect(new Set(docs.rows.map((d) => d.partner_uid))).toEqual(new Set([uid]));
  });

  it('thưởng ký với công ty mẹ: tính trên cả nhóm (gồm chi nhánh giao hàng), lập phiếu cho bên trả + chi nhánh nhận', async () => {
    const policy = (family: boolean) => ({ code: family ? 'ME-THUONG-NHOM' : 'ME-THUONG-RIENG', kind: 'period_rebate', name: 'Thưởng tháng', scope: { partnerCode: 'NCC-ME' }, isActive: true, validFrom: '2026-01-01',
      rule: { period: 'month', tiers: [{ from: 0, pct: 1 }], family, payer: 'NCC-TRUNGHAU', receiver: 'CN-PT' } });
    for (const f of [true, false]) { const r = await call(t, 'POST', '/api/v1/purchase/policies', policy(f)); expect(r.status, JSON.stringify(r.body)).toBeLessThan(300); }
    const nhom = (await call(t, 'POST', '/api/v1/purchase/rebates/preview', { policyCode: 'ME-THUONG-NHOM', period: '2026-10' })).body.data;
    const rieng = (await call(t, 'POST', '/api/v1/purchase/rebates/preview', { policyCode: 'ME-THUONG-RIENG', period: '2026-10' })).body.data;
    expect(rieng.base).toBe(0);
    expect(nhom.base).toBeGreaterThan(0);
    expect(nhom.parties).toMatchObject({ signedWith: 'NCC-ME', family: true, payer: 'NCC-TRUNGHAU', receiver: 'CN-PT' });
    expect(nhom.parties.members).toEqual(expect.arrayContaining(['NCC-ME', 'NCC-ME-001', 'NCC-TRUNGHAU']));
    expect(nhom.byPartner.map((x: { code: string }) => x.code)).toEqual(['NCC-TRUNGHAU']);
  });
});
