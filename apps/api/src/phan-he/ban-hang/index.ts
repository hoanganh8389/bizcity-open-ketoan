// @bizcity-layer D modules/ban-hang
/** Phân hệ BÁN HÀNG: khách hàng, bán hàng, hàng bán trả lại, công nợ phải thu, báo cáo bán hàng. */
import type { ApiModule } from '../types.js';
import { LEDGER } from '../loi.js';
import { salesReportRoutes } from '../../modules/sales/sales-report.routes.js';

export const banHang: ApiModule = { key: 'ban-hang', label: 'Bán hàng', routes: [...LEDGER, salesReportRoutes] };
