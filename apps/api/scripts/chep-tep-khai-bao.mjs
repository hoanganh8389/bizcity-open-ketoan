#!/usr/bin/env node
// [2026-10-31 03:26 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — chép tệp khai báo (*.workflow.yaml) từ src sang dist khi dựng (documents.workflow).
/**
 * tsc chỉ dịch .ts; tệp khai báo đặt cạnh mã (máy trạng thái `*.workflow.yaml`, core/workflow.ts nạp theo import.meta.url)
 * phải có ở đúng chỗ tương ứng trong dist. Chạy sau tsc: `npm run build -w @ketoan/api`.
 */
import { cpSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
const DECLARATIONS = /\.workflow\.yaml$/;

let n = 0;
for (const rel of readdirSync(src, { recursive: true, encoding: 'utf8' })) {
  if (!DECLARATIONS.test(rel)) continue;
  cpSync(path.join(src, rel), path.join(dist, rel));
  n++;
}
console.log(`Đã chép ${n} tệp khai báo sang dist`);
