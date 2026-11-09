// [2026-11-07 09:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W5 đợt 1 (ADR-0027 Phụ lục A, W5 đợt 1): test quyền theo chi nhánh ở cửa nạp chứng từ và luồng mẫu chuyển kho hai chiều
/**
 * Cửa nạp `POST /api/v1/documents` + `/batch` kiểm `documents:write` theo chi nhánh của chứng từ:
 *  - có quyền toàn đơn vị (chủ đơn vị, khoá API) → như cũ;
 *  - chỉ có lần gán phạm vi chi nhánh A → nạp được ở A, bị từ chối ở B, thiếu / sai branchCode bị từ chối (đóng an toàn);
 *  - chuyển kho hai chiều: chiều xuất do A lập, chiều nhận do B lập (TRANSFER_TWO_SIDES);
 *  - lô lẫn chi nhánh → từ chối cả lô; Cấm toàn đơn vị thắng phạm vi; thu hồi có hiệu lực ngay.
 * Dữ liệu là dữ liệu giả.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { closeDb, db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let cn01 = '';
let cn02 = '';
let aId = '';
let bId = '';
let aToken = '';
let bToken = '';
let aAssign = '';

const login = async (email: string, password: string) =>
  (await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password } })).json().data.token as string;
const postAs = (token: string, url: string, payload: unknown) =>
  ctx.app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: `Bearer ${token}`, 'idempotency-key': `t-${Date.now()}-${Math.random()}` } });
const stored = async (docKey: string) =>
  (await sql<{ n: number }>`SELECT count(*)::int AS n FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${docKey}`.execute(db)).rows[0]!.n;

const sale = (docKey: string, branchCode: string | undefined) => {
  const d: Record<string, unknown> = saleDoc({ docKey, docNo: docKey, version: 1 });
  if (branchCode === undefined) delete d.branchCode; else d.branchCode = branchCode;
  return d;
};
const transfer = (docKey: string, leg: 'out' | 'in', branchCode: string, other: string) => ({
  docType: 'transfer', docKey, docNo: docKey, version: 1, docDate: '2026-10-06', leg, branchCode,
  ...(leg === 'out' ? { toBranchCode: other } : { fromBranchCode: other }),
  lines: [{ lineKey: 'l1', sku: 'SUA01', qty: 1, amount: 0 }], totals: { total: 0 },
});

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
  expect((await call(ctx, 'POST', '/api/v1/branches', { code: 'CN02', name: 'Cửa hàng 02' })).status).toBe(201);
  const branches = (await call(ctx, 'GET', '/api/v1/branches')).body.data as { id: string; code: string }[];
  cn01 = String(branches.find((b) => b.code === 'CN01')!.id);
  cn02 = String(branches.find((b) => b.code === 'CN02')!.id);
  aId = String((await call(ctx, 'POST', '/api/v1/users', { email: 'ka@ketoan.local', fullName: 'Kế toán CN01', role: 'viewer', password: 'Xem@12345' })).body.data.id);
  bId = String((await call(ctx, 'POST', '/api/v1/users', { email: 'kb@ketoan.local', fullName: 'Kế toán CN02', role: 'viewer', password: 'Xem@12345' })).body.data.id);
  aToken = await login('ka@ketoan.local', 'Xem@12345');
  bToken = await login('kb@ketoan.local', 'Xem@12345');
});
afterAll(async () => {
  await ctx.app.close();
  await closeDb();
});

describe('Gán vai trò có phạm vi chi nhánh', () => {
  it('kiểm đầu vào: branch cần scopeId; chi nhánh lạ 404; tenant không nhận scopeId', async () => {
    expect((await call(ctx, 'POST', `/api/v1/users/${aId}/roles`, { role: 'accountant', scopeType: 'branch', reason: 'Gán thử' })).status).toBe(400);
    expect((await call(ctx, 'POST', `/api/v1/users/${aId}/roles`, { role: 'accountant', scopeType: 'branch', scopeId: '999999999', reason: 'Gán thử' })).status).toBe(404);
    expect((await call(ctx, 'POST', `/api/v1/users/${aId}/roles`, { role: 'accountant', scopeId: cn01, reason: 'Gán thử' })).status).toBe(400);
  });

  it('gán kế toán tại CN01 / CN02: lịch sử nêu phạm vi; KHÔNG thành quyền toàn đơn vị', async () => {
    const a = await call(ctx, 'POST', `/api/v1/users/${aId}/roles`, { role: 'accountant', scopeType: 'branch', scopeId: cn01, reason: 'Kế toán cửa hàng 01' });
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    aAssign = a.body.data.id;
    expect(a.body.data).toMatchObject({ scopeType: 'branch', scopeId: cn01 });
    expect((await call(ctx, 'POST', `/api/v1/users/${bId}/roles`, { role: 'accountant', scopeType: 'branch', scopeId: cn02, reason: 'Kế toán cửa hàng 02' })).status).toBe(201);
    // Cùng vai trò, cùng chi nhánh, đang mở → 409; cùng vai trò ở chi nhánh khác thì được.
    expect((await call(ctx, 'POST', `/api/v1/users/${aId}/roles`, { role: 'accountant', scopeType: 'branch', scopeId: cn01, reason: 'Gán lại' })).status).toBe(409);
    const list = await call(ctx, 'GET', `/api/v1/users/${aId}/roles`);
    expect(list.body.data.assignments).toEqual(expect.arrayContaining([expect.objectContaining({ id: aAssign, scopeType: 'branch', scopeId: cn01, active: true })]));
    const me = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${aToken}` } });
    expect(me.json().data.permissions).not.toContain('documents:write');
  });
});

describe('Cửa nạp theo chi nhánh', () => {
  it('quyền toàn đơn vị như cũ: chủ đơn vị và khoá API nạp được', async () => {
    const r = await call(ctx, 'POST', '/api/v1/documents', sale('SC-OWNER', 'CN02'));
    expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted');
    const k = await ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: sale('SC-KEY', 'CN01') as never, headers: { 'x-api-key': ctx.apiKey } });
    expect(k.statusCode, k.body).not.toBe(403);
  });

  it('phạm vi CN01: nạp ở CN01 được; CN02, thiếu branchCode, mã lạ bị từ chối và không lưu gì', async () => {
    const ok = await postAs(aToken, '/api/v1/documents', sale('SC-A-01', 'CN01'));
    expect(ok.json().data?.status, ok.body).toBe('posted');
    for (const [key, code] of [['SC-A-02', 'CN02'], ['SC-A-NONE', undefined], ['SC-A-LA', 'CN99']] as const) {
      const r = await postAs(aToken, '/api/v1/documents', sale(key, code));
      expect(r.statusCode, `${key}: ${r.body}`).toBe(403);
      expect(await stored(key)).toBe(0);
    }
  });

  it('người không có gán nào: bị từ chối', async () => {
    const v = String((await call(ctx, 'POST', '/api/v1/users', { email: 'kx@ketoan.local', fullName: 'Người xem', role: 'viewer', password: 'Xem@12345' })).body.data.id);
    expect(v).toBeTruthy();
    expect((await postAs(await login('kx@ketoan.local', 'Xem@12345'), '/api/v1/documents', sale('SC-X', 'CN01'))).statusCode).toBe(403);
  });

  it('chuyển kho hai chiều: CN01 lập chiều xuất, CN02 lập chiều nhận; mỗi bên không lập được chiều của bên kia', async () => {
    expect((await postAs(aToken, '/api/v1/documents', transfer('CK-OUT', 'out', 'CN01', 'CN02'))).statusCode).not.toBe(403);
    expect((await postAs(aToken, '/api/v1/documents', transfer('CK-IN-SAI', 'in', 'CN02', 'CN01'))).statusCode).toBe(403);
    expect((await postAs(bToken, '/api/v1/documents', transfer('CK-IN', 'in', 'CN02', 'CN01'))).statusCode).not.toBe(403);
    expect((await postAs(bToken, '/api/v1/documents', transfer('CK-OUT-SAI', 'out', 'CN01', 'CN02'))).statusCode).toBe(403);
    expect(await stored('CK-OUT')).toBe(1);
    expect(await stored('CK-IN')).toBe(1);
    expect(await stored('CK-IN-SAI')).toBe(0);
    expect(await stored('CK-OUT-SAI')).toBe(0);
  });

  it('lô: cùng chi nhánh trong phạm vi thì nạp; lẫn chi nhánh ngoài phạm vi thì từ chối cả lô', async () => {
    const ok = await postAs(aToken, '/api/v1/documents/batch', { documents: [sale('SC-LO-1', 'CN01'), sale('SC-LO-2', 'CN01')] });
    expect(ok.statusCode, ok.body).toBe(200);
    const bad = await postAs(aToken, '/api/v1/documents/batch', { documents: [sale('SC-LO-3', 'CN01'), sale('SC-LO-4', 'CN02')] });
    expect(bad.statusCode).toBe(403);
    expect(await stored('SC-LO-3')).toBe(0);
    expect(await stored('SC-LO-4')).toBe(0);
  });

  it('Cấm toàn đơn vị thắng phạm vi; gỡ lần gán Cấm thì nạp lại được', async () => {
    const r = (await call(ctx, 'POST', '/api/v1/roles', { code: 'cam_nap', label: 'Cấm nạp chứng từ', kind: 'restriction', reason: 'Thử Cấm' })).body.data.id;
    expect((await call(ctx, 'POST', `/api/v1/roles/${r}/rules`, { permission: 'documents:*', effect: 'deny', reason: 'Thử Cấm' })).status).toBe(201);
    const g = (await call(ctx, 'POST', `/api/v1/users/${aId}/roles`, { tenantRoleId: r, reason: 'Thử Cấm' })).body.data.id;
    expect((await postAs(aToken, '/api/v1/documents', sale('SC-CAM', 'CN01'))).statusCode).toBe(403);
    expect((await call(ctx, 'POST', `/api/v1/users/${aId}/roles/${g}/revoke`, { reason: 'Hết thử' })).status).toBe(200);
    expect((await postAs(aToken, '/api/v1/documents', sale('SC-CAM-2', 'CN01'))).json().data?.status).toBe('posted');
  });

  it('thu hồi lần gán phạm vi: từ chối ngay', async () => {
    expect((await call(ctx, 'POST', `/api/v1/users/${aId}/roles/${aAssign}/revoke`, { reason: 'Chuyển cửa hàng' })).status).toBe(200);
    expect((await postAs(aToken, '/api/v1/documents', sale('SC-THU-HOI', 'CN01'))).statusCode).toBe(403);
  });
});
