// @bizcity-layer K kernel/ledger
// [2026-11-02 07:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W1: remedy có cấu trúc cho từng kiểm (bizcity_remedy@1, R-FIX-1).
// [2026-10-30 10:29 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — tự chẩn đoán L1 / L3, diagnostic_runs, khoá kỳ chặn khi sổ lỗi (PHASES 2.10).
// [2026-10-30 07:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — một cửa ghi sổ: eventStore cho phiếu tay, kết chuyển, khấu hao, giá vốn.
// [2026-10-30 09:03 PM Johnny Chu - Chu Hoàng Anh] PHASE-005 — chính sách kế toán có phiên bản + ngày hiệu lực (ADR-0009).
// [2026-10-31 08:34 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — LEDGER_TRIGGERS hiểu schema như DG-DB-2: trigger chỉ đọc trên khung nhìn bizcity_read.* (0043)
// [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/modules/ledger/ledger.diagnostics.ts sang packages/kernel (@bizcity/kernel, D010-7 chặng 3); import Platform qua @bizcity/platform
/**
 * Kiểm toàn vẹn sổ của Kernel (L3) và lớp bảo vệ sổ (L1) — đăng ký vào bộ chẩn đoán của Platform (modules/system/diagnostics.ts)
 * lúc lắp ráp. SQL chép từ lane diagnostics của bộ kiểm chuẩn (tests/conformance/diagnostics/ledger.diag.mjs, install.diag.mjs),
 * thêm điều kiện đơn vị + khoảng ngày + chi nhánh. Đổi một bên thì đổi bên kia: SC-DIAG-1 kiểm hai nơi cùng bộ mã (R-DIAG-9).
 *
 * Ngày xét: bút toán theo posting_date, sự việc theo doc_date (= ngày hạch toán, bizcity_ledger_intake@1 §3).
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql, type RawBuilder } from 'kysely';
import { MIGRATIONS_DIR } from '@bizcity/platform/db/paths';
import { sqlCounts, type DiagCheck, type DiagScope } from '@bizcity/platform/system/diagnostics';
import { SCREENS, STOP_THE_LINE_STEP } from '@ketoan/contracts';

const SAMPLE = 20;
/** Sự việc Kernel tự sinh (kết chuyển, giá vốn, khấu hao): ghi sổ qua eventStore (PHASES 2.1). */
const INTERNAL = ['closing', 'cogs', 'depreciation'];
/** Phiếu kho tổng tiền 0 (chuyển kho, điều chỉnh kho) không có bút toán: giá trị ghi ở phiếu giá vốn tháng — không phải lỗi. */
const STOCK_ZERO = ['transfer', 'stock_adjustment'];

/** Điều kiện đơn vị + phạm vi trên bảng alias `t` có cột ngày `date` và (tuỳ) cột chi nhánh. */
function scoped(s: DiagScope, t: string, date: string, branch: string | null = 'branch_id'): RawBuilder<boolean> {
  const parts: RawBuilder<unknown>[] = [sql`${sql.ref(`${t}.tenant_id`)} = ${s.tenantId}`];
  if (s.from) parts.push(sql`${sql.ref(`${t}.${date}`)} >= ${s.from}`);
  if (s.to) parts.push(sql`${sql.ref(`${t}.${date}`)} <= ${s.to}`);
  if (s.branchId && branch) parts.push(sql`${sql.ref(`${t}.${branch}`)} = ${s.branchId}`);
  return sql<boolean>`(${sql.join(parts, sql` AND `)})`;
}

const internal = sql.join(INTERNAL);
/** POLICY_VERSION: phạm vi + điều kiện sai — câu SQL cố định, không ghép giá trị (cùng chữ với lane DG-POL-1). */
const policyScope = sql<boolean>`NOT e.is_reversal AND a.source_system <> 'manual'
             AND e.created_at >= (SELECT min(p.created_at) FROM posting_policy_versions p WHERE p.tenant_id = e.tenant_id)`;
const policyBad = sql<boolean>`(e.policy_version IS NULL OR NOT EXISTS (
               SELECT 1 FROM posting_policy_versions v
                WHERE v.tenant_id = e.tenant_id AND v.version = e.policy_version AND v.effective_from <= e.posting_date
                  AND NOT EXISTS (SELECT 1 FROM posting_policy_versions v2
                                   WHERE v2.tenant_id = e.tenant_id AND v2.effective_from <= e.posting_date AND v2.created_at <= e.created_at
                                     AND (v2.effective_from, v2.version) > (v.effective_from, v.version))))`;
