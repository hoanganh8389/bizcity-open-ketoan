// @bizcity-layer K kernel/subledgers/inventory
// [2026-11-10 09:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B2c-2 (S032-35): phép kiểm trỏ điều kiện khoá sổ closeRef (RULE-SELF-DIAGNOSTICS §2b, PHASE-032 · 70 §3a)
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

// [2026-11-03 07:17 PM Johnny Chu - Chu Hoàng Anh] ADR-0020 — trụ cột 7: INVENTORY_LEDGER_MISMATCH (DG-STK-3, F22-STK-11): sổ chi tiết kho ↔ số dư TK hàng tồn kho theo (chi nhánh, mặt hàng)
/**
 * Giá trị sổ kho và số dư sổ cái tới ngày cuối phạm vi, theo (chi nhánh, mặt hàng). Sổ kho định giá như sổ chi tiết hàng
 * (giá trị chứng từ, hoặc số lượng × đơn giá vốn tháng; chuyển đến lấy nhóm giá của bên gửi — cùng công thức valuedMovements
 * của module kho). TK hàng tồn kho = inventory_account của các nhóm hạch toán đơn vị đã khai. Cặp còn dòng chưa định giá bị
 * bỏ qua (đã có bảng kiểm "chưa tính giá vốn"); dòng sổ cái không gắn mặt hàng gom vào mã rỗng. Lệch ≥ 1 đồng thì báo.
 */
const ledgerVsStock = (s: DiagScope) => {
  const to = s.to ? sql`${s.to}::date` : sql`current_date`;
  return sql`
    WITH acc AS (SELECT DISTINCT inventory_account AS code FROM product_posting_groups WHERE tenant_id = ${s.tenantId}),
         gl AS (SELECT l.branch_id, coalesce(l.product_sku, '') AS sku, sum(l.debit - l.credit) AS v FROM ledger_lines l
                 WHERE l.tenant_id = ${s.tenantId} AND l.account_code IN (SELECT code FROM acc) AND l.posting_date <= ${to} ${branchCond(s, 'l')}
                 GROUP BY 1, 2),
         mv AS (SELECT m.branch_id, m.sku, sum(coalesce(m.amount, round(m.qty * c.unit_cost))) AS v, bool_or(m.amount IS NULL AND c.unit_cost IS NULL) AS uncosted
                  FROM inventory_movements m JOIN branches b ON b.id = m.branch_id LEFT JOIN branches cb ON cb.id = m.counter_branch_id
                  LEFT JOIN inventory_costs c ON c.tenant_id = m.tenant_id AND c.sku = m.sku
                   AND c.year = EXTRACT(YEAR FROM m.doc_date)::int AND c.month = EXTRACT(MONTH FROM m.doc_date)::int
                   AND c.cost_group = CASE WHEN m.kind = 'transfer_in' AND cb.id IS NOT NULL THEN coalesce(cb.accounting_unit_id, 0) ELSE coalesce(b.accounting_unit_id, 0) END
                 WHERE m.tenant_id = ${s.tenantId} AND m.doc_date <= ${to} ${branchCond(s, 'm')}
                 GROUP BY 1, 2)
    SELECT coalesce(gl.branch_id, mv.branch_id) AS branch_id, coalesce(gl.sku, mv.sku) AS sku, coalesce(gl.v, 0) AS gv, coalesce(mv.v, 0) AS sv,
           coalesce(mv.uncosted, false) AS uncosted
      FROM gl FULL JOIN mv ON mv.branch_id = gl.branch_id AND mv.sku = gl.sku`;
};

