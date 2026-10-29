/**
 * Form một phiếu hàng hoá (bán hàng, hàng bán trả lại, mua hàng, trả hàng nhà cung cấp, chuyển kho) — xem lib/tradeDocs.ts.
 *   Đầu phiếu: số phiếu (để trống = tự cấp), ngày, chi nhánh + KHO (chuyển kho: chi nhánh / kho xuất → nhận, cùng chi nhánh thì
 *   khác kho), đối tượng, hoá đơn, phiếu gốc. Mọi dòng đi theo kho ở đầu phiếu (cột Kho chỉ để xem).
 *   Dòng hàng: chọn mã hàng → tự điền tên, ĐVT, đơn giá trước thuế (bán: từ bảng giá công ty đã gồm thuế), loại thuế
 *   của mặt hàng; tiền tự tính.
 *   Thu tiền (bán / trả lại): các khoản theo hình thức thanh toán; để trống = ghi công nợ.
 * Danh mục (mặt hàng, đối tượng, chi nhánh, hình thức thanh toán) đọc từ API thật; chỉ phần LƯU phiếu theo nguồn dữ liệu.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { KIND_INFO, TAX_OPTIONS, TAX_RATES, recompute, type TradeDoc, type TradeLine } from '@/lib/tradeDocs';
import { Field, Modal } from '@/components/ui';
import { BranchPicker } from '@/components/filters';
import { ItemPicker, ListPicker, PartnerPicker } from '@/components/pickers';
import { HelpDrawer } from '@/components/HelpDrawer';
import { PrintButton } from '@/components/print';
import { TRADE_TEMPLATES } from './printTemplates';
import { ChonKho, khoLabel, useKho } from './ChonKho';

interface CatalogProduct { sku: string; name: string; unit: string; taxOutCode: string | null; taxInCode: string | null; units: { unit: string; isDefault: boolean }[]; prices: { unit: string; price: number | null }[] }
interface PaymentMethod { code: string; name: string; isActive?: boolean }

const money = (n: number | undefined) => (n ? n.toLocaleString('vi-VN') : '');
const num = (s: string) => { const n = Number(s.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
let seq = 0;
const lineKey = () => `L${Date.now().toString(36)}${(seq++).toString(36)}`;

export function PhieuHangForm({ value, readOnly, saving, error, onSave, onClose, printScreen }: {
  /** Mã màn (BH10, BH11, KHO01…) để nhớ mẫu in mặc định; không truyền thì không có nút In. */
  printScreen?: string;
  value: TradeDoc; readOnly: boolean; saving: boolean; error: unknown;
  onSave: (doc: TradeDoc) => void; onClose: () => void;
}) {
  const info = KIND_INFO[value.docType];
  const [v, setV] = useState<TradeDoc>(value);
  const [help, setHelp] = useState(false);
  const set = (p: Partial<TradeDoc>) => setV((x) => recompute({ ...x, ...p }));
  const setLine = (i: number, p: Partial<TradeLine>) => set({ lines: v.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const methods = useQuery({ queryKey: ['payment-methods'], queryFn: () => api.get<PaymentMethod[]>('/api/v1/posting/payment-methods'), staleTime: 300_000, enabled: info.hasPayments }).data ?? [];
  const taxOptions = info.taxDir ? TAX_OPTIONS[info.taxDir] : [];
  const khoAll = useKho();
  const khoName = info.isTransfer ? `${khoLabel(khoAll, v.warehouseCode)} → ${khoLabel(khoAll, v.toWarehouseCode)}` : khoLabel(khoAll, v.warehouseCode);

  /** Chọn mã hàng → điền tên, ĐVT bán chính, đơn giá bảng giá công ty, loại thuế của mặt hàng. */
  const pickItem = async (i: number, sku: string) => {
    setLine(i, { sku });
    if (!sku) return;
    try {
      const p = await api.get<CatalogProduct>(`/api/v1/catalog/products/${encodeURIComponent(sku)}`);
      const unit = p.units.find((u) => u.isDefault)?.unit ?? p.unit;
      const price = p.prices.find((x) => x.unit === unit)?.price ?? undefined;
      const taxCode = info.taxDir === 'input' ? p.taxInCode ?? 'V08' : info.taxDir === 'output' ? p.taxOutCode ?? 'R08' : undefined;
      // Bảng giá bán là giá ĐÃ gồm thuế → quy về đơn giá trước thuế (phiếu tính thuế trên tiền trước thuế). Mua hàng: chưa có
      // giá nhập trong danh mục → để 0 cho người nhập gõ theo hoá đơn.
      const rate = TAX_RATES[taxCode ?? ''] ?? 0;
      const unitPrice = info.isTransfer ? undefined : info.taxDir === 'output' && price ? Math.round(price / (1 + rate / 100)) : 0;
      setLine(i, { sku, name: p.name, unit, unitPrice, taxCode });
    } catch { /* mã chỉ có ở kho, chưa có trong danh mục hàng: giữ mã, nhập tay tên */ }
  };
  const addLine = () => set({ lines: [...v.lines, { lineKey: lineKey(), sku: '', name: '', unit: '', qty: 1, unitPrice: 0, amountBeforeTax: 0, taxCode: info.taxDir === 'input' ? 'V08' : info.taxDir === 'output' ? 'R08' : undefined }] });
  const paid = (v.payments ?? []).reduce((s, p) => s + p.amount, 0);
  const problems = [
    !v.docDate && 'Chưa nhập ngày',
    !v.branchCode && 'Chưa chọn chi nhánh',
    info.isTransfer && !v.toBranchCode && 'Chưa chọn chi nhánh nhận',
    info.isTransfer && v.toBranchCode === v.branchCode && (v.warehouseCode ?? '') === (v.toWarehouseCode ?? '') && 'Cùng chi nhánh thì kho xuất và kho nhận phải khác nhau',
    info.partner === 'supplier' && !v.partner?.code && 'Chưa chọn nhà cung cấp',
    !v.lines.length && 'Chưa có dòng hàng',
    v.lines.some((l) => !l.sku || !(l.qty > 0)) && 'Có dòng thiếu mã hàng hoặc số lượng',
    info.hasPayments && paid > v.totals.total && 'Tiền thu lớn hơn tổng phiếu',
  ].filter(Boolean) as string[];

  return (
    <Modal viewFirst={Boolean(value.docNo) && !readOnly} wide title={`${info.label}${v.docNo ? ` ${v.docNo}` : ' (mới)'}${v.status === 'approved' ? ' — đã duyệt' : ''}`} onClose={onClose}
      footer={<>
        {printScreen && TRADE_TEMPLATES[v.docType] && value.id && <span data-view-ok style={{ marginRight: 'auto' }}><PrintButton screen={printScreen} templates={TRADE_TEMPLATES[v.docType]!} title="In phiếu theo nội dung đã ghi (sửa xong bấm Ghi rồi mới in)" getDocs={() => [value]} /></span>}
        {!readOnly && <button className="btn btn-primary" disabled={saving || problems.length > 0} title={problems.join('; ')} onClick={() => onSave(v)}>Ghi</button>}
        <button className="btn" onClick={onClose}>Thoát</button>
      </>}>
      <div className="full row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-sm btn-help" onClick={() => setHelp(true)}>? Hướng dẫn</button>
      </div>
      {help && <HelpDrawer guideKey="phieu-hang" onClose={() => setHelp(false)} />}
      <fieldset className="fgroup" disabled={readOnly}>
        <legend>Thông tin phiếu</legend>
        <Field label="Số phiếu" hint="Để trống: tự cấp khi ghi"><input className="input mono" value={v.docNo} onChange={(e) => set({ docNo: e.target.value.trim() })} /></Field>
        <Field label="Ngày (*)"><input className="input" type="date" value={v.docDate} onChange={(e) => set({ docDate: e.target.value })} /></Field>
        <Field label={info.isTransfer ? 'Chi nhánh xuất (*)' : 'Chi nhánh (*)'}><BranchPicker value={v.branchCode} onChange={(c) => set({ branchCode: c })} activeOnly /></Field>
        <Field label={info.isTransfer ? 'Kho xuất (*)' : v.docType === 'sale' ? 'Kho xuất hàng (*)' : v.docType === 'sale_return' || v.docType === 'purchase' ? 'Kho nhận hàng (*)' : 'Kho (*)'} hint="Mọi dòng hàng đi theo kho này">
          <ChonKho branchCode={v.branchCode} value={v.warehouseCode ?? ''} disabled={readOnly} onChange={(c) => set({ warehouseCode: c || undefined })} />
        </Field>
        {info.isTransfer && <Field label="Chi nhánh nhận (*)" hint="Chọn đúng chi nhánh xuất để chuyển giữa hai kho trong cùng chi nhánh"><BranchPicker value={v.toBranchCode ?? ''} onChange={(c) => set({ toBranchCode: c })} activeOnly /></Field>}
        {info.isTransfer && <Field label="Kho nhận (*)">
          <ChonKho branchCode={v.toBranchCode ?? ''} value={v.toWarehouseCode ?? ''} disabled={readOnly} avoid={v.toBranchCode === v.branchCode ? v.warehouseCode : undefined} onChange={(c) => set({ toWarehouseCode: c || undefined })} />
        </Field>}
        {info.partner && (
          <Field label={`${info.partnerLabel}${info.partner === 'supplier' ? ' (*)' : ''}`} hint={info.partner === 'customer' ? 'Để trống = Khách lẻ' : undefined}>
            <PartnerPicker value={v.partner?.code ?? ''} activeOnly onChange={async (c) => {
              if (!c) return set({ partner: undefined });
              const row = (await api.get<{ code: string; name: string; taxCode?: string | null }[]>('/api/v1/partners', { search: c, pageSize: 5 }).catch(() => [])).find((x) => x.code === c);
              set({ partner: { code: c, name: row?.name ?? c, taxCode: row?.taxCode ?? undefined } });
            }} />
          </Field>
        )}
        {info.hasOriginal && <Field label="Phiếu gốc" hint="Số phiếu bán / mua gốc (tham khảo, không bắt buộc)"><input className="input mono" value={v.originalDocNo ?? ''} onChange={(e) => set({ originalDocNo: e.target.value.trim() || undefined })} /></Field>}
        {info.partner === 'supplier' && <Field label="Hạn thanh toán"><input className="input" type="date" value={v.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value || undefined })} /></Field>}
        <Field label="Ghi chú" full><input className="input" value={v.note ?? ''} onChange={(e) => set({ note: e.target.value })} /></Field>
      </fieldset>

      {info.hasInvoice && (
        <fieldset className="fgroup" disabled={readOnly}>
          <legend>Hoá đơn (nếu có)</legend>
          <Field label="Số hoá đơn"><input className="input mono" value={v.invoice?.no ?? ''} onChange={(e) => set({ invoice: e.target.value ? { no: e.target.value.trim(), serial: v.invoice?.serial, date: v.invoice?.date || v.docDate } : undefined })} /></Field>
          <Field label="Ký hiệu"><input className="input mono" value={v.invoice?.serial ?? ''} disabled={!v.invoice} onChange={(e) => v.invoice && set({ invoice: { ...v.invoice, serial: e.target.value.trim() } })} /></Field>
          <Field label="Ngày hoá đơn"><input className="input" type="date" value={v.invoice?.date ?? ''} disabled={!v.invoice} onChange={(e) => v.invoice && set({ invoice: { ...v.invoice, date: e.target.value } })} /></Field>
        </fieldset>
      )}

      <div className="full">
        <div style={{ overflowX: 'auto' }}>
          <table className="grid-table" style={{ width: '100%', minWidth: info.isTransfer ? 840 : 1100 }}>
            <thead>
              <tr>
                <th style={{ width: 34 }}>#</th><th style={{ width: 170 }}>Mã hàng</th><th>Tên hàng</th><th style={{ width: 80 }}>ĐVT</th><th style={{ width: info.isTransfer ? 200 : 120 }} title="Theo kho ở đầu phiếu">Kho</th><th style={{ width: 80 }}>SL</th>
                {!info.isTransfer && <><th style={{ width: 110 }}>Đơn giá</th><th style={{ width: 100 }}>Chiết khấu</th><th style={{ width: 120 }}>Tiền hàng</th><th style={{ width: 90 }}>Thuế</th><th style={{ width: 100 }}>Tiền thuế</th></>}
                <th style={{ width: 34 }} />
              </tr>
            </thead>
            <tbody>
              {v.lines.map((l, i) => (
                <tr key={l.lineKey}>
                  <td style={{ textAlign: 'center' }}>{i + 1}</td>
                  <td>{readOnly ? <span className="mono">{l.sku}</span> : <ItemPicker value={l.sku} onChange={(c) => void pickItem(i, c)} hideName />}</td>
                  <td><input className="input" value={l.name} disabled={readOnly} onChange={(e) => setLine(i, { name: e.target.value })} /></td>
                  <td><input className="input" value={l.unit} disabled={readOnly} onChange={(e) => setLine(i, { unit: e.target.value })} /></td>
                  <td className="muted" style={{ fontSize: 12 }}>{khoName}</td>
                  <td><input className="input num" value={l.qty || ''} disabled={readOnly} onChange={(e) => setLine(i, { qty: num(e.target.value) })} /></td>
                  {!info.isTransfer && <>
                    <td><input className="input num" value={money(l.unitPrice)} disabled={readOnly || l.isGift} onChange={(e) => setLine(i, { unitPrice: num(e.target.value) })} /></td>
                    <td><input className="input num" value={money(l.discount)} disabled={readOnly || l.isGift} onChange={(e) => setLine(i, { discount: num(e.target.value) })} /></td>
                    <td className="num">{l.isGift ? <span className="muted">tặng</span> : money(l.amountBeforeTax)}</td>
                    <td><select className="select input" value={l.taxCode ?? ''} disabled={readOnly} onChange={(e) => setLine(i, { taxCode: e.target.value })}>{taxOptions.map(([c, t]) => <option key={c} value={c}>{t}</option>)}</select></td>
                    <td className="num">{money(l.taxAmount)}</td>
                  </>}
                  <td>{!readOnly && <button type="button" className="btn btn-xs" title="Bỏ dòng" onClick={() => set({ lines: v.lines.filter((_, j) => j !== i) })}>×</button>}</td>
                </tr>
              ))}
              {!v.lines.length && <tr><td colSpan={info.isTransfer ? 8 : 13} className="muted" style={{ textAlign: 'center', padding: 12 }}>Chưa có dòng hàng — bấm "+ Thêm dòng"</td></tr>}
            </tbody>
            {!info.isTransfer && (
              <tfoot>
                <tr><td colSpan={8} style={{ textAlign: 'right' }}><b>Cộng</b></td><td className="num"><b>{money(v.totals.beforeTax)}</b></td><td /><td className="num"><b>{money(v.totals.tax)}</b></td><td /></tr>
                <tr><td colSpan={10} style={{ textAlign: 'right' }}><b>Tổng thanh toán</b></td><td className="num"><b>{money(v.totals.total)}</b></td><td /></tr>
              </tfoot>
            )}
          </table>
        </div>
        {!readOnly && <button type="button" className="btn btn-sm" style={{ marginTop: 6 }} onClick={addLine}>+ Thêm dòng</button>}
      </div>

      {info.hasPayments && (
        <fieldset className="fgroup" disabled={readOnly}>
          <legend>{v.docType === 'sale_return' ? 'Trả tiền khách' : 'Thu tiền'} — để trống = ghi công nợ</legend>
          <div className="full">
            {(v.payments ?? []).map((p, i) => (
              <div key={i} className="row" style={{ gap: 6, marginBottom: 4 }}>
                <div style={{ width: 240 }}><ListPicker items={methods.filter((m) => m.isActive !== false).map((m) => ({ code: m.code, name: m.name }))} value={p.methodCode} onChange={(c) => set({ payments: (v.payments ?? []).map((x, j) => (j === i ? { ...x, methodCode: c } : x)) })} placeholder="Hình thức" /></div>
                <input className="input num" style={{ width: 160 }} value={money(p.amount)} onChange={(e) => set({ payments: (v.payments ?? []).map((x, j) => (j === i ? { ...x, amount: num(e.target.value) } : x)) })} />
                <input className="input" style={{ flex: 1 }} placeholder="Mã giao dịch (nếu có)" value={p.reference ?? ''} onChange={(e) => set({ payments: (v.payments ?? []).map((x, j) => (j === i ? { ...x, reference: e.target.value || undefined } : x)) })} />
                {!readOnly && <button type="button" className="btn btn-xs" onClick={() => set({ payments: (v.payments ?? []).filter((_, j) => j !== i) })}>×</button>}
              </div>
            ))}
            {!readOnly && <button type="button" className="btn btn-sm" onClick={() => set({ payments: [...(v.payments ?? []), { methodCode: 'TM', amount: Math.max(0, v.totals.total - paid) }] })}>+ Thêm khoản {v.docType === 'sale_return' ? 'trả' : 'thu'}</button>}
            <span className="muted" style={{ marginLeft: 10, fontSize: 12 }}>Đã {v.docType === 'sale_return' ? 'trả' : 'thu'} {money(paid) || 0} · còn công nợ {money(Math.max(0, v.totals.total - paid)) || 0}</span>
          </div>
        </fieldset>
      )}
      {problems.length > 0 && !readOnly && <div className="full muted" style={{ fontSize: 12 }}>Chưa ghi được: {problems.join(' · ')}</div>}
      {Boolean(error) && <div className="alert alert-bad full">{errorText(error)}</div>}
    </Modal>
  );
}
