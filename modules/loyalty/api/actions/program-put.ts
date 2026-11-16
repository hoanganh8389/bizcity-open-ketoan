// [2026-11-15 03:45 PM Võ Hoàng] LOYALTY — NT-BH-020 bước 1: website đẩy chính sách tích điểm từng cửa hàng (đóng góp)
/**
 * POST /api/v1/m/loyalty/program — website (Cổng kế toán, khoá API) đẩy LoyaltyProgram của một cửa hàng khi lưu chính sách và
 * định kỳ. Lưu thành phiên bản mới; gửi lại cùng phiên bản → không đổi gì. Không nhận từ máy bán: quyền catalog:write (chính
 * sách là dữ liệu gốc của website), không cấp cho thu ngân. Đặt trạng thái theo phiên bản (idempotency natural): Cổng kế toán
 * gửi lại bao nhiêu lần cũng vậy, không cần Idempotency-Key.
 */
import { Errors, defineAction, z } from '@bizcity/module-sdk';
import type { LoyaltyProgram } from '../domain/engine.js';
import { branchExists, saveProgram } from '../store.js';

const program = z.object({
  version: z.string().trim().min(1).max(100),
  settings: z.object({
    enablePosEarn: z.boolean(), enablePosRedeem: z.boolean(), enableTierMultiplier: z.boolean(),
    minRedeemPoints: z.number().nonnegative(), pointLabel: z.string().max(50),
  }).passthrough(),
  tiers: z.array(z.object({ key: z.string().min(1).max(50), name: z.string().max(100), minPoints: z.number().nonnegative(), multiplier: z.number().positive() }).passthrough()).max(50),
  policies: z.array(z.object({ id: z.number().int(), code: z.string().max(100), type: z.number().int().min(1).max(6) }).passthrough()).max(500),
}).passthrough();

export default defineAction({
  id: 'loyalty.program.put', title: 'Nhận chính sách tích điểm của cửa hàng từ website', tags: ['Điểm thành viên'],
  permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
  errors: ['VALIDATION_ERROR'],
  input: z.object({ branchCode: z.string().trim().min(1).max(32), storeId: z.number().int().nonnegative().default(0), program }),
  output: z.object({ branchCode: z.string(), version: z.string(), changed: z.boolean() }),
  expose: { http: { method: 'POST', path: '/program' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'loyalty.program', objectId: (i) => i.branchCode },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    if (!(await branchExists(tx, i.branchCode))) throw Errors.validation(`Chưa có chi nhánh ${i.branchCode} ở danh mục chi nhánh`, { field: 'branchCode' });
    const changed = await saveProgram(tx, ctx.tenant.id, { branchCode: i.branchCode, version: i.program.version, storeId: i.storeId, program: i.program as unknown as LoyaltyProgram, by: ctx.actor.name });
    return { branchCode: i.branchCode, version: i.program.version, changed };
  }),
});
