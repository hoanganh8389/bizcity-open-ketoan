// @bizcity-layer D modules/ke-toan
// [2026-10-31 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — về phan-he/ke-toan/reports; documentChecks lấy từ Kernel qua kernel/public.ts
/**
 * Tính báo cáo từ số liệu repository.
 *
 * Quy tắc chung (giống sổ sách kế toán Việt Nam):
 *  - Số dư cuối một nhóm = Dư Nợ đầu + PS Nợ − Dư Có đầu − PS Có; dương → dư Nợ, âm → dư Có.
 *  - Tài khoản theo dõi đối tượng hoặc lưỡng tính: tính số dư TỪNG đối tượng rồi cộng
 *    (dư Nợ, dư Có tách riêng, không bù trừ giữa các đối tượng).
 *  - Tài khoản mẹ = tổng các tài khoản con (cuộn theo parent_code).
 */
import { fromCents, toCents } from '@ketoan/contracts';
import { db, toNumber } from '../../../db/client.js';
import { Errors } from '../../../core/errors.js';
import type { AuthContext } from '../../../core/auth.js';
import type { Account } from '../../../db/types.js';
import { accountRepository, documentChecks } from '../../../kernel/public.js';
import { reportRepository, type BalanceRow } from './report.repository.js';
import { incomeStatement } from './income-statement.js';
import { balanceSheet } from './balance-sheet.js';
import { assetService } from '../../../modules/assets/asset.service.js';
import { cashBalances, postingSummary, taxSummary, type PostingSummaryGroup } from './extra-reports.js';
import { cashFlow, cashJournal, purchaseJournal, salesJournal, voucherListing } from './journals.js';
import { aging, expenseByDimension, profitByContract, type ExpenseGroup, agingByDue, debtByTerm } from './control-reports.js';
import { debtByEmployee, debtByItem } from './debt-reports.js';

/** Một dòng của báo cáo thuế ra / thuế vào. */
export interface TaxReportRow { invoiceForm: string; invoiceSerial: string; invoiceNo: string; invoiceDate: string; docNo: string; docDate: string; docType: string; buyerName: string; buyerTaxCode: string; partnerCode: string; partnerName: string; branchCode: string; taxRate: number; amount: number; tax: number; sourceDocumentId: string }

export interface TrialBalanceRow {
  code: string;
  name: string;
  level: number;
  isPosting: boolean;
  openingDebit: number;
  openingCredit: number;
  debit: number;
  credit: number;
  closingDebit: number;
  closingCredit: number;
}

interface Cents {
  od: number;
  oc: number;
  d: number;
  c: number;
  cd: number;
  cc: number;
}

const zero = (): Cents => ({ od: 0, oc: 0, d: 0, c: 0, cd: 0, cc: 0 });
const add = (a: Cents, b: Cents) => {
  a.od += b.od; a.oc += b.oc; a.d += b.d; a.c += b.c; a.cd += b.cd; a.cc += b.cc;
};
const split = (net: number): [number, number] => (net >= 0 ? [net, 0] : [0, -net]);

export async function resolveScope(auth: AuthContext, branchCodes?: string[]) {
  let branchIds: string[] | null = null;
  if (branchCodes?.length) {
    const rows = await reportRepository.branchIds(db, auth.tenantId, branchCodes);
    branchIds = rows.map((r) => r.id);
    if (!branchIds.length) throw Errors.validation('Chi nhánh không tồn tại');
  }
  return { branchIds };
}

/** Giá trị partner_id của dòng số dư không gắn đối tượng (xem ledger_balances_daily). */
/** partner_id của số dư không theo đối tượng (ledger_balances_daily). */
const NO_PARTNER = '0';

const tracksPartner = (a: Account | undefined) => Boolean(a && (a.track_partner || a.is_debt || a.normal_side === 'both'));

/**
 * Cột của sổ quỹ chi tiết thu chi, theo tài khoản đối ứng của dòng tiền:
 *   thu: từ ngân hàng 112 | bán hàng 511 | công nợ 131, 331 | chi nhánh khác 136, 336 | khác
 *   chi: nộp ngân hàng 112 | mua hàng 15x | công nợ 131, 331 | chi nhánh khác 136, 336, 113 | khác
 */
export function cashColumnOf(direction: 'in' | 'out', counterAccounts: string): string {
  const acc = counterAccounts.split(',')[0]?.trim() ?? '';
  const starts = (...p: string[]) => p.some((x) => acc.startsWith(x));
  if (starts('112')) return direction === 'in' ? 'in_bank' : 'out_bank';
  if (direction === 'in') {
    if (starts('511')) return 'in_sales';
    if (starts('131', '331')) return 'in_debt';
    if (starts('136', '336')) return 'in_internal';
    return 'in_other';
  }
  if (starts('15')) return 'out_purchase';
  if (starts('131', '331')) return 'out_debt';
  if (starts('136', '336', '113')) return 'out_internal';
  return 'out_other';
}

