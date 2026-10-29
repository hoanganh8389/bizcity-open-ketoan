/**
 * MẪU IN các sổ nhật ký đặc biệt, bảng kê và lưu chuyển tiền tệ (màn JournalsPages):
 *   ACC72 / ACC73  Sổ nhật ký thu tiền S03a1-DN / chi tiền S03a2-DN (rdlcSoNhatKyThuTien / ChiTien)
 *   ACC84          Sổ nhật ký bán hàng S03a4-DN (rdlcSoNhatKyBanHang)
 *   ACC77          Sổ nhật ký mua hàng S03a3-DN (rdlcSoNhatKyMuaHang)
 *   ACC60          Bảng kê chi tiết chứng từ (rdlcBangKeChiTietChungTu)
 *   ACC13          Báo cáo lưu chuyển tiền tệ B03-DN (BCLuanChuyenTienTe)
 */
import { DOC_TYPE_LABELS, type DocType } from '@ketoan/contracts';
import { date } from '@/lib/format';
import { BOOK_SIGNS, LedgerForm, m, mb, screenTemplate, type LedgerCol, type PrintTemplate, type Row, type Sign } from '@/components/print';

const branchOf = (codes: string) => (codes && !codes.includes(',') ? codes : undefined);
const SIGNS_LAP_BIEU: Sign[] = [{ title: 'Người lập biểu' }, ...BOOK_SIGNS.slice(1)];
const SIGNS_DAI_DIEN: Sign[] = [{ title: 'Người lập biểu' }, { title: 'Kế toán trưởng' }, { title: 'Người đại diện theo pháp luật', note: '(Ký, họ tên, đóng dấu)' }];

/* ------------------------------------------------------------- ACC72 / ACC73 */
export interface CashJournalRow { postingDate: string; docNo: string; description: string; partnerCode: string | null; partnerName: string | null; amount: number; cells: number[]; other: number; otherAccount: string }
export interface CashJournalSheet { direction: 'in' | 'out'; from: string; to: string; branchCodes: string; account: string; columns: string[]; rows: CashJournalRow[] }

/** Sổ nhật ký thu tiền S03a1-DN / chi tiền S03a2-DN: ghi Nợ (Có) TK tiền, chia cột theo tài khoản đối ứng đã chọn trên màn. */
const cashJournal: PrintTemplate<CashJournalSheet> = {
  id: 's03a12', name: 'Sổ nhật ký thu / chi tiền S03a1-DN, S03a2-DN', paper: 'A4L', source: 'rdlcSoNhatKyThuTien.rdlc, rdlcSoNhatKyChiTien.rdlc',
  render: (s, ctx) => {
    const thu = s.direction === 'in';
    const band = thu ? 'Ghi Có các TK' : 'Ghi Nợ các TK';
    return (
      <LedgerForm ctx={ctx} d={{
        title: thu ? 'SỔ NHẬT KÝ THU TIỀN' : 'SỔ NHẬT KÝ CHI TIỀN', form: thu ? 'Mẫu số S03a1-DN' : 'Mẫu số S03a2-DN', branchCode: branchOf(s.branchCodes), from: s.from, to: s.to,
        bookNote: true, signs: SIGNS_DAI_DIEN, total: 'Cộng', rows: s.rows,
        cols: [
          { key: 'ngs', h: 'Ngày, tháng ghi sổ', w: 60, center: true, v: (r) => date(r.postingDate) },
          { key: 'so', h: 'Số hiệu', group: 'Chứng từ', w: 86, v: (r) => r.docNo },
          { key: 'nct', h: 'Ngày, tháng', group: 'Chứng từ', w: 60, center: true, v: (r) => date(r.postingDate) },
          { key: 'dg', h: 'Diễn giải', v: (r) => <>{r.description}{r.partnerName ? <i> — {r.partnerName}</i> : null}</> },
          { key: 'tien', h: `${thu ? 'Ghi Nợ TK' : 'Ghi Có TK'} ${s.account}`, w: 90, num: true, v: (r) => mb(r.amount), sum: (r) => r.amount },
          ...s.columns.map((c, k): LedgerCol<CashJournalRow> => ({ key: `c${k}`, h: c, group: band, w: 80, num: true, v: (r) => mb(r.cells[k]), sum: (r) => r.cells[k] ?? 0 })),
          { key: 'kt', h: 'Số tiền TK khác', group: band, w: 84, num: true, v: (r) => mb(r.other), sum: (r) => r.other },
          { key: 'kh', h: 'Số hiệu TK khác', group: band, w: 60, center: true, v: (r) => r.otherAccount },
        ],
      }} />
    );
  },
};
export const CASH_JOURNAL_TEMPLATES: PrintTemplate<CashJournalSheet>[] = [cashJournal, screenTemplate<CashJournalSheet>()];

