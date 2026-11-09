// [2026-11-09 10:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W4a (S031-28, chữ chốt PHASE-031 · 00 §12): đọc sổ đăng ký, chứng từ đã áp, theo dõi, truy vết ngược
/**
 *   T031-INS-1  registry: các bản, số chứng từ đã áp theo bản, bản đang hiệu lực; findGaps phát hiện khoảng trống
 *   T031-INS-2  applications: phân trang đúng, lọc theo bản, chính sách lạ → 404
 *   T031-INS-3  tracking: tỉ lệ đạt + đếm mã khớp dữ liệu dựng; kỳ không có dữ liệu → null, không chia cho 0
 *   T031-INS-4  độ trễ phiên bản chỉ tính IN-POL-003, kèm bản cuối nguồn đã gửi
 *   T031-INS-5  lineage: băm lệch, ngày chứng từ ngoài hiệu lực
 *   T031-INS-6  cô lập đơn vị; quyền catalog:read
 * Dữ liệu dựng bằng cửa nạp thật (policyRefs), không chèn tay: sổ của đơn vị test phải qua bất biến.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { findGaps } from '../src/modules/system/policy-insight.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx, other: TestCtx;
let tenantId = '', policyId = '';
const hashes: Record<number, string> = {};
const REASON = 'Chiến dịch thử nghiệm';
const promo = (over: Record<string, unknown> = {}) => ({ buy: { sku: 'A', qty: 2 }, get: { sku: 'B', qty: 1 }, repeat: true, ...over });
const pub = (key: string, params: unknown, effectiveFrom: string) =>
  call(ctx, 'POST', '/api/v1/policies', { key, ruleContract: 'sale.promo.buy_x_get_y@1', params, effectiveFrom, reason: REASON });
let n = 0;
const ingest = async (docDate: string, refs: unknown[] | null) => {
  n += 1;
  const doc = saleDoc({ docKey: `ins:CN01:${n}`, docNo: `INS${n}`, docDate, invoice: { no: String(1000 + n), serial: 'C26TAA', form: '1', date: docDate }, ...(refs ? { policyRefs: refs } : {}) });
  const r = await ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: doc as never, headers: { authorization: `Bearer ${ctx.token}` } });
  expect(r.statusCode, r.body).toBeLessThan(300);
  return `ins:CN01:${n}`;
};
const ref = (v: number, hash = hashes[v]!) => ({ key: 'INS-A', version: v, hash, policyId });
const eventId = async (docKey: string) => Number((await sql<{ id: string }>`SELECT id::text AS id FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${docKey}`.execute(db)).rows[0]!.id);
const RANGE = 'from=2026-10-01&to=2026-11-30';
const keys: Record<string, string> = {};

beforeAll(async () => {
  ctx = await setupTenant();
  other = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  const p1 = await pub('INS-A', promo(), '2026-10-01');
  expect(p1.status, JSON.stringify(p1.body)).toBe(201);
  policyId = p1.body.data.policyId;
  expect((await pub('INS-A', promo({ get: { sku: 'B', qty: 2 } }), '2026-11-01')).status).toBe(201);
  const rows = (await sql<{ version: number; content_hash: string }>`SELECT version, content_hash FROM policy_registry WHERE tenant_id = ${tenantId} AND policy_id = ${policyId}`.execute(db)).rows;
  for (const r of rows) hashes[Number(r.version)] = r.content_hash;

  keys.ok1 = await ingest('2026-10-15', [ref(1)]);               // đạt, bản 1 đúng ngày
  keys.ok2 = await ingest('2026-11-15', [ref(2)]);               // đạt, bản 2 đúng ngày
  keys.stale = await ingest('2026-11-16', [ref(1)]);             // dùng bản cũ → IN-POL-003
  keys.stale2 = await ingest('2026-11-20', [ref(1)]);            // lại dùng bản cũ (để IN-POL-003 ≠ IN-POL-001 về số đếm)
  keys.badHash = await ingest('2026-11-17', [ref(2, 'f'.repeat(64))]); // băm lệch → IN-POL-001
  keys.noRef = await ingest('2026-11-18', null);                  // bán không gửi tham chiếu
});
afterAll(async () => { await ctx.app.close(); await other.app.close(); });

describe('T031-INS-1 · sổ đăng ký', () => {
  it('liệt kê bản, đếm chứng từ đã áp theo bản, bản đang hiệu lực', async () => {
    const r = await call(ctx, 'GET', '/api/v1/policy-registry');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const p = r.body.data.items.find((i: { policyKey: string }) => i.policyKey === 'INS-A');
    expect(p.versions.map((v: { version: number; applied: number }) => [v.version, v.applied])).toEqual([[1, 3], [2, 2]]);
    expect(p.versions[0]).toMatchObject({ effectiveFrom: '2026-10-01', effectiveTo: '2026-10-31', status: 'published' });
    expect(p.current).toBe(2);
    expect(p.gaps).toEqual([]);
    expect((await call(ctx, 'GET', '/api/v1/policy-registry?q=khong-co')).body.data.items).toEqual([]);
    expect((await call(ctx, 'GET', '/api/v1/policy-registry?status=retired')).body.data.items).toEqual([]);
  });
  it('findGaps: khoảng trống giữa hai bản; bản liền nhau không có', () => {
    expect(findGaps([{ version: 1, effectiveFrom: '2026-01-01', effectiveTo: '2026-01-31' }, { version: 2, effectiveFrom: '2026-02-01', effectiveTo: null }])).toEqual([]);
    expect(findGaps([{ version: 1, effectiveFrom: '2026-01-01', effectiveTo: '2026-01-31' }, { version: 2, effectiveFrom: '2026-02-05', effectiveTo: null }])).toEqual([{ after: 1, from: '2026-02-01', to: '2026-02-04' }]);
  });
});

describe('T031-INS-2 · chứng từ đã áp', () => {
  it('phân trang theo con trỏ, mới nhất trước, lọc theo bản', async () => {
    const q = (extra = '') => call(ctx, 'GET', `/api/v1/policy-registry/${encodeURIComponent(policyId)}/applications?${extra}`);
    const p1 = await q('limit=2');
    expect(p1.status, JSON.stringify(p1.body)).toBe(200);
    expect(p1.body.data.items).toHaveLength(2);
    expect(p1.body.data.next).not.toBeNull();
    const p2 = await q(`limit=2&cursor=${p1.body.data.next}`);
    expect(p2.body.data.items).toHaveLength(2);
    const p3 = await q(`limit=2&cursor=${p2.body.data.next}`);
    expect(p3.body.data.items).toHaveLength(1);
    expect(p3.body.data.next).toBeNull();
    const ids = [...p1.body.data.items, ...p2.body.data.items, ...p3.body.data.items].map((i: { eventId: number }) => i.eventId);
    expect(new Set(ids).size).toBe(5);
    expect([...ids].sort((a, b) => b - a)).toEqual(ids);
    const v1 = await q('version=1');
    expect(v1.body.data.items.map((i: { docKey: string }) => i.docKey).sort()).toEqual([keys.ok1, keys.stale, keys.stale2].sort());
    expect((await call(ctx, 'GET', '/api/v1/policy-registry/khong-co:x:y/applications')).status).toBe(404);
  });
});

describe('T031-INS-3 · theo dõi', () => {
  it('tỉ lệ đạt, lệch theo mã, độ phủ theo nguồn, dòng thời gian', async () => {
    const r = await call(ctx, 'GET', `/api/v1/policy-tracking?${RANGE}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const d = r.body.data;
    expect(d.range).toEqual({ from: '2026-10-01', to: '2026-11-30' });
    expect(d.pass).toEqual({ events: 5, passed: 2, rate: 0.4 });
    expect(d.applied.events).toBe(5);
    expect(Object.fromEntries(d.codes.map((c: { code: string; n: number }) => [c.code, c.n]))).toEqual({ 'IN-POL-001': 1, 'IN-POL-003': 2 });
    expect(d.coverage).toHaveLength(1);
    expect(d.coverage[0]).toMatchObject({ events: 6, withRefs: 5, rate: 0.8333 });
    expect(d.timeline.map((t: { version: number }) => t.version).sort()).toEqual([1, 2]);
  });
  it('kỳ không có dữ liệu → tỉ lệ null, không chia cho 0', async () => {
    const d = (await call(ctx, 'GET', '/api/v1/policy-tracking?from=2025-01-01&to=2025-01-31')).body.data;
    expect(d.pass).toEqual({ events: 0, passed: 0, rate: null });
    expect(d.codes).toEqual([]);
    expect(d.stale).toEqual([]);
  });
  it('kỳ sai khuôn / ngược → 400', async () => {
    expect((await call(ctx, 'GET', '/api/v1/policy-tracking?from=2026-12-01&to=2026-11-01')).status).toBe(400);
  });
});

describe('T031-INS-4 · độ trễ phiên bản', () => {
  it('chỉ tính IN-POL-003, kèm bản cuối nguồn đã gửi', async () => {
    const d = (await call(ctx, 'GET', `/api/v1/policy-tracking?${RANGE}`)).body.data;
    expect(d.stale).toHaveLength(1);
    expect(d.stale[0]).toMatchObject({ policy_key: 'INS-A', stale: 2, last_sent: 2 });
  });
});

describe('T031-INS-5 · truy vết ngược', () => {
  it('dùng bản cũ: băm khớp nhưng ngày chứng từ ngoài hiệu lực', async () => {
    const d = (await call(ctx, 'GET', `/api/v1/policy-lineage?eventId=${await eventId(keys.stale!)}`)).body.data;
    expect(d.event).toMatchObject({ docKey: keys.stale, docDate: '2026-11-16' });
    expect(d.refs).toHaveLength(1);
    expect(d.refs[0]).toMatchObject({ key: 'INS-A', version: 1, registered: true, hashMatches: true, covers: false, effectiveTo: '2026-10-31' });
    expect(JSON.stringify(d.policyCheck)).toContain('IN-POL-003');
  });
  it('băm lệch được báo; tra bằng docKey; chứng từ không tham chiếu → refs rỗng', async () => {
    const d = (await call(ctx, 'GET', `/api/v1/policy-lineage?docKey=${encodeURIComponent(keys.badHash!)}`)).body.data;
    expect(d.refs[0]).toMatchObject({ registered: true, hashMatches: false, covers: true });
    expect((await call(ctx, 'GET', `/api/v1/policy-lineage?docKey=${encodeURIComponent(keys.noRef!)}`)).body.data.refs).toEqual([]);
    expect((await call(ctx, 'GET', '/api/v1/policy-lineage?docKey=khong-co')).status).toBe(404);
    expect((await call(ctx, 'GET', '/api/v1/policy-lineage')).status).toBe(400);
  });
});

describe('T031-INS-6 · cô lập đơn vị và quyền', () => {
  it('đơn vị khác không thấy gì', async () => {
    expect((await call(other, 'GET', '/api/v1/policy-registry')).body.data.items).toEqual([]);
    expect((await call(other, 'GET', `/api/v1/policy-registry/${encodeURIComponent(policyId)}/applications`)).status).toBe(404);
    expect((await call(other, 'GET', `/api/v1/policy-tracking?${RANGE}`)).body.data.pass.events).toBe(0);
    expect((await call(other, 'GET', `/api/v1/policy-lineage?eventId=${await eventId(keys.ok1!)}`)).status).toBe(404);
  });
  it('khoá API không có catalog:read → 403; không khoá → 401', async () => {
    const mk = await call(ctx, 'POST', '/api/v1/api-keys', { name: 'Thử insight', scopes: ['reports:read'] });
    const k = mk.body.data.key as string;
    const get = (url: string) => ctx.app.inject({ method: 'GET', url, headers: { 'x-api-key': k } });
    expect((await get('/api/v1/policy-registry')).statusCode).toBe(200);
    await sql`UPDATE api_keys SET scopes = ARRAY['ledger:read']::text[] WHERE tenant_id = ${tenantId} AND name = 'Thử insight'`.execute(db);
    for (const url of ['/api/v1/policy-registry', `/api/v1/policy-tracking?${RANGE}`, '/api/v1/policy-lineage?eventId=1']) expect((await get(url)).statusCode, url).toBe(403);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/policy-registry' })).statusCode).toBe(401);
  });
});

// [2026-11-09 09:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W4c (S031-30, chữ chốt PHASE-031 · 00 §15): program[] — thực hiện chương trình
/**
 *   T031-PRG-1  chứng từ áp và quà đã tặng theo mặt hàng, tách theo bản
 *   T031-PRG-2  chứng từ có quà lệch (IN-POL-004) vào mismatched + tỉ lệ; không dòng quà cũng lệch
 *   T031-PRG-3  quà của chính sách khác trên cùng chứng từ không bị cộng nhầm
 *   T031-PRG-4  kỳ rỗng → program []; lọc nguồn không có → []
 *   T031-PRG-5  cô lập đơn vị
 * Đơn vị riêng (không đổi số của các ca INS ở trên).
 */
