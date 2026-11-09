// @bizcity-layer K kernel/ledger
// [2026-11-02 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W2: kiểm L3 số dư — CASH_NEGATIVE, ACCOUNT_WRONG_SIDE, TRANSIT_NONZERO, DEBT_MATCH_LEDGER; cùng mã với lane DG-CASH-1, DG-ACC-1, DG-PLAN-4, DG-PLAN-1; remedy theo 10-DANH-MUC-GIA-DINH.
/**
 * Số dư của đơn vị — CHỈ ĐỌC, mức warn (phân tích để người dùng quyết định, R-VNC-10). Không viết số tài khoản:
 *   tiền mặt / trung gian đọc từ tài khoản ngầm định của đơn vị (posting_defaults: cash, goods_in_transit, cash_in_transit) và tài khoản con;
 *   tài khoản công nợ = tài khoản có khoản công nợ (debt_items) của đơn vị; bên số dư bình thường đọc từ accounts.normal_side.
 * Không số tiền trong mẫu (R-DIAG-6): mẫu là chi nhánh / tài khoản / đối tượng / ngày.
 * SQL chép sang lane diagnostics (tests/conformance/diagnostics/balance.diag.mjs, ledger.diag.mjs). Đổi một bên thì đổi bên kia (R-DIAG-9).
 */
// [2026-11-09 11:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B2b (S032-30, CT-INV-003 / 005): TRANSIT_NONZERO chỉ báo phần còn treo quá 30 ngày (số dư − Σ Nợ 30 ngày gần nhất) hoặc nhận nhiều hơn xuất; hàng đi đường trong hạn là hợp lệ
import { sql, type RawBuilder } from 'kysely';
import { SCREENS } from '@ketoan/contracts';
import { sqlCounts, type DiagCheck, type DiagScope } from '@bizcity/platform/system/diagnostics';

const SAMPLE = 20;
/** Ngưỡng nội bộ: tài khoản trung gian còn số quá 30 ngày mới là bất thường (hàng / tiền đang đi trên đường thì bình thường). */
const TRANSIT_DAYS = 30;

const asOf = (s: DiagScope): RawBuilder<unknown> => (s.to ? sql`${s.to}::date` : sql`current_date`);
const branchCond = (s: DiagScope, t: string): RawBuilder<unknown> => (s.branchId ? sql`AND ${sql.ref(`${t}.branch_id`)} = ${s.branchId}` : sql``);
/** Tài khoản của các khoá ngầm định + tài khoản con của chúng. */
const defaultAccounts = (tenantId: string, keys: string[]) => sql`
  SELECT a.code FROM accounts a
   WHERE a.tenant_id = ${tenantId}
     AND EXISTS (SELECT 1 FROM posting_defaults d WHERE d.tenant_id = a.tenant_id AND d.key IN (${sql.join(keys)}) AND a.code LIKE d.account_code || '%')`;

