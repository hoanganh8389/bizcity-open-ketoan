/** PUT /api/v1/m/phieu-ban/docs/:id — sửa phiếu nháp. Phiếu đã duyệt → 409 (bỏ duyệt rồi sửa). */
// [2026-11-13 11:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-015: action phiếu bán / trả nhập tay (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { KINDS, docInput } from '../domain/doc.js';
import { saveDraft } from '../service.js';

export default defineAction({
  id: 'phieu-ban.doc.update', title: 'Sửa phiếu bán / trả nhập tay (nháp)', tags: ['Phiếu bán nhập tay'],
  permission: 'phieu-ban:write', effect: 'write', sideEffects: ['documents'], idempotency: 'required', errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND'],
  input: docInput.extend({ id: z.string().trim().min(1).max(64), docType: z.enum(KINDS) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'PUT', path: '/docs/:id' }, mcp: false, ai: 'propose' },
  evidence: { objectType: 'phieu-ban.doc', objectId: (input) => input.id },
  handler: async (ctx, input) => saveDraft(ctx, input.docType, input, input.id),
});
