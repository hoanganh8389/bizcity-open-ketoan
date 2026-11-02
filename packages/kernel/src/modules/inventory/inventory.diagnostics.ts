// @bizcity-layer K kernel/subledgers/inventory
// [2026-11-02 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W2: kiểm L3 kho — COGS_STALE (chứng từ kho đổi sau phiếu giá vốn tháng), STOCK_ADJUST_NO_REASON (điều chỉnh kho thiếu lý do); cùng mã với lane DG-STK-1, DG-STK-2.
/**
 * Kho — CHỈ ĐỌC, mức warn (R-VNC-10). Phiếu giá vốn tháng: khoá cogs:<chi nhánh>:<YYYY-MM> (costing.service).
 * SQL chép sang lane diagnostics (tests/conformance/diagnostics/inventory.diag.mjs). Đổi một bên thì đổi bên kia (R-DIAG-9).
 */
import { sql } from 'kysely';
import { SCREENS } from '@ketoan/contracts';
import { sqlCounts, type DiagCheck, type DiagScope } from '@bizcity/platform/system/diagnostics';

const SAMPLE = 20;
const branchCond = (s: DiagScope, t: string) => (s.branchId ? sql`AND ${sql.ref(`${t}.branch_id`)} = ${s.branchId}` : sql``);
const ymRange = (s: DiagScope, col: string) => sql`${s.from ? sql`AND ${sql.ref(col)} >= to_char(${s.from}::date, 'YYYY-MM')` : sql``} ${s.to ? sql`AND ${sql.ref(col)} <= to_char(${s.to}::date, 'YYYY-MM')` : sql``}`;

/** Phiếu giá vốn tháng đã ghi theo (chi nhánh, tháng) và lúc ghi bút toán mới nhất. */
const cogsRuns = (s: DiagScope) => sql`
  SELECT a.branch_id, right(a.doc_key, 7) AS ym, max(e.created_at) AS at
    FROM accounting_events a JOIN ledger_entries e ON e.event_id = a.id AND e.status = 'posted' AND NOT e.is_reversal
   WHERE a.tenant_id = ${s.tenantId} AND a.doc_type = 'cogs' AND a.status = 'posted' ${branchCond(s, 'a')}
   GROUP BY 1, 2`;

export const INVENTORY_DIAGNOSTICS: DiagCheck[] = [
  {
    code: 'COGS_STALE', layer: 'L3', level: 'warn', scoped: true,
    remedy: {
      steps: [
        { text: 'Tính lại giá vốn tháng / chi nhánh trong mẫu', screen: SCREENS.ACC49, role: 'chief_accountant' },
        { text: 'Kết chuyển lại tháng đó nếu đã kết chuyển', screen: SCREENS.ACC6, role: 'chief_accountant' },
      ],
      owner: 'chief_accountant', verify: { code: 'COGS_STALE' },
    },
    title: 'Phiếu giá vốn tháng không lỗi thời (không có chứng từ kho của tháng được nhận / sửa sau lần tính)',
    fix: 'Có phiếu nhập / xuất của tháng được nhận hoặc sửa sau khi đã tính giá vốn: đơn giá và giá vốn tháng đó đã cũ. Mẫu: <chi nhánh>:<YYYY-MM>.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM (${cogsRuns(s)}) c WHERE true ${ymRange(s, 'c.ym')}`,
      sql`SELECT b.code || ':' || c.ym AS key, count(*) OVER ()::int AS total
            FROM (${cogsRuns(s)}) c JOIN branches b ON b.id = c.branch_id
           WHERE true ${ymRange(s, 'c.ym')}
             AND EXISTS (SELECT 1 FROM inventory_movements m JOIN accounting_events ev ON ev.id = m.event_id
                          WHERE m.tenant_id = ${s.tenantId} AND m.branch_id = c.branch_id AND to_char(m.doc_date, 'YYYY-MM') = c.ym AND ev.received_at > c.at)
           ORDER BY c.ym, b.code LIMIT ${SAMPLE}`),
  },
  {
    code: 'STOCK_ADJUST_NO_REASON', layer: 'L3', level: 'warn', scoped: true,
    remedy: {
      steps: [
        { text: 'Mở phiếu điều chỉnh kho theo khoá trong mẫu', screen: SCREENS.ACC14 },
        { text: 'Ghi lý do (kiểm kê, hư hỏng…) kèm biên bản ở hệ thống nguồn, gửi lại', role: 'creator' },
        { text: 'Chọn lý do có tài khoản đối ứng', screen: SCREENS.ACC18, role: 'chief_accountant' },
      ],
      owner: 'accountant', verify: { code: 'STOCK_ADJUST_NO_REASON' },
    },
    title: 'Phiếu điều chỉnh kho (tăng / giảm) có lý do',
    fix: 'Chênh lệch kiểm kê không ghi lý do thì không có cơ sở hạch toán, dễ bị loại khi thanh tra. Mẫu: khoá chứng từ.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(DISTINCT m.event_id)::int AS n FROM inventory_movements m
           WHERE m.tenant_id = ${s.tenantId} AND m.kind IN ('adjust_in', 'adjust_out') ${branchCond(s, 'm')}
             ${s.from ? sql`AND m.doc_date >= ${s.from}` : sql``} ${s.to ? sql`AND m.doc_date <= ${s.to}` : sql``}`,
      sql`SELECT a.doc_key AS key, count(*) OVER ()::int AS total FROM accounting_events a
           WHERE a.id IN (SELECT m.event_id FROM inventory_movements m
                           WHERE m.tenant_id = ${s.tenantId} AND m.kind IN ('adjust_in', 'adjust_out') AND coalesce(m.reason_code, '') = '' ${branchCond(s, 'm')}
                             ${s.from ? sql`AND m.doc_date >= ${s.from}` : sql``} ${s.to ? sql`AND m.doc_date <= ${s.to}` : sql``})
           ORDER BY a.doc_date, a.doc_key LIMIT ${SAMPLE}`),
  },
];
