// @bizcity-layer D modules/ke-toan
// [2026-10-31 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — báo cáo kế toán về phan-he/ke-toan/reports (PHASES 3.7, Q012-2)
/** Phân hệ KẾ TOÁN: chứng từ, sổ sách, công nợ, kết chuyển, báo cáo, kế hoạch tài chính — bật kèm các phân hệ nghiệp vụ khác (includes). */
import type { ApiModule } from '../types.js';
import { LEDGER } from '../loi.js';
import { voucherRoutes, closingRoutes } from '../../kernel/public.js';
import { debtConfirmationRoutes } from './reports/debt-confirmation.js';
import { dimensionReportRoutes } from './reports/dimension-reports.js';
import { planningRoutes } from './planning/planning.routes.js';
// [2026-11-09 04:50 PM kiennt] PHASE-028 — giai đoạn 3.2 (80 D-AUTH-19): phân hệ đăng ký quyền lập / sửa cho loại chứng từ của mình ở cửa nạp (khai ở permissions[] của manifest; documents:write kéo theo)
import { registerDocumentType } from '@bizcity/platform/core/auth';
// [2026-11-09 05:55 PM kiennt] PHASE-028 — giai đoạn 3.2b: đủ bộ thao tác xem / lập / huỷ (/ xuất) cho từng loại chứng từ của phân hệ
registerDocumentType('manual_journal', { read: 'ke-toan:but-toan-xem', create: 'ke-toan:but-toan-lap', cancel: 'ke-toan:but-toan-huy' });

export const keToan: ApiModule = {
  key: 'ke-toan', label: 'Kế toán',
  routes: [...LEDGER, voucherRoutes, closingRoutes, debtConfirmationRoutes, dimensionReportRoutes, planningRoutes],
  includes: ['kho', 'ban-hang', 'tai-san', 'thue', 'quy'],
};
