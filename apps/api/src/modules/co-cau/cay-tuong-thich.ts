// @bizcity-layer M data/masterdata
// [2026-11-20 Nguyễn Văn Thủy] Cây đơn vị cho các màn đọc dạng "nút + chi nhánh" (bộ lọc báo cáo, tồn max, giá bán) — tính thẳng từ branches (0174) (đóng góp)
/**
 * Cơ cấu chỉ còn một cây: bảng đơn vị branches (0173, 0174). File này dựng lại DẠNG DỮ LIỆU CŨ cho các màn đang đọc
 * GET /api/v1/org-units/tree và /purchase-units, để chúng chạy tiếp không phải sửa:
 *   nút        = đơn vị nhóm (có đơn vị con, hoặc chưa có phân kho mà mang tên gọi cấp nhóm: Công ty, Miền, Chi nhánh…)
 *   chi nhánh  = đơn vị có phân kho hoặc không có đơn vị con; thuộc nút = chính nó (nếu cũng là nút) hoặc đơn vị cha
 *   level      = cấp đơn vị - 1 (công ty = 0); path = đường dẫn mã nối bằng "\"
 *
 * Phân cấp mua hàng (syncBranchLevels): mỗi đơn vị cấp 3 (như "Chi nhánh Phú Thọ") tự lấy kho tổng = đơn vị mã xx000 nhiều phân kho
 * nhất trong nhánh (branches.purchase_branch_id); đơn vị trong nhánh là shop của kho tổng đó (branches.level / parent_id).
 */
import { sql } from 'kysely';
import type { Db } from '../../db/client.js';

const SEP = '\\';

export interface OrgWarehouseDto { code: string; name: string; isDefault: boolean; isActive: boolean }
export interface OrgNodeDto {
  taxId?: string; kind?: string;
  code: string; shortCode: string; name: string; alias: string; note: string;
  parentCode: string | null; level: number; path: string; sortOrder: number; isActive: boolean;
  /** Đơn vị mua hàng: mã kho tổng (null = không phải). */
  purchaseBranchCode: string | null;
  /** Đơn vị mua hàng gần nhất (chính nút hoặc phía trên). */
  purchaseUnitCode: string | null;
  directBranches: number; totalBranches: number; activeBranches: number;
}
export interface OrgBranchDto {
  code: string; name: string; isActive: boolean; orgCode: string | null;
  /** branch = kho tổng của một đơn vị mua hàng, shop = thuộc đơn vị mua hàng, '' = chưa thuộc. */
  level: string; parentCode: string | null; purchaseUnitCode: string | null;
  warehouses: OrgWarehouseDto[];
}
export interface OrgTreeDto { nodes: OrgNodeDto[]; branches: OrgBranchDto[]; unassigned: number }
export interface PurchaseUnitDto {
  orgCode: string; orgName: string; path: string; level: number;
  branchCode: string; branchName: string;
  childUnits: number; branches: number; activeBranches: number;
}

interface URow {
  id: string; code: string; name: string; note: string; tax_code: string; is_active: boolean; unit_parent_id: string | null; unit_path: string; unit_level: number;
  level_label: string; sort_order: number; purchase_branch_id: string | null; level: string | null; parent_id: string | null;
}
interface WRow { branch_id: string; code: string; name: string; is_default: boolean; is_active: boolean }

async function load(trx: Db, tenantId: string) {
  const units = (await sql<URow>`
    SELECT id::text, code, name, note, tax_code, is_active, unit_parent_id::text, unit_path, unit_level, level_label, sort_order,
           purchase_branch_id::text, level, parent_id::text
      FROM branches WHERE tenant_id = ${tenantId} ORDER BY sort_order, code`.execute(trx)).rows;
  const whs = (await sql<WRow>`SELECT branch_id::text, code, name, is_default, is_active FROM warehouses WHERE tenant_id = ${tenantId} ORDER BY code`.execute(trx)).rows;
  const byId = new Map(units.map((u) => [u.id, u]));
  const kids = new Map<string, URow[]>();
  for (const u of units) if (u.unit_parent_id && byId.has(u.unit_parent_id)) (kids.get(u.unit_parent_id) ?? kids.set(u.unit_parent_id, []).get(u.unit_parent_id)!).push(u);
  const whOf = new Map<string, WRow[]>();
  for (const w of whs) (whOf.get(w.branch_id) ?? whOf.set(w.branch_id, []).get(w.branch_id)!).push(w);
  /** Đơn vị nhóm (hiện thành nút): có đơn vị con, hoặc chưa có phân kho mà mang tên gọi cấp nhóm (Công ty, Miền, Chi nhánh…). */
  const isNode = (u: URow) => !!kids.get(u.id)?.length || (!whOf.get(u.id)?.length && u.level_label !== '' && u.level_label !== 'Cửa hàng');
  /** Đơn vị hiện thành chi nhánh (có phân kho hoặc là lá). */
  const isBranch = (u: URow) => !!whOf.get(u.id)?.length || !kids.get(u.id)?.length;
  /** Nút chứa một chi nhánh: chính nó nếu cũng là nút, không thì đơn vị cha. */
  const nodeOf = (u: URow): URow | null => (isNode(u) ? u : u.unit_parent_id ? byId.get(u.unit_parent_id) ?? null : null);
  const nearestPurchase = (u: URow | null): URow | null => {
    for (let x = u, n = 0; x && n < 40; x = x.unit_parent_id ? byId.get(x.unit_parent_id) ?? null : null, n++) if (x.purchase_branch_id && x.is_active) return x;
    return null;
  };
  const subtree = (id: string): URow[] => { const out: URow[] = []; const st = [...(kids.get(id) ?? [])]; while (st.length) { const x = st.pop()!; out.push(x); st.push(...(kids.get(x.id) ?? [])); } return out; };
  return { units, byId, kids, whOf, isNode, isBranch, nodeOf, nearestPurchase, subtree };
}

