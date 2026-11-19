/** POST /api/v1/m/pos/return-approvals/:id/reject — từ chối yêu cầu trả quá hạn kèm lý do (máy bán hiện lý do); người gửi không tự từ chối. */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-030: action yêu cầu trả quá hạn (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { decideApproval } from '../return-approval.js';

export default defineAction({
  id: 'pos.return.approval.reject', title: 'Từ chối yêu cầu trả hàng quá hạn', tags: ['Quản trị bán lẻ'],
  permission: 'pos:return-approve', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'FORBIDDEN'],
  input: z.object({ id: z.string().trim().min(1).max(64), reason: z.string().trim().min(1, 'Ghi lý do từ chối').max(500) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/return-approvals/:id/reject' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'pos.return-approval', objectId: (input) => input.id },
  handler: async (ctx, { id, reason }) => decideApproval(ctx, id, 'reject', reason),
});
