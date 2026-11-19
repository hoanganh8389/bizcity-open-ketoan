// [2026-11-15 03:55 PM Võ Hoàng] LOYALTY — NT-BH-020 bước 1 (đóng góp)
/** Điểm thành viên — phần máy chủ. Mọi action / subscriber khai ở đây VÀ trong bizcity.module.json (`actions`, `events.subscribes`). */
import { defineModule } from '@bizcity/module-sdk';
import manifest from '../bizcity.module.json' with { type: 'json' };
import customerGet from './actions/customer-get.js';
import programGet from './actions/program-get.js';
import programPut from './actions/program-put.js';
import openingImport from './actions/opening-import.js';
import redeemQuote from './actions/redeem-quote.js';
import reportGet from './actions/report-get.js';
// [2026-11-19 Võ Hoàng] NGHIEM-THU — NT-BH-034: điểm theo đơn cho báo cáo khách hàng (đóng góp)
import orderPoints from './actions/order-points.js';
import voucherGet from './actions/voucher-get.js';
import expireDaily from './subscribers/expire-daily.js';
import orderEarn from './subscribers/order-recorded.js';
import returnReverse from './subscribers/return-recorded.js';

export default defineModule({ manifest, actions: [programPut, programGet, customerGet, redeemQuote, voucherGet, openingImport, reportGet, orderPoints], subscribers: [orderEarn, returnReverse, expireDaily] });
