/**
 * Bút toán mẫu và bút toán lặp (kế hoạch Đợt 2, hạng mục 2.1, 2.2).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { periodsOf } from '../src/modules/voucher-templates/voucher-template.routes.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;

beforeAll(async () => {
  ctx = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
});

const rent = {
  name: 'Chi tiền thuê nhà HN01', docType: 'payment', branchCode: 'CN01', description: 'Chi tiền thuê nhà tháng {ky}',
  lines: [{ debitAccount: '64211', creditAccount: '1111', amount: 20000000, description: 'Thuê nhà {thang}/{nam}' }],
};

describe('Lịch lặp', () => {
  it('tháng ngắn lấy ngày cuối tháng; quý nhảy 3 tháng; dừng ở tháng kết thúc', () => {
    expect(periodsOf({ frequency: 'monthly', day_of_month: 31, start_month: '2026-01', end_month: '2026-04' }, '2030-01-01').map((p) => p.docDate))
      .toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(periodsOf({ frequency: 'quarterly', day_of_month: 5, start_month: '2026-01', end_month: null }, '2026-12-31').map((p) => p.period))
      .toEqual(['2026-01', '2026-04', '2026-07', '2026-10']);
    expect(periodsOf({ frequency: 'yearly', day_of_month: 15, start_month: '2025-12', end_month: null }, '2026-12-14').map((p) => p.docDate)).toEqual(['2025-12-15']);
  });
});

describe('Bút toán mẫu', () => {
  it('lưu mẫu; tài khoản sai bị từ chối; không đổi loại phiếu', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/voucher-templates/THUE-NHA', rent)).status).toBe(200);
    const bad = await call(ctx, 'PUT', '/api/v1/voucher-templates/SAI', { ...rent, lines: [{ debitAccount: '642', creditAccount: '9999', amount: 0 }] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toContain('9999');
    expect((await call(ctx, 'PUT', '/api/v1/voucher-templates/THUE-NHA', { ...rent, docType: 'manual' })).status).toBe(400);
    expect((await call(ctx, 'PUT', '/api/v1/voucher-templates/PB-CCDC', { name: 'Phân bổ CCDC', docType: 'manual', description: 'Phân bổ tháng {ky}', lines: [{ debitAccount: '64211', creditAccount: '242', amount: 0 }] })).status).not.toBe(200);
    const list = await call(ctx, 'GET', '/api/v1/voucher-templates');
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ code: 'THUE-NHA', docType: 'payment', lineCount: 1, total: 20000000 });
  });
});

describe('Bút toán lặp', () => {
  let rid = '';
  it('thêm lịch, liệt kê kỳ đến hạn, sinh phiếu, không sinh trùng', async () => {
    const c = await call(ctx, 'POST', '/api/v1/voucher-recurrences', { templateCode: 'THUE-NHA', frequency: 'monthly', dayOfMonth: 5, startMonth: '2026-08' });
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    rid = c.body.data.id;
    const due = await call(ctx, 'GET', '/api/v1/voucher-recurrences/due?to=2026-10-31');
    expect(due.body.data.map((d: { period: string; description: string }) => [d.period, d.description])).toEqual([
      ['2026-08', 'Chi tiền thuê nhà tháng 08/2026'], ['2026-09', 'Chi tiền thuê nhà tháng 09/2026'], ['2026-10', 'Chi tiền thuê nhà tháng 10/2026'],
    ]);

    // Kỳ sau tháng hiện tại bị chặn (ngày chứng từ sau cuối tháng hiện tại) — lấy kỳ cách hôm nay 2 tháng để test không phụ thuộc ngày chạy.
    const ahead = new Date(); ahead.setUTCDate(1); ahead.setUTCMonth(ahead.getUTCMonth() + 2);
    const gen = await call(ctx, 'POST', '/api/v1/voucher-recurrences/generate', { items: [{ recurrenceId: rid, period: '2026-08' }, { recurrenceId: rid, period: '2026-09' }, { recurrenceId: rid, period: '2026-08' }, { recurrenceId: rid, period: ahead.toISOString().slice(0, 7) }] });
    expect(gen.status).toBe(200);
    expect(gen.body.data.map((x: { ok: boolean }) => x.ok)).toEqual([true, true, false, false]);
    expect(gen.body.data[2].error).toContain('đã sinh phiếu');

    const doc = await call(ctx, 'GET', `/api/v1/documents/${gen.body.data[0].documentId}`);
    expect(doc.body.data).toMatchObject({ docType: 'payment', docDate: '2026-08-05', status: 'posted' });
    expect(doc.body.data.payload.lines[0].description).toBe('Thuê nhà 08/2026');

    const after = await call(ctx, 'GET', '/api/v1/voucher-recurrences/due?to=2026-10-31');
    expect(after.body.data.map((d: { period: string }) => d.period)).toEqual(['2026-10']);
    const recs = await call(ctx, 'GET', '/api/v1/voucher-recurrences');
    expect(recs.body.data[0]).toMatchObject({ runs: 2, lastPeriod: '2026-09', frequencyLabel: 'Hằng tháng' });
  });

  it('không sửa lịch làm mất kỳ đã sinh; không xoá lịch đã sinh phiếu', async () => {
    const lost = await call(ctx, 'PUT', `/api/v1/voucher-recurrences/${rid}`, { templateCode: 'THUE-NHA', frequency: 'monthly', dayOfMonth: 5, startMonth: '2026-09' });
    expect(lost.status).toBe(400);
    expect((await call(ctx, 'PUT', `/api/v1/voucher-recurrences/${rid}`, { templateCode: 'THUE-NHA', frequency: 'monthly', dayOfMonth: 10, startMonth: '2026-08', endMonth: '2026-12' })).status).toBe(200);
    expect((await call(ctx, 'DELETE', `/api/v1/voucher-recurrences/${rid}`)).status).toBe(409);
  });

  it('mẫu có dòng chưa nhập số tiền: báo ở danh sách đến hạn, sinh phiếu báo lỗi rõ', async () => {
    await call(ctx, 'PUT', '/api/v1/voucher-templates/DIEN', { ...rent, name: 'Tiền điện', description: 'Tiền điện {ky}', lines: [{ debitAccount: '64211', creditAccount: '1111', amount: 0 }] });
    const c = await call(ctx, 'POST', '/api/v1/voucher-recurrences', { templateCode: 'DIEN', frequency: 'monthly', dayOfMonth: 25, startMonth: '2026-10' });
    const due = await call(ctx, 'GET', '/api/v1/voucher-recurrences/due?to=2026-10-31');
    expect(due.body.data.find((d: { templateCode: string }) => d.templateCode === 'DIEN').problem).toBe('Mẫu có dòng chưa nhập số tiền');
    const gen = await call(ctx, 'POST', '/api/v1/voucher-recurrences/generate', { items: [{ recurrenceId: c.body.data.id, period: '2026-10' }] });
    expect(gen.body.data[0]).toMatchObject({ ok: false });
    expect(gen.body.data[0].error).toContain('chưa đủ để sinh phiếu');
    expect((await call(ctx, 'DELETE', `/api/v1/voucher-recurrences/${c.body.data.id}`)).status).toBe(200);
  });
});
