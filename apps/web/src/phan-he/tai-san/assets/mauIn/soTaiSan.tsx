/**
 * MẪU IN sổ / báo cáo tài sản của màn AssetRegisterPage (A4 ngang; HTsoft in S21, S22 khổ A3):
 *   s21   Sổ tài sản cố định S21-DN (ACC29 rdlcBaoCaoSoTaiSan.rdlc, ACC42 rdlcACC29.rdlc): chỉ tài sản cố định, nhóm theo loại;
 *         Ghi tăng (Số hiệu, Tên, Tháng năm đưa vào SD, Nguyên giá) | Khấu hao (Tỷ lệ %/năm, Mức KH trong kỳ, Luỹ kế) | Ghi giảm (Ngày, Lý do).
 *         Chưa có số / ngày chứng từ ghi tăng, nước sản xuất trong số liệu sổ → bỏ các cột đó.
 *   s22   Sổ theo dõi TSCĐ và CCDC tại nơi sử dụng S22-DN (ACC85 rdlcSoTheoDoiTSCDVaCCDC.rdlc): nhóm theo chi nhánh sử dụng;
 *         Ghi tăng (Mã, Tên, ĐVT, SL, Đơn giá, Số tiền) | Ghi giảm (Ngày, Lý do, SL, Số tiền) | Ghi chú.
 *   pbcp  Báo cáo phân bổ chi phí (ACC27 rdlcBCPhanBoChiPhi.rdlc): cộng theo tài khoản chi phí.
 *   bang  Bảng tính khấu hao / phân bổ chi tiết từng tài sản (các cột của màn), nhóm theo loại tài sản, cộng từng nhóm.
 */
import { date } from '@/lib/format';
import { BOOK_SIGNS, LedgerForm, m, mb, qty, screenTemplate, type LedgerCol, type PrintCtx, type PrintTemplate, type Row, type Sign } from '@/components/print';
import type { AssetKind } from '../AssetPages';

export interface RegisterLine {
  code: string; name: string; kind: AssetKind; kindLabel: string; categoryName: string | null; branchCode: string; unit: string; quantity: number; startDate: string; usefulLifeMonths: number;
  expenseAccount: string; status: string; disposedDate: string | null; increased: boolean; decreased: boolean;
  originalCost: number; opening: number; charge: number; closing: number; remaining: number;
}
/** Sổ đã xem trên màn: điều kiện lọc + các dòng; accountNames chỉ nạp cho báo cáo phân bổ chi phí. */
export interface RegisterSheet { code: string; title: string; from: string; to: string; branchCodes: string; kind: string; rows: RegisterLine[]; accountNames?: Record<string, string> }

const oneBranch = (codes: string) => (codes && !codes.includes(',') ? codes : undefined);
const branchInfo = (codes: string, ctx: PrintCtx): Row[] => (codes.includes(',') ? [['Chi nhánh', codes.split(',').map((c) => ctx.branchName(c) || c).join(', ')]] : []);
const monthYear = (d: string) => (d ? `${d.slice(5, 7)}/${d.slice(0, 4)}` : '');
const rate = (months: number) => (months ? (1200 / months).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : '');
const KIND_TEXT: Record<string, string> = { fixed_asset: 'Tài sản cố định', tool: 'Công cụ dụng cụ', prepaid: 'Chi phí trả trước' };
const REPORT_SIGNS: Sign[] = [{ title: 'Người lập biểu' }, ...BOOK_SIGNS.slice(1)];
const byKey = <R,>(rs: R[], k: (r: R) => string) => [...rs].sort((a, b) => k(a).localeCompare(k(b)));

