// @bizcity-layer K kernel/intake
/**
 * Chứng từ kế toán nhập tay: phiếu thu, phiếu chi, phiếu báo có, phiếu báo nợ, phiếu kế toán,
 * và số dư tài khoản đầu kỳ.
 *
 * Dùng chung kho chứng từ gốc (accounting_events, source_system = 'manual') và ghi sổ qua eventStore (cửa ghi của sự việc
 * Kernel tự lập: phiên bản, posted_version, posting_log), nên mọi sổ sách, báo cáo, khoá kỳ áp dụng như nhau.
 *
 * Luật:
 *  - Số phiếu để trống thì tự cấp (tiền tố theo loại + năm + số thứ tự); số tự nhập không được trùng.
 *  - Phiếu thu / chi phải đi qua tiền mặt; báo có / báo nợ phải đi qua tiền gửi (xem VOUCHER_MONEY).
 *  - Tài khoản theo dõi đối tượng thì phải có đối tượng (của dòng, hoặc đối tượng chung của phiếu).
 *  - Sửa phiếu: bút toán cũ được đảo bằng ghi số âm, ghi bút toán mới, phiên bản tăng 1.
 *    Loại phiếu và số phiếu không đổi được. Kỳ đã khoá thì không sửa, không huỷ được.
 *  - Huỷ phiếu: dùng chung documentService.cancel().
 */
