/** Thiết lập nhanh — phần máy chủ. Module chỉ có giao diện (PHASE-036 · 00 §12, B3): không action, không bảng; mọi việc đi qua API Core `core.setup.*` (setup-run.ts) và `core.tenant.update`. */
import { defineModule } from '@bizcity/module-sdk';
import manifest from '../bizcity.module.json' with { type: 'json' };

export default defineModule({ manifest, actions: [], subscribers: [] });
