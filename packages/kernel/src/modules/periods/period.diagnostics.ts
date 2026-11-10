// @bizcity-layer K kernel/periods
// [2026-11-10 09:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B2c-2 (S032-35): phép kiểm trỏ điều kiện khoá sổ closeRef (RULE-SELF-DIAGNOSTICS §2b, PHASE-032 · 70 §3a)
// [2026-11-02 07:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W1: remedy có cấu trúc cho từng kiểm (bizcity_remedy@1, R-FIX-1).
// [2026-11-02 02:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-21: periodCloseGaps — việc cuối kỳ còn thiếu của MỘT tháng cho cảnh báo trước khoá kỳ (không ngưỡng 30 ngày, không tính khoa-so).
// [2026-11-02 10:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — kiểm L3 cho lớp Doanh nghiệp của Conformance Engine (S020-19, Q020-6): INVENTORY_NEGATIVE, PERIOD_CLOSE_OPEN; cùng mã với lane DG-INV-1, DG-CLOSE-1.
/**
 * Trạng thái vận hành theo kỳ của MỘT đơn vị (lớp Doanh nghiệp, ADR-0012) — CHỈ ĐỌC, mức warn: phân tích để người dùng
 * quyết định, không chặn ghi sổ, không tự chạy giá vốn / kết chuyển / khoá kỳ (R-VNC-10). SQL chép từ lane diagnostics
 * (tests/conformance/diagnostics/period.diag.mjs), thêm điều kiện đơn vị + khoảng ngày + chi nhánh. Đổi một bên thì đổi bên kia (R-DIAG-9).
 *
 * Không viết số tài khoản: "tháng cần kết chuyển" đọc từ bộ quy tắc kết chuyển của đơn vị (closing_rules); đơn vị chưa lưu bộ riêng
 * thì dùng bộ mặc định của Kernel (DEFAULT_CLOSING_RULES) — đúng như closing.service.loadRuleSet.
 * Ngưỡng 30 ngày sau cuối tháng là quy chế nội bộ (miền internal, kế toán trưởng chốt — Q020-6), không phải luật.
 */
import { sql, type RawBuilder } from 'kysely';
import type { Db } from '@bizcity/platform/db/client';
import { sqlCounts, type DiagCheck, type DiagScope } from '@bizcity/platform/system/diagnostics';
import { DEFAULT_CLOSING_RULES } from '../closing/closing.service.js';
import { SCREENS } from '@ketoan/contracts';

const SAMPLE = 20;
/** Loại dòng kho được định giá ở phiếu giá vốn tháng (giống unvaluedMovements của costing.service). */
const COSTED = sql.join(['sale', 'sale_return', 'transfer_out', 'transfer_in', 'adjust_out', 'adjust_in']);

/** Đầu số nguồn của bộ mặc định, bỏ bước "lấy cả số dư đầu kỳ" và đầu số con của nó (như unclosedBefore của closing.service). */
export const DEFAULT_CLOSING_SOURCES: string[] = (() => {
  const opening = DEFAULT_CLOSING_RULES.filter((r) => r.isActive && r.includeOpening).map((r) => r.fromAccount);
  return DEFAULT_CLOSING_RULES.filter((r) => r.isActive && !opening.some((p) => r.fromAccount.startsWith(p))).map((r) => r.fromAccount);
})();

/** Điều kiện đơn vị + phạm vi trên alias `t`. `withFrom = false`: bỏ cận dưới (số dư luỹ kế cần cả lịch sử trước kỳ). */
function scoped(s: DiagScope, t: string, date: string, withFrom = true): RawBuilder<boolean> {
  const parts: RawBuilder<unknown>[] = [sql`${sql.ref(`${t}.tenant_id`)} = ${s.tenantId}`];
  if (s.from && withFrom) parts.push(sql`${sql.ref(`${t}.${date}`)} >= ${s.from}`);
  if (s.to) parts.push(sql`${sql.ref(`${t}.${date}`)} <= ${s.to}`);
  if (s.branchId) parts.push(sql`${sql.ref(`${t}.branch_id`)} = ${s.branchId}`);
  return sql<boolean>`(${sql.join(parts, sql` AND `)})`;
}

