/** Phân hệ THUẾ: tờ khai GTGT / TNDN, thuyết minh, phân loại dài hạn, hoá đơn cơ quan thuế. */
import type { ApiModule } from '../types.js';
import { LEDGER } from '../loi.js';
import { statementRoutes } from './statements/statements.routes.js';
import { authorityInvoiceRoutes } from './authority-invoices/authority-invoice.routes.js';

export const thue: ApiModule = { key: 'thue', label: 'Thuế', routes: [...LEDGER, statementRoutes, authorityInvoiceRoutes] };
