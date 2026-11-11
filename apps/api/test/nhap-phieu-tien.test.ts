// [2026-11-11 Nguyễn Văn Thủy] NHẬP EXCEL PHIẾU THU / CHI (POST /api/v1/vouchers/import): lưu nháp chờ duyệt, chạy thử không để lại gì (đóng góp)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const thu = (over: Record<string, unknown> = {}) => ({ docType: 'receipt', branchCode: 'CN01', docDate: '2026-10-20', description: 'Thu nhập Excel', lines: [{ debitAccount: '1111', creditAccount: '5158', amount: 30000 }], ...over });
const imp = async (body: Record<string, unknown>) => { const r = await call(ctx, 'POST', '/api/v1/vouchers/import', body); expect(r.status, JSON.stringify(r.body)).toBe(200); return r.body.data as { saved: number; failed: number; vouchers: { rows: number[]; ok: boolean; docNo?: string; error?: string }[] }; };
const dem = async () => ((await call(ctx, 'GET', '/api/v1/documents?docType=receipt&pageSize=500')).body.data as unknown[]).length;

beforeAll(async () => { ctx = await setupTenant(); });
afterAll(async () => { await ctx.app.close(); });

describe('Nhập Excel phiếu thu / chi', () => {
  it('chạy thử: báo đúng phiếu sai, không lưu phiếu nào', async () => {
    const truoc = await dem();
    const o = await imp({ dryRun: true, vouchers: [
      { rows: [2, 3], voucher: thu({ lines: [{ debitAccount: '1111', creditAccount: '5158', amount: 30000 }, { debitAccount: '1111', creditAccount: '5158', amount: 20000 }] }) },
      { rows: [4], voucher: thu({ lines: [{ debitAccount: '9999', creditAccount: '5158', amount: 1000 }] }) },
      { rows: [5], voucher: thu({ description: '' }) },
      // Tài khoản theo dõi đối tượng mà thiếu đối tượng: lưu nháp thì qua, ghi sổ mới chặn — bước kiểm phải bắt được.
      { rows: [6], voucher: thu({ lines: [{ debitAccount: '1111', creditAccount: '131', amount: 1000 }] }) },
    ] });
    expect(o.vouchers.map((v) => v.ok)).toEqual([true, false, false, false]);
    expect(o.vouchers[1]!.error).toContain('tài khoản Nợ phải là tiền mặt');
    expect(await dem()).toBe(truoc);
  });

  it('ghi: phiếu đúng thành nháp chờ duyệt (chưa có bút toán), duyệt thì ghi sổ', async () => {
    const o = await imp({ dryRun: false, vouchers: [{ rows: [2], voucher: thu({ docNo: 'PTX001' }) }, { rows: [3], voucher: thu({ lines: [] }) }] });
    expect([o.saved, o.failed]).toEqual([1, 1]);
    expect(o.vouchers[0]!.docNo).toBe('PTX001');
    const ds = (await call(ctx, 'GET', '/api/v1/documents?docType=receipt&status=pending&pageSize=50')).body.data as { id: string; docNo: string; status: string }[];
    const p = ds.find((d) => d.docNo === 'PTX001')!;
    expect(p.status).toBe('pending');
    const ok = await call(ctx, 'POST', `/api/v1/vouchers/${p.id}/approve`, {});
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.data.approved).toBe(true);
    expect(ok.body.data.entryIds.length).toBeGreaterThan(0);
  });
});
