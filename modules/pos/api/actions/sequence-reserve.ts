/** POST /api/v1/m/pos/sequences/reserve — cấp trước một dải số phiếu cho máy (dùng khi mất mạng; nhảy số chấp nhận, Q20). */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027: dải theo dạng của cửa hàng (shop / HD), ghi lại dải đã cấp cho báo cáo số thiếu (đóng góp)
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027 (18/11 anh chốt): dạng shop mặc định, nâng bộ đếm theo số cuối website báo (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { SHOP_LAST_MAX, schemeOf } from '../domain/codes.js';
import { issueCodes, raiseShopCounters, recordReservation } from '../codes.js';
import { resolveBranch, todayVn } from '../read.js';

export default defineAction({
  id: 'pos.sequence.reserve', title: 'Cấp trước số phiếu cho máy bán', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR'],
  input: z.object({
    kind: z.enum(['sale', 'return']),
    count: z.number().int().min(1).max(100),
    branchCode: z.string().trim().max(32).optional(),
    businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    /** Mã máy bán (báo cáo "Số bill bị thiếu" nêu máy nào xin mà chưa dùng). */
    deviceId: z.string().trim().max(64).optional(),
    /** NT-BH-027: số cuối bộ đếm "bt" của shop ở website (bán / hoàn) — nâng bộ đếm lên ≥ số này trước khi cấp dải, không bao giờ hạ. */
    lastSale: z.number().int().min(1).max(SHOP_LAST_MAX).optional(),
    lastReturn: z.number().int().min(1).max(SHOP_LAST_MAX).optional(),
  }),
  output: z.object({ kind: z.enum(['sale', 'return']), codes: z.array(z.string()), expiresAt: z.string() }),
  expose: { http: { method: 'POST', path: '/sequences/reserve' }, mcp: false, ai: 'deny' },
  handler: async (ctx, input) => {
    return ctx.data.module(async (tx) => {
      const branch = await resolveBranch(tx, input.branchCode);
      const day = input.businessDate ?? todayVn();
      const scheme = schemeOf(branch.code);
      // Cùng giao dịch: nâng sàn (khoá dòng bộ đếm) rồi cấp — dải luôn nối sau số cuối website báo.
      await raiseShopCounters(tx, ctx.tenant.id, branch.code, scheme, { sale: input.lastSale, ret: input.lastReturn });
      const codes = await issueCodes(tx, ctx.tenant.id, branch.code, input.kind, day, input.count, scheme);
      // Hạn dải: hết tháng của ngày bán thì máy xin dải mới (dạng HD theo tháng; dạng shop giữ cùng nhịp).
      const [y, m] = day.split('-').map(Number) as [number, number];
      const expiresAt = new Date(Date.UTC(y, m, 1) - 7 * 3600_000).toISOString();
      await recordReservation(tx, {
        tenantId: ctx.tenant.id, branchCode: branch.code, kind: input.kind, codes, businessDate: day, deviceId: input.deviceId || null,
        actorId: ctx.actor.id, actorName: ctx.actor.name || null, expiresAt,
      });
      return { kind: input.kind, codes, expiresAt };
    });
  },
});
