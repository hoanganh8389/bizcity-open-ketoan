/**
 * Kiểm thử: màn Chứng từ kế toán (Tiện ích) — bốn chế độ như CtrlLedger HTsoft (ACC3, ACC3A mất liên kết phiếu gốc, ACC3B lệch
 * thân / chi tiết, ACC3C lệch so với phiếu gốc) và nút Xoá = bỏ định khoản (chứng từ về Chờ định khoản).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APPROVABLE_DOC_TYPES } from '@ketoan/contracts';
import { closeDb } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const OCT = 'from=2026-10-01&to=2026-10-31';
const list = async (mode: string, extra = '') => (await call(ctx, 'GET', `/api/v1/ledger/vouchers?mode=${mode}&${OCT}${extra}`)).body.data;
const send = (doc: unknown) => ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: doc as never, headers: { 'x-api-key': ctx.apiKey } });
const sourceCancel = (docKey: string) => ctx.app.inject({ method: 'POST', url: '/api/v1/documents/cancel', payload: { docKey, reason: 'Nguồn xoá phiếu' }, headers: { 'x-api-key': ctx.apiKey } });

beforeAll(async () => {
  ctx = await setupTenant();
  // Hoá đơn bán phải chờ duyệt: phiên bản mới / lệnh xoá từ nguồn không tự định khoản lại → bút toán cũ còn hiệu lực.
  const modes = { ...Object.fromEntries(APPROVABLE_DOC_TYPES.map((t) => [t, 'auto'])), sale: 'approve' };
  expect((await call(ctx, 'PUT', '/api/v1/settings/posting-modes', modes)).status).toBe(200);
  for (const [key, no] of [['pos:CN01:HDV1', 'HDV1'], ['pos:CN01:HDV2', 'HDV2'], ['pos:CN01:HDV3', 'HDV3']]) {
    expect((await send(saleDoc({ docKey: key, docNo: no }))).json().data.status).toBe('pending');
  }
  const pending = await call(ctx, 'GET', '/api/v1/documents?status=pending');
  const ids = pending.body.data.map((d: any) => d.id);
  expect((await call(ctx, 'POST', '/api/v1/documents/post', { ids })).status).toBe(200);
  expect((await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'manual', branchCode: 'CN01', docDate: '2026-10-08', description: 'Phiếu kế toán tay', lines: [{ debitAccount: '64211', creditAccount: '1111', amount: 50000 }] })).status).toBe(201);
});
afterAll(async () => {
  await ctx.app.close();
  await closeDb();
});

describe('Chứng từ kế toán (ACC3)', () => {
  it('liệt kê bút toán đang hiệu lực, cột như HTsoft', async () => {
    const d = await list('all');
    const sale = d.rows.find((r: any) => r.docNo === 'HDV1');
    expect(sale).toMatchObject({ entryIds: [expect.any(String), expect.any(String)], docTypeLabel: expect.any(String), branchCode: 'CN01', docTotal: 200000, year: 2026, invoiceNo: '0000123', linkProblem: '', canUnpost: true });
    expect(sale.totalDebit).toBe(sale.totalCredit);
    expect(d.rows.find((r: any) => r.description === 'Phiếu kế toán tay')).toMatchObject({ docTotal: 50000, canUnpost: false });
    expect(d.totals.totalDebit).toBe(d.totals.totalCredit);
  });

  it('lọc số chứng từ, tài khoản, loại, chi nhánh', async () => {
    expect((await list('all', '&docNo=HDV2')).rows.map((r: any) => r.docNo)).toEqual(['HDV2']);
    expect((await list('all', '&account=64211')).rows).toHaveLength(1);
    expect((await list('all', '&docType=manual')).rows).toHaveLength(1);
    expect((await list('all', '&branchCodes=KHONG-CO')).rows).toHaveLength(0);
  });

  it('lọc tài khoản / số bút toán lấy đủ cả chứng từ', async () => {
    // TK 1111 chỉ có ở bút toán thu tiền của phiếu bán: dòng phiếu vẫn gồm cả bút toán bán hàng.
    const full = (await list('all', '&docNo=HDV1')).rows[0];
    const byCash = (await list('all', '&account=1111&docNo=HDV1')).rows[0];
    expect(byCash.entryIds).toHaveLength(2);
    expect(byCash.totalDebit).toBe(full.totalDebit);
    const byEntryNo = (await list('all', `&docNo=${full.entryNos.split(', ')[1]}`)).rows[0];
    expect(byEntryNo.entryIds.sort()).toEqual([...full.entryIds].sort());
  });
});

describe('Ba chế độ kiểm tra', () => {
  it('ACC3B lệch thân / chi tiết: sổ cân thì trống', async () => {
    expect((await list('unbalanced')).rows).toEqual([]);
  });

  it('ACC3C lệch so với phiếu gốc: phiếu gốc có bản mới chưa định khoản lại', async () => {
    expect((await list('source-diff')).rows).toEqual([]);
    const v2 = saleDoc({ docKey: 'pos:CN01:HDV2', docNo: 'HDV2', version: 2 });
    (v2 as any).lines[0].amountBeforeTax = 277778; (v2 as any).lines[0].taxAmount = 22222;
    (v2 as any).totals = { beforeTax: 277778, tax: 22222, total: 300000 }; (v2 as any).payments = [{ methodCode: 'TM', amount: 300000 }];
    expect((await send(v2)).json().data.status).toBe('pending');
    const d = await list('source-diff');
    expect(d.rows.map((r: any) => [r.docNo, r.docTotal, r.diff])).toEqual([['HDV2', 300000, 100000]]);
  });

  it('ACC3A mất liên kết phiếu gốc: nguồn báo xoá phiếu đã định khoản', async () => {
    expect((await list('unlinked')).rows).toEqual([]);
    expect((await sourceCancel('pos:CN01:HDV3')).statusCode).toBe(200);
    const d = await list('unlinked');
    expect(d.rows.map((r: any) => [r.docNo, r.linkProblem])).toEqual([['HDV3', 'Nguồn báo xoá phiếu gốc (chờ huỷ)']]);
  });
});

describe('Xoá = bỏ định khoản', () => {
  it('bút toán đảo, chứng từ về Chờ định khoản, định khoản lại được', async () => {
    const row = (await list('all', '&docNo=HDV1')).rows[0];
    const res = await call(ctx, 'POST', '/api/v1/ledger/vouchers/unpost', { entryIds: row.entryIds, reason: 'Định khoản sai' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ done: 1, failed: 0, results: [{ docNo: 'HDV1', ok: true, reversed: 2 }] });
    expect((await list('all', '&docNo=HDV1')).rows).toEqual([]);
    const doc = (await call(ctx, 'GET', '/api/v1/documents?search=HDV1')).body.data[0];
    expect(doc.status).toBe('pending');
    const log = await call(ctx, 'GET', `/api/v1/documents/${doc.id}/posting-log`);
    expect(log.body.data.some((x: any) => x.action === 'unpost')).toBe(true);
    expect((await call(ctx, 'POST', '/api/v1/documents/post', { ids: [doc.id] })).status).toBe(200);
    expect((await list('all', '&docNo=HDV1')).rows).toHaveLength(1);
  });

  it('phiếu lập tay không bỏ định khoản ở đây; bắt buộc lý do', async () => {
    const manual = (await list('all', '&docType=manual')).rows[0];
    const res = await call(ctx, 'POST', '/api/v1/ledger/vouchers/unpost', { entryIds: manual.entryIds, reason: 'Thử' });
    expect(res.body.data).toMatchObject({ done: 0, failed: 1 });
    expect(res.body.data.results[0].message).toContain('phiếu lập tay');
    expect((await call(ctx, 'POST', '/api/v1/ledger/vouchers/unpost', { entryIds: manual.entryIds, reason: '' })).status).toBe(400);
  });

  it('khoá API của hệ thống bán hàng không bỏ định khoản được', async () => {
    const row = (await list('all', '&docNo=HDV1')).rows[0];
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/ledger/vouchers/unpost', payload: { entryIds: row.entryIds, reason: 'Thử' }, headers: { 'x-api-key': ctx.apiKey } });
    expect(res.statusCode).toBe(403);
  });
});