import { assertDateRules } from '../../core/date-rules.js';
import {
  VOUCHER_MONEY,
  VOUCHER_PREFIX,
  VOUCHER_TYPES,
  fromCents,
  isMoneyAccountFor,
  toCents,
  type DimensionKind,
  type DocType,
  type OpeningInput,
  type VoucherInput,
  type VoucherType,
} from '@ketoan/contracts';
import { sql } from 'kysely';
import { db, type Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import { assertCanModify, type AuthContext } from '../../core/auth.js';
import { settleFromEvent } from '../debts/debt.service.js';
import type { Account } from '../../db/types.js';
import { accountRepository } from '../accounts/account.repository.js';
import { documentRepository } from '../documents/document.repository.js';
import { eventStore } from '../documents/event-store.js';
import type { DraftLine } from '../ledger/ledger.types.js';
import { applyTaxFlags } from '../tax-info/tax-patch.js';
import { isProfitLossAccount } from '../closing/closing.service.js';

type ManualType = VoucherType | 'opening';
export const isVoucherType = (t: string): t is VoucherType => (VOUCHER_TYPES as readonly string[]).includes(t);
export const isManualType = (t: string): t is ManualType => isVoucherType(t) || t === 'opening';

/** Nội dung đã chuẩn hoá của một chứng từ nhập tay, đủ để lưu và ghi sổ. */
interface ManualDoc {
  docType: ManualType;
  branchCode: string;
  docDate: string;
  docNo?: string;
  description: string;
  /** Đối tượng chung của chứng từ (ghi lên thân bút toán). */
  partnerCode?: string;
  /** Lý do thu / chi ghi lên bút toán. */
  reasonCode?: string;
  total: number;
  /** Nội dung gốc lưu lại để mở sửa. */
  payload: Record<string, unknown>;
  /** Mọi mã đối tượng xuất hiện trong chứng từ (để tra một lần). */
  partnerCodes: string[];
  /** Các khoản công nợ phiếu này thanh toán (undefined = không đụng tới đối trừ đã có). */
  settle?: { debtItemId: string; amount: number }[];
  buildLines(ctx: BuildContext): DraftLine[];
  /** Hoá đơn GTGT kê trên các dòng (ghi vào sổ hoá đơn). */
  taxInvoices?(ctx: BuildContext): TaxInvoiceDraft[];
}

/** Danh mục đã nạp sẵn để kiểm tra và dựng dòng sổ cái. */
interface BuildContext {
  accounts: Map<string, Account>;
  /** mã đối tượng → id */
  partners: Map<string, string>;
  /** loại chiều phân tích → các mã đang dùng */
  dims: Record<DimensionKind, Set<string>>;
  taxCodes: Map<string, { code: string; rate: number; direction: string; accountCode: string | null; reportGroup: string }>;
  /** Mã lý do đang dùng. */
  reasons: Set<string>;
}

interface TaxInvoiceDraft {
  direction: 'input' | 'output';
  invoiceNo: string;
  serial: string;
  form: string;
  date: string;
  partnerName: string;
  partnerTaxCode: string;
  description: string;
  amount: number;
  tax: number;
  taxCode: string;
  rate: number;
  reportGroup: string;
}

const tracksPartner = (a: Account | undefined) => Boolean(a && (a.track_partner || a.is_debt || a.normal_side === 'both'));

async function nextDocNo(trx: Db, tenantId: string, docType: ManualType, year: number): Promise<string> {
  const row = await trx
    .insertInto('document_sequences')
    .values({ tenant_id: tenantId, doc_type: docType, year, last_no: 1 })
    .onConflict((oc) => oc.columns(['tenant_id', 'doc_type', 'year']).doUpdateSet({ last_no: sql`document_sequences.last_no + 1` }))
    .returning('last_no')
    .executeTakeFirstOrThrow();
  return `${VOUCHER_PREFIX[docType]}${String(year).slice(2)}-${String(row.last_no).padStart(6, '0')}`;
}

/** Tra mã đối tượng → id; mã không có trong danh mục thì báo lỗi rõ. */
async function resolvePartners(trx: Db, tenantId: string, codes: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(codes.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await trx.selectFrom('partners').select(['id', 'code']).where('tenant_id', '=', tenantId).where('code', 'in', unique).execute();
  const map = new Map(rows.map((r) => [r.code, r.id]));
  const missing = unique.filter((c) => !map.has(c));
  if (missing.length) throw Errors.validation(`Mã đối tượng này không tồn tại: ${missing.join(', ')}`);
  return map;
}

/** Phiếu mới không dùng đối tượng đã khoá (sửa phiếu cũ thì vẫn được, để chữa sổ). */
async function assertActivePartners(trx: Db, tenantId: string, codes: string[]): Promise<void> {
  const unique = [...new Set(codes.filter(Boolean))];
  if (!unique.length) return;
  const locked = await trx.selectFrom('partners').select('code').where('tenant_id', '=', tenantId).where('code', 'in', unique).where('is_active', '=', false).execute();
  if (locked.length) throw Errors.validation(`Đối tượng đã khoá, không dùng cho phiếu mới: ${locked.map((p) => p.code).join(', ')}`);
}

async function branchIdOf(trx: Db, tenantId: string, code: string): Promise<string> {
  const row = await trx.selectFrom('branches').select(['id', 'is_active']).where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
  if (!row) throw Errors.validation(`Chi nhánh ${code} chưa khai báo trong danh mục`);
  if (!row.is_active) throw Errors.validation(`Chi nhánh ${code} đã ngừng sử dụng`);
  return row.id;
}

/** Nạp các danh mục cần để kiểm tra và dựng dòng. */
async function loadContext(trx: Db, tenantId: string, doc: ManualDoc): Promise<BuildContext> {
  const accounts = await accountRepository.mapByCode(trx, tenantId);
  const partners = await resolvePartners(trx, tenantId, doc.partnerCodes);
  const dimRows = await trx.selectFrom('dimensions').select(['kind', 'code']).where('tenant_id', '=', tenantId).where('is_active', '=', true).execute();
  const taxRows = await trx.selectFrom('tax_codes').selectAll().where('tenant_id', '=', tenantId).where('is_active', '=', true).execute();
  const reasonRows = doc.reasonCode ? await trx.selectFrom('posting_reasons').select('code').where('tenant_id', '=', tenantId).where('code', '=', doc.reasonCode).execute() : [];
  const dims: BuildContext['dims'] = { cost_item: new Set(), department: new Set(), contract: new Set(), employee: new Set(), case: new Set(), project: new Set(), capital_source: new Set(), tool_group: new Set(), usage_purpose: new Set() };
  for (const d of dimRows) dims[d.kind as DimensionKind]?.add(d.code);
  return {
    accounts,
    partners,
    dims,
    taxCodes: new Map(taxRows.map((t) => [t.code, { code: t.code, rate: Number(t.rate), direction: t.direction, accountCode: t.account_code, reportGroup: t.report_group }])),
    reasons: new Set(reasonRows.map((r) => r.code)),
  };
}

/** Ghi lại sổ hoá đơn của chứng từ: xoá bản cũ, thêm hoá đơn kê trên các dòng. */
async function saveTaxInvoices(trx: Db, auth: AuthContext, a: { docId: string; branchId: string; docNo: string; doc: ManualDoc; ctx: BuildContext }): Promise<void> {
  await trx.deleteFrom('tax_invoices').where('event_id', '=', a.docId).execute();
  if (!a.doc.taxInvoices) return;
  for (const inv of a.doc.taxInvoices(a.ctx)) {
    const row = await trx
      .insertInto('tax_invoices')
      .values({
        tenant_id: auth.tenantId, branch_id: a.branchId, direction: inv.direction, event_id: a.docId, doc_type: a.doc.docType, doc_no: a.docNo, doc_date: a.doc.docDate,
        invoice_no: inv.invoiceNo, invoice_serial: inv.serial, invoice_form: inv.form, invoice_date: inv.date, status: 'valid',
        partner_id: a.ctx.partners.get(a.doc.partnerCode ?? '') ?? null, buyer_name: inv.partnerName, buyer_tax_code: inv.partnerTaxCode, buyer_address: '',
        total_before_tax: inv.amount, total_tax: inv.tax, sign: 1,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('tax_invoice_lines')
      .values({ tax_invoice_id: row.id, line_no: 1, sku: '', name: inv.description, unit: '', qty: 0, amount_before_tax: inv.amount, tax_code: inv.taxCode, tax_rate: inv.rate, report_group: inv.reportGroup, tax_amount: inv.tax })
      .execute();
  }
}

/** Ghi bút toán của chứng từ vào sổ kế toán. */
async function postEntries(trx: Db, auth: AuthContext, a: { docId: string; version: number; branchId: string; docNo: string; doc: ManualDoc }): Promise<string[]> {
  const { doc } = a;
  const ctx = await loadContext(trx, auth.tenantId, doc);
  const { accounts, partners } = ctx;
  const lines = doc.buildLines(ctx);
  await saveTaxInvoices(trx, auth, { docId: a.docId, branchId: a.branchId, docNo: a.docNo, doc, ctx });
  await applyTaxFlags(trx, a.docId);
  const posted = await eventStore.post(
    trx,
    auth,
    { id: a.docId, version: a.version },
    {
      branchId: a.branchId,
      docType: doc.docType as DocType,
      docNo: a.docNo,
      invoiceNo: null,
      docDate: doc.docDate,
      postingDate: doc.docDate,
      partnerId: partners.get(doc.partnerCode ?? '') ?? null,
      reasonCode: doc.reasonCode ?? null,
      description: doc.description,
      lines,
    },
    accounts,
  );
  return [posted.id];
}

/**
 * Không cho lập chứng từ có ngày sau cuối tháng hiện tại, trừ khi kỳ kế toán của tháng đó đã được khai
 * (kế toán chủ động mở kỳ trước để lập chứng từ cho tháng sau).
 */
export async function assertNotFutureDate(trx: Db, tenantId: string, docDate: string) {
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const limit = `${endOfMonth.getFullYear()}-${String(endOfMonth.getMonth() + 1).padStart(2, '0')}-${String(endOfMonth.getDate()).padStart(2, '0')}`;
  if (docDate <= limit) return;
  const [y, m] = docDate.split('-').map(Number) as [number, number];
  const period = await trx.selectFrom('fiscal_periods').select('id').where('tenant_id', '=', tenantId).where('year', '=', y).where('month', '=', m).executeTakeFirst();
  if (!period) throw Errors.validation(`Ngày chứng từ ${docDate.split('-').reverse().join('/')} sau cuối tháng hiện tại. Muốn lập chứng từ cho tháng sau, hãy khai kỳ kế toán của tháng đó trước (Đóng / mở kỳ kế toán, tab Danh sách kỳ).`);
}

/** Lập chứng từ mới và ghi sổ ngay. */
async function createManual(auth: AuthContext, doc: ManualDoc) {
  return db.transaction().execute((trx) => createManualIn(trx, auth, doc));
}

/** Lập chứng từ trong giao dịch có sẵn (bút toán lặp: ghi kỳ đã sinh cùng giao dịch). */
async function createManualIn(trx: Db, auth: AuthContext, doc: ManualDoc) {
  {
    await assertNotFutureDate(trx, auth.tenantId, doc.docDate);
    await assertDateRules(trx, auth, 'lập', [doc.docDate]);
    const branchId = await branchIdOf(trx, auth.tenantId, doc.branchCode);
    const docNo = doc.docNo || (await nextDocNo(trx, auth.tenantId, doc.docType, Number(doc.docDate.slice(0, 4))));
    const docKey = `manual:${doc.docType}:${docNo}`;
    if (await documentRepository.findByKey(trx, auth.tenantId, docKey)) throw Errors.conflict(`Số phiếu ${docNo} đã tồn tại. Để trống ô số phiếu để hệ thống tự sinh số mới.`);

    await assertActivePartners(trx, auth.tenantId, doc.partnerCodes);
    const partners = await resolvePartners(trx, auth.tenantId, [doc.partnerCode ?? '']);
    const created = await documentRepository.insert(trx, {
      tenant_id: auth.tenantId,
      source_system: 'manual',
      created_by: auth.actor,
      doc_key: docKey,
      version: 1,
      doc_type: doc.docType,
      branch_id: branchId,
      doc_no: docNo,
      doc_date: doc.docDate,
      partner_id: partners.get(doc.partnerCode ?? '') ?? null,
      invoice_no: null,
      total: doc.total,
      payload: JSON.stringify({ ...doc.payload, docNo }),
    });
    const entryIds = await postEntries(trx, auth, { docId: created.id, version: 1, branchId, docNo, doc });
    if (doc.settle?.length) await settleFromEvent(trx, auth.tenantId, created.id, doc.settle, auth.actorName);
    const sourceDocKey = (doc.payload as { sourceDocKey?: string }).sourceDocKey;
    if (sourceDocKey) {
      const res = await trx.updateTable('reference_documents').set({ status: 'used', used_event_id: created.id, updated_at: new Date() }).where('tenant_id', '=', auth.tenantId).where('doc_key', '=', sourceDocKey).executeTakeFirst();
      if (!Number(res.numUpdatedRows)) throw Errors.validation(`Chứng từ nguồn ${sourceDocKey} không tồn tại`);
    }
    await eventStore.markPosted(trx, auth, { id: created.id, version: 1, docType: doc.docType, docNo, entryIds, total: doc.total, action: 'post' });
    await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: `${doc.docType}.create`, objectType: 'source_document', objectId: docKey, after: { total: doc.total } });
    return { id: created.id, docKey, docNo, version: 1, entryIds };
  }
}

/** Sửa chứng từ: đảo bút toán cũ (ghi số âm), ghi bút toán mới, tăng phiên bản. */
async function updateManual(auth: AuthContext, id: string, doc: ManualDoc) {
  return db.transaction().execute(async (trx) => {
    const found = await documentRepository.findById(trx, auth.tenantId, id);
    if (!found) throw Errors.notFound('phiếu');
    const row = (await documentRepository.findByKeyForUpdate(trx, auth.tenantId, found.doc_key))!;
    if (row.source_system !== 'manual' || !isManualType(row.doc_type)) throw Errors.conflict('Chỉ sửa được phiếu nhập tay; chứng từ nhận từ hệ thống khác phải sửa ở nơi phát sinh');
    if (row.status === 'cancelled') throw Errors.conflict('Phiếu đã huỷ, không sửa được');
    assertCanModify(auth, row, 'sửa');
    if (row.doc_type !== doc.docType) throw Errors.validation('Không đổi được loại phiếu');
    if (doc.docNo && doc.docNo !== row.doc_no) throw Errors.validation('Không đổi được số phiếu');
    await assertNotFutureDate(trx, auth.tenantId, doc.docDate);
    await assertDateRules(trx, auth, 'sửa', [row.doc_date, doc.docDate]);

    const branchId = await branchIdOf(trx, auth.tenantId, doc.branchCode);
    const version = row.version + 1;
    await documentRepository.archiveVersion(trx, row.id, row.version, row.payload, row.received_at);
    const accounts = await accountRepository.mapByCode(trx, auth.tenantId);
    const reversed = await eventStore.reverseActive(trx, auth, row.id, accounts, `Sửa phiếu sang phiên bản ${version}`);
    const partners = await resolvePartners(trx, auth.tenantId, [doc.partnerCode ?? '']);
    await documentRepository.update(trx, row.id, {
      version,
      branch_id: branchId,
      doc_date: doc.docDate,
      partner_id: partners.get(doc.partnerCode ?? '') ?? null,
      total: doc.total,
      payload: JSON.stringify({ ...doc.payload, docNo: row.doc_no }),
      received_at: new Date(),
    });
    const entryIds = await postEntries(trx, auth, { docId: row.id, version, branchId, docNo: row.doc_no, doc });
    if (doc.settle) await settleFromEvent(trx, auth.tenantId, row.id, doc.settle, auth.actorName);
    await eventStore.markPosted(trx, auth, { id: row.id, version, docType: doc.docType, docNo: row.doc_no, entryIds, reversed, total: doc.total, action: 'repost' });
    await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: `${doc.docType}.update`, objectType: 'source_document', objectId: row.doc_key, after: { version, total: doc.total } });
    return { id: row.id, docKey: row.doc_key, docNo: row.doc_no, version, entryIds };
  });
}

