// [2026-11-08 12:35 AM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W2a (S031-9, S031-12, S031-20..22): cửa nạp nhận tham chiếu chính sách — T031-INT-1, 3, 5, 6, 7, 8, 9
/**
 * Tham chiếu chính sách ở cửa nạp (bizcity_ledger_intake@1 §3.1, ADR-0031 D-POL-5/6):
 *   - đúng bản + đúng băm → không IN-POL-*, policy_check lưu, khung nhìn policy_application thấy (T031-INT-1);
 *   - bản cũ khi đã có bản mới phủ ngày chứng từ → IN-POL-003 (T031-INT-3); bản không phủ ngày → IN-POL-002;
 *   - băm sai / chính sách không có / dòng trỏ key không khai → IN-POL-001 (T031-INT-5);
 *   - không gửi policyRefs → như hôm nay, policy_check NULL (T031-INT-7);
 *   - advice (mặc định): vẫn ghi sổ; strict: có IN-POL-* thì chờ duyệt, không bút toán (T031-INT-8);
 *   - tiền kiểm và cửa nạp ra cùng mã (R-INTAKE-4); phiếu mua hàng duyệt nộp kèm policyRefs đúng bản + băm của vết (T031-INT-9).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { withRequestContext } from '@bizcity/platform/core/request-context';
import { registerPolicyVersion } from '@bizcity/platform/core/policies';
import type { AuthContext } from '../src/core/auth.js';
import { preflight } from '../src/kernel/public.js';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let auth: AuthContext;
const POL = 'ban-hang:khuyen_mai:SALE-PROMO-001';
let h1 = '', h2 = '', h3 = '';

const pre = (raw: unknown) => withRequestContext({ requestId: `pc-${Math.random().toString(36).slice(2, 9)}`, correlationId: 'pc', tenantId },
  () => db.transaction().execute((trx) => preflight(trx, auth, raw)));
const door = (raw: unknown) => ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: raw as never, headers: { authorization: `Bearer ${ctx.token}` } });
const codes = (r: { findings: { code: string }[] }) => r.findings.map((f) => f.code).filter((c) => c.startsWith('IN-POL-'));
const eventOf = (docKey: string) => sql<{ status: string; policy_check: { mode: string; refs: { ok: boolean; codes: string[] }[] } | null }>`
  SELECT status, policy_check FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${docKey}`.execute(db).then((r) => r.rows[0]);

let k = 0;
const sale = (refs: unknown, over: Record<string, unknown> = {}) => { k += 1; return saleDoc({ docKey: `pc:CN01:${k}`, docNo: `PC${k}`, docDate: '2026-11-15', ...(refs === undefined ? {} : { policyRefs: refs }), ...over }); };
const ref = (version: number, hash: string, key = 'SALE-PROMO-001') => ({ key, version, hash });
const setMode = (value: 'advice' | 'strict') => call(ctx, 'PUT', '/api/v1/settings/values/bizcity.intake.policy_check', { value, reason: 'Thử chế độ kiểm chính sách' });

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
  auth = { tenantId, actor: 'user:test', actorName: 'test', permissions: new Set(['*']) } as unknown as AuthContext;
  // SALE-PROMO-001: bản 1 từ đầu → 09/11; bản 2 từ 10/11 → 15/11; bản 3 từ 16/11
  const reg = (version: number, from: string | null, content: unknown) => db.transaction().execute((trx) => registerPolicyVersion(trx, {
    tenantId, ownerModule: 'ban-hang', policyKey: 'SALE-PROMO-001', policyId: POL, version, ruleContract: 'sale.promo.buy_x_get_y@1',
    effectiveFrom: from, store: 'module', storeRef: `khuyen_mai:${version}`, content, actor: 'user:test', reason: `bản ${version}`,
  }));
  h1 = (await reg(1, null, { buy: 2, get: 1 })).contentHash;
  h2 = (await reg(2, '2026-11-10', { buy: 2, get: 1, repeat: true })).contentHash;
  h3 = (await reg(3, '2026-11-16', { buy: 3, get: 1 })).contentHash;
});

describe('Tham chiếu chính sách ở tiền kiểm và cửa nạp (W2a)', () => {
  it('T031-INT-1: đúng bản (2 phủ 15/11) + đúng băm → không IN-POL-*, policy_check lưu, khung nhìn thấy', async () => {
    const doc = sale([ref(2, h2)]);
    expect(codes(await pre(doc))).toEqual([]);
    const r = await door(doc);
    expect(r.statusCode, r.body).toBeLessThan(300);
    const e = await eventOf(doc.docKey as string);
    expect(e?.status).toBe('posted');
    expect(e?.policy_check?.refs).toMatchObject([{ ok: true, codes: [] }]);
    const v = await sql<{ policy_key: string; version: number; ok: boolean }>`SELECT policy_key, version, ok FROM bizcity_read.policy_application WHERE tenant_id = ${tenantId} AND doc_key = ${doc.docKey}`.execute(db);
    expect(v.rows).toEqual([{ policy_key: 'SALE-PROMO-001', version: 2, ok: true }]);
  });

  it('T031-INT-3: bản 2 (đã đóng 15/11) gửi cho ngày 16/11 khi bản 3 đã phủ → IN-POL-003, vẫn ghi sổ (advice)', async () => {
    const doc = sale([ref(2, h2)], { docDate: '2026-11-16' });
    expect(codes(await pre(doc))).toEqual(['IN-POL-003']);
    const r = await door(doc);
    expect(r.statusCode, r.body).toBeLessThan(300);
    expect((await eventOf(doc.docKey as string))?.status).toBe('posted');
  });

  it('IN-POL-002 và 003 loại trừ nhau: bản 3 gửi cho 15/11 (chưa áp, không bản nào mới hơn phủ) → 002; bản 1 gửi cho 15/11 (bản 2 phủ) → 003', async () => {
    expect(codes(await pre(sale([ref(3, h3)])))).toEqual(['IN-POL-002']);
    expect(codes(await pre(sale([ref(1, h1)])))).toEqual(['IN-POL-003']);
  });

  it('T031-INT-5: băm sai, không có trong sổ, dòng trỏ key không khai → IN-POL-001', async () => {
    expect(codes(await pre(sale([ref(2, '0'.repeat(64))])))).toEqual(['IN-POL-001']);
    expect(codes(await pre(sale([ref(9, h2)])))).toEqual(['IN-POL-001']);
    expect(codes(await pre(sale([ref(2, h2, 'KHONG-CO')])))).toEqual(['IN-POL-001']);
    const lineRef = saleDoc({ docKey: 'pc:lineref', docNo: 'PCL', docDate: '2026-11-15', policyRefs: [ref(2, h2)] }) as { lines: Record<string, unknown>[] } & Record<string, unknown>;
    lineRef.lines = lineRef.lines.map((l) => ({ ...l, policyRef: { key: 'KHAC', version: 1 } }));
    // mỗi dòng hàng trỏ key không khai báo một lần, đúng đường dẫn của dòng đó; policyRefs đúng nên không báo thêm
    const lr = await pre(lineRef);
    expect(codes(lr)).toEqual(Array(lineRef.lines.length).fill('IN-POL-001'));
    expect(lr.findings.filter((f) => f.code === 'IN-POL-001').every((f) => /^lines\[\d+\]\.policyRef\.key$/.test(String(f.path)))).toBe(true);
  });

  it('R-INTAKE-4: cửa nạp nhận cùng dữ liệu, lưu cùng mã với tiền kiểm', async () => {
    const doc = sale([ref(2, '0'.repeat(64))]);
    expect(codes(await pre(doc))).toEqual(['IN-POL-001']);
    const r = await door(doc);
    expect(r.statusCode, r.body).toBeLessThan(300);
    expect((await eventOf(doc.docKey as string))?.policy_check?.refs).toMatchObject([{ ok: false, codes: ['IN-POL-001'] }]);
  });

  it('T031-INT-7: không gửi policyRefs → như hôm nay, policy_check NULL, không IN-POL-*', async () => {
    const doc = sale(undefined);
    expect(codes(await pre(doc))).toEqual([]);
    const r = await door(doc);
    expect(r.statusCode, r.body).toBeLessThan(300);
    expect((await eventOf(doc.docKey as string))?.policy_check).toBeNull();
  });

  it('policyRefs sai khuôn (băm không phải 64 hex) → L1 từ chối', async () => {
    const r = await door(sale([{ key: 'SALE-PROMO-001', version: 2, hash: 'abc' }]));
    expect(r.statusCode).toBe(400);
  });
});

describe('Chế độ kiểm chính sách: advice | strict (T031-INT-8)', () => {
  it('strict + IN-POL-* → sự việc chờ duyệt, không bút toán; advice → ghi sổ', async () => {
    expect((await setMode('strict')).status).toBeLessThan(300);
    const bad = sale([ref(2, '0'.repeat(64))]);
    const r = await door(bad);
    expect(r.statusCode, r.body).toBeLessThan(300);
    expect((await eventOf(bad.docKey as string))?.status).toBe('pending');
    const ent = await sql<{ n: string }>`SELECT count(*) AS n FROM ledger_entries WHERE tenant_id = ${tenantId} AND event_id = (SELECT id FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${bad.docKey})`.execute(db);
    expect(Number(ent.rows[0]!.n)).toBe(0);

    const good = sale([ref(2, h2)]);
    expect((await door(good)).statusCode).toBeLessThan(300);
    expect((await eventOf(good.docKey as string))?.status).toBe('posted');

    expect((await setMode('advice')).status).toBeLessThan(300);
    const bad2 = sale([ref(2, '0'.repeat(64))]);
    expect((await door(bad2)).statusCode).toBeLessThan(300);
    expect((await eventOf(bad2.docKey as string))?.status).toBe('posted');
  });

  it('mặc định là advice khi chưa đặt khoá', async () => {
    const t2 = await setupTenant();
    const id2 = String((await db.selectFrom('tenants').select('id').where('code', '=', t2.tenantCode).executeTakeFirstOrThrow()).id);
    const doc = saleDoc({ docKey: 'pc:default', docNo: 'PCD', docDate: '2026-11-15', policyRefs: [ref(1, '1'.repeat(64))] });
    const r = await t2.app.inject({ method: 'POST', url: '/api/v1/documents', payload: doc as never, headers: { authorization: `Bearer ${t2.token}` } });
    expect(r.statusCode, r.body).toBeLessThan(300);
    const st = await sql<{ status: string }>`SELECT status FROM accounting_events WHERE tenant_id = ${id2} AND doc_key = 'pc:default'`.execute(db);
    expect(st.rows[0]?.status).toBe('posted');
  });
});

describe('Commit Guard và phiếu mua hàng (T031-INT-6, T031-INT-9)', () => {
  const guardOf = async (doc: unknown) => (await pre(doc)).guard;

  it('T031-INT-6: chính sách đổi giữa Kiểm thử và Nộp → dấu lệch (IN-GUARD-001 khi còn lỗi chặn); không policyRefs → dấu không đổi', async () => {
    const doc = sale([ref(2, h2)]);
    const g1 = await guardOf(doc);
    expect(await guardOf(doc)).toBe(g1);
    // đóng bản 3 bằng cách đăng ký bản 4 từ 20/11: phong bì bản 3 đổi effective_to → dấu phải đổi
    await db.transaction().execute((trx) => registerPolicyVersion(trx, {
      tenantId, ownerModule: 'ban-hang', policyKey: 'SALE-PROMO-001', policyId: POL, version: 4, ruleContract: 'sale.promo.buy_x_get_y@1',
      effectiveFrom: '2026-11-20', store: 'module', storeRef: 'khuyen_mai:4', content: { buy: 4, get: 1 }, actor: 'user:test', reason: 'bản 4',
    }));
    const ref3 = sale([ref(3, h3)], { docDate: '2026-11-17' });
    expect(await guardOf(ref3)).not.toBe(await guardOf(sale([ref(3, h3)], { docDate: '2026-11-17', policyRefs: undefined })));
    // chứng từ không có policyRefs: dấu không phụ thuộc sổ đăng ký
    const plain = sale(undefined);
    expect(await guardOf(plain)).toBe(await guardOf(plain));
  });

  it('T031-INT-9: phiếu mua hàng duyệt nộp kèm policyRefs đúng bản + băm của vết chính sách', async () => {
    const seed = await call(ctx, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' });
    expect(seed.status, JSON.stringify(seed.body)).toBeLessThan(300);
    const p = await call(ctx, 'PUT', '/api/v1/catalog/products/PC1?new=1', { name: 'Hàng thử tham chiếu', unit: 'Hộp', taxInCode: 'V08', units: [{ unit: 'Hộp', ratio: 1, isDefault: true }] });
    expect(p.status, JSON.stringify(p.body)).toBe(200);
    await call(ctx, 'PUT', '/api/v1/partners/NCC-PC', { name: 'NCC thử tham chiếu', kind: 'supplier' });
    const pol = await call(ctx, 'POST', '/api/v1/purchase/policies', { code: 'PC-CK', kind: 'trade_discount', name: 'CK thử tham chiếu', scope: { partnerCode: 'NCC-PC', sku: 'PC1' }, priority: 0, isActive: true, rule: { pct: 3 } });
    expect(pol.status, JSON.stringify(pol.body)).toBe(201);
    const polId = pol.body.data.id as string;
    const doc = await call(ctx, 'POST', '/api/v1/purchase/documents', {
      kind: 'receipt', outsideOrder: { reason: 'Phép thử' }, branchCode: 'CN-NA', partnerCode: 'NCC-PC', priceIncludesVat: false, docDate: '2026-11-15', orderDiscount: undefined,
      lines: [{ lineKey: 'a', sku: 'PC1', name: 'Hàng thử', unit: 'Hộp', qty: 10, price: 100_000, taxCode: 'V08', lineType: 'buy' }],
    });
    expect(doc.status, JSON.stringify(doc.body)).toBe(201);
    const ap = await call(ctx, 'POST', `/api/v1/purchase/documents/${doc.body.data.id}/approve`);
    expect(ap.status, JSON.stringify(ap.body)).toBe(200);
    const v = await call(ctx, 'GET', `/api/v1/purchase/policies/${polId}/versions`);
    const ver = (v.body.data as { version: number; hash: string }[])[0]!;
    const ev = await sql<{ payload: { policyRefs?: { key: string; version: number; hash: string }[] }; policy_check: { refs: { ok: boolean }[] } | null }>`
      SELECT payload, policy_check FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${'mh:' + doc.body.data.id}`.execute(db);
    expect(ev.rows[0]?.payload.policyRefs).toEqual([{ key: 'PC-CK', version: ver.version, hash: ver.hash }]);
    expect(ev.rows[0]?.policy_check?.refs).toMatchObject([{ ok: true }]);
  });
});
