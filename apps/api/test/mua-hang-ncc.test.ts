/**
 * Mua hàng — đi từ NHÀ CUNG CẤP: hạn thanh toán theo các hợp đồng thật (Vinh Châu, Bảo Huy, Diana, Lifesfood, Hoàng Tuấn,
 * Hoàng Gia Phú, Đại Thịnh, hoá đơn điều chỉnh), mã hàng theo quy tắc mã hàng (K/M/Q/T, combo, quà), hàng tặng giá 0 tự
 * nhận, nhập Excel, đơn đặt → phiếu nhập (giao nhiều lần), đổi mã phải duyệt, hồ sơ NCC, tệp đính kèm, đề xuất đặt min–max.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  autoLineType, brandShare, computeDoc, promoBoard, syncGifts, docsFromImport, dueDateFor, importRows, orderProgress, readTable, receiptFromOrder, skuInfo, supplierItemsOf, termText,
  defaultUnitFor, priceFor, type PDoc, type PaymentTerm, type Policy, type SupplierProduct,
} from '@ketoan/contracts/mua-hang';
import { call, setupTenant, type TestCtx } from './helpers.js';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { dependentsOf, listDocsFor, receiptsWithSku } from '../src/phan-he/mua-hang/store.js';

const doc = (o: Partial<PDoc> = {}) => ({ docDate: '2026-04-06', ...o });
const due = (t: Partial<PaymentTerm>, d = doc(), holidays: string[] = []) => dueDateFor({ basis: 'receipt_date', days: 0, workingDays: false, ...t }, d, holidays);
const HOL = ['2026-04-27', '2026-04-30', '2026-05-01'];

describe('Hạn thanh toán theo hợp đồng thật', () => {
  it('Vinh Châu / Bảo Huy: 10 ngày làm việc (trừ T7, CN, lễ) từ ngày nhận đủ hàng và hồ sơ', () => {
    expect(due({ days: 10, dayType: 'working' })).toBe('2026-04-20');
    // Nhận đủ hồ sơ muộn hơn ngày phiếu → hạn tính từ ngày nhận hồ sơ; qua lễ 27/4, 30/4, 1/5.
    expect(due({ days: 10, dayType: 'working' }, doc({ docDate: '2026-04-13', receivedDate: '2026-04-20' }), HOL)).toBe('2026-05-07');
  });
  it('Diana: 15 ngày làm việc chỉ trừ CN + lễ, trả vào ngày cố định 5 / 15 / 25 (lấy ngày trả gần nhất không trễ hạn)', () => {
    expect(due({ days: 15, dayType: 'working6' })).toBe('2026-04-23');
    expect(due({ days: 15, dayType: 'working6', payDays: [5, 15, 25] })).toBe('2026-04-15');
  });
  it('Lifesfood: 30 ngày lịch; rơi vào T7 / CN / lễ thì sang ngày làm việc kế tiếp', () => {
    expect(due({ days: 30, dayType: 'calendar' })).toBe('2026-05-06');
    expect(due({ days: 30, dayType: 'calendar' }, doc({ docDate: '2026-04-01' }), HOL)).toBe('2026-05-04');
  });
  it('Hoàng Tuấn: trước ngày 25 hàng tháng (nhận sau ngày 25 thì ngày 25 tháng sau)', () => {
    expect(due({ monthDay: 25 }, doc({ docDate: '2026-04-10' }))).toBe('2026-04-27'); // 25/4 là thứ Bảy
    expect(due({ monthDay: 25 }, doc({ docDate: '2026-04-26' }))).toBe('2026-05-25');
  });
  it('Hoàng Gia Phú: nhận hàng trả ngay; Đại Thịnh: trả trước khi giao; công nợ cố định không tính hạn', () => {
    expect(due({ basis: 'immediate' }, doc({ docDate: '2026-04-11' }))).toBe('2026-04-13');
    expect(due({ basis: 'prepay' }, doc({ docDate: '2026-04-07' }))).toBe('2026-04-07');
    expect(due({ basis: 'fixed' })).toBeUndefined();
  });
  it('Hoá đơn sai phải điều chỉnh: hạn lùi đúng số ngày NCC sửa hoá đơn', () => {
    expect(due({ days: 10, dayType: 'working' }, doc({ invoiceFix: { from: '2026-04-08', to: '2026-04-13' } }))).toBe('2026-04-27');
  });
  it('điều khoản bằng chữ', () => {
    expect(termText({ basis: 'receipt_date', days: 15, workingDays: true, dayType: 'working6', payDays: [5, 15, 25] })).toMatch(/15 ngày làm việc \(trừ CN, lễ\) từ ngày nhận đủ hàng và hồ sơ; trả vào ngày 5, 15, 25/);
  });
});

describe('Mã hàng theo quy tắc mã hàng và hàng tặng tự nhận', () => {
  it('đọc ngành / nhãn / nhóm, đuôi K M Q T, combo nhóm 8, quà KM', () => {
    expect(skuInfo('110054057')).toMatchObject({ kind: 'normal', industry: '11', brand: '005', group: '4' });
    expect(skuInfo('110154016M')).toMatchObject({ kind: 'promo', base: '110154016' });
    expect(skuInfo('110054056K').kind).toBe('share');
    expect(skuInfo('110154026Q').kind).toBe('clip');
    expect(skuInfo('130181002T').kind).toBe('stamp');
    expect(skuInfo('110058001').kind).toBe('combo');
    expect(skuInfo('Q00610017')).toMatchObject({ kind: 'gift', brand: '006' });
    expect(skuInfo('AN-GOLD').kind).toBe('other');
  });
  it('dòng giá 0 = hàng tặng: mặc định chia giá; theo chính sách KM của NCC; mã M luôn là quà cho khách', () => {
    const ctx = { policies: [] as Policy[], date: '2026-04-23', partnerCode: 'NC100227' };
    expect(autoLineType('130181002', 5389, ctx)).toBe('buy');
    expect(autoLineType('130181002', 0, ctx)).toBe('gift_seller');
    expect(autoLineType('110154016M', 0, ctx)).toBe('gift_consumer');
    const promo: Policy = { id: '1', code: 'KM', kind: 'promo_gift', name: '', scope: { partnerCode: 'NC100227' }, isActive: true, rule: { buy: 10, get: 1, splitIntoCost: false } };
    expect(autoLineType('130181002', 0, { ...ctx, policies: [promo] })).toBe('gift_consumer');
    expect(autoLineType('130181002', 0, ctx, false)).toBe('gift_consumer');
  });
});

describe('Nhập Excel (dạng file xuất phiếu nhập — VD1 Vinh Châu)', () => {
  const table = [
    ['Trả lại : False (56 items)'], [],
    ['', 'Mã NCC', 'Nhà cung cấp', 'Mã hàng', 'Tên hàng', 'Nhóm hàng', 'Ngày', 'Số phiếu', 'Kho', 'Lý do', 'Số lượng', 'Ghi chú', 'Đơn giá', 'Chiết khấu($)', 'Thuế', 'ĐG sau thuế', 'Thành tiền', 'TT trước thuế', 'Nhân viên', 'ĐVT', 'Line type', 'Chi nhánh', 'ĐVCB', 'Số lượng của ĐVCB', 'CK(%)', 'Giá Net', 'Nhóm hàng C2', 'Nhóm hàng C3', 'TT chưa CK', 'Ngày tạo', 'Số HĐ', 'TT trước VAT', 'LOTNO', 'EXPDATE'],
    ['', 'NC100227', 'Công ty TNHH Thương Mại Vinh Châu', '130181002', 'Sữa tươi TH có đường 110ml', 'x', '4/23/2026 8:39', 'NK1426042221', '14-HH', 'NMH1', 14400, '', 5389.8125, 1940332, 6053837.5, 5810, 81726805.5, 75672968, 'NV', 'Hộp', '', '14000', 'Hộp', 14400, 2.5, 5255.07, 'TH', 'Sữa tươi', 77613300, '', '4430', 77613300, '9618M', '11/18/2026'],
    ['', 'NC100227', 'Công ty TNHH Thương Mại Vinh Châu', '130181002', 'Sữa tươi TH có đường 110ml', 'x', '4/23/2026 8:39', 'NK1426042221', '14-HH', 'NMH1', 632, '', 0, 0, 0, '', 0, 0, 'NV', 'Hộp', '', '14000', 'Hộp', 632, 0, 0, 'TH', 'Sữa tươi', 0, '', '4430', 0, '9618M', '11/18/2026'],
    ['', 'NC100227', 'Công ty TNHH Thương Mại Vinh Châu', '140181001', 'Sữa chua TH Việt Quất 100g', 'x', '4/23/2026 8:39', 'NK1426042221', '14-HH', 'NMH1', 576, '', 7210.1875, 166122.72, 318955.6, 7763, 4305900.9, 3986945.28, 'NV', 'Hộp', '', '14000', 'Hộp', 576, 4, 6921.78, 'TH', 'Sữa chua ăn', 4153068, '', '4430', 4153068, '9630E', '5/30/2026'],
  ];
  it('nhận cột theo tên tiêu đề, ngày dạng m/d/yyyy, dòng giá 0 là hàng tặng chia giá; gom theo NCC + chi nhánh + số HĐ', () => {
    const r = importRows(table);
    expect(r.missing).toEqual([]);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ partnerCode: 'NC100227', sku: '130181002', qty: 14400, price: 5389.8125, discountPct: 2.5, invoiceNo: '4430', lotNo: '9618M', expDate: '2026-11-18', branchCode: '14000', date: '2026-04-23' });
    const docs = docsFromImport(r.rows, { kind: 'receipt', date: '2026-04-23', priceIncludesVat: false, policies: [], taxOf: () => 'V08', nameOf: () => undefined });
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ partnerCode: 'NC100227', branchCode: '14000', invoice: { no: '4430' }, docDate: '2026-04-23' });
    expect(docs[0]!.lines.map((l) => l.lineType)).toEqual(['buy', 'gift_seller', 'buy']);
  });
});

describe('Đơn đặt → phiếu nhập (giao nhiều lần)', () => {
  const order = { id: 'o1', kind: 'order', status: 'approved', docNo: 'DH01', docDate: '2026-04-01', branchCode: 'B', partnerCode: 'N', priceIncludesVat: false,
    lines: [{ lineKey: 'a', sku: '110154029', name: 'Anlene 5X 800g', unit: 'Lon', qty: 100, price: 500000, taxCode: 'V08', lineType: 'buy' }, { lineKey: 'g', sku: '110154029', name: 'Anlene 5X 800g', unit: 'Lon', qty: 10, price: 0, taxCode: 'V08', lineType: 'gift_seller' }] } as PDoc;
  it('đã nhận / còn lại; phiếu nhập lập từ đơn chép phần còn lại, hàng tặng theo tỷ lệ; nhận bằng mã Q vẫn trừ đơn', () => {
    const first = receiptFromOrder(order, [order], '2026-04-05');
    expect(first.lines.map((l) => [l.lineType, l.qty])).toEqual([['buy', 100], ['gift_seller', 10]]);
    const r1 = { ...first, id: 'r1', docNo: 'NM01', status: 'approved', lines: [{ ...first.lines[0]!, qty: 60 }, { ...first.lines[1]!, qty: 6 }] } as PDoc;
    const p = orderProgress(order, [order, r1]);
    expect(p).toMatchObject({ ordered: 100, received: 60, remaining: 40, done: false });
    const second = receiptFromOrder(order, [order, r1], '2026-04-08');
    expect(second.lines.map((l) => [l.lineType, l.qty])).toEqual([['buy', 40], ['gift_seller', 4]]);
    const r2 = { ...second, id: 'r2', status: 'draft', lines: [{ ...second.lines[0]!, sku: '110154029Q' }] } as PDoc;
    // Hàng mua đủ nhưng quà mới nhận 6 / 10: đơn CHƯA xong (thiếu quà 4); lập tiếp từ đơn chỉ ra 4 quà còn thiếu.
    expect(orderProgress(order, [order, r1, r2])).toMatchObject({ buyDone: true, giftShort: 4, done: false, remaining: 0 });
    expect(receiptFromOrder(order, [order, r1, r2], '2026-04-10').lines.map((l) => [l.lineType, l.qty])).toEqual([['gift_seller', 4]]);
    const r3 = { ...second, id: 'r3', status: 'draft', lines: [{ ...second.lines[1]!, qty: 4 }] } as PDoc;
    expect(orderProgress(order, [order, r1, r2, r3]).done).toBe(true);
  });
  it('đơn 2 mã mua + 1 quà khác mã: phiếu nhập chỉ có hàng mua → "thiếu quà", lập từ đơn ra đúng dòng quà; đơn không quà vẫn như cũ', () => {
    const ord = { ...order, id: 'o3', lines: [
      { lineKey: 'a', sku: '110061004', name: 'Similac Mom', unit: 'Hộp', qty: 15, price: 448446, taxCode: 'V08', lineType: 'buy' },
      { lineKey: 'b', sku: '110062006', name: 'Similac Neosure', unit: 'Hộp', qty: 2, price: 400000, taxCode: 'V08', lineType: 'buy' },
      { lineKey: 'g', sku: '100861002', name: 'Bimbosan Stage 1', unit: 'Lon', qty: 1, price: 0, taxCode: 'V08', lineType: 'gift_consumer' },
    ] } as PDoc;
    const rec = { ...ord, id: 'r5', kind: 'receipt', refIds: ['o3'], lines: ord.lines.filter((l) => l.lineType === 'buy') } as PDoc;
    const p = orderProgress(ord, [ord, rec]);
    expect(p).toMatchObject({ buyDone: true, giftShort: 1, done: false });
    expect(p.gifts[0]).toMatchObject({ sku: '100861002', ordered: 1, received: 0, remaining: 1 });
    expect(receiptFromOrder(ord, [ord, rec], '2026-10-29').lines.map((l) => [l.sku, l.lineType, l.qty])).toEqual([['100861002', 'gift_consumer', 1]]);
    // Chưa nhận gì: lập từ đơn ra đủ 2 dòng mua + dòng quà.
    expect(receiptFromOrder(ord, [ord], '2026-10-29').lines.map((l) => [l.sku, l.qty])).toEqual([['110061004', 15], ['110062006', 2], ['100861002', 1]]);
    const noGift = { ...ord, id: 'o4', lines: ord.lines.filter((l) => l.lineType === 'buy') } as PDoc;
    expect(orderProgress(noGift, [noGift, { ...rec, refIds: ['o4'] } as PDoc])).toMatchObject({ gifts: [], giftShort: 0, done: true });
  });
  it('ĐVT là trung gian: đặt 10 Thùng (48 Hộp), nhận 240 Hộp + 2 Thùng → còn 3 Thùng = 144 Hộp; phiếu tiếp theo chép đúng 3 Thùng', () => {
    const units = { A: [{ unit: 'Hộp', ratio: 1 }, { unit: 'Lốc', ratio: 4 }, { unit: 'Thùng', ratio: 48 }] };
    const ord = { ...order, id: 'o2', lines: [{ lineKey: 'a', sku: 'A', name: 'Sữa', unit: 'Thùng', qty: 10, price: 240000, taxCode: 'V08', lineType: 'buy' }] } as PDoc;
    const rec = { ...ord, id: 'r9', kind: 'receipt', outsideOrder: { reason: 'Phép thử: nhập ngoài đơn' }, refIds: ['o2'], lines: [{ ...ord.lines[0]!, unit: 'Hộp', qty: 240, price: 5000 }, { ...ord.lines[0]!, lineKey: 'b', unit: 'Thùng', qty: 2 }] } as PDoc;
    const p = orderProgress(ord, [ord, rec], undefined, units);
    expect(p.lines[0]).toMatchObject({ unit: 'Thùng', ordered: 10, received: 7, remaining: 3, baseUnit: 'Hộp', orderedBase: 480, receivedBase: 336, remainingBase: 144 });
    expect(p).toMatchObject({ ordered: 480, received: 336, remaining: 144, done: false });
    expect(receiptFromOrder(ord, [ord, rec], '2026-04-09', units).lines.map((l) => [l.unit, l.qty])).toEqual([['Thùng', 3]]);
    // Không có bảng ĐVT (dữ liệu cũ): cộng thẳng như trước.
    expect(orderProgress(ord, [ord, rec]).lines[0]!.received).toBe(242);
  });
});

describe('Chiết khấu theo mã hàng (một chính sách — bảng nhiều mã)', () => {
  const pol = { id: 'p1', code: 'N-CKMA', kind: 'item_discount', name: 'CTKM tháng 11', scope: { partnerCode: 'N' }, isActive: true,
    rule: { items: [{ sku: 'A', pct: 3 }, { sku: 'A', pct: 5, minQty: 100 }, { sku: 'B', amount: 500, unit: 'Hộp' }] } } as Policy;
  const doc = (lines: Partial<PDoc['lines'][number]>[]) => ({ kind: 'receipt', outsideOrder: { reason: 'Phép thử: nhập ngoài đơn' }, status: 'draft', id: 'd', docNo: '', docDate: '2026-11-05', branchCode: 'X', partnerCode: 'N', priceIncludesVat: false, orderDiscount: {},
    lines: lines.map((l, i) => ({ lineKey: `l${i}`, sku: 'A', name: '', unit: 'Hộp', qty: 10, price: 10000, taxCode: 'V08', lineType: 'buy', ...l })) }) as PDoc;
  it('dòng đúng mã tự được CK; SL đạt mức cao hơn lấy bậc cao hơn; giảm tiền / ĐVT chỉ khi đúng ĐVT; CK nhập tay trên dòng thắng bảng', () => {
    const c = computeDoc(doc([{ qty: 10 }, { qty: 120 }, { sku: 'B', qty: 4 }, { sku: 'B', unit: 'Thùng', qty: 1 }, { sku: 'C' }, { qty: 10, discountPct: 1 }]), [pol]);
    expect(c.lines.map((l) => l.lineDiscount)).toEqual([3000, 60000, 2000, 0, 0, 1000]);
    expect(c.trace.filter((t) => t.kind === 'item_discount')).toHaveLength(3);
    // NCC khác: không áp.
    expect(computeDoc({ ...doc([{ qty: 10 }]), partnerCode: 'M' }, [pol]).lines[0]!.lineDiscount).toBe(0);
  });
});

describe('Mặt hàng NCC cung cấp + đọc Excel tổng quát', () => {
  it('gộp danh mục đã khai với lịch sử mua (lần gần nhất: ngày, SL, giá)', () => {
    const pol: SupplierProduct = { id: 'p1', partnerCode: 'N', sku: 'A', unit: 'Thùng', isDefaultUnit: true, nccSku: 'X-A', price: 2400, priceIncludesVat: false, warnPct: 2, isActive: true };
    const docs = [
      { id: '1', kind: 'receipt', outsideOrder: { reason: 'Phép thử: nhập ngoài đơn' }, status: 'approved', docNo: 'NM1', docDate: '2026-04-01', branchCode: 'B', partnerCode: 'N', priceIncludesVat: false, lines: [{ lineKey: 'a', sku: 'A', name: 'Hàng A', unit: 'Hộp', qty: 10, price: 100, taxCode: 'V08', lineType: 'buy' }, { lineKey: 'b', sku: 'B', name: 'Hàng B', unit: 'Hộp', qty: 5, price: 50, taxCode: 'V08', lineType: 'buy' }] },
      { id: '2', kind: 'receipt', outsideOrder: { reason: 'Phép thử: nhập ngoài đơn' }, status: 'approved', docNo: 'NM2', docDate: '2026-04-09', branchCode: 'B', partnerCode: 'N', priceIncludesVat: false, lines: [{ lineKey: 'a', sku: 'A', name: 'Hàng A', unit: 'Hộp', qty: 12, price: 110, taxCode: 'V08', lineType: 'buy' }] },
    ] as PDoc[];
    const items = supplierItemsOf('N', [pol], docs);
    expect(items.map((x) => x.sku)).toEqual(['A', 'B']);
    expect(items[0]).toMatchObject({ declared: true, unit: 'Thùng', nccSku: 'X-A', price: 2400, lastDocNo: 'NM2', lastQty: 12, lastPrice: 110, lastUnit: 'Hộp' });
    expect(items[1]).toMatchObject({ declared: false, lastQty: 5 });
  });
  it('readTable: nhận cột theo tên (không dấu, không phân biệt hoa thường), bỏ dòng trống', () => {
    const t = readTable([['Danh mục'], ['MÃ HÀNG', 'Quy cách', 'Mã hàng NCC'], ['130181002', 48, 'TH-1'], ['', '', ''], ['140181001', '', '']], [['sku', ['ma hang']], ['pack', ['quy cach']], ['nccSku', ['ma hang ncc']]], 'sku');
    expect(t.rows.map((r) => [r.sku, r.pack, r.nccSku])).toEqual([['130181002', '48', 'TH-1'], ['140181001', '', '']]);
  });
});

describe('API: hồ sơ NCC, đính kèm, đổi mã, đề xuất đặt hàng', () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await setupTenant();
    expect((await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' })).body.data.errors).toEqual([]);
  }, 60_000);
  afterAll(async () => { await t.app.close(); });

  it('danh sách NCC: nợ theo sổ, hạn mức, điều khoản bằng chữ, số chính sách; hồ sơ có công nợ, mua theo tháng, nhật ký', async () => {
    const list = (await call(t, 'GET', '/api/v1/purchase/suppliers')).body.data as { code: string; debt: number; creditLimit: number; term: string; policies: number; documents: number }[];
    const th = list.find((x) => x.code === 'NCC-TRUNGHAU')!;
    expect(th.debt).toBeGreaterThan(0);
    expect(th).toMatchObject({ creditLimit: 600000000 });
    expect(th.term).toMatch(/10 ngày làm việc/);
    expect(th.policies).toBeGreaterThan(2);
    const prof = (await call(t, 'GET', '/api/v1/purchase/suppliers/NCC-TRUNGHAU')).body.data;
    expect(prof.partner.name).toMatch(/Trung Hậu/);
    expect(prof.months.length).toBeGreaterThan(0);
    expect(prof.credit.limit).toBe(600000000);
  });
  it('chính sách lưu người tạo + thời gian; sửa ghi nhật ký có giá trị trước', async () => {
    const r = await call(t, 'POST', '/api/v1/purchase/policies', { code: 'NCC-TRUNGHAU-HD', kind: 'contract', name: 'Hợp đồng Trung Hậu', scope: { partnerCode: 'NCC-TRUNGHAU' }, rule: { no: '07/2026/HĐMB', signedOn: '2026-01-02' }, validFrom: '2026-01-01', validTo: '2026-12-31' });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const p = ((await call(t, 'GET', '/api/v1/purchase/policies')).body.data as { code: string; createdBy: string; createdAt: string }[]).find((x) => x.code === 'NCC-TRUNGHAU-HD')!;
    expect(p.createdBy).toBeTruthy();
    expect(p.createdAt).toMatch(/^\d{4}-/);
  });
  it('Vinh Châu (dữ liệu mẫu): hạn mức 600tr, hạn 10 ngày làm việc từ ngày nhận đủ hồ sơ 22/10 → 05/11; đơn mới giao một phần', async () => {
    const list = (await call(t, 'GET', '/api/v1/purchase/suppliers')).body.data as { code: string; creditLimit: number; term: string; contractTo?: string; openOrders: number }[];
    expect(list.find((x) => x.code === 'NC100227')).toMatchObject({ creditLimit: 600000000, contractTo: '2026-12-31', openOrders: 1 });
    expect(list.find((x) => x.code === 'NC100495')!.term).toMatch(/trả vào ngày 5, 15, 25/);
    const docs = (await call(t, 'GET', '/api/v1/purchase/documents?partnerCode=NC100227')).body.data as PDoc[] & { dueDate?: string }[];
    const rec = docs.find((d) => d.docNo === 'NM2610061') as PDoc & { dueDate?: string; status: string };
    expect(rec).toMatchObject({ status: 'approved', dueDate: '2026-11-05' });
    const ord = docs.find((d) => d.docNo === 'DH2610061')!;
    expect(orderProgress(ord, docs)).toMatchObject({ done: false, remaining: 1152 - 576 + 1728 });
  });
  it('mặt hàng & giá mua: thêm / cập nhật hàng loạt; ĐVT phải có ở mặt hàng; lịch sử phiếu / chính sách ghi rõ đổi gì', async () => {
    const r = await call(t, 'POST', '/api/v1/purchase/supplier-products', { rows: [{ partnerCode: 'NC100227', sku: '130181002', unit: 'Thùng', isDefaultUnit: true, price: 260000 }, { partnerCode: 'NC100227', sku: '110154035', unit: 'Lon' }] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toEqual({ added: 1, updated: 1 });
    const bad = await call(t, 'POST', '/api/v1/purchase/supplier-products', { rows: [{ partnerCode: 'NC100227', sku: '130181002', unit: 'Bao' }] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toMatch(/không có ĐVT "Bao".*Hộp, Lốc, Thùng/);
    const list = (await call(t, 'GET', '/api/v1/purchase/supplier-products?partnerCode=NC100227')).body.data as { rows: SupplierProduct[]; units: Record<string, { unit: string; ratio: number }[]> };
    expect(list.rows.find((x) => x.sku === '130181002')).toMatchObject({ unit: 'Thùng', price: 260000, isDefaultUnit: true });
    expect(list.units['130181002']!.map((u) => `${u.unit}=${u.ratio}`)).toEqual(['Hộp=1', 'Lốc=4', 'Thùng=48']);
    // Sửa một phiếu nháp → nhật ký "doc_saved" ghi các thay đổi.
    const docs = (await call(t, 'GET', '/api/v1/purchase/documents')).body.data as (PDoc & { status: string })[];
    const d = docs.find((x) => x.status === 'draft' && x.kind === 'receipt' && x.lines.length)!;
    const changed = { ...d, note: 'Sửa thử', lines: d.lines.map((l, i) => (i === 0 ? { ...l, qty: l.qty + 1 } : l)) };
    expect((await call(t, 'PUT', `/api/v1/purchase/documents/${d.id}`, changed)).status).toBe(200);
    const h = (await call(t, 'GET', `/api/v1/purchase/logs?docNo=${encodeURIComponent(d.docNo)}`)).body.data as { event: string; data: { changes?: string[] } }[];
    const saved = h.find((x) => x.event === 'doc_saved')!;
    expect(saved.data.changes!.join(' | ')).toMatch(/Ghi chú: .* → Sửa thử/);
    expect(saved.data.changes!.join(' | ')).toMatch(new RegExp(`Dòng ${d.lines[0]!.sku}: SL ${d.lines[0]!.qty} → ${d.lines[0]!.qty + 1}`));
    const pols = (await call(t, 'GET', '/api/v1/purchase/policies')).body.data as Policy[];
    const p = pols.find((x) => x.code === 'NC100227-HANMUC')!;
    expect((await call(t, 'PUT', `/api/v1/purchase/policies/${p.id}`, { ...p, rule: { ...p.rule, limit: 700000000 } })).status).toBe(200);
    const ph = (await call(t, 'GET', '/api/v1/purchase/logs?docNo=NC100227-HANMUC')).body.data as { event: string; user: string; data: { rule: { limit: number }; before: { rule: { limit: number } } } }[];
    expect(ph[0]).toMatchObject({ event: 'policy_changed', data: { rule: { limit: 700000000 }, before: { rule: { limit: 600000000 } } } });
    expect(ph[0]!.user).toBeTruthy();
  });
  it('CSDL tối ưu: phân tích / lưu / duyệt chỉ đọc chứng từ liên quan; lịch sử giá và phiếu phụ thuộc tra bằng chỉ mục', async () => {
    const all = (await call(t, 'GET', '/api/v1/purchase/documents')).body.data as (PDoc & { status: string })[];
    const tid = String((await db.selectFrom('tenants').select('id').where('code', '=', t.tenantCode).executeTakeFirstOrThrow()).id);
    const vc2 = all.find((d) => d.docNo === 'NM2610061')!;
    const rel = await listDocsFor(db, tid, vc2);
    // Cùng NCC + đơn gốc, và phiếu khác có dòng cùng nhãn (hạn mức toàn nhãn tính cả NCC khác bán cùng nhãn).
    expect(rel.map((d) => d.docNo)).toEqual(expect.arrayContaining(['DH2610061', 'NM2610061']));
    const brands = new Set(vc2.lines.map((l) => l.brandCode).filter(Boolean));
    for (const d of rel.filter((x) => x.partnerCode !== vc2.partnerCode && !(x.refIds ?? []).includes(vc2.id) && !(vc2.refIds ?? []).includes(x.id))) {
      expect(d.brandCode && brands.has(d.brandCode) || d.lines.some((l) => l.brandCode && brands.has(l.brandCode))).toBe(true);
    }
    expect(rel.length).toBeLessThan(all.length / 5);
    // Chi phí vận chuyển (NCC khác) trỏ tới phiếu nhập Anlene: vẫn được đọc cùng phiếu nhập; bỏ duyệt phiếu nhập bị chặn vì phiếu phụ thuộc.
    const anl = all.find((d) => d.docNo === 'NM2610021')!;
    expect((await listDocsFor(db, tid, anl)).map((d) => d.docNo)).toContain('CP2610001');
    expect((await dependentsOf(db, tid, anl.id)).map((d) => d.docNo)).toContain('CP2610001');
    expect((await receiptsWithSku(db, tid, '130181002', '2026-12-31')).map((d) => d.docNo)).toEqual(['NM2610061']);
    const idx = (await sql<{ indexname: string }>`SELECT indexname FROM pg_indexes WHERE tablename IN ('purchase_documents', 'purchase_policies')`.execute(db)).rows.map((r) => r.indexname);
    expect(idx).toEqual(expect.arrayContaining(['purchase_documents_lines_gin', 'purchase_documents_refs_gin', 'purchase_documents_date_idx', 'purchase_policies_partner_idx', 'purchase_policies_sku_idx']));
  });
  it('ĐVT nhiều cấp: ĐVT mua mặc định theo NCC; giá theo Thùng quy ra giá theo Hộp; nhập 2 Thùng → kho ghi 96 Hộp', async () => {
    const list = (await call(t, 'GET', '/api/v1/purchase/supplier-products?partnerCode=NC100227&withGeneral=1')).body.data as { rows: SupplierProduct[]; units: Record<string, { unit: string; ratio: number; isPurchaseDefault?: boolean }[]> };
    const us = list.units['130181002']!;
    expect(defaultUnitFor(us, list.rows, 'NC100227', '130181002')).toBe('Thùng');
    expect(priceFor(list.rows, { date: '2026-10-25', partnerCode: 'NC100227', sku: '130181002', unit: 'Hộp' }, us)!.price).toBeCloseTo(260000 / 48, 2);
    const doc = { kind: 'receipt', outsideOrder: { reason: 'Phép thử: nhập ngoài đơn' }, docDate: '2026-10-25', branchCode: 'CN-NA', partnerCode: 'NC100227', priceIncludesVat: false, orderDiscount: {}, invoice: { no: 'TH-THUNG-1', date: '2026-10-25' },
      lines: [{ lineKey: 'a', sku: '130181002', name: 'Sữa tươi TH', unit: 'Thùng', qty: 2, price: 260000, taxCode: 'V08', lineType: 'buy', lotNo: 'L-T', expDate: '2027-06-01' }] };
    const saved = (await call(t, 'POST', '/api/v1/purchase/documents', doc)).body.data as { id: string };
    const ap = await call(t, 'POST', `/api/v1/purchase/documents/${saved.id}/approve`);
    expect(ap.status, JSON.stringify(ap.body)).toBe(200);
    const ev = ap.body.data.links[0].eventId as string;
    const mv = await db.selectFrom('inventory_movements').select(['qty', 'unit', 'amount']).where('event_id', '=', ev).execute();
    expect(mv.map((m) => [Number(m.qty), m.unit, Number(m.amount)])).toEqual([[96, 'Hộp', 520000]]);
  });
  it('đơn đặt theo Thùng, phiếu nhập theo Hộp: đối chiếu số lượng và đơn giá quy về ĐVT nhỏ nhất', async () => {
    const line = { lineKey: 'a', sku: '130181002', name: 'Sữa tươi TH', unit: 'Thùng', qty: 10, price: 240000, taxCode: 'V08', lineType: 'buy' };
    const ord = (await call(t, 'POST', '/api/v1/purchase/documents', { kind: 'order', docDate: '2026-10-25', branchCode: 'CN-NA', partnerCode: 'NC100227', priceIncludesVat: false, orderDiscount: {}, lines: [line] })).body.data as { id: string; docNo: string };
    const rec = (unit: string, qty: number, price: number) => ({ kind: 'receipt', outsideOrder: { reason: 'Phép thử: nhập ngoài đơn' }, docDate: '2026-10-26', branchCode: 'CN-NA', partnerCode: 'NC100227', priceIncludesVat: false, orderDiscount: {}, refIds: [ord.id],
      invoice: { no: `TH-DVT-${unit}-${qty}`, date: '2026-10-26' }, lines: [{ ...line, unit, qty, price, lotNo: 'L1', expDate: '2027-06-01' }] });
    type A = { checks: { code: string; text: string }[] };
    const part = (await call(t, 'POST', '/api/v1/purchase/analyze', rec('Hộp', 240, 5000))).body.data as A;
    expect(part.checks.find((c) => c.code === 'po_partial')?.text).toMatch(/còn 5 Thùng \(240 Hộp\)/);
    expect(part.checks.map((c) => c.code)).not.toContain('po_over');
    expect(part.checks.map((c) => c.code)).not.toContain('po_price');
    const full = (await call(t, 'POST', '/api/v1/purchase/analyze', rec('Hộp', 480, 5000))).body.data as A;
    expect(full.checks.map((c) => c.code)).toContain('po_match');
    const over = (await call(t, 'POST', '/api/v1/purchase/analyze', rec('Hộp', 500, 5000))).body.data as A;
    expect(over.checks.find((c) => c.code === 'po_over')?.text).toMatch(/nhận 10,42 Thùng \(500 Hộp\)/);
    const dear = (await call(t, 'POST', '/api/v1/purchase/analyze', rec('Hộp', 480, 5200))).body.data as A;
    expect(dear.checks.find((c) => c.code === 'po_price')?.text).toMatch(/= 249\.600 \/ Thùng/);
  });

  it('mặt hàng & giá mua: kiểm ngày hiệu lực, dòng trùng trong một lần lưu, "giao mặc định" phải có NCC; xoá hẳn một dòng', async () => {
    const post = (rows: unknown[]) => call(t, 'POST', '/api/v1/purchase/supplier-products', { rows });
    expect((await post([{ partnerCode: 'NC100227', sku: '140181001', unit: 'Hộp', price: 7000, validFrom: '2026-11-10', validTo: '2026-11-01' }])).status).toBe(400);
    expect((await post([{ partnerCode: null, sku: '140181001', unit: 'Hộp', price: 7000, isDefaultUnit: true }])).status).toBe(400);
    const dup = await post([{ partnerCode: 'NC100227', sku: '140181001', unit: 'Lốc', price: 28000 }, { partnerCode: 'NC100227', sku: '140181001', unit: 'lốc', price: 29000 }]);
    expect(dup.status).toBe(400);
    expect(dup.body.error.message).toMatch(/Dòng 1 và dòng 2 trùng nhau/);
    expect((await post([{ partnerCode: 'NC100227', sku: '140181001', unit: 'Lốc', price: -1 }])).status).toBe(400);
    expect((await post([{ partnerCode: 'NC100227', sku: '140181001', unit: 'Lốc', price: 28000, validFrom: '2026-12-01' }])).body.data).toEqual({ added: 1, updated: 0 });
    const row = ((await call(t, 'GET', '/api/v1/purchase/supplier-products?sku=140181001')).body.data.rows as SupplierProduct[]).find((r) => r.unit === 'Lốc' && r.validFrom === '2026-12-01')!;
    expect((await call(t, 'DELETE', `/api/v1/purchase/supplier-products/${row.id}`)).status).toBe(200);
    expect((await call(t, 'DELETE', `/api/v1/purchase/supplier-products/${row.id}`)).status).toBe(404);
  });

  it('xoá chính sách: chưa áp vào phiếu nào thì xoá được; đã áp (vết tính trên phiếu) thì 409, chỉ tắt được', async () => {
    const pols = (await call(t, 'GET', '/api/v1/purchase/policies')).body.data as Policy[];
    const created = await call(t, 'POST', '/api/v1/purchase/policies', { id: 'new-1', code: 'TEST-XOA-CK', kind: 'trade_discount', name: 'CK thử xoá', scope: { partnerCode: 'NC999999' }, isActive: true, rule: { pct: 1 } });
    expect(created.status).toBe(201);
    expect((await call(t, 'DELETE', `/api/v1/purchase/policies/${created.body.data.id}`)).status).toBe(200);
    expect((await call(t, 'DELETE', `/api/v1/purchase/policies/${created.body.data.id}`)).status).toBe(404);
    const used = pols.find((p) => p.code === 'NC100227-HANTT')!;
    const r = await call(t, 'DELETE', `/api/v1/purchase/policies/${used.id}`);
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/đã áp vào phiếu/);
  });

  it('giá vốn của mã (so với giá mua tham khảo): tạm tính = giá trị tồn ÷ SL tồn theo ĐVT nhỏ nhất; mã chưa nhập thì trống', async () => {
    const c = (await call(t, 'GET', '/api/v1/purchase/product-cost/130181002')).body.data as { current: { qty: number; value: number; unitCost: number } | null };
    expect(c.current!.qty).toBeGreaterThan(0);
    expect(c.current!.unitCost).toBeCloseTo(c.current!.value / c.current!.qty, 1);
    const none = (await call(t, 'GET', '/api/v1/purchase/product-cost/KHONG-CO-MA')).body.data;
    expect(none).toEqual({ monthly: null, current: null });
  });

  it('nhãn hàng chỉ khai ở mặt hàng: dòng phiếu mang nhãn theo danh mục, nhãn phiếu tự suy (bỏ qua nhãn gửi lên); NCC liệt kê nhãn đang bán', async () => {
    const brands = (await call(t, 'GET', '/api/v1/purchase/suppliers/NC100227/brands')).body.data as { brandCode: string; skus: number }[];
    expect(brands.map((b) => b.brandCode)).toContain('TH');
    const doc = { kind: 'order', docDate: '2026-10-25', branchCode: 'CN-NA', partnerCode: 'NC100227', brandCode: 'ANLENE', priceIncludesVat: false, orderDiscount: {},
      lines: [
        { lineKey: 'a', sku: '130181002', name: 'x', unit: 'Thùng', qty: 10, price: 240000, taxCode: 'V08', lineType: 'buy', brandCode: 'SAI' },
        { lineKey: 'b', sku: '110154036', name: 'y', unit: 'Hộp', qty: 1, price: 100000, taxCode: 'V08', lineType: 'buy' },
      ] };
    const saved = (await call(t, 'POST', '/api/v1/purchase/documents', doc)).body.data as { id: string; brandCode: string; lines: { brandCode?: string }[] };
    expect(saved.brandCode).toBe('TH');
    expect(saved.lines.map((l) => l.brandCode)).toEqual(['TH', 'ANLENE']);
    expect(brandShare(saved as unknown as PDoc, 'ANLENE')).toBeCloseTo(100000 / 2500000, 5);
    expect((await call(t, 'POST', `/api/v1/purchase/documents/${saved.id}/cancel`)).status).toBe(200);
    expect((await call(t, 'GET', '/api/v1/purchase/supplier-brands')).status).toBe(404);
  });

  it('khuyến mại tự áp: quà mua X tặng Y tự thêm / chỉnh / bỏ theo bảng hàng; dòng người dùng sửa giữ nguyên; bảng báo đã áp, cần xem, gợi ý', () => {
    const pols: Policy[] = [
      { id: '1', code: 'KM10T1', kind: 'promo_gift', name: 'Mua 10 tặng 1', scope: { partnerCode: 'N1', brandCode: 'TH' }, isActive: true, rule: { buy: 10, get: 1, splitIntoCost: true } },
      { id: '2', code: 'BAC', kind: 'qty_tier', name: 'Bậc SL', scope: { partnerCode: 'N1', sku: 'A' }, isActive: true, rule: { tiers: [{ from: 0, pct: 0 }, { from: 50, pct: 3 }] } },
    ];
    const base: PDoc = { id: 'x', kind: 'receipt', outsideOrder: { reason: 'Phép thử: nhập ngoài đơn' }, status: 'draft', docNo: '', docDate: '2026-10-25', branchCode: 'B', partnerCode: 'N1', priceIncludesVat: false, orderDiscount: {},
      lines: [{ lineKey: 'a', sku: 'A', name: 'Sữa A', unit: 'Hộp', qty: 25, price: 10000, taxCode: 'V08', lineType: 'buy', brandCode: 'TH' }] };
    const r1 = syncGifts(base, pols);
    expect(r1.lines).toHaveLength(2);
    expect(r1.lines[1]).toMatchObject({ sku: 'A', qty: 2, lineType: 'gift_seller', program: 'KM10T1', autoGift: true, name: 'Sữa A' });
    // Tăng hàng mua → quà tự chạy theo; giảm dưới mốc → bỏ dòng quà tự thêm.
    const d2 = { ...base, lines: [{ ...base.lines[0]!, qty: 31 }, r1.lines[1]!] };
    expect(syncGifts(d2, pols).lines[1]!.qty).toBe(3);
    expect(syncGifts({ ...base, lines: [{ ...base.lines[0]!, qty: 9 }, r1.lines[1]!] }, pols).lines).toHaveLength(1);
    // Nhãn khác (mặt hàng không thuộc TH) → không được tặng.
    expect(syncGifts({ ...base, lines: [{ ...base.lines[0]!, brandCode: 'VINAMILK' }] }, pols).lines).toHaveLength(1);
    // Người dùng sửa SL quà (NCC giao thiếu) → giữ nguyên, bảng báo "cần xem" kèm nút sửa về đúng.
    const d3 = { ...base, lines: [base.lines[0]!, { ...r1.lines[1]!, qty: 1, autoGift: false }] };
    expect(syncGifts(d3, pols).changes).toEqual([]);
    const b3 = promoBoard(d3, pols, computeDoc(d3, pols));
    expect(b3[0]).toMatchObject({ status: 'fix', kind: 'promo_gift', expected: 2, got: 1, action: { type: 'gift_fix', qty: 2 } });
    expect(b3.some((x) => x.status === 'hint' && x.text.includes('mua thêm 5'))).toBe(true);
    expect(b3.some((x) => x.status === 'hint' && x.action?.type === 'add_qty' && x.action.qty === 50)).toBe(true);
    // Đạt bậc 50 → CK 3% đã áp; ghi tay khác chính sách → cần xem "Dùng theo chính sách".
    const d4 = { ...base, lines: [{ ...base.lines[0]!, qty: 50 }] };
    expect(promoBoard(d4, pols, computeDoc(d4, pols)).some((x) => x.status === 'applied' && x.kind === 'qty_tier')).toBe(true);
    const d5 = { ...base, lines: [{ ...base.lines[0]!, qty: 50, discountPct: 1 }] };
    expect(promoBoard(d5, pols, computeDoc(d5, pols)).find((x) => x.kind === 'manual')).toMatchObject({ status: 'fix', action: { type: 'use_policy' } });
  });

  it('chính sách chiết khấu theo mã hàng: lưu bảng nhiều mã, kiểm khuôn (thiếu %, trùng dòng), phiếu nhập tự áp CK từng dòng', async () => {
    const items = Array.from({ length: 300 }, (_, i) => ({ sku: `X${i}`, pct: 2 })).concat([{ sku: '130181002', pct: 4 }]);
    const ok = await call(t, 'POST', '/api/v1/purchase/policies', { id: 'new-ckma', code: 'NC100227-CKMA-TEST', kind: 'item_discount', name: 'CK theo mã thử', scope: { partnerCode: 'NC100227' }, isActive: true, validFrom: '2026-01-01', rule: { items } });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    const bad1 = await call(t, 'POST', '/api/v1/purchase/policies', { id: 'new-b1', code: 'BAD-1', kind: 'item_discount', name: 'x', scope: {}, isActive: true, rule: { items: [{ sku: 'A' }] } });
    expect(bad1.status).toBe(400);
    const bad2 = await call(t, 'POST', '/api/v1/purchase/policies', { id: 'new-b2', code: 'BAD-2', kind: 'item_discount', name: 'x', scope: {}, isActive: true, rule: { items: [{ sku: 'A', pct: 1 }, { sku: 'A', pct: 2 }] } });
    expect(bad2.status).toBe(400);
    expect(JSON.stringify(bad2.body)).toMatch(/trùng dòng 1/);
    const a = (await call(t, 'POST', '/api/v1/purchase/analyze', { kind: 'receipt', outsideOrder: { reason: 'Phép thử: nhập ngoài đơn' }, docDate: '2026-10-26', branchCode: 'CN-NA', partnerCode: 'NC100227', priceIncludesVat: false, orderDiscount: {}, invoice: { no: 'CKMA-1', date: '2026-10-26' },
      lines: [{ lineKey: 'a', sku: '130181002', name: 'Sữa', unit: 'Thùng', qty: 2, price: 250000, taxCode: 'V08', lineType: 'buy', lotNo: 'L', expDate: '2027-06-01' }] })).body.data as { calc: { lines: { lineDiscount: number }[]; trace: { kind: string }[] } };
    expect(a.calc.lines[0]!.lineDiscount).toBe(20000);
    expect(a.calc.trace.some((x) => x.kind === 'item_discount')).toBe(true);
    const id = ((await call(t, 'GET', '/api/v1/purchase/policies')).body.data as Policy[]).find((p) => p.code === 'NC100227-CKMA-TEST')!.id;
    expect((await call(t, 'DELETE', `/api/v1/purchase/policies/${id}`)).status).toBe(200);
  });

  it('tệp đính kèm: gửi, liệt kê, tải về đúng nội dung, xoá', async () => {
    const body = { ownerType: 'partner', ownerId: 'NCC-TRUNGHAU', kind: 'hop_dong', fileName: 'Hợp đồng 2026.pdf', mime: 'application/pdf', dataBase64: Buffer.from('%PDF-1.4 thử').toString('base64') };
    const up = await call(t, 'POST', '/api/v1/purchase/attachments', body);
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    const ls = (await call(t, 'GET', '/api/v1/purchase/attachments?ownerType=partner&ownerId=NCC-TRUNGHAU')).body.data;
    expect(ls.files[0]).toMatchObject({ fileName: 'Hợp đồng 2026.pdf', kindLabel: 'Hợp đồng / phụ lục' });
    const file = await t.app.inject({ method: 'GET', url: `/api/v1/purchase/attachments/${up.body.data.id}/file`, headers: { authorization: `Bearer ${t.token}` } });
    expect(file.body).toBe('%PDF-1.4 thử');
    expect((await call(t, 'DELETE', `/api/v1/purchase/attachments/${up.body.data.id}`)).status).toBe(200);
  });
  it('phiếu nhập theo đơn nhưng đổi mã (mã thường → mã Q) bị chặn, cần duyệt ngoại lệ', async () => {
    const docs = (await call(t, 'GET', '/api/v1/purchase/documents?kind=order')).body.data as PDoc[];
    const ord = docs.find((d) => d.docNo === 'DH2610051')!;
    const rec = receiptFromOrder(ord, docs, '2026-10-24');
    const swapped = { ...rec, id: undefined, lines: rec.lines.map((l, i) => (i === 0 ? { ...l, sku: `${l.sku}Q`, lotNo: 'L', expDate: '2028-01-01' } : { ...l, lotNo: 'L', expDate: '2028-01-01' })) };
    const a = (await call(t, 'POST', '/api/v1/purchase/analyze', swapped)).body.data as { checks: { code: string; blocking?: boolean }[] };
    expect(a.checks.find((c) => c.code === 'code_swap')).toMatchObject({ blocking: true });
  });
});

describe('Nạp dữ liệu tình huống vào đơn vị đã có dữ liệu thật', () => {
  it('chính sách trùng mã do người dùng tạo: giữ nguyên, bỏ qua mẫu, không dừng; nạp / nạp lại không ghi trùng số dư đầu kỳ mẫu', async () => {
    const t = await setupTenant();
    await call(t, 'PUT', '/api/v1/partners/NC100227', { name: 'Công ty TNHH Thương Mại Vinh Châu', kind: 'supplier' });
    const mine = await call(t, 'POST', '/api/v1/purchase/policies', { code: 'NC100227-HANMUC', kind: 'credit_limit', name: 'Hạn mức kế toán tự khai', scope: { partnerCode: 'NC100227' }, rule: { limit: 800000000, warnPct: 90 } });
    expect(mine.status, JSON.stringify(mine.body)).toBe(201);
    const tid = String((await db.selectFrom('tenants').select('id').where('code', '=', t.tenantCode).executeTakeFirstOrThrow()).id);
    const openings = async () => Number((await sql<{ n: string }>`SELECT COUNT(*) AS n FROM accounting_events WHERE tenant_id = ${tid} AND status <> 'cancelled' AND payload::text LIKE '%(dữ liệu mẫu)%'`.execute(db)).rows[0]!.n);
    const r = await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.errors).toEqual([]);
    expect(r.body.data.skipped.map((x: { docNo: string }) => x.docNo)).toEqual(['NC100227-HANMUC']);
    const pol = ((await call(t, 'GET', '/api/v1/purchase/policies')).body.data as Policy[]).find((p) => p.code === 'NC100227-HANMUC')!;
    expect(pol.rule.limit).toBe(800000000);
    const n1 = await openings();
    expect(n1).toBeGreaterThan(0);
    expect((await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#', reset: true })).body.data.errors).toEqual([]);
    expect(await openings()).toBe(n1);
    expect(((await call(t, 'GET', '/api/v1/purchase/policies')).body.data as Policy[]).find((p) => p.code === 'NC100227-HANMUC')!.rule.limit).toBe(800000000);
    await t.app.close();
  }, 90_000);

  it('giá NCC đơn vị đã tự khai: nạp lại dữ liệu mẫu giữ giá của đơn vị, không thêm dòng giá mẫu trùng', async () => {
    const t = await setupTenant();
    expect((await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' })).body.data.errors).toEqual([]);
    expect((await call(t, 'POST', '/api/v1/purchase/demo/clear', { password: 'Thuy!@#' })).status).toBe(200);
    const own = await call(t, 'POST', '/api/v1/purchase/supplier-products', { rows: [{ partnerCode: 'NCC-TRUNGHAU', sku: '110154035', unit: 'Lon', price: 530000, priceIncludesVat: true, validFrom: '2026-10-01' }] });
    expect(own.status, JSON.stringify(own.body)).toBeLessThan(300);
    const r = await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' });
    expect(r.body.data.errors).toEqual([]);
    expect(r.body.data.skipped.map((x: { docNo: string }) => x.docNo)).toContain('NCC-TRUNGHAU 110154035');
    const rows = (await call(t, 'GET', '/api/v1/purchase/supplier-products?partnerCode=NCC-TRUNGHAU')).body.data.rows as { sku: string; price: number }[];
    expect(rows.filter((x) => x.sku === '110154035').map((x) => x.price)).toEqual([530000]);
    expect(rows.filter((x) => x.sku === '110154036')).toHaveLength(1);
    await t.app.close();
  }, 120_000);
});