export async function orgTree(trx: Db, tenantId: string): Promise<OrgTreeDto> {
  const t = await load(trx, tenantId);
  const branchUnits = t.units.filter(t.isBranch);
  const direct = new Map<string, URow[]>();
  for (const b of branchUnits) { const n = t.nodeOf(b); if (n) (direct.get(n.id) ?? direct.set(n.id, []).get(n.id)!).push(b); }
  const nodes: OrgNodeDto[] = t.units.filter(t.isNode).map((n) => {
    const all = [n, ...t.subtree(n.id)].flatMap((x) => direct.get(x.id) ?? []);
    const parent = n.unit_parent_id ? t.byId.get(n.unit_parent_id) : undefined;
    return {
      kind: parent ? 'unit' : 'company', code: n.code, shortCode: '', name: n.name, alias: '', note: n.note, taxId: n.tax_code,
      parentCode: parent?.code ?? null, level: n.unit_level - 1, path: n.unit_path.split('/').join(SEP), sortOrder: n.sort_order, isActive: n.is_active,
      purchaseBranchCode: n.purchase_branch_id ? t.byId.get(n.purchase_branch_id)?.code ?? null : null,
      purchaseUnitCode: t.nearestPurchase(n)?.code ?? null,
      directBranches: direct.get(n.id)?.length ?? 0, totalBranches: all.length, activeBranches: all.filter((b) => b.is_active).length,
    };
  });
  const branches: OrgBranchDto[] = branchUnits.map((b) => ({
    code: b.code, name: b.name, isActive: b.is_active, orgCode: t.nodeOf(b)?.code ?? null,
    level: b.level ?? '', parentCode: b.parent_id ? t.byId.get(b.parent_id)?.code ?? null : null,
    purchaseUnitCode: t.nearestPurchase(t.nodeOf(b))?.code ?? null,
    warehouses: (t.whOf.get(b.id) ?? []).map((w) => ({ code: w.code, name: w.name, isDefault: w.is_default, isActive: w.is_active })),
  }));
  return { nodes, branches, unassigned: branches.filter((b) => !b.orgCode).length };
}

/** Đơn vị mua hàng (ô chọn ở MH02 / MH16 / MH18 / MH19): đơn vị nhóm có kho tổng + số cửa hàng thuộc nó. */
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

/**
 * Tính lại kho tổng của các đơn vị mua hàng và phân cấp shop (branches.purchase_branch_id, level, parent_id).
 * Đơn vị cấp 3 (cấp 2 tính từ công ty = 0, như "Chi nhánh Phú Thọ") tự lấy kho tổng = đơn vị mã xx000 nhiều phân kho nhất trong nhánh.
 * Chưa có đơn vị mua hàng nào thì không đổi phân cấp cũ.
 */
export async function syncBranchLevels(trx: Db, tenantId: string): Promise<{ changed: number }> {
  let t = await load(trx, tenantId);
  for (const n of t.units.filter(t.isNode)) {
    let hub: string | null = null;
    if (n.unit_level === 3 && n.is_active) {
      const cands = t.subtree(n.id).filter((b) => b.is_active && t.isBranch(b) && /^\d{2}000$/.test(b.code));
      hub = cands.sort((a, b) => (t.whOf.get(b.id)?.length ?? 0) - (t.whOf.get(a.id)?.length ?? 0) || a.code.localeCompare(b.code))[0]?.id ?? null;
    }
    if (hub !== n.purchase_branch_id) await sql`UPDATE branches SET purchase_branch_id = ${hub} WHERE id = ${n.id}`.execute(trx);
  }
  t = await load(trx, tenantId);
  const hubs = new Set(t.units.filter((u) => u.purchase_branch_id && u.is_active).map((u) => u.purchase_branch_id!));
  if (!hubs.size) return { changed: 0 };
  const codes: string[] = [], levels: string[] = [], parents: (string | null)[] = [];
  for (const b of t.units) {
    const hub = t.nearestPurchase(t.nodeOf(b))?.purchase_branch_id ?? null;
    // Đơn vị nhóm không có phân kho không phải shop.
    const level = hubs.has(b.id) ? 'branch' : !t.isBranch(b) || (t.isNode(b) && !t.whOf.get(b.id)?.length) ? '' : hub ? 'shop' : '';
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
