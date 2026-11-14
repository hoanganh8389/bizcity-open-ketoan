/** DELETE /api/v1/m/phieu-ban/docs/:id — xoá phiếu nháp (phiếu đã duyệt không xoá được). */
// [2026-11-13 11:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-015: action phiếu bán / trả nhập tay (đóng góp)
import { Errors, defineAction, z } from '@bizcity/module-sdk';
import { deleteDoc, getDoc } from '../store.js';

export default defineAction({
  id: 'phieu-ban.doc.delete', title: 'Xoá phiếu bán / trả nhập tay (nháp)', tags: ['Phiếu bán nhập tay'],
  permission: 'phieu-ban:write', effect: 'write', sideEffects: ['documents'], idempotency: 'required', errors: ['CONFLICT', 'NOT_FOUND'],
  input: z.object({ id: z.string().trim().min(1).max(64) }),
  output: z.object({ deleted: z.boolean() }),
  expose: { http: { method: 'DELETE', path: '/docs/:id' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'phieu-ban.doc', objectId: (input) => input.id },
  handler: async (ctx, { id }) => ctx.data.module(async (tx) => {
    const r = await getDoc(tx, id, true);
    if (r.status !== 'draft') throw Errors.conflict('Phiếu đã duyệt không xoá được — bỏ duyệt trước');
    await deleteDoc(tx, id);
    return { deleted: true };
  }),
});