describe('Thực hiện chương trình (W4c)', () => {
  let t: TestCtx, o: TestCtx;
  let tid = '';
  const hh: Record<string, string> = {};
  let n2 = 0;

  beforeAll(async () => {
    t = await setupTenant();
    o = await setupTenant();
    tid = String((await db.selectFrom('tenants').select('id').where('code', '=', t.tenantCode).executeTakeFirstOrThrow()).id);
    const pub = (key: string, get: { sku: string; qty: number }, from: string) => call(t, 'POST', '/api/v1/policies', {
      key, ruleContract: 'sale.promo.buy_x_get_y@1', params: { buy: { sku: 'SUA01', qty: 1 }, get, repeat: true }, effectiveFrom: from, reason: 'Chiến dịch thử',
    });
    expect((await pub('PRG-A', { sku: 'QUA01', qty: 1 }, '2026-10-01')).status).toBe(201);
    expect((await pub('PRG-A', { sku: 'QUA01', qty: 2 }, '2026-11-01')).status).toBe(201);
    expect((await pub('PRG-B', { sku: 'QUA02', qty: 1 }, '2026-10-01')).status).toBe(201);
    expect((await pub('PRG-B', { sku: 'QUA02', qty: 1 }, '2026-11-01')).status).toBe(201); // bản 2 CÙNG số bản với PRG-A@2: chỉ khoá chính sách mới tách được quà
    for (const r of (await sql<{ policy_key: string; version: number; content_hash: string }>`SELECT policy_key, version, content_hash FROM policy_registry WHERE tenant_id = ${tid}`.execute(db)).rows) hh[`${r.policy_key}@${r.version}`] = r.content_hash;

    const ingest = async (date: string, refs: { key: string; version: number }[], gifts: { key: string; version: number; sku: string; qty: number }[]) => {
      n2 += 1;
      const base = saleDoc({ docKey: `prg:CN01:${n2}`, docNo: `PRG${n2}`, docDate: date, invoice: { no: String(7000 + n2), serial: 'C26TAA', form: '1', date: date } }) as { lines: Record<string, unknown>[] } & Record<string, unknown>;
      const [l1, l2] = [base.lines[0]!, base.lines[1]!];
      const lines = [l1, ...gifts.map((g, i) => ({ ...l2, lineKey: `g${i}`, sku: g.sku, qty: g.qty, policyRef: { key: g.key, version: g.version, line: 'gift' } }))];
      const doc = { ...base, lines, policyRefs: refs.map((r) => ({ key: r.key, version: r.version, hash: hh[`${r.key}@${r.version}`]!, policyId: `ban-hang:inline:${r.key}` })) };
      const r = await t.app.inject({ method: 'POST', url: '/api/v1/documents', payload: doc as never, headers: { authorization: `Bearer ${t.token}` } });
      expect(r.statusCode, r.body).toBeLessThan(300);
    };
    await ingest('2026-10-15', [{ key: 'PRG-A', version: 1 }], [{ key: 'PRG-A', version: 1, sku: 'QUA01', qty: 1 }]);   // đúng
    await ingest('2026-10-16', [{ key: 'PRG-A', version: 1 }], [{ key: 'PRG-A', version: 1, sku: 'QUA01', qty: 3 }]);   // thừa → lệch
    await ingest('2026-11-15', [{ key: 'PRG-A', version: 2 }], [{ key: 'PRG-A', version: 2, sku: 'QUA01', qty: 2 }]);   // đúng
    await ingest('2026-11-16', [{ key: 'PRG-A', version: 2 }], []);                                                     // thiếu quà → lệch
    await ingest('2026-11-17', [{ key: 'PRG-A', version: 2 }, { key: 'PRG-B', version: 2 }], [
      { key: 'PRG-A', version: 2, sku: 'QUA01', qty: 2 }, { key: 'PRG-B', version: 2, sku: 'QUA02', qty: 1 }]);          // hai chính sách trên một chứng từ
  });
  afterAll(async () => { await t.app.close(); await o.app.close(); });

  const program = async (c: TestCtx, q = RANGE) => (await call(c, 'GET', `/api/v1/policy-tracking?${q}`)).body.data.program as { policyKey: string; version: number; orders: number; giftsBySku: { sku: string; qty: number }[]; mismatched: number; mismatchRate: number | null }[];
  const row = (p: Awaited<ReturnType<typeof program>>, key: string, v: number) => p.find((x) => x.policyKey === key && x.version === v);

  it('T031-PRG-1/2: chứng từ áp, quà theo mặt hàng, lệch — tách theo bản', async () => {
    const p = await program(t);
    expect(row(p, 'PRG-A', 1)).toMatchObject({ orders: 2, giftsBySku: [{ sku: 'QUA01', qty: 4 }], mismatched: 1, mismatchRate: 0.5 });
    expect(row(p, 'PRG-A', 2)).toMatchObject({ orders: 3, giftsBySku: [{ sku: 'QUA01', qty: 4 }], mismatched: 1, mismatchRate: 0.3333 });
  });

  it('T031-PRG-3: quà của chính sách khác trên cùng chứng từ không cộng nhầm', async () => {
    const p = await program(t);
    expect(row(p, 'PRG-B', 2)).toMatchObject({ orders: 1, giftsBySku: [{ sku: 'QUA02', qty: 1 }], mismatched: 0, mismatchRate: 0 });
    expect(row(p, 'PRG-A', 2)!.giftsBySku.map((g) => g.sku)).toEqual(['QUA01']); // không có QUA02
  });

  it('T031-PRG-4: kỳ rỗng / lọc nguồn không có → []', async () => {
    expect(await program(t, 'from=2025-01-01&to=2025-01-31')).toEqual([]);
    expect(await program(t, `${RANGE}&source=khong-co`)).toEqual([]);
  });

  it('T031-PRG-5: cô lập đơn vị', async () => {
    expect(await program(o)).toEqual([]);
  });
});