/** Tên gọi từng chiều phân tích trong thông báo lỗi và cờ tương ứng trên tài khoản. */
const DIM_RULES = [
  { field: 'costItem', kind: 'cost_item', flag: 'track_cost_item', label: 'khoản mục' },
  { field: 'department', kind: 'department', flag: 'track_department', label: 'bộ phận' },
  { field: 'contract', kind: 'contract', flag: 'track_contract', label: 'hợp đồng' },
  { field: 'employee', kind: 'employee', flag: 'track_employee', label: 'nhân viên' },
  { field: 'case', kind: 'case', flag: 'track_case', label: 'vụ việc' },
  { field: 'project', kind: 'project', flag: 'track_project', label: 'dự án' },
  { field: 'capitalSource', kind: 'capital_source', flag: 'track_capital_source', label: 'nguồn vốn' },
] as const;

/**
 * Phiếu thu / chi / báo có / báo nợ / phiếu kế toán → chứng từ nhập tay.
 *
 * Mỗi dòng phiếu sinh một cặp Nợ/Có theo số tiền CHƯA thuế. Dòng có thuế sinh thêm một cặp thuế:
 *   thuế đầu vào: Nợ TK thuế (133…) / Có TK Có của dòng     (chi tiền mua dịch vụ có hoá đơn)
 *   thuế đầu ra : Nợ TK Nợ của dòng / Có TK thuế (3331…)    (thu tiền có xuất hoá đơn)
 */
