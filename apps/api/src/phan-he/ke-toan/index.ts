// @bizcity-layer D modules/ke-toan
// [2026-10-31 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — báo cáo kế toán về phan-he/ke-toan/reports (PHASES 3.7, Q012-2)
/** Phân hệ KẾ TOÁN: chứng từ, sổ sách, công nợ, kết chuyển, báo cáo, kế hoạch tài chính — bật kèm các phân hệ nghiệp vụ khác (includes). */
import type { ApiModule } from '../types.js';
import { LEDGER } from '../loi.js';
import { voucherRoutes, closingRoutes } from '../../kernel/public.js';
import { debtConfirmationRoutes } from './reports/debt-confirmation.js';
import { dimensionReportRoutes } from './reports/dimension-reports.js';
import { planningRoutes } from './planning/planning.routes.js';

export const keToan: ApiModule = {
  key: 'ke-toan', label: 'Kế toán',
  routes: [...LEDGER, voucherRoutes, closingRoutes, debtConfirmationRoutes, dimensionReportRoutes, planningRoutes],
  includes: ['kho', 'ban-hang', 'tai-san', 'thue', 'quy'],
};
