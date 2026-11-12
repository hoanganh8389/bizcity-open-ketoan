/** GET /api/v1/m/pos/admin/dashboard?from&to&branches — BH16 Tổng quan bán lẻ: như tổng quan máy bán nhưng nhiều chi nhánh, thêm byBranch (NT-BH-008). */
import { defineAction, z } from '@bizcity/module-sdk';
import { adminDashboard, branchList } from '../admin.js';
import { todayVn } from '../read.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const range = { from: day.optional(), to: day.optional(), branches: z.string().max(4000).optional() };
const page = { page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(100) };

const SALE_SOURCES: Record<string, string> = { tai_quay: 'Tại quầy' };

export default defineAction({
  id: 'pos.admin.dashboard', title: 'Tổng quan bán lẻ máy POS (nhiều chi nhánh)', tags: ['Quản trị bán lẻ'],
  permission: 'pos:report', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object(range),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/admin/dashboard' }, mcp: false, ai: 'read' },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    const from = i.from ?? todayVn();
    return adminDashboard(tx, { from, to: i.to ?? from, branches: branchList(i.branches) }, SALE_SOURCES);
  }),
});
