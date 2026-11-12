// @bizcity-layer M data/masterdata
// [2026-11-03 10:39 AM Nguyễn Văn Thủy] SDTC — sơ đồ tổ chức làm gốc: cây nút, gắn chi nhánh, đơn vị mua hàng; tính lại branches.level / parent_id từ cây (đóng góp)
/**
 * SƠ ĐỒ TỔ CHỨC (SĐTC) — gốc Công ty (cấp 0) → Miền (1) → Chi nhánh (2) → Tỉnh (3)…
 *
 *   Nút              org_units (cây theo parent_id; level / path tính từ cây, không gõ tay)
 *   Gắn chi nhánh    branches.org_unit_id — mỗi chi nhánh / điểm kinh doanh thuộc đúng một nút
 *   Đơn vị mua hàng  nút có purchase_branch_id = chi nhánh kho tổng trong nhánh (vd PT → 08000)
 *
 * branches.level / parent_id (phân cấp 2 tầng mà tồn max, MH02, MH16, MH18, MH19 đang dùng) là dữ liệu PHÁI SINH:
 * mỗi chi nhánh thuộc đơn vị mua hàng GẦN NHẤT phía trên nút của nó → kho tổng = 'branch', chi nhánh khác = 'shop' (cha = kho tổng),
 * không thuộc đơn vị nào = ''. Tính lại sau mỗi lần đổi cây / gắn chi nhánh / đơn vị mua hàng (syncBranchLevels).
 * Đơn vị chưa khai đơn vị mua hàng nào thì KHÔNG đụng phân cấp cũ (giữ chạy cho tới khi nhập SĐTC).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { sql } from 'kysely';
import { SEEDS_DIR } from '@bizcity/platform/db/paths';
import { db, type Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import type { AuthContext } from '../../core/auth.js';
import { inSavepoint, sameTx, type ActionTx } from '@bizcity/platform/core/actions';
import type {
  OrgBranchDto, OrgCreate, OrgImport, OrgNodeDto, OrgTables, OrgTreeDto, OrgUpdate, OrgWarehouseDto, PurchaseUnitDto,
} from './org-unit.schemas.js';

const withOrg = (d: Db) => d.withTables<OrgTables>();
const SEP = '\\';

interface NodeRow { id: string; code: string; short_code: string; name: string; alias: string; note: string; tax_id: string; parent_id: string | null; level: number; path: string; sort_order: number; is_active: boolean; purchase_branch_id: string | null }
interface BranchRow { id: string; code: string; name: string; is_active: boolean; org_unit_id: string | null; level: string; parent_id: string | null }

async function loadNodes(trx: Db, tenantId: string): Promise<NodeRow[]> {
  const rows = await withOrg(trx).selectFrom('org_units')
    .select(['id', 'code', 'short_code', 'name', 'alias', 'note', 'tax_id', 'parent_id', 'level', 'path', 'sort_order', 'is_active', 'purchase_branch_id'])
    .where('tenant_id', '=', tenantId).orderBy('sort_order').orderBy('code').execute();
  return rows.map((r) => ({ ...r, id: String(r.id), parent_id: r.parent_id === null ? null : String(r.parent_id), purchase_branch_id: r.purchase_branch_id === null ? null : String(r.purchase_branch_id), level: Number(r.level), sort_order: Number(r.sort_order) }));
}

async function loadBranches(trx: Db, tenantId: string): Promise<BranchRow[]> {
  const rows = await withOrg(trx).selectFrom('branches').select(['id', 'code', 'name', 'is_active', 'org_unit_id', 'level', 'parent_id'])
    .where('tenant_id', '=', tenantId).orderBy('code').execute();
  return rows.map((r) => ({ ...r, id: String(r.id), org_unit_id: r.org_unit_id === null ? null : String(r.org_unit_id), parent_id: r.parent_id === null ? null : String(r.parent_id) }));
}

/** Chỉ mục cây: con theo cha, cha theo id, các nút trong nhánh (gồm chính nút). */
function indexTree(nodes: NodeRow[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const byCode = new Map(nodes.map((n) => [n.code, n]));
  const kids = new Map<string, NodeRow[]>();
  for (const n of nodes) if (n.parent_id) (kids.get(n.parent_id) ?? kids.set(n.parent_id, []).get(n.parent_id)!).push(n);
  const subtree = (id: string): Set<string> => {
    const out = new Set<string>([id]);
    const stack = [id];
    while (stack.length) for (const k of kids.get(stack.pop()!) ?? []) if (!out.has(k.id)) { out.add(k.id); stack.push(k.id); }
    return out;
  };
  /** Đơn vị mua hàng gần nhất (chính nút hoặc tổ tiên) có purchase_branch_id. */
  const nearestPurchase = (id: string | null): NodeRow | null => {
    const seen = new Set<string>();
    for (let n = id ? byId.get(id) : undefined; n && !seen.has(n.id); n = n.parent_id ? byId.get(n.parent_id) : undefined) {
      seen.add(n.id);
      if (n.purchase_branch_id) return n;
    }
    return null;
  };
  return { byId, byCode, kids, subtree, nearestPurchase };
}

/** Tính lại level / path cho cả cây từ gốc; báo lỗi nếu có nút không nối được về gốc (vòng lặp). */
async function recompute(trx: Db, tenantId: string): Promise<void> {
  const nodes = await loadNodes(trx, tenantId);
  if (!nodes.length) return;
  const roots = nodes.filter((n) => !n.parent_id);
  if (roots.length !== 1) throw Errors.validation(`Sơ đồ tổ chức phải có đúng một gốc (đang có ${roots.length})`);
  const { kids } = indexTree(nodes);
  const want = new Map<string, { level: number; path: string }>();
  const queue: { n: NodeRow; level: number; path: string }[] = [{ n: roots[0]!, level: 0, path: roots[0]!.code }];
  while (queue.length) {
    const { n, level, path } = queue.shift()!;
    if (want.has(n.id)) continue;
    want.set(n.id, { level, path });
    for (const k of kids.get(n.id) ?? []) queue.push({ n: k, level: level + 1, path: `${path}${SEP}${k.code}` });
  }
  const lost = nodes.filter((n) => !want.has(n.id));
  if (lost.length) throw Errors.validation(`Nút không nối được về gốc (vòng lặp cha – con): ${lost.slice(0, 5).map((n) => n.code).join(', ')}`);
  if ([...want.values()].some((w) => w.level > 9)) throw Errors.validation('Sơ đồ tổ chức sâu quá 9 cấp');
  for (const n of nodes) {
    const w = want.get(n.id)!;
    if (w.level !== n.level || w.path !== n.path) await withOrg(trx).updateTable('org_units').set({ level: w.level, path: w.path }).where('id', '=', n.id).execute();
  }
}

/**
 * Kho nhận hàng của mỗi chi nhánh cấp 2 (vd PT): TỰ LẤY chi nhánh mã dạng xx000 trong nhánh (PT → 08000); nhiều chi nhánh
 * xx000 (08000, 26000) thì lấy chi nhánh nhiều kho nhất. Người dùng không khai gì — chỉ cần cây sơ đồ tổ chức đúng.
 */
// [2026-11-03 02:10 PM Nguyễn Văn Thủy] SDTC — bỏ chọn tay kho tổng: tự lấy chi nhánh xx000 của mỗi nút cấp 2 (đơn giản như phần mềm cũ)
async function autoHubs(trx: Db, tenantId: string, nodes: NodeRow[], branches: BranchRow[]): Promise<void> {
  const t = indexTree(nodes);
  const whCount = new Map<string, number>();
  for (const w of await trx.selectFrom('warehouses').select('branch_id').where('tenant_id', '=', tenantId).execute()) whCount.set(String(w.branch_id), (whCount.get(String(w.branch_id)) ?? 0) + 1);
  for (const n of nodes) {
    let hub: string | null = null;
    if (n.level === 2 && n.is_active) {
      const ids = t.subtree(n.id);
      const cands = branches.filter((b) => b.is_active && b.org_unit_id && ids.has(b.org_unit_id) && /^\d{2}000$/.test(b.code));
      hub = [...cands].sort((a, b) => (whCount.get(b.id) ?? 0) - (whCount.get(a.id) ?? 0) || a.code.localeCompare(b.code))[0]?.id ?? null;
    }
    if (hub !== n.purchase_branch_id) await withOrg(trx).updateTable('org_units').set({ purchase_branch_id: hub }).where('id', '=', n.id).execute();
  }
}

/**
 * Tính lại phân cấp chi nhánh (branches.level / parent_id) từ cây: chi nhánh trong một chi nhánh cấp 2 là shop của kho nhận hàng
 * (chi nhánh xx000) của nhánh đó. Đơn vị chưa có sơ đồ tổ chức → không đổi gì (giữ phân cấp cũ).
 */
export async function syncBranchLevels(trx: Db, tenantId: string): Promise<{ changed: number }> {
  if (!(await loadNodes(trx, tenantId)).length) return { changed: 0 };
  await autoHubs(trx, tenantId, await loadNodes(trx, tenantId), await loadBranches(trx, tenantId));
  const nodes = await loadNodes(trx, tenantId);
  if (!nodes.some((n) => n.purchase_branch_id && n.is_active)) return { changed: 0 };
  // Nút ngừng dùng vẫn nằm trong cây (giữ đường cha – con), chỉ thôi là đơn vị mua hàng.
  const t = indexTree(nodes.map((n) => (n.is_active ? n : { ...n, purchase_branch_id: null })));
  const branches = await loadBranches(trx, tenantId);
  const hubs = new Set(nodes.filter((n) => n.is_active && n.purchase_branch_id).map((n) => n.purchase_branch_id!));
  const codes: string[] = [], levels: string[] = [], parents: (string | null)[] = [];
  for (const b of branches) {
    const unit = t.nearestPurchase(b.org_unit_id);
    const hub = unit?.purchase_branch_id ?? null;
    const level = hubs.has(b.id) ? 'branch' : hub ? 'shop' : '';
    const parent = level === 'shop' ? hub : null;
    if (level !== (b.level ?? '') || parent !== b.parent_id) { codes.push(b.code); levels.push(level); parents.push(parent); }
  }
  if (!codes.length) return { changed: 0 };
  await sql`
    UPDATE branches b SET level = x.level, parent_id = x.parent_id
      FROM unnest(${codes}::text[], ${levels}::text[], ${parents}::bigint[]) AS x(code, level, parent_id)
     WHERE b.tenant_id = ${tenantId} AND b.code = x.code`.execute(trx);
  return { changed: codes.length };
}

/**
 * Tìm chi nhánh theo mã; không khớp đúng mã thì theo quy ước đổi đuôi của danh mục chi nhánh (shop lên Plus / Premium, đóng
 * thành _OFF: cùng 5 số đầu là cùng một shop) — chỉ nhận khi có DUY NHẤT một chi nhánh cùng 5 số đầu.
 */
export function matchBranch<T extends { code: string }>(code: string, list: T[], byCode = new Map(list.map((b) => [b.code, b]))): { branch?: T; renamed: boolean } {
  const exact = byCode.get(code);
  if (exact) return { branch: exact, renamed: false };
  const m = /^(\d{5})/.exec(code);
  if (!m) return { renamed: false };
  const same = list.filter((b) => b.code.startsWith(m[1]!));
  return same.length === 1 ? { branch: same[0], renamed: true } : { renamed: false };
}

/* ------------------------------------------------------------------ đọc */

export async function orgTree(trx: Db, tenantId: string): Promise<OrgTreeDto> {
  const [nodes, branches, whs] = await Promise.all([
    loadNodes(trx, tenantId),
    loadBranches(trx, tenantId),
    trx.selectFrom('warehouses').select(['branch_id', 'code', 'name', 'is_default', 'is_active']).where('tenant_id', '=', tenantId).orderBy('code').execute(),
  ]);
  const t = indexTree(nodes);
  const byBranchId = new Map(branches.map((b) => [b.id, b]));
  const whOf = new Map<string, OrgWarehouseDto[]>();
  for (const w of whs) (whOf.get(String(w.branch_id)) ?? whOf.set(String(w.branch_id), []).get(String(w.branch_id))!).push({ code: w.code, name: w.name, isDefault: w.is_default, isActive: w.is_active });
  const direct = new Map<string, BranchRow[]>();
  for (const b of branches) if (b.org_unit_id) (direct.get(b.org_unit_id) ?? direct.set(b.org_unit_id, []).get(b.org_unit_id)!).push(b);
  const nodeDtos: OrgNodeDto[] = nodes.map((n) => {
    const ids = t.subtree(n.id);
    const all = [...ids].flatMap((id) => direct.get(id) ?? []);
    return {
      code: n.code, shortCode: n.short_code, name: n.name, alias: n.alias, note: n.note, taxId: n.tax_id,
      parentCode: n.parent_id ? t.byId.get(n.parent_id)?.code ?? null : null, level: n.level, path: n.path, sortOrder: n.sort_order, isActive: n.is_active,
      purchaseBranchCode: n.purchase_branch_id ? byBranchId.get(n.purchase_branch_id)?.code ?? null : null,
      purchaseUnitCode: t.nearestPurchase(n.id)?.code ?? null,
      directBranches: direct.get(n.id)?.length ?? 0, totalBranches: all.length, activeBranches: all.filter((b) => b.is_active).length,
    };
  });
  const branchDtos: OrgBranchDto[] = branches.map((b) => ({
    code: b.code, name: b.name, isActive: b.is_active, orgCode: b.org_unit_id ? t.byId.get(b.org_unit_id)?.code ?? null : null,
    level: b.level ?? '', parentCode: b.parent_id ? byBranchId.get(b.parent_id)?.code ?? null : null,
    purchaseUnitCode: t.nearestPurchase(b.org_unit_id)?.code ?? null,
    warehouses: whOf.get(b.id) ?? [],
  }));
  return { nodes: nodeDtos, branches: branchDtos, unassigned: branches.filter((b) => !b.org_unit_id).length };
}

/** Danh sách đơn vị mua hàng (ô chọn ở MH02 / MH16 / MH18 / MH19): nút + kho tổng + số chi nhánh thuộc đơn vị. */
export async function purchaseUnits(trx: Db, tenantId: string): Promise<PurchaseUnitDto[]> {
  const tree = await orgTree(trx, tenantId);
  const byCode = new Map(tree.branches.map((b) => [b.code, b]));
  return tree.nodes.filter((n) => n.purchaseBranchCode && n.isActive).map((n) => {
    const mine = tree.branches.filter((b) => b.purchaseUnitCode === n.code);
    return {
      orgCode: n.code, orgName: n.name, path: n.path, level: n.level,
      branchCode: n.purchaseBranchCode!, branchName: byCode.get(n.purchaseBranchCode!)?.name ?? '',
      childUnits: tree.nodes.filter((c) => c.parentCode === n.code && c.isActive).length,
      branches: mine.length, activeBranches: mine.filter((b) => b.isActive && !/_OFF$/i.test(b.code)).length,
    };
  });
}

/* ------------------------------------------------------------------ ghi */

async function nodeOrThrow(trx: Db, tenantId: string, code: string): Promise<NodeRow> {
  const n = (await loadNodes(trx, tenantId)).find((x) => x.code === code);
  if (!n) throw Errors.notFound(`nút sơ đồ tổ chức ${code}`);
  return n;
}

async function parentIdOf(trx: Db, tenantId: string, parentCode: string | null | undefined, selfId?: string): Promise<string | null> {
  if (!parentCode) {
    const root = (await loadNodes(trx, tenantId)).find((n) => !n.parent_id);
    if (root && root.id !== selfId) throw Errors.validation(`Đã có gốc ${root.code} — chọn nút cha cho nút mới`);
    return null;
  }
  const p = (await loadNodes(trx, tenantId)).find((n) => n.code === parentCode);
  if (!p) throw Errors.validation(`Không có nút cha ${parentCode}`);
  if (selfId && p.id === selfId) throw Errors.validation('Nút không làm cha của chính nó');
  return p.id;
}

export const orgUnitService = {
  tree: (auth: AuthContext) => orgTree(db, auth.tenantId),
  purchaseUnits: (auth: AuthContext) => purchaseUnits(db, auth.tenantId),

  async create(auth: AuthContext, input: OrgCreate) {
    return db.transaction().execute((trx) => orgUnitService.createIn(trx, auth, input));
  },

  // [2026-11-03 05:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 gộp main (sơ đồ tổ chức): bản *In chạy trong giao dịch của action (defineAction); bản cũ giữ chữ ký, tự mở giao dịch
  async createIn(trx: ActionTx, auth: AuthContext, input: OrgCreate) {
    return sameTx(trx, async (trx) => {
      if ((await loadNodes(trx, auth.tenantId)).some((n) => n.code === input.code)) throw Errors.conflict(`Mã ${input.code} đã có trong sơ đồ tổ chức`);
      const parentId = await parentIdOf(trx, auth.tenantId, input.parentCode);
      await withOrg(trx).insertInto('org_units').values({
        tenant_id: auth.tenantId, code: input.code, name: input.name, parent_id: parentId, short_code: input.shortCode ?? '', alias: input.alias ?? '', note: input.note ?? '', tax_id: input.taxId ?? '',
        sort_order: input.sortOrder ?? 0, created_by: auth.actor, updated_by: auth.actor,
      }).execute();
      await recompute(trx, auth.tenantId);
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'org_unit.create', objectType: 'org_unit', objectId: input.code, after: input });
      return orgTree(trx, auth.tenantId);
    });
  },

  async update(auth: AuthContext, code: string, input: OrgUpdate) {
    return db.transaction().execute((trx) => orgUnitService.updateIn(trx, auth, code, input));
  },

  // [2026-11-03 05:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 gộp main (sơ đồ tổ chức): bản *In chạy trong giao dịch của action (defineAction); bản cũ giữ chữ ký, tự mở giao dịch
  async updateIn(trx: ActionTx, auth: AuthContext, code: string, input: OrgUpdate) {
    return sameTx(trx, async (trx) => {
      const before = await nodeOrThrow(trx, auth.tenantId, code);
      const patch: Record<string, unknown> = { updated_by: auth.actor, updated_at: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.shortCode !== undefined) patch.short_code = input.shortCode;
      if (input.alias !== undefined) patch.alias = input.alias;
      if (input.note !== undefined) patch.note = input.note;
      if (input.taxId !== undefined) patch.tax_id = input.taxId;
      if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
      await sql`SELECT set_config('ketoan.actor_name', ${auth.actorName || auth.actor}, true), set_config('ketoan.valid_from', ${input.validFrom ?? ''}, true)`.execute(trx); // phiên bản MST / cơ cấu theo ngày (0121)
      if (input.parentCode !== undefined) {
        const pid = await parentIdOf(trx, auth.tenantId, input.parentCode, before.id);
        if (pid && indexTree(await loadNodes(trx, auth.tenantId)).subtree(before.id).has(pid)) throw Errors.validation('Không chuyển nút vào bên dưới chính nhánh của nó');
        patch.parent_id = pid;
      }
      if (input.isActive === false && before.is_active) {
        const t = indexTree(await loadNodes(trx, auth.tenantId));
        const ids = [...t.subtree(before.id)];
        const used = await withOrg(trx).selectFrom('branches').select('code').where('tenant_id', '=', auth.tenantId).where('org_unit_id', 'in', ids).where('is_active', '=', true).limit(5).execute();
        if (used.length) throw Errors.conflict(`Nút ${code} còn chi nhánh đang dùng (${used.map((u) => u.code).join(', ')}…) — chuyển chi nhánh sang nút khác trước khi ngừng dùng`);
      }
      if (input.isActive !== undefined) patch.is_active = input.isActive;
      await withOrg(trx).updateTable('org_units').set(patch as never).where('id', '=', before.id).execute();
      await recompute(trx, auth.tenantId);
      await syncBranchLevels(trx, auth.tenantId);
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'org_unit.update', objectType: 'org_unit', objectId: code, before, after: input });
      return orgTree(trx, auth.tenantId);
    });
  },

  // [2026-11-03 03:10 PM Nguyễn Văn Thủy] SDTC — Xoá nút như màn quen dùng (thay Ngừng dùng): chỉ xoá được nút không có nút con, không gắn chi nhánh nào
  /** Xoá nút: không xoá gốc, nút còn nút con hoặc còn chi nhánh gắn vào (kể cả chi nhánh đã ngừng). */
  async remove(auth: AuthContext, code: string) {
    return db.transaction().execute((trx) => orgUnitService.removeIn(trx, auth, code));
  },

  // [2026-11-03 05:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 gộp main (sơ đồ tổ chức): bản *In chạy trong giao dịch của action (defineAction); bản cũ giữ chữ ký, tự mở giao dịch
  async removeIn(trx: ActionTx, auth: AuthContext, code: string) {
    return sameTx(trx, async (trx) => {
      const before = await nodeOrThrow(trx, auth.tenantId, code);
      if (!before.parent_id) throw Errors.validation('Không xoá được nút gốc');
      const kid = await withOrg(trx).selectFrom('org_units').select('code').where('tenant_id', '=', auth.tenantId).where('parent_id', '=', before.id).limit(1).executeTakeFirst();
      if (kid) throw Errors.conflict(`Nút ${code} còn nút con (${kid.code}) — xoá hoặc chuyển nút con trước`);
      const used = await withOrg(trx).selectFrom('branches').select('code').where('tenant_id', '=', auth.tenantId).where('org_unit_id', '=', before.id).limit(5).execute();
      if (used.length) throw Errors.conflict(`Nút ${code} còn chi nhánh (${used.map((u) => u.code).join(', ')}…) — chuyển chi nhánh sang nút khác ở Danh mục chi nhánh trước`);
      await withOrg(trx).deleteFrom('org_units').where('id', '=', before.id).execute();
      await recompute(trx, auth.tenantId);
      await syncBranchLevels(trx, auth.tenantId);
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'org_unit.delete', objectType: 'org_unit', objectId: code, before });
      return orgTree(trx, auth.tenantId);
    });
  },

  /** Gắn / chuyển chi nhánh vào nút. */
  async assign(auth: AuthContext, code: string, branchCodes: string[]) {
    return db.transaction().execute((trx) => orgUnitService.assignIn(trx, auth, code, branchCodes));
  },

  // [2026-11-03 05:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 gộp main (sơ đồ tổ chức): bản *In chạy trong giao dịch của action (defineAction); bản cũ giữ chữ ký, tự mở giao dịch
  async assignIn(trx: ActionTx, auth: AuthContext, code: string, branchCodes: string[]) {
    return sameTx(trx, async (trx) => {
      const node = await nodeOrThrow(trx, auth.tenantId, code);
      if (!node.is_active) throw Errors.validation(`Nút ${code} đã ngừng dùng`);
      const found = await trx.selectFrom('branches').select('code').where('tenant_id', '=', auth.tenantId).where('code', 'in', branchCodes).execute();
      const missing = branchCodes.filter((c) => !found.some((f) => f.code === c));
      if (missing.length) throw Errors.validation(`Không có chi nhánh ${missing.slice(0, 5).join(', ')}`);
      await withOrg(trx).updateTable('branches').set({ org_unit_id: node.id }).where('tenant_id', '=', auth.tenantId).where('code', 'in', branchCodes).execute();
      const sync = await syncBranchLevels(trx, auth.tenantId);
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'org_unit.assign', objectType: 'org_unit', objectId: code, after: { branchCodes, levelsChanged: sync.changed } });
      return orgTree(trx, auth.tenantId);
    });
  },

  /** Nhập từ Excel: nút (cha trước con), gắn chi nhánh. Có lỗi thì không lưu gì; dryRun chỉ kiểm + xem trước. */
  async importAll(auth: AuthContext, input: OrgImport) {
    return db.transaction().execute((trx) => orgUnitService.importAllIn(trx, auth, input));
  },

  // [2026-11-03 05:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 gộp main (sơ đồ tổ chức): nhập trong giao dịch của action. Thử (dryRun) hoặc còn lỗi → nhập chạy trong SAVEPOINT rồi huỷ riêng phần đó, kết quả vẫn trả về
  async importAllIn(trx: ActionTx, auth: AuthContext, input: OrgImport) {
    const ROLLBACK = Symbol('dry-run');
    let result: Awaited<ReturnType<typeof runImport>> | null = null;
    const x = await inSavepoint(trx, async (t) => {
      result = await runImport(t, auth, input);
      if (input.dryRun || result.errors.length) throw ROLLBACK;
    });
    if (!x.ok && x.error !== ROLLBACK) throw x.error;
    return { ...result!, saved: !input.dryRun && result!.errors.length === 0 };
  },

  defaultsInfo: () => defaultsInfo(),
  restoreDefaults: (auth: AuthContext) => db.transaction().execute((trx) => restoreDefaults(trx, auth)),
  restoreDefaultsIn: (trx: ActionTx, auth: AuthContext) => restoreDefaults(trx, auth),
};

