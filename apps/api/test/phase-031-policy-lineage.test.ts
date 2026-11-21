// [2026-11-21 09:45 AM Võ Hoàng] PHASE-031 — S031-23: làn `policy` của bizcity_lineage@1 (0.4.0-draft) — Hành trình mặt hàng + truy ngược chính sách
/**
 *   T031-LN-1  Hành trình QUA01: dòng quà mang chính sách của chính dòng (scope line), kết quả L4b từng chứng từ; `policies` có phong bì
 *              (người phát hành, băm khớp, hợp đồng luật), đếm sự kiện / quà / cảnh báo
 *   T031-LN-2  Hành trình SUA01: dòng không nêu chính sách nhận policyRefs của phiếu (scope doc); tham chiếu mồ côi → policyId null + ghi chú
 *   T031-LN-3  GET /lineage/policy?docKey=: sự việc → chính sách@bản (băm, hiệu lực, phát hành) → dòng chứng từ → dòng sổ (+ bản chính sách định khoản)
 *   T031-LN-4  đi từ bút toán (entryNo) ra cùng chuỗi; cảnh báo L4b hiện ở check; lineKey thu về một dòng
 *   T031-LN-5  chứng từ không gửi tham chiếu: nói rõ; thiếu tham số 400; không có 404; đơn vị khác không thấy
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import type { LineageItem, PolicyLineage } from '@ketoan/contracts';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx, other: TestCtx;
let tenantId = '', policyId = '', hash = '';
const K = { ok: 'pln:CN01:1', warn: 'pln:CN01:2', none: 'pln:CN01:3', orphan: 'pln:CN01:4' };

const sale = (docKey: string, docDate: string, opts: { gift?: number; refs?: unknown[]; lineRef?: boolean }) => {
  const base = saleDoc({ docKey, docNo: docKey.split(':')[2], docDate, sourceSystem: 'wp-pos', invoice: { no: docKey.replace(/\D/g, ''), serial: 'C26TAA', form: '1', date: docDate } }) as { lines: Record<string, unknown>[] } & Record<string, unknown>;
  const lines = opts.gift === undefined ? [base.lines[0]!]
    : [base.lines[0]!, { ...base.lines[1]!, qty: opts.gift, ...(opts.lineRef === false ? {} : { policyRef: { key: 'LN-QUA', version: 1, line: 'gift' } }) }];
  return { ...base, lines, ...(opts.refs ? { policyRefs: opts.refs } : {}) };
};
const lineage = (sku: string, as = ctx) => call<{ data: LineageItem }>(as, 'GET', `/api/v1/lineage/items/${sku}?from=2026-10-01&to=2026-10-31`);
const trace = (qs: string, as = ctx) => call<{ data: PolicyLineage }>(as, 'GET', `/api/v1/lineage/policy?${qs}`);

beforeAll(async () => {
  ctx = await setupTenant();
  other = await setupTenant();
  tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
  const p = await call(ctx, 'POST', '/api/v1/policies', {
    key: 'LN-QUA', ruleContract: 'sale.promo.buy_x_get_y@1', params: { buy: { sku: 'SUA01', qty: 1 }, get: { sku: 'QUA01', qty: 1 }, repeat: true },
    effectiveFrom: '2026-10-01', reason: 'Chương trình thử', legalRef: 'NĐ81/2018 Điều 8',
  });
  expect(p.status, JSON.stringify(p.body)).toBe(201);
  policyId = p.body.data.policyId;
  hash = (await sql<{ content_hash: string }>`SELECT content_hash FROM policy_registry WHERE tenant_id = ${tenantId} AND policy_id = ${policyId} AND version = 1`.execute(db)).rows[0]!.content_hash;
  const ref = { key: 'LN-QUA', version: 1, hash, policyId };
  for (const doc of [
    sale(K.ok, '2026-10-10', { gift: 1, refs: [ref] }),                       // đạt
    sale(K.warn, '2026-10-11', { gift: 2, refs: [ref] }),                     // thừa quà → IN-POL-004
    sale(K.none, '2026-10-12', {}),                                           // không gửi tham chiếu
    sale(K.orphan, '2026-10-13', { refs: [{ key: 'LN-MA', version: 1, hash: 'a'.repeat(64) }] }), // chính sách không có trong sổ → IN-POL-001
  ]) {
    const r = await call(ctx, 'POST', '/api/v1/documents', doc);
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
  }
});
afterAll(async () => { await ctx.app.close(); await other.app.close(); });

describe('S031-23 · làn policy — Hành trình mặt hàng', () => {
  it('T031-LN-1: dòng quà mang chính sách của chính dòng, kết quả L4b; policies có phong bì sổ đăng ký', async () => {
    const r = await lineage('QUA01');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const d = r.body.data;
    const byDoc = Object.fromEntries(d.events.map((e) => [e.docKey, e.policy]));
    expect(byDoc[K.ok]).toEqual([{ key: 'LN-QUA', version: 1, line: 'gift', scope: 'line', verdict: 'pass', codes: [] }]);
    expect(byDoc[K.warn]![0]).toMatchObject({ key: 'LN-QUA', scope: 'line', verdict: 'warn' });
    expect(byDoc[K.warn]![0]!.codes).toContain('IN-POL-004');
    expect(d.policies).toHaveLength(1);
    expect(d.policies![0]).toMatchObject({
      policyKey: 'LN-QUA', version: 1, policyId, ruleContract: 'sale.promo.buy_x_get_y@1', status: 'published', contentHash: hash, hashMatches: true,
      effectiveFrom: '2026-10-01', legalRef: 'NĐ81/2018 Điều 8', events: 2, giftQty: 3, warnEvents: 1, first: '2026-10-10', last: '2026-10-11',
    });
    expect(d.policies![0]!.publishedBy).toBeTruthy();
    expect(d.policies![0]!.publishedAt).toBeTruthy();
  });

  it('T031-LN-2: dòng không nêu chính sách nhận policyRefs của phiếu; tham chiếu mồ côi có ghi chú', async () => {
    const d = (await lineage('SUA01')).body.data;
    const byDoc = Object.fromEntries(d.events.map((e) => [e.docKey, e.policy]));
    expect(byDoc[K.ok]).toEqual([{ key: 'LN-QUA', version: 1, line: null, scope: 'doc', verdict: 'pass', codes: [] }]);
    expect(byDoc[K.none]).toEqual([]);
    expect(byDoc[K.orphan]![0]).toMatchObject({ key: 'LN-MA', scope: 'doc', verdict: 'warn' });
    expect(byDoc[K.orphan]![0]!.codes).toContain('IN-POL-001');
    const orphan = d.policies!.find((p) => p.policyKey === 'LN-MA')!;
    expect(orphan).toMatchObject({ policyId: null, hashMatches: null, events: 1, giftQty: 0 });
    expect(d.policies!.find((p) => p.policyKey === 'LN-QUA')).toMatchObject({ events: 2, giftQty: 0 });
    expect(d.coverage.notes.join(' ')).toMatch(/mồ côi/);
  });
});

describe('S031-23 · truy ngược chính sách (GET /api/v1/lineage/policy)', () => {
  it('T031-LN-3: từ chứng từ: chính sách@bản, băm, hiệu lực, phát hành, dòng chứng từ, dòng sổ', async () => {
    const r = await trace(`docKey=${encodeURIComponent(K.ok)}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const d = r.body.data;
    expect(d.from).toBe('docKey');
    expect(d.event).toMatchObject({ docKey: K.ok, docType: 'sale', docDate: '2026-10-10', sourceSystem: 'wp-pos', branch: 'CN01' });
    expect(d.check).toMatchObject({ verdict: 'pass', codes: [] });
    expect(d.check.checkedAt).toBeTruthy();
    expect(d.refs).toHaveLength(1);
    expect(d.refs[0]).toMatchObject({
      key: 'LN-QUA', version: 1, policyId, registered: true, sentHash: hash, registryHash: hash, hashMatches: true, covers: true,
      ruleContract: 'sale.promo.buy_x_get_y@1', ownerModule: 'ban-hang', legalRef: 'NĐ81/2018 Điều 8', reason: 'Chương trình thử', verdict: 'pass', lines: ['l2'],
    });
    expect(d.refs[0]!.publishedBy).toBeTruthy();
    expect(d.lines.map((l) => [l.lineKey, l.sku, l.isGift, l.policy?.key ?? null])).toEqual([['l1', 'SUA01', false, null], ['l2', 'QUA01', true, 'LN-QUA']]);
    expect(d.entries.length).toBeGreaterThan(0);
    for (const e of d.entries) expect(e.postingPolicyVersion === null || Number.isInteger(e.postingPolicyVersion)).toBe(true);
    // dòng sổ mang mã quà nối được về chính sách qua dòng chứng từ (mã hàng + cờ quà)
    expect(d.entries.some((x) => x.sku === 'QUA01')).toBe(true);
    for (const e of d.entries.filter((x) => x.sku === 'QUA01')) expect(e.policy).toEqual({ key: 'LN-QUA', version: 1 });
    for (const e of d.entries.filter((x) => x.sku === 'SUA01')) expect(e.policy).toBeNull();
  });

  it('T031-LN-4: từ bút toán ra cùng chuỗi; cảnh báo L4b; lineKey thu về một dòng', async () => {
    const entryNo = (await sql<{ entry_no: string }>`
      SELECT le.entry_no FROM ledger_entries le JOIN accounting_events e ON e.id = le.event_id
       WHERE e.tenant_id = ${tenantId} AND e.doc_key = ${K.warn} ORDER BY le.id LIMIT 1`.execute(db)).rows[0]!.entry_no;
    const d = (await trace(`entryNo=${encodeURIComponent(entryNo)}`)).body.data;
    expect(d.from).toBe('entry');
    expect(d.event.docKey).toBe(K.warn);
    expect(d.check.verdict).toBe('warn');
    expect(d.check.codes).toContain('IN-POL-004');
    expect(d.refs[0]).toMatchObject({ key: 'LN-QUA', verdict: 'warn' });
    expect(d.entries.every((e) => e.entryNo === entryNo)).toBe(true);
    const one = (await trace(`docKey=${encodeURIComponent(K.warn)}&lineKey=l2`)).body.data;
    expect(one.lines.map((l) => l.lineKey)).toEqual(['l2']);
    expect(one.entries.every((e) => e.sku === 'QUA01')).toBe(true);
    const evId = one.event.eventId;
    expect((await trace(`eventId=${evId}`)).body.data).toMatchObject({ from: 'event', event: { docKey: K.warn } });
  });

  it('T031-LN-5: không gửi tham chiếu → nói rõ; mồ côi → registered false; thiếu tham số 400; không có 404; đơn vị khác không thấy', async () => {
    const none = (await trace(`docKey=${encodeURIComponent(K.none)}`)).body.data;
    expect(none.refs).toEqual([]);
    expect(none.check.verdict).toBe('none');
    expect(none.notes.join(' ')).toMatch(/không gửi tham chiếu chính sách/);
    const orphan = (await trace(`docKey=${encodeURIComponent(K.orphan)}`)).body.data;
    expect(orphan.refs[0]).toMatchObject({ key: 'LN-MA', registered: false, policyId: null, hashMatches: false, covers: null, verdict: 'warn' });
    expect((await trace('')).status).toBe(400);
    expect((await trace('docKey=khong-co')).status).toBe(404);
    expect((await trace('entryNo=BT-KHONG-CO')).status).toBe(404);
    expect((await trace(`docKey=${encodeURIComponent(K.ok)}`, other)).status).toBe(404);
  });
});
