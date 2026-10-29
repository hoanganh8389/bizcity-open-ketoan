/**
 * MẪU IN bảng kê hoá đơn thuế GTGT (SalesInvoicesPage.tsx), A4 ngang, nhóm theo thuế suất như màn, mỗi nhóm có dòng "Tổng":
 *   ACC65  Bảng kê hoá đơn, chứng từ HHDV bán ra 01-1/GTGT (rdlcBaoCaoThueRa.rdlc)
 *   ACC64  Bảng kê hoá đơn, chứng từ HHDV mua vào 01-2/GTGT (rdlcBaoCaoThueVao.rdlc)
 * Hoá đơn không thuộc nhóm kê khai nào (nhóm không tên) vẫn in ở đầu bảng, có dòng cộng riêng nhưng không cộng vào dòng "Tổng cộng".
 * (RDLC_VATBangKe*.rdlc của HTsoft là bảng kê chi tiết đi kèm một hoá đơn GTGT, không phải bảng kê thuế này.)
 */
import { date } from '@/lib/format';
import { LedgerForm, m, screenTemplate, type LedgerCol, type PrintCtx, type PrintTemplate, type Row } from '@/components/print';

export interface TaxInvoicePrintRow { invoiceForm: string; invoiceSerial: string; invoiceNo: string; invoiceDate: string; docNo: string; docDate: string; buyerName: string; buyerTaxCode: string; taxRate: number; amount: number; tax: number }
/** groups: các nhóm thuế suất đang xem (đã lọc "Loại thuế" trên màn); dòng "Tổng cộng" cộng lại từ các nhóm được cộng đang in. */
export interface TaxInvoiceSheet {
  direction: 'output' | 'input'; from: string; to: string; branchCodes: string;
  groups: { group: string; label: string; rows: TaxInvoicePrintRow[]; amount: number; tax: number; counted: boolean }[];
}
type Line = TaxInvoicePrintRow & { group: string; label: string };

const TAX_SIGNS = [
  { title: 'Nhân viên đại lý thuế', note: 'Họ và tên: .................... Chứng chỉ hành nghề số: ....................' },
  { title: 'Người nộp thuế hoặc đại diện hợp pháp của người nộp thuế', note: '(Ký, ghi rõ họ tên, chức vụ và đóng dấu (nếu có))' },
];