/** S21-DN: chỉ tài sản cố định. */
const s21 = (source: string): PrintTemplate<RegisterSheet> => ({
  id: 's21', name: 'Sổ tài sản cố định S21-DN', paper: 'A4L', source,
  render: (s, ctx) => (
    <LedgerForm ctx={ctx} d={{
      title: 'SỔ TÀI SẢN CỐ ĐỊNH', form: 'Mẫu số S21-DN', branchCode: oneBranch(s.branchCodes), from: s.from, to: s.to, info: branchInfo(s.branchCodes, ctx),
      rows: byKey(s.rows.filter((r) => r.kind === 'fixed_asset'), (r) => r.categoryName ?? ''), bookNote: true, signs: BOOK_SIGNS, total: 'Tổng cộng',
      groupBy: { key: (r) => r.categoryName ?? '', label: (k) => <b>Loại tài sản: {k || '(chưa phân loại)'}</b>, subtotal: 'Cộng loại' },
      cols: [
        { key: 'stt', h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
        { key: 'so', h: 'Số hiệu TSCĐ', group: 'Ghi tăng TSCĐ', w: 80, v: (r) => r.code },
        { key: 'ten', h: 'Tên, đặc điểm, ký hiệu TSCĐ', group: 'Ghi tăng TSCĐ', v: (r) => r.name },
        { key: 'th', h: 'Tháng năm đưa vào sử dụng', group: 'Ghi tăng TSCĐ', w: 62, center: true, v: (r) => monthYear(r.startDate) },
        { key: 'ng', h: 'Nguyên giá TSCĐ', group: 'Ghi tăng TSCĐ', w: 100, num: true, v: (r) => m(r.originalCost), sum: (r) => r.originalCost },
        { key: 'tl', h: 'Tỷ lệ (%) khấu hao / năm', group: 'Khấu hao TSCĐ', w: 58, center: true, v: (r) => rate(r.usefulLifeMonths) },
        { key: 'kh', h: 'Mức khấu hao trong kỳ', group: 'Khấu hao TSCĐ', w: 96, num: true, v: (r) => mb(r.charge), sum: (r) => r.charge },
        { key: 'lk', h: 'Khấu hao đã tính đến khi ghi giảm TSCĐ', w: 100, num: true, v: (r) => mb(r.closing), sum: (r) => r.closing },
        { key: 'ngay', h: 'Ngày, tháng, năm', group: 'Ghi giảm TSCĐ', w: 66, center: true, v: (r) => (r.disposedDate ? date(r.disposedDate) : '') },
        { key: 'ld', h: 'Lý do giảm TSCĐ', group: 'Ghi giảm TSCĐ', w: 90, v: (r) => (r.disposedDate ? 'Ghi giảm' : '') },
      ],
    }} />
  ),
});

/** S22-DN: theo nơi sử dụng (chi nhánh). */
const s22: PrintTemplate<RegisterSheet> = {
  id: 's22', name: 'Sổ theo dõi TSCĐ và CCDC tại nơi sử dụng S22-DN', paper: 'A4L', source: 'rdlcSoTheoDoiTSCDVaCCDC.rdlc',
  render: (s, ctx) => {
    const gone = (r: RegisterLine) => Boolean(r.disposedDate);
    return (
      <LedgerForm ctx={ctx} d={{
        title: 'SỔ THEO DÕI TSCĐ VÀ CÔNG CỤ, DỤNG CỤ TẠI NƠI SỬ DỤNG', form: 'Mẫu số S22-DN', branchCode: oneBranch(s.branchCodes), from: s.from, to: s.to, info: branchInfo(s.branchCodes, ctx),
        rows: byKey(s.rows, (r) => r.branchCode), bookNote: true, total: 'Tổng cộng',
        signs: [{ title: 'Người lập biểu' }, { title: 'Kế toán trưởng' }, { title: 'Người đại diện theo pháp luật', note: '(Ký, họ tên, đóng dấu)' }],
        groupBy: { key: (r) => r.branchCode, label: (k) => <b>Tên đơn vị (phòng, ban hoặc người sử dụng): {ctx.branchName(k) || k}</b>, subtotal: 'Cộng' },
        cols: [
          { key: 'ma', h: 'Mã', group: 'Ghi tăng TSCĐ và công cụ, dụng cụ', w: 76, v: (r) => r.code },
          { key: 'ten', h: 'Tên, nhãn hiệu TSCĐ và công cụ, dụng cụ', group: 'Ghi tăng TSCĐ và công cụ, dụng cụ', v: (r) => r.name },
          { key: 'dvt', h: 'ĐVT', group: 'Ghi tăng TSCĐ và công cụ, dụng cụ', w: 40, center: true, v: (r) => r.unit },
          { key: 'sl', h: 'Số lượng', group: 'Ghi tăng TSCĐ và công cụ, dụng cụ', w: 50, num: true, v: (r) => qty(r.quantity) },
          { key: 'dg', h: 'Đơn giá', group: 'Ghi tăng TSCĐ và công cụ, dụng cụ', w: 90, num: true, v: (r) => mb(r.quantity ? Math.round(r.originalCost / r.quantity) : r.originalCost) },
          { key: 'st', h: 'Số tiền', group: 'Ghi tăng TSCĐ và công cụ, dụng cụ', w: 96, num: true, v: (r) => m(r.originalCost), sum: (r) => r.originalCost },
          { key: 'gn', h: 'Ngày, tháng', group: 'Ghi giảm TSCĐ và công cụ, dụng cụ', w: 62, center: true, v: (r) => (r.disposedDate ? date(r.disposedDate) : '') },
          { key: 'gl', h: 'Lý do', group: 'Ghi giảm TSCĐ và công cụ, dụng cụ', w: 70, v: (r) => (gone(r) ? 'Ghi giảm' : '') },
          { key: 'gs', h: 'Số lượng', group: 'Ghi giảm TSCĐ và công cụ, dụng cụ', w: 50, num: true, v: (r) => (gone(r) ? qty(r.quantity) : '') },
          { key: 'gt', h: 'Số tiền', group: 'Ghi giảm TSCĐ và công cụ, dụng cụ', w: 96, num: true, v: (r) => (gone(r) ? mb(r.originalCost) : ''), sum: (r) => (gone(r) ? r.originalCost : 0) },
          { key: 'gc', h: 'Ghi chú', w: 80, v: (r) => r.kindLabel },
        ],
      }} />
    );
  },
};

/** Báo cáo phân bổ chi phí: cộng theo tài khoản chi phí. Tỷ lệ = phần phân bổ kỳ này của tài khoản / tổng phân bổ kỳ này. */
interface AccSum { account: string; cost: number; opening: number; charge: number; remaining: number }
const pbcp: PrintTemplate<RegisterSheet> = {
  id: 'pbcp', name: 'Báo cáo phân bổ chi phí (theo tài khoản)', paper: 'A4L', source: 'rdlcBCPhanBoChiPhi.rdlc',
  render: (s, ctx) => {
    const map = new Map<string, AccSum>();
    for (const r of s.rows) {
      const x = map.get(r.expenseAccount) ?? { account: r.expenseAccount, cost: 0, opening: 0, charge: 0, remaining: 0 };
      x.cost += r.originalCost; x.opening += r.opening; x.charge += r.charge; x.remaining += r.remaining;
      map.set(r.expenseAccount, x);
    }
    const rows = byKey([...map.values()], (x) => x.account);
    const all = rows.reduce((a, x) => a + x.charge, 0);
    const money = (key: keyof Omit<AccSum, 'account'>, h: string): LedgerCol<AccSum> => ({ key, h, w: 110, num: true, v: (x) => mb(x[key]), sum: (x) => x[key] });
    return (
      <LedgerForm ctx={ctx} d={{
        title: 'BÁO CÁO PHÂN BỔ CHI PHÍ', branchCode: oneBranch(s.branchCodes), from: s.from, to: s.to,
        info: [...(s.kind ? [['Nhóm', KIND_TEXT[s.kind] ?? s.kind] as Row] : []), ...branchInfo(s.branchCodes, ctx)],
        rows, bookNote: true, signs: REPORT_SIGNS, total: 'Tổng cộng',
        cols: [
          { key: 'stt', h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
          { key: 'tk', h: 'Tài khoản', w: 70, center: true, v: (x) => x.account },
          { key: 'ten', h: 'Tên tài khoản', v: (x) => s.accountNames?.[x.account] ?? '' },
          money('cost', 'Tổng chi phí'),
          money('opening', 'Đã phân bổ đầu kỳ'),
          money('charge', 'Số phân bổ lần này'),
          { key: 'tl', h: 'Tỷ lệ (%)', w: 60, center: true, v: (x) => (all ? ((x.charge / all) * 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : '') },
          money('remaining', 'Còn phải phân bổ'),
        ],
      }} />
    );
  },
};

/** Bảng chi tiết từng tài sản như màn, nhóm theo loại (TSCĐ / CCDC / CP trả trước). */
const bang = (name: string, title: string, source?: string): PrintTemplate<RegisterSheet> => ({
  id: 'bang', name, paper: 'A4L', source,
  render: (s, ctx) => {
    const kinds = new Set(s.rows.map((r) => r.kind));
    return (
      <LedgerForm ctx={ctx} d={{
        title, branchCode: oneBranch(s.branchCodes), from: s.from, to: s.to,
        info: [...(s.kind ? [['Nhóm', KIND_TEXT[s.kind] ?? s.kind] as Row] : []), ...branchInfo(s.branchCodes, ctx)],
        rows: kinds.size > 1 ? byKey(s.rows, (r) => r.kind) : s.rows, signs: REPORT_SIGNS, total: 'Tổng cộng',
        groupBy: kinds.size > 1 ? { key: (r) => r.kind, label: (k) => <b>{KIND_TEXT[k] ?? k}</b>, subtotal: 'Cộng nhóm' } : undefined,
        cols: [
          { key: 'stt', h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
          { key: 'ma', h: 'Mã', w: 76, v: (r) => r.code },
          { key: 'ten', h: 'Tên tài sản', v: (r) => r.name },
          { key: 'cn', h: 'Chi nhánh', w: 54, center: true, v: (r) => r.branchCode },
          { key: 'bd', h: 'Bắt đầu trích', w: 62, center: true, v: (r) => date(r.startDate) },
          { key: 'th', h: 'Số tháng', w: 40, center: true, v: (r) => r.usefulLifeMonths || '' },
          { key: 'ng', h: 'Nguyên giá', w: 96, num: true, v: (r) => m(r.originalCost), sum: (r) => r.originalCost },
          { key: 'dk', h: 'Đầu kỳ', group: 'Luỹ kế khấu hao, phân bổ', w: 92, num: true, v: (r) => mb(r.opening), sum: (r) => r.opening },
          { key: 'tk', h: 'Trích trong kỳ', group: 'Luỹ kế khấu hao, phân bổ', w: 92, num: true, v: (r) => <b>{mb(r.charge)}</b>, sum: (r) => r.charge },
          { key: 'ck', h: 'Cuối kỳ', group: 'Luỹ kế khấu hao, phân bổ', w: 92, num: true, v: (r) => mb(r.closing), sum: (r) => r.closing },
          { key: 'cl', h: 'Giá trị còn lại', w: 96, num: true, v: (r) => m(r.remaining), sum: (r) => r.remaining },
          { key: 'cp', h: 'TK chi phí', w: 54, center: true, v: (r) => r.expenseAccount },
        ],
      }} />
    );
  },
});

/** Mẫu theo màn (ACC29 / ACC42 / ACC85 / ACC27); mẫu chính của màn đứng đầu. */
export function registerTemplates(code: string): PrintTemplate<RegisterSheet>[] {
  const own: PrintTemplate<RegisterSheet>[] =
    code === 'ACC29' ? [s21('rdlcBaoCaoSoTaiSan.rdlc'), bang('Bảng tính khấu hao tài sản', 'BẢNG TÍNH KHẤU HAO TÀI SẢN CỐ ĐỊNH')]
    : code === 'ACC42' ? [bang('Báo cáo tài sản', 'BÁO CÁO TÀI SẢN'), s21('rdlcACC29.rdlc')]
    : code === 'ACC85' ? [s22, bang('Bảng tính khấu hao, phân bổ', 'BẢNG TÍNH KHẤU HAO, PHÂN BỔ TSCĐ VÀ CCDC')]
    : code === 'ACC27' ? [pbcp, bang('Bảng phân bổ chi phí chi tiết', 'BẢNG PHÂN BỔ CHI PHÍ')]
    : [bang('Bảng tính khấu hao, phân bổ', 'BẢNG TÍNH KHẤU HAO, PHÂN BỔ')];
  return [...own, screenTemplate<RegisterSheet>()];
}
