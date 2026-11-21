// [2026-11-21 09:30 AM Võ Hoàng] PHASE-031 — S031-17: rulepack `policy` (tests/conformance/diagnostics/policy.diag.mjs) chạy trên CSDL test, chỉ đọc
/**
 *   T031-DG-1  POLICY_L4B_WARN: đếm tham chiếu có cảnh báo L4b theo kỳ × nguồn × chi nhánh × chính sách, kèm tỷ lệ và mã
 *   T031-DG-2  POLICY_REASON_MISSING: chính sách có quà mà lý do XTA1.4 tắt → báo; bật lại → hết
 *   T031-DG-3  POLICY_REFS_MISSING: nguồn ngoài gửi chứng từ bán không kèm policyRefs khi có chính sách bán hiệu lực
 *   T031-DG-4  POLICY_EXPIRING_IN_USE: bản hết hạn trong 30 ngày, còn sự việc tham chiếu, có bản kế tiếp
 *   T031-DG-5  POLICY_PROMO_NOTICE: chưa đủ căn cứ → bỏ qua (skip), không phát hiện
 *   T031-TR-3  rulepack và bảng theo dõi (policy-tracking) đếm cùng số trên cùng dữ liệu
 *   T031-DG-6  lọc một đơn vị (args.tenant); chạy trong giao dịch READ ONLY — không ghi được
 * Lane diagnostics chạy trên cả bản cài; ở đây nạp đúng tệp .diag.mjs và chạy với ctx tối thiểu (db.query trong giao dịch READ ONLY).
 * Dữ liệu dựng qua cửa nạp thật.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

type Finding = { file: null; line: null; message: string; key: string };
type Result = { examined?: number; findings: Finding[]; skip?: string; notes?: string[]; metrics?: { code: string } };
type Check = { id: string; code: string; title: string; enforce: string; run: (ctx: unknown) => Promise<Result> };

const ROOT = path.resolve(__dirname, '../../..');
let checks: Check[] = [];
let ctx: TestCtx, other: TestCtx;
let tenantId = '', today = '';
const hashes: Record<string, string> = {};
const policyIds: Record<string, string> = {};

const laneCtx = (tenant?: string) => ({
  args: tenant ? { tenant } : {},
  finding: (file: null, line: null, message: string, key: string) => ({ file, line, message, key }),
  db: {
    query: (q: string) => db.transaction().execute(async (trx) => {
      await sql`SET TRANSACTION READ ONLY`.execute(trx);
      return (await sql.raw(q).execute(trx)).rows;
    }),
  },
});
const run = async (code: string, tenant = ctx.tenantCode) => {
  const c = checks.find((x) => x.code === code)!;
  expect(c, code).toBeTruthy();
  return c.run(laneCtx(tenant));
};
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const pub = (key: string, params: unknown, effectiveFrom: string) =>
  call(ctx, 'POST', '/api/v1/policies', { key, ruleContract: 'sale.promo.buy_x_get_y@1', params, effectiveFrom, reason: 'Chương trình thử' });
const promo = { buy: { sku: 'SUA01', qty: 1 }, get: { sku: 'QUA01', qty: 1 }, repeat: true };
let n = 0;
/** Phiếu bán 1 SUA01 (+ dòng quà QUA01 = gift) nêu `key@version`; ref null = không gửi tham chiếu. */
const ingest = async (docDate: string, ref: { key: string; version: number } | null, gift = 1) => {
  n += 1;
  const base = saleDoc({ docKey: `pdg:CN01:${n}`, docNo: `PDG${n}`, docDate, sourceSystem: 'wp-pos', invoice: { no: String(7000 + n), serial: 'C26TAA', form: '1', date: docDate } }) as { lines: Record<string, unknown>[] } & Record<string, unknown>;
  const lines = ref ? [base.lines[0]!, { ...base.lines[1]!, qty: gift, policyRef: { key: ref.key, version: ref.version, line: 'gift' } }] : [base.lines[0]!];
  const doc = { ...base, lines, ...(ref ? { policyRefs: [{ key: ref.key, version: ref.version, hash: hashes[`${ref.key}@${ref.version}`]!, policyId: policyIds[ref.key] }] } : {}) };
  const r = await ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: doc as never, headers: { authorization: `Bearer ${ctx.token}` } });
  expect(r.statusCode, r.body).toBeLessThan(300);
};
const loadHashes = async () => {
  for (const r of (await sql<{ policy_key: string; policy_id: string; version: number; content_hash: string }>`
    SELECT policy_key, policy_id, version, content_hash FROM policy_registry WHERE tenant_id = ${tenantId}`.execute(db)).rows) {
    hashes[`${r.policy_key}@${r.version}`] = r.content_hash;
    policyIds[r.policy_key] = r.policy_id;
  }
};
const mine = (r: Result) => r.findings.filter((f) => f.key.startsWith(`${ctx.tenantCode}:`));

