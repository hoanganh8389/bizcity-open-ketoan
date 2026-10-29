/**
 * Dữ liệu gốc (tệp JSONL trong db/seeds) và luồng chứng từ bán hàng → kế toán:
 * quay về gốc từng bộ, giữ bản ghi đã dùng, chi nhánh gắn bộ phận, bút toán tự động mang bộ phận của cửa hàng,
 * mặt hàng chưa có trong phần mềm lấy bộ tài khoản theo tệp gốc.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;
const restore = (key: string) => call(ctx, 'POST', `/api/v1/default-data/${key}/restore`, { confirm: true });
const sale = (key: string, sku: string) => ({
  docType: 'sale', docKey: key, branchCode: '26001', docNo: key, docDate: '2026-10-04',
  lines: [{ lineKey: 'l1', sku, name: 'Hàng thử', unit: 'Hộp', qty: 1, amountBeforeTax: 100000, taxCode: 'R08', taxAmount: 8000, cost: 70000 }],
  payments: [{ methodCode: 'TM', amount: 108000 }],
  totals: { beforeTax: 100000, tax: 8000, total: 108000 },
});

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  expect((await call(ctx, 'POST', '/api/v1/branches', { code: '26001', name: 'Cửa hàng Bảo Hà' })).status).toBe(201);
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Dữ liệu gốc', () => {
  it('liệt kê các bộ; xem nội dung tệp gốc; quay về cần quyền và xác nhận', async () => {
    const list = (await call(ctx, 'GET', '/api/v1/default-data')).body.data;
    expect(list.datasets).toHaveLength(23);
    expect(list.datasets.map((d: { key: string }) => d.key)).toEqual(expect.arrayContaining(['cost_item', 'department', 'branches', 'reasons', 'posting_groups', 'item_classes', 'products', 'posting_defaults', 'account_tracking', 'tax_codes', 'bank_accounts', 'payment_methods', 'partner_groups', 'partners', 'employee', 'contract', 'asset_categories', 'tool_group', 'capital_source', 'usage_purpose', 'case', 'project', 'warehouses']));
    expect(list.datasets.find((d: { key: string }) => d.key === 'cost_item').seedCount).toBeGreaterThan(200);
    expect(list.seedItems).toBeGreaterThan(10000);
    const rows = (await call(ctx, 'GET', '/api/v1/default-data/department/rows?search=BH26001')).body.data;
    expect(rows.rows[0]).toMatchObject({ code: 'BH26001' });
    expect((await call(ctx, 'POST', '/api/v1/default-data/cost_item/restore', {})).status).toBe(400);
  });

  it('khoản mục: nạp đủ; mã tự thêm chưa dùng thì xoá, đã dùng thì khoá', async () => {
    await call(ctx, 'PUT', '/api/v1/dimensions/cost_item/TU-THEM', { name: 'Tự thêm chưa dùng' });
    await call(ctx, 'PUT', '/api/v1/dimensions/cost_item/DA-DUNG', { name: 'Tự thêm đã dùng' });
    const v = await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'manual', branchCode: 'CN01', docDate: '2026-10-05', description: 'Chi phí', lines: [{ debitAccount: '64231', creditAccount: '1111', amount: 100000, costItem: 'DA-DUNG', department: 'X' }] });
    // Bộ phận X chưa có: phiếu bị từ chối; ghi lại với bộ phận có thật sau khi nạp bộ phận.
    expect(v.status).toBe(400);
    const rd = await restore('department'); expect(rd.status, JSON.stringify(rd.body)).toBe(200);
    expect((await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'manual', branchCode: 'CN01', docDate: '2026-10-05', description: 'Chi phí', lines: [{ debitAccount: '64231', creditAccount: '1111', amount: 100000, costItem: 'DA-DUNG', department: 'BH26001' }] })).status).toBe(201);
    const r = (await restore('cost_item')).body.data;
    expect(r.added).toBeGreaterThan(200);
    expect(r).toMatchObject({ removed: 1, deactivated: 1 });
    const items = (await call(ctx, 'GET', '/api/v1/dimensions/cost_item')).body.data;
    expect(items.find((x: { code: string }) => x.code === 'TU-THEM')).toBeUndefined();
    expect(items.find((x: { code: string }) => x.code === 'DA-DUNG')).toMatchObject({ isActive: false });
    expect(items.find((x: { code: string }) => x.code === 'CPDD01')).toMatchObject({ parentCode: 'CPDD' });
    // Chạy lại: không có gì thay đổi.
    expect((await restore('cost_item')).body.data).toMatchObject({ added: 0, updated: 0, removed: 0 });
  });

  it('bộ phận: chi nhánh chưa gắn được gắn theo quy ước BH + mã chi nhánh', async () => {
    const b = (await call(ctx, 'GET', '/api/v1/branches')).body.data.find((x: { code: string }) => x.code === '26001');
    expect(b.departmentCode).toBe('BH26001');
    expect((await call(ctx, 'PATCH', '/api/v1/branches/26001', { departmentCode: 'KHONG-CO' })).status).toBe(400);
  });

  it('bút toán bán hàng tự động mang bộ phận của cửa hàng; mặt hàng chưa có lấy bộ tài khoản theo tệp gốc', async () => {
    const rr = await restore('reasons'); expect(rr.status, JSON.stringify(rr.body)).toBe(200);
    // Khôi phục lần hai: không còn gì khác tệp gốc thì không ghi, không đếm "cập nhật".
    expect((await restore('reasons')).body.data.updated).toBe(0);
    const rg = await restore('posting_groups'); expect(rg.status, JSON.stringify(rg.body)).toBe(200);
    expect((await restore('account_tracking')).body.data.updated).toBeGreaterThan(0);
    // Tính chất tài khoản theo tệp gốc: TK thuế GTGT, ngoại tệ, công nợ nội bộ, sổ cái.
    const accOf = (code: string) => call(ctx, 'GET', `/api/v1/accounts/${code}`).then((x) => x.body.data);
    expect(await accOf('1331')).toMatchObject({ isVat: true, isLedger: true });
    expect(await accOf('1112')).toMatchObject({ isForeignCurrency: true });
    expect(await accOf('13681')).toMatchObject({ trackInternalDebt: true });
    expect(await accOf('131')).toMatchObject({ normalSide: 'both', trackPartner: true });
    // Hàng khuyến mại trong tệp gốc (nhóm giá vốn 6323, doanh thu 51113), chưa có trong danh mục mặt hàng.
    const r = await call(ctx, 'POST', '/api/v1/documents', sale('BAN-BH-01', '110051001M'));
    expect(r.body.data.status, JSON.stringify(r.body)).toBe('posted');
    const lines = await sql<{ account_code: string; dep: string | null }>`
      SELECT l.account_code, l.dims->>'department' AS dep FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
       WHERE l.tenant_id = ${tenantId} AND e.doc_no = 'BAN-BH-01'`.execute(db);
    // Lý do XBA (bán tại cửa hàng) chỉ định doanh thu 51111, thay tài khoản doanh thu của nhóm mặt hàng.
    const rev = lines.rows.find((l) => l.account_code.startsWith('511'));
    expect(rev).toMatchObject({ account_code: '51111', dep: 'BH26001' });
    // Mặt hàng chưa có trong danh mục: nhóm hạch toán lấy theo tệp gốc (hàng khuyến mại → giá vốn 6323), giá vốn mang bộ phận.
    expect(lines.rows.find((l) => l.account_code.startsWith('632'))).toMatchObject({ account_code: '6323', dep: 'BH26001' });
    // Bộ phận gắn mọi dòng của bút toán (cả dòng tiền, công nợ).
    expect(lines.rows.every((l) => l.dep === 'BH26001')).toBe(true);
    const acc = (await call(ctx, 'GET', '/api/v1/accounts')).body.data.find((a: { code: string }) => a.code === '64231');
    expect(acc).toMatchObject({ trackCostItem: true, trackDepartment: true });
  });

  it('mọi danh mục còn lại: phân loại, mặt hàng, nhóm đối tượng, đối tượng, ngân hàng, hình thức thanh toán, loại thuế, chi nhánh, loại tài sản, hợp đồng, nhân viên', async () => {
    const ok = async (key: string) => { const r = await restore(key); expect(r.status, `${key}: ${JSON.stringify(r.body)}`).toBe(200); return r.body.data; };
    expect((await ok('item_classes')).added).toBeGreaterThan(1000);
    const prod = await ok('products');
    expect(prod.added).toBeGreaterThan(20000);
    const item = (await call(ctx, 'GET', '/api/v1/products?search=110051001M')).body.data[0];
    expect(item).toMatchObject({ sku: '110051001M', postingGroupCode: 'NHT02' });
    expect(item.brandCode).toBeTruthy();
    expect((await ok('partner_groups')).added).toBeGreaterThan(0);
    const partners = await ok('partners');
    expect(partners.added).toBeGreaterThan(10000);
    expect((await call(ctx, 'GET', '/api/v1/partners?search=00000AA00002')).body.data[0]).toMatchObject({ code: '00000AA00002', groupCode: 'NCC-TSDV' });
    const banks = await ok('bank_accounts');
    expect(banks.warnings.join(' ')).toContain('Đã tạo tài khoản');
    expect((await ok('payment_methods')).added).toBeGreaterThan(0);
    const taxes = await ok('tax_codes');
    expect(taxes.added).toBeGreaterThan(30);
    expect((await call(ctx, 'GET', '/api/v1/tax-codes')).body.data.find((x: { code: string }) => x.code === 'R08')).toMatchObject({ reportGroup: '8' });
    // Shop đổi đuôi: chi nhánh cũ (mã gốc trước đây) đổi mã sang mã mới; chi nhánh lẻ trùng cửa hàng thì ngừng theo dõi.
    expect((await call(ctx, 'POST', '/api/v1/branches', { code: '01014Plus', name: 'Thịnh Long (mã cũ)' })).status).toBe(201);
    const br = await ok('branches');
    expect(br.added).toBeGreaterThan(700);
    expect(br.warnings.join(' ')).toContain('01014Plus → 01014Premium');
    expect(br.warnings.join(' ')).toContain('26001 → 26001Premium');
    const b = (await call(ctx, 'GET', '/api/v1/branches')).body.data;
    expect(b.find((x: { code: string }) => x.code === '14051')).toMatchObject({ departmentCode: 'BH14051', isActive: true });
    expect(b.find((x: { code: string }) => x.code.endsWith('_OFF')).isActive).toBe(false);
    expect(b.find((x: { code: string }) => x.code === '01014Plus')).toBeUndefined();
    expect(b.find((x: { code: string }) => x.code === '26001')).toBeUndefined();
    expect(b.find((x: { code: string }) => x.code === '26001Premium')).toMatchObject({ isActive: true, departmentCode: 'BH26001' });
    // Mã gốc đã có mà còn chi nhánh lẻ cùng cửa hàng: ngừng theo dõi chi nhánh lẻ.
    expect((await call(ctx, 'POST', '/api/v1/branches', { code: '00001', name: 'Vĩnh Hưng lẻ' })).status).toBe(201);
    expect((await ok('branches')).warnings.join(' ')).toContain('00001 (dùng 00001Premium)');
    expect((await call(ctx, 'GET', '/api/v1/branches')).body.data.find((x: { code: string }) => x.code === '00001')).toMatchObject({ isActive: false });
    expect((await ok('asset_categories')).added).toBeGreaterThan(0);
    expect((await call(ctx, 'GET', '/api/v1/asset-categories')).body.data.find((x: { code: string }) => x.code === '12')).toMatchObject({ assetAccount: '2112' });
    expect((await ok('contract')).added).toBe(4);
    expect((await ok('employee')).added).toBeGreaterThan(40);
    // Danh mục gốc trống (vụ việc): mã tự thêm chưa dùng thì xoá.
    await call(ctx, 'PUT', '/api/v1/dimensions/case/VV-TU-THEM', { name: 'Vụ việc tự thêm' });
    expect(await ok('case')).toMatchObject({ added: 0, removed: 1 });
    // Chạy lại một bộ: không còn gì thay đổi.
    expect(await ok('partners')).toMatchObject({ added: 0 });
    // Quay về toàn bộ theo thứ tự phụ thuộc: chạy được, các bộ đã đủ thì không thêm gì.
    const all = await call(ctx, 'POST', '/api/v1/default-data/all/restore', { confirm: true });
    expect(all.status, JSON.stringify(all.body).slice(0, 300)).toBe(200);
    expect(all.body.data).toHaveLength(23);
    expect(all.body.data.find((o: { key: string }) => o.key === 'products').result.added).toBe(0);
  }, 120_000);
});
