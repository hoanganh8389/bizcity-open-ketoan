/**
 * [2026-11-13 Nguyễn Văn Thủy] Canh cửa bộ định danh (đóng góp)
 * Lớp nào cũng mang cùng bộ định danh bất biến: chi nhánh cn_ (branch_uid), phân kho kho_ (warehouse_uid), đối tượng dt_ (partner_uid)
 * — như mặt hàng có item_id (test 0070). Bảng có cột chi nhánh / kho / đối tượng mà thiếu định danh tương ứng thì đổi mã, sáp nhập,
 * gộp cha – con về sau tra lệch, và báo cáo đọc bảng đó không lọc / gộp được theo chiều ấy.
 *
 * Kiểu "chỉ được giảm": NO_CU là các bảng cũ còn thiếu (xử lý dần). Bảng MỚI thiếu → đỏ. Bảng cũ đã bổ sung đủ → đỏ, nhắc gạch khỏi
 * NO_CU (để danh sách chỉ ngắn đi).
 */
import { describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';

/** Cột chỉ chi nhánh / kho / đối tượng → cột định danh phải có kèm. */
const LUAT: [cot: string, dinhDanh: string, ten: string][] = [
  ['branch_id', 'branch_uid', 'cn'],
  ['warehouse_code', 'warehouse_uid', 'kho'],
  ['partner_id', 'partner_uid', 'dt'],
];

/** Bảng cũ còn thiếu định danh (chỉ được gạch bớt, không thêm). */
// 0137 đã phủ kín cả 19 bảng cũ — danh sách nợ rỗng; bảng mới thiếu định danh là đỏ.
const NO_CU: Record<string, string[]> = {};

describe('Canh cửa bộ định danh cn_ / kho_ / dt_', () => {
  it('bảng có cột chi nhánh / kho / đối tượng phải có định danh tương ứng (trừ nợ cũ đã ghi, danh sách chỉ ngắn đi)', async () => {
    const r = await sql<{ table_name: string; cols: string[] }>`
      SELECT c.table_name, array_agg(c.column_name::text) AS cols
        FROM information_schema.columns c JOIN information_schema.tables t USING (table_schema, table_name)
       WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
       GROUP BY c.table_name`.execute(db);
    const thieu: Record<string, string[]> = {};
    for (const t of r.rows) {
      const miss = LUAT.filter(([cot, dd]) => t.cols.includes(cot) && !t.cols.includes(dd)).map(([, , ten]) => ten);
      if (miss.length) thieu[t.table_name] = miss;
    }
    const moi = Object.entries(thieu).filter(([t, m]) => m.some((x) => !(NO_CU[t] ?? []).includes(x)));
    expect(moi, 'Bảng mới thiếu định danh — thêm branch_uid / warehouse_uid / partner_uid (trigger điền) như ledger_lines').toEqual([]);
    const daXong = Object.entries(NO_CU).filter(([t, m]) => m.some((x) => !(thieu[t] ?? []).includes(x)));
    expect(daXong, 'Bảng đã bổ sung định danh — gạch khỏi NO_CU').toEqual([]);
  });

  it('bút toán gộp theo tài khoản mang đủ cn_ / kho_ / dt_ / MST như dòng sổ', async () => {
    const r = await sql<{ name: string }>`SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ledger_entry_accounts'`.execute(db);
    const cols = r.rows.map((x) => x.name);
    for (const c of ['item_id', 'branch_uid', 'warehouse_uid', 'partner_uid', 'department_uid', 'tax_id']) expect(cols, c).toContain(c);
  });
});
