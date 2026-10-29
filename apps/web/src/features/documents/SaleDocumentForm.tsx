/**
 * Form xem chứng từ gốc có dòng hàng — một form cho mọi loại: Hóa đơn bán lẻ, Hàng bán trả lại, Phiếu nhập mua,
 * Phiếu trả hàng nhà cung cấp, Phiếu chuyển kho, Phiếu điều chỉnh (xuất điều chỉnh đi như hoá đơn bán có lý do).
 * Cùng bố cục; chỉ đổi nhãn, cột theo loại phiếu (nhãn cột theo lưới phiếu nhập / trả hàng / chuyển kho quen dùng).
 * Hoá đơn bán lẻ / hàng bán trả lại xếp như form bán hàng quen thuộc của kế toán:
 *   trên   : Lý do xuất (nhập lại), Kho; khung Tùy chọn (Số phiếu, Ngày, Hình thức TT, Hạn TT, Ca làm việc, Loại tiền…);
 *            thẻ "Phiếu xuất | Thuế" (hàng bán trả lại: "Phiếu nhập trả | Thuế"); thẻ Thuế: thông tin hoá đơn;
 *   giữa   : Chi tiết hóa đơn (thẻ "Đối trừ phiếu hoàn" / "Đối trừ cho phiếu bán" chỉ hiện khi có đối trừ đổi trả), góc phải "Đã thanh toán";
 *   dưới   : Thông tin khách hàng, Nhân viên, Ghi chú, Tổng cộng (Tiền hàng, Thuế, Chiết khấu, Tổng tiền).
 * Chỉ để xem: chứng từ do hệ thống bán hàng gửi sang, sửa ở bên bán hàng rồi gửi lại.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { date, money } from '@/lib/format';
import { DataGrid, type Column } from '@/components/DataGrid';
import { Field, FormGrid, FormTabs, GroupBox } from '@/components/FormBlocks';

interface Line {
  lineKey: string; sku: string; name: string; unit: string; qty: number; unitQty?: number; unitRatio?: number; unitPrice: number; amountBeforeTax: number; discount: number;
  taxCode: string; taxAmount: number; warehouseCode?: string; isGift: boolean; lotNo?: string; expDate?: string; note?: string; cost?: number;
}
interface Named { code: string; name: string }
/** Dòng phiếu kho (chuyển kho, điều chỉnh): giá trị theo giá vốn, 0 khi chưa tính giá vốn. */
interface StockLine { lineKey: string; sku: string; name: string; unit: string; qty: number; amount: number; warehouseCode?: string; lotNo?: string; expDate?: string; note?: string }
export type FormDocType = 'sale' | 'sale_return' | 'purchase' | 'purchase_return' | 'transfer' | 'stock_adjustment';
export const FORM_DOC_TYPES: string[] = ['sale', 'sale_return', 'purchase', 'purchase_return', 'transfer', 'stock_adjustment'];
/** Nhãn thẻ đầu phiếu và nhãn lý do theo loại phiếu. */
const MAIN_TAB: Record<FormDocType, string> = { sale: 'Phiếu xuất', sale_return: 'Phiếu nhập trả', purchase: 'Phiếu nhập', purchase_return: 'Phiếu xuất trả', transfer: 'Phiếu chuyển kho', stock_adjustment: 'Phiếu điều chỉnh' };
const REASON_LABEL: Record<FormDocType, string> = { sale: 'Lý do xuất', sale_return: 'Lý do nhập lại', purchase: 'Lý do nhập', purchase_return: 'Lý do xuất trả', transfer: 'Lý do chuyển', stock_adjustment: 'Lý do điều chỉnh' };

/** Số lượng theo ĐVT bán; chứng từ cũ chưa có unitQty thì suy từ số quy đổi và tỉ lệ. */
const qtyOf = (l: Line) => l.unitQty ?? (l.unitRatio ? l.qty / l.unitRatio : l.qty);

/**
 * Hai kiểu xem dòng hàng:
 *   'retail' (mặc định, quen thuộc) — Đơn giá bán cho khách (đã gồm thuế, trước chiết khấu), CK, Thành tiền khách trả;
 *            không có cột thuế. SL × Đơn giá − CK = Thành tiền.
 *   'tax'    — theo hoá đơn gửi thuế: Đơn giá sau chiết khấu, trước thuế; Thuế(%), Thuế VND; Thành tiền trước thuế; không có CK.
 * Chỉ khác cách hiển thị — số tiền hạch toán luôn là tiền trước thuế (đã trừ chiết khấu) + tiền thuế của từng dòng.
 */
