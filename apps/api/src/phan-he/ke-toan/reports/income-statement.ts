// @bizcity-layer D modules/ke-toan
// [2026-10-31 08:24 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — ledger.query (PHASES 3.7): đọc sổ qua khung nhìn bizcity_read.* thay bảng ledger_* (SC-KERNEL-7)
/**
 * Báo cáo kết quả hoạt động kinh doanh (mẫu B02-DN, Thông tư 99/2025/TT-BTC).
 *
 * Chỉ tiêu 21 (lãi/lỗ bán, thanh lý bất động sản đầu tư) mới có ở Thông tư 99: phần mềm chưa có nghiệp vụ
 * bất động sản đầu tư nên luôn 0; doanh thu, giá vốn của hoạt động này (nếu có) đang nằm trong 01, 11.
 *
 * Cách tính:
 *  - Đọc phát sinh sổ cái trong khoảng ngày, KHÔNG tính bút toán kết chuyển (nếu tính thì doanh thu,
 *    chi phí bị triệt tiêu về 0).
 *  - Dòng lấy số bên Có (doanh thu, thu nhập): Có − Nợ của các tài khoản bắt đầu bằng đầu số khai báo.
 *    Dòng lấy số bên Nợ (giá vốn, chi phí, giảm trừ): Nợ − Có.
 *  - Dòng công thức: cộng trừ các dòng khác theo mã số.
 *  - Kỳ trước = cùng khoảng ngày lùi 12 tháng.
 *
 * Muốn đổi chỉ tiêu: sửa bảng INCOME_STATEMENT_LINES dưới đây (thứ tự là thứ tự in).
 */
import { fromCents, toCents } from '@ketoan/contracts';
import { sql } from 'kysely';
import { db, toNumber, type Db } from '../../../db/client.js';

interface LineDef {
  code: string;
  name: string;
  /** Mục thuyết minh trên báo cáo tài chính. */
  note?: string;
  bold?: boolean;
  /** Dòng lấy số: đầu số tài khoản và bên lấy. */
  accounts?: string[];
  side?: 'debit' | 'credit';
  /** Dòng công thức: danh sách [mã số, dấu]. */
  formula?: [string, 1 | -1][];
}

export const INCOME_STATEMENT_LINES: LineDef[] = [
  { code: '01', name: '1. Doanh thu bán hàng và cung cấp dịch vụ', note: 'VI.25', accounts: ['511'], side: 'credit' },
  { code: '02', name: '2. Các khoản giảm trừ doanh thu', accounts: ['521'], side: 'debit' },
  { code: '10', name: '3. Doanh thu thuần về bán hàng và cung cấp dịch vụ (10 = 01 − 02)', bold: true, formula: [['01', 1], ['02', -1]] },
  { code: '11', name: '4. Giá vốn hàng bán', note: 'VI.27', accounts: ['632'], side: 'debit' },
  { code: '20', name: '5. Lợi nhuận gộp về bán hàng và cung cấp dịch vụ (20 = 10 − 11)', bold: true, formula: [['10', 1], ['11', -1]] },
  { code: '21', name: '6. Lãi/lỗ của hoạt động bán, thanh lý bất động sản đầu tư', note: 'VI.26', accounts: [], side: 'credit' },
  { code: '22', name: '7. Doanh thu hoạt động tài chính', note: 'VI.26', accounts: ['515'], side: 'credit' },
  { code: '23', name: '8. Chi phí tài chính', note: 'VI.28', accounts: ['635'], side: 'debit' },
  { code: '24', name: '   - Trong đó: Chi phí đi vay', accounts: ['6351'], side: 'debit' },
  { code: '25', name: '9. Chi phí bán hàng', accounts: ['641'], side: 'debit' },
  { code: '26', name: '10. Chi phí quản lý doanh nghiệp', accounts: ['642'], side: 'debit' },
  { code: '30', name: '11. Lợi nhuận thuần từ hoạt động kinh doanh (30 = 20 + 21 + 22 − (23 + 25 + 26))', bold: true, formula: [['20', 1], ['21', 1], ['22', 1], ['23', -1], ['25', -1], ['26', -1]] },
  { code: '31', name: '12. Thu nhập khác', accounts: ['711'], side: 'credit' },
  { code: '32', name: '13. Chi phí khác', accounts: ['811'], side: 'debit' },
  { code: '40', name: '14. Lợi nhuận khác (40 = 31 − 32)', bold: true, formula: [['31', 1], ['32', -1]] },
  { code: '50', name: '15. Tổng lợi nhuận kế toán trước thuế (50 = 30 + 40)', bold: true, formula: [['30', 1], ['40', 1]] },
  { code: '51', name: '16. Chi phí thuế thu nhập doanh nghiệp hiện hành', note: 'VI.30', accounts: ['8211'], side: 'debit' },
  { code: '52', name: '17. Chi phí thuế thu nhập doanh nghiệp hoãn lại', note: 'VI.30', accounts: ['8212'], side: 'debit' },
  { code: '60', name: '18. Lợi nhuận sau thuế thu nhập doanh nghiệp (60 = 50 − (51 + 52))', bold: true, formula: [['50', 1], ['51', -1], ['52', -1]] },
];

