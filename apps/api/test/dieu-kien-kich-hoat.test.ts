// [2026-11-21 Nguyễn Văn Thủy] Điều kiện kích hoạt của chính sách mua (docs/nghiep-vu/29) — hai lượt: không hợp đồng / có hợp đồng (đóng góp)
/**
 * Mỗi lượt một đơn vị mới, cùng kịch bản; lượt "có hợp đồng" đặt chính sách + phiếu trong hợp đồng HD-KH:
 * 1. CK trên đơn 5% điều kiện doanh số tháng ≥ 100 triệu (tính cả phiếu): phiếu 50 triệu chưa đạt → không CK, Kiểm tra ghi rõ thiếu 50 triệu;
 *    duyệt phiếu 60 triệu (chưa đạt, không CK) rồi phiếu 50 triệu → 110 triệu đạt → CK 5%. Đơn đặt hàng cũng xét như phiếu nhập.
 * 2. Phạm vi xuyên suốt: doanh số của phiếu ngoài phạm vi (lượt có hợp đồng: phiếu KHÔNG theo hợp đồng) không tính vào điều kiện.
 * 3. Giá trị phiếu tối thiểu; không có nợ quá hạn; không vượt hạn mức công nợ.
 * 4. Khai điều kiện cho loại không hỗ trợ (hạn mức công nợ) → 400.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

type Check = { code: string; level: string; text: string };
type An = { calc: { orderDiscount: number; payable: number }; checks: Check[]; blockedPolicies?: { code: string; reasons: string[] }[] };
const SKU = 'KH-A';

for (const mode of ['none', 'contract'] as const) describe(mode === 'none' ? 'Điều kiện kích hoạt — KHÔNG hợp đồng' : 'Điều kiện kích hoạt — CÓ hợp đồng', () => {
  let t: TestCtx;
  const NCC = `NCC-KH-${mode}`;
  const HD = mode === 'contract' ? 'HD-KH' : undefined;
  const hd = (x: Record<string, unknown> = {}) => (HD ? { contractCode: HD, ...x } : x);
  /** Phiếu / đơn trị giá `trieu` triệu chưa thuế (1 dòng, giá 1 triệu). */
  const doc = (kind: 'receipt' | 'order', trieu: number, x: Record<string, unknown> = {}) => ({
    kind, docDate: '2026-10-20', branchCode: 'CN01', partnerCode: NCC, priceIncludesVat: false, ...(kind === 'receipt' ? { outsideOrder: { reason: 'Phép thử điều kiện' } } : {}),
    lines: [{ lineKey: 'a', sku: SKU, name: 'Hàng A', unit: 'Hộp', qty: trieu, price: 1_000_000, taxCode: 'V08', lineType: 'buy' }], ...hd(), ...x,
  });
  const analyze = async (body: Record<string, unknown>) => { const r = await call<{ data: An }>(t, 'POST', '/api/v1/purchase/analyze', body); expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(200); return r.body.data; };
  const approved = async (body: Record<string, unknown>) => {
    const r = await call(t, 'POST', '/api/v1/purchase/documents', body); expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(201);
    const a = await call(t, 'POST', `/api/v1/purchase/documents/${r.body.data.id}/approve`, {}); expect(a.status, JSON.stringify(a.body).slice(0, 400)).toBe(200);
    return a.body.data as { totals: { beforeTax: number } };
  };
  const policy = async (code: string, kind: string, rule: Record<string, unknown>, status = 201) => {
    const r = await call(t, 'POST', '/api/v1/purchase/policies', { code, kind, name: code, scope: { partnerCode: NCC, ...hd() }, validFrom: '2026-10-01', isActive: true, priority: 0, rule });
    expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(status);
    return r;
  };

  beforeAll(async () => {
    t = await setupTenant();
    await call(t, 'PUT', `/api/v1/partners/${NCC}`, { name: `NCC điều kiện ${mode}`, kind: 'supplier' });
    await call(t, 'PUT', `/api/v1/catalog/products/${SKU}?new=true`, { name: 'Hàng A', unit: 'Hộp', taxInCode: 'V08', units: [{ unit: 'Hộp', ratio: 1, isDefault: true }] });
    if (HD) expect((await call(t, 'PUT', '/api/v1/purchase/contracts', { code: HD, isNew: true, contract: { partnerCode: NCC, signedDate: '2026-01-01', startDate: '2026-01-01', endDate: '2026-12-31', skus: [SKU] } })).status).toBe(200);
  }, 90_000);
  afterAll(async () => { await t.app.close(); });

  it('CK 5% điều kiện doanh số tháng ≥ 100 triệu: chưa đạt → không áp, ghi rõ thiếu; đạt → áp (phiếu nhập và đơn đặt)', async () => {
    await policy('KH-CK5', 'trade_discount', { pct: 5, activation: { minPurchase: { amount: 100_000_000, period: 'month', includeCurrent: true } } });
    const a1 = await analyze(doc('receipt', 50));
    expect(a1.calc.orderDiscount).toBe(0);
    expect(a1.blockedPolicies?.map((b) => b.code)).toEqual(['KH-CK5']);
    expect(a1.checks.find((c) => c.code === 'policy_inactive')?.text).toMatch(/thiếu 50\.000\.000/);
    // Đã đạt ngưỡng chương trình (CK 5% không đặt mức đơn tối thiểu) nhưng chưa qua điều kiện tiên quyết → CẢNH BÁO, ghi rõ nguyên nhân.
    expect(a1.checks.find((c) => c.code === 'policy_inactive')).toMatchObject({ level: 'warn' });
    expect(a1.checks.find((c) => c.code === 'policy_inactive')?.text).toMatch(/Đã đạt ngưỡng.*KHÔNG áp vì chưa qua điều kiện tiên quyết/);
    expect(a1.blockedPolicies?.[0]).toMatchObject({ wouldApply: true });
    // Duyệt phiếu 60 triệu: 60 < 100 → không CK, giá trị chốt nguyên 60 triệu.
    expect((await approved(doc('receipt', 60))).totals.beforeTax).toBe(60_000_000);
    const a2 = await analyze(doc('receipt', 50));
    expect(a2.blockedPolicies ?? []).toEqual([]);
    expect(a2.calc.orderDiscount).toBe(2_500_000);
    expect(a2.checks.some((c) => c.code === 'policy_active')).toBe(true);
    const o = await analyze(doc('order', 50));
    expect(o.calc.orderDiscount).toBe(2_500_000);
    // Bỏ tích "tính cả phiếu": 60 < 100 → không áp.
    const p = (await call(t, 'GET', '/api/v1/purchase/policies')).body.data.find((x: { code: string }) => x.code === 'KH-CK5');
    expect((await call(t, 'PUT', `/api/v1/purchase/policies/${p.id}`, { ...p, rule: { pct: 5, activation: { minPurchase: { amount: 100_000_000, period: 'month', includeCurrent: false } } } })).status).toBe(200);
    expect((await analyze(doc('receipt', 50))).calc.orderDiscount).toBe(0);
    expect((await call(t, 'PUT', `/api/v1/purchase/policies/${p.id}`, { ...p, isActive: false })).status).toBe(200);
  });

  it('phạm vi xuyên suốt: doanh số ngoài phạm vi của chính sách không tính vào điều kiện', async () => {
    await policy('KH-CK3', 'trade_discount', { pct: 3, activation: { minPurchase: { amount: 200_000_000, period: 'month' } } });
    // Phiếu nằm NGOÀI phạm vi chính sách: lượt có hợp đồng → phiếu không theo hợp đồng; lượt không hợp đồng → phiếu tháng khác.
    await approved(HD ? doc('receipt', 150, { contractCode: undefined }) : doc('receipt', 150, { docDate: '2026-09-15', term: { basis: 'receipt_date', days: 90 } }));
    const a = await analyze(doc('receipt', 60)); // 60 (trong phạm vi) + 60 tháng 10 đã duyệt = 120 < 200
    expect(a.blockedPolicies?.map((b) => b.code)).toContain('KH-CK3');
    expect(a.checks.find((c) => c.code === 'policy_inactive' && c.text.includes('KH-CK3'))?.text).toMatch(/120\.000\.000 \/ cần 200\.000\.000/);
  });

  it('giá trị phiếu tối thiểu; không nợ quá hạn; không vượt hạn mức', async () => {
    await policy('KH-CKTT', 'payment_discount', { pct: 2, activation: { minDocValue: 80_000_000 } });
    expect((await analyze(doc('receipt', 50))).blockedPolicies?.map((b) => b.code)).toContain('KH-CKTT');
    expect((await analyze(doc('receipt', 90))).blockedPolicies?.map((b) => b.code) ?? []).not.toContain('KH-CKTT');
    // Nợ quá hạn: phiếu 30/09 hạn ngay (công nợ đến hạn) → ở ngày 20/10 đã quá hạn.
    await policy('KH-CK1', 'trade_discount', { pct: 1, activation: { noOverdue: true } });
    expect((await analyze(doc('receipt', 10))).blockedPolicies?.map((b) => b.code) ?? []).not.toContain('KH-CK1');
    await approved(doc('receipt', 5, { docDate: '2026-09-30', term: { basis: 'immediate', days: 0 } }));
    const q = await analyze(doc('receipt', 10));
    expect(q.blockedPolicies?.find((b) => b.code === 'KH-CK1')?.reasons.join(' ')).toMatch(/nợ quá hạn/);
    // Hạn mức: hạn mức 50 triệu (của hợp đồng / ngoài hợp đồng theo lượt) — phiếu 60 triệu vượt → CK theo điều kiện không áp.
    await policy('KH-HM', 'credit_limit', { limit: 999_000_000_000, warnPct: 90 });
    await policy('KH-CK2', 'trade_discount', { pct: 2, activation: { withinCreditLimit: true } });
    expect((await analyze(doc('receipt', 10))).blockedPolicies?.map((b) => b.code) ?? []).not.toContain('KH-CK2');
    const pol = (await call(t, 'GET', '/api/v1/purchase/policies')).body.data.find((x: { code: string }) => x.code === 'KH-HM');
    expect((await call(t, 'PUT', `/api/v1/purchase/policies/${pol.id}`, { ...pol, rule: { limit: 50_000_000, warnPct: 90 } })).status).toBe(200);
    expect((await analyze(doc('receipt', 900))).blockedPolicies?.find((b) => b.code === 'KH-CK2')?.reasons.join(' ')).toMatch(/vượt hạn mức/);
  });

  it('điều kiện kích hoạt chỉ khai cho chiết khấu / bậc SL / CKTT / mua X tặng Y', async () => {
    const r = await policy('KH-HM2', 'credit_limit', { limit: 1, activation: { noOverdue: true } }, 400);
    expect(JSON.stringify(r.body)).toMatch(/không khai điều kiện kích hoạt/);
  });
});