/* ------------------------------------------------------------------ ACC84 */
interface SalesCols { goods: number; finished: number; service: number; other: number; total: number }
export interface SalesJournalRow extends SalesCols { postingDate: string; docDate: string; docNo: string; invoiceNo: string | null; description: string; partnerCode: string | null; partnerName: string | null; otherAccount: string; branchCode: string }
export interface SalesJournalSheet { from: string; to: string; branchCodes: string; account: string; partnerCode: string; rows: SalesJournalRow[]; branches: number }

/** Sổ nhật ký bán hàng S03a4-DN: phải thu người mua (ghi Nợ), ghi Có TK doanh thu theo hàng hoá / thành phẩm / dịch vụ; cộng từng chi nhánh. */
const salesJournal: PrintTemplate<SalesJournalSheet> = {
  id: 's03a4', name: 'Sổ nhật ký bán hàng S03a4-DN', paper: 'A4L', source: 'rdlcSoNhatKyBanHang.rdlc',
  render: (s, ctx) => (
    <LedgerForm ctx={ctx} d={{
      title: 'SỔ NHẬT KÝ BÁN HÀNG', form: 'Mẫu số S03a4-DN', branchCode: branchOf(s.branchCodes), from: s.from, to: s.to, bookNote: true, signs: SIGNS_LAP_BIEU,
      info: [...(s.account ? [['Tài khoản doanh thu', s.account] as Row] : []), ...(s.partnerCode ? [['Khách hàng', s.partnerCode] as Row] : [])],
      total: 'Tổng cộng', rows: s.rows,
      groupBy: s.branches > 1 ? { key: (r) => r.branchCode, label: (k) => `Chi nhánh ${k} — ${ctx.branchName(k)}`, subtotal: 'Cộng chi nhánh' } : undefined,
      cols: [
        { key: 'ngs', h: 'Ngày, tháng ghi sổ', w: 60, center: true, v: (r) => date(r.postingDate) },
        { key: 'so', h: 'Số hiệu', group: 'Chứng từ', w: 86, v: (r) => r.docNo },
        { key: 'nct', h: 'Ngày, tháng', group: 'Chứng từ', w: 60, center: true, v: (r) => date(r.docDate || r.postingDate) },
        { key: 'dg', h: 'Diễn giải', v: (r) => <>{r.description}{r.partnerName ? <i> — {r.partnerName}</i> : null}{r.invoiceNo ? <span> (HĐ {r.invoiceNo})</span> : null}</> },
        { key: 'pt', h: 'Phải thu từ người mua (ghi Nợ)', w: 96, num: true, v: (r) => mb(r.total), sum: (r) => r.total },
        { key: 'hh', h: 'Hàng hoá', group: 'Ghi Có tài khoản doanh thu', w: 90, num: true, v: (r) => mb(r.goods), sum: (r) => r.goods },
        { key: 'tp', h: 'Thành phẩm', group: 'Ghi Có tài khoản doanh thu', w: 86, num: true, v: (r) => mb(r.finished), sum: (r) => r.finished },
        { key: 'dv', h: 'Dịch vụ', group: 'Ghi Có tài khoản doanh thu', w: 86, num: true, v: (r) => mb(r.service), sum: (r) => r.service },
        { key: 'kt', h: 'Số tiền', group: 'Tài khoản khác', w: 84, num: true, v: (r) => mb(r.other), sum: (r) => r.other },
        { key: 'kh', h: 'Số hiệu', group: 'Tài khoản khác', w: 56, center: true, v: (r) => r.otherAccount },
      ],
    }} />
  ),
};
export const SALES_JOURNAL_TEMPLATES: PrintTemplate<SalesJournalSheet>[] = [salesJournal, screenTemplate<SalesJournalSheet>()];

/* ------------------------------------------------------------------ ACC77 */
interface PurchaseCols { goods: number; materials: number; tools: number; other: number; total: number }
export interface PurchaseJournalRow extends PurchaseCols { postingDate: string; docNo: string; invoiceNo: string | null; description: string; partnerCode: string | null; partnerName: string | null; otherAccount: string; branchCode: string }
export interface PurchaseJournalSheet { from: string; to: string; branchCodes: string; partnerCode: string; rows: PurchaseJournalRow[]; branches: number }

