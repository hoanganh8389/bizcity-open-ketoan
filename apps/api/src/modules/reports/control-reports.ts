// @bizcity-layer D modules/ke-toan
// [2026-10-31 08:24 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — ledger.query (PHASES 3.7): đọc sổ qua khung nhìn bizcity_read.* thay bảng ledger_* (SC-KERNEL-7)
/**
 * Báo cáo phân tích và kiểm soát:
 *   - expenseByDimension  Chi phí theo chiều phân tích (khoản mục, bộ phận, hợp đồng, nhân viên, vụ việc, dự án, nguồn vốn)
 *   - aging               Công nợ theo tuổi nợ
 *   - documentChecks      Kiểm tra chứng từ, hoá đơn (các trường hợp dễ làm lệch số khi đối chiếu)
 */
import { ANALYSIS_DIMS, fromCents, toCents } from '@ketoan/contracts';
import { sql } from 'kysely';
import { db, toNumber } from '../../db/client.js';

interface Scope { tenantId: string; from: string; to: string; branchIds: string[] | null }

/** Cột gom được ở báo cáo chi phí: các chiều phân tích trên dòng sổ, cộng tài khoản. */
export const EXPENSE_GROUPS = [...ANALYSIS_DIMS.map((d) => d.field), 'account'] as const;
export type ExpenseGroup = (typeof EXPENSE_GROUPS)[number];

/**
 * Chi phí theo chiều phân tích: phát sinh (Nợ − Có) của các tài khoản bắt đầu bằng `accountPrefix`,
 * gom theo các chiều chọn (khoản mục, bộ phận, hợp đồng, nhân viên, vụ việc, dự án, nguồn vốn) và / hoặc tài khoản.
 * Không tính bút toán kết chuyển. Dòng không gắn mã nào gom vào nhóm "(chưa phân loại)".
 */
