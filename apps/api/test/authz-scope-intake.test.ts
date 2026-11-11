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
// [2026-11-09 03:25 PM kiennt] PHASE-028 — S028-19 (giai đoạn 3.3): test phạm vi kho ở cửa nạp — gán theo kho, dòng hàng theo kho, kho mặc định, phiếu không có hàng

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

describe('Phạm vi kho (S028-19)', () => {
  let k1 = '';
  let kToken = '';
  const saleAt = (docKey: string, warehouseCode?: string) => {
    const d = saleDoc({ docKey, docNo: docKey, version: 1 }) as Record<string, unknown> & { lines: Record<string, unknown>[] };
    d.lines = d.lines.map((l) => (warehouseCode === undefined ? l : { ...l, warehouseCode }));
    return d;
  };

  beforeAll(async () => {
    // CN01: K1 là kho mặc định, K2 là kho thứ hai.
    expect((await call(ctx, 'POST', '/api/v1/warehouses', { code: 'K1', branchCode: 'CN01', name: 'Kho 1', isDefault: true })).status).toBe(201);
    expect((await call(ctx, 'POST', '/api/v1/warehouses', { code: 'K2', branchCode: 'CN01', name: 'Kho 2' })).status).toBe(201);
    const whs = (await call(ctx, 'GET', '/api/v1/warehouses')).body.data as { id: string; code: string }[];
    k1 = String(whs.find((w) => w.code === 'K1')!.id);
    const kId = String((await call(ctx, 'POST', '/api/v1/users', { email: 'kho1@ketoan.local', fullName: 'Thủ kho K1', role: 'viewer', password: 'Xem@12345' })).body.data.id);
    const a = await call(ctx, 'POST', `/api/v1/users/${kId}/roles`, { role: 'accountant', scopeType: 'warehouse', scopeId: k1, reason: 'Làm việc ở kho K1' });
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    expect(a.body.data).toMatchObject({ scopeType: 'warehouse', scopeId: k1 });
    kToken = await login('kho1@ketoan.local', 'Xem@12345');
  });

  it('kiểm đầu vào: warehouse cần scopeId; kho lạ 404', async () => {
    expect((await call(ctx, 'POST', `/api/v1/users/${aId}/roles`, { role: 'viewer', scopeType: 'warehouse', reason: 'Gán thử' })).status).toBe(400);
    expect((await call(ctx, 'POST', `/api/v1/users/${aId}/roles`, { role: 'viewer', scopeType: 'warehouse', scopeId: '999999999', reason: 'Gán thử' })).status).toBe(404);
  });

  it('nạp phiếu có hàng ở K1 được; ở K2 bị từ chối; dòng không ghi kho = kho mặc định K1', async () => {
    const ok = await postAs(kToken, '/api/v1/documents', saleAt('KHO-K1', 'K1'));
    expect(ok.statusCode, ok.body).not.toBe(403);
    expect(await stored('KHO-K1')).toBe(1);
    expect((await postAs(kToken, '/api/v1/documents', saleAt('KHO-K2', 'K2'))).statusCode).toBe(403);
    expect(await stored('KHO-K2')).toBe(0);
    const dflt = await postAs(kToken, '/api/v1/documents', saleAt('KHO-MD'));
    expect(dflt.statusCode, dflt.body).not.toBe(403);
  });

  it('phiếu lẫn K1 và K2: từ chối cả phiếu; phiếu ở chi nhánh khác bị từ chối', async () => {
    const mixed = saleAt('KHO-LAN') as { lines: Record<string, unknown>[] };
    mixed.lines = [{ ...mixed.lines[0]!, warehouseCode: 'K1' }, { ...mixed.lines[1]!, warehouseCode: 'K2' }];
    expect((await postAs(kToken, '/api/v1/documents', mixed)).statusCode).toBe(403);
    expect((await postAs(kToken, '/api/v1/documents', sale('KHO-CN02', 'CN02'))).statusCode).toBe(403);
  });

  it('gán theo kho không thành quyền toàn đơn vị; HT12 thấy id kho', async () => {
    const me = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${kToken}` } });
    expect(me.json().data.permissions).not.toContain('documents:write');
    expect(k1).toMatch(/^\d+$/);
  });
});

// [2026-11-09 05:05 PM kiennt] PHASE-028 — giai đoạn 3.1 / 3.2: cửa nạp kiểm quyền theo loại chứng từ (phân hệ đăng ký), documents:write kéo theo, Cấm quyền gốc phủ quyền kéo theo
describe('Quyền theo loại chứng từ ở cửa nạp (giai đoạn 3.1 / 3.2)', () => {
  const role = async (code: string, kind: 'job' | 'restriction', rules: [string, 'allow' | 'deny'][], baseRole?: string) => {
    const id = (await call(ctx, 'POST', '/api/v1/roles', { code, label: code, kind, ...(baseRole ? { baseRole } : {}), reason: 'Thử loại phiếu' })).body.data.id;
    for (const [permission, effect] of rules) expect((await call(ctx, 'POST', `/api/v1/roles/${id}/rules`, { permission, effect, reason: 'Thử loại phiếu' })).status).toBe(201);
    return id as string;
  };
  const user = async (email: string, role = 'viewer') => {
    const id = String((await call(ctx, 'POST', '/api/v1/users', { email, fullName: email, role, password: 'Xem@12345' })).body.data.id);
    return { id, token: async () => login(email, 'Xem@12345') };
  };
  const permsOf = async (token: string): Promise<string[]> =>
    (await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${token}` } })).json().data.permissions;

  it('kế toán (documents:write) có sẵn mọi quyền chứng từ chi tiết — không ai mất quyền khi nâng cấp', async () => {
    const kt = await user('kt-loai@ketoan.local', 'accountant');
    const perms = await permsOf(await kt.token());
    expect(perms).toEqual(expect.arrayContaining(['documents:write', 'ban-hang:hoa-don-lap', 'kho:chuyen-kho-lap', 'quy:thu-tien-lap', 'ke-toan:but-toan-lap']));
    expect((await postAs(await kt.token(), '/api/v1/documents', sale('LP-KT', 'CN01'))).statusCode).not.toBe(403);
  });

  it('Cấm ban-hang:* trên người có documents:write: không nạp được hoá đơn bán, vẫn nạp được chuyển kho', async () => {
    const kt = await user('kt-cam-ban@ketoan.local', 'accountant');
    const r = await role('cam_ban_hang', 'restriction', [['ban-hang:*', 'deny']]);
    expect((await call(ctx, 'POST', `/api/v1/users/${kt.id}/roles`, { tenantRoleId: r, reason: 'Không bán hàng' })).status).toBe(201);
    const t = await kt.token();
    expect((await postAs(t, '/api/v1/documents', sale('LP-CAM-BAN', 'CN01'))).statusCode).toBe(403);
    expect(await stored('LP-CAM-BAN')).toBe(0);
    expect((await postAs(t, '/api/v1/documents', transfer('LP-CAM-CK', 'out', 'CN01', 'CN02'))).statusCode).not.toBe(403);
  });

  it('thủ kho chỉ được Cho kho:chuyen-kho-lap (không documents:write): nạp chuyển kho, không nạp hoá đơn bán, lô lẫn bị từ chối cả lô', async () => {
    const tk = await user('tk-loai@ketoan.local');
    const r = await role('thu_kho_ck', 'job', [['kho:chuyen-kho-lap', 'allow']], 'viewer');
    expect((await call(ctx, 'POST', `/api/v1/users/${tk.id}/roles`, { tenantRoleId: r, reason: 'Thủ kho' })).status).toBe(201);
    const t = await tk.token();
    const perms = await permsOf(t);
    expect(perms).toContain('kho:chuyen-kho-lap');
    expect(perms).not.toContain('documents:write');
    expect((await postAs(t, '/api/v1/documents', transfer('LP-TK-CK', 'out', 'CN01', 'CN02'))).statusCode).not.toBe(403);
    expect(await stored('LP-TK-CK')).toBe(1);
    expect((await postAs(t, '/api/v1/documents', sale('LP-TK-BAN', 'CN01'))).statusCode).toBe(403);
    expect((await postAs(t, '/api/v1/documents/batch', { documents: [transfer('LP-TK-L1', 'out', 'CN01', 'CN02'), sale('LP-TK-L2', 'CN01')] })).statusCode).toBe(403);
    expect(await stored('LP-TK-L1')).toBe(0);
  });

  it('Cấm documents:* (luật cũ) vẫn chặn mọi loại phiếu sau khi có quyền chi tiết', async () => {
    const kt = await user('kt-cam-all@ketoan.local', 'accountant');
    const r = await role('cam_moi_phieu', 'restriction', [['documents:*', 'deny']]);
    expect((await call(ctx, 'POST', `/api/v1/users/${kt.id}/roles`, { tenantRoleId: r, reason: 'Cấm hết' })).status).toBe(201);
    const t = await kt.token();
    expect(await permsOf(t)).not.toContain('kho:chuyen-kho-lap');
    expect((await postAs(t, '/api/v1/documents', transfer('LP-CAM-ALL', 'out', 'CN01', 'CN02'))).statusCode).toBe(403);
  });

  it('khoá API documents:write vẫn nạp mọi loại phiếu như cũ', async () => {
    const k = await ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: sale('LP-KEY', 'CN01') as never, headers: { 'x-api-key': ctx.apiKey } });
    expect(k.statusCode, k.body).not.toBe(403);
  });
});

