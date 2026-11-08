// [2026-11-08 10:31 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — gói K3 đợt 1: dữ liệu mẫu chèn thẳng có created_by (0080 bắt buộc)
// [2026-11-06 08:25 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-31: hàng việc — T030-QUEUE-1..7 (chữ chốt: docs/phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/23-HANG-VIEC.md)
/**
 * Hàng việc: view `bizcity_read.document_queue` (migration 0076) và ba action `core.queue.summary | items | mine`.
 *   T030-QUEUE-1  ánh xạ trạng thái của bốn nguồn; chứng từ đã xong không có mặt; bể chờ chỉ lấy `open`
 *   T030-QUEUE-2  tổng hợp: các bucket tuổi cộng lại bằng tổng; mốc ≤ 1 / 3 / 7 / > 7 ngày
 *   T030-QUEUE-3  việc của tôi: người lập thấy nháp / bị trả lại / chờ duyệt của mình, không thấy việc của mình ở "chờ bạn duyệt";
 *                 người chỉ có quyền cấp 1 không thấy việc cấp 2; người xem (documents:read) không thấy việc cần quyền ghi
 *   T030-QUEUE-4  cô lập đơn vị
 *   T030-QUEUE-5  view chỉ đọc
 *   T030-QUEUE-6  phân trang theo con trỏ ổn định kể cả khi nhiều dòng cùng thời điểm; limit > 100 bị từ chối
 *   T030-QUEUE-7  vài nghìn dòng: nằm trong ngân sách thời gian, nhánh phiếu mua dùng chỉ mục (tenant_id, status, kind)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { buildMine, ageBucket, type MineRow } from '../src/modules/system/queue.routes.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx, other: TestCtx, kt: TestCtx, ktt: TestCtx, viewer: TestCtx;
let tenantId = '', otherId = '';
let ktActor = '', kttActor = '';
let partnerId = '', branchId = '';

async function userCtx(c: TestCtx, email: string, role: string): Promise<{ ctx: TestCtx; actor: string }> {
  const r = await call(c, 'POST', '/api/v1/users', { email, fullName: email.split('@')[0], role, password: 'Pass@12345' });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  const login = await c.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: c.tenantCode, email, password: 'Pass@12345' } });
  const row = await db.selectFrom('users').select('id').where('email', '=', email).where('tenant_id', '=', (await db.selectFrom('tenants').select('id').where('code', '=', c.tenantCode).executeTakeFirstOrThrow()).id).executeTakeFirstOrThrow();
  return { ctx: { ...c, token: login.json().data.token }, actor: `user:${row.id}` };
}

const ago = (days: number) => sql`now() - (${days} * interval '1 day')`;

async function pr(t: string, no: string, status: string, by: string, over: { submittedDays?: number; a1Days?: number; updatedDays?: number } = {}) {
  await sql`INSERT INTO payment_requests (tenant_id, request_no, request_date, branch_code, partner_id, amount, status, created_by, submitted_at, approved1_at, updated_at)
            VALUES (${t}, ${no}, '2026-10-12', 'CN01', ${partnerId}, 1000000, ${status}, ${by},
                    ${over.submittedDays != null ? ago(over.submittedDays) : null}, ${over.a1Days != null ? ago(over.a1Days) : null}, ${ago(over.updatedDays ?? 0)})`.execute(db);
}
async function pd(t: string, no: string, status: string, by: string, kind = 'receipt', days = 0) {
  await sql`INSERT INTO purchase_documents (tenant_id, kind, status, doc_no, doc_date, branch_code, partner_code, total, created_by, updated_at)
            VALUES (${t}, ${kind}, ${status}, ${no}, '2026-10-12', 'CN01', 'NCC-Q', 2000000, ${by}, ${ago(days)})`.execute(db);
}
async function ev(t: string, key: string, status: string, days = 0) {
  await sql`INSERT INTO accounting_events (tenant_id, doc_key, doc_type, branch_id, doc_no, doc_date, payload, status, total, received_at, created_by)
            VALUES (${t}, ${key}, 'sale', ${branchId}, ${key}, '2026-10-12', '{}'::jsonb, ${status}, 3000000, ${ago(days)}, 'test')`.execute(db);
}
async function ib(t: string, key: string, status: string, days = 0) {
  await sql`INSERT INTO intake_inbox (tenant_id, channel, actor, doc_key, doc_type, payload_raw, payload_hash, payload_bytes, score, status, received_at)
            VALUES (${t}, 'api', 'user:1', ${key}, 'sale', '{}'::jsonb, ${'h-' + key}, 2, 50, ${status}, ${ago(days)})`.execute(db);
}

beforeAll(async () => {
  ctx = await setupTenant();
  other = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  otherId = (await db.selectFrom('tenants').select('id').where('code', '=', other.tenantCode).executeTakeFirstOrThrow()).id;
  const k = await userCtx(ctx, 'kt@hangviec.local', 'accountant'); kt = k.ctx; ktActor = k.actor;
  const kk = await userCtx(ctx, 'ktt@hangviec.local', 'chief_accountant'); ktt = kk.ctx; kttActor = kk.actor;
  viewer = (await userCtx(ctx, 'xem@hangviec.local', 'viewer')).ctx;
  await call(ctx, 'PUT', '/api/v1/partners/NCC-Q', { name: 'NCC hàng việc', kind: 'supplier' });
  await call(other, 'PUT', '/api/v1/partners/NCC-Q', { name: 'NCC hàng việc', kind: 'supplier' });
  partnerId = (await db.selectFrom('partners').select('id').where('tenant_id', '=', tenantId).where('code', '=', 'NCC-Q').executeTakeFirstOrThrow()).id;
  branchId = (await db.selectFrom('branches').select('id').where('tenant_id', '=', tenantId).where('code', '=', 'CN01').executeTakeFirstOrThrow()).id;
  const otherPartner = (await db.selectFrom('partners').select('id').where('tenant_id', '=', otherId).where('code', '=', 'NCC-Q').executeTakeFirstOrThrow()).id;

  // Đề nghị thanh toán: đủ các trạng thái
  await pr(tenantId, 'DN-01', 'draft', ktActor);
  await pr(tenantId, 'DN-02', 'submitted', ktActor, { submittedDays: 2 });                 // kt lập, chờ duyệt cấp 1, 2 ngày → d3
  await pr(tenantId, 'DN-03', 'approved1', 'user:999', { a1Days: 9 });                       // chờ cấp 2, 9 ngày → over7
  await pr(tenantId, 'DN-04', 'approved', ktActor, { a1Days: 1 });                           // đã duyệt, chờ chi
  await pr(tenantId, 'DN-05', 'rejected', ktActor, { updatedDays: 3 });                      // bị trả lại
  await pr(tenantId, 'DN-06', 'paid', ktActor);                                              // xong: không có mặt
  await pr(tenantId, 'DN-07', 'cancelled', ktActor);                                         // xong: không có mặt
  await pr(tenantId, 'DN-08', 'submitted', kttActor, { submittedDays: 0 });                  // ktt lập, chờ duyệt
  // Phiếu mua
  await pd(tenantId, 'PM-01', 'draft', ktActor, 'receipt', 0);
  await pd(tenantId, 'PM-02', 'pending_approval', 'user:999', 'receipt', 6);                 // d7
  await pd(tenantId, 'PM-03', 'approved', ktActor);                                          // đã ghi sổ: không có mặt
  await pd(tenantId, 'PM-04', 'cancelled', ktActor);
  // Sự việc kế toán và bể chờ
  await ev(tenantId, 'EV-PENDING', 'pending', 5);
  await ev(tenantId, 'EV-ERROR', 'error', 1);
  await ev(tenantId, 'EV-CANCELLED', 'cancelled');
  await ib(tenantId, 'IB-OPEN', 'open', 0);
  await ib(tenantId, 'IB-TRIAL', 'trial');
  await ib(tenantId, 'IB-ACCEPTED', 'accepted');
  // Đơn vị khác
  await sql`INSERT INTO payment_requests (tenant_id, request_no, request_date, branch_code, partner_id, amount, status, created_by, submitted_at)
            VALUES (${otherId}, 'DN-KHAC', '2026-10-12', 'CN01', ${otherPartner}, 5000000, 'submitted', 'user:1', now())`.execute(db);
});
afterAll(async () => {
  await ctx.app.close();
  await other.app.close();
});

const view = async (t: string) => (await sql<{ source: string; doc_no: string; status_raw: string; status_group: string; flag: string | null }>`
  SELECT source, doc_no, status_raw, status_group, flag FROM bizcity_read.document_queue WHERE tenant_id = ${t} ORDER BY source, doc_no`.execute(db)).rows;

describe('T030-QUEUE-1 · ánh xạ trạng thái bốn nguồn', () => {
  it('đúng nhóm và cờ theo PHASE-030 · 23 §1.2; chứng từ đã xong không có mặt', async () => {
    const rows = await view(tenantId);
    const by = Object.fromEntries(rows.map((r) => [r.doc_no, `${r.status_group}/${r.flag ?? '-'}`]));
    expect(by).toEqual({
      'DN-01': 'draft/-', 'DN-02': 'pending/-', 'DN-03': 'pending/-', 'DN-04': 'approved/-', 'DN-05': 'draft/returned', 'DN-08': 'pending/-',
      'PM-01': 'draft/-', 'PM-02': 'pending/-',
      'EV-PENDING': 'pending/held', 'EV-ERROR': 'draft/blocked',
      'IB-OPEN': 'pending/held',
    });
    // không có: paid, cancelled, phiếu mua đã duyệt, sự việc đã huỷ, mục bể chờ thử / đã đóng (sự việc 'posted' không dựng ở đây vì cần bút toán để qua bất biến sổ)
    for (const gone of ['DN-06', 'DN-07', 'PM-03', 'PM-04', 'EV-CANCELLED', 'IB-TRIAL', 'IB-ACCEPTED']) expect(by[gone], gone).toBeUndefined();
  });
});

describe('T030-QUEUE-2 · tổng hợp và tuổi', () => {
  it('summary: đếm đúng, các bucket tuổi cộng lại bằng tổng của từng nguồn', async () => {
    const r = (await call(ctx, 'GET', '/api/v1/queue/summary')).body.data;
    expect(r.total).toBe(11);
    expect(r.byGroup).toEqual({ draft: 4, pending: 6, approved: 1 });
    expect(r.byFlag).toEqual({ held: 2, blocked: 1, returned: 1 });
    for (const s of r.bySource) expect(s.aging.d1 + s.aging.d3 + s.aging.d7 + s.aging.over7, s.source).toBe(s.total);
    const get = (source: string) => r.bySource.find((x: { source: string }) => x.source === source);
    expect(get('payment_request')).toMatchObject({ total: 6, draft: 2, pending: 3, approved: 1, returned: 1 });
    expect(get('purchase_document')).toMatchObject({ total: 2, draft: 1, pending: 1 });
    expect(get('accounting_event')).toMatchObject({ total: 2, held: 1, blocked: 1 });
    expect(get('intake')).toMatchObject({ total: 1, held: 1 });
  });

  it('mốc tuổi: 2 ngày → d3; 6 ngày → d7; 9 ngày → over7; việc cũ nhất', async () => {
    const r = (await call(ctx, 'GET', '/api/v1/queue/summary')).body.data;
    const pay = r.bySource.find((x: { source: string }) => x.source === 'payment_request');
    expect(pay.aging.over7).toBe(1);                       // DN-03 (9 ngày)
    expect(pay.oldestDays).toBeGreaterThanOrEqual(9);
    const buy = r.bySource.find((x: { source: string }) => x.source === 'purchase_document');
    expect(buy.aging.d7).toBe(1);                          // PM-02 (6 ngày)
    expect(ageBucket(0)).toBe('d1'); expect(ageBucket(1)).toBe('d1'); expect(ageBucket(2)).toBe('d3'); expect(ageBucket(3)).toBe('d3');
    expect(ageBucket(4)).toBe('d7'); expect(ageBucket(7)).toBe('d7'); expect(ageBucket(8)).toBe('over7');
  });

  it('lọc theo nguồn và chi nhánh', async () => {
    const one = (await call(ctx, 'GET', '/api/v1/queue/summary?source=intake')).body.data;
    expect(one.total).toBe(1);
    const none = (await call(ctx, 'GET', '/api/v1/queue/summary?branch=KHONG-CO')).body.data;
    expect(none.total).toBe(0);
  });
});

describe('T030-QUEUE-3 · việc của tôi', () => {
  const part = (m: { entries: { part: string; source: string; statusRaw: string; count: number }[] }, p: string) => m.entries.filter((e) => e.part === p).map((e) => `${e.source}:${e.statusRaw}:${e.count}`).sort();

  it('người lập (kế toán): thấy nháp, bị trả lại, chờ duyệt của mình; việc cần quyền ghi', async () => {
    const m = (await call(kt, 'GET', '/api/v1/queue/mine')).body.data;
    expect(part(m, 'returned')).toEqual(['payment_request:rejected:1']);
    expect(part(m, 'drafts')).toEqual(['payment_request:draft:1', 'purchase_document:draft:1']);
    expect(part(m, 'waiting')).toEqual(['payment_request:submitted:1']);                    // DN-02 của kt
    // kế toán có documents:write nhưng KHÔNG có payments:approve: không thấy DN-08 (cấp 1) lẫn DN-03 (cấp 2)
    const ta = part(m, 'toApprove');
    expect(ta).toContain('purchase_document:pending_approval:1');                           // PM-02 của người khác
    expect(ta.some((x) => x.startsWith('payment_request:submitted'))).toBe(false);
    expect(ta.some((x) => x.startsWith('payment_request:approved1'))).toBe(false);
    // DN-04 do chính kt lập nên không vào "chờ bạn" dù có documents:write
    expect(ta.some((x) => x.startsWith('payment_request:approved:'))).toBe(false);
    expect(part(m, 'blocked')).toEqual(['accounting_event:error:1']);
    expect(part(m, 'held')).toEqual(['accounting_event:pending:1', 'intake:open:1']);
    expect(m.viec.every((v: { key: string; groups: string[]; path: string }) => v.key.startsWith('hv:') && v.groups.length > 0 && v.path.startsWith('/'))).toBe(true);
  });

  it('kế toán trưởng: thấy việc cấp 1 của người khác, không thấy việc do chính mình lập', async () => {
    const m = (await call(ktt, 'GET', '/api/v1/queue/mine')).body.data;
    expect(part(m, 'toApprove')).toContain('payment_request:submitted:1');                  // DN-02 của kt (DN-08 là của ktt: loại)
    expect(part(m, 'waiting')).toEqual(['payment_request:submitted:1']);                    // DN-08 hiện ở "đang chờ" của chính ktt
    expect(part(m, 'toApprove').find((x) => x.startsWith('payment_request:submitted'))).toBe('payment_request:submitted:1');
  });

  it('người xem (documents:read): không có việc cần quyền ghi, không thấy việc của người khác', async () => {
    const m = (await call(viewer, 'GET', '/api/v1/queue/mine')).body.data;
    expect(m.entries).toEqual([]);
    expect(m.viec).toEqual([]);
  });

  it('chủ đơn vị: thấy cả hai cấp duyệt', async () => {
    const m = (await call(ctx, 'GET', '/api/v1/queue/mine')).body.data;
    const ta = part(m, 'toApprove');
    expect(ta).toContain('payment_request:approved1:1');
    expect(ta).toContain('payment_request:submitted:2');
  });

  it('buildMine (hàm thuần): cờ blocked / held chỉ hiện cho người có documents:write', () => {
    const rows: MineRow[] = [
      { source: 'accounting_event', statusRaw: 'error', statusGroup: 'draft', flag: 'blocked', mine: false, count: 2, amount: 0, oldestDays: 1 },
      { source: 'intake', statusRaw: 'open', statusGroup: 'pending', flag: 'held', mine: false, count: 3, amount: 0, oldestDays: 0 },
    ];
    expect(buildMine(rows, () => false).viec).toEqual([]);
    const withWrite = buildMine(rows, (p) => p === 'documents:write').viec;
    expect(withWrite.map((v) => [v.level, v.count])).toEqual([['error', 2], ['warn', 3]]);
  });
});

describe('T030-QUEUE-4 · cô lập đơn vị', () => {
  it('đơn vị này không thấy việc của đơn vị kia, và ngược lại', async () => {
    const mine = (await call(ctx, 'GET', '/api/v1/queue/items?limit=100')).body.data;
    expect(mine.items.some((i: { docNo: string }) => i.docNo === 'DN-KHAC')).toBe(false);
    const theirs = (await call(other, 'GET', '/api/v1/queue/items?limit=100')).body.data;
    expect(theirs.items.map((i: { docNo: string }) => i.docNo)).toEqual(['DN-KHAC']);
    expect((await call(other, 'GET', '/api/v1/queue/summary')).body.data.total).toBe(1);
  });
});

describe('T030-QUEUE-5 · view chỉ đọc', () => {
  it('INSERT / UPDATE / DELETE vào bizcity_read.document_queue bị từ chối', async () => {
    await expect(sql`INSERT INTO bizcity_read.document_queue (tenant_id) VALUES (${tenantId})`.execute(db)).rejects.toThrow(/chỉ đọc/);
    await expect(sql`UPDATE bizcity_read.document_queue SET flag = NULL WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/chỉ đọc/);
    await expect(sql`DELETE FROM bizcity_read.document_queue WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/chỉ đọc/);
  });
});

describe('T030-QUEUE-6 · phân trang theo con trỏ', () => {
  it('không lặp, không sót kể cả khi nhiều dòng cùng thời điểm; thứ tự cũ nhất trước', async () => {
    await sql`INSERT INTO purchase_documents (tenant_id, kind, status, doc_no, doc_date, branch_code, partner_code, total, created_by, updated_at)
              SELECT ${otherId}, 'receipt', 'draft', 'PG-' || g, '2026-10-12', 'CN01', 'NCC-Q', 1, 'user:1', timestamptz '2026-10-01 10:00:00+07'
                FROM generate_series(1, 7) g`.execute(db);
    const all: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const url: string = `/api/v1/queue/items?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const r = (await call(other, 'GET', url)).body.data;
      all.push(...r.items.map((i: { source: string; sourceId: string }) => `${i.source}:${i.sourceId}`));
      cursor = r.next;
      pages++;
    } while (cursor && pages < 10);
    const total = (await call(other, 'GET', '/api/v1/queue/summary')).body.data.total;
    expect(total).toBe(8);                                  // 7 phiếu mua + DN-KHAC
    expect(all).toHaveLength(total);
    expect(new Set(all).size).toBe(total);
    const sorted = (await call(other, 'GET', '/api/v1/queue/items?limit=100')).body.data.items;
    const times = sorted.map((i: { waitingSince: string }) => Date.parse(i.waitingSince));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('limit > 100 và con trỏ sai bị từ chối', async () => {
    expect((await call(ctx, 'GET', '/api/v1/queue/items?limit=101')).status).toBe(400);
    expect((await call(ctx, 'GET', '/api/v1/queue/items?cursor=khong-phai-con-tro')).status).toBe(400);
  });

  it('lọc: nhóm, cờ, tuổi, chữ trong số chứng từ', async () => {
    const f = async (qs: string) => (await call(ctx, 'GET', `/api/v1/queue/items?${qs}`)).body.data.items.map((i: { docNo: string }) => i.docNo).sort();
    expect(await f('flag=returned')).toEqual(['DN-05']);
    expect(await f('flag=blocked')).toEqual(['EV-ERROR']);
    expect(await f('group=approved')).toEqual(['DN-04']);
    expect(await f('age=over7')).toEqual(['DN-03']);
    expect(await f('q=PM-')).toEqual(['PM-01', 'PM-02']);
    expect(await f('q=%25')).toEqual([]);                    // ký tự % không phải ký tự đại diện
  });
});

describe('T030-QUEUE-7 · quy mô và chỉ mục', () => {
  it('3.000 phiếu mua đã duyệt + 40 nháp: summary trong ngân sách, nhánh phiếu mua dùng chỉ mục trạng thái', async () => {
    const t = (await setupTenant());
    const tid = (await db.selectFrom('tenants').select('id').where('code', '=', t.tenantCode).executeTakeFirstOrThrow()).id;
    await sql`INSERT INTO purchase_documents (tenant_id, kind, status, doc_no, doc_date, branch_code, partner_code, total, created_by)
              SELECT ${tid}, 'receipt', CASE WHEN g <= 40 THEN 'draft' ELSE 'approved' END, 'Q-' || g, '2026-10-12', 'CN01', 'NCC-Q', 1, 'user:1'
                FROM generate_series(1, 3040) g`.execute(db);
    await sql`ANALYZE purchase_documents`.execute(db);
    const t0 = Date.now();
    const r = (await call(t, 'GET', '/api/v1/queue/summary')).body.data;
    const ms = Date.now() - t0;
    expect(r.total).toBe(40);
    expect(ms, `summary mất ${ms} ms`).toBeLessThan(3000);
    const plan = (await sql<{ 'QUERY PLAN': unknown }>`EXPLAIN (FORMAT JSON) SELECT status_group FROM bizcity_read.document_queue WHERE tenant_id = ${tid}`.execute(db)).rows[0]!['QUERY PLAN'];
    const nodes: { 'Node Type': string; 'Relation Name'?: string }[] = [];
    const walk = (n: any) => { if (!n) return; nodes.push(n); for (const c of n.Plans ?? []) walk(c); };
    walk((plan as any)[0].Plan);
    const scan = nodes.filter((n) => n['Relation Name'] === 'purchase_documents').map((n) => n['Node Type']);
    expect(scan.length).toBeGreaterThan(0);
    expect(scan.every((s) => s !== 'Seq Scan'), `purchase_documents quét: ${scan.join(', ')}`).toBe(true);
    await t.app.close();
  });
});
