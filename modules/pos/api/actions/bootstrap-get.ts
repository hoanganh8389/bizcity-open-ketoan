/**
 * GET /api/v1/m/pos/bootstrap — thông tin khởi động màn bán (khuôn Bootstrap của hợp đồng /pos/*), không gồm danh mục / giá.
 * Ca bán: ca đang mở của chi nhánh (W3, NT-BH-007); chưa mở ca thì "ca theo ngày" (D-MP-9, Q2: chưa bắt buộc mở ca). Hình thức thanh toán là danh mục của đơn vị, mã = mã kế toán (D-MP-4).
 */
import { defineAction, z } from '@bizcity/module-sdk';
import { paymentKind } from '../domain/order.js';
import { activePaymentMethods, resolveBranch, todayVn } from '../read.js';
import { giftWarehouses, posSettings } from '../settings.js';
import { openShiftOf } from '../shifts.js';
import { catalogVersionOf, warehousesFor } from '../catalog.js';
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027 dạng số bill, NT-BH-028 kho bán / kho quà của cửa hàng cho máy bán (đóng góp)
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027 (18/11 anh chốt): website tự báo số cuối, bootstrap nâng bộ đếm dạng shop (đóng góp)
import { SHOP_LAST_MAX, schemeOf } from '../domain/codes.js';
import { raiseShopCounters } from '../codes.js';
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-030: hạn trả theo cửa hàng, trả khác cửa hàng cùng MST (đóng góp)
import { daysOf, parseDaysMap } from '../domain/returns.js';

const codeName = z.object({ code: z.string(), name: z.string() });

export default defineAction({
  id: 'pos.bootstrap.get', title: 'Khởi động màn bán POS', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({
    branch: z.string().trim().max(32).optional(),
    /**
     * NT-BH-027: số cuối bộ đếm "bt" của shop ở website (trang vỏ React báo) — bán / hoàn. Module nâng bộ đếm dạng shop lên ≥ số này
     * (không bao giờ hạ) để số đầu trên React nối tiếp số website. Không gửi = không nâng.
     */
    lastSale: z.coerce.number().int().min(1).max(SHOP_LAST_MAX).optional(),
    lastReturn: z.coerce.number().int().min(1).max(SHOP_LAST_MAX).optional(),
  }),
  output: z.object({
    branch: z.object({ code: z.string(), name: z.string(), taxCode: z.string(), address: z.string() }),
    user: z.object({ id: z.string(), name: z.string(), roles: z.array(z.string()) }),
    menu: z.array(z.string()),
    paymentMethods: z.array(z.object({ code: z.string(), name: z.string(), kind: z.string(), accountingCode: z.string() })),
    exportReasons: z.array(codeName),
    saleSources: z.array(codeName),
    minTotal: z.number(),
    returnPolicy: z.object({ days: z.number(), crossShop: z.enum(['same_shop', 'same_tax_code']) }),
    openShift: z.object({ id: z.string(), openedAt: z.string() }).nullable(),
    /** Cài đặt bán hàng bắt buộc mở ca (NT-BH-011): true mà openShift = null thì máy bán chặn bán, dẫn sang mở ca. */
    requireOpenShift: z.boolean(),
    reservedCodes: z.object({ sale: z.array(z.string()) }),
    coreVersion: z.string(),
    catalogVersion: z.string(),
    promotionsVersion: z.string(),
    /** NT-BH-028: kho bán / kho quà (KKM) của cửa hàng; gift null = chưa khai (quà trừ kho bán) hoặc khai sai (giftIssue). */
    warehouses: z.object({ sale: z.string(), gift: z.string().nullable(), giftIssue: z.string().nullable() }),
    /**
     * NT-BH-027: dạng số bill — shop = {mã shop}BT{5 số} liên tục, phiếu hoàn {mã shop}.B{5 số} (mặc định); legacy = HD / TH theo
     * tháng (chỉ khi mã chi nhánh không dựng được mã 12 ký tự, vd CN-NA).
     */
    codeFormat: z.enum(['shop', 'legacy']),
  }),
  expose: { http: { method: 'GET', path: '/bootstrap' }, mcp: false, ai: 'read' },
  handler: async (ctx, input) => {
    const settings = await posSettings(ctx);
    const giftMap = await giftWarehouses(ctx);
    return ctx.data.module(async (tx) => {
    const branch = await resolveBranch(tx, input.branch);
    const methods = await activePaymentMethods(tx);
    const day = todayVn();
    const shift = await openShiftOf(tx, branch.code);
    const wh = await warehousesFor(tx, branch.code, giftMap);
    const scheme = schemeOf(branch.code);
    // Nâng sàn một chiều (idempotent): gọi lại bootstrap với cùng số không đổi gì; số nhỏ hơn bộ đếm thì bỏ qua.
    await raiseShopCounters(tx, ctx.tenant.id, branch.code, scheme, { sale: input.lastSale, ret: input.lastReturn });
    return {
      branch,
      user: { id: ctx.actor.id, name: ctx.actor.name, roles: [] },
      menu: ['sale', 'orders', 'shift', 'overview'],
      // Hình thức chọn tay; ghi nợ / đối trừ không chọn ở W1 (D-MP-7) nên không đưa ra máy.
      paymentMethods: methods
        .map((m) => ({ code: m.code, name: m.name, kind: paymentKind(m.code), accountingCode: m.code }))
        .filter((m) => m.kind !== 'credit' && m.kind !== 'offset'),
      exportReasons: [{ code: 'XBA', name: 'Xuất bán' }],
      saleSources: [{ code: 'tai_quay', name: 'Tại quầy' }],
      minTotal: 0,
      // Hạn trả là tham số (họp kế toán 04/11: 3 ngày). NT-BH-030: hạn riêng của cửa hàng (nếu khai), trả khác cửa hàng cùng MST chi nhánh.
      returnPolicy: { days: daysOf({ days: settings.returnDays, byShop: parseDaysMap(settings.returnDaysByShop) }, branch.code), crossShop: 'same_tax_code' as const },
      openShift: shift ? { id: shift.shift_id, openedAt: shift.opened_at.toISOString() } : settings.requireOpenShift ? null : { id: `ngay-${day}`, openedAt: `${day}T00:00:00+07:00` },
      requireOpenShift: settings.requireOpenShift,
      reservedCodes: { sale: [] },
      coreVersion: '',
      catalogVersion: await catalogVersionOf(tx, branch.code),
      promotionsVersion: '',
      warehouses: { sale: wh.sale, gift: wh.gift, giftIssue: wh.issue ?? null },
      codeFormat: scheme.mode,
    };
    });
  },
});
