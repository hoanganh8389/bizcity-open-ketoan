/**
 * POST /api/v1/m/phieu-ban/orders/copy — lập đơn đặt hàng nháp mới từ: đơn đặt hàng (`from: order`), phiếu bán BH10 đã duyệt (`sale`,
 * số phiếu + cửa hàng), đơn máy bán (`pos`, mã đơn — đọc qua action pos.order.lines). Copy hàng, số lượng, khách, thông tin giao; giá +
 * khuyến mại tính lại theo ngày lập mới; đơn mới ghi "Copy từ <số gốc>" (phiếu NT-BH-032 Q4). Nguồn không có / chưa duyệt → PHIEU_BAN_COPY_SOURCE.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-032: copy đơn (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { copyOrder } from '../order-service.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined));

export default defineAction({
  id: 'phieu-ban.order.copy', title: 'Copy đơn đặt hàng / hoá đơn bán lẻ thành đơn mới', tags: ['Đơn đặt hàng'],
  permission: 'phieu-ban:write', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'PERIOD_LOCKED'],
  input: z.object({
    from: z.enum(['order', 'sale', 'pos']), id: z.string().trim().max(64).optional(), no: z.string().trim().max(64).optional(),
    branchCode: z.string().trim().max(32).optional(), orderDate: day, validUntil: day,
  }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/orders/copy' }, mcp: false, ai: 'propose' },
  handler: async (ctx, i) => copyOrder(ctx, i),
});
