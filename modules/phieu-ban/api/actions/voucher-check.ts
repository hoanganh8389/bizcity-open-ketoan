/**
 * POST /api/v1/m/phieu-ban/vouchers/check — kiểm mã voucher của phiếu bán BH10 đang lập (chưa ghi): số được giảm (voucher TGS = chiết khấu),
 * số thanh toán bằng voucher hãng, tổng trước / sau. Mã sai / hết hạn / đã dùng / không đủ điều kiện → VALIDATION_ERROR như lúc duyệt.
 * Không ghi, không giữ mã — lúc duyệt phiếu kiểm lại và khoá mã (NT-BH-026).
 */
// [2026-11-21 Võ Hoàng] NGHIEM-THU — NT-BH-035 §3.1: kiểm voucher cho ô Mã voucher của BH10 (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { docInput } from '../domain/doc.js';
import { checkVouchers } from '../service.js';

export default defineAction({
  id: 'phieu-ban.voucher.check', title: 'Kiểm voucher của phiếu bán đang lập', tags: ['Phiếu bán nhập tay'],
  permission: 'phieu-ban:write', effect: 'read', idempotency: 'none', errors: ['VALIDATION_ERROR'],
  input: docInput.extend({ id: z.string().uuid().optional() }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/vouchers/check' }, mcp: false, ai: 'read' },
  handler: async (ctx, input) => checkVouchers(ctx, input),
});
