// @bizcity-layer P apps/api
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 11:27 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — bằng chứng chỉ thêm, chuỗi băm theo đơn vị, biên nhận (PHASES 2.6).
// [2026-10-30 11:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — MCP cho trợ lý AI: POST /mcp, công cụ sinh từ action, xác nhận trước khi ghi (PHASES 2.11, 2.12).
// [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp.
// [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — transactional outbox, subscriber, đồng hồ, correlation_id.
// [2026-10-30 09:36 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — cổng công khai apps/api/src/kernel/public.ts, SC-KERNEL-6: ngoài Kernel chỉ import qua cổng.
// [2026-10-31 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — báo cáo về phan-he/ke-toan/reports; GOODS (nhập xuất tồn + báo cáo hàng hoá tách theo miền) lắp ở đây cho kho, mua-hang — phân hệ không import báo cáo của ke-toan (SC-MOD-1)
// [2026-11-01 12:16 AM Johnny Chu - Chu Hoàng Anh] PHASE-010 — CORE_ROUTES thêm docRefRoutes (documents.* — phiên bản, liên kết, đính kèm chung)
/**
 * LÕI máy chủ — luôn bật ở mọi tiến trình: đăng nhập, hệ thống, người dùng, danh mục dùng chung, cổng nhận chứng từ, kết nối.
 * Mã nguồn lõi ở src/core + src/modules (chứng từ, định khoản, sổ cái, kho, công nợ, báo cáo…).
 * LEDGER: sổ sách, báo cáo, công nợ dùng chung — phân hệ nghiệp vụ nào cũng cần.
 * GOODS: nhập xuất tồn (Kernel) + báo cáo hàng hoá: lãi gộp (ban-hang), chuyển kho (kho), kết quả theo cửa hàng (ke-toan) —
 *   phân hệ có hàng (kho, mua-hang) cùng cần; lắp ở đây để phân hệ không import nhau (SC-MOD-1).
 */
import type { Routes } from './types.js';
import { authRoutes } from '../modules/auth/auth.routes.js';
import { systemRoutes } from '../modules/system/system.routes.js';
import { evidenceRoutes } from '../modules/system/evidence.routes.js';
import { eventRoutes } from '../modules/system/events.routes.js';
import { mcpRoutes } from '../modules/system/mcp.routes.js';
import { metricsRoutes } from '../modules/system/metrics.routes.js';
import { presenceRoutes } from '../modules/system/presence.js';
import { accessRoutes } from '../modules/access/access.routes.js';
import { accountRoutes, taxCodeRoutes, postingConfigRoutes, periodRoutes, documentRoutes, defaultDataRoutes, taxInfoRoutes, ledgerRoutes, debtRoutes, inventoryRoutes } from '../kernel/public.js';
import { branchRoutes } from '../modules/branches/branch.routes.js';
import { warehouseRoutes } from '../modules/warehouses/warehouse.routes.js';
import { unitNameRoutes } from '../modules/unit-names/unit-name.routes.js';
import { partnerRoutes } from '../modules/partners/partner.routes.js';
import { connectionRoutes } from '../modules/connections/connection.routes.js';
import { dimensionRoutes } from '../modules/dimensions/dimension.routes.js';
import { contractScheduleRoutes } from '../modules/dimensions/contract-schedule.routes.js';
import { bankAccountRoutes } from '../modules/bank-accounts/bank-account.routes.js';
import { productRoutes } from '../modules/products/product.routes.js';
import { catalogRoutes } from '../modules/catalog/catalog.routes.js';
import { voucherTemplateRoutes } from '../modules/voucher-templates/voucher-template.routes.js';
import { signatureRoutes } from '../modules/signatures/signature.routes.js';
import { printTemplateRoutes } from '../modules/print-templates/print-template.routes.js';
import { referenceDocumentRoutes } from '../modules/reference-documents/reference-document.routes.js';
import { docRefRoutes } from '../modules/doc-refs/doc-ref.routes.js';
import { reportRoutes } from './ke-toan/reports/report.routes.js';
import { departmentReportRoutes } from './ke-toan/reports/department-reports.js';
import { grossProfitRoutes } from './ban-hang/gross-profit.js';
import { stockTransferRoutes } from './kho/stock-transfers.js';

export const CORE_ROUTES: Routes[] = [
  authRoutes, systemRoutes, evidenceRoutes, eventRoutes, mcpRoutes, metricsRoutes, presenceRoutes, accessRoutes,
  accountRoutes, branchRoutes, warehouseRoutes, unitNameRoutes, partnerRoutes, taxCodeRoutes, postingConfigRoutes, periodRoutes,
  documentRoutes, connectionRoutes, dimensionRoutes, contractScheduleRoutes, defaultDataRoutes, bankAccountRoutes,
  productRoutes, catalogRoutes, voucherTemplateRoutes, signatureRoutes, printTemplateRoutes, taxInfoRoutes, referenceDocumentRoutes, docRefRoutes,
];

export const LEDGER: Routes[] = [ledgerRoutes, reportRoutes, debtRoutes];
export const GOODS: Routes[] = [inventoryRoutes, grossProfitRoutes, stockTransferRoutes, departmentReportRoutes];
