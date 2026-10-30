// @bizcity-layer D modules/thue
/**
 * Thuyết minh báo cáo tài chính (mẫu B09-DN, Thông tư 99/2025/TT-BTC) — phần số liệu.
 *
 * Phần mềm lập sẵn:
 *   - Thông tin chung và chính sách kế toán phần mềm đang áp dụng (kỳ kế toán, đơn vị tiền tệ, chế độ kế toán,
 *     phương pháp tính giá xuất kho, khấu hao…), kế toán sửa lời văn khi cần.
 *   - Các bảng số liệu bổ sung cho từng khoản mục trên B01, B02: tiền, phải thu, hàng tồn kho, tài sản cố định,
 *     chi phí chờ phân bổ, phải trả người bán, thuế phải nộp, vay, vốn chủ sở hữu, doanh thu, giá vốn,
 *     doanh thu / chi phí tài chính, chi phí bán hàng, chi phí quản lý.
 * Phần thuyết minh bằng lời (sự kiện sau ngày kết thúc kỳ, bên liên quan, nợ tiềm tàng…) kế toán tự viết.
 */
import { sql } from 'kysely';
import { db, toNumber } from '../../../db/client.js';
import type { AuthContext } from '../../../core/auth.js';
import { assetService } from '../../../modules/assets/asset.service.js';

interface Scope { tenantId: string; from: string; to: string }

export interface NoteTable {
  key: string;
  title: string;
  /** Cột số: tên hiển thị → khoá trong rows. */
  columns: { key: string; label: string }[];
  rows: { label: string; code?: string; level?: number; values: Record<string, number> }[];
  note?: string;
}

const r0 = (n: number) => Math.round(n);

/** Số dư đầu, phát sinh Nợ / Có, số dư cuối theo tài khoản chi tiết của các đầu số. */
async function accountMovements(s: Scope, prefixes: string[]) {
  const likes = prefixes.map((p) => `${p}%`);
  const res = await sql<{ account_code: string; name: string | null; opening: string; debit: string; credit: string }>`
    SELECT g.account_code, MAX(ac.name) AS name,
           SUM(CASE WHEN g.posting_date < ${s.from}::date THEN g.debit - g.credit ELSE 0 END) AS opening,
           SUM(CASE WHEN g.posting_date >= ${s.from}::date THEN g.debit ELSE 0 END) AS debit,
           SUM(CASE WHEN g.posting_date >= ${s.from}::date THEN g.credit ELSE 0 END) AS credit
      FROM ledger_balances_daily g
      LEFT JOIN accounts ac ON ac.tenant_id = g.tenant_id AND ac.code = g.account_code
     WHERE g.tenant_id = ${s.tenantId} AND g.posting_date <= ${s.to}::date
       AND g.account_code LIKE ANY(${likes}::text[])
     GROUP BY g.account_code
     ORDER BY g.account_code`.execute(db);
  return res.rows.map((r) => ({ code: r.account_code, name: r.name ?? '', opening: toNumber(r.opening), debit: toNumber(r.debit), credit: toNumber(r.credit) }));
}

/** Bảng số dư đầu kỳ / cuối kỳ (tài sản: dư Nợ; nguồn vốn: dư Có). */
async function balanceTable(s: Scope, key: string, title: string, prefixes: string[], side: 'debit' | 'credit', note?: string): Promise<NoteTable> {
  const rows = await accountMovements(s, prefixes);
  const sign = side === 'debit' ? 1 : -1;
  const out = rows
    .map((r) => ({ label: r.name, code: r.code, values: { opening: r0(sign * r.opening), closing: r0(sign * (r.opening + r.debit - r.credit)) } }))
    .filter((r) => r.values.opening || r.values.closing);
  out.push({ label: 'Cộng', code: '', values: { opening: out.reduce((t, r) => t + r.values.opening, 0), closing: out.reduce((t, r) => t + r.values.closing, 0) } });
  return { key, title, columns: [{ key: 'opening', label: 'Đầu kỳ' }, { key: 'closing', label: 'Cuối kỳ' }], rows: out, note };
}

