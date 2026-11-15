// [2026-11-15 03:45 PM Võ Hoàng] LOYALTY — NT-BH-020 bước 1: máy bán đọc chính sách tích điểm (đóng góp)
/**
 * GET /api/v1/m/loyalty/program?branch= — chính sách mới nhất của cửa hàng (khuôn LoyaltyProgram của máy bán); cửa hàng chưa có → 404.
 * Không gửi branch → danh sách cửa hàng đã có chính sách (phiên bản, lúc nhận) để kế toán xem.
 */
import { Errors, defineAction, z } from '@bizcity/module-sdk';
import { latestProgram, programBranches } from '../store.js';

export default defineAction({
  id: 'loyalty.program.get', title: 'Chính sách tích điểm của cửa hàng', tags: ['Điểm thành viên'],
  permission: 'loyalty:read', effect: 'read', idempotency: 'none', errors: ['NOT_FOUND'],
  input: z.object({ branch: z.string().trim().max(32).optional() }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/program' }, mcp: false, ai: 'read' },
  handler: async (ctx, { branch }) => ctx.data.module(async (tx) => {
    if (!branch) return { branches: await programBranches(tx) };
    const p = await latestProgram(tx, branch);
    if (!p) throw Errors.notFound(`Cửa hàng ${branch} chưa có chính sách tích điểm (website chưa đẩy sang)`);
    return { ...p.program, version: p.version };
  }),
});
