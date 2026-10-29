/**
 * MẪU IN báo cáo phân hệ mua hàng:
 *   MH11  Tổng hợp mua hàng theo cách gom đang xem (rptTKMuahoadonVaMuahoantra*.rpt); theo mặt hàng thêm mẫu gọn rdlcBCTongHopMuaHangTheoMatHang.rdlc
 *   MH10  Nhật ký mua hàng: danh sách sự kiện đang lọc (không có mẫu HTsoft tương ứng)
 */
import { BOOK_SIGNS, LedgerForm, m, mb, qty, screenTemplate, type LedgerCol, type PrintTemplate, type Sign } from '@/components/print';

const MAKER_SIGNS: Sign[] = [{ title: 'Người lập biểu' }, ...BOOK_SIGNS.slice(1)];

/* ------------------------------------------------------------------ MH11 */
export interface BuyLine { key: string; label: string; baseUnit: string; buyQty: number; giftQty: number; returnQty: number; gross: number; discount: number; net: number; tax: number; returns: number; cost: number; rebate: number; value: number; unitCost: number | null; openDebt: number; documents: number }
/** groupLabel: "Mã hàng", "Nhà cung cấp"…; label của dòng đã đổi sang tên (NCC, chi nhánh) như trên màn. */
export interface BuySheet { from: string; to: string; groupBy: string; groupLabel: string; rows: BuyLine[] }
const SOURCE: Record<string, string> = { partner: 'rptTKMuahoadonVaMuahoantraByNCC.rpt', sku: 'rptTKMuahoadonVaMuahoantraByMH.rpt' };

const money = (key: string, h: string, f: (r: BuyLine) => number, w = 76): LedgerCol<BuyLine> => ({ key, h, w, num: true, v: (r) => mb(f(r)), sum: f });
const count = (key: string, h: string, f: (r: BuyLine) => number, group?: string): LedgerCol<BuyLine> => ({ key, h, group, w: 50, num: true, v: (r) => qty(f(r)), sum: f });