/** Bảng biến động: đầu kỳ, tăng, giảm, cuối kỳ. */
async function movementTable(s: Scope, key: string, title: string, prefixes: string[], side: 'debit' | 'credit', note?: string): Promise<NoteTable> {
  const rows = await accountMovements(s, prefixes);
  const out = rows
    .map((r) => {
      const opening = side === 'debit' ? r.opening : -r.opening;
      const inc = side === 'debit' ? r.debit : r.credit;
      const dec = side === 'debit' ? r.credit : r.debit;
      return { label: r.name, code: r.code, values: { opening: r0(opening), increase: r0(inc), decrease: r0(dec), closing: r0(opening + inc - dec) } };
    })
    .filter((r) => Object.values(r.values).some(Boolean));
  const total = (k: string) => out.reduce((t, r) => t + ((r.values as Record<string, number>)[k] ?? 0), 0);
  out.push({ label: 'Cộng', code: '', values: { opening: total('opening'), increase: total('increase'), decrease: total('decrease'), closing: total('closing') } });
  return { key, title, columns: [{ key: 'opening', label: 'Đầu kỳ' }, { key: 'increase', label: side === 'debit' ? 'Tăng' : 'Tăng (phải nộp / phát sinh)' }, { key: 'decrease', label: side === 'debit' ? 'Giảm' : 'Giảm (đã nộp / đã trả)' }, { key: 'closing', label: 'Cuối kỳ' }], rows: out, note };
}

/** Bảng phát sinh trong kỳ của tài khoản doanh thu (Có − Nợ) / chi phí (Nợ − Có), không tính bút toán kết chuyển. */
async function flowTable(s: Scope, key: string, title: string, prefixes: string[], side: 'debit' | 'credit', note?: string): Promise<NoteTable> {
  const likes = prefixes.map((p) => `${p}%`);
  const res = await sql<{ account_code: string; name: string | null; amount: string }>`
    SELECT l.account_code, MAX(ac.name) AS name, SUM(${side === 'credit' ? sql`l.credit - l.debit` : sql`l.debit - l.credit`}) AS amount
      FROM ledger_lines l
      JOIN ledger_entries e ON e.id = l.entry_id
      LEFT JOIN accounts ac ON ac.tenant_id = e.tenant_id AND ac.code = l.account_code
     WHERE e.tenant_id = ${s.tenantId} AND e.posting_date BETWEEN ${s.from}::date AND ${s.to}::date
       AND e.doc_type <> 'closing' AND l.account_code LIKE ANY(${likes}::text[])
     GROUP BY l.account_code ORDER BY l.account_code`.execute(db);
  const out = res.rows.map((r) => ({ label: r.name ?? '', code: r.account_code, values: { amount: r0(toNumber(r.amount)) } })).filter((r) => r.values.amount);
  out.push({ label: 'Cộng', code: '', values: { amount: out.reduce((t, r) => t + r.values.amount, 0) } });
  return { key, title, columns: [{ key: 'amount', label: 'Kỳ này' }], rows: out, note };
}

/** Công nợ theo đối tượng lớn nhất (dư cuối kỳ), phần còn lại gộp "Các đối tượng khác". */
async function partnerTable(s: Scope, key: string, title: string, prefix: string, side: 'debit' | 'credit', top = 10): Promise<NoteTable> {
  const res = await sql<{ code: string | null; name: string | null; opening: string; closing: string }>`
    SELECT p.code, p.name,
           SUM(CASE WHEN g.posting_date < ${s.from}::date THEN g.debit - g.credit ELSE 0 END) AS opening,
           SUM(g.debit - g.credit) AS closing
      FROM ledger_balances_daily g
      LEFT JOIN partners p ON p.id = g.partner_id
     WHERE g.tenant_id = ${s.tenantId} AND g.posting_date <= ${s.to}::date AND g.account_code LIKE ${prefix + '%'}
     GROUP BY p.code, p.name`.execute(db);
  const sign = side === 'debit' ? 1 : -1;
  const all = res.rows
    .map((r) => ({ label: r.name ?? '(không đối tượng)', code: r.code ?? '', values: { opening: r0(Math.max(sign * toNumber(r.opening), 0)), closing: r0(Math.max(sign * toNumber(r.closing), 0)) } }))
    .filter((r) => r.values.opening || r.values.closing)
    .sort((a, b) => b.values.closing - a.values.closing);
  const head = all.slice(0, top);
  const rest = all.slice(top);
  if (rest.length) head.push({ label: `Các đối tượng khác (${rest.length})`, code: '', values: { opening: rest.reduce((t, r) => t + r.values.opening, 0), closing: rest.reduce((t, r) => t + r.values.closing, 0) } });
  head.push({ label: 'Cộng', code: '', values: { opening: all.reduce((t, r) => t + r.values.opening, 0), closing: all.reduce((t, r) => t + r.values.closing, 0) } });
  return { key, title, columns: [{ key: 'opening', label: 'Đầu kỳ' }, { key: 'closing', label: 'Cuối kỳ' }], rows: head, note: 'Chỉ tính số dư cùng phía (phải thu: dư Nợ; phải trả: dư Có) của từng đối tượng.' };
}

