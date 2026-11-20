/**
 * GET /api/v1/m/voucher/reports/usage?from&to&branchCodes — mã voucher đã dùng trong kỳ (theo ngày dùng): đơn / phiếu dùng, cửa hàng, tiền
 * thực trừ (phiếu NT-BH-034). Module pos gọi (ctx.actions.call) để báo cáo khách hàng có cột voucher mà không đọc bảng của module này.
 */
// [2026-11-19 Võ Hoàng] NGHIEM-THU — NT-BH-034: action đọc voucher đã dùng cho báo cáo khách hàng (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { usedCodes } from '../store.js';
import { todayVn } from '../today.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export default defineAction({
  id: 'voucher.usage.list', title: 'Voucher đã dùng theo đơn / phiếu', tags: ['Voucher'],
  permission: 'voucher:read', effect: 'read', idempotency: 'none', errors: ['VALIDATION_ERROR'],
  input: z.object({ from: day.optional(), to: day.optional(), branchCodes: z.string().trim().max(4000).optional() }),
  output: z.object({ uses: z.array(z.record(z.unknown())) }),
  expose: { http: { method: 'GET', path: '/reports/usage' }, mcp: false, ai: 'read' },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    let branches = (i.branchCodes ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const scope = ctx.branchScope;
    if (scope) branches = branches.length ? branches.filter((b) => scope.includes(b)) : [...scope];
    if (scope && !branches.length) return { uses: [] };
    const from = i.from ?? todayVn();
    return { uses: await usedCodes(tx, { from, to: i.to ?? from, branches }) };
  }),
});
