/** DELETE /api/v1/m/phieu-ban/docs/:id — xoá phiếu nháp (phiếu đã duyệt không xoá được). Phiếu sinh từ đơn đặt hàng → trả lại số đã giao của đơn. */
// [2026-11-13 11:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-015: action phiếu bán / trả nhập tay (đóng góp)
// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: phiếu nháp sinh từ đơn đặt hàng — sửa / xoá báo lại đơn (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { deleteSaleDraft } from '../order-service.js';

export default defineAction({
  id: 'phieu-ban.doc.delete', title: 'Xoá phiếu bán / trả nhập tay (nháp)', tags: ['Phiếu bán nhập tay'],
  permission: 'phieu-ban:write', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'required', errors: ['CONFLICT', 'NOT_FOUND', 'PERIOD_LOCKED'],
  input: z.object({ id: z.string().trim().min(1).max(64) }),
  output: z.object({ deleted: z.boolean() }),
  expose: { http: { method: 'DELETE', path: '/docs/:id' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'phieu-ban.doc', objectId: (input) => input.id },
  handler: async (ctx, { id }) => deleteSaleDraft(ctx, id),
});
