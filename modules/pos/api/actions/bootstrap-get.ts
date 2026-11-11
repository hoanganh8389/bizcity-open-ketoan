/**
 * GET /api/v1/m/pos/bootstrap — thông tin khởi động màn bán (khuôn Bootstrap của hợp đồng /pos/*), không gồm danh mục / giá.
 * Ca bán W1 là "ca theo ngày" (D-MP-9); hình thức thanh toán là danh mục của đơn vị, mã = mã kế toán (D-MP-4).
 */
import { defineAction, z } from '@bizcity/module-sdk';
import { paymentKind } from '../domain/order.js';
import { activePaymentMethods, resolveBranch, todayVn } from '../read.js';

const codeName = z.object({ code: z.string(), name: z.string() });

export default defineAction({
  id: 'pos.bootstrap.get', title: 'Khởi động màn bán POS', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({ branch: z.string().trim().max(32).optional() }),
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
    reservedCodes: z.object({ sale: z.array(z.string()) }),
    coreVersion: z.string(),
    catalogVersion: z.string(),
    promotionsVersion: z.string(),
  }),
  expose: { http: { method: 'GET', path: '/bootstrap' }, mcp: false, ai: 'read' },
  handler: async (ctx, input) => ctx.data.module(async (tx) => {
    const branch = await resolveBranch(tx, input.branch);
    const methods = await activePaymentMethods(tx);
    const day = todayVn();
    return {
      branch,
      user: { id: ctx.actor.id, name: ctx.actor.name, roles: [] },
      menu: ['sale', 'orders'],
      // Hình thức chọn tay; ghi nợ / đối trừ không chọn ở W1 (D-MP-7) nên không đưa ra máy.
      paymentMethods: methods
        .map((m) => ({ code: m.code, name: m.name, kind: paymentKind(m.code), accountingCode: m.code }))
        .filter((m) => m.kind !== 'credit' && m.kind !== 'offset'),
      exportReasons: [{ code: 'XBA', name: 'Xuất bán' }],
      saleSources: [{ code: 'tai_quay', name: 'Tại quầy' }],
      minTotal: 0,
      returnPolicy: { days: 3, crossShop: 'same_shop' as const },
      openShift: { id: `ngay-${day}`, openedAt: `${day}T00:00:00+07:00` },
      reservedCodes: { sale: [] },
      coreVersion: '',
      catalogVersion: '',
      promotionsVersion: '',
    };
  }),
});
