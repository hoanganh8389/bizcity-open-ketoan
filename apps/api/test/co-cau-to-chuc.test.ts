/**
 * [2026-11-13 Nguyễn Văn Thủy] Cơ cấu tổ chức một màn (0131) (đóng góp)
 * Nhiều công ty cha; nút có loại Công ty / Cơ cấu; lịch sử thay đổi của nút (công ty, cửa hàng, kho, phòng ban) ghi ai, đổi gì.
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

beforeAll(async () => { ctx = await setupTenant(); });
afterAll(async () => { await ctx.app.close(); });

describe('Cơ cấu tổ chức một màn', () => {
  it('hai công ty cha song song, công ty con nằm trong cây', async () => {
    await ok('POST', '/api/v1/org-units', { code: 'CTA', name: 'Công ty A' });
    await ok('POST', '/api/v1/org-units', { code: 'CTB', name: 'Công ty B', taxId: '0101234567' });
    await ok('POST', '/api/v1/org-units', { code: 'CTA-CON', name: 'Công ty con của A', parentCode: 'CTA', kind: 'company' });
    await ok('POST', '/api/v1/org-units', { code: 'CTA-MB', name: 'Miền Bắc', parentCode: 'CTA' });
    const nodes = (await ok('GET', '/api/v1/org-units/tree')).nodes as { code: string; kind: string; level: number; parentCode: string | null }[];
    const by = new Map(nodes.map((n) => [n.code, n]));
    expect(by.get('CTA')).toMatchObject({ kind: 'company', level: 0, parentCode: null });
    expect(by.get('CTB')).toMatchObject({ kind: 'company', level: 0, parentCode: null });
    expect(by.get('CTA-CON')).toMatchObject({ kind: 'company', level: 1 });
    expect(by.get('CTA-MB')).toMatchObject({ kind: 'unit', level: 1 });
    // Chuyển nhánh sang công ty cha khác: cấp tính lại theo cây mới.
    await ok('PATCH', '/api/v1/org-units/CTA-MB', { parentCode: 'CTB' });
    expect(((await ok('GET', '/api/v1/org-units/tree')).nodes as { code: string; path: string }[]).find((n) => n.code === 'CTA-MB')?.path).toBe('CTB\\CTA-MB');
  });

  it('lịch sử thay đổi: nút cơ cấu, cửa hàng, kho, phòng ban — ai, đổi ô nào từ gì sang gì', async () => {
    await ok('PATCH', '/api/v1/org-units/CTA-MB', { name: 'Miền Bắc mới' });
    const org = await history('org', 'CTA-MB');
    expect(org.some((l) => l.changes.includes('Tên: Miền Bắc → Miền Bắc mới'))).toBe(true);
    expect(org.some((l) => l.action === 'Thêm')).toBe(true);
    expect(org[0]!.by).toBeTruthy();

    await ok('POST', '/api/v1/branches', { code: '00088', name: 'Cửa hàng 88' });
    await ok('PATCH', '/api/v1/branches/00088', { name: 'Cửa hàng 88 mới', orgUnitCode: 'CTA-MB' });
    const br = await history('branch', '00088');
    expect(br.some((l) => l.changes.some((c) => c.startsWith('Tên: Cửa hàng 88 → Cửa hàng 88 mới')))).toBe(true);
    expect(br.some((l) => l.changes.some((c) => c.includes('Thuộc cơ cấu')))).toBe(true);

    await ok('POST', '/api/v1/warehouses', { code: 'K88', branchCode: '00088', name: 'Kho 88' });
    await ok('PATCH', '/api/v1/warehouses/K88', { name: 'Kho 88 mới' });
    expect((await history('warehouse', 'K88')).some((l) => l.changes.some((c) => c.includes('Kho 88 mới')))).toBe(true);

    await ok('PUT', '/api/v1/dimensions/department/KT', { name: 'Kế toán', extra: { orgUnitCode: 'CTA' } });
    await ok('PUT', '/api/v1/dimensions/department/KT', { name: 'Phòng kế toán', extra: { orgUnitCode: 'CTB' } });
    const dep = await history('department', 'KT');
    expect(dep.some((l) => l.changes.includes('Tên: Kế toán → Phòng kế toán'))).toBe(true);
    expect(dep.some((l) => l.changes.includes('Thuộc cơ cấu: CTA → CTB'))).toBe(true);
  });
});
