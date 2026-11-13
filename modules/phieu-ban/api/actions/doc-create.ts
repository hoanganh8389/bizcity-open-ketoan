/** POST /api/v1/m/phieu-ban/docs — thêm phiếu nháp (docType sale / sale_return); số trống thì cấp theo cửa hàng. */
// [2026-11-13 11:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-015: action phiếu bán / trả nhập tay (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { KINDS, docInput } from '../domain/doc.js';
import { saveDraft } from '../service.js';

export default defineAction({
  id: 'phieu-ban.doc.create', title: 'Thêm phiếu bán / trả nhập tay (nháp)', tags: ['Phiếu bán nhập tay'],
  permission: 'phieu-ban:write', effect: 'write', sideEffects: ['documents'], idempotency: 'required', errors: ['VALIDATION_ERROR', 'CONFLICT'],
  input: docInput.extend({ docType: z.enum(KINDS) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/docs' }, mcp: false, ai: 'propose' },
  handler: async (ctx, input) => saveDraft(ctx, input.docType, input),
});
