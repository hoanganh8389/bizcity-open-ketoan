/**
 * MẪU IN các màn kho, giá vốn (InventoryPages):
 *   ACC83  Báo cáo tổng hợp nhập xuất tồn (rdlcBCNhapXuatTonTheoCoTK.rdlc, rptSokhoXuatNhapTon.rpt) — theo mặt hàng hoặc gom theo nhóm…
 *   ACC82  Sổ chi tiết vật liệu, dụng cụ, sản phẩm, hàng hoá S10-DN (rdlcLoadSoChiTietVatLieuDungCu.rdlc, rdlcACC82.rdlc, rptSoKhoWithAmount.rpt)
 *          Thẻ kho S12-DN (chỉ số lượng)
 *   ACC49  Bảng tính giá vốn hàng xuất (bình quân gia quyền tháng)
 */
import { date } from '@/lib/format';
import { BOOK_SIGNS, LedgerForm, m, mb, qty, screenTemplate, type LedgerCol, type PrintTemplate, type Row, type Sign } from '@/components/print';

const MAKER_SIGNS: Sign[] = [{ title: 'Người lập biểu' }, ...BOOK_SIGNS.slice(1)];
const oneBranch = (codes: string) => (codes && !codes.includes(',') ? codes : undefined);
const placeInfo = (branchCodes: string, warehouseCodes: string, name: (c: string) => string): Row[] => [
  ...(branchCodes ? [['Chi nhánh', branchCodes.split(',').map((c) => `${c} — ${name(c)}`).join('; ')] as Row] : []),
  ...(warehouseCodes ? [['Mã kho', warehouseCodes.split(',').join(', ')] as Row] : []),
];

/* ------------------------------------------------------------------ ACC83 */
interface StockFigures { openingQty: number; openingValue: number; inQty: number; inValue: number; outQty: number; outValue: number; closingQty: number; closingValue: number; purchaseQty: number; purchaseValue: number }
/** Một dòng nhập xuất tồn: theo mặt hàng (sku, tên, ĐVT, chi nhánh) hoặc theo nhóm gom (mã, tên, số mặt hàng). */
export interface StockLine extends StockFigures { code: string; name: string; unit?: string; branchCode?: string; skuCount?: number }
export interface StockSheet { from: string; to: string; branchCodes: string; warehouseCodes: string; view: string; viewLabel: string; purchaseOnly?: boolean; rows: StockLine[] }

/** Cặp cột Số lượng / Giá trị dưới một tiêu đề tầng trên. */
const pair = (key: string, group: string, q: (r: StockFigures) => number, v: (r: StockFigures) => number): LedgerCol<StockLine>[] => [
  { key: `${key}Q`, h: 'Số lượng', group, w: 62, num: true, v: (r) => qty(q(r)), sum: q },
  { key: `${key}V`, h: 'Giá trị', group, w: 88, num: true, v: (r) => mb(v(r)), sum: v },
];

