/** Kho thư viện — phần máy chủ. Module chỉ có giao diện (PHASE-030 · 26 §3, B1): không action, không bảng; mọi việc đọc / kiểm đi qua API Core `/api/v1/libraries` (core.library.*). */
import { defineModule } from '@bizcity/module-sdk';
import manifest from '../bizcity.module.json' with { type: 'json' };

export default defineModule({ manifest, actions: [], subscribers: [] });