export const BALANCE_DIAGNOSTICS: DiagCheck[] = [
  {
    code: 'CASH_NEGATIVE', layer: 'L3', level: 'warn', scoped: true,
    remedy: {
      steps: [
        { text: 'Mở Sổ quỹ tiền mặt tại ngày âm đầu tiên trong mẫu', screen: SCREENS.ACC55 },
        { text: 'Tìm phiếu thu thiếu / nhập trễ, hoặc phiếu chi ghi nhầm ngày', role: 'accountant' },
        { text: 'Sửa ở nguồn hoặc lập phiếu thu đúng ngày', role: 'accountant' },
      ],
      owner: 'accountant', verify: { code: 'CASH_NEGATIVE' }, forbid: ['Không lập phiếu thu khống cho "đủ quỹ"'],
    },
    title: 'Quỹ tiền mặt không âm cuối ngày (theo chi nhánh, tài khoản tiền mặt của đơn vị)',
    fix: 'Quỹ âm nghĩa là chi khi sổ chưa có tiền: thiếu phiếu thu, nhập trễ, hoặc chi ghi nhầm ngày — dấu hiệu bị hỏi khi thanh tra. Mẫu: <chi nhánh>:<tài khoản>@<ngày âm đầu tiên>.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM (SELECT DISTINCT l.branch_id, l.account_code FROM ledger_lines l
            WHERE l.tenant_id = ${s.tenantId} ${branchCond(s, 'l')} AND l.account_code IN (${defaultAccounts(s.tenantId, ['cash'])})
              AND l.posting_date <= ${asOf(s)}) x`,
      sql`WITH d AS (SELECT l.branch_id, l.account_code, l.posting_date AS day, sum(l.debit - l.credit) AS q FROM ledger_lines l
                      WHERE l.tenant_id = ${s.tenantId} ${branchCond(s, 'l')} AND l.account_code IN (${defaultAccounts(s.tenantId, ['cash'])})
                        AND l.posting_date <= ${asOf(s)}
                      GROUP BY 1, 2, 3),
               r AS (SELECT d.*, sum(d.q) OVER (PARTITION BY d.branch_id, d.account_code ORDER BY d.day) AS bal FROM d)
          SELECT b.code || ':' || r.account_code || '@' || to_char(min(r.day), 'YYYY-MM-DD') AS key, count(*) OVER ()::int AS total
            FROM r JOIN branches b ON b.id = r.branch_id
           WHERE r.bal < 0 ${s.from ? sql`AND r.day >= ${s.from}` : sql``}
           GROUP BY b.code, r.account_code ORDER BY min(r.day), 1 LIMIT ${SAMPLE}`),
  },
  {
    code: 'ACCOUNT_WRONG_SIDE', layer: 'L3', level: 'warn', scoped: true,
    remedy: {
      steps: [
        { text: 'Mở Sổ chi tiết tài khoản trong mẫu, xem từ ngày số dư đổi bên', screen: SCREENS.ACC12 },
        { text: 'Tìm chứng từ thiếu (phiếu thu, phiếu nhập) hoặc ghi nhầm tài khoản', role: 'accountant' },
        { text: 'Sửa ở nguồn, hoặc lập chứng từ điều chỉnh có căn cứ', role: 'chief_accountant' },
      ],
      owner: 'accountant', verify: { code: 'ACCOUNT_WRONG_SIDE' },
    },
    title: 'Tài khoản chỉ dư một bên không có số dư ở bên ngược lại cuối kỳ (theo tính chất tài khoản)',
    fix: 'Tài khoản tiền, hàng tồn dư Có, hoặc tài khoản chỉ dư Có lại dư Nợ: thường là thiếu chứng từ hoặc ghi nhầm tài khoản. Mẫu: <tài khoản>:<bên đang dư>. Tài khoản lưỡng tính (công nợ) không xét.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM accounts a WHERE a.tenant_id = ${s.tenantId} AND a.normal_side IN ('debit', 'credit')
            AND EXISTS (SELECT 1 FROM ledger_lines l WHERE l.tenant_id = a.tenant_id AND l.account_code = a.code AND l.posting_date <= ${asOf(s)} ${branchCond(s, 'l')})`,
      sql`SELECT x.code || ':' || CASE WHEN x.bal > 0 THEN 'dư Nợ' ELSE 'dư Có' END AS key, count(*) OVER ()::int AS total
            FROM (SELECT a.code, a.normal_side, sum(l.debit - l.credit) AS bal
                    FROM accounts a JOIN ledger_lines l ON l.tenant_id = a.tenant_id AND l.account_code = a.code
                   WHERE a.tenant_id = ${s.tenantId} AND a.normal_side IN ('debit', 'credit') AND l.posting_date <= ${asOf(s)} ${branchCond(s, 'l')}
                   GROUP BY a.code, a.normal_side) x
           WHERE (x.normal_side = 'debit' AND x.bal < 0) OR (x.normal_side = 'credit' AND x.bal > 0)
           ORDER BY x.code LIMIT ${SAMPLE}`),
  },
  {
    code: 'TRANSIT_NONZERO', layer: 'L3', level: 'warn', scoped: true,
    remedy: {
      steps: [
        { text: 'Mở Sổ chi tiết tài khoản trung gian trong mẫu, theo chi nhánh', screen: SCREENS.ACC12 },
        { text: 'Chi nhánh nhận chưa nhập: nhập phiếu chuyển đến / xác nhận đã nhận tiền', role: 'accountant' },
        { text: 'Lệch đơn giá giữa hai nhóm tính giá: tính lại giá vốn nhóm gửi trước, rồi nhóm nhận', screen: SCREENS.ACC49, role: 'chief_accountant' },
      ],
      owner: 'accountant', verify: { code: 'TRANSIT_NONZERO' },
    },
    title: 'Hàng / tiền đang chuyển giữa chi nhánh không treo quá 30 ngày, nơi nhận không ghi nhiều hơn nơi xuất (toàn đơn vị)',
    fix: 'Hàng / tiền đi đường trong 30 ngày là bình thường. Còn treo quá 30 ngày (quy chế nội bộ) là nơi nhận chưa ghi hoặc lệch đơn giá; số dư âm là nơi nhận ghi nhiều hơn nơi xuất. Mẫu: <tài khoản>:còn treo quá 30 ngày | <tài khoản>:nhận nhiều hơn xuất.',
    // Còn treo = số dư tại ngày xét − Σ phát sinh Nợ trong TRANSIT_DAYS ngày gần nhất (nhận ghi Có trừ dần khoản đi sớm nhất trước).
    // Không cần ghép cặp phiếu xuất / phiếu nhận, chạy được cho cả phiếu hai đầu lẫn phiếu một đầu (leg).
    run: (trx, s) => {
      const at = asOf(s);
      return sqlCounts(trx,
        sql`SELECT count(*)::int AS n FROM (${defaultAccounts(s.tenantId, ['goods_in_transit', 'cash_in_transit'])}) x`,
        sql`SELECT x.account_code || CASE WHEN x.bal <= -1 THEN ':nhận nhiều hơn xuất' ELSE ':còn treo quá ' || ${TRANSIT_DAYS}::int || ' ngày' END AS key, count(*) OVER ()::int AS total
              FROM (SELECT l.account_code, sum(l.debit - l.credit) AS bal,
                           sum(l.debit) FILTER (WHERE l.posting_date > ${at} - ${TRANSIT_DAYS}::int) AS recent_debit
                      FROM ledger_lines l
                     WHERE l.tenant_id = ${s.tenantId} AND l.account_code IN (${defaultAccounts(s.tenantId, ['goods_in_transit', 'cash_in_transit'])})
                       AND l.posting_date <= ${at}
                     GROUP BY l.account_code) x
             WHERE x.bal <= -1 OR x.bal - coalesce(x.recent_debit, 0) >= 1
             ORDER BY 1 LIMIT ${SAMPLE}`);
    },
  },
  {
    code: 'DEBT_MATCH_LEDGER', layer: 'L3', level: 'warn', scoped: true,
    remedy: {
      steps: [
        { text: 'Mở Sổ chi tiết công nợ của đối tượng / tài khoản trong mẫu', screen: SCREENS.ACC40 },
        { text: 'Tìm thanh toán chưa phân bổ / phân bổ sai', screen: SCREENS.CN01, role: 'accountant' },
        { text: 'Phiếu kế toán tay vào tài khoản công nợ thiếu đối tượng: sửa phiếu, gắn đối tượng', role: 'accountant' },
        { text: 'Vẫn lệch: báo nhóm Lõi kèm mã tra cứu', role: 'chief_accountant' },
      ],
      owner: 'accountant', verify: { code: 'DEBT_MATCH_LEDGER' },
    },
    title: 'Khoản công nợ còn lại theo đối tượng = số dư tài khoản công nợ của đối tượng trên sổ cái',
    fix: 'Sổ công nợ và sổ cái nói hai số: báo cáo tuổi nợ, đối chiếu công nợ sai. Mẫu: <mã đối tượng>:<tài khoản>.',
    run: (trx, s) => {
      const pairs = sql`
        SELECT partner_id, account_code, sum(ledger) AS ledger, sum(debt) AS debt FROM (
          SELECT l.partner_id, l.account_code, sum(l.debit - l.credit) AS ledger, 0::numeric AS debt
            FROM ledger_lines l
           WHERE l.tenant_id = ${s.tenantId} AND l.partner_id IS NOT NULL
             AND l.account_code IN (SELECT DISTINCT d2.account_code FROM debt_items d2 WHERE d2.tenant_id = l.tenant_id) AND l.posting_date <= ${asOf(s)} ${branchCond(s, 'l')}
           GROUP BY 1, 2
          UNION ALL
          SELECT d.partner_id, d.account_code, 0::numeric, sum(CASE WHEN d.side = 'debit' THEN d.amount - d.settled_amount ELSE d.settled_amount - d.amount END)
            FROM debt_items d WHERE d.tenant_id = ${s.tenantId} AND d.doc_date <= ${asOf(s)} ${branchCond(s, 'd')}
           GROUP BY 1, 2) u
        GROUP BY 1, 2`;
      return sqlCounts(trx,
        sql`SELECT count(*)::int AS n FROM (${pairs}) p`,
        sql`SELECT coalesce(pt.code, p.partner_id::text) || ':' || p.account_code AS key, count(*) OVER ()::int AS total
              FROM (${pairs}) p LEFT JOIN partners pt ON pt.id = p.partner_id
             WHERE abs(p.ledger - p.debt) >= 1
             ORDER BY 1 LIMIT ${SAMPLE}`);
    },
  },
];
