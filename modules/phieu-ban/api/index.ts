/** Phiếu bán nhập tay (BH10 / BH11, phiếu NT-BH-015) — phần máy chủ. Mọi action khai ở đây VÀ trong bizcity.module.json (`actions`). */
// [2026-11-13 11:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-015: đăng ký action phiếu bán / trả nhập tay (đóng góp)
import { defineModule } from '@bizcity/module-sdk';
import manifest from '../bizcity.module.json' with { type: 'json' };
import docApprove from './actions/doc-approve.js';
import docCreate from './actions/doc-create.js';
import docDelete from './actions/doc-delete.js';
import docGet from './actions/doc-get.js';
import docList from './actions/doc-list.js';
import docReturnable from './actions/doc-returnable.js';
import docUnapprove from './actions/doc-unapprove.js';
import docUpdate from './actions/doc-update.js';
import quoteGet from './actions/quote-get.js';
// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: action đơn đặt hàng (đóng góp)
import orderList from './actions/order-list.js';
import orderGet from './actions/order-get.js';
import orderHistory from './actions/order-history.js';
import orderSettings from './actions/order-settings.js';
import orderCreate from './actions/order-create.js';
import orderUpdate from './actions/order-update.js';
import orderImport from './actions/order-import.js';
import orderSend from './actions/order-send.js';
import orderApprove from './actions/order-approve.js';
import orderReject from './actions/order-reject.js';
import orderDeliver from './actions/order-deliver.js';
import orderClose from './actions/order-close.js';
import orderCancel from './actions/order-cancel.js';
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-031: số liệu phiếu theo kênh cho báo cáo bán theo kênh (đóng góp)
import channelSummary from './actions/channel-summary.js';
// [2026-11-19 Võ Hoàng] NGHIEM-THU — NT-BH-034: phiếu theo khách cho báo cáo khách hàng (đóng góp)
import customerDocs from './actions/customer-docs.js';
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-032: chuyến giao, copy đơn (đóng góp)
import shipmentCreate from './actions/shipment-create.js';
import shipmentStatus from './actions/shipment-status.js';
import orderCopy from './actions/order-copy.js';
// [2026-11-21 Võ Hoàng] NGHIEM-THU — NT-BH-035 §3.1: kiểm voucher cho BH10 (đóng góp)
import voucherCheck from './actions/voucher-check.js';

export default defineModule({ manifest, actions: [docList, docGet, docCreate, docUpdate, docDelete, docApprove, docUnapprove, docReturnable, quoteGet,
  orderList, orderGet, orderHistory, orderSettings, orderCreate, orderUpdate, orderImport, orderSend, orderApprove, orderReject, orderDeliver, orderClose, orderCancel, channelSummary, customerDocs,
  shipmentCreate, shipmentStatus, orderCopy, voucherCheck], subscribers: [] });
