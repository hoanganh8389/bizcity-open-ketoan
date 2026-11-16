// @bizcity-layer D modules/thue
/** Phân hệ THUẾ: tờ khai GTGT / TNDN, thuyết minh, phân loại dài hạn, hoá đơn cơ quan thuế. */
import type { ApiModule } from '../types.js';
import { LEDGER } from '../loi.js';
import { statementRoutes } from './statements/statements.routes.js';
import { authorityInvoiceRoutes } from './authority-invoices/authority-invoice.routes.js';

// [2026-11-13 08:00 PM kiennt] NT-HT-003 — màn hình + thao tác phân hệ Thuế (đóng góp)
import './man-hinh-thue.js';

export const thue: ApiModule = { key: 'thue', label: 'Thuế', routes: [...LEDGER, statementRoutes, authorityInvoiceRoutes] };
