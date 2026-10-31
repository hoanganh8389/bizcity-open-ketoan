// @bizcity-layer D modules/ke-toan
// [2026-10-31 08:24 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — ledger.query (PHASES 3.7): đọc sổ qua khung nhìn bizcity_read.* thay bảng ledger_* (SC-KERNEL-7)
/**
 * Các sổ nhật ký và bảng kê đọc thẳng sổ cái:
 *   - cashJournal     Sổ nhật ký thu tiền / chi tiền (mẫu S03a1): mỗi dòng tiền xếp vào cột tài khoản đối ứng
 *   - salesJournal    Sổ nhật ký bán hàng: doanh thu theo chứng từ, chia cột hàng hoá / thành phẩm / dịch vụ / khác
 *   - purchaseJournal Sổ nhật ký mua hàng: hàng mua chịu theo chứng từ, chia cột hàng hoá / nguyên liệu / công cụ / khác
 *   - voucherListing  Bảng kê chi tiết chứng từ: mỗi cặp Nợ / Có một dòng hai vế
 *   - cashFlow        Báo cáo lưu chuyển tiền tệ (B03-DN, phương pháp trực tiếp)
 *
 * Cặp đối ứng: dòng cùng bút toán, cùng pair_no, khác bên. Chỉ lấy bút toán đang hiệu lực (bỏ bút toán gốc
 * đã sửa và bút toán ghi số âm của nó — hai bút toán này triệt tiêu nhau).
 */
import { fromCents, toCents } from '@ketoan/contracts';
import { sql } from 'kysely';
import { db, toNumber } from '../../../db/client.js';
import { Errors } from '../../../core/errors.js';
import { otherSide } from '../../../kernel/public.js';

interface Scope { tenantId: string; from: string; to: string; branchIds: string[] | null }

const ACTIVE = sql`e.status = 'posted' AND NOT e.is_reversal`;
const branchOf = (a: Scope, alias = 'l') => (a.branchIds ? sql`AND ${sql.ref(`${alias}.branch_id`)} = ANY(${a.branchIds}::bigint[])` : sql``);

/* ---------------------------------------------------------------------------
 * Sổ nhật ký thu tiền / chi tiền (S03a1)
 * ------------------------------------------------------------------------- */

/** Năm cột tài khoản đối ứng mặc định khi người dùng không chọn. */
export const CASH_JOURNAL_DEFAULTS = {
  in: ['511', '3331', '131', '112', '1388'],
  out: ['331', '1331', '642', '641', '112'],
};

/**
 * Sổ thu lấy các dòng tiền có số Nợ, sổ chi lấy các dòng có số Có. Mỗi dòng: tổng tiền, rồi số tiền nằm ở
 * cột có tài khoản đối ứng khớp đầu số (cột 1 → 5, cột đầu tiên khớp được chọn); không khớp cột nào thì vào
 * cột "tài khoản khác" kèm số tài khoản. Không có số dư đầu kỳ, cuối kỳ.
 */
