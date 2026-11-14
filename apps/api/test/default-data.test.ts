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
// [2026-11-10 10:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-53: db/seeds là bộ giả lập (26 §11.2) — ngưỡng đếm lấy theo số dòng của tệp gốc (seedCount), không ghi cứng số của dữ liệu thật
const seedCount: Record<string, number> = {};
// [2026-11-13 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-8a: quay về = xem trước (?dryRun=1, lấy previewToken) rồi chạy thật với mã đó
const restore = async (key: string, c: TestCtx = ctx) => {
  const url = `/api/v1/default-data/${key}/restore`;
  const p = await call(c, 'POST', `${url}?dryRun=1`, { confirm: true });
  if (p.status !== 200) return p;
  return call(c, 'POST', url, { confirm: true, previewToken: p.body.meta.previewToken });
};
const sale = (key: string, sku: string) => ({
  docType: 'sale', docKey: key, branchCode: '26001', docNo: key, docDate: '2026-10-04',
  lines: [{ lineKey: 'l1', sku, name: 'Hàng thử', unit: 'Hộp', qty: 1, amountBeforeTax: 100000, taxCode: 'R08', taxAmount: 8000, cost: 70000 }],
  payments: [{ methodCode: 'TM', amount: 108000 }],
  totals: { beforeTax: 100000, tax: 8000, total: 108000 },
});

