/**
 * Hoá đơn đầu vào của NCC (MH22): lưu hoá đơn theo cách NCC ghi, nhận diện mã bên mình, học cách ghi, đối soát với phiếu nhập.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { matchLine, nameScore, normalizeParsed, reconcileInvoice, type InvoiceLine } from '@ketoan/contracts/mua-hang';
import { call, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
type Check = { code: string; level: string; text: string; blocking?: boolean };
const NCC = 'NCC-HD';
const U = [{ unit: 'Lon', ratio: 1, isDefault: true }, { unit: 'Thùng', ratio: 24, isPurchaseDefault: true }];
const line = (o: Partial<Record<string, unknown>> = {}) => ({ nccSku: 'AB-G800', nccName: 'SUA BOT ABBOTT GROW HUONG VANI 800G', nccUnit: 'THUNG', qty: 2, price: 9_600_000, amount: 19_200_000, taxRate: 8, taxAmount: 1_536_000, ...o });
const inv = (no: string, lines: Record<string, unknown>[], o: Record<string, unknown> = {}) => {
  const before = lines.reduce((s, l) => s + Number(l.amount ?? 0), 0), tax = lines.reduce((s, l) => s + Number(l.taxAmount ?? 0), 0);
  return { partnerCode: NCC, form: '1', series: 'C26TAB', no, date: '2026-10-20', sellerTaxCode: '0101234567', totalBeforeTax: before, totalTax: tax, total: before + tax, source: 'excel', lines, ...o };
};
const rcpt = (no: string, qty: number, price: number, extra: Record<string, unknown> = {}) => ({
  kind: 'receipt', outsideOrder: { reason: 'Phép thử hoá đơn NCC' }, docDate: '2026-10-20', branchCode: 'CN-NA', partnerCode: NCC, priceIncludesVat: false,
  invoice: { no, serial: 'C26TAB', date: '2026-10-20' }, lines: [{ lineKey: 'a', sku: 'HD-G800', name: 'Sữa bột Abbott Grow vani 800g', unit: 'Thùng', qty, price, taxCode: 'V08', lineType: 'buy' }], ...extra,
});
const analyze = async (body: Record<string, unknown>) => (await call(t, 'POST', '/api/v1/purchase/analyze', body)).body.data.checks as Check[];

beforeAll(async () => {
  t = await setupTenant();
  await call(t, 'PUT', `/api/v1/partners/${NCC}`, { name: 'NCC hoá đơn', kind: 'supplier' });
  await call(t, 'PUT', '/api/v1/catalog/products/HD-G800?new=true', { name: 'Sữa bột Abbott Grow vani 800g', unit: 'Lon', taxInCode: 'V08', units: U });
  await call(t, 'PUT', '/api/v1/catalog/products/HD-G400?new=true', { name: 'Sữa bột Abbott Grow vani 400g', unit: 'Lon', taxInCode: 'V08', units: U });
}, 60_000);
afterAll(async () => { await t.app.close(); });

describe('Nhận diện mã (hàm thuần)', () => {
  it('tên gần giống nhưng khác quy cách (400g / 800g) bị giảm điểm', () => {
    const a = nameScore('SUA BOT ABBOTT GROW HUONG VANI 800G', 'Sữa bột Abbott Grow vani 800g');
    const b = nameScore('SUA BOT ABBOTT GROW HUONG VANI 800G', 'Sữa bột Abbott Grow vani 400g');
    expect(a).toBeGreaterThan(0.6);
    expect(b).toBeLessThan(a * 0.7);
  });
  it('thứ tự tin cậy: đã học > khai mặt hàng NCC > NCC ghi đúng mã mình; không chắc thì chỉ gợi ý', () => {
    const src = { aliases: [{ nccSku: 'X1', nccName: '', nccUnit: 'THUNG', sku: 'A', unit: 'Thùng' }], declared: [{ sku: 'B', unit: 'Lon', nccSku: 'X1' }, { sku: 'C', unit: 'Lon', nccName: 'Sữa C hộp giấy 180ml' }], products: [{ sku: 'A', name: 'Hàng A' }, { sku: 'B', name: 'Hàng B' }, { sku: 'C', name: 'Sữa C 180ml' }, { sku: 'D1', name: 'Bánh D' }], units: {} };
    expect(matchLine({ nccSku: 'X1', nccName: 'gì cũng được', nccUnit: 'Thùng' }, src)).toMatchObject({ sku: 'A', matchSource: 'alias' });
    expect(matchLine({ nccSku: '', nccName: 'SỮA C HỘP GIẤY 180ML', nccUnit: 'hộp' }, src)).toMatchObject({ sku: 'C', matchSource: 'declared' });
    expect(matchLine({ nccSku: 'd1', nccName: 'Banh', nccUnit: '' }, src)).toMatchObject({ sku: 'D1', matchSource: 'own_sku' });
    const g = matchLine({ nccSku: '', nccName: 'Sua C 180 ml loc 4', nccUnit: '' }, src);
    expect(g.sku).toBeNull();
    expect(g.candidates?.[0]?.sku).toBe('C');
  });
  it('chuẩn hoá: hoá đơn ghi giá gồm thuế → quy về chưa thuế; dòng giá 0 = hàng tặng; thiếu tổng thì tự cộng', () => {
    const n = normalizeParsed({ no: '12', priceIncludesVat: true, lines: [{ nccName: 'A', qty: 10, price: 108_000, taxRate: 8 }, { nccName: 'Quà', qty: 1, price: 0, taxRate: 8 }] });
    expect(n.lines[0]).toMatchObject({ price: 100_000, amount: 1_000_000, taxAmount: 80_000, isGift: false });
    expect(n.lines[1]!.isGift).toBe(true);
    expect(n.total).toBe(1_080_000);
  });
  it('đối soát quy về ĐVT nhỏ nhất: HĐ 2 Thùng = phiếu 48 Lon là khớp; lệch SL / giá / thuế báo đúng loại', () => {
    const units = { S: [{ unit: 'Lon', ratio: 1 }, { unit: 'Thùng', ratio: 24 }] };
    const l: InvoiceLine = { lineNo: 1, nccSku: '', nccName: 'S', nccUnit: 'T', qty: 2, price: 2_400_000, discountAmount: 0, amount: 4_800_000, taxRate: 8, taxAmount: 384_000, isGift: false, sku: 'S', unit: 'Thùng', matchSource: 'alias' };
    const tot = { beforeTax: 4_800_000, tax: 384_000, total: 5_184_000 };
    const ok = reconcileInvoice({ lines: [l], totalBeforeTax: 4_800_000, totalTax: 384_000, total: 5_184_000 }, [{ sku: 'S', unit: 'Lon', qty: 48, beforeTax: 4_800_000, taxRate: 8, gift: false }], units, tot);
    expect(ok.ok).toBe(true);
    const bad = reconcileInvoice({ lines: [l], totalBeforeTax: 4_800_000, totalTax: 384_000, total: 5_184_000 }, [{ sku: 'S', unit: 'Lon', qty: 40, beforeTax: 4_400_000, taxRate: 10, gift: false }], units, { beforeTax: 4_400_000, tax: 440_000, total: 4_840_000 });
    expect(bad.rows[0]!.states).toEqual(expect.arrayContaining(['lech_sl', 'lech_gia', 'lech_thue']));
    expect(bad.ok).toBe(false);
  });
});

describe('Hoá đơn NCC qua API', () => {
  let firstId = '';
  it('lần đầu: dòng chưa nhận diện có gợi ý đúng mã 800g (không phải 400g); chọn mã → lưu + học', async () => {
    const prep = (await call(t, 'POST', '/api/v1/purchase/invoices/prepare', { partnerCode: NCC, invoices: [{ series: 'C26TAB', no: '0000101', date: '2026-10-20', lines: [line()] }] })).body.data;
    const l0 = prep[0].lines[0];
    expect(l0.sku).toBeNull();
    expect(l0.candidates[0].sku).toBe('HD-G800');
    expect(l0.candidates[0].unit).toBe('Thùng');
    const r = await call(t, 'POST', '/api/v1/purchase/invoices', inv('0000101', [{ ...line(), sku: 'HD-G800', unit: 'Thùng', matchSource: 'manual' }]));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    firstId = r.body.data.id;
    const al = (await call(t, 'GET', `/api/v1/purchase/invoice-aliases?partnerCode=${NCC}`)).body.data;
    expect(al).toHaveLength(1);
    expect(al[0]).toMatchObject({ nccSku: 'AB-G800', sku: 'HD-G800', unit: 'Thùng', productName: 'Sữa bột Abbott Grow vani 800g' });
  });

  it('lần sau: cùng cách ghi tự nhận đúng mã (đã học), kể cả NCC đổi tên hàng mà giữ mã', async () => {
    const prep = (await call(t, 'POST', '/api/v1/purchase/invoices/prepare', { partnerCode: NCC, invoices: [{ series: 'C26TAB', no: '102', lines: [line({ nccName: 'Abbott Grow Gold 800g (mẫu mới)' })] }] })).body.data;
    expect(prep[0].lines[0]).toMatchObject({ sku: 'HD-G800', unit: 'Thùng', matchSource: 'alias' });
  });

  it('trùng hoá đơn (số 101 = 0000101, cùng ký hiệu): ghi bị chặn, xem trước báo trùng; khác ký hiệu thì được', async () => {
    expect((await call(t, 'POST', '/api/v1/purchase/invoices', inv('101', [line()]))).status).toBe(409);
    const prep = (await call(t, 'POST', '/api/v1/purchase/invoices/prepare', { partnerCode: NCC, invoices: [{ series: 'C26TAB', no: '101', lines: [line()] }] })).body.data;
    expect(prep[0].duplicateOf).toBe(firstId);
    const imp = (await call(t, 'POST', '/api/v1/purchase/invoices/import', { invoices: [inv('101', [line()]), inv('101', [line()], { series: 'C26TXY' })] })).body.data;
    expect(imp.saved).toHaveLength(1);
    expect(imp.skipped[0].label).toBe('C26TAB-101');
  });

  it('phiếu nhập cùng số hoá đơn: 48 Lon (= 2 Thùng) đúng giá → khớp; 40 Lon → cảnh báo lệch (không chặn)', async () => {
    const okChecks = await analyze(rcpt('101', 2, 9_600_000));
    expect(okChecks.find((c) => c.code === 'inv_match')).toBeTruthy();
    const lon = await analyze({ ...rcpt('101', 48, 400_000), lines: [{ lineKey: 'a', sku: 'HD-G800', name: 'x', unit: 'Lon', qty: 48, price: 400_000, taxCode: 'V08', lineType: 'buy' }] });
    expect(lon.find((c) => c.code === 'inv_match')).toBeTruthy();
    const bad = await analyze({ ...rcpt('101', 0, 0), lines: [{ lineKey: 'a', sku: 'HD-G800', name: 'x', unit: 'Lon', qty: 40, price: 400_000, taxCode: 'V08', lineType: 'buy' }] });
    const d = bad.find((c) => c.code === 'inv_diff');
    expect(d?.level).toBe('warn');
    expect(d?.blocking).toBeFalsy();
    expect(d?.text).toContain('HD-G800');
    // Số hoá đơn chưa lưu ở MH22 (NCC đã dùng MH22) → nhắc; NCC chưa dùng MH22 → không nhắc gì.
    expect((await analyze(rcpt('999', 2, 9_600_000))).some((c) => c.code === 'inv_not_stored')).toBe(true);
  });

  it('danh sách: tình trạng theo phiếu nhập (chưa có phiếu → có phiếu khớp), chi tiết có đối soát từng mã', async () => {
    let list = (await call(t, 'GET', `/api/v1/purchase/invoices?partnerCode=${NCC}`)).body.data as { id: string; no: string; state: string }[];
    expect(list.find((x) => x.id === firstId)?.state).toBe('chua_co_phieu');
    const saved = await call(t, 'POST', '/api/v1/purchase/documents', rcpt('101', 2, 9_600_000));
    expect(saved.status, JSON.stringify(saved.body)).toBe(201);
    list = (await call(t, 'GET', `/api/v1/purchase/invoices?partnerCode=${NCC}`)).body.data;
    expect(list.find((x) => x.id === firstId)?.state).toBe('khop');
    const one = (await call(t, 'GET', `/api/v1/purchase/invoices/${firstId}`)).body.data;
    expect(one.receipts).toHaveLength(1);
    expect(one.reconcile.rows[0]).toMatchObject({ sku: 'HD-G800', invQty: 48, rcptQty: 48, states: ['khop'] });
  });

  it('dòng chưa nhận diện vẫn lưu được (chọn mã sau); hoá đơn tình trạng "chưa nhận diện"', async () => {
    const r = await call(t, 'POST', '/api/v1/purchase/invoices', inv('200', [line({ nccSku: '', nccName: 'Hàng lạ chưa có', qty: 1, price: 10_000, amount: 10_000, taxAmount: 800 })]));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const list = (await call(t, 'GET', `/api/v1/purchase/invoices?partnerCode=${NCC}`)).body.data as { id: string; state: string; unmatched: number }[];
    expect(list.find((x) => x.id === r.body.data.id)).toMatchObject({ state: 'chua_nhan_dien', unmatched: 1 });
    // Mã không có trong danh mục / ĐVT chưa khai → báo lỗi, không lưu.
    expect((await call(t, 'POST', '/api/v1/purchase/invoices', inv('201', [{ ...line(), sku: 'KHONG-CO', unit: 'Lon' }]))).status).toBe(400);
    expect((await call(t, 'POST', '/api/v1/purchase/invoices', inv('202', [{ ...line(), sku: 'HD-G800', unit: 'Bao' }]))).status).toBe(400);
  });

  it('việc cần làm: hoá đơn còn dòng chưa nhận diện mã (đỏ, dẫn tới MH22 lọc sẵn) và hoá đơn chưa có phiếu nhập', async () => {
    const items = (await call(t, 'GET', '/api/v1/purchase/todo')).body.data.items as { key: string; level: string; count: number; path: string }[];
    const un = items.find((x) => x.key === 'inv_unmatched');
    expect(un).toMatchObject({ level: 'error', path: '/mua-hang/hoa-don-ncc?tinh-trang=chua_nhan_dien' });
    expect(un!.count).toBeGreaterThanOrEqual(1);
    // HĐ 101 đã có phiếu nhập (lập ở phép thử trên) → không tính; HĐ 200 (chưa nhận diện) + C26TXY-101 chưa có phiếu.
    expect(items.find((x) => x.key === 'inv_no_receipt')!.count).toBeGreaterThanOrEqual(2);
  });

  it('huỷ: bắt buộc lý do, không sửa được nữa; số hoá đơn được dùng lại; xoá cách ghi đã học', async () => {
    expect((await call(t, 'POST', `/api/v1/purchase/invoices/${firstId}/cancel`, { reason: '' })).status).toBe(400);
    expect((await call(t, 'POST', `/api/v1/purchase/invoices/${firstId}/cancel`, { reason: 'Nhập nhầm, NCC xuất lại' })).status).toBe(200);
    expect((await call(t, 'PUT', `/api/v1/purchase/invoices/${firstId}`, inv('101', [line()]))).status).toBe(409);
    expect((await call(t, 'POST', '/api/v1/purchase/invoices', inv('101', [{ ...line(), sku: 'HD-G800', unit: 'Thùng', matchSource: 'alias' }]))).status).toBe(201);
    const al = (await call(t, 'GET', `/api/v1/purchase/invoice-aliases?partnerCode=${NCC}`)).body.data;
    expect((await call(t, 'DELETE', `/api/v1/purchase/invoice-aliases/${al[0].id}`)).status).toBe(200);
    const logs = (await call(t, 'GET', '/api/v1/purchase/logs')).body.data as { event: string }[];
    expect(logs.map((l) => l.event)).toEqual(expect.arrayContaining(['invoice_created', 'alias_learned', 'invoice_cancelled', 'invoice_imported', 'alias_deleted']));
  });

  it('NCC ghi ĐVT mà mã không có (THUNG, mã chỉ có Lon / Lốc): KHÔNG đoán ĐVT; chưa chọn ĐVT thì không lưu; chọn xong thì học cả ĐVT', async () => {
    await call(t, 'PUT', '/api/v1/catalog/products/HD-TH110?new=true', { name: 'Sữa tươi TH có đường 110ml', unit: 'Hộp', taxInCode: 'V08', units: [{ unit: 'Hộp', ratio: 1, isDefault: true }, { unit: 'Lốc', ratio: 4 }] });
    const l = { nccSku: 'TH-110', nccName: 'SUA TUOI TH CO DUONG 110ML', nccUnit: 'THUNG', qty: 10, price: 258_711, amount: 2_587_110, taxRate: 8, taxAmount: 206_969 };
    const prep = (await call(t, 'POST', '/api/v1/purchase/invoices/prepare', { partnerCode: NCC, invoices: [{ no: '300', lines: [l] }] })).body.data;
    const c = prep[0].lines[0].candidates.find((x: { sku: string }) => x.sku === 'HD-TH110');
    expect(c.unit).toBe('');
    const r = await call(t, 'POST', '/api/v1/purchase/invoices', inv('300', [{ ...l, sku: 'HD-TH110', matchSource: 'manual' }]));
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain('THUNG');
    // Thùng ở NCC này = Lốc của mình (ví dụ): chọn Lốc → lưu, học; lần sau tự ra Lốc.
    expect((await call(t, 'POST', '/api/v1/purchase/invoices', inv('300', [{ ...l, sku: 'HD-TH110', unit: 'Lốc', matchSource: 'manual' }]))).status).toBe(201);
    const again = (await call(t, 'POST', '/api/v1/purchase/invoices/prepare', { partnerCode: NCC, invoices: [{ no: '301', lines: [l] }] })).body.data;
    expect(again[0].lines[0]).toMatchObject({ sku: 'HD-TH110', unit: 'Lốc', matchSource: 'alias' });
  });

  it('gõ tay chưa chọn NCC: vẫn gợi ý theo danh mục (không báo trùng hoá đơn)', async () => {
    const r = await call(t, 'POST', '/api/v1/purchase/invoices/prepare', { partnerCode: '', invoices: [{ no: 'goi-y', lines: [{ nccName: 'abbott grow 800g', nccUnit: 'lon', qty: 1 }] }] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data[0].lines[0].candidates[0]).toMatchObject({ sku: 'HD-G800', unit: 'Lon' });
    expect(r.body.data[0].duplicateOf).toBeUndefined();
  });

  it('quét AI khi chưa cấu hình dịch vụ: báo rõ, không lỗi máy chủ', async () => {
    expect((await call(t, 'GET', '/api/v1/purchase/invoices/scan/config')).body.data.configured).toBe(false);
    const r = await call(t, 'POST', '/api/v1/purchase/invoices/scan', { partnerCode: NCC, fileName: 'hd.pdf', mime: 'application/pdf', dataBase64: 'JVBERi0=' });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain('INVOICE_AI_URL');
  });
});