export const INVENTORY_DIAGNOSTICS: DiagCheck[] = [
  {
    code: 'INVENTORY_LEDGER_MISMATCH', closeRef: 'PC-009', layer: 'L3', level: 'warn', scoped: true,
    remedy: {
      steps: [
        { text: 'Mở đối chiếu kho ↔ sổ cái của kỳ (GET /api/v1/inventory/reconcile?period=YYYY-MM), xem trạng thái từng dòng trong mẫu', role: 'chief_accountant' },
        { text: 'Mã rỗng: bút toán tay vào tài khoản kho không gắn mặt hàng — huỷ phiếu đó, ghi lại bằng chứng từ kho có mặt hàng', role: 'accountant' },
        { text: 'Có mã: tìm chứng từ có ngày hạch toán khác ngày chứng từ, hoặc mặt hàng ghi vào tài khoản kho khác nhóm hạch toán; sửa ở nguồn rồi tính lại giá vốn (ACC49)', screen: SCREENS.ACC49, role: 'chief_accountant' },
      ],
      owner: 'chief_accountant', verify: { code: 'INVENTORY_LEDGER_MISMATCH' }, forbid: ['Không lập phiếu điều chỉnh kho để làm khớp số'],
    },
    title: 'Sổ chi tiết kho khớp số dư tài khoản hàng tồn kho (theo chi nhánh, mặt hàng)',
    fix: 'Tổng Nợ bằng tổng Có nhưng giá trị tồn theo sổ chi tiết khác số dư tài khoản kho: báo cáo kho và bảng cân đối không cùng một số. Mẫu: <chi nhánh>:<mã hàng> (mã rỗng = bút toán kho không gắn mặt hàng).',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM (${ledgerVsStock(s)}) x WHERE NOT x.uncosted`,
      sql`SELECT b.code || ':' || x.sku AS key, count(*) OVER ()::int AS total
            FROM (${ledgerVsStock(s)}) x JOIN branches b ON b.id = x.branch_id
           WHERE NOT x.uncosted AND abs(x.gv - x.sv) >= 1
           ORDER BY b.code, x.sku LIMIT ${SAMPLE}`),
  },
  {
    code: 'COGS_STALE', closeRef: 'PC-005', layer: 'L3', level: 'warn', scoped: true,
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
    code: 'STOCK_ADJUST_NO_REASON', closeRef: 'PC-004', layer: 'L3', level: 'warn', scoped: true,
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
  // [2026-11-06 10:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — E6 đợt 1 (S029-13, 30 §6): ITEM_CODE_CASE_DUP, UNIT_BASE_INVALID thay mục 6b / 7 chạy tay của doi-chieu-ke-toan.sql (danh mục, không theo ngày)
  {
    code: 'ITEM_CODE_CASE_DUP', closeRef: 'PC-001', layer: 'L3', level: 'warn', scoped: false,
    remedy: { steps: [{ text: 'Mở danh mục mặt hàng, tìm các mã trong mẫu (khác nhau chỉ ở hoa / thường hoặc khoảng trắng)', screen: SCREENS.DM10 }, { text: 'Cùng một hàng: gộp mã (giữ lịch sử, mã cũ thành bí danh) — không xoá, không đổi tay', screen: SCREENS.DM10, role: 'accountant' }, { text: 'Thật sự khác hàng: đổi mã một bên cho khác hẳn', screen: SCREENS.DM10, role: 'accountant' }], owner: 'accountant', verify: { code: 'ITEM_CODE_CASE_DUP' } },
    title: 'Mã hàng không trùng nhau khi bỏ khoảng trắng và không phân biệt hoa / thường',
    fix: 'Hai mã chỉ khác hoa / thường hoặc khoảng trắng (vd "sua01" và "SUA01 ") dễ bị nguồn ngoài, người nhập hiểu là một: tồn kho, giá vốn chia ra hai dòng. Cùng một hàng thì gộp mã; khác hàng thì đặt mã khác hẳn.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM products p WHERE p.tenant_id = ${s.tenantId}`,
      sql`SELECT x.k AS key, count(*) OVER ()::int AS total FROM (
            SELECT upper(btrim(p.sku)) AS k FROM products p WHERE p.tenant_id = ${s.tenantId} GROUP BY 1 HAVING count(*) > 1) x
           ORDER BY x.k LIMIT ${SAMPLE}`),
  },
  {
    code: 'UNIT_BASE_INVALID', closeRef: 'PC-001', layer: 'L3', level: 'warn', scoped: false,
    remedy: { steps: [{ text: 'Mở mặt hàng trong mẫu, thẻ Đơn vị tính', screen: SCREENS.DM10 }, { text: 'Đặt đúng một ĐVT gốc tỉ lệ 1 (ĐVT tồn kho nhỏ nhất) và nhiều nhất một ĐVT mua mặc định', screen: SCREENS.DM10, role: 'accountant' }], owner: 'accountant', verify: { code: 'UNIT_BASE_INVALID' } },
    title: 'Mặt hàng có khai ĐVT thì có đúng một ĐVT gốc tỉ lệ 1 và không quá một ĐVT mua mặc định',
    fix: 'Thiếu ĐVT gốc tỉ lệ 1 (hoặc có hai) thì số lượng quy đổi về tồn kho không xác định; hai ĐVT mua mặc định thì phiếu nhập tự chọn ĐVT khác nhau mỗi lần. Sửa khai báo ĐVT của mặt hàng.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(DISTINCT u.sku)::int AS n FROM product_units u WHERE u.tenant_id = ${s.tenantId}`,
      sql`SELECT x.sku AS key, count(*) OVER ()::int AS total FROM (
            SELECT u.sku FROM product_units u WHERE u.tenant_id = ${s.tenantId} GROUP BY u.sku
            HAVING count(*) FILTER (WHERE u.ratio = 1) <> 1 OR count(*) FILTER (WHERE u.is_purchase_default) > 1) x
           ORDER BY x.sku LIMIT ${SAMPLE}`),
  },
];