const valued = sql<boolean>`NOT (a.total = 0 AND a.doc_type IN (${sql.join(STOCK_ZERO)}))`;
/** Sự việc `a` có bút toán hiệu lực phát sinh trên tài khoản thuế GTGT đầu vào của đơn vị (loại thuế đầu vào + ngầm định tax_input). */
const inputTaxPosted = sql<boolean>`EXISTS (SELECT 1 FROM ledger_entries e JOIN ledger_lines l ON l.entry_id = e.id
  WHERE e.event_id = a.id AND e.status = 'posted' AND NOT e.is_reversal AND l.debit <> l.credit
    AND l.account_code IN (SELECT tc.account_code FROM tax_codes tc WHERE tc.tenant_id = a.tenant_id AND tc.direction = 'input' AND tc.account_code IS NOT NULL
                           UNION SELECT d.account_code FROM posting_defaults d WHERE d.tenant_id = a.tenant_id AND d.key = 'tax_input'))`;

// [2026-11-06 10:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — E6: cặp (thuế đầu vào trên sổ, thuế trên sổ hoá đơn) của từng sự việc đã ghi sổ có hoá đơn
/** Mỗi sự việc trong phạm vi có cả bút toán thuế đầu vào và hoá đơn đầu vào còn hiệu lực: `so` = thuế ròng trên sổ, `hd` = thuế ròng trên hoá đơn. */
const vatInputPairs = (s: DiagScope) => sql`
  SELECT a.doc_key, a.doc_date, so.amt AS so, hd.amt AS hd
    FROM accounting_events a
    JOIN (SELECT e.event_id, sum(l.debit - l.credit) AS amt
            FROM ledger_entries e JOIN ledger_lines l ON l.entry_id = e.id
           WHERE e.tenant_id = ${s.tenantId}
             AND l.account_code IN (SELECT tc.account_code FROM tax_codes tc WHERE tc.tenant_id = ${s.tenantId} AND tc.direction = 'input' AND tc.account_code IS NOT NULL
                                    UNION SELECT d.account_code FROM posting_defaults d WHERE d.tenant_id = ${s.tenantId} AND d.key = 'tax_input')
           GROUP BY e.event_id) so ON so.event_id = a.id
    JOIN (SELECT i.event_id, sum(i.total_tax * i.sign) AS amt FROM tax_invoices i
           WHERE i.tenant_id = ${s.tenantId} AND i.direction = 'input' AND i.status IN ('valid', 'adjusted')
           GROUP BY i.event_id) hd ON hd.event_id = a.id
   WHERE ${scoped(s, 'a', 'doc_date')} AND a.status = 'posted'`;

