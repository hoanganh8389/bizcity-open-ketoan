/**
 * GET /api/v1/m/pos/admin/return-approvals?status&from&to&branches&page&pageSize — BH14 thẻ "Yêu cầu trả quá hạn" (NT-BH-030 Q2): yêu cầu
 * của máy bán, chờ duyệt lên đầu; meta: page, pageSize, total. Ngày lọc theo lúc gửi (giờ Việt Nam).
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-030: màn duyệt trả quá hạn (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { branchList } from '../admin.js';
import { approvalLogs, listApprovals } from '../return-approval.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export default defineAction({
  id: 'pos.admin.return-approvals', title: 'Yêu cầu trả hàng quá hạn (quản trị)', tags: ['Quản trị bán lẻ'],
  permission: 'pos:report', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({
    status: z.enum(['pending', 'approved', 'rejected', 'used']).optional(), from: day.optional(), to: day.optional(), branches: z.string().max(4000).optional(),
    page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(100),
  }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/admin/return-approvals' }, mcp: false, ai: 'read' },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    const r = await listApprovals(tx, { ...i, branches: branchList(i.branches) });
    const logs = await approvalLogs(tx, r.items.map((x) => x.id));
    ctx.meta('page', i.page);
    ctx.meta('pageSize', i.pageSize);
    ctx.meta('total', r.total);
    return r.items.map((x) => ({ ...x, log: logs.get(x.id) ?? [] }));
  }),
});