/** Số dư số lượng cuối ngày theo (chi nhánh, kho, mã hàng) — luỹ kế từ dòng kho đầu tiên. */
const balances = (s: DiagScope) => sql`
  WITH d AS (SELECT m.tenant_id, m.branch_id, m.warehouse_code, m.sku, m.doc_date, sum(m.qty) AS q
               FROM inventory_movements m WHERE ${scoped(s, 'm', 'doc_date', false)}
              GROUP BY 1, 2, 3, 4, 5)
  SELECT d.*, sum(d.q) OVER (PARTITION BY d.tenant_id, d.branch_id, d.warehouse_code, d.sku ORDER BY d.doc_date) AS bal FROM d`;

/** (chi nhánh, tháng) có bút toán, tháng đã kết thúc quá 30 ngày (hoặc đúng tháng `month` = YYYY-MM-01); kèm bốn tín hiệu cuối kỳ. */
const closeState = (s: DiagScope, month?: string) => sql`
  WITH rules AS (SELECT r.tenant_id, r.from_account AS prefix FROM closing_rules r
                  WHERE r.tenant_id = ${s.tenantId} AND r.is_active
                    AND NOT EXISTS (SELECT 1 FROM closing_rules o WHERE o.tenant_id = r.tenant_id AND o.is_active AND o.include_opening
                                      AND r.from_account LIKE o.from_account || '%')
                 UNION ALL
                 SELECT t.id, d.prefix FROM tenants t, unnest(${DEFAULT_CLOSING_SOURCES}::text[]) AS d(prefix)
                  WHERE t.id = ${s.tenantId} AND NOT EXISTS (SELECT 1 FROM closing_rules r WHERE r.tenant_id = t.id)),
  u AS (SELECT l.tenant_id, l.branch_id, date_trunc('month', l.posting_date)::date AS m
               FROM ledger_lines l
              WHERE ${scoped(s, 'l', 'posting_date')}
                AND ${month ? sql`date_trunc('month', l.posting_date)::date = ${month}::date` : sql`l.posting_date < date_trunc('month', current_date - 30)::date`}
              GROUP BY 1, 2, 3)
  SELECT u.*, to_char(u.m, 'YYYY-MM') AS ym,
    EXISTS (SELECT 1 FROM inventory_movements mv
             WHERE mv.tenant_id = u.tenant_id AND mv.branch_id = u.branch_id AND mv.amount IS NULL AND mv.qty <> 0
               AND mv.kind IN (${COSTED}) AND mv.doc_date >= u.m AND mv.doc_date < (u.m + interval '1 month')::date) AS need_cogs,
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
    FROM u`;

