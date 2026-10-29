/**
 * MẪU IN báo cáo hàng hoá, lãi lỗ theo cửa hàng (GoodsReportPages):
 *   HH01  Bảng kê chuyển kho theo mặt hàng (rptTKPhieuchuyenkhoDetailGrpByMathang.rpt) / theo phiếu
 *   BH04  Báo cáo lãi gộp (theo cách gom đang xem)
 *   KQ01  Báo cáo kết quả kinh doanh theo cửa hàng (bộ phận) / chi nhánh
 */
import { date } from '@/lib/format';
import { BOOK_SIGNS, LedgerForm, m, mb, qty, screenTemplate, type LedgerCol, type PrintTemplate, type Row, type Sign } from '@/components/print';

const MAKER_SIGNS: Sign[] = [{ title: 'Người lập biểu' }, ...BOOK_SIGNS.slice(1)];
const oneBranch = (codes: string) => (codes && !codes.includes(',') ? codes : undefined);
const branchInfo = (codes: string, name: (c: string) => string): Row[] => (codes ? [['Chi nhánh', codes.split(',').map((c) => `${c} — ${name(c)}`).join('; ')]] : []);
const pct = (v: number | null) => (v === null ? '' : `${v}%`);

/* ------------------------------------------------------------------ HH01 */
export interface TransferLine { docNo: string; outDate: string | null; inDate: string | null; fromBranch: string; toBranch: string; sku: string; name: string; unit: string; outQty: number; outValue: number; inQty: number; pendingQty: number; status: string }
export interface TransferSheet { from: string; to: string; branchCodes: string; status: string; rows: TransferLine[] }
const STATUS: Record<string, string> = { received: 'Đã nhận', partial: 'Nhận một phần', pending: 'Trên đường' };
const STATUS_FILTER: Record<string, string> = { pending: 'Chưa nhận đủ', received: 'Đã nhận đủ' };

