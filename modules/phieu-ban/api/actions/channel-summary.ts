/**
 * GET /api/v1/m/phieu-ban/reports/channels?from&to&branchCodes — số liệu phiếu bán / trả ĐÃ DUYỆT theo kênh × cửa hàng (phiếu NT-BH-031).
 * Module pos gọi (ctx.actions.call) để báo cáo "Bán hàng theo kênh" gộp đơn máy bán + phiếu BH10 mà không đọc bảng của module này.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-031: action đọc số liệu phiếu theo kênh cho báo cáo bán theo kênh (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { channelFacts } from '../store.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const fact = z.object({ channel: z.string(), branchCode: z.string(), orders: z.number(), revenue: z.number(), discount: z.number(), returns: z.number() });

export default defineAction({
  id: 'phieu-ban.channel.summary', title: 'Phiếu bán / trả theo kênh bán', tags: ['Phiếu bán nhập tay'],
  permission: 'phieu-ban:read', effect: 'read', idempotency: 'none', errors: ['VALIDATION_ERROR'],
  input: z.object({ from: day.optional(), to: day.optional(), branchCodes: z.string().trim().max(4000).optional() }),
  output: z.object({ facts: z.array(fact) }),
  expose: { http: { method: 'GET', path: '/reports/channels' }, mcp: false, ai: 'read' },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    let branches = (i.branchCodes ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const scope = ctx.branchScope;
    if (scope) branches = branches.length ? branches.filter((b) => scope.includes(b)) : [...scope];
    if (scope && !branches.length) return { facts: [] };
    // Không gửi ngày = hôm nay (giờ Việt Nam).
    const from = i.from ?? new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    return { facts: await channelFacts(tx, { from, to: i.to ?? from, branches }) };
  }),
});
