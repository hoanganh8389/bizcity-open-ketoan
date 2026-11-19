/**
 * POST /api/v1/m/pos/return-approvals — máy bán gửi yêu cầu trả quá hạn (phiếu NT-BH-030 Q2): đủ dòng, SL, tình trạng, lý do. Chờ người có
 * quyền "Duyệt trả quá hạn" duyệt; duyệt xong máy lập phiếu trả kèm approvalId. Gửi lại cùng id cùng nội dung → yêu cầu cũ.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-030: action yêu cầu trả quá hạn (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { approvalRequestSchema, submitApproval } from '../return-approval.js';

export default defineAction({
  id: 'pos.return.approval.create', title: 'Gửi yêu cầu trả hàng quá hạn', tags: ['Máy bán POS'],
  permission: 'pos:return', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND'],
  input: approvalRequestSchema,
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/return-approvals', status: 201 }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'pos.return-approval', objectId: (input) => input.id },
  handler: async (ctx, input) => submitApproval(ctx, input),
});