type ViewMode = 'retail' | 'tax';
const VIEW_KEY = 'sale-form-view';
const readView = (): ViewMode => { try { return localStorage.getItem(VIEW_KEY) === 'tax' ? 'tax' : 'retail'; } catch { return 'retail'; } };
/** Thành tiền khách trả của dòng (gồm thuế, đã trừ chiết khấu). */
const grossOf = (l: Line) => l.amountBeforeTax + l.taxAmount;
/** Đơn giá bán cho khách (làm tròn đồng) = (tiền khách trả + chiết khấu) ÷ SL. */
const salePriceOf = (l: Line) => (qtyOf(l) ? Math.round((grossOf(l) + (l.discount ?? 0)) / qtyOf(l)) : 0);
/** CK hiển thị = SL × Đơn giá − Thành tiền, để cột khớp nhau (chiết khấu nguồn có thể lệch 1đ do làm tròn thuế). */
const saleDiscountOf = (l: Line) => (l.discount ? Math.max(0, Math.round(salePriceOf(l) * qtyOf(l) - grossOf(l))) : 0);
interface Reason extends Named { flags?: Record<string, unknown> | null }

export interface LinkedPayment { id: string; docNo: string; docDate: string; methodCode: string; amount: number; direction: string; status: string }
export interface Offset { docKey: string; docNo: string | null; amount: number; id?: string; docDate?: string; status?: string }
/** Phiếu hoàn: phiếu bán đổi trả đã đối trừ vào phiếu hoàn này. */
export interface OffsetBy { id: string; docNo: string; docDate: string; amount: number; status: string }
interface HistoryRow { id?: string; docNo: string; docDate: string; kind: string; method: string; amount: number; status: string }
const STATUS_TEXT: Record<string, string> = { posted: 'Đã định khoản', pending: 'Chờ định khoản', error: 'Lỗi định khoản', cancelled: 'Đã huỷ' };

