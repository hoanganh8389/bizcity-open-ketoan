// @bizcity-layer P apps/api
/**
 * LÕI máy chủ — luôn bật ở mọi tiến trình: đăng nhập, hệ thống, người dùng, danh mục dùng chung, cổng nhận chứng từ, kết nối.
 * Mã nguồn lõi ở src/core + src/modules (chứng từ, định khoản, sổ cái, kho, công nợ, báo cáo…).
 * LEDGER: sổ sách, báo cáo, công nợ dùng chung — phân hệ nghiệp vụ nào cũng cần.
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
import { accountRoutes, taxCodeRoutes, postingConfigRoutes, periodRoutes, documentRoutes, defaultDataRoutes, taxInfoRoutes, ledgerRoutes, debtRoutes } from '../kernel/public.js';
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
import { reportRoutes } from '../modules/reports/report.routes.js';

export const CORE_ROUTES: Routes[] = [
  authRoutes, systemRoutes, evidenceRoutes, eventRoutes, mcpRoutes, metricsRoutes, presenceRoutes, accessRoutes,
  accountRoutes, branchRoutes, warehouseRoutes, unitNameRoutes, partnerRoutes, taxCodeRoutes, postingConfigRoutes, periodRoutes,
  documentRoutes, connectionRoutes, dimensionRoutes, contractScheduleRoutes, defaultDataRoutes, bankAccountRoutes,
  productRoutes, catalogRoutes, voucherTemplateRoutes, signatureRoutes, printTemplateRoutes, taxInfoRoutes, referenceDocumentRoutes,
];

export const LEDGER: Routes[] = [ledgerRoutes, reportRoutes, debtRoutes];
