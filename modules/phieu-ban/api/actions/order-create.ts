/**
 * POST /api/v1/m/phieu-ban/orders — lập đơn nháp (báo giá). Đơn livestream cùng SĐT + cùng mã trong 24 giờ: onDuplicate = ask (mặc
 * định — trả { created: false, duplicates }), keep (lập riêng), merge (gộp vào mergeInto hoặc đơn trùng mới nhất).
 */
// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: action đơn đặt hàng (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { orderInput } from '../domain/order.js';
import { createOrder } from '../order-service.js';

export default defineAction({
  id: 'phieu-ban.order.create', title: 'Lập đơn đặt hàng (nháp / báo giá)', tags: ['Đơn đặt hàng'],
  permission: 'phieu-ban:write', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'PERIOD_LOCKED'],
  input: orderInput.extend({ onDuplicate: z.enum(['ask', 'keep', 'merge']).default('ask'), mergeInto: z.string().trim().max(64).optional() }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/orders' }, mcp: false, ai: 'propose' },
  handler: async (ctx, { onDuplicate, mergeInto, ...input }) => createOrder(ctx, input, { onDuplicate, mergeInto }),
});
