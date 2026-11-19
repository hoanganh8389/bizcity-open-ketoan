/** GET /api/v1/m/pos/return-approvals/:id — trạng thái một yêu cầu trả quá hạn (chờ / đã duyệt / bị từ chối kèm lý do / đã dùng) + nhật ký. */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-030: action yêu cầu trả quá hạn (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { getApproval } from '../return-approval.js';

export default defineAction({
  id: 'pos.return.approval.get', title: 'Một yêu cầu trả hàng quá hạn', tags: ['Máy bán POS'],
  permission: 'pos:return', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR', 'NOT_FOUND'],
  input: z.object({ id: z.string().trim().min(1).max(64) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/return-approvals/:id' }, mcp: false, ai: 'read' },
  handler: async (ctx, { id }) => ctx.data.module((tx) => getApproval(tx, id)),
});