const NXT: PrintTemplate<StockSheet> = {
  id: 'nxt', name: 'Báo cáo tổng hợp nhập xuất tồn', paper: 'A4L', source: 'rdlcBCNhapXuatTonTheoCoTK.rdlc, rptSokhoXuatNhapTon.rpt',
  render: (s, ctx) => {
    const item = s.view === 'item';
    const branches = new Set(s.rows.map((r) => r.branchCode ?? ''));
    return (
      <LedgerForm ctx={ctx} d={{
        title: item ? 'BÁO CÁO TỔNG HỢP NHẬP XUẤT TỒN' : `BÁO CÁO TỔNG HỢP ${s.purchaseOnly ? 'MUA HÀNG' : 'NHẬP XUẤT TỒN'} THEO ${s.viewLabel.replace(/ \(.*\)$/, '').toUpperCase()}`,
        branchCode: oneBranch(s.branchCodes), from: s.from, to: s.to, info: placeInfo(s.branchCodes, s.warehouseCodes, ctx.branchName), bookNote: item, signs: MAKER_SIGNS, total: 'Tổng cộng', rows: s.rows,
        // Theo mặt hàng mà nhiều chi nhánh: gom theo chi nhánh, cộng từng chi nhánh.
        groupBy: item && branches.size > 1 ? { key: (r) => r.branchCode ?? '', label: (k) => `Chi nhánh: ${k} — ${ctx.branchName(k)}`, subtotal: 'Cộng chi nhánh' } : undefined,
        cols: [
          { key: 'stt', h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
          { key: 'ma', h: 'Mã', w: 104, v: (r) => r.code || '(chưa phân loại)' },
          { key: 'ten', h: item ? 'Tên vật liệu, dụng cụ, sản phẩm, hàng hoá' : s.viewLabel.replace(/ \(.*\)$/, ''), v: (r) => r.name },
          item ? { key: 'dvt', h: 'Đơn vị', w: 44, center: true, v: (r) => r.unit ?? '' } : { key: 'smh', h: 'Số mặt hàng', w: 50, num: true, v: (r) => qty(r.skuCount) },
          ...(s.purchaseOnly ? pair('mua', 'Mua hàng (trừ trả lại)', (r) => r.purchaseQty, (r) => r.purchaseValue) : [
            ...pair('td', 'Tồn đầu kỳ', (r) => r.openingQty, (r) => r.openingValue),
            ...pair('nh', 'Nhập trong kỳ', (r) => r.inQty, (r) => r.inValue),
            ...pair('xu', 'Xuất trong kỳ', (r) => r.outQty, (r) => r.outValue),
            ...pair('tc', 'Tồn cuối kỳ', (r) => r.closingQty, (r) => r.closingValue),
          ]),
        ],
      }} />
    );
  },
};
export const STOCK_TEMPLATES: PrintTemplate<StockSheet>[] = [NXT, screenTemplate<StockSheet>()];

/* ------------------------------------------------------------------ ACC82 */
export interface ItemLedgerLine { docDate: string; docNo: string; kindLabel: string; branchCode: string; inQty: number; inValue: number; outQty: number; outValue: number; balanceQty: number; balanceValue: number }
export interface ItemLedgerSheet {
  from: string; to: string; branchCodes: string; warehouseCodes: string;
  sku: string; name: string; unit: string; opening: { qty: number; value: number }; closing: { qty: number; value: number }; rows: ItemLedgerLine[];
}
const itemInfo = (s: ItemLedgerSheet, name: (c: string) => string): Row[] => [
  ['Mã / tên hàng', `${s.sku} — ${s.name}`], ['Đơn vị tính', s.unit || ''], ...placeInfo(s.branchCodes, s.warehouseCodes, name),
];
/** Đơn giá dòng = giá trị ÷ số lượng (nhập hoặc xuất). */
const unitPrice = (r: ItemLedgerLine) => (r.inQty ? r.inValue / r.inQty : r.outQty ? r.outValue / r.outQty : 0);

const S10: PrintTemplate<ItemLedgerSheet> = {
  id: 's10', name: 'Sổ chi tiết vật liệu, dụng cụ, sản phẩm, hàng hoá S10-DN', paper: 'A4L', source: 'rdlcLoadSoChiTietVatLieuDungCu.rdlc, rdlcACC82.rdlc, rptSoKhoWithAmount.rpt',
  render: (s, ctx) => (
    <LedgerForm ctx={ctx} d={{
      title: 'SỔ CHI TIẾT VẬT LIỆU, DỤNG CỤ (SẢN PHẨM, HÀNG HOÁ)', form: 'Mẫu số S10-DN', branchCode: oneBranch(s.branchCodes), from: s.from, to: s.to,
      info: itemInfo(s, ctx.branchName), bookNote: true, signs: MAKER_SIGNS, rows: s.rows,
      before: [{ label: 'Số dư đầu kỳ', strong: true, cells: { tq: qty(s.opening.qty), tv: m(s.opening.value) } }],
      total: 'Cộng phát sinh trong kỳ',
      after: [{ label: 'Số dư cuối kỳ', cells: { tq: qty(s.closing.qty), tv: m(s.closing.value) } }],
      cols: [
        { key: 'so', h: 'Số hiệu', group: 'Chứng từ', w: 92, v: (r) => r.docNo },
        { key: 'ngay', h: 'Ngày, tháng', group: 'Chứng từ', w: 62, center: true, v: (r) => date(r.docDate) },
        { key: 'dg', h: 'Diễn giải', v: (r) => r.kindLabel },
        { key: 'gia', h: 'Đơn giá', w: 72, num: true, v: (r) => mb(Math.round(unitPrice(r))) },
        { key: 'nq', h: 'Số lượng', group: 'Nhập', w: 56, num: true, v: (r) => qty(r.inQty), sum: (r) => r.inQty },
        { key: 'nv', h: 'Thành tiền', group: 'Nhập', w: 86, num: true, v: (r) => mb(r.inValue), sum: (r) => r.inValue },
        { key: 'xq', h: 'Số lượng', group: 'Xuất', w: 56, num: true, v: (r) => qty(r.outQty), sum: (r) => r.outQty },
        { key: 'xv', h: 'Thành tiền', group: 'Xuất', w: 86, num: true, v: (r) => mb(r.outValue), sum: (r) => r.outValue },
        { key: 'tq', h: 'Số lượng', group: 'Tồn', w: 56, num: true, v: (r) => qty(r.balanceQty) },
        { key: 'tv', h: 'Thành tiền', group: 'Tồn', w: 90, num: true, v: (r) => m(r.balanceValue) },
        { key: 'gc', h: 'Ghi chú', w: 50, center: true, v: (r) => r.branchCode },
      ],
    }} />
  ),
};

/** Thẻ kho S12-DN: chỉ số lượng, cột ký xác nhận của kế toán. */
const S12: PrintTemplate<ItemLedgerSheet> = {
  id: 's12', name: 'Thẻ kho (Sổ kho) S12-DN', paper: 'A4',
  render: (s, ctx) => (
    <LedgerForm ctx={ctx} d={{
      title: 'THẺ KHO (SỔ KHO)', form: 'Mẫu số S12-DN', branchCode: oneBranch(s.branchCodes), from: s.from, to: s.to,
      info: [['Tên, nhãn hiệu, quy cách vật tư', s.name], ['Đơn vị tính', s.unit || ''], ['Mã số', s.sku], ...placeInfo(s.branchCodes, s.warehouseCodes, ctx.branchName)],
      bookNote: true, signs: [{ title: 'Người lập' }, ...BOOK_SIGNS.slice(1)], rows: s.rows,
      before: [{ label: 'Số tồn đầu kỳ', strong: true, cells: { ton: qty(s.opening.qty) } }],
      total: 'Cộng phát sinh trong kỳ',
      after: [{ label: 'Số tồn cuối kỳ', cells: { ton: qty(s.closing.qty) } }],
      cols: [
        { key: 'stt', h: 'STT', w: 28, center: true, v: (_, i) => i + 1 },
        { key: 'ngay', h: 'Ngày, tháng', w: 58, center: true, v: (r) => date(r.docDate) },
        { key: 'sn', h: 'Nhập', group: 'Số hiệu chứng từ', w: 82, v: (r) => (r.inQty ? r.docNo : '') },
        { key: 'sx', h: 'Xuất', group: 'Số hiệu chứng từ', w: 82, v: (r) => (r.outQty ? r.docNo : '') },
        { key: 'dg', h: 'Diễn giải', v: (r) => <>{r.kindLabel}{r.branchCode ? <i> — {r.branchCode}</i> : null}</> },
        { key: 'nx', h: 'Ngày nhập, xuất', w: 58, center: true, v: (r) => date(r.docDate) },
        { key: 'nh', h: 'Nhập', group: 'Số lượng', w: 54, num: true, v: (r) => qty(r.inQty), sum: (r) => r.inQty },
        { key: 'xu', h: 'Xuất', group: 'Số lượng', w: 54, num: true, v: (r) => qty(r.outQty), sum: (r) => r.outQty },
        { key: 'ton', h: 'Tồn', group: 'Số lượng', w: 58, num: true, v: (r) => qty(r.balanceQty) || '0' },
        { key: 'ky', h: 'Ký xác nhận của kế toán', w: 64, v: () => '' },
      ],
    }} />
  ),
};
export const ITEM_LEDGER_TEMPLATES: PrintTemplate<ItemLedgerSheet>[] = [S10, S12, screenTemplate<ItemLedgerSheet>()];

/* ------------------------------------------------------------------ ACC49 */
export interface CostLine { costGroup: string; costGroupName: string; sku: string; name: string; openingQty: number; openingValue: number; inQty: number; inValue: number; unitCost: number; outQty: number; closingQty: number; closingValue: number; costSource: 'computed' | 'import' }
export interface CostSheet { period: string; rows: CostLine[] }

export const COST_TEMPLATES: PrintTemplate<CostSheet>[] = [
  {
    id: 'gv', name: 'Bảng tính giá vốn hàng xuất', paper: 'A4L',
    render: (s, ctx) => (
      <LedgerForm ctx={ctx} d={{
        title: 'BẢNG TÍNH GIÁ VỐN HÀNG XUẤT', period: `Tháng ${s.period.slice(5, 7)} năm ${s.period.slice(0, 4)} — bình quân gia quyền cuối tháng`,
        signs: MAKER_SIGNS, total: 'Tổng cộng', rows: s.rows,
        groupBy: { key: (r) => r.costGroup, label: (k, rs) => `Đơn vị hạch toán: ${k}${rs[0]?.costGroupName ? ` — ${rs[0].costGroupName}` : ''}`, subtotal: 'Cộng đơn vị' },
        cols: [
          { key: 'stt', h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
          { key: 'sku', h: 'Mã hàng', w: 84, v: (r) => r.sku },
          { key: 'ten', h: 'Tên hàng', v: (r) => r.name },
          { key: 'tdq', h: 'Số lượng', group: 'Tồn đầu', w: 58, num: true, v: (r) => qty(r.openingQty), sum: (r) => r.openingQty },
          { key: 'tdv', h: 'Giá trị', group: 'Tồn đầu', w: 88, num: true, v: (r) => mb(r.openingValue), sum: (r) => r.openingValue },
          { key: 'nq', h: 'Số lượng', group: 'Nhập tính giá', w: 58, num: true, v: (r) => qty(r.inQty), sum: (r) => r.inQty },
          { key: 'nv', h: 'Giá trị', group: 'Nhập tính giá', w: 88, num: true, v: (r) => mb(r.inValue), sum: (r) => r.inValue },
          { key: 'gia', h: 'Đơn giá vốn', w: 78, num: true, v: (r) => r.unitCost.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) },
          { key: 'ng', h: 'Nguồn giá', w: 58, center: true, v: (r) => (r.costSource === 'import' ? 'Nhập Excel' : 'Bình quân') },
          { key: 'xq', h: 'SL xuất', w: 58, num: true, v: (r) => qty(r.outQty), sum: (r) => r.outQty },
          { key: 'tcq', h: 'Số lượng', group: 'Tồn cuối', w: 58, num: true, v: (r) => qty(r.closingQty), sum: (r) => r.closingQty },
          { key: 'tcv', h: 'Giá trị', group: 'Tồn cuối', w: 88, num: true, v: (r) => mb(r.closingValue), sum: (r) => r.closingValue },
        ],
      }} />
    ),
  },
  screenTemplate<CostSheet>(),
];
