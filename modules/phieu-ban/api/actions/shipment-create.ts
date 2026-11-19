/**
 * POST /api/v1/m/phieu-ban/orders/:id/shipments — lập chuyến giao (Chờ lấy hàng) cho đơn đã gửi: mỗi dòng ≤ số còn lại (vượt →
 * PHIEU_BAN_OVER_REMAINING); hãng / mã vận đơn / phí ship / COD mặc định theo thông tin giao của đơn. Cửa hàng chưa khai kho KHG →
 * PHIEU_BAN_NO_SHIP_WAREHOUSE (phiếu NT-BH-032).
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-032: lập chuyến giao (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { createShipment } from '../order-service.js';

export default defineAction({
  id: 'phieu-ban.shipment.create', title: 'Lập chuyến giao cho đơn đặt hàng', tags: ['Đơn đặt hàng'],
  permission: 'phieu-ban:giao-hang-lap', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND'],
  input: z.object({
    id: z.string().trim().min(1).max(64),
    lines: z.array(z.object({ lineKey: z.string().trim().min(1).max(64), qty: z.number().finite().min(0) })).min(1).max(500),
    carrier: z.string().trim().max(32).optional(), trackingNo: z.string().trim().max(64).optional(),
    fee: z.number().finite().min(0).max(1e12).optional(), cod: z.number().finite().min(0).max(1e12).optional(), note: z.string().trim().max(500).optional(),
  }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/orders/:id/shipments' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'phieu-ban.order', objectId: (input) => input.id },
  handler: async (ctx, { id, ...i }) => createShipment(ctx, id, i),
});
