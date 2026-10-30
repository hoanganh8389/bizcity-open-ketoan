// @bizcity-layer K kernel/ledger
/**
 * Màn Chứng từ kế toán (Tiện ích) — làm lại CtrlLedger của HTsoft. Một màn, bốn chế độ như bốn thủ tục HTsoft:
 *
 *   all          ACC3   Chứng từ kế toán                       acc_LoadLedgerListbyListCT
 *   unlinked     ACC3A  CT kế toán bị mất liên kết phiếu gốc    acc_LoadLedgerListDeletebizmanbyListCT
 *   unbalanced   ACC3B  CT kế toán lệch giữa thân và chi tiết   acc_LoadLedgerListCheckLechbyListCT
 *   source-diff  ACC3C  CT kế toán lệch so với phiếu gốc        acc_LoadLedgerListANDbizmanbyListCT
 *
 * HTsoft có MỘT chứng từ kế toán (LID) cho mỗi phiếu gốc; ở đây một phiếu gốc có thể nhiều bút toán (bán hàng + thu tiền,
 * chuyển tiền hai đầu…), nên mỗi dòng của màn = một phiếu gốc, cộng các bút toán ĐANG HIỆU LỰC của nó (bỏ bút toán đã đảo và
 * bút toán đảo — hai cái triệt tiêu nhau); bút toán không có phiếu gốc thì đứng một dòng riêng. Lọc như HTsoft: từ / đến ngày
 * chứng từ, số chứng từ, đầu số tài khoản (có dòng vào tài khoản đó), loại chứng từ, chi nhánh.
 *
 * Cột như HTsoft (LoadLedgerListInfo): Năm, Ngày chứng từ, Ngày ghi sổ, Số chứng từ, Tổng tiền trên phiếu, Ngân hàng, Diễn giải,
 * Chi nhánh lập, Tổng nợ, Tổng có, Chênh lệch, Tiền kho, UserID, Lý do, Kiểu (loại chứng từ), Số VAT.
 *   Tổng tiền trên phiếu  tổng tiền của phiếu gốc; không có phiếu gốc thì tổng tiền bút toán
 *   Tổng nợ / Tổng có     cộng các dòng
 *   Tiền kho              tiền giá vốn / kho (dòng phần giá vốn)
 *   Chênh lệch            ACC3B: tổng tiền thân − tổng nợ (hoặc nợ − có); ACC3C: tổng tiền phiếu gốc − giá trị phiếu trên sổ;
 *                         chế độ khác: tổng nợ − tổng có
 * Giá trị phiếu trên sổ (ACC3C): có dòng hàng / thuế thì tiền hàng + thuế; không có thì số tiền của MỘT bút toán (phiếu thu chi,
 * chuyển tiền hai đầu mỗi đầu đủ số tiền). Dòng thu tiền của phiếu bán không tính (đã nằm trong tổng phiếu).
 * Bỏ định khoản (nút Xoá): documentService.unpost theo phiếu gốc.
 */
import { DOC_TYPE_LABELS, fromCents, toCents } from '@ketoan/contracts';
import { sql } from 'kysely';
import { db, toNumber } from '../../db/client.js';
import type { AuthContext } from '../../core/auth.js';
import { Errors } from '../../core/errors.js';

export const VOUCHER_MODES = ['all', 'unlinked', 'unbalanced', 'source-diff'] as const;
export type VoucherMode = (typeof VOUCHER_MODES)[number];

/** Loại chứng từ không có "tổng tiền phiếu" để so (số lượng hàng, hệ thống tự tính): không kiểm ở ACC3C. */
const NO_SOURCE_AMOUNT = ['transfer', 'stock_adjustment', 'cogs', 'closing', 'depreciation', 'opening'];
/** Trả tối đa từng ấy dòng (HTsoft nạp hết; khoảng ngày rộng có thể rất nhiều phiếu bán lẻ). */
export const VOUCHER_LIMIT = 20000;
/** Đọc tối đa từng ấy bút toán một lần (một phiếu bán hai bút toán). */
const ENTRY_LIMIT = 50000;

export interface VoucherQuery {
  mode: VoucherMode;
  from: string;
  to: string;
  branchCodes?: string[];
  docNo?: string;
  account?: string;
  docType?: string;
}

/** Một dòng của màn Chứng từ kế toán = một phiếu gốc (hoặc một bút toán không có phiếu gốc). */
export interface VoucherRow {
  /** Khoá dòng: id phiếu gốc, hoặc "e<id bút toán>". */
  key: string;
  /** Các bút toán đang hiệu lực của dòng (lưới chi tiết hạch toán đọc từng bút toán). */
  entryIds: string[];
  entryNos: string;
  year: number; docDate: string; postingDate: string; docNo: string; invoiceNo: string | null;
  docType: string; docTypeLabel: string; description: string; branchCode: string; branchName: string; reasonCode: string | null; bank: string;
  createdBy: string; docTotal: number; totalDebit: number; totalCredit: number; stockValue: number; diff: number;
  sourceDocumentId: string | null; sourceStatus: string | null; sourceVersion: number | null; sourceSystem: string | null;
  /** Tình trạng phiếu gốc (ACC3A); rỗng = bình thường. */
  linkProblem: string;
  /** Bỏ định khoản được (chứng từ từ hệ thống nguồn, chưa huỷ). */
  canUnpost: boolean;
}

