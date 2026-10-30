/**
 * Lane diagnostics: kiểm toàn vẹn trên CSDL thật, CHỈ ĐỌC. Cùng mã với GET /api/v1/system/diagnostics
 * (docs/ops/DIAGNOSTICS.md §2) để khi endpoint có (Phase 2), hai nơi cho cùng một kết quả.
 *
 * Mỗi check: `count` (đếm đơn vị đã xét) + `sql` (trả các dòng SAI: tenant, key, detail). Không dòng nào = đạt.
 * enforce 'block' = mức error; 'info' = mức warn.
 */
import { sqlCheck } from '../lib/diag.mjs';

/**
 * Sự việc do service lõi tự sinh và tự gọi ledgerService (closing, costing, assets — nợ A-01): chưa đi một cửa nên chưa cập nhật
 * posted_version. Tách khỏi DG-EVENT-1 để lỗi thật của cửa nạp sổ không bị lẫn; DG-EVENT-4 theo dõi tới khi xong PHASES 2.1.
 */
const INTERNAL = "('closing', 'cogs', 'depreciation')";
/** POLICY_VERSION — cùng chữ với apps/api/src/modules/ledger/ledger.diagnostics.ts. */
const POLICY_SCOPE = `NOT e.is_reversal AND a.source_system <> 'manual'
             AND e.created_at >= (SELECT min(p.created_at) FROM posting_policy_versions p WHERE p.tenant_id = e.tenant_id)`;
const POLICY_BAD = `(e.policy_version IS NULL OR NOT EXISTS (
               SELECT 1 FROM posting_policy_versions v
                WHERE v.tenant_id = e.tenant_id AND v.version = e.policy_version AND v.effective_from <= e.posting_date
                  AND NOT EXISTS (SELECT 1 FROM posting_policy_versions v2
                                   WHERE v2.tenant_id = e.tenant_id AND v2.effective_from <= e.posting_date AND v2.created_at <= e.created_at
                                     AND (v2.effective_from, v2.version) > (v.effective_from, v.version))))`;
/** Phiếu kho tổng tiền 0 (chuyển kho, điều chỉnh kho) không có bút toán: giá trị ghi ở phiếu giá vốn tháng — không phải lỗi. */
const VALUED = "NOT (a.total = 0 AND a.doc_type IN ('transfer', 'stock_adjustment'))";

