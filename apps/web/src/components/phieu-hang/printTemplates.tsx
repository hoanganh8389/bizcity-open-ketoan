/**
 * MẪU IN phiếu hàng hoá: Phiếu bán hàng (BH10), Hàng bán trả lại (BH11), Phiếu chuyển kho (KHO01).
 *
 * Bố cục dựng theo tên, trường của mẫu HTsoft (Crystal .rpt, chưa trích được bố cục chi tiết) và mẫu chuẩn TT200:
 *   Phiếu bán hàng     rptBanhoadon.rpt (A4), rptBanhoadonA5.rpt, rptBanhoadonA5_Lien2.rpt, rptBanhoadon8cm.rpt
 *   Phiếu xuất kho     mẫu 02-VT (TT200) — giá xuất để trống cho kế toán ghi giá vốn
 *   Hàng bán trả lại   rptBanhoantra_A4.rpt, rptBanhoantra A5.rpt; Phiếu nhập kho 01-VT (TT200)
 *   Phiếu chuyển kho   rptPhieuchuyenkho.rpt (A4), rptPhieuchuyenkhoM2.rpt (A5); Phiếu xuất kho kiêm vận chuyển nội bộ
 * Khi có bố cục .rpt trích bằng RptToXml thì chỉnh lại từng mẫu cho khớp.
 */
import { TAX_RATES, type TradeDoc, type TradeKind } from '@/lib/tradeDocs';
import { BillForm, Fields, Foot, OrgHead, Signs, StockForm, Table, Title, invoiceText, m, mb, qty, sumQty, words, type BillData, type Col, type PrintCtx, type PrintTemplate, type Row, type StockData } from '@/components/print';

const partnerText = (d: TradeDoc, fallback = 'Khách lẻ') => (d.partner ? `${d.partner.name}${d.partner.code !== d.partner.name ? ` (${d.partner.code})` : ''}` : fallback);
const rate = (code?: string) => (code ? `${TAX_RATES[code] ?? ''}${code in TAX_RATES ? '%' : code}` : '');
const paid = (d: TradeDoc) => (d.payments ?? []).reduce((s, p) => s + p.amount, 0);

