// [2026-11-08 06:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — S029-19 đợt 1 (E3, ECP-03): T029-ECP-P001 và T029-EA-1..8 — thuộc tính có hiệu lực và tên đối tượng lúc ghi trên sổ cái (chữ chốt: docs/phases/PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/36-THUOC-TINH-CO-HIEU-LUC.md)
/**
 *   T029-EA-1  thêm đối tượng / chi nhánh / kho → phiên bản 1 từ 1970-01-01 (kho không có MST)
 *   T029-EA-2  đổi tên / MST / địa chỉ → đóng bản cũ + bản mới (version 2, 3…); chỉ đổi điện thoại thì không có bản mới; xoá thực thể → đóng
 *   T029-EA-3  entity_attributes chỉ thêm: không sửa, không xoá, không TRUNCATE, không mở lại; phiên bản liên tục theo ngày, không nhận số từ ngoài
 *   T029-EA-4  tra theo ngày: ngày cũ ra bản cũ, hôm nay ra bản mới, kèm version / validFrom / attributeId; ngày cũ hơn bản đầu ra bản đầu
 *   T029-ECP-P001  ĐỔI TÊN GIỮA KỲ: chứng từ NHẬP MUỘN (ghi sổ sau ngày đổi tên, ngày chứng từ trước ngày đổi tên) vẫn mang TÊN CŨ; chứng từ ngày hôm nay mang tên mới;
 *              mỗi tên trên đầu bút toán và dòng sổ kèm partner_attr_id trỏ ĐÚNG bản (version, valid_from khớp ngày chứng từ)
 *   T029-EA-6  bút toán đảo (huỷ chứng từ) mang tên của bút toán gốc dù tên đã đổi
 *   T029-EA-7  bút toán không gắn đối tượng: partner_name và partner_attr_id rỗng (không bịa)
 *   T029-EA-8  cô lập đơn vị: đơn vị khác không tra được thuộc tính của đơn vị này
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { resolveEntity } from '@bizcity/kernel/modules/masterdata/entity-resolver';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let other: TestCtx;
let tenantId = '';
let otherTenantId = '';
let branchId = '';
let today = '';
let n = 0;
const uniq = (p: string) => `${p}-${Date.now().toString(36)}${++n}`;
const tid = async (c: TestCtx) => (await db.selectFrom('tenants').select('id').where('code', '=', c.tenantCode).executeTakeFirstOrThrow()).id;
const send = (doc: unknown) => ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: doc as never, headers: { 'x-api-key': ctx.apiKey } });

const addPartner = async (code: string, name: string, extra: { tax?: string; address?: string } = {}, t = tenantId) =>
  (await sql<{ id: string }>`INSERT INTO partners (tenant_id, code, name, tax_code, address) VALUES (${t}, ${code}, ${name}, ${extra.tax ?? null}, ${extra.address ?? null}) RETURNING id::text AS id`.execute(db)).rows[0]!.id;
const attrs = async (type: string, id: string) => (await sql<{ version: number; name: string; tax_code: string | null; address: string | null; valid_from: string; valid_to: string | null; created_by: string; note: string }>`
  SELECT version, name, tax_code, address, valid_from::text AS valid_from, valid_to::text AS valid_to, created_by, note FROM entity_attributes
   WHERE tenant_id = ${tenantId} AND entity_type = ${type} AND entity_id = ${id}::bigint ORDER BY version`.execute(db)).rows;
const resolve = (id: string, asOf: string, t = tenantId) => resolveEntity(db, t, 'partner', { id }, asOf);

beforeAll(async () => {
  ctx = await setupTenant();
  other = await setupTenant();
  tenantId = await tid(ctx);
  otherTenantId = await tid(other);
  branchId = (await db.selectFrom('branches').select('id').where('tenant_id', '=', tenantId).executeTakeFirstOrThrow()).id;
  today = (await sql<{ d: string }>`SELECT CURRENT_DATE::text AS d`.execute(db)).rows[0]!.d;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('T029-EA — thuộc tính có hiệu lực của đối tượng / chi nhánh / kho', () => {
  it('T029-EA-1 thêm thực thể → phiên bản 1 từ 1970-01-01; kho không có MST', async () => {
    const p = await addPartner(uniq('KH'), 'Công ty Alpha', { tax: '0101234567', address: '1 Lê Lợi' });
    expect(await attrs('partner', p)).toEqual([{ version: 1, name: 'Công ty Alpha', tax_code: '0101234567', address: '1 Lê Lợi', valid_from: '1970-01-01', valid_to: null, created_by: 'system:entity-sync', note: '' }]);
    const b = (await sql<{ id: string }>`INSERT INTO branches (tenant_id, code, name, tax_code, address) VALUES (${tenantId}, ${uniq('CN')}, 'Chi nhánh Bắc', '0101234567-001', 'Hà Nội') RETURNING id::text AS id`.execute(db)).rows[0]!.id;
    expect((await attrs('branch', b))[0]).toMatchObject({ version: 1, name: 'Chi nhánh Bắc', tax_code: '0101234567-001', address: 'Hà Nội' });
    const w = (await sql<{ id: string }>`INSERT INTO warehouses (tenant_id, branch_id, code, name, address) VALUES (${tenantId}, ${branchId}, ${uniq('KHO')}, 'Kho tổng', 'KCN A') RETURNING id::text AS id`.execute(db)).rows[0]!.id;
    expect((await attrs('warehouse', w))[0]).toMatchObject({ version: 1, name: 'Kho tổng', tax_code: null, address: 'KCN A' });
    // dữ liệu có sẵn khi dựng đơn vị (chi nhánh CN01) cũng có phiên bản 1
    expect((await sql<{ n: number }>`SELECT count(*)::int AS n FROM entity_attributes WHERE tenant_id = ${tenantId} AND entity_type = 'branch' AND version = 1`.execute(db)).rows[0]!.n).toBeGreaterThanOrEqual(1);
  });

  it('T029-EA-2 đổi thuộc tính → đóng bản cũ + bản mới; chỉ đổi điện thoại thì không có bản mới; xoá → đóng', async () => {
    const p = await addPartner(uniq('KH'), 'Tên cũ', { tax: '0100000001', address: 'Địa chỉ cũ' });
    await sql`UPDATE partners SET name = 'Tên mới' WHERE id = ${p}::bigint`.execute(db);
    let r = await attrs('partner', p);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ version: 1, name: 'Tên cũ', valid_from: '1970-01-01', valid_to: today });
    expect(r[1]).toMatchObject({ version: 2, name: 'Tên mới', tax_code: '0100000001', address: 'Địa chỉ cũ', valid_from: today, valid_to: null, note: 'đổi tên từ "Tên cũ"' });
    // đổi MST và địa chỉ cùng lúc: một bản mới ghi cả hai (sửa lần hai trong cùng ngày có hiệu lực từ ngày kế tiếp)
    await sql`UPDATE partners SET tax_code = '0100000002', address = 'Địa chỉ mới' WHERE id = ${p}::bigint`.execute(db);
    r = await attrs('partner', p);
    expect(r).toHaveLength(3);
    expect(r[2]).toMatchObject({ version: 3, tax_code: '0100000002', address: 'Địa chỉ mới' });
    expect(r[2]!.note).toMatch(/MST từ "0100000001".*địa chỉ từ "Địa chỉ cũ"/);
    expect(r[1]!.valid_to).toBe(r[2]!.valid_from);
    // chỉ đổi điện thoại: không phải thuộc tính có hiệu lực → không có bản mới
    await sql`UPDATE partners SET phone = '0900000000' WHERE id = ${p}::bigint`.execute(db);
    expect(await attrs('partner', p)).toHaveLength(3);
    // xoá thực thể → đóng bản đang mở, lịch sử giữ
    await sql`DELETE FROM partners WHERE id = ${p}::bigint`.execute(db);
    r = await attrs('partner', p);
    expect(r).toHaveLength(3);
    expect(r.every((x) => x.valid_to !== null)).toBe(true);
  });

  it('T029-EA-3 chỉ thêm; phiên bản liên tục theo ngày, không nhận số từ ngoài', async () => {
    const p = await addPartner(uniq('KH'), 'Bản 1');
    await sql`UPDATE partners SET name = 'Bản 2' WHERE id = ${p}::bigint`.execute(db); // bản 1 đã đóng, bản 2 đang mở
    const where = sql`tenant_id = ${tenantId} AND entity_type = 'partner' AND entity_id = ${p}::bigint`;
    await expect(sql`UPDATE entity_attributes SET name = 'Sửa lén' WHERE ${where}`.execute(db)).rejects.toThrow(/chỉ thêm/);
    await expect(sql`UPDATE entity_attributes SET valid_to = NULL WHERE ${where} AND version = 1`.execute(db)).rejects.toThrow(/đã đóng hiệu lực/);
    await expect(sql`DELETE FROM entity_attributes WHERE ${where}`.execute(db)).rejects.toThrow(/không xoá/);
    await expect(sql`TRUNCATE entity_attributes`.execute(db)).rejects.toThrow(/TRUNCATE|cannot truncate/i); // sổ cái có khoá ngoại tới bảng này nên Postgres chặn trước cả trigger
    await sql`UPDATE entity_attributes SET note = 'ghi chú thêm' WHERE ${where} AND valid_to IS NULL`.execute(db); // ghi chú sửa được
    // chồng hiệu lực: bản 2 đang mở, thêm bản mới khi chưa đóng
    const ins = (from: string, ver = 0) => sql`INSERT INTO entity_attributes (tenant_id, entity_type, entity_id, version, name, valid_from) VALUES (${tenantId}, 'partner', ${p}::bigint, ${ver}, 'Bản 3', ${from}::date)`.execute(db);
    await expect(ins('2099-01-01')).rejects.toThrow(/đã có hiệu lực trong khoảng này/);
    // phải bắt đầu SAU bản trước
    await sql`UPDATE entity_attributes SET valid_to = '2099-01-01' WHERE ${where} AND valid_to IS NULL`.execute(db);
    await expect(ins('2000-01-01')).rejects.toThrow(/phải bắt đầu SAU/);
    // số phiên bản do trigger gán (kể cả khi người ghi truyền số khác)
    await ins('2099-01-01', 77);
    expect((await attrs('partner', p)).map((x) => x.version)).toEqual([1, 2, 3]);
    // thực thể phải có thật cùng đơn vị
    const foreign = await addPartner(uniq('KH'), 'Của đơn vị khác', {}, otherTenantId);
    await expect(sql`INSERT INTO entity_attributes (tenant_id, entity_type, entity_id, name) VALUES (${tenantId}, 'partner', ${foreign}::bigint, 'X')`.execute(db)).rejects.toThrow(/không có trong đơn vị này/);
    await expect(sql`INSERT INTO entity_attributes (tenant_id, entity_type, entity_id, name) VALUES (${tenantId}, 'partner', 999999999, 'X')`.execute(db)).rejects.toThrow(/không có trong đơn vị này/);
  });

  it('T029-EA-4 tra theo ngày: bản hiệu lực, version, attributeId; ngày cũ hơn bản đầu ra bản đầu', async () => {
    const p = await addPartner(uniq('KH'), 'Tên cũ', { tax: '0100000009' });
    await sql`UPDATE partners SET name = 'Tên mới' WHERE id = ${p}::bigint`.execute(db);
    const past = await resolve(p, '2000-01-01');
    expect(past).toMatchObject({ ok: true, attributes: { version: 1, name: 'Tên cũ', taxCode: '0100000009', validFrom: '1970-01-01', validTo: today } });
    const now = await resolve(p, today);
    expect(now).toMatchObject({ ok: true, attributes: { version: 2, name: 'Tên mới', validFrom: today, validTo: null } });
    // attributeId trùng id thật của bản đó trong bảng
    const real = (await sql<{ id: string; version: number }>`SELECT id::text AS id, version FROM entity_attributes WHERE tenant_id = ${tenantId} AND entity_type = 'partner' AND entity_id = ${p}::bigint ORDER BY version`.execute(db)).rows;
    expect([(past as { attributes: { attributeId: string } }).attributes.attributeId, (now as { attributes: { attributeId: string } }).attributes.attributeId]).toEqual(real.map((r) => r.id));
    // ngày cũ hơn cả bản đầu (1970) → bản đầu
    expect(await resolve(p, '1960-01-01')).toMatchObject({ ok: true, attributes: { version: 1 } });
    // hàm SQL cho cùng kết quả với bộ tra
    const f = await sql<{ id: string; name: string }>`SELECT (a).id::text AS id, (a).name FROM (SELECT bizcity_entity_attr_at(${tenantId}::bigint, 'partner', ${p}::bigint, '2000-01-01'::date) AS a) x`.execute(db);
    expect(f.rows[0]).toMatchObject({ id: real[0]!.id, name: 'Tên cũ' });
  });

  it('T029-ECP-P001 đổi tên giữa kỳ: chứng từ NHẬP MUỘN (ngày chứng từ trước ngày đổi tên) vẫn mang TÊN CŨ; partner_attr_id trỏ đúng bản', async () => {
    const code = uniq('KHP');
    const key = (s: string) => `pos:CN01:${code}-${s}`;
    // 1. chứng từ ngày 10/10 với tên cũ → đối tượng được tạo với tên cũ (phiên bản 1)
    expect((await send(saleDoc({ docKey: key('A'), docNo: `${code}-A`, docDate: '2026-10-10', partner: { code, name: 'Tên Cũ JSC' } }))).json().data.status).toBe('posted');
    const pid = (await sql<{ id: string }>`SELECT id::text AS id FROM partners WHERE tenant_id = ${tenantId} AND code = ${code}`.execute(db)).rows[0]!.id;
    // 2. đổi tên qua cột (mọi đường ghi đều có hiệu lực từ HÔM NAY)
    await sql`UPDATE partners SET name = 'Tên Mới JSC' WHERE id = ${pid}::bigint`.execute(db);
    // 3. NHẬP MUỘN: ghi sổ hôm nay nhưng ngày chứng từ 20/10 (trước ngày đổi tên) → phải mang tên CŨ
    expect((await send(saleDoc({ docKey: key('B'), docNo: `${code}-B`, docDate: '2026-10-20', partner: { code } }))).json().data.status).toBe('posted');
    // 4. chứng từ ngày hôm nay → tên mới
    expect((await send(saleDoc({ docKey: key('C'), docNo: `${code}-C`, docDate: today, partner: { code } }))).json().data.status).toBe('posted');

    // mỗi chứng từ bán sinh hai bút toán (bán hàng và giá vốn): gom theo chứng từ, mọi bút toán của cùng chứng từ phải cùng tên / cùng bản
    const rows = (await sql<{ doc_no: string; names: string[]; versions: number[]; froms: string[]; attr_names: string[] }>`
      SELECT e.doc_no, array_agg(DISTINCT e.partner_name) AS names, array_agg(DISTINCT a.version) AS versions,
             array_agg(DISTINCT a.valid_from::text) AS froms, array_agg(DISTINCT a.name) AS attr_names
        FROM ledger_entries e LEFT JOIN entity_attributes a ON a.id = e.partner_attr_id
       WHERE e.tenant_id = ${tenantId} AND e.partner_id = ${pid}::bigint AND e.is_reversal = false GROUP BY e.doc_no ORDER BY min(e.doc_date)`.execute(db)).rows;
    expect(rows.map((r) => r.doc_no)).toEqual([`${code}-A`, `${code}-B`, `${code}-C`]);
    // A (10/10) và B (20/10, NHẬP MUỘN): tên cũ, phiên bản 1; C (hôm nay): tên mới, phiên bản 2
    expect(rows[0]).toMatchObject({ names: ['Tên Cũ JSC'], versions: [1], froms: ['1970-01-01'], attr_names: ['Tên Cũ JSC'] });
    expect(rows[1]).toMatchObject({ names: ['Tên Cũ JSC'], versions: [1], froms: ['1970-01-01'], attr_names: ['Tên Cũ JSC'] });
    expect(rows[2]).toMatchObject({ names: ['Tên Mới JSC'], versions: [2], froms: [today], attr_names: ['Tên Mới JSC'] });
    // cả dòng sổ: có dòng gắn đối tượng và cùng tên / cùng bản với đầu bút toán
    const lines = (await sql<{ doc_no: string; n: number; names: string[]; attrs: string[]; head_attr: string[] }>`
      SELECT e.doc_no, count(*)::int AS n, array_agg(DISTINCT l.partner_name) AS names, array_agg(DISTINCT l.partner_attr_id::text) AS attrs, array_agg(DISTINCT e.partner_attr_id::text) AS head_attr
        FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
       WHERE e.tenant_id = ${tenantId} AND l.partner_id = ${pid}::bigint AND e.is_reversal = false GROUP BY e.doc_no ORDER BY e.doc_no`.execute(db)).rows;
    expect(lines).toHaveLength(3);
    for (const l of lines) {
      expect(l.n).toBeGreaterThan(0);
      expect(l.attrs).toEqual(l.head_attr);
    }
    expect(lines.map((l) => l.names)).toEqual([['Tên Cũ JSC'], ['Tên Cũ JSC'], ['Tên Mới JSC']]);
  });

  it('T029-EA-6 bút toán đảo mang tên của bút toán gốc dù tên đã đổi', async () => {
    const code = uniq('KHR');
    expect((await send(saleDoc({ docKey: `pos:CN01:${code}`, docNo: code, docDate: '2026-10-12', partner: { code, name: 'Tên Gốc' } }))).json().data.status).toBe('posted');
    const pid = (await sql<{ id: string }>`SELECT id::text AS id FROM partners WHERE tenant_id = ${tenantId} AND code = ${code}`.execute(db)).rows[0]!.id;
    await sql`UPDATE partners SET name = 'Tên Sau Khi Đổi' WHERE id = ${pid}::bigint`.execute(db);
    const cancel = await ctx.app.inject({ method: 'POST', url: '/api/v1/documents/cancel', payload: { docKey: `pos:CN01:${code}`, reason: 'Huỷ để thử tên lúc ghi' }, headers: { 'x-api-key': ctx.apiKey } });
    expect(cancel.statusCode, cancel.body).toBe(200);
    const r = (await sql<{ is_reversal: boolean; partner_name: string | null; attr: string | null }>`
      SELECT is_reversal, partner_name, partner_attr_id::text AS attr FROM ledger_entries WHERE tenant_id = ${tenantId} AND partner_id = ${pid}::bigint ORDER BY id`.execute(db)).rows;
    expect(r.some((x) => x.is_reversal)).toBe(true);
    for (const x of r) expect(x.partner_name).toBe('Tên Gốc'); // gốc và đảo cùng tên cũ
    expect(new Set(r.map((x) => x.attr)).size).toBe(1); // cùng một bản thuộc tính
    const lines = (await sql<{ names: string[] }>`SELECT array_agg(DISTINCT l.partner_name) AS names FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id WHERE e.tenant_id = ${tenantId} AND l.partner_id = ${pid}::bigint`.execute(db)).rows[0]!;
    expect(lines.names).toEqual(['Tên Gốc']);
  });

  it('T029-EA-6b bút toán đảo / dòng đảo mang tên GỐC kể cả khi ngày chứng từ của nó là hôm nay (tra theo ngày sẽ ra tên mới → chỉ logic sao chép mới cho tên cũ)', async () => {
    const code = uniq('KHS');
    expect((await send(saleDoc({ docKey: `pos:CN01:${code}`, docNo: code, docDate: '2026-10-14', partner: { code, name: 'Tên Cũ Gốc' } }))).json().data.status).toBe('posted');
    const pid = (await sql<{ id: string }>`SELECT id::text AS id FROM partners WHERE tenant_id = ${tenantId} AND code = ${code}`.execute(db)).rows[0]!.id;
    await sql`UPDATE partners SET name = 'Tên Mới Hôm Nay' WHERE id = ${pid}::bigint`.execute(db);
    const orig = await db.selectFrom('ledger_entries').selectAll().where('tenant_id', '=', tenantId).where('partner_id', '=', pid).where('is_reversal', '=', false).executeTakeFirstOrThrow();
    const origLine = await db.selectFrom('ledger_lines').selectAll().where('entry_id', '=', orig.id).where('partner_id', '=', pid).executeTakeFirstOrThrow();
    expect(orig.partner_name).toBe('Tên Cũ Gốc');
    const ROLLBACK = new Error('lùi giao dịch thử');
    let seen: { head: string | null; line: string | null; headAttr: string | null; lineAttr: string | null } | null = null;
    await db.transaction().execute(async (trx) => {
      // bút toán đảo dựng tay: ngày chứng từ HÔM NAY, chưa có tên (để trigger điền)
      const rev = await trx.insertInto('ledger_entries').values({
        ...orig, id: undefined as never, entry_no: `REV-${code}`, is_reversal: true, reverses_entry_id: orig.id, doc_date: today as never, posting_date: today as never,
        partner_name: undefined as never, partner_attr_id: undefined as never, created_at: undefined as never,
      } as never).returning(['id', 'partner_name', 'partner_attr_id']).executeTakeFirstOrThrow() as unknown as { id: string; partner_name: string | null; partner_attr_id: string | null };
      const line = await trx.insertInto('ledger_lines').values({
        ...origLine, id: undefined as never, entry_id: rev.id, partner_name: undefined as never, partner_attr_id: undefined as never,
      } as never).returning(['partner_name', 'partner_attr_id']).executeTakeFirstOrThrow() as unknown as { partner_name: string | null; partner_attr_id: string | null };
      seen = { head: rev.partner_name, line: line.partner_name, headAttr: rev.partner_attr_id, lineAttr: line.partner_attr_id };
      throw ROLLBACK;
    }).catch((e) => { if (e !== ROLLBACK) throw e; });
    expect(seen).toEqual({ head: 'Tên Cũ Gốc', line: 'Tên Cũ Gốc', headAttr: orig.partner_attr_id, lineAttr: orig.partner_attr_id });
    // đối chứng: một bút toán THƯỜNG (không phải đảo) cùng ngày chứng từ hôm nay thì mang tên MỚI
    const fresh = await resolve(pid, today);
    expect(fresh).toMatchObject({ ok: true, attributes: { name: 'Tên Mới Hôm Nay', version: 2 } });
  });

  it('T029-EA-7 bút toán không gắn đối tượng: tên và bản rỗng (không bịa)', async () => {
    const v = await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'manual', branchCode: 'CN01', docDate: '2026-10-08', description: 'Phiếu tay không đối tượng', lines: [{ debitAccount: '64211', creditAccount: '1111', amount: 10000 }] });
    expect(v.status, JSON.stringify(v.body)).toBe(201);
    const r = (await sql<{ n: number }>`SELECT count(*)::int AS n FROM ledger_entries WHERE tenant_id = ${tenantId} AND partner_id IS NULL AND (partner_name IS NOT NULL OR partner_attr_id IS NOT NULL)`.execute(db)).rows[0]!;
    expect(r.n).toBe(0);
    const l = (await sql<{ n: number }>`SELECT count(*)::int AS n FROM ledger_lines WHERE tenant_id = ${tenantId} AND partner_id IS NULL AND (partner_name IS NOT NULL OR partner_attr_id IS NOT NULL)`.execute(db)).rows[0]!;
    expect(l.n).toBe(0);
  });

  it('T029-EA-8 cô lập đơn vị: đơn vị khác không tra được thuộc tính', async () => {
    const p = await addPartner(uniq('KH'), 'Riêng của đơn vị này');
    expect(await resolve(p, today)).toMatchObject({ ok: true, attributes: { name: 'Riêng của đơn vị này' } });
    expect(await resolve(p, today, otherTenantId)).toMatchObject({ ok: false, code: 'ENTITY_NOT_FOUND' });
    const seen = (await sql<{ n: number }>`SELECT count(*)::int AS n FROM entity_attributes WHERE tenant_id = ${otherTenantId} AND entity_id = ${p}::bigint`.execute(db)).rows[0]!;
    expect(seen.n).toBe(0);
  });
});
