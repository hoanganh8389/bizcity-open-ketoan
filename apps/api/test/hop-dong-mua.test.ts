// [2026-11-18 Nguyễn Văn Thủy] Hợp đồng mua xuyên suốt (0163): hợp đồng → giá, chính sách → chứng từ → bút toán → công nợ theo hợp đồng; nhãn theo cây nhóm hàng (đóng góp)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';
import { policyApplies, scopeRank, type Policy } from '@bizcity/mua-hang-domain';

let t: TestCtx;
let tid: string;
const HD = '01/2026/HĐMB-TGS-VC';

beforeAll(async () => {
  t = await setupTenant();
  tid = String((await db.selectFrom('tenants').select('id').where('code', '=', t.tenantCode).executeTakeFirstOrThrow()).id);
  expect((await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' })).status).toBe(200);
}, 90_000);
afterAll(async () => { await t.app.close(); });

type Row = { code: string; status: string; statusText: string; partnerCode: string; policies: number; prices: number; documents: number; debt: number; purchased: number; penaltyPct?: number | null; signerSeller?: string; freightBy?: string };

describe('Hợp đồng mua hàng (Danh mục hợp đồng)', () => {
  it('hợp đồng mẫu Vinh Châu: giá, chính sách, đơn / phiếu nhập thuộc hợp đồng; bút toán mang mã hợp đồng → còn nợ theo hợp đồng', async () => {
    const list = (await call<{ data: Row[] }>(t, 'GET', '/api/v1/purchase/contracts?partnerCode=NC100227')).body.data;
    const c = list.find((x) => x.code === HD)!;
    expect(c).toMatchObject({ partnerCode: 'NC100227', status: 'active', policies: 3, documents: 2 });
    expect(c.prices).toBeGreaterThan(0);
    expect(c.purchased).toBeGreaterThan(0);
    const lines = (await sql<{ n: string }>`SELECT count(*) AS n FROM ledger_lines WHERE tenant_id = ${tid} AND dims->>'contract' = ${HD} AND account_code LIKE '331%'`.execute(db)).rows[0]!.n;
    expect(Number(lines)).toBeGreaterThan(0);
    expect(c.debt).toBeGreaterThan(0);
    // Hồ sơ NCC vẫn đọc số / hạn hợp đồng (từ danh mục, không còn chính sách loại hợp đồng).
    const ncc = ((await call(t, 'GET', '/api/v1/purchase/suppliers')).body.data as { code: string; contractNo?: string; contractTo?: string }[]).find((x) => x.code === 'NC100227');
    expect(ncc).toMatchObject({ contractNo: HD, contractTo: '2026-12-31' });
  });

  it('sổ chứng từ: hợp đồng là một chứng từ; phiếu nhập thuộc hợp đồng có liên kết áp hợp đồng', async () => {
    const d = await db.selectFrom('business_documents').selectAll().where('tenant_id', '=', tid).where('doc_ref', '=', `hop-dong.contract:${HD}`).executeTakeFirstOrThrow();
    expect(d).toMatchObject({ module: 'hop-dong', doc_type: 'purchase.contract', title: 'Hợp đồng mua hàng', partner_ref: 'NC100227', status: 'in_progress' });
    const links = await db.selectFrom('document_links').select('from_ref').where('tenant_id', '=', tid).where('to_ref', '=', `hop-dong.contract:${HD}`).where('role', '=', 'applies').where('from_ref', 'like', 'mua-hang.document:%').execute(); // 0166: chính sách của hợp đồng cũng liên kết applies
    expect(links.length).toBe(2);
    const det = await call<{ data: { links: { label: string; openable: boolean }[] } }>(t, 'GET', `/api/v1/business-documents/detail?docRef=${encodeURIComponent(links[0]!.from_ref)}`);
    expect(det.body.data.links.find((l) => l.label.includes(HD))).toMatchObject({ openable: true });
  });

  it('chi tiết hợp đồng: bảng giá, chính sách, chứng từ thuộc hợp đồng', async () => {
    const r = (await call<{ data: { contract: Row; prices: { sku: string }[]; policies: { code: string }[]; documents: { docNo: string }[] } }>(t, 'GET', `/api/v1/purchase/contracts/detail?code=${encodeURIComponent(HD)}`)).body.data;
    expect(r.policies.map((p) => p.code).sort()).toEqual(expect.arrayContaining(['NC100227-HANMUC']));
    expect(r.documents.map((d) => d.docNo).sort()).toEqual(['DH2610061', 'NM2610061']);
    expect(r.prices.length).toBe(r.contract.prices);
  });

  it('lập / sửa hợp đồng: kiểm hiệu lực, trùng số, NCC; sửa = bản mới; giá mua gắn hợp đồng', async () => {
    const body = (o: Record<string, unknown> = {}) => ({ partnerCode: 'NC100227', signedDate: '2026-11-01', startDate: '2026-11-01', endDate: '2027-10-31', brandCodes: [] as string[], skus: ['130181002'], ...o });
    const bad = await call(t, 'PUT', '/api/v1/purchase/contracts', { code: 'HD-T-01', isNew: true, contract: body({ endDate: '2026-10-01' }) });
    expect(bad.status).toBe(400);
    expect((await call(t, 'PUT', '/api/v1/purchase/contracts', { code: 'HD-T-01', isNew: true, contract: body({ partnerCode: 'KHONG-CO' }) })).status).toBe(400);
    expect((await call(t, 'PUT', '/api/v1/purchase/contracts', { code: 'HD T 01', isNew: true, contract: body() })).status).toBe(400);
    // Hợp đồng ghi nhãn: mã khác nhãn bị từ chối; ô chọn mặt hàng lọc theo nhãn.
    const nhanCua = (await sql<{ brand_code: string }>`SELECT brand_code FROM products WHERE tenant_id = ${tid} AND sku = '130181002'`.execute(db)).rows[0]!.brand_code;
    const khac = (await sql<{ sku: string }>`SELECT sku FROM products WHERE tenant_id = ${tid} AND brand_code IS NOT NULL AND brand_code <> ${nhanCua} LIMIT 1`.execute(db)).rows[0]!.sku;
    expect((await call(t, 'PUT', '/api/v1/purchase/contracts', { code: 'HD-T-NHAN', isNew: true, contract: body({ brandCodes: [nhanCua], skus: ['130181002', khac] }) })).status).toBe(400);
    const loc = (await call<{ data: { sku: string }[] }>(t, 'GET', `/api/v1/inventory/items?limit=200&brands=${encodeURIComponent(nhanCua)}`)).body.data;
    expect(loc.length).toBeGreaterThan(0);
    expect(loc.some((i) => i.sku === khac)).toBe(false);
    const dsSp = (await call<{ data: { sku: string; brandCode: string }[] }>(t, 'GET', `/api/v1/products?pageSize=500&brands=${encodeURIComponent(nhanCua)}`)).body.data;
    expect(dsSp.every((x) => x.brandCode === nhanCua)).toBe(true);
    // Phạt vi phạm tối đa 8% (Điều 301 Luật Thương mại).
    expect((await call(t, 'PUT', '/api/v1/purchase/contracts', { code: 'HD-T-01', isNew: true, contract: body({ penaltyPct: 8.5 }) })).status).toBe(400);
    const ok = await call(t, 'PUT', '/api/v1/purchase/contracts', { code: 'HD-T-01', isNew: true, contract: body() });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect((await call(t, 'PUT', '/api/v1/purchase/contracts', { code: 'HD-T-01', isNew: true, contract: body() })).status).toBe(409);
    // Số trùng với hợp đồng loại khác (thuê nhà…) thì không ghi đè.
    await sql`INSERT INTO dimensions (tenant_id, kind, code, name, extra) VALUES (${tid}, 'contract', 'HD-THUE', 'Thuê kho', '{"type":"rent"}'::jsonb)`.execute(db);
    expect((await call(t, 'PUT', '/api/v1/purchase/contracts', { code: 'HD-THUE', contract: body() })).status).toBe(409);
    expect((await call(t, 'PUT', '/api/v1/purchase/contracts', { code: 'HD-T-01', contract: body({ endDate: '2027-12-31', note: 'Phụ lục 01', penaltyPct: 8, signerSeller: 'Ông A — Giám đốc', freightBy: 'seller' }) })).status).toBe(200);
    expect((await call<{ data: Row[] }>(t, 'GET', '/api/v1/purchase/contracts')).body.data.find((x) => x.code === 'HD-T-01')).toMatchObject({ penaltyPct: 8, signerSeller: 'Ông A — Giám đốc', freightBy: 'seller' });
    const v = await db.selectFrom('document_versions').select('version').where('tenant_id', '=', tid).where('doc_ref', '=', 'hop-dong.contract:HD-T-01').execute();
    expect(v.length).toBe(2);
    const sp = await call(t, 'POST', '/api/v1/purchase/supplier-products', { rows: [{ partnerCode: 'NC100227', sku: '130181002', unit: 'Thùng', price: 250000, validFrom: '2026-11-01', contractCode: 'HD-T-01' }] });
    expect(sp.status, JSON.stringify(sp.body)).toBe(200);
    // Khoanh vùng theo hàng hoá của hợp đồng: giá / chính sách thuộc hợp đồng chỉ được mã của hợp đồng; ô chọn mã lọc theo danh sách mã.
    const ngoai = await call(t, 'POST', '/api/v1/purchase/supplier-products', { rows: [{ partnerCode: 'NC100227', sku: khac, unit: 'Thùng', price: 1000, contractCode: 'HD-T-01' }] });
    expect(ngoai.status).toBe(400);
    expect(JSON.stringify(ngoai.body)).toContain('không thuộc hàng hoá của hợp đồng');
    const csNgoai = await call(t, 'POST', '/api/v1/purchase/policies', { code: 'HD-T-01-CKMA', kind: 'item_discount', name: 'CK theo mã', scope: { partnerCode: 'NC100227', contractCode: 'HD-T-01' }, rule: { items: [{ sku: '130181002', pct: 2 }, { sku: khac, pct: 3 }] }, validFrom: '2026-11-01', validTo: '2027-10-31' });
    expect(csNgoai.status).toBe(400);
    const csDung = await call(t, 'POST', '/api/v1/purchase/policies', { code: 'HD-T-01-CKMA', kind: 'item_discount', name: 'CK theo mã', scope: { partnerCode: 'NC100227', contractCode: 'HD-T-01' }, rule: { items: [{ sku: '130181002', pct: 2 }] }, validFrom: '2026-11-01', validTo: '2027-10-31' });
    expect(csDung.status, JSON.stringify(csDung.body)).toBeLessThan(300);
    const chiMa = (await call<{ data: { sku: string }[] }>(t, 'GET', `/api/v1/products?pageSize=50&skus=130181002,${encodeURIComponent(khac)}`)).body.data.map((x) => x.sku).sort();
    expect(chiMa).toEqual(['130181002', khac].sort());
    expect((await call<{ data: { sku: string }[] }>(t, 'GET', '/api/v1/inventory/items?limit=50&skus=130181002')).body.data.map((x) => x.sku)).toEqual(['130181002']);
    const det = (await call<{ data: { contract: Row; prices: { contractCode: string }[]; items: { sku: string }[] } }>(t, 'GET', '/api/v1/purchase/contracts/detail?code=HD-T-01')).body.data;
    expect(det.prices).toEqual([expect.objectContaining({ contractCode: 'HD-T-01' })]);
    expect(det.items.map((i) => i.sku)).toEqual(['130181002']);
    // Thanh lý: vẫn trong danh sách, trạng thái đổi; sổ chứng từ "Hoàn tất".
    await call(t, 'PUT', '/api/v1/purchase/contracts', { code: 'HD-T-01', contract: body({ status: 'liquidated' }) });
    expect((await db.selectFrom('business_documents').select('status').where('tenant_id', '=', tid).where('doc_ref', '=', 'hop-dong.contract:HD-T-01').executeTakeFirstOrThrow()).status).toBe('done');
    const lst = (await call<{ data: Row[] }>(t, 'GET', '/api/v1/purchase/contracts')).body.data;
    expect(lst.find((x) => x.code === 'HD-T-01')).toMatchObject({ status: 'liquidated', statusText: 'Đã thanh lý' });
    expect(lst.some((x) => x.code === 'HD-THUE')).toBe(false); // chỉ hợp đồng mua
  });

  it('công nợ theo hợp đồng: tổng hợp khớp nợ còn lại; chi tiết số dư luỹ kế', async () => {
    const sum = (await call<{ data: { rows: { contractCode: string; openCredit: number; openDebit: number; closeCredit: number; closeDebit: number; debit: number; credit: number }[] } }>(t, 'GET', '/api/v1/purchase/contract-debts?from=2026-01-01&to=2026-12-31')).body.data.rows;
    const r = sum.find((x) => x.contractCode === HD)!;
    const c = ((await call<{ data: Row[] }>(t, 'GET', '/api/v1/purchase/contracts')).body.data).find((x) => x.code === HD)!;
    expect(r.closeCredit - r.closeDebit).toBe(c.debt);
    expect(r.openCredit - r.openDebit + r.credit - r.debit).toBe(r.closeCredit - r.closeDebit);
    const det = (await call<{ data: { lines: { contractCode: string; balance: number }[] } }>(t, 'GET', `/api/v1/purchase/contract-debts?from=2026-01-01&to=2026-12-31&detail=1&contractCode=${encodeURIComponent(HD)}`)).body.data.lines;
    expect(det.length).toBeGreaterThan(0);
    expect(det[det.length - 1]!.balance).toBe(c.debt);
  });
});

describe('Nhãn / ngành theo cây nhóm hàng (lỗi chọn mã không ra nhãn)', () => {
  it('nút cấp 1 / 2 tạo mới tự có ngành / nhãn; mặt hàng mới thuộc nhóm cấp 3 tự lấy nhãn, ngành', async () => {
    const ins = (code: string, name: string, parent: string | null) => sql`INSERT INTO item_classes (tenant_id, kind, code, name, parent_code) VALUES (${tid}, 'group', ${code}, ${name}, ${parent})`.execute(db);
    await ins('9901', 'Ngành thử', null);
    await ins('9902', 'Nhãn thử Goon', '9901');
    await ins('9903', 'Miếng lót', '9902');
    const cls = await db.selectFrom('item_classes').select(['kind', 'name']).where('tenant_id', '=', tid).where('code', 'in', ['9901', '9902', '9903']).where('kind', '<>', 'group').orderBy('kind').execute();
    expect(cls).toEqual([{ kind: 'brand', name: 'Nhãn thử Goon' }, { kind: 'industry', name: 'Ngành thử' }]);
    await sql`INSERT INTO products (tenant_id, sku, name, unit, group_code) VALUES (${tid}, '990310001', 'Goon miếng lót thử', 'Gói', '9903')`.execute(db);
    expect(await db.selectFrom('products').select(['brand_code', 'industry_code']).where('tenant_id', '=', tid).where('sku', '=', '990310001').executeTakeFirstOrThrow()).toEqual({ brand_code: '9902', industry_code: '9901' });
    const brands = (await call<{ data: { code: string; name: string }[] }>(t, 'GET', '/api/v1/item-classes/brand')).body.data;
    expect(brands.find((b) => b.code === '9902')?.name).toBe('Nhãn thử Goon');
    // Mã nút trùng mã nhãn cũ khác tên: nhãn cũ chưa ai ngoài nhánh dùng → đổi tên theo cây; đang có mặt hàng khác dùng → giữ, mặt hàng của nhánh không bị gán nhầm.
    await sql`INSERT INTO item_classes (tenant_id, kind, code, name) VALUES (${tid}, 'brand', '9912', 'Nhãn cũ A'), (${tid}, 'brand', '9922', 'Nhãn cũ B')`.execute(db);
    await sql`INSERT INTO products (tenant_id, sku, name, unit, brand_code) VALUES (${tid}, 'KHAC-9922', 'Hàng khác dùng nhãn cũ B', 'Gói', '9922')`.execute(db);
    await ins('9912', 'Nhãn mới A', '9901');
    await ins('9922', 'Nhãn mới B', '9901');
    await ins('9913', 'Nhóm A', '9912');
    await ins('9923', 'Nhóm B', '9922');
    const nm = async (c: string) => (await db.selectFrom('item_classes').select('name').where('tenant_id', '=', tid).where('kind', '=', 'brand').where('code', '=', c).executeTakeFirstOrThrow()).name;
    expect([await nm('9912'), await nm('9922')]).toEqual(['Nhãn mới A', 'Nhãn cũ B']);
    await sql`INSERT INTO products (tenant_id, sku, name, unit, group_code) VALUES (${tid}, '991310001', 'Hàng A', 'Gói', '9913'), (${tid}, '992310001', 'Hàng B', 'Gói', '9923')`.execute(db);
    const br = async (sku: string) => (await db.selectFrom('products').select('brand_code').where('tenant_id', '=', tid).where('sku', '=', sku).executeTakeFirstOrThrow()).brand_code;
    expect([await br('991310001'), await br('992310001')]).toEqual(['9912', null]);
    // Nhãn khai tay thì giữ.
    await sql`UPDATE products SET brand_code = '9902', group_code = '9903' WHERE tenant_id = ${tid} AND sku = '990310001'`.execute(db);
    expect((await db.selectFrom('products').select('brand_code').where('tenant_id', '=', tid).where('sku', '=', '990310001').executeTakeFirstOrThrow()).brand_code).toBe('9902');
  });
  it('mọi phiếu thuộc hợp đồng mang số hợp đồng: trả tiền theo phiếu nhập kế thừa; gắn phiếu của hợp đồng khác thì báo', async () => {
    const docs = (await call<{ data: { id: string; kind: string; status: string; contractCode?: string; partnerCode: string; branchCode: string }[] }>(t, 'GET', '/api/v1/purchase/documents')).body.data;
    const nhap = docs.find((d) => d.kind === 'receipt' && d.contractCode === HD && d.status === 'approved')!;
    expect(nhap).toBeTruthy();
    const tra = await call<{ data: { contractCode?: string } }>(t, 'POST', '/api/v1/purchase/documents', { kind: 'payment', docDate: '2026-11-19', branchCode: nhap.branchCode, partnerCode: 'NC100227', amount: 1000, refIds: [nhap.id], lines: [] });
    expect(tra.status, JSON.stringify(tra.body)).toBe(201);
    expect(tra.body.data.contractCode).toBe(HD);
    expect((await call(t, 'PUT', '/api/v1/purchase/contracts', { code: 'HD-T-KHAC', isNew: true, contract: { partnerCode: 'NC100227', signedDate: '2026-11-01', startDate: '2026-11-01', brandCodes: [], skus: [] } })).status).toBe(200);
    const sai = await call(t, 'POST', '/api/v1/purchase/documents', { kind: 'payment', docDate: '2026-11-19', branchCode: nhap.branchCode, partnerCode: 'NC100227', amount: 1000, refIds: [nhap.id], contractCode: 'HD-T-KHAC', lines: [] });
    expect(sai.status).toBe(400);
    expect(JSON.stringify(sai.body)).toContain('thuộc hợp đồng');
  });
  it('chính sách áp nhiều chi nhánh (branchCodes); dữ liệu cũ một chi nhánh (branchCode) vẫn áp', async () => {
    const base = { id: 'x', code: 'X', kind: 'trade_discount', name: '', isActive: true, priority: 0, rule: { pct: 2 } } as unknown as Policy;
    const nhieu = { ...base, scope: { branchCodes: ['CN1', 'CN2'] } } as Policy;
    expect(policyApplies(nhieu, { date: '2026-11-19', branchCode: 'CN2' })).toBe(true);
    expect(policyApplies(nhieu, { date: '2026-11-19', branchCode: 'CN3' })).toBe(false);
    expect(policyApplies({ ...base, scope: { branchCode: 'CN1' } } as Policy, { date: '2026-11-19', branchCode: 'CN1' })).toBe(true);
    expect(scopeRank(nhieu)).toBe(1);
    const r = await call<{ data: { id: string } }>(t, 'POST', '/api/v1/purchase/policies', { code: 'NC100227-CK-NHIEUCN', kind: 'trade_discount', name: 'CK 2 chi nhánh', scope: { partnerCode: 'NC100227', branchCodes: ['CN1', 'CN2'] }, rule: { pct: 1 }, validFrom: '2026-11-01', validTo: null });
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    const p = ((await call(t, 'GET', '/api/v1/purchase/policies')).body.data as Policy[]).find((x) => x.code === 'NC100227-CK-NHIEUCN')!;
    expect(p.scope.branchCodes).toEqual(['CN1', 'CN2']);
  });
});