export async function cashJournal(a: Scope & { accountPrefix: string; direction: 'in' | 'out'; columns: string[] }) {
  const columns = (a.columns.length ? a.columns : CASH_JOURNAL_DEFAULTS[a.direction]).slice(0, 5);
  const side = a.direction === 'in' ? sql`l.debit <> 0` : sql`l.credit <> 0`;
  const res = await sql<{ entry_id: string; posting_date: string; doc_no: string; doc_type: string; description: string; partner_code: string | null; partner_name: string | null; branch_code: string; amount: string; counter: string | null }>`
    SELECT l.entry_id, l.posting_date::text AS posting_date, e.doc_no, e.doc_type,
           COALESCE(NULLIF(l.description, ''), e.description) AS description,
           p.code AS partner_code, p.name AS partner_name, br.code AS branch_code,
           CASE WHEN l.debit <> 0 THEN l.debit ELSE l.credit END AS amount,
           (SELECT o.account_code FROM bizcity_read.ledger_lines o
             WHERE o.entry_id = l.entry_id AND o.pair_no = l.pair_no AND o.id <> l.id AND ${otherSide()} AND o.account_code <> l.account_code
             ORDER BY o.line_no LIMIT 1) AS counter
      FROM bizcity_read.ledger_lines l
      JOIN bizcity_read.ledger_entries e ON e.id = l.entry_id
      JOIN branches br ON br.id = l.branch_id
      LEFT JOIN partners p ON p.id = COALESCE(l.partner_id, e.partner_id)
     WHERE l.tenant_id = ${a.tenantId}
       AND l.account_code LIKE ${a.accountPrefix + '%'}
       AND l.posting_date BETWEEN ${a.from}::date AND ${a.to}::date
       AND ${side} AND ${ACTIVE} ${branchOf(a)}
     ORDER BY l.posting_date, e.entry_no, l.line_no`.execute(db);

  const totals = { amount: 0, cells: columns.map(() => 0), other: 0 };
  const rows = res.rows.map((r) => {
    const amount = toCents(toNumber(r.amount));
    const counter = r.counter ?? '';
    const col = columns.findIndex((c) => counter.startsWith(c));
    const cells = columns.map((_, i) => (i === col ? amount : 0));
    const other = col < 0 ? amount : 0;
    totals.amount += amount;
    cells.forEach((v, i) => (totals.cells[i]! += v));
    totals.other += other;
    return {
      entryId: r.entry_id, postingDate: r.posting_date, docNo: r.doc_no, docType: r.doc_type, description: r.description,
      partnerCode: r.partner_code, partnerName: r.partner_name, branchCode: r.branch_code, counterAccount: counter,
      amount: fromCents(amount), cells: cells.map(fromCents), other: fromCents(other), otherAccount: col < 0 ? counter : '',
    };
  });
  return {
    direction: a.direction,
    columns,
    rows,
    totals: { amount: fromCents(totals.amount), cells: totals.cells.map(fromCents), other: fromCents(totals.other) },
    truncated: false,
  };
}

/* ---------------------------------------------------------------------------
 * Sổ nhật ký bán hàng
 * ------------------------------------------------------------------------- */

/**
 * Lấy dòng tiền hàng của hoá đơn bán (phía Nợ: phải thu khách hoặc tiền) và chia vào cột theo tài khoản
 * doanh thu đối ứng: 5111 hàng hoá, 5112 thành phẩm, 5113 dịch vụ, còn lại "khác". Mỗi chứng từ một dòng,
 * thêm dòng cộng theo chi nhánh. Không gồm hàng bán trả lại (theo dõi ở báo cáo hàng bán trả lại).
 * Cột như HTsoft (ACC84, acc_LoadSoNhatKyBanHang / mẫu S07-DN): ngày lập chứng từ, số chứng từ, ngày ghi sổ, ngày chứng từ,
 * ngày + số hoá đơn, diễn giải, phải thu, hàng hoá / thành phẩm / dịch vụ, số tiền + số hiệu TK khác, tài khoản (doanh thu),
 * TK đối ứng (phải thu), lý do.
 * Lọc thêm như HTsoft: tài khoản (đầu số, TK doanh thu hoặc TK ghi Nợ), mặt hàng.
 */
