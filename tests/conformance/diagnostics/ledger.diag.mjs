// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 12:37 AM Johnny Chu - Chu Hoàng Anh] PHASE-001 — migration đúng chuẩn, vai trò CSDL thường cho API, bộ test xanh.
// [2026-10-30 11:27 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — bằng chứng chỉ thêm, chuỗi băm theo đơn vị, biên nhận (PHASES 2.6).
// [2026-10-30 07:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — một cửa ghi sổ: eventStore cho phiếu tay, kết chuyển, khấu hao, giá vốn.
// [2026-10-30 09:03 PM Johnny Chu - Chu Hoàng Anh] PHASE-005 — chính sách kế toán có phiên bản + ngày hiệu lực (ADR-0009).
// [2026-10-30 09:23 PM Johnny Chu - Chu Hoàng Anh] PHASE-007 — cô lập đơn vị bằng RLS.
// [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — chú thích: ledger.diagnostics.ts nay ở packages/kernel
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
/** POLICY_VERSION — cùng chữ với packages/kernel/src/modules/ledger/ledger.diagnostics.ts. */
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
  // [2026-11-09 07:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-15a (D004-13): cùng bộ mã với LEDGER_DIAGNOSTICS (R-DIAG-9); sửa đầu bút toán ngoài ứng dụng
  sqlCheck({
    id: 'DG-LEDGER-5', code: 'LEDGER_HEADER_EDIT_UNATTRIBUTED',
    title: 'Mọi lần sửa đầu bút toán đi qua ứng dụng (dòng của ứng dụng cùng _txid) hoặc đã được kế toán trưởng xác nhận',
    rules: ['R-LEDGER-1'], conf: [], tier: 1, enforce: 'info', weight: 3,
    count: `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'ledger.entry.header_update' AND after_data->>'_source' = 'db'`,
    sql: `SELECT t.code AS tenant, e.entry_no AS key,
                 json_build_object('role', a.after_data->>'_role', 'txid', a.after_data->>'_txid', 'at', a.created_at) AS detail
          FROM audit_logs a JOIN ledger_entries e ON e.id::text = a.object_id AND e.tenant_id = a.tenant_id JOIN tenants t ON t.id = a.tenant_id
          WHERE a.action = 'ledger.entry.header_update' AND a.after_data->>'_source' = 'db'
            AND NOT EXISTS (SELECT 1 FROM audit_logs b WHERE b.tenant_id = a.tenant_id AND b.object_id = a.object_id AND b.action = a.action
                             AND b.after_data->>'_source' = 'app' AND b.after_data->>'_txid' = a.after_data->>'_txid')
            AND NOT EXISTS (SELECT 1 FROM audit_logs k WHERE k.tenant_id = a.tenant_id AND k.action = 'core.ledger.header-edit-ack' AND k.result_ok
                             AND k.object_id = a.object_id AND k.after_data->'input'->>'txid' = a.after_data->>'_txid')
          LIMIT 200`,
  }),
  // [2026-11-10 10:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — S029-25 đợt 1 (R-DIAG-9): cùng mã với LEDGER_DIAGNOSTICS — người lập tự duyệt ghi sổ (sod: warn)
  sqlCheck({
    id: 'DG-LEDGER-6', code: 'LEDGER_SELF_APPROVED',
    title: 'Chứng từ ghi sổ được duyệt bởi người khác người lập (tách nhiệm, đang ghi dấu)',
    rules: ['R-WF-17'], conf: [], tier: 1, enforce: 'info', weight: 2,
    count: `SELECT count(*)::int AS n FROM audit_logs WHERE result_ok AND jsonb_typeof(after_data->'notes'->'audit') = 'array'`,
    sql: `SELECT t.code AS tenant, (n->>'objectType') || ':' || coalesce(n->>'objectId', '?') AS key,
                 json_build_object('actor', a.actor, 'action', a.action, 'at', a.created_at) AS detail
          FROM audit_logs a JOIN tenants t ON t.id = a.tenant_id
          CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(a.after_data->'notes'->'audit') = 'array' THEN a.after_data->'notes'->'audit' ELSE '[]'::jsonb END) n
          WHERE a.result_ok AND n->>'action' = 'workflow.sod.self_approve'
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
  // [2026-11-05 08:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — W1: ba kiểm truy vết chứng từ gốc (DOC-01 / 03 / 04); cùng bộ mã với LEDGER_DIAGNOSTICS (R-DIAG-9)
  sqlCheck({
    id: 'DG-DOC-1', code: 'ENTRY_NO_VERSION',
    title: 'Bút toán gắn sự việc có ghi event_version (phiên bản chứng từ đã tạo ra nó)',
    rules: ['R-EVENT-1'], conf: [], tier: 1, enforce: 'info', weight: 2,
    count: `SELECT count(*)::int AS n FROM ledger_entries WHERE event_id IS NOT NULL`,
    sql: `SELECT t.code AS tenant, e.entry_no AS key, json_build_object('doc_type', e.doc_type, 'event_id', e.event_id) AS detail
          FROM ledger_entries e JOIN tenants t ON t.id = e.tenant_id
          WHERE e.event_id IS NOT NULL AND e.event_version IS NULL
          LIMIT 200`,
  }),
  sqlCheck({
    id: 'DG-DOC-2', code: 'ENTRY_VERSION_UNKNOWN',
    title: 'Phiên bản chứng từ của bút toán còn nội dung lưu (hiện hành hoặc accounting_event_versions)',
    rules: ['R-EVENT-1'], conf: [], tier: 1, enforce: 'info', weight: 2,
    count: `SELECT count(*)::int AS n FROM ledger_entries WHERE event_id IS NOT NULL AND event_version IS NOT NULL`,
    sql: `SELECT t.code AS tenant, e.entry_no AS key, json_build_object('event_version', e.event_version, 'current_version', a.version) AS detail
          FROM ledger_entries e JOIN accounting_events a ON a.id = e.event_id JOIN tenants t ON t.id = e.tenant_id
          WHERE e.event_version IS NOT NULL AND e.event_version <> a.version
            AND NOT EXISTS (SELECT 1 FROM accounting_event_versions v WHERE v.event_id = a.id AND v.version = e.event_version)
          LIMIT 200`,
  }),
  sqlCheck({
    id: 'DG-DOC-3', code: 'EVENT_ENTRIES_STALE',
    title: 'Bút toán đang hiệu lực của sự việc đã ghi sổ thuộc đúng phiên bản posted_version',
    rules: ['R-EVENT-4'], conf: [], tier: 1, enforce: 'info', weight: 2,
    count: `SELECT count(*)::int AS n FROM accounting_events a WHERE status = 'posted' AND ${VALUED}`,
    sql: `SELECT t.code AS tenant, a.doc_key AS key, json_build_object('posted_version', a.posted_version) AS detail
          FROM accounting_events a JOIN tenants t ON t.id = a.tenant_id
          WHERE a.status = 'posted' AND ${VALUED} AND a.posted_version IS NOT NULL
            AND EXISTS (SELECT 1 FROM ledger_entries e WHERE e.event_id = a.id AND e.status = 'posted' AND NOT e.is_reversal
                         AND e.event_version IS NOT NULL AND e.event_version <> a.posted_version)
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
  // [2026-11-06 10:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — E6 đợt 1 (S029-13): DG-REC-2 LEDGER_ROUNDING — dòng sổ tròn đồng (cùng mã với ledger.diagnostics.ts)
  sqlCheck({
    id: 'DG-REC-2', code: 'LEDGER_ROUNDING',
    title: 'Dòng sổ cái ghi số tiền tròn đồng (sổ ghi đồng Việt Nam)',
    rules: ['R-REV-6'], conf: [], tier: 2, enforce: 'info', weight: 1,
    count: `SELECT count(*)::int AS n FROM ledger_lines`,
    sql: `SELECT t.code AS tenant, e.entry_no AS key, json_build_object('posting_date', e.posting_date) AS detail
          FROM ledger_entries e JOIN tenants t ON t.id = e.tenant_id
          WHERE EXISTS (SELECT 1 FROM ledger_lines l WHERE l.entry_id = e.id AND (l.debit <> round(l.debit) OR l.credit <> round(l.credit)))
          ORDER BY e.posting_date LIMIT 200`,
  }),
  // [2026-10-31 05:07 PM Johnny Chu - Chu Hoàng Anh] R-REV — DG-TAX-1 TAX_INPUT_NO_INVOICE: thuế đầu vào đã vào sổ mà chưa có hoá đơn quá 30 ngày (cùng mã với app).
  sqlCheck({
    id: 'DG-TAX-1', code: 'TAX_INPUT_NO_INVOICE',
    title: 'Thuế GTGT đầu vào đã ghi sổ có hoá đơn trong sổ hoá đơn (chờ không quá 30 ngày)',
    rules: ['R-REV-6'], conf: [], tier: 2, enforce: 'info', weight: 1,
    count: `SELECT count(DISTINCT e.event_id)::int AS n FROM ledger_entries e JOIN ledger_lines l ON l.entry_id = e.id
            WHERE e.status = 'posted' AND l.account_code IN (SELECT account_code FROM tax_codes WHERE direction = 'input' AND account_code IS NOT NULL
                                                             UNION SELECT account_code FROM posting_defaults WHERE key = 'tax_input')`,
    sql: `SELECT t.code AS tenant, a.doc_key AS key, json_build_object('doc_type', a.doc_type, 'doc_date', a.doc_date) AS detail
          FROM accounting_events a JOIN tenants t ON t.id = a.tenant_id
          WHERE a.status = 'posted' AND a.doc_date < current_date - 30
            AND EXISTS (SELECT 1 FROM ledger_entries e JOIN ledger_lines l ON l.entry_id = e.id
                        WHERE e.event_id = a.id AND e.status = 'posted' AND NOT e.is_reversal AND l.debit <> l.credit
                          AND l.account_code IN (SELECT tc.account_code FROM tax_codes tc WHERE tc.tenant_id = a.tenant_id AND tc.direction = 'input' AND tc.account_code IS NOT NULL
                                                 UNION SELECT d.account_code FROM posting_defaults d WHERE d.tenant_id = a.tenant_id AND d.key = 'tax_input'))
            AND NOT EXISTS (SELECT 1 FROM tax_invoices i WHERE i.event_id = a.id)
          ORDER BY a.doc_date LIMIT 200`,
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
  // [2026-11-02 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W2: DG-PLAN-1 DEBT_MATCH_LEDGER, DG-PLAN-4 TRANSIT_NONZERO có SQL thật (cùng chữ với balance.diagnostics.ts); giữ mã DG-PLAN-* để bảng điểm không đổi mã.
  // [2026-11-03 09:07 AM Johnny Chu - Chu Hoàng Anh] PHASE-022 — DG-PLAN-1: câu lấy phát hiện lọc tài khoản công nợ theo debt_items như câu count và kiểm DEBT_MATCH_LEDGER trong app — trước lọc accounts.is_debt (seed để false cho 131/331) nên đơn vị mới luôn báo lệch giả
  sqlCheck({
    id: 'DG-PLAN-1', code: 'DEBT_MATCH_LEDGER', title: 'Khoản công nợ còn lại theo đối tượng = số dư tài khoản công nợ trên sổ cái',
    rules: ['R-LEDGER-11'], conf: [], tier: 2, enforce: 'info', weight: 2,
    count: `SELECT count(*)::int AS n FROM (SELECT tenant_id, partner_id, account_code, sum(ledger) AS ledger, sum(debt) AS debt FROM (
            SELECT l.tenant_id, l.partner_id, l.account_code, sum(l.debit - l.credit) AS ledger, 0::numeric AS debt
              FROM ledger_lines l
             WHERE l.partner_id IS NOT NULL AND l.posting_date <= current_date
               AND l.account_code IN (SELECT DISTINCT d2.account_code FROM debt_items d2 WHERE d2.tenant_id = l.tenant_id) GROUP BY 1, 2, 3
            UNION ALL
            SELECT d.tenant_id, d.partner_id, d.account_code, 0::numeric, sum(CASE WHEN d.side = 'debit' THEN d.amount - d.settled_amount ELSE d.settled_amount - d.amount END)
              FROM debt_items d WHERE d.doc_date <= current_date GROUP BY 1, 2, 3) u GROUP BY 1, 2, 3) p`,
    sql: `SELECT t.code AS tenant, coalesce(pt.code, p.partner_id::text) || ':' || p.account_code AS key, NULL AS detail
            FROM (SELECT tenant_id, partner_id, account_code, sum(ledger) AS ledger, sum(debt) AS debt FROM (
            SELECT l.tenant_id, l.partner_id, l.account_code, sum(l.debit - l.credit) AS ledger, 0::numeric AS debt
              FROM ledger_lines l
             WHERE l.partner_id IS NOT NULL AND l.posting_date <= current_date
               AND l.account_code IN (SELECT DISTINCT d2.account_code FROM debt_items d2 WHERE d2.tenant_id = l.tenant_id) GROUP BY 1, 2, 3
            UNION ALL
            SELECT d.tenant_id, d.partner_id, d.account_code, 0::numeric, sum(CASE WHEN d.side = 'debit' THEN d.amount - d.settled_amount ELSE d.settled_amount - d.amount END)
              FROM debt_items d WHERE d.doc_date <= current_date GROUP BY 1, 2, 3) u GROUP BY 1, 2, 3) p JOIN tenants t ON t.id = p.tenant_id LEFT JOIN partners pt ON pt.id = p.partner_id
           WHERE abs(p.ledger - p.debt) >= 1 ORDER BY 1, 2 LIMIT 200`,
  }),
  sqlCheck({
    // [2026-11-09 11:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B2b: cùng chữ mới với balance.diagnostics.ts (còn treo quá 30 ngày hoặc nhận nhiều hơn xuất)
    id: 'DG-PLAN-4', code: 'TRANSIT_NONZERO', title: 'Hàng / tiền đang chuyển giữa chi nhánh không treo quá 30 ngày, nơi nhận không ghi nhiều hơn nơi xuất',
    rules: [], conf: [], tier: 2, enforce: 'info', weight: 2,
    count: "SELECT count(*)::int AS n FROM posting_defaults WHERE key IN ('goods_in_transit', 'cash_in_transit')",
    sql: `SELECT t.code AS tenant, x.account_code AS key, CASE WHEN x.bal <= -1 THEN 'nhận nhiều hơn xuất' ELSE 'còn treo quá 30 ngày' END AS detail
            FROM (SELECT l.tenant_id, l.account_code, sum(l.debit - l.credit) AS bal, sum(l.debit) FILTER (WHERE l.posting_date > current_date - 30) AS recent_debit FROM ledger_lines l
                   WHERE l.account_code IN (SELECT a.code FROM accounts a WHERE a.tenant_id = l.tenant_id AND EXISTS (SELECT 1 FROM posting_defaults d WHERE d.tenant_id = a.tenant_id AND d.key IN ('goods_in_transit', 'cash_in_transit') AND a.code LIKE d.account_code || '%')) AND l.posting_date <= current_date GROUP BY 1, 2) x
            JOIN tenants t ON t.id = x.tenant_id
           WHERE x.bal <= -1 OR x.bal - coalesce(x.recent_debit, 0) >= 1 ORDER BY 1, 2 LIMIT 200`,
  }),
  // Chưa làm được bằng SQL thuần (cần AccountResolver / quy tắc tài khoản) — giữ chỗ để bảng điểm thấy khoảng trống.
  ...[
    ['DG-PLAN-2', 'TAX_BOOK_MATCH', 'Sổ hoá đơn = phát sinh thuế GTGT theo kỳ', []],
    ['DG-PLAN-3', 'COST_FILL_OPEN', 'Không còn dòng cost_fill = 0 ở tháng đã qua', []],
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