export async function expenseByDimension(a: Scope & { accountPrefix: string; groupBy: ExpenseGroup[] }) {
  const branchFilter = a.branchIds ? sql`AND l.branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
  const groups = a.groupBy.length ? a.groupBy : (['costItem'] as ExpenseGroup[]);
  const col = (k: ExpenseGroup) => (k === 'account' ? sql`l.account_code` : sql`COALESCE(l.dims->>${k}, '')`);
  const selects = sql.join(groups.map((k, i) => sql`${col(k)} AS ${sql.ref(`g${i}`)}`), sql`, `);
  const groupNums = sql.raw(groups.map((_, i) => String(i + 1)).join(', '));
  const res = await sql<Record<string, string>>`
    SELECT ${selects}, SUM(l.debit - l.credit) AS amount
      FROM bizcity_read.ledger_lines l
      JOIN bizcity_read.ledger_entries e ON e.id = l.entry_id
     WHERE l.tenant_id = ${a.tenantId}
       AND l.posting_date BETWEEN ${a.from}::date AND ${a.to}::date
       AND l.account_code LIKE ${a.accountPrefix + '%'}
       AND e.doc_type <> 'closing'
       ${branchFilter}
     GROUP BY ${groupNums}
    HAVING SUM(l.debit - l.credit) <> 0
     ORDER BY ${groupNums}`.execute(db);

  const dims = await db.selectFrom('dimensions').select(['kind', 'code', 'name']).where('tenant_id', '=', a.tenantId).execute();
  const accounts = await db.selectFrom('accounts').select(['code', 'name']).where('tenant_id', '=', a.tenantId).where('code', 'like', `${a.accountPrefix}%`).execute();
  const dimName = new Map(dims.map((d) => [`${d.kind}|${d.code}`, d.name]));
  const accName = new Map(accounts.map((x) => [x.code, x.name]));
  const kindOf = Object.fromEntries(ANALYSIS_DIMS.map((d) => [d.field, d.kind])) as Record<string, string>;
  const rows = res.rows.map((r) => {
    const out: Record<string, string | number> = { amount: toNumber(r.amount) };
    groups.forEach((k, i) => {
      const code = r[`g${i}`] ?? '';
      if (k === 'account') {
        out.accountCode = code;
        out.accountName = accName.get(code) ?? '';
      } else {
        out[k] = code;
        out[`${k}Name`] = code ? dimName.get(`${kindOf[k]}|${code}`) ?? '' : '';
      }
    });
    return out;
  });
  return { groupBy: groups, rows, total: fromCents(rows.reduce((s, r) => s + toCents(r.amount as number), 0)) };
}

/**
 * Lãi lỗ theo hợp đồng (ACC70 tổng hợp, ACC71 chi tiết theo tài khoản): doanh thu, thu nhập (TK loại 5, 7: Có − Nợ)
 * trừ giá vốn, chi phí (TK loại 6, 8: Nợ − Có) của các dòng sổ có gắn hợp đồng. Không tính bút toán kết chuyển.
 */
export async function profitByContract(a: Scope & { detail: boolean; contract?: string }) {
  const branchFilter = a.branchIds ? sql`AND l.branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
  const contractFilter = a.contract ? sql`AND l.dims->>'contract' = ${a.contract}` : sql``;
  const res = await sql<{ contract: string; account_code: string; revenue: string; cost: string }>`
    SELECT l.dims->>'contract' AS contract, ${a.detail ? sql`l.account_code` : sql`''`} AS account_code,
           SUM(CASE WHEN left(l.account_code, 1) IN ('5', '7') THEN l.credit - l.debit ELSE 0 END) AS revenue,
           SUM(CASE WHEN left(l.account_code, 1) IN ('6', '8') THEN l.debit - l.credit ELSE 0 END) AS cost
      FROM bizcity_read.ledger_lines l
      JOIN bizcity_read.ledger_entries e ON e.id = l.entry_id
     WHERE l.tenant_id = ${a.tenantId}
       AND l.posting_date BETWEEN ${a.from}::date AND ${a.to}::date
       AND COALESCE(l.dims->>'contract', '') <> '' AND left(l.account_code, 1) IN ('5', '6', '7', '8')
       AND e.doc_type <> 'closing'
       ${branchFilter} ${contractFilter}
     GROUP BY 1, 2
    HAVING SUM(l.debit) <> 0 OR SUM(l.credit) <> 0
     ORDER BY 1, 2`.execute(db);
  const contracts = await db.selectFrom('dimensions').select(['code', 'name', 'extra']).where('tenant_id', '=', a.tenantId).where('kind', '=', 'contract').execute();
  const info = new Map(contracts.map((c) => [c.code, c]));
  const partnerCodes = [...new Set(contracts.map((c) => String((c.extra as { partnerCode?: string })?.partnerCode ?? '')).filter(Boolean))];
  const partners = partnerCodes.length ? await db.selectFrom('partners').select(['code', 'name']).where('tenant_id', '=', a.tenantId).where('code', 'in', partnerCodes).execute() : [];
  const partnerName = new Map(partners.map((p) => [p.code, p.name]));
  const accounts = a.detail ? await db.selectFrom('accounts').select(['code', 'name']).where('tenant_id', '=', a.tenantId).execute() : [];
  const accName = new Map(accounts.map((x) => [x.code, x.name]));
  const totals = { revenue: 0, cost: 0 };
  const rows = res.rows.map((r) => {
    const c = info.get(r.contract);
    const extra = (c?.extra ?? {}) as { type?: string; partnerCode?: string; value?: number };
    const revenue = toNumber(r.revenue);
    const cost = toNumber(r.cost);
    totals.revenue += toCents(revenue);
    totals.cost += toCents(cost);
    return {
      contractCode: r.contract, contractName: c?.name ?? '', contractType: extra.type ?? '', partnerCode: extra.partnerCode ?? '', partnerName: partnerName.get(extra.partnerCode ?? '') ?? '',
      contractValue: Number(extra.value ?? 0), accountCode: r.account_code, accountName: accName.get(r.account_code) ?? '',
      revenue, cost, profit: fromCents(toCents(revenue) - toCents(cost)),
    };
  });
  return { rows, totals: { revenue: fromCents(totals.revenue), cost: fromCents(totals.cost), profit: fromCents(totals.revenue - totals.cost) } };
}

/**
 * Công nợ theo tuổi nợ tại một ngày.
 *
 * Cách tính (nhập trước – trả trước): với mỗi đối tượng còn nợ, coi các khoản trả đã trừ vào các khoản nợ
 * cũ nhất trước; phần còn nợ vì thế thuộc về các khoản phát sinh GẦN NHẤT. Phần mềm đi ngược từ ngày xem
 * về trước, gom số nợ theo tuổi (số ngày từ ngày phát sinh tới ngày xem) vào các khoảng `step` ngày:
 *   1..step | step+1..2·step | 2·step+1..3·step | 3·step+1..4·step | trên 4·step
 *
 * Tài khoản phải thu (đầu 1) tính số dư Nợ; tài khoản phải trả (đầu 3) tính số dư Có.
 */
