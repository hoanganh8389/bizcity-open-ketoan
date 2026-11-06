/** Phân quyền — phần máy chủ. Module chỉ có giao diện (ADR-0027 Phụ lục A, W4): không action, không bảng; mọi việc ghi đi qua API Core `/api/v1/roles`, `/api/v1/users/:id/roles`. */
import { defineModule } from '@bizcity/module-sdk';
import manifest from '../bizcity.module.json' with { type: 'json' };

export default defineModule({ manifest, actions: [], subscribers: [] });