/* ------------------------------------------------------------------ dữ liệu gốc */

// [2026-11-03 10:39 AM Nguyễn Văn Thủy] SDTC — quay về dữ liệu gốc sơ đồ tổ chức (db/seeds/so-do-to-chuc*.jsonl), cùng cách các danh mục khác (đóng góp)
const SEED_NODES = 'so-do-to-chuc.jsonl';
const SEED_ASSIGN = 'so-do-to-chuc-gan.jsonl';

function readSeed<T>(file: string): T[] {
  const full = path.join(SEEDS_DIR, file);
  if (!existsSync(full)) throw Errors.notFound(`tệp dữ liệu gốc ${file}`);
  return readFileSync(full, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l) as T & { _bang?: string }).filter((r) => !('_bang' in (r as object))) as T[];
}
interface SeedNode { code: string; name: string; parent_code: string | null; short_code?: string; alias?: string; note?: string; purchase_branch_code?: string | null }
interface SeedAssign { branch_code: string; org_code: string }

/** Số bản ghi trong tệp gốc (hiện ở hộp xác nhận). */
export function defaultsInfo() {
  const nodes = readSeed<SeedNode>(SEED_NODES);
  return { nodes: nodes.length, assignments: readSeed<SeedAssign>(SEED_ASSIGN).length, files: [SEED_NODES, SEED_ASSIGN] };
}

