// @bizcity-layer D modules/mua-hang
// [2026-10-31 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — nhập xuất tồn + báo cáo hàng hoá lấy từ GOODS (loi.ts), không import báo cáo của ke-toan (SC-MOD-1)
/** Phân hệ MUA HÀNG: nhà cung cấp, mua hàng, trả hàng nhà cung cấp, công nợ phải trả (chứng từ mua đi qua lõi chứng từ). */
import type { ApiModule } from '../types.js';
import { GOODS, LEDGER } from '../loi.js';
import { purchaseRoutes } from './routes.js';
import { stockRoutes } from './ton-max-routes.js';
import { invoiceRoutes } from './hoa-don-routes.js';

export const muaHang: ApiModule = { key: 'mua-hang', label: 'Mua hàng', routes: [...LEDGER, ...GOODS, purchaseRoutes, stockRoutes, invoiceRoutes] };