interface EntryRow {
  id: string; entry_no: string; doc_date: string; posting_date: string; doc_no: string; invoice_no: string | null; doc_type: string;
  description: string; reason_code: string | null; created_by: string; total: string; event_id: string | null; event_version: number | null;
  branch_code: string; branch_name: string; d: string; c: string; gt_d: string | null; gt_n: string; doc_d: string | null; stock: string; bank: string | null;
  ev_total: string | null; ev_status: string | null; ev_version: number | null; ev_posted_version: number | null;
  ev_source: string | null; ev_cancel_requested: boolean | null;
}

/** Tình trạng phiếu gốc của một bút toán (ACC3A): rỗng = còn liên kết bình thường. */
function linkProblem(r: EntryRow): string {
  if (!r.event_id) return 'Không có phiếu gốc';
  if (r.ev_status === null) return 'Phiếu gốc không còn';
  if (r.ev_status === 'cancelled') return 'Phiếu gốc đã huỷ';
  if (r.ev_cancel_requested) return 'Nguồn báo xoá phiếu gốc (chờ huỷ)';
  if (r.ev_posted_version !== null && r.event_version !== null && r.event_version !== r.ev_posted_version) return `Bút toán của phiên bản cũ (v${r.event_version}, đã định khoản v${r.ev_posted_version})`;
  return '';
}