export async function salesJournal(a: Scope & { partnerCode?: string; account?: string; productSkus?: string[] }) {
  const productFilter = a.productSkus?.length ? sql`AND l.product_sku = ANY(${a.productSkus}::text[])` : sql``;
  const partnerFilter = a.partnerCode ? sql`AND p.code = ${a.partnerCode}` : sql``;
  const accountFilter = a.account ? sql`AND (starts_with(g.revenue, ${a.account}) OR starts_with(g.counter, ${a.account}))` : sql``;
  // Dòng hàng tiền âm (trả lại, điều chỉnh giảm trong hoá đơn) bị đổi bên khi ghi sổ (Nợ doanh thu / Có phải thu), nên không
  // coi bên Nợ luôn là tài khoản phải thu. Tài khoản phải thu (đối ứng) của hoá đơn: mọi cặp tiền hàng / thuế của một hoá đơn
  // dùng chung một tài khoản đối ứng (theo lý do xuất), nên là tài khoản có mặt trong mọi cặp; hoá đơn chỉ một cặp (hai tài
  // khoản cùng có mặt) thì lấy bên gắn đối tượng (đối tượng ghi phía công nợ), rồi bên Nợ của cặp tiền hàng.
  const res = await sql<{ entry_id: string; event_id: string; posting_date: string; doc_date: string; created_date: string; doc_no: string; invoice_no: string | null; description: string; reason_code: string | null; partner_code: string | null; partner_name: string | null; branch_code: string; counter: string; revenue: string; amount: string }>`
    WITH l AS (
      SELECT l.entry_id, l.pair_no, l.part, l.account_code, l.debit, l.credit, l.partner_id
        FROM bizcity_read.ledger_lines l
        JOIN bizcity_read.ledger_entries e ON e.id = l.entry_id
       WHERE l.tenant_id = ${a.tenantId}
         AND e.doc_type = 'sale' AND l.part IN ('goods', 'tax')
         AND l.posting_date BETWEEN ${a.from}::date AND ${a.to}::date
         AND ${ACTIVE} ${branchOf(a, 'l')} ${productFilter}
    ),
    tot AS (SELECT entry_id, COUNT(DISTINCT pair_no) AS n FROM l GROUP BY entry_id),
    acc AS (
      SELECT entry_id, account_code, COUNT(DISTINCT pair_no) AS n, bool_or(partner_id IS NOT NULL) AS has_partner,
             bool_or(part = 'goods' AND debit <> 0) AS goods_debit
        FROM l GROUP BY entry_id, account_code
    ),
    ctr AS (
      SELECT DISTINCT ON (x.entry_id) x.entry_id, x.account_code
        FROM acc x JOIN tot t ON t.entry_id = x.entry_id AND x.n = t.n
       ORDER BY x.entry_id, x.has_partner DESC, x.goods_debit DESC, x.account_code
    ),
    g AS (
      SELECT dr.entry_id, ctr.account_code AS counter,
             (cr.account_code = ctr.account_code AND dr.account_code <> ctr.account_code) AS flipped,
             dr.account_code AS dr_account, cr.account_code AS cr_account, dr.debit, dr.partner_id AS dr_partner, cr.partner_id AS cr_partner
        FROM l dr
        JOIN l cr ON cr.entry_id = dr.entry_id AND cr.pair_no = dr.pair_no AND cr.credit <> 0
        JOIN ctr ON ctr.entry_id = dr.entry_id
       WHERE dr.part = 'goods' AND dr.debit <> 0
    ),
    g2 AS (
      SELECT entry_id, counter,
             CASE WHEN flipped THEN dr_account ELSE cr_account END AS revenue,
             CASE WHEN flipped THEN -debit ELSE debit END AS amount,
             CASE WHEN flipped THEN cr_partner ELSE dr_partner END AS partner_id
        FROM g
    )
    SELECT g.entry_id, e.event_id, e.posting_date::text AS posting_date, e.doc_date::text AS doc_date,
           (e.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS created_date,
           e.doc_no, e.invoice_no, e.description, e.reason_code, p.code AS partner_code, p.name AS partner_name, br.code AS branch_code,
           g.counter, g.revenue, SUM(g.amount) AS amount
      FROM g2 g
      JOIN bizcity_read.ledger_entries e ON e.id = g.entry_id
      JOIN branches br ON br.id = e.branch_id
      LEFT JOIN partners p ON p.id = COALESCE(g.partner_id, e.partner_id)
     WHERE TRUE ${accountFilter} ${partnerFilter}
     GROUP BY g.entry_id, e.event_id, e.posting_date, e.doc_date, e.created_at, e.doc_no, e.invoice_no, e.description, e.reason_code, p.code, p.name, br.code, g.counter, g.revenue
     ORDER BY br.code, e.posting_date, e.doc_no, g.entry_id`.execute(db);

  type Cols = { goods: number; finished: number; service: number; other: number; total: number };
  const empty = (): Cols => ({ goods: 0, finished: 0, service: 0, other: 0, total: 0 });
  const colOf = (acc: string): keyof Cols => (acc.startsWith('5111') ? 'goods' : acc.startsWith('5112') ? 'finished' : acc.startsWith('5113') ? 'service' : 'other');
  type Head = (typeof res.rows)[number];
  const byEntry = new Map<string, { head: Head; counter: string; c: Cols; revenueAccounts: Set<string>; otherAccounts: Set<string> }>();
  for (const r of res.rows) {
    const cur = byEntry.get(r.entry_id) ?? { head: r, counter: r.counter, c: empty(), revenueAccounts: new Set<string>(), otherAccounts: new Set<string>() };
    const v = toCents(toNumber(r.amount));
    const col = colOf(r.revenue);
    cur.c[col] += v;
    cur.c.total += v;
    cur.revenueAccounts.add(r.revenue);
    if (col === 'other') cur.otherAccounts.add(r.revenue);
    byEntry.set(r.entry_id, cur);
  }
  const docs = [...byEntry.values()];

  // Ngày của hoá đơn đúng số trên bút toán; bỏ hoá đơn đã huỷ.
  const eventIds = [...new Set(docs.map((d) => d.head.event_id))];
  const inv = new Map<string, string>();
  if (eventIds.length) {
    const ti = await sql<{ event_id: string; invoice_no: string; invoice_date: string }>`
      SELECT event_id, invoice_no, invoice_date::text AS invoice_date FROM tax_invoices
       WHERE tenant_id = ${a.tenantId} AND event_id = ANY(${eventIds}::bigint[]) AND direction = 'output' AND status <> 'cancelled'
       ORDER BY event_id, sign DESC, id`.execute(db);
    const byEvent = new Map<string, typeof ti.rows>();
    for (const x of ti.rows) byEvent.set(x.event_id, [...(byEvent.get(x.event_id) ?? []), x]);
    for (const { head } of docs) {
      const rows = byEvent.get(head.event_id) ?? [];
      const hit = rows.find((x) => x.invoice_no === head.invoice_no) ?? rows[0];
      if (hit) inv.set(head.entry_id, hit.invoice_date);
    }
  }

  const out = (c: Cols) => ({ goods: fromCents(c.goods), finished: fromCents(c.finished), service: fromCents(c.service), other: fromCents(c.other), total: fromCents(c.total) });
  const branches = new Map<string, { branchCode: string; rows: unknown[]; c: Cols }>();
  const grand = empty();
  for (const { head, counter, c, revenueAccounts, otherAccounts } of docs) {
    const b = branches.get(head.branch_code) ?? { branchCode: head.branch_code, rows: [], c: empty() };
    b.rows.push({
      entryId: head.entry_id, postingDate: head.posting_date, docDate: head.doc_date, createdDate: head.created_date, invoiceDate: inv.get(head.entry_id) ?? null,
      docNo: head.doc_no, invoiceNo: head.invoice_no, description: head.description, partnerCode: head.partner_code, partnerName: head.partner_name,
      // Như HTsoft: Tài khoản = TK doanh thu ghi Có (5111…), TK đối ứng = TK phải thu ghi Nợ (1311…).
      account: [...revenueAccounts].sort().join(', '), contraAccount: counter, otherAccount: [...otherAccounts].sort().join(', '), reasonCode: head.reason_code ?? '', ...out(c),
    });
    for (const k of Object.keys(c) as (keyof Cols)[]) { b.c[k] += c[k]; grand[k] += c[k]; }
    branches.set(head.branch_code, b);
  }
  return { branches: [...branches.values()].map((b) => ({ branchCode: b.branchCode, rows: b.rows, totals: out(b.c) })), totals: out(grand), documents: docs.length };
}