function fromVoucher(input: VoucherInput): ManualDoc {
  const rule = VOUCHER_MONEY[input.docType];
  return {
    docType: input.docType,
    branchCode: input.branchCode,
    docDate: input.docDate,
    docNo: input.docNo,
    description: input.description,
    partnerCode: input.partnerCode,
    reasonCode: input.reasonCode || undefined,
    total: fromCents(input.lines.reduce((s, l) => s + toCents(l.amount) + toCents(l.taxAmount ?? 0), 0)),
    payload: input,
    settle: input.settle,
    partnerCodes: [input.partnerCode ?? '', ...input.lines.flatMap((l) => [l.partnerCode ?? '', l.creditPartnerCode ?? ''])],
    buildLines({ accounts, partners, dims, taxCodes, reasons }) {
      const problems: string[] = [];
      if (input.reasonCode && !reasons.has(input.reasonCode)) problems.push(`Lý do "${input.reasonCode}" không tồn tại`);
      const lines: DraftLine[] = [];
      let pairNo = 0;
      input.lines.forEach((l, i) => {
        const row = `Dòng ${i + 1}`;
        if (l.debitAccount === l.creditAccount) problems.push(`${row}: tài khoản Nợ và Có trùng nhau`);
        if (rule && !isMoneyAccountFor(input.docType, rule.side === 'debit' ? l.debitAccount : l.creditAccount)) problems.push(`${row}: ${rule.label}`);

        // Chiều phân tích: mã phải có trong danh mục; tài khoản bật theo dõi chiều nào thì chiều đó bắt buộc
        // (với điều kiện đơn vị đã khai danh mục của chiều đó).
        const lineDims: Record<string, string> = {};
        for (const r of DIM_RULES) {
          // Dòng chưa chọn nhân viên: lấy nhân viên ở đầu phiếu.
          const code = r.field === 'employee' ? l.employee || input.employeeCode : l[r.field];
          if (code) {
            if (!dims[r.kind].has(code)) problems.push(`${row}: mã ${r.label} "${code}" không có trong danh mục`);
            lineDims[r.field] = code;
          } else if (dims[r.kind].size > 0) {
            // Chỉ bắt buộc khi đơn vị ĐÃ khai danh mục của chiều này (chưa khai thì chưa dùng chiều đó).
            const need = [l.debitAccount, l.creditAccount].find((acc) => accounts.get(acc)?.[r.flag]);
            if (need) problems.push(`${row}: tài khoản ${need} bắt buộc phải chọn ${r.label}`);
          }
        }
        if (l.cashflowCode) lineDims.cashflow = l.cashflowCode;

        const partnerId = partners.get(l.partnerCode || input.partnerCode || '') ?? null;
        const creditPartnerId = l.creditPartnerCode ? partners.get(l.creditPartnerCode) ?? null : partnerId;
        const description = l.description || input.description;
        const side = (accountCode: string, debit: number, credit: number, part: DraftLine['part'], taxCode: string | null): DraftLine => ({
          accountCode, debit, credit, pairNo, part, taxCode, description,
          partnerId: tracksPartner(accounts.get(accountCode)) ? (credit > 0 ? creditPartnerId : partnerId) : null,
          dims: lineDims,
        });
        pairNo += 1;
        lines.push(side(l.debitAccount, l.amount, 0, 'other', l.taxCode ?? null), side(l.creditAccount, 0, l.amount, 'other', l.taxCode ?? null));

        // Thuế GTGT của dòng.
        const taxAmount = l.taxAmount ?? 0;
        if (taxAmount > 0 && !l.taxCode) problems.push(`${row}: bạn chưa chọn loại thuế.`);
        if (l.taxCode) {
          const tax = taxCodes.get(l.taxCode);
          if (!tax) problems.push(`${row}: loại thuế "${l.taxCode}" không có trong danh mục`);
          else if (taxAmount > 0) {
            if (!tax.accountCode) problems.push(`${row}: loại thuế ${l.taxCode} chưa khai tài khoản thuế`);
            else {
              pairNo += 1;
              if (tax.direction === 'input') lines.push(side(tax.accountCode, taxAmount, 0, 'tax', l.taxCode), side(l.creditAccount, 0, taxAmount, 'tax', l.taxCode));
              else lines.push(side(l.debitAccount, taxAmount, 0, 'tax', l.taxCode), side(tax.accountCode, 0, taxAmount, 'tax', l.taxCode));
            }
          }
        }
      });
      if (problems.length) throw Errors.validation('Phiếu chưa hợp lệ', problems);
      return lines;
    },
    // Mỗi dòng có loại thuế và số hoá đơn là một hoá đơn trên bảng kê (đầu vào hoặc đầu ra theo loại thuế).
    taxInvoices({ taxCodes }) {
      return input.lines
        .filter((l) => l.taxCode && l.invoiceNo && taxCodes.has(l.taxCode))
        .map((l) => {
          const tax = taxCodes.get(l.taxCode!)!;
          return {
            direction: tax.direction === 'input' ? ('input' as const) : ('output' as const),
            invoiceNo: l.invoiceNo!,
            serial: l.invoiceSerial ?? '',
            form: l.invoiceForm ?? '',
            date: l.invoiceDate ?? input.docDate,
            partnerName: l.invoicePartnerName || input.counterparty || '',
            partnerTaxCode: l.invoicePartnerTaxCode ?? '',
            description: l.description || input.description,
            amount: l.amount,
            tax: l.taxAmount ?? 0,
            taxCode: tax.code,
            rate: tax.rate,
            reportGroup: tax.reportGroup,
          };
        });
    },
  };
}