export async function listVouchers(auth: AuthContext, q: VoucherQuery) {
  if (q.from > q.to) throw Errors.validation('Từ ngày phải trước đến ngày');
  const branchFilter = q.branchCodes?.length ? sql`AND br.code = ANY(${q.branchCodes}::text[])` : sql``;
  const docTypeFilter = q.docType ? sql`AND e.doc_type = ${q.docType}` : sql``;
  const search = q.docNo?.trim();
  const account = q.account?.trim();
  // Số chứng từ / tài khoản xét trên CẢ chứng từ (như HTsoft: một chứng từ một dòng): một bút toán của phiếu khớp thì lấy mọi
  // bút toán đang hiệu lực của phiếu — lọc TK 1111 ra phiếu bán thì vẫn đủ bút toán bán hàng + thu tiền.
  const matchOne = sql`(
    ${search ? sql`(m.doc_no ILIKE ${`%${search}%`} OR m.entry_no = ${search} OR m.invoice_no = ${search})` : sql`true`}
    AND ${account ? sql`EXISTS (SELECT 1 FROM ledger_lines a WHERE a.entry_id = m.id AND a.account_code LIKE ${`${account}%`})` : sql`true`})`;
  const docFilter = search || account
    ? sql`AND EXISTS (SELECT 1 FROM ledger_entries m
                       WHERE m.tenant_id = e.tenant_id AND m.status = 'posted' AND NOT m.is_reversal
                         AND (m.id = e.id OR (e.event_id IS NOT NULL AND m.event_id = e.event_id)) AND ${matchOne})`
    : sql``;
  const res = await sql<EntryRow>`
    SELECT e.id::text AS id, e.entry_no, e.doc_date::text AS doc_date, e.posting_date::text AS posting_date, e.doc_no, e.invoice_no, e.doc_type,
           e.description, e.reason_code, e.created_by, e.total, e.event_id::text AS event_id, e.event_version,
           br.code AS branch_code, br.name AS branch_name, s.d, s.c, s.gt_d, s.gt_n, s.doc_d, s.stock,
           (SELECT string_agg(DISTINCT ba.code, ', ' ORDER BY ba.code) FROM ledger_lines lb
              JOIN bank_accounts ba ON ba.tenant_id = lb.tenant_id AND ba.account_code = lb.account_code
             WHERE lb.entry_id = e.id) AS bank,
           ev.total AS ev_total, ev.status AS ev_status, ev.version AS ev_version, ev.posted_version AS ev_posted_version,
           ev.source_system AS ev_source, (ev.cancel_requested_at IS NOT NULL) AS ev_cancel_requested
      FROM ledger_entries e
      JOIN branches br ON br.id = e.branch_id
      JOIN LATERAL (
        SELECT SUM(l.debit) AS d, SUM(l.credit) AS c,
               SUM(l.debit) FILTER (WHERE l.part IN ('goods', 'tax')) AS gt_d,
               COUNT(*) FILTER (WHERE l.part IN ('goods', 'tax')) AS gt_n,
               SUM(l.debit) FILTER (WHERE l.part NOT IN ('payment', 'cogs')) AS doc_d,
               COALESCE(SUM(l.debit) FILTER (WHERE l.part = 'cogs'), 0) AS stock
          FROM ledger_lines l WHERE l.entry_id = e.id
      ) s ON true
      LEFT JOIN accounting_events ev ON ev.id = e.event_id
     WHERE e.tenant_id = ${auth.tenantId} AND e.status = 'posted' AND NOT e.is_reversal
       AND e.doc_date BETWEEN ${q.from}::date AND ${q.to}::date
       ${branchFilter} ${docTypeFilter} ${docFilter}
     ORDER BY e.doc_date, e.doc_no, e.id
     LIMIT ${ENTRY_LIMIT + 1}`.execute(db);
  // Khoảng ngày rộng: không đọc quá ENTRY_LIMIT bút toán (bỏ nhóm cuối có thể thiếu bút toán).
  const entriesTruncated = res.rows.length > ENTRY_LIMIT;
  if (entriesTruncated) {
    const lastKey = res.rows[ENTRY_LIMIT - 1]!.event_id ?? `e${res.rows[ENTRY_LIMIT - 1]!.id}`;
    res.rows.splice(ENTRY_LIMIT);
    while (res.rows.length && (res.rows.at(-1)!.event_id ?? `e${res.rows.at(-1)!.id}`) === lastKey) res.rows.pop();
  }

  // Gom bút toán theo phiếu gốc.
  const groups = new Map<string, EntryRow[]>();
  for (const r of res.rows) {
    const key = r.event_id ?? `e${r.id}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const rows: VoucherRow[] = [];
  for (const [key, list] of groups) {
    const head = list[0]!;
    const cents = (v: string | null) => toCents(toNumber(v));
    const debit = list.reduce((t, r) => t + cents(r.d), 0);
    const credit = list.reduce((t, r) => t + cents(r.c), 0);
    const entryTotal = list.reduce((t, r) => t + cents(r.total), 0);
    const docTotal = head.ev_total === null ? entryTotal : cents(head.ev_total);
    const problem = list.map(linkProblem).find(Boolean) ?? '';
    let diff = debit - credit;
    if (q.mode === 'unlinked' && !problem) continue;
    if (q.mode === 'unbalanced') {
      diff = entryTotal !== debit ? entryTotal - debit : debit - credit;
      if (!diff) continue;
    }
    if (q.mode === 'source-diff') {
      if (!head.event_id || head.ev_total === null || NO_SOURCE_AMOUNT.includes(head.doc_type)) continue;
      const hasGoods = list.some((r) => Number(r.gt_n) > 0);
      const ledgerValue = hasGoods
        ? list.reduce((t, r) => t + cents(r.gt_d), 0)
        : Math.max(...list.map((r) => (cents(r.doc_d) > 0 ? cents(r.doc_d) : cents(r.d))));
      diff = docTotal - ledgerValue;
      if (!diff) continue;
    }
    const banks = [...new Set(list.flatMap((r) => (r.bank ? r.bank.split(', ') : [])))].sort();
    rows.push({
      key, entryIds: list.map((r) => r.id), entryNos: list.map((r) => r.entry_no).join(', '),
      year: Number(head.doc_date.slice(0, 4)), docDate: head.doc_date, postingDate: head.posting_date, docNo: head.doc_no,
      invoiceNo: head.invoice_no, docType: head.doc_type, docTypeLabel: DOC_TYPE_LABELS[head.doc_type as keyof typeof DOC_TYPE_LABELS] ?? head.doc_type,
      description: head.description, branchCode: head.branch_code, branchName: head.branch_name, reasonCode: head.reason_code, bank: banks.join(', '),
      createdBy: head.created_by, docTotal: fromCents(docTotal), totalDebit: fromCents(debit), totalCredit: fromCents(credit),
      stockValue: fromCents(list.reduce((t, r) => t + cents(r.stock), 0)), diff: fromCents(diff),
      sourceDocumentId: head.event_id, sourceStatus: head.ev_status, sourceVersion: head.ev_version, sourceSystem: head.ev_source, linkProblem: problem,
      canUnpost: Boolean(head.event_id && head.ev_source && head.ev_source !== 'manual' && head.ev_status !== 'cancelled'),
    });
    if (rows.length >= VOUCHER_LIMIT) break;
  }
  const sum = (k: 'docTotal' | 'totalDebit' | 'totalCredit' | 'stockValue' | 'diff') => fromCents(rows.reduce((t, x) => t + toCents(x[k]), 0));
  return {
    mode: q.mode, rows, truncated: entriesTruncated || rows.length >= VOUCHER_LIMIT,
    totals: { docTotal: sum('docTotal'), totalDebit: sum('totalDebit'), totalCredit: sum('totalCredit'), stockValue: sum('stockValue'), diff: sum('diff') },
  };
}
