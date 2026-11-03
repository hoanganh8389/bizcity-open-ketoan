/**
 * Sửa tại bể (PHASE-021 W3, PHASES 2.19; ADR-0014 D4, D5; RULE-INTAKE-7/8/9):
 *   T021-6  sửa tại bể → nộp lại → 'resubmitted'; payload_raw không đổi; sự việc có extra.intake.patched = true
 *   T021-7  chấp nhận cảnh báo: vai trò không được phép → 403; được phép → 'accepted', bằng chứng có lý do
 *   T021-8  mã block không chấp nhận được, kể cả chủ đơn vị
 *   T021-9  Kiểm thử: không sự việc, không bút toán, không sự kiện; mục 'trial' của đúng người
 *   còn: nộp lại khi còn lỗi chặn → 'blocked' (không nộp); người lập khác không sửa mục của người khác; bỏ mục cần documents:edit-all
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let ktv = ''; // token kế toán viên (accountant: không documents:edit-all, không trong accept_roles mặc định)
let k = 0;
const idem = () => ({ 'idempotency-key': `rp-${Date.now()}-${(k += 1)}` });
const as = (token: string) => ({ authorization: `Bearer ${token}`, ...idem() });
const post = (url: string, payload: unknown, token = ctx.token) => ctx.app.inject({ method: 'POST', url, payload: payload as never, headers: as(token) });
const inbox = (id: string) => db.selectFrom('intake_inbox').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
const count = async (table: 'accounting_events' | 'ledger_entries' | 'event_outbox') =>
  Number((await db.selectFrom(table).select(db.fn.countAll().as('n')).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow()).n);

/** Nộp chứng từ hỏng qua cửa nạp → id mục bể. */
async function reject(over: Record<string, unknown>, token = ctx.token): Promise<string> {
  const res = await post('/api/v1/documents', saleDoc(over), token);
  expect(res.statusCode, res.body).toBe(400);
  return res.json().error.intake.id as string;
}

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  expect((await call(ctx, 'POST', '/api/v1/users', { email: 'ktv-be@ketoan.local', fullName: 'Kế toán viên bể', role: 'accountant', password: 'Ktv@12345' })).status).toBe(201);
  ktv = (await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email: 'ktv-be@ketoan.local', password: 'Ktv@12345' } })).json().data.token;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Sửa tại bể → nộp lại (T021-6)', () => {
  let id = '';

  it('bản vá chồng lên nguyên văn: hết IN-SHAPE-003, nguyên văn giữ nguyên, lịch sử có điểm + mã của lần thử', async () => {
    id = await reject({ docKey: 'rp:CN01:A1', docNo: 'A1', docDate: '05/10/2026' });
    const res = await post(`/api/v1/intake/${id}/patch`, { ops: [{ op: 'replace', path: '/docDate', value: '2026-10-05' }], reason: 'POS gửi ngày kiểu dd/mm, sửa theo hoá đơn giấy' });
    expect(res.statusCode, res.body).toBe(200);
    const out = res.json().data;
    expect(out.fixed).toContain('IN-SHAPE-003');
    expect(out.score).toBe(100);
    const row = await inbox(id);
    expect(row.payload_raw).toMatchObject({ docDate: '05/10/2026' });
    expect(row.patches).toEqual([expect.objectContaining({ reason: expect.any(String), score: 100, fixed: expect.arrayContaining(['IN-SHAPE-003']), ops: [{ op: 'replace', path: '/docDate', value: '2026-10-05' }] })]);
  });

  it('kế toán viên không sửa / nộp lại mục của người khác (403)', async () => {
    expect((await post(`/api/v1/intake/${id}/patch`, { ops: [{ op: 'replace', path: '/docNo', value: 'X' }], reason: 'thử quyền' }, ktv)).statusCode).toBe(403);
    expect((await post(`/api/v1/intake/${id}/resubmit`, {}, ktv)).statusCode).toBe(403);
  });

  it('đường bản vá không có → 400, không ghi bản vá', async () => {
    const res = await post(`/api/v1/intake/${id}/patch`, { ops: [{ op: 'replace', path: '/khongCo/x', value: 1 }], reason: 'đường sai' });
    expect(res.statusCode).toBe(400);
    expect(((await inbox(id)).patches as unknown[]).length).toBe(1);
  });

  it('nộp lại → resubmitted, event_id; sự việc mang extra.intake.patched; nộp lại lần nữa → 409', async () => {
    const res = await post(`/api/v1/intake/${id}/resubmit`, { reason: 'Đã đối chiếu hoá đơn giấy' });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data).toMatchObject({ status: 'resubmitted', docKey: 'rp:CN01:A1', eventId: expect.any(String) });
    const row = await inbox(id);
    expect(row).toMatchObject({ status: 'resubmitted', event_id: res.json().data.eventId });
    expect(row.payload_raw).toMatchObject({ docDate: '05/10/2026' });
    const ev = await db.selectFrom('accounting_events').select(['payload', 'doc_date']).where('tenant_id', '=', tenantId).where('doc_key', '=', 'rp:CN01:A1').executeTakeFirstOrThrow();
    expect((ev.payload as { extra?: { intake?: unknown } }).extra?.intake).toEqual({ inboxId: id, patched: true, acceptedCodes: [] });
    expect((await post(`/api/v1/intake/${id}/resubmit`, {})).statusCode).toBe(409);
  });

  it('còn lỗi chặn → blocked, không nộp, không sự việc', async () => {
    const bad = await reject({ docKey: 'rp:CN01:B1', docNo: 'B1', branchCode: 'KHONG-CO-CN' });
    const res = await post(`/api/v1/intake/${bad}/resubmit`, {});
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data.status).toBe('blocked');
    expect((res.json().data.findings as { code: string }[]).map((f) => f.code)).toContain('IN-MD-001');
    expect((await inbox(bad)).status).toBe('open');
    expect(await db.selectFrom('accounting_events').select('id').where('tenant_id', '=', tenantId).where('doc_key', '=', 'rp:CN01:B1').executeTakeFirst()).toBeUndefined();
  });
});

