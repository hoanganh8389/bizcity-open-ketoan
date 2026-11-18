/**
 * GET /api/v1/m/pos/customers/check?phone=&name= — nút "Tạo khách" riêng trên máy bán (phiếu NT-BH-029): kiểm SĐT dạng Việt Nam (10 số,
 * bắt đầu 0; +84 / 84 tự đổi về 0) và tên bắt buộc, rồi tra danh mục đối tượng của kế toán theo SĐT.
 * - SĐT đã có → `exists`: KHÔNG tạo mới, trả khách cũ + câu "SĐT … đã thuộc khách …" để máy bán báo và mở khách đó.
 * - SĐT mới → `new`: khách (mã = SĐT) để máy bán chọn ngay vào đơn; khách vào danh mục đối tượng cùng đơn đầu tiên — chứng từ bán mang
 *   `partner` (mã = SĐT, tên, SĐT), cửa nạp Core tự thêm đối tượng (đúng đường khách tạo kèm đơn, NT-BH-019 Q1). Không có bảng khách riêng.
 * Module chưa tự ghi được danh mục đối tượng khi chưa có đơn: ctx.actions.call của module chỉ gọi action đọc, không gọi được
 * core.partner.create (thiếu năng lực lõi — đề xuất ở phiếu NT-BH-029 §4).
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-029: tạo khách riêng trên máy bán — kiểm SĐT / tên, trùng SĐT mở khách cũ (đóng góp)
import { Errors, defineAction, z } from '@bizcity/module-sdk';
import { customerByPhone } from '../customers.js';
import { normalizePhone } from '../domain/order.js';

const customer = z.object({
  id: z.string(), name: z.string(), phone: z.string(), address: z.string(), taxCode: z.string(), email: z.string(),
  orderCount: z.number(), lastOrderAt: z.string().nullable(),
});

export default defineAction({
  id: 'pos.customer.check', title: 'Kiểm khách mới trên máy POS (trùng SĐT mở khách cũ)', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({ phone: z.string().trim().max(20).default(''), name: z.string().trim().max(200).default('') }),
  // Không gửi SĐT → null (hợp đồng module C-4: GET không tham số trả 200), như /customers/lookup.
  output: z.object({ status: z.enum(['exists', 'new']), customer, message: z.string() }).nullable(),
  expose: { http: { method: 'GET', path: '/customers/check' }, mcp: false, ai: 'read' },
  handler: async (ctx, input) => {
    if (!input.phone) return null;
    const phone = normalizePhone(input.phone);
    if (!/^0\d{9}$/.test(phone)) throw Errors.validation('SĐT khách phải có 10 số, bắt đầu bằng 0 (dạng Việt Nam)', { reason: 'POS_BAD_PHONE', field: 'phone' });
    if (!input.name) throw Errors.validation('Thiếu tên khách', { reason: 'POS_MISSING_NAME', field: 'name' });
    return ctx.data.module(async (tx) => {
      const old = await customerByPhone(tx, phone);
      if (old) return { status: 'exists' as const, customer: old, message: `SĐT ${phone} đã thuộc khách ${old.name} (${old.id}) — không tạo mới, mở khách này` };
      return {
        status: 'new' as const,
        customer: { id: phone, name: input.name, phone, address: '', taxCode: '', email: '', orderCount: 0, lastOrderAt: null },
        message: `Khách mới ${input.name} (${phone}) — chọn vào đơn; vào danh mục đối tượng khi đơn đầu tiên được nhận`,
      };
    });
  },
});
