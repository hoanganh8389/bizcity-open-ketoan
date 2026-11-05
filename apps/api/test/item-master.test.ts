/**
 * Item Master B2a (PHASE-024 S024-4 / 5 / 6, ADR-0017, R-ITEM-0 / 5 / 7): items / item_codes / item_classification chạy SONG SONG với products.
 *   - đồng bộ: mọi đường ghi products (API, SQL) giữ items / mã / phân loại khớp; mặt hàng nháp ↔ items.status;
 *   - đổi mã = đóng mã cũ + thêm mã mới, item_id giữ nguyên; xoá mặt hàng = ngừng, không mất định danh;
 *   - bất biến Ở CSDL: không đổi / xoá item_id, mã chỉ thêm, chặn chồng hiệu lực, lịch sử phân loại không sửa;
 *   - điền ban đầu idempotent; mã vạch trùng không làm hỏng việc ghi mặt hàng;
 *   - Item Resolver: mã / itemId / mã vạch / mã ngoài / bí danh tại một ngày, IN-ITEM-001 / 002 / 008, chưa phân loại.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { ULID_RE } from '@ketoan/contracts';
import { db } from '../src/db/client.js';
import { resolveItem, resolveItems } from '../src/kernel/public.js';
import { call, setupTenant, type TestCtx } from './helpers.js';
import { todayVN } from '../src/core/date-rules.js';

let ctx: TestCtx;
let tenantId = '';
let group = '';
// [2026-11-04 12:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — ngày "hôm nay" của test theo giờ Việt Nam như CSDL (CURRENT_DATE): new Date().toISOString() là UTC nên lệch ngày từ 00:00 tới 07:00 giờ VN
const today = () => todayVN();
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);
const itemOf = (sku: string) => db.selectFrom('item_codes').innerJoin('items', 'items.item_id', 'item_codes.item_id')
  .select(['items.item_id', 'items.name', 'items.unit_base', 'items.status', 'items.draft_codes', 'items.attributes', 'items.retired_at'])
  .where('item_codes.tenant_id', '=', tenantId).where('item_codes.kind', '=', 'sku').where('item_codes.code', '=', sku).orderBy('item_codes.valid_from', 'desc').executeTakeFirst();
const codesOf = (itemId: string) => db.selectFrom('item_codes').select(['kind', 'code', 'valid_from', 'valid_to']).where('item_id', '=', itemId).orderBy('id').execute();
const clsOf = (itemId: string) => db.selectFrom('item_classification').selectAll().where('item_id', '=', itemId).orderBy('valid_from').execute();
const put = (sku: string, body: Record<string, unknown>) => call(ctx, 'PUT', `/api/v1/products/${sku}`, body);
const rejects = (p: Promise<unknown>, re: RegExp) => expect(p).rejects.toThrow(re);

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  const g = await db.selectFrom('product_posting_groups').select('code').where('tenant_id', '=', tenantId).where('is_default', '=', false).executeTakeFirst()
    ?? await db.selectFrom('product_posting_groups').select('code').where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
  group = g.code;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Đồng bộ từ products', () => {
  it('thêm mặt hàng → item_id ULID + mã sku + phân loại hiện hành; trạng thái theo nháp', async () => {
    expect((await put('IM-A', { name: 'Hàng A', unit: 'Hộp', postingGroupCode: group, taxOutCode: null })).status).toBe(200);
    const it = (await itemOf('IM-A'))!;
    expect(it.item_id).toMatch(ULID_RE);
    expect(it).toMatchObject({ name: 'Hàng A', unit_base: 'Hộp', status: 'active' });
    expect((await codesOf(it.item_id)).map((c) => [c.kind, c.code, String(c.valid_from).slice(0, 10), c.valid_to])).toEqual([['sku', 'IM-A', '1970-01-01', null]]);
    const [c] = await clsOf(it.item_id);
    expect(c).toMatchObject({ posting_group_code: group, valid_to: null, kind: null });
    expect(c!.track).toEqual([]);

    const draft = await put('IM-DRAFT', { name: 'Hàng nháp' }); // thiếu đơn vị → nháp (Gate A)
    expect(draft.body.data.isDraft).toBe(true);
    expect(await itemOf('IM-DRAFT')).toMatchObject({ status: 'draft', draft_codes: ['ITEM-BLOCK-001'] });
    await put('IM-DRAFT', { unit: 'Cái', warnAck: { reason: 'Hàng hoá thường, nhóm mặc định', codes: ['ITEM-HINT-001'] } });
    expect(await itemOf('IM-DRAFT')).toMatchObject({ status: 'active', draft_codes: [], unit_base: 'Cái' });
  });

  it('item_id sắp theo thời gian tạo (ULID)', async () => {
    await put('IM-T1', { name: 'T1', unit: 'Cái', warnAck: { reason: 'thử thứ tự', codes: ['ITEM-HINT-001'] } });
    await new Promise((r) => setTimeout(r, 15));
    await put('IM-T2', { name: 'T2', unit: 'Cái', warnAck: { reason: 'thử thứ tự', codes: ['ITEM-HINT-001'] } });
    expect((await itemOf('IM-T1'))!.item_id < (await itemOf('IM-T2'))!.item_id).toBe(true);
  });

  it('ngừng dùng → retired; dùng lại → active, vẫn cùng item_id', async () => {
    const before = (await itemOf('IM-A'))!.item_id;
    await put('IM-A', { isActive: false });
    expect(await itemOf('IM-A')).toMatchObject({ item_id: before, status: 'retired' });
    expect((await itemOf('IM-A'))!.retired_at).not.toBeNull();
    await put('IM-A', { isActive: true });
    expect(await itemOf('IM-A')).toMatchObject({ item_id: before, status: 'active', retired_at: null });
  });

  it('đổi phân loại trong ngày sửa bản đang mở; đổi từ ngày sau thì đóng bản cũ + thêm bản mới, lịch sử giữ nguyên', async () => {
    const id = (await itemOf('IM-A'))!.item_id;
    await put('IM-A', { taxOutCode: null, taxInCode: null, exciseRate: 5 });
    expect(await clsOf(id)).toHaveLength(1);                       // cùng ngày tạo: chỉnh tại chỗ
    expect(Number((await clsOf(id))[0]!.excise_rate)).toBe(5);
    // Lùi bản phân loại về quá khứ (chỉ làm được khi bỏ trigger — mô phỏng dữ liệu của ngày trước).
    await db.transaction().execute(async (trx) => {
      await sql`SET LOCAL session_replication_role = replica`.execute(trx);
      await sql`UPDATE item_classification SET created_at = now() - interval '9 days', valid_from = ${addDays(today(), -9)}::date WHERE item_id = ${id}`.execute(trx);
    });
    await put('IM-A', { exciseRate: 10 });
    const rows = await clsOf(id);
    expect(rows).toHaveLength(2);
    expect(String(rows[0]!.valid_to).slice(0, 10)).toBe(today());
    expect(Number(rows[0]!.excise_rate)).toBe(5);                  // bản cũ còn nguyên
    expect(String(rows[1]!.valid_from).slice(0, 10)).toBe(today());
    expect(Number(rows[1]!.excise_rate)).toBe(10);
    expect(rows[1]!.valid_to).toBeNull();
  });

  it('đổi mã (sku) = đóng mã cũ + thêm mã mới, item_id giữ nguyên; xoá mặt hàng = ngừng, không mất item_id', async () => {
    await put('IM-OLD', { name: 'Hàng đổi mã', unit: 'Cái', warnAck: { reason: 'thử đổi mã', codes: ['ITEM-HINT-001'] } });
    const id = (await itemOf('IM-OLD'))!.item_id;
    await sql`UPDATE products SET sku = 'IM-NEW' WHERE tenant_id = ${tenantId} AND sku = 'IM-OLD'`.execute(db);
    const codes = await codesOf(id);
    expect(codes.map((c) => [c.kind, c.code, c.valid_to === null ? 'mở' : 'đóng'])).toEqual([['sku', 'IM-OLD', 'đóng'], ['sku', 'IM-NEW', 'mở']]);
    expect((await itemOf('IM-NEW'))!.item_id).toBe(id);
    // xoá
    const del = await call(ctx, 'DELETE', '/api/v1/products/IM-NEW');
    expect(del.status, JSON.stringify(del.body)).toBe(200);
    const after = await db.selectFrom('items').select(['status', 'retired_at']).where('item_id', '=', id).executeTakeFirst();
    expect(after).toMatchObject({ status: 'retired' });
    expect((await codesOf(id)).every((c) => c.valid_to !== null)).toBe(true);
  });

  it('mã vạch: có mã vạch → mã loại barcode; hai mặt hàng cùng mã vạch không làm hỏng việc ghi, ghi nhận xung đột', async () => {
    await put('IM-B1', { name: 'B1', unit: 'Cái', warnAck: { reason: 'thử mã vạch', codes: ['ITEM-HINT-001'] } });
    await put('IM-B2', { name: 'B2', unit: 'Cái', warnAck: { reason: 'thử mã vạch', codes: ['ITEM-HINT-001'] } });
    await sql`UPDATE products SET barcode = '8930000000017' WHERE tenant_id = ${tenantId} AND sku = 'IM-B1'`.execute(db);
    await sql`UPDATE products SET barcode = '8930000000017' WHERE tenant_id = ${tenantId} AND sku = 'IM-B2'`.execute(db); // trùng — không ném lỗi
    const b1 = (await itemOf('IM-B1'))!;
    const b2 = (await itemOf('IM-B2'))!;
    expect((await codesOf(b1.item_id)).map((c) => c.kind)).toEqual(['sku', 'barcode']);
    expect((await codesOf(b2.item_id)).map((c) => c.kind)).toEqual(['sku']);
    expect(b2.attributes).toMatchObject({ barcodeConflict: '8930000000017' });
  });
});

describe('Bất biến ở CSDL (R-ITEM-0)', () => {
  let id = '';
  beforeAll(async () => { id = (await itemOf('IM-A'))!.item_id; });

  it('không đổi / xoá item_id, không đổi đơn vị; không TRUNCATE', async () => {
    await rejects(sql`UPDATE items SET item_id = ${'0'.repeat(26)} WHERE item_id = ${id}`.execute(db), /bất biến/);
    await rejects(sql`UPDATE items SET tenant_id = tenant_id + 1 WHERE item_id = ${id}`.execute(db), /bất biến/);
    await rejects(sql`DELETE FROM items WHERE item_id = ${id}`.execute(db), /Không xoá mặt hàng/);
    await rejects(sql`TRUNCATE items CASCADE`.execute(db), /TRUNCATE/);
    await rejects(sql`TRUNCATE item_codes`.execute(db), /TRUNCATE/);
    await rejects(sql`TRUNCATE item_classification`.execute(db), /TRUNCATE/);
    // sửa tên là bình thường
    await sql`UPDATE items SET name = 'Hàng A (đổi tên)' WHERE item_id = ${id}`.execute(db);
    expect((await db.selectFrom('items').select('name').where('item_id', '=', id).executeTakeFirstOrThrow()).name).toBe('Hàng A (đổi tên)');
  });

  it('item_id đúng khuôn ULID; mã đúng loại', async () => {
    await rejects(sql`INSERT INTO items (item_id, tenant_id) VALUES ('khong-phai-ulid', ${tenantId})`.execute(db), /check/i);
    await rejects(sql`INSERT INTO item_codes (tenant_id, item_id, kind, code) VALUES (${tenantId}, ${id}, 'loai-la', 'X')`.execute(db), /check/i);
  });

  it('mã chỉ thêm: không sửa mã / loại / mặt hàng / ngày bắt đầu, không xoá; chỉ đóng valid_to một lần', async () => {
    const b = (await codesOf(id))[0]!;
    await rejects(sql`UPDATE item_codes SET code = 'SUA-CODE' WHERE item_id = ${id} AND code = ${b.code}`.execute(db), /chỉ thêm/);
    await rejects(sql`UPDATE item_codes SET valid_from = '2000-01-01' WHERE item_id = ${id} AND code = ${b.code}`.execute(db), /chỉ thêm/);
    await rejects(sql`DELETE FROM item_codes WHERE item_id = ${id}`.execute(db), /chỉ thêm/);
    await sql`INSERT INTO item_codes (tenant_id, item_id, kind, code) VALUES (${tenantId}, ${id}, 'alias', 'IM-A-CU')`.execute(db);
    await sql`UPDATE item_codes SET valid_to = ${addDays(today(), 30)}::date WHERE item_id = ${id} AND code = 'IM-A-CU'`.execute(db);        // đóng: được
    await rejects(sql`UPDATE item_codes SET valid_to = ${addDays(today(), 60)}::date WHERE item_id = ${id} AND code = 'IM-A-CU'`.execute(db), /đã đóng/);
    await rejects(sql`UPDATE item_codes SET valid_to = NULL WHERE item_id = ${id} AND code = 'IM-A-CU'`.execute(db), /đã đóng/);
  });

  it('một mã tại một ngày chỉ trỏ một mặt hàng: chặn chồng hiệu lực (kể cả khác mặt hàng); khoảng không chồng thì được', async () => {
    const other = (await itemOf('IM-T1'))!.item_id;
    await rejects(sql`INSERT INTO item_codes (tenant_id, item_id, kind, code) VALUES (${tenantId}, ${other}, 'sku', 'IM-A')`.execute(db), /đã có hiệu lực|duplicate|unique/i);
    await rejects(sql`INSERT INTO item_codes (tenant_id, item_id, kind, code, valid_from, valid_to) VALUES (${tenantId}, ${other}, 'alias', 'IM-A-CU', ${addDays(today(), 10)}::date, ${addDays(today(), 20)}::date)`.execute(db), /đã có hiệu lực/);
    await sql`INSERT INTO item_codes (tenant_id, item_id, kind, code, valid_from) VALUES (${tenantId}, ${other}, 'alias', 'IM-A-CU', ${addDays(today(), 30)}::date)`.execute(db); // sau khi mã cũ đóng
  });

  it('phân loại: lịch sử (bản của ngày trước) không sửa / xoá; chồng hiệu lực bị chặn', async () => {
    const rows = await clsOf(id);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    await rejects(sql`UPDATE item_classification SET excise_rate = 99 WHERE id = ${rows[0]!.id}`.execute(db), /lịch sử/);
    await rejects(sql`DELETE FROM item_classification WHERE item_id = ${id}`.execute(db), /chỉ thêm/);
    await rejects(sql`INSERT INTO item_classification (tenant_id, item_id, valid_from) VALUES (${tenantId}, ${id}, ${addDays(today(), 5)}::date)`.execute(db), /đã có hiệu lực/);
  });

  it('khoá ngoại ghép: mã không trỏ được sang mặt hàng của đơn vị khác', async () => {
    await rejects(sql`INSERT INTO item_codes (tenant_id, item_id, kind, code) VALUES (${Number(tenantId) + 999}, ${id}, 'sku', 'KHAC-DON-VI')`.execute(db), /foreign key|violates/i);
  });
});

describe('Điền ban đầu (idempotent)', () => {
  it('mặt hàng ghi khi bỏ trigger → bizcity_items_backfill điền đúng một lần, chạy lại không điền thêm', async () => {
    await db.transaction().execute(async (trx) => {
      await sql`SET LOCAL session_replication_role = replica`.execute(trx);   // mô phỏng dòng có trước migration
      await sql`INSERT INTO products (tenant_id, sku, name, unit, posting_group_code, is_active) VALUES (${tenantId}, 'IM-OLDROW', 'Dòng cũ', 'Cái', ${group}, true)`.execute(trx);
    });
    expect(await itemOf('IM-OLDROW')).toBeUndefined();
    const n1 = await sql<{ n: number }>`SELECT bizcity_items_backfill(${tenantId}) AS n`.execute(db);
    expect(n1.rows[0]!.n).toBe(1);
    const it = (await itemOf('IM-OLDROW'))!;
    expect(it).toMatchObject({ name: 'Dòng cũ', unit_base: 'Cái', status: 'active' });
    expect((await clsOf(it.item_id))[0]).toMatchObject({ posting_group_code: group });
    expect((await sql<{ n: number }>`SELECT bizcity_items_backfill(${tenantId}) AS n`.execute(db)).rows[0]!.n).toBe(0);
  });
});

describe('Item Resolver', () => {
  const run = <T,>(fn: (trx: typeof db) => Promise<T>) => db.transaction().execute(fn as never) as Promise<T>;
  let aId = '';
  beforeAll(async () => {
    aId = (await itemOf('IM-A'))!.item_id;
    await sql`INSERT INTO product_units (tenant_id, sku, unit, ratio, is_default) VALUES (${tenantId}, 'IM-A', 'Thùng', 12, false) ON CONFLICT DO NOTHING`.execute(db);
    // mã ngoài của hệ thống POS
    await sql`INSERT INTO item_codes (tenant_id, item_id, kind, code) VALUES (${tenantId}, ${aId}, 'external:pos-mini', 'POS-998')`.execute(db);
  });

  it('tra bằng sku → item_id, mã hiệu lực, phân loại tại ngày, đơn vị quy đổi', async () => {
    const r = await run((t) => resolveItem(t, tenantId, { sku: 'IM-A' }, today()));
    expect(r).toMatchObject({ ok: true, itemId: aId, name: 'Hàng A (đổi tên)', status: 'active', code: { kind: 'sku', code: 'IM-A', validTo: null } });
    if (!r.ok) throw new Error('phải tra được');
    expect(r.classification).toMatchObject({ postingGroupCode: group, exciseRate: 10, validTo: null });
    expect(r.units).toEqual({ Hộp: 1, Thùng: 12 });
    expect(r.unclassified).toBe(true);        // kind còn trống: chưa phân loại (R-ITEM-8)
  });

  it('tra bằng itemId, mã vạch, mã ngoài, bí danh — cùng một mặt hàng', async () => {
    const [byId, byBar, byExt, byAlias] = await run((t) => resolveItems(t, tenantId, [{ itemId: aId }, { barcode: '8930000000017' }, { external: { source: 'pos-mini', code: 'POS-998' } }, { sku: 'IM-A-CU' }], addDays(today(), 1)));
    expect(byId).toMatchObject({ ok: true, itemId: aId, code: { code: 'IM-A' } });
    expect(byBar).toMatchObject({ ok: true });                      // IM-B1 có mã vạch này
    expect((byBar as { itemId: string }).itemId).toBe((await itemOf('IM-B1'))!.item_id);
    expect(byExt).toMatchObject({ ok: true, itemId: aId, code: { kind: 'external:pos-mini' } });
    expect(byAlias).toMatchObject({ ok: true, itemId: aId, alias: { fromCode: 'IM-A-CU' } });   // bí danh: trỏ mặt hàng đích
  });

  it('mã đổi giữa kỳ: ngày trước ngày đổi tra ra mã cũ, từ ngày đổi tra ra mã mới — cùng item_id', async () => {
    await put('IM-RN', { name: 'Đổi mã', unit: 'Cái', warnAck: { reason: 'thử tra theo ngày', codes: ['ITEM-HINT-001'] } });
    const id = (await itemOf('IM-RN'))!.item_id;
    await sql`UPDATE products SET sku = 'IM-RN2' WHERE tenant_id = ${tenantId} AND sku = 'IM-RN'`.execute(db);   // hiệu lực từ hôm nay
    const at = async (sku: string, asOf: string) => run((t) => resolveItem(t, tenantId, { sku }, asOf));
    const yesterday = addDays(today(), -1);
    expect(await at('IM-RN', yesterday)).toMatchObject({ ok: true, itemId: id, code: { code: 'IM-RN', validTo: today() } });   // mã cũ tới hết hôm qua
    expect(await at('IM-RN2', today())).toMatchObject({ ok: true, itemId: id, code: { code: 'IM-RN2', validFrom: today(), validTo: null } });
    const oldToday = await at('IM-RN', today());                    // mã cũ đã đóng: có mã nhưng không hiệu lực → IN-ITEM-002 nêu khoảng
    expect(oldToday).toMatchObject({ ok: false, code: 'IN-ITEM-002' });
    expect((oldToday as { detail: string }).detail).toMatch(/Mã IM-RN không có hiệu lực ngày .* \(hiệu lực: 1970-01-01 → /);
    expect(await at('IM-RN2', yesterday)).toMatchObject({ ok: false, code: 'IN-ITEM-002' });   // mã mới chưa bắt đầu
  });

  it('không ra: mã lạ → IN-ITEM-001; itemId lạ / đơn vị khác → IN-ITEM-008; không có gì để tra → IN-ITEM-001', async () => {
    const [unknown, badId, otherTenantLike, empty] = await run((t) => resolveItems(t, tenantId, [{ sku: 'KHONG-CO' }, { itemId: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }, { itemId: 'khong-phai-ulid' }, {}], today()));
    expect(unknown).toMatchObject({ ok: false, code: 'IN-ITEM-001' });
    expect(badId).toMatchObject({ ok: false, code: 'IN-ITEM-008' });
    expect(otherTenantLike).toMatchObject({ ok: false, code: 'IN-ITEM-008' });
    expect(empty).toMatchObject({ ok: false, code: 'IN-ITEM-001' });
  });

  it('tra cả chứng từ một lần: nhiều dòng, kết quả đúng thứ tự', async () => {
    const refs = ['IM-A', 'IM-T1', 'IM-T2', 'IM-A', 'KHONG-CO'].map((sku) => ({ sku }));
    const out = await run((t) => resolveItems(t, tenantId, refs, today()));
    expect(out.map((r) => r.ok)).toEqual([true, true, true, true, false]);
    expect((out[0] as { itemId: string }).itemId).toBe((out[3] as { itemId: string }).itemId);
  });
});