describe('Chấp nhận cảnh báo (T021-7, T021-8), bỏ mục', () => {
  let id = '';
  const mstSai = { code: '0912000009', name: 'Khách MST sai', taxCode: '01234' };

  it('T021-8: mã block không chấp nhận được, kể cả chủ đơn vị', async () => {
    id = await reject({ docKey: 'rp:CN01:C1', docNo: 'C1', docDate: '05/10/2026', partner: mstSai, invoice: { no: '7771001', serial: 'C26TAA', form: '1', date: '2026-10-05' } });
    const res = await post(`/api/v1/intake/${id}/accept`, { codes: ['IN-SHAPE-003'], reason: 'thử chấp nhận lỗi chặn' });
    expect(res.statusCode).toBe(400);
    expect((await inbox(id)).accepted_codes).toEqual([]);
  });

  it('T021-7: kế toán viên (ngoài accept_roles) → 403; chủ đơn vị → chấp nhận, điểm hết trừ, bằng chứng có lý do', async () => {
    await post(`/api/v1/intake/${id}/patch`, { ops: [{ op: 'replace', path: '/docDate', value: '2026-10-05' }], reason: 'Sửa ngày theo hoá đơn' });
    expect((await inbox(id)).score).toBeLessThan(100); // còn IN-MD-005
    expect((await post(`/api/v1/intake/${id}/accept`, { codes: ['IN-MD-005'], reason: 'Khách lẻ, MST ghi nhầm' }, ktv)).statusCode).toBe(403);
    const res = await post(`/api/v1/intake/${id}/accept`, { codes: ['IN-MD-005'], reason: 'Khách lẻ, MST ghi nhầm — đã gọi xác nhận' });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data).toMatchObject({ acceptedCodes: ['IN-MD-005'], score: 100 });
    const ev = await db.selectFrom('audit_logs').select('after_data').where('tenant_id', '=', tenantId).where('object_type', '=', 'intake_inbox').where('object_id', '=', id).orderBy('id', 'desc').executeTakeFirstOrThrow();
    expect(JSON.stringify(ev.after_data)).toContain('đã gọi xác nhận');
  });

  it('nộp lại có cảnh báo đã chấp nhận → accepted, sự việc ghi acceptedCodes', async () => {
    const res = await post(`/api/v1/intake/${id}/resubmit`, {});
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data.status).toBe('accepted');
    const ev = await db.selectFrom('accounting_events').select('payload').where('tenant_id', '=', tenantId).where('doc_key', '=', 'rp:CN01:C1').executeTakeFirstOrThrow();
    expect((ev.payload as { extra?: { intake?: { acceptedCodes?: string[] } } }).extra?.intake?.acceptedCodes).toEqual(['IN-MD-005']);
  });

  it('bỏ mục: kế toán viên → 403; chủ đơn vị → dismissed', async () => {
    const d = await reject({ docKey: 'rp:CN01:D1', docNo: 'D1', docDate: '05/10/2026' });
    expect((await post(`/api/v1/intake/${d}/dismiss`, { reason: 'Nguồn huỷ phiếu' }, ktv)).statusCode).toBe(403);
    const res = await post(`/api/v1/intake/${d}/dismiss`, { reason: 'Nguồn huỷ phiếu' });
    expect(res.statusCode, res.body).toBe(200);
    expect(await inbox(d)).toMatchObject({ status: 'dismissed', resolution_note: 'Nguồn huỷ phiếu' });
  });

  it('danh sách: closed lọc mục đã đóng, kèm số bản vá', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/intake?closed=1&closedDays=7', headers: { authorization: `Bearer ${ctx.token}` } });
    const rows = res.json().data as { status: string; patch_count: number; doc_key: string }[];
    expect(rows.every((r) => !['open', 'trial'].includes(r.status))).toBe(true);
    expect(rows.find((r) => r.doc_key === 'rp:CN01:A1')?.patch_count).toBe(1);
  });
});

describe('Kiểm thử (T021-9)', () => {
  it('không sự việc, không bút toán, không sự kiện; mục trial của đúng người (mine)', async () => {
    const before = await Promise.all([count('accounting_events'), count('ledger_entries'), count('event_outbox')]);
    const res = await post('/api/v1/intake/preflight', { document: saleDoc({ docKey: 'rp:CN01:T1', docNo: 'T1' }), save: true }, ktv);
    expect(res.statusCode, res.body).toBe(200);
    const trialId = res.json().data.trialId as string;
    expect(await Promise.all([count('accounting_events'), count('ledger_entries'), count('event_outbox')])).toEqual(before);
    const mine = (token: string) => ctx.app.inject({ method: 'GET', url: '/api/v1/intake?status=trial&mine=1', headers: { authorization: `Bearer ${token}` } }).then((r) => (r.json().data as { id: string }[]).map((x) => x.id));
    expect(await mine(ktv)).toContain(trialId);
    expect(await mine(ctx.token)).not.toContain(trialId);
  });
});
