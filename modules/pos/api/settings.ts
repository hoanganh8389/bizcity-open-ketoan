/**
 * Cài đặt bán hàng của module pos (BH17, phiếu NT-BH-008 §7) — khoá `bizcity.pos.*` khai ở settings.registry.json của module,
 * đọc bằng ctx.settings.get (chưa đặt thì mặc định của registry). Ghi: màn BH17 gọi đường chung của Core
 * `PUT /api/v1/settings/values/:key` (quyền settings:write, có phiên bản, ai đổi, lúc nào).
 */
import type { ActionContext } from '@bizcity/module-sdk';

export const POS_SETTING_KEYS = {
  returnDays: 'bizcity.pos.return_days',
  requireOpenShift: 'bizcity.pos.require_open_shift',
  shiftScope: 'bizcity.pos.shift_scope',
  cashDiffAlert: 'bizcity.pos.cash_diff_alert',
} as const;

/** Mặc định khi đọc lỗi / giá trị lạ (trùng mặc định của registry). */
export const POS_SETTING_DEFAULTS = { returnDays: 3, requireOpenShift: false, shiftScope: 'branch' as 'branch' | 'device', cashDiffAlert: 0 };

export type PosSettings = typeof POS_SETTING_DEFAULTS;

const int = (v: unknown, d: number, lo: number, hi: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : d);

export async function posSettings(ctx: Pick<ActionContext, 'settings'>): Promise<PosSettings> {
  const [r, o, s, c] = await Promise.all([
    ctx.settings.get<unknown>(POS_SETTING_KEYS.returnDays),
    ctx.settings.get<unknown>(POS_SETTING_KEYS.requireOpenShift),
    ctx.settings.get<unknown>(POS_SETTING_KEYS.shiftScope),
    ctx.settings.get<unknown>(POS_SETTING_KEYS.cashDiffAlert),
  ]);
  return {
    returnDays: int(r, POS_SETTING_DEFAULTS.returnDays, 0, 60),
    requireOpenShift: typeof o === 'boolean' ? o : POS_SETTING_DEFAULTS.requireOpenShift,
    shiftScope: s === 'device' ? 'device' : 'branch',
    cashDiffAlert: int(c, POS_SETTING_DEFAULTS.cashDiffAlert, 0, 1_000_000_000),
  };
}

/** Hạn trả hàng không cần duyệt (ngày, theo ngày bán). */
export async function returnDays(ctx: Pick<ActionContext, 'settings'>): Promise<number> {
  return int(await ctx.settings.get<unknown>(POS_SETTING_KEYS.returnDays), POS_SETTING_DEFAULTS.returnDays, 0, 60);
}
