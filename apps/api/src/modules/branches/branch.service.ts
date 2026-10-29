import { db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import type { AuthContext } from '../../core/auth.js';
import { branchRepository, toBranchDto } from './branch.repository.js';
import type { BranchCreate, BranchDto, BranchUpdate } from './branch.schemas.js';
import type { Db } from '../../db/client.js';

/** Mã bộ phận gắn cho chi nhánh phải có trong danh mục Bộ phận. */
async function departmentOf(trx: Db, tenantId: string, code: string | null | undefined): Promise<string | null> {
  if (!code) return null;
  const d = await trx.selectFrom('dimensions').select('code').where('tenant_id', '=', tenantId).where('kind', '=', 'department').where('code', '=', code).executeTakeFirst();
  if (!d) throw Errors.validation(`Bộ phận ${code} không có trong danh mục Bộ phận`);
  return d.code;
}

export const branchService = {
  async list(auth: AuthContext): Promise<BranchDto[]> {
    return (await branchRepository.list(db, auth.tenantId)).map(toBranchDto);
  },

  async create(auth: AuthContext, input: BranchCreate): Promise<BranchDto> {
    return db.transaction().execute(async (trx) => {
      const unitId = input.accountingUnitCode ? await branchRepository.ensureUnit(trx, auth.tenantId, input.accountingUnitCode) : null;
      await branchRepository.insert(trx, {
        tenant_id: auth.tenantId,
        code: input.code,
        name: input.name,
        accounting_unit_id: unitId,
        address: input.address ?? null,
        external_ref: input.externalRef ?? null,
        department_code: await departmentOf(trx, auth.tenantId, input.departmentCode),
        note: input.note ?? '',
        company_name: input.companyName ?? '',
        tax_code: input.taxCode ?? '',
        phone: input.phone ?? '',
        fax: input.fax ?? '',
      });
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'branch.create', objectType: 'branch', objectId: input.code, after: input });
      return toBranchDto((await branchRepository.findByCode(trx, auth.tenantId, input.code))!);
    });
  },

  /** Xoá chi nhánh chưa có chứng từ, bút toán; đã dùng thì bỏ tích "Theo dõi". */
  async remove(auth: AuthContext, code: string): Promise<{ code: string }> {
    return db.transaction().execute(async (trx) => {
      const before = await branchRepository.findByCode(trx, auth.tenantId, code);
      if (!before) throw Errors.notFound(`chi nhánh ${code}`);
      const used = await trx.selectFrom('ledger_entries').select('id').where('tenant_id', '=', auth.tenantId).where('branch_id', '=', before.id).limit(1).executeTakeFirst();
      if (used) throw Errors.conflict(`Chi nhánh ${code} đã có chứng từ: bỏ tích "Theo dõi" để ngừng dùng`);
      const wh = await trx.selectFrom('warehouses').select('code').where('tenant_id', '=', auth.tenantId).where('branch_id', '=', before.id).limit(3).execute();
      if (wh.length) throw Errors.conflict(`Chi nhánh ${code} còn kho (${wh.map((w) => w.code).join(', ')}…): xoá hoặc chuyển kho ở Danh mục kho (DM12) trước`);
      // Còn dữ liệu khác trỏ tới (chứng từ chờ, thẻ tài sản…) thì khoá ngoại chặn và báo đang dùng.
      await trx.deleteFrom('branches').where('id', '=', before.id).execute();
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'branch.delete', objectType: 'branch', objectId: code, before });
      return { code };
    });
  },

  async update(auth: AuthContext, code: string, input: BranchUpdate): Promise<BranchDto> {
    return db.transaction().execute(async (trx) => {
      const before = await branchRepository.findByCode(trx, auth.tenantId, code);
      if (!before) throw Errors.notFound(`chi nhánh ${code}`);
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.address !== undefined) patch.address = input.address;
      if (input.externalRef !== undefined) patch.external_ref = input.externalRef;
      if (input.isActive !== undefined) patch.is_active = input.isActive;
      if (input.note !== undefined) patch.note = input.note;
      if (input.companyName !== undefined) patch.company_name = input.companyName;
      if (input.taxCode !== undefined) patch.tax_code = input.taxCode;
      if (input.phone !== undefined) patch.phone = input.phone;
      if (input.fax !== undefined) patch.fax = input.fax;

      if (input.departmentCode !== undefined) patch.department_code = await departmentOf(trx, auth.tenantId, input.departmentCode);
      if (input.accountingUnitCode !== undefined) {
        patch.accounting_unit_id = input.accountingUnitCode ? await branchRepository.ensureUnit(trx, auth.tenantId, input.accountingUnitCode) : null;
      }
      let finalCode = code;
      if (input.newCode && input.newCode !== code) {
        if (await branchRepository.findByCode(trx, auth.tenantId, input.newCode)) throw Errors.conflict(`Mã chi nhánh ${input.newCode} đã có`);
        patch.code = input.newCode;
        finalCode = input.newCode;
      }
      if (Object.keys(patch).length) await branchRepository.update(trx, auth.tenantId, code, patch);
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: finalCode !== code ? 'branch.rename' : 'branch.update', objectType: 'branch', objectId: code, before, after: input });
      return toBranchDto((await branchRepository.findByCode(trx, auth.tenantId, finalCode))!);
    });
  },
};
