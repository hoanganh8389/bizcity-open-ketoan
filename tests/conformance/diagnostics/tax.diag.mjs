// [2026-11-02 06:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-11: lane cho bốn kiểm L3 thuế GTGT và hoá đơn (C03 vat-vn, C04 einvoice-vn).
/**
 * Thuế GTGT và hoá đơn — kiểm trên CSDL thật, CHỈ ĐỌC, cùng mã với kiểm L3 trong app
 * (packages/kernel/src/modules/tax-info/tax.diagnostics.ts, R-DIAG-9). Mức warn (enforce info), không chặn (R-VNC-10).
 * Thời gian thuế suất giảm đọc từ tham số ca vn.vat-vn.rate.reduced_window.001; ngưỡng 5 triệu và luật trường hoá đơn là bản chép
 * của taxIssues / NON_CASH_THRESHOLD (packages/kernel/src/modules/tax-info/tax-info.service.ts) — đổi bên kia thì đổi ở đây.
 */
import { sqlCheck } from '../lib/diag.mjs';

const REDUCED_CASE = 'packages/vn-rulepacks/rulepacks/vat-vn/cases/rate-reduced_window.json';
/** Bản chép của tax-info.service.ts. */
const NON_CASH_THRESHOLD = 5_000_000;
const TAX_CODE_RE = /^(\d{10}(-\d{3})?|\d{12})$/;

const INVOICES = `SELECT t.code AS tenant, i.doc_no, i.direction, i.invoice_serial, i.buyer_name, i.buyer_tax_code,
                         (i.total_before_tax + i.total_tax)::float8 AS total, i.deductible, i.payment_ref, i.sign
                    FROM tax_invoices i JOIN tenants t ON t.id = i.tenant_id WHERE i.status = 'valid'`;

/** Điểm thiếu về trường hoá đơn (taxIssues: ký hiệu, tên / mã số thuế người bán, dạng mã số thuế). */
function fieldIssues(r) {
  const out = [];
  if (!r.invoice_serial) out.push('Thiếu ký hiệu hoá đơn');
  if (r.direction === 'input' && !r.buyer_name) out.push('Thiếu tên người bán');
  if (r.direction === 'input' && !r.buyer_tax_code) out.push('Thiếu mã số thuế người bán');
  if (r.buyer_tax_code && !TAX_CODE_RE.test(r.buyer_tax_code.replace(/\s/g, ''))) out.push('Mã số thuế không đúng dạng');
  return out;
}
const noncash = (r) => r.direction === 'input' && r.sign > 0 && r.deductible && r.total >= NON_CASH_THRESHOLD && !r.payment_ref;

