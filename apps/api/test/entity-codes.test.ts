// [2026-11-08 02:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-4 (D026-3): T026-EC-1..9 — entity_codes (0083) và resolveEntity cho đối tượng / chi nhánh / kho (chữ chốt: docs/phases/PHASE-026-MASTER-DATA-GOVERNANCE/20-KIEN-TRUC.md §2)
/**
 *   T026-EC-1  thêm đối tượng / chi nhánh / kho → có mã chính đang mở (ảnh chụp từ cột code), người ghi system:entity-sync
 *   T026-EC-2  đổi cột code → đóng mã cũ + thêm mã mới, id giữ nguyên; tra theo ngày: ngày cũ ra mã cũ, hôm nay ra mã mới, cùng entityId
 *   T026-EC-3  xoá thực thể → đóng mã (lịch sử giữ); tạo lại cùng mã cho thực thể khác → không chồng hiệu lực, tra ngày cũ ra thực thể cũ
 *   T026-EC-4  entity_codes chỉ thêm: không sửa mã, không xoá, không mở lại mã đã đóng, không TRUNCATE; chặn chồng hiệu lực
 *   T026-EC-5  mã thực thể phải trỏ thực thể có thật và cùng đơn vị
 *   T026-EC-6  id / tenant_id của thực thể không đổi được
 *   T026-EC-7  bí danh và mã ngoài tra ra đúng thực thể, ghi mã đã gửi ở `matched`
 *   T026-EC-8  lỗi tra: không thấy, có mã nhưng không hiệu lực ngày đó (nêu khoảng), tham chiếu rỗng, id của đơn vị khác; tra hàng loạt giữ thứ tự
 *   T026-EC-9  cô lập đơn vị: đơn vị khác không tra được mã của đơn vị này
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { resolveEntities, resolveEntity } from '@bizcity/kernel/modules/masterdata/entity-resolver';
import { db } from '../src/db/client.js';
import { setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let other: TestCtx;
let tenantId = '';
let otherTenantId = '';
let branchId = '';
let today = '';
let n = 0;
const uniq = (p: string) => `${p}-${Date.now().toString(36)}${++n}`;

const tid = async (c: TestCtx) => (await db.selectFrom('tenants').select('id').where('code', '=', c.tenantCode).executeTakeFirstOrThrow()).id;
const addPartner = async (code: string, t = tenantId) => (await sql<{ id: string }>`INSERT INTO partners (tenant_id, code, name) VALUES (${t}, ${code}, ${'Đối tượng ' + code}) RETURNING id::text AS id`.execute(db)).rows[0]!.id;
const addWarehouse = async (code: string) => (await sql<{ id: string }>`INSERT INTO warehouses (tenant_id, branch_id, code, name) VALUES (${tenantId}, ${branchId}, ${code}, ${'Kho ' + code}) RETURNING id::text AS id`.execute(db)).rows[0]!.id;
const addBranch = async (code: string) => (await sql<{ id: string }>`INSERT INTO branches (tenant_id, code, name) VALUES (${tenantId}, ${code}, ${'Chi nhánh ' + code}) RETURNING id::text AS id`.execute(db)).rows[0]!.id;
const rows = async (type: string, id: string) => (await sql<{ kind: string; code: string; valid_from: string; valid_to: string | null; created_by: string; note: string }>`
  SELECT kind, code, valid_from::text AS valid_from, valid_to::text AS valid_to, created_by, note FROM entity_codes
   WHERE tenant_id = ${tenantId} AND entity_type = ${type} AND entity_id = ${id}::bigint ORDER BY valid_from, id`.execute(db)).rows;
const resolve = (type: 'partner' | 'branch' | 'warehouse', ref: Parameters<typeof resolveEntity>[3], asOf = today, t = tenantId) => resolveEntity(db, t, type, ref, asOf);

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

describe('T026-EC — mã có phiên bản cho đối tượng / chi nhánh / kho', () => {
  it('T026-EC-1 thêm thực thể → mã chính đang mở, ảnh chụp từ cột code', async () => {
    const code = uniq('KH');
    const p = await addPartner(code);
    const b = await addBranch(uniq('CN'));
    const w = await addWarehouse(uniq('KHO'));
    expect(await rows('partner', p)).toEqual([{ kind: 'code', code, valid_from: '1970-01-01', valid_to: null, created_by: 'system:entity-sync', note: '' }]);
    expect((await rows('branch', b))).toHaveLength(1);
    expect((await rows('warehouse', w))[0]).toMatchObject({ kind: 'code', valid_to: null });
    // dữ liệu có sẵn khi dựng đơn vị (chi nhánh CN01) cũng có mã
    expect((await sql<{ n: number }>`SELECT count(*)::int AS n FROM entity_codes WHERE tenant_id = ${tenantId} AND entity_type = 'branch' AND code = 'CN01' AND valid_to IS NULL`.execute(db)).rows[0]!.n).toBe(1);
  });

  it('T026-EC-2 đổi mã: đóng cũ + thêm mới, id giữ nguyên; tra theo ngày', async () => {
    const oldCode = uniq('KH');
    const newCode = uniq('KH');
    const p = await addPartner(oldCode);
    await sql`UPDATE partners SET code = ${newCode} WHERE id = ${p}::bigint`.execute(db);
    const r = await rows('partner', p);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ code: oldCode, valid_from: '1970-01-01', valid_to: today });
    expect(r[1]).toMatchObject({ code: newCode, valid_from: today, valid_to: null, note: `đổi mã từ ${oldCode}` });
    const past = await resolve('partner', { code: oldCode }, '2000-01-01');
    expect(past).toMatchObject({ ok: true, entityId: p, code: { code: oldCode } });
    const now = await resolve('partner', { code: newCode });
    expect(now).toMatchObject({ ok: true, entityId: p, code: { code: newCode } });
    // tra bằng id ở ngày cũ ra mã cũ, hôm nay ra mã mới
    expect(await resolve('partner', { id: p }, '2000-01-01')).toMatchObject({ ok: true, entityId: p, code: { code: oldCode } });
    expect(await resolve('partner', { id: p })).toMatchObject({ ok: true, entityId: p, code: { code: newCode } });
    // mã cũ hôm nay không còn hiệu lực
    expect(await resolve('partner', { code: oldCode })).toMatchObject({ ok: false, code: 'ENTITY_CODE_NOT_VALID_AT_DATE' });
  });

  it('T026-EC-3 xoá thực thể → đóng mã; tạo lại cùng mã không chồng hiệu lực', async () => {
    const code = uniq('KH');
    const first = await addPartner(code);
    await sql`DELETE FROM partners WHERE id = ${first}::bigint`.execute(db);
    const closed = (await rows('partner', first))[0]!;
    expect(closed.valid_to).not.toBeNull(); // lịch sử mã giữ lại
    const second = await addPartner(code); // cùng mã, thực thể khác — mã cũ đóng hôm nay nên mã mới bắt đầu từ hôm nay
    const r2 = (await rows('partner', second))[0]!;
    expect(r2.valid_from >= closed.valid_to!).toBe(true);
    expect(await resolve('partner', { code }, '2000-01-01')).toMatchObject({ ok: true, entityId: first });
    expect(await resolve('partner', { code })).toMatchObject({ ok: true, entityId: second });
  });

  it('T026-EC-4 entity_codes chỉ thêm: không sửa, không xoá, không mở lại, không TRUNCATE, không chồng', async () => {
    const code = uniq('KH');
    const p = await addPartner(code);
    await sql`UPDATE partners SET code = ${uniq('KH')} WHERE id = ${p}::bigint`.execute(db); // dòng 1 đã đóng, dòng 2 đang mở
    await expect(sql`UPDATE entity_codes SET code = 'SUA' WHERE tenant_id = ${tenantId} AND entity_type = 'partner' AND entity_id = ${p}::bigint`.execute(db)).rejects.toThrow(/chỉ thêm/);
    await expect(sql`UPDATE entity_codes SET valid_to = NULL WHERE tenant_id = ${tenantId} AND entity_type = 'partner' AND entity_id = ${p}::bigint AND code = ${code}`.execute(db)).rejects.toThrow(/đã đóng hiệu lực/);
    await expect(sql`DELETE FROM entity_codes WHERE tenant_id = ${tenantId} AND entity_type = 'partner' AND entity_id = ${p}::bigint`.execute(db)).rejects.toThrow(/không xoá/);
    await expect(sql`TRUNCATE entity_codes`.execute(db)).rejects.toThrow(/TRUNCATE/);
    // ghi chú sửa được; đóng hiệu lực được
    await sql`UPDATE entity_codes SET note = 'ghi chú thêm' WHERE tenant_id = ${tenantId} AND entity_type = 'partner' AND entity_id = ${p}::bigint AND valid_to IS NULL`.execute(db);
    // chặn chồng: một mã chính đang mở của thực thể khác
    const q = await addPartner(uniq('KH'));
    const open = (await rows('partner', q))[0]!;
    await expect(sql`INSERT INTO entity_codes (tenant_id, entity_type, entity_id, kind, code, valid_from) VALUES (${tenantId}, 'partner', ${p}::bigint, 'code', ${open.code}, '2020-01-01')`.execute(db)).rejects.toThrow(/đã có hiệu lực trong khoảng này/);
  });

  it('T026-EC-5 mã phải trỏ thực thể có thật và cùng đơn vị', async () => {
    const ins = (t: string, type: string, id: string) => sql`INSERT INTO entity_codes (tenant_id, entity_type, entity_id, kind, code) VALUES (${t}, ${type}, ${id}::bigint, 'alias', ${uniq('AL')})`.execute(db);
    await expect(ins(tenantId, 'partner', '999999999')).rejects.toThrow(/không có trong đơn vị này/);
    const foreign = await addPartner(uniq('KH'), otherTenantId);
    await expect(ins(tenantId, 'partner', foreign)).rejects.toThrow(/không có trong đơn vị này/);
    const p = await addPartner(uniq('KH'));
    await expect(ins(tenantId, 'branch', p)).rejects.toThrow(/không có trong đơn vị này/); // id của đối tượng không phải id của chi nhánh
    await expect(sql`INSERT INTO entity_codes (tenant_id, entity_type, entity_id, code) VALUES (${tenantId}, 'unit', 1, 'X')`.execute(db)).rejects.toThrow(/không có trong đơn vị này|entity_type|check/i); // loại thực thể ngoài danh sách bị từ chối (trigger BEFORE bắt trước CHECK)
  });

  it('T026-EC-6 id / tenant_id của thực thể không đổi', async () => {
    const p = await addPartner(uniq('KH'));
    await expect(sql`UPDATE partners SET id = id + 900000000 WHERE id = ${p}::bigint`.execute(db)).rejects.toThrow(/Định danh .* không đổi/);
    await expect(sql`UPDATE partners SET tenant_id = ${otherTenantId} WHERE id = ${p}::bigint`.execute(db)).rejects.toThrow(/Định danh .* không đổi/);
    const b = await addBranch(uniq('CN'));
    await expect(sql`UPDATE branches SET id = id + 900000000 WHERE id = ${b}::bigint`.execute(db)).rejects.toThrow(/Định danh .* không đổi/);
    // đổi tên và mã thì được
    await sql`UPDATE partners SET name = 'Tên mới' WHERE id = ${p}::bigint`.execute(db);
  });

  it('T026-EC-7 bí danh và mã ngoài tra ra đúng thực thể', async () => {
    const w = await addWarehouse(uniq('KHO'));
    const alias = uniq('KHO-CU');
    const ext = uniq('POS');
    await sql`INSERT INTO entity_codes (tenant_id, entity_type, entity_id, kind, code, created_by) VALUES (${tenantId}, 'warehouse', ${w}::bigint, 'alias', ${alias}, 'test')`.execute(db);
    await sql`INSERT INTO entity_codes (tenant_id, entity_type, entity_id, kind, code, created_by) VALUES (${tenantId}, 'warehouse', ${w}::bigint, 'external:pos', ${ext}, 'test')`.execute(db);
    const a = await resolve('warehouse', { code: alias });
    expect(a).toMatchObject({ ok: true, entityId: w, matched: { kind: 'alias', code: alias } });
    const e = await resolve('warehouse', { external: { source: 'pos', code: ext } });
    expect(e).toMatchObject({ ok: true, entityId: w, matched: { kind: 'external:pos', code: ext } });
    // mã ngoài của nguồn khác không khớp; mã ngoài không tra được bằng `code` thường
    expect(await resolve('warehouse', { external: { source: 'erp', code: ext } })).toMatchObject({ ok: false, code: 'ENTITY_NOT_FOUND' });
    expect(await resolve('warehouse', { code: ext })).toMatchObject({ ok: false, code: 'ENTITY_NOT_FOUND' });
    // loại thực thể khác không thấy mã này
    expect(await resolve('branch', { code: alias })).toMatchObject({ ok: false, code: 'ENTITY_NOT_FOUND' });
  });

  it('T026-EC-8 lỗi tra và tra hàng loạt', async () => {
    const code = uniq('KH');
    const p = await addPartner(code);
    await sql`UPDATE partners SET code = ${uniq('KH')} WHERE id = ${p}::bigint`.execute(db);
    const missing = await resolve('partner', { code: 'KHONG-CO-' + n });
    expect(missing).toMatchObject({ ok: false, code: 'ENTITY_NOT_FOUND' });
    const notValid = await resolve('partner', { code });
    expect(notValid).toMatchObject({ ok: false, code: 'ENTITY_CODE_NOT_VALID_AT_DATE' });
    expect((notValid as { detail: string }).detail).toMatch(new RegExp(`1970-01-01 → ${today}`));
    expect(await resolve('partner', {})).toMatchObject({ ok: false, code: 'ENTITY_REF_EMPTY' });
    expect(await resolve('partner', { id: '999999999' })).toMatchObject({ ok: false, code: 'ENTITY_NOT_FOUND' });
    const foreign = await addPartner(uniq('KH'), otherTenantId);
    expect(await resolve('partner', { id: foreign })).toMatchObject({ ok: false, code: 'ENTITY_NOT_FOUND' });
    // hàng loạt: cùng thứ tự đầu vào, lẫn đúng và sai
    const batch = await resolveEntities(db, tenantId, 'partner', [{ code }, { id: p }, { code: 'KHONG-CO-' + n }, {}], '2000-01-01');
    expect(batch.map((r) => (r.ok ? 'ok' : r.code))).toEqual(['ok', 'ok', 'ENTITY_NOT_FOUND', 'ENTITY_REF_EMPTY']);
    expect(batch[0]).toMatchObject({ entityId: p });
  });

  it('T026-EC-9 cô lập đơn vị: đơn vị khác không tra được mã của đơn vị này', async () => {
    const code = uniq('KH');
    const p = await addPartner(code);
    expect(await resolve('partner', { code })).toMatchObject({ ok: true, entityId: p });
    expect(await resolve('partner', { code }, today, otherTenantId)).toMatchObject({ ok: false, code: 'ENTITY_NOT_FOUND' });
    // cùng mã ở hai đơn vị là hai thực thể khác nhau, không đụng nhau
    const q = await addPartner(code, otherTenantId);
    expect(await resolve('partner', { code }, today, otherTenantId)).toMatchObject({ ok: true, entityId: q });
    expect(q).not.toBe(p);
  });
});
