/**
 * Item Master B2b (PHASE-024 S024-9, migration 0066, R-ITEM-0 / 1, R-CONT-0 / 1): item_id trên dòng sổ / kho / giá vốn / đơn vị / giá.
 *   - chứng từ mang mã chưa có trong danh mục → mặt hàng tự thêm sau khi ghi sổ → dòng sổ / kho được điền item_id (fill_refs);
 *   - đổi mã giữa kỳ: dòng cũ giữ mã cũ (ảnh chụp) và CÙNG item_id; Hành trình mặt hàng nối mã cũ + mã mới thành một;
 *   - sổ cái vẫn chỉ thêm: điền item_id từ rỗng một lần; đổi item_id / mã hàng của dòng sổ bị chặn;
 *   - mặt hàng mồ côi (mã có trong sổ / kho, không có trong danh mục) → khai lại mặt hàng thì NHẬN LẠI định danh đó;
 *   - giá vốn tính theo định danh (G2): đổi mã giữa tháng → MỘT dòng giá vốn, đơn giá bình quân trên cả hai mã;
 *   - xoá (mặt hàng chưa có nhập xuất) rồi tạo lại cùng mã → định danh mới, không chồng hiệu lực; định danh cũ ngừng dùng.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const today = () => new Date().toISOString().slice(0, 10);
const post = (doc: unknown) => call(ctx, 'POST', '/api/v1/documents', doc);
const put = (sku: string, body: Record<string, unknown>) => call(ctx, 'PUT', `/api/v1/products/${sku}`, body);
const ack = { warnAck: { reason: 'thử B2b', codes: ['ITEM-HINT-001'] } };
const purchase = (key: string, date: string, sku: string, qty: number, amount: number) => ({
  docType: 'purchase', docKey: key, branchCode: 'CN01', docNo: key, docDate: date, partner: { code: 'NCC-01', name: 'Nhà cung cấp 01' },
  lines: [{ lineKey: 'l1', sku, name: sku, unit: 'Hộp', qty, amountBeforeTax: amount, taxCode: 'V08', taxAmount: 0 }], totals: { beforeTax: amount, tax: 0, total: amount },
});
const openItem = async (sku: string) => (await sql<{ item_id: string }>`
  SELECT item_id FROM item_codes WHERE tenant_id = ${tenantId} AND kind = 'sku' AND code = ${sku} AND valid_to IS NULL`.execute(db)).rows[0]?.item_id;
const refs = async (sku: string) => ({
  ledger: (await sql<{ item_id: string | null }>`SELECT DISTINCT item_id FROM ledger_lines WHERE tenant_id = ${tenantId} AND product_sku = ${sku}`.execute(db)).rows.map((r) => r.item_id),
  moves: (await sql<{ item_id: string | null }>`SELECT DISTINCT item_id FROM inventory_movements WHERE tenant_id = ${tenantId} AND sku = ${sku}`.execute(db)).rows.map((r) => r.item_id),
});

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('item_id trên dòng sổ / kho', () => {
  it('chứng từ mang mã mới → mặt hàng tự thêm, dòng sổ và dòng kho mang item_id của mặt hàng đó', async () => {
    const r = await post(purchase('B2-NM1', '2026-10-02', 'B2-MOI', 10, 500000));
    expect(r.body.data.status, JSON.stringify(r.body)).toBe('posted');
    const id = await openItem('B2-MOI');
    expect(id).toBeTruthy();
    const x = await refs('B2-MOI');
    expect(x.ledger).toEqual([id]);
    expect(x.moves).toEqual([id]);
    // mọi dòng có mã hàng đều có item_id (R-CONT-0)
    const missing = await sql<{ n: string }>`
      SELECT (SELECT count(*) FROM ledger_lines WHERE tenant_id = ${tenantId} AND product_sku <> '' AND item_id IS NULL)
           + (SELECT count(*) FROM inventory_movements WHERE tenant_id = ${tenantId} AND sku <> '' AND item_id IS NULL) AS n`.execute(db);
    expect(Number(missing.rows[0]!.n)).toBe(0);
  });

  it('đổi mã giữa kỳ: dòng cũ giữ mã cũ, cùng item_id; Hành trình nối mã cũ + mới thành một, tìm bằng mã cũ ra mặt hàng hiện hành', async () => {
    await post(purchase('B2-NM2', '2026-10-03', 'B2-CU', 10, 600000));
    const id = (await openItem('B2-CU'))!;
    await sql`UPDATE products SET sku = 'B2-MOI2' WHERE tenant_id = ${tenantId} AND sku = 'B2-CU'`.execute(db);   // đổi mã từ hôm nay
    expect(await openItem('B2-MOI2')).toBe(id);
    const r = await post(purchase('B2-NM3', today(), 'B2-MOI2', 5, 300000));
    expect(r.body.data.status, JSON.stringify(r.body)).toBe('posted');
    expect((await refs('B2-CU')).ledger).toEqual([id]);         // mã cũ là ảnh chụp, định danh giữ nguyên
    expect((await refs('B2-MOI2')).moves).toEqual([id]);

    const l = (await call(ctx, 'GET', '/api/v1/lineage/items/B2-MOI2')).body.data;
    expect(l.item.itemId).toBe(id);
    expect(l.coverage.keyedBy).toBe('item_id');
    expect(l.events.map((e: { docKey: string; code: string }) => [e.docKey, e.code])).toEqual([['B2-NM2', 'B2-CU'], ['B2-NM3', 'B2-MOI2']]);
    expect(l.item.codes.filter((c: { kind: string }) => c.kind === 'sku').map((c: { code: string; validTo: string | null }) => [c.code, c.validTo === null])).toEqual([['B2-CU', false], ['B2-MOI2', true]]);
    expect(l.coverage.notes[0]).toMatch(/B2-CU .*B2-MOI2/);
    expect(new Set(l.entries.map((e: { docNo: string }) => e.docNo))).toEqual(new Set(['B2-NM2', 'B2-NM3']));

    await put('B2-MOI2', { name: 'Sữa hộp đổi mã' });
    const s = (await call(ctx, 'GET', '/api/v1/lineage/search?q=B2-CU')).body.data;
    expect(s[0]).toMatchObject({ sku: 'B2-MOI2' });
    expect(s[0].name).toMatch(/mã cũ \/ khác: B2-CU/);
  });

  it('sổ cái chỉ thêm: không đổi item_id đã có, không đổi mã hàng, không xoá item_id', async () => {
    const line = (await sql<{ id: string; item_id: string }>`SELECT id, item_id FROM ledger_lines WHERE tenant_id = ${tenantId} AND product_sku = 'B2-MOI' LIMIT 1`.execute(db)).rows[0]!;
    const other = (await openItem('B2-MOI2'))!;
    await expect(sql`UPDATE ledger_lines SET item_id = ${other} WHERE id = ${line.id}`.execute(db)).rejects.toThrow(/chỉ được thêm/);
    await expect(sql`UPDATE ledger_lines SET item_id = NULL WHERE id = ${line.id}`.execute(db)).rejects.toThrow(/chỉ được thêm/);
    await expect(sql`UPDATE ledger_lines SET product_sku = 'B2-MOI2' WHERE id = ${line.id}`.execute(db)).rejects.toThrow(/chỉ được thêm/);
    // item_id phải là mặt hàng CÙNG đơn vị (khoá ngoại ghép)
    await expect(sql`INSERT INTO product_units (tenant_id, sku, unit, item_id) VALUES (${tenantId}, 'B2-X', 'Cái', '01ZZZZZZZZZZZZZZZZZZZZZZZZ')`.execute(db)).rejects.toThrow(/foreign key/);
  });

  it('mặt hàng mồ côi: mã chỉ có trong đơn vị quy đổi → tạo định danh ngừng dùng; khai lại mặt hàng thì nhận lại đúng định danh đó', async () => {
    await sql`INSERT INTO product_units (tenant_id, sku, unit, ratio) VALUES (${tenantId}, 'B2-MOCOI', 'Thùng', 12)`.execute(db);
    expect((await sql<{ item_id: string | null }>`SELECT item_id FROM product_units WHERE tenant_id = ${tenantId} AND sku = 'B2-MOCOI'`.execute(db)).rows[0]!.item_id).toBeNull();
    expect(Number((await sql<{ n: number }>`SELECT bizcity_items_adopt_orphans(${tenantId}::bigint) AS n`.execute(db)).rows[0]!.n)).toBe(1);
    const id = (await openItem('B2-MOCOI'))!;
    expect(await db.selectFrom('items').select(['status', 'attributes']).where('item_id', '=', id).executeTakeFirst()).toMatchObject({ status: 'retired', attributes: { orphan: true } });

    expect((await put('B2-MOCOI', { name: 'Hàng mồ côi khai lại', unit: 'Hộp', ...ack })).status).toBe(200);
    expect(await openItem('B2-MOCOI')).toBe(id);
    const it = await db.selectFrom('items').select(['status', 'name', 'attributes']).where('item_id', '=', id).executeTakeFirstOrThrow();
    expect(it).toMatchObject({ status: 'active', name: 'Hàng mồ côi khai lại' });
    expect(it.attributes).not.toHaveProperty('orphan');
    expect((await sql<{ item_id: string }>`SELECT item_id FROM product_units WHERE tenant_id = ${tenantId} AND sku = 'B2-MOCOI'`.execute(db)).rows[0]!.item_id).toBe(id);
    expect(Number((await sql<{ n: number }>`SELECT bizcity_items_adopt_orphans(${tenantId}::bigint) AS n`.execute(db)).rows[0]!.n)).toBe(0);   // chạy lại: không tạo thêm
  });

  it('xoá (chưa có nhập xuất) rồi tạo lại cùng mã → định danh mới, mã không chồng hiệu lực', async () => {
    expect((await put('B2-XOA', { name: 'Hàng sẽ xoá', unit: 'Hộp', ...ack })).status).toBe(200);
    const oldId = (await openItem('B2-XOA'))!;
    const del = await call(ctx, 'DELETE', '/api/v1/products/B2-XOA');
    expect(del.status, JSON.stringify(del.body)).toBe(200);
    expect(await openItem('B2-XOA')).toBeUndefined();

    expect((await put('B2-XOA', { name: 'Hàng tạo lại', unit: 'Hộp', ...ack })).status).toBe(200);
    const newId = (await openItem('B2-XOA'))!;
    expect(newId).not.toBe(oldId);
    const codes = (await sql<{ item_id: string; valid_from: string; valid_to: string | null }>`
      SELECT item_id, valid_from::text, valid_to::text FROM item_codes WHERE tenant_id = ${tenantId} AND kind = 'sku' AND code = 'B2-XOA' ORDER BY valid_from`.execute(db)).rows;
    expect(codes).toHaveLength(2);
    expect(codes[1]!.valid_from >= codes[0]!.valid_to!).toBe(true);
    expect(await db.selectFrom('items').select('status').where('item_id', '=', oldId).executeTakeFirst()).toMatchObject({ status: 'retired' });
  });

  it('giá vốn theo định danh: đổi mã giữa tháng → một dòng giá vốn mang mã hiện hành, đơn giá bình quân cả hai mã; phiếu giá vốn ghi mã tại ngày', async () => {
    const ym = today().slice(0, 7);
    const d1 = `${ym}-01`;
    expect((await post(purchase('B2-GV1', d1, 'B2-GVA', 10, 100000))).body.data.status).toBe('posted');     // 10 × 10.000
    const id = (await openItem('B2-GVA'))!;
    await sql`UPDATE products SET sku = 'B2-GVB' WHERE tenant_id = ${tenantId} AND sku = 'B2-GVA'`.execute(db);
    expect((await post(purchase('B2-GV2', today(), 'B2-GVB', 10, 200000))).body.data.status).toBe('posted'); // 10 × 20.000
    const sale = await post({
      docType: 'sale', docKey: 'B2-GV3', branchCode: 'CN01', docNo: 'B2-GV3', docDate: today(),
      lines: [{ lineKey: 'l1', sku: 'B2-GVB', name: 'B2-GVB', unit: 'Hộp', qty: 4, amountBeforeTax: 400000, taxCode: 'R08', taxAmount: 32000 }],
      payments: [{ methodCode: 'TM', amount: 432000 }], totals: { beforeTax: 400000, tax: 32000, total: 432000 },
    });
    expect(sale.body.data.status, JSON.stringify(sale.body)).toBe('posted');
    const run = await call(ctx, 'POST', '/api/v1/inventory/costing', { period: ym });
    expect(run.status, JSON.stringify(run.body)).toBe(200);

    const costs = (await sql<{ sku: string; item_id: string; in_qty: string; unit_cost: string; out_qty: string }>`
      SELECT sku, item_id, in_qty, unit_cost, out_qty FROM inventory_costs WHERE tenant_id = ${tenantId} AND item_id = ${id}`.execute(db)).rows;
    expect(costs).toHaveLength(1);                                   // không tách thành B2-GVA + B2-GVB
    expect(costs[0]).toMatchObject({ sku: 'B2-GVB', item_id: id });
    expect(Number(costs[0]!.in_qty)).toBe(20);
    expect(Number(costs[0]!.unit_cost)).toBe(15000);                 // (100.000 + 200.000) ÷ 20
    expect(Number(costs[0]!.out_qty)).toBe(4);
    const list = (await call(ctx, 'GET', `/api/v1/inventory/costs?period=${ym}&search=B2-GV`)).body.data;
    expect(list.filter((r: { itemId: string }) => r.itemId === id)).toHaveLength(1);

    // Phiếu giá vốn: 4 × 15.000, mã hàng trên dòng sổ = mã tại ngày bán, dòng sổ vẫn về đúng định danh.
    const cogs = (await sql<{ product_sku: string; debit: string }>`
      SELECT product_sku, debit FROM ledger_lines WHERE tenant_id = ${tenantId} AND item_id = ${id} AND description = 'Giá vốn hàng bán' AND debit > 0`.execute(db)).rows;
    expect(cogs).toEqual([{ product_sku: 'B2-GVB', debit: expect.any(String) }]);
    expect(Number(cogs[0]!.debit)).toBe(60000);
    // Hành trình: một kỳ giá vốn, nối cả hai mã.
    const l = (await call(ctx, 'GET', '/api/v1/lineage/items/B2-GVA')).body.data;
    expect(l.item.itemId).toBe(id);
    expect(l.costPeriods).toHaveLength(1);
    expect(l.costPeriods[0]).toMatchObject({ period: ym, unitCost: 15000 });
    // Báo cáo kho theo định danh: NXT một dòng mang mã hiện hành; sổ chi tiết tra bằng mã cũ vẫn ra đủ.
    const nxt = (await call(ctx, 'GET', `/api/v1/inventory/stock-movement?from=${d1}&to=${today()}&search=B2-GV`)).body.data.rows;
    expect(nxt.filter((r: { sku: string }) => r.sku.startsWith('B2-GV')).map((r: { sku: string; inQty: number; outQty: number }) => [r.sku, r.inQty, r.outQty])).toEqual([['B2-GVB', 20, 4]]);
    const ledger = (await call(ctx, 'GET', `/api/v1/inventory/item-ledger?sku=B2-GVA&from=${d1}&to=${today()}`)).body.data;
    expect(ledger.rows.map((r: { docNo: string }) => r.docNo)).toEqual(['B2-GV1', 'B2-GV2', 'B2-GV3']);
    expect(ledger.closing).toMatchObject({ qty: 16, value: 240000 });
  });

  it('dòng mới tự gắn item_id theo mã tại ngày (trigger), bảng giá cũng vậy', async () => {
    const id = (await openItem('B2-MOI'))!;
    await sql`INSERT INTO product_prices (tenant_id, price_list_code, sku, unit, price) VALUES (${tenantId}, 'BL', 'B2-MOI', 'Hộp', 55000)`.execute(db);
    expect((await sql<{ item_id: string }>`SELECT item_id FROM product_prices WHERE tenant_id = ${tenantId} AND sku = 'B2-MOI'`.execute(db)).rows[0]!.item_id).toBe(id);
  });
});
