// [2026-11-13 10:00 AM kiennt] NT-MH-004 — test chuyển hàng xuống shop (MH19): làm tròn chung, phân bổ khi kho thiếu, chặn chia vượt tồn
/**
 * NT-MH-004 (docs/nghiem-thu/mua-hang/NT-MH-004-chuyen-hang-xuong-shop.md). Chi nhánh cha 09000 (kho 09-HH tồn 60 hộp SUA01, 1 thùng = 12),
 * shop 09001 (S1: max 100, tồn 20 → thiếu 80), 09002 (S2: max 50, tồn 10 → thiếu 40), 09003 (S3: max 30, tồn 25 → thiếu 5).
 * Thứ tự chọn shop: S2, S3, S1.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allocateTransfers } from '@bizcity/mua-hang-domain';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const AS_OF = '2026-11-10';
type L = { shopCode: string; sku: string; want: number; qty: number; short: number; khoTon: number };
const ok = async (method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown) => {
  const r = await call(ctx, method, url, body);
  expect(r.status, `${method} ${url}: ${JSON.stringify(r.body)}`).toBeLessThan(300);
  return r.body.data;
};
const doc = (o: Record<string, unknown>) => call(ctx, 'POST', '/api/v1/documents', o).then((r) => expect(r.status, JSON.stringify(r.body)).toBeLessThan(300));
const buy = (key: string, branch: string, qty: number) => doc({
  docType: 'purchase', docKey: key, branchCode: branch, docNo: key, docDate: '2026-11-01', partner: { code: 'NCC-CS', name: 'NCC chuyển shop' },
  lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa SUA01', unit: 'Hộp', qty, amountBeforeTax: qty * 10000, taxCode: 'V08', taxAmount: 0 }],
  totals: { beforeTax: qty * 10000, tax: 0, total: qty * 10000 },
});
const ORDER = '09002,09003,09001';
const suggest = async (q: string) => ((await ok('GET', `/api/v1/stock/transfer-suggest?branchCode=09000&asOf=${AS_OF}&${q}`)) as { lines: L[] }).lines;
const pick = (ls: L[], f: 'want' | 'qty') => Object.fromEntries(['09001', '09002', '09003'].map((s) => [s, ls.find((l) => l.shopCode === s)?.[f] ?? 0]));

beforeAll(async () => {
  ctx = await setupTenant();
  for (const [code, name] of [['09000', 'Kho tổng'], ['09001', 'Shop 1'], ['09002', 'Shop 2'], ['09003', 'Shop 3']]) await ok('POST', '/api/v1/branches', { code, name });
  await ok('POST', '/api/v1/warehouses', { code: '09-HH', branchCode: '09000', name: 'Kho hàng', isDefault: true });
  for (const c of ['09001', '09002', '09003']) await ok('POST', '/api/v1/warehouses', { code: c, branchCode: c, name: `Kho ${c}`, isDefault: true });
  await ok('PUT', '/api/v1/catalog/products/SUA01?new=true', { name: 'Sữa SUA01', unit: 'Hộp', taxInCode: 'V08', units: [{ unit: 'Hộp', ratio: 1, isDefault: true }, { unit: 'Thùng', ratio: 12, isPurchaseDefault: true }] });
  await call(ctx, 'PUT', '/api/v1/partners/NCC-CS', { name: 'NCC chuyển shop', kind: 'supplier' });
  await buy('cs:K', '09000', 60);
  await buy('cs:S1', '09001', 20);
  await buy('cs:S2', '09002', 10);
  await buy('cs:S3', '09003', 25);
  await ok('POST', '/api/v1/stock/hierarchy/auto', {});
  await ok('PUT', '/api/v1/stock/levels', { items: [{ branchCode: '09001', sku: 'SUA01', max: 100 }, { branchCode: '09002', sku: 'SUA01', max: 50 }, { branchCode: '09003', sku: 'SUA01', max: 30 }] });
});
afterAll(async () => { await ctx.app.close(); });

describe('NT-MH-004 — số muốn chuyển theo cách làm tròn', () => {
  it('Không làm tròn 80 / 40 / 5 · Nguyên thùng 84 / 36 / 0 · Theo cài từng mã (Tự động) 84 / 40 / 5', async () => {
    expect(pick(await suggest('rounding=none'), 'want')).toEqual({ '09001': 80, '09002': 40, '09003': 5 });
    expect(pick(await suggest('rounding=pack'), 'want')).toEqual({ '09001': 84, '09002': 36, '09003': 0 });
    expect(pick(await suggest('rounding=sku'), 'want')).toEqual({ '09001': 84, '09002': 40, '09003': 5 });
  });
});

describe('NT-MH-004 — chia kho 60 hộp khi không đủ (không làm tròn, chọn S2, S3, S1)', () => {
  it('Thiếu nhiều nhất trước: 60 / 0 / 0', async () => {
    expect(pick(await suggest(`rounding=none&allocation=shortage&shopCodes=${ORDER}`), 'qty')).toEqual({ '09001': 60, '09002': 0, '09003': 0 });
  });
  it('Theo thứ tự shop đã chọn: S1 15, S2 40, S3 5; cột thiếu S1 = 65', async () => {
    const ls = await suggest(`rounding=none&allocation=selected&shopCodes=${ORDER}`);
    expect(pick(ls, 'qty')).toEqual({ '09001': 15, '09002': 40, '09003': 5 });
    expect(ls.find((l) => l.shopCode === '09001')!.short).toBe(65);
  });
  it('Chia đều: S1 27, S2 28, S3 5', async () => {
    expect(pick(await suggest(`rounding=none&allocation=equal&shopCodes=${ORDER}`), 'qty')).toEqual({ '09001': 27, '09002': 28, '09003': 5 });
  });
  it('Chia đều + Nguyên thùng: S1 24, S2 36, S3 0', async () => {
    expect(pick(await suggest(`rounding=pack&allocation=equal&shopCodes=${ORDER}`), 'qty')).toEqual({ '09001': 24, '09002': 36, '09003': 0 });
  });
  it('Chỉnh tay: để trống (0) cho mọi shop', async () => {
    expect(pick(await suggest(`rounding=none&allocation=manual&shopCodes=${ORDER}`), 'qty')).toEqual({ '09001': 0, '09002': 0, '09003': 0 });
  });
  it('Chưa chọn shop: theo thứ tự mã shop (S1 trước) — theo thứ tự cho S1 60', async () => {
    expect(pick(await suggest('rounding=none&allocation=selected'), 'qty')).toEqual({ '09001': 60, '09002': 0, '09003': 0 });
  });
});

describe('NT-MH-004 — chốt đề nghị', () => {
  it('Chỉnh tay tổng 70 > tồn kho 60 → không cho chốt; tổng 60 → chốt được, lần phân tích sau kho chia được còn 0', async () => {
    const bad = await call(ctx, 'POST', '/api/v1/stock/transfer-requests', { fromBranch: '09000', shops: [
      { toBranch: '09001', lines: [{ sku: 'SUA01', name: 'Sữa SUA01', unit: 'Hộp', qty: 40 }] }, { toBranch: '09002', lines: [{ sku: 'SUA01', name: 'Sữa SUA01', unit: 'Hộp', qty: 30 }] },
    ] });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toMatch(/SUA01: chia 70 > tồn kho 60/);
    const r = await call(ctx, 'POST', '/api/v1/stock/transfer-requests', { fromBranch: '09000', shops: [
      { toBranch: '09001', lines: [{ sku: 'SUA01', name: 'Sữa SUA01', unit: 'Hộp', qty: 30 }] }, { toBranch: '09002', lines: [{ sku: 'SUA01', name: 'Sữa SUA01', unit: 'Hộp', qty: 30 }] },
    ] });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const ls = await suggest('rounding=none&allocation=selected');
    expect(ls[0]!.khoTon).toBe(0);
    // Chốt thêm khi kho đã giữ hết cho đề nghị trước → vượt.
    const more = await call(ctx, 'POST', '/api/v1/stock/transfer-requests', { fromBranch: '09000', shops: [{ toBranch: '09003', lines: [{ sku: 'SUA01', name: 'Sữa SUA01', unit: 'Hộp', qty: 1 }] }] });
    expect(more.status).toBe(400);
  });
});

describe('NT-MH-004 — lệch chuẩn', () => {
  const needs = [{ shopCode: 'S1', max: 100, ton: 20 }, { shopCode: 'S2', max: 50, ton: 10 }, { shopCode: 'S3', max: 30, ton: 25 }];
  const run = (alloc: 'shortage' | 'selected' | 'equal' | 'manual', avail: number, mode: 'unit' | 'pack' = 'unit', pack?: number) =>
    allocateTransfers(needs.map((n) => ({ ...n, sku: 'X', diDuong: 0, pack, mode })), avail, 0.5, { allocation: alloc, order: ['S2', 'S3', 'S1'] }).map((l) => l.qty);
  it('Kho đủ hàng (200): mọi cách phân bổ = số muốn chuyển', () => {
    for (const a of ['shortage', 'selected', 'equal', 'manual'] as const) expect(run(a, 200)).toEqual([80, 40, 5]);
  });
  it('Mã không có thùng, chọn Nguyên thùng → như không làm tròn', () => {
    expect(run('selected', 60, 'pack')).toEqual([15, 40, 5]);
  });
});