export async function aging(a: { tenantId: string; asOf: string; branchIds: string[] | null; accountPrefix: string; step: number }) {
  const branchFilter = a.branchIds ? sql`AND g.branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
  const payable = a.accountPrefix.startsWith('3');
  // Cột làm tăng nợ: phải thu → Nợ; phải trả → Có.
  const up = payable ? sql`g.credit` : sql`g.debit`;
  const down = payable ? sql`g.debit` : sql`g.credit`;
  const res = await sql<{ partner_id: string; day: string; up: string; down: string }>`
    SELECT g.partner_id, g.posting_date::text AS day, SUM(${up}) AS up, SUM(${down}) AS down
      FROM bizcity_read.ledger_balances_daily g
     WHERE g.tenant_id = ${a.tenantId}
       AND g.account_code LIKE ${a.accountPrefix + '%'} AND g.posting_date <= ${a.asOf}::date
       ${branchFilter}
     GROUP BY g.partner_id, g.posting_date
     ORDER BY g.partner_id, g.posting_date DESC`.execute(db);

  const byPartner = new Map<string, { day: string; up: number; down: number }[]>();
  for (const r of res.rows) {
    const list = byPartner.get(r.partner_id) ?? [];
    list.push({ day: r.day, up: toCents(toNumber(r.up)), down: toCents(toNumber(r.down)) });
    byPartner.set(r.partner_id, list);
  }
  const ids = [...byPartner.keys()];
  const partners = ids.length ? await db.selectFrom('partners').select(['id', 'code', 'name', 'phone', 'group_code', 'payment_term_days', 'credit_limit']).where('tenant_id', '=', a.tenantId).where('id', 'in', ids).execute() : [];
  const info = new Map(partners.map((p) => [p.id, p]));
  const asOfMs = Date.parse(a.asOf);
  const totals = { balance: 0, buckets: [0, 0, 0, 0, 0], inTerm: 0, overdue: 0 };

  const rows = [...byPartner.entries()]
    .map(([id, days]) => {
      const balance = days.reduce((s, d) => s + d.up - d.down, 0);
      if (balance <= 0) return null; // hết nợ hoặc đang trả thừa
      const buckets = [0, 0, 0, 0, 0];
      const p = info.get(id);
      // Hạn thanh toán riêng của đối tượng (nếu có), không thì hạn chung `step`.
      const term = p?.payment_term_days ?? a.step;
      let inTerm = 0;
      let rest = balance;
      let oldest = a.asOf;
      for (const d of days) {
        // `days` đã xếp ngày mới trước: phần nợ còn lại thuộc các khoản phát sinh gần nhất.
        if (rest <= 0) break;
        if (d.up <= 0) continue;
        const take = Math.min(rest, d.up);
        const age = Math.max(0, Math.round((asOfMs - Date.parse(d.day)) / 86_400_000));
        buckets[Math.min(4, Math.floor(Math.max(age - 1, 0) / a.step))]! += take;
        if (age <= term) inTerm += take;
        rest -= take;
        oldest = d.day;
      }
      // Số dư lớn hơn tổng phát sinh tăng (ví dụ số dư đầu nhập bằng bút toán khác bên): xếp vào khoảng cũ nhất.
      if (rest > 0) buckets[4]! += rest;
      totals.balance += balance;
      totals.inTerm += inTerm;
      totals.overdue += balance - inTerm;
      buckets.forEach((b, i) => (totals.buckets[i]! += b));
      const limit = p?.credit_limit === null || p?.credit_limit === undefined ? null : toNumber(p.credit_limit);
      return {
        partnerCode: p?.code ?? '', partnerName: p?.name ?? '(không theo dõi đối tượng)', phone: p?.phone ?? '', groupCode: p?.group_code ?? '',
        balance: fromCents(balance), buckets: buckets.map(fromCents), oldestDate: oldest,
        termDays: term, ownTerm: p?.payment_term_days !== null && p?.payment_term_days !== undefined,
        inTerm: fromCents(inTerm), overdue: fromCents(balance - inTerm),
        creditLimit: limit, overLimit: limit !== null && fromCents(balance) > limit,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((x, y) => y.balance - x.balance);

  const s = a.step;
  return {
    asOf: a.asOf,
    step: s,
    side: payable ? ('credit' as const) : ('debit' as const),
    bucketLabels: [`1 – ${s} ngày`, `${s + 1} – ${2 * s} ngày`, `${2 * s + 1} – ${3 * s} ngày`, `${3 * s + 1} – ${4 * s} ngày`, `Trên ${4 * s} ngày`],
    rows,
    totals: { balance: fromCents(totals.balance), buckets: totals.buckets.map(fromCents), inTerm: fromCents(totals.inTerm), overdue: fromCents(totals.overdue) },
  };
}

/**
 * Kiểm tra chứng từ, hoá đơn trong kỳ: gom các trường hợp hay làm số liệu lệch khi đối chiếu với
 * nhà cung cấp hoá đơn điện tử hoặc với hệ thống bán hàng. Mỗi mục trả số lượng và toàn bộ dòng.
 */
export async function documentChecks(a: { tenantId: string; from: string; to: string; branchIds: string[] | null }) {
  const branchDoc = a.branchIds ? sql`AND d.branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
  const branchInv = a.branchIds ? sql`AND i.branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
  const docCols = sql`d.id, d.doc_no, d.doc_date::text AS doc_date, d.doc_type, d.invoice_no, d.total, d.status, d.error_message, b.code AS branch_code`;
  type DocRow = { id: string; doc_no: string; doc_date: string; doc_type: string; invoice_no: string | null; total: string; status: string; error_message: string | null; branch_code: string };
  const doc = (r: DocRow, note = '') => ({ id: r.id, docNo: r.doc_no, docDate: r.doc_date, docType: r.doc_type, invoiceNo: r.invoice_no ?? '', total: toNumber(r.total), branchCode: r.branch_code, note: note || r.error_message || '' });

  const errors = await sql<DocRow>`
    SELECT ${docCols} FROM accounting_events d JOIN branches b ON b.id = d.branch_id
     WHERE d.tenant_id = ${a.tenantId} AND d.status = 'error' AND d.doc_date BETWEEN ${a.from}::date AND ${a.to}::date ${branchDoc}
     ORDER BY d.doc_date, d.doc_no`.execute(db);

  const noInvoice = await sql<DocRow & { n: string; sum: string }>`
    SELECT ${docCols}, COUNT(*) OVER () AS n, SUM(d.total) OVER () AS sum
      FROM accounting_events d JOIN branches b ON b.id = d.branch_id
     WHERE d.tenant_id = ${a.tenantId} AND d.status = 'posted' AND d.doc_type IN ('sale', 'sale_return')
       AND d.invoice_no IS NULL AND d.doc_date BETWEEN ${a.from}::date AND ${a.to}::date ${branchDoc}
     ORDER BY d.doc_date, d.doc_no`.execute(db);

  const abnormal = await sql<{ event_id: string; doc_no: string; invoice_no: string; invoice_serial: string; invoice_date: string; status: string; amount: string; branch_code: string }>`
    SELECT i.event_id, i.doc_no, i.invoice_no, i.invoice_serial, i.invoice_date::text AS invoice_date, i.status,
           (i.total_before_tax + i.total_tax) * i.sign AS amount, b.code AS branch_code
      FROM tax_invoices i JOIN branches b ON b.id = i.branch_id
     WHERE i.tenant_id = ${a.tenantId} AND i.direction = 'output' AND i.status <> 'valid'
       AND i.invoice_date BETWEEN ${a.from}::date AND ${a.to}::date ${branchInv}
     ORDER BY i.invoice_date, i.invoice_no`.execute(db);

  const duplicates = await sql<{ invoice_serial: string; invoice_no: string; n: string; docs: string; branch_codes: string }>`
    SELECT i.invoice_serial, i.invoice_no, COUNT(*) AS n, string_agg(i.doc_no, ', ' ORDER BY i.doc_no) AS docs, string_agg(DISTINCT b.code, ', ') AS branch_codes
      FROM tax_invoices i JOIN branches b ON b.id = i.branch_id
     WHERE i.tenant_id = ${a.tenantId} AND i.direction = 'output' AND i.status <> 'cancelled' AND i.sign = 1
       AND i.invoice_date BETWEEN ${a.from}::date AND ${a.to}::date ${branchInv}
     GROUP BY i.invoice_serial, i.invoice_no
    HAVING COUNT(*) > 1
     ORDER BY i.invoice_serial, i.invoice_no`.execute(db);

  // Số hoá đơn nhảy cóc theo từng ký hiệu, chỉ xét hoá đơn bán (không tính hàng trả lại).
  // Số hoá đơn có thể kèm chữ ở đầu (ví dụ "C26TNH31079"): lấy dãy chữ số CUỐI làm số thứ tự,
  // phần đứng trước ghép vào ký hiệu để mỗi dải số được xét riêng.
  const gaps = await sql<{ invoice_serial: string; first_no: string; last_no: string; issued: string; missing: string; sample: string | null }>`
    WITH nums AS (
      SELECT DISTINCT
             -- Phần chữ đứng đầu số hoá đơn thường chính là ký hiệu: không ghép lặp hai lần.
             CASE WHEN regexp_replace(i.invoice_no, '[0-9]+$', '') = '' THEN i.invoice_serial
                  WHEN i.invoice_serial = '' OR position(i.invoice_serial in i.invoice_no) = 1 THEN regexp_replace(i.invoice_no, '[0-9]+$', '')
                  ELSE i.invoice_serial || ' ' || regexp_replace(i.invoice_no, '[0-9]+$', '') END AS invoice_serial,
             substring(i.invoice_no from '[0-9]+$')::bigint AS n
        FROM tax_invoices i
       WHERE i.tenant_id = ${a.tenantId} AND i.direction = 'output' AND i.sign = 1 AND i.invoice_no ~ '[0-9]{1,15}$' AND i.invoice_no !~ '[0-9]{16,}$'
         AND i.invoice_date BETWEEN ${a.from}::date AND ${a.to}::date ${branchInv}
    ), edges AS (
      SELECT invoice_serial, n, LEAD(n) OVER (PARTITION BY invoice_serial ORDER BY n) AS next_n FROM nums
    )
    SELECT invoice_serial, MIN(n)::text AS first_no, MAX(n)::text AS last_no, COUNT(*)::text AS issued,
           COALESCE(SUM(GREATEST(next_n - n - 1, 0)), 0)::text AS missing,
           string_agg(CASE WHEN next_n - n > 1 THEN (n + 1)::text || CASE WHEN next_n - n > 2 THEN '–' || (next_n - 1)::text ELSE '' END END, ', ' ORDER BY n) AS sample
      FROM edges GROUP BY invoice_serial
    HAVING COALESCE(SUM(GREATEST(next_n - n - 1, 0)), 0) > 0
     ORDER BY invoice_serial`.execute(db);

  // --- Kiểm tra toàn vẹn sổ (bình thường cả ba mục đều rỗng).
  // Phiếu trả lại không nối được phiếu gốc: không gửi originalDocKey, phiếu gốc chưa nhận, hoặc phiếu gốc đã huỷ.
  const orphanReturns = await sql<DocRow & { original_key: string | null; original_status: string | null }>`
    SELECT ${docCols}, d.payload->>'originalDocKey' AS original_key, o.status AS original_status
      FROM accounting_events d JOIN branches b ON b.id = d.branch_id
      LEFT JOIN accounting_events o ON o.tenant_id = d.tenant_id AND o.doc_key = d.payload->>'originalDocKey'
     WHERE d.tenant_id = ${a.tenantId} AND d.status = 'posted' AND d.doc_type IN ('sale_return', 'purchase_return')
       AND d.doc_date BETWEEN ${a.from}::date AND ${a.to}::date ${branchDoc}
       AND (o.id IS NULL OR o.status = 'cancelled')
     ORDER BY d.doc_date, d.doc_no`.execute(db);

  // Chứng từ và bút toán lệch nhau: đã ghi sổ mà không còn bút toán hiệu lực, hoặc đã huỷ mà còn bút toán hiệu lực.
  const entryMismatch = await sql<DocRow & { active: string }>`
    SELECT ${docCols}, x.active
      FROM accounting_events d JOIN branches b ON b.id = d.branch_id
      CROSS JOIN LATERAL (
        SELECT COUNT(*) AS active FROM bizcity_read.ledger_entries e
         WHERE e.event_id = d.id AND e.status = 'posted' AND e.reverses_entry_id IS NULL) x
     WHERE d.tenant_id = ${a.tenantId} AND d.doc_date BETWEEN ${a.from}::date AND ${a.to}::date ${branchDoc}
       AND ((d.status = 'posted' AND x.active = 0 AND d.total <> 0) OR (d.status = 'cancelled' AND x.active > 0))
     ORDER BY d.doc_date, d.doc_no`.execute(db);

  // Sổ tổng hợp (số phát sinh theo ngày) lệch sổ chi tiết (dòng bút toán) trong kỳ.
  const branchLine = a.branchIds ? sql`AND l.branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
  const branchBal = a.branchIds ? sql`AND g.branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
  const balanceMismatch = await sql<{ branch_code: string; account_code: string; day: string; line_debit: string; line_credit: string; bal_debit: string; bal_credit: string }>`
    WITH li AS (
      SELECT l.branch_id, l.account_code, l.posting_date, SUM(l.debit) AS debit, SUM(l.credit) AS credit
        FROM bizcity_read.ledger_lines l
       WHERE l.tenant_id = ${a.tenantId} AND l.posting_date BETWEEN ${a.from}::date AND ${a.to}::date ${branchLine}
       GROUP BY 1, 2, 3
    ), ba AS (
      SELECT g.branch_id, g.account_code, g.posting_date, SUM(g.debit) AS debit, SUM(g.credit) AS credit
        FROM bizcity_read.ledger_balances_daily g
       WHERE g.tenant_id = ${a.tenantId} AND g.posting_date BETWEEN ${a.from}::date AND ${a.to}::date ${branchBal}
       GROUP BY 1, 2, 3
    )
    SELECT b.code AS branch_code, COALESCE(li.account_code, ba.account_code) AS account_code,
           COALESCE(li.posting_date, ba.posting_date)::text AS day,
           COALESCE(li.debit, 0) AS line_debit, COALESCE(li.credit, 0) AS line_credit, COALESCE(ba.debit, 0) AS bal_debit, COALESCE(ba.credit, 0) AS bal_credit
      FROM li FULL JOIN ba USING (branch_id, account_code, posting_date)
      JOIN branches b ON b.id = COALESCE(li.branch_id, ba.branch_id)
     WHERE COALESCE(li.debit, 0) <> COALESCE(ba.debit, 0) OR COALESCE(li.credit, 0) <> COALESCE(ba.credit, 0)
     ORDER BY 3, 2`.execute(db);

  return {
    orphanReturns: {
      count: orphanReturns.rows.length,
      rows: orphanReturns.rows.map((r) => doc(r, !r.original_key ? 'Không gửi mã phiếu gốc' : r.original_status === 'cancelled' ? `Phiếu gốc ${r.original_key} đã huỷ` : `Chưa nhận phiếu gốc ${r.original_key}`)),
    },
    entryMismatch: { count: entryMismatch.rows.length, rows: entryMismatch.rows.map((r) => doc(r, r.status === 'cancelled' ? `Đã huỷ nhưng còn ${r.active} bút toán hiệu lực` : 'Đã ghi sổ nhưng không có bút toán hiệu lực')) },
    balanceMismatch: {
      count: balanceMismatch.rows.length,
      rows: balanceMismatch.rows.map((r) => ({ branchCode: r.branch_code, accountCode: r.account_code, day: r.day, lineDebit: toNumber(r.line_debit), lineCredit: toNumber(r.line_credit), balanceDebit: toNumber(r.bal_debit), balanceCredit: toNumber(r.bal_credit) })),
    },
    errors: { count: errors.rows.length, rows: errors.rows.map((r) => doc(r)) },
    noInvoice: { count: Number(noInvoice.rows[0]?.n ?? 0), total: toNumber(noInvoice.rows[0]?.sum ?? 0), rows: noInvoice.rows.map((r) => doc(r)) },
    abnormalInvoices: {
      count: abnormal.rows.length,
      rows: abnormal.rows.map((r) => ({ id: r.event_id, docNo: r.doc_no, invoiceNo: r.invoice_no, invoiceSerial: r.invoice_serial, invoiceDate: r.invoice_date, status: r.status, amount: toNumber(r.amount), branchCode: r.branch_code })),
    },
    duplicateInvoices: { count: duplicates.rows.length, rows: duplicates.rows.map((r) => ({ invoiceSerial: r.invoice_serial, invoiceNo: r.invoice_no, times: Number(r.n), docs: r.docs, branchCodes: r.branch_codes })) },
    invoiceGaps: {
      count: gaps.rows.length,
      rows: gaps.rows.map((r) => ({ invoiceSerial: r.invoice_serial, firstNo: r.first_no, lastNo: r.last_no, issued: Number(r.issued), missing: Number(r.missing), sample: (r.sample ?? '').slice(0, 300) })),
    },
  };
}

/**
 * Công nợ theo tuổi nợ tính theo HẠN THANH TOÁN của từng khoản công nợ (ACC67, ACC67A, ACC67B).
 *
 * Mỗi khoản công nợ (một chứng từ của một đối tượng trên một tài khoản) có ngày chứng từ và hạn thanh toán.
 * Số còn nợ tại ngày xem = số tiền khoản đó trừ các lần đối trừ có ngày ≤ ngày xem; khoản làm giảm nợ
 * (trả tiền, hàng trả lại chưa đối trừ) mang dấu âm. Số ngày quá hạn = ngày xem − hạn thanh toán:
 *   hạn trùng ngày chứng từ          → "Không có hạn nợ"
 *   chưa tới hạn (≤ 0 ngày quá hạn)  → TRƯỚC HẠN, chia theo số ngày còn lại tới hạn: 1..n | n+1..2n | 2n+1..3n | 3n+1..4n | trên 4n
 *   đã quá hạn (> 0)                → QUÁ HẠN, chia theo số ngày quá hạn cùng các bậc đó
 * (n = bước nhảy). Khoản tới hạn đúng ngày xem tính vào "trước hạn 1..n".
 */
export async function agingByDue(a: { tenantId: string; asOf: string; branchIds: string[] | null; accountPrefix: string; step: number; partnerCode?: string; groupCode?: string }) {
  const payable = a.accountPrefix.startsWith('3');
  const branchFilter = a.branchIds ? sql`AND i.branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
  const partnerFilter = a.partnerCode ? sql`AND p.code = ${a.partnerCode}` : sql``;
  const groupFilter = a.groupCode ? sql`AND p.group_code = ${a.groupCode}` : sql``;
  const res = await sql<{ partner_id: string; code: string; name: string; group_code: string | null; side: string; doc_date: string; due_date: string; remaining: string }>`
    SELECT i.partner_id, p.code, p.name, p.group_code, i.side, i.doc_date::text AS doc_date, i.due_date::text AS due_date,
           i.amount - COALESCE((SELECT SUM(x.amount) FROM debt_allocations x
                                 WHERE (x.debit_item_id = i.id OR x.credit_item_id = i.id) AND x.alloc_date <= ${a.asOf}::date), 0) AS remaining
      FROM debt_items i JOIN partners p ON p.id = i.partner_id
     WHERE i.tenant_id = ${a.tenantId} AND i.account_code LIKE ${a.accountPrefix + '%'} AND i.doc_date <= ${a.asOf}::date
       ${branchFilter} ${partnerFilter} ${groupFilter}`.execute(db);

  const s = a.step;
  const slot = (days: number) => Math.min(4, Math.floor((days - 1) / s));
  const asOfMs = Date.parse(a.asOf);
  type Acc = { code: string; name: string; groupCode: string; total: number; noTerm: number; before: number[]; beforeTotal: number; over: number[]; overTotal: number };
  const by = new Map<string, Acc>();
  for (const r of res.rows) {
    // Khoản làm tăng nợ: phải thu → khoản ghi Nợ; phải trả → khoản ghi Có.
    const sign = (r.side === 'debit') !== payable ? 1 : -1;
    const cents = toCents(toNumber(r.remaining)) * sign;
    if (!cents) continue;
    const acc = by.get(r.partner_id) ?? { code: r.code, name: r.name, groupCode: r.group_code ?? '', total: 0, noTerm: 0, before: [0, 0, 0, 0, 0], beforeTotal: 0, over: [0, 0, 0, 0, 0], overTotal: 0 };
    by.set(r.partner_id, acc);
    acc.total += cents;
    const overdue = Math.round((asOfMs - Date.parse(r.due_date)) / 86_400_000);
    if (r.due_date === r.doc_date) acc.noTerm += cents;
    else if (overdue <= 0) { acc.before[slot(Math.max(1, -overdue))]! += cents; acc.beforeTotal += cents; }
    else { acc.over[slot(overdue)]! += cents; acc.overTotal += cents; }
  }
  const rows = [...by.values()]
    .filter((x) => x.total !== 0)
    .sort((x, y) => x.code.localeCompare(y.code))
    .map((x) => ({
      partnerCode: x.code, partnerName: x.name, groupCode: x.groupCode, total: fromCents(x.total), noTerm: fromCents(x.noTerm),
      before: x.before.map(fromCents), beforeTotal: fromCents(x.beforeTotal), over: x.over.map(fromCents), overTotal: fromCents(x.overTotal),
    }));
  const ranges = [`1 - ${s}`, `${s + 1} - ${2 * s}`, `${2 * s + 1} - ${3 * s}`, `${3 * s + 1} - ${4 * s}`, `Trên ${4 * s}`];
  return { asOf: a.asOf, step: s, side: payable ? ('credit' as const) : ('debit' as const), ranges, rows };
}

