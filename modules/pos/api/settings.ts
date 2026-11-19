/**
 * Cài đặt bán hàng của module pos (BH17, phiếu NT-BH-008 §7) — khoá `bizcity.pos.*` khai ở settings.registry.json của module,
 * đọc bằng ctx.settings.get (chưa đặt thì mặc định của registry). Ghi: màn BH17 gọi đường chung của Core
 * `PUT /api/v1/settings/values/:key` (quyền settings:write, có phiên bản, ai đổi, lúc nào).
 * Chênh lệch két (NT-BH-014, chữ chốt nghiep-vu/20): bật lập phiếu kế toán + mã hai lý do loại journal — tài khoản khai ở lý do.
 */
// [2026-11-13 08:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-014: khoá chênh lệch két (lập phiếu, lý do thiếu / thừa) (đóng góp)
import type { ActionContext } from '@bizcity/module-sdk';
import { parseDaysMap, parseWarehouseMap } from './domain/returns.js';
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-030 Q3: hạn trả riêng từng shop (khoá bizcity.pos.return_days_by_shop, "CN02=7") (đóng góp)
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-028 kho quà KKM theo cửa hàng; NT-BH-027 bỏ khoá shop_codes (18/11 anh chốt: dạng shop mặc định) (đóng góp)

export const POS_SETTING_KEYS = {
  returnDays: 'bizcity.pos.return_days',
  requireOpenShift: 'bizcity.pos.require_open_shift',
  shiftScope: 'bizcity.pos.shift_scope',
  cashDiffAlert: 'bizcity.pos.cash_diff_alert',
  cashDiffJournal: 'bizcity.pos.cash_diff_journal',
  cashShortReason: 'bizcity.pos.cash_short_reason',
  cashOverReason: 'bizcity.pos.cash_over_reason',
  // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-024 Q3: kho KTL nhận hàng trả lỗi / hết hạn của từng cửa hàng (đóng góp)
  returnBadWarehouses: 'bizcity.pos.return_bad_warehouses',
  /** NT-BH-028: kho quà (loại KKM) của từng cửa hàng ("<cửa hàng>=<mã kho>"); chưa khai → quà trừ kho bán như cũ. */
  giftWarehouses: 'bizcity.pos.gift_warehouses',
  /** NT-BH-030 Q3: hạn trả riêng của shop ("<cửa hàng>=<số ngày>"); shop chưa khai → returnDays của công ty. */
  returnDaysByShop: 'bizcity.pos.return_days_by_shop',
} as const;

/** Mặc định khi đọc lỗi / giá trị lạ (trùng mặc định của registry). */
export const POS_SETTING_DEFAULTS = {
  returnDays: 3, requireOpenShift: false, shiftScope: 'branch' as 'branch' | 'device', cashDiffAlert: 0,
  cashDiffJournal: true, cashShortReason: 'POS-THIEU-KET', cashOverReason: 'POS-THUA-KET',
  returnBadWarehouses: [] as string[],
  giftWarehouses: [] as string[],
  returnDaysByShop: [] as string[],
};

export type PosSettings = typeof POS_SETTING_DEFAULTS;

/** Giá trị đã chuẩn hoá của khoá kho hàng lỗi: chỉ giữ "<cửa hàng>=<kho>" hợp lệ, xếp theo cửa hàng. */
const whList = (v: unknown) => [...parseWarehouseMap(v)].sort(([a], [b]) => a.localeCompare(b)).map(([b, w]) => `${b}=${w}`);

/** Mã lý do (1–32 ký tự, như reasonCode của chứng từ); lạ / trống → mặc định. */
const code = (v: unknown, d: string) => (typeof v === 'string' && /^\S{1,32}$/.test(v.trim()) ? v.trim() : d);
const int = (v: unknown, d: number, lo: number, hi: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : d);

export async function posSettings(ctx: Pick<ActionContext, 'settings'>): Promise<PosSettings> {
  const [r, o, s, c, j, sr, or, bw, gw, rd] = await Promise.all([
    ctx.settings.get<unknown>(POS_SETTING_KEYS.returnDays),
    ctx.settings.get<unknown>(POS_SETTING_KEYS.requireOpenShift),
    ctx.settings.get<unknown>(POS_SETTING_KEYS.shiftScope),
    ctx.settings.get<unknown>(POS_SETTING_KEYS.cashDiffAlert),
    ctx.settings.get<unknown>(POS_SETTING_KEYS.cashDiffJournal),
    ctx.settings.get<unknown>(POS_SETTING_KEYS.cashShortReason),
    ctx.settings.get<unknown>(POS_SETTING_KEYS.cashOverReason),
    ctx.settings.get<unknown>(POS_SETTING_KEYS.returnBadWarehouses),
    ctx.settings.get<unknown>(POS_SETTING_KEYS.giftWarehouses),
    ctx.settings.get<unknown>(POS_SETTING_KEYS.returnDaysByShop),
  ]);
  return {
    returnDays: int(r, POS_SETTING_DEFAULTS.returnDays, 0, 60),
    requireOpenShift: typeof o === 'boolean' ? o : POS_SETTING_DEFAULTS.requireOpenShift,
    shiftScope: s === 'device' ? 'device' : 'branch',
    cashDiffAlert: int(c, POS_SETTING_DEFAULTS.cashDiffAlert, 0, 1_000_000_000),
    cashDiffJournal: typeof j === 'boolean' ? j : POS_SETTING_DEFAULTS.cashDiffJournal,
    cashShortReason: code(sr, POS_SETTING_DEFAULTS.cashShortReason),
    cashOverReason: code(or, POS_SETTING_DEFAULTS.cashOverReason),
    returnBadWarehouses: whList(bw),
    giftWarehouses: whList(gw),
    returnDaysByShop: [...parseDaysMap(rd)].sort(([a], [b]) => a.localeCompare(b)).map(([b, d]) => `${b}=${d}`),
  };
}

/** Kho KTL nhận hàng trả lỗi / hết hạn theo cửa hàng (NT-BH-024): Map mã cửa hàng → mã kho; cửa hàng chưa khai thì không có. */
export async function returnBadWarehouses(ctx: Pick<ActionContext, 'settings'>): Promise<Map<string, string>> {
  return parseWarehouseMap(await ctx.settings.get<unknown>(POS_SETTING_KEYS.returnBadWarehouses));
}

/** Hạn trả hàng không cần duyệt (ngày, theo ngày bán). */
export async function returnDays(ctx: Pick<ActionContext, 'settings'>): Promise<number> {
  return int(await ctx.settings.get<unknown>(POS_SETTING_KEYS.returnDays), POS_SETTING_DEFAULTS.returnDays, 0, 60);
}

/** Hạn trả công ty + hạn riêng từng shop (NT-BH-030 Q3) — hạn của một shop: daysOf(policy, mã shop). */
export async function returnDaysPolicy(ctx: Pick<ActionContext, 'settings'>): Promise<{ days: number; byShop: Map<string, number> }> {
  const [days, by] = await Promise.all([returnDays(ctx), ctx.settings.get<unknown>(POS_SETTING_KEYS.returnDaysByShop)]);
  return { days, byShop: parseDaysMap(by) };
}

/** Kho quà KKM theo cửa hàng (NT-BH-028): Map mã cửa hàng → mã kho; cửa hàng chưa khai thì không có. */
export async function giftWarehouses(ctx: Pick<ActionContext, 'settings'>): Promise<Map<string, string>> {
  return parseWarehouseMap(await ctx.settings.get<unknown>(POS_SETTING_KEYS.giftWarehouses));
}
