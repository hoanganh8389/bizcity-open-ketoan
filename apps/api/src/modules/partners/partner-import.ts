// @bizcity-layer M data/masterdata
// [2026-11-11 Nguyễn Văn Thủy] NHẬP EXCEL ĐỐI TƯỢNG (khách hàng, nhà cung cấp…) cho trình nhập dùng chung (đóng góp)
/**
 * NHẬP EXCEL ĐỐI TƯỢNG: cùng khuôn với nhập mặt hàng (catalog-import.ts) — dryRun kiểm từng dòng, không ghi; ghi thì chỉ ghi dòng đúng,
 * mỗi dòng một SAVEPOINT (lỗi một dòng không làm hỏng dòng khác), cả tệp một giao dịch.
 *   - Mã là khoá. `mode`: 'create' chỉ thêm mới (mã đã có → lỗi), 'update' chỉ cập nhật (mã chưa có → lỗi), 'both' (mặc định) cả hai.
 *   - Thêm mới mà để trống mã: phần mềm tự cấp mã nối dãy của nhóm / kiểu (như nút "Lấy mã mới" ở form).
 *   - Kiểu: mã (customer, supplier…) hoặc chữ (Khách hàng, KH, Nhà cung cấp, NCC…). Nhóm: mã hoặc đúng tên trong danh mục nhóm.
 *   - Mã số thuế không trùng giữa các dòng trong tệp và với đối tượng khác đã có.
 *   - Dòng cập nhật: ô trống giữ nguyên giá trị đang có.
 */
import { checkParent, nextChildCode } from './partner-family.js';
import { sql } from 'kysely';
import { inSavepoint, type ActionTx } from '@bizcity/platform/core/actions';
import type { PartnerInput } from '@ketoan/contracts';
import { writeAudit } from '../../core/audit.js';
import { partnerRepository, type PartnerAccountingInfo } from './partner.repository.js';
import { suggestPartnerCode } from './partner-code.js';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const low = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').trim().toLowerCase();

// [2026-11-20 kiennt] NT-DM-016 — nhập Excel đủ các ô của form đối tượng; cột liên kết (nhóm, người quản lý, chi nhánh, đơn vị cha) tra theo tên (đóng góp)
export const PARTNER_IMPORT_KEYS = ['birthDate', 'gender', 'customerType', 'isProspect', 'companyName', 'shortName', 'alias', 'companyAddress', 'fax', 'website', 'position', 'bankAccountHolder', 'maxOpenDocs', 'managerCode', 'branchCode', 'code', 'name', 'kind', 'groupCode', 'taxCode', 'address', 'phone', 'mobile', 'email', 'contactName', 'bankAccountNo', 'bankName', 'paymentTermDays', 'creditLimit', 'isActive', 'note', 'parentCode'] as const;
export type PartnerImportRow = { row: number } & Partial<Record<(typeof PARTNER_IMPORT_KEYS)[number], string>>;
type Show = Partial<Record<(typeof PARTNER_IMPORT_KEYS)[number], string>>;
export interface PartnerImportResult { row: number; code: string; action: 'create' | 'update' | 'error'; errors: string[]; values: Show; before?: Show }