/** Số dư đầu kỳ → chứng từ nhập tay: mỗi dòng một bên; chênh lệch (nếu có) đưa vào tài khoản cân đối. */
function fromOpening(input: OpeningInput): ManualDoc {
  const debit = input.lines.reduce((s, l) => s + toCents(l.debit), 0);
  const credit = input.lines.reduce((s, l) => s + toCents(l.credit), 0);
  return {
    docType: 'opening',
    branchCode: input.branchCode,
    docDate: input.docDate,
    docNo: input.docNo,
    description: input.description || 'Số dư đầu kỳ',
    total: fromCents(Math.max(debit, credit)),
    payload: input,
    partnerCodes: input.lines.map((l) => l.partnerCode ?? ''),
    buildLines({ accounts, partners }) {
      // Doanh thu, chi phí (loại 5–8) và 911 không có số dư đầu kỳ: lãi lỗ luỹ kế trước khi dùng phần mềm nhập vào 4212.
      const profitLoss = [...new Set([...input.lines.map((l) => l.accountCode), input.balancingAccount ?? ''].filter(isProfitLossAccount))];
      if (profitLoss.length) {
        throw Errors.validation(`Tài khoản ${profitLoss.join(', ')} là doanh thu, chi phí hoặc xác định kết quả, không có số dư đầu kỳ. Lãi, lỗ luỹ kế trước ngày bắt đầu dùng phần mềm nhập vào 4212 (lợi nhuận năm nay) hoặc 4211 (năm trước).`, profitLoss);
      }
      const diff = debit - credit;
      if (diff !== 0 && !input.balancingAccount) {
        throw Errors.validation(`Tổng Dư Nợ (${fromCents(debit)}) khác tổng Dư Có (${fromCents(credit)}), lệch ${fromCents(Math.abs(diff))}. Kiểm tra lại, hoặc nhập "Tài khoản cân đối" để ghi phần chênh lệch.`);
      }
      // Mỗi dòng một số cặp riêng: số dư đầu không có tài khoản đối ứng.
      const lines: DraftLine[] = input.lines.map((l, i) => ({
        accountCode: l.accountCode,
        debit: l.debit,
        credit: l.credit,
        pairNo: i + 1,
        part: 'other' as const,
        partnerId: tracksPartner(accounts.get(l.accountCode)) ? partners.get(l.partnerCode ?? '') ?? null : null,
        description: 'Số dư đầu kỳ',
      }));
      if (diff !== 0) {
        lines.push({ accountCode: input.balancingAccount!, debit: diff < 0 ? fromCents(-diff) : 0, credit: diff > 0 ? fromCents(diff) : 0, pairNo: lines.length + 1, part: 'other', description: 'Cân đối số dư đầu kỳ' });
      }
      return lines;
    },
  };
}

export const voucherService = {
  create: (auth: AuthContext, input: VoucherInput) => createManual(auth, fromVoucher(input)),
  createIn: (trx: Db, auth: AuthContext, input: VoucherInput) => createManualIn(trx, auth, fromVoucher(input)),
  update: (auth: AuthContext, id: string, input: VoucherInput) => updateManual(auth, id, fromVoucher(input)),
  createOpening: (auth: AuthContext, input: OpeningInput) => createManual(auth, fromOpening(input)),
  updateOpening: (auth: AuthContext, id: string, input: OpeningInput) => updateManual(auth, id, fromOpening(input)),
};