/** Tăng, giảm tài sản cố định theo loại tài sản (từ thẻ tài sản). */
async function fixedAssetTable(auth: AuthContext, from: string, to: string): Promise<NoteTable> {
  const reg = await assetService.register(auth, { from, to, kind: 'fixed_asset' });
  const by = new Map<string, { costOpen: number; costInc: number; costDec: number; costClose: number; depOpen: number; depCharge: number; depDec: number; depClose: number; nbvOpen: number; nbvClose: number }>();
  for (const r of reg.rows) {
    const k = r.categoryName || 'Chưa phân loại';
    const v = by.get(k) ?? { costOpen: 0, costInc: 0, costDec: 0, costClose: 0, depOpen: 0, depCharge: 0, depDec: 0, depClose: 0, nbvOpen: 0, nbvClose: 0 };
    by.set(k, v);
    const existed = r.startDate < from;
    const costOpen = existed ? r.originalCost : 0;
    const costInc = existed ? 0 : r.originalCost;
    const costDec = r.decreased ? r.originalCost : 0;
    const depOpen = existed ? r.opening : 0;
    const depDec = r.decreased ? r.closing : 0;
    v.costOpen += costOpen; v.costInc += costInc; v.costDec += costDec; v.costClose += costOpen + costInc - costDec;
    v.depOpen += depOpen; v.depCharge += r.charge; v.depDec += depDec; v.depClose += depOpen + r.charge - depDec;
    v.nbvOpen += costOpen - depOpen; v.nbvClose += costOpen + costInc - costDec - (depOpen + r.charge - depDec);
    by.set(k, v);
  }
  const rows = [...by.entries()].map(([label, values]) => ({ label, values }));
  const keys = ['costOpen', 'costInc', 'costDec', 'costClose', 'depOpen', 'depCharge', 'depDec', 'depClose', 'nbvOpen', 'nbvClose'];
  rows.push({ label: 'Cộng', values: Object.fromEntries(keys.map((k) => [k, rows.reduce((t, r) => t + ((r.values as Record<string, number>)[k] ?? 0), 0)])) as typeof rows[number]['values'] });
  return {
    key: 'tscd',
    title: 'Tăng, giảm tài sản cố định',
    columns: [
      { key: 'costOpen', label: 'Nguyên giá đầu kỳ' }, { key: 'costInc', label: 'Nguyên giá tăng' }, { key: 'costDec', label: 'Nguyên giá giảm' }, { key: 'costClose', label: 'Nguyên giá cuối kỳ' },
      { key: 'depOpen', label: 'Hao mòn đầu kỳ' }, { key: 'depCharge', label: 'Khấu hao trong kỳ' }, { key: 'depDec', label: 'Hao mòn giảm' }, { key: 'depClose', label: 'Hao mòn cuối kỳ' },
      { key: 'nbvOpen', label: 'Giá trị còn lại đầu kỳ' }, { key: 'nbvClose', label: 'Giá trị còn lại cuối kỳ' },
    ],
    rows,
    note: 'Lấy từ thẻ tài sản cố định. Đối chiếu với số dư tài khoản 211, 213, 214 ở bảng cân đối phát sinh; lệch thì kiểm tra thẻ tài sản và phiếu ghi tăng / giảm.',
  };
}

