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
import { sql } from 'kysely';
import { inSavepoint, type ActionTx } from '@bizcity/platform/core/actions';
import type { PartnerInput } from '@ketoan/contracts';
import { writeAudit } from '../../core/audit.js';
import { partnerRepository, type PartnerAccountingInfo } from './partner.repository.js';
import { suggestPartnerCode } from './partner-code.js';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const low = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').trim().toLowerCase();

export const PARTNER_IMPORT_KEYS = ['code', 'name', 'kind', 'groupCode', 'taxCode', 'address', 'phone', 'mobile', 'email', 'contactName', 'bankAccountNo', 'bankName', 'paymentTermDays', 'creditLimit', 'isActive', 'note'] as const;
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
const toNumber = (s: string) => { const n = Number(s.replace(/[.,\s](?=\d{3}(\D|$))/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };

export async function importPartners(trx: ActionTx, tenantId: string, actor: string, actorName: string, rows: PartnerImportRow[], dryRun: boolean, mode: 'create' | 'update' | 'both' = 'both') {
  const [partners, groups] = await Promise.all([
    trx.selectFrom('partners').select(['code', 'name', 'kind', 'group_code', 'tax_code', 'address', 'phone', 'mobile', 'email', 'contact_name', 'bank_account_no', 'bank_name', 'payment_term_days', 'credit_limit', 'is_active', 'note'])
      .where('tenant_id', '=', tenantId).execute(),
    trx.selectFrom('partner_groups').select(['code', 'name', 'kind']).where('tenant_id', '=', tenantId).execute(),
  ]);
  const byCode = new Map(partners.map((p) => [p.code, p]));
  const taxOwner = new Map(partners.filter((p) => p.tax_code).map((p) => [p.tax_code!.trim(), p.code]));
  const groupName = new Map(groups.map((g) => [g.code, g.name]));
  const showGroup = (c?: string | null) => (c ? `${c} — ${groupName.get(c) ?? ''}`.replace(/ — $/, '') : '');
  const findGroup = (v: string) => groups.find((g) => g.code === v)?.code ?? groups.find((g) => low(g.code) === low(v))?.code
    ?? (groups.filter((g) => low(g.name) === low(v)).length === 1 ? groups.find((g) => low(g.name) === low(v))!.code : null);
  const beforeOf = (p: (typeof partners)[number]): Show => ({
    code: p.code, name: p.name, kind: KIND_TEXT[p.kind] ?? p.kind, groupCode: showGroup(p.group_code), taxCode: p.tax_code ?? '', address: p.address ?? '', phone: p.phone ?? '',
    mobile: p.mobile ?? '', email: p.email ?? '', contactName: p.contact_name ?? '', bankAccountNo: p.bank_account_no ?? '', bankName: p.bank_name ?? '',
    paymentTermDays: p.payment_term_days === null ? '' : String(p.payment_term_days), creditLimit: p.credit_limit === null ? '' : String(p.credit_limit),
    isActive: p.is_active ? 'Có' : 'Không', note: p.note ?? '',
  });

  const seenCode = new Map<string, number>();
  const seenTax = new Map<string, number>();
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
    const kind = kindRaw ? KIND_WORDS[low(kindRaw)] : isNew ? 'customer' : undefined;
    if (kindRaw && !kind) errors.push(`Kiểu "${kindRaw}" không hiểu — ghi Khách hàng / Nhà cung cấp / Nhân viên / Nội bộ / Khác`);
    const groupRaw = t('groupCode');
    const groupCode = groupRaw ? findGroup(groupRaw) : undefined;
    if (groupRaw && !groupCode) errors.push(`Nhóm "${groupRaw}" chưa có trong danh mục nhóm đối tượng`);
    const taxCode = t('taxCode');
    if (taxCode) {
      if (!isTaxCode(taxCode)) errors.push(`Mã số thuế "${taxCode}" sai dạng (10 số, 10 số-3 số, hoặc 12 số CCCD)`);
      const owner = taxOwner.get(taxCode);
      if (owner && owner !== code) errors.push(`Mã số thuế ${taxCode} đã có ở đối tượng ${owner}`);
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

    const input: PartnerInput = { code, name, ...(taxCode ? { taxCode } : {}), ...(t('address') ? { address: t('address') } : {}), ...(email ? { email } : {}), ...(t('phone') ? { phone: t('phone') } : {}) };
    const info: PartnerAccountingInfo = {
      ...(kind ? { kind } : {}), ...(groupCode ? { groupCode } : {}), ...(isActive !== undefined ? { isActive } : isNew ? { isActive: true } : {}),
      ...(termN !== undefined && !Number.isNaN(termN) ? { paymentTermDays: termN } : {}), ...(limitN !== undefined && !Number.isNaN(limitN) ? { creditLimit: limitN } : {}),
      ...(t('note') ? { note: t('note') } : {}), ...(t('contactName') ? { contactName: t('contactName') } : {}), ...(t('mobile') ? { mobile: t('mobile') } : {}),
      ...(t('bankAccountNo') ? { bankAccountNo: t('bankAccountNo') } : {}), ...(t('bankName') ? { bankName: t('bankName') } : {}),
      // Nhà cung cấp: tên / địa chỉ chính thức dùng trên hoá đơn (như form đối tượng).
      ...((kind ?? before?.kind) === 'supplier' && name ? { companyName: name } : {}), ...((kind ?? before?.kind) === 'supplier' && t('address') ? { companyAddress: t('address') } : {}),
    };
    if (!isNew && !errors.length && !name && !Object.keys(input).some((k) => k !== 'code' && k !== 'name') && !Object.keys(info).length) errors.push('Không có thông tin nào để cập nhật');
    const values: Show = {
      code: code || (isNew ? '(tự cấp)' : ''), name, kind: kind ? KIND_TEXT[kind] : kindRaw, groupCode: groupCode ? showGroup(groupCode) : groupRaw, taxCode, address: t('address'), phone: t('phone'),
      mobile: t('mobile'), email, contactName: t('contactName'), bankAccountNo: t('bankAccountNo'), bankName: t('bankName'), paymentTermDays: term, creditLimit: limit,
      isActive: isActive === undefined ? (isNew && !act ? 'Có' : act) : isActive ? 'Có' : 'Không', note: t('note'),
    };
    return { row: r.row, code, isNew, input, info, errors, values, before: before ? beforeOf(before) : undefined };
  });

  const results: PartnerImportResult[] = [];
  for (const c of checked) {
    const show = { values: c.values, ...(c.before ? { before: c.before } : {}) };
    if (c.errors.length || dryRun) { results.push({ row: c.row, code: c.code, action: c.errors.length ? 'error' : c.isNew ? 'create' : 'update', errors: c.errors, ...show }); continue; }
    const x = await inSavepoint(trx, async (t) => {
      // Mã trống: cấp mã nối dãy của nhóm / kiểu (khoá theo đơn vị để hai lần nhập cùng lúc không cấp trùng).
      let code = c.code;
      if (!code) {
        await sql`SELECT pg_advisory_xact_lock(hashtext(${`partner-code:${tenantId}`}))`.execute(t);
        code = (await suggestPartnerCode(t, tenantId, { groupCode: c.info.groupCode, kind: c.info.kind })).code;
      }
      await partnerRepository.upsert(t, tenantId, { ...c.input, code }, c.info.kind ?? 'customer');
      await partnerRepository.updateAccountingInfo(t, tenantId, code, c.info);
      if (c.isNew) await t.updateTable('partners').set({ created_by: actorName }).where('tenant_id', '=', tenantId).where('code', '=', code).execute();
      return code;
    });
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
