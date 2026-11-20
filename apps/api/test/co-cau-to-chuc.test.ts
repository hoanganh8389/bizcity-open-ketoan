/**
 * [2026-11-13 Nguyễn Văn Thủy] Cơ cấu tổ chức một màn (0131) (đóng góp)
 * [2026-11-20 Nguyễn Văn Thủy] Viết lại theo cây đơn vị một bảng (0173, 0174): thêm / chuyển đơn vị qua /api/v1/co-cau/units (đóng góp)
 * Nhiều công ty gốc; đơn vị nhóm hiện thành nút ở /org-units/tree; chuyển nhánh tính lại cấp + đường dẫn; lịch sử sửa ghi ai, đổi gì.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const ok = async (method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, body?: unknown, status = method === 'POST' ? 201 : 200) => {
  const r = await call(ctx, method, url, body);
  expect(r.status, `${method} ${url}: ${JSON.stringify(r.body)}`).toBe(status);
  return r.body.data;
};
type Line = { at: string; by: string; action: string; changes: string[] };
const history = async (type: string, code: string) => (await ok('GET', `/api/v1/co-cau/history?type=${type}&code=${encodeURIComponent(code)}`)) as Line[];
const unit = (code: string, name: string, parentCode?: string, extra: Record<string, unknown> = {}) => ok('POST', '/api/v1/co-cau/units', { code, name, parentCode: parentCode ?? '', ...extra });

beforeAll(async () => { ctx = await setupTenant(); });
afterAll(async () => { await ctx.app.close(); });

describe('Cơ cấu tổ chức một bảng đơn vị', () => {
  it('hai công ty gốc song song, đơn vị con nằm trong cây; chuyển nhánh tính lại cấp và đường dẫn', async () => {
    await unit('CTA', 'Công ty A', undefined, { levelLabel: 'Công ty' });
    await unit('CTB', 'Công ty B', undefined, { levelLabel: 'Công ty', taxCode: '0101234567' });
    await unit('CTA-CON', 'Công ty con của A', 'CTA', { levelLabel: 'Công ty' });
    await unit('CTA-MB', 'Miền Bắc', 'CTA', { levelLabel: 'Miền' });
    await unit('CTA-MB-1', 'Cửa hàng 1', 'CTA-MB', { levelLabel: 'Cửa hàng' });
    await unit('CTA-CON-1', 'Cửa hàng 2', 'CTA-CON', { levelLabel: 'Cửa hàng' });
    const nodes = (await ok('GET', '/api/v1/org-units/tree')).nodes as { code: string; kind: string; level: number; parentCode: string | null; path: string }[];
    const by = new Map(nodes.map((n) => [n.code, n]));
    expect(by.get('CTA')).toMatchObject({ kind: 'company', level: 0, parentCode: null });
    expect(by.get('CTB')).toMatchObject({ kind: 'company', level: 0, parentCode: null });
    expect(by.get('CTA-CON')).toMatchObject({ level: 1, parentCode: 'CTA' });
    expect(by.get('CTA-MB')).toMatchObject({ kind: 'unit', level: 1 });
    // Chuyển nhánh sang công ty gốc khác.
    await ok('PATCH', '/api/v1/co-cau/units/CTA-MB', { parentCode: 'CTB' });
    const cc = await ok('GET', '/api/v1/co-cau');
    const u = (cc.units as { code: string; path: string; level: number; taxUsed: string; taxFrom: string | null }[]).find((x) => x.code === 'CTA-MB-1');
    expect(u).toMatchObject({ path: 'CTB/CTA-MB/CTA-MB-1', level: 3, taxUsed: '0101234567', taxFrom: 'CTB' });
    expect(((await ok('GET', '/api/v1/org-units/tree')).nodes as { code: string; path: string }[]).find((n) => n.code === 'CTA-MB')?.path).toBe('CTB\\CTA-MB');
  });

  it('lịch sử thay đổi: đơn vị, kho — ai, đổi ô nào từ gì sang gì', async () => {
    await ok('PATCH', '/api/v1/co-cau/units/CTA-MB', { name: 'Miền Bắc mới' });
    const dv = await history('branch', 'CTA-MB');
    expect(dv.some((l) => l.changes.some((c) => c.startsWith('Tên: Miền Bắc → Miền Bắc mới')))).toBe(true);
    expect(dv[0]!.by).toBeTruthy();

    await ok('POST', '/api/v1/branches', { code: '00088', name: 'Cửa hàng 88' });
    await ok('PATCH', '/api/v1/branches/00088', { name: 'Cửa hàng 88 mới', orgUnitCode: 'CTA-MB' });
    const br = await history('branch', '00088');
    expect(br.some((l) => l.changes.some((c) => c.startsWith('Tên: Cửa hàng 88 → Cửa hàng 88 mới')))).toBe(true);
    expect(br.some((l) => l.changes.some((c) => c.includes('Thuộc cơ cấu')))).toBe(true);
    expect(((await ok('GET', '/api/v1/branches')) as { code: string }[]).find((x) => x.code === '00088')).toMatchObject({ orgUnitCode: 'CTA-MB' });

    await ok('POST', '/api/v1/warehouses', { code: 'K88', branchCode: '00088', name: 'Kho 88' });
    await ok('PATCH', '/api/v1/warehouses/K88', { name: 'Kho 88 mới' });
    expect((await history('warehouse', 'K88')).some((l) => l.changes.some((c) => c.includes('Kho 88 mới')))).toBe(true);
  });
});
