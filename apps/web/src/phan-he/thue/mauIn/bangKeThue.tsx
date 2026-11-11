// [2026-11-11 Nguyễn Văn Thủy] Mẫu in bảng kê thuế: mẫu quản trị + phụ lục 01-1/GTGT, 01-2/GTGT; khối theo chi nhánh khi tách (đóng góp)
/**
 * MẪU IN bảng kê hoá đơn, chứng từ HHDV bán ra (ACC65) / mua vào (ACC64), A4 ngang.
 *   'qt'           Mẫu quản trị: Số HĐ, Ngày HĐ, người mua/bán, MST, Mặt hàng, (ĐVT, SL, đơn giá), tiền chưa thuế, thuế suất, thuế, TK thuế;
 *                  nhóm "Nhóm HHDV: …" có "Cộng nhóm", cuối "Tổng cộng"; ký Người lập biểu / Kế toán trưởng / Giám đốc.
 *   'bk011'/'bk012' Phụ lục kê khai 01-1/GTGT, 01-2/GTGT (mẫu số, ký hiệu, số, ngày hoá đơn…; ký người nộp thuế).
 * Tách theo chi nhánh (lớp nhiều chi nhánh): mỗi khối một chi nhánh, nhóm và cộng nhóm riêng; Tổng cộng chung cuối bảng.
 */
import { date } from '@/lib/format';
import { LedgerForm, m, qty, screenTemplate, type LedgerCol, type PrintCtx, type PrintTemplate, type Row } from '@/components/print';

export interface TaxInvoiceRow {
  invoiceForm: string; invoiceSerial: string; invoiceNo: string; invoiceDate: string; docNo: string; docDate: string; docType: string;
  buyerName: string; buyerTaxCode: string; partnerCode: string; partnerName: string; branchCode: string;
  sku: string; itemName: string; itemCount: number; unit: string; qty: number; price: number;
  taxRate: number; amount: number; tax: number; taxAccount: string; sourceDocumentId: string;
}
export interface TaxInvoiceGroup { group: string; label: string; rows: TaxInvoiceRow[]; amount: number; tax: number; counted: boolean }
export interface TaxInvoiceSheet {
  direction: 'output' | 'input'; from: string; to: string; branchCodes: string; unitQty: boolean;
  /** Khối in: một khối (branch '') hoặc mỗi chi nhánh một khối khi tách. */
  blocks: { branch: string; groups: TaxInvoiceGroup[] }[];
}
type Line = TaxInvoiceRow & { key: string; label: string };

const cents = (n: number) => Math.round(n * 100);
const tong = (s: TaxInvoiceSheet) => {
  const gs = s.blocks.flatMap((b) => b.groups).filter((g) => g.counted);
  return { amount: gs.reduce((a, g) => a + cents(g.amount), 0) / 100, tax: gs.reduce((a, g) => a + cents(g.tax), 0) / 100, gs };
};
const lines = (s: TaxInvoiceSheet, input: boolean): Line[] => s.blocks.flatMap((b) => b.groups.flatMap((g) => g.rows.map((r) => ({
  ...r, key: `${b.branch}|${g.group}`,
  label: `${b.branch ? `${b.branch} — ` : ''}Nhóm HHDV${input ? ' mua vào' : ''}: ${g.label || 'Không thuộc nhóm kê khai (không cộng vào tổng)'}`,
}))));
const itemText = (r: Line) => (r.itemCount > 1 ? `${r.itemName} và ${r.itemCount - 1} mặt hàng khác` : r.itemName);

function quanTri(s: TaxInvoiceSheet, ctx: PrintCtx) {
  const input = s.direction === 'input';
  const t = tong(s);
  const cols: LedgerCol<Line>[] = [
    { key: 'so', h: 'Số hóa đơn', w: 70, center: true, v: (r) => r.invoiceNo },
    { key: 'ngay', h: 'Ngày hóa đơn', w: 66, center: true, v: (r) => date(r.invoiceDate) },
    { key: 'ten', h: input ? 'Tên người bán' : 'Tên người mua', v: (r) => r.buyerName },
    { key: 'mst', h: input ? 'Mã số thuế người bán' : 'Mã số thuế người mua', w: 84, center: true, v: (r) => r.buyerTaxCode },
    { key: 'mh', h: 'Mặt hàng', v: itemText },
    ...(s.unitQty ? [
      { key: 'dvt', h: 'ĐVT', w: 44, center: true, v: (r: Line) => r.unit },
      { key: 'sl', h: 'Số lượng', w: 60, num: true, v: (r: Line) => qty(r.qty) },
      { key: 'dg', h: 'Đơn giá', w: 74, num: true, v: (r: Line) => m(r.price) },
    ] as LedgerCol<Line>[] : []),
    { key: 'tien', h: input ? 'Giá trị HHDV mua vào chưa có thuế' : 'Doanh số bán chưa có thuế GTGT', w: 104, num: true, v: (r) => m(r.amount), sum: (r) => r.amount },
    { key: 'ts', h: 'Thuế suất', w: 48, center: true, v: (r) => `${r.taxRate}%` },
    { key: 'thue', h: 'Thuế GTGT', w: 92, num: true, v: (r) => m(r.tax), sum: (r) => r.tax },
    { key: 'tk', h: 'Tài khoản thuế', w: 58, center: true, v: (r) => r.taxAccount },
  ];
  const info: Row[] = s.branchCodes ? [['Chi nhánh', s.branchCodes.split(',').join(', ')]] : [];
  return (
    <LedgerForm ctx={ctx} d={{
      title: input ? 'BẢNG KÊ HÓA ĐƠN, CHỨNG TỪ HÀNG HÓA, DỊCH VỤ MUA VÀO (MẪU QUẢN TRỊ)' : 'BẢNG KÊ HÓA ĐƠN, CHỨNG TỪ HÀNG HÓA, DỊCH VỤ BÁN RA (MẪU QUẢN TRỊ)',
      from: s.from, to: s.to, info, cols, rows: lines(s, input), total: false,
      groupBy: { key: (r) => r.key, label: (_, rs) => rs[0]?.label ?? '', subtotal: 'Cộng nhóm' },
      after: [{ label: 'Tổng cộng', cells: { tien: m(t.amount), thue: m(t.tax) } }],
    }} />
  );
}

