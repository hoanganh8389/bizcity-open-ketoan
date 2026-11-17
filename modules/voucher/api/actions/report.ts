/**
 * GET /api/v1/m/voucher/report?from&to&issuer&campaignId&branches — báo cáo voucher: theo đợt (người phát) — phát hành / còn / đã dùng / hết hạn /
 * thu hồi, tiền đã trừ; theo cửa hàng dùng — số mã, tiền. Kỳ lọc mã theo ngày phát (phần theo đợt) và ngày dùng (phần theo cửa hàng).
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: action voucher (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { report } from '../store.js';
import { todayVn } from '../today.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export default defineAction({
  id: 'voucher.report.get', title: 'Báo cáo voucher theo đợt / người phát / cửa hàng', tags: ['Voucher'],
  permission: 'voucher:read', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({
    from: day.optional(), to: day.optional(), issuer: z.enum(['tgs', 'brand']).optional(), campaignId: z.string().trim().max(64).optional(),
    branches: z.string().trim().max(4000).optional(),
  }),
  output: z.object({ campaigns: z.array(z.record(z.unknown())), byBranch: z.array(z.record(z.unknown())) }),
  expose: { http: { method: 'GET', path: '/report' }, mcp: true, ai: 'read' },
  handler: async (ctx, i) => ctx.data.module((tx) => report(tx, {
    ...(i.from ? { from: i.from } : {}), ...(i.to ? { to: i.to } : {}), ...(i.issuer ? { issuer: i.issuer } : {}), ...(i.campaignId ? { campaignId: i.campaignId } : {}),
    branches: (i.branches ?? '').split(',').map((s) => s.trim()).filter(Boolean), today: todayVn(),
  })),
});
