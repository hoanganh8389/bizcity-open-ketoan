// @bizcity-layer M data/masterdata
/**
 * Đối tượng (khách hàng, nhà cung cấp…) và nhóm đối tượng.
 */
import { sql } from 'kysely';
import type { PartnerInput } from '@ketoan/contracts';
import { toNumber, type Db } from '../../db/client.js';

export interface PartnerDto {
  id: string;
  code: string;
  name: string;
  kind: string;
  taxCode: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  groupCode: string | null;
  isActive: boolean;
  paymentTermDays: number | null;
  creditLimit: number | null;
  note: string;
  contactName: string;
  bankAccountNo: string;
  bankAccountHolder: string;
  bankName: string;
  maxOpenDocs: number | null;
  mobile: string;
  fax: string;
  website: string;
  position: string;
  companyName: string;
  companyAddress: string;
  shortName: string;
  managerCode: string | null;
  branchCode: string | null;
  createdAt: string | null;
  /** Ngày giờ tạo đầy đủ (ISO). */
  createdTime?: string | null;
  createdBy: string;
  birthDate: string | null;
  gender: string;
  alias: string;
  isProspect: boolean;
  customerType: string;
  /** Vai trò thêm ngoài kind (NCC vừa là khách hàng…). */
  alsoKinds: string[];
}

export interface PartnerListFilter {
  search?: string;
  groupCode?: string;
  kind?: string;
  /** all: mọi đối tượng; active: đang theo dõi; inactive: đã khoá. */
  status?: 'all' | 'active' | 'inactive';
}

/** Thông tin kế toán bổ sung trên đối tượng (chứng từ gửi vào API không ghi đè các trường này). */
export interface PartnerAccountingInfo {
  kind?: string;
  groupCode?: string | null;
  isActive?: boolean;
  paymentTermDays?: number | null;
  creditLimit?: number | null;
  note?: string;
  contactName?: string;
  bankAccountNo?: string;
  bankAccountHolder?: string;
  bankName?: string;
  maxOpenDocs?: number | null;
  mobile?: string;
  fax?: string;
  website?: string;
  position?: string;
  companyName?: string;
  companyAddress?: string;
  shortName?: string;
  managerCode?: string | null;
  branchCode?: string | null;
  birthDate?: string | null;
  gender?: string;
  alias?: string;
  isProspect?: boolean;
  customerType?: string;
  alsoKinds?: string[];
}

