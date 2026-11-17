/**
 * GET /api/v1/m/phieu-ban/order-settings — kho KCB giữ hàng của từng cửa hàng (khoá bizcity.phieu_ban.hold_warehouses). Ghi qua đường
 * cấu hình chung (PUT /api/v1/settings/values/:key, quyền settings:write) ở thẻ Cài đặt của màn Đơn đặt hàng.
 */
// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: action đơn đặt hàng (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { holdSettings } from '../order-service.js';

export default defineAction({
  id: 'phieu-ban.order.settings', title: 'Kho giữ hàng của đơn đặt hàng theo cửa hàng', tags: ['Đơn đặt hàng'],
  permission: 'phieu-ban:read', effect: 'read', idempotency: 'none',
  input: z.object({}),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/order-settings' }, mcp: false, ai: 'read' },
  handler: async (ctx) => holdSettings(ctx),
});
