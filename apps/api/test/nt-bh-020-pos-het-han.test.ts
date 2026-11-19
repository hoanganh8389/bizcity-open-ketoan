// [2026-11-19 Võ Hoàng] NGHIEM-THU — test dùng ngày tương đối (hạn trả NT-BH-030) (đóng góp)
// [2026-11-16 11:20 AM Võ Hoàng] LOYALTY — NT-BH-020 bước 3: nạp số dư cũ, hết hạn hằng ngày, báo cáo (đóng góp)
/**
 * NT-BH-020 bước 3 — nạp số dư điểm cũ từ website, hết hạn lô hằng ngày (nhịp bizcity.clock.daily), báo cáo. Số theo phiếu
 * docs/nghiem-thu/ban-hang/NT-BH-020-pos-tich-diem.md (bước 3) và tgs_pos_react/docs/module-pos/70-TICH-DIEM.md §5.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runModuleMigrations } from '@bizcity/platform/db/module-db';
import { dispatchOnce, tickClock } from '@bizcity/platform/core/events';
import { buildApp } from '../src/app.js';
import { syncBundled } from '../src/core/module-lifecycle.js';
import { db } from '../src/db/client.js';
import { setupTenant, type TestCtx } from './helpers.js';

const LOY = fileURLToPath(new URL('../../../modules/loyalty/', import.meta.url));
const HAS = existsSync(path.join(LOY, 'bizcity.module.json'));
// Ngày tương đối với hôm nay (giờ Việt Nam), giữ đúng khoảng cách của phiếu: chốt số dư = hôm nay (gốc 16/11/2026); lô cũ tích
// trước 371 ngày (gốc 10/11/2025) → hết hạn 6 ngày trước; nhịp hằng ngày hôm nay + ngày mai; báo cáo từ 380 ngày trước tới mai.
const vnDate = (offset = 0) => new Date(Date.now() + 7 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10);
const AS_OF = vnDate();
const OLD = vnDate(-371);
const vnMidnightIso = (d: string) => new Date(`${d}T00:00:00+07:00`).toISOString();
const TIERS = [
  { key: 'member', name: 'Thành viên', minPoints: 0, multiplier: 1 },
  { key: 'silver', name: 'Bạc', minPoints: 1000, multiplier: 1.2 },
  { key: 'gold', name: 'Vàng', minPoints: 5000, multiplier: 1.5 },
];
const PROGRAM = {
  version: 'lp-test-3',
  settings: { enablePosEarn: true, enablePosRedeem: true, enableTierMultiplier: true, minRedeemPoints: 0, pointLabel: 'điểm' },
  tiers: TIERS,
  policies: [{ id: 1, code: 'TICH10K', title: 'TICH10K', type: 1, priority: 1, status: 1, autoApply: true, startDate: 0, endDate: 0, applyToBlogIds: [], rules: { earn_rate: 1, earn_unit: 10000, point_expiry_days: 365 } }],
};

describe.skipIf(!HAS)('NT-BH-020 bước 3 — nạp số dư cũ, hết hạn, báo cáo', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const call = (method: 'GET' | 'POST', url: string, payload?: unknown) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${ctx.token}`, ...(method !== 'GET' ? { 'idempotency-key': `nt-bh-020c-${++k}-${Date.now()}` } : {}) },
  });
  const points = async (code: string) => (await call('GET', `/api/v1/m/loyalty/customers/${code}?branch=CN01`)).json().data;
  const expireRows = async () => (await sql<{ partner_code: string; points: string }>`
    SELECT partner_code, points FROM mod_loyalty.entries WHERE tenant_id = ${tenantId} AND kind = 'expire' ORDER BY partner_code`.execute(db)).rows.map((r) => [r.partner_code, Number(r.points)]);

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('loyalty', path.join(LOY, 'migrations'), { reads: ['bizcity_read.partners', 'bizcity_read.branches'] });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-020c', trx as never); });
    app = await buildApp();
    expect((await call('POST', '/api/v1/m/loyalty/program', { branchCode: 'CN01', storeId: 2, program: PROGRAM })).statusCode).toBe(200);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('nạp số dư cũ 0912345678 (tổng đã tích 6.000, số dư 4.200, chốt 16/11/2026, giữ 365 ngày) → 4.200 điểm, hạng Vàng, lô hạn 16/11/2027; nạp lại không thêm; dòng sai báo lý do', async () => {
    const r = await call('POST', '/api/v1/m/loyalty/opening', { asOf: AS_OF, expiresInDays: 365, rows: [
      { customerCode: '0912345678', totalEarned: 6000, balance: 4200 },
      { customerCode: '0912000009', totalEarned: 100, balance: 200 },
    ] });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toEqual({ created: 1, skipped: 0, errors: [{ customerCode: '0912000009', message: 'Khách 0912000009: số dư 200 lớn hơn tổng đã tích 100' }] });
    const p = await points('0912345678');
    expect(p).toMatchObject({ balance: 4200, available: 4200, totalEarned: 6000, tierKey: 'gold', tierName: 'Vàng' });
    expect(p.lots).toEqual([expect.objectContaining({ points: 6000, remaining: 4200, expiresAt: vnMidnightIso(vnDate(365)) })]);
    const again = await call('POST', '/api/v1/m/loyalty/opening', { asOf: AS_OF, rows: [{ customerCode: '0912345678', totalEarned: 6000, balance: 4200 }] });
    expect(again.json().data).toEqual({ created: 0, skipped: 1, errors: [] });
    expect((await points('0912345678')).balance).toBe(4200);
  });

  it('hết hạn: lô 100 tích 10/11/2025 hạn 365 ngày, đã dùng 30 → nhịp hằng ngày 16/11/2026 ghi −70, số dư 0; chạy lại / ngày sau không thêm; lô chưa hạn giữ nguyên', async () => {
    await call('POST', '/api/v1/m/loyalty/opening', { asOf: OLD, expiresInDays: 365, rows: [{ customerCode: '0912000001', totalEarned: 100, balance: 70 }] });
    expect((await points('0912000001')).available).toBe(0); // đã quá hạn: không dùng được dù chưa ghi dòng hết hạn
    expect(await tickClock(new Date(`${AS_OF}T03:00:00Z`), { tenantIds: [tenantId] })).toBeGreaterThanOrEqual(1);
    await dispatchOnce({ tenantId, consumers: ['loyalty.expire-daily'] });
    expect(await expireRows()).toEqual([['0912000001', -70]]);
    expect((await points('0912000001')).balance).toBe(0);
    await tickClock(new Date(`${vnDate(1)}T03:00:00Z`), { tenantIds: [tenantId] });
    await dispatchOnce({ tenantId, consumers: ['loyalty.expire-daily'] });
    expect(await expireRows()).toEqual([['0912000001', -70]]);
    expect((await points('0912345678')).balance).toBe(4200);
  });

  it('báo cáo kỳ 01/11/2025 – 17/11/2026: tích 6.100, đổi −1.830, hết hạn −70; số dư 4.200 (Vàng 1 khách, Thành viên 1 khách 0 điểm)', async () => {
    const r = await call('GET', `/api/v1/m/loyalty/report?from=${vnDate(-380)}&to=${vnDate(1)}`);
    expect(r.statusCode, r.body).toBe(200);
    const d = r.json().data;
    expect(d.total).toEqual({ earn: 6100, redeem: -1830, expire: -70, reverse: 0, adjust: 0 });
    expect(d.balance).toBe(4200);
    expect(d.byTier).toEqual([
      { tierKey: 'member', tierName: 'Thành viên', customers: 1, balance: 0 },
      { tierKey: 'silver', tierName: 'Bạc', customers: 0, balance: 0 },
      { tierKey: 'gold', tierName: 'Vàng', customers: 1, balance: 4200 },
    ]);
    expect(d.customers[0]).toMatchObject({ customerCode: '0912345678', balance: 4200, tierName: 'Vàng' });
    // Kỳ trước khi nạp: không có phát sinh.
    expect((await call('GET', `/api/v1/m/loyalty/report?from=${vnDate(-760)}&to=${vnDate(-400)}`)).json().data.total).toEqual({ earn: 0, redeem: 0, expire: 0, reverse: 0, adjust: 0 });
  });
});