export const notesService = {
  async build(auth: AuthContext, q: { from: string; to: string }) {
    const tenant = await db.selectFrom('tenants').select(['name', 'tax_code', 'address']).where('id', '=', auth.tenantId).executeTakeFirstOrThrow();
    const s: Scope = { tenantId: auth.tenantId, from: q.from, to: q.to };

    const general = [
      { title: 'I. Đặc điểm hoạt động của doanh nghiệp', items: [
        `Tên doanh nghiệp: ${tenant.name}${tenant.tax_code ? `; mã số thuế: ${tenant.tax_code}` : ''}${tenant.address ? `; địa chỉ: ${tenant.address}` : ''}.`,
        'Hình thức sở hữu vốn: (kế toán ghi).',
        'Lĩnh vực kinh doanh: thương mại — bán lẻ, bán buôn hàng hoá qua chuỗi cửa hàng.',
        'Chu kỳ sản xuất, kinh doanh thông thường: trong vòng 12 tháng.',
        'Cấu trúc doanh nghiệp: các chi nhánh / cửa hàng hạch toán phụ thuộc theo danh mục chi nhánh của phần mềm.',
      ] },
      { title: 'II. Kỳ kế toán, đơn vị tiền tệ sử dụng trong kế toán', items: [
        'Kỳ kế toán năm bắt đầu từ ngày 01/01 và kết thúc vào ngày 31/12.',
        'Đơn vị tiền tệ sử dụng trong kế toán: Đồng Việt Nam (VND).',
      ] },
      { title: 'III. Chuẩn mực và chế độ kế toán áp dụng', items: [
        'Chế độ kế toán doanh nghiệp ban hành kèm Thông tư 99/2025/TT-BTC ngày 27/10/2025 của Bộ Tài chính.',
        'Doanh nghiệp tuân thủ các chuẩn mực kế toán Việt Nam và chế độ kế toán hiện hành trong việc lập và trình bày báo cáo tài chính.',
        'Hình thức kế toán: Nhật ký chung, ghi sổ trên máy vi tính.',
      ] },
      { title: 'IV. Các chính sách kế toán áp dụng', items: [
        'Hàng tồn kho được ghi nhận theo giá gốc; hạch toán theo phương pháp kê khai thường xuyên.',
        'Giá trị hàng xuất kho tính theo phương pháp bình quân gia quyền cả tháng, riêng cho từng đơn vị hạch toán.',
        'Tài sản cố định ghi nhận theo nguyên giá; khấu hao theo phương pháp đường thẳng, trích theo số ngày sử dụng trong tháng (Thông tư 45/2013/TT-BTC).',
        'Công cụ dụng cụ, chi phí trả trước được phân bổ dần vào chi phí theo số tháng sử dụng; phần phân bổ trong 12 tháng tới trình bày là ngắn hạn.',
        'Doanh thu bán hàng ghi nhận khi giao hàng và xuất hoá đơn cho người mua.',
        'Thuế giá trị gia tăng tính theo phương pháp khấu trừ.',
        'Sai sót được sửa bằng phương pháp ghi số âm hoặc ghi bổ sung, không xoá sổ (Điều 27 Luật Kế toán).',
      ] },
    ];

    const tables: NoteTable[] = [
      await balanceTable(s, 'tien', '1. Tiền', ['111', '112', '113'], 'debit'),
      await partnerTable(s, 'phai-thu-kh', '2. Phải thu của khách hàng', '131', 'debit'),
      await balanceTable(s, 'phai-thu-khac', '3. Phải thu khác', ['138', '141', '244'], 'debit', 'Số dư Nợ thuần theo tài khoản; chi tiết theo đối tượng xem Sổ chi tiết công nợ.'),
      await balanceTable(s, 'hang-ton-kho', '4. Hàng tồn kho', ['151', '152', '153', '154', '155', '156', '157', '158'], 'debit'),
      await fixedAssetTable(auth, q.from, q.to),
      await movementTable(s, 'cho-phan-bo', '6. Chi phí chờ phân bổ', ['242'], 'debit', 'Phần ngắn hạn / dài hạn trên Báo cáo tình hình tài chính tách theo 2421 / 2422 và lịch phân bổ của thẻ tài sản.'),
      await partnerTable(s, 'phai-tra-nb', '7. Phải trả người bán', '331', 'credit'),
      await movementTable(s, 'thue', '8. Thuế và các khoản phải nộp Nhà nước', ['333'], 'credit'),
      await movementTable(s, 'vay', '9. Vay và nợ thuê tài chính', ['341'], 'credit'),
      await movementTable(s, 'von', '10. Vốn chủ sở hữu', ['411', '412', '413', '414', '418', '419', '421'], 'credit'),
      await flowTable(s, 'doanh-thu', '11. Doanh thu bán hàng và cung cấp dịch vụ', ['511'], 'credit'),
      await flowTable(s, 'giam-tru', '12. Các khoản giảm trừ doanh thu', ['521'], 'debit'),
      await flowTable(s, 'gia-von', '13. Giá vốn hàng bán', ['632'], 'debit'),
      await flowTable(s, 'dt-tai-chinh', '14. Doanh thu hoạt động tài chính', ['515'], 'credit'),
      await flowTable(s, 'cp-tai-chinh', '15. Chi phí tài chính', ['635'], 'debit'),
      await flowTable(s, 'cp-ban-hang', '16. Chi phí bán hàng', ['641'], 'debit'),
      await flowTable(s, 'cp-quan-ly', '17. Chi phí quản lý doanh nghiệp', ['642'], 'debit'),
      await flowTable(s, 'thu-nhap-khac', '18. Thu nhập khác, chi phí khác', ['711', '811'], 'credit', 'Số dương là thu nhập (711), số âm là chi phí (811).'),
    ];
    return { from: q.from, to: q.to, company: { name: tenant.name, taxCode: tenant.tax_code, address: tenant.address }, general, tables };
  },
};
