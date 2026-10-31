// @bizcity-layer D modules/ke-toan
/** Phân hệ KẾ TOÁN: chứng từ, sổ sách, công nợ, kết chuyển, báo cáo, kế hoạch tài chính — bật kèm các phân hệ nghiệp vụ khác (includes). */
import type { ApiModule } from '../types.js';
import { LEDGER } from '../loi.js';
import { voucherRoutes, closingRoutes } from '../../kernel/public.js';
import { debtConfirmationRoutes } from '../../modules/reports/debt-confirmation.js';
import { dimensionReportRoutes } from '../../modules/reports/dimension-reports.js';
import { planningRoutes } from './planning/planning.routes.js';

export const keToan: ApiModule = {
  key: 'ke-toan', label: 'Kế toán',
  routes: [...LEDGER, voucherRoutes, closingRoutes, debtConfirmationRoutes, dimensionReportRoutes, planningRoutes],
  includes: ['kho', 'ban-hang', 'tai-san', 'thue', 'quy'],
};
