// [2026-11-07 09:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W1 (S031-5, S031-6): phiên bản chính sách mua hàng — đổi chiết khấu giữa tháng, phiếu cũ tính lại ra số cũ, vết chính sách trỏ đúng bản (T031-MH-1)
/**
 * Chính sách mua hàng có phiên bản (ADR-0031, migration 0079):
 *   - lưu mà nội dung không đổi → không thêm bản; nội dung đổi → bản mới áp cho chứng từ từ ngày chọn;
 *   - phiếu ngày trước ngày áp tính bằng bản cũ, phiếu từ ngày áp tính bằng bản mới (xuyên suốt);
 *   - vết chính sách trên phiếu ghi mã + bản + băm (truy vết); sổ đăng ký có phong bì từng bản;
 *   - xoá chính sách chưa áp → ngừng ở sổ đăng ký, lịch sử bản còn nguyên.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
let tenantId: string;
let id: string;
const NCC = 'NCC-PB';
const policy = (pct: number, extra: Record<string, unknown> = {}) => ({
  code: 'PB-CK', kind: 'trade_discount', name: 'CK theo mã NCC thử phiên bản', scope: { partnerCode: NCC, sku: 'PB1' }, priority: 0, isActive: true, rule: { pct }, ...extra,
});
const analyze = async (docDate: string) => {
  const r = await call(t, 'POST', '/api/v1/purchase/analyze', {
    kind: 'order', docDate, branchCode: 'CN-NA', partnerCode: NCC, priceIncludesVat: false,
    lines: [{ lineKey: 'a', sku: 'PB1', name: 'Hàng thử', unit: 'Hộp', qty: 10, price: 100_000, taxCode: 'V08', lineType: 'buy' }],
  });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  const calc = r.body.data.calc as { lines: { lineDiscount: number }[]; trace: { policy: string; version?: number; hash?: string }[] };
  return { disc: calc.lines[0]!.lineDiscount, trace: calc.trace.find((x) => x.policy === 'PB-CK') };
};
const versions = async () => {
  const r = await call(t, 'GET', `/api/v1/purchase/policies/${id}/versions`);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data as { version: number; effectiveFrom: string | null; effectiveTo: string | null; hash: string; reason: string | null; status: string }[];
};

beforeAll(async () => {
  t = await setupTenant();
  tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', t.tenantCode).executeTakeFirstOrThrow()).id);
  const s = await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' });
  expect(s.status, JSON.stringify(s.body)).toBeLessThan(300);
  const p = await call(t, 'PUT', '/api/v1/catalog/products/PB1?new=1', { name: 'Hàng thử phiên bản', unit: 'Hộp', taxInCode: 'V08', units: [{ unit: 'Hộp', ratio: 1, isDefault: true }] });
  expect(p.status, JSON.stringify(p.body)).toBe(200);
  await call(t, 'PUT', `/api/v1/partners/${NCC}`, { name: 'NCC thử phiên bản', kind: 'supplier' });
});

describe('Phiên bản chính sách mua hàng (T031-MH-1)', () => {
  it('tạo → bản 1 áp từ đầu, có phong bì ở sổ đăng ký', async () => {
    const r = await call(t, 'POST', '/api/v1/purchase/policies', policy(2));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    id = r.body.data.id;
    const vs = await versions();
    expect(vs.map((v) => [v.version, v.effectiveFrom, v.effectiveTo, v.status])).toEqual([[1, null, null, 'published']]);
    const env = await sql<{ rule_contract: string; owner_module: string; content_hash: string }>`
      SELECT rule_contract, owner_module, content_hash FROM policy_registry WHERE tenant_id = ${tenantId} AND policy_id = ${`mua-hang:purchase_policies:${id}`}`.execute(db);
    expect(env.rows).toEqual([{ rule_contract: 'purchase.trade_discount@1', owner_module: 'mua-hang', content_hash: vs[0]!.hash }]);
  });

  it('lưu lại y nguyên → không thêm bản', async () => {
    const r = await call(t, 'PUT', `/api/v1/purchase/policies/${id}`, policy(2));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await versions()).length).toBe(1);
  });

  it('đổi CK 2 % → 5 % áp từ 16/11: phiếu 15/11 vẫn 2 % (bản 1), phiếu 16/11 ra 5 % (bản 2); vết trỏ đúng bản + băm', async () => {
    const r = await call(t, 'PUT', `/api/v1/purchase/policies/${id}`, { ...policy(5), effectiveFrom: '2026-11-16', reason: 'NCC nâng chiết khấu từ 16/11' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const vs = await versions();
    expect(vs.map((v) => [v.version, v.effectiveFrom, v.effectiveTo])).toEqual([[1, null, '2026-11-15'], [2, '2026-11-16', null]]);
    expect(vs[1]!.reason).toBe('NCC nâng chiết khấu từ 16/11');
    const old = await analyze('2026-11-15');
    expect(old.disc).toBe(20_000);
    expect(old.trace).toMatchObject({ version: 1, hash: vs[0]!.hash });
    const now = await analyze('2026-11-16');
    expect(now.disc).toBe(50_000);
    expect(now.trace).toMatchObject({ version: 2, hash: vs[1]!.hash });
  });

  it('ngày áp sớm hơn bản hiện hành → 400, không thêm bản', async () => {
    const r = await call(t, 'PUT', `/api/v1/purchase/policies/${id}`, { ...policy(7), effectiveFrom: '2026-11-10', reason: 'thử lùi ngày' });
    expect(r.status, JSON.stringify(r.body)).toBe(400);
    expect((await versions()).length).toBe(2);
  });

  it('áp lùi trước hôm nay mà không có lý do → 400', async () => {
    const r = await call(t, 'PUT', `/api/v1/purchase/policies/${id}`, { ...policy(7), effectiveFrom: '2026-11-17' });
    // 17/11/2026 có thể đã qua khi chạy test: lúc đó phải đòi lý do; nếu chưa qua thì được nhận.
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    expect(r.status, JSON.stringify(r.body)).toBe('2026-11-17' < today ? 400 : 200);
  });

  it('bảng phiên bản và sổ đăng ký chỉ thêm', async () => {
    const e = await sql`UPDATE purchase_policy_versions SET reason = 'sửa' WHERE tenant_id = ${tenantId}`.execute(db).then(() => 'ok', (x: Error) => x.message);
    expect(e).toMatch(/chỉ thêm/);
  });

  it('xoá chính sách chưa áp → ngừng ở sổ đăng ký, các bản còn', async () => {
    const n = (await versions()).length;
    const r = await call(t, 'DELETE', `/api/v1/purchase/policies/${id}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const env = await sql<{ status: string }>`SELECT status FROM policy_registry WHERE tenant_id = ${tenantId} AND policy_id = ${`mua-hang:purchase_policies:${id}`}`.execute(db);
    expect(env.rows.length).toBe(n);
    expect(env.rows.every((x) => x.status === 'retired')).toBe(true);
    const kept = await sql<{ n: string }>`SELECT count(*) AS n FROM purchase_policy_versions WHERE tenant_id = ${tenantId} AND policy_id = ${id}`.execute(db);
    expect(Number(kept.rows[0]!.n)).toBe(n);
  });
});