/**
 * Sổ nhật ký mua hàng (mẫu S03a3): tiền hàng của phiếu nhập mua (phía Nợ: kho hoặc chi phí, phía Có: phải trả
 * người bán), chia cột theo tài khoản ghi Nợ: 156 hàng hoá, 152 nguyên liệu, 153 công cụ, còn lại "khác".
 * Mỗi chứng từ một dòng, thêm dòng cộng theo chi nhánh. Không gồm thuế và hàng trả lại người bán.
 */
export async function purchaseJournal(a: Scope & { partnerCode?: string }) {
  const partnerFilter = a.partnerCode ? sql`AND p.code = ${a.partnerCode}` : sql``;
  const res = await sql<{ entry_id: string; posting_date: string; doc_no: string; invoice_no: string | null; description: string; partner_code: string | null; partner_name: string | null; branch_code: string; credit_account: string; debit_account: string; amount: string }>`
    SELECT d.entry_id, d.posting_date::text AS posting_date, e.doc_no, e.invoice_no, e.description,
           p.code AS partner_code, p.name AS partner_name, br.code AS branch_code,
           c.account_code AS credit_account, d.account_code AS debit_account, SUM(d.debit) AS amount
      FROM bizcity_read.ledger_lines d
      JOIN bizcity_read.ledger_entries e ON e.id = d.entry_id
      JOIN bizcity_read.ledger_lines c ON c.entry_id = d.entry_id AND c.pair_no = d.pair_no AND c.credit <> 0
      JOIN branches br ON br.id = d.branch_id
      LEFT JOIN partners p ON p.id = COALESCE(c.partner_id, e.partner_id)
     WHERE d.tenant_id = ${a.tenantId}
       AND e.doc_type = 'purchase' AND d.part = 'goods' AND d.debit <> 0
       AND d.posting_date BETWEEN ${a.from}::date AND ${a.to}::date
       AND ${ACTIVE} ${branchOf(a, 'd')} ${partnerFilter}
     GROUP BY d.entry_id, d.posting_date, e.doc_no, e.invoice_no, e.description, p.code, p.name, br.code, c.account_code, d.account_code
     ORDER BY br.code, d.posting_date, e.doc_no`.execute(db);

  type Cols = { goods: number; materials: number; tools: number; other: number; total: number };
  const empty = (): Cols => ({ goods: 0, materials: 0, tools: 0, other: 0, total: 0 });
  const colOf = (acc: string): keyof Cols => (acc.startsWith('156') ? 'goods' : acc.startsWith('152') ? 'materials' : acc.startsWith('153') ? 'tools' : 'other');
  const docs = new Map<string, { head: (typeof res.rows)[number]; c: Cols; creditAccounts: Set<string>; otherAccounts: Set<string> }>();
  for (const r of res.rows) {
    const cur = docs.get(r.entry_id) ?? { head: r, c: empty(), creditAccounts: new Set<string>(), otherAccounts: new Set<string>() };
    const v = toCents(toNumber(r.amount));
    const col = colOf(r.debit_account);
    cur.c[col] += v;
    cur.c.total += v;
    cur.creditAccounts.add(r.credit_account);
    if (col === 'other') cur.otherAccounts.add(r.debit_account);
    docs.set(r.entry_id, cur);
  }
  const out = (c: Cols) => ({ goods: fromCents(c.goods), materials: fromCents(c.materials), tools: fromCents(c.tools), other: fromCents(c.other), total: fromCents(c.total) });
  const branches = new Map<string, { branchCode: string; rows: unknown[]; c: Cols }>();
  const grand = empty();
  for (const { head, c, creditAccounts, otherAccounts } of docs.values()) {
    const b = branches.get(head.branch_code) ?? { branchCode: head.branch_code, rows: [], c: empty() };
    b.rows.push({ entryId: head.entry_id, postingDate: head.posting_date, docNo: head.doc_no, invoiceNo: head.invoice_no, description: head.description, partnerCode: head.partner_code, partnerName: head.partner_name, creditAccount: [...creditAccounts].join(', '), otherAccount: [...otherAccounts].join(', '), ...out(c) });
    for (const k of Object.keys(c) as (keyof Cols)[]) { b.c[k] += c[k]; grand[k] += c[k]; }
    branches.set(head.branch_code, b);
  }
  return { branches: [...branches.values()].map((b) => ({ branchCode: b.branchCode, rows: b.rows, totals: out(b.c) })), totals: out(grand), documents: docs.size };
}