/** Phát sinh theo tài khoản của các tài khoản doanh thu, chi phí (đầu 5–8), bỏ bút toán kết chuyển. */
async function turnover(trx: Db, a: { tenantId: string; from: string; to: string; branchIds: string[] | null }) {
  const branchFilter = a.branchIds ? sql`AND l.branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
  const res = await sql<{ account_code: string; debit: string; credit: string }>`
    SELECT l.account_code, SUM(l.debit) AS debit, SUM(l.credit) AS credit
      FROM bizcity_read.ledger_lines l
      JOIN bizcity_read.ledger_entries e ON e.id = l.entry_id
     WHERE l.tenant_id = ${a.tenantId}
       AND l.posting_date BETWEEN ${a.from}::date AND ${a.to}::date
       AND l.account_code ~ '^[5678]'
       AND e.doc_type <> 'closing'
       ${branchFilter}
     GROUP BY l.account_code`.execute(trx);
  return res.rows.map((r) => ({ account: r.account_code, d: toCents(toNumber(r.debit)), c: toCents(toNumber(r.credit)) }));
}

/** Tính giá trị (xu) của mọi dòng cho một khoảng ngày. */
function evaluate(rows: { account: string; d: number; c: number }[]): Map<string, number> {
  const values = new Map<string, number>();
  for (const def of INCOME_STATEMENT_LINES) {
    if (def.accounts) {
      const hit = rows.filter((r) => def.accounts!.some((p) => r.account.startsWith(p)));
      values.set(def.code, hit.reduce((s, r) => s + (def.side === 'credit' ? r.c - r.d : r.d - r.c), 0));
    } else {
      // Bảng khai theo thứ tự in nên mọi dòng trong công thức đã được tính trước.
      values.set(def.code, def.formula!.reduce((s, [code, sign]) => s + sign * (values.get(code) ?? 0), 0));
    }
  }
  return values;
}

/** Lùi một ngày YYYY-MM-DD 12 tháng (29/02 lùi về 28/02). */
export function yearBefore(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
  return `${y - 1}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

export async function incomeStatement(a: { tenantId: string; from: string; to: string; branchIds: string[] | null }) {
  const prev = { from: yearBefore(a.from), to: yearBefore(a.to) };
  const [cur, old] = await Promise.all([turnover(db, a), turnover(db, { ...a, ...prev })]);
  const curValues = evaluate(cur);
  const oldValues = evaluate(old);
  return {
    period: { from: a.from, to: a.to },
    previous: prev,
    rows: INCOME_STATEMENT_LINES.map((def) => ({
      code: def.code,
      name: def.name,
      note: def.note ?? '',
      bold: Boolean(def.bold),
      accounts: def.accounts?.join(', ') ?? '',
      current: fromCents(curValues.get(def.code) ?? 0),
      previous: fromCents(oldValues.get(def.code) ?? 0),
    })),
  };
}