/**
 * Sổ công nợ theo hạn thanh toán (ACC39) trong khoảng ngày, theo từng đối tượng:
 *   dòng đối tượng : Dư đầu kỳ, Ps Nợ, Ps Có, Dư cuối kỳ
 *   dòng chứng từ  : khoản công nợ phát sinh trong kỳ — Ngày CT, Số CT, Hạn TT (số ngày), Ngày phải TT, Ps Nợ, Ps Có.
 *                    Khoản làm tăng nợ (bán chịu, mua chịu): Ps của khoản, cột bên kia là số đã thanh toán trong kỳ.
 *                    Khoản làm giảm nợ còn lại sau khi đã trừ vào các chứng từ trong kỳ: một dòng riêng.
 *   dòng thanh toán: dưới mỗi khoản tăng nợ, các phiếu đã trừ vào khoản đó trong kỳ — Số, Ngày, Giá trị.
 * Chỉ tính các lần đối trừ mà hai khoản đều phát sinh trong kỳ, nên Dư cuối = Dư đầu + Ps Nợ − Ps Có (phải thu).
 */
export async function debtByTerm(a: { tenantId: string; from: string; to: string; branchIds: string[] | null; accountPrefix: string; partnerCode?: string; groupCode?: string }) {
  const payable = a.accountPrefix.startsWith('3');
  const incSide = payable ? 'credit' : 'debit';
  const branchFilter = a.branchIds ? sql`AND i.branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
  const partnerFilter = a.partnerCode ? sql`AND p.code = ${a.partnerCode}` : sql``;
  const groupFilter = a.groupCode ? sql`AND p.group_code = ${a.groupCode}` : sql``;
  type Item = { id: string; partner_id: string; code: string; name: string; side: string; amount: string; doc_no: string; doc_date: string; due_date: string; description: string | null; emp_code: string | null; emp_name: string | null; branch_code: string };
  const items = await sql<Item>`
    SELECT i.id, i.partner_id, p.code, p.name, i.side, i.amount, i.doc_no, i.doc_date::text AS doc_date, i.due_date::text AS due_date,
           e.payload->>'description' AS description,
           COALESCE(e.payload->'employee'->>'code', e.payload->>'employeeCode') AS emp_code, e.payload->'employee'->>'name' AS emp_name, b.code AS branch_code
      FROM debt_items i JOIN partners p ON p.id = i.partner_id JOIN accounting_events e ON e.id = i.event_id JOIN branches b ON b.id = i.branch_id
     WHERE i.tenant_id = ${a.tenantId} AND i.account_code LIKE ${a.accountPrefix + '%'} AND i.doc_date <= ${a.to}::date
       ${branchFilter} ${partnerFilter} ${groupFilter}
     ORDER BY p.code, i.doc_date, i.doc_no, i.id`.execute(db);
  const ids = items.rows.filter((i) => i.doc_date >= a.from).map((i) => i.id);
  const allocs = ids.length
    ? await db.selectFrom('debt_allocations').select(['debit_item_id', 'credit_item_id', 'amount', 'alloc_date'])
        .where('tenant_id', '=', a.tenantId).where('debit_item_id', 'in', ids).where('credit_item_id', 'in', ids)
        .where('alloc_date', '>=', a.from).where('alloc_date', '<=', a.to).execute()
    : [];
  const byId = new Map(items.rows.map((i) => [i.id, i]));
  const empNames = new Map<string, string>();
  const empCodes = [...new Set(items.rows.map((i) => i.emp_code).filter((c): c is string => Boolean(c)))];
  if (empCodes.length) for (const e of await db.selectFrom('dimensions').select(['code', 'name']).where('tenant_id', '=', a.tenantId).where('kind', '=', 'employee').where('code', 'in', empCodes).execute()) empNames.set(e.code, e.name);

  // Đối trừ của từng khoản tăng nợ (khoản giảm nợ đã trừ vào nó) và tổng đã trừ của từng khoản giảm nợ.
  const paysOf = new Map<string, { item: Item; amount: number }[]>();
  const usedOf = new Map<string, number>();
  for (const x of allocs) {
    const inc = incSide === 'debit' ? x.debit_item_id : x.credit_item_id;
    const dec = incSide === 'debit' ? x.credit_item_id : x.debit_item_id;
    const cents = toCents(toNumber(x.amount));
    paysOf.set(inc, [...(paysOf.get(inc) ?? []), { item: byId.get(dec)!, amount: cents }]);
    usedOf.set(dec, (usedOf.get(dec) ?? 0) + cents);
  }

  type Out = {
    kind: 'partner' | 'doc' | 'pay'; partnerCode: string; partnerName: string; docDate: string; docNo: string; description: string; termDays: number | null; dueDate: string;
    opening: number; debit: number; credit: number; closing: number; payNo: string; payDate: string; payAmount: number; employeeCode: string; employeeName: string; branchCode: string;
  };
  const blank = { docDate: '', docNo: '', description: '', termDays: null, dueDate: '', opening: 0, debit: 0, credit: 0, closing: 0, payNo: '', payDate: '', payAmount: 0, employeeCode: '', employeeName: '', branchCode: '' };
  const out: Out[] = [];
  const totals = { opening: 0, debit: 0, credit: 0, closing: 0, payAmount: 0 };
  for (const pid of [...new Set(items.rows.map((i) => i.partner_id))]) {
    const mine = items.rows.filter((i) => i.partner_id === pid);
    const first = mine[0]!;
    // Số dư theo chiều tăng nợ (phải thu: Nợ − Có; phải trả: Có − Nợ).
    const signed = (i: Item) => (i.side === incSide ? 1 : -1) * toCents(toNumber(i.amount));
    const opening = mine.filter((i) => i.doc_date < a.from).reduce((s, i) => s + signed(i), 0);
    const docs: Out[] = [];
    let debit = 0;
    let credit = 0;
    for (const i of mine.filter((x) => x.doc_date >= a.from)) {
      const amt = toCents(toNumber(i.amount));
      const base = { ...blank, partnerCode: first.code, partnerName: first.name, docDate: i.doc_date, docNo: i.doc_no, description: i.description ?? '', employeeCode: i.emp_code ?? '', employeeName: empNames.get(i.emp_code ?? '') ?? i.emp_name ?? '', branchCode: i.branch_code };
      if (i.side === incSide) {
        const pays = paysOf.get(i.id) ?? [];
        const paid = pays.reduce((s, x) => s + x.amount, 0);
        const term = Math.round((Date.parse(i.due_date) - Date.parse(i.doc_date)) / 86_400_000);
        const d = incSide === 'debit' ? amt : paid;
        const c = incSide === 'debit' ? paid : amt;
        debit += d;
        credit += c;
        docs.push({ ...base, kind: 'doc', termDays: term, dueDate: term ? i.due_date : '', debit: fromCents(d), credit: fromCents(c) });
        for (const x of pays) {
          docs.push({ ...blank, kind: 'pay', partnerCode: first.code, partnerName: first.name, payNo: x.item.doc_no, payDate: x.item.doc_date, payAmount: fromCents(x.amount), branchCode: x.item.branch_code });
          totals.payAmount += x.amount;
        }
      } else {
        const rest = amt - (usedOf.get(i.id) ?? 0);
        if (rest <= 0) continue;
        const d = i.side === 'debit' ? rest : 0;
        const c = i.side === 'credit' ? rest : 0;
        debit += d;
        credit += c;
        docs.push({ ...base, kind: 'doc', debit: fromCents(d), credit: fromCents(c) });
      }
    }
    if (!opening && !docs.length) continue;
    const closing = opening + (incSide === 'debit' ? debit - credit : credit - debit);
    totals.opening += opening;
    totals.debit += debit;
    totals.credit += credit;
    totals.closing += closing;
    out.push({ ...blank, kind: 'partner', partnerCode: first.code, partnerName: first.name, description: first.name, opening: fromCents(opening), debit: fromCents(debit), credit: fromCents(credit), closing: fromCents(closing) });
    out.push(...docs);
  }
  return {
    side: payable ? ('credit' as const) : ('debit' as const),
    rows: out,
    totals: { opening: fromCents(totals.opening), debit: fromCents(totals.debit), credit: fromCents(totals.credit), closing: fromCents(totals.closing), payAmount: fromCents(totals.payAmount) },
  };
}
