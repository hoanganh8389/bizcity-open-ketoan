/**
 * POST /api/v1/m/phieu-ban/orders/import — nạp nhiều đơn livestream (màn dán bảng từ Excel → JSON). Mỗi đơn như lập tay; trùng (cùng SĐT
 * + cùng mã trong 24 giờ) theo onDuplicate: ask (báo, không lập), keep (lập riêng), merge (gộp vào đơn trùng mới nhất).
 */
// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: action đơn đặt hàng (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { orderInput } from '../domain/order.js';
import { importOrders } from '../order-service.js';

export default defineAction({
  id: 'phieu-ban.order.import', title: 'Nạp đơn đặt hàng livestream', tags: ['Đơn đặt hàng'],
  permission: 'phieu-ban:write', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'PERIOD_LOCKED'],
  input: z.object({ orders: z.array(orderInput).min(1).max(500), onDuplicate: z.enum(['ask', 'keep', 'merge']).default('ask') }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/orders/import' }, mcp: false, ai: 'deny' },
  handler: async (ctx, i) => importOrders(ctx, i.orders, { onDuplicate: i.onDuplicate }),
});
