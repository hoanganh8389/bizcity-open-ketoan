// @bizcity-layer M data/masterdata
// [2026-11-13 Nguyễn Văn Thủy] Đối tượng cha – con: mã con theo mã cha, cả nhánh, kiểm khi gắn / đổi cha (đóng góp)
/**
 * Quy tắc (0132):
 *   - Mã đơn vị con = mã cha + "-" + 3 số (NC0012-001, NC0012-002…). Con của con nối tiếp: NC0012-001-001.
 *     MST của con có dạng MST cha + "-NNN" (MST chi nhánh) và đuôi NNN chưa dùng thì lấy đúng đuôi đó cho dễ nhớ.
 *   - Đơn vị mới thêm làm con: mã bắt buộc bắt đầu bằng "mã cha-".
 *   - Đơn vị đã có (mã cũ) gắn vào cha: giữ mã, chỉ ghi quan hệ.
 *   - Đã là con theo mã cha (mã bắt đầu "mã cha-") thì không chuyển sang cha khác — lập đơn vị mới dưới cha mới.
 *   - Cha – con và đối tượng con cùng / khác MST với cha đều được (một pháp nhân nhiều điểm, hoặc chi nhánh có MST riêng).
 */
import { sql } from 'kysely';
import type { Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';

/** Mã của đối tượng và mọi cấp con bên dưới (đệ quy). */
export async function familyCodes(db: Db, tenantId: string, code: string): Promise<string[]> {
  const r = await sql<{ code: string }>`
    WITH RECURSIVE t AS (
      SELECT uid, code FROM partners WHERE tenant_id = ${tenantId} AND code = ${code}
      UNION ALL
      SELECT p.uid, p.code FROM partners p JOIN t ON p.parent_uid = t.uid WHERE p.tenant_id = ${tenantId}
    ) SELECT code FROM t`.execute(db);
  return r.rows.map((x) => x.code);
}

/** Định danh gốc cao nhất của một đối tượng (chính nó nếu không có cha). */
export async function rootUidOf(db: Db, uid: string): Promise<string> {
  const r = await sql<{ uid: string }>`
    WITH RECURSIVE t AS (
      SELECT uid, parent_uid, 0 AS d FROM partners WHERE uid = ${uid}
      UNION ALL
      SELECT p.uid, p.parent_uid, t.d + 1 FROM partners p JOIN t ON p.uid = t.parent_uid WHERE t.d < 50
    ) SELECT uid FROM t WHERE parent_uid IS NULL LIMIT 1`.execute(db);
  return r.rows[0]?.uid ?? uid;
}

/** Hai đối tượng có chung gốc (cùng một nhà cung cấp / khách hàng mẹ). */
export async function sameFamily(db: Db, uidA: string, uidB: string): Promise<boolean> {
  return (await rootUidOf(db, uidA)) === (await rootUidOf(db, uidB));
}

/** Mã con kế tiếp của một đơn vị cha: mã cha-001, -002…; MST chi nhánh MSTcha-NNN chưa dùng thì lấy NNN. */
export async function nextChildCode(db: Db, tenantId: string, parentCode: string, taxCode?: string | null) {
  const parent = await db.selectFrom('partners').select(['code', 'name', 'tax_code']).where('tenant_id', '=', tenantId).where('code', '=', parentCode).executeTakeFirst();
  if (!parent) throw Errors.notFound(`đơn vị cha ${parentCode}`);
  const prefix = `${parent.code}-`;
  const rows = await db.selectFrom('partners').select('code').where('tenant_id', '=', tenantId).where('code', 'like', `${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`).execute();
  const used = new Set(rows.map((r) => r.code));
  const pt = (parent.tax_code ?? '').trim(), t = (taxCode ?? '').trim();
  const tail = pt && t.startsWith(`${pt}-`) ? /^\d{3}$/.exec(t.slice(pt.length + 1))?.[0] : undefined;
  if (tail && !used.has(prefix + tail)) return { code: prefix + tail, basis: 'mst' as const, parent: parent.code, parentName: parent.name };
  let max = 0;
  for (const c of used) { const m = /^(\d{3})$/.exec(c.slice(prefix.length)); if (m) max = Math.max(max, Number(m[1])); }
  let n = max + 1;
  while (used.has(prefix + String(n).padStart(3, '0'))) n++;
  return { code: prefix + String(n).padStart(3, '0'), basis: 'parent' as const, parent: parent.code, parentName: parent.name };
}

/**
 * Kiểm khi tạo / sửa đơn vị cha của một đối tượng. before = bản trước (null khi thêm mới).
 * Trả định danh cha (null = gốc). Lỗi dễ hiểu, nói cách làm đúng.
 */
export async function checkParent(db: Db, tenantId: string, code: string, parentCode: string | null | undefined, before: { uid: string; parent_uid: string | null } | null) {
  const pc = parentCode?.trim() || null;
  if (pc === null) {
    if (before?.parent_uid) {
      const old = await db.selectFrom('partners').select('code').where('uid', '=', before.parent_uid).executeTakeFirst();
      if (old && code.startsWith(`${old.code}-`)) throw Errors.validation(`${code} là đơn vị con của ${old.code} theo mã — không bỏ cha được. Muốn tách riêng thì lập đối tượng mới, ngừng dùng ${code}.`);
    }
    return null;
  }
  if (pc === code) throw Errors.validation('Không chọn chính đối tượng này làm đơn vị cha');
  const parent = await db.selectFrom('partners').select(['uid', 'code', 'name']).where('tenant_id', '=', tenantId).where('code', '=', pc).executeTakeFirst();
  if (!parent) throw Errors.validation(`Đơn vị cha ${pc} chưa có trong danh mục`);
  if (!before && !code.startsWith(`${parent.code}-`)) throw Errors.validation(`Mã đơn vị con phải bắt đầu bằng "${parent.code}-" (vd ${parent.code}-001) — bấm "Lấy mã" để máy cấp`);
  if (before?.parent_uid && before.parent_uid !== parent.uid) {
    const old = await db.selectFrom('partners').select('code').where('uid', '=', before.parent_uid).executeTakeFirst();
    if (old && code.startsWith(`${old.code}-`)) throw Errors.validation(`${code} là đơn vị con của ${old.code} theo mã — không chuyển sang ${parent.code} được. Lập đơn vị mới dưới ${parent.code}, ngừng dùng ${code}.`);
  }
  if (before) {
    const down = await familyCodes(db, tenantId, code);
    if (down.includes(parent.code)) throw Errors.validation(`${parent.code} đang là đơn vị con của ${code} — không chọn làm đơn vị cha được`);
  }
  return parent.uid;
}
