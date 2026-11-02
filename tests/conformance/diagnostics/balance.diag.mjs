// [2026-11-02 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W2: lane cho kiểm số dư, kho, khấu hao, lịch kiểm chuẩn — DG-CASH-1, DG-ACC-1, DG-STK-1, DG-STK-2, DG-FA-1, DG-CONF-1 (DG-PLAN-1, DG-PLAN-4 ở ledger.diag.mjs).
/**
 * Kiểm trên CSDL thật, CHỈ ĐỌC, cùng mã với app (R-DIAG-9):
 *   packages/kernel/src/modules/ledger/balance.diagnostics.ts      CASH_NEGATIVE, ACCOUNT_WRONG_SIDE (+ TRANSIT_NONZERO, DEBT_MATCH_LEDGER)
 *   packages/kernel/src/modules/inventory/inventory.diagnostics.ts COGS_STALE, STOCK_ADJUST_NO_REASON
 *   apps/api/src/modules/assets/asset.diagnostics.ts               DEPRECIATION_OPEN
 *   packages/kernel/src/modules/conformance/conformance.diagnostics.ts CONFORMANCE_STALE
 * Mức warn (enforce info). Không số tiền trong mẫu. Tài khoản tiền mặt đọc từ tài khoản ngầm định của đơn vị.
 */
import { sqlCheck } from '../lib/diag.mjs';

const CASH = `(SELECT a.code FROM accounts a WHERE a.tenant_id = l.tenant_id
                 AND EXISTS (SELECT 1 FROM posting_defaults d WHERE d.tenant_id = a.tenant_id AND d.key = 'cash' AND a.code LIKE d.account_code || '%'))`;
const COGS = `SELECT a.tenant_id, a.branch_id, right(a.doc_key, 7) AS ym, max(e.created_at) AS at
                FROM accounting_events a JOIN ledger_entries e ON e.event_id = a.id AND e.status = 'posted' AND NOT e.is_reversal
               WHERE a.doc_type = 'cogs' AND a.status = 'posted' GROUP BY 1, 2, 3`;
const DUE = `WITH m AS (SELECT gs::date AS ms, (gs + interval '1 month - 1 day')::date AS me
               FROM generate_series(date_trunc('month', current_date - 30) - interval '24 months', date_trunc('month', current_date - 30) - interval '1 month', interval '1 month') gs),
       u AS (SELECT a.tenant_id, a.id AS asset_id, a.branch_id, m.ms, to_char(m.ms, 'YYYY-MM') AS ym,
                    (extract(year FROM m.ms) * 12 + extract(month FROM m.ms) - 1)::int AS idx
               FROM assets a JOIN m ON a.start_date <= m.me
                AND (a.start_date + make_interval(months => a.useful_life_months)) > m.ms
                AND (a.status <> 'disposed' OR a.disposed_date >= m.ms)
                AND (a.opening_as_of IS NULL OR a.opening_as_of < m.me)),
       d AS (SELECT u.tenant_id, u.branch_id, u.ms, u.ym,
                    bool_and(EXISTS (SELECT 1 FROM asset_depreciations x WHERE x.asset_id = u.asset_id
                                     AND ((x.year * 12 + x.month - 1) = u.idx OR (x.covers_from IS NOT NULL AND x.covers_from <= u.idx AND u.idx < x.year * 12 + x.month - 1)))) AS done
               FROM u GROUP BY u.tenant_id, u.branch_id, u.ms, u.ym)`;

