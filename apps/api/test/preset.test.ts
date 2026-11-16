// [2026-11-14 05:53 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-4: cai-preset.mjs thành vỏ mỏng — máy chủ chạy gói; kiểm theo bảng khối thay cho từng dòng
/**
 * Cài nhanh preset (bizcity_preset@1): scripts/cai-preset.mjs chạy thật qua HTTP vào API đang nghe cổng — máy chủ chạy gói
 * (core.setup.plan → POST /setup/presets/:id/apply → core.setup.run); chứng từ mẫu vào sổ qua cửa nạp; chạy lại không ghi trùng.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { AddressInfo } from 'node:net';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

const run = promisify(execFile);
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

const install = (...extra: string[]) => run(process.execPath, [script, 'thuong-mai-ban-le', '--api', api, '--token', ctx.token, ...extra], { timeout: 60_000 });

describe('Preset cài nhanh', () => {
  it('--list và --dry-run (xem trước ở máy chủ) không ghi gì', async () => {
    const list = await run(process.execPath, [script, '--list']);
    expect(list.stdout).toContain('thuong-mai-ban-le');
    const dry = await install('--dry-run');
    expect(dry.stdout).toMatch(/Chứng từ\s+3 \(đã có 0, sẽ thêm 3\)/);
    expect((await call(ctx, 'GET', '/api/v1/documents?search=preset:thuong-mai-ban-le')).body.data).toHaveLength(0);
  });

  it('cài: chi nhánh, đối tượng, mặt hàng, 3 chứng từ ghi sổ; chạy lại → đã có / unchanged, không trùng', async () => {
    const first = await install();
    expect(first.stdout).toMatch(/Xong: \d+ ghi, \d+ đã có, 0 lỗi/);
    expect(first.stdout).toMatch(/Chứng từ\s+ghi 3, đã có 0, lỗi 0/);
    const tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    const docs = await db.selectFrom('accounting_events').select(['doc_key', 'status']).where('tenant_id', '=', tenantId).where('doc_key', 'like', 'preset:thuong-mai-ban-le:%').execute();
    expect(docs.map((d) => d.status)).toEqual(['posted', 'posted', 'posted']);

    const again = await install();
    expect(again.stdout).toMatch(/Chi nhánh\s+ghi 0, đã có 1, lỗi 0/);
    expect(again.stdout).toMatch(/Chứng từ\s+ghi 0, đã có 3, lỗi 0/);
    const after = await db.selectFrom('accounting_events').select('id').where('tenant_id', '=', tenantId).where('doc_key', 'like', 'preset:thuong-mai-ban-le:%').execute();
    expect(after).toHaveLength(3);
  });
});