export const partnerRepository = {
  async list(db: Db, tenantId: string, f: PartnerListFilter, page: number, pageSize: number) {
    let q = db.selectFrom('partners').where('tenant_id', '=', tenantId);
    if (f.search) {
      const s = `%${f.search.toLowerCase()}%`;
      const search = f.search;
      q = q.where((eb) => eb.or([eb('code', 'like', `${search}%`), eb(eb.fn('lower', ['name']), 'like', s), eb('tax_code', '=', search), eb('mobile', 'like', `${search}%`), eb('phone', 'like', `${search}%`), eb(eb.fn('lower', ['company_name']), 'like', s), eb(eb.fn('lower', ['alias']), 'like', s)]));
    }
    if (f.groupCode) q = f.groupCode === '-' ? q.where('group_code', 'is', null) : q.where('group_code', '=', f.groupCode);
    // Lọc theo kiểu: vai trò chính hoặc vai trò thêm (NCC vừa là khách hàng hiện ở cả hai danh sách).
    if (f.kind) { const k = f.kind; q = q.where((eb) => eb.or([eb('kind', '=', k), sql<boolean>`${k} = ANY(also_kinds)`])); }
    if (f.status === 'active') q = q.where('is_active', '=', true);
    if (f.status === 'inactive') q = q.where('is_active', '=', false);
    const [rows, total] = await Promise.all([
      q.selectAll().orderBy('code').limit(pageSize).offset((page - 1) * pageSize).execute(),
      q.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirst(),
    ]);
    return { rows: rows.map(toPartnerDto), total: Number(total?.n ?? 0) };
  },

  findByCode(db: Db, tenantId: string, code: string) {
    return db.selectFrom('partners').selectAll().where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
  },

  /**
   * Tạo mới hoặc cập nhật theo mã. Chỉ ghi đè trường có giá trị (không xoá thông tin cũ bằng chuỗi rỗng).
   * Không đụng tới thông tin kế toán bổ sung (nhóm, khoá, hạn thanh toán, hạn mức). Trả về id.
   */
  async upsert(db: Db, tenantId: string, p: PartnerInput, kind = 'customer'): Promise<string> {
    const row = await db
      .insertInto('partners')
      .values({
        tenant_id: tenantId,
        code: p.code,
        name: p.name ?? '',
        kind,
        tax_code: p.taxCode || null,
        address: p.address || null,
        email: p.email || null,
        phone: p.phone || null,
      })
      .onConflict((oc) =>
        oc.columns(['tenant_id', 'code']).doUpdateSet({
          // Giữ giá trị cũ khi bản mới để trống.
          name: sql<string>`COALESCE(NULLIF(excluded.name, ''), partners.name)`,
          tax_code: sql<string>`COALESCE(excluded.tax_code, partners.tax_code)`,
          address: sql<string>`COALESCE(excluded.address, partners.address)`,
          email: sql<string>`COALESCE(excluded.email, partners.email)`,
          phone: sql<string>`COALESCE(excluded.phone, partners.phone)`,
          updated_at: new Date(),
        }),
      )
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  },

  /** Cập nhật thông tin kế toán bổ sung (chỉ các trường được truyền). */
  async updateAccountingInfo(db: Db, tenantId: string, code: string, info: PartnerAccountingInfo): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (info.kind !== undefined) patch.kind = info.kind;
    if (info.groupCode !== undefined) patch.group_code = info.groupCode || null;
    if (info.isActive !== undefined) patch.is_active = info.isActive;
    if (info.paymentTermDays !== undefined) patch.payment_term_days = info.paymentTermDays;
    if (info.creditLimit !== undefined) patch.credit_limit = info.creditLimit;
    if (info.note !== undefined) patch.note = info.note;
    if (info.contactName !== undefined) patch.contact_name = info.contactName;
    if (info.bankAccountNo !== undefined) patch.bank_account_no = info.bankAccountNo;
    if (info.bankAccountHolder !== undefined) patch.bank_account_holder = info.bankAccountHolder;
    if (info.bankName !== undefined) patch.bank_name = info.bankName;
    if (info.maxOpenDocs !== undefined) patch.max_open_docs = info.maxOpenDocs;
    if (info.mobile !== undefined) patch.mobile = info.mobile;
    if (info.fax !== undefined) patch.fax = info.fax;
    if (info.website !== undefined) patch.website = info.website;
    if (info.position !== undefined) patch.position = info.position;
    if (info.companyName !== undefined) patch.company_name = info.companyName;
    if (info.companyAddress !== undefined) patch.company_address = info.companyAddress;
    if (info.shortName !== undefined) patch.short_name = info.shortName;
    if (info.managerCode !== undefined) patch.manager_code = info.managerCode || null;
    if (info.branchCode !== undefined) patch.branch_code = info.branchCode || null;
    if (info.birthDate !== undefined) patch.birth_date = info.birthDate || null;
    if (info.gender !== undefined) patch.gender = info.gender;
    if (info.alias !== undefined) patch.alias = info.alias;
    if (info.isProspect !== undefined) patch.is_prospect = info.isProspect;
    if (info.customerType !== undefined) patch.customer_type = info.customerType;
    if (info.alsoKinds !== undefined) patch.also_kinds = info.alsoKinds.filter((k) => k !== (info.kind ?? '')) as never;
    if (!Object.keys(patch).length) return;
    await db.updateTable('partners').set({ ...patch, updated_at: new Date() }).where('tenant_id', '=', tenantId).where('code', '=', code).execute();
  },
};

export function toPartnerDto(r: {
  id: string; code: string; name: string; kind: string; tax_code: string | null; address: string | null; email: string | null; phone: string | null;
  group_code?: string | null; is_active?: boolean; payment_term_days?: number | null; credit_limit?: unknown; note?: string;
  contact_name?: string; bank_account_no?: string; bank_account_holder?: string; bank_name?: string; max_open_docs?: number | null;
  mobile?: string; fax?: string; website?: string; position?: string; company_name?: string; company_address?: string; short_name?: string;
  manager_code?: string | null; branch_code?: string | null; created_at?: unknown; created_by?: string;
  birth_date?: string | null; gender?: string; alias?: string; is_prospect?: boolean; customer_type?: string; also_kinds?: string[];
}): PartnerDto {
  return {
    id: r.id, code: r.code, name: r.name, kind: r.kind, taxCode: r.tax_code, address: r.address, email: r.email, phone: r.phone,
    groupCode: r.group_code ?? null, isActive: r.is_active ?? true, paymentTermDays: r.payment_term_days ?? null,
    creditLimit: r.credit_limit === null || r.credit_limit === undefined ? null : toNumber(r.credit_limit as string), note: r.note ?? '',
    contactName: r.contact_name ?? '', bankAccountNo: r.bank_account_no ?? '', bankAccountHolder: r.bank_account_holder ?? '', bankName: r.bank_name ?? '', maxOpenDocs: r.max_open_docs ?? null,
    mobile: r.mobile ?? '',
    fax: r.fax ?? '',
    website: r.website ?? '',
    position: r.position ?? '',
    companyName: r.company_name ?? '',
    companyAddress: r.company_address ?? '',
    shortName: r.short_name ?? '',
    managerCode: r.manager_code ?? null, branchCode: r.branch_code ?? null,
    createdAt: r.created_at ? new Date(r.created_at as string).toISOString().slice(0, 10) : null, createdBy: r.created_by ?? '',
    createdTime: r.created_at ? new Date(r.created_at as string).toISOString() : null,
    birthDate: r.birth_date ?? null, gender: r.gender ?? '', alias: r.alias ?? '', isProspect: r.is_prospect ?? false, customerType: r.customer_type ?? '', alsoKinds: r.also_kinds ?? [],
  };
}
