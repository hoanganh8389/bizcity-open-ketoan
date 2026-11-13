/** Module pos — phía máy chủ của máy bán POS (kế hoạch module POS). Mọi action khai ở đây VÀ trong bizcity.module.json (`actions`). */
import { defineModule } from '@bizcity/module-sdk';
import manifest from '../bizcity.module.json' with { type: 'json' };
import adminDashboard from './actions/admin-dashboard.js';
import adminOrders from './actions/admin-orders.js';
import adminReturns from './actions/admin-returns.js';
import adminSettings from './actions/admin-settings.js';
import adminShifts from './actions/admin-shifts.js';
import bootstrapGet from './actions/bootstrap-get.js';
import catalogBarcode from './actions/catalog-barcode.js';
import catalogSearch from './actions/catalog-search.js';
import catalogSnapshot from './actions/catalog-snapshot.js';
import customerLookup from './actions/customer-lookup.js';
import customerOrders from './actions/customer-orders.js';
import customerSearch from './actions/customer-search.js';
import exchangeCreate from './actions/exchange-create.js';
import orderCancel from './actions/order-cancel.js';
import orderCreate from './actions/order-create.js';
import orderGet from './actions/order-get.js';
import orderInvoiceBuyer from './actions/order-invoice-buyer.js';
import orderQrConfirm from './actions/order-qr-confirm.js';
import orderQrRenew from './actions/order-qr-renew.js';
import orderLookup from './actions/order-lookup.js';
import orderReturnable from './actions/order-returnable.js';
import returnCreate from './actions/return-create.js';
import reportDashboard from './actions/report-dashboard.js';
import reportOrders from './actions/report-orders.js';
import returnList from './actions/return-list.js';
import sequenceReserve from './actions/sequence-reserve.js';
import shiftClose from './actions/shift-close.js';
import shiftCurrent from './actions/shift-current.js';
import shiftOpen from './actions/shift-open.js';
import stockAll from './actions/stock-all.js';
import stockGet from './actions/stock-get.js';

export default defineModule({
  manifest,
  actions: [
    bootstrapGet, sequenceReserve, orderCreate, orderGet, orderLookup, orderCancel, orderReturnable,
    returnCreate, returnList, exchangeCreate, customerSearch, customerLookup, customerOrders,
    catalogSnapshot, catalogSearch, catalogBarcode, stockGet,
    shiftCurrent, shiftOpen, shiftClose, reportOrders, reportDashboard,
    adminOrders, adminReturns, adminShifts, adminDashboard, adminSettings,
    orderQrConfirm, orderQrRenew, orderInvoiceBuyer, stockAll,
  ],
  subscribers: [],
});
