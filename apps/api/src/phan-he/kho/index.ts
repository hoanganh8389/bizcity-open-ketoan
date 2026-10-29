/** Phân hệ KHO: nhập xuất, chuyển kho, tồn kho, giá vốn, báo cáo hàng hoá. */
import type { ApiModule } from '../types.js';
import { LEDGER } from '../loi.js';
import { inventoryRoutes } from '../../modules/inventory/inventory.routes.js';
import { goodsReportRoutes } from '../../modules/reports/goods-reports.js';

export const kho: ApiModule = { key: 'kho', label: 'Kho', routes: [...LEDGER, inventoryRoutes, goodsReportRoutes] };
