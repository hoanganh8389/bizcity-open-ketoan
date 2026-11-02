/** Module mẫu — phần máy chủ. Mọi action / subscriber khai ở đây VÀ trong bizcity.module.json (`actions`). */
import { defineModule } from '@bizcity/module-sdk';
import manifest from '../bizcity.module.json' with { type: 'json' };
import recordCreate from './actions/record-create.js';
import recordList from './actions/record-list.js';

export default defineModule({ manifest, actions: [recordCreate, recordList], subscribers: [] });
