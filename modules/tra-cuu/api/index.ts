/** Tra cứu — phần máy chủ. Module chỉ có giao diện: không action, không bảng; màn gọi API của phân hệ sẵn có (TC01 → GET /api/v1/purchase/policy-lookup). */
import { defineModule } from '@bizcity/module-sdk';
import manifest from '../bizcity.module.json' with { type: 'json' };

export default defineModule({ manifest, actions: [], subscribers: [] });
