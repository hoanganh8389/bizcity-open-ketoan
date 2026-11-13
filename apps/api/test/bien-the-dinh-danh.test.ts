/**
 * Họ mặt hàng theo định danh (PHASE-026 S026-3, migration 0067, R-ITEM-3, ADR-0022 D026-2):
 *   - products.parent_sku → items.parent_item_id (mã cha → định danh của mã cha); mặt hàng cha thêm SAU con thì nhận các con đang chờ;
 *   - đổi mã cha không đứt họ (họ trỏ định danh); Hành trình mặt hàng hiện cha / biến thể / cùng cha theo mã hiện hành;
 *   - bất biến: không tự làm cha mình, không vòng;
 *   - Gate A: đổi ĐVT gốc của mặt hàng đã có nhập xuất → ITEM-HINT-003 (cảnh báo, không chặn — biến thể khác nên là mặt hàng mới).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';
import { todayVN } from '../src/core/date-rules.js';

let ctx: TestCtx;
let tenantId = '';
const ack = { warnAck: { reason: 'thử họ mặt hàng', codes: ['ITEM-HINT-001', 'ITEM-HINT-003'] } };
const put = (sku: string, body: Record<string, unknown> = {}) => call(ctx, 'PUT', `/api/v1/products/${sku}`, { name: sku, unit: 'Hộp', ...ack, ...body });
const idOf = async (sku: string) => (await sql<{ item_id: string }>`
  SELECT item_id FROM item_codes WHERE tenant_id = ${tenantId} AND kind = 'sku' AND code = ${sku} AND valid_to IS NULL`.execute(db)).rows[0]?.item_id;
const parentOf = async (sku: string) => (await sql<{ parent_item_id: string | null }>`
  SELECT parent_item_id FROM items WHERE item_id = ${(await idOf(sku))!}`.execute(db)).rows[0]?.parent_item_id ?? null;
const findingCodes = (body: { meta?: { findings?: { code: string }[] } }) => (body.meta?.findings ?? []).map((f) => f.code);

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Họ mặt hàng theo định danh', () => {
  // [2026-11-13 Nguyễn Văn Thủy] mã cha suy theo mã (0112/0115), không khai tay: thử bằng mã số + chữ đầu / cuối (đóng góp)
  it('parent_sku → parent_item_id; mặt hàng cha thêm sau con thì nhận các con đang chờ', async () => {
    for (const s of ['800000001', '800000001Q', 'Z800000001']) expect((await put(s)).status).toBe(200);
    const p = await idOf('800000001');
    expect(await parentOf('800000001Q')).toBe(p);
    expect(await parentOf('Z800000001')).toBe(p);

    expect((await put('800000002Q')).status).toBe(200);      // mã cha chưa có trong danh mục
    expect(await parentOf('800000002Q')).toBeNull();
    expect((await put('800000002')).status).toBe(200);        // thêm cha → nhận con
    expect(await parentOf('800000002Q')).toBe(await idOf('800000002'));
    expect(Number((await sql<{ n: number }>`SELECT bizcity_items_link_parents(${tenantId}::bigint) AS n`.execute(db)).rows[0]!.n)).toBe(0); // chạy lại: không đổi gì
  });

  it('đổi mã cha không đứt họ; Hành trình hiện cha / biến thể / cùng cha theo mã hiện hành', async () => {
    const p = await idOf('800000001');
    await sql`UPDATE products SET sku = '800000009' WHERE tenant_id = ${tenantId} AND sku = '800000001'`.execute(db);
    expect(await idOf('800000009')).toBe(p);
    expect(await parentOf('800000001Q')).toBe(p);                // con vẫn trỏ cùng định danh (parent_sku cũ là ảnh chụp)

    const child = (await call(ctx, 'GET', '/api/v1/lineage/items/800000001Q')).body.data;
    expect(child.item.family.parent).toMatchObject({ itemId: p, sku: '800000009' });
    expect(child.item.family.siblings.map((x: { sku: string }) => x.sku)).toEqual(['Z800000001']);
    const parent = (await call(ctx, 'GET', '/api/v1/lineage/items/800000009')).body.data;
    expect(parent.item.family.parent).toBeNull();
    expect(parent.item.family.children.map((x: { sku: string }) => x.sku).sort()).toEqual(['800000001Q', 'Z800000001']);
  });

  it('bất biến: không tự làm cha mình, không vòng, cha cùng đơn vị', async () => {
    const p = (await idOf('800000009'))!;
    const c = (await idOf('800000001Q'))!;
    await expect(sql`UPDATE items SET parent_item_id = item_id WHERE item_id = ${p}`.execute(db)).rejects.toThrow(/chính nó/);
    await expect(sql`UPDATE items SET parent_item_id = ${c} WHERE item_id = ${p}`.execute(db)).rejects.toThrow(/vòng/);
    const other = (await sql<{ item_id: string }>`SELECT item_id FROM items WHERE tenant_id <> ${tenantId} LIMIT 1`.execute(db)).rows[0]?.item_id;
    if (other) await expect(sql`UPDATE items SET parent_item_id = ${other} WHERE item_id = ${c}`.execute(db)).rejects.toThrow(/cùng đơn vị/);
  });
});

describe('Lịch sử mặt hàng (S026-10)', () => {
  it('tra bằng mã cũ hay mã mới đều ra một lịch sử: tạo, đổi mã có hiệu lực, phân loại ban đầu, sửa có lý do', async () => {
    const h = (await call(ctx, 'GET', '/api/v1/lineage/items/800000001/history')).body.data;   // mã cũ (đã đổi sang 800000009)
    expect(h.sku).toBe('800000009');
    expect(h.itemId).toBe(await idOf('800000009'));
    const texts = h.entries.map((e: { text: string }) => e.text);
    expect(texts.some((t: string) => /^Tạo định danh mặt hàng/.test(t))).toBe(true);
    expect(texts.some((t: string) => /^Đổi mã 800000001 → 800000009 \(hiệu lực từ \d{4}-\d{2}-\d{2}\)$/.test(t))).toBe(true);
    expect(texts.some((t: string) => /^Phân loại hạch toán ban đầu: nhóm /.test(t))).toBe(true);
    expect(texts.some((t: string) => /\(khi còn mã 800000001\)/.test(t))).toBe(true);           // thao tác trước khi đổi mã ghi rõ mã lúc đó
    const at = h.entries.map((e: { at: string }) => e.at);
    expect([...at].sort().reverse()).toEqual(at);                                          // mới nhất trước
    expect((await call(ctx, 'GET', '/api/v1/lineage/items/KHONG-CO/history')).status).toBe(404);
  });
});

describe('Gate A — biến thể kinh tế khác là mặt hàng mới (ITEM-HINT-003)', () => {
  it('đổi ĐVT gốc của mặt hàng đã có nhập xuất → cảnh báo (vẫn lưu); chưa có nhập xuất → không nhắc', async () => {
    expect((await put('BT-U')).status).toBe(200);
    const r = await call(ctx, 'POST', '/api/v1/documents', {
      docType: 'purchase', docKey: 'BT-NM1', branchCode: 'CN01', docNo: 'BT-NM1', docDate: todayVN(), partner: { code: 'NCC-01', name: 'Nhà cung cấp 01' },
      lines: [{ lineKey: 'l1', sku: 'BT-U', name: 'BT-U', unit: 'Hộp', qty: 10, amountBeforeTax: 100000, taxCode: 'V08', taxAmount: 0 }], totals: { beforeTax: 100000, tax: 0, total: 100000 },
    });
    expect(r.body.data.status, JSON.stringify(r.body)).toBe('posted');

    const v = await call(ctx, 'POST', '/api/v1/products/validate', { sku: 'BT-U', unit: 'Thùng', postingGroupCode: null });
    expect(findingCodes({ meta: { findings: v.body.data.findings } })).toContain('ITEM-HINT-003');
    const f = v.body.data.findings.find((x: { code: string }) => x.code === 'ITEM-HINT-003');
    expect(f).toMatchObject({ level: 'warn' });
    expect(f.title).toMatch(/"Hộp" — đổi sang "Thùng"/);

    const s = await put('BT-U', { unit: 'Thùng' });
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    expect(s.body.data.isDraft).toBe(false);               // cảnh báo, không chặn (R-GATE-9)
    expect(findingCodes(s.body)).toContain('ITEM-HINT-003');

    expect((await put('BT-V')).status).toBe(200);           // chưa có nhập xuất: đổi ĐVT tự do
    expect(findingCodes(await put('BT-V', { unit: 'Thùng' }).then((x) => x.body))).not.toContain('ITEM-HINT-003');
    expect(findingCodes(await put('BT-U', { unit: 'Thùng' }).then((x) => x.body))).not.toContain('ITEM-HINT-003'); // không đổi → không nhắc
  });
});

describe('Tác động mặt hàng (S026-11)', () => {
  it('chứng từ, tồn theo chi nhánh, tài khoản, giá vốn; câu nói rõ đổi mã / nhóm ảnh hưởng gì; chưa dùng thì nói không ảnh hưởng', async () => {
    const i = (await call(ctx, 'GET', '/api/v1/lineage/items/BT-U/impact')).body.data;
    expect(i.itemId).toBe(await idOf('BT-U'));
    expect(i.documents).toEqual([{ docType: 'purchase', count: 1, first: expect.any(String), last: expect.any(String) }]);
    expect(i.stock).toEqual([{ branchCode: 'CN01', branchName: expect.any(String), qty: 10 }]);
    expect(i.accounts.some((a: { account: string }) => a.account.startsWith('15'))).toBe(true);
    expect(i.lockedPeriods).toEqual([]);
    expect(i.sentences[0]).toMatch(/^Đang dùng ở 1 chứng từ \(1 phiếu mua\)/);
    expect(i.sentences.join(' ')).toMatch(/Còn tồn 10 ở 1 chi nhánh/);

    const none = (await call(ctx, 'GET', '/api/v1/lineage/items/BT-V/impact')).body.data;
    expect(none.documents).toEqual([]);
    expect(none.sentences[0]).toMatch(/chưa có chứng từ nào/);
  });
});
