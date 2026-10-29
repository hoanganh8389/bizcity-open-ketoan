/**
 * Trả tiền NCC chọn tài khoản tiền khác mặc định (ngân hàng khác / quỹ khác): bút toán ghi Có đúng tài khoản chọn;
 * để trống thì theo mặc định; chọn tài khoản sai loại (112 khi trả tiền mặt) thì về mặc định; tài khoản không phải 111 / 112 bị từ chối.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
type Doc = { id: string; links: { eventId: string; role: string }[] };
const save = async (body: Record<string, unknown>) => { const r = await call(t, 'POST', '/api/v1/purchase/documents', body); expect(r.status, JSON.stringify(r.body)).toBe(201); return r.body.data as Doc; };
const approve = async (id: string) => { const r = await call(t, 'POST', `/api/v1/purchase/documents/${id}/approve`); expect(r.status, JSON.stringify(r.body)).toBe(200); return r.body.data as Doc; };
const credits = async (d: Doc) => {
  // Tài khoản ghi Có của chứng từ trả tiền (bỏ 331 — phía Nợ là công nợ NCC).
  const e = (await call(t, 'GET', `/api/v1/documents/${d.links[0]!.eventId}`)).body.data.entries as { lines: { accountCode: string; credit: number }[] }[];
  return [...new Set(e.flatMap((x) => x.lines).filter((l) => l.credit > 0).map((l) => l.accountCode))];
};
const pay = (extra: Record<string, unknown>) => ({ kind: 'payment', docDate: '2026-10-10', branchCode: 'CN-NA', partnerCode: 'NCC-TKTIEN', amount: 1000000, lines: [], ...extra });
let banks: string[] = [];
let cashes: string[] = [];

beforeAll(async () => {
  t = await setupTenant();
  expect((await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' })).status).toBe(200);
  await call(t, 'PUT', '/api/v1/partners/NCC-TKTIEN', { name: 'NCC tài khoản tiền', kind: 'supplier' });
  const acc = (await call(t, 'GET', '/api/v1/accounts')).body.data as { code: string; isPosting: boolean }[];
  // Ngân hàng thứ hai cho phép thử (mở thêm tài khoản chi tiết 112 nếu đơn vị chỉ có một).
  banks = acc.filter((a) => a.isPosting && a.code.startsWith('112')).map((a) => a.code);
  if (banks.length < 2) {
    const r = await call(t, 'POST', '/api/v1/accounts', { code: '11210099', name: 'Ngân hàng phép thử', parentCode: '1121', type: 'asset', normalSide: 'debit' });
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    banks.push('11210099');
  }
  cashes = acc.filter((a) => a.isPosting && a.code.startsWith('111')).map((a) => a.code);
}, 60_000);
afterAll(async () => { await t.app.close(); });

describe('Trả tiền NCC — chọn tài khoản tiền', () => {
  it('trống = mặc định; chọn ngân hàng khác thì ghi Có đúng tài khoản đó', async () => {
    const def = await credits(await approve((await save(pay({ method: 'bank' }))).id));
    expect(def).toHaveLength(1);
    const other = banks.find((b) => b !== def[0])!;
    expect(await credits(await approve((await save(pay({ method: 'bank', moneyAccount: other }))).id))).toEqual([other]);
  });

  it('chọn sai loại (112 khi trả tiền mặt) → về quỹ tiền mặt mặc định; tài khoản không phải 111 / 112 bị từ chối', async () => {
    const c = await credits(await approve((await save(pay({ method: 'cash', moneyAccount: banks[0] }))).id));
    expect(c).toHaveLength(1);
    expect(c[0]!.startsWith('111')).toBe(true);
    expect(cashes).toContain(c[0]);
    expect((await call(t, 'POST', '/api/v1/purchase/documents', pay({ method: 'bank', moneyAccount: '3312' }))).status).toBe(400);
  });
});