/** Bảng hàng có giá: STT, mã, tên, ĐVT, SL, đơn giá, chiết khấu, thành tiền, thuế suất, tiền thuế. */
function priceCols(compact?: boolean): Col<TradeDoc['lines'][number]>[] {
  return [
    { h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
    { h: 'Mã hàng', w: compact ? 70 : 90, v: (l) => l.sku },
    { h: 'Tên hàng hoá, dịch vụ', v: (l) => <>{l.name}{l.isGift ? <i> (hàng tặng)</i> : null}</> },
    { h: 'ĐVT', w: 44, center: true, v: (l) => l.unit },
    { h: 'SL', w: 44, num: true, v: (l) => qty(l.qty) },
    { h: 'Đơn giá', w: 78, num: true, v: (l) => mb(l.unitPrice) },
    ...(compact ? [] : [{ h: 'CK', w: 64, num: true, v: (l: TradeDoc['lines'][number]) => mb(l.discount) }]),
    { h: 'Thành tiền', w: 90, num: true, v: (l) => (l.isGift ? '' : m(l.amountBeforeTax)) },
    { h: 'Thuế', w: 40, center: true, v: (l) => rate(l.taxCode) },
    { h: 'Tiền thuế', w: 74, num: true, v: (l) => mb(l.taxAmount) },
  ];
}

/** Phần cộng + thanh toán của phiếu có tiền. */
function MoneyFoot({ d, back }: { d: TradeDoc; back?: boolean }) {
  const p = paid(d);
  return (
    <>
      <table className="pd-fields" style={{ width: '58%', marginLeft: 'auto' }}>
        <tbody>
          <tr><td>Cộng tiền hàng:</td><td className="pd-right">{m(d.totals.beforeTax)}</td></tr>
          <tr><td>Tiền thuế GTGT:</td><td className="pd-right">{m(d.totals.tax)}</td></tr>
          <tr><td><b>Tổng cộng {back ? 'tiền trả lại' : 'tiền thanh toán'}:</b></td><td className="pd-right"><b>{m(d.totals.total)}</b></td></tr>
          {(d.payments ?? []).map((x, i) => <tr key={i}><td>{back ? 'Đã trả' : 'Đã thu'} ({x.methodCode}{x.reference ? ` · ${x.reference}` : ''}):</td><td className="pd-right">{m(x.amount)}</td></tr>)}
          {d.payments && <tr><td>{back ? 'Còn trừ công nợ' : 'Còn nợ'}:</td><td className="pd-right">{m(Math.max(0, d.totals.total - p))}</td></tr>}
        </tbody>
      </table>
      <div className="pd-words">Số tiền viết bằng chữ: <i>{words(d.totals.total)}</i></div>
    </>
  );
}

/** Phiếu bán hàng / hàng bán trả lại có giá (A4, A5). */
function SaleSheet({ d, ctx, copy, copies, compact }: { d: TradeDoc; ctx: PrintCtx; copy: number; copies?: number; compact?: boolean }) {
  const back = d.docType === 'sale_return';
  return (
    <>
      <OrgHead ctx={ctx} branchCode={d.branchCode} extra={ctx.org.phone ? <div>ĐT: {ctx.org.phone}</div> : undefined} />
      <Title title={back ? 'PHIẾU NHẬP HÀNG BÁN BỊ TRẢ LẠI' : 'PHIẾU BÁN HÀNG'} date={d.docDate} no={d.docNo} copy={copy} copies={copies} />
      <Fields rows={[
        ['Khách hàng', partnerText(d)],
        ...(d.partner?.taxCode ? [['Mã số thuế', d.partner.taxCode] as Row] : []),
        ...(d.invoice ? [['Hoá đơn', invoiceText(d.invoice)] as Row] : []),
        ...(back && d.originalDocNo ? [['Phiếu bán gốc', d.originalDocNo] as Row] : []),
        ...(d.note ? [['Ghi chú', d.note] as Row] : []),
      ]} />
      <Table compact={compact} rows={d.lines} cols={priceCols(compact)} />
      <MoneyFoot d={d} back={back} />
      <Signs date={d.docDate} items={back
        ? [{ title: 'Khách hàng' }, { title: 'Người nhận hàng' }, { title: 'Thủ kho' }, { title: 'Kế toán' }]
        : [{ title: 'Người mua hàng' }, { title: 'Người bán hàng' }, { title: 'Thủ kho' }, { title: 'Thủ trưởng đơn vị', note: '(Ký, họ tên, đóng dấu)' }]} />
      <Foot ctx={ctx} />
    </>
  );
}

/** Hoá đơn bán lẻ / phiếu trả hàng giấy cuộn 80mm (mẫu chung BillForm). */
function billData(d: TradeDoc): BillData {
  const p = paid(d);
  return {
    branchCode: d.branchCode, title: d.docType === 'sale_return' ? 'PHIẾU TRẢ HÀNG' : 'HOÁ ĐƠN BÁN LẺ', docNo: d.docNo, date: d.docDate,
    info: [`KH: ${partnerText(d)}`],
    lines: d.lines.map((l) => ({ name: `${l.name}${l.isGift ? ' (tặng)' : ''}`, sub: `${qty(l.qty)} ${l.unit} × ${mb(l.unitPrice)}`, amount: l.isGift ? 0 : l.amountBeforeTax + (l.taxAmount ?? 0) })),
    totals: [
      ['TỔNG CỘNG', d.totals.total, true], ['Trong đó thuế GTGT', d.totals.tax],
      ...(d.payments ?? []).map((x): [string, number] => [x.methodCode, x.amount]),
      ...(d.payments && d.totals.total - p > 0 ? [['Còn nợ', d.totals.total - p] as [string, number]] : []),
    ],
    footer: <div className="pd-center pd-note" style={{ marginTop: 6 }}>Cảm ơn quý khách!</div>,
  };
}

/** Phiếu xuất kho 02-VT (bán hàng) / nhập kho 01-VT (hàng bán trả lại): giá để trống cho kế toán ghi giá vốn. */
const stockData = (d: TradeDoc, ctx: PrintCtx): StockData => {
  const out = d.docType === 'sale';
  return {
    dir: out ? 'out' : 'in', branchCode: d.branchCode, docNo: d.docNo, date: d.docDate, person: partnerText(d, ''), price: 'blank',
    reason: out ? `Bán hàng theo phiếu ${d.docNo}` : `Hàng bán bị trả lại${d.originalDocNo ? `, phiếu bán gốc ${d.originalDocNo}` : ''}${d.invoice ? `, hoá đơn ${invoiceText(d.invoice)}` : ''}`,
    warehouse: `${ctx.branchName(d.branchCode)} — kho ${ctx.kho(d.branchCode, d.warehouseCode)}`, attach: d.invoice ? `Hoá đơn ${invoiceText(d.invoice)}` : '',
    lines: d.lines.map((l) => ({ sku: l.sku, name: l.name, unit: l.unit, qty: l.qty })),
  };
};

/** Phiếu chuyển kho / phiếu xuất kho kiêm vận chuyển nội bộ. */
function TransferSheet({ d, ctx, internal, compact }: { d: TradeDoc; ctx: PrintCtx; internal?: boolean; compact?: boolean }) {
  return (
    <>
      <OrgHead ctx={ctx} branchCode={d.branchCode} form={internal ? 'Mẫu số 03XKNB' : undefined} formNote={internal ? '' : undefined} />
      <Title title={internal ? 'PHIẾU XUẤT KHO KIÊM VẬN CHUYỂN NỘI BỘ' : 'PHIẾU CHUYỂN KHO'} date={d.docDate} no={d.docNo} />
      <Fields rows={[
        ['Xuất tại (chi nhánh / kho)', <><b>{ctx.branchName(d.branchCode)}</b> — kho <b>{ctx.kho(d.branchCode, d.warehouseCode)}</b></>],
        ['Nhập tại (chi nhánh / kho)', <><b>{ctx.branchName(d.toBranchCode)}</b> — kho <b>{ctx.kho(d.toBranchCode, d.toWarehouseCode)}</b></>],
        ...(internal ? [['Lệnh điều động số', '..................... ngày .....................'] as Row, ['Họ tên người vận chuyển', ''] as Row, ['Phương tiện vận chuyển', ''] as Row] : []),
        ...(d.note ? [['Ghi chú', d.note] as Row] : []),
      ]} />
      <Table compact={compact} rows={d.lines} minRows={compact ? 0 : 3} cols={[
        { h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
        { h: 'Mã hàng', w: 90, v: (l) => l.sku },
        { h: 'Tên hàng hoá', v: (l) => l.name },
        { h: 'ĐVT', w: 44, center: true, v: (l) => l.unit },
        { h: 'SL xuất', w: 60, num: true, v: (l) => qty(l.qty) },
        { h: 'SL nhận', w: 60, num: true, v: () => '' },
        { h: 'Ghi chú', w: compact ? 80 : 120, v: () => '' },
      ]} foot={<tr><td colSpan={4} className="c">Cộng</td><td className="num">{qty(sumQty(d.lines))}</td><td /><td /></tr>} />
      <Signs date={d.docDate} items={internal
        ? [{ title: 'Người lập phiếu' }, { title: 'Thủ kho xuất' }, { title: 'Người vận chuyển' }, { title: 'Thủ kho nhập' }]
        : [{ title: 'Người lập phiếu' }, { title: 'Thủ kho xuất' }, { title: 'Người vận chuyển' }, { title: 'Thủ kho nhập' }, { title: 'Kế toán' }]} />
      <Foot ctx={ctx} />
    </>
  );
}

type T = PrintTemplate<TradeDoc>;
/** Các mẫu in theo loại phiếu; mẫu đầu là mặc định khi người dùng chưa chọn. */
export const TRADE_TEMPLATES: Partial<Record<TradeKind, T[]>> = {
  sale: [
    { id: 'a4', name: 'Phiếu bán hàng A4', paper: 'A4', source: 'rptBanhoadon.rpt', render: (d, c) => <SaleSheet d={d} ctx={c} copy={c.copy} /> },
    { id: 'a5', name: 'Phiếu bán hàng A5 ngang', paper: 'A5L', source: 'rptBanhoadonA5.rpt', render: (d, c) => <SaleSheet d={d} ctx={c} copy={c.copy} compact /> },
    { id: 'a5-2', name: 'Phiếu bán hàng A5 — 2 liên', paper: 'A5L', copies: 2, source: 'rptBanhoadonA5_Lien2.rpt', render: (d, c) => <SaleSheet d={d} ctx={c} copy={c.copy} copies={2} compact /> },
    { id: 'bill', name: 'Hoá đơn bán lẻ giấy cuộn 80mm', paper: 'roll80', source: 'rptBanhoadon8cm.rpt', render: (d, c) => <BillForm b={billData(d)} ctx={c} /> },
    { id: 'pxk', name: 'Phiếu xuất kho 02-VT', paper: 'A4', source: 'mẫu chuẩn', render: (d, c) => <StockForm s={stockData(d, c)} ctx={c} /> },
  ],
  sale_return: [
    { id: 'a4', name: 'Phiếu nhập hàng bán trả lại A4', paper: 'A4', source: 'rptBanhoantra_A4.rpt', render: (d, c) => <SaleSheet d={d} ctx={c} copy={c.copy} /> },
    { id: 'a5', name: 'Phiếu nhập hàng bán trả lại A5 ngang', paper: 'A5L', source: 'rptBanhoantra A5.rpt', render: (d, c) => <SaleSheet d={d} ctx={c} copy={c.copy} compact /> },
    { id: 'bill', name: 'Phiếu trả hàng giấy cuộn 80mm', paper: 'roll80', source: 'rptBanhoantra.rpt', render: (d, c) => <BillForm b={billData(d)} ctx={c} /> },
    { id: 'pnk', name: 'Phiếu nhập kho 01-VT', paper: 'A4', source: 'mẫu chuẩn', render: (d, c) => <StockForm s={stockData(d, c)} ctx={c} /> },
  ],
  transfer: [
    { id: 'a4', name: 'Phiếu chuyển kho A4', paper: 'A4', source: 'rptPhieuchuyenkho.rpt', render: (d, c) => <TransferSheet d={d} ctx={c} /> },
    { id: 'a5', name: 'Phiếu chuyển kho A5 ngang', paper: 'A5L', source: 'rptPhieuchuyenkhoM2.rpt', render: (d, c) => <TransferSheet d={d} ctx={c} compact /> },
    { id: 'vcnb', name: 'Phiếu xuất kho kiêm vận chuyển nội bộ', paper: 'A4', source: 'mẫu 03XKNB', render: (d, c) => <TransferSheet d={d} ctx={c} internal /> },
  ],
};
