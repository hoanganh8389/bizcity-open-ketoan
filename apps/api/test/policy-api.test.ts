// [2026-11-08 02:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W3a (S031-13, S031-27): API chính sách cho nguồn ngoài — T031-REG-3, T031-RC-3, T031-API-1, T031-API-2, T031-E2E-1, T031-MIG-1
/**
 * Đường đi trọn vòng của POS (chữ chốt PHASE-031 · 00 §9):
 *   - phát hành inline → bản kế đóng bản trước ở ngày − 1; GET /policies?at= trả đúng một bản mỗi ngày, chiến dịch hết hạn không hiện (T031-REG-3);
 *   - mọi `vectors` của Rule Contract ra cùng kết quả qua hàm thuần và qua endpoint evaluate (T031-RC-3);
 *   - quyền: khoá documents:write / reports:read / catalog:write đọc và tính được, khoá không được ánh xạ → 403, không khoá → 401, phát hành cần settings:write (T031-API-1);
 *   - etag đổi khi và chỉ khi có gì mới (T031-API-2);
 *   - tính → nạp sale kèm policyRefs đúng như API trả → ghi sổ, policy_check đạt; sai băm → IN-POL-001; ngày chưa áp → IN-POL-002 (T031-E2E-1);
 *   - áp lại migration 0082 trên cơ sở dữ liệu đã có đủ đối tượng không lỗi (T031-MIG-1).
 * Ngày cố định, luôn truyền `reason` — kết quả không đổi theo ngày chạy.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { retirePolicy } from '@bizcity/platform/core/policies';
import { db } from '../src/db/client.js';
import { buyXGetYVectors } from '../src/modules/system/rule-contracts/sale-promo-buy-x-get-y.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const REASON = 'Chiến dịch thử nghiệm';
const promo = (over: Record<string, unknown> = {}) => ({ buy: { sku: 'A', qty: 2 }, get: { sku: 'B', qty: 1 }, repeat: true, ...over });
const pub = (key: string, params: unknown, effectiveFrom: string, extra: Record<string, unknown> = {}) =>
  call(ctx, 'POST', '/api/v1/policies', { key, ruleContract: 'sale.promo.buy_x_get_y@1', params, effectiveFrom, reason: REASON, ...extra });
const list = (q: string) => call(ctx, 'GET', `/api/v1/policies?${q}`);
const keyed = (key: string, method: 'GET' | 'POST', url: string, payload?: unknown) =>
  ctx.app.inject({ method, url, headers: { 'x-api-key': key }, ...(payload ? { payload: payload as never } : {}) });
const items = (r: { body: any }) => r.body.data.items as { policyKey: string; version: number; contentHash: string; effectiveFrom: string | null; effectiveTo: string | null; params: any }[];
const eventOf = (docKey: string) => sql<{ status: string; policy_check: { refs: { ok: boolean; codes: string[] }[] } | null }>`
  SELECT status, policy_check FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${docKey}`.execute(db).then((r) => r.rows[0]);

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
});

describe('Phát hành và đọc theo ngày (T031-REG-3)', () => {
  it('bản 2 đóng bản 1 ở ngày − 1; mỗi ngày đúng một bản; chiến dịch hết hạn hoặc chưa tới không hiện', async () => {
    const v1 = await pub('REG-1', promo({ validFrom: '2026-11-10', validTo: '2026-11-30' }), '2026-11-10');
    expect(v1.status, JSON.stringify(v1.body)).toBe(201);
    expect(v1.body.data).toMatchObject({ policyKey: 'REG-1', version: 1, policyId: 'ban-hang:inline:REG-1', effectiveFrom: '2026-11-10' });
    const v2 = await pub('REG-1', promo({ buy: { sku: 'A', qty: 3 }, validFrom: '2026-11-10', validTo: '2026-11-30' }), '2026-11-20');
    expect(v2.status, JSON.stringify(v2.body)).toBe(201);
    expect(v2.body.data.version).toBe(2);

    const at = async (d: string) => items(await list(`at=${d}&domain=sale`)).filter((i) => i.policyKey === 'REG-1');
    expect((await at('2026-11-09')).length, 'trước ngày áp').toBe(0);
    expect((await at('2026-11-15')).map((i) => [i.version, i.params.buy.qty])).toEqual([[1, 2]]);
    expect((await at('2026-11-19')).map((i) => i.version)).toEqual([1]);
    expect((await at('2026-11-20')).map((i) => [i.version, i.params.buy.qty])).toEqual([[2, 3]]);
    expect((await at('2026-11-30')).map((i) => i.version)).toEqual([2]);
    expect((await at('2026-12-01')).length, 'chiến dịch đã hết').toBe(0);

    const env = await sql<{ version: number; effective_to: string | null }>`SELECT version, effective_to::text AS effective_to FROM policy_registry WHERE tenant_id = ${tenantId} AND policy_id = 'ban-hang:inline:REG-1' ORDER BY version`.execute(db);
    expect(env.rows).toEqual([{ version: 1, effective_to: '2026-11-19' }, { version: 2, effective_to: null }]);
  });

  it('ngày áp sớm hơn bản trước → 400; chính sách đã ngừng → 409 và không hiện', async () => {
    const early = await pub('REG-1', promo(), '2026-11-12');
    expect(early.status, JSON.stringify(early.body)).toBe(400);
    await db.transaction().execute((trx) => retirePolicy(trx, tenantId, 'ban-hang:inline:REG-1'));
    expect(items(await list('at=2026-11-25&domain=sale')).filter((i) => i.policyKey === 'REG-1')).toEqual([]);
    const again = await pub('REG-1', promo(), '2026-11-25');
    expect(again.status, JSON.stringify(again.body)).toBe(409);
  });

  it('kiểm phát hành: mã sai khuôn, Rule Contract lạ, nội dung sai, kiểm chéo trường, lùi ngày không lý do → 400', async () => {
    expect((await pub('mã sai', promo(), '2026-11-10')).status).toBe(400);
    expect((await call(ctx, 'POST', '/api/v1/policies', { key: 'BAD-1', ruleContract: 'sale.khong_co@1', params: {}, effectiveFrom: '2026-11-10', reason: REASON })).status).toBe(400);
    const zodBad = await pub('BAD-2', promo({ buy: { sku: 'A', qty: 0 } }), '2026-11-10');
    expect(zodBad.status).toBe(400);
    expect(JSON.stringify(zodBad.body)).toContain('buy.qty');
    const cross = await pub('BAD-3', promo({ get: { sku: 'B', qty: 3 }, maxGiftQty: 2 }), '2026-11-10');
    expect(cross.status).toBe(400);
    expect(JSON.stringify(cross.body)).toContain('maxGiftQty');
    const noReason = await call(ctx, 'POST', '/api/v1/policies', { key: 'BAD-4', ruleContract: 'sale.promo.buy_x_get_y@1', params: promo(), effectiveFrom: '2020-01-01' });
    expect(noReason.status, JSON.stringify(noReason.body)).toBe(400);
    expect(JSON.stringify(noReason.body)).toContain('lý do');
    expect((await list('at=2026-11-15&domain=sale')).body.data.items.filter((i: { policyKey: string }) => i.policyKey.startsWith('BAD-')).length, 'không bản nào được ghi').toBe(0);
  });
});

describe('Quyền (T031-API-1)', () => {
  const mkKey = async (scopes: string[]) => {
    const r = await call(ctx, 'POST', '/api/v1/api-keys', { name: `Thử ${scopes.join('+')}`, scopes });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return r.body.data.key as string;
  };

  it('khoá phạm vi documents:write, reports:read, catalog:write đọc và tính được', async () => {
    for (const scope of ['documents:write', 'reports:read', 'catalog:write']) {
      const k = await mkKey([scope]);
      expect((await keyed(k, 'GET', '/api/v1/policies?at=2026-11-15')).statusCode, `đọc với ${scope}`).toBe(200);
      expect((await keyed(k, 'GET', '/api/v1/rule-contracts')).statusCode, `khuôn luật với ${scope}`).toBe(200);
      const ev = await keyed(k, 'POST', '/api/v1/policies/evaluate', { docDate: '2026-11-15', lines: [{ lineKey: '1', sku: 'A', qty: 2 }] });
      expect(ev.statusCode, `tính với ${scope}: ${ev.body}`).toBe(200);
    }
  });

  it('khoá chỉ có phạm vi không được ánh xạ (ledger:read) → 403; không khoá → 401', async () => {
    // API tạo khoá chỉ nhận documents:write / reports:read / catalog:write; dựng khoá "phạm vi không ánh xạ" bằng cách đổi phạm vi trong CSDL
    // (quyền tính lại từ api_keys.scopes mỗi lần gọi — core/auth.ts SCOPE_PERMISSIONS[s] ?? []).
    const k = await mkKey(['reports:read']);
    expect((await keyed(k, 'GET', '/api/v1/policies')).statusCode, 'trước khi đổi phạm vi').toBe(200);
    const upd = await sql`UPDATE api_keys SET scopes = ARRAY['ledger:read']::text[] WHERE tenant_id = ${tenantId} AND name = 'Thử reports:read' RETURNING id`.execute(db);
    expect(upd.rows.length).toBeGreaterThanOrEqual(1);
    expect((await keyed(k, 'GET', '/api/v1/policies')).statusCode).toBe(403);
    expect((await keyed(k, 'POST', '/api/v1/policies/evaluate', { docDate: '2026-11-15', lines: [{ lineKey: '1', sku: 'A', qty: 1 }] })).statusCode).toBe(403);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/policies' })).statusCode).toBe(401);
  });

  it('phát hành cần settings:write: khoá API → 403; chủ đơn vị → 201', async () => {
    const k = await mkKey(['documents:write']);
    const denied = await ctx.app.inject({ method: 'POST', url: '/api/v1/policies', headers: { 'x-api-key': k, 'idempotency-key': 'k-denied-1' }, payload: { key: 'PERM-1', ruleContract: 'sale.promo.buy_x_get_y@1', params: promo(), effectiveFrom: '2026-11-10', reason: REASON } as never });
    expect(denied.statusCode, denied.body).toBe(403);
    expect((await pub('PERM-1', promo(), '2026-11-10')).status).toBe(201);
    expect((await sql`SELECT 1 FROM policy_registry WHERE tenant_id = ${tenantId} AND policy_key = 'PERM-1'`.execute(db)).rows.length).toBe(1);
  });
});

describe('Khuôn luật cho plugin (T031-RC-3)', () => {
  it('GET /rule-contracts/:id trả tham số, spec và vectors; mã lạ → 404', async () => {
    const r = await call(ctx, 'GET', '/api/v1/rule-contracts/sale.promo.buy_x_get_y@1');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ id: 'sale.promo.buy_x_get_y@1', domain: 'sale' });
    expect(r.body.data.spec.steps.length).toBeGreaterThanOrEqual(4);
    expect(r.body.data.vectors.length).toBe(buyXGetYVectors.length);
    expect(r.body.data.params.map((p: { name: string }) => p.name)).toContain('buy.qty');
    expect((await call(ctx, 'GET', '/api/v1/rule-contracts/sale.khong_co@1')).status).toBe(404);
  });

  it('mỗi vector chạy qua endpoint evaluate ra đúng đầu ra chuẩn (cùng bộ ca với hàm thuần)', async () => {
    for (const [n, v] of buyXGetYVectors.entries()) {
      const key = `VEC-${n + 1}`;
      expect((await pub(key, v.params, '2026-01-01')).status, v.name).toBe(201);
      const ev = await call(ctx, 'POST', '/api/v1/policies/evaluate', { docDate: '2026-06-15', lines: v.input.lines, policies: [{ key }] });
      expect(ev.status, `${v.name}: ${JSON.stringify(ev.body)}`).toBe(200);
      const d = ev.body.data;
      if (v.output.gifts.length) {
        expect(d.applied.length, v.name).toBe(1);
        expect(d.applied[0].result, v.name).toEqual(v.output);
        expect(d.gifts, v.name).toEqual(v.output.gifts.map((g) => ({ ...g, isGift: true, policyRef: { key, version: 1, line: 'gift' } })));
        expect(d.policyRefs, v.name).toEqual([{ key, version: 1, hash: expect.stringMatching(/^[0-9a-f]{64}$/), policyId: `ban-hang:inline:${key}` }]);
        expect(d.applied[0].treatment, v.name).toEqual([{ on: 'gift', reasonCode: 'XTA1.4', confirmed: false }]);
      } else {
        expect(d.applied, v.name).toEqual([]);
        expect(d.gifts, v.name).toEqual([]);
        expect(d.policyRefs, v.name).toEqual([]);
        expect(d.skipped.map((s: { key: string }) => s.key), v.name).toEqual([key]);
      }
    }
  });

  it('chính sách không áp được nằm ở skipped kèm lý do: sai bản, ngoài chi nhánh, thiếu kênh, mã không có', async () => {
    expect((await pub('SCOPE-1', promo(), '2026-01-01', { scope: { branchCodes: ['HN01'], channels: ['pos'] } })).status).toBe(201);
    const ev = (extra: Record<string, unknown>) => call(ctx, 'POST', '/api/v1/policies/evaluate', { docDate: '2026-06-15', lines: [{ lineKey: '1', sku: 'A', qty: 2 }], ...extra });
    const reason = async (extra: Record<string, unknown>) => ((await ev({ policies: [{ key: 'SCOPE-1' }], ...extra })).body.data.skipped as { key: string; reason: string }[]).map((s) => s.reason).join('|');
    expect(await reason({})).toContain('cần branchCode');
    expect(await reason({ branchCode: 'HCM01', channel: 'pos' })).toContain('ngoài phạm vi chi nhánh');
    expect(await reason({ branchCode: 'HN01' })).toContain('cần channel');
    expect(await reason({ branchCode: 'HN01', channel: 'web' })).toContain('ngoài phạm vi kênh');
    const ok = await ev({ policies: [{ key: 'SCOPE-1' }], branchCode: 'HN01', channel: 'pos' });
    expect(ok.body.data.applied.length).toBe(1);
    const wrongVer = await ev({ policies: [{ key: 'SCOPE-1', version: 7 }], branchCode: 'HN01', channel: 'pos' });
    expect(wrongVer.body.data.skipped[0].reason).toContain('bản 7 không phủ');
    const none = await ev({ policies: [{ key: 'KHONG-CO' }] });
    expect(none.body.data.skipped[0].reason).toContain('không có chính sách');
    // lọc theo chi nhánh / kênh ở GET
    expect(items(await list('at=2026-06-15&domain=sale&branch=HCM01')).some((i) => i.policyKey === 'SCOPE-1')).toBe(false);
    expect(items(await list('at=2026-06-15&domain=sale&branch=HN01&channel=pos')).some((i) => i.policyKey === 'SCOPE-1')).toBe(true);
  });
});

describe('Làm mới bằng etag (T031-API-2)', () => {
  it('etag không đổi khi không có gì mới; đổi khi phát hành bản mới', async () => {
    const a = (await list('at=2026-06-15&domain=sale')).body.data.etag as string;
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect((await list('at=2026-06-15&domain=sale')).body.data.etag).toBe(a);
    expect((await pub('ETAG-1', promo(), '2026-01-01')).status).toBe(201);
    const b = (await list('at=2026-06-15&domain=sale')).body.data.etag as string;
    expect(b).not.toBe(a);
    expect((await pub('ETAG-1', promo({ buy: { sku: 'A', qty: 5 } }), '2026-03-01')).status).toBe(201);
    expect((await list('at=2026-06-15&domain=sale')).body.data.etag).not.toBe(b);
  });
});

describe('Tính → nạp → kiểm lại (T031-E2E-1)', () => {
  const lineReq = (d: ReturnType<typeof saleDoc>) => d.lines.map((l: { lineKey: string; sku: string; qty: number }) => ({ lineKey: l.lineKey, sku: l.sku, qty: l.qty }));
  const door = (doc: unknown) => ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: doc as never, headers: { authorization: `Bearer ${ctx.token}` } });
  let refs: { key: string; version: number; hash: string }[] = [];

  it('POS tính theo chính sách → nhận quà và policyRefs đúng mảng nguồn gắn vào chứng từ', async () => {
    // mua 1 SUA01 tặng 1 QUA01 (khớp saleDoc: dòng l1 mua, dòng l2 là quà giá 0)
    expect((await pub('E2E-PROMO', { buy: { sku: 'SUA01', qty: 1 }, get: { sku: 'QUA01', qty: 1 }, repeat: true }, '2026-10-01')).status).toBe(201);
    const base = saleDoc();
    const buy = [base.lines[0]!];
    const ev = await call(ctx, 'POST', '/api/v1/policies/evaluate', { docDate: '2026-10-05', branchCode: 'CN01', lines: lineReq({ ...base, lines: buy } as never) });
    expect(ev.status, JSON.stringify(ev.body)).toBe(200);
    expect(ev.body.data.gifts).toEqual([{ sku: 'QUA01', qty: 1, isGift: true, policyRef: { key: 'E2E-PROMO', version: 1, line: 'gift' } }]);
    refs = ev.body.data.policyRefs.map((r: { key: string; version: number; hash: string }) => ({ key: r.key, version: r.version, hash: r.hash }));
    expect(refs).toHaveLength(1);
  });

  const withRefs = (n: number, extra: Record<string, unknown> = {}) => {
    const d = saleDoc({ docKey: `e2e:CN01:${n}`, docNo: `E2E${n}`, policyRefs: refs, ...extra }) as ReturnType<typeof saleDoc> & { lines: Record<string, unknown>[] };
    d.lines[1] = { ...d.lines[1], policyRef: { key: 'E2E-PROMO', version: 1, line: 'gift' } };
    return d;
  };

  it('nạp đúng như API trả → ghi sổ, policy_check đạt, không IN-POL-*', async () => {
    const d = withRefs(1);
    const r = await door(d);
    expect(r.statusCode, r.body).toBeLessThan(300);
    const e = await eventOf('e2e:CN01:1');
    expect(e?.status).toBe('posted');
    expect(e?.policy_check?.refs).toMatchObject([{ ok: true, codes: [] }]);
  });

  it('đổi băm → vẫn ghi sổ (advice) nhưng policy_check có IN-POL-001; ngày chưa áp → IN-POL-002', async () => {
    const badHash = withRefs(2, { policyRefs: [{ ...refs[0]!, hash: '0'.repeat(64) }] });
    expect((await door(badHash)).statusCode).toBeLessThan(300);
    expect((await eventOf('e2e:CN01:2'))?.policy_check?.refs).toMatchObject([{ ok: false, codes: ['IN-POL-001'] }]);
    const early = withRefs(3, { docDate: '2026-09-20', invoice: { no: '0000124', serial: 'C26TAA', form: '1', date: '2026-09-20' } });
    expect((await door(early)).statusCode).toBeLessThan(300);
    expect((await eventOf('e2e:CN01:3'))?.policy_check?.refs).toMatchObject([{ ok: false, codes: ['IN-POL-002'] }]);
  });
});

describe('Migration 0082 idempotent (T031-MIG-1)', () => {
  it('áp lại nguyên tệp trên cơ sở dữ liệu đã có cột, khung nhìn và trigger của tên cũ không lỗi; kết quả giữ nguyên', async () => {
    const file = path.resolve(__dirname, '../../../db/migrations/0082_kiem_chinh_sach_su_viec.sql');
    const script = readFileSync(file, 'utf8');
    const before = await sql<{ n: string }>`SELECT count(*) AS n FROM accounting_events WHERE tenant_id = ${tenantId} AND policy_check IS NOT NULL`.execute(db);
    await sql.raw(script).execute(db);
    await sql.raw(script).execute(db);
    const after = await sql<{ n: string }>`SELECT count(*) AS n FROM accounting_events WHERE tenant_id = ${tenantId} AND policy_check IS NOT NULL`.execute(db);
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
    const trg = await sql<{ n: string }>`SELECT count(*) AS n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace s ON s.oid = c.relnamespace WHERE s.nspname = 'bizcity_read' AND c.relname = 'policy_application' AND t.tgname = 'bizcity_read_only'`.execute(db);
    expect(trg.rows[0]!.n).toBe('1');
    const v = await sql<{ n: string }>`SELECT count(*) AS n FROM bizcity_read.policy_application WHERE tenant_id = ${tenantId}`.execute(db);
    expect(Number(v.rows[0]!.n)).toBeGreaterThanOrEqual(0);
  });
});
