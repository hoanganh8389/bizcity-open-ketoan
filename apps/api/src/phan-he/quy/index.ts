// @bizcity-layer D modules/quy
/** Phân hệ QUỸ: thu chi tiền mặt, ngân hàng, đề nghị thanh toán. */
import type { ApiModule } from '../types.js';
import { LEDGER } from '../loi.js';
import { voucherRoutes } from '../../kernel/public.js';
import { paymentRequestRoutes } from './payment-requests/payment-request.routes.js';
// [2026-11-09 04:50 PM kiennt] PHASE-028 — giai đoạn 3.2 (80 D-AUTH-19): phân hệ đăng ký quyền lập / sửa cho loại chứng từ của mình ở cửa nạp (khai ở permissions[] của manifest; documents:write kéo theo)
import { registerDocumentType } from '@bizcity/platform/core/auth';
// [2026-11-09 05:55 PM kiennt] PHASE-028 — giai đoạn 3.2b: đủ bộ thao tác xem / lập / huỷ (/ xuất) cho từng loại chứng từ của phân hệ
registerDocumentType('cash_transfer', { read: 'quy:chuyen-tien-xem', create: 'quy:chuyen-tien-lap', cancel: 'quy:chuyen-tien-huy' });
registerDocumentType('customer_payment', { read: 'quy:thu-tien-xem', create: 'quy:thu-tien-lap', cancel: 'quy:thu-tien-huy' });
registerDocumentType('supplier_payment', { read: 'quy:chi-tien-xem', create: 'quy:chi-tien-lap', cancel: 'quy:chi-tien-huy' });

export const quy: ApiModule = { key: 'quy', label: 'Quỹ', routes: [...LEDGER, voucherRoutes, paymentRequestRoutes] };
