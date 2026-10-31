// @bizcity-layer K kernel/ledger
// [2026-10-31 08:12 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — ledger.query (PHASES 3.7, S012-2): ledgerQuery.query + otherSide, đọc qua bizcity_read
/**
 * API ĐỌC SỔ của Kernel (năng lực ledger.query, PHASES 3.7). Ngoài Kernel không đọc bảng ledger_* (SC-KERNEL-7), mà:
 *   - gọi ledgerQuery.query() — số dư / phát sinh theo mã (tài khoản, đối tượng, chi nhánh, chiều phân tích, mã hàng);
 *     module gọi qua ctx.ledger.query() (BIZCITY-DATA §7);
 *   - hoặc viết SQL trên khung nhìn chỉ đọc bizcity_read.* (migration 0043) — báo cáo kế toán cần SQL riêng.
 * Hai đường đều đọc khung nhìn, không đọc bảng sổ: Kernel đổi cấu trúc bảng thì chỉ sửa khung nhìn.
 */
import { sql, type RawBuilder } from 'kysely';
import { fromCents, ledgerQuerySchema, toCents, type LedgerQuery, type LedgerQueryGroup, type LedgerQueryRow } from '@ketoan/contracts';
import type { Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';

const side = (t: string) => {
  const c = (col: string) => sql.ref(`${t}.${col}`);
  return sql`(CASE WHEN ${c('debit')} <> 0 THEN 1 WHEN ${c('credit')} <> 0 THEN -1 WHEN ${c('cost_fill')} = 'debit' THEN 1 WHEN ${c('cost_fill')} = 'credit' THEN -1 ELSE 0 END)`;
};

/**
 * otherSide(o, l): dòng `o` là PHÍA BÊN KIA của dòng `l` trong cùng cặp định khoản (cùng entry_id, pair_no) — để lấy tài khoản
 * đối ứng. Bên của dòng: Nợ nếu debit ≠ 0, Có nếu credit ≠ 0; dòng số 0 thì theo cost_fill (dòng giá vốn chờ tính giá:
 * 'debit' / 'credit'); dòng số 0 khác (hàng khuyến mãi tiền hàng 0, thuế 0 — migration 0060) không xác định bên → phía bên
 * kia là dòng còn lại của cặp. Trước đây so (debit <> 0) nên cặp dòng 0 không ra tài khoản đối ứng.
 * Luật "bên của dòng" là của Kernel (cost_fill, pair_no) nên mảnh SQL này ở đây, không ở báo cáo. Bí danh đi qua sql.ref
 * (trích dẫn định danh), không ghép chuỗi (SC-SEC-2).
 */
export function otherSide(o = 'o', l = 'l'): RawBuilder<boolean> {
  return sql<boolean>`(${side(o)} <> ${side(l)} OR (${side(o)} = 0 AND ${side(l)} = 0 AND ${sql.ref(`${o}.line_no`)} <> ${sql.ref(`${l}.line_no`)}))`;
}

export type { LedgerQuery, LedgerQueryRow, LedgerQueryGroup };

export const ledgerQuery = {
  /**
   * Số dư / phát sinh theo mã. Mã không tồn tại → lỗi (không trả 0 ngầm, R-REV-13: tra cứu cho tiền không mặc định).
   * Bút toán đã đảo và bút toán đảo cùng được cộng: chúng triệt tiêu nhau, số dư bằng số đang hiệu lực.
   */
  async query(db: Db, tenantId: string, input: LedgerQuery): Promise<LedgerQueryRow[]> {
    const parsed = ledgerQuerySchema.safeParse(input);
    if (!parsed.success) throw Errors.validation('Câu hỏi đọc sổ chưa hợp lệ', parsed.error.issues);
    const q = parsed.data;
    if (q.from && q.from > q.to) throw Errors.validation('Từ ngày sau đến ngày');
    const groups = q.groupBy?.length ? [...new Set(q.groupBy)] : ['account' as const];

    let partnerId: string | null = null;
    if (q.partnerCode) {
      const p = await db.selectFrom('partners').select('id').where('tenant_id', '=', tenantId).where('code', '=', q.partnerCode).executeTakeFirst();
      if (!p) throw Errors.notFound(`đối tượng ${q.partnerCode}`);
      partnerId = String(p.id);
    }
    let branchIds: string[] | null = null;
    if (q.branchCodes?.length) {
      const rows = await db.selectFrom('branches').select(['id', 'code']).where('tenant_id', '=', tenantId).where('code', 'in', q.branchCodes).execute();
      const missing = q.branchCodes.filter((c) => !rows.some((r) => r.code === c));
      if (missing.length) throw Errors.notFound(`chi nhánh ${missing.join(', ')}`);
      branchIds = rows.map((r) => String(r.id));
    }

    const detail = Boolean(q.sku || (q.dimension && Object.keys(q.dimension).length));
    const src = detail ? sql`bizcity_read.ledger_lines` : sql`bizcity_read.ledger_balances_daily`;
    const from = q.from ?? null;
    const cols = [
      groups.includes('account') ? sql`x.account_code` : sql`NULL::text`,
      groups.includes('partner') ? sql`p.code` : sql`NULL::text`,
      groups.includes('branch') ? sql`br.code` : sql`NULL::text`,
    ];
    const filters = [
      q.accounts?.length ? sql`AND x.account_code LIKE ANY(${q.accounts.map((a) => a + '%')}::text[])` : sql``,
      partnerId ? sql`AND x.partner_id = ${partnerId}::bigint` : sql``,
      branchIds ? sql`AND x.branch_id = ANY(${branchIds}::bigint[])` : sql``,
      q.sku ? sql`AND x.product_sku = ${q.sku}` : sql``,
      q.dimension && Object.keys(q.dimension).length ? sql`AND x.dims @> ${JSON.stringify(q.dimension)}::jsonb` : sql``,
    ];
    const res = await sql<{ account_code: string | null; partner_code: string | null; branch_code: string | null; opening: string; debit: string; credit: string }>`
      SELECT ${cols[0]} AS account_code, ${cols[1]} AS partner_code, ${cols[2]} AS branch_code,
             COALESCE(SUM(CASE WHEN x.posting_date <  ${from}::date THEN x.debit - x.credit ELSE 0 END), 0) AS opening,
             COALESCE(SUM(CASE WHEN ${from}::date IS NULL OR x.posting_date >= ${from}::date THEN x.debit  ELSE 0 END), 0) AS debit,
             COALESCE(SUM(CASE WHEN ${from}::date IS NULL OR x.posting_date >= ${from}::date THEN x.credit ELSE 0 END), 0) AS credit
        FROM ${src} x
        LEFT JOIN partners p ON p.id = x.partner_id
        JOIN branches br ON br.id = x.branch_id
       WHERE x.tenant_id = ${tenantId} AND x.posting_date <= ${q.to}::date
         ${sql.join(filters, sql` `)}
       GROUP BY 1, 2, 3
       ORDER BY 1, 2, 3`.execute(db);
    return res.rows.map((r) => {
      const opening = toCents(Number(r.opening)); const debit = toCents(Number(r.debit)); const credit = toCents(Number(r.credit));
      return {
        ...(groups.includes('account') ? { accountCode: r.account_code ?? '' } : {}),
        ...(groups.includes('partner') ? { partnerCode: r.partner_code } : {}),
        ...(groups.includes('branch') ? { branchCode: r.branch_code ?? '' } : {}),
        opening: fromCents(opening), debit: fromCents(debit), credit: fromCents(credit), closing: fromCents(opening + debit - credit),
      };
    }).filter((r) => r.opening !== 0 || r.debit !== 0 || r.credit !== 0);
  },
};
