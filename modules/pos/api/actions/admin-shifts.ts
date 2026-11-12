/** GET /api/v1/m/pos/admin/shifts?from&to&branches&diffOnly — BH15 Sổ ca bán: ca mở trong khoảng ngày của nhiều chi nhánh; đã chốt = biên bản lúc chốt, đang mở = số liệu tới lúc này; alert theo ngưỡng Cài đặt bán hàng (NT-BH-008). */
import { defineAction, z } from '@bizcity/module-sdk';
import { adminShifts, branchList } from '../admin.js';
import { todayVn } from '../read.js';
import { posSettings } from '../settings.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const range = { from: day.optional(), to: day.optional(), branches: z.string().max(4000).optional() };
const page = { page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(100) };

export default defineAction({
  id: 'pos.admin.shifts', title: 'Sổ ca bán máy POS (quản trị, nhiều chi nhánh)', tags: ['Quản trị bán lẻ'],
  permission: 'pos:report', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({ ...range, diffOnly: z.enum(['true', 'false']).optional() }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/admin/shifts' }, mcp: false, ai: 'read' },
  handler: async (ctx, i) => {
    const { cashDiffAlert } = await posSettings(ctx);
    return ctx.data.module(async (tx) => {
      const from = i.from ?? todayVn();
      return adminShifts(tx, { from, to: i.to ?? from, branches: branchList(i.branches), diffOnly: i.diffOnly === 'true', alert: cashDiffAlert });
    });
  },
});