export const reportService = {
  /** Bảng cân đối số phát sinh. */
  async trialBalance(auth: AuthContext, q: { from: string; to: string; branchCodes?: string[]; account?: string; postingOnly?: boolean }): Promise<{ rows: TrialBalanceRow[]; totals: Omit<TrialBalanceRow, 'code' | 'name' | 'level' | 'isPosting'> }> {
    const { branchIds } = await resolveScope(auth, q.branchCodes);
    const [raw, accounts] = await Promise.all([
      reportRepository.balances(db, { tenantId: auth.tenantId, from: q.from, to: q.to, branchIds, accountPrefix: q.account }),
      accountRepository.mapByCode(db, auth.tenantId),
    ]);

    // 1. Cộng theo tài khoản chi tiết; tài khoản theo dõi đối tượng thì tách dư theo từng đối tượng.
    const leaf = new Map<string, Cents>();
    for (const r of raw) {
      const acc = accounts.get(r.account_code);
      const opening = toCents(toNumber(r.opening));
      const d = toCents(toNumber(r.debit));
      const c = toCents(toNumber(r.credit));
      const [od, oc] = split(opening);
      const [cd, cc] = split(opening + d - c);
      const cur = leaf.get(r.account_code) ?? zero();
      if (tracksPartner(acc)) {
        add(cur, { od, oc, d, c, cd, cc });
      } else {
        // Không theo dõi đối tượng: cộng ròng, tách bên ở bước sau.
        cur.od += opening; cur.d += d; cur.c += c;
      }
      leaf.set(r.account_code, cur);
    }
    for (const [code, v] of leaf) {
      if (tracksPartner(accounts.get(code))) continue;
      const net = v.od;
      [v.od, v.oc] = split(net);
      [v.cd, v.cc] = split(net + v.d - v.c);
    }

    // 2. Cuộn lên tài khoản mẹ.
    const all = new Map<string, Cents>();
    for (const [code, v] of leaf) {
      let cur: string | null | undefined = code;
      const guard = new Set<string>();
      while (cur && !guard.has(cur)) {
        guard.add(cur);
        const acc = all.get(cur) ?? zero();
        add(acc, v);
        all.set(cur, acc);
        cur = accounts.get(cur)?.parent_code;
      }
    }

    const rows: TrialBalanceRow[] = [...all.entries()]
      .map(([code, v]) => {
        const a = accounts.get(code);
        return {
          code,
          name: a?.name ?? '(chưa khai báo)',
          level: a?.level ?? 1,
          isPosting: a?.is_posting ?? true,
          openingDebit: fromCents(v.od),
          openingCredit: fromCents(v.oc),
          debit: fromCents(v.d),
          credit: fromCents(v.c),
          closingDebit: fromCents(v.cd),
          closingCredit: fromCents(v.cc),
        };
      })
      .filter((r) => !q.postingOnly || r.isPosting)
      .filter((r) => r.openingDebit || r.openingCredit || r.debit || r.credit || r.closingDebit || r.closingCredit)
      .sort((a, b) => a.code.localeCompare(b.code));

    // Dòng tổng = tổng các tài khoản cấp 1.
    const totals = zero();
    for (const [code, v] of all) if (!accounts.get(code)?.parent_code) add(totals, v);
    return {
      rows,
      totals: {
        openingDebit: fromCents(totals.od),
        openingCredit: fromCents(totals.oc),
        debit: fromCents(totals.d),
        credit: fromCents(totals.c),
        closingDebit: fromCents(totals.cd),
        closingCredit: fromCents(totals.cc),
      },
    };
  },

  /**
   * Sổ của một tài khoản. Một hàm cho bốn loại sổ, khác nhau ở vài chi tiết:
   *   detail   Sổ chi tiết tài khoản: dư luỹ kế từng dòng, hiện khoản mục / bộ phận / hợp đồng.
   *   ledger   Sổ cái (mẫu S03b): không có dư luỹ kế; lọc được theo tài khoản đối ứng.
   *   partner  Sổ chi tiết công nợ: dư đầu, dư cuối tách theo từng đối tượng rồi cộng (hiện cả hai bên).
   *   cash     Sổ quỹ / tiền gửi: dư đầu là một con số; trong ngày dòng thu trước, dòng chi sau;
   *            mỗi dòng xếp vào một cột thu / chi theo tài khoản đối ứng.
   * Kiểu báo cáo (groupMode): 1 = từng dòng; 2 = gom theo chứng từ + tài khoản đối ứng; 3 = gom theo chứng từ.
   */
  async accountLedger(auth: AuthContext, q: { account: string; from: string; to: string; branchCodes?: string[]; partnerCode?: string; showCorrections?: boolean; kind?: 'detail' | 'ledger' | 'partner' | 'cash'; groupMode?: 1 | 2 | 3; counterAccount?: string; docType?: string; sku?: string }) {
    const kind = q.kind ?? 'detail';
    const sku = q.sku?.trim() || undefined;
    const { branchIds } = await resolveScope(auth, q.branchCodes);
    const acc = await accountRepository.findByCode(db, auth.tenantId, q.account);
    if (!acc) throw Errors.notFound(`tài khoản ${q.account}`);
    let partnerId: string | undefined;
    if (q.partnerCode) {
      const p = await db.selectFrom('partners').select('id').where('tenant_id', '=', auth.tenantId).where('code', '=', q.partnerCode).executeTakeFirst();
      if (!p) throw Errors.notFound(`đối tượng ${q.partnerCode}`);
      partnerId = p.id;
    }
    const scope = { tenantId: auth.tenantId, accountPrefix: q.account, branchIds, partnerId };
    const [openingRows, lines] = await Promise.all([
      // Lọc một mã hàng (vd 156 chi tiết theo mã): số dư đầu kỳ cũng chỉ của mã đó.
      sku ? reportRepository.openingBySku(db, { ...scope, from: q.from, sku }) : reportRepository.openingByPartner(db, { ...scope, from: q.from }),
      reportRepository.accountLines(db, {
        ...scope, from: q.from, to: q.to, showCorrections: q.showCorrections,
        counterPrefix: q.counterAccount?.trim() || undefined, docType: q.docType || undefined, cashOrder: kind === 'cash', sku,
      }),
    ]);

    // Dư đầu: sổ quỹ bù trừ thành một số; sổ khác theo đối tượng thì tách Nợ/Có từng đối tượng rồi cộng.
    let od = 0;
    let oc = 0;
    if (kind !== 'cash' && tracksPartner(acc)) {
      for (const r of openingRows) {
        const [d, c] = split(toCents(toNumber(r.net)));
        od += d; oc += c;
      }
    } else {
      [od, oc] = split(openingRows.reduce((s, r) => s + toCents(toNumber(r.net)), 0));
    }

    // Gom dòng theo kiểu báo cáo.
    type Row = (typeof lines)[number] & { d: number; c: number };
    const mode = q.groupMode ?? 1;
    const grouped: Row[] = [];
    const index = new Map<string, Row>();
    for (const l of lines) {
      const d = toCents(toNumber(l.debit));
      const c = toCents(toNumber(l.credit));
      if (mode === 1) { grouped.push({ ...l, d, c }); continue; }
      const key = mode === 2 ? `${l.entry_id}|${l.counter_accounts ?? ''}|${d ? 'N' : 'C'}` : l.entry_id;
      const cur = index.get(key);
      if (!cur) {
        const row: Row = { ...l, d, c, description: l.entry_description || l.description };
        index.set(key, row);
        grouped.push(row);
      } else {
        cur.d += d; cur.c += c;
        if (mode === 3) cur.counter_accounts = [...new Set([...(cur.counter_accounts ?? '').split(', '), ...(l.counter_accounts ?? '').split(', ')].filter(Boolean))].join(', ');
      }
    }

    let running = od - oc;
    let sumD = 0;
    let sumC = 0;
    const rows = grouped
      .filter((l) => l.d || l.c)
      .map((l) => {
        sumD += l.d; sumC += l.c;
        running += l.d - l.c;
        const [bd, bc] = split(running);
        const counter = l.counter_accounts ?? '';
        return {
          postingDate: l.posting_date,
          entryId: l.entry_id,
          entryNo: l.entry_no,
          docNo: l.doc_no,
          docType: l.doc_type,
          invoiceNo: l.invoice_no,
          sourceDocumentId: l.event_id,
          // Sổ quỹ, sổ công nợ: ưu tiên ghi chú của dòng đối ứng, trống thì diễn giải chứng từ.
          description: kind === 'cash' || kind === 'partner' ? (mode === 1 ? l.counter_note || l.entry_description || l.description : l.description) : l.description,
          accountCode: l.account_code,
          counterAccounts: counter,
          partnerCode: l.partner_code,
          partnerName: l.partner_name,
          productSku: l.product_sku ?? '',
          productName: l.product_name ?? '',
          branchCode: l.branch_code,
          reasonCode: l.reason_code,
          costItem: l.dims?.costItem ?? '',
          department: l.dims?.department ?? '',
          contract: l.dims?.contract ?? '',
          employee: l.dims?.employee ?? '',
          case: l.dims?.case ?? '',
          project: l.dims?.project ?? '',
          capitalSource: l.dims?.capitalSource ?? '',
          cashColumn: kind === 'cash' ? cashColumnOf(l.d > 0 ? 'in' : 'out', counter) : '',
          debit: fromCents(l.d),
          credit: fromCents(l.c),
          balanceDebit: fromCents(bd),
          balanceCredit: fromCents(bc),
        };
      });

    // Dư cuối: theo đối tượng thì tính từng đối tượng (dư đầu + phát sinh của đối tượng đó).
    let cd: number;
    let cc: number;
    if (kind !== 'cash' && tracksPartner(acc)) {
      const net = new Map<string, number>();
      for (const r of openingRows) { const pid = r.partner_id ?? NO_PARTNER; net.set(pid, (net.get(pid) ?? 0) + toCents(toNumber(r.net))); }
      for (const l of lines) {
        const pid = l.partner_id ?? NO_PARTNER;
        net.set(pid, (net.get(pid) ?? 0) + toCents(toNumber(l.debit)) - toCents(toNumber(l.credit)));
      }
      cd = 0; cc = 0;
      for (const v of net.values()) { const [x, y] = split(v); cd += x; cc += y; }
    } else {
      [cd, cc] = split(od - oc + sumD - sumC);
    }
    return {
      account: { code: acc.code, name: acc.name },
      kind,
      groupMode: mode,
      opening: { debit: fromCents(od), credit: fromCents(oc) },
      rows,
      totals: { debit: fromCents(sumD), credit: fromCents(sumC) },
      closing: { debit: fromCents(cd), credit: fromCents(cc) },
      truncated: false,
    };
  },

  /**
   * Báo cáo thuế ra (direction=output) / thuế vào (direction=input): bảng kê hoá đơn theo nhóm thuế suất.
   *
   * Nhóm thuế ra: 1. Không chịu thuế | 2. Thuế suất 0% | 3. Thuế suất 5% | 4. Thuế suất 10% (gồm cả 8%).
   * Nhóm thuế vào: 1. Dùng riêng cho SXKD chịu thuế, đủ điều kiện khấu trừ | 4. Không phải kê khai, tính nộp.
   * Loại thuế không thuộc nhóm nào (không kê khai ở bảng thuế ra) vẫn hiện ở đầu báo cáo, không cộng vào dòng tổng nhóm.
   * Thuế vào: các dòng cùng số hoá đơn, cùng người bán, cùng ngày, cùng thuế suất được gộp thành một dòng.
   * Thứ tự trong nhóm: ngày chứng từ, số hoá đơn, mã phiếu.
   */
  async salesInvoices(auth: AuthContext, q: { from: string; to: string; branchCodes?: string[]; direction?: 'output' | 'input' }) {
    const { branchIds } = await resolveScope(auth, q.branchCodes);
    const input = q.direction === 'input';
    const rows = await reportRepository.salesInvoiceLines(db, { tenantId: auth.tenantId, from: q.from, to: q.to, branchIds, direction: q.direction });
    const OUTPUT_GROUPS: Record<string, [string, string]> = {
      KCT: ['R-K', '1. Hàng hoá, dịch vụ không chịu thuế GTGT'],
      '0': ['R00', '2. Thuế suất 0%'],
      '5': ['R05', '3. Thuế suất 5%'],
      '8': ['R10', '4. Thuế suất 10%'],
      '10': ['R10', '4. Thuế suất 10%'],
    };
    const INPUT_GROUPS: Record<string, [string, string]> = {
      KCT: ['V01', '1. Hàng hoá, dịch vụ dùng riêng cho SXKD chịu thuế GTGT đủ điều kiện khấu trừ thuế'],
      '0': ['V01', '1. Hàng hoá, dịch vụ dùng riêng cho SXKD chịu thuế GTGT đủ điều kiện khấu trừ thuế'],
      '5': ['V01', '1. Hàng hoá, dịch vụ dùng riêng cho SXKD chịu thuế GTGT đủ điều kiện khấu trừ thuế'],
      '8': ['V01', '1. Hàng hoá, dịch vụ dùng riêng cho SXKD chịu thuế GTGT đủ điều kiện khấu trừ thuế'],
      '10': ['V01', '1. Hàng hoá, dịch vụ dùng riêng cho SXKD chịu thuế GTGT đủ điều kiện khấu trừ thuế'],
      KKK: ['V05', '4. Hàng hoá, dịch vụ không phải kê khai, tính nộp thuế GTGT'],
    };
    const map = input ? INPUT_GROUPS : OUTPUT_GROUPS;
    const groups = new Map<string, { group: string; label: string; rows: TaxReportRow[]; amount: number; tax: number; counted: boolean }>();
    const merged = new Map<string, TaxReportRow>();
    for (const r of rows) {
      const [group, label] = map[r.report_group] ?? ['', ''];
      const g = groups.get(group) ?? { group, label, rows: [], amount: 0, tax: 0, counted: group !== '' };
      groups.set(group, g);
      const row: TaxReportRow = {
        invoiceForm: r.invoice_form, invoiceSerial: r.invoice_serial, invoiceNo: r.invoice_no, invoiceDate: r.invoice_date,
        docNo: r.doc_no, docDate: r.doc_date, docType: r.doc_type, buyerName: r.buyer_name, buyerTaxCode: r.buyer_tax_code,
        partnerCode: r.partner_code ?? '', partnerName: r.partner_name ?? '', branchCode: r.branch_code,
        taxRate: toNumber(r.tax_rate), amount: toNumber(r.amount), tax: toNumber(r.tax), sourceDocumentId: r.event_id,
      };
      // Tiền hàng và tiền thuế trái dấu nhau thì đổi dấu tiền hàng.
      if (row.amount * row.tax < 0) row.amount = -row.amount;
      if (input) {
        const key = [group, row.docDate, row.invoiceDate, row.invoiceNo, row.branchCode, row.buyerTaxCode || row.buyerName, row.taxRate, row.invoiceForm, row.invoiceSerial].join('|');
        const prev = merged.get(key);
        if (prev) {
          prev.amount = fromCents(toCents(prev.amount) + toCents(row.amount));
          prev.tax = fromCents(toCents(prev.tax) + toCents(row.tax));
          if (row.docNo > prev.docNo) prev.docNo = row.docNo;
          continue;
        }
        merged.set(key, row);
      }
      g.rows.push(row);
    }
    for (const g of groups.values()) {
      g.amount = fromCents(g.rows.reduce((s, r) => s + toCents(r.amount), 0));
      g.tax = fromCents(g.rows.reduce((s, r) => s + toCents(r.tax), 0));
    }
    // Nhóm trống (loại thuế không thuộc nhóm nào) đứng đầu, rồi theo mã nhóm.
    const list = [...groups.values()].sort((a, b) => a.group.localeCompare(b.group));
    const counted = list.filter((g) => g.counted);
    return {
      groups: list,
      totals: {
        amount: fromCents(counted.reduce((s, g) => s + toCents(g.amount), 0)),
        tax: fromCents(counted.reduce((s, g) => s + toCents(g.tax), 0)),
        invoices: new Set(rows.map((r) => r.tax_invoice_id)).size,
      },
    };
  },

  /** Báo cáo kết quả hoạt động kinh doanh (B02-DN): kỳ này và cùng kỳ năm trước. */
  async incomeStatement(auth: AuthContext, q: { from: string; to: string; branchCodes?: string[] }) {
    const { branchIds } = await resolveScope(auth, q.branchCodes);
    return incomeStatement({ tenantId: auth.tenantId, from: q.from, to: q.to, branchIds });
  },

  /** Báo cáo tình hình tài chính (B01-DN): số cuối kỳ (hết "đến ngày") và số đầu kỳ (trước "từ ngày"). */
  async balanceSheet(auth: AuthContext, q: { from: string; to: string; branchCodes?: string[] }) {
    const { branchIds } = await resolveScope(auth, q.branchCodes);
    return balanceSheet({ tenantId: auth.tenantId, from: q.from, to: q.to, branchIds, prepaidSplit: (date) => assetService.prepaidSplit(db, auth.tenantId, date) });
  },

  /** Bảng tổng hợp thuế GTGT theo chi nhánh. */
  async taxSummary(auth: AuthContext, q: { from: string; to: string; branchCodes?: string[] }) {
    const { branchIds } = await resolveScope(auth, q.branchCodes);
    return taxSummary({ tenantId: auth.tenantId, from: q.from, to: q.to, branchIds });
  },

  /** Bảng kê số dư tiền theo chi nhánh và tài khoản tiền. */
  async cashBalances(auth: AuthContext, q: { from: string; to: string; branchCodes?: string[]; accounts?: string[] }) {
    const { branchIds } = await resolveScope(auth, q.branchCodes);
    return cashBalances({ tenantId: auth.tenantId, from: q.from, to: q.to, branchIds, prefixes: q.accounts?.length ? q.accounts : ['111', '112', '113'] });
  },

  /** Bảng tổng hợp chứng từ theo cặp tài khoản Nợ / Có. */
  async postingSummary(auth: AuthContext, q: { from: string; to: string; branchCodes?: string[]; docType?: string; groups?: PostingSummaryGroup[] }) {
    const { branchIds } = await resolveScope(auth, q.branchCodes);
    return postingSummary({ tenantId: auth.tenantId, from: q.from, to: q.to, branchIds, docType: q.docType || undefined, groups: q.groups ?? [] });
  },

  /** Sổ nhật ký thu tiền (direction=in) / chi tiền (direction=out), mẫu S03a1. */
  async cashJournal(auth: AuthContext, q: { from: string; to: string; branchCodes?: string[]; account: string; direction: 'in' | 'out'; columns?: string[] }) {
    const { branchIds } = await resolveScope(auth, q.branchCodes);
    return cashJournal({ tenantId: auth.tenantId, from: q.from, to: q.to, branchIds, accountPrefix: q.account, direction: q.direction, columns: q.columns ?? [] });
  },

  /** Sổ nhật ký bán hàng. */
  async purchaseJournal(auth: AuthContext, q: { from: string; to: string; branchCodes?: string[]; partnerCode?: string }) {
    const { branchIds } = await resolveScope(auth, q.branchCodes);
    return purchaseJournal({ tenantId: auth.tenantId, from: q.from, to: q.to, branchIds, partnerCode: q.partnerCode?.trim() || undefined });
  },

  async salesJournal(auth: AuthContext, q: { from: string; to: string; branchCodes?: string[]; partnerCode?: string; account?: string; productSkus?: string }) {
    const { branchIds } = await resolveScope(auth, q.branchCodes);
    const productSkus = q.productSkus?.split(',').map((s) => s.trim()).filter(Boolean);
    return salesJournal({ tenantId: auth.tenantId, from: q.from, to: q.to, branchIds, partnerCode: q.partnerCode?.trim() || undefined, account: q.account?.trim() || undefined, productSkus });
  },

  /** Bảng kê chi tiết chứng từ (mỗi cặp Nợ / Có một dòng). */
  async voucherListing(auth: AuthContext, q: { from: string; to: string; branchCodes?: string[]; account?: string; docType?: string; page: number; pageSize: number }) {
    const { branchIds } = await resolveScope(auth, q.branchCodes);
    return voucherListing({ tenantId: auth.tenantId, from: q.from, to: q.to, branchIds, accountPrefix: q.account?.trim() || undefined, docType: q.docType || undefined, page: q.page, pageSize: q.pageSize });
  },

  /** Báo cáo lưu chuyển tiền tệ (trực tiếp). */
  async cashFlow(auth: AuthContext, q: { from: string; to: string; branchCodes?: string[] }) {
    const { branchIds } = await resolveScope(auth, q.branchCodes);
    return cashFlow({ tenantId: auth.tenantId, from: q.from, to: q.to, branchIds });
  },

  /** Chi phí theo khoản mục, bộ phận, hợp đồng. */
  async expenseByDimension(auth: AuthContext, q: { from: string; to: string; branchCodes?: string[]; account: string; groupBy: ExpenseGroup[] }) {
    const { branchIds } = await resolveScope(auth, q.branchCodes);
    return expenseByDimension({ tenantId: auth.tenantId, from: q.from, to: q.to, branchIds, accountPrefix: q.account, groupBy: q.groupBy });
  },

  /** Lãi lỗ theo hợp đồng (ACC70 tổng hợp, ACC71 chi tiết theo tài khoản). */
  async profitByContract(auth: AuthContext, q: { from: string; to: string; branchCodes?: string[]; detail?: boolean; contract?: string }) {
    const { branchIds } = await resolveScope(auth, q.branchCodes);
    return profitByContract({ tenantId: auth.tenantId, from: q.from, to: q.to, branchIds, detail: Boolean(q.detail), contract: q.contract || undefined });
  },

  /** Công nợ theo nhân viên phụ trách (ACC48). */
  async debtByEmployee(auth: AuthContext, q: { from: string; to: string; branchCodes?: string[]; account: string; employee?: string }) {
    const { branchIds } = await resolveScope(auth, q.branchCodes);
    return debtByEmployee({ tenantId: auth.tenantId, from: q.from, to: q.to, branchIds, accountPrefix: q.account, employee: q.employee });
  },

  /** Công nợ theo mặt hàng (ACC68). */
  async debtByItem(auth: AuthContext, q: { from: string; to: string; branchCodes?: string[]; account: string; partnerCode?: string }) {
    const { branchIds } = await resolveScope(auth, q.branchCodes);
    return debtByItem({ tenantId: auth.tenantId, from: q.from, to: q.to, branchIds, accountPrefix: q.account, partnerCode: q.partnerCode });
  },

  /** Công nợ theo tuổi nợ tại một ngày. */
  async aging(auth: AuthContext, q: { asOf: string; account: string; step: number; branchCodes?: string[] }) {
    const { branchIds } = await resolveScope(auth, q.branchCodes);
    return aging({ tenantId: auth.tenantId, asOf: q.asOf, branchIds, accountPrefix: q.account, step: q.step });
  },

  /** Công nợ theo tuổi nợ tính theo hạn thanh toán của từng khoản (ACC67, ACC67A, ACC67B). */
  async agingByDue(auth: AuthContext, q: { asOf: string; account: string; step: number; branchCodes?: string[]; partnerCode?: string; groupCode?: string }) {
    const { branchIds } = await resolveScope(auth, q.branchCodes);
    return agingByDue({ tenantId: auth.tenantId, asOf: q.asOf, branchIds, accountPrefix: q.account, step: q.step, partnerCode: q.partnerCode || undefined, groupCode: q.groupCode || undefined });
  },

  /** Sổ công nợ theo hạn thanh toán (ACC39). */
  async debtByTerm(auth: AuthContext, q: { from: string; to: string; account: string; branchCodes?: string[]; partnerCode?: string; groupCode?: string }) {
    const { branchIds } = await resolveScope(auth, q.branchCodes);
    return debtByTerm({ tenantId: auth.tenantId, from: q.from, to: q.to, branchIds, accountPrefix: q.account, partnerCode: q.partnerCode || undefined, groupCode: q.groupCode || undefined });
  },

  /** Kiểm tra chứng từ, hoá đơn: các trường hợp dễ làm lệch số khi đối chiếu. */
  async documentChecks(auth: AuthContext, q: { from: string; to: string; branchCodes?: string[] }) {
    const { branchIds } = await resolveScope(auth, q.branchCodes);
    return documentChecks({ tenantId: auth.tenantId, from: q.from, to: q.to, branchIds });
  },

  /** Sổ nhật ký chung: từng dòng Nợ / Có theo trình tự thời gian (phân trang); tổng tính trên toàn bộ kết quả lọc. */
  /**
   * Sổ nhật ký chung (S03a). Kiểu báo cáo (groupMode):
   *   1 = theo chi tiết chứng từ: từng dòng sổ cái (mỗi mặt hàng một dòng tiền hàng, thuế, giá vốn);
   *   2 = theo chứng từ + tài khoản đối ứng: cộng các dòng cùng chứng từ, tài khoản, TK đối ứng, bên Nợ/Có;
   *   3 = theo chứng từ: cộng các dòng cùng chứng từ, tài khoản, bên Nợ/Có (TK đối ứng nối lại).
   * Kiểu 2, 3 gom trên toàn kỳ rồi mới chia trang.
   */
  async journal(auth: AuthContext, q: { from: string; to: string; branchCodes?: string[]; docType?: string; search?: string; showCorrections?: boolean; corrections?: 'hide' | 'all' | 'only'; account?: string; counterAccount?: string; sku?: string; groupMode?: 1 | 2 | 3; page: number; pageSize: number }) {
    const { branchIds } = await resolveScope(auth, q.branchCodes);
    const mode = q.groupMode ?? 1;
    const { rows, totals } = await reportRepository.journal(db, {
      tenantId: auth.tenantId, from: q.from, to: q.to, branchIds, docType: q.docType, search: q.search?.trim() || undefined,
      showCorrections: q.showCorrections, corrections: q.corrections, accountPrefix: q.account?.trim() || undefined, counterPrefix: q.counterAccount?.trim() || undefined, sku: q.sku?.trim() || undefined,
      limit: mode === 1 ? q.pageSize : 1_000_000, offset: mode === 1 ? (q.page - 1) * q.pageSize : 0,
    });
    const mapped = rows.map((r) => ({
      id: r.id,
      entryId: r.entry_id,
      postingDate: r.posting_date,
      docDate: r.doc_date,
      entryNo: r.entry_no,
      docNo: r.doc_no,
      docType: r.doc_type,
      invoiceNo: r.invoice_no,
      reasonCode: r.reason_code,
      sourceType: r.source_type,
      description: r.description,
      accountCode: r.account_code,
      counterAccounts: r.counter_accounts ?? '',
      debit: toNumber(r.debit),
      credit: toNumber(r.credit),
      partnerCode: r.partner_code,
      partnerName: r.partner_name,
      productSku: r.product_sku,
      productName: r.product_name,
      branchCode: r.branch_code,
      isReversal: r.is_reversal,
      entryStatus: r.entry_status,
      entryDescription: r.entry_description,
    }));
    type JRow = (typeof mapped)[number];
    let out: JRow[] = mapped;
    let total = Number(totals.n);
    if (mode !== 1) {
      const index = new Map<string, JRow & { d: number; c: number }>();
      const grouped: (JRow & { d: number; c: number })[] = [];
      for (const r of mapped) {
        const side = r.debit !== 0 ? 'N' : 'C';
        const key = mode === 2 ? `${r.entryId}|${r.accountCode}|${r.counterAccounts}|${side}` : `${r.entryId}|${r.accountCode}|${side}`;
        const cur = index.get(key);
        if (!cur) {
          const g = { ...r, description: r.entryDescription || r.description, d: toCents(r.debit), c: toCents(r.credit) };
          index.set(key, g);
          grouped.push(g);
          continue;
        }
        cur.d += toCents(r.debit);
        cur.c += toCents(r.credit);
        if (cur.productSku !== r.productSku) { cur.productSku = null; cur.productName = null; }
        if (cur.partnerCode !== r.partnerCode) { cur.partnerCode = null; cur.partnerName = null; }
        if (mode === 3 && r.counterAccounts) {
          cur.counterAccounts = [...new Set([...cur.counterAccounts.split(', '), ...r.counterAccounts.split(', ')].filter(Boolean))].join(', ');
        }
      }
      const all = grouped.filter((g) => g.d || g.c).map(({ d, c, ...g }) => ({ ...g, debit: fromCents(d), credit: fromCents(c) }));
      total = all.length;
      out = all.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
    }
    return {
      groupMode: mode,
      rows: out.map(({ entryDescription: _e, ...r }) => r),
      totals: { lines: Number(totals.n), entries: Number(totals.entries), debit: toNumber(totals.debit), credit: toNumber(totals.credit) },
      total,
    };
  },

  /**
   * Sổ tổng hợp công nợ phát sinh theo đối tượng.
   *   account   một tài khoản (gồm tài khoản con); bỏ trống = mọi tài khoản theo dõi đối tượng
   *   byBranch  tách thêm theo chi nhánh
   * Mỗi (tài khoản, đối tượng[, chi nhánh]) một dòng: dư đầu, phát sinh, dư cuối; dư Nợ / dư Có của từng
   * đối tượng bù trừ thành một bên, không bù trừ giữa các đối tượng. Kèm dòng cộng theo tài khoản.
   */
  async partnerBalances(auth: AuthContext, q: { account?: string; from: string; to: string; branchCodes?: string[]; hideZero?: boolean; byBranch?: boolean }) {
    const { branchIds } = await resolveScope(auth, q.branchCodes);
    const accounts = await accountRepository.mapByCode(db, auth.tenantId);
    const tracked = q.account ? undefined : [...accounts.values()].filter((a) => tracksPartner(a)).map((a) => a.code);
    const raw = await reportRepository.balances(db, { tenantId: auth.tenantId, from: q.from, to: q.to, branchIds, accountPrefix: q.account || undefined, accountCodes: tracked, byBranch: q.byBranch });

    // Một tài khoản: gộp các tài khoản con lại (như trước); mọi tài khoản: giữ từng tài khoản.
    const keyOf = (r: BalanceRow) => `${q.account ? q.account : r.account_code}|${r.partner_id}|${r.branch_id ?? ''}`;
    const byKey = new Map<string, { account: string; partnerId: string; branchId: string; opening: number; d: number; c: number }>();
    for (const r of raw) {
      const k = keyOf(r);
      const cur = byKey.get(k) ?? { account: q.account ? q.account : r.account_code, partnerId: r.partner_id, branchId: r.branch_id ?? '', opening: 0, d: 0, c: 0 };
      cur.opening += toCents(toNumber(r.opening));
      cur.d += toCents(toNumber(r.debit));
      cur.c += toCents(toNumber(r.credit));
      byKey.set(k, cur);
    }
    const ids = [...new Set([...byKey.values()].map((v) => v.partnerId).filter((id) => id !== NO_PARTNER))];
    const partners = ids.length
      ? await db.selectFrom('partners as p').leftJoin('partner_groups as g', (j) => j.onRef('g.tenant_id', '=', 'p.tenant_id').onRef('g.code', '=', 'p.group_code'))
          .select(['p.id', 'p.code', 'p.name', 'p.tax_code', 'p.group_code', 'g.name as group_name']).where('p.tenant_id', '=', auth.tenantId).where('p.id', 'in', ids).execute()
      : [];
    const info = new Map(partners.map((p) => [p.id, p]));
    const branchRows = q.byBranch ? await db.selectFrom('branches').select(['id', 'code']).where('tenant_id', '=', auth.tenantId).execute() : [];
    const branchCode = new Map(branchRows.map((b) => [b.id, b.code]));

    const totals = zero();
    const perAccount = new Map<string, Cents>();
    const rows = [...byKey.values()]
      .map((v) => {
        const [od, oc] = split(v.opening);
        const [cd, cc] = split(v.opening + v.d - v.c);
        const p = info.get(v.partnerId);
        return { v, cents: { od, oc, d: v.d, c: v.c, cd, cc }, partnerCode: p?.code ?? '', partnerName: p?.name ?? '(không theo dõi đối tượng)', taxCode: p?.tax_code ?? '', groupCode: p?.group_code ?? '', groupName: p?.group_name ?? '' };
      })
      .filter((r) => !q.hideZero || r.cents.cd || r.cents.cc)
      .filter((r) => r.cents.od || r.cents.oc || r.cents.d || r.cents.c)
      .sort((a, b) => a.v.account.localeCompare(b.v.account) || a.partnerCode.localeCompare(b.partnerCode) || a.v.branchId.localeCompare(b.v.branchId))
      .map((r) => {
        add(totals, r.cents);
        const acc = perAccount.get(r.v.account) ?? zero();
        add(acc, r.cents);
        perAccount.set(r.v.account, acc);
        return {
          accountCode: r.v.account,
          branchCode: r.v.branchId ? branchCode.get(r.v.branchId) ?? '' : '',
          partnerCode: r.partnerCode,
          partnerName: r.partnerName,
          taxCode: r.taxCode,
          groupCode: r.groupCode,
          groupName: r.groupName,
          openingDebit: fromCents(r.cents.od),
          openingCredit: fromCents(r.cents.oc),
          debit: fromCents(r.cents.d),
          credit: fromCents(r.cents.c),
          closingDebit: fromCents(r.cents.cd),
          closingCredit: fromCents(r.cents.cc),
        };
      });
    const out = (c: Cents) => ({ openingDebit: fromCents(c.od), openingCredit: fromCents(c.oc), debit: fromCents(c.d), credit: fromCents(c.c), closingDebit: fromCents(c.cd), closingCredit: fromCents(c.cc) });
    return {
      account: q.account ?? '',
      rows,
      accounts: [...perAccount.entries()].map(([code, c]) => ({ accountCode: code, accountName: accounts.get(code)?.name ?? '', ...out(c) })),
      totals: out(totals),
    };
  },

  /** Số liệu trang tổng quan. */
  async dashboard(auth: AuthContext, q: { from: string; to: string }) {
    const [daily, statuses] = await Promise.all([
      reportRepository.dailyRevenue(db, { tenantId: auth.tenantId, from: q.from, to: q.to }),
      db.selectFrom('accounting_events').select(['status', (eb) => eb.fn.countAll<string>().as('n')]).where('tenant_id', '=', auth.tenantId).groupBy('status').execute(),
    ]);
    const days = daily.map((d) => ({ day: d.day, revenue: toNumber(d.revenue), returns: toNumber(d.returns), tax: toNumber(d.tax), cashIn: toNumber(d.cash_in) }));
    const sum = (k: 'revenue' | 'returns' | 'tax' | 'cashIn') => fromCents(days.reduce((s, d) => s + toCents(d[k]), 0));
    return {
      days,
      totals: { revenue: sum('revenue'), returns: sum('returns'), tax: sum('tax'), cashIn: sum('cashIn') },
      documents: Object.fromEntries(statuses.map((s) => [s.status, Number(s.n)])),
    };
  },
};