beforeAll(async () => {
  ctx = await setupTenant();
  // [2026-11-11 Nguyễn Văn Thủy] PHASE-026 — tệp này kiểm nhóm hạch toán / lý do: bật công tắc lý do hạch toán (mặc định tắt) (đóng góp)
  {
    const on = await call(ctx, 'PUT', '/api/v1/settings/values/bizcity.posting.use_reasons', { value: 'on', validFrom: '2000-01-01', reason: 'Kiểm nhóm hạch toán / lý do' }, { 'idempotency-key': 'bat-ly-do-hach-toan' });
    if (on.status !== 200) throw new Error(JSON.stringify(on.body));
  }
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  expect((await call(ctx, 'POST', '/api/v1/branches', { code: '26001', name: 'Cửa hàng Bảo Hà' })).status).toBe(201);
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Dữ liệu gốc', () => {
  it('liệt kê các bộ; xem nội dung tệp gốc; quay về cần quyền và xác nhận', async () => {
    const list = (await call(ctx, 'GET', '/api/v1/default-data')).body.data;
    expect(list.datasets.length).toBeGreaterThanOrEqual(23); // [2026-11-13 Nguyễn Văn Thủy] bộ mới thêm sau (24) không làm hỏng test (đóng góp)
    expect(list.datasets.map((d: { key: string }) => d.key)).toEqual(expect.arrayContaining(['cost_item', 'department', 'branches', 'reasons', 'posting_groups', 'item_classes', 'products', 'posting_defaults', 'account_tracking', 'tax_codes', 'bank_accounts', 'payment_methods', 'partner_groups', 'partners', 'employee', 'contract', 'asset_categories', 'tool_group', 'capital_source', 'usage_purpose', 'case', 'project', 'warehouses']));
    expect(list.datasets.find((d: { key: string }) => d.key === 'cost_item').seedCount).toBeGreaterThan(200);
    for (const d of list.datasets as { key: string; seedCount: number }[]) seedCount[d.key] = d.seedCount;
    expect(list.seedItems).toBe(seedCount.products);
    expect(seedCount.products).toBeGreaterThan(100);
    const rows = (await call(ctx, 'GET', '/api/v1/default-data/department/rows?search=CN-CH')).body.data;
    expect(rows.rows[0]).toMatchObject({ code: 'CN-CH' });
    expect((await call(ctx, 'POST', '/api/v1/default-data/cost_item/restore', {})).status).toBe(400);
  });

  it('khoản mục: nạp đủ; mã tự thêm chưa dùng thì xoá, đã dùng thì khoá', async () => {
    await call(ctx, 'PUT', '/api/v1/dimensions/cost_item/TU-THEM', { name: 'Tự thêm chưa dùng' });
    await call(ctx, 'PUT', '/api/v1/dimensions/cost_item/DA-DUNG', { name: 'Tự thêm đã dùng' });
    const v = await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'manual', branchCode: 'CN01', docDate: '2026-10-05', description: 'Chi phí', lines: [{ debitAccount: '64231', creditAccount: '1111', amount: 100000, costItem: 'DA-DUNG', department: 'X' }] });
    // Bộ phận X chưa có: phiếu bị từ chối; ghi lại với bộ phận có thật sau khi nạp bộ phận.
    expect(v.status).toBe(400);
    const rd = await restore('department'); expect(rd.status, JSON.stringify(rd.body)).toBe(200);
    expect((await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'manual', branchCode: 'CN01', docDate: '2026-10-05', description: 'Chi phí', lines: [{ debitAccount: '64231', creditAccount: '1111', amount: 100000, costItem: 'DA-DUNG', department: 'CN-CH' }] })).status).toBe(201);
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

  it('bộ phận: chi nhánh chưa gắn được gắn phòng ban riêng BH + số mã chi nhánh (0129)', async () => {
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
    // Lý do XBA (bán tại cửa hàng) chỉ định doanh thu 51111, thay tài khoản doanh thu của nhóm mặt hàng (công tắc lý do bật).
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
    // [2026-11-13 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-8a: tệp gốc là bộ giả lập (S030-53) → đơn vị đã có bút toán (ctx) bị chặn; các bộ giả lập chạy trên đơn vị sạch ctx2
    const blocked = await call(ctx, 'POST', '/api/v1/default-data/partners/restore?dryRun=1', { confirm: true });
    expect(blocked.status).toBe(400);
    expect(JSON.stringify(blocked.body)).toContain('SEEDS_DIR');
    const ctx2 = await setupTenant();
    expect((await call(ctx2, 'POST', '/api/v1/branches', { code: '26001', name: 'Cửa hàng Bảo Hà' })).status).toBe(201);
    const ok = async (key: string) => { const r = await restore(key, ctx2); expect(r.status, `${key}: ${JSON.stringify(r.body)}`).toBe(200); return r.body.data; };
    await ok('department'); await ok('posting_groups'); // đơn vị sạch: bộ phận, nhóm hạch toán trước (như thứ tự quay về toàn bộ)
    expect((await ok('item_classes')).added).toBe(seedCount.item_classes);
    const prod = await ok('products');
    expect(prod.added).toBe(seedCount.products);
    const item = (await call(ctx2, 'GET', '/api/v1/products?search=110051001M')).body.data[0];
    expect(item).toMatchObject({ sku: '110051001M', postingGroupCode: 'NHT02' });
    expect(item.brandCode).toBeTruthy();
    expect((await ok('partner_groups')).added).toBeGreaterThan(0);
    const partners = await ok('partners');
    expect(partners.added).toBe(seedCount.partners);
    expect((await call(ctx2, 'GET', '/api/v1/partners?search=00000AA00002')).body.data[0]).toMatchObject({ code: '00000AA00002', groupCode: 'NCC-TSDV' });
    const banks = await ok('bank_accounts');
    expect(banks.warnings.join(' ')).toContain('Đã tạo tài khoản');
    expect((await ok('payment_methods')).added).toBeGreaterThan(0);
    const taxes = await ok('tax_codes');
    expect(taxes.added).toBeGreaterThan(30);
    expect((await call(ctx2, 'GET', '/api/v1/tax-codes')).body.data.find((x: { code: string }) => x.code === 'R08')).toMatchObject({ reportGroup: '8' });
    // Shop đổi đuôi: chi nhánh cũ (mã gốc trước đây) đổi mã sang mã mới; chi nhánh lẻ trùng cửa hàng thì ngừng theo dõi.
    expect((await call(ctx2, 'POST', '/api/v1/branches', { code: '01014Plus', name: 'Thịnh Long (mã cũ)' })).status).toBe(201);
    const br = await ok('branches');
    // 01014Plus, 26001 đổi mã (không tính là thêm)
    expect(br.added).toBe(seedCount.branches! - 2);
    expect(br.warnings.join(' ')).toContain('01014Plus → 01014Premium');
    expect(br.warnings.join(' ')).toContain('26001 → 26001Premium');
    const b = (await call(ctx2, 'GET', '/api/v1/branches')).body.data;
    expect(b.find((x: { code: string }) => x.code === '14051')).toMatchObject({ departmentCode: 'BH14051', isActive: true });
    expect(b.find((x: { code: string }) => x.code.endsWith('_OFF')).isActive).toBe(false);
    expect(b.find((x: { code: string }) => x.code === '01014Plus')).toBeUndefined();
    expect(b.find((x: { code: string }) => x.code === '26001')).toBeUndefined();
    expect(b.find((x: { code: string }) => x.code === '26001Premium')).toMatchObject({ isActive: true, departmentCode: 'BH26001' });
    // Mã gốc đã có mà còn chi nhánh lẻ cùng cửa hàng: ngừng theo dõi chi nhánh lẻ.
    expect((await call(ctx2, 'POST', '/api/v1/branches', { code: '00001', name: 'Vĩnh Hưng lẻ' })).status).toBe(201);
    expect((await ok('branches')).warnings.join(' ')).toContain('00001 (dùng 00001Premium)');
    expect((await call(ctx2, 'GET', '/api/v1/branches')).body.data.find((x: { code: string }) => x.code === '00001')).toMatchObject({ isActive: false });
    expect((await ok('asset_categories')).added).toBeGreaterThan(0);
    expect((await call(ctx2, 'GET', '/api/v1/asset-categories')).body.data.find((x: { code: string }) => x.code === '12')).toMatchObject({ assetAccount: '2112' });
    expect((await ok('contract')).added).toBe(seedCount.contract);
    expect(seedCount.contract).toBe(4);
    expect((await ok('employee')).added).toBe(seedCount.employee);
    // Danh mục gốc trống (vụ việc): mã tự thêm chưa dùng thì xoá.
    await call(ctx2, 'PUT', '/api/v1/dimensions/case/VV-TU-THEM', { name: 'Vụ việc tự thêm' });
    expect(await ok('case')).toMatchObject({ added: 0, removed: 1 });
    // Chạy lại một bộ: không còn gì thay đổi.
    expect(await ok('partners')).toMatchObject({ added: 0 });
    // Quay về toàn bộ theo thứ tự phụ thuộc: chạy được, các bộ đã đủ thì không thêm gì.
    const all = await restore('all', ctx2);
    expect(all.status, JSON.stringify(all.body).slice(0, 300)).toBe(200);
    expect(all.body.data).toHaveLength(Object.keys(seedCount).length - 1); // trừ bộ làm sạch nhóm hàng + mặt hàng (không chạy trong toàn bộ)
    expect(all.body.data.find((o: { key: string }) => o.key === 'products').result.added).toBe(0);
    await ctx2.app.close();
    // [2026-11-04 12:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — B2b: nạp 20.985 mặt hàng ≈ 87 s một mình (đồng bộ Item Master ≈ 15 s trong đó), vượt 120 s khi cả bộ test chạy song song

    // [2026-11-13 Nguyễn Văn Thủy] Nhóm hàng + mặt hàng: làm sạch hẳn, giữ mã đã vào sổ, nạp bộ mẫu (0124) (đóng góp)
    const posted = (await sql<{ sku: string }>`SELECT DISTINCT product_sku AS sku FROM ledger_lines WHERE tenant_id = ${tenantId} AND product_sku IS NOT NULL`.execute(db)).rows.map((r) => r.sku);
    const clean = await restore('catalog_sample');
    expect(clean.status, JSON.stringify(clean.body).slice(0, 300)).toBe(200);
    const left = (await db.selectFrom('products').select('sku').where('tenant_id', '=', tenantId).execute()).map((r) => r.sku);
    expect(left).toEqual(expect.arrayContaining([...posted, '110053001', '190423001']));
    expect(left.length).toBeLessThan(posted.length + 30);
    const grp = await db.selectFrom('products as p').innerJoin('item_classes as g', (j) => j.onRef('g.tenant_id', '=', 'p.tenant_id').onRef('g.code', '=', 'p.group_code'))
      .select(['g.sku_code', 'g.parent_code']).where('p.tenant_id', '=', tenantId).where('p.sku', '=', '110053001').where('g.kind', '=', 'group').executeTakeFirstOrThrow();
    expect(grp.sku_code).toBe('3');
    // chạy lại: kết quả như nhau, không lỗi
    expect((await restore('catalog_sample')).status).toBe(200);
    expect((await db.selectFrom('products').select('sku').where('tenant_id', '=', tenantId).execute()).length).toBe(left.length);
  }, 240_000);
});
