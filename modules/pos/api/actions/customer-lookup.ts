/** GET /api/v1/m/pos/customers/lookup?phone= — khách theo đúng SĐT (mã khách = SĐT, hoặc SĐT trên danh mục); không có → 404. */
import { Errors, defineAction, z } from '@bizcity/module-sdk';
import { customerByPhone } from '../customers.js';

export default defineAction({
  id: 'pos.customer.lookup', title: 'Tra khách theo SĐT cho máy POS', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR', 'NOT_FOUND'],
  // Không có SĐT thì trả null (hợp đồng module C-4); có SĐT mà không thấy khách → 404.
  input: z.object({ phone: z.string().trim().max(20).default('') }),
  output: z.record(z.unknown()).nullable(),
  expose: { http: { method: 'GET', path: '/customers/lookup' }, mcp: false, ai: 'read' },
  handler: async (ctx, { phone }) => (!phone ? null : ctx.data.module(async (tx) => {
    const c = await customerByPhone(tx, phone);
    if (!c) throw Errors.notFound(`khách có SĐT ${phone}`);
    return c;
  })),
});
