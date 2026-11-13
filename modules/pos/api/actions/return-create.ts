/**
 * POST /api/v1/m/pos/returns — khách trả hàng (phiếu NT-BH-005): phiếu trả TH… → chứng từ sale_return nối đơn gốc
 * (originalDocKey), trả tiền khách bằng tiền mặt / chuyển khoản. Không đảo chứng từ bán gốc. Gửi lại cùng id → phiếu cũ.
 */
import { defineAction, z } from '@bizcity/module-sdk';
import { createReturn, returnDraftSchema } from '../return-service.js';

export default defineAction({
  id: 'pos.return.create', title: 'Nhận phiếu trả hàng từ máy POS', tags: ['Máy bán POS'],
  description: 'Phiếu trả hàng → chứng từ sale_return (bizcity_ledger_intake@1) nối đơn gốc, cùng giao dịch với phiếu.',
  permission: 'pos:return', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'required', dryRun: true,
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'PERIOD_LOCKED', 'POSTING_FAILED'],
  input: returnDraftSchema,
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/returns', status: 201 }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'pos.return', objectId: (input) => input.id },
  handler: async (ctx, draft) => (await createReturn(ctx, draft)).snapshot,
});