beforeAll(async () => {
  checks = (await import(pathToFileURL(path.join(ROOT, 'tests/conformance/diagnostics/policy.diag.mjs')).href)).checks as Check[];
  ctx = await setupTenant();
  other = await setupTenant();
  tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
  today = (await sql<{ d: string }>`SELECT current_date::text AS d`.execute(db)).rows[0]!.d;
  expect((await pub('PD-QUA', promo, '2026-10-01')).status).toBe(201);
  // PD-HAN bản 1 từ hôm nay − 3, bản 2 từ hôm nay + 10 → bản 1 tự đóng ở hôm nay + 9 (sắp hết hạn)
  expect((await pub('PD-HAN', promo, addDays(today, -3))).status).toBe(201);
  expect((await pub('PD-HAN', { ...promo, get: { sku: 'QUA01', qty: 2 } }, addDays(today, 10))).status).toBe(201);
  await loadHashes();
  await ingest('2026-10-15', { key: 'PD-QUA', version: 1 });        // đạt
  await ingest('2026-10-16', { key: 'PD-QUA', version: 1 }, 2);     // thừa quà → IN-POL-004
  await ingest('2026-10-17', null);                                  // không gửi tham chiếu dù có PD-QUA hiệu lực
  await ingest(today, { key: 'PD-HAN', version: 1 });                // còn tham chiếu bản sắp hết hạn
});
afterAll(async () => { await ctx.app.close(); await other.app.close(); });