export const checks = [
  sqlCheck({
    id: 'DG-CASH-1', code: 'CASH_NEGATIVE', title: 'Quỹ tiền mặt không âm cuối ngày',
    rules: ['R-FIX-1'], conf: [], tier: 2, enforce: 'info', weight: 1,
    count: `SELECT count(*)::int AS n FROM (SELECT DISTINCT l.tenant_id, l.branch_id, l.account_code FROM ledger_lines l WHERE l.account_code IN ${CASH}) x`,
    sql: `WITH d AS (SELECT l.tenant_id, l.branch_id, l.account_code, l.posting_date AS day, sum(l.debit - l.credit) AS q FROM ledger_lines l
                      WHERE l.account_code IN ${CASH} GROUP BY 1, 2, 3, 4),
               r AS (SELECT d.*, sum(d.q) OVER (PARTITION BY d.tenant_id, d.branch_id, d.account_code ORDER BY d.day) AS bal FROM d)
          SELECT t.code AS tenant, b.code || ':' || r.account_code AS key, json_build_object('first_negative', min(r.day)) AS detail
            FROM r JOIN tenants t ON t.id = r.tenant_id JOIN branches b ON b.id = r.branch_id
           WHERE r.bal < 0 GROUP BY t.code, b.code, r.account_code ORDER BY min(r.day) LIMIT 200`,
  }),
  sqlCheck({
    id: 'DG-ACC-1', code: 'ACCOUNT_WRONG_SIDE', title: 'Tài khoản chỉ dư một bên không dư bên ngược lại',
    rules: ['R-FIX-1'], conf: [], tier: 2, enforce: 'info', weight: 1,
    count: "SELECT count(*)::int AS n FROM accounts WHERE normal_side IN ('debit', 'credit')",
    sql: `SELECT t.code AS tenant, x.code || ':' || CASE WHEN x.bal > 0 THEN 'dư Nợ' ELSE 'dư Có' END AS key, NULL AS detail
            FROM (SELECT a.tenant_id, a.code, a.normal_side, sum(l.debit - l.credit) AS bal
                    FROM accounts a JOIN ledger_lines l ON l.tenant_id = a.tenant_id AND l.account_code = a.code
                   WHERE a.normal_side IN ('debit', 'credit') AND l.posting_date <= current_date
                   GROUP BY 1, 2, 3) x JOIN tenants t ON t.id = x.tenant_id
           WHERE (x.normal_side = 'debit' AND x.bal < 0) OR (x.normal_side = 'credit' AND x.bal > 0)
           ORDER BY 1, 2 LIMIT 200`,
  }),
  sqlCheck({
    id: 'DG-STK-1', code: 'COGS_STALE', title: 'Phiếu giá vốn tháng không lỗi thời',
    rules: ['R-FIX-1'], conf: [], tier: 2, enforce: 'info', weight: 1,
    count: `SELECT count(*)::int AS n FROM (${COGS}) c`,
    sql: `SELECT t.code AS tenant, b.code || ':' || c.ym AS key, NULL AS detail
            FROM (${COGS}) c JOIN tenants t ON t.id = c.tenant_id JOIN branches b ON b.id = c.branch_id
           WHERE EXISTS (SELECT 1 FROM inventory_movements m JOIN accounting_events ev ON ev.id = m.event_id
                          WHERE m.tenant_id = c.tenant_id AND m.branch_id = c.branch_id AND to_char(m.doc_date, 'YYYY-MM') = c.ym AND ev.received_at > c.at)
           ORDER BY c.ym LIMIT 200`,
  }),
  sqlCheck({
    id: 'DG-STK-2', code: 'STOCK_ADJUST_NO_REASON', title: 'Phiếu điều chỉnh kho có lý do',
    rules: ['R-FIX-1'], conf: [], tier: 2, enforce: 'info', weight: 1,
    count: "SELECT count(DISTINCT event_id)::int AS n FROM inventory_movements WHERE kind IN ('adjust_in', 'adjust_out')",
    sql: `SELECT DISTINCT t.code AS tenant, a.doc_key AS key, NULL AS detail
            FROM inventory_movements m JOIN accounting_events a ON a.id = m.event_id JOIN tenants t ON t.id = m.tenant_id
           WHERE m.kind IN ('adjust_in', 'adjust_out') AND coalesce(m.reason_code, '') = '' LIMIT 200`,
  }),
  sqlCheck({
    id: 'DG-FA-1', code: 'DEPRECIATION_OPEN', title: 'Tháng đã qua có tài sản cần trích thì đã có phiếu khấu hao tháng',
    rules: ['R-FIX-1'], conf: [], tier: 2, enforce: 'info', weight: 1,
    count: `${DUE} SELECT count(*)::int AS n FROM d`,
    sql: `${DUE} SELECT t.code AS tenant, b.code || ':' || d.ym AS key, NULL AS detail
            FROM d JOIN tenants t ON t.id = d.tenant_id JOIN branches b ON b.id = d.branch_id
           WHERE NOT d.done ORDER BY d.ms LIMIT 200`,
  }),
  sqlCheck({
    id: 'DG-CONF-1', code: 'CONFORMANCE_STALE', title: 'Lượt Kiểm chuẩn gần nhất không quá 2 ngày',
    rules: ['R-FIX-1'], conf: [], tier: 2, enforce: 'info', weight: 1, contract: 'kernel',
    count: 'SELECT count(*)::int AS n FROM tenants WHERE is_active',
    sql: `SELECT t.code AS tenant, 'conformance_runs' AS key, json_build_object('last', (SELECT max(r.created_at) FROM conformance_runs r WHERE r.tenant_id = t.id)) AS detail
            FROM tenants t
           WHERE t.is_active AND t.created_at < now() - interval '2 days'
             AND coalesce((SELECT max(r.created_at) FROM conformance_runs r WHERE r.tenant_id = t.id), '-infinity') < now() - interval '2 days'
           LIMIT 200`,
  }),
];