function render(s: TaxInvoiceSheet, ctx: PrintCtx) {
  const input = s.direction === 'input';
  const rows: Line[] = s.groups.flatMap((g) => g.rows.map((r) => ({ ...r, group: g.group, label: g.label })));
  // Cộng theo xu như máy chủ để tránh sai số dấu phẩy động.
  const counted = s.groups.filter((g) => g.counted);
  const sum = (gs: typeof counted, k: 'amount' | 'tax') => gs.reduce((a, g) => a + Math.round(g[k] * 100), 0) / 100;
  const total = { amount: sum(counted, 'amount'), tax: sum(counted, 'tax') };
  // (*) bán ra: doanh thu chịu thuế = nhóm 2, 3, 4 (bỏ nhóm 1 không chịu thuế R-K).
  const taxable = input ? total.amount : sum(counted.filter((g) => g.group !== 'R-K'), 'amount');
  const invoiceCols: LedgerCol<Line>[] = [
    { key: 'stt', h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
    { key: 'mau', h: 'Mẫu số', group: input ? 'Hoá đơn, chứng từ, biên lai nộp thuế' : 'Hoá đơn, chứng từ bán ra', w: 70, center: true, v: (r) => r.invoiceForm },
    { key: 'kh', h: 'Ký hiệu', group: input ? 'Hoá đơn, chứng từ, biên lai nộp thuế' : 'Hoá đơn, chứng từ bán ra', w: 70, center: true, v: (r) => r.invoiceSerial },
    { key: 'so', h: 'Số hoá đơn', group: input ? 'Hoá đơn, chứng từ, biên lai nộp thuế' : 'Hoá đơn, chứng từ bán ra', w: 70, center: true, v: (r) => r.invoiceNo },
    { key: 'ngay', h: 'Ngày, tháng, năm lập hoá đơn', group: input ? 'Hoá đơn, chứng từ, biên lai nộp thuế' : 'Hoá đơn, chứng từ bán ra', w: 68, center: true, v: (r) => date(r.invoiceDate) },
    { key: 'ten', h: input ? 'Tên người bán' : 'Tên người mua', v: (r) => r.buyerName },
    { key: 'mst', h: input ? 'Mã số thuế người bán' : 'Mã số thuế người mua', w: 90, center: true, v: (r) => r.buyerTaxCode },
    { key: 'tien', h: input ? 'Giá trị HHDV mua vào chưa có thuế' : 'Doanh thu chưa có thuế GTGT', w: 110, num: true, v: (r) => m(r.amount), sum: (r) => r.amount },
  ];
  const cols: LedgerCol<Line>[] = input ? [
    ...invoiceCols,
    { key: 'ts', h: 'Thuế suất', w: 46, center: true, v: (r) => `${r.taxRate}%` },
    { key: 'thue', h: 'Thuế GTGT đủ điều kiện khấu trừ thuế', w: 100, num: true, v: (r) => m(r.tax), sum: (r) => r.tax },
    { key: 'sct', h: 'Số chứng từ', w: 90, v: (r) => r.docNo },
    { key: 'nct', h: 'Ngày chứng từ', w: 64, center: true, v: (r) => date(r.docDate) },
  ] : [
    ...invoiceCols,
    { key: 'thue', h: 'Thuế GTGT', w: 100, num: true, v: (r) => m(r.tax), sum: (r) => r.tax },
    { key: 'gc', h: 'Ghi chú', w: 90, v: (r) => r.docNo },
  ];
  const info: Row[] = [['Đơn vị tiền', 'đồng Việt Nam'], ...(s.branchCodes ? [['Chi nhánh', s.branchCodes.split(',').join(', ')] as Row] : [])];
  return (
    <LedgerForm ctx={ctx} d={{
      title: input ? 'BẢNG KÊ HOÁ ĐƠN, CHỨNG TỪ HÀNG HOÁ, DỊCH VỤ MUA VÀO' : 'BẢNG KÊ HOÁ ĐƠN, CHỨNG TỪ HÀNG HOÁ, DỊCH VỤ BÁN RA',
      // Mẫu bảng kê thuế (không theo chế độ kế toán): không in câu "Ban hành theo…" mặc định.
      form: input ? 'Mẫu số 01-2/GTGT' : 'Mẫu số 01-1/GTGT', formNote: '', branchCode: s.branchCodes && !s.branchCodes.includes(',') ? s.branchCodes : undefined,
      from: s.from, to: s.to, info, cols, rows, signs: TAX_SIGNS, total: false,
      groupBy: { key: (r) => r.group, label: (_, rs) => rs[0]?.label || 'Hoá đơn không thuộc nhóm kê khai (không cộng vào tổng)', subtotal: 'Tổng' },
      after: [{ label: 'Tổng cộng', cells: { tien: m(total.amount), thue: m(total.tax) } }],
      note: (
        <>
          <div>Tổng {input ? 'giá trị hàng hoá, dịch vụ mua vào' : 'doanh thu hàng hoá, dịch vụ bán ra chịu thuế GTGT'} (*): <b>{m(taxable)}</b> đồng</div>
          <div>Tổng số thuế GTGT {input ? 'của hàng hoá, dịch vụ mua vào' : 'của hàng hoá, dịch vụ bán ra'} (**): <b>{m(total.tax)}</b> đồng</div>
          <div>Hàng trả lại, điều chỉnh giảm ghi số âm.</div>
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
    { id: input ? 'bk012' : 'bk011', name: input ? 'Bảng kê HHDV mua vào 01-2/GTGT' : 'Bảng kê HHDV bán ra 01-1/GTGT', paper: 'A4L', source: input ? 'rdlcBaoCaoThueVao.rdlc' : 'rdlcBaoCaoThueRa.rdlc', render },
    screenTemplate<TaxInvoiceSheet>(),
  ];
}
