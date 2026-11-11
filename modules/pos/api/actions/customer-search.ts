/** GET /api/v1/m/pos/customers?q= — tìm khách (SĐT / tên không dấu / mã); q rỗng → khách mua gần nhất ở máy bán. Tối đa 20. */
import { defineAction, z } from '@bizcity/module-sdk';
import { searchCustomers } from '../customers.js';

export default defineAction({
  id: 'pos.customer.search', title: 'Tìm khách cho máy POS', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({ q: z.string().max(100).default(''), scope: z.enum(['branch', 'all']).optional() }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/customers' }, mcp: false, ai: 'read' },
  handler: async (ctx, { q }) => ctx.data.module(async (tx) => searchCustomers(tx, q)),
});
