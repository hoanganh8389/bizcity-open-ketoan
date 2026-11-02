// [2026-11-02 10:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — lane cho hai kiểm L3 của lớp Doanh nghiệp (S020-19, Q020-6): tồn kho âm, việc cuối kỳ chưa xong.
/**
 * Lớp Doanh nghiệp của Conformance Engine (ADR-0012) — kiểm trên CSDL thật, CHỈ ĐỌC, cùng mã với kiểm L3 trong app
 * (packages/kernel/src/modules/periods/period.diagnostics.ts, R-DIAG-9). Mức warn (enforce info): phân tích để người dùng
 * quyết định, không chặn ghi sổ (R-VNC-10). Không viết số tài khoản: tháng cần kết chuyển đọc từ closing_rules của đơn vị; đơn vị chưa
 * lưu bộ riêng thì dùng bộ mặc định đọc từ mã Kernel (DEFAULT_CLOSING_RULES trong closing.service.ts — như DG-DB-2 đọc migration).
 * Ngưỡng 30 ngày sau cuối tháng là quy chế nội bộ (miền internal), không phải luật.
 */
import { sqlCheck } from '../lib/diag.mjs';

const COSTED = "('sale', 'sale_return', 'transfer_out', 'transfer_in', 'adjust_out', 'adjust_in')";
const CLOSING_SERVICE = 'packages/kernel/src/modules/closing/closing.service.ts';

/** Đầu số nguồn của bộ mặc định (bỏ bước "lấy cả số dư đầu kỳ" và đầu số con) — cùng luật với DEFAULT_CLOSING_SOURCES của app. */
export function defaultClosingSources(text) {
  const block = /DEFAULT_CLOSING_RULES[^=]*=\s*\[([\s\S]*?)\n\];/.exec(text ?? '')?.[1] ?? '';
  const rules = [...block.matchAll(/\{[^}]*\}/g)].map((m) => ({
    from: /fromAccount:\s*'(\d+)'/.exec(m[0])?.[1], active: /isActive:\s*true/.test(m[0]), opening: /includeOpening:\s*true/.test(m[0]),
  })).filter((r) => r.from);
  const opening = rules.filter((r) => r.active && r.opening).map((r) => r.from);
  return rules.filter((r) => r.active && !opening.some((p) => r.from.startsWith(p))).map((r) => r.from);
}

/** Số dư số lượng cuối ngày theo (đơn vị, chi nhánh, kho, mã hàng), luỹ kế từ dòng kho đầu tiên. */
const BALANCES = `WITH d AS (SELECT m.tenant_id, m.branch_id, m.warehouse_code, m.sku, m.doc_date, sum(m.qty) AS q
                    FROM inventory_movements m GROUP BY 1, 2, 3, 4, 5),
     r AS (SELECT d.*, sum(d.q) OVER (PARTITION BY d.tenant_id, d.branch_id, d.warehouse_code, d.sku ORDER BY d.doc_date) AS bal FROM d)`;

/** (đơn vị, chi nhánh, tháng) có bút toán, tháng đã kết thúc quá 30 ngày; kèm bốn tín hiệu cuối kỳ — cùng chữ với app. */
const closeState = (defaults) => `WITH rules AS (SELECT r.tenant_id, r.from_account AS prefix FROM closing_rules r
                  WHERE r.is_active
                    AND NOT EXISTS (SELECT 1 FROM closing_rules o WHERE o.tenant_id = r.tenant_id AND o.is_active AND o.include_opening
                                      AND r.from_account LIKE o.from_account || '%')
                 UNION ALL
                 SELECT t.id, d.prefix FROM tenants t, unnest(ARRAY[${defaults.map((p) => `'${p}'`).join(', ')}]::text[]) AS d(prefix)
                  WHERE NOT EXISTS (SELECT 1 FROM closing_rules r WHERE r.tenant_id = t.id)),
  u AS (SELECT l.tenant_id, l.branch_id, date_trunc('month', l.posting_date)::date AS m
               FROM ledger_lines l
              WHERE l.posting_date < date_trunc('month', current_date - 30)::date
              GROUP BY 1, 2, 3),
  c AS (SELECT u.*, to_char(u.m, 'YYYY-MM') AS ym,
    EXISTS (SELECT 1 FROM inventory_movements mv
             WHERE mv.tenant_id = u.tenant_id AND mv.branch_id = u.branch_id AND mv.amount IS NULL AND mv.qty <> 0
               AND mv.kind IN ${COSTED} AND mv.doc_date >= u.m AND mv.doc_date < (u.m + interval '1 month')::date) AS need_cogs,
    (SELECT max(e.created_at) FROM accounting_events a JOIN ledger_entries e ON e.event_id = a.id AND e.status = 'posted' AND NOT e.is_reversal
      WHERE a.tenant_id = u.tenant_id AND a.branch_id = u.branch_id AND a.doc_type = 'cogs' AND a.status = 'posted'
        AND a.doc_key LIKE 'cogs:%:' || to_char(u.m, 'YYYY-MM')) AS cogs_at,
    EXISTS (SELECT 1 FROM ledger_lines l2 JOIN ledger_entries e2 ON e2.id = l2.entry_id
             WHERE l2.tenant_id = u.tenant_id AND l2.branch_id = u.branch_id AND e2.doc_type <> 'closing'
               AND l2.posting_date >= u.m AND l2.posting_date < (u.m + interval '1 month')::date
               AND EXISTS (SELECT 1 FROM rules r WHERE r.tenant_id = u.tenant_id AND l2.account_code LIKE r.prefix || '%')
             GROUP BY l2.account_code HAVING sum(l2.debit - l2.credit) <> 0) AS need_close,
    (SELECT max(e.created_at) FROM accounting_events a JOIN ledger_entries e ON e.event_id = a.id AND e.status = 'posted' AND NOT e.is_reversal
      WHERE a.tenant_id = u.tenant_id AND a.branch_id = u.branch_id AND a.doc_type = 'closing' AND a.status = 'posted'
        AND a.doc_key LIKE 'closing:%:' || to_char(u.m, 'YYYY-MM')) AS close_at,
    EXISTS (SELECT 1 FROM fiscal_periods p JOIN period_locks k ON k.period_id = p.id AND k.tenant_id = p.tenant_id
             WHERE p.tenant_id = u.tenant_id AND p.year = extract(year FROM u.m) AND p.month = extract(month FROM u.m)
               AND (k.branch_id IS NULL OR k.branch_id = u.branch_id) AND k.doc_type = '*') AS locked
    FROM u)`;

