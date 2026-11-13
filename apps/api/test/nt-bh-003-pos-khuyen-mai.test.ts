/** NT-BH-003 — khuyến mại ở máy bán POS theo Chương trình bán (BH12): Core tính → module pos nhận dòng quà / giảm có căn cứ → phiếu bán → hạn mức. */
// [2026-11-12 10:50 PM Võ Hoàng] POS-KM — test tích hợp phiếu NT-BH-003 phần module pos (PHASE-031 · 00 §17 mục 6) (đóng góp)
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runModuleMigrations } from '@bizcity/platform/db/module-db';
import { buildApp } from '../src/app.js';
import { dispatchOnce } from '../src/core/events.js';
import { syncBundled } from '../src/core/module-lifecycle.js';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

const DIR = fileURLToPath(new URL('../../../modules/pos/', import.meta.url));
const HAS = existsSync(path.join(DIR, 'bizcity.module.json'));
const M = '/api/v1/m/pos';
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners',
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand'];
const vnDate = (offset = 0) => new Date(Date.now() + 7 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10);
const TODAY = vnDate();
const ID = (n: number) => `0193a1b2-0000-7000-8000-00000000${String(3000 + n).padStart(4, '0')}`;

describe.skipIf(!HAS)('NT-BH-003 — khuyến mại ở máy bán theo Chương trình bán', () => {
  const s = { ctx: null as unknown as TestCtx, app: null as unknown as FastifyInstance, tenantId: '', k: 0 };
  const programs: Record<string, string> = {};
  let refs: { key: string; version: number; hash: string }[] = [];
  const post = (url: string, payload: unknown) =>
    s.app.inject({ method: 'POST', url: `${M}${url}`, payload: payload as never, headers: { authorization: `Bearer ${s.ctx.token}`, 'idempotency-key': `nt3-${++s.k}-${Date.now()}` } });
  const used = async (code: string) => {
    const list = (await call<{ data: { code: string; quotas: { branchCode: string; usedQty: number }[] }[] }>(s.ctx, 'GET', `/api/v1/sale-programs?search=${code}`)).body.data;
    return list.find((p) => p.code === code)!.quotas.find((q) => q.branchCode === 'CN01')!.usedQty;
  };
  const order = (id: string, lines: unknown[], clientTotal: number, extra: Record<string, unknown> = {}) => ({
    id, branchCode: 'CN01', businessDate: TODAY, shiftId: 'x', exportReasonCode: 'XBA', customer: { retail: true }, lines, promotionSelections: [],
    payment: { mode: 'cash', cashGiven: clientTotal }, clientTotal, coreVersion: '0.1.0', promotionsVersion: '', ...extra,
  });

  beforeAll(async () => {
    s.ctx = await setupTenant();
    s.tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', s.ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(DIR, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-003', trx as never); });
    s.app = await buildApp();
    const products = [['SUA330', 'Sữa 330'], ['SUA900', 'Sữa 900'], ['QUA01', 'Quà tặng']];
    expect((await call(s.ctx, 'PUT', '/api/v1/products', { products: products.map(([sku, name]) => ({ sku, name, unit: 'Hộp' })) })).status).toBeLessThan(300);
    for (const [sku] of products) expect((await call(s.ctx, 'PUT', `/api/v1/products/${sku}`, { taxOutCode: 'R08' })).status).toBe(200);
    const save = async (body: Record<string, unknown>) => {
      const r = await call<{ data: { id: string; code: string } }>(s.ctx, 'POST', '/api/v1/sale-programs', { programKind: 'KM-CTY', validFrom: vnDate(-1), validTo: vnDate(30), ...body });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      programs[r.body.data.code] = r.body.data.id;
    };
    await save({ code: 'CT-SUA330', name: 'Mua 2 tặng 1', mode: 'gift', sku: 'SUA330', buyQty: 2, giftSku: 'QUA01', giftQty: 1, quotas: [{ branchCode: 'CN01', quotaQty: 10 }] });
    await save({ code: 'CT-SUA900', name: 'Giảm 10 %', mode: 'discount', sku: 'SUA900', discountPct: 10, quotas: [{ branchCode: 'CN01', quotaQty: 20 }] });
  });
  afterAll(async () => {
    await s.app?.close();
    await s.ctx?.app.close();
  });

  it('§3 bước 3: máy bán hỏi Core — 4 SUA330 tặng 2 QUA01, SUA900 giảm 90.000', async () => {
    const ev = await call(s.ctx, 'POST', '/api/v1/policies/evaluate', {
      docDate: TODAY, branchCode: 'CN01', lines: [{ lineKey: 'l1', sku: 'SUA330', qty: 4, price: 330_000 }, { lineKey: 'l2', sku: 'SUA900', qty: 1, price: 900_000 }],
    });
    expect(ev.status, JSON.stringify(ev.body)).toBe(200);
    expect(ev.body.data.gifts.map((g: { sku: string; qty: number }) => [g.sku, g.qty])).toEqual([['QUA01', 2]]);
    expect(ev.body.data.discounts.map((d: { lineKey: string; amount: number }) => [d.lineKey, d.amount])).toEqual([['l2', 90_000]]);
    refs = ev.body.data.policyRefs.map(({ key, version, hash }: { key: string; version: number; hash: string }) => ({ key, version, hash }));
    expect(refs.map((r) => r.key).sort()).toEqual(['CT-SUA330', 'CT-SUA900']);
  });

  it('§5 dòng 5–6: đơn có dòng quà 0đ + dòng giảm → nhận; phiếu bán mang policyRefs, cửa nạp không lệch; hạn mức tự trừ', async () => {
    const lines = [
      { lineId: 'l1', sku: 'SUA330', unitName: 'Hộp', unitQty: 4, clientUnitPrice: 330_000 },
      { lineId: 'l2', sku: 'SUA900', unitName: 'Hộp', unitQty: 1, clientUnitPrice: 900_000, promoDiscount: 90_000, policyRef: { key: 'CT-SUA900', version: 1, line: 'discount' } },
      { lineId: 'g1', sku: 'QUA01', unitName: 'Hộp', unitQty: 2, clientUnitPrice: 0, isGift: true, policyRef: { key: 'CT-SUA330', version: 1, line: 'gift' } },
    ];
    const r = await post('/orders', order(ID(1), lines, 2_130_000, { policyRefs: refs }));
    expect(r.statusCode, r.body).toBe(201);
    const o = r.json().data.order;
    expect(o.total).toBe(2_130_000);
    expect(o.lines.find((l: { lineId: string }) => l.lineId === 'l2').promoDiscount).toBe(90_000);

    const ev = (await sql<{ status: string; payload: { policyRefs?: unknown[]; lines: { lineKey: string; isGift?: boolean; policyRef?: unknown }[] }; policy_check: { refs: { ok: boolean }[] } | null }>`
      SELECT status, payload, policy_check FROM accounting_events WHERE tenant_id = ${s.tenantId} AND doc_key = ${`pos:CN01:sale:${ID(1)}`}`.execute(db)).rows[0]!;
    expect(ev.status).toBe('posted');
    expect(ev.payload.policyRefs).toHaveLength(2);
    expect(ev.payload.lines.find((l) => l.lineKey === 'g1')).toMatchObject({ isGift: true, policyRef: { key: 'CT-SUA330', version: 1, line: 'gift' } });
    expect(ev.policy_check?.refs.every((x) => x.ok), JSON.stringify(ev.policy_check)).toBe(true);

    await dispatchOnce({ consumers: ['ban-hang.sale-program-usage'], limit: 100 });
    expect(await used('CT-SUA330')).toBe(2);
    expect(await used('CT-SUA900')).toBe(1);
  });

  it('§5 dòng 8: dòng quà / dòng giảm thiếu căn cứ → POS_GIFT_WITHOUT_POLICY, không đơn, không chứng từ', async () => {
    const noRef = await post('/orders', order(ID(2), [
      { lineId: 'l1', sku: 'SUA330', unitName: 'Hộp', unitQty: 2, clientUnitPrice: 330_000 },
      { lineId: 'g1', sku: 'QUA01', unitName: 'Hộp', unitQty: 1, clientUnitPrice: 0, isGift: true },
    ], 660_000));
    expect(noRef.statusCode, noRef.body).toBe(400);
    expect(noRef.json().error.details.reason).toBe('POS_GIFT_WITHOUT_POLICY');
    const noHeader = await post('/orders', order(ID(3), [
      { lineId: 'l2', sku: 'SUA900', unitName: 'Hộp', unitQty: 1, clientUnitPrice: 900_000, promoDiscount: 90_000, policyRef: { key: 'CT-SUA900', version: 1, line: 'discount' } },
    ], 810_000));
    expect(noHeader.json().error.details.reason).toBe('POS_GIFT_WITHOUT_POLICY');
    const n = (await sql<{ n: string }>`SELECT count(*)::text AS n FROM accounting_events WHERE tenant_id = ${s.tenantId} AND doc_key IN (${`pos:CN01:sale:${ID(2)}`}, ${`pos:CN01:sale:${ID(3)}`})`.execute(db)).rows[0]!;
    expect(Number(n.n)).toBe(0);
  });
});