const transferCols = (bySku: boolean): LedgerCol<TransferLine>[] => [
  { key: 'stt', h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
  { key: 'nx', h: 'Ngày xuất', w: 62, center: true, v: (r) => date(r.outDate) },
  ...(bySku
    ? [{ key: 'so', h: 'Số phiếu', w: 100, v: (r: TransferLine) => r.docNo }]
    : [{ key: 'sku', h: 'Mã hàng', w: 90, v: (r: TransferLine) => r.sku }, { key: 'ten', h: 'Tên hàng', v: (r: TransferLine) => r.name }, { key: 'dvt', h: 'ĐVT', w: 40, center: true, v: (r: TransferLine) => r.unit }]),
  { key: 'tu', h: 'Từ chi nhánh', w: 64, center: true, v: (r) => r.fromBranch },
  { key: 'den', h: 'Đến chi nhánh', w: 64, center: true, v: (r) => r.toBranch },
  { key: 'xq', h: 'Số lượng', group: 'Xuất', w: 58, num: true, v: (r) => qty(r.outQty), sum: (r) => r.outQty },
  { key: 'xv', h: 'Giá trị', group: 'Xuất', w: 92, num: true, v: (r) => mb(r.outValue), sum: (r) => r.outValue },
  { key: 'nq', h: 'Đã nhận', group: 'Số lượng', w: 58, num: true, v: (r) => qty(r.inQty), sum: (r) => r.inQty },
  { key: 'pq', h: 'Trên đường', group: 'Số lượng', w: 58, num: true, v: (r) => qty(r.pendingQty), sum: (r) => r.pendingQty },
  { key: 'nn', h: 'Ngày nhận', w: 62, center: true, v: (r) => date(r.inDate) },
  { key: 'tt', h: 'Trạng thái', w: 70, center: true, v: (r) => STATUS[r.status] ?? r.status },
];
const transferBook = (bySku: boolean): PrintTemplate<TransferSheet> => ({
  id: bySku ? 'mh' : 'phieu', name: bySku ? 'Bảng kê chuyển kho theo mặt hàng' : 'Bảng kê chuyển kho theo phiếu', paper: 'A4L', source: bySku ? 'rptTKPhieuchuyenkhoDetailGrpByMathang.rpt' : undefined,
  render: (s, ctx) => (
    <LedgerForm ctx={ctx} d={{
      title: bySku ? 'BẢNG KÊ CHUYỂN KHO THEO MẶT HÀNG' : 'BẢNG KÊ CHUYỂN KHO', branchCode: oneBranch(s.branchCodes), from: s.from, to: s.to,
      info: [...branchInfo(s.branchCodes, ctx.branchName), ...(STATUS_FILTER[s.status] ? [['Trạng thái', STATUS_FILTER[s.status]] as Row] : [])],
      signs: [{ title: 'Người lập biểu' }, { title: 'Thủ kho' }, { title: 'Kế toán trưởng' }], total: 'Tổng cộng', rows: s.rows,
      groupBy: bySku
        ? { key: (r) => r.sku, label: (k, rs) => <>Mặt hàng: <b>{k}</b> — {rs[0]?.name}{rs[0]?.unit ? ` (${rs[0].unit})` : ''}</>, subtotal: 'Cộng mặt hàng' }
        : { key: (r) => r.docNo, label: (k, rs) => <>Phiếu <b>{k}</b> ngày {date(rs[0]?.outDate)}: {rs[0]?.fromBranch} → {rs[0]?.toBranch}</>, subtotal: 'Cộng phiếu' },
      cols: transferCols(bySku),
    }} />
  ),
});
export const TRANSFER_TEMPLATES: PrintTemplate<TransferSheet>[] = [transferBook(true), transferBook(false), screenTemplate<TransferSheet>()];

/* ------------------------------------------------------------------ BH04 */
interface ProfitFigures { qty: number; revenue: number; cost: number; gross: number; margin: number | null }
export interface ProfitLine extends ProfitFigures { key: string; label: string; extra: string }
export interface ProfitSheet {
  from: string; to: string; branchCodes: string; groupBy: string; tab: string; keyHead: string; labelHead?: string; extraHead?: string;
  rows: ProfitLine[]; totals: ProfitFigures;
}
export const PROFIT_TEMPLATES: PrintTemplate<ProfitSheet>[] = [
  {
    id: 'laigop', name: 'Báo cáo lãi gộp', paper: 'A4L',
    render: (s, ctx) => (
      <LedgerForm ctx={ctx} d={{
        title: `BÁO CÁO LÃI GỘP ${s.tab.toUpperCase()}`, branchCode: oneBranch(s.branchCodes), from: s.from, to: s.to, info: branchInfo(s.branchCodes, ctx.branchName),
        signs: MAKER_SIGNS, rows: s.rows, total: false,
        after: [{ label: 'Tổng cộng', cells: { sl: qty(s.totals.qty), dt: m(s.totals.revenue), gv: m(s.totals.cost), lg: m(s.totals.gross), tl: pct(s.totals.margin) } }],
        note: 'Doanh thu thuần: sau chiết khấu, trừ hàng bán trả lại. Lãi gộp = doanh thu thuần − giá vốn.',
        cols: [
          { key: 'stt', h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
          { key: 'ma', h: s.keyHead, w: s.labelHead ? 90 : undefined, v: (r) => (s.groupBy === 'month' ? r.label : r.key || '(chưa phân loại)') },
          ...(s.labelHead ? [{ key: 'ten', h: s.labelHead, v: (r: ProfitLine) => r.label }] : []),
          ...(s.extraHead ? [{ key: 'ex', h: s.extraHead, w: 80, center: true, v: (r: ProfitLine) => r.extra }] : []),
          { key: 'sl', h: 'Số lượng', w: 66, num: true, v: (r) => qty(r.qty) },
          { key: 'dt', h: 'Doanh thu thuần', w: 104, num: true, v: (r) => m(r.revenue) },
          { key: 'gv', h: 'Giá vốn', w: 104, num: true, v: (r) => m(r.cost) },
          { key: 'lg', h: 'Lãi gộp', w: 104, num: true, v: (r) => m(r.gross) },
          { key: 'tl', h: '% lãi gộp', w: 56, num: true, v: (r) => pct(r.margin) },
        ],
      }} />
    ),
  },
  screenTemplate<ProfitSheet>(),
];

/* ------------------------------------------------------------------ KQ01 */
export interface PnlLine { key: string; name: string; netRevenue: number; cogs: number; gross: number; margin: number | null; finIncome: number; finExpense: number; selling: number; admin: number; operating: number; other: number; profit: number }
export interface PnlSheet { from: string; to: string; by: string; branchCodes: string; rows: PnlLine[]; totals: PnlLine }
const PNL_COLS: [keyof PnlLine, string][] = [
  ['netRevenue', 'Doanh thu thuần'], ['cogs', 'Giá vốn (632)'], ['gross', 'Lãi gộp'], ['finIncome', 'DT tài chính (515)'], ['finExpense', 'CP tài chính (635)'],
  ['selling', 'CP bán hàng (641)'], ['admin', 'CP quản lý (642)'], ['operating', 'LN thuần HĐKD'], ['other', 'LN khác (711 − 811)'], ['profit', 'LN trước thuế'],
];
export const PNL_TEMPLATES: PrintTemplate<PnlSheet>[] = [
  {
    id: 'kq', name: 'Báo cáo kết quả kinh doanh theo cửa hàng', paper: 'A4L',
    render: (s, ctx) => (
      <LedgerForm ctx={ctx} d={{
        title: `BÁO CÁO KẾT QUẢ KINH DOANH THEO ${s.by === 'department' ? 'CỬA HÀNG (BỘ PHẬN)' : 'CHI NHÁNH'}`, branchCode: oneBranch(s.branchCodes), from: s.from, to: s.to,
        info: branchInfo(s.branchCodes, ctx.branchName), signs: MAKER_SIGNS, rows: s.rows, total: false,
        after: [{ label: 'Tổng cộng', cells: { ...Object.fromEntries(PNL_COLS.map(([k]) => [k, m(s.totals[k] as number)])), margin: pct(s.totals.margin) } }],
        note: 'Số lấy từ sổ cái, không tính bút toán kết chuyển.',
        cols: [
          { key: 'ma', h: s.by === 'department' ? 'Mã bộ phận' : 'Mã chi nhánh', w: 62, v: (r) => r.key || '' },
          { key: 'ten', h: 'Tên', v: (r) => r.name },
          ...PNL_COLS.flatMap(([k, h]): LedgerCol<PnlLine>[] => [
            { key: k, h, w: 78, num: true, v: (r) => m(r[k] as number) },
            ...(k === 'gross' ? [{ key: 'margin', h: '% lãi gộp', w: 44, num: true, v: (r: PnlLine) => pct(r.margin) }] : []),
          ]),
        ],
      }} />
    ),
  },
  screenTemplate<PnlSheet>(),
];
