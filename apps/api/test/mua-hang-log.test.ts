/**
 * TP-09 — Nhật ký mua hàng (MH10) lọc được theo ngày / khoảng ngày, theo giờ Việt Nam (tệp nhật ký chia theo tháng UTC).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readLog } from '../src/phan-he/mua-hang/log.js';

const tenant = `tp09-${Date.now()}`;
const dir = path.resolve(process.env.DATA_DIR ?? './data', 'mua-hang', tenant);
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('TP-09 lọc nhật ký theo ngày', () => {
  it('lọc theo ngày giờ Việt Nam, khoảng ngày, kiểu tháng cũ vẫn chạy; kèm lọc loại sự kiện', async () => {
    await mkdir(dir, { recursive: true });
    const row = (ts: string, event: string, docNo: string) => JSON.stringify({ ts, event, docNo, user: 'kt', data: {} });
    // 30/09 18:00 UTC = 01/10 01:00 giờ VN (nằm ở tệp tháng 09)
    await writeFile(path.join(dir, '2026-09.jsonl'), [row('2026-09-30T10:00:00.000Z', 'doc_saved', 'A'), row('2026-09-30T18:00:00.000Z', 'doc_approved', 'B')].join('\n') + '\n');
    await writeFile(path.join(dir, '2026-10.jsonl'), [row('2026-10-05T03:00:00.000Z', 'limit_transfer', 'C'), row('2026-10-20T03:00:00.000Z', 'doc_approved', 'D')].join('\n') + '\n');
    const nos = async (f: Parameters<typeof readLog>[1]) => (await readLog(tenant, f)).map((r) => r.docNo);
    expect(await nos({ from: '2026-10-01', to: '2026-10-01' })).toEqual(['B']);
    expect(await nos({ from: '2026-09-30', to: '2026-09-30' })).toEqual(['A']);
    expect(await nos({ from: '2026-10-01', to: '2026-10-10' })).toEqual(['C', 'B']);
    expect(await nos({ from: '2026-10-06' })).toEqual(['D']);
    expect(await nos({ to: '2026-09-30' })).toEqual(['A']);
    expect(await nos({ from: '2026-10', to: '2026-10' })).toEqual(['D', 'C', 'B']);
    expect(await nos({ from: '2026-10-01', event: 'doc_approved' })).toEqual(['D', 'B']);
    expect(await nos({})).toEqual(['D', 'C', 'B', 'A']);
  });
});