/* ---------------------------------------------------------------------------
 * Bảng kê chi tiết chứng từ
 * ------------------------------------------------------------------------- */

/**
 * Mỗi cặp Nợ / Có một dòng: tài khoản Nợ, tài khoản Có, số tiền, đối tượng từng bên, chiều phân tích.
 * Lọc theo đầu số tài khoản (khớp bên Nợ hoặc bên Có) và loại chứng từ.
 */
export async function voucherListing(a: Scope & { accountPrefix?: string; docType?: string; page: number; pageSize: number }) {
  const filters = [
    branchOf(a, 'd'),
    a.docType ? sql`AND e.doc_type = ${a.docType}` : sql``,
    a.accountPrefix ? sql`AND (d.account_code LIKE ${a.accountPrefix + '%'} OR c.account_code LIKE ${a.accountPrefix + '%'})` : sql``,
  ];
  const from = sql`
      FROM bizcity_read.ledger_lines d
      JOIN bizcity_read.ledger_entries e ON e.id = d.entry_id
      JOIN bizcity_read.ledger_lines c ON c.entry_id = d.entry_id AND c.pair_no = d.pair_no AND c.credit <> 0
      JOIN branches br ON br.id = d.branch_id
      LEFT JOIN partners pd ON pd.id = d.partner_id
      LEFT JOIN partners pc ON pc.id = c.partner_id
     WHERE d.tenant_id = ${a.tenantId} AND d.debit <> 0
       AND d.posting_date BETWEEN ${a.from}::date AND ${a.to}::date
       AND ${ACTIVE} ${sql.join(filters, sql` `)}`;
  const rows = await sql<{ entry_id: string; posting_date: string; doc_no: string; doc_type: string; invoice_no: string | null; description: string; debit_account: string; credit_account: string; amount: string; debit_partner: string | null; credit_partner: string | null; cost_item: string | null; department: string | null; contract: string | null; branch_code: string; reason_code: string | null }>`
    SELECT d.entry_id, d.posting_date::text AS posting_date, e.doc_no, e.doc_type, e.invoice_no,
           COALESCE(NULLIF(d.description, ''), e.description) AS description,
           d.account_code AS debit_account, c.account_code AS credit_account, LEAST(d.debit, c.credit) AS amount,
           pd.code AS debit_partner, pc.code AS credit_partner,
           COALESCE(d.dims->>'costItem', c.dims->>'costItem') AS cost_item,
           COALESCE(d.dims->>'department', c.dims->>'department') AS department,
           COALESCE(d.dims->>'contract', c.dims->>'contract') AS contract,
           br.code AS branch_code, e.reason_code
      ${from}
     ORDER BY d.posting_date, e.doc_no, d.line_no
     LIMIT ${a.pageSize} OFFSET ${(a.page - 1) * a.pageSize}`.execute(db);
  const totals = await sql<{ n: string; amount: string }>`SELECT COUNT(*) AS n, COALESCE(SUM(LEAST(d.debit, c.credit)), 0) AS amount ${from}`.execute(db);
  return {
    rows: rows.rows.map((r) => ({
      entryId: r.entry_id, postingDate: r.posting_date, docNo: r.doc_no, docType: r.doc_type, invoiceNo: r.invoice_no, description: r.description,
      debitAccount: r.debit_account, creditAccount: r.credit_account, amount: toNumber(r.amount),
      debitPartner: r.debit_partner ?? '', creditPartner: r.credit_partner ?? '',
      costItem: r.cost_item ?? '', department: r.department ?? '', contract: r.contract ?? '', branchCode: r.branch_code, reasonCode: r.reason_code ?? '',
    })),
    total: Number(totals.rows[0]!.n),
    amount: toNumber(totals.rows[0]!.amount),
  };
}