const TAX_SIGNS = [
  { title: 'Nhân viên đại lý thuế', note: 'Họ và tên: .................... Chứng chỉ hành nghề số: ....................' },
  { title: 'Người nộp thuế hoặc đại diện hợp pháp của người nộp thuế', note: '(Ký, ghi rõ họ tên, chức vụ và đóng dấu (nếu có))' },
];

function phuLuc(s: TaxInvoiceSheet, ctx: PrintCtx) {
  const input = s.direction === 'input';
  const t = tong(s);
  // (*) bán ra: doanh thu chịu thuế = nhóm 2, 3, 4 (bỏ nhóm 1 không chịu thuế R-K).
  const taxable = input ? t.amount : t.gs.filter((g) => g.group !== 'R-K').reduce((a, g) => a + cents(g.amount), 0) / 100;
  const nhom = input ? 'Hoá đơn, chứng từ, biên lai nộp thuế' : 'Hoá đơn, chứng từ bán ra';
  const cols: LedgerCol<Line>[] = [
    { key: 'stt', h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
    { key: 'so', h: 'Số hoá đơn', group: nhom, w: 70, center: true, v: (r) => r.invoiceNo },
    { key: 'ngay', h: 'Ngày, tháng, năm lập hoá đơn', group: nhom, w: 68, center: true, v: (r) => date(r.invoiceDate) },
    { key: 'ten', h: input ? 'Tên người bán' : 'Tên người mua', v: (r) => r.buyerName },
    { key: 'mst', h: input ? 'Mã số thuế người bán' : 'Mã số thuế người mua', w: 90, center: true, v: (r) => r.buyerTaxCode },
    { key: 'tien', h: input ? 'Giá trị HHDV mua vào chưa có thuế' : 'Doanh thu chưa có thuế GTGT', w: 110, num: true, v: (r) => m(r.amount), sum: (r) => r.amount },
    { key: 'thue', h: input ? 'Thuế GTGT đủ điều kiện khấu trừ thuế' : 'Thuế GTGT', w: 100, num: true, v: (r) => m(r.tax), sum: (r) => r.tax },
    { key: 'gc', h: 'Ghi chú', w: 90, v: () => '' },
  ];
  return (
    <LedgerForm ctx={ctx} d={{
      title: input ? 'BẢNG KÊ HOÁ ĐƠN, CHỨNG TỪ HÀNG HOÁ, DỊCH VỤ MUA VÀO' : 'BẢNG KÊ HOÁ ĐƠN, CHỨNG TỪ HÀNG HOÁ, DỊCH VỤ BÁN RA',
      form: input ? 'Mẫu số 01-2/GTGT' : 'Mẫu số 01-1/GTGT', formNote: '',
      from: s.from, to: s.to, info: [['Đơn vị tiền', 'đồng Việt Nam']], cols, rows: lines(s, input), signs: TAX_SIGNS, total: false,
      groupBy: { key: (r) => r.key, label: (_, rs) => rs[0]?.label.replace(/^.*Nhóm HHDV( mua vào)?: /, '') ?? '', subtotal: 'Tổng' },
      after: [{ label: 'Tổng cộng', cells: { tien: m(t.amount), thue: m(t.tax) } }],
      note: (
        <>
          <div>Tổng {input ? 'giá trị hàng hoá, dịch vụ mua vào' : 'doanh thu hàng hoá, dịch vụ bán ra chịu thuế GTGT'} (*): <b>{m(taxable)}</b> đồng</div>
          <div>Tổng số thuế GTGT {input ? 'của hàng hoá, dịch vụ mua vào' : 'của hàng hoá, dịch vụ bán ra'} (**): <b>{m(t.tax)}</b> đồng</div>
          <div>Tôi cam đoan số liệu khai trên là đúng và chịu trách nhiệm trước pháp luật về những số liệu đã khai.</div>
        </>
      ),
    }} />
  );
}

/** Mẫu của ACC65 (output) hoặc ACC64 (input). */
export function taxInvoiceTemplates(direction: 'output' | 'input'): PrintTemplate<TaxInvoiceSheet>[] {
  const input = direction === 'input';
  return [
    { id: 'qt', name: 'Bảng kê (mẫu quản trị)', paper: 'A4L', render: quanTri },
    { id: input ? 'bk012' : 'bk011', name: input ? 'Phụ lục bảng kê mua vào 01-2/GTGT' : 'Phụ lục bảng kê bán ra 01-1/GTGT', paper: 'A4L', render: phuLuc },
    screenTemplate<TaxInvoiceSheet>(),
  ];
}
