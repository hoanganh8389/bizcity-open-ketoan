/** GET /api/v1/m/pos/admin/settings — BH17 Cài đặt bán hàng: giá trị hiện áp của các khoá bizcity.pos.* (chưa đặt = mặc định). Ghi: PUT /api/v1/settings/values/:key của Core (NT-BH-008 §7). */
import { defineAction, z } from '@bizcity/module-sdk';
import { POS_SETTING_KEYS, posSettings } from '../settings.js';

export default defineAction({
  id: 'pos.admin.settings', title: 'Cài đặt bán hàng của máy POS', tags: ['Quản trị bán lẻ'],
  permission: 'pos:report', effect: 'read', idempotency: 'none',
  errors: [],
  input: z.object({}),
  output: z.object({ values: z.record(z.unknown()), keys: z.record(z.string()) }),
  expose: { http: { method: 'GET', path: '/admin/settings' }, mcp: false, ai: 'read' },
  handler: async (ctx) => ({ values: await posSettings(ctx), keys: { ...POS_SETTING_KEYS } }),
});
