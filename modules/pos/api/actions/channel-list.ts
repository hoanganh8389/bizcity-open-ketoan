/**
 * GET /api/v1/m/pos/channels?active=1 — danh mục kênh bán hàng (phiếu NT-BH-031): mã, tên, loại online / offline, thứ tự, đang dùng.
 * Màn Kênh bán hàng đọc cả kênh đã ngừng (`used`: kênh đã có đơn máy bán — chỉ ngừng dùng, không xoá); module phieu-ban gọi
 * (ctx.actions.call) để ô Kênh của phiếu bán BH10 chọn từ danh mục. Lần đọc đầu của đơn vị nạp sẵn 14 nguồn bán của POS cũ.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-031: action đọc danh mục kênh bán hàng (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { listChannels, usedChannels } from '../channels.js';
import { DEFAULT_CHANNEL } from '../domain/channels.js';

const item = z.object({
  code: z.string(), name: z.string(), kind: z.enum(['online', 'offline']), sortOrder: z.number(), active: z.boolean(),
  used: z.boolean(), seeded: z.boolean(), updatedAt: z.string(), updatedByName: z.string(),
});

export default defineAction({
  id: 'pos.channel.list', title: 'Danh mục kênh bán hàng', tags: ['Kênh bán hàng'],
  permission: 'catalog:read', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({ active: z.enum(['0', '1']).optional() }),
  output: z.object({ defaultCode: z.string(), items: z.array(item) }),
  expose: { http: { method: 'GET', path: '/channels' }, mcp: true, ai: 'read' },
  handler: async (ctx, input) => ctx.data.module(async (tx) => {
    const list = await listChannels(tx, ctx.tenant.id, input.active === '1');
    const used = await usedChannels(tx);
    return { defaultCode: DEFAULT_CHANNEL, items: list.map((c) => ({ ...c, used: used.has(c.code) })) };
  }),
});