export const LEDGER_DIAGNOSTICS: DiagCheck[] = [
  {
    code: 'LEDGER_BALANCED', layer: 'L3', level: 'error', scoped: true,
    remedy: { steps: [STOP_THE_LINE_STEP, { text: 'Trigger cân Nợ = Có đã bị vượt: kiểm LEDGER_TRIGGERS', role: 'operator' }], owner: 'core_team', verify: { code: 'LEDGER_BALANCED' }, stopTheLine: true },
    title: 'Mỗi bút toán: tổng Nợ = tổng Có',
    fix: 'Bút toán lệch làm sai bảng cân đối. Trigger cân Nợ = Có đã bị vượt qua — báo nhóm Lõi, không tự sửa sổ.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM ledger_entries e WHERE ${scoped(s, 'e', 'posting_date')}`,
      sql`SELECT e.entry_no AS key, count(*) OVER ()::int AS total
            FROM ledger_entries e JOIN ledger_lines l ON l.entry_id = e.id
           WHERE ${scoped(s, 'e', 'posting_date')}
           GROUP BY e.id, e.entry_no HAVING sum(l.debit) <> sum(l.credit)
           ORDER BY e.id LIMIT ${SAMPLE}`),
  },
  {
    code: 'LEDGER_BALANCES_DAILY', layer: 'L3', level: 'error', scoped: true,
    remedy: { steps: [STOP_THE_LINE_STEP, { text: 'Không khoá kỳ khi còn lỗi này', role: 'chief_accountant' }, { text: 'Nhóm Lõi dựng lại số dư ngày từ dòng sổ', role: 'core_team' }], owner: 'core_team', verify: { code: 'LEDGER_BALANCES_DAILY' }, stopTheLine: true, forbid: ['Không sửa tay bảng số dư'] },
    title: 'Số dư ngày (ledger_balances_daily) = tổng dòng sổ theo chi nhánh, tài khoản, ngày',
    fix: 'Báo cáo đọc số dư ngày sẽ lệch sổ chi tiết. Dựng lại số dư ngày bằng lệnh của nhóm Lõi (ngoại lệ RULE-LEDGER), có bằng chứng.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM (SELECT DISTINCT l.branch_id, l.account_code, l.posting_date FROM ledger_lines l WHERE ${scoped(s, 'l', 'posting_date')}) x`,
      sql`WITH l AS (SELECT l.branch_id, l.account_code, l.posting_date, sum(l.debit) d, sum(l.credit) c FROM ledger_lines l
                      WHERE ${scoped(s, 'l', 'posting_date')} GROUP BY 1, 2, 3),
               b AS (SELECT b.branch_id, b.account_code, b.posting_date, sum(b.debit) d, sum(b.credit) c FROM ledger_balances_daily b
                      WHERE ${scoped(s, 'b', 'posting_date')} GROUP BY 1, 2, 3)
          SELECT concat_ws(':', branch_id, account_code, posting_date) AS key, count(*) OVER ()::int AS total
            FROM l FULL JOIN b USING (branch_id, account_code, posting_date)
           WHERE coalesce(l.d, 0) <> coalesce(b.d, 0) OR coalesce(l.c, 0) <> coalesce(b.c, 0)
           LIMIT ${SAMPLE}`),
  },
  {
    code: 'LEDGER_REVERSED_ONCE', layer: 'L3', level: 'error', scoped: true,
    remedy: { steps: [STOP_THE_LINE_STEP, { text: 'Mở chứng từ theo số bút toán trong mẫu, xem nhật ký định khoản', screen: SCREENS.ACC14 }], owner: 'core_team', verify: { code: 'LEDGER_REVERSED_ONCE' }, stopTheLine: true },
    title: 'Bút toán đã đảo có đúng một bút toán đảo; bút toán đảo trỏ về bút toán đã đảo',
    fix: 'Đảo hai lần hoặc đảo trỏ sai làm số phát sinh bị trừ thừa / thiếu. Báo nhóm Lõi kèm số bút toán.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM ledger_entries e WHERE ${scoped(s, 'e', 'posting_date')} AND (e.status = 'reversed' OR e.reverses_entry_id IS NOT NULL)`,
      sql`SELECT key, count(*) OVER ()::int AS total FROM (
            SELECT e.entry_no AS key FROM ledger_entries e
             WHERE ${scoped(s, 'e', 'posting_date')} AND e.status = 'reversed'
               AND (SELECT count(*) FROM ledger_entries r WHERE r.reverses_entry_id = e.id) <> 1
            UNION ALL
            SELECT r.entry_no FROM ledger_entries r LEFT JOIN ledger_entries o ON o.id = r.reverses_entry_id
             WHERE ${scoped(s, 'r', 'posting_date')} AND r.reverses_entry_id IS NOT NULL AND (o.id IS NULL OR o.status <> 'reversed')
          ) x LIMIT ${SAMPLE}`),
  },
  {
    code: 'LEDGER_ORPHAN', layer: 'L3', level: 'error', scoped: true,
    remedy: { steps: [STOP_THE_LINE_STEP, { text: 'Lập biên bản với ban kiểm soát kèm số bút toán trong mẫu', role: 'owner' }], owner: 'core_team', verify: { code: 'LEDGER_ORPHAN' }, stopTheLine: true, forbid: ['Không xoá bút toán'] },
    title: 'Mọi bút toán trỏ về một sự việc (accounting_events) có thật',
    fix: 'Bút toán không có sự việc thì không truy được chứng từ gốc, không đảo đúng được khi sửa. Báo nhóm Lõi (câu 1: không sự việc, không bút toán).',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM ledger_entries e WHERE ${scoped(s, 'e', 'posting_date')}`,
      sql`SELECT e.entry_no AS key, count(*) OVER ()::int AS total FROM ledger_entries e
           WHERE ${scoped(s, 'e', 'posting_date')}
             AND (e.event_id IS NULL OR NOT EXISTS (SELECT 1 FROM accounting_events a WHERE a.id = e.event_id))
           LIMIT ${SAMPLE}`),
  },
  {
    code: 'EVENT_POSTED_VERSION', layer: 'L3', level: 'error', scoped: true,
    remedy: { steps: [STOP_THE_LINE_STEP, { text: 'Định khoản lại chứng từ trong mẫu ở Định khoản tự động (bút toán cũ ghi số âm, ghi bút toán mới)', screen: SCREENS.ACC14, role: 'accountant' }, { text: 'Còn lỗi sau khi định khoản lại: gửi nhóm Lõi mã tra cứu' }], owner: 'accountant', verify: { code: 'EVENT_POSTED_VERSION' }, stopTheLine: true },
    title: 'Sự việc đã ghi sổ có posted_version = version',
    fix: 'Sổ đang phản ánh phiên bản cũ của chứng từ. Định khoản lại chứng từ ở ACC14 (Chờ định khoản) hoặc gửi lại bản mới nhất.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM accounting_events a WHERE ${scoped(s, 'a', 'doc_date')} AND a.status = 'posted' AND a.doc_type NOT IN (${internal})`,
      sql`SELECT a.doc_key AS key, count(*) OVER ()::int AS total FROM accounting_events a
           WHERE ${scoped(s, 'a', 'doc_date')} AND a.status = 'posted' AND a.doc_type NOT IN (${internal})
             AND a.posted_version IS DISTINCT FROM a.version
           LIMIT ${SAMPLE}`),
  },
  {
    code: 'EVENT_HAS_ENTRY', layer: 'L3', level: 'warn', scoped: true,
    remedy: { steps: [{ text: 'Mở chứng từ trong mẫu ở Định khoản tự động, xem nhật ký định khoản', screen: SCREENS.ACC14 }, { text: 'Định khoản lại', screen: SCREENS.ACC14, role: 'accountant' }, { text: 'Lặp lại: báo nhóm Lõi kèm mã tra cứu' }], owner: 'accountant', verify: { code: 'EVENT_HAS_ENTRY' } },
    title: 'Sự việc đã ghi sổ có ít nhất một bút toán hiệu lực',
    fix: 'Chứng từ báo "đã ghi sổ" nhưng không còn bút toán hiệu lực (vd mọi dòng tiền bằng 0, hoặc đã đảo hết). Mở chứng từ ở ACC14 để xem. Không tính phiếu chuyển kho / điều chỉnh kho tổng tiền 0: giá trị của chúng ghi ở phiếu giá vốn tháng.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM accounting_events a WHERE ${scoped(s, 'a', 'doc_date')} AND a.status = 'posted' AND ${valued}`,
      sql`SELECT a.doc_key AS key, count(*) OVER ()::int AS total FROM accounting_events a
           WHERE ${scoped(s, 'a', 'doc_date')} AND a.status = 'posted' AND ${valued}
             AND NOT EXISTS (SELECT 1 FROM ledger_entries e WHERE e.event_id = a.id AND e.status = 'posted' AND NOT e.is_reversal)
           LIMIT ${SAMPLE}`),
  },
  {
    code: 'EVENT_PENDING_AGE', layer: 'L3', level: 'warn', scoped: true,
    remedy: { steps: [{ text: 'Mở Định khoản tự động, thẻ Chờ / Lỗi', screen: SCREENS.ACC14 }, { text: 'Xem trước bút toán; thiếu cấu hình thì bổ sung lý do / tài khoản', screen: SCREENS.ACC18, role: 'chief_accountant' }, { text: 'Định khoản, hoặc huỷ có lý do (nguồn báo xoá thì huỷ)', screen: SCREENS.ACC14, role: 'accountant' }], owner: 'accountant', verify: { code: 'EVENT_PENDING_AGE' } },
    title: 'Không có sự việc chờ định khoản / lỗi quá 3 ngày',
    fix: 'Chứng từ chưa vào sổ thì báo cáo thiếu số. Xử lý ở ACC14 (Chờ định khoản): sửa thiếu sót rồi định khoản, hoặc huỷ.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM accounting_events a WHERE ${scoped(s, 'a', 'doc_date')} AND a.status IN ('pending', 'error')`,
      sql`SELECT a.doc_key AS key, count(*) OVER ()::int AS total FROM accounting_events a
           WHERE ${scoped(s, 'a', 'doc_date')} AND a.status IN ('pending', 'error') AND a.received_at < now() - interval '3 days'
           ORDER BY a.received_at LIMIT ${SAMPLE}`),
  },
  {
    // [2026-10-31 05:07 PM Johnny Chu - Chu Hoàng Anh] R-REV — TAX_INPUT_NO_INVOICE (K0, chỉ đọc): thuế đầu vào đã vào sổ mà chưa có hoá đơn quá 30 ngày (REVIEW-2026-10-31-THUY việc h, bước 1).
    // Tài khoản thuế đầu vào lấy từ cấu hình của đơn vị (loại thuế đầu vào + ngầm định tax_input), không viết số tài khoản.
    code: 'TAX_INPUT_NO_INVOICE', layer: 'L3', level: 'warn', scoped: true,
    remedy: { steps: [{ text: 'Mở Bổ sung thông tin thuế, lọc "Chưa có hoá đơn"', screen: SCREENS.ACC78 }, { text: 'Có hoá đơn: nhập số / ký hiệu / ngày, rồi định khoản lại', screen: SCREENS.ACC78, role: 'accountant' }, { text: 'Không có hoá đơn: báo kế toán trưởng, bỏ đánh dấu được khấu trừ', screen: SCREENS.ACC78, role: 'chief_accountant' }], owner: 'accountant', verify: { code: 'TAX_INPUT_NO_INVOICE' } },
    title: 'Thuế GTGT đầu vào đã ghi sổ có hoá đơn trong sổ hoá đơn (chờ hoá đơn không quá 30 ngày)',
    fix: 'Phiếu mua chưa có số hoá đơn mà thuế đã vào tài khoản thuế đầu vào: bảng kê mua vào sẽ thiếu so với sổ. Nhận hoá đơn thì nhập số / ký hiệu / ngày hoá đơn vào phiếu (sổ hoá đơn tự ghi). Quá hạn mà không có hoá đơn: báo kế toán trưởng — thuế chưa đủ điều kiện khấu trừ.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM accounting_events a WHERE ${scoped(s, 'a', 'doc_date')} AND a.status = 'posted' AND ${inputTaxPosted}`,
      sql`SELECT a.doc_key AS key, count(*) OVER ()::int AS total FROM accounting_events a
           WHERE ${scoped(s, 'a', 'doc_date')} AND a.status = 'posted' AND ${inputTaxPosted} AND a.doc_date < current_date - 30
             AND NOT EXISTS (SELECT 1 FROM tax_invoices i WHERE i.event_id = a.id)
           ORDER BY a.doc_date LIMIT ${SAMPLE}`),
  },
  // [2026-11-06 10:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — E6 đợt 1 (S029-13, 30 §6): sổ đăng ký đối chiếu — VAT_INPUT_INVOICE_MATCH, LEDGER_ROUNDING thay mục 3 / 5 chạy tay của doi-chieu-ke-toan.sql
  {
    // Cộng ròng mọi bút toán của sự việc (gốc bị đảo + bút toán đảo triệt tiêu nhau) → số thuế hiện hành trên sổ; hoá đơn thay thế / huỷ không tính.
    code: 'VAT_INPUT_INVOICE_MATCH', layer: 'L3', level: 'warn', scoped: true,
    remedy: { steps: [{ text: 'Mở Bổ sung thông tin thuế, tìm chứng từ trong mẫu', screen: SCREENS.ACC78 }, { text: 'Thuế trên hoá đơn đúng: sửa chứng từ (dòng thuế / loại thuế) rồi định khoản lại', screen: SCREENS.ACC14, role: 'accountant' }, { text: 'Thuế trên sổ đúng: sửa số thuế của hoá đơn trong sổ hoá đơn', screen: SCREENS.ACC78, role: 'accountant' }], owner: 'accountant', verify: { code: 'VAT_INPUT_INVOICE_MATCH' }, forbid: ['Không lập phiếu kế toán tay vào tài khoản thuế để làm khớp số'] },
    title: 'Thuế GTGT đầu vào trên sổ khớp thuế trên sổ hoá đơn của cùng chứng từ (lệch không quá 0,5 đồng)',
    fix: 'Chứng từ đã có hoá đơn nhưng số thuế đầu vào ghi sổ khác số thuế trên hoá đơn: bảng kê mua vào và tài khoản thuế đầu vào không cùng một số. Thường do sửa số thuế ở một bên mà không sửa bên kia, hoặc chọn sai loại thuế trên dòng.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM (${vatInputPairs(s)}) x`,
      sql`SELECT x.doc_key AS key, count(*) OVER ()::int AS total FROM (${vatInputPairs(s)}) x
           WHERE abs(x.so - x.hd) > 0.5 ORDER BY x.doc_date, x.doc_key LIMIT ${SAMPLE}`),
  },
  {
    code: 'LEDGER_ROUNDING', layer: 'L3', level: 'warn', scoped: true,
    remedy: { steps: [{ text: 'Mở chứng từ của bút toán trong mẫu, làm tròn đơn giá / thành tiền về đồng ở nguồn', screen: SCREENS.ACC14, role: 'accountant' }, { text: 'Nguồn ngoài (POS, kết nối) gửi số lẻ xu: báo người tích hợp làm tròn trước khi gửi' }], owner: 'accountant', verify: { code: 'LEDGER_ROUNDING' } },
    title: 'Dòng sổ cái ghi số tiền tròn đồng (sổ ghi đồng Việt Nam)',
    fix: 'Dòng sổ có số lẻ dưới một đồng: tổng trên báo cáo, tờ khai và bảng kê lệch nhau vài đồng sau khi cộng. Làm tròn ở chứng từ nguồn rồi định khoản lại; không làm tròn bằng phiếu tay.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id WHERE ${scoped(s, 'e', 'posting_date')}`,
      sql`SELECT e.entry_no AS key, count(*) OVER ()::int AS total FROM ledger_entries e
           WHERE ${scoped(s, 'e', 'posting_date')}
             AND EXISTS (SELECT 1 FROM ledger_lines l WHERE l.entry_id = e.id AND (l.debit <> round(l.debit) OR l.credit <> round(l.credit)))
           ORDER BY e.posting_date, e.entry_no LIMIT ${SAMPLE}`),
  },
  {
    // ADR-0009, C-9: bút toán dựng theo luật định khoản ghi đúng phiên bản chính sách áp cho ngày hạch toán.
    code: 'POLICY_VERSION', layer: 'L3', level: 'warn', scoped: true,
    remedy: { steps: [{ text: 'Định khoản lại chứng từ trong mẫu', screen: SCREENS.ACC14, role: 'accountant' }, { text: 'Báo nhóm Lõi: có đường định khoản không đọc chính sách theo ngày hạch toán' }], owner: 'accountant', verify: { code: 'POLICY_VERSION' } },
    title: 'Bút toán định khoản theo luật ghi đúng phiên bản chính sách kế toán của ngày hạch toán',
    fix: 'Bút toán thiếu policy_version hoặc theo bản không áp cho ngày hạch toán của nó: có đường định khoản không đi loadPostingConfig({ asOf }). Định khoản lại chứng từ ở ACC14 và báo nhóm Lõi (ADR-0009).',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM ledger_entries e JOIN accounting_events a ON a.id = e.event_id
           WHERE ${scoped(s, 'e', 'posting_date')} AND ${policyScope}`,
      sql`SELECT e.entry_no AS key, count(*) OVER ()::int AS total FROM ledger_entries e JOIN accounting_events a ON a.id = e.event_id
           WHERE ${scoped(s, 'e', 'posting_date')} AND ${policyScope} AND ${policyBad}
           ORDER BY e.id LIMIT ${SAMPLE}`),
  },
  {
    code: 'INTERNAL_EVENT_VERSION', layer: 'L3', level: 'warn', scoped: true,
    remedy: { steps: [{ text: 'Chạy lại kết chuyển / tính giá vốn / khấu hao của kỳ trong mẫu', screen: SCREENS.ACC6, role: 'chief_accountant' }, { text: 'Còn lỗi: báo nhóm Lõi kèm mã tra cứu' }], owner: 'chief_accountant', verify: { code: 'INTERNAL_EVENT_VERSION' } },
    title: 'Sự việc nội bộ (kết chuyển, giá vốn, khấu hao) có posted_version = version',
    fix: 'Sự việc nội bộ đã vào sổ mà posted_version lệch phiên bản: có đường ghi không đi eventStore.markPosted() (R-LEDGER-4). Chạy lại kết chuyển / tính giá vốn / khấu hao của kỳ đó và báo nhóm Lõi.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM accounting_events a WHERE ${scoped(s, 'a', 'doc_date')} AND a.status = 'posted' AND a.doc_type IN (${internal})`,
      sql`SELECT a.doc_key AS key, count(*) OVER ()::int AS total FROM accounting_events a
           WHERE ${scoped(s, 'a', 'doc_date')} AND a.status = 'posted' AND a.doc_type IN (${internal})
             AND a.posted_version IS DISTINCT FROM a.version
           LIMIT ${SAMPLE}`),
  },
  // [2026-11-05 08:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — W1: ba mã chẩn đoán truy vết chứng từ gốc (DOC-01 / DOC-03 / DOC-04), mức warn — dữ liệu cũ có thể thiếu event_version; lane SQL DG-DOC-1..3
  {
    code: 'ENTRY_NO_VERSION', layer: 'L3', level: 'warn', scoped: true,
    remedy: { steps: [{ text: 'Mở chứng từ trong mẫu ở Định khoản tự động, định khoản lại để bút toán mới mang phiên bản chứng từ', screen: SCREENS.ACC14, role: 'accountant' }, { text: 'Lặp lại: báo nhóm Lõi kèm mã tra cứu' }], owner: 'accountant', verify: { code: 'ENTRY_NO_VERSION' } },
    title: 'Bút toán gắn sự việc có ghi phiên bản chứng từ đã tạo ra nó (event_version)',
    fix: 'Bút toán không biết nó sinh từ phiên bản nào của chứng từ nên không truy vết đúng phiên bản được (DOC-01 / DOC-03). Thường là bút toán ghi trước khi có cột phiên bản: định khoản lại chứng từ để bút toán mới mang phiên bản. Mọi đường ghi mới phải truyền sourceVersion (SC-DOC-7).',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM ledger_entries e WHERE ${scoped(s, 'e', 'posting_date')} AND e.event_id IS NOT NULL`,
      sql`SELECT e.entry_no AS key, count(*) OVER ()::int AS total FROM ledger_entries e
           WHERE ${scoped(s, 'e', 'posting_date')} AND e.event_id IS NOT NULL AND e.event_version IS NULL
           LIMIT ${SAMPLE}`),
  },
  {
    code: 'ENTRY_VERSION_UNKNOWN', layer: 'L3', level: 'warn', scoped: true,
    remedy: { steps: [{ text: 'Mở chứng từ của bút toán trong mẫu ở Định khoản tự động: phiên bản không còn nội dung lưu', screen: SCREENS.ACC14 }, { text: 'Báo nhóm Lõi kèm mã tra cứu — nội dung phiên bản cũ không được mất (DOC-06)', role: 'owner' }], owner: 'core_team', verify: { code: 'ENTRY_VERSION_UNKNOWN' } },
    title: 'Phiên bản chứng từ của bút toán còn nội dung lưu (hiện hành hoặc ở accounting_event_versions)',
    fix: 'Bút toán trỏ phiên bản chứng từ mà không còn nội dung để xem (không phải bản hiện hành, không có ở accounting_event_versions): lịch sử chứng từ bị mất, không giải thích được vì sao có bút toán này (DOC-03 / DOC-06). Báo nhóm Lõi, không tự sửa.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM ledger_entries e WHERE ${scoped(s, 'e', 'posting_date')} AND e.event_id IS NOT NULL AND e.event_version IS NOT NULL`,
      sql`SELECT e.entry_no AS key, count(*) OVER ()::int AS total FROM ledger_entries e JOIN accounting_events a ON a.id = e.event_id
           WHERE ${scoped(s, 'e', 'posting_date')} AND e.event_version IS NOT NULL AND e.event_version <> a.version
             AND NOT EXISTS (SELECT 1 FROM accounting_event_versions v WHERE v.event_id = a.id AND v.version = e.event_version)
           LIMIT ${SAMPLE}`),
  },
  {
    code: 'EVENT_ENTRIES_STALE', layer: 'L3', level: 'warn', scoped: true,
    remedy: { steps: [{ text: 'Mở chứng từ trong mẫu ở Định khoản tự động, xem nhật ký định khoản và định khoản lại', screen: SCREENS.ACC14, role: 'accountant' }, { text: 'Lặp lại: báo nhóm Lõi kèm mã tra cứu' }], owner: 'accountant', verify: { code: 'EVENT_ENTRIES_STALE' } },
    title: 'Bút toán đang hiệu lực của sự việc đã ghi sổ thuộc đúng phiên bản đã ghi nhận (posted_version)',
    fix: 'Sự việc báo ghi sổ phiên bản N nhưng còn bút toán hiệu lực của phiên bản khác: sổ lẫn hai phiên bản (DOC-04). Định khoản lại chứng từ ở ACC14 để bút toán cũ được đảo.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM accounting_events a WHERE ${scoped(s, 'a', 'doc_date')} AND a.status = 'posted' AND ${valued}`,
      sql`SELECT a.doc_key AS key, count(*) OVER ()::int AS total FROM accounting_events a
           WHERE ${scoped(s, 'a', 'doc_date')} AND a.status = 'posted' AND ${valued} AND a.posted_version IS NOT NULL
             AND EXISTS (SELECT 1 FROM ledger_entries e WHERE e.event_id = a.id AND e.status = 'posted' AND NOT e.is_reversal
                          AND e.event_version IS NOT NULL AND e.event_version <> a.posted_version)
           LIMIT ${SAMPLE}`),
  },
  // [2026-11-09 07:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-15a (D004-13): sửa đầu bút toán NGOÀI ứng dụng = dòng nhật ký của trigger 0089 (_source = db) không có dòng của ứng dụng (_source = app) cùng _txid; level error nên vào bảng kiểm khoá kỳ như mọi lỗi L3
  {
    code: 'LEDGER_HEADER_EDIT_UNATTRIBUTED', layer: 'L3', level: 'error', scoped: true,
    remedy: { steps: [{ text: 'Mở lịch sử chứng từ của bút toán trong mẫu: xem cột đổi, giá trị trước / sau, vai trò và giờ sửa', screen: SCREENS.ACC14 }, { text: 'Hỏi người sửa lý do; sửa sai thì định khoản lại chứng từ để bút toán về đúng nội dung', screen: SCREENS.ACC14, role: 'chief_accountant' }, { text: 'Không khoá kỳ khi còn lỗi này, trừ khi kế toán trưởng ghi lý do', role: 'chief_accountant' }], owner: 'chief_accountant', verify: { code: 'LEDGER_HEADER_EDIT_UNATTRIBUTED' } },
    title: 'Mọi lần sửa đầu bút toán đi qua ứng dụng (không có lần sửa trực tiếp trong CSDL)',
    fix: 'Đầu bút toán (số chứng từ, số hoá đơn, lý do, đối tượng, diễn giải, dấu vân tay, phiên bản sự việc, tên đối tượng) bị UPDATE thẳng bằng SQL, không qua đường E2 của ứng dụng. Mở bút toán trong mẫu, hỏi người sửa (vai trò trong nhật ký), sửa lại nếu sai; kế toán trưởng ghi lý do nếu cần khoá kỳ.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM audit_logs a JOIN ledger_entries e ON e.id::text = a.object_id AND e.tenant_id = a.tenant_id
           WHERE ${scoped(s, 'e', 'posting_date')} AND a.action = 'ledger.entry.header_update' AND a.after_data->>'_source' = 'db'`,
      sql`SELECT x.key, count(*) OVER ()::int AS total FROM (
            SELECT DISTINCT e.entry_no AS key, e.posting_date
              FROM audit_logs a JOIN ledger_entries e ON e.id::text = a.object_id AND e.tenant_id = a.tenant_id
             WHERE ${scoped(s, 'e', 'posting_date')} AND a.action = 'ledger.entry.header_update' AND a.after_data->>'_source' = 'db'
               AND NOT EXISTS (SELECT 1 FROM audit_logs b WHERE b.tenant_id = a.tenant_id AND b.object_id = a.object_id AND b.action = a.action
                                AND b.after_data->>'_source' = 'app' AND b.after_data->>'_txid' = a.after_data->>'_txid')
          ) x ORDER BY x.posting_date, x.key LIMIT ${SAMPLE}`),
  },
  {
    code: 'LEDGER_TRIGGERS', layer: 'L1', level: 'error', scoped: false,
    remedy: { steps: [STOP_THE_LINE_STEP, { text: 'Vận hành chạy lại migration để dựng lại trigger', role: 'operator' }, { text: 'Tra nhật ký CSDL ai / lúc nào tắt trigger, lập biên bản (R-KER-3)', role: 'owner' }, { text: 'Chạy lại toàn bộ tự chẩn đoán L3' }], owner: 'operator', verify: { code: 'LEDGER_TRIGGERS' }, stopTheLine: true },
    title: 'Trigger bảo vệ sổ (chỉ thêm, cân Nợ = Có, chặn TRUNCATE) còn đủ, đang bật và không còn cờ thoát',
    fix: 'Sổ đang mất lớp bảo vệ: có thể sửa / xoá bút toán. Không ghi sổ tiếp; chạy lại migration (db-migrate) và tìm ai đã tắt trigger hoặc đưa lại cờ thoát vào trigger (R-KER-3).',
    async run(trx) {
      const want = await declaredTriggers();
      // [2026-11-08 04:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-12 (D004-9): cột bypass dò trigger còn nhắc cờ thoát allow_ledger_purge (đã gỡ ở 0086); migration sau này vô tình đưa cờ trở lại thì đỏ ngay
      const rows = await sql<{ name: string; table: string; enabled: string; bypass: boolean }>`
        SELECT t.tgname AS name, CASE WHEN n.nspname = 'public' THEN c.relname ELSE n.nspname || '.' || c.relname END AS "table", t.tgenabled AS enabled,
               pg_get_triggerdef(t.oid) LIKE '%allow_ledger_purge%' AS bypass
          FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND n.nspname NOT IN ('pg_catalog', 'information_schema')`.execute(trx);
      const have = new Map(rows.rows.map((r) => [`${r.table}.${r.name}`, r.enabled]));
      const bad = want.filter((k) => !have.has(k) || have.get(k) === 'D').map((k) => (have.has(k) ? `tắt:${k}` : `thiếu:${k}`));
      for (const r of rows.rows) if (r.bypass) bad.push(`cờ thoát:${r.table}.${r.name}`);
      return { examined: want.length, count: bad.length, sample: bad };
    },
  },
];

let triggerCache: string[] | null = null;

/** `<bảng>.<trigger>` khai trong db/migrations (CREATE TRIGGER … ON …) — cùng cách đọc với DG-DB-2; bảng ngoài public ghi `schema.bảng`. */
async function declaredTriggers(): Promise<string[]> {
  if (triggerCache) return triggerCache;
  const out = new Set<string>();
  for (const f of (await readdir(MIGRATIONS_DIR)).filter((x) => x.endsWith('.sql')).sort()) {
    const text = await readFile(path.join(MIGRATIONS_DIR, f), 'utf8');
    for (const m of text.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+(\w+)[\s\S]*?\bON\s+(?:(\w+)\.)?(\w+)/gi)) {
      out.add(`${!m[2] || m[2] === 'public' ? m[3] : `${m[2]}.${m[3]}`}.${m[1]}`);
    }
  }
  return (triggerCache = [...out]);
}
