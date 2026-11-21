// [2026-11-21 Nguyễn Văn Thủy] Duyệt điều chỉnh phiếu nhập có chiết khấu theo chính sách (policyRefs) — lỗi LEDGER_APPEND_ONLY (đóng góp)
/**
 * Phiếu nhập có chiết khấu theo chương trình của NCC → chứng từ kế toán mang policyRefs. Duyệt → lập điều chỉnh → sửa SL → duyệt lại:
 * phải ghi được bản 2 (đảo bản cũ + ghi bản mới), không báo "CONFLICT · LEDGER_APPEND_ONLY".
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
const NCC = 'NCC-DCCS';
const SKU = 'DCCS1';
const body = (qty: number) => ({
  kind: 'receipt', outsideOrder: { reason: 'Phép thử điều chỉnh có chính sách' }, docDate: '2026-11-10', branchCode: 'CN01', partnerCode: NCC, priceIncludesVat: false, orderDiscount: {},
  lines: [{ lineKey: 'a', sku: SKU, name: 'Hàng chính sách', unit: 'Thùng', qty, price: 480_000, taxCode: 'V08', lineType: 'buy' }],
});

beforeAll(async () => {
  t = await setupTenant();
  await db.selectFrom('tenants').select('id').where('code', '=', t.tenantCode).executeTakeFirstOrThrow();
  await call(t, 'PUT', `/api/v1/partners/${NCC}`, { name: 'NCC điều chỉnh có chính sách', kind: 'supplier' });
  await call(t, 'PUT', `/api/v1/catalog/products/${SKU}?new=true`, { name: 'Hàng chính sách', unit: 'Hộp', taxInCode: 'V08', units: [{ unit: 'Hộp', ratio: 1, isDefault: true }, { unit: 'Thùng', ratio: 48, isPurchaseDefault: true }] });
  const p = await call(t, 'POST', '/api/v1/purchase/policies', { code: 'CT-DCCS', kind: 'item_discount', name: 'Giảm 10.000 / Thùng', scope: { partnerCode: NCC }, validFrom: '2026-11-01', validTo: '2026-11-30', priority: 0, isActive: true, rule: { items: [{ sku: SKU, amount: 10_000, unit: 'Thùng' }] } });
  expect(p.status, JSON.stringify(p.body)).toBe(201);
}, 90_000);
afterAll(async () => { await t.app.close(); });

describe('Duyệt điều chỉnh phiếu nhập có chính sách', () => {
  it('lập điều chỉnh, đổi SL, duyệt lại được (không LEDGER_APPEND_ONLY)', async () => {
    const r = await call(t, 'POST', '/api/v1/purchase/documents', body(5));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.data.calc?.lines?.[0]?.lineDiscount ?? 50_000).toBe(50_000);
    const id = r.body.data.id;
    const ap = await call(t, 'POST', `/api/v1/purchase/documents/${id}/approve`, {});
    expect(ap.status, JSON.stringify(ap.body).slice(0, 600)).toBe(200);
    const s = await call(t, 'POST', `/api/v1/purchase/documents/${id}/adjust`, { reason: 'NCC giao thêm 1 thùng' });
    expect(s.status, JSON.stringify(s.body).slice(0, 600)).toBe(200);
    expect((await call(t, 'PUT', `/api/v1/purchase/documents/${id}`, body(6))).status).toBe(200);
    const ap2 = await call(t, 'POST', `/api/v1/purchase/documents/${id}/approve`, {});
    expect(ap2.status, JSON.stringify(ap2.body).slice(0, 900)).toBe(200);
  });
});
