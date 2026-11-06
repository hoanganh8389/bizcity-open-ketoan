// [2026-11-06 10:30 PM Nguyễn Văn Thủy] MH22 — kiểm nhận hoá đơn điện tử XML: dòng đặc biệt, NCC theo MST, trùng, bị thay thế, tệp đính kèm, khoá API (đóng góp)
/**
 * Nhận hoá đơn điện tử XML (MH22): đọc đúng dòng hàng, tự tạo NCC, không nhập trùng, không nhập hoá đơn đã bị thay thế / huỷ, giữ tệp gốc.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { XMLParser } from 'fast-xml-parser';
import { gdtTaxRate, readGdtInvoice, sameTaxRoot } from '@bizcity/mua-hang-domain';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
const URL_XML = '/api/v1/purchase/invoices/ingest-xml';
const MUA = '0106933743-008';
const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true, isArray: (n) => n === 'HHDVu' });

const dongMau = `
  <HHDVu><TChat>1</TChat><MHHDVu>AB-1</MHHDVu><THHDVu>Sữa &amp; bánh 400g</THHDVu><DVTinh>Hộp</DVTinh><SLuong>2</SLuong><DGia>100000</DGia><TLCKhau>0</TLCKhau><STCKhau>0</STCKhau><ThTien>200000</ThTien><TSuat>8%</TSuat></HHDVu>
  <HHDVu><TChat>2</TChat><THHDVu>Quà tặng</THHDVu><DVTinh>Cái</DVTinh><SLuong>1</SLuong><DGia>0</DGia><ThTien>0</ThTien><TSuat>8%</TSuat></HHDVu>
  <HHDVu><TChat>3</TChat><THHDVu>Chiết khấu thương mại</THHDVu><ThTien>50000</ThTien><TSuat>8%</TSuat></HHDVu>
  <HHDVu><TChat>4</TChat><THHDVu>Giao tại kho Hà Nội</THHDVu></HHDVu>`;
const xml = (o: { no?: string; ban?: string; mua?: string; dong?: string; tong?: number; them?: string } = {}) => `<?xml version="1.0" encoding="UTF-8"?>
<HDon><DLHDon><TTChung><KHMSHDon>1</KHMSHDon><KHHDon>C26TAA</KHHDon><SHDon>${o.no ?? '101'}</SHDon><NLap>2026-11-03</NLap><DVTTe>VND</DVTTe>${o.them ?? ''}</TTChung>
<NDHDon><NBan><Ten>Công ty Cung Ứng</Ten><MST>${o.ban ?? '0101234567'}</MST><DChi>Hà Nội</DChi></NBan><NMua><Ten>Đơn vị mua</Ten><MST>${o.mua ?? MUA}</MST></NMua>
<DSHHDVu>${o.dong ?? dongMau}</DSHHDVu><TToan><TgTCThue>${o.tong ?? 150000}</TgTCThue><TgTThue>12000</TgTThue><TTCKTMai>50000</TTCKTMai><TgTTTBSo>162000</TgTTTBSo></TToan></NDHDon></DLHDon><MCCQT>00ABC</MCCQT></HDon>`;
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const gui = (x: string, o: Record<string, unknown> = {}) => call(t, 'POST', URL_XML, { fileName: 'hd.xml', xmlBase64: b64(x), ...o });
const nhieuTep = async (id: string) => (await db.selectFrom('document_attachments').select(['file_name', 'kind', 'size_bytes']).where('doc_ref', '=', `mua-hang.invoice:${id}`).where('archived_at', 'is', null).where('tenant_id', '=', (await db.selectFrom('tenants').select('id').where('code', '=', t.tenantCode).executeTakeFirstOrThrow()).id).orderBy('id').execute());

beforeAll(async () => {
  t = await setupTenant();
  await db.updateTable('tenants').set({ tax_code: '0106933743' }).where('code', '=', t.tenantCode).execute();
  await call(t, 'PUT', '/api/v1/catalog/products/XML-1?new=true', { name: 'Sản phẩm XML', unit: 'Hộp', taxInCode: 'V08', units: [{ unit: 'Hộp', ratio: 1, isDefault: true }] });
}, 60_000);
afterAll(async () => { await t.app.close(); });

describe('Đọc XML (hàm thuần)', () => {
  const doc = (x: string) => readGdtInvoice(parser.parse(x));
  it('hàng hoá, khuyến mại, chiết khấu, ghi chú đi đúng chỗ', () => {
    const g = doc(xml());
    expect(g.parsed.lines).toHaveLength(2);
    expect(g.parsed.lines[0]).toMatchObject({ nccSku: 'AB-1', nccName: 'Sữa & bánh 400g', nccUnit: 'Hộp', qty: 2, price: 100000, amount: 200000, taxRate: 8, isGift: false });
    expect(g.parsed.lines[1]).toMatchObject({ isGift: true });
    expect(g.discountLines).toEqual([{ name: 'Chiết khấu thương mại', amount: 50000, taxRate: 8 }]);
    expect(g.noteLines).toEqual(['Giao tại kho Hà Nội']);
    expect(g.parsed).toMatchObject({ form: '1', series: 'C26TAA', no: '101', date: '2026-11-03', totalBeforeTax: 150000, totalTax: 12000, total: 162000, totalDiscount: 50000 });
    expect(g.mccqt).toBe('00ABC');
    expect(g.warnings).toEqual([]);
  });
  it('dòng dịch vụ không ghi số lượng vẫn giữ được tiền', () => {
    const g = doc(xml({ dong: '<HHDVu><THHDVu>Cước vận chuyển</THHDVu><ThTien>150000</ThTien><TSuat>10%</TSuat></HHDVu>' }));
    expect(g.parsed.lines[0]).toMatchObject({ qty: 1, price: 150000, amount: 150000, taxRate: 10 });
  });
  it('dòng giảm tiền (điều chỉnh) giữ dấu âm ở số lượng, đơn giá không âm', () => {
    const g = doc(xml({ tong: -30000, dong: '<HHDVu><TChat>1</TChat><THHDVu>Giảm giá</THHDVu><ThTien>-30000</ThTien><TSuat>8%</TSuat></HHDVu>' }));
    expect(g.parsed.lines[0]).toMatchObject({ qty: -1, price: 30000, amount: -30000 });
  });
  it('cộng dòng lệch tổng thì có cảnh báo', () => { expect(doc(xml({ tong: 999999 })).warnings).toHaveLength(1); });
  it('hoá đơn chỉ có chiết khấu số âm: giữ thành dòng giảm tiền, không mất số âm', () => {
    const g = doc(xml({ tong: -100000, dong: '<HHDVu><TChat>3</TChat><THHDVu>Tích luỹ doanh số A</THHDVu><ThTien>-60000</ThTien><TSuat>8%</TSuat></HHDVu><HHDVu><TChat>3</TChat><THHDVu>Tích luỹ doanh số B</THHDVu><ThTien>-40000</ThTien><TSuat>8%</TSuat></HHDVu>' }));
    expect(g.parsed.lines).toHaveLength(2);
    expect(g.parsed.lines[0]).toMatchObject({ qty: -1, price: 60000, amount: -60000, taxRate: 8, isGift: false });
    expect(g.discountLines).toEqual([]);
    expect(g.warnings).toEqual([]);
    expect(g.notices[0]).toContain('không có hàng');
  });
  it('chiết khấu ghi số âm kèm hàng vẫn là giảm tiền', () => {
    const g = doc(xml({ dong: '<HHDVu><TChat>1</TChat><THHDVu>Hàng</THHDVu><SLuong>2</SLuong><DGia>100000</DGia><ThTien>200000</ThTien><TSuat>8%</TSuat></HHDVu><HHDVu><TChat>3</TChat><THHDVu>CK</THHDVu><ThTien>-50000</ThTien><TSuat>8%</TSuat></HHDVu>' }));
    expect(g.discountLines[0]).toMatchObject({ amount: 50000 });
    expect(g.warnings).toEqual([]);
  });
  it('dòng chiết khấu NCC ghi như hàng: trừ đi mới khớp tổng thì tính là chiết khấu', () => {
    const hang = '<HHDVu><TChat>1</TChat><THHDVu>Gạc rơ lưỡi</THHDVu><SLuong>40</SLuong><DGia>104761.9048</DGia><ThTien>4190476</ThTien><TSuat>5%</TSuat></HHDVu><HHDVu><TChat>1</TChat><THHDVu>Gạc rơ lưỡi - hàng khuyến mại</THHDVu><SLuong>5</SLuong><DGia>0</DGia><ThTien>0</ThTien><TSuat>5%</TSuat></HHDVu><HHDVu><TChat>1</TChat><THHDVu>CK43 - CK thương mại</THHDVu><ThTien>1173333</ThTien><TSuat>5%</TSuat></HHDVu>';
    const g = doc(xml({ tong: 3017143, dong: hang }));
    expect(g.parsed.lines.map((l) => l.nccName)).toEqual(['Gạc rơ lưỡi', 'Gạc rơ lưỡi - hàng khuyến mại']);
    expect(g.discountLines).toEqual([{ name: 'CK43 - CK thương mại', amount: 1173333, taxRate: 5 }]);
    expect(g.warnings).toEqual([]);
    expect(g.notices[0]).toContain('chiết khấu');
  });
  it('dòng không số lượng mà cộng vào mới khớp tổng thì vẫn là dịch vụ, không đoán theo tên', () => {
    const g = doc(xml({ tong: 300000, dong: '<HHDVu><TChat>1</TChat><THHDVu>Hàng</THHDVu><SLuong>1</SLuong><DGia>200000</DGia><ThTien>200000</ThTien><TSuat>8%</TSuat></HHDVu><HHDVu><TChat>1</TChat><THHDVu>CK vận chuyển</THHDVu><ThTien>100000</ThTien><TSuat>8%</TSuat></HHDVu>' }));
    expect(g.parsed.lines).toHaveLength(2);
    expect(g.discountLines).toEqual([]);
  });
  it('hoá đơn không ghi tổng trước thuế: không báo lệch, thuế suất trống là không chịu thuế', () => {
    const x = xml({ dong: '<HHDVu><TChat>1</TChat><THHDVu>Dàn lạnh</THHDVu><SLuong>1</SLuong><DGia>1600000</DGia><ThTien>1600000</ThTien></HHDVu>' }).replace(/<TgTCThue>[^<]*<\/TgTCThue><TgTThue>[^<]*<\/TgTThue>/, '');
    const g = doc(x);
    expect(g.warnings).toEqual([]);
    expect(g.parsed.lines[0]!.taxRate).toBeNull();
    expect(g.parsed.totalBeforeTax).toBeUndefined();
  });
  it('thuế suất các dạng', () => {
    expect([gdtTaxRate('8%'), gdtTaxRate('0%'), gdtTaxRate('KHAC:5.26%'), gdtTaxRate('KCT'), gdtTaxRate('KKKNT'), gdtTaxRate('')]).toEqual([8, 0, 5.26, null, null, null]);
  });
  it('MST chi nhánh cùng gốc với công ty mẹ', () => {
    expect(sameTaxRoot('0106933743-008', '0106933743')).toBe(true);
    expect(sameTaxRoot('0106933743', '0101234567')).toBe(false);
  });
  it('tệp không phải hoá đơn thì báo lỗi', () => { expect(() => doc('<a><b>1</b></a>')).toThrow(/không phải hoá đơn/); });
});

describe('API nhận XML', () => {
  it('nhập mới: tự tạo NCC, lưu dòng, đính XML đúng từng byte', async () => {
    const x = xml();
    const r = await gui(x, { gdt: { tthai: 1, ttxly: 5 } });
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d).toMatchObject({ status: 'saved', partnerCode: '0101234567', partnerCreated: true, lines: 2, unmatched: 2, attached: 1 });
    const p = await db.selectFrom('partners').select(['kind', 'name', 'tax_code', 'address']).where('code', '=', '0101234567').where('tenant_id', '=', (await db.selectFrom('tenants').select('id').where('code', '=', t.tenantCode).executeTakeFirstOrThrow()).id).executeTakeFirstOrThrow();
    expect(p).toMatchObject({ kind: 'supplier', name: 'Công ty Cung Ứng', tax_code: '0101234567', address: 'Hà Nội' });
    const files = await nhieuTep(d.invoiceId);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ kind: 'hoa_don_xml', file_name: 'hd.xml' });
    expect(Number(files[0]!.size_bytes)).toBe(Buffer.byteLength(x));
    const ds = (await call(t, 'GET', `/api/v1/purchase/attachments?ownerType=invoice&ownerId=${d.invoiceId}`)).body.data.files as { id: string; fileName: string }[];
    expect(ds.map((f) => f.fileName)).toEqual(['hd.xml']);
    const tai = await t.app.inject({ method: 'GET', url: `/api/v1/purchase/attachments/${ds[0]!.id}/file`, headers: { authorization: `Bearer ${t.token}` } });
    expect(tai.statusCode).toBe(200);
    expect(tai.rawPayload.toString('utf8')).toBe(x);
    const one = (await call(t, 'GET', `/api/v1/purchase/invoices/${d.invoiceId}`)).body.data.invoice;
    expect(one).toMatchObject({ source: 'api', form: '1', series: 'C26TAA', total: 162000, totalDiscount: 50000 });
    expect(one.data).toMatchObject({ mccqt: '00ABC', gdt: { tthai: 1, ttxly: 5 } });
  });

  it('gửi lại: không tạo trùng; PDF có sau thì đính thêm, gửi lại PDF cũ không đính nữa', async () => {
    const r1 = await gui(xml({ no: '0000102' }));
    const id = r1.body.data.invoiceId;
    expect(r1.body.data).toMatchObject({ status: 'saved', partnerCreated: false });
    const pdf = { fileName: 'hd.pdf', mime: 'application/pdf', kind: 'hoa_don', dataBase64: b64('%PDF-thu') };
    const r2 = await gui(xml({ no: '102' }), { files: [pdf] });
    expect(r2.body.data).toMatchObject({ status: 'duplicate', invoiceId: id, attached: 2 });
    const r3 = await gui(xml({ no: '102' }), { files: [pdf] });
    expect(r3.body.data).toMatchObject({ status: 'duplicate', attached: 0 });
    expect((await nhieuTep(id)).map((f) => f.kind).sort()).toEqual(['hoa_don', 'hoa_don_xml', 'hoa_don_xml']);
    expect((await call(t, 'GET', '/api/v1/purchase/invoices?partnerCode=0101234567')).body.data.filter((x: { no: string }) => x.no.endsWith('102'))).toHaveLength(1);
  });

  it('hoá đơn bị thay thế / huỷ: chưa nhập thì không nhập, đã nhập thì giữ và ghi chú để kế toán xem lại', async () => {
    const r1 = await gui(xml({ no: '201' }), { gdt: { tthai: 4 } });
    expect(r1.body.data).toMatchObject({ status: 'replaced_or_cancelled' });
    expect(r1.body.data.invoiceId).toBeUndefined();
    const r2 = await gui(xml({ no: '202' }), { gdt: { tthai: 1 } });
    const r3 = await gui(xml({ no: '202' }), { gdt: { tthai: 6 } });
    expect(r3.body.data).toMatchObject({ status: 'replaced_or_cancelled', invoiceId: r2.body.data.invoiceId });
    const one = (await call(t, 'GET', `/api/v1/purchase/invoices/${r2.body.data.invoiceId}`)).body.data.invoice;
    expect(one.note).toContain('bị huỷ');
    expect(one.status).toBe('active');
    expect(one.data.gdt.tthai).toBe(6);
  });

  it('hoá đơn chiết khấu không có hàng: lưu được, tổng âm đúng hoá đơn, có ghi chú', async () => {
    const r = await gui(xml({ no: '250', tong: -100000, dong: '<HHDVu><TChat>3</TChat><THHDVu>Tích luỹ doanh số</THHDVu><ThTien>-100000</ThTien><TSuat>8%</TSuat></HHDVu>' }).replace('<TgTThue>12000</TgTThue>', '<TgTThue>-8000</TgTThue>').replace('<TTCKTMai>50000</TTCKTMai>', '').replace('<TgTTTBSo>162000</TgTTTBSo>', '<TgTTTBSo>-108000</TgTTTBSo>'));
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ status: 'saved', lines: 1, warnings: [] });
    const one = (await call(t, 'GET', `/api/v1/purchase/invoices/${r.body.data.invoiceId}`)).body.data.invoice;
    expect(one).toMatchObject({ totalBeforeTax: -100000, totalTax: -8000, total: -108000 });
    expect(one.lines[0]).toMatchObject({ qty: -1, price: 100000, amount: -100000, taxAmount: -8000 });
    expect(one.note).toContain('không lập phiếu nhập');
  });

  it('hoá đơn thay thế có ghi chú nêu hoá đơn gốc', async () => {
    const r = await gui(xml({ no: '301', them: '<TTHDLQuan><TCHDon>1</TCHDon><KHHDCLQuan>C26TAA</KHHDCLQuan><SHDCLQuan>201</SHDCLQuan></TTHDLQuan>' }), { gdt: { tthai: 2 } });
    const one = (await call(t, 'GET', `/api/v1/purchase/invoices/${r.body.data.invoiceId}`)).body.data.invoice;
    expect(one.note).toContain('thay thế cho C26TAA-201');
  });

  it('kế toán đã huỷ thì lượt gửi sau không tự nhập lại', async () => {
    const r = await gui(xml({ no: '401' }));
    await call(t, 'POST', `/api/v1/purchase/invoices/${r.body.data.invoiceId}/cancel`, { reason: 'Nhập nhầm' });
    expect((await gui(xml({ no: '401' }))).body.data).toMatchObject({ status: 'previously_cancelled' });
  });

  it('sai người mua thì không lưu, không tạo NCC', async () => {
    const r = await gui(xml({ no: '501', ban: '0999999999', mua: '0300000000' }));
    expect(r.body.data).toMatchObject({ status: 'wrong_buyer' });
    expect(await db.selectFrom('partners').select('code').where('code', '=', '0999999999').executeTakeFirst()).toBeUndefined();
  });

  it('MST trùng nhiều đối tượng không phải NCC: không đoán', async () => {
    await call(t, 'PUT', '/api/v1/partners', { partners: [{ code: 'KH-A', name: 'A', kind: 'customer', taxCode: '0102222222' }, { code: 'KH-B', name: 'B', kind: 'customer', taxCode: '0102222222' }] });
    const r = await gui(xml({ no: '601', ban: '0102222222' }));
    expect(r.body.data).toMatchObject({ status: 'partner_ambiguous' });
  });

  it('NCC đã có theo MST thì dùng đúng NCC đó; dòng có mã mà thiếu ĐVT để chưa nhận diện', async () => {
    await call(t, 'PUT', '/api/v1/partners/NCC-XML', { name: 'NCC sẵn có', kind: 'supplier', taxCode: '0103333333' });
    const dong = '<HHDVu><TChat>1</TChat><MHHDVu>XML-1</MHHDVu><THHDVu>Sản phẩm XML</THHDVu><DVTinh>Thùng</DVTinh><SLuong>1</SLuong><DGia>150000</DGia><ThTien>150000</ThTien><TSuat>8%</TSuat></HHDVu>';
    const r = await gui(xml({ no: '701', ban: '0103333333', dong }));
    expect(r.body.data).toMatchObject({ status: 'saved', partnerCode: 'NCC-XML', partnerCreated: false, unmatched: 1 });
  });

  it('tệp hỏng, DOCTYPE, sai bảng mã trả lỗi 400', async () => {
    expect((await gui('<HDon><DLHDon>')).status).toBe(400);
    expect((await gui('<!DOCTYPE x [<!ENTITY a "b">]><HDon/>')).status).toBe(400);
    expect((await gui('<?xml version="1.0" encoding="windows-1258"?><HDon/>')).status).toBe(400);
    expect((await gui('<a><b>1</b></a>')).status).toBe(400);
  });

  it('khoá API chỉ cần documents:write; thiếu phạm vi thì bị từ chối', async () => {
    const tao = async (scopes: string[]) => (await call(t, 'POST', '/api/v1/api-keys', { name: `Cầu nối ${scopes[0]}`, scopes })).body.data.key as string;
    const dung = await tao(['documents:write']);
    const sai = await tao(['reports:read']);
    const body = { fileName: 'k.xml', xmlBase64: b64(xml({ no: '801' })) };
    expect((await t.app.inject({ method: 'POST', url: URL_XML, headers: { 'x-api-key': dung }, payload: body })).json().data.status).toBe('saved');
    expect((await t.app.inject({ method: 'POST', url: URL_XML, headers: { 'x-api-key': sai }, payload: body })).statusCode).toBe(403);
    expect((await t.app.inject({ method: 'POST', url: URL_XML, payload: body })).statusCode).toBe(401);
  });
});
