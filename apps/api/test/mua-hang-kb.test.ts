/**
 * Lỗi đợt test KB (làm lại 25 tình huống trên UAT): mỗi lỗi một phép thử tái hiện đúng thao tác kế toán, trên dữ liệu mẫu
 * nạp vào một đơn vị mới.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
type Doc = { id: string; docNo: string; kind: string; status: string; note?: string; totals: { beforeTax: number; tax: number; total: number }; dueDate?: string; links: { docNo: string; eventId: string; role: string }[]; checks?: { code: string; level: string; text: string }[]; lines: ({ sku: string; unit: string } & Record<string, unknown>)[] };
let docs: Doc[] = [];
const reload = async () => { docs = (await call(t, 'GET', '/api/v1/purchase/documents')).body.data; };
const byNote = (prefix: string) => { const d = docs.find((x) => x.note?.startsWith(prefix)); if (!d) throw new Error(`Thiếu phiếu mẫu "${prefix}"`); return d; };
const approve = async (id: string) => { const r = await call(t, 'POST', `/api/v1/purchase/documents/${id}/approve`); expect(r.status, JSON.stringify(r.body)).toBe(200); await reload(); return r.body.data as Doc; };
const save = async (body: Record<string, unknown>) => { const r = await call(t, 'POST', '/api/v1/purchase/documents', body); expect(r.status, JSON.stringify(r.body)).toBe(201); return r.body.data as Doc; };
const policy = async (body: Record<string, unknown>) => { const r = await call(t, 'POST', '/api/v1/purchase/policies', body); expect(r.status, JSON.stringify(r.body)).toBeLessThan(300); return r.body.data; };
const AG = { sku: '110154035', name: 'Anlene Gold hương vani 800g', unit: 'Lon', taxCode: 'V08', lineType: 'buy' };
const AV = { sku: '110154036', name: 'Anlene hương vani 800g', unit: 'Lon', taxCode: 'V08', lineType: 'buy' };

beforeAll(async () => {
  t = await setupTenant();
  const s = await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' });
  expect(s.status, JSON.stringify(s.body)).toBe(200);
  await reload();
}, 60_000);
afterAll(async () => { await t.app.close(); });

describe('Đợt test KB', () => {
  it('KB-04 — CKTT 2% khai trong chính sách NCC (không ghi trên phiếu): trả đúng hạn được giảm 781.646, trả trễ bị từ chối', async () => {
    await call(t, 'PUT', '/api/v1/partners/NCC-KB04', { name: 'NCC CKTT theo chính sách', kind: 'supplier' });
    await policy({ code: 'KB04-DK10', kind: 'payment_term', name: 'Hạn 10 ngày làm việc', scope: { partnerCode: 'NCC-KB04' }, rule: { basis: 'invoice_date', days: 10, workingDays: true } });
    await policy({ code: 'KB04-CKTT2', kind: 'payment_discount', name: 'CKTT 2%', scope: { partnerCode: 'NCC-KB04' }, rule: { pct: 2 } });
    const r = await save({ kind: 'receipt', outsideOrder: { reason: 'Phép thử: nhập ngoài đơn' }, docDate: '2026-10-06', branchCode: 'CN-NA', partnerCode: 'NCC-KB04', priceIncludesVat: true, invoice: { no: 'KB04', date: '2026-10-06' }, orderDiscount: { pct: 7 },
      lines: [{ lineKey: 'a', ...AG, qty: 60, price: 528000, lotNo: 'L1', expDate: '2028-01-01' }, { lineKey: 'b', ...AV, qty: 24, price: 431000, lotNo: 'L2', expDate: '2028-01-01' }] });
    const d = await approve(r.id);
    expect(d.totals.total).toBe(39082320);
    const late = await save({ kind: 'payment', docDate: '2026-10-30', branchCode: 'CN-NA', partnerCode: 'NCC-KB04', amount: 38300674, ckttAmount: 781646, refIds: [d.id], lines: [] });
    expect((await call(t, 'POST', `/api/v1/purchase/documents/${late.id}/approve`)).status).toBe(409);
    await call(t, 'POST', `/api/v1/purchase/documents/${late.id}/cancel`);
    const ok = await save({ kind: 'payment', docDate: d.dueDate!, branchCode: 'CN-NA', partnerCode: 'NCC-KB04', amount: 38300674, ckttAmount: 781646, refIds: [d.id], lines: [] });
    await approve(ok.id);
  });

  it('KB-08 — thưởng doanh số tháng cộng doanh số SAU CK bậc tự áp: 300 triệu trước CK, bậc 1,25% → 296,25 triệu → chỉ được 2% = 5.925.000', async () => {
    await call(t, 'PUT', '/api/v1/partners/NCC-KB08', { name: 'NCC thưởng tháng', kind: 'supplier' });
    await policy({ code: 'KB08-BAC', kind: 'qty_tier', name: 'Bậc SL', scope: { partnerCode: 'NCC-KB08', sku: AG.sku }, rule: { tiers: [{ from: 0, pct: 0 }, { from: 500, pct: 1.25 }] }, validFrom: '2026-10-01' });
    await policy({ code: 'KB08-THUONG', kind: 'period_rebate', name: 'Thưởng tháng', scope: { partnerCode: 'NCC-KB08' }, rule: { period: 'month', tiers: [{ from: 200000000, pct: 2 }, { from: 300000000, pct: 3 }], vatPct: 8 }, validFrom: '2026-10-01', validTo: '2026-12-31' });
    const r = await save({ kind: 'receipt', outsideOrder: { reason: 'Phép thử: nhập ngoài đơn' }, docDate: '2026-10-09', branchCode: 'CN-NA', partnerCode: 'NCC-KB08', priceIncludesVat: false, orderDiscount: {}, lines: [{ lineKey: 'a', ...AG, qty: 600, price: 500000, lotNo: 'L8', expDate: '2028-01-01' }] });
    expect((await approve(r.id)).totals.beforeTax).toBe(296250000);
    const pv = (await call(t, 'POST', '/api/v1/purchase/rebates/preview', { policyCode: 'KB08-THUONG', period: '2026-10' })).body.data;
    expect(pv).toMatchObject({ base: 296250000, rate: 2, amount: 5925000 });
  });

  it('KB-25 — CK tự lấy từ chính sách (CKTM 5% + bậc SL riêng một mã): phân bổ cước theo giá trị SAU CK, giá vốn thực tế đúng', async () => {
    await call(t, 'PUT', '/api/v1/partners/NCC-KB25', { name: 'NCC CK theo chính sách', kind: 'supplier' });
    await policy({ code: 'KB25-CKTM', kind: 'trade_discount', name: 'CKTM 5%', scope: { partnerCode: 'NCC-KB25' }, rule: { pct: 5 } });
    await policy({ code: 'KB25-BAC', kind: 'qty_tier', name: 'Bậc Gold', scope: { partnerCode: 'NCC-KB25', sku: AG.sku }, rule: { tiers: [{ from: 0, pct: 0 }, { from: 100, pct: 10 }] } });
    const r = await save({ kind: 'receipt', outsideOrder: { reason: 'Phép thử: nhập ngoài đơn' }, docDate: '2026-10-12', branchCode: 'CN-PT', partnerCode: 'NCC-KB25', priceIncludesVat: false,
      lines: [{ lineKey: 'a', ...AG, qty: 100, price: 500000, lotNo: 'G', expDate: '2028-01-01' }, { lineKey: 'b', ...AV, qty: 100, price: 500000, lotNo: 'V', expDate: '2028-01-01' }] });
    await approve(r.id);
    // Gold: 50tr − 10% = 45tr − 5% = 42.750.000; Vani: 50tr − 5% = 47.500.000 → cước 9.025.000 chia 4.275.000 / 4.750.000
    const c = await save({ kind: 'cost', docDate: '2026-10-12', branchCode: 'CN-PT', partnerCode: 'NCC-VANTAI', amount: 9025000, refIds: [r.id], lines: [] });
    await approve(c.id);
    const al = (await call(t, 'GET', `/api/v1/purchase/allocations/${c.id}`)).body.data;
    expect(al.rows.map((x: { sku: string; amount: number }) => [x.sku, x.amount])).toEqual([[AG.sku, 4275000], [AV.sku, 4750000]]);
    const rc = (await call(t, 'GET', `/api/v1/purchase/real-cost/${r.id}`)).body.data.rows.find((x: { sku: string }) => x.sku === AG.sku);
    expect((rc.before + rc.cost) / rc.qty).toBe(470250);
  });

  it('KB-11 — hoá đơn trả 3 đợt: lập phiếu mới khi chưa đợt nào quá hạn thì KHÔNG báo nợ quá hạn; qua hạn đợt 1 thì chỉ báo đúng đợt 1', async () => {
    await call(t, 'PUT', '/api/v1/partners/NCC-KB11', { name: 'NCC trả 3 đợt', kind: 'supplier' });
    const line = { lineKey: 'a', sku: '110154028', name: 'Anlene Gold 5X hương vani 400g', unit: 'Lon', qty: 400, price: 250000, taxCode: 'V08', lineType: 'buy', lotNo: 'L11', expDate: '2028-01-01' };
    const r = await save({ kind: 'receipt', outsideOrder: { reason: 'Phép thử: nhập ngoài đơn' }, docDate: '2026-10-08', branchCode: 'CN-NA', partnerCode: 'NCC-KB11', priceIncludesVat: false, orderDiscount: {}, lines: [line],
      schedule: [{ seq: 1, dueDate: '2026-10-20', amount: 30000000 }, { seq: 2, dueDate: '2026-10-30', amount: 40000000 }, { seq: 3, dueDate: '2026-11-10', amount: 38000000 }] });
    await approve(r.id);
    const checks = async (docDate: string) => (await call(t, 'POST', '/api/v1/purchase/analyze', { kind: 'receipt', outsideOrder: { reason: 'Phép thử: nhập ngoài đơn' }, docDate, branchCode: 'CN-NA', partnerCode: 'NCC-KB11', priceIncludesVat: false, orderDiscount: {}, lines: [{ ...line, qty: 1 }] })).body.data.checks as { code: string; text: string }[];
    expect((await checks('2026-10-15')).filter((c) => c.code === 'credit_overdue')).toEqual([]);
    const late = (await checks('2026-10-25')).find((c) => c.code === 'credit_overdue');
    expect(late?.text).toContain('30.000.000');
    expect(late?.text).toContain('20/10/2026');
  });

  it('KB-14 — KM người bán 120 chia giá, KM người tiêu dùng 240 KHÔNG chia: tổng hợp mua (MH11) ra 6.456/hộp (không phải 5.463)', async () => {
    const d = await approve(byNote('TH14 + TH19').id);
    expect(d.status).toBe('approved');
    const sum = (await call(t, 'GET', '/api/v1/purchase/summary?from=2026-10-01&to=2026-10-31&groupBy=sku')).body.data.rows.find((r: { key: string }) => r.key === '140181006');
    expect(Math.round(sum.unitCost)).toBe(6456);
    expect(sum).toMatchObject({ buyQty: 1200, giftQty: 360 });
  });

  it('KB-14 — giá vốn tháng (bình quân): 240 hộp quà người tiêu dùng vào tồn nhưng không vào đơn giá → 6.456/hộp như MH11', async () => {
    const run = await call(t, 'POST', '/api/v1/inventory/costing', { period: '2026-10' });
    expect(run.status, JSON.stringify(run.body)).toBe(200);
    const costs = (await call(t, 'GET', '/api/v1/inventory/costs?period=2026-10')).body.data;
    const list = (Array.isArray(costs) ? costs : costs.rows) as { sku: string; unitCost: number; inQty: number; closingQty: number }[];
    const r = list.find((x) => x.sku === '140181006')!;
    expect(Math.round(r.unitCost)).toBe(6456);
    expect(r.closingQty).toBeGreaterThanOrEqual(1560);
  });

  it('KB-14 — tặng khách 240 hộp quà lấy từ phần quà giá 0 (giá vốn 0); bán 100 hộp giá vốn 6.456; tồn + giá vốn = đúng tiền nhập', async () => {
    const d = byNote('TH14 + TH19') as Doc & { branchCode: string };
    const sale = await call(t, 'POST', '/api/v1/documents', saleDoc({ docKey: 'kb14:HD1', docNo: 'KB14-HD1', branchCode: d.branchCode, docDate: '2026-10-28', invoice: undefined,
      lines: [
        { lineKey: 'l1', sku: '140181006', name: 'Hàng KB14', unit: 'Hộp', qty: 100, amountBeforeTax: 1000000, taxCode: 'R08', taxAmount: 80000 },
        { lineKey: 'l2', sku: '140181006', name: 'Hàng KB14', unit: 'Hộp', qty: 240, amountBeforeTax: 0, taxCode: 'R08', taxAmount: 0, isGift: true },
      ], payments: [{ methodCode: 'TM', amount: 1080000 }], totals: { beforeTax: 1000000, tax: 80000, total: 1080000 } }));
    expect(sale.status, JSON.stringify(sale.body)).toBeLessThan(300);
    const run = await call(t, 'POST', '/api/v1/inventory/costing', { period: '2026-10' });
    expect(run.status, JSON.stringify(run.body)).toBe(200);
    const costs = (await call(t, 'GET', '/api/v1/inventory/costs?period=2026-10')).body.data;
    const r = ((Array.isArray(costs) ? costs : costs.rows) as { sku: string; unitCost: number; outQty: number; closingQty: number; closingValue: number; giftQty: number; inValue: number; openingValue: number }[]).find((x) => x.sku === '140181006')!;
    expect(Math.round(r.unitCost)).toBe(6456);
    expect(r.giftQty).toBe(0);
    expect(r.outQty).toBe(100);
    // Tồn có giá trị = (tồn − quà) × đơn giá; cộng giá vốn 100 hộp bán = đúng tiền nhập (không thừa 240 × 6.456).
    expect(Math.abs(r.closingValue + Math.round(100 * r.unitCost) - (r.openingValue + r.inValue))).toBeLessThanOrEqual(r.closingQty);
  });

  it('KB-18 — NCC "công nợ cố định" (không tính hạn từng phiếu): không bị báo quá hạn khi lập phiếu, ở tuổi nợ MH05, ở cột quá hạn MH01', async () => {
    await call(t, 'PUT', '/api/v1/partners/NCC-KB18', { name: 'NCC công nợ cố định', kind: 'supplier' });
    await policy({ code: 'KB18-CODINH', kind: 'payment_term', name: 'Công nợ cố định', scope: { partnerCode: 'NCC-KB18' }, rule: { basis: 'fixed', days: 0, workingDays: false } });
    const line = { lineKey: 'a', ...AG, qty: 10, price: 500000, lotNo: 'L18', expDate: '2028-01-01' };
    const r = await save({ kind: 'receipt', outsideOrder: { reason: 'Phép thử: nhập ngoài đơn' }, docDate: '2026-10-05', branchCode: 'CN-NA', partnerCode: 'NCC-KB18', priceIncludesVat: false, orderDiscount: {}, lines: [line] });
    const d = await approve(r.id);
    expect(d.dueDate).toBeUndefined();
    const a = (await call(t, 'POST', '/api/v1/purchase/analyze', { kind: 'receipt', outsideOrder: { reason: 'Phép thử: nhập ngoài đơn' }, docDate: '2026-10-25', branchCode: 'CN-NA', partnerCode: 'NCC-KB18', priceIncludesVat: false, orderDiscount: {}, lines: [line] })).body.data;
    expect(a.checks.filter((c: { code: string }) => c.code === 'credit_overdue')).toEqual([]);
    const due = (await call(t, 'GET', '/api/v1/purchase/due?partnerCode=NCC-KB18&asOf=2026-10-25')).body.data;
    expect(due.rows.find((x: { docNo: string }) => x.docNo === d.docNo)).toMatchObject({ daysOverdue: 0, bucket: 0 });
    const ncc = (await call(t, 'GET', '/api/v1/purchase/suppliers?scope=all')).body.data.find((x: { code: string }) => x.code === 'NCC-KB18');
    expect(ncc).toMatchObject({ debt: 5400000, overdue: 0 });
  });

  it('KB-20 — quà nhiều nguồn: xuất 35 bộ tri ân trừ lần lượt vào 50 bộ có VAT và 30 bộ không VAT (không dòng nào âm), còn 45 bộ', async () => {
    const g = (await call(t, 'GET', '/api/v1/purchase/gifts')).body.data;
    const bo = g.rows.filter((r: { sku: string; branchCode: string }) => r.sku === 'QT-BO-TRIAN' && r.branchCode === 'CN-ND');
    expect(bo.reduce((s: number, r: { outQty: number }) => s + r.outQty, 0)).toBe(35);
    expect(bo.reduce((s: number, r: { onHand: number }) => s + r.onHand, 0)).toBe(45);
    expect(bo.every((r: { onHand: number }) => r.onHand >= 0)).toBe(true);
    // xuất thêm 45 vẫn được (đủ tồn), 46 thì bị chặn
    const out = (qty: number) => call(t, 'POST', '/api/v1/purchase/analyze', { kind: 'gift_out', docDate: '2026-10-20', branchCode: 'CN-ND', partnerCode: 'NCC-QUATANG', priceIncludesVat: false, lines: [{ lineKey: 'x', sku: 'QT-BO-TRIAN', name: 'Bộ quà', unit: 'Bộ', qty, price: 0, taxCode: 'KKKN', lineType: 'gift_consumer', program: 'TGS-TRI-AN' }] });
    expect((await out(45)).body.data.checks.filter((c: { code: string }) => c.code === 'gift_over')).toEqual([]);
    expect((await out(46)).body.data.checks.map((c: { code: string }) => c.code)).toContain('gift_over');
  });

  it('KB-22 — thưởng 16,5 triệu phân bổ theo mã: giá vốn tháng (bình quân kho) giảm đúng phần thưởng của từng mã', async () => {
    const cost = async () => {
      const r = await call(t, 'POST', '/api/v1/inventory/costing', { period: '2026-10' });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      return (await call(t, 'GET', '/api/v1/inventory/costs?period=2026-10&search=110154028')).body.data as { sku: string; inQty: number; inValue: number; unitCost: number }[];
    };
    const before = (await cost()).find((x) => x.sku === '110154028')!;
    const pv = (await call(t, 'POST', '/api/v1/purchase/rebates/preview', { policyCode: 'ANL-CT-THANG', period: '2026-10', manualTotal: 550000000 })).body.data;
    expect(pv.amount).toBe(16500000);
    const part = pv.allocation.find((a: { sku: string }) => a.sku === '110154028').amount as number;
    const rb = await save({ kind: 'rebate', docDate: '2026-10-23', branchCode: 'CN-PT', partnerCode: 'NCC-ANLENE', brandCode: 'ANLENE', amount: pv.amount, rebate: { policyCode: 'ANL-CT-THANG', period: '2026-10', base: pv.base, rate: pv.rate, detail: pv.detail }, allocation: pv.allocation, lines: [] });
    await approve(rb.id);
    const after = (await cost()).find((x) => x.sku === '110154028')!;
    expect(after.inQty).toBe(before.inQty);
    expect(Math.round(before.inValue - after.inValue)).toBe(part);
    expect(after.unitCost).toBeLessThan(before.unitCost);
  });

  it('KB-23 — trả hàng gắn phiếu gốc: khoản nợ của hoá đơn gốc được trừ ngay (MH05 còn đúng số sau trả, không còn quá hạn phần đã trả)', async () => {
    await call(t, 'PUT', '/api/v1/partners/NCC-KB23', { name: 'NCC trả hàng', kind: 'supplier' });
    const r = await save({ kind: 'receipt', outsideOrder: { reason: 'Phép thử: nhập ngoài đơn' }, docDate: '2026-10-01', branchCode: 'CN-NA', partnerCode: 'NCC-KB23', priceIncludesVat: false, orderDiscount: {}, lines: [{ lineKey: 'a', ...AV, qty: 200, price: 375000, lotNo: 'R', expDate: '2028-01-01' }] });
    const rd = await approve(r.id);
    expect(rd.totals.total).toBe(81000000);
    const ret = await save({ kind: 'return', docDate: '2026-10-15', branchCode: 'CN-NA', partnerCode: 'NCC-KB23', priceIncludesVat: false, orderDiscount: {}, refIds: [r.id], reason: 'Hàng lỗi', lines: [{ lineKey: 'b', ...AV, qty: 2, price: 1000000, lotNo: 'R', expDate: '2028-01-01' }] });
    const back = await approve(ret.id);
    expect(back.totals.total).toBe(2160000);
    const due = (await call(t, 'GET', '/api/v1/purchase/due?partnerCode=NCC-KB23&asOf=2026-10-26')).body.data;
    expect(due.rows.map((x: { docNo: string; remaining: number }) => [x.docNo, x.remaining])).toEqual([[rd.docNo, 78840000]]);
    // bỏ duyệt phiếu trả → đối trừ được gỡ, hoá đơn gốc còn nợ đủ
    const un = await call(t, 'POST', `/api/v1/purchase/documents/${ret.id}/unapprove`, { reason: 'Lập sai' });
    expect(un.status, JSON.stringify(un.body)).toBe(200);
    const due2 = (await call(t, 'GET', '/api/v1/purchase/due?partnerCode=NCC-KB23&asOf=2026-10-26')).body.data;
    expect(due2.rows.map((x: { docNo: string; remaining: number }) => [x.docNo, x.remaining])).toEqual([[rd.docNo, 81000000]]);
  });

  it('KB-24 — tổng hợp mua: cột "Còn nợ NCC" trừ tiền hàng đã trả lại (trả gắn phiếu gốc và trả không gắn phiếu gốc)', async () => {
    await call(t, 'PUT', '/api/v1/partners/NCC-KB24', { name: 'NCC tổng hợp', kind: 'supplier' });
    const line = (qty: number, price: number) => [{ lineKey: 'a', ...AV, qty, price, lotNo: 'S', expDate: '2028-01-01' }];
    const r = await save({ kind: 'receipt', outsideOrder: { reason: 'Phép thử: nhập ngoài đơn' }, docDate: '2026-10-02', branchCode: 'CN-NA', partnerCode: 'NCC-KB24', priceIncludesVat: false, orderDiscount: {}, lines: line(100, 500000) });
    await approve(r.id); // 54.000.000
    const a = await save({ kind: 'return', docDate: '2026-10-10', branchCode: 'CN-NA', partnerCode: 'NCC-KB24', priceIncludesVat: false, orderDiscount: {}, refIds: [r.id], reason: 'Lỗi', lines: line(1, 500000) });
    await approve(a.id); // 540.000 gắn phiếu gốc
    const b = await save({ kind: 'return', docDate: '2026-10-11', branchCode: 'CN-NA', partnerCode: 'NCC-KB24', priceIncludesVat: false, orderDiscount: {}, reason: 'Lỗi', lines: line(1, 500000) });
    await approve(b.id); // 540.000 không gắn phiếu gốc
    const row = (await call(t, 'GET', '/api/v1/purchase/summary?from=2026-10-01&to=2026-10-31&groupBy=partner')).body.data.rows.find((x: { key: string }) => x.key === 'NCC-KB24');
    expect(row.openDebt).toBe(54000000 - 540000 - 540000);
  });

  it('BC-01 — tổng hợp theo mã: khăn ướt 170413004 có CK bậc 5% = 280.000 → 5.320.000, thuế 532.000 như phiếu NM2610051; mỗi dòng kèm danh sách phiếu để mở', async () => {
    const rows = (await call(t, 'GET', '/api/v1/purchase/summary?from=2026-10-01&to=2026-10-27&groupBy=sku')).body.data.rows as { key: string; discount: number; net: number; tax: number; documents: number; docList: { id: string; docNo: string }[] }[];
    const k = rows.find((r) => r.key === '170413004')!;
    expect(k).toMatchObject({ discount: 280000, net: 5320000, tax: 532000 });
    expect(k.docList.map((d) => d.docNo)).toContain('NM2610051');
    expect(k.docList).toHaveLength(k.documents);
  });

  it('CS-12 — tắt chính sách: phiếu đã duyệt mở ra vẫn đúng số đã ghi sổ (CK tự áp đã chốt lúc duyệt)', async () => {
    const r = docs.find((d) => d.kind === 'receipt' && d.status === 'approved' && d.lines.some((l) => l.sku === AG.sku) && (d as unknown as { partnerCode: string }).partnerCode === 'NCC-KB25')!;
    const pols = (await call(t, 'GET', '/api/v1/purchase/policies')).body.data.filter((p: { code: string }) => p.code.startsWith('KB25-'));
    for (const p of pols) await call(t, 'PUT', `/api/v1/purchase/policies/${p.id}`, { ...p, isActive: false });
    const a = (await call(t, 'GET', `/api/v1/purchase/documents/${r.id}`)).body.data;
    expect(a.analysis.calc.payable).toBe(r.totals.total);
    for (const p of pols) await call(t, 'PUT', `/api/v1/purchase/policies/${p.id}`, { ...p, isActive: true });
  });

  it('CS-12 — CK trên đơn khai cho riêng 1 mã hàng: áp vào dòng mã đó (không áp mã khác), chốt khi duyệt; CK đơn chung của NCC vẫn áp cả đơn', async () => {
    await call(t, 'PUT', '/api/v1/partners/NCC-CS12', { name: 'NCC CK riêng mã', kind: 'supplier' });
    await policy({ code: 'CS12-CK-GOLD', kind: 'trade_discount', name: 'CK 4% riêng Gold', scope: { partnerCode: 'NCC-CS12', sku: AG.sku }, rule: { pct: 4 } });
    const lines = [{ lineKey: 'a', ...AG, qty: 10, price: 500000, lotNo: 'G', expDate: '2028-01-01' }, { lineKey: 'b', ...AV, qty: 10, price: 400000, lotNo: 'V', expDate: '2028-01-01' }];
    const body = { kind: 'receipt', outsideOrder: { reason: 'Phép thử: nhập ngoài đơn' }, docDate: '2026-10-12', branchCode: 'CN-PT', partnerCode: 'NCC-CS12', priceIncludesVat: false, lines };
    const calc = (await call(t, 'POST', '/api/v1/purchase/analyze', body)).body.data.calc;
    expect(calc.lines.map((l: { lineDiscount: number }) => l.lineDiscount)).toEqual([200000, 0]);
    expect(calc.orderDiscount).toBe(0);
    const d = await approve((await save(body)).id);
    expect(d.totals.beforeTax).toBe(8800000);
    await policy({ code: 'CS12-CK-CHUNG', kind: 'trade_discount', name: 'CK 2% cả đơn', scope: { partnerCode: 'NCC-CS12' }, rule: { pct: 2 } });
    const c2 = (await call(t, 'POST', '/api/v1/purchase/analyze', body)).body.data.calc;
    // Gold 5tr − 4% = 4,8tr; Vani 4tr; CK đơn 2% × 8,8tr = 176.000
    expect([c2.lines[0].lineDiscount, c2.orderDiscount, c2.beforeTax]).toEqual([200000, 176000, 8624000]);
  });

  it('CT-01 — đơn đặt / phiếu nhập có dòng hàng mua chưa có đơn giá (tổng 0): báo lỗi, không duyệt được (form không cho Ghi); đơn toàn hàng tặng (tổng 0) cũng chặn; hàng tặng kèm hàng mua vẫn được', async () => {
    const body = (price: number, lineType = 'buy') => ({ kind: 'order', docDate: '2026-10-20', branchCode: 'CN-NA', partnerCode: 'NCC-TRUNGHAU', priceIncludesVat: true, lines: [{ lineKey: 'a', ...AG, lineType, qty: 10, price }] });
    const a = (await call(t, 'POST', '/api/v1/purchase/analyze', body(0))).body.data;
    expect(a.checks.find((c: { code: string }) => c.code === 'price_missing')).toMatchObject({ level: 'error', blocking: true });
    const d = await save(body(0));
    const ap = await call(t, 'POST', `/api/v1/purchase/documents/${d.id}/approve`);
    expect(ap.status).toBe(409);
    expect(ap.body.error.message).toContain('chưa có đơn giá');
    expect((await call(t, 'POST', '/api/v1/purchase/analyze', body(528000))).body.data.checks.map((c: { code: string }) => c.code)).not.toContain('price_missing');
    // nhập giá 0 trên form → dòng thành hàng tặng: đơn toàn hàng tặng, tổng 0 cũng bị chặn
    const allGift = (await call(t, 'POST', '/api/v1/purchase/analyze', body(0, 'gift_seller'))).body.data.checks.map((c: { code: string }) => c.code);
    expect(allGift).not.toContain('price_missing');
    expect(allGift).toContain('no_buy_line');
    const mixed = { ...body(528000), lines: [...body(528000).lines, { lineKey: 'g', ...AG, lineType: 'gift_seller', qty: 1, price: 0 }] };
    expect((await call(t, 'POST', '/api/v1/purchase/analyze', mixed)).body.data.checks.map((c: { code: string }) => c.code)).not.toContain('no_buy_line');
  });

  it('HM-04 — điều chuyển hạn mức nhãn: chỉ chuyển được phần CÒN TRỐNG của chi nhánh (hạn mức − nợ nhãn đã ghi − đang chờ)', async () => {
    const pol = ((await call(t, 'GET', '/api/v1/purchase/policies')).body.data as { id: string; code: string }[]).find((p) => p.code === 'ANL-HM-NHAN')!;
    // CN-ND: hạn mức 500 tr, số dư nợ nhãn đầu kỳ 250 tr → còn trống tối đa 250 tr.
    const over = await call(t, 'POST', `/api/v1/purchase/policies/${pol.id}/transfer-limit`, { from: 'CN-ND', to: 'CN-HCM', amount: 300000000 });
    expect(over.status).toBe(400);
    expect(over.body.error.message).toMatch(/phần còn trống của CN-ND/);
    const ok = await call(t, 'POST', `/api/v1/purchase/policies/${pol.id}/transfer-limit`, { from: 'CN-ND', to: 'CN-HCM', amount: 50000000 });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const after = ((await call(t, 'GET', '/api/v1/purchase/policies')).body.data as { code: string; rule: { branches: Record<string, number> } }[]).find((p) => p.code === 'ANL-HM-NHAN')!;
    expect(after.rule.branches).toMatchObject({ 'CN-ND': 450000000, 'CN-HCM': 450000000 });
  });

  it('TP-06 — giá vốn thực tế theo phiếu (MH07): khăn ướt 200 gói hưởng CK bậc 5% tự áp → CK 280.000, sau CK 5.320.000', async () => {
    const d = docs.find((x) => x.note?.startsWith('VD2'))!;
    if (d.status !== 'approved') await approve(d.id);
    const rc = (await call(t, 'GET', `/api/v1/purchase/real-cost/${d.id}`)).body.data as { rows: { sku: string; qty: number; gross: number; disc: number; before: number }[] };
    expect(rc.rows.find((r) => r.sku === '170413004')).toMatchObject({ qty: 200, disc: 280000, before: 5320000 });
  });
});
