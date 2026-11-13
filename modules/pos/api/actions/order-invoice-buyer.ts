/**
 * POST /api/v1/m/pos/orders/:id/invoice-buyer — người mua trên hoá đơn điện tử + dòng quà dưới 24 tháng không đưa lên hoá đơn
 * (NT-BH-010). Lưu ở đơn (một nguồn), đi theo bản sao sổ sang website (meta phiếu bán `invoice_buyer`); plugin hoá đơn ở website
 * phát hành. Gửi lại cùng nội dung → trả đơn, không đổi gì. Chỉ đơn đã hoàn tất.
 */
import { Errors, defineAction, z } from '@bizcity/module-sdk';
import { lockKey } from '../order-service.js';
import { emitOrderChange, saveOrderChange, type OrderChange } from '../order-update.js';
import { findOrder } from '../return-service.js';

const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
const text = (max: number) => z.string().trim().max(max).optional();
const buyer = z.object({
  name: text(200), companyName: text(300), address: text(500), phone: text(20), email: z.string().trim().email('Email không đúng khuôn').max(200).optional().or(z.literal('')),
  taxCode: z.string().trim().regex(/^\d{10}(-?\d{3})?$/, 'Mã số thuế phải 10 hoặc 13 số').optional().or(z.literal('')),
  excludedSkus: z.array(z.string().trim().min(1).max(64)).max(200).optional(),
  under24Confirmed: z.boolean().optional(),
});

export default defineAction({
  id: 'pos.order.invoice-buyer', title: 'Lưu người mua hoá đơn điện tử của đơn máy POS', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND'],
  input: buyer.extend({ id: z.string().trim().min(1).max(64) }).passthrough(),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/orders/:id/invoice-buyer' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'pos.order', objectId: (input) => input.id },
  handler: async (ctx, input) => {
    let change: OrderChange | null = null;
    const out = await ctx.data.module(async (tx) => {
    const order = await findOrder(tx, input.id);
    await lockKey(tx, `pos:order:${order.order_id}`);
    const fresh = await findOrder(tx, order.order_id);
    if (fresh.status === 'cancelled') throw Errors.conflict(`Đơn ${fresh.code} đã huỷ — không lập hoá đơn`, { reason: 'POS_ORDER_CANCELLED', code: fresh.code });
    if (fresh.status !== 'completed') throw Errors.conflict(`Đơn ${fresh.code} chưa hoàn tất (chờ trả tiền) — lập hoá đơn sau khi thu tiền`, { code: fresh.code });
    const parsed = buyer.parse(input);
    const value = Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined && v !== ''));
    const prev = (fresh.snapshot as { invoiceBuyer?: unknown }).invoiceBuyer;
    // jsonb tự xếp lại thứ tự khoá: so theo dạng chuẩn (khoá sắp xếp), không so chuỗi JSON thô.
    if (canon(prev ?? null) === canon(value)) return fresh.snapshot;
    const snapshot = { ...fresh.snapshot, invoiceBuyer: value };
    change = await saveOrderChange(tx, fresh, snapshot);
    ctx.evidence.note('pos.order.invoice-buyer', { code: fresh.code, taxCode: value.taxCode ?? null });
    return snapshot;
    });
    if (change) await emitOrderChange(ctx, change);
    return out;
  },
});