// [2026-11-09 06:05 PM kiennt] PHASE-028 — giai đoạn 3.2b: xem / huỷ / xuất theo loại chứng từ (phân hệ đăng ký đủ bộ thao tác)
describe('Xem / huỷ / xuất theo loại chứng từ (giai đoạn 3.2b)', () => {
  const asUser = async (email: string, deny: string[]) => {
    const id = String((await call(ctx, 'POST', '/api/v1/users', { email, fullName: email, role: 'accountant', password: 'Xem@12345' })).body.data.id);
    const r = (await call(ctx, 'POST', '/api/v1/roles', { code: email.split('@')[0]!.replace(/[^a-z0-9]/g, '_'), label: email, kind: 'restriction', reason: 'Thử thao tác' })).body.data.id;
    for (const p of deny) expect((await call(ctx, 'POST', `/api/v1/roles/${r}/rules`, { permission: p, effect: 'deny', reason: 'Thử thao tác' })).status).toBe(201);
    expect((await call(ctx, 'POST', `/api/v1/users/${id}/roles`, { tenantRoleId: r, reason: 'Thử thao tác' })).status).toBe(201);
    return login(email, 'Xem@12345');
  };
  const get = (token: string, url: string) => ctx.app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });

  it('kế toán có sẵn đủ bộ: xem / lập / huỷ, xuất (reports:read kéo theo)', async () => {
    const t = await login('kt-loai@ketoan.local', 'Xem@12345');
    const perms = (await get(t, '/api/v1/auth/me')).json().data.permissions as string[];
    expect(perms).toEqual(expect.arrayContaining(['ban-hang:hoa-don-xem', 'ban-hang:hoa-don-lap', 'ban-hang:hoa-don-huy', 'ban-hang:hoa-don-xuat', 'kho:chuyen-kho-xem', 'quy:thu-tien-huy']));
  });

  it('Cấm xem hoá đơn bán: danh sách không còn phiếu bán (phiếu khác vẫn thấy), mở chi tiết phiếu bán → 404', async () => {
    const owner = await call(ctx, 'GET', '/api/v1/documents?docType=sale&pageSize=50');
    const saleId = owner.body.data[0].id as string;
    expect(owner.body.data.length).toBeGreaterThan(0);
    const t = await asUser('kt-khong-xem@ketoan.local', ['ban-hang:hoa-don-xem']);
    expect((await get(t, '/api/v1/documents?docType=sale&pageSize=50')).json().data).toEqual([]);
    expect((await get(t, '/api/v1/documents?docType=transfer&pageSize=50')).json().data.length).toBeGreaterThan(0);
    expect((await get(t, `/api/v1/documents/${saleId}`)).statusCode).toBe(404);
    expect((await get(t, `/api/v1/documents/${saleId}/preview`)).statusCode).toBe(404);
  });

  it('Cấm huỷ hoá đơn bán: người có documents:write không huỷ được phiếu bán', async () => {
    const t = await asUser('kt-khong-huy@ketoan.local', ['ban-hang:hoa-don-huy']);
    const res = await postAs(t, '/api/v1/documents/cancel', { docKey: 'LP-KT', reason: 'Thử huỷ' });
    expect(res.statusCode, res.body).toBe(403);
    expect(res.body).toContain('ban-hang:hoa-don-huy');
  });

  it('Cấm lập / huỷ chuyển kho chặn cả action kho.transfer.* (không chỉ cửa nạp)', async () => {
    // [2026-11-11 09:25 AM kiennt] PHASE-028 — S028-22: action chuyển kho gác quyền theo loại chứng từ
    const body = { docDate: '2026-10-06', fromBranchCode: 'CN01', toBranchCode: 'CN02', lines: [{ lineKey: 'a', sku: 'CK-THU', qty: 1 }] };
    const cancelUrl = '/api/v1/kho/transfers/999999999/cancel';
    const tLap = await asUser('kt-khong-ck@ketoan.local', ['kho:chuyen-kho-lap']);
    const tHuy = await asUser('kt-khong-huy-ck@ketoan.local', ['kho:chuyen-kho-huy']);
    // Cấm lập: không lập được; vẫn qua cổng quyền của huỷ (lỗi khác 403 — phiếu không có).
    const lap = await postAs(tLap, '/api/v1/kho/transfers', body);
    expect(lap.statusCode, lap.body).toBe(403);
    expect(lap.body).toContain('kho:chuyen-kho-lap');
    expect((await postAs(tLap, cancelUrl, { reason: 'Thử' })).statusCode).not.toBe(403);
    // Cấm huỷ: không huỷ được; vẫn qua cổng quyền của lập.
    const huy = await postAs(tHuy, cancelUrl, { reason: 'Thử' });
    expect(huy.statusCode, huy.body).toBe(403);
    expect(huy.body).toContain('kho:chuyen-kho-huy');
    expect((await postAs(tHuy, '/api/v1/kho/transfers', body)).statusCode).not.toBe(403);
  });

  it('Cấm xuất hoá đơn bán: không tải được bảng kê bán hàng; người khác vẫn tải được', async () => {
    const q = '?from=2026-10-01&to=2026-10-31';
    expect((await get(ctx.token, `/api/v1/addins/excel-export/sales-detail.csv${q}`)).statusCode).toBe(200);
    const t = await asUser('kt-khong-xuat@ketoan.local', ['ban-hang:hoa-don-xuat']);
    expect((await get(t, `/api/v1/addins/excel-export/sales-detail.csv${q}`)).statusCode).toBe(403);
    expect((await get(t, `/api/v1/addins/excel-export/trial-balance.csv${q}`)).statusCode).toBe(200);
  });
});
