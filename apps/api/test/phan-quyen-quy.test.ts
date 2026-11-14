// [2026-11-13 07:30 PM kiennt] PHAN-QUYEN — bản thử: phân hệ Quỹ đăng ký màn phiếu thu / chi / báo có / báo nợ; lệnh của lõi gác theo loại phiếu (đóng góp)
import { beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const tokens: Record<string, string> = {};
const ok = <T>(r: { status: number; body: { data: T } }) => { expect(r.status, JSON.stringify(r.body).slice(0, 500)).toBeLessThan(300); return r.body.data; };
const as = (who: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown, query = '') => call(ctx, method, url + query, payload, { authorization: `Bearer ${tokens[who]}` });
const phieu = (docType: string, debit: string, credit: string) => ({ docType, branchCode: 'CN01', docDate: '2026-10-20', description: `Thử ${docType}`, lines: [{ debitAccount: debit, creditAccount: credit, amount: 1000, cashflowCode: '33' }] });
const thu = () => phieu('receipt', '1111', '5158');
const chi = () => phieu('payment', '64211', '1111');

async function user(key: string, role: string) {
  const email = `${key}@pqquy.local`;
  const u = ok(await call<{ data: { id: string } }>(ctx, 'POST', '/api/v1/users', { email, fullName: key, role, password: 'Pqquy@12345' }));
  tokens[key] = (await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password: 'Pqquy@12345' } })).json().data.token;
  return String(u.id);
}
async function role(code: string, kind: 'job' | 'restriction', rules: [string, 'allow' | 'deny'][], baseRole?: string) {
  const r = ok(await call<{ data: { id: string } }>(ctx, 'POST', '/api/v1/roles', { code, label: code, kind, ...(baseRole ? { baseRole } : {}), reason: 'Vai trò thử Quỹ' }));
  for (const [permission, effect] of rules) ok(await call(ctx, 'POST', `/api/v1/roles/${r.id}/rules`, { permission, effect, reason: 'Luật thử Quỹ' }));
  return r.id;
}

beforeAll(async () => {
  ctx = await setupTenant();
  await user('ketoan', 'accountant');
  const thuQuy = await user('thuquy', 'viewer');
  const han = await user('khongchi', 'accountant');
  // Thủ quỹ: Người xem + chỉ Cho lập documents:write? Không — chỉ Cho lập / sửa phiếu thu (quyền chi tiết); lõi vẫn đòi documents:write ở lệnh → Cho thêm documents:write rồi Cấm các loại phiếu khác
  const r1 = await role('thu_quy', 'job', [['documents:write', 'allow']], 'viewer');
  const r2 = await role('chi_thu', 'restriction', [['quy:phieu-chi-lap', 'deny'], ['quy:bao-no-lap', 'deny'], ['quy:bao-co-lap', 'deny']]);
  for (const r of [r1, r2]) ok(await call(ctx, 'POST', `/api/v1/users/${thuQuy}/roles`, { tenantRoleId: r, reason: 'Gán thử' }));
  const r3 = await role('khong_chi', 'restriction', [['quy:phieu-chi-lap', 'deny'], ['quy:phieu-thu-huy', 'deny']]);
  ok(await call(ctx, 'POST', `/api/v1/users/${han}/roles`, { tenantRoleId: r3, reason: 'Gán thử' }));
});

describe('Quỹ — gác lệnh của lõi theo loại phiếu', () => {
  it('GET /man-hinh có 4 màn phiếu tiền', async () => {
    const ds = ok(await call<{ data: { key: string }[] }>(ctx, 'GET', '/api/v1/man-hinh'));
    expect(ds.map((m) => m.key)).toEqual(expect.arrayContaining(['quy.phieu-thu', 'quy.phieu-chi', 'quy.bao-co', 'quy.bao-no']));
  });

  it('Kế toán: lập phiếu thu, phiếu chi như cũ', async () => {
    ok(await as('ketoan', 'POST', '/api/v1/vouchers', thu()));
    ok(await as('ketoan', 'POST', '/api/v1/vouchers', chi()));
  });

  it('Thủ quỹ (chỉ phiếu thu): lập phiếu thu được, phiếu chi bị chặn đúng thông báo màn', async () => {
    ok(await as('thuquy', 'POST', '/api/v1/vouchers', thu()));
    const r = await as('thuquy', 'POST', '/api/v1/vouchers', chi());
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).toContain('Phiếu chi');
  });

  it('Cấm "lập phiếu chi" + "huỷ phiếu thu": lập chi 403; sửa / huỷ phiếu thu theo mã tra đúng loại phiếu', async () => {
    expect((await as('khongchi', 'POST', '/api/v1/vouchers', chi())).status).toBe(403);
    const pt = ok(await as('khongchi', 'POST', '/api/v1/vouchers', thu())) as { id: string; docKey: string };
    const sua = await as('khongchi', 'PUT', `/api/v1/vouchers/${pt.id}`, { ...thu(), description: 'Sửa' });
    expect(sua.status).not.toBe(403);
    const huy = await as('khongchi', 'POST', '/api/v1/documents/cancel', { docKey: pt.docKey, reason: 'Thử huỷ' });
    expect(huy.status).toBe(403);
  });

  it('xem danh sách theo loại phiếu: Người xem xem được (documents:read kéo theo)', async () => {
    ok(await as('thuquy', 'GET', '/api/v1/documents', undefined, '?docType=payment'));
  });
});
