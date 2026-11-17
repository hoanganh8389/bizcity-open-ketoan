// [2026-11-14 05:53 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-4: cai-preset.mjs thành vỏ mỏng — máy chủ chạy gói; kiểm theo bảng khối thay cho từng dòng
/**
 * Cài nhanh preset (bizcity_preset@1): scripts/cai-preset.mjs chạy thật qua HTTP vào API đang nghe cổng — máy chủ chạy gói
 * (core.setup.plan → POST /setup/presets/:id/apply → core.setup.run); chứng từ mẫu vào sổ qua cửa nạp; chạy lại không ghi trùng.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { AddressInfo } from 'node:net';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

const run = promisify(execFile);
// [2026-11-17 09:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-6: gói 1.1 — đếm theo tệp gói, thời hạn đủ cho ba tháng nghiệp vụ
const readMau = (f: string) => (JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../presets/thuong-mai-ban-le/mau', f), 'utf8')) as unknown[]).length;
const DOCS = readMau('chung-tu.json');
const BRANCHES = readMau('chi-nhanh.json');
const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../scripts/cai-preset.mjs');
let ctx: TestCtx;
let api = '';

beforeAll(async () => {
  ctx = await setupTenant();
  await ctx.app.listen({ port: 0, host: '127.0.0.1' });
  api = `http://127.0.0.1:${(ctx.app.server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await ctx.app.close();
});

const install = (...extra: string[]) => run(process.execPath, [script, 'thuong-mai-ban-le', '--api', api, '--token', ctx.token, ...extra], { timeout: 240_000 });

describe('Preset cài nhanh', () => {
  it('--list và --dry-run (xem trước ở máy chủ) không ghi gì', async () => {
    const list = await run(process.execPath, [script, '--list']);
    expect(list.stdout).toContain('thuong-mai-ban-le');
    const dry = await install('--dry-run');
    expect(dry.stdout).toMatch(new RegExp(`Chứng từ\\s+${DOCS} \\(đã có 0, sẽ thêm ${DOCS}\\)`));
    expect((await call(ctx, 'GET', '/api/v1/documents?search=preset:thuong-mai-ban-le')).body.data).toHaveLength(0);
  });

  it('cài: chi nhánh, đối tượng, mặt hàng, chứng từ ghi sổ; chạy lại → đã có / unchanged, không trùng', async () => {
    const first = await install();
    expect(first.stdout).toMatch(/Xong: \d+ ghi, \d+ đã có, 0 lỗi/);
    expect(first.stdout).toMatch(new RegExp(`Chứng từ\\s+ghi ${DOCS}, đã có 0, lỗi 0`));
    const tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    const docs = await db.selectFrom('accounting_events').select(['doc_key', 'status']).where('tenant_id', '=', tenantId).where('doc_key', 'like', 'preset:thuong-mai-ban-le:%').execute();
    expect(docs.length).toBe(DOCS);
    expect(docs.every((d) => d.status === 'posted')).toBe(true);

    const again = await install();
    expect(again.stdout).toMatch(new RegExp(`Chi nhánh\\s+ghi 0, đã có ${BRANCHES}, lỗi 0`));
    expect(again.stdout).toMatch(new RegExp(`Chứng từ\\s+ghi 0, đã có ${DOCS}, lỗi 0`));
    const after = await db.selectFrom('accounting_events').select('id').where('tenant_id', '=', tenantId).where('doc_key', 'like', 'preset:thuong-mai-ban-le:%').execute();
    expect(after).toHaveLength(DOCS);
  }, 600_000);
});
