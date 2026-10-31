// @bizcity-layer D modules/quy
/** Phân hệ QUỸ: thu chi tiền mặt, ngân hàng, đề nghị thanh toán. */
import type { ApiModule } from '../types.js';
import { LEDGER } from '../loi.js';
import { voucherRoutes } from '../../kernel/public.js';
import { paymentRequestRoutes } from './payment-requests/payment-request.routes.js';

export const quy: ApiModule = { key: 'quy', label: 'Quỹ', routes: [...LEDGER, voucherRoutes, paymentRequestRoutes] };
