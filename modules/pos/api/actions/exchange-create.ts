/**
 * POST /api/v1/m/pos/exchanges — đổi hàng tại quầy (NT-BH-005 tình huống 3): phiếu trả (sale_return, không trả tiền) + đơn bán
 * mới đối trừ phiếu trả (offsets), khách trả thêm phần chênh. Đơn mới phải bằng hoặc cao hơn hàng trả (họp kế toán 04/11).
 * Một bên lỗi thì không ghi gì cả (runtime bọc cả handler trong một giao dịch).
 */
import { Errors, defineAction, z } from '@bizcity/module-sdk';
import { normalizePhone } from '../domain/order.js';
import { orderDraftSchema } from '../domain/schema.js';
import { createOrder } from '../order-service.js';
import { createReturn, findOrder, returnDraftSchema } from '../return-service.js';
import { createOrderResult } from './order-create.js';

export default defineAction({
  id: 'pos.exchange.create', title: 'Đổi hàng tại máy POS', tags: ['Máy bán POS'],
  description: 'Đổi hàng: chứng từ sale_return + chứng từ sale đối trừ (offsets), cùng giao dịch.',
  permission: 'pos:return', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'required', dryRun: true,
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'PERIOD_LOCKED', 'POSTING_FAILED'],
  input: z.object({ id: z.string().trim().min(8).max(64), return: returnDraftSchema, order: orderDraftSchema }),
  output: z.object({ return: z.record(z.unknown()), order: createOrderResult }),
  expose: { http: { method: 'POST', path: '/exchanges', status: 201 }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'pos.exchange', objectId: (input) => input.id },
  handler: async (ctx, input) => {
    // Đối trừ chỉ ghép được khi phiếu trả và đơn mới cùng khách (công nợ cùng đối tượng): khách đơn mới = khách đơn gốc.
    const original = await ctx.data.module(async (tx) => findOrder(tx, input.return.orderId));
    const origCustomer = (original.snapshot as { customer?: { id?: string } }).customer?.id ?? '';
    const c = input.order.customer;
    const newCustomer = 'partnerId' in c ? c.partnerId : 'phone' in c ? normalizePhone(c.phone) : '';
    if (origCustomer !== newCustomer) {
      throw Errors.validation('Đổi hàng: khách của đơn mới phải là khách của đơn gốc', { reason: 'POS_EXCHANGE_CUSTOMER', expected: origCustomer || 'khách lẻ' });
    }
    const ret = await createReturn(ctx, { ...input.return, branchCode: input.return.branchCode ?? input.order.branchCode }, { exchangeOrderId: input.order.id });
    const order = await createOrder(ctx, { ...input.order, branchCode: input.order.branchCode ?? ret.branchCode }, { exchange: { credit: ret.refundTotal, returnDocKey: ret.docKey } });
    return { return: ret.snapshot, order: { order: order.order, nextReservedCodes: order.nextReservedCodes, einvoiceReview: order.einvoiceReview } };
  },
});
