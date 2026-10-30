// @bizcity-layer M data/masterdata
/**
 * PHÂN KHO MẶC ĐỊNH — mọi hàng ra / vào phải thuộc một phân kho của chi nhánh:
 *   - chứng từ không ghi kho (phiếu từ hệ thống bán hàng, phiếu cũ…) → kho mặc định của chi nhánh (warehouses.is_default);
 *   - chi nhánh chỉ có một kho → kho đó; chưa khai kho nào → '' (báo cáo coi là kho mặc định — khai ở DM12 Danh mục kho).
 * Phiếu chọn kho thì kho phải thuộc đúng chi nhánh của phiếu và đang dùng.
 */
import type { Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';

type Wh = { code: string; is_default: boolean; is_active: boolean };

async function warehousesOf(db: Db, tenantId: string, branch: { id?: string; code?: string }): Promise<Wh[]> {
  let q = db.selectFrom('warehouses as w').innerJoin('branches as b', 'b.id', 'w.branch_id').select(['w.code', 'w.is_default', 'w.is_active']).where('w.tenant_id', '=', tenantId);
  q = branch.id ? q.where('w.branch_id', '=', branch.id) : q.where('b.code', '=', branch.code ?? '');
  return q.orderBy('w.is_default', 'desc').orderBy('w.code').execute();
}

/** Kho mặc định của chi nhánh ('' nếu chi nhánh chưa khai kho). */
export async function defaultWarehouseOf(db: Db, tenantId: string, branch: { id?: string; code?: string }): Promise<string> {
  const ws = (await warehousesOf(db, tenantId, branch)).filter((w) => w.is_active);
  return (ws.find((w) => w.is_default) ?? (ws.length === 1 ? ws[0] : undefined))?.code ?? '';
}

/** Kho của phiếu: trống → kho mặc định; có → phải là kho đang dùng của đúng chi nhánh. */
export async function resolveWarehouse(db: Db, tenantId: string, branchCode: string, warehouseCode?: string): Promise<string> {
  if (!warehouseCode) return defaultWarehouseOf(db, tenantId, { code: branchCode });
  const ws = await warehousesOf(db, tenantId, { code: branchCode });
  const w = ws.find((x) => x.code === warehouseCode);
  if (!w) throw Errors.validation(`Phân kho ${warehouseCode} không thuộc chi nhánh ${branchCode}${ws.length ? ` (có: ${ws.map((x) => x.code).join(', ')})` : ' — chi nhánh chưa khai kho ở DM12'}`);
  if (!w.is_active) throw Errors.validation(`Phân kho ${warehouseCode} đang ngừng dùng`);
  return w.code;
}

/** Bộ nhớ đệm trong một lần ghi sổ: chi nhánh → kho mặc định. */
export function defaultWarehouseCache(db: Db, tenantId: string) {
  const m = new Map<string, Promise<string>>();
  return (branchId: string) => { let p = m.get(branchId); if (!p) { p = defaultWarehouseOf(db, tenantId, { id: branchId }); m.set(branchId, p); } return p; };
}