export const checks = [
  sqlCheck({
    id: 'DG-LEDGER-1', code: 'LEDGER_BALANCED',
    title: 'Mỗi bút toán: tổng Nợ = tổng Có',
    rules: ['R-LEDGER-5'], conf: ['CONF-RUN-17'], tier: 0, enforce: 'block', weight: 5,
    count: 'SELECT count(*)::int AS n FROM ledger_entries',
    sql: `SELECT t.code AS tenant, e.entry_no AS key, json_build_object('debit', sum(l.debit), 'credit', sum(l.credit)) AS detail
          FROM ledger_entries e JOIN ledger_lines l ON l.entry_id = e.id JOIN tenants t ON t.id = e.tenant_id
          GROUP BY t.code, e.id, e.entry_no HAVING sum(l.debit) <> sum(l.credit)
          ORDER BY e.id LIMIT 200`,
  }),
  sqlCheck({
    id: 'DG-LEDGER-2', code: 'LEDGER_BALANCES_DAILY',
    title: 'ledger_balances_daily = Σ ledger_lines theo (đơn vị, chi nhánh, tài khoản, ngày)',
    rules: ['R-LEDGER-11'], conf: ['CONF-RUN-17'], tier: 0, enforce: 'block', weight: 4,
    count: 'SELECT count(*)::int AS n FROM (SELECT DISTINCT tenant_id, branch_id, account_code, posting_date FROM ledger_lines) x',
    sql: `WITH l AS (SELECT tenant_id, branch_id, account_code, posting_date, sum(debit) d, sum(credit) c FROM ledger_lines GROUP BY 1,2,3,4),
               b AS (SELECT tenant_id, branch_id, account_code, posting_date, sum(debit) d, sum(credit) c FROM ledger_balances_daily GROUP BY 1,2,3,4)
          SELECT t.code AS tenant, concat_ws(':', branch_id, account_code, posting_date) AS key,
                 json_build_object('lines', json_build_array(coalesce(l.d,0), coalesce(l.c,0)), 'daily', json_build_array(coalesce(b.d,0), coalesce(b.c,0))) AS detail
          FROM l FULL JOIN b USING (tenant_id, branch_id, account_code, posting_date) JOIN tenants t ON t.id = tenant_id
          WHERE coalesce(l.d,0) <> coalesce(b.d,0) OR coalesce(l.c,0) <> coalesce(b.c,0)
          LIMIT 200`,
  }),
  sqlCheck({
    id: 'DG-LEDGER-3', code: 'LEDGER_REVERSED_ONCE',
    title: 'Bút toán reversed có đúng một bút toán đảo; bút toán đảo trỏ về bút toán reversed',
    rules: ['R-LEDGER-2', 'R-LEDGER-3'], conf: ['CONF-RUN-5'], tier: 0, enforce: 'block', weight: 5,
    count: "SELECT count(*)::int AS n FROM ledger_entries WHERE status = 'reversed' OR reverses_entry_id IS NOT NULL",
    sql: `SELECT t.code AS tenant, e.entry_no AS key, json_build_object('reversals', (SELECT count(*) FROM ledger_entries r WHERE r.reverses_entry_id = e.id)) AS detail
          FROM ledger_entries e JOIN tenants t ON t.id = e.tenant_id
          WHERE e.status = 'reversed' AND (SELECT count(*) FROM ledger_entries r WHERE r.reverses_entry_id = e.id) <> 1
          UNION ALL
          SELECT t.code, r.entry_no, json_build_object('reverses', r.reverses_entry_id, 'target_status', o.status)
          FROM ledger_entries r JOIN tenants t ON t.id = r.tenant_id LEFT JOIN ledger_entries o ON o.id = r.reverses_entry_id
          WHERE r.reverses_entry_id IS NOT NULL AND (o.id IS NULL OR o.status <> 'reversed')
          LIMIT 200`,
  }),
  sqlCheck({
    id: 'DG-LEDGER-4', code: 'LEDGER_ORPHAN',
    title: 'Mọi bút toán trỏ về một sự việc (accounting_events) có thật',
    rules: ['R-LEDGER-12', 'R-EVENT-1'], conf: ['CONF-RUN-17'], tier: 0, enforce: 'block', weight: 5,
    count: 'SELECT count(*)::int AS n FROM ledger_entries',
    sql: `SELECT t.code AS tenant, e.entry_no AS key,
                 json_build_object('event_id', e.event_id, 'doc_type', e.doc_type, 'why', CASE WHEN e.event_id IS NULL THEN 'không có event_id' ELSE 'event_id không tồn tại' END) AS detail
          FROM ledger_entries e JOIN tenants t ON t.id = e.tenant_id
          WHERE e.event_id IS NULL OR NOT EXISTS (SELECT 1 FROM accounting_events a WHERE a.id = e.event_id)
          LIMIT 200`,
  }),
  sqlCheck({
    id: 'DG-EVENT-1', code: 'EVENT_POSTED_VERSION',
    title: 'Sự việc posted có posted_version = version (sự việc vào qua cửa nạp sổ / phiếu tay)',
    rules: ['R-EVENT-4'], conf: ['CONF-RUN-5'], tier: 0, enforce: 'block', weight: 4,
    count: `SELECT count(*)::int AS n FROM accounting_events WHERE status = 'posted' AND doc_type NOT IN ${INTERNAL}`,
    sql: `SELECT t.code AS tenant, a.doc_key AS key, json_build_object('version', a.version, 'posted_version', a.posted_version) AS detail
          FROM accounting_events a JOIN tenants t ON t.id = a.tenant_id
          WHERE a.status = 'posted' AND a.doc_type NOT IN ${INTERNAL} AND a.posted_version IS DISTINCT FROM a.version
          LIMIT 200`,
  }),
  sqlCheck({
    id: 'DG-POL-1', code: 'POLICY_VERSION',
    title: 'Bút toán định khoản theo luật ghi đúng phiên bản chính sách kế toán của ngày hạch toán (ADR-0009, C-9)',
    rules: ['STD-CMP-9'], conf: [], tier: 1, enforce: 'info', weight: 2,
    count: `SELECT count(*)::int AS n FROM ledger_entries e JOIN accounting_events a ON a.id = e.event_id
            WHERE ${POLICY_SCOPE}`,
    sql: `SELECT t.code AS tenant, e.entry_no AS key, json_build_object('posting_date', e.posting_date, 'policy_version', e.policy_version) AS detail
          FROM ledger_entries e JOIN accounting_events a ON a.id = e.event_id JOIN tenants t ON t.id = e.tenant_id
          WHERE ${POLICY_SCOPE} AND ${POLICY_BAD}
          LIMIT 200`,
  }),
  sqlCheck({
    id: 'DG-EVENT-4', code: 'INTERNAL_EVENT_VERSION',
    title: 'Sự việc nội bộ (kết chuyển, giá vốn, khấu hao) có posted_version = version (đi eventStore, PHASES 2.1)',
    rules: ['R-EVENT-2', 'R-EVENT-4'], conf: [], tier: 1, enforce: 'info', weight: 2,
    count: `SELECT count(*)::int AS n FROM accounting_events WHERE status = 'posted' AND doc_type IN ${INTERNAL}`,
    sql: `SELECT t.code AS tenant, a.doc_key AS key, json_build_object('doc_type', a.doc_type, 'version', a.version, 'posted_version', a.posted_version) AS detail
          FROM accounting_events a JOIN tenants t ON t.id = a.tenant_id
          WHERE a.status = 'posted' AND a.doc_type IN ${INTERNAL} AND a.posted_version IS DISTINCT FROM a.version
          LIMIT 200`,
  }),
  sqlCheck({
    id: 'DG-EVENT-2', code: 'EVENT_HAS_ENTRY',
    title: 'Sự việc posted có ít nhất một bút toán hiệu lực của đúng phiên bản',
    rules: ['R-EVENT-1'], conf: [], tier: 1, enforce: 'info', weight: 2,
    count: `SELECT count(*)::int AS n FROM accounting_events a WHERE status = 'posted' AND ${VALUED}`,
    sql: `SELECT t.code AS tenant, a.doc_key AS key, json_build_object('doc_type', a.doc_type, 'version', a.version) AS detail
          FROM accounting_events a JOIN tenants t ON t.id = a.tenant_id
          WHERE a.status = 'posted' AND ${VALUED} AND NOT EXISTS (
            SELECT 1 FROM ledger_entries e WHERE e.event_id = a.id AND e.status = 'posted' AND NOT e.is_reversal)
          LIMIT 200`,
  }),
  sqlCheck({
    id: 'DG-EVENT-3', code: 'EVENT_PENDING_AGE',
    title: 'Sự việc pending / error không quá 3 ngày',
    rules: ['R-EVENT-9'], conf: [], tier: 2, enforce: 'info', weight: 1,
    count: "SELECT count(*)::int AS n FROM accounting_events WHERE status IN ('pending','error')",
    sql: `SELECT t.code AS tenant, a.doc_key AS key, json_build_object('status', a.status, 'received_at', a.received_at, 'error', a.error_code) AS detail
          FROM accounting_events a JOIN tenants t ON t.id = a.tenant_id
          WHERE a.status IN ('pending','error') AND a.received_at < now() - interval '3 days'
          ORDER BY a.received_at LIMIT 200`,
  }),
  {
    id: 'DG-DB-1', code: 'MIGRATIONS_PENDING',
    title: 'Mọi tệp db/migrations đã áp vào CSDL',
    gate: 'CONF-RUN', contract: 'kernel', rules: ['R-DB-4'], conf: [], tier: 1, enforce: 'block', weight: 3,
    async run(ctx) {
      const files = ctx.repo.list('db/migrations').filter((f) => f.endsWith('.sql'));
      const done = new Set((await ctx.db.query('SELECT name FROM schema_migrations')).map((r) => r.name));
      const pending = files.filter((f) => !done.has(f));
      return { examined: files.length, findings: pending.map((f) => ctx.finding(`db/migrations/${f}`, null, `chưa áp ${f}`, f)) };
    },
  },
  {
    id: 'DG-SET-1', code: 'SETTINGS_UNKNOWN',
    title: 'Khoá trong tenants.settings đều có trong settings registry',
    gate: 'CONF-RUN', contract: 'bizcity_settings', rules: ['R-MATRIX-2', 'R-DB-12'], conf: [], tier: 1, enforce: 'info', weight: 2,
    async run(ctx) {
      const reg = ctx.core.json('docs/contracts/bizcity-settings.registry.json');
      const known = new Set(reg.settings.map((s) => /tenants\.settings\.(\w+)/.exec(s.storage ?? '')?.[1]).filter(Boolean));
      const rows = await ctx.db.query('SELECT t.code AS tenant, k AS key FROM tenants t, jsonb_object_keys(t.settings) k');
      const findings = rows.filter((r) => !known.has(r.key)).map((r) => ctx.finding(null, null, `[${r.tenant}] tenants.settings.${r.key} chưa đăng ký`, `${r.tenant}:${r.key}`));
      return { examined: rows.length, findings };
    },
  },
  // Chưa làm được bằng SQL thuần (cần AccountResolver / quy tắc tài khoản) — giữ chỗ để bảng điểm thấy khoảng trống.
  ...[
    ['DG-PLAN-1', 'DEBT_MATCH_LEDGER', 'Σ debt_items mở = số dư tài khoản công nợ theo đối tượng', ['R-LEDGER-11']],
    ['DG-PLAN-2', 'TAX_BOOK_MATCH', 'Sổ hoá đơn = phát sinh thuế GTGT theo kỳ', []],
    ['DG-PLAN-3', 'COST_FILL_OPEN', 'Không còn dòng cost_fill = 0 ở tháng đã qua', []],
    ['DG-PLAN-4', 'TRANSIT_NONZERO', 'Tài khoản trung gian (hàng đi đường, tiền đang chuyển) về 0', []],
  ].map(([id, code, title, rules]) => ({
    id, code, title, gate: 'CONF-RUN', contract: 'kernel',
    rules, conf: [], tier: 1, enforce: 'planned', phase: 'Phase 2', weight: 2,
    run: async () => ({ examined: 0, readiness: 0, findings: [], notes: ['chưa viết — xem docs/ops/DIAGNOSTICS.md §2'] }),
  })),
  {
    // PHASE-007 (migration 0041): mọi bảng có tenant_id bật RLS + FORCE + có chính sách. Vai trò kết nối của API không vượt RLS: DG-SEC-1 / -2.
    id: 'DG-PLAN-5', code: 'TENANT_ISOLATION',
    title: 'Đơn vị A không đọc / ghi được dữ liệu đơn vị B: mọi bảng có tenant_id bật RLS + FORCE + có chính sách',
    gate: 'CONF-RUN', contract: 'bizcity_data', rules: ['STD-DATA-1'], conf: ['CONF-MIG-2'], tier: 0, enforce: 'block', weight: 4,
    async run(ctx) {
      const rows = await ctx.db.query(`SELECT c.relname AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force,
                 EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid) AS policy
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'r'
             AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)`);
      const bad = rows.filter((r) => !(r.rls && r.force && r.policy));
      return {
        examined: rows.length, unitBy: 'key',
        findings: bad.map((r) => ctx.finding(null, null, `bảng ${r.name}: ${[!r.rls && 'chưa bật RLS', !r.force && 'chưa FORCE', !r.policy && 'chưa có chính sách'].filter(Boolean).join(', ')}`, r.name)),
        metrics: { code: 'TENANT_ISOLATION' },
      };
    },
  },
];