/** Sổ nhật ký mua hàng S03a3-DN: ghi Nợ hàng hoá / nguyên vật liệu / công cụ / TK khác, ghi Có phải trả người bán; cộng từng chi nhánh. */
const purchaseJournal: PrintTemplate<PurchaseJournalSheet> = {
  id: 's03a3', name: 'Sổ nhật ký mua hàng S03a3-DN', paper: 'A4L', source: 'rdlcSoNhatKyMuaHang.rdlc',
  render: (s, ctx) => {
    const band = 'Tài khoản ghi Nợ';
    return (
      <LedgerForm ctx={ctx} d={{
        title: 'SỔ NHẬT KÝ MUA HÀNG', form: 'Mẫu số S03a3-DN', branchCode: branchOf(s.branchCodes), from: s.from, to: s.to, bookNote: true, signs: SIGNS_LAP_BIEU,
        info: s.partnerCode ? [['Nhà cung cấp', s.partnerCode]] : undefined,
        total: 'Tổng cộng', rows: s.rows,
        groupBy: s.branches > 1 ? { key: (r) => r.branchCode, label: (k) => `Chi nhánh ${k} — ${ctx.branchName(k)}`, subtotal: 'Cộng chi nhánh' } : undefined,
        cols: [
          { key: 'ngs', h: 'Ngày, tháng ghi sổ', w: 60, center: true, v: (r) => date(r.postingDate) },
          { key: 'so', h: 'Số hiệu', group: 'Chứng từ', w: 86, v: (r) => r.docNo },
          { key: 'nct', h: 'Ngày, tháng', group: 'Chứng từ', w: 60, center: true, v: (r) => date(r.postingDate) },
          { key: 'dg', h: 'Diễn giải', v: (r) => <>{r.partnerName || r.description}{r.invoiceNo ? <span> (HĐ {r.invoiceNo})</span> : null}</> },
          { key: 'hh', h: 'Hàng hoá', group: band, w: 88, num: true, v: (r) => mb(r.goods), sum: (r) => r.goods },
          { key: 'nl', h: 'Nguyên vật liệu', group: band, w: 84, num: true, v: (r) => mb(r.materials), sum: (r) => r.materials },
          { key: 'cc', h: 'Công cụ, dụng cụ', group: band, w: 84, num: true, v: (r) => mb(r.tools), sum: (r) => r.tools },
          { key: 'kt', h: 'TK khác: số tiền', group: band, w: 84, num: true, v: (r) => mb(r.other), sum: (r) => r.other },
          { key: 'kh', h: 'TK khác: số hiệu', group: band, w: 56, center: true, v: (r) => r.otherAccount },
          { key: 'pt', h: 'Phải trả người bán (ghi Có)', w: 96, num: true, v: (r) => mb(r.total), sum: (r) => r.total },
        ],
      }} />
    );
  },
};
export const PURCHASE_JOURNAL_TEMPLATES: PrintTemplate<PurchaseJournalSheet>[] = [purchaseJournal, screenTemplate<PurchaseJournalSheet>()];

/* ------------------------------------------------------------------ ACC60 */
export interface ListingRow { postingDate: string; docNo: string; docType: string; description: string; debitAccount: string; creditAccount: string; amount: number; debitPartner: string; creditPartner: string; costItem: string; department: string; branchCode: string; reasonCode: string }
export interface ListingSheet { from: string; to: string; branchCodes: string; account: string; docType: string; rows: ListingRow[] }
const typeLabel = (t: string) => DOC_TYPE_LABELS[t as DocType] ?? t;
const listingInfo = (s: ListingSheet): Row[] => [...(s.account ? [['Tài khoản', s.account] as Row] : []), ...(s.docType ? [['Loại chứng từ', typeLabel(s.docType)] as Row] : [])];

/** Bảng kê chứng từ theo HTsoft: Phiếu (Số phiếu, Ngày tháng) | Diễn giải | Tài khoản (Nợ, Có) | Số tiền | Lý do. */
const listingHt: PrintTemplate<ListingSheet> = {
  id: 'bkct', name: 'Bảng kê chứng từ', paper: 'A4L', source: 'rdlcBangKeChiTietChungTu.rdlc, rdlcBangKeChiTietChungTu1.rdlc',
  render: (s, ctx) => (
    <LedgerForm ctx={ctx} d={{
      title: 'BẢNG KÊ CHỨNG TỪ', branchCode: branchOf(s.branchCodes), from: s.from, to: s.to, bookNote: true, info: listingInfo(s), total: 'Tổng cộng', rows: s.rows,
      cols: [
        { key: 'so', h: 'Số phiếu', group: 'Phiếu', w: 96, v: (r) => r.docNo },
        { key: 'ngay', h: 'Ngày tháng', group: 'Phiếu', w: 62, center: true, v: (r) => date(r.postingDate) },
        { key: 'dg', h: 'Diễn giải', v: (r) => r.description },
        { key: 'no', h: 'Nợ', group: 'Tài khoản', w: 58, center: true, v: (r) => r.debitAccount },
        { key: 'co', h: 'Có', group: 'Tài khoản', w: 58, center: true, v: (r) => r.creditAccount },
        { key: 'tien', h: 'Số tiền', w: 104, num: true, v: (r) => m(r.amount), sum: (r) => r.amount },
        { key: 'ld', h: 'Lý do', w: 70, v: (r) => r.reasonCode },
      ],
    }} />
  ),
};

