/**
 * Mảnh SQL dùng chung cho báo cáo sổ cái.
 *
 * otherSide(o, l): dòng `o` là PHÍA BÊN KIA của dòng `l` trong cùng cặp định khoản (cùng entry_id, pair_no) — để lấy tài khoản
 * đối ứng. Bên của dòng: Nợ nếu debit ≠ 0, Có nếu credit ≠ 0; dòng số 0 thì theo cost_fill (dòng giá vốn chờ tính giá:
 * 'debit' / 'credit'); dòng số 0 khác (hàng khuyến mãi tiền hàng 0, thuế 0 — migration 0060) không xác định bên → phía bên
 * kia là dòng còn lại của cặp. Trước đây so (debit <> 0) nên cặp dòng 0 không ra tài khoản đối ứng.
 */
import { sql, type RawBuilder } from 'kysely';

const side = (t: string) => `(CASE WHEN ${t}.debit <> 0 THEN 1 WHEN ${t}.credit <> 0 THEN -1 WHEN ${t}.cost_fill = 'debit' THEN 1 WHEN ${t}.cost_fill = 'credit' THEN -1 ELSE 0 END)`;

export function otherSide(o = 'o', l = 'l'): RawBuilder<boolean> {
  return sql.raw<boolean>(`(${side(o)} <> ${side(l)} OR (${side(o)} = 0 AND ${side(l)} = 0 AND ${o}.line_no <> ${l}.line_no))`);
}