export function SaleDocumentForm({ docType, docNo, docDate, branch, p, linkedPayments = [], offsets: offsetList = [], offsetBy = [], onOpenDoc, valueBySku }: {
  docType: FormDocType; docNo: string; docDate: string; branch: Named | null; p: any; linkedPayments?: LinkedPayment[]; offsets?: Offset[]; offsetBy?: OffsetBy[]; onOpenDoc?: (id: string) => void;
  /** Phiếu kho: giá trị theo mặt hàng đã ghi sổ (sau tính giá vốn), dùng khi dòng phiếu chưa có giá trị. */
  valueBySku?: Map<string, number>;
}) {
  const isReturn = docType === 'sale_return';
  const isSale = docType === 'sale' || docType === 'sale_return';
  const isTrade = docType === 'purchase' || docType === 'purchase_return';
  const isStock = docType === 'transfer' || docType === 'stock_adjustment';
  const [headTab, setHeadTab] = useState<'main' | 'tax'>('main');
  const [midTab, setMidTab] = useState<'lines' | 'offset' | 'history'>('lines');
  const [view, setViewState] = useState<ViewMode>(readView);
  const setView = (v: ViewMode) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* bỏ qua */ } };
  const taxes = useQuery({ queryKey: ['tax-codes'], queryFn: () => api.get<{ code: string; rate: number }[]>('/api/v1/tax-codes'), staleTime: 60_000 }).data ?? [];
  const reasons = useQuery({ queryKey: ['reasons'], queryFn: () => api.get<Reason[]>('/api/v1/posting/reasons'), staleTime: 60_000 }).data ?? [];
  const methods = useQuery({ queryKey: ['payment-methods'], queryFn: () => api.get<Named[]>('/api/v1/posting/payment-methods'), staleTime: 60_000 }).data ?? [];
  const rateOf = (code: string) => taxes.find((t) => t.code === code)?.rate;
  // Chứng từ không ghi lý do thì hạch toán theo lý do mặc định của loại chứng từ (ví dụ XBA): hiện đúng lý do đó.
  const defaultKey = docType === 'stock_adjustment' ? `stock_adjustment:${p.direction === 'increase' ? 'increase' : 'decrease'}` : docType;
  const reason = p.reasonCode ? reasons.find((r) => r.code === p.reasonCode) : reasons.find((r) => r.flags?.default === defaultKey);
  const reasonCode = p.reasonCode ?? reason?.code;
  const methodName = (code: string) => methods.find((m) => m.code === code)?.name ?? code;

  const lines = (p.lines ?? []) as Line[];
  // Phiếu kho: giá trị dòng = giá trị trên phiếu; chưa có (0) thì lấy phần đã ghi sổ sau tính giá vốn, chia theo số lượng.
  const stockLines = (p.lines ?? []) as StockLine[];
  const skuQty = new Map<string, number>();
  for (const l of stockLines) skuQty.set(l.sku, (skuQty.get(l.sku) ?? 0) + Math.abs(l.qty));
  const stockValue = (l: StockLine) => (l.amount ? Math.abs(l.amount) : Math.round((valueBySku?.get(l.sku) ?? 0) * (skuQty.get(l.sku) ? Math.abs(l.qty) / skuQty.get(l.sku)! : 0)));
  const stockSignedQty = (l: StockLine) => (docType === 'stock_adjustment' && p.direction === 'decrease' ? -Math.abs(l.qty) : l.qty);
  const stockTotal = stockLines.reduce((s, l) => s + stockValue(l), 0);
  // Tiền đã thanh toán: kèm trong phiếu (chứng từ gửi kiểu cũ) + các phiếu thanh toán khách hàng trỏ về phiếu này
  // + phần đối trừ đổi trả (như cột Đã thanh toán / Đối trừ của hoá đơn bên phần mềm bán hàng).
  const payments = [
    ...((p.payments ?? []) as { methodCode: string; amount: number; reference?: string }[]),
    ...linkedPayments.map((x) => ({ methodCode: x.methodCode, amount: x.amount, reference: x.docNo })),
  ];
  const saleDiscount = lines.reduce((s, l) => s + saleDiscountOf(l), 0);
  const beforeTax = Number(p.totals?.beforeTax ?? lines.reduce((s, l) => s + l.amountBeforeTax, 0));
  const tax = Number(p.totals?.tax ?? lines.reduce((s, l) => s + l.taxAmount, 0));
  const total = Number(p.totals?.total ?? beforeTax + tax);
  const offsets = [
    ...payments.filter((x) => x.methodCode === 'DOI_TRU'),
    ...offsetList.map((o) => ({ methodCode: 'DOITRU', amount: o.amount, reference: o.docNo ?? o.docKey })),
  ];
  const paid = payments.filter((x) => x.methodCode !== 'DOI_TRU').reduce((s, x) => s + Math.abs(x.amount), 0) + offsets.reduce((s, x) => s + Math.abs(x.amount), 0);
  /** Dòng thẻ đối trừ: phiếu bán — phiếu hoàn đã đối trừ vào (kể cả đối trừ kèm phiếu kiểu cũ); phiếu hoàn — phiếu bán được đối trừ cho. */
  const offsetRows: { id?: string; docNo: string; docDate: string; amount: number; status: string }[] = isReturn
    ? offsetBy.map((o) => ({ id: o.id, docNo: o.docNo, docDate: o.docDate, amount: Math.abs(o.amount), status: o.status }))
    : [
        ...payments.filter((x) => x.methodCode === 'DOI_TRU').map((x) => ({ docNo: x.reference ?? '', docDate, amount: Math.abs(x.amount), status: '' })),
        ...offsetList.map((o) => ({ id: o.id, docNo: o.docNo ?? o.docKey, docDate: o.docDate ?? '', amount: Math.abs(o.amount), status: o.status ?? '' })),
      ];
  const methodsText = payments.map((x) => x.methodCode).join(', ');
  const inv = p.invoice;
  const partner = p.partner ?? {};
  // Mã khách là số điện thoại di động của khách.
  const mobile = partner.phone ?? (/^\d{9,12}$/.test(partner.code ?? '') ? partner.code : '');

  const head = (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) minmax(0, 2.4fr)', gap: 8, paddingTop: 4 }}>
      <div style={{ display: 'grid', gap: 4, alignContent: 'start', paddingTop: 8 }}>
        <Field label={REASON_LABEL[docType]}>{reasonCode ? `${reasonCode}${reason ? ` — ${reason.name}` : ''}` : ''}</Field>
        {docType === 'transfer' ? (
          <>
            <Field label="Kho xuất">{p.leg === 'in' ? (p.fromBranchCode ?? '') : branch ? `${branch.code} — ${branch.name}` : ''}</Field>
            <Field label="Kho nhập">{p.leg === 'in' ? (branch ? `${branch.code} — ${branch.name}` : '') : (p.toBranchCode ?? '')}</Field>
          </>
        ) : <Field label="Kho (F6)">{branch ? `${branch.code} — ${branch.name}` : ''}</Field>}
      </div>
      <GroupBox title="Tùy chọn">
        <FormGrid cols={2}>
          {isTrade ? (
            <>
              <Field label={docType === 'purchase' ? 'Số phiếu nhập' : 'Số phiếu xuất'}><span className="mono">{docNo}</span></Field>
              <Field label="Hình thức TT">{methodsText}</Field>
              <Field label={docType === 'purchase' ? 'Ngày nhập' : 'Ngày xuất'}>{date(docDate)}</Field>
              <Field label="Hạn TT">{p.dueDate ? date(p.dueDate) : ''}</Field>
              <Field label="Số hoá đơn"><span className="mono">{inv?.no ?? ''}</span></Field>
              <Field label="Ký hiệu">{inv?.serial ?? ''}</Field>
              <Field label="Loại tiền">VND</Field>
              <Field label="Ngày hoá đơn">{inv?.date ? date(inv.date) : ''}</Field>
            </>
          ) : docType === 'transfer' ? (
            <>
              <Field label="Số phiếu"><span className="mono">{docNo}</span></Field>
              <Field label="Trạng thái">{p.status === 'shipped' ? 'Đang chuyển' : 'Đã nhận'}</Field>
              <Field label="Ngày">{date(docDate)}</Field>
              <Field label="Loại phiếu">{p.leg === 'out' ? 'Xuất nội bộ' : p.leg === 'in' ? 'Nhận nội bộ' : 'Xuất và nhận'}</Field>
              <Field label="Loại tiền">VND</Field>
            </>
          ) : docType === 'stock_adjustment' ? (
            <>
              <Field label="Số phiếu"><span className="mono">{docNo}</span></Field>
              <Field label="Kiểu điều chỉnh">{p.direction === 'increase' ? 'Tăng' : p.direction === 'decrease' ? 'Giảm' : 'Tăng / giảm theo từng dòng'}</Field>
              <Field label="Ngày">{date(docDate)}</Field>
              <Field label="Loại tiền">VND</Field>
            </>
          ) : isReturn ? (
            <>
              <Field label="Số phiếu"><span className="mono">{docNo}</span></Field>
              <Field label="Hình thức TT">{methodsText}</Field>
              <Field label="Ngày trả">{date(docDate)}</Field>
              <Field label="Hạn TT">{p.dueDate ? date(p.dueDate) : ''}</Field>
              <Field label="Số phiếu xuất"><span className="mono">{p.originalDocNo ?? ''}</span></Field>
              <Field label="Ca làm việc">{p.extra?.shift ?? ''}</Field>
              <Field label="Loại tiền">VND</Field>
              <Field label="Tại ngân hàng">{payments.find((x) => x.reference)?.reference ?? ''}</Field>
            </>
          ) : (
            <>
              <Field label="Số phiếu xuất"><span className="mono">{docNo}</span></Field>
              <Field label="Hình thức TT">{methodsText}</Field>
              <Field label="Ngày xuất">{date(docDate)}</Field>
              <Field label="Hình thức GH">{p.extra?.delivery ?? ''}</Field>
              <Field label="Ca làm việc">{p.extra?.shift ?? ''}</Field>
              <Field label="Hạn TT">{p.dueDate ? date(p.dueDate) : ''}</Field>
              <Field label="Loại tiền">VND</Field>
              <Field label="Số hợp đồng">{p.contractNo ?? p.extra?.contractNo ?? ''}</Field>
            </>
          )}
        </FormGrid>
      </GroupBox>
    </div>
  );

  const taxHead = (
    <GroupBox style={{ marginTop: 4 }}>
      <FormGrid cols={3}>
        <Field label="Mẫu số">{inv?.form ?? ''}</Field>
        <Field label="Ký hiệu">{inv?.serial ?? ''}</Field>
        <Field label="Số hoá đơn"><span className="mono">{inv?.no ?? ''}</span></Field>
        <Field label="Ngày hoá đơn">{inv?.date ? date(inv.date) : ''}</Field>
        <Field label="MST người mua">{inv?.buyerTaxCode ?? partner.taxCode ?? ''}</Field>
        <Field label="Mã tra cứu">{inv?.lookupCode ?? ''}</Field>
        <Field label="Tên người mua" span={2}>{inv?.buyerName ?? ''}</Field>
        <Field label="Đơn vị">{inv?.buyerLegalName ?? ''}</Field>
        <Field label="Địa chỉ" span={3}>{inv?.buyerAddress ?? ''}</Field>
      </FormGrid>
    </GroupBox>
  );

  // Lịch sử thanh toán của phiếu: phiếu thu / chi trả khách trỏ về phiếu, thanh toán kèm phiếu, đối trừ đổi trả. Bấm số phiếu để mở.
  const history: HistoryRow[] = [
    ...((p.payments ?? []) as { methodCode: string; amount: number; reference?: string }[]).map((x) => ({ docNo: x.reference ?? '', docDate, kind: 'Thanh toán kèm phiếu', method: methodName(x.methodCode), amount: Math.abs(x.amount), status: '' })),
    ...linkedPayments.map((x) => ({ id: x.id, docNo: x.docNo, docDate: x.docDate, kind: x.direction === 'out' ? 'Phiếu chi trả khách' : 'Phiếu thu', method: methodName(x.methodCode), amount: Math.abs(x.amount), status: x.status })),
    ...offsetList.map((o) => ({ id: o.id, docNo: o.docNo ?? o.docKey, docDate: o.docDate ?? '', kind: 'Đối trừ phiếu hoàn', method: 'Đối trừ hàng bán trả lại', amount: Math.abs(o.amount), status: o.status ?? '' })),
    ...offsetBy.map((o) => ({ id: o.id, docNo: o.docNo, docDate: o.docDate, kind: 'Đối trừ vào phiếu bán', method: 'Đối trừ hàng bán trả lại', amount: Math.abs(o.amount), status: o.status })),
  ].sort((a, b) => a.docDate.localeCompare(b.docDate));
  const settled = history.filter((x) => x.status === 'posted' || x.status === '').reduce((s, x) => s + x.amount, 0);
  const waiting = history.filter((x) => x.status === 'pending' || x.status === 'error').reduce((s, x) => s + x.amount, 0);
  const historyPanel = (
    <div>
      {history.length === 0 ? <div className="muted" style={{ padding: 12 }}>Chưa có phiếu {isReturn ? 'chi trả khách / đối trừ' : 'thu / đối trừ'} nào cho phiếu này.</div> : (
        <table className="grid">
          <thead><tr><th>Ngày</th><th>Số phiếu</th><th>Loại</th><th>Hình thức</th><th className="num">Số tiền</th><th>Trạng thái</th></tr></thead>
          <tbody>
            {history.map((x, i) => (
              <tr key={i} className={x.id && onOpenDoc ? 'clickable' : ''} onClick={() => x.id && onOpenDoc?.(x.id)} title={x.id ? 'Bấm để mở phiếu' : ''}>
                <td>{x.docDate ? date(x.docDate) : ''}</td>
                <td className="mono">{x.id ? <u>{x.docNo}</u> : x.docNo}</td>
                <td>{x.kind}</td><td>{x.method}</td>
                <td className="num">{money(x.amount)}</td>
                <td>{x.status ? <span className={x.status === 'posted' ? 'text-ok' : x.status === 'pending' ? 'text-warn' : 'text-bad'}>{STATUS_TEXT[x.status] ?? x.status}</span> : <span className="muted">Kèm phiếu</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ display: 'flex', gap: 24, justifyContent: 'flex-end', padding: '8px 4px 2px', fontSize: 12 }}>
        <span>Tổng phiếu: <b>{money(total)}</b></span>
        <span>Đã định khoản: <b className="text-ok">{money(settled)}</b></span>
        {waiting > 0 && <span>Chờ định khoản: <b className="text-warn">{money(waiting)}</b></span>}
        <span>Còn {isReturn ? 'phải trả khách' : 'phải thu'}: <b className={Math.abs(total) - settled - waiting > 0.5 ? 'text-bad' : ''}>{money(Math.max(0, Math.abs(total) - settled - waiting))}</b></span>
      </div>
    </div>
  );

  const tradeGrid = (
    <DataGrid
      storageKey={`${docType}-form`}
      compact
      maxHeight="300px"
      rows={lines}
      rowKey={(l) => l.lineKey}
      columns={[
        { key: 'sku', header: 'Mã hàng', type: 'code' },
        { key: 'name', header: 'Tên hàng' },
        { key: 'warehouseCode', header: 'Kho', type: 'code', value: (l) => l.warehouseCode || branch?.code || '' },
        { key: 'unitQty', header: 'Số lượng', type: 'number', sum: true, value: (l) => Math.abs(qtyOf(l)) },
        { key: 'unit', header: 'Đơn vị' },
        { key: 'unitPrice', header: 'Đơn giá VND', type: 'money', value: (l) => (qtyOf(l) ? Math.round(Math.abs(l.amountBeforeTax / qtyOf(l))) : 0) },
        ...(docType === 'purchase_return' ? [{ key: 'unitCost', header: 'Giá vốn', type: 'money', value: (l) => (l.cost !== undefined && qtyOf(l) ? Math.round(Math.abs(l.cost / qtyOf(l))) : 0) }] satisfies Column<Line>[] : []),
        { key: 'taxRate', header: 'Thuế(%)', type: 'number', value: (l) => rateOf(l.taxCode) ?? 0 },
        { key: 'taxAmount', header: 'Thuế VND', type: 'money', sum: true, value: (l) => Math.abs(l.taxAmount) },
        { key: 'amountBeforeTax', header: 'Thành tiền VND', type: 'money', sum: true, value: (l) => Math.abs(l.amountBeforeTax) },
        { key: 'note', header: 'Ghi chú', value: (l) => l.note ?? '' },
        { key: 'lotNo', header: 'Số lô', type: 'code' },
        { key: 'expDate', header: 'Exp Date', type: 'date', value: (l) => l.expDate ?? '' },
        { key: 'isGift', header: 'Khuyến mãi', value: (l) => (l.isGift ? 'KM' : '') },
        { key: 'taxCode', header: 'Loại thuế', type: 'code', hidden: true },
      ] satisfies Column<Line>[]}
    />
  );

  const stockGrid = (
    <DataGrid
      storageKey={`${docType}-form`}
      compact
      maxHeight="300px"
      rows={stockLines}
      rowKey={(l) => l.lineKey}
      columns={[
        { key: 'sku', header: 'Mã hàng', type: 'code' },
        { key: 'name', header: 'Tên hàng' },
        { key: 'unit', header: 'ĐVT' },
        ...(docType === 'transfer' ? [
          { key: 'from', header: 'Kho xuất', type: 'code', value: () => (p.leg === 'in' ? p.fromBranchCode ?? '' : branch?.code ?? '') },
          { key: 'to', header: 'Kho nhập', type: 'code', value: () => (p.leg === 'in' ? branch?.code ?? '' : p.toBranchCode ?? '') },
        ] satisfies Column<StockLine>[] : [
          { key: 'warehouseCode', header: 'Kho', type: 'code', value: (l) => l.warehouseCode || branch?.code || '' },
        ] satisfies Column<StockLine>[]),
        { key: 'qty', header: 'Số lượng', type: 'number', sum: true, value: (l) => stockSignedQty(l) },
        // Giá trị theo giá vốn: hệ thống nguồn chưa có thì bằng 0 cho tới khi chạy Tính giá vốn (ACC49).
        { key: 'unitPrice', header: 'Đơn giá', type: 'money', value: (l) => (l.qty ? Math.round(stockValue(l) / Math.abs(l.qty)) : 0) },
        { key: 'amount', header: 'Thành tiền', type: 'money', sum: true, value: (l) => stockValue(l) },
        { key: 'note', header: 'Ghi chú', value: (l) => l.note ?? '' },
        { key: 'lotNo', header: 'Số lô', type: 'code', hidden: true },
        { key: 'expDate', header: 'Exp Date', type: 'date', hidden: true, value: (l) => l.expDate ?? '' },
      ] satisfies Column<StockLine>[]}
    />
  );

  const saleGrid = (
    <DataGrid
      key={view}
      storageKey={`${isReturn ? 'sale-return-form' : 'sale-form'}-${view}`}
      compact
      maxHeight="300px"
      rows={lines}
      rowKey={(l) => l.lineKey}
      columns={[
        { key: 'sku', header: 'Mã hàng', type: 'code' },
        { key: 'name', header: 'Tên hàng' },
        { key: 'warehouseCode', header: 'Kho', type: 'code', value: (l) => l.warehouseCode || branch?.code || '' },
        // SL, Đơn giá, Giá vốn theo ĐVT bán trên phiếu (lốc, thùng…); số lượng quy đổi ra đơn vị nhỏ nhất xem ở cột "SL quy đổi".
        { key: 'unitQty', header: 'SL', type: 'number', sum: true, value: (l) => qtyOf(l) },
        { key: 'unit', header: 'ĐVT' },
        { key: 'unitRatio', header: 'Tỉ lệ QĐ DVT', type: 'number', value: (l) => l.unitRatio ?? 1 },
        ...(view === 'retail' ? [
          // Đơn giá bán cho khách = (tiền khách trả + chiết khấu) ÷ SL — tính ngược từ số đã lưu nên có thể lệch 1đ do làm tròn.
          { key: 'salePrice', header: 'Đơn giá', type: 'money', value: (l) => salePriceOf(l) },
          { key: 'unitCost', header: 'Giá vốn', type: 'money', value: (l) => (l.cost !== undefined && qtyOf(l) ? Math.round(l.cost / qtyOf(l)) : 0) },
          { key: 'saleDiscount', header: 'CK', type: 'money', sum: true, value: (l) => saleDiscountOf(l) },
          { key: 'gross', header: 'Thành tiền', type: 'money', sum: true, value: (l) => grossOf(l) },
        ] satisfies Column<Line>[] : [
          { key: 'unitPrice', header: 'Đơn giá', type: 'money', value: (l) => Math.round(l.unitPrice * (l.unitRatio ?? 1)) },
          { key: 'unitCost', header: 'Giá vốn', type: 'money', value: (l) => (l.cost !== undefined && qtyOf(l) ? Math.round(l.cost / qtyOf(l)) : 0) },
          { key: 'taxRate', header: 'Thuế(%)', type: 'number', value: (l) => rateOf(l.taxCode) ?? 0 },
          { key: 'taxAmount', header: 'Thuế VND', type: 'money', sum: true },
          { key: 'amountBeforeTax', header: 'Thành tiền', type: 'money', sum: true },
        ] satisfies Column<Line>[]),
        { key: 'note', header: 'Ghi chú', value: (l) => l.note ?? '' },
        { key: 'lotNo', header: 'Số lô', type: 'code' },
        { key: 'expDate', header: 'Exp Date', type: 'date', value: (l) => l.expDate ?? '' },
        { key: 'isGift', header: 'KM', value: (l) => (l.isGift ? 'KM' : '') },
        { key: 'taxCode', header: 'Loại thuế', type: 'code', hidden: true },
        { key: 'qty', header: 'SL quy đổi', type: 'number', sum: true, hidden: true },
      ] satisfies Column<Line>[]}
    />
  );
  const lineGrid = isSale ? saleGrid : isTrade ? tradeGrid : stockGrid;

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {/* ---- Phần đầu ---- */}
      <div>
        <FormTabs tabs={isStock ? [['main', MAIN_TAB[docType]]] : [['main', MAIN_TAB[docType]], ['tax', 'Thuế']]} value={headTab} onChange={setHeadTab} />
        {headTab === 'main' || isStock ? head : taxHead}
      </div>

      {/* ---- Chi tiết hóa đơn ---- */}
      <GroupBox title={isSale ? 'Chi tiết hóa đơn' : 'Chi tiết phiếu'}>
        <div className="row" style={{ alignItems: 'center', marginBottom: 2, fontSize: 12 }}>
          {/* Thẻ đối trừ chỉ hiện khi có: phiếu bán — phiếu hoàn đã đối trừ vào; phiếu hoàn — phiếu bán được đối trừ cho. */}
          <FormTabs tabs={!isSale ? [['lines', docType === 'purchase' ? 'Chi tiết phiếu nhập kho' : 'Chi tiết phiếu']] : [
            ['lines', 'Chi tiết hóa đơn'],
            ...(offsetRows.length ? [['offset', `${isReturn ? 'Đối trừ cho phiếu bán' : 'Đối trừ phiếu hoàn'} (${offsetRows.length})`] as ['offset', string]] : []),
            ['history', `Lịch sử thanh toán (${history.length})`],
          ]} value={midTab} onChange={setMidTab} />
          <span className="spacer" />
          {isSale && (
            <>
              <span className="muted">Kiểu xem:</span>&nbsp;
              <select value={view} onChange={(e) => setView(e.target.value as ViewMode)} style={{ fontSize: 12, height: 24, marginRight: 12 }} title="Chỉ đổi cách hiển thị dòng hàng, không đổi số hạch toán">
                <option value="retail">Giá bán cho khách (có CK)</option>
                <option value="tax">Theo hoá đơn gửi thuế (có thuế)</option>
              </select>
            </>
          )}
          {!isStock && <><span>Đã thanh toán:</span>&nbsp;<span className="fb-value" style={{ display: 'inline-flex', justifyContent: 'flex-end', minWidth: 104 }}>{money(paid)}</span></>}
        </div>
        {!isSale ? lineGrid : midTab === 'history' ? historyPanel : midTab === 'offset' && offsetRows.length ? (
          // Phiếu bán: tiền của phiếu hoàn (đổi trả tại quầy) đối trừ vào phiếu này khi thanh toán.
          // Phiếu hoàn: phiếu bán mà tiền hàng trả lại đã đối trừ cho. Bấm số phiếu để mở.
          <table className="grid">
            <thead><tr><th>Ngày</th><th>{isReturn ? 'Số phiếu bán' : 'Số phiếu hoàn'}</th><th className="num">Số tiền đối trừ</th><th>Trạng thái</th></tr></thead>
            <tbody>
              {offsetRows.map((x, i) => (
                <tr key={i} className={x.id && onOpenDoc ? 'clickable' : ''} onClick={() => x.id && onOpenDoc?.(x.id)} title={x.id ? 'Bấm để mở phiếu' : 'Phiếu chưa có trong phần mềm kế toán'}>
                  <td>{x.docDate ? date(x.docDate) : ''}</td>
                  <td className="mono">{x.id ? <u>{x.docNo}</u> : x.docNo}</td>
                  <td className="num">{money(x.amount)}</td>
                  <td>{x.status ? <span className={x.status === 'posted' ? 'text-ok' : x.status === 'pending' ? 'text-warn' : 'text-bad'}>{STATUS_TEXT[x.status] ?? x.status}</span> : <span className="muted">Kèm phiếu</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : lineGrid}
      </GroupBox>

      {/* ---- Phần dưới ---- */}
      <div style={{ display: 'grid', gridTemplateColumns: isStock ? 'minmax(0, 1.6fr) minmax(0, 2fr) minmax(200px, 1fr)' : 'minmax(0, 2.5fr) minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(200px, 1fr)', gap: 6 }}>
        {isTrade && (
          <GroupBox title="Nhà cung cấp">
            <FormGrid cols={2}>
              <Field label="Mã NCC" labelWidth={84}><span className="mono">{partner.code ?? ''}</span></Field>
              <Field label="Tên NCC" labelWidth={60}>{partner.name ?? ''}</Field>
              <Field label="Địa chỉ" labelWidth={84} span={2}>{partner.address ?? ''}</Field>
              <Field label="Tel" labelWidth={84}>{partner.phone ?? ''}</Field>
              <Field label="MST" labelWidth={60}>{partner.taxCode ?? ''}</Field>
            </FormGrid>
          </GroupBox>
        )}
        {isSale && <GroupBox title={isReturn ? 'Khách hàng' : 'Thông tin khách hàng'}>
          <FormGrid cols={2}>
            <Field label="Mã KH" labelWidth={84}><span className="mono">{partner.code ?? ''}</span></Field>
            <Field label="Tên KH" labelWidth={60}>{partner.name ?? 'Khách lẻ'}</Field>
            <Field label={isReturn ? 'Địa chỉ' : 'Địa chỉ NR'} labelWidth={84} span={2}>{partner.address ?? ''}</Field>
            <Field label="Tel" labelWidth={84}>{partner.phone ?? ''}</Field>
            <Field label="Mob" labelWidth={60}>{mobile}</Field>
            <Field label={isReturn ? 'Đơn vị/Cty' : 'Người đại diện'} labelWidth={84}>{inv?.buyerLegalName ?? ''}</Field>
            <Field label="MST" labelWidth={60}>{partner.taxCode ?? ''}</Field>
          </FormGrid>
        </GroupBox>}
        <GroupBox title="Nhân viên">
          <FormGrid cols={1}>
            <Field label="Mã NV" labelWidth={60}><span className="mono">{p.employee?.code ?? ''}</span></Field>
            <Field label="Tên NV" labelWidth={60}>{p.employee?.name ?? ''}</Field>
          </FormGrid>
        </GroupBox>
        <GroupBox title="Ghi chú">
          <div className="fb-value" style={{ height: 'auto', minHeight: 70, alignItems: 'flex-start', whiteSpace: 'pre-wrap', padding: '3px 6px', fontSize: 12 }}>{p.description}</div>
        </GroupBox>
        <GroupBox title="Tổng cộng">
          <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: '2px 6px', fontSize: 12 }}>
            {isStock ? (
              <span className="muted">Giá trị</span>
            ) : !isSale ? (
              <>
                <span className="muted">Tiền hàng</span><b style={{ textAlign: 'right' }}>{money(Math.abs(beforeTax))}</b>
                <span className="muted">Thuế</span><b style={{ textAlign: 'right' }}>{money(Math.abs(tax))}</b>
              </>
            ) : view === 'retail' ? (
              <>
                {/* Tiền hàng theo giá bán cho khách (gồm thuế, trước CK) − Chiết khấu = Tổng tiền; thuế là phần nằm trong đó. */}
                <span className="muted">Tiền hàng</span><b style={{ textAlign: 'right' }}>{money(total + saleDiscount)}</b>
                <span className="muted">Chiết khấu</span><b style={{ textAlign: 'right' }}>{money(saleDiscount)}</b>
                <span className="muted">Gồm thuế</span><b style={{ textAlign: 'right' }}>{money(tax)}</b>
              </>
            ) : (
              <>
                <span className="muted">Tiền hàng</span><b style={{ textAlign: 'right' }}>{money(beforeTax)}</b>
                <span className="muted">Thuế</span><b style={{ textAlign: 'right' }}>{money(tax)}</b>
              </>
            )}
            {isStock
              ? <b style={{ textAlign: 'right', fontSize: 16, color: 'var(--brand, #0b5cad)' }}>{money(stockTotal)}</b>
              : <><span className="muted">Tổng tiền</span><b style={{ textAlign: 'right', fontSize: 16, color: 'var(--brand, #0b5cad)' }}>{money(Math.abs(total))}</b></>}
          </div>
        </GroupBox>
      </div>
    </div>
  );
}
