/**
 * [2026-11-15 Nguyễn Văn Thủy] Phiếu nhập mua không mang tài khoản (đóng góp)
 * Tài khoản chỉ quyết định ở Quy tắc hạch toán: dòng phiếu gửi kèm tài khoản (máy khách cũ) thì bị bỏ qua,
 * bút toán vẫn ghi TK kho của quy tắc / loại kho.
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

beforeAll(async () => {
  t = await setupTenant();
  expect((await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' })).status).toBe(200);
  await call(t, 'PUT', '/api/v1/partners/NCC-TKDONG', { name: 'NCC tài khoản dòng', kind: 'supplier' });
}, 60_000);
afterAll(async () => { await t.app.close(); });

describe('Nhập mua — tài khoản chỉ theo Quy tắc hạch toán', () => {
  it('dòng gửi kèm tài khoản bị bỏ qua: ghi Nợ TK kho của quy tắc, không ghi tài khoản gửi kèm', async () => {
    const def = await debits((await call(t, 'POST', `/api/v1/purchase/documents/${(await save(body())).id}/approve`)).body.data as Doc);
    expect(def.some((a) => a.startsWith('156'))).toBe(true);
    const d = await save(body({ inventory: '1111', payable: '1121', tax: '6421' }));
    const ok = await call(t, 'POST', `/api/v1/purchase/documents/${d.id}/approve`);
    expect(ok.status, JSON.stringify(ok.body).slice(0, 400)).toBe(200);
    const acc = await debits(ok.body.data as Doc);
    expect(acc.sort()).toEqual(def.sort());
    expect(acc).not.toContain('1111');
  });

  it('quà không hoá đơn: tài khoản theo mục đích NQUA kế toán khai — phiếu quà sau không ghi đè lại', async () => {
    const purposes = (await call(t, 'GET', '/api/v1/posting/purposes')).body.data as { code: string; accountCode: string }[];
    const cur = purposes.find((p) => p.code === 'NQUA')?.accountCode ?? '';
    const acc = (await call(t, 'GET', '/api/v1/accounts')).body.data as { code: string; isPosting: boolean }[];
    const other = acc.find((a) => a.isPosting && a.code.startsWith('711') && a.code !== cur)?.code;
    expect(other, 'cần một TK 711 chi tiết khác').toBeTruthy();
    const put = await call(t, 'PUT', '/api/v1/posting/purposes/NQUA', { name: 'Nhận quà NCC', direction: 'increase', accountCode: other });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    const g = await save({ kind: 'gift_in', docDate: '2026-10-09', branchCode: 'CN-NA', partnerCode: 'NCC-TKDONG', gift: { source: 'ncc_extra', hasVat: false }, priceIncludesVat: false, orderDiscount: {},
      lines: [{ lineKey: 'q', sku: 'QT-THUNG-SUAZ', name: 'Thùng sữa tặng kèm (ngoài hợp đồng)', unit: 'Thùng', qty: 2, price: 480000, taxCode: 'KKKN', lineType: 'gift_consumer' }] });
    const ok = await call(t, 'POST', `/api/v1/purchase/documents/${g.id}/approve`);
    expect(ok.status, JSON.stringify(ok.body).slice(0, 400)).toBe(200);
    const d = ok.body.data as Doc;
    const e = (await call(t, 'GET', `/api/v1/documents/${d.links[0]!.eventId}`)).body.data.entries as { lines: { accountCode: string; credit: number }[] }[];
    expect(e.flatMap((x) => x.lines).filter((l) => l.credit > 0).map((l) => l.accountCode)).toContain(other);
    const after = (await call(t, 'GET', '/api/v1/posting/purposes')).body.data as { code: string; accountCode: string }[];
    expect(after.find((p) => p.code === 'NQUA')?.accountCode).toBe(other);
  });
});