/**
 * Quay về dữ liệu gốc: cây, gắn chi nhánh đúng như tệp (kho nhận hàng tự tính lại).
 *   - Nút có trong tệp: thêm lại / ghi đè tên, cha, mã ngắn, alias, mô tả; dùng lại.
 *   - Chi nhánh trong tệp mà đơn vị có: gắn lại đúng nút. Chi nhánh đơn vị không có thì bỏ qua.
 *   - Nút người dùng tự thêm: không còn chi nhánh thì xoá; còn chi nhánh thì ngừng dùng (giữ để tra).
 */
async function restoreDefaults(trx: Db, auth: AuthContext) {
  const tenantId = auth.tenantId;
  const nodes = readSeed<SeedNode>(SEED_NODES);
  const assigns = readSeed<SeedAssign>(SEED_ASSIGN);
  const seedRoot = nodes.find((n) => !n.parent_code);
  const cur = await loadNodes(trx, tenantId);
  const curRoot = cur.find((n) => !n.parent_id);
  // Gốc tự tạo khác mã gốc trong tệp: đổi mã cho khớp (không tạo gốc thứ hai).
  if (seedRoot && curRoot && curRoot.code !== seedRoot.code) {
    if (cur.some((n) => n.code === seedRoot.code)) throw Errors.conflict(`Mã ${seedRoot.code} đang dùng cho một nút không phải gốc — đổi mã nút đó trước`);
    await withOrg(trx).updateTable('org_units').set({ code: seedRoot.code }).where('id', '=', curRoot.id).execute();
  }
  const haveList = await trx.selectFrom('branches').select('code').where('tenant_id', '=', tenantId).execute();
  const have = { has: (code: string) => Boolean(matchBranch(code, haveList).branch) };
  const res = await runImport(trx, auth, {
    nodes: nodes.map((n, i) => ({ code: n.code, name: n.name, parentCode: n.parent_code, shortCode: n.short_code ?? '', alias: n.alias ?? '', note: n.note ?? '', sortOrder: i })),
    assignments: assigns.filter((a) => have.has(a.branch_code)).map((a) => ({ branchCode: a.branch_code, orgCode: a.org_code })),
    dryRun: false,
  });
  if (res.errorCount) throw Errors.validation(`Tệp dữ liệu gốc sơ đồ tổ chức có ${res.errorCount} lỗi: ${res.errors.slice(0, 3).map((e) => `${e.sheet} ${e.code}: ${e.message}`).join('; ')}`, res.errors);
  // Nút tự thêm (không có trong tệp): dưới lên — trống thì xoá, còn chi nhánh thì ngừng dùng.
  const seedCodes = new Set(nodes.map((n) => n.code));
  let removed = 0, locked = 0;
  for (let pass = 0; pass < 10; pass++) {
    const now = await loadNodes(trx, tenantId);
    const extra = now.filter((n) => !seedCodes.has(n.code));
    if (!extra.length) break;
    const used = new Set((await withOrg(trx).selectFrom('branches').select('org_unit_id').where('tenant_id', '=', tenantId).where('org_unit_id', 'is not', null).execute()).map((b) => String(b.org_unit_id)));
    const hasKid = new Set(now.filter((n) => n.parent_id).map((n) => n.parent_id!));
    let progressed = false;
    for (const n of extra) {
      if (hasKid.has(n.id)) continue;
      if (used.has(n.id)) { if (n.is_active) { await withOrg(trx).updateTable('org_units').set({ is_active: false }).where('id', '=', n.id).execute(); locked++; } continue; }
      await withOrg(trx).deleteFrom('org_units').where('id', '=', n.id).execute();
      removed++; progressed = true;
    }
    if (!progressed) break;
  }
  const sync = await syncBranchLevels(trx, tenantId);
  await writeAudit(trx, { tenantId, actor: auth.actor, action: 'org_unit.restore_defaults', objectType: 'org_unit', objectId: 'defaults', after: { created: res.created, updated: res.updated, assigned: res.assigned, removed, locked, levelsChanged: sync.changed } });
  return { created: res.created, updated: res.updated, assigned: res.assigned, removed, locked, levelsChanged: sync.changed, skippedBranches: assigns.length - res.assigned };
}

