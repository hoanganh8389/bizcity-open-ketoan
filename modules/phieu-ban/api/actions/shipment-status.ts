/**
 * POST /api/v1/m/phieu-ban/orders/:id/shipments/:shipmentId/status — đổi trạng thái chuyến giao (cập nhật tay, chưa nối API hãng):
 * Chờ lấy → Đang giao (chuyển kho KCB → KHG) → Đã giao (phiếu bán BH10 nháp xuất từ KHG + phí ship + COD) | Hoàn (KHG → KCB). Sai bước →
 * PHIEU_BAN_SHIPMENT_STATE; thiếu cấu hình → PHIEU_BAN_NO_SHIP_WAREHOUSE / PHIEU_BAN_NO_SHIP_FEE_ITEM / PHIEU_BAN_NO_COD_METHOD (NT-BH-032).
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-032: đổi trạng thái chuyến giao (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { SHIPMENT_STATUSES } from '../domain/order.js';
import { setShipmentStatus } from '../order-service.js';

export default defineAction({
  id: 'phieu-ban.shipment.status', title: 'Cập nhật trạng thái chuyến giao', tags: ['Đơn đặt hàng'],
  permission: 'phieu-ban:giao-hang-sua', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'PERIOD_LOCKED'],
  input: z.object({
    id: z.string().trim().min(1).max(64), shipmentId: z.string().trim().min(1).max(64),
    status: z.enum(SHIPMENT_STATUSES).refine((s) => s !== 'waiting', 'Chuyến mới lập đã ở Chờ lấy hàng'),
    note: z.string().trim().max(500).optional(), trackingNo: z.string().trim().max(64).optional(), carrier: z.string().trim().max(32).optional(),
    docDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined)),
  }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/orders/:id/shipments/:shipmentId/status' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'phieu-ban.order', objectId: (input) => input.id },
  handler: async (ctx, { id, shipmentId, ...i }) => setShipmentStatus(ctx, id, shipmentId, i),
});