describe('S031-17 · rulepack policy', () => {
  it('khai đủ năm kiểm DG-POLICY-1..5, mức info (không chặn)', () => {
    expect(checks.map((c) => c.id)).toEqual(['DG-POLICY-1', 'DG-POLICY-2', 'DG-POLICY-3', 'DG-POLICY-4', 'DG-POLICY-5']);
    for (const c of checks) expect(c.enforce).toBe('info');
  });

  it('T031-DG-1: cảnh báo L4b theo kỳ × nguồn × chi nhánh × chính sách, tỷ lệ và mã', async () => {
    const r = await run('POLICY_L4B_WARN');
    expect(r.examined).toBe(3);
    const f = mine(r);
    expect(f.map((x) => x.key)).toEqual([`${ctx.tenantCode}:2026-10:wp-pos:CN01:PD-QUA`]);
    expect(f[0]!.message).toMatch(/1\/2 tham chiếu có cảnh báo L4b \(50%; IN-POL-004\)/);
  });

  it('T031-DG-2: lý do quà XTA1.4 tắt → mọi chính sách có quà đang hiệu lực bị báo; bật lại → hết', async () => {
    const has = (await sql<{ n: number }>`SELECT count(*)::int AS n FROM posting_reasons WHERE tenant_id = ${tenantId} AND code = 'XTA1.4'`.execute(db)).rows[0]!.n;
    if (!has) await sql`INSERT INTO posting_reasons (tenant_id, code, name, kind, flags) VALUES (${tenantId}, 'XTA1.4', 'Xuất tặng kèm bán', 'out', '{}'::jsonb)`.execute(db);
    await sql`UPDATE posting_reasons SET is_active = true WHERE tenant_id = ${tenantId} AND code = 'XTA1.4'`.execute(db);
    const ok = await run('POLICY_REASON_MISSING');
    expect(ok.examined).toBe(3); // PD-QUA@1, PD-HAN@1, PD-HAN@2 chưa hết hạn
    expect(mine(ok)).toEqual([]);
    expect(ok.notes?.join(' ')).toMatch(/GGHB.*chưa đủ căn cứ/);
    await sql`UPDATE posting_reasons SET is_active = false WHERE tenant_id = ${tenantId} AND code = 'XTA1.4'`.execute(db);
    try {
      const bad = mine(await run('POLICY_REASON_MISSING'));
      expect(bad.map((x) => x.key).sort()).toEqual([`${ctx.tenantCode}:PD-HAN@1`, `${ctx.tenantCode}:PD-HAN@2`, `${ctx.tenantCode}:PD-QUA@1`]);
      expect(bad[0]!.message).toMatch(/XTA1\.4/);
    } finally {
      await sql`UPDATE posting_reasons SET is_active = true WHERE tenant_id = ${tenantId} AND code = 'XTA1.4'`.execute(db);
    }
  });

  it('T031-DG-3: nguồn ngoài không gửi policyRefs khi có chính sách bán hiệu lực', async () => {
    const r = await run('POLICY_REFS_MISSING');
    expect(r.examined).toBe(4);
    const f = mine(r);
    expect(f.map((x) => x.key)).toEqual([`${ctx.tenantCode}:2026-10:wp-pos`]);
    expect(f[0]!.message).toMatch(/1\/3 chứng từ bán không gửi policyRefs/);
  });

  it('T031-DG-4: bản hết hạn trong 30 ngày mà còn sự việc tham chiếu; có bản kế tiếp', async () => {
    const r = await run('POLICY_EXPIRING_IN_USE');
    expect(r.examined).toBe(1);
    const f = mine(r);
    expect(f.map((x) => x.key)).toEqual([`${ctx.tenantCode}:PD-HAN@1`]);
    expect(f[0]!.message).toContain(`hết hạn ${addDays(today, 9)}`);
    expect(f[0]!.message).toMatch(/có bản kế tiếp @2/);
  });

  it('T031-TR-3: rulepack và bảng theo dõi (core.policy.tracking) đếm cùng số trên cùng dữ liệu', async () => {
    const t = (await call(ctx, 'GET', '/api/v1/policy-tracking?from=2026-10-01&to=2026-10-31')).body.data as {
      pass: { events: number; passed: number }; codes: { code: string; n: number }[]; coverage: { sourceSystem: string; events: number; withRefs: number }[];
    };
    const warn = mine(await run('POLICY_L4B_WARN')).find((f) => f.key.includes(':2026-10:'))!;
    expect(warn.message).toContain(`${t.pass.events - t.pass.passed}/${t.pass.events} tham chiếu`);
    expect(t.codes).toEqual([{ code: 'IN-POL-004', n: 1 }]);
    const cov = t.coverage.find((c) => c.sourceSystem === 'wp-pos')!;
    const miss = mine(await run('POLICY_REFS_MISSING')).find((f) => f.key.endsWith(':2026-10:wp-pos'))!;
    expect(miss.message).toContain(`${cov.events - cov.withRefs}/${cov.events} chứng từ bán`);
  });

  it('T031-DG-5: thông báo Sở Công Thương (NĐ81 Điều 17) chưa đủ căn cứ → bỏ qua', async () => {
    const r = await run('POLICY_PROMO_NOTICE');
    expect(r.skip).toMatch(/chưa đủ căn cứ/);
    expect(r.findings).toEqual([]);
    expect(checks.find((c) => c.code === 'POLICY_PROMO_NOTICE')!.title).toMatch(/chưa đủ căn cứ/);
  });

  it('T031-DG-6: lọc đúng một đơn vị; đơn vị khác không thấy dữ liệu này', async () => {
    for (const code of ['POLICY_L4B_WARN', 'POLICY_REFS_MISSING', 'POLICY_EXPIRING_IN_USE']) {
      const r = await run(code, other.tenantCode);
      expect(r.examined, code).toBe(0);
      expect(r.findings, code).toEqual([]);
    }
    // giao dịch READ ONLY: lane không ghi được dù câu có lệnh ghi
    await expect(laneCtx().db.query(`UPDATE posting_reasons SET is_active = is_active WHERE tenant_id = ${Number(tenantId)}`)).rejects.toThrow(/read-only/);
  });
});
