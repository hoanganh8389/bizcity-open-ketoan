/** Module pos — phía máy chủ của máy bán POS (kế hoạch module POS). Mọi action khai ở đây VÀ trong bizcity.module.json (`actions`). */
import { defineModule } from '@bizcity/module-sdk';
import manifest from '../bizcity.module.json' with { type: 'json' };
import adminDashboard from './actions/admin-dashboard.js';
import adminOrders from './actions/admin-orders.js';
import adminReturns from './actions/admin-returns.js';
import adminSettings from './actions/admin-settings.js';
import adminShiftJournal from './actions/admin-shift-journal.js';
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
import orderMoveToZ from './actions/order-move-to-z.js';
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
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: nháp / duyệt / hạn mức / báo cáo khuyến mại (đóng góp)
import promoDraftList from './actions/promo-draft-list.js';
import promoDraftGet from './actions/promo-draft-get.js';
import promoDraftCreate from './actions/promo-draft-create.js';
import promoDraftUpdate from './actions/promo-draft-update.js';
import promoDraftOverlaps from './actions/promo-draft-overlaps.js';
import promoDraftApprove from './actions/promo-draft-approve.js';
import promoDraftPublished from './actions/promo-draft-published.js';
import promoDraftReject from './actions/promo-draft-reject.js';
import promoDraftImport from './actions/promo-draft-import.js';
import promoStopLog from './actions/promo-stop-log.js';
import promoQuota from './actions/promo-quota.js';
import promoReport from './actions/promo-report.js';
import promoReportOrders from './actions/promo-report-orders.js';
import phieuBanPromoUse from './subscribers/phieu-ban-promo-use.js';
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027 số bill thiếu, NT-BH-028 kho quà, NT-BH-029 kiểm khách mới (đóng góp)
import reportMissingCodes from './actions/report-missing-codes.js';
import giftWarehouseGet from './actions/gift-warehouse-get.js';
import customerCheck from './actions/customer-check.js';
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-030: yêu cầu trả quá hạn — gửi, xem, duyệt, từ chối, danh sách quản trị (đóng góp)
import returnApprovalCreate from './actions/return-approval-create.js';
import returnApprovalGet from './actions/return-approval-get.js';
import returnApprovalApprove from './actions/return-approval-approve.js';
import returnApprovalReject from './actions/return-approval-reject.js';
import adminReturnApprovals from './actions/admin-return-approvals.js';
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-031: danh mục kênh bán hàng + báo cáo bán theo kênh (đóng góp)
import channelList from './actions/channel-list.js';
import channelCreate from './actions/channel-create.js';
import channelUpdate from './actions/channel-update.js';
import channelStop from './actions/channel-stop.js';
import channelResume from './actions/channel-resume.js';
import reportChannels from './actions/report-channels.js';

export default defineModule({
  manifest,
  actions: [
    bootstrapGet, sequenceReserve, orderCreate, orderGet, orderLookup, orderCancel, orderReturnable,
    returnCreate, returnList, exchangeCreate, customerSearch, customerLookup, customerOrders,
    catalogSnapshot, catalogSearch, catalogBarcode, stockGet,
    shiftCurrent, shiftOpen, shiftClose, reportOrders, reportDashboard,
    adminOrders, adminReturns, adminShifts, adminDashboard, adminSettings, adminShiftJournal,
    orderQrConfirm, orderQrRenew, orderInvoiceBuyer, orderMoveToZ, stockAll,
    promoDraftList, promoDraftGet, promoDraftCreate, promoDraftUpdate, promoDraftOverlaps, promoDraftApprove, promoDraftPublished, promoDraftReject, promoDraftImport, promoStopLog, promoQuota, promoReport, promoReportOrders,
    reportMissingCodes, giftWarehouseGet, customerCheck,
    returnApprovalCreate, returnApprovalGet, returnApprovalApprove, returnApprovalReject, adminReturnApprovals,
    channelList, channelCreate, channelUpdate, channelStop, channelResume, reportChannels,
  ],
  subscribers: [phieuBanPromoUse],
});