const KIND_WORDS: Record<string, string> = {
  customer: 'customer', 'khach hang': 'customer', kh: 'customer', khach: 'customer',
  supplier: 'supplier', 'nha cung cap': 'supplier', ncc: 'supplier',
  employee: 'employee', 'nhan vien': 'employee', nv: 'employee',
  internal: 'internal', 'noi bo': 'internal', 'don vi noi bo': 'internal',
  other: 'other', khac: 'other',
};
const KIND_TEXT: Record<string, string> = { customer: 'Khách hàng', supplier: 'Nhà cung cấp', employee: 'Nhân viên', internal: 'Nội bộ', other: 'Khác' };
const YES = new Set(['co', 'x', '1', 'true', 'yes', 'theo doi', 'dang theo doi', 'dang giao dich']);
const NO = new Set(['khong', '0', 'false', 'no', 'ngung', 'khoa']);
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const isTaxCode = (s: string) => /^\d{10}(-\d{3})?$/.test(s) || /^\d{12}$/.test(s) || /^\d{13}$/.test(s);
/** Số trong ô Excel: bỏ dấu chấm / phẩy phân nghìn ("1.000.000", "1,000,000"). */
const GENDER: Record<string, string> = { nam: 'male', male: 'male', m: 'male', nu: 'female', female: 'female', f: 'female' };
const GENDER_TEXT: Record<string, string> = { male: 'Nam', female: 'Nữ' };
const CTYPE: Record<string, string> = { 'kh ca nhan': 'personal', 'ca nhan': 'personal', personal: 'personal', 'kh doanh nghiep': 'business', 'doanh nghiep': 'business', business: 'business', 'cong ty': 'business' };
const CTYPE_TEXT: Record<string, string> = { personal: 'KH cá nhân', business: 'KH doanh nghiệp' };
/** Ngày: dd/mm/yyyy, d/m/yyyy, yyyy-mm-dd → yyyy-mm-dd; sai → undefined. */
const ngay = (s: string): string | undefined => {
  const a = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s); const b = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  const [y, m, d] = a ? [a[3], a[2], a[1]] : b ? [b[1], b[2], b[3]] : [];
  if (!y) return undefined;
  const iso = `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  const t = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso ? undefined : iso;
};
const toNumber = (s: string) => { const n = Number(s.replace(/[.,\s](?=\d{3}(\D|$))/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };

export async function importPartners(trx: ActionTx, tenantId: string, actor: string, actorName: string, rows: PartnerImportRow[], dryRun: boolean, mode: 'create' | 'update' | 'both' = 'both', defaultKind: 'customer' | 'supplier' = 'customer') {
  const [partners, groups] = await Promise.all([
    trx.selectFrom('partners').select(['code', 'name', 'kind', 'group_code', 'tax_code', 'address', 'phone', 'mobile', 'email', 'contact_name', 'bank_account_no', 'bank_name', 'payment_term_days', 'credit_limit', 'is_active', 'note',
      sql<string | null>`(SELECT pp.code FROM partners pp WHERE pp.uid = partners.parent_uid)`.as('parent_code')])
      .where('tenant_id', '=', tenantId).execute(),
    trx.selectFrom('partner_groups').select(['code', 'name', 'kind']).where('tenant_id', '=', tenantId).execute(),
  ]);
  const [extra, employees, branches] = await Promise.all([
    sql<{ code: string; birth_date: string | null; gender: string | null; customer_type: string | null; is_prospect: boolean | null; company_name: string | null; short_name: string | null;
      alias: string | null; company_address: string | null; fax: string | null; website: string | null; position: string | null; bank_account_holder: string | null; max_open_docs: number | null;
      manager_code: string | null; branch_code: string | null }>`
      SELECT code, to_char(birth_date, 'YYYY-MM-DD') AS birth_date, gender, customer_type, is_prospect, company_name, short_name, alias, company_address, fax, website, position,
             bank_account_holder, max_open_docs, manager_code, branch_code FROM partners WHERE tenant_id = ${tenantId}`.execute(trx),
    trx.selectFrom('dimensions').select(['code', 'name']).where('tenant_id', '=', tenantId).where('kind', '=', 'employee').execute(),
    trx.selectFrom('branches').select(['code', 'name']).where('tenant_id', '=', tenantId).execute(),
  ]);
  const extraOf = new Map(extra.rows.map((x) => [x.code, x]));
  /** Cột liên kết: đúng mã, hoặc đúng tên (không phân biệt hoa thường, bỏ dấu cách thừa); trùng nhiều tên → lỗi, ghi mã. */
  const gon = (x: string) => x.replace(/\s+/g, ' ').trim().toLowerCase();
  const lienKet = (ds: readonly { code: string; name: string | null }[], v: string, nhan: string): { code?: string; err?: string } => {
    const ma = ds.filter((x) => x.code === v);
    if (ma.length === 1) return { code: ma[0]!.code };
    const ten = ds.filter((x) => gon(x.name ?? '') === gon(v));
    if (ten.length === 1) return { code: ten[0]!.code };
    if (ten.length > 1) return { err: `Có ${ten.length} ${nhan} tên "${v}" — ghi mã để chọn đúng` };
    const ma2 = ds.filter((x) => gon(x.code) === gon(v));
    if (ma2.length === 1) return { code: ma2[0]!.code };
    return { err: `"${v}" không có trong danh mục ${nhan}` };
  };
  const empName = new Map(employees.map((e) => [e.code, e.name]));
  const branchName = new Map(branches.map((b) => [b.code, b.name]));
  const show2 = (m: Map<string, string | null>, c?: string | null) => (c ? `${c} — ${m.get(c) ?? ''}`.replace(/ — $/, '') : '');
  const byCode = new Map(partners.map((p) => [p.code, p]));
  const taxOwner = new Map(partners.filter((p) => p.tax_code).map((p) => [p.tax_code!.trim(), p.code]));
  const groupName = new Map(groups.map((g) => [g.code, g.name]));
  const showGroup = (c?: string | null) => (c ? `${c} — ${groupName.get(c) ?? ''}`.replace(/ — $/, '') : '');
  const beforeOf = (p: (typeof partners)[number]): Show => ({
    code: p.code, name: p.name, kind: KIND_TEXT[p.kind] ?? p.kind, groupCode: showGroup(p.group_code), taxCode: p.tax_code ?? '', address: p.address ?? '', phone: p.phone ?? '',
    mobile: p.mobile ?? '', email: p.email ?? '', contactName: p.contact_name ?? '', bankAccountNo: p.bank_account_no ?? '', bankName: p.bank_name ?? '',
    paymentTermDays: p.payment_term_days === null ? '' : String(p.payment_term_days), creditLimit: p.credit_limit === null ? '' : String(p.credit_limit),
    isActive: p.is_active ? 'Có' : 'Không', note: p.note ?? '', parentCode: p.parent_code ?? '',
    ...(() => { const x = extraOf.get(p.code); return x ? {
      birthDate: x.birth_date ?? '', gender: GENDER_TEXT[x.gender ?? ''] ?? x.gender ?? '', customerType: CTYPE_TEXT[x.customer_type ?? ''] ?? x.customer_type ?? '', isProspect: x.is_prospect ? 'Có' : '',
      companyName: x.company_name ?? '', shortName: x.short_name ?? '', alias: x.alias ?? '', companyAddress: x.company_address ?? '', fax: x.fax ?? '', website: x.website ?? '', position: x.position ?? '',
      bankAccountHolder: x.bank_account_holder ?? '', maxOpenDocs: x.max_open_docs === null ? '' : String(x.max_open_docs), managerCode: show2(empName, x.manager_code), branchCode: show2(branchName, x.branch_code),
    } : {}; })(),
  });

  const seenCode = new Map<string, number>();
  const seenTax = new Map<string, number>();
  // [2026-11-20 kiennt] NT-DM-016 (bảng theo dõi dòng 47) — đơn vị cha ghi TÊN của dòng phía trên trong tệp (mã để trống, tự cấp) → dòng con theo dòng đó (đóng góp)
  const tenKey = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').trim();
  const seenName = new Map<string, { row: number; code: string; ok: boolean }>();
  const checked = rows.map((r) => {
    const errors: string[] = [];
    const t = (k: (typeof PARTNER_IMPORT_KEYS)[number]) => (r[k] ?? '').trim();
    const code = t('code');
    const before = code ? byCode.get(code) : undefined;
    const isNew = !before;
    if (code && /\s/.test(code)) errors.push(`Mã "${code}" có khoảng trắng`);
    if (code.length > 64) errors.push('Mã dài quá 64 ký tự');
    if (code && seenCode.has(code)) errors.push(`Trùng mã với dòng ${seenCode.get(code)} trong tệp`);
    else if (code) seenCode.set(code, r.row);
    if (mode === 'create' && before) errors.push(`Mã ${code} đã có (${before.name}) — chọn "Cập nhật" nếu muốn sửa`);
    if (mode === 'update' && isNew) errors.push(code ? `Mã ${code} chưa có — chọn "Thêm mới" để thêm` : 'Cập nhật phải ghi mã');

    const name = t('name');
    if (isNew && !name) errors.push('Đối tượng mới phải có tên');
    if (name.length > 255) errors.push('Tên dài quá 255 ký tự');
    const kindRaw = t('kind');
    const kind = kindRaw ? KIND_WORDS[low(kindRaw)] : isNew ? defaultKind : undefined;
    if (kindRaw && !kind) errors.push(`Kiểu "${kindRaw}" không hiểu — ghi Khách hàng / Nhà cung cấp / Nhân viên / Nội bộ / Khác`);
    const groupRaw = t('groupCode');
    const gk = groupRaw ? lienKet(groups, groupRaw, 'nhóm đối tượng') : {};
    const groupCode = gk.code;
    if (gk.err) errors.push(`Nhóm ${gk.err}`);
    // Cột liên kết khác: người quản lý (nhân viên), chi nhánh quản lý — không khớp thì không nhập dòng.
    const mgRaw = t('managerCode'); const mg = mgRaw ? lienKet(employees, mgRaw, 'nhân viên') : {};
    if (mg.err) errors.push(`Người quản lý ${mg.err}`);
    const brRaw = t('branchCode'); const brk = brRaw ? lienKet(branches, brRaw, 'chi nhánh') : {};
    if (brk.err) errors.push(`Chi nhánh quản lý ${brk.err}`);
    const bd = t('birthDate'); const birthDate = bd ? ngay(bd) : undefined;
    if (bd && !birthDate) errors.push(`Ngày sinh "${bd}" không hiểu — ghi dd/mm/yyyy`);
    const gd = t('gender'); const gender = gd ? GENDER[low(gd)] : undefined;
    if (gd && !gender) errors.push(`Giới tính "${gd}" ghi Nam / Nữ`);
    const ct = t('customerType'); const customerType = ct ? CTYPE[low(ct)] : undefined;
    if (ct && !customerType) errors.push(`Loại khách hàng "${ct}" ghi KH cá nhân / KH doanh nghiệp`);
    const ip = t('isProspect'); const isProspect = ip ? (YES.has(low(ip)) ? true : NO.has(low(ip)) ? false : undefined) : undefined;
    if (ip && isProspect === undefined) errors.push(`Khách hàng tiềm năng "${ip}" ghi Có / Không`);
    const mo = t('maxOpenDocs'); const moN = mo ? toNumber(mo) : undefined;
    if (mo && (!Number.isInteger(moN) || moN! < 0)) errors.push(`Giới hạn số phiếu nợ "${mo}" phải là số nguyên không âm`);
    const taxCode = t('taxCode');
    if (taxCode) {
      if (!isTaxCode(taxCode)) errors.push(`Mã số thuế "${taxCode}" sai dạng (10 số, 10 số-3 số, hoặc 12 số CCCD)`);
      const owner = taxOwner.get(taxCode);
      if (owner && owner !== code && owner !== t('parentCode')) errors.push(`Mã số thuế ${taxCode} đã có ở đối tượng ${owner}`);
      if (seenTax.has(taxCode)) errors.push(`Trùng mã số thuế với dòng ${seenTax.get(taxCode)} trong tệp`);
      else seenTax.set(taxCode, r.row);
    }
    const email = t('email');
    if (email && !isEmail(email)) errors.push(`Email "${email}" không hợp lệ`);
    const term = t('paymentTermDays');
    const termN = term ? toNumber(term) : undefined;
    if (term && (!Number.isInteger(termN) || termN! < 0 || termN! > 3650)) errors.push(`Số ngày được nợ "${term}" phải là số nguyên 0 – 3650`);
    const limit = t('creditLimit');
    const limitN = limit ? toNumber(limit) : undefined;
    if (limit && (Number.isNaN(limitN) || limitN! < 0)) errors.push(`Hạn mức nợ "${limit}" phải là số không âm`);
    const act = t('isActive');
    const isActive = act ? (YES.has(low(act)) ? true : NO.has(low(act)) ? false : undefined) : undefined;
    if (act && isActive === undefined) errors.push(`Theo dõi "${act}" không hiểu — ghi Có / Không`);

    // [2026-11-13 Nguyễn Văn Thủy] cột Mã đơn vị cha: đơn vị cha phải có sẵn hoặc nằm ở dòng trên; thêm mới để trống mã thì cấp mã cha-001… (đóng góp)
    // Cột "Thuộc đơn vị cha" của lưới xuất dạng "Mã - Tên": lấy phần mã nếu mã đó có.
    const parentCell = t('parentCode'); const dash = /^(\S+) - /.exec(parentCell);
    const parentRaw = dash && (byCode.has(dash[1]!) || seenCode.has(dash[1]!)) ? dash[1]! : parentCell;
    let parentCode = parentRaw;
    let parentRow: number | undefined;
    if (parentRaw && !byCode.has(parentRaw) && !seenCode.has(parentRaw)) {
      const pk = lienKet(partners, parentRaw, 'đối tượng');
      const tren = seenName.get(tenKey(parentRaw));
      if (pk.code) parentCode = pk.code;
      else if (tren) {
        // Cha là dòng phía trên của tệp: có mã thì dùng mã; mã trống thì lấy mã được cấp khi ghi dòng đó.
        if (!tren.ok) errors.push(`Đơn vị cha "${parentRaw}" ở dòng ${tren.row} không hợp lệ — sửa dòng đó trước`);
        if (tren.code) parentCode = tren.code; else { parentCode = ''; parentRow = tren.row; }
      }
    }
    // Khách hàng mới phải có Nhóm (ô "Thuộc nhóm (*)" của form); đơn vị con lấy nhóm của đơn vị cha.
    if (isNew && !groupRaw && !parentCode && !parentRow && (kind ?? 'customer') === 'customer') errors.push('Khách hàng mới phải có Nhóm khách hàng (như ô "Thuộc nhóm (*)" của form)');
    if (parentRow && isNew && code) errors.push(`Đơn vị cha ở dòng ${parentRow} chưa có mã (tự cấp) — để trống mã dòng này để phần mềm cấp mã con`);
    if (parentCode) {
      if (parentCode === code) errors.push('Đơn vị cha không được là chính nó');
      else if (!byCode.has(parentCode) && !(seenCode.has(parentCode) && seenCode.get(parentCode)! < r.row)) errors.push(`Đơn vị cha ${parentCode} chưa có — thêm đơn vị cha trước (hoặc đặt dòng của nó lên trên)`);
      if (isNew && code && !code.startsWith(`${parentCode}-`)) errors.push(`Mã đơn vị con phải bắt đầu bằng "${parentCode}-" — để trống mã thì phần mềm tự cấp`);
    }
    const input: PartnerInput = { code, name, ...(taxCode ? { taxCode } : {}), ...(t('address') ? { address: t('address') } : {}), ...(email ? { email } : {}), ...(t('phone') ? { phone: t('phone') } : {}) };
    const info: PartnerAccountingInfo = {
      ...(kind ? { kind } : {}), ...(groupCode ? { groupCode } : {}), ...(isActive !== undefined ? { isActive } : isNew ? { isActive: true } : {}),
      ...(termN !== undefined && !Number.isNaN(termN) ? { paymentTermDays: termN } : {}), ...(limitN !== undefined && !Number.isNaN(limitN) ? { creditLimit: limitN } : {}),
      ...(t('note') ? { note: t('note') } : {}), ...(parentCode ? { parentCode } : {}), ...(t('contactName') ? { contactName: t('contactName') } : {}), ...(t('mobile') ? { mobile: t('mobile') } : {}),
      ...(t('bankAccountNo') ? { bankAccountNo: t('bankAccountNo') } : {}), ...(t('bankName') ? { bankName: t('bankName') } : {}),
      // Khách hàng: một ô Điện thoại ghi cả điện thoại / di động như form (NT-DM-016).
      ...((kind ?? before?.kind) === 'customer' && t('phone') && !t('mobile') ? { mobile: t('phone') } : {}),
      ...(mg.code ? { managerCode: mg.code } : {}), ...(brk.code ? { branchCode: brk.code } : {}), ...(birthDate ? { birthDate } : {}), ...(gender ? { gender } : {}),
      ...(customerType ? { customerType } : {}), ...(isProspect !== undefined ? { isProspect } : {}), ...(moN !== undefined && Number.isInteger(moN) ? { maxOpenDocs: moN } : {}),
      ...Object.fromEntries((['shortName', 'alias', 'fax', 'website', 'position', 'bankAccountHolder'] as const).filter((k) => t(k)).map((k) => [k, t(k)])),
      ...(t('companyName') ? { companyName: t('companyName') } : {}), ...(t('companyAddress') ? { companyAddress: t('companyAddress') } : {}),
      // Nhà cung cấp: tên / địa chỉ chính thức dùng trên hoá đơn (như form đối tượng).
      ...((kind ?? before?.kind) === 'supplier' && name ? { companyName: name } : {}), ...((kind ?? before?.kind) === 'supplier' && t('address') ? { companyAddress: t('address') } : {}),
    };
    if (!isNew && !errors.length && !name && !Object.keys(input).some((k) => k !== 'code' && k !== 'name') && !Object.keys(info).length) errors.push('Không có thông tin nào để cập nhật');
    const values: Show = {
      code: code || (isNew ? '(tự cấp)' : ''), name, kind: kind ? KIND_TEXT[kind] : kindRaw, groupCode: groupCode ? showGroup(groupCode) : groupRaw, taxCode, address: t('address'), phone: t('phone'),
      mobile: t('mobile'), email, contactName: t('contactName'), bankAccountNo: t('bankAccountNo'), bankName: t('bankName'), paymentTermDays: term, creditLimit: limit,
      isActive: isActive === undefined ? (isNew && !act ? 'Có' : act) : isActive ? 'Có' : 'Không', note: t('note'), parentCode: parentRow ? `${parentRaw} (dòng ${parentRow})` : parentCode,
      birthDate: birthDate ?? bd, gender: gender ? GENDER_TEXT[gender] : gd, customerType: customerType ? CTYPE_TEXT[customerType] : ct, isProspect: isProspect === undefined ? ip : isProspect ? 'Có' : 'Không',
      companyName: t('companyName'), shortName: t('shortName'), alias: t('alias'), companyAddress: t('companyAddress'), fax: t('fax'), website: t('website'), position: t('position'),
      bankAccountHolder: t('bankAccountHolder'), maxOpenDocs: mo, managerCode: mg.code ? show2(empName, mg.code) : mgRaw, branchCode: brk.code ? show2(branchName, brk.code) : brRaw,
    };
    if (name) seenName.set(tenKey(name), { row: r.row, code, ok: !errors.length });
    return { row: r.row, code, isNew, input, info, errors, values, parentRow, before: before ? beforeOf(before) : undefined };
  });

  const results: PartnerImportResult[] = [];
  const maDaGhi = new Map<number, string>();
  for (const c of checked) {
    const show = { values: c.values, ...(c.before ? { before: c.before } : {}) };
    if (c.parentRow && !dryRun && !c.errors.length) {
      const ma = maDaGhi.get(c.parentRow);
      if (ma) c.info = { ...c.info, parentCode: ma };
      else c.errors.push(`Đơn vị cha ở dòng ${c.parentRow} không ghi được — dòng này bỏ qua`);
    }
    if (c.errors.length || dryRun) { results.push({ row: c.row, code: c.code, action: c.errors.length ? 'error' : c.isNew ? 'create' : 'update', errors: c.errors, ...show }); continue; }
    const x = await inSavepoint(trx, async (t) => {
      // Mã trống: cấp mã nối dãy của nhóm / kiểu (khoá theo đơn vị để hai lần nhập cùng lúc không cấp trùng).
      let code = c.code;
      if (!code) {
        await sql`SELECT pg_advisory_xact_lock(hashtext(${`partner-code:${tenantId}`}))`.execute(t);
        code = c.info.parentCode ? (await nextChildCode(t, tenantId, c.info.parentCode, c.input.taxCode)).code : (await suggestPartnerCode(t, tenantId, { groupCode: c.info.groupCode, kind: c.info.kind })).code;
      }
      if (c.info.parentCode !== undefined) {
        const before = await t.selectFrom('partners').select(['uid', 'parent_uid']).where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
        await checkParent(t, tenantId, code, c.info.parentCode, before ?? null);
      }
      await partnerRepository.upsert(t, tenantId, { ...c.input, code }, c.info.kind ?? 'customer');
      await partnerRepository.updateAccountingInfo(t, tenantId, code, c.info);
      if (c.isNew) await t.updateTable('partners').set({ created_by: actorName }).where('tenant_id', '=', tenantId).where('code', '=', code).execute();
      return code;
    });
    if (x.ok) maDaGhi.set(c.row, x.value);
    results.push(x.ok
      ? { row: c.row, code: x.value, action: c.isNew ? 'create' : 'update', errors: [], ...show, values: { ...c.values, code: x.value } }
      : { row: c.row, code: c.code, action: 'error', errors: [errorText(x.error)], ...show });
  }
  const count = (a: PartnerImportResult['action']) => results.filter((x) => x.action === a).length;
  const summary = { created: count('create'), updated: count('update'), failed: count('error') };
  if (!dryRun && (summary.created || summary.updated)) {
    await writeAudit(trx, { tenantId, actor, action: 'partner.import', objectType: 'partner', objectId: `${summary.created + summary.updated} đối tượng`, after: { ...summary, codes: results.filter((x) => x.action !== 'error').map((x) => x.code).slice(0, 50) } });
  }
  return { dryRun, ...summary, rows: results };
}