export const checks = [
  {
    ...sqlCheck({ id: 'DG-VAT-1', code: 'VAT_REDUCED_RATE', title: 'Thuế suất GTGT giảm (8%) chỉ dùng cho hàng bán ra trong thời gian giảm theo nghị quyết', rules: ['R-VNC-5'], conf: [], tier: 2, enforce: 'info', weight: 1, count: '', sql: '' }),
    async run(ctx) {
      const p = ctx.core.json(REDUCED_CASE)?.scenario?.params;
      const rate = Number(p?.reduced_rate);
      if (!p || !Number.isFinite(rate) || !/^\d{4}-\d{2}-\d{2}$/.test(p.from ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(p.to ?? '')) throw new Error(`thiếu / sai tham số ở ${REDUCED_CASE}`);
      const base = `FROM sales_lines l JOIN tax_codes tc ON tc.tenant_id = l.tenant_id AND tc.code = l.tax_code AND tc.direction = 'output'
                    WHERE l.amount_before_tax <> 0 AND tc.rate = ${rate}`;
      return sqlCheck({
        id: 'DG-VAT-1', code: 'VAT_REDUCED_RATE', title: '', rules: ['R-VNC-5'], conf: [], tier: 2, enforce: 'info', weight: 1,
        count: `SELECT count(*)::int AS n ${base}`,
        sql: `SELECT t.code AS tenant, a.doc_key AS key, json_build_object('doc_date', min(a.doc_date)) AS detail
                ${base.replace('FROM sales_lines l', 'FROM sales_lines l JOIN accounting_events a ON a.id = l.event_id JOIN tenants t ON t.id = l.tenant_id')}
                  AND (l.doc_date < DATE '${p.from}' OR l.doc_date > DATE '${p.to}')
                GROUP BY t.code, a.doc_key LIMIT 200`,
      }).run(ctx);
    },
  },
  {
    id: 'DG-VAT-2', code: 'VAT_INPUT_NONCASH', title: 'Hoá đơn mua vào từ 5 triệu đồng (gồm thuế) được khấu trừ có chứng từ thanh toán không dùng tiền mặt',
    gate: 'CONF-RUN', contract: 'kernel', rules: ['R-VNC-5'], conf: [], tier: 2, enforce: 'info', weight: 1,
    async run(ctx) {
      const rows = (await ctx.db.query(INVOICES)).filter((r) => r.direction === 'input');
      const bad = rows.filter(noncash);
      return { examined: rows.length, unitBy: 'key', findings: bad.slice(0, 200).map((r) => ctx.finding(null, null, `[${r.tenant}] ${r.doc_no}`, `${r.tenant}:${r.doc_no}`)), metrics: { code: 'VAT_INPUT_NONCASH' } };
    },
  },
  {
    id: 'DG-EINV-1', code: 'INVOICE_FIELDS', title: 'Hoá đơn trong sổ có đủ ký hiệu, tên và mã số thuế người bán (mua vào), mã số thuế đúng dạng',
    gate: 'CONF-RUN', contract: 'kernel', rules: ['R-VNC-5'], conf: [], tier: 2, enforce: 'info', weight: 1,
    async run(ctx) {
      const rows = await ctx.db.query(INVOICES);
      const bad = rows.map((r) => ({ r, miss: fieldIssues(r) })).filter((x) => x.miss.length);
      return { examined: rows.length, unitBy: 'key', findings: bad.slice(0, 200).map(({ r, miss }) => ctx.finding(null, null, `[${r.tenant}] ${r.doc_no}: ${miss.join(', ')}`, `${r.tenant}:${r.doc_no}`)), metrics: { code: 'INVOICE_FIELDS' } };
    },
  },
  sqlCheck({
    id: 'DG-EINV-2', code: 'INVOICE_ISSUE_DATE', title: 'Hoá đơn bán hàng hoá lập không sau ngày chứng từ bán (thời điểm chuyển giao)',
    rules: ['R-VNC-5'], conf: [], tier: 2, enforce: 'info', weight: 1,
    count: "SELECT count(*)::int AS n FROM tax_invoices WHERE direction = 'output' AND doc_type = 'sale' AND status = 'valid'",
    sql: `SELECT t.code AS tenant, a.doc_key AS key, json_build_object('doc_date', i.doc_date, 'invoice_date', i.invoice_date) AS detail
          FROM tax_invoices i JOIN accounting_events a ON a.id = i.event_id JOIN tenants t ON t.id = i.tenant_id
          WHERE i.direction = 'output' AND i.doc_type = 'sale' AND i.status = 'valid' AND i.invoice_date > i.doc_date
          ORDER BY i.doc_date LIMIT 200`,
  }),
  // [2026-11-06 10:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — E6 đợt 1 (S029-13): DG-REC-1 VAT_INPUT_INVOICE_MATCH — thuế đầu vào ròng trên sổ ↔ thuế trên sổ hoá đơn của cùng sự việc (cùng mã với ledger.diagnostics.ts)
  sqlCheck({
    id: 'DG-REC-1', code: 'VAT_INPUT_INVOICE_MATCH',
    title: 'Thuế GTGT đầu vào trên sổ khớp thuế trên sổ hoá đơn của cùng chứng từ (lệch không quá 0,5 đồng)',
    rules: ['R-REV-6'], conf: [], tier: 2, enforce: 'info', weight: 1,
    count: `SELECT count(DISTINCT i.event_id)::int AS n FROM tax_invoices i WHERE i.direction = 'input' AND i.status IN ('valid', 'adjusted')`,
    sql: `WITH so AS (
            SELECT e.tenant_id, e.event_id, sum(l.debit - l.credit) AS amt
              FROM ledger_entries e JOIN ledger_lines l ON l.entry_id = e.id
             WHERE l.account_code IN (SELECT tc.account_code FROM tax_codes tc WHERE tc.tenant_id = e.tenant_id AND tc.direction = 'input' AND tc.account_code IS NOT NULL
                                      UNION SELECT d.account_code FROM posting_defaults d WHERE d.tenant_id = e.tenant_id AND d.key = 'tax_input')
             GROUP BY e.tenant_id, e.event_id),
          hd AS (SELECT i.event_id, sum(i.total_tax * i.sign) AS amt FROM tax_invoices i WHERE i.direction = 'input' AND i.status IN ('valid', 'adjusted') GROUP BY i.event_id)
          SELECT t.code AS tenant, a.doc_key AS key, json_build_object('doc_type', a.doc_type, 'doc_date', a.doc_date) AS detail
            FROM so JOIN hd ON hd.event_id = so.event_id JOIN accounting_events a ON a.id = so.event_id JOIN tenants t ON t.id = so.tenant_id
           WHERE a.status = 'posted' AND abs(so.amt - hd.amt) > 0.5
           ORDER BY a.doc_date LIMIT 200`,
  }),
];
