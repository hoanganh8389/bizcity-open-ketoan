// [2026-11-05 01:20 PM Nguyễn Văn Thủy] PHASE-026 — S024-11, S026-19..22: đổi mã, gộp nhiều lần, mã cũ qua cửa nạp, cấu hình theo mã mới, hệ ngoài (đóng góp)
/**
 * Xương cá (docs/core/06-xuong-ca-dinh-danh.md):
 *   - đổi mã: một item_id xuyên suốt, sổ cũ giữ ảnh chụp, cấu hình theo mã mới, mã cũ không dùng lại;
 *   - mã cũ vẫn gửi vào cửa nạp: không tạo mặt hàng mới, dòng sổ đúng định danh;
 *   - gộp: còn tồn thì chặn, sổ cũ không đổi, gộp tiếp được (A → B → C), tra mã theo ngày đúng từng chặng;
 *   - hệ ngoài: mã external:<nguồn>, itemId không đổi qua đổi mã, nguồn đổi trả itemId và định danh thay thế.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';
import { todayVN } from '../src/core/date-rules.js';

let ctx: TestCtx;
let tenantId = '';
const today = () => todayVN();
const yesterday = () => new Date(new Date(`${today()}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
const ack = { warnAck: { reason: 'thử xương cá', codes: ['ITEM-HINT-001'] } };
const put = (sku: string, unit = 'Hộp') => call(ctx, 'PUT', `/api/v1/products/${sku}`, { name: sku, unit, ...ack });
const line = (sku: string, qty: number, amount: number) => ({ lineKey: 'l1', sku, name: sku, unit: 'Hộp', qty, amountBeforeTax: amount, taxCode: 'V08', taxAmount: 0 });
const purchase = (key: string, sku: string, qty: number, amount: number) => call(ctx, 'POST', '/api/v1/documents', {
  docType: 'purchase', docKey: key, branchCode: 'CN01', docNo: key, docDate: today(), partner: { code: 'NCC-01', name: 'Nhà cung cấp 01' },
  lines: [line(sku, qty, amount)], totals: { beforeTax: amount, tax: 0, total: amount },
});
const sale = (key: string, sku: string, qty: number, amount: number) => call(ctx, 'POST', '/api/v1/documents', {
  docType: 'sale', docKey: key, branchCode: 'CN01', docNo: key, docDate: today(),
  lines: [line(sku, qty, amount)], totals: { beforeTax: amount, tax: 0, total: amount },
});
const idOf = async (code: string, day = today()) =>
  (await sql<{ id: string | null }>`SELECT bizcity_item_at(${tenantId}::bigint, ${code}, ${day}::date) AS id`.execute(db)).rows[0]?.id ?? null;
const ledgerIds = async (sku: string) =>
  (await sql<{ item_id: string | null }>`SELECT DISTINCT item_id FROM ledger_lines WHERE tenant_id = ${tenantId} AND product_sku = ${sku}`.execute(db)).rows.map((r) => r.item_id);
const ledgerCount = async () => Number((await sql<{ n: string }>`SELECT count(*) AS n FROM ledger_lines WHERE tenant_id = ${tenantId}`.execute(db)).rows[0]!.n);
const rename = (sku: string, newSku: string) => call(ctx, 'POST', '/api/v1/items/rename-code', { sku, newSku, reason: 'quy định mã mới' });
const merge = (from: string, to: string) => call(ctx, 'POST', '/api/v1/items/merge', { from: { sku: from }, to: { sku: to }, reason: 'hai mã trùng hàng' });

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Đổi mã', () => {
  it('giữ item_id, sổ cũ giữ mã cũ, ghi người đổi và lý do', async () => {
    expect((await put('XC-A')).status).toBeLessThan(300);
    const id = (await idOf('XC-A'))!;
    expect((await purchase('xc-mua-1', 'XC-A', 10, 1_000_000)).status).toBeLessThan(300);
    const before = await ledgerCount();
    const r = await rename('XC-A', 'XC-A2');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ itemId: id, fromSku: 'XC-A', toSku: 'XC-A2' });
    expect(await ledgerCount()).toBe(before);
    expect(await ledgerIds('XC-A')).toEqual([id]);
    expect(await idOf('XC-A2')).toBe(id);
    const code = (await sql<{ created_by: string; note: string }>`SELECT created_by, note FROM item_codes WHERE tenant_id = ${tenantId} AND kind = 'sku' AND code = 'XC-A2'`.execute(db)).rows[0]!;
    expect(code.created_by).not.toMatch(/^system/);
    expect(code.note).toContain('quy định mã mới');
    const ev = await sql<{ object_id: string }>`SELECT object_id FROM audit_logs WHERE tenant_id = ${tenantId} AND object_type = 'item' AND action = 'core.item.rename-code'`.execute(db);
    expect(ev.rows.map((x) => x.object_id)).toContain(id);
  });

  it('cấu hình đi theo mã mới và vẫn đúng định danh', async () => {
    await put('XC-C');
    const id = (await idOf('XC-C'))!;
    await sql`INSERT INTO product_units (tenant_id, sku, unit, ratio) VALUES (${tenantId}, 'XC-C', 'Thùng', 24)`.execute(db);
    await sql`INSERT INTO supplier_products (tenant_id, partner_code, sku, unit, price) VALUES (${tenantId}, 'NCC-01', 'XC-C', 'Hộp', 5000)`.execute(db);
    await sql`INSERT INTO stock_levels (tenant_id, branch_code, warehouse_code, sku, max_qty) VALUES (${tenantId}, 'CN01', '', 'XC-C', 50)`.execute(db);
    expect((await rename('XC-C', 'XC-C2')).status).toBe(200);
    for (const t of ['product_units', 'supplier_products', 'stock_levels']) {
      const rows = (await sql<{ sku: string; item_id: string }>`SELECT sku, item_id FROM ${sql.table(t)} WHERE tenant_id = ${tenantId} AND item_id = ${id}`.execute(db)).rows;
      expect(rows.length, t).toBe(1);
      expect(rows[0]!.sku, t).toBe('XC-C2');
    }
    const res = await call(ctx, 'GET', '/api/v1/items/resolve?code=XC-C');
    expect(res.body.data).toMatchObject({ itemId: id, sku: 'XC-C2' });
  });

  // [2026-11-13 Nguyễn Văn Thủy] mã cha suy theo mã (0112/0115): mã biến thể = mã cha + chữ đầu / cuối (đóng góp)
  it('mã con tự gắn mã cha theo mã (chữ đầu hoặc cuối), định danh cha đúng', async () => {
    await put('900000001');
    await call(ctx, 'PUT', '/api/v1/products/900000001Z', { name: '900000001Z', unit: 'Hộp', ...ack });
    await call(ctx, 'PUT', '/api/v1/products/K900000001', { name: 'K900000001', unit: 'Hộp', ...ack });
    const p = (await idOf('900000001'))!;
    const rows = (await sql<{ sku: string; parent_sku: string; parent_item_id: string }>`
      SELECT p.sku, p.parent_sku, i.parent_item_id FROM products p JOIN item_codes c ON c.tenant_id = p.tenant_id AND c.kind = 'sku' AND c.code = p.sku AND c.valid_to IS NULL
      JOIN items i ON i.item_id = c.item_id WHERE p.tenant_id = ${tenantId} AND p.sku IN ('900000001Z', 'K900000001') ORDER BY p.sku`.execute(db)).rows;
    expect(rows).toEqual([
      { sku: '900000001Z', parent_sku: '900000001', parent_item_id: p },
      { sku: 'K900000001', parent_sku: '900000001', parent_item_id: p },
    ]);
  });

  it('không dùng lại mã của hàng còn sống, không đè mã đang dùng; gửi lại không đổi gì', async () => {
    await put('XC-D');
    expect((await rename('XC-D', 'XC-A2')).status).toBe(409);       // đang là mặt hàng khác
    expect((await rename('XC-D', 'XC-A')).status).toBe(409);        // mã cũ của hàng còn sống
    expect((await put('XC-A')).status).toBeGreaterThanOrEqual(400); // tạo mới bằng mã cũ
    expect((await rename('XC-A2', 'XC-A2')).status).toBe(200);
  });

  it('mã cũ gửi vào cửa nạp: không tạo mặt hàng mới, dòng sổ đúng định danh', async () => {
    const id = (await idOf('XC-A2'))!;
    const r = await sale('xc-ban-ma-cu', 'XC-A', 1, 200_000);
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    const p = await db.selectFrom('products').select('sku').where('tenant_id', '=', tenantId).where('sku', '=', 'XC-A').executeTakeFirst();
    expect(p).toBeUndefined();
    expect(await ledgerIds('XC-A')).toEqual([id]);
  });

  it('nhập xuất tồn một dòng qua đổi mã: tổng theo item_id = mua − bán', async () => {
    const id = (await idOf('XC-A2'))!;
    const q = (await sql<{ q: string }>`SELECT sum(qty) AS q FROM inventory_movements WHERE tenant_id = ${tenantId} AND item_id = ${id}`.execute(db)).rows[0]!.q;
    expect(Number(q)).toBe(9);
  });
});

describe('Gộp mã', () => {
  it('còn tồn thì chặn, xem trước nói rõ và không ghi gì', async () => {
    await put('XC-M1');
    await put('XC-M2');
    await purchase('xc-mua-m1', 'XC-M1', 5, 500_000);
    const pv = await call(ctx, 'POST', '/api/v1/items/merge-preview', { from: { sku: 'XC-M1' }, to: { sku: 'XC-M2' } });
    expect(pv.status).toBe(200);
    expect(pv.body.data.canMerge).toBe(false);
    expect(pv.body.data.blocks.map((b: { code: string }) => b.code)).toContain('FROM_HAS_STOCK');
    expect(pv.body.data.stock[0].qty).toBe(5);
    expect((await merge('XC-M1', 'XC-M2')).status).toBe(409);
    expect(await idOf('XC-M1')).not.toBe(await idOf('XC-M2'));
  });

  it('hết tồn thì gộp: sổ cũ giữ nguyên, định danh cũ ngừng dùng, cấu hình chuyển sang đích', async () => {
    const a = (await idOf('XC-M1'))!;
    const b = (await idOf('XC-M2'))!;
    await sale('xc-ban-m1', 'XC-M1', 5, 700_000);
    await sql`INSERT INTO product_units (tenant_id, sku, unit, ratio) VALUES (${tenantId}, 'XC-M1', 'Lốc', 6)`.execute(db);
    const before = await ledgerCount();
    const lines = await ledgerIds('XC-M1');
    const r = await merge('XC-M1', 'XC-M2');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await ledgerCount()).toBe(before);
    expect(await ledgerIds('XC-M1')).toEqual(lines);
    const it = (await sql<{ status: string; merged_into_item_id: string }>`SELECT status, merged_into_item_id FROM items WHERE item_id = ${a}`.execute(db)).rows[0]!;
    expect(it).toEqual({ status: 'retired', merged_into_item_id: b });
    expect(await db.selectFrom('products').select('sku').where('tenant_id', '=', tenantId).where('sku', '=', 'XC-M1').executeTakeFirst()).toBeUndefined();
    const u = (await sql<{ sku: string; item_id: string }>`SELECT sku, item_id FROM product_units WHERE tenant_id = ${tenantId} AND unit = 'Lốc' AND item_id = ${b}`.execute(db)).rows;
    expect(u).toEqual([{ sku: 'XC-M2', item_id: b }]);
  });

  it('mã cũ sau gộp: hôm qua ra mặt hàng cũ, hôm nay ra đích; chứng từ mới vào đích; tạo lại mã bị từ chối', async () => {
    const a = (await sql<{ item_id: string }>`SELECT item_id FROM item_codes WHERE tenant_id = ${tenantId} AND kind = 'sku' AND code = 'XC-M1'`.execute(db)).rows[0]!.item_id;
    const b = (await idOf('XC-M2'))!;
    expect(await idOf('XC-M1', yesterday())).toBe(a);
    expect(await idOf('XC-M1')).toBe(b);
    await purchase('xc-mua-sau-gop', 'XC-M1', 2, 200_000);
    const q = (await sql<{ q: string }>`SELECT sum(qty) AS q FROM inventory_movements WHERE tenant_id = ${tenantId} AND item_id = ${b}`.execute(db)).rows[0]!.q;
    expect(Number(q)).toBe(2);
    expect((await put('XC-M1')).status).toBeGreaterThanOrEqual(400);
  });

  it('gộp lần hai: A → B → C; tra mã A và B ra C; gia đình đủ ba; gộp lại A bị chặn; không tạo vòng', async () => {
    const a = (await sql<{ item_id: string }>`SELECT item_id FROM item_codes WHERE tenant_id = ${tenantId} AND kind = 'sku' AND code = 'XC-M1'`.execute(db)).rows[0]!.item_id;
    const b = (await idOf('XC-M2'))!;
    await put('XC-M3');
    const c = (await idOf('XC-M3'))!;
    await sale('xc-ban-m2', 'XC-M2', 2, 300_000);   // hết tồn ở B
    const before = await ledgerCount();
    const r = await merge('XC-M2', 'XC-M3');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await ledgerCount()).toBe(before);
    expect(await idOf('XC-M1')).toBe(c);
    expect(await idOf('XC-M2')).toBe(c);
    const fam = (await sql<{ id: string }>`SELECT bizcity_item_family(${a}) AS id`.execute(db)).rows.map((x) => x.id).sort();
    expect(fam).toEqual([a, b, c].sort());
    const rec = await call(ctx, 'GET', `/api/v1/items/${a}`);
    expect(rec.body.data).toMatchObject({ itemId: a, status: 'retired', mergedIntoItemId: b, rootItemId: c });
    const pv = await call(ctx, 'POST', '/api/v1/items/merge-preview', { from: { itemId: a }, to: { sku: 'XC-A2' } });
    expect(pv.status).toBe(200);   // itemId đã gộp đi theo chuỗi tới C: đang xem C → XC-A2, không phải A
    expect(pv.body.data.fromItemId).toBe(c);
    await expect(sql`UPDATE items SET merged_into_item_id = NULL, merged_at = NULL WHERE item_id = ${a}`.execute(db)).rejects.toThrow(/đã gộp/);
    await expect(sql`UPDATE items SET merged_into_item_id = ${a}, merged_at = CURRENT_DATE WHERE item_id = ${c}`.execute(db)).rejects.toThrow(/vòng/);
  });

  it('khác đơn vị tính gốc thì chặn', async () => {
    await put('XC-U1', 'Hộp');
    await put('XC-U2', 'Thùng');
    const pv = await call(ctx, 'POST', '/api/v1/items/merge-preview', { from: { sku: 'XC-U1' }, to: { sku: 'XC-U2' } });
    expect(pv.body.data.blocks.map((b: { code: string }) => b.code)).toContain('UNIT_MISMATCH');
  });
});

describe('Báo cáo và lịch sử qua đổi mã, gộp mã', () => {
  it('sổ kho theo mã hiện hành gom một dòng; lọc riêng theo mã lúc ghi vẫn được', async () => {
    await put('XC-R1');
    await purchase('xc-r-1', 'XC-R1', 4, 400_000);
    await rename('XC-R1', 'XC-R2');
    await purchase('xc-r-2', 'XC-R2', 6, 600_000);
    const cur = (await sql<{ sku: string; q: string }>`SELECT sku, SUM(qty) AS q FROM inventory_movements_cur WHERE tenant_id = ${tenantId} AND sku IN ('XC-R1', 'XC-R2') GROUP BY sku`.execute(db)).rows;
    expect(cur.map((r) => [r.sku, Number(r.q)])).toEqual([['XC-R2', 10]]);
    const raw = (await sql<{ q: string }>`SELECT SUM(qty) AS q FROM inventory_movements_cur WHERE tenant_id = ${tenantId} AND snapshot_sku = 'XC-R1'`.execute(db)).rows[0]!;
    expect(Number(raw.q)).toBe(4);
  });

  it('báo cáo bán hàng theo mặt hàng: bán dưới mã cũ và mã mới cùng một dòng', async () => {
    await put('XC-S1');
    await purchase('xc-s-m', 'XC-S1', 10, 1_000_000);
    await sale('xc-s-1', 'XC-S1', 1, 150_000);
    await rename('XC-S1', 'XC-S2');
    await sale('xc-s-2', 'XC-S2', 2, 300_000);
    const r = await call(ctx, 'GET', `/api/v1/reports/gross-profit?from=${today()}&to=${today()}&groupBy=product`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const rows = (r.body.data.rows ?? r.body.data) as { key: string; qty: number }[];
    const mine = rows.filter((x) => x.key === 'XC-S1' || x.key === 'XC-S2');
    expect(mine.length).toBe(1);
    expect(mine[0]!.key).toBe('XC-S2');
    expect(Number(mine[0]!.qty)).toBe(3);
  });

  it('lịch sử tra bằng mã cũ có đổi mã kèm lý do và gộp mã', async () => {
    const h = (await call(ctx, 'GET', '/api/v1/lineage/items/XC-M2/history')).body.data;
    const texts = h.entries.map((e: { text: string }) => e.text);
    expect(texts.some((t: string) => /^Gộp mã XC-M1 vào XC-M2 — lý do: "hai mã trùng hàng"/.test(t)), texts.join(' | ')).toBe(true);
    const h2 = (await call(ctx, 'GET', '/api/v1/lineage/items/XC-A/history')).body.data;
    expect(h2.entries.some((e: { text: string }) => /^Lý do đổi mã XC-A → XC-A2: "quy định mã mới"/.test(e.text))).toBe(true);
  });

  it('đổi mã bằng mã cũ vẫn tìm ra mặt hàng', async () => {
    const r = await rename('XC-A', 'XC-A3');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ fromSku: 'XC-A2', toSku: 'XC-A3' });
  });
});

describe('Định danh phủ kín (0070)', () => {
  it('canh cửa: bảng nào có cột mã hàng đều phải có item_id', async () => {
    const r = await sql<{ table_name: string }>`
      SELECT c.table_name FROM information_schema.columns c
        JOIN information_schema.tables t USING (table_schema, table_name)
       WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND c.column_name IN ('sku', 'product_sku', 'parent_sku')
         AND NOT EXISTS (SELECT 1 FROM information_schema.columns x WHERE x.table_schema = 'public' AND x.table_name = c.table_name AND x.column_name = 'item_id')`.execute(db);
    expect(r.rows.map((x) => x.table_name)).toEqual([]);
  });

  it('dòng danh mục có item_id trùng định danh của mã, đổi mã không đổi, không sửa tay được', async () => {
    expect((await put('PK-A')).status).toBe(200);
    const row = async (sku: string) => (await sql<{ item_id: string | null }>`SELECT item_id FROM products WHERE tenant_id = ${tenantId} AND sku = ${sku}`.execute(db)).rows[0]?.item_id;
    const id = await row('PK-A');
    expect(id).toBe(await idOf('PK-A'));
    expect((await rename('PK-A', 'PK-A2')).status).toBe(200);
    expect(await row('PK-A2')).toBe(id);
    await expect(sql`UPDATE products SET item_id = ${'01ARZ3NDEKTSV4RRFFQ69G5FAV'} WHERE tenant_id = ${tenantId} AND sku = 'PK-A2'`.execute(db)).rejects.toThrow(/không đổi được/);
    const missing = await sql<{ n: string }>`SELECT count(*) AS n FROM products WHERE tenant_id = ${tenantId} AND item_id IS NULL`.execute(db);
    expect(Number(missing.rows[0]!.n)).toBe(0);
  });

  it('thêm trùng mã (ON CONFLICT) không làm hỏng tên và định danh', async () => {
    expect((await put('PK-B')).status).toBe(200);
    const id = await idOf('PK-B');
    const r = await call(ctx, 'POST', '/api/v1/items/upsert', { sku: 'PK-B', name: '', unit: '' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ sku: 'PK-B', itemId: id });
    const it = await sql<{ name: string }>`SELECT name FROM items WHERE item_id = ${id!}`.execute(db);
    expect(it.rows[0]!.name).toBe('PK-B');
  });

  it('JSON dòng phiếu tự kèm itemId, cả khi sửa phiếu', async () => {
    expect((await put('PK-C')).status).toBe(200);
    const id = await idOf('PK-C');
    const ins = await sql<{ id: string }>`
      INSERT INTO transfer_requests (tenant_id, code, from_branch, from_warehouse, to_branch, to_warehouse, data, created_by)
      VALUES (${tenantId}, ${'PK-DNC-' + Date.now()}, 'CN01', '', 'CN01', '', ${JSON.stringify({ lines: [{ sku: 'PK-C', qty: 1 }, { sku: '', qty: 2 }] })}::jsonb, 'test') RETURNING id`.execute(db);
    const dataOf = async () => (await sql<{ data: { lines: { sku: string; itemId?: string }[] } }>`SELECT data FROM transfer_requests WHERE id = ${ins.rows[0]!.id}`.execute(db)).rows[0]!.data;
    expect((await dataOf()).lines[0]!.itemId).toBe(id);
    expect((await dataOf()).lines[1]!.itemId).toBeUndefined();
    expect((await rename('PK-C', 'PK-C2')).status).toBe(200);
    await sql`UPDATE transfer_requests SET data = ${JSON.stringify({ lines: [{ sku: 'PK-C', qty: 3 }] })}::jsonb WHERE id = ${ins.rows[0]!.id}`.execute(db);
    expect((await dataOf()).lines[0]).toMatchObject({ sku: 'PK-C', itemId: id });   // mã cũ vẫn ra đúng định danh
  });

  it('sales_lines và bizcity_read có item_id', async () => {
    expect((await put('PK-D')).status).toBe(200);
    const id = await idOf('PK-D');
    expect((await purchase('PK-M1', 'PK-D', 5, 500000)).body.data.status).toBe('posted');
    expect((await sale('PK-S1', 'PK-D', 1, 150000)).body.data.status).toBe('posted');
    const sl = await sql<{ item_id: string }>`SELECT item_id FROM sales_lines WHERE tenant_id = ${tenantId} AND sku = 'PK-D'`.execute(db);
    expect(sl.rows[0]?.item_id).toBe(id);
    const rl = await sql<{ item_id: string }>`SELECT DISTINCT item_id FROM bizcity_read.ledger_lines WHERE tenant_id = ${tenantId} AND product_sku = 'PK-D'`.execute(db);
    expect(rl.rows.map((r) => r.item_id)).toEqual([id]);
    const ri = await sql<{ root_item_id: string }>`SELECT root_item_id FROM bizcity_read.items WHERE item_id = ${id!}`.execute(db);
    expect(ri.rows[0]?.root_item_id).toBe(id);
  });

  it('sổ chi tiết lọc bằng mã mới, mã cũ đều đủ lịch sử; codeOnly chỉ phần dưới đúng mã đó', async () => {
    expect((await put('PK-E')).status).toBe(200);
    expect((await purchase('PK-M2', 'PK-E', 10, 1000000)).body.data.status).toBe('posted');
    expect((await rename('PK-E', 'PK-E2')).status).toBe(200);
    expect((await purchase('PK-M3', 'PK-E2', 10, 1000000)).body.data.status).toBe('posted');
    const ask = async (sku: string, extra = '') => {
      const r = await call(ctx, 'GET', `/api/v1/reports/journal?from=${today()}&to=${today()}&account=156&sku=${sku}${extra}`);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      return r.body.data.rows.length as number;
    };
    const both = await ask('PK-E2');
    expect(both).toBeGreaterThanOrEqual(2);
    expect(await ask('PK-E')).toBe(both);
    expect(await ask('PK-E', '&codeOnly=true')).toBe(both / 2);
    expect(await ask('PK-E2', '&codeOnly=true')).toBe(both / 2);
  });

  it('cửa nạp nhận itemId: thay cho mã, mã cũ cùng hàng được, khác hàng hoặc không có thì từ chối', async () => {
    expect((await put('PK-F')).status).toBe(200);
    expect((await put('PK-G')).status).toBe(200);
    const id = (await idOf('PK-F'))!;
    expect((await rename('PK-F', 'PK-F2')).status).toBe(200);
    const send = (key: string, l: Record<string, unknown>) => call(ctx, 'POST', '/api/v1/documents', {
      docType: 'purchase', docKey: key, branchCode: 'CN01', docNo: key, docDate: today(), partner: { code: 'NCC-01', name: 'Nhà cung cấp' }, payments: [],
      lines: [{ lineKey: 'l1', name: 'x', unit: 'Hộp', qty: 1, amountBeforeTax: 100000, taxCode: 'V08', taxAmount: 0, ...l }], totals: { beforeTax: 100000, tax: 0, total: 100000 },
    });
    const a = await send('PK-I1', { itemId: id });
    expect(a.body.data?.status, JSON.stringify(a.body)).toBe('posted');
    expect(await ledgerIds('PK-F2')).toContain(id);
    expect((await send('PK-I2', { itemId: id, sku: 'PK-F' })).body.data?.status).toBe('posted');
    expect((await send('PK-I3', { itemId: id, sku: 'PK-G' })).status).toBe(400);
    expect((await send('PK-I4', { itemId: '01ARZ3NDEKTSV4RRFFQ69G5FAV' })).status).toBe(400);
  });

  it('đóng mã ngoài; đổi phân loại từ hôm nay', async () => {
    expect((await put('PK-H')).status).toBe(200);
    const id = (await idOf('PK-H'))!;
    expect((await call(ctx, 'POST', '/api/v1/items/add-code', { sku: 'PK-H', kind: 'external:woocommerce', code: 'PK-WOO-1' })).status).toBe(200);
    const r = await call(ctx, 'POST', '/api/v1/items/retire-code', { sku: 'PK-H', kind: 'external:woocommerce', code: 'PK-WOO-1', reason: 'gỡ khỏi web' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.validTo).toBeTruthy();
    expect((await call(ctx, 'POST', '/api/v1/items/retire-code', { sku: 'PK-H', kind: 'sku', code: 'PK-H', reason: 'không được đóng' })).status).toBe(400);
    const g = await sql<{ code: string }>`SELECT code FROM product_posting_groups WHERE tenant_id = ${tenantId} LIMIT 1`.execute(db);
    if (g.rows[0]) {
      const c = await call(ctx, 'POST', '/api/v1/items/classify', { sku: 'PK-H', postingGroupCode: g.rows[0].code, reason: 'phân loại lại' });
      expect(c.status, JSON.stringify(c.body)).toBe(200);
      expect(c.body.data.itemId).toBe(id);
    }
    expect((await call(ctx, 'POST', '/api/v1/items/classify', { sku: 'PK-H', reason: 'thiếu nội dung' })).status).toBe(400);
  });
});

describe('Tác động qua gộp mã', () => {
  it('mặt hàng giữ lại tính cả chứng từ và sổ của mã đã gộp vào; tra bằng mã cũ cũng vậy', async () => {
    expect((await put('TD-A')).status).toBe(200);
    expect((await put('TD-B')).status).toBe(200);
    expect((await purchase('TD-M1', 'TD-A', 2, 200000)).body.data.status).toBe('posted');
    expect((await sale('TD-S1', 'TD-A', 2, 300000)).body.data.status).toBe('posted');
    expect((await merge('TD-A', 'TD-B')).status).toBe(200);
    const docs = async (code: string) => (await call(ctx, 'GET', `/api/v1/lineage/items/${code}/impact`)).body.data.documents.map((d: { docType: string }) => d.docType) as string[];
    expect(await docs('TD-B')).toEqual(expect.arrayContaining(['purchase', 'sale']));
    expect(await docs('TD-A')).toEqual(expect.arrayContaining(['purchase', 'sale']));
  });
});

describe('Lịch sử đọc đúng chữ', () => {
  it('đổi mã có lý do không trộn lý do vào mã; upsert để trống không in thành trống', async () => {
    expect((await put('LS-A')).status).toBe(200);
    expect((await rename('LS-A', 'LS-A2')).status).toBe(200);
    expect((await call(ctx, 'POST', '/api/v1/items/upsert', { sku: 'LS-A2', name: '', unit: '' })).status).toBe(200);
    const texts = (await call(ctx, 'GET', '/api/v1/lineage/items/LS-A/history')).body.data.entries.map((e: { text: string }) => e.text) as string[];
    expect(texts.some((t) => /^Đổi mã LS-A → LS-A2 \(hiệu lực từ /.test(t))).toBe(true);
    expect(texts.some((t) => /\(trống\)/.test(t) && t.startsWith('Tạo / cập nhật'))).toBe(false);
  });
});

describe('Tên lúc ghi trên dòng sổ', () => {
  const setName = (sku: string, name: string) => call(ctx, 'PUT', `/api/v1/catalog/products/${sku}`, { name, unit: 'Hộp', ...ack });
  const lines = async (docNo: string) => (await sql<{ sku: string | null; name: string | null; rev: boolean }>`
    SELECT l.product_sku AS sku, l.product_name AS name, e.is_reversal AS rev FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
     WHERE l.tenant_id = ${tenantId} AND e.doc_no = ${docNo} AND l.part = 'goods'`.execute(db)).rows;
  it('phiếu bán mới mang mã và tên; đổi tên: dòng cũ giữ tên cũ, phiếu sau tên mới, đảo mang tên gốc', async () => {
    expect((await put('XC-TEN')).status).toBeLessThan(300);
    expect((await setName('XC-TEN', 'Tên đầu')).status).toBe(200);
    expect((await purchase('xc-ten-mua', 'XC-TEN', 10, 1_000_000)).status).toBeLessThan(300);
    expect((await sale('xc-ten-1', 'XC-TEN', 1, 200_000)).status).toBeLessThan(300);
    const dau = await lines('xc-ten-1');
    expect(dau.length).toBeGreaterThan(0);
    expect(dau.every((l) => l.sku === 'XC-TEN' && l.name === 'Tên đầu')).toBe(true);

    expect((await setName('XC-TEN', 'Tên sau')).status).toBe(200);
    expect((await lines('xc-ten-1')).every((l) => l.name === 'Tên đầu')).toBe(true);
    expect((await sale('xc-ten-2', 'XC-TEN', 1, 200_000)).status).toBeLessThan(300);
    expect((await lines('xc-ten-2')).every((l) => l.name === 'Tên sau')).toBe(true);

    const so = await call(ctx, 'GET', `/api/v1/reports/journal?from=${today()}&to=${today()}&sku=XC-TEN`);
    const text = JSON.stringify(so.body);
    expect(text).toContain('Tên đầu');
    expect(text).toContain('Tên sau');

    // Sửa phiếu đã ghi sau khi đổi tên: dòng đảo giữ tên gốc, dòng mới tên mới
    const sua = await call(ctx, 'POST', '/api/v1/documents', {
      docType: 'sale', docKey: 'xc-ten-1', branchCode: 'CN01', docNo: 'xc-ten-1', docDate: today(), version: 2,
      lines: [line('XC-TEN', 1, 300_000)], totals: { beforeTax: 300_000, tax: 0, total: 300_000 },
    });
    expect(sua.status, JSON.stringify(sua.body)).toBeLessThan(300);
    const sau = await lines('xc-ten-1');
    expect(sau.some((l) => l.rev)).toBe(true);
    expect(sau.filter((l) => l.rev).every((l) => l.name === 'Tên đầu')).toBe(true);
    expect(sau.filter((l) => !l.rev).some((l) => l.name === 'Tên sau')).toBe(true);
  });
});

describe('Lịch sử nói đổi từ gì sang gì', () => {
  const save = (sku: string, name: string) => call(ctx, 'PUT', `/api/v1/catalog/products/${sku}`, { name, unit: 'Hộp', ...ack });
  const texts = async (sku: string) => (await call(ctx, 'GET', `/api/v1/lineage/items/${sku}/history`)).body.data.entries.map((e: { text: string }) => e.text) as string[];
  it('sửa tên ở form đầy đủ: hiện tên cũ → tên mới; lưu lại y nguyên: báo không đổi', async () => {
    expect((await put('LS-B')).status).toBe(200);
    const a = await save('LS-B', 'Tên A');
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    expect((await save('LS-B', 'Tên B')).status).toBe(200);
    expect(await texts('LS-B')).toContain('Sửa khai báo: tên: Tên A → Tên B');
    expect((await save('LS-B', 'Tên B')).status).toBe(200);
    expect(await texts('LS-B')).toContain('Sửa khai báo: không đổi thông tin');
  });
});

describe('Hệ ngoài', () => {
  it('mã external giữ nguyên qua đổi mã và gộp; nguồn đổi có itemId và định danh thay thế', async () => {
    await put('XC-W1');
    await put('XC-W2');
    const w1 = (await idOf('XC-W1'))!;
    const w2 = (await idOf('XC-W2'))!;
    const add = await call(ctx, 'POST', '/api/v1/items/add-code', { sku: 'XC-W1', kind: 'external:woocommerce', code: 'wc-101' });
    expect(add.status, JSON.stringify(add.body)).toBe(200);
    const again = await call(ctx, 'POST', '/api/v1/items/add-code', { sku: 'XC-W1', kind: 'external:woocommerce', code: 'wc-101' });
    expect(again.status).toBe(200);
    expect((await call(ctx, 'POST', '/api/v1/items/add-code', { sku: 'XC-W2', kind: 'external:woocommerce', code: 'wc-101' })).status).toBe(409);
    await rename('XC-W1', 'XC-W1N');
    const r1 = await call(ctx, 'GET', '/api/v1/items/resolve?code=wc-101&kind=external:woocommerce');
    expect(r1.body.data).toMatchObject({ itemId: w1, sku: 'XC-W1N' });
    expect((await merge('XC-W1N', 'XC-W2')).status).toBe(200);
    const r2 = await call(ctx, 'GET', '/api/v1/items/resolve?code=wc-101&kind=external:woocommerce');
    expect(r2.body.data).toMatchObject({ itemId: w2, sku: 'XC-W2' });
    const tomb = (await sql<{ key: string; replaced_by_item_id: string }>`SELECT key, replaced_by_item_id FROM catalog_tombstones WHERE tenant_id = ${tenantId} AND key IN ('XC-W1', 'XC-W1N') ORDER BY key`.execute(db)).rows;
    expect(tomb).toEqual([{ key: 'XC-W1', replaced_by_item_id: w1 }, { key: 'XC-W1N', replaced_by_item_id: w2 }]);
  });
});
