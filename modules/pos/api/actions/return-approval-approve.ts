/** POST /api/v1/m/pos/return-approvals/:id/approve — duyệt yêu cầu trả quá hạn (quyền pos:return-approve; người gửi không tự duyệt). */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-030: action yêu cầu trả quá hạn (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { decideApproval } from '../return-approval.js';

export default defineAction({
  id: 'pos.return.approval.approve', title: 'Duyệt yêu cầu trả hàng quá hạn', tags: ['Quản trị bán lẻ'],
  permission: 'pos:return-approve', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'FORBIDDEN'],
  input: z.object({ id: z.string().trim().min(1).max(64), note: z.string().trim().max(500).optional() }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/return-approvals/:id/approve' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'pos.return-approval', objectId: (input) => input.id },
  handler: async (ctx, { id, note }) => decideApproval(ctx, id, 'approve', note),
});