const fullSummary = (groupBy: string): PrintTemplate<BuySheet> => ({
  id: 'th', name: 'Tổng hợp mua hàng và hàng mua trả lại', paper: 'A4L', source: SOURCE[groupBy] ?? 'rptTKMuahoadonVaMuahoantra.rpt',
  render: (s, ctx) => {
    const sku = s.groupBy === 'sku';
    return (
      <LedgerForm ctx={ctx} d={{
        title: `TỔNG HỢP MUA HÀNG THEO ${s.groupLabel.toUpperCase()}`, from: s.from, to: s.to, signs: MAKER_SIGNS, total: 'Cộng', rows: s.rows,
        note: 'Chỉ phiếu đã duyệt (đã vào sổ); tiền trước thuế. Giá trị thuần = giá trị nhập − hàng trả lại + chi phí phân bổ − thưởng / chiết khấu sau mua.',
        cols: [
          { key: 'stt', h: 'STT', w: 24, center: true, v: (_, i) => i + 1 },
          ...(sku ? [{ key: 'ma', h: 'Mã hàng', w: 74, v: (r: BuyLine) => r.key }] : []),
          { key: 'ten', h: sku ? 'Tên hàng' : s.groupLabel, v: (r) => r.label || r.key },
          // Số lượng chỉ cộng được khi xem theo mã hàng (quy về ĐVT nhỏ nhất).
          ...(sku ? [
            { key: 'dvt', h: 'ĐVT', w: 34, center: true, v: (r: BuyLine) => r.baseUnit },
            count('slm', 'Mua', (r) => r.buyQty, 'Số lượng'), count('slt', 'Tặng', (r) => r.giftQty, 'Số lượng'), count('slr', 'Trả', (r) => r.returnQty, 'Số lượng'),
          ] : []),
          money('gross', 'Tiền hàng trước CK', (r) => r.gross, 80),
          money('ck', 'Chiết khấu', (r) => r.discount, 70),
          money('net', 'Giá trị nhập', (r) => r.net, 80),
          money('tax', 'Thuế GTGT', (r) => r.tax, 70),
          money('ret', 'Hàng trả lại', (r) => r.returns, 70),
          money('cp', '+ Chi phí phân bổ', (r) => r.cost, 68),
          money('th', '− Thưởng / CK sau mua', (r) => r.rebate, 68),
          money('val', 'Giá trị thuần', (r) => r.value, 82),
          ...(sku ? [{ key: 'gv', h: 'Giá vốn TT / ĐVT', w: 64, num: true, v: (r: BuyLine) => mb(r.unitCost === null ? 0 : Math.round(r.unitCost)) }] : []),
          money('no', 'Còn nợ NCC', (r) => r.openDebt, 76),
          ...(sku ? [] : [count('sp', 'Số phiếu', (r) => r.documents)]),
        ],
      }} />
    );
  },
});
/** Mẫu gọn theo mặt hàng như HTsoft: Mua hàng (SL, giá trị) | Chiết khấu | Trả lại (SL, giá trị) | Tổng giá trị mua. */
const byItem: PrintTemplate<BuySheet> = {
  id: 'mh', name: 'Tổng hợp mua hàng theo mặt hàng (mẫu gọn)', paper: 'A4L', source: 'rdlcBCTongHopMuaHangTheoMatHang.rdlc',
  render: (s, ctx) => (
    <LedgerForm ctx={ctx} d={{
      title: 'TỔNG HỢP MUA HÀNG THEO MẶT HÀNG', from: s.from, to: s.to, signs: MAKER_SIGNS, total: 'Tổng cộng', rows: s.rows,
      cols: [
        { key: 'stt', h: 'STT', w: 28, center: true, v: (_, i) => i + 1 },
        { key: 'ma', h: 'Mã hàng', w: 92, v: (r) => r.key },
        { key: 'ten', h: 'Tên hàng', v: (r) => r.label },
        { key: 'dvt', h: 'ĐVT', w: 40, center: true, v: (r) => r.baseUnit },
        { ...count('slm', 'Số lượng', (r) => r.buyQty, 'Mua hàng'), w: 62 },
        { ...money('gtm', 'Giá trị', (r) => r.gross, 100), group: 'Mua hàng' },
        money('ck', 'Chiết khấu', (r) => r.discount, 92),
        { ...count('slr', 'Số lượng', (r) => r.returnQty, 'Trả lại'), w: 62 },
        { ...money('gtr', 'Giá trị', (r) => r.returns, 92), group: 'Trả lại' },
        { key: 'tong', h: 'Tổng giá trị mua', w: 106, num: true, v: (r) => m(r.net - r.returns), sum: (r) => r.net - r.returns },
      ],
    }} />
  ),
};
export const buyTemplates = (groupBy: string): PrintTemplate<BuySheet>[] => [fullSummary(groupBy), ...(groupBy === 'sku' ? [byItem] : []), screenTemplate<BuySheet>()];

/* ------------------------------------------------------------------ MH10 */
/** Một sự kiện đã diễn giải thành câu (như trên màn). */
export interface LogLine { ts: string; eventLabel: string; docNo: string; user: string; text: string }
export interface LogSheet { from: string; to: string; eventLabel: string; rows: LogLine[] }
export const LOG_TEMPLATES: PrintTemplate<LogSheet>[] = [
  {
    id: 'nk', name: 'Nhật ký mua hàng', paper: 'A4L',
    render: (s, ctx) => (
      <LedgerForm ctx={ctx} d={{
        title: 'NHẬT KÝ MUA HÀNG', from: s.from || undefined, to: s.to || undefined, period: s.from || s.to ? undefined : 'Toàn bộ nhật ký',
        info: s.eventLabel ? [['Sự kiện', s.eventLabel]] : undefined, signs: [{ title: 'Người lập biểu' }, { title: 'Kế toán trưởng' }], total: false, rows: s.rows,
        cols: [
          { key: 'stt', h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
          { key: 'ts', h: 'Thời điểm', w: 112, center: true, v: (r) => new Date(r.ts).toLocaleString('vi-VN') },
          { key: 'ev', h: 'Sự kiện', w: 120, v: (r) => r.eventLabel },
          { key: 'ct', h: 'Chứng từ', w: 96, v: (r) => r.docNo },
          { key: 'ng', h: 'Người thực hiện', w: 110, v: (r) => r.user },
          { key: 'nd', h: 'Nội dung', v: (r) => r.text },
        ],
      }} />
    ),
  },
  screenTemplate<LogSheet>(),
];
