/**
 * [2026-11-13 Nguyễn Văn Thủy] Tài khoản trên dòng phiếu nhập mua (đóng góp)
 * Trống = theo Tài khoản ngầm định; chọn TK kho khác trong lọc → bút toán ghi Nợ đúng tài khoản đó;
 * chọn ngoài lọc (vd 1111 làm TK kho) → chặn duyệt.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
type Doc = { id: string; links: { eventId: string; role: string }[] };
const line = (accounts?: Record<string, string>) => ({ lineKey: 'a', sku: '110154028', name: 'Anlene Gold 5X hương vani 400g', unit: 'Lon', qty: 10, price: 250000, taxCode: 'V08', lineType: 'buy', lotNo: 'L1', expDate: '2028-01-01', ...(accounts ? { accounts } : {}) });
const body = (accounts?: Record<string, string>) => ({ kind: 'receipt', outsideOrder: { reason: 'Phép thử: tài khoản trên dòng' }, docDate: '2026-10-08', branchCode: 'CN-NA', partnerCode: 'NCC-TKDONG', priceIncludesVat: false, orderDiscount: {}, lines: [line(accounts)] });
const save = async (b: Record<string, unknown>) => { const r = await call(t, 'POST', '/api/v1/purchase/documents', b); expect(r.status, JSON.stringify(r.body)).toBe(201); return r.body.data as Doc; };
const debits = async (d: Doc) => {
  const e = (await call(t, 'GET', `/api/v1/documents/${d.links[0]!.eventId}`)).body.data.entries as { lines: { accountCode: string; debit: number }[] }[];
  return [...new Set(e.flatMap((x) => x.lines).filter((l) => l.debit > 0).map((l) => l.accountCode))];
};
let stock2 = '';

beforeAll(async () => {
  t = await setupTenant();
  expect((await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' })).status).toBe(200);
  await call(t, 'PUT', '/api/v1/partners/NCC-TKDONG', { name: 'NCC tài khoản dòng', kind: 'supplier' });
  await call(t, 'GET', '/api/v1/account-default-types'); // nạp Tài khoản ngầm định theo loại
  const acc = (await call(t, 'GET', '/api/v1/accounts')).body.data as { code: string; isPosting: boolean }[];
  stock2 = acc.find((a) => a.isPosting && a.code.startsWith('153'))?.code ?? '';
  if (!stock2) {
    const r = await call(t, 'POST', '/api/v1/accounts', { code: '1531', name: 'Công cụ dụng cụ', parentCode: '153', type: 'asset', normalSide: 'debit' });
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    stock2 = '1531';
  }
}, 60_000);
afterAll(async () => { await t.app.close(); });

describe('Nhập mua — tài khoản trên dòng', () => {
  it('trống = theo ngầm định; chọn TK kho khác trong lọc thì ghi Nợ tài khoản đó', async () => {
    const def = await debits((await call(t, 'POST', `/api/v1/purchase/documents/${(await save(body())).id}/approve`)).body.data as Doc);
    expect(def.some((a) => a.startsWith('156'))).toBe(true);
    const d = await save(body({ inventory: stock2 }));
    const ok = await call(t, 'POST', `/api/v1/purchase/documents/${d.id}/approve`);
    expect(ok.status, JSON.stringify(ok.body).slice(0, 400)).toBe(200);
    const acc = await debits(ok.body.data as Doc);
    expect(acc).toContain(stock2);
    expect(acc.some((a) => a.startsWith('156'))).toBe(false);
  });

  it('TK kho ngoài lọc (1111) → chặn duyệt', async () => {
    const d = await save(body({ inventory: '1111' }));
    const r = await call(t, 'POST', `/api/v1/purchase/documents/${d.id}/approve`);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(r.body)).toContain('Tài khoản ngầm định');
  });
});
