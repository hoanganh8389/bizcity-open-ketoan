// @bizcity-layer D modules/mua-hang
/** Phân hệ MUA HÀNG: nhà cung cấp, mua hàng, trả hàng nhà cung cấp, công nợ phải trả (chứng từ mua đi qua lõi chứng từ). */
import type { ApiModule } from '../types.js';
import { LEDGER } from '../loi.js';
import { inventoryRoutes } from '../../kernel/public.js';
import { goodsReportRoutes } from '../../modules/reports/goods-reports.js';
import { purchaseRoutes } from './routes.js';
import { stockRoutes } from './ton-max-routes.js';
import { invoiceRoutes } from './hoa-don-routes.js';

export const muaHang: ApiModule = { key: 'mua-hang', label: 'Mua hàng', routes: [...LEDGER, inventoryRoutes, goodsReportRoutes, purchaseRoutes, stockRoutes, invoiceRoutes] };
