// [2026-11-14 07:30 PM kiennt] PHAN-QUYEN — test hồi quy cho các lỗi tìm thấy khi rà bản thử phân quyền (đóng góp)
/**
 * NT-HT-003 GĐ1 (Quỹ):
 * 1. Cho riêng quyền chi tiết (vai trò nền Người xem) có hiệu lực ở lệnh của lõi — mượn quyền gốc RỦI RO THẤP trong đúng lệnh đó;
 *    Cấm quyền gốc vẫn thắng.
 * 2. Vai trò Hạn chế gán TẠI chi nhánh (công tắc bật): Cấm ở chi nhánh đó (kể cả quyền của vai trò chính), không thu hẹp phạm vi làm việc.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const tokens: Record<string, string> = {};
const bid: Record<string, string> = {};
const ok = <T>(r: { status: number; body: { data: T } }) => { expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBeLessThan(300); return r.body.data; };
const as = (who: string, method: 'GET' | 'POST', url: string, payload?: unknown) => call(ctx, method, url, payload, { authorization: `Bearer ${tokens[who]}` });
const phieu = (docType: string, debit: string, credit: string, branchCode = 'CN01') => ({ docType, branchCode, docDate: '2026-10-20', description: `Thử ${docType}`, lines: [{ debitAccount: debit, creditAccount: credit, amount: 1000, cashflowCode: '33' }] });
const thu = (cn?: string) => phieu('receipt', '1111', '5158', cn);
const chi = (cn?: string) => phieu('payment', '64211', '1111', cn);

async function user(key: string, role: string) {
  const email = `${key}@pqsl.local`;
  const u = ok(await call<{ data: { id: string } }>(ctx, 'POST', '/api/v1/users', { email, fullName: key, role, password: 'Pqsl@123456' }));
  tokens[key] = (await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password: 'Pqsl@123456' } })).json().data.token;
  return String(u.id);
}
async function role(code: string, kind: 'job' | 'restriction', rules: [string, 'allow' | 'deny'][], baseRole?: string) {
  const r = ok(await call<{ data: { id: string } }>(ctx, 'POST', '/api/v1/roles', { code, label: code, kind, ...(baseRole ? { baseRole } : {}), reason: 'Vai trò thử sửa lỗi' }));
  for (const [permission, effect] of rules) ok(await call(ctx, 'POST', `/api/v1/roles/${r.id}/rules`, { permission, effect, reason: 'Luật thử sửa lỗi' }));
  return r.id;
}
const gan = async (uid: string, tenantRoleId: string, cn?: string) =>
  ok(await call(ctx, 'POST', `/api/v1/users/${uid}/roles`, { tenantRoleId, ...(cn ? { scopeType: 'branch', scopeId: bid[cn] } : {}), reason: 'Gán thử' }));

beforeAll(async () => {
  ctx = await setupTenant();
  ok(await call(ctx, 'POST', '/api/v1/branches', { code: 'CN02', name: 'Chi nhánh 02' }));
  for (const b of ok(await call<{ data: { id: string; code: string }[] }>(ctx, 'GET', '/api/v1/branches'))) bid[b.code] = String(b.id);

  // 1. Người xem + Cho riêng lập phiếu thu
  await gan(await user('chorieng', 'viewer'), await role('cho_rieng', 'job', [['quy:phieu-thu-lap', 'allow']], 'viewer'));
  // 1b. Kế toán + Cho phiếu thu nhưng Cấm documents:write → Cấm quyền gốc thắng
  await gan(await user('camgoc', 'accountant'), await role('cam_goc', 'restriction', [['documents:write', 'deny']]));
  // 2. Kế toán + Hạn chế "Cấm lập phiếu chi" TẠI CN02
  await gan(await user('hanchecn', 'accountant'), await role('cam_chi_cn02', 'restriction', [['quy:phieu-chi-lap', 'deny']]), 'CN02');
  ok(await call(ctx, 'PUT', '/api/v1/settings/values/bizcity.authz.branch_scope', { value: 'on', reason: 'Bật giới hạn theo chi nhánh (test)' }));
});

describe('1. Cho riêng quyền chi tiết có hiệu lực ở lệnh của lõi', () => {
  it('lập phiếu thu được (mượn documents:write trong đúng lệnh); phiếu chi vẫn chặn', async () => {
    ok(await as('chorieng', 'POST', '/api/v1/vouchers', thu()));
    expect((await as('chorieng', 'POST', '/api/v1/vouchers', chi())).status).toBe(403);
  });
  it('Cấm quyền gốc documents:write thắng: không lập phiếu thu', async () => {
    expect((await as('camgoc', 'POST', '/api/v1/vouchers', thu())).status).toBe(403);
  });
});

describe('2. Vai trò Hạn chế gán tại chi nhánh', () => {
  it('không thu hẹp phạm vi; Cấm ghi nhận ở CN02', async () => {
    const q = ok(await as('hanchecn', 'GET', '/api/v1/quyen-chi-nhanh')) as { branches: string[] | null; camTheoChiNhanh: Record<string, string[]> };
    expect(q.branches).toBeNull();
    expect(q.camTheoChiNhanh).toEqual({ CN02: ['quy:phieu-chi-lap'] });
  });
  it('lập phiếu chi ở CN02 bị chặn kèm tên màn; ở CN01 được; phiếu thu ở CN02 được', async () => {
    const r = await as('hanchecn', 'POST', '/api/v1/vouchers', chi('CN02'));
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).toContain('Phiếu chi');
    ok(await as('hanchecn', 'POST', '/api/v1/vouchers', chi('CN01')));
    ok(await as('hanchecn', 'POST', '/api/v1/vouchers', thu('CN02')));
  });
});
