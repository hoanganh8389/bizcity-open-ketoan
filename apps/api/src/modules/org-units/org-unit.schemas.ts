// @bizcity-layer M data/masterdata
// [2026-11-03 10:39 AM Nguyễn Văn Thủy] SDTC — khuôn dữ liệu sơ đồ tổ chức: nút, gắn chi nhánh, đơn vị mua hàng, nhập Excel (đóng góp)
import type { ColumnType, Generated } from 'kysely';
import { z } from 'zod';

/** Bảng org_units (migration 0062). Khai ở đây qua withTables để không đụng packages/platform/src/db/types.ts. */
export interface OrgUnitsTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  short_code: Generated<string>;
  name: string;
  alias: Generated<string>;
  note: Generated<string>;
  parent_id: string | null;
  level: Generated<number>;
  path: Generated<string>;
  sort_order: Generated<number>;
  is_active: Generated<boolean>;
  purchase_branch_id: string | null;
  created_by: Generated<string>;
  created_at: Generated<Date>;
  updated_by: Generated<string>;
  updated_at: Generated<Date>;
  /** MST kê khai đặt ở nút (0121). */
  tax_id: Generated<string>;
  /** Định danh bất biến cc_<ULID> (0121). */
  uid: Generated<string>;
}
export type OrgTables = {
  org_units: OrgUnitsTable;
  branches: { org_unit_id: ColumnType<string | null, string | null | undefined, string | null> };
};

const code = z.string().trim().min(1, 'Nhập mã').max(32, 'Mã tối đa 32 ký tự');
const text = (max: number) => z.string().trim().max(max).optional();

export const orgCreateSchema = z.object({
  code,
  name: z.string().trim().min(1, 'Nhập tên').max(255),
  /** Mã nút cha; trống = gốc Công ty (chỉ khi đơn vị chưa có gốc). */
  parentCode: z.string().trim().max(32).nullable().optional(),
  shortCode: text(32), alias: text(255), note: text(500),
  sortOrder: z.number().int().min(0).max(100000).optional(),
  // [2026-11-13 Nguyễn Văn Thủy] MST kê khai đặt ở nút (0122): trống = theo nút cha / công ty (đóng góp)
  taxId: z.string().trim().regex(/^$|^[0-9]{10}(-[0-9]{3})?$/, 'MST gồm 10 số hoặc 10 số-3 số').optional(),
  /** Ngày hiệu lực của lần đổi MST / đổi nút cha (YYYY-MM-DD); trống = hôm nay (0121). */
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
export type OrgCreate = z.infer<typeof orgCreateSchema>;

export const orgUpdateSchema = orgCreateSchema.omit({ code: true }).partial().extend({ isActive: z.boolean().optional() });
export type OrgUpdate = z.infer<typeof orgUpdateSchema>;

export const orgAssignSchema = z.object({ branchCodes: z.array(z.string().trim().min(1)).min(1).max(5000) });

export const orgImportSchema = z.object({
  nodes: z.array(z.object({
    code, name: z.string().trim().min(1).max(255), parentCode: z.string().trim().max(32).nullable().optional(),
    shortCode: text(32), alias: text(255), note: text(500), sortOrder: z.number().int().min(0).max(100000).optional(),
  })).max(5000).default([]),
  /** Gắn chi nhánh / điểm kinh doanh vào nút. */
  assignments: z.array(z.object({ branchCode: z.string().trim().min(1), orgCode: z.string().trim().min(1) })).max(20000).default([]),
  /** true = chỉ kiểm và xem trước, không lưu. */
  dryRun: z.boolean().default(false),
});
export type OrgImport = z.infer<typeof orgImportSchema>;

export interface OrgWarehouseDto { code: string; name: string; isDefault: boolean; isActive: boolean }
export interface OrgNodeDto {
  /** MST kê khai đặt ở nút (0121). */
  taxId?: string;
  code: string; shortCode: string; name: string; alias: string; note: string;
  parentCode: string | null; level: number; path: string; sortOrder: number; isActive: boolean;
  /** Đơn vị mua hàng: mã chi nhánh kho tổng (null = không phải). */
  purchaseBranchCode: string | null;
  /** Đơn vị mua hàng gần nhất (chính nút hoặc phía trên) mà chi nhánh trong nút thuộc về. */
  purchaseUnitCode: string | null;
  /** Số chi nhánh gắn thẳng vào nút / cả nhánh / đang dùng trong cả nhánh. */
  directBranches: number; totalBranches: number; activeBranches: number;
}
export interface OrgBranchDto {
  code: string; name: string; isActive: boolean; orgCode: string | null;
  /** Phái sinh từ cây: branch = kho tổng của một đơn vị mua hàng, shop = thuộc đơn vị mua hàng, '' = chưa thuộc. */
  level: string; parentCode: string | null; purchaseUnitCode: string | null;
  warehouses: OrgWarehouseDto[];
}
export interface OrgTreeDto { nodes: OrgNodeDto[]; branches: OrgBranchDto[]; unassigned: number }
export interface PurchaseUnitDto {
  orgCode: string; orgName: string; path: string; level: number;
  branchCode: string; branchName: string;
  /** Số nút con trực tiếp (tỉnh), số chi nhánh / đang dùng thuộc đơn vị. */
  childUnits: number; branches: number; activeBranches: number;
}
