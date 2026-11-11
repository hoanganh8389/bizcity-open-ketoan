/** Module pos — phía máy chủ của máy bán POS (kế hoạch module POS). Mọi action khai ở đây VÀ trong bizcity.module.json (`actions`). */
import { defineModule } from '@bizcity/module-sdk';
import manifest from '../bizcity.module.json' with { type: 'json' };
import bootstrapGet from './actions/bootstrap-get.js';
import orderCreate from './actions/order-create.js';
import orderGet from './actions/order-get.js';
import sequenceReserve from './actions/sequence-reserve.js';

export default defineModule({ manifest, actions: [bootstrapGet, sequenceReserve, orderCreate, orderGet], subscribers: [] });