/** Bảng kê chi tiết chứng từ đủ cột như màn: thêm loại chứng từ, đối tượng Nợ / Có, khoản mục, bộ phận, chi nhánh. */
const listingFull: PrintTemplate<ListingSheet> = {
  id: 'bkct-du', name: 'Bảng kê chi tiết chứng từ (đủ cột)', paper: 'A4L',
  render: (s, ctx) => (
    <LedgerForm ctx={ctx} d={{
      title: 'BẢNG KÊ CHI TIẾT CHỨNG TỪ', branchCode: branchOf(s.branchCodes), from: s.from, to: s.to, info: listingInfo(s), total: 'Tổng cộng', rows: s.rows,
      cols: [
        { key: 'ngay', h: 'Ngày', w: 58, center: true, v: (r) => date(r.postingDate) },
        { key: 'so', h: 'Số chứng từ', w: 88, v: (r) => r.docNo },
        { key: 'loai', h: 'Loại', w: 74, v: (r) => typeLabel(r.docType) },
        { key: 'dg', h: 'Diễn giải', v: (r) => r.description },
        { key: 'no', h: 'Nợ', group: 'Tài khoản', w: 52, center: true, v: (r) => r.debitAccount },
        { key: 'co', h: 'Có', group: 'Tài khoản', w: 52, center: true, v: (r) => r.creditAccount },
        { key: 'tien', h: 'Số tiền', w: 92, num: true, v: (r) => m(r.amount), sum: (r) => r.amount },
        { key: 'dtn', h: 'Nợ', group: 'Đối tượng', w: 66, v: (r) => r.debitPartner },
        { key: 'dtc', h: 'Có', group: 'Đối tượng', w: 66, v: (r) => r.creditPartner },
        { key: 'km', h: 'Khoản mục', w: 56, v: (r) => r.costItem },
        { key: 'bp', h: 'Bộ phận', w: 52, v: (r) => r.department },
        { key: 'cn', h: 'CN', w: 40, center: true, v: (r) => r.branchCode },
      ],
    }} />
  ),
};
export const LISTING_TEMPLATES: PrintTemplate<ListingSheet>[] = [listingHt, listingFull, screenTemplate<ListingSheet>()];

/* ------------------------------------------------------------------ ACC13 */
export interface CashFlowRow { code: string; name: string; bold: boolean; value: number | null }
export interface CashFlowSheet { from: string; to: string; branchCodes: string; rows: CashFlowRow[] }

/** Báo cáo lưu chuyển tiền tệ B03-DN (trực tiếp), A4 dọc: Chỉ tiêu | Mã số | Thuyết minh | Năm nay | Năm trước (màn chưa có số năm trước nên để trống). */
const cashFlow: PrintTemplate<CashFlowSheet> = {
  id: 'b03', name: 'Báo cáo lưu chuyển tiền tệ B03-DN', paper: 'A4', source: 'BCLuanChuyenTienTe.rdlc, BCLuanChuyenTienTe2.rdlc',
  render: (s, ctx) => (
    <LedgerForm ctx={ctx} d={{
      title: 'BÁO CÁO LƯU CHUYỂN TIỀN TỆ', form: 'Mẫu số B03-DN', branchCode: branchOf(s.branchCodes),
      period: <>(Theo phương pháp trực tiếp)<br />Từ ngày {date(s.from)} đến ngày {date(s.to)}</>,
      info: [['Đơn vị tính', 'Đồng']], total: false, rows: s.rows, signs: SIGNS_LAP_BIEU,
      cols: [
        { key: 'ct', h: 'Chỉ tiêu', v: (r) => (r.bold ? <b>{r.name}</b> : <span style={{ paddingLeft: 12 }}>{r.name}</span>) },
        { key: 'ma', h: 'Mã số', w: 46, center: true, v: (r) => (r.bold ? <b>{r.code}</b> : r.code) },
        { key: 'tm', h: 'Thuyết minh', w: 60, center: true, v: () => '' },
        { key: 'nn', h: 'Năm nay', w: 110, num: true, v: (r) => (r.value === null ? '' : r.bold ? <b>{m(r.value)}</b> : mb(r.value)) },
        { key: 'nt', h: 'Năm trước', w: 110, num: true, v: () => '' },
      ],
    }} />
  ),
};
export const CASH_FLOW_TEMPLATES: PrintTemplate<CashFlowSheet>[] = [cashFlow, screenTemplate<CashFlowSheet>()];
