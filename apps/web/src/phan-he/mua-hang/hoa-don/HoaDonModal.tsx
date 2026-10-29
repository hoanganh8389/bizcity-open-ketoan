/**
 * Một hoá đơn NCC — mở ở chế độ xem, bấm Sửa mới sửa. Thẻ:
 *   Hàng hoá        dòng theo cách NCC ghi + mã / ĐVT bên mình (chọn mã cho dòng chưa nhận diện → lưu là phần mềm học)
 *   Đối soát        so với phiếu nhập cùng số hoá đơn: từng mã (SL quy ĐVT nhỏ nhất, giá chưa thuế, thuế suất), tổng tiền
 *   Tệp đính kèm    ảnh / PDF / XML hoá đơn gốc
 * Nút: Lập phiếu nhập từ hoá đơn (mọi dòng đã nhận diện), Huỷ hoá đơn (bắt buộc lý do — chứng từ không xoá).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { RECONCILE_LABEL, invoiceLabel, type InvoiceLine } from '@ketoan/contracts/mua-hang';
import { Field, Modal, useViewAgain } from '@/components/ui';
import { PartnerPicker } from '@/components/pickers';
import { errorText } from '@/lib/api';
import { STATUS_LABEL, today, useNames, vnd } from '../du-lieu';
import { dmy } from '../chung';
import { TepDinhKem } from '../dinh-kem/TepDinhKem';
import { BangDongHoaDon, blankLine } from './BangDongHoaDon';
import { SOURCE_LABEL, STATE_LABEL, invoiceApi, type InvoiceInput } from './api';

type Tab = 'hang' | 'doi-soat' | 'tep';
const r2 = (x: number) => Math.round(x * 100) / 100;

export function HoaDonModal({ id, partnerCode = '', lockPartner, onClose, onSaved, note }: { id?: string; partnerCode?: string; lockPartner?: boolean; onClose: () => void; onSaved: () => void; note?: ReactNode }) {
  const names = useNames();
  const navigate = useNavigate();
  const viewAgain = useViewAgain();
  const detail = useQuery({ queryKey: ['mua-hang', 'invoice', id], enabled: Boolean(id), queryFn: () => invoiceApi.get(id!) });
  const [form, setForm] = useState<InvoiceInput | null>(null);
  const [tab, setTab] = useState<Tab>('hang');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const inv = detail.data?.invoice;
  // Hoá đơn mới (gõ tay) hoặc bản đang sửa; hoá đơn đã có → bản đọc từ máy chủ cho tới khi bấm Sửa.
  const v: InvoiceInput = form ?? (inv ? { ...inv } : { partnerCode, form: '', series: '', no: '', date: today(), sellerTaxCode: names.partner(partnerCode)?.taxCode ?? '', sellerName: names.partnerName(partnerCode), buyerTaxCode: '', totalBeforeTax: 0, totalDiscount: 0, totalTax: 0, total: 0, source: 'manual', note: '', data: {}, lines: [blankLine(1)] });
  const set = (p: Partial<InvoiceInput>) => setForm({ ...v, ...p });
  const cancelled = inv?.status === 'cancelled';
  const sums = useMemo(() => ({ before: r2(v.lines.reduce((s, l) => s + l.amount, 0)), tax: r2(v.lines.reduce((s, l) => s + l.taxAmount, 0)) }), [v.lines]);
  const unmatched = v.lines.filter((l) => !l.sku).length;
  const prodNames = Object.fromEntries((detail.data?.reconcile?.rows ?? []).map((r) => [r.sku, r.name]));

  const save = async () => {
    setErr(''); setBusy(true);
    try {
      const body: InvoiceInput = { ...v, lines: v.lines.map((l, i) => ({ ...l, lineNo: i + 1 })) };
      // Gõ tay mà để trống tổng: lấy theo cộng dòng.
      if (!body.totalBeforeTax && !body.total) Object.assign(body, { totalBeforeTax: sums.before, totalTax: sums.tax, total: r2(sums.before + sums.tax) });
      await invoiceApi.save(body, id);
      setForm(null);
      await detail.refetch();
      onSaved();
      if (id) viewAgain[1](); else onClose();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  const cancel = async () => {
    const reason = window.prompt('Lý do huỷ hoá đơn (bắt buộc):')?.trim();
    if (!reason) return;
    try { await invoiceApi.cancel(id!, reason); await detail.refetch(); onSaved(); } catch (e) { setErr(errorText(e)); }
  };
  const toReceipt = () => navigate(`/mua-hang/chung-tu?tu-hoa-don=${id}`);

  if (id && detail.isLoading) return <Modal key="tai" title="Hoá đơn NCC" onClose={onClose} footer={<button className="btn" onClick={onClose}>Đóng</button>}><div className="muted">Đang tải…</div></Modal>;
  const state = id && inv ? (cancelled ? 'da_huy' : unmatched ? 'chua_nhan_dien' : !detail.data?.receipts.length ? 'chua_co_phieu' : detail.data?.reconcile?.ok ? 'khop' : 'lech') : null;
  return (
    <Modal key={id ?? 'moi'} wide viewFirst={Boolean(id) && !cancelled} viewAgain={viewAgain} onClose={onClose} onEdit={() => setForm({ ...v })}
      title={<span>{id ? `Hoá đơn NCC ${invoiceLabel(v)}` : 'Thêm hoá đơn NCC (gõ tay)'}{state && <span className={`badge ${STATE_LABEL[state][1]}`} style={{ marginLeft: 8 }} title={STATE_LABEL[state][2]}>{STATE_LABEL[state][0]}</span>}</span>}
      viewActions={<>
        {id && !cancelled && !unmatched && <button className="btn" data-view-ok onClick={toReceipt} title="Mở phiếu nhập mới điền sẵn dòng hàng, số / ngày hoá đơn từ hoá đơn này">Lập phiếu nhập từ hoá đơn</button>}
        {id && !cancelled && <button className="btn" data-view-ok onClick={() => void cancel()}>Huỷ hoá đơn</button>}
      </>}
      footer={cancelled ? <button className="btn" onClick={onClose}>Đóng</button> : <>
        <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Đang ghi…' : 'Ghi'}</button>
        <button className="btn" onClick={() => { if (id) { setForm(null); viewAgain[1](); } else onClose(); }}>Thoát</button>
      </>}>
      <div className="full">
      {note && <div className="alert alert-warn" style={{ marginBottom: 8 }}>{note}</div>}
      {cancelled && <div className="alert alert-bad">Đã huỷ bởi {inv?.cancelledBy} lúc {inv?.cancelledAt ? new Date(inv.cancelledAt).toLocaleString('vi-VN', { hour12: false }) : ''} — lý do: {inv?.cancelReason}</div>}
      {err && <div className="alert alert-bad">{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px 14px' }}>
        <Field label="Nhà cung cấp"><PartnerPicker value={v.partnerCode} onChange={(c) => set({ partnerCode: c, lines: v.lines.map((l) => (l.sku ? l : { ...l, candidates: undefined })), sellerTaxCode: v.sellerTaxCode || (names.partner(c)?.taxCode ?? ''), sellerName: v.sellerName || names.partnerName(c) })} disabled={lockPartner || Boolean(id)} /></Field>
        <Field label="Ký hiệu mẫu số"><input className="input" value={v.form} onChange={(e) => set({ form: e.target.value })} placeholder="1" /></Field>
        <Field label="Ký hiệu hoá đơn"><input className="input" value={v.series} onChange={(e) => set({ series: e.target.value.toUpperCase() })} placeholder="C26MHZ" /></Field>
        <Field label="Số hoá đơn"><input className="input" value={v.no} onChange={(e) => set({ no: e.target.value.trim() })} placeholder="134608" /></Field>
        <Field label="Ngày hoá đơn"><input className="input" type="date" value={v.date} onChange={(e) => set({ date: e.target.value })} /></Field>
        <Field label="MST người bán"><input className="input" value={v.sellerTaxCode} onChange={(e) => set({ sellerTaxCode: e.target.value })} /></Field>
        <Field label="Tên người bán"><input className="input" value={v.sellerName} onChange={(e) => set({ sellerName: e.target.value })} /></Field>
        <Field label="MST người mua"><input className="input" value={v.buyerTaxCode} onChange={(e) => set({ buyerTaxCode: e.target.value })} /></Field>
        <Field label="Tổng tiền hàng (trên HĐ)" hint={Math.abs(sums.before - v.totalBeforeTax) > 10 ? `Cộng dòng: ${vnd(sums.before)}` : undefined}><input className="input num" value={v.totalBeforeTax ? vnd(v.totalBeforeTax) : ''} onChange={(e) => set({ totalBeforeTax: Number(e.target.value.replace(/\./g, '')) || 0 })} placeholder={vnd(sums.before)} /></Field>
        <Field label="Tiền thuế (trên HĐ)" hint={Math.abs(sums.tax - v.totalTax) > 10 ? `Cộng dòng: ${vnd(sums.tax)}` : undefined}><input className="input num" value={v.totalTax ? vnd(v.totalTax) : ''} onChange={(e) => set({ totalTax: Number(e.target.value.replace(/\./g, '')) || 0 })} placeholder={vnd(sums.tax)} /></Field>
        <Field label="Tổng thanh toán (trên HĐ)"><input className="input num" value={v.total ? vnd(v.total) : ''} onChange={(e) => set({ total: Number(e.target.value.replace(/\./g, '')) || 0 })} placeholder={vnd(sums.before + sums.tax)} /></Field>
        <Field label="Ghi chú"><input className="input" value={v.note} onChange={(e) => set({ note: e.target.value })} /></Field>
      </div>
      {id && inv && <div className="muted" style={{ fontSize: 12, margin: '4px 0' }}>Nguồn: {SOURCE_LABEL[inv.source]}{inv.data.fileName ? ` (${String(inv.data.fileName)})` : ''} · Tạo: {inv.createdBy} {inv.createdAt ? new Date(inv.createdAt).toLocaleString('vi-VN', { hour12: false }) : ''} · Sửa: {inv.updatedBy} {inv.updatedAt ? new Date(inv.updatedAt).toLocaleString('vi-VN', { hour12: false }) : ''}</div>}
      <div className="tabs" style={{ marginTop: 8 }}>
        <button type="button" className={`tab ${tab === 'hang' ? 'active' : ''}`} onClick={() => setTab('hang')}>Hàng hoá ({v.lines.length}{unmatched ? `, ${unmatched} chưa nhận diện` : ''})</button>
        {id && <button type="button" className={`tab ${tab === 'doi-soat' ? 'active' : ''}`} onClick={() => setTab('doi-soat')}>Đối soát phiếu nhập ({detail.data?.receipts.length ?? 0})</button>}
        {id && <button type="button" className={`tab ${tab === 'tep' ? 'active' : ''}`} onClick={() => setTab('tep')}>Tệp đính kèm</button>}
      </div>
      {tab === 'hang' && <>
        {unmatched > 0 && !note && v.lines.some((l) => l.nccName || l.nccSku) && <div className="alert alert-warn" style={{ margin: '6px 0' }}>{unmatched} dòng chưa biết là mã nào bên mình. {id ? 'Bấm Sửa → chọn' : 'Chọn'} mã (bấm gợi ý hoặc tìm) → Ghi. Phần mềm nhớ cách NCC ghi tên / mã này, lần sau tự nhận.</div>}
        <BangDongHoaDon lines={v.lines} partnerCode={v.partnerCode} names={prodNames} editNcc={!id || v.source === 'manual'} onChange={(lines: InvoiceLine[]) => set({ lines })} />
      </>}
      {tab === 'doi-soat' && <DoiSoat data={detail.data} />}
      {tab === 'tep' && id && <TepDinhKem ownerType="invoice" ownerId={id} defaultKind="hoa_don" />}
      </div>
    </Modal>
  );
}

function DoiSoat({ data }: { data?: Awaited<ReturnType<typeof invoiceApi.get>> }) {
  if (!data) return null;
  const rc = data.reconcile;
  if (!data.receipts.length) return <div className="muted" style={{ padding: 8 }}>Chưa có phiếu nhập nào ghi số hoá đơn này (cùng NCC). Bấm "Lập phiếu nhập từ hoá đơn" hoặc ghi số hoá đơn vào phiếu nhập đã có — phần mềm tự đối soát.</div>;
  const q = (n: number | null) => (n === null ? '' : n.toLocaleString('vi-VN', { maximumFractionDigits: 2 }));
  return (
    <div>
      <div style={{ margin: '6px 0', fontSize: 13 }}>Phiếu nhập cùng số hoá đơn: {data.receipts.map((r) => <a key={r.id} href={`/mua-hang/chung-tu?mo=${encodeURIComponent(r.id)}`} style={{ marginRight: 8 }}>{r.docNo || '(nháp)'} · {dmy(r.docDate)} · {STATUS_LABEL[r.status as keyof typeof STATUS_LABEL] ?? r.status}</a>)}</div>
      {rc && <>
        <div className={`alert ${rc.ok ? 'alert-ok' : 'alert-warn'}`}>{rc.ok ? 'Khớp từng dòng: số lượng, giá chưa thuế, thuế suất, tổng tiền.' : <>Lệch:<ul style={{ margin: '4px 0 0 18px' }}>{rc.issues.map((x, i) => <li key={i}>{x}</li>)}</ul></>}</div>
        <table className="mh-mini">
          <thead><tr><th>Mã</th><th>Tên hàng</th><th>ĐVT nhỏ nhất</th><th className="num">SL trên HĐ</th><th className="num">SL trên phiếu</th><th className="num">Giá HĐ (chưa thuế)</th><th className="num">Giá phiếu (chưa thuế)</th><th>Thuế HĐ / phiếu</th><th>Tình trạng</th></tr></thead>
          <tbody>{rc.rows.map((r) => (
            <tr key={r.sku}>
              <td className="mono">{r.sku}</td><td title={r.nccNames.join(' / ')}>{r.name}</td><td>{r.baseUnit}</td>
              <td className="num">{q(r.invQty)}</td><td className="num">{q(r.rcptQty)}</td><td className="num">{q(r.invPrice)}</td><td className="num">{q(r.rcptPrice)}</td>
              <td>{r.invTax.map((x) => (x === null ? 'KCT' : `${x}%`)).join(', ')} / {r.rcptTax.map((x) => (x === null ? 'KCT' : `${x}%`)).join(', ')}</td>
              <td>{r.states.map((s) => <span key={s} className={`badge ${s === 'khop' ? 'badge-ok' : 'badge-warn'}`} style={{ marginRight: 4 }}>{RECONCILE_LABEL[s]}</span>)}</td>
            </tr>
          ))}</tbody>
          <tfoot><tr><td colSpan={3}><b>Tổng thanh toán</b></td><td colSpan={2} className="num">HĐ {vnd(rc.invTotal.total)}</td><td colSpan={2} className="num">Phiếu {vnd(rc.rcptTotal.total)}</td><td colSpan={2} className={Math.abs(rc.invTotal.total - rc.rcptTotal.total) > 10 ? 'mh-bad' : 'mh-ok'}>Lệch {vnd(rc.invTotal.total - rc.rcptTotal.total)}</td></tr></tfoot>
        </table>
      </>}
    </div>
  );
}