export const PERIOD_DIAGNOSTICS: DiagCheck[] = [
  {
    code: 'INVENTORY_NEGATIVE', closeRef: 'PC-004', layer: 'L3', level: 'warn', scoped: true,
    remedy: { steps: [{ text: 'Mở Nhập xuất tồn tại ngày âm đầu tiên trong mẫu', screen: SCREENS.ACC83 }, { text: 'Tìm phiếu nhập thiếu / trễ / sai kho / sai mã; bổ sung hoặc sửa ở nguồn', role: 'creator' }, { text: 'Tính lại giá vốn tháng đó', screen: SCREENS.ACC49, role: 'chief_accountant' }], owner: 'accountant', verify: { code: 'INVENTORY_NEGATIVE' }, forbid: ['Không điều chỉnh kho cho "khớp"'] },
    title: 'Không có tồn kho âm theo mặt hàng × kho × ngày',
    fix: 'Tồn âm nghĩa là hàng xuất trước khi có chứng từ nhập (thiếu / trễ phiếu nhập, nhập sai kho, sai mã hàng): giá vốn bình quân của mã đó sai theo. Mẫu: <chi nhánh>:<kho>:<mã hàng>@<ngày âm đầu tiên>. Bổ sung hoặc sửa chứng từ nhập rồi tính lại giá vốn tháng đó; không điều chỉnh sổ cho "khớp".',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM (SELECT DISTINCT m.branch_id, m.warehouse_code, m.sku FROM inventory_movements m WHERE ${scoped(s, 'm', 'doc_date')}) x`,
      sql`WITH r AS (${balances(s)})
          SELECT b.code || ':' || CASE WHEN r.warehouse_code = '' THEN '-' ELSE r.warehouse_code END || ':' || r.sku || '@' || to_char(min(r.doc_date), 'YYYY-MM-DD') AS key,
                 count(*) OVER ()::int AS total
            FROM r JOIN branches b ON b.id = r.branch_id
           WHERE r.bal < 0 ${s.from ? sql`AND r.doc_date >= ${s.from}` : sql``}
           GROUP BY b.code, r.warehouse_code, r.sku
           ORDER BY min(r.doc_date), 1 LIMIT ${SAMPLE}`),
  },
  {
    code: 'PERIOD_CLOSE_OPEN', closeRef: 'PC-017', layer: 'L3', level: 'warn', scoped: true,
    remedy: { steps: [{ text: 'gia-von: tính giá vốn tháng / chi nhánh trong mẫu', screen: SCREENS.ACC49, role: 'chief_accountant' }, { text: 'ket-chuyen hoặc thu-tu: chạy (lại) kết chuyển', screen: SCREENS.ACC6, role: 'chief_accountant' }, { text: 'khoa-so: khoá kỳ; còn cảnh báo thì ghi lý do ≥ 10 ký tự', screen: SCREENS.ACC2, role: 'chief_accountant' }], owner: 'chief_accountant', verify: { code: 'PERIOD_CLOSE_OPEN' } },
    title: 'Tháng đã qua quá 30 ngày có đủ việc cuối kỳ theo thứ tự: tính giá vốn, kết chuyển, khoá sổ',
    fix: 'Mẫu: <chi nhánh>:<YYYY-MM>:<việc còn thiếu>. gia-von: có hàng xuất mà chưa có phiếu giá vốn tháng. ket-chuyen: còn số doanh thu / chi phí theo bộ quy tắc kết chuyển. thu-tu: giá vốn tính lại sau kết chuyển, cần chạy lại kết chuyển. khoa-so: kỳ chưa khoá. Làm theo thứ tự ở Cuối kỳ; khoá sổ là quyết định của kế toán trưởng.',
    run: (trx, s) => sqlCounts(trx,
      sql`WITH c AS (${closeState(s)}) SELECT count(*)::int AS n FROM c`,
      sql`WITH c AS (${closeState(s)})
          SELECT b.code || ':' || c.ym || ':' || concat_ws('+',
                   CASE WHEN c.need_cogs AND c.cogs_at IS NULL THEN 'gia-von' END,
                   CASE WHEN c.need_close AND c.close_at IS NULL THEN 'ket-chuyen' END,
                   CASE WHEN c.cogs_at > c.close_at THEN 'thu-tu' END,
                   CASE WHEN NOT c.locked THEN 'khoa-so' END) AS key,
                 count(*) OVER ()::int AS total
            FROM c JOIN branches b ON b.id = c.branch_id
           WHERE (c.need_cogs AND c.cogs_at IS NULL) OR (c.need_close AND c.close_at IS NULL) OR c.cogs_at > c.close_at OR NOT c.locked
           ORDER BY c.m, b.code LIMIT ${SAMPLE}`),
  },
];

/**
 * Việc cuối kỳ còn thiếu của MỘT tháng (Posting Gate trước khoá kỳ, ADR-0012 T3 / T4): cùng tín hiệu với PERIOD_CLOSE_OPEN nhưng
 * không chờ 30 ngày và không tính `khoa-so` (chính là việc người dùng đang làm). Trả mẫu <chi nhánh>:<YYYY-MM>:<việc>. Chỉ đọc.
 */
export async function periodCloseGaps(trx: Db, s: DiagScope, month: string): Promise<string[]> {
  const first = `${month.slice(0, 7)}-01`;
  const rows = await sql<{ key: string }>`WITH c AS (${closeState(s, first)})
    SELECT b.code || ':' || c.ym || ':' || concat_ws('+',
             CASE WHEN c.need_cogs AND c.cogs_at IS NULL THEN 'gia-von' END,
             CASE WHEN c.need_close AND c.close_at IS NULL THEN 'ket-chuyen' END,
             CASE WHEN c.cogs_at > c.close_at THEN 'thu-tu' END) AS key
      FROM c JOIN branches b ON b.id = c.branch_id
     WHERE (c.need_cogs AND c.cogs_at IS NULL) OR (c.need_close AND c.close_at IS NULL) OR c.cogs_at > c.close_at
     ORDER BY b.code`.execute(trx);
  return rows.rows.map((r) => r.key);
}
