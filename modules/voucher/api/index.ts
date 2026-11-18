/** Voucher — phần máy chủ (phiếu NT-BH-026). Mọi action / subscriber khai ở đây VÀ trong bizcity.module.json (`actions`, `events`). */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: module voucher (đóng góp)
import { defineModule } from '@bizcity/module-sdk';
import manifest from '../bizcity.module.json' with { type: 'json' };
import campaignCreate from './actions/campaign-create.js';
import campaignGet from './actions/campaign-get.js';
import campaignList from './actions/campaign-list.js';
import campaignUpdate from './actions/campaign-update.js';
import codeGenerate from './actions/code-generate.js';
import codeGet from './actions/code-get.js';
import codeImport from './actions/code-import.js';
import codeList from './actions/code-list.js';
import codeRevoke from './actions/code-revoke.js';
import customerVouchers from './actions/customer-vouchers.js';
import orderQuote from './actions/order-quote.js';
import reportGet from './actions/report.js';
import phieuBanDoc from './subscribers/phieu-ban-doc.js';
import posOrder from './subscribers/pos-order.js';
import posReturn from './subscribers/pos-return.js';

export default defineModule({
  manifest,
  actions: [campaignList, campaignGet, campaignCreate, campaignUpdate, codeGenerate, codeImport, codeList, codeGet, codeRevoke, customerVouchers, orderQuote, reportGet],
  subscribers: [posOrder, posReturn, phieuBanDoc],
});