interface ImportError { sheet: 'Nút' | 'Gắn chi nhánh' | 'Đơn vị mua hàng'; row: number; code: string; message: string }

async function runImport(trx: Db, auth: AuthContext, input: OrgImport) {
  const tenantId = auth.tenantId;
  const errors: ImportError[] = [];
  let created = 0, updated = 0;
  await sql`SELECT set_config('ketoan.actor_name', ${auth.actorName || auth.actor}, true)`.execute(trx); // người đổi → phiên bản MST / cơ cấu (0121)
  const existing = await loadNodes(trx, tenantId);
  const known = new Set(existing.map((n) => n.code));
  const root = existing.find((n) => !n.parent_id);
  const dup = new Set<string>();
  input.nodes.forEach((n, i) => { if (dup.has(n.code)) errors.push({ sheet: 'Nút', row: i + 2, code: n.code, message: 'Mã trùng trong tệp' }); dup.add(n.code); });
  const inFile = new Set(input.nodes.map((n) => n.code));
  const roots = input.nodes.filter((n) => !n.parentCode);
  if (roots.length > 1) roots.slice(1).forEach((n) => errors.push({ sheet: 'Nút', row: input.nodes.indexOf(n) + 2, code: n.code, message: 'Chỉ được một gốc (dòng không có mã cha)' }));
  if (root && roots[0] && roots[0].code !== root.code) errors.push({ sheet: 'Nút', row: input.nodes.indexOf(roots[0]) + 2, code: roots[0].code, message: `Đơn vị đã có gốc ${root.code} — để trống mã cha chỉ dùng cho dòng gốc ${root.code}` });
  input.nodes.forEach((n, i) => { if (n.parentCode && !inFile.has(n.parentCode) && !known.has(n.parentCode)) errors.push({ sheet: 'Nút', row: i + 2, code: n.code, message: `Không có nút cha ${n.parentCode}` }); });

  if (!errors.length) {
    // Cha trước con: lặp tới khi hết dòng chèn được.
    let pending = [...input.nodes];
    for (let guard = 0; pending.length && guard < 20; guard++) {
      const now = await loadNodes(trx, tenantId);
      const byCode = new Map(now.map((n) => [n.code, n]));
      const next: typeof pending = [];
      for (const n of pending) {
        const parent = n.parentCode ? byCode.get(n.parentCode) : null;
        if (n.parentCode && !parent) { next.push(n); continue; }
        // [2026-11-13 Nguyễn Văn Thủy] nhập kèm MST của nút (cột MST có thì ghi, đổi = phiên bản mới từ hôm nay) (đóng góp)
        const v = { name: n.name, short_code: n.shortCode ?? '', alias: n.alias ?? '', note: n.note ?? '', sort_order: n.sortOrder ?? 0, parent_id: parent?.id ?? null, updated_by: auth.actor, updated_at: new Date(), ...(n.taxId !== undefined ? { tax_id: n.taxId } : {}) };
        const cur = byCode.get(n.code);
        if (cur) { await withOrg(trx).updateTable('org_units').set(v).where('id', '=', cur.id).execute(); updated++; }
        else { await withOrg(trx).insertInto('org_units').values({ tenant_id: tenantId, code: n.code, created_by: auth.actor, ...v }).execute(); created++; }
      }
      pending = next;
    }
    if (pending.length) pending.forEach((n) => errors.push({ sheet: 'Nút', row: input.nodes.indexOf(n) + 2, code: n.code, message: 'Không nối được về gốc (vòng lặp cha – con)' }));
  }
  if (!errors.length) {
    try { await recompute(trx, tenantId); } catch (e) { errors.push({ sheet: 'Nút', row: 0, code: '', message: (e as Error).message }); }
  }

  let assigned = 0;
  /** Chi nhánh khớp theo 5 số đầu (đổi đuôi Plus / Premium / _OFF). */
  const renamed: { from: string; to: string }[] = [];
  if (!errors.length) {
    const nodes = await loadNodes(trx, tenantId);
    const nodeByCode = new Map(nodes.map((n) => [n.code, n]));
    const branches = await loadBranches(trx, tenantId);
    const branchByCode = new Map(branches.map((b) => [b.code, b]));
    const seen = new Set<string>();
    const byNode = new Map<string, string[]>();
    input.assignments.forEach((a, i) => {
      const hit = matchBranch(a.branchCode, branches, branchByCode);
      const code = hit.branch?.code ?? a.branchCode;
      if (seen.has(code)) errors.push({ sheet: 'Gắn chi nhánh', row: i + 2, code: a.branchCode, message: 'Chi nhánh gắn hai lần trong tệp' });
      seen.add(code);
      if (!hit.branch) errors.push({ sheet: 'Gắn chi nhánh', row: i + 2, code: a.branchCode, message: 'Chưa có chi nhánh này trong danh mục chi nhánh (DM02)' });
      else if (!nodeByCode.has(a.orgCode)) errors.push({ sheet: 'Gắn chi nhánh', row: i + 2, code: a.branchCode, message: `Không có nút ${a.orgCode}` });
      else {
        if (hit.renamed) renamed.push({ from: a.branchCode, to: code });
        (byNode.get(a.orgCode) ?? byNode.set(a.orgCode, []).get(a.orgCode)!).push(code);
      }
    });
    if (!errors.length) {
      for (const [org, codes] of byNode) {
        await withOrg(trx).updateTable('branches').set({ org_unit_id: nodeByCode.get(org)!.id }).where('tenant_id', '=', tenantId).where('code', 'in', codes).execute();
        assigned += codes.length;
      }
    }
  }
  const sync = errors.length ? { changed: 0 } : await syncBranchLevels(trx, tenantId);
  if (!errors.length && !input.dryRun) await writeAudit(trx, { tenantId, actor: auth.actor, action: 'org_unit.import', objectType: 'org_unit', objectId: 'import', after: { created, updated, assigned, levelsChanged: sync.changed } });
  const tree = errors.length ? null : await orgTree(trx, tenantId);
  return { created, updated, assigned, renamed, levelsChanged: sync.changed, errors: errors.slice(0, 500), errorCount: errors.length, unassigned: tree?.unassigned ?? null, purchaseUnits: tree ? await purchaseUnits(trx, tenantId) : [] };
}