/* ---------------------------------------------------------------------------
 * Báo cáo lưu chuyển tiền tệ (B03-DN, phương pháp trực tiếp, Thông tư 99/2025/TT-BTC)
 * ------------------------------------------------------------------------- */

interface CashFlowLine { code: string; name: string; bold?: boolean; formula?: string[] }

/** Chỉ tiêu theo mẫu B03-DN (phương pháp trực tiếp). Dòng có formula là dòng tổng. */
export const CASH_FLOW_LINES: CashFlowLine[] = [
  { code: 'I', name: 'I. Lưu chuyển tiền từ hoạt động kinh doanh', bold: true },
  { code: '01', name: '1. Tiền thu từ bán hàng, cung cấp dịch vụ và doanh thu khác' },
  { code: '02', name: '2. Tiền chi trả cho người cung cấp hàng hoá và dịch vụ' },
  { code: '03', name: '3. Tiền chi trả cho người lao động' },
  { code: '04', name: '4. Chi phí đi vay đã trả' },
  { code: '05', name: '5. Thuế thu nhập doanh nghiệp đã nộp' },
  { code: '06', name: '6. Tiền thu khác từ hoạt động kinh doanh' },
  { code: '07', name: '7. Tiền chi khác cho hoạt động kinh doanh' },
  { code: '20', name: 'Lưu chuyển tiền thuần từ hoạt động kinh doanh', bold: true, formula: ['01', '02', '03', '04', '05', '06', '07'] },
  { code: 'II', name: 'II. Lưu chuyển tiền từ hoạt động đầu tư', bold: true },
  { code: '21', name: '1. Tiền chi để mua sắm, xây dựng TSCĐ và các tài sản dài hạn khác' },
  { code: '22', name: '2. Tiền thu từ thanh lý, nhượng bán TSCĐ và các tài sản dài hạn khác' },
  { code: '23', name: '3. Tiền chi cho vay, mua các công cụ nợ của đơn vị khác' },
  { code: '24', name: '4. Tiền thu hồi cho vay, bán lại các công cụ nợ của đơn vị khác' },
  { code: '25', name: '5. Tiền chi đầu tư góp vốn vào đơn vị khác' },
  { code: '26', name: '6. Tiền thu hồi đầu tư góp vốn vào đơn vị khác' },
  { code: '27', name: '7. Tiền thu lãi cho vay, cổ tức và lợi nhuận được chia' },
  { code: '30', name: 'Lưu chuyển tiền thuần từ hoạt động đầu tư', bold: true, formula: ['21', '22', '23', '24', '25', '26', '27'] },
  { code: 'III', name: 'III. Lưu chuyển tiền từ hoạt động tài chính', bold: true },
  { code: '31', name: '1. Tiền thu từ phát hành cổ phiếu, nhận vốn góp của chủ sở hữu' },
  { code: '32', name: '2. Tiền trả lại vốn góp cho các chủ sở hữu, mua lại cổ phiếu' },
  { code: '33', name: '3. Tiền thu từ đi vay' },
  { code: '34', name: '4. Tiền trả nợ gốc vay' },
  { code: '35', name: '5. Tiền trả nợ gốc thuê tài chính' },
  { code: '36', name: '6. Cổ tức, lợi nhuận đã trả cho chủ sở hữu' },
  { code: '40', name: 'Lưu chuyển tiền thuần từ hoạt động tài chính', bold: true, formula: ['31', '32', '33', '34', '35', '36'] },
  { code: '50', name: 'Lưu chuyển tiền thuần trong kỳ (50 = 20 + 30 + 40)', bold: true, formula: ['20', '30', '40'] },
  { code: '60', name: 'Tiền và tương đương tiền đầu kỳ', bold: true },
  { code: '61', name: 'Ảnh hưởng của thay đổi tỷ giá hối đoái quy đổi ngoại tệ' },
  { code: '70', name: 'Tiền và tương đương tiền cuối kỳ (70 = 50 + 60 + 61)', bold: true, formula: ['50', '60', '61'] },
];
const LEAF_CODES = new Set(CASH_FLOW_LINES.filter((l) => !l.formula && /^\d+$/.test(l.code) && l.code !== '60').map((l) => l.code));

