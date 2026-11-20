// @bizcity-layer M data/masterdata
import type { Db } from '../../db/client.js';
import type { BranchDto } from './branch.schemas.js';
// [2026-11-03 10:39 AM Nguyễn Văn Thủy] SDTC — chi nhánh kèm nút sơ đồ tổ chức (mã, đường dẫn) (đóng góp)
import type { OrgTables } from '../org-units/org-unit.schemas.js';

const baseSelect = (db: Db, tenantId: string) =>
  db.withTables<OrgTables>()
    .selectFrom('branches as b')
    .leftJoin('accounting_units as u', 'u.id', 'b.accounting_unit_id')
    .leftJoin('org_units as o', 'o.id', 'b.org_unit_id')
    .select(['b.id', 'b.code', 'b.name', 'b.address', 'b.external_ref', 'b.is_active', 'b.department_code', 'b.note', 'b.company_name', 'b.tax_code', 'b.phone', 'b.fax', 'u.code as unit_code', 'o.code as org_code', 'o.path as org_path'])
    .where('b.tenant_id', '=', tenantId);

type Row = Awaited<ReturnType<ReturnType<typeof baseSelect>['executeTakeFirstOrThrow']>>;

export function toBranchDto(r: Row): BranchDto {
  return { id: r.id, code: r.code, name: r.name, accountingUnitCode: r.unit_code, address: r.address, externalRef: r.external_ref, departmentCode: r.department_code,
    note: r.note, companyName: r.company_name, taxCode: r.tax_code, phone: r.phone, fax: r.fax, isActive: r.is_active, orgUnitCode: r.org_code ?? null, orgPath: r.org_path ?? '' };
}

export const branchRepository = {
  list: (db: Db, tenantId: string) => baseSelect(db, tenantId).orderBy('b.code').execute(),
  findByCode: (db: Db, tenantId: string, code: string) => baseSelect(db, tenantId).where('b.code', '=', code).executeTakeFirst(),

  /** Lấy hoặc tạo đơn vị hạch toán theo mã. */
  async ensureUnit(db: Db, tenantId: string, code: string): Promise<string> {
    const found = await db.selectFrom('accounting_units').select('id').where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
    if (found) return found.id;
    const row = await db.insertInto('accounting_units').values({ tenant_id: tenantId, code, name: code }).returning('id').executeTakeFirstOrThrow();
    return row.id;
  },

  insert: (db: Db, values: { tenant_id: string; code: string; name: string; accounting_unit_id: string | null; address: string | null; external_ref: string | null; department_code: string | null; note?: string; company_name?: string; tax_code?: string; phone?: string; fax?: string }) =>
    db.insertInto('branches').values(values).returning('id').executeTakeFirstOrThrow(),

  update: (db: Db, tenantId: string, code: string, patch: Record<string, unknown>) =>
    db.updateTable('branches').set(patch).where('tenant_id', '=', tenantId).where('code', '=', code).execute(),
};
