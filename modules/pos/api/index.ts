/** Module pos — phía máy chủ của máy bán POS (kế hoạch module POS). Mọi action khai ở đây VÀ trong bizcity.module.json (`actions`). */
import { defineModule } from '@bizcity/module-sdk';
import manifest from '../bizcity.module.json' with { type: 'json' };
import bootstrapGet from './actions/bootstrap-get.js';
import customerLookup from './actions/customer-lookup.js';
import customerOrders from './actions/customer-orders.js';
import customerSearch from './actions/customer-search.js';
import exchangeCreate from './actions/exchange-create.js';
import orderCancel from './actions/order-cancel.js';
import orderCreate from './actions/order-create.js';
import orderGet from './actions/order-get.js';
import orderLookup from './actions/order-lookup.js';
import orderReturnable from './actions/order-returnable.js';
import returnCreate from './actions/return-create.js';
import returnList from './actions/return-list.js';
import sequenceReserve from './actions/sequence-reserve.js';

export default defineModule({
  manifest,
  actions: [
    bootstrapGet, sequenceReserve, orderCreate, orderGet, orderLookup, orderCancel, orderReturnable,
    returnCreate, returnList, exchangeCreate, customerSearch, customerLookup, customerOrders,
  ],
  subscribers: [],
});