export const checks = [
  sqlCheck({
    id: 'DG-INV-1', code: 'INVENTORY_NEGATIVE',
    title: 'Không có tồn kho âm theo mặt hàng × kho × ngày',
    rules: ['R-VNC-10'], conf: [], tier: 2, enforce: 'info', weight: 1, contract: 'kernel',
    count: 'SELECT count(*)::int AS n FROM (SELECT DISTINCT tenant_id, branch_id, warehouse_code, sku FROM inventory_movements) x',
    sql: `${BALANCES}
          SELECT t.code AS tenant, b.code || ':' || CASE WHEN r.warehouse_code = '' THEN '-' ELSE r.warehouse_code END || ':' || r.sku AS key,
                 json_build_object('first_negative', min(r.doc_date), 'min_qty', min(r.bal)) AS detail
            FROM r JOIN tenants t ON t.id = r.tenant_id JOIN branches b ON b.id = r.branch_id
           WHERE r.bal < 0
           GROUP BY t.code, b.code, r.warehouse_code, r.sku
           ORDER BY min(r.doc_date) LIMIT 200`,
  }),
  closeCheck({
    id: 'DG-CLOSE-1', code: 'PERIOD_CLOSE_OPEN',
    title: 'Tháng đã qua quá 30 ngày có đủ việc cuối kỳ theo thứ tự: tính giá vốn, kết chuyển, khoá sổ',
    rules: ['R-VNC-10'], conf: [], tier: 2, enforce: 'info', weight: 1, contract: 'kernel',
    count: (cs) => `${cs} SELECT count(*)::int AS n FROM c`,
    sql: (cs) => `${cs}
          SELECT t.code AS tenant, b.code || ':' || c.ym AS key,
                 json_build_object('missing', concat_ws('+',
                   CASE WHEN c.need_cogs AND c.cogs_at IS NULL THEN 'gia-von' END,
                   CASE WHEN c.need_close AND c.close_at IS NULL THEN 'ket-chuyen' END,
                   CASE WHEN c.cogs_at > c.close_at THEN 'thu-tu' END,
                   CASE WHEN NOT c.locked THEN 'khoa-so' END)) AS detail
            FROM c JOIN tenants t ON t.id = c.tenant_id JOIN branches b ON b.id = c.branch_id
           WHERE (c.need_cogs AND c.cogs_at IS NULL) OR (c.need_close AND c.close_at IS NULL) OR c.cogs_at > c.close_at OR NOT c.locked
           ORDER BY c.m, t.code, b.code LIMIT 200`,
  }),
];

/** sqlCheck mà SQL dựng lúc chạy: bộ quy tắc mặc định đọc từ mã Kernel của Core. Không đọc được thì báo, không đoán. */
function closeCheck({ count, sql, ...meta }) {
  const shell = sqlCheck({ ...meta, count: '', sql: '' });
  return {
    ...shell,
    async run(ctx) {
      const defaults = defaultClosingSources(ctx.core.read(CLOSING_SERVICE));
      if (!defaults.length) throw new Error(`không đọc được DEFAULT_CLOSING_RULES ở ${CLOSING_SERVICE}`);
      const cs = closeState(defaults);
      return sqlCheck({ ...meta, count: count(cs), sql: sql(cs) }).run(ctx);
    },
  };
}
