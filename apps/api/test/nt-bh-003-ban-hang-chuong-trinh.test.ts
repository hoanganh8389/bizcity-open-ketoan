// [2026-11-12 10:05 PM Võ Hoàng] POS-KM — phiếu NT-BH-003 phần Core (PHASE-031 · 00 §17 mục 2–4): BH12 → evaluate → phiếu bán có policyRef → hạn mức tự trừ / trả (đóng góp)
/**
 * Số liệu theo phiếu NT-BH-003 §4: SUA330 330.000 / hộp, SUA900 900.000 / hộp, QUA01 quà.
 *   - CT-SUA330: mua 2 SUA330 tặng 1 QUA01, hạn mức CN01 = 10 (CN02 không giao);
 *   - CT-SUA900: giảm 10 % SUA900, hạn mức CN01 = 20.
 * Dòng §5 / §6 của phiếu ghi ở tên từng ca.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { dispatchOnce } from '../src/core/events.js';
import { saleProgramUsageSubscriber } from '../src/modules/sale-programs/policy-bridge.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const today = new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

type Program = { id: string; code: string; version: number; quotas: { branchCode: string; usedQty: number; remaining: number }[] };
const programs: Record<string, Program> = {};

const evaluate = (lines: unknown[], branchCode?: string) => call(ctx, 'POST', '/api/v1/policies/evaluate', { docDate: today, ...(branchCode ? { branchCode } : {}), lines });
const deliver = () => dispatchOnce({ consumers: ['ban-hang.sale-program-usage'], limit: 100 });
const quota = async (code: string, branch = 'CN01') => {
  const list = (await call<{ data: Program[] }>(ctx, 'GET', `/api/v1/sale-programs?search=${code}`)).body.data;
  return list.find((p) => p.code === code)!.quotas.find((q) => q.branchCode === branch);
};
const cart = [
  { lineKey: 'l1', sku: 'SUA330', qty: 4, price: 330_000 },
  { lineKey: 'l2', sku: 'SUA900', qty: 1, price: 900_000 },
];

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  for (const [sku, name] of [['SUA330', 'Sữa 330'], ['SUA900', 'Sữa 900'], ['QUA01', 'Quà tặng']]) {
    await sql`INSERT INTO products (tenant_id, sku, name, unit) VALUES (${tenantId}, ${sku}, ${name}, 'Hộp') ON CONFLICT (tenant_id, sku) DO NOTHING`.execute(db);
  }
  const save = async (body: Record<string, unknown>) => {
    const r = await call<{ data: Program }>(ctx, 'POST', '/api/v1/sale-programs', { programKind: 'KM-CTY', validFrom: addDays(today, -1), validTo: addDays(today, 30), ...body });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    programs[r.body.data.code] = r.body.data;
  };
  await save({ code: 'CT-SUA330', name: 'Mua 2 tặng 1', mode: 'gift', sku: 'SUA330', buyQty: 2, giftSku: 'QUA01', giftQty: 1, quotas: [{ branchCode: 'CN01', quotaQty: 10 }] });
  await save({ code: 'CT-SUA900', name: 'Giảm 10 %', mode: 'discount', sku: 'SUA900', discountPct: 10, quotas: [{ branchCode: 'CN01', quotaQty: 20 }] });
});
afterAll(async () => { await ctx.app.close(); });

let result: { gifts: any[]; discounts: any[]; policyRefs: any[]; applied: any[]; skipped: any[] };

describe('NT-BH-003 — chương trình bán BH12 tính ở Core', () => {
  it('§5 dòng 1–2: 4 SUA330 → tặng 2 QUA01; SUA900 giảm 90.000; mỗi kết quả kèm chương trình + bản; hạn mức còn lại', async () => {
    const r = await evaluate(cart, 'CN01');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    result = r.body.data;
    expect(result.gifts).toEqual([{ sku: 'QUA01', qty: 2, isGift: true, policyRef: { key: 'CT-SUA330', version: 1, line: 'gift' } }]);
    expect(result.discounts).toEqual([{ lineKey: 'l2', sku: 'SUA900', qty: 1, amount: 90_000, policyRef: { key: 'CT-SUA900', version: 1, line: 'discount' } }]);
    expect(result.policyRefs.map((p) => p.key).sort()).toEqual(['CT-SUA330', 'CT-SUA900']);
    expect(result.policyRefs.every((p) => p.policyId.startsWith('ban-hang:sale_programs:'))).toBe(true);
    const gift = result.applied.find((a) => a.policyRef.key === 'CT-SUA330');
    expect(gift.quota).toMatchObject({ branchCode: 'CN01', quotaQty: 10, usedQty: 0, remaining: 10 });
  });

  it('§5 dòng 3: CN02 không được giao, thiếu chi nhánh → bỏ qua kèm lý do', async () => {
    const cn02 = (await evaluate(cart, 'CN02')).body.data;
    expect(cn02.applied).toEqual([]);
    expect(cn02.skipped.map((s: { reason: string }) => s.reason).join('|')).toContain('cửa hàng CN02 không được giao hạn mức');
    const none = (await evaluate(cart)).body.data;
    expect(none.skipped.map((s: { reason: string }) => s.reason).join('|')).toContain('cần branchCode');
  });

  it('§5 dòng 5–6: phiếu bán mang đúng kết quả → ghi sổ, không lệch; hạn mức trừ đúng; ghi lại cùng phiếu không trừ thêm', async () => {
    const lines = [
      { lineKey: 'l1', sku: 'SUA330', name: 'Sữa 330', unit: 'Hộp', qty: 4, amountBeforeTax: 1_222_222, taxCode: 'R08', taxAmount: 97_778 },
      { lineKey: 'l2', sku: 'SUA900', name: 'Sữa 900', unit: 'Hộp', qty: 1, amountBeforeTax: 750_000, discount: 83_333, taxCode: 'R08', taxAmount: 60_000, policyRef: { key: 'CT-SUA900', version: 1, line: 'discount' } },
      { lineKey: 'g1', sku: 'QUA01', name: 'Quà tặng', unit: 'Hộp', qty: 2, amountBeforeTax: 0, taxCode: 'R08', taxAmount: 0, isGift: true, policyRef: { key: 'CT-SUA330', version: 1, line: 'gift' } },
    ];
    const doc = saleDoc({
      docKey: 'pos:CN01:KM0001', docNo: 'KM0001', docDate: today, invoice: undefined, lines, policyRefs: result.policyRefs.map(({ key, version, hash }) => ({ key, version, hash })),
      payments: [{ methodCode: 'TM', amount: 2_130_000 }], totals: { beforeTax: 1_972_222, tax: 157_778, total: 2_130_000 },
    });
    const r = await call(ctx, 'POST', '/api/v1/documents', doc);
    expect(r.body.data?.status, JSON.stringify(r.body)).toBe('posted');
    const check = (await sql<{ policy_check: { refs: { ok: boolean; codes: string[] }[] } | null }>`SELECT policy_check FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = 'pos:CN01:KM0001'`.execute(db)).rows[0]!.policy_check;
    expect(check?.refs.every((x) => x.ok), JSON.stringify(check)).toBe(true);

    await deliver();
    expect((await quota('CT-SUA330'))?.usedQty).toBe(2);
    expect((await quota('CT-SUA900'))?.usedQty).toBe(1);
    // Sự kiện ghi sổ giao lại lần nữa (outbox giao ít nhất một lần) → người nghe không trừ thêm. Gửi lại bản 2 của phiếu có policyRefs
    // đang vướng LEDGER_APPEND_ONLY ở Core (có sẵn trên main, ngoài đợt này) nên thử bằng cách giao lại sự kiện.
    await db.transaction().execute((tx) => saleProgramUsageSubscriber.handle(
      { tx, tenantId, emit: async () => null, module: async () => undefined, settings: { get: async () => undefined } } as never,
      { type: 'bizcity.ledger.entry.posted', data: { docKey: 'pos:CN01:KM0001', docType: 'sale' } } as never,
    ));
    expect((await quota('CT-SUA330'))?.usedQty).toBe(2);
    const usage = await call<{ data: { doc_key: string; qty: number }[] }>(ctx, 'GET', `/api/v1/sale-programs/${programs['CT-SUA330']!.id}/usage`);
    expect(usage.status, JSON.stringify(usage.body)).toBe(200);
    expect(usage.body.data.map((u) => [u.doc_key, u.qty])).toEqual([['pos:CN01:KM0001', 2]]);
  });

  it('§5 dòng 7: huỷ phiếu → hạn mức trả lại đủ', async () => {
    const r = await call(ctx, 'POST', '/api/v1/documents/cancel', { docKey: 'pos:CN01:KM0001', reason: 'Khách huỷ (thử NT-BH-003)' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    await deliver();
    expect((await quota('CT-SUA330'))?.usedQty).toBe(0);
    expect((await quota('CT-SUA900'))?.usedQty).toBe(0);
  });

  it('§6 dòng 1: vượt hạn mức khi phiếu đã ghi sổ → vẫn ghi lượt dùng (đã bán thật); hết suất thì evaluate bỏ qua', async () => {
    const r = await call(ctx, 'PUT', `/api/v1/sale-programs/${programs['CT-SUA330']!.id}/quotas`, { quotas: [{ branchCode: 'CN01', quotaQty: 1 }] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const doc = saleDoc({
      docKey: 'pos:CN01:KM0002', docNo: 'KM0002', docDate: today, invoice: undefined, policyRefs: result.policyRefs.filter((p) => p.key === 'CT-SUA330').map(({ key, version, hash }) => ({ key, version, hash })),
      lines: [
        { lineKey: 'l1', sku: 'SUA330', name: 'Sữa 330', unit: 'Hộp', qty: 4, amountBeforeTax: 1_222_222, taxCode: 'R08', taxAmount: 97_778 },
        { lineKey: 'g1', sku: 'QUA01', name: 'Quà tặng', unit: 'Hộp', qty: 2, amountBeforeTax: 0, taxCode: 'R08', taxAmount: 0, isGift: true, policyRef: { key: 'CT-SUA330', version: 1, line: 'gift' } },
      ],
      payments: [{ methodCode: 'TM', amount: 1_320_000 }], totals: { beforeTax: 1_222_222, tax: 97_778, total: 1_320_000 },
    });
    expect((await call(ctx, 'POST', '/api/v1/documents', doc)).body.data?.status).toBe('posted');
    await deliver();
    expect((await quota('CT-SUA330'))?.usedQty).toBe(2);
    const ev = (await evaluate(cart, 'CN01')).body.data;
    expect(ev.gifts).toEqual([]);
    expect(ev.skipped.find((s: { key: string }) => s.key === 'CT-SUA330').reason).toContain('đã hết hạn mức');
  });

  it('§5 dòng 10: sửa chương trình → bản 2; bản 1 (đã bị sửa đè) không còn tính được, chứng từ cũ vẫn trỏ bản 1', async () => {
    const r = await call<{ data: Program }>(ctx, 'PUT', `/api/v1/sale-programs/${programs['CT-SUA900']!.id}`, {
      code: 'CT-SUA900', name: 'Giảm 15 %', programKind: 'KM-CTY', mode: 'discount', sku: 'SUA900', discountPct: 15, validFrom: addDays(today, -1), validTo: addDays(today, 30),
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.version).toBe(2);
    const v2 = (await evaluate([cart[1]], 'CN01')).body.data;
    expect(v2.discounts).toEqual([{ lineKey: 'l2', sku: 'SUA900', qty: 1, amount: 135_000, policyRef: { key: 'CT-SUA900', version: 2, line: 'discount' } }]);
    const refs = (await sql<{ n: string }>`SELECT count(*)::text AS n FROM accounting_events WHERE tenant_id = ${tenantId} AND payload->'policyRefs' @> '[{"key":"CT-SUA900","version":1}]'::jsonb`.execute(db)).rows[0]!;
    expect(Number(refs.n)).toBe(1);
  });
});