/**
 * Khi dòng tiền chưa được gán mã chỉ tiêu (trên dòng phiếu hoặc trên lý do), đoán theo tài khoản đối ứng.
 * Tiền vào (Nợ TK tiền) và tiền ra (Có TK tiền) xét riêng; không nhận ra thì "thu khác" / "chi khác".
 */
export function guessCashFlowCode(direction: 'in' | 'out', counter: string): string {
  const s = (...p: string[]) => p.some((x) => counter.startsWith(x));
  if (direction === 'in') {
    if (s('511', '3331', '131', '33311')) return '01';
    if (s('515')) return '27';
    if (s('341')) return '33';
    if (s('411')) return '31';
    if (s('128', '1283', '228')) return '24';
    return '06';
  }
  if (s('331', '15', '1331', '621', '627')) return '02';
  if (s('334')) return '03';
  if (s('635')) return '04';
  if (s('3334')) return '05';
  if (s('211', '213', '241')) return '21';
  if (s('341')) return '34';
  if (s('421')) return '36';
  if (s('131')) return '01'; // trả lại tiền cho khách: giảm tiền thu bán hàng
  return '07';
}

/**
 * Số của chỉ tiêu = tổng (Nợ − Có) của các dòng tài khoản tiền (111, 112, 113) mang mã chỉ tiêu đó. Mã lấy theo thứ tự:
 * mã ghi trên dòng phiếu → mã lưu chuyển tiền tệ của lý do → đoán theo tài khoản đối ứng.
 * Dòng tiền chuyển giữa hai tài khoản tiền (rút tiền gửi về quỹ…) không vào báo cáo.
 * Tiền đầu kỳ = số dư các tài khoản tiền trước "từ ngày"; dòng kiểm tra so tiền cuối kỳ với số dư thật.
 */
