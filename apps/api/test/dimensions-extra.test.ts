/**
 * Chiều phân tích Vụ việc, Dự án, Nguồn vốn (kế hoạch Đợt 1, hạng mục 1.2):
 * danh mục, cờ theo dõi trên tài khoản (bắt buộc chọn trên dòng phiếu), ghi vào dòng sổ, gom ở báo cáo chi phí.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const OCT = 'from=2026-10-01&to=2026-10-31';
const payment = (lines: Record<string, unknown>[]) => ({ docType: 'payment', branchCode: 'CN01', docDate: '2026-10-12', description: 'Chi khai trương', lines });

beforeAll(async () => {
  ctx = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Vụ việc, dự án, nguồn vốn', () => {
  it('khai danh mục ba loại mới', async () => {
    for (const [kind, code, name] of [['case', 'KT-HN01', 'Khai trương shop HN01'], ['project', 'DA-KHO', 'Dự án kho tổng'], ['capital_source', 'VCSH', 'Vốn chủ sở hữu']]) {
      const r = await call(ctx, 'PUT', `/api/v1/dimensions/${kind}/${code}`, { name });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
    }
    expect((await call(ctx, 'GET', '/api/v1/dimensions/case')).body.data.map((d: { code: string }) => d.code)).toEqual(['KT-HN01']);
  });

  it('tài khoản bật theo dõi vụ việc thì dòng phiếu bắt buộc chọn vụ việc', async () => {
    const acc = await call(ctx, 'PATCH', '/api/v1/accounts/64288', { trackCase: true });
    expect(acc.status, JSON.stringify(acc.body)).toBe(200);
    expect(acc.body.data).toMatchObject({ trackCase: true, trackProject: false });
    const missing = await call(ctx, 'POST', '/api/v1/vouchers', payment([{ debitAccount: '64288', creditAccount: '1111', amount: 1000 }]));
    expect(missing.status).toBe(400);
    expect(missing.body.error.details.join(' ')).toMatch(/bắt buộc phải chọn vụ việc/);
    const unknown = await call(ctx, 'POST', '/api/v1/vouchers', payment([{ debitAccount: '64288', creditAccount: '1111', amount: 1000, case: 'KHONG-CO' }]));
    expect(unknown.status).toBe(400);
  });

  it('ghi vào dòng sổ và gom được ở báo cáo chi phí', async () => {
    const r = await call(ctx, 'POST', '/api/v1/vouchers', payment([
      { debitAccount: '64288', creditAccount: '1111', amount: 3000000, case: 'KT-HN01', project: 'DA-KHO', capitalSource: 'VCSH' },
      { debitAccount: '64288', creditAccount: '1111', amount: 500000, case: 'KT-HN01' },
    ]));
    expect(r.status, JSON.stringify(r.body)).toBe(201);

    const byCase = await call(ctx, 'GET', `/api/v1/reports/expense-by-dimension?${OCT}&account=642&groupBy=case`);
    expect(byCase.body.data.rows).toEqual([expect.objectContaining({ case: 'KT-HN01', caseName: 'Khai trương shop HN01', amount: 3500000 })]);
    const byProject = await call(ctx, 'GET', `/api/v1/reports/expense-by-dimension?${OCT}&account=642&groupBy=project,capitalSource`);
    expect(byProject.body.data.rows).toEqual([
      expect.objectContaining({ project: '', capitalSource: '', amount: 500000 }),
      expect.objectContaining({ project: 'DA-KHO', projectName: 'Dự án kho tổng', capitalSource: 'VCSH', capitalSourceName: 'Vốn chủ sở hữu', amount: 3000000 }),
    ]);

    const ledger = await call(ctx, 'GET', `/api/v1/reports/account-ledger?account=64288&${OCT}`);
    expect(ledger.body.data.rows.filter((x: { debit: number }) => x.debit > 0).map((x: { case: string; project: string }) => [x.case, x.project])).toEqual([['KT-HN01', 'DA-KHO'], ['KT-HN01', '']]);
  });

  it('xoá mã: chặn mã đã ghi sổ hoặc có mã con, xoá được mã chưa dùng; hợp đồng ghi người tạo', async () => {
    const used = await call(ctx, 'DELETE', '/api/v1/dimensions/case/KT-HN01');
    expect(used.status).toBe(409);
    expect(used.body.error.message).toMatch(/đang được dùng/);
    await call(ctx, 'PUT', '/api/v1/dimensions/project/DA-CON', { name: 'Hạng mục con', parentCode: 'DA-KHO' });
    expect((await call(ctx, 'DELETE', '/api/v1/dimensions/project/DA-CON')).status).toBe(200);
    expect((await call(ctx, 'GET', '/api/v1/dimensions/project')).body.data.map((d: { code: string }) => d.code)).toEqual(['DA-KHO']);
    expect((await call(ctx, 'DELETE', '/api/v1/dimensions/project/KHONG-CO')).status).toBe(404);
    await call(ctx, 'PUT', '/api/v1/dimensions/contract/HD-THU', { name: 'Thuê kho', extra: { type: 'rent' } });
    await call(ctx, 'PUT', '/api/v1/dimensions/contract/HD-THU', { name: 'Thuê kho sửa', extra: { type: 'rent', createdBy: 'gia mao', partnerName: 'x' } });
    const c = (await call(ctx, 'GET', '/api/v1/dimensions/contract')).body.data.find((d: { code: string }) => d.code === 'HD-THU');
    expect(c.extra.createdBy).toBeTruthy();
    expect(c.extra.createdBy).not.toBe('gia mao');
  });
});
