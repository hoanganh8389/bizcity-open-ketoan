/**
 * Lỗi đợt test 28/10 (file test mua hàng): mỗi lỗi một phép thử tái hiện đúng thao tác, trên dữ liệu mẫu nạp vào một đơn vị mới.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeDoc, rebateFor, type Policy } from '@ketoan/contracts/mua-hang';
import { call, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
type Check = { code: string; level: string; text: string; blocking?: boolean };
type Doc = { id: string; docNo: string; status: string; totals: { total: number }; checks?: Check[] };
const save = async (body: Record<string, unknown>) => { const r = await call(t, 'POST', '/api/v1/purchase/documents', body); expect(r.status, JSON.stringify(r.body)).toBe(201); return r.body.data as Doc; };
const approve = async (id: string) => { const r = await call(t, 'POST', `/api/v1/purchase/documents/${id}/approve`); expect(r.status, JSON.stringify(r.body)).toBe(200); return r.body.data as Doc; };
const analyze = async (body: Record<string, unknown>) => (await call(t, 'POST', '/api/v1/purchase/analyze', body)).body.data.checks as Check[];
const AG = { sku: '110154035', name: 'Anlene Gold hương vani 800g', unit: 'Lon', taxCode: 'V08', lineType: 'buy' };
const NGOAI_DON = { reason: 'Phép thử: nhập ngoài đơn' };

beforeAll(async () => {
  t = await setupTenant();
  const s = await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' });
  expect(s.status, JSON.stringify(s.body)).toBe(200);
}, 60_000);
afterAll(async () => { await t.app.close(); });

describe('Đợt test 28/10', () => {
  it('CT-17 — phiếu trả còn NHÁP không tính là đã trả: nhận 10, nháp trả 8, phiếu trả 5 vẫn duyệt được', async () => {
    await call(t, 'PUT', '/api/v1/partners/NCC-CT17', { name: 'NCC trả hàng', kind: 'supplier' });
    const r = await approve((await save({ kind: 'receipt', outsideOrder: NGOAI_DON, docDate: '2026-10-05', branchCode: 'CN-NA', partnerCode: 'NCC-CT17', priceIncludesVat: false, lines: [{ lineKey: 'a', ...AG, qty: 10, price: 500000, lotNo: 'L', expDate: '2028-01-01' }] })).id);
    const ret = (qty: number) => ({ kind: 'return', docDate: '2026-10-06', branchCode: 'CN-NA', partnerCode: 'NCC-CT17', priceIncludesVat: false, refIds: [r.id], lines: [{ lineKey: 'a', ...AG, qty, price: 500000, lotNo: 'L', expDate: '2028-01-01' }] });
    await save(ret(8)); // nháp, chưa duyệt
    const five = await save(ret(5));
    expect((five.checks ?? []).filter((c) => c.code === 'return_over')).toEqual([]);
    await approve(five.id);
    // Đã duyệt trả 5: nháp trả 8 giờ vượt (chỉ còn 5) — bị chặn đúng.
    expect((await analyze(ret(8))).some((c) => c.code === 'return_over')).toBe(true);
  });

  it('CT-24 — SL 0 và ĐVT chưa khai: chặn duyệt (gửi thẳng máy chủ cũng không lọt), nháp vẫn lưu được', async () => {
    const body = { kind: 'receipt', outsideOrder: NGOAI_DON, docDate: '2026-10-05', branchCode: 'CN-NA', partnerCode: 'NCC-TRUNGHAU', priceIncludesVat: false,
      lines: [{ lineKey: 'a', ...AG, qty: 0, price: 500000, lotNo: 'L', expDate: '2028-01-01' }, { lineKey: 'b', ...AG, unit: 'Bao tải', qty: 3, price: 500000, lotNo: 'L', expDate: '2028-01-01' }] };
    const d = await save(body);
    const block = (d.checks ?? []).filter((c) => c.blocking).map((c) => c.code);
    expect(block).toContain('qty_zero');
    expect(block).toContain('unit_unknown');
    expect((await call(t, 'POST', `/api/v1/purchase/documents/${d.id}/approve`)).status).toBe(409);
    // ĐVT viết khác hoa thường vẫn nhận.
    expect((await analyze({ ...body, lines: [{ lineKey: 'a', ...AG, unit: 'lon', qty: 1, price: 500000, lotNo: 'L', expDate: '2028-01-01' }] })).some((c) => c.code === 'unit_unknown')).toBe(false);
  });

  it('KB-12 — số dư đầu kỳ không khai hạn (480 triệu, 30/09) không bị coi là nợ quá hạn', async () => {
    const checks = await analyze({ kind: 'receipt', outsideOrder: NGOAI_DON, docDate: '2026-10-20', branchCode: 'CN-NA', partnerCode: 'NCC-THANGBAO', priceIncludesVat: false, lines: [{ lineKey: 'a', ...AG, qty: 1, price: 500000, lotNo: 'L', expDate: '2028-01-01' }] });
    const od = checks.find((c) => c.code === 'credit_overdue');
    expect(od?.text ?? '').not.toContain('30/09/2026');
    expect(od?.text ?? '').not.toContain('480.000.000');
  });

  it('KB-11 — sổ công nợ ghi hạn của hoá đơn trả 3 đợt = hạn đợt đầu, không phải ngày hoá đơn', async () => {
    await call(t, 'PUT', '/api/v1/partners/NCC-KB11B', { name: 'NCC trả 3 đợt (sổ)', kind: 'supplier' });
    const r = await approve((await save({ kind: 'receipt', outsideOrder: NGOAI_DON, docDate: '2026-10-08', branchCode: 'CN-NA', partnerCode: 'NCC-KB11B', priceIncludesVat: false,
      lines: [{ lineKey: 'a', ...AG, qty: 200, price: 500000, lotNo: 'L', expDate: '2028-01-01' }],
      schedule: [{ seq: 1, dueDate: '2026-10-20', amount: 30000000 }, { seq: 2, dueDate: '2026-10-30', amount: 40000000 }, { seq: 3, dueDate: '2026-11-10', amount: 38000000 }] })).id);
    const items = (await call(t, 'GET', `/api/v1/debt-items?partnerCode=NCC-KB11B&pageSize=50`)).body.data as { docNo: string; dueDate: string }[];
    const it = (Array.isArray(items) ? items : (items as unknown as { rows: typeof items }).rows).find((x) => x.docNo === r.docNo);
    expect(String(it?.dueDate).slice(0, 10)).toBe('2026-10-20');
  });

  it('KB-15 — chỉ tiêu 110%: thiếu 10.000đ là chưa đạt (không làm tròn % lên), đủ thì đạt', () => {
    const p = { code: 'CT', kind: 'target_rebate', rule: { target: 500_000_000, tiers: [{ fromPct: 100, pct: 2 }, { fromPct: 110, pct: 3 }] } } as unknown as Policy;
    const thieu = rebateFor(p, { total: 549_990_000 });
    expect(thieu.rate).toBe(2);
    expect(thieu.detail.join(' ')).toContain('109,99%'); // số lẻ in kiểu Việt Nam (đợt 30/10)
    expect(rebateFor(p, { total: 550_000_000 }).rate).toBe(3);
  });

  it('CT-24 (đợt 2) — mã chưa có trong danh mục / dòng bỏ trống ĐVT: chặn duyệt', async () => {
    const d = await save({ kind: 'receipt', outsideOrder: NGOAI_DON, docDate: '2026-10-05', branchCode: 'CN-NA', partnerCode: 'NCC-TRUNGHAU', priceIncludesVat: false,
      lines: [{ lineKey: 'a', ...AG, sku: 'KHONG-CO-MA', qty: 1, price: 1000 }, { lineKey: 'b', ...AG, unit: '', qty: 1, price: 1000, lotNo: 'L', expDate: '2028-01-01' }] });
    const block = (d.checks ?? []).filter((c) => c.blocking).map((c) => c.code);
    expect(block).toContain('sku_unknown');
    expect(block).toContain('unit_unknown');
    expect((await call(t, 'POST', `/api/v1/purchase/documents/${d.id}/approve`)).status).toBe(409);
  });

  it('KB-12 (đợt 2) — màn Công nợ đến hạn: số dư đầu kỳ không hạn nằm ở "Chưa đến hạn", không vào nhóm quá hạn', async () => {
    const due = (await call(t, 'GET', '/api/v1/purchase/due?partnerCode=NCC-THANGBAO&asOf=2026-10-28')).body.data as { rows: { docNo: string; bucket: number; dueDate: string }[] };
    const op = due.rows.filter((r) => r.docNo.startsWith('SD'));
    expect(op.length).toBeGreaterThan(0);
    for (const r of op) { expect(r.bucket).toBe(0); expect(r.dueDate).toBe(''); }
  });

  it('KB-05 — trả tiền theo phiếu nhập đã trả hết: cảnh báo (không chặn)', async () => {
    await call(t, 'PUT', '/api/v1/partners/NCC-KB05', { name: 'NCC trả hết', kind: 'supplier' });
    const r = await approve((await save({ kind: 'receipt', outsideOrder: NGOAI_DON, docDate: '2026-10-05', branchCode: 'CN-NA', partnerCode: 'NCC-KB05', priceIncludesVat: false, lines: [{ lineKey: 'a', ...AG, qty: 1, price: 100000, lotNo: 'L', expDate: '2028-01-01' }] })).id);
    const pay = (amount: number) => ({ kind: 'payment', docDate: '2026-10-06', branchCode: 'CN-NA', partnerCode: 'NCC-KB05', amount, refIds: [r.id], lines: [] });
    expect((await analyze(pay(108000))).some((c) => c.code === 'paid_already')).toBe(false);
    await approve((await save(pay(108000))).id);
    const again = await analyze(pay(108000));
    expect(again.find((c) => c.code === 'paid_already')?.level).toBe('warn');
  });

  it('KB-16 — thưởng giai đoạn chỉ chia cho hàng mua trong giai đoạn đạt; mã chỉ mua ở giai đoạn không đạt nhận 0', async () => {
    await call(t, 'PUT', '/api/v1/partners/NCC-KB16', { name: 'NCC giai đoạn', kind: 'supplier' });
    const P = { code: 'KB16-GD', kind: 'stage_rebate', name: 'Thưởng giai đoạn', scope: { partnerCode: 'NCC-KB16' }, rule: { mode: 'stage', stages: [{ from: 1, to: 10, min: 100_000_000, pct: 2 }, { from: 11, to: 20, min: 100_000_000, pct: 2 }] } };
    expect((await call(t, 'POST', '/api/v1/purchase/policies', P)).status).toBeLessThan(300);
    const AV = { ...AG, sku: '110154036', name: 'Anlene vani' };
    // GĐ1 (ngày 5): 120 triệu mã AG → đạt; GĐ2 (ngày 15): 10 triệu mã AV → không đạt.
    await approve((await save({ kind: 'receipt', outsideOrder: NGOAI_DON, docDate: '2026-10-05', branchCode: 'CN-NA', partnerCode: 'NCC-KB16', priceIncludesVat: false, lines: [{ lineKey: 'a', ...AG, qty: 240, price: 500000, lotNo: 'L', expDate: '2028-01-01' }] })).id);
    await approve((await save({ kind: 'receipt', outsideOrder: NGOAI_DON, docDate: '2026-10-15', branchCode: 'CN-NA', partnerCode: 'NCC-KB16', priceIncludesVat: false, lines: [{ lineKey: 'a', ...AV, qty: 20, price: 500000, lotNo: 'L', expDate: '2028-01-01' }] })).id);
    const pv = (await call(t, 'POST', '/api/v1/purchase/rebates/preview', { policyCode: 'KB16-GD', period: '2026-10' })).body.data as { amount: number; allocation: { sku: string; amount: number }[] };
    expect(pv.amount).toBe(2_400_000);
    expect(pv.allocation.find((x) => x.sku === AV.sku)?.amount ?? 0).toBe(0);
    expect(pv.allocation.find((x) => x.sku === AG.sku)?.amount).toBe(2_400_000);
  });

  it('Cộng dồn / giá vốn — mua theo Thùng + quà theo Lon cùng mã: giá vốn / ĐVT quy về ĐVT nhỏ nhất', () => {
    const units = { X: [{ unit: 'Lon', ratio: 1 }, { unit: 'Thùng', ratio: 24 }] };
    const d = { id: 'd', kind: 'receipt', status: 'draft', docNo: '', docDate: '2026-10-05', branchCode: 'B', partnerCode: 'N', priceIncludesVat: false,
      lines: [{ lineKey: 'a', sku: 'X', name: 'X', unit: 'Thùng', qty: 1, price: 240000, taxCode: 'V08', lineType: 'buy' }, { lineKey: 'g', sku: 'X', name: 'X', unit: 'Lon', qty: 6, price: 0, taxCode: 'V08', lineType: 'gift_seller' }] } as never;
    const c = computeDoc(d, [], { units });
    // 240.000 cho 30 Lon = 8.000 / Lon; dòng Thùng = 192.000 / Thùng.
    expect(c.lines.find((l) => l.lineKey === 'g')!.realUnitCost).toBe(8000);
    expect(c.lines.find((l) => l.lineKey === 'a')!.realUnitCost).toBe(192000);
  });

  it('HM-15 (đợt 2) — giao thừa: không kèm câu "khớp"', async () => {
    await call(t, 'PUT', '/api/v1/partners/NCC-HM15', { name: 'NCC giao thừa', kind: 'supplier' });
    const o = await approve((await save({ kind: 'order', docDate: '2026-10-05', branchCode: 'CN-NA', partnerCode: 'NCC-HM15', priceIncludesVat: false, lines: [{ lineKey: 'a', ...AG, qty: 10, price: 500000 }] })).id);
    const checks = await analyze({ kind: 'receipt', refIds: [o.id], docDate: '2026-10-06', branchCode: 'CN-NA', partnerCode: 'NCC-HM15', priceIncludesVat: false, lines: [{ lineKey: 'a', ...AG, qty: 12, price: 500000, lotNo: 'L', expDate: '2028-01-01' }] });
    expect(checks.some((c) => c.code === 'po_over')).toBe(true);
    expect(checks.some((c) => c.code === 'po_match')).toBe(false);
  });
});