export async function cashFlow(a: Scope) {
  // Tiền và tương đương tiền: các tài khoản 111, 112, 113.
  const isCashSql = sql`(l.account_code LIKE '111%' OR l.account_code LIKE '112%' OR l.account_code LIKE '113%')`;
  const isCounterCash = sql`(o.account_code LIKE '111%' OR o.account_code LIKE '112%' OR o.account_code LIKE '113%')`;

  const lines = await sql<{ debit: string; credit: string; code: string | null; reason_code: string | null; counter: string | null; counter_is_cash: boolean | null }>`
    SELECT l.debit, l.credit, l.dims->>'cashflow' AS code, e.reason_code,
           (SELECT o.account_code FROM bizcity_read.ledger_lines o WHERE o.entry_id = l.entry_id AND o.pair_no = l.pair_no AND o.id <> l.id AND ${otherSide()} ORDER BY o.line_no LIMIT 1) AS counter,
           (SELECT bool_and(${isCounterCash}) FROM bizcity_read.ledger_lines o WHERE o.entry_id = l.entry_id AND o.pair_no = l.pair_no AND o.id <> l.id AND ${otherSide()}) AS counter_is_cash
      FROM bizcity_read.ledger_lines l
      JOIN bizcity_read.ledger_entries e ON e.id = l.entry_id
     WHERE l.tenant_id = ${a.tenantId}
       AND l.posting_date BETWEEN ${a.from}::date AND ${a.to}::date
       AND ${isCashSql} AND e.doc_type <> 'opening' ${branchOf(a)}`.execute(db);
  const reasons = new Map((await db.selectFrom('posting_reasons').select(['code', 'cashflow_code']).where('tenant_id', '=', a.tenantId).execute()).map((r) => [r.code, r.cashflow_code]));

  const values = new Map<string, number>();
  let guessed = 0;
  for (const l of lines.rows) {
    const net = toCents(toNumber(l.debit)) - toCents(toNumber(l.credit));
    if (!net) continue;
    let code = l.code || (l.reason_code ? reasons.get(l.reason_code) : null) || null;
    if (!code) {
      if (l.counter_is_cash) continue; // chuyển tiền nội bộ giữa các tài khoản tiền
      code = guessCashFlowCode(net > 0 ? 'in' : 'out', l.counter ?? '');
      guessed += Math.abs(net);
    }
    if (!LEAF_CODES.has(code)) code = net > 0 ? '06' : '07';
    values.set(code, (values.get(code) ?? 0) + net);
  }

  // Tiền đầu kỳ và tiền cuối kỳ thật (để kiểm tra).
  const isCashBal = sql`(g.account_code LIKE '111%' OR g.account_code LIKE '112%' OR g.account_code LIKE '113%')`;
  const bal = await sql<{ opening: string; closing: string }>`
    SELECT COALESCE(SUM(CASE WHEN g.posting_date < ${a.from}::date THEN g.debit - g.credit ELSE 0 END), 0) AS opening,
           COALESCE(SUM(g.debit - g.credit), 0) AS closing
      FROM bizcity_read.ledger_balances_daily g
     WHERE g.tenant_id = ${a.tenantId} AND g.posting_date <= ${a.to}::date AND ${isCashBal}
       ${a.branchIds ? sql`AND g.branch_id = ANY(${a.branchIds}::bigint[])` : sql``}`.execute(db);
  // Số dư đầu nhập trong kỳ (phiếu số dư đầu kỳ) cũng là tiền đầu kỳ, không phải dòng tiền.
  const openingInPeriod = await sql<{ net: string }>`
    SELECT COALESCE(SUM(l.debit - l.credit), 0) AS net
      FROM bizcity_read.ledger_lines l JOIN bizcity_read.ledger_entries e ON e.id = l.entry_id
     WHERE l.tenant_id = ${a.tenantId} AND e.doc_type = 'opening'
       AND l.posting_date BETWEEN ${a.from}::date AND ${a.to}::date AND ${isCashSql} ${branchOf(a)}`.execute(db);
  values.set('60', toCents(toNumber(bal.rows[0]!.opening)) + toCents(toNumber(openingInPeriod.rows[0]!.net)));
  values.set('61', values.get('61') ?? 0);
  for (const l of CASH_FLOW_LINES) if (l.formula) values.set(l.code, l.formula.reduce((s, c) => s + (values.get(c) ?? 0), 0));
  const actualClosing = toCents(toNumber(bal.rows[0]!.closing));

  return {
    rows: CASH_FLOW_LINES.map((l) => ({ code: /^\d+$/.test(l.code) ? l.code : '', name: l.name, bold: Boolean(l.bold), value: /^\d+$/.test(l.code) ? fromCents(values.get(l.code) ?? 0) : null })),
    check: { closing: fromCents(values.get('70') ?? 0), actualClosing: fromCents(actualClosing), difference: fromCents((values.get('70') ?? 0) - actualClosing) },
    guessedAmount: fromCents(guessed),
  };
}
