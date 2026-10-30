/**
 * ĐỐI CHIẾU ĐƠN ĐẶT ↔ PHIẾU NHẬP (MH21) — theo vết: mỗi dòng = một đơn × một mã: SL đặt / đã nhận (phiếu đã duyệt) / đang chờ
 * (phiếu nháp, chờ duyệt) / chênh, giá đặt / giá nhập bình quân / lệch giá, tình trạng (đủ · thiếu · thừa · ngoài đơn · đổi mã),
 * các phiếu nhập của mã đó. Kèm phiếu nhập NGOÀI ĐƠN trong kỳ. Lọc ngày đơn, NCC, chi nhánh, tình trạng; mặc định chỉ dòng lệch.
 * Bấm số đơn / số phiếu → mở ở Tổng hợp mua hàng (MH11).
 */
import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ErrorBox, Loading } from '@/components/ui';
import { PartnerPicker } from '@/components/pickers';
import { NccInfo } from '../thanh-phan/NccInfo';
import { P, STATUS_LABEL, today, useNames } from '../du-lieu';
import { dmy } from '../chung';
import '../mua-hang.css';

type State = 'du' | 'thieu' | 'thua' | 'ngoai_don' | 'doi_ma';
interface Rec { id: string; docNo: string; docDate: string; status: string; sku: string; qty: number; unit: string; price: number }
interface Row { orderId: string; orderNo: string; orderDate: string; partnerCode: string; branchCode: string; sku: string; name: string; unit: string; ordered: number; received: number; pending: number; diff: number; state: State; orderPrice: number | null; receivedPrice: number | null; priceDiffPct: number | null; swappedTo: string[]; receipts: Rec[]; outsideReason?: string }
interface Res { rows: Row[]; orders: number; outsideReceipts: number; summary: Record<State | 'lech_gia', number> }

const STATE: Record<State, [string, string]> = {
  du: ['Đủ', 'badge-ok'], thieu: ['Thiếu — còn phải giao', 'badge-info'], thua: ['Thừa so với đơn', 'badge-warn'], ngoai_don: ['Ngoài đơn', 'badge-warn'], doi_ma: ['Đổi mã', 'badge-bad'],
};
const money = (v: number | null) => (v === null ? '' : v.toLocaleString('vi-VN', { maximumFractionDigits: 2 }));
// Thiếu nhưng phần còn lại đã có phiếu nhập (nháp / chờ duyệt) → hàng đã về, chỉ chờ duyệt phiếu, không phải NCC còn nợ hàng.
const label = (r: Row): [string, string] => (r.state === 'thieu' && r.pending > 0 && r.received + r.pending >= r.ordered - 1e-6 ? ['Đã về — chờ duyệt phiếu', 'badge-gray'] : STATE[r.state]);
const priceOff = (r: Row) => r.priceDiffPct !== null && Math.abs(r.priceDiffPct) >= 0.01;
const isDiff = (r: Row) => r.state !== 'du' || priceOff(r) || r.pending > 0;

export function DoiChieuDonPage() {
  const names = useNames();
  const [params] = useSearchParams();
  const [from, setFrom] = useState(`${today().slice(0, 7)}-01`);
  const [to, setTo] = useState(today());
  const [partner, setPartner] = useState(params.get('ncc') ?? '');
  const [state, setState] = useState<'' | State | 'lech_gia' | 'cho'>('');
  const [onlyDiff, setOnlyDiff] = useState(true);
  const exportRef = useRef<(() => void) | null>(null);
  const q = useQuery({ queryKey: ['mua-hang', 'order-reconcile', from, to, partner], queryFn: () => api.get<Res>(`${P}/order-reconcile`, { from: from || undefined, to: to || undefined, partnerCode: partner || undefined }) });
  const rows = (q.data?.rows ?? []).filter((r) => (!onlyDiff || isDiff(r)) && (!state || (state === 'lech_gia' ? priceOff(r) : state === 'cho' ? r.pending > 0 : r.state === state)))
    .map((r, i) => ({ ...r, key: `${r.orderId || r.receipts[0]?.id}-${r.sku}-${i}` }));
  const open = (id: string, no: string) => <Link to={`/mua-hang/chung-tu?mo=${encodeURIComponent(id)}`} title="Mở ở Chứng từ mua hàng">{no}</Link>;
  const columns: Column<Row & { key: string }>[] = [
    { key: 'orderDate', header: 'Ngày đơn', width: 90, value: (r) => dmy(r.orderDate) },
    { key: 'orderNo', header: 'Đơn đặt', width: 110, value: (r) => r.orderNo || '(không có đơn)', render: (r) => (r.orderId ? open(r.orderId, r.orderNo) : <span className="badge badge-warn" title={r.outsideReason ? `Lý do: ${r.outsideReason}` : 'Phiếu nhập không theo đơn nào'}>Nhập ngoài đơn</span>) },
    { key: 'partner', header: 'Mã NCC', type: 'code', width: 120, value: (r) => r.partnerCode, render: (r) => <span className="row" style={{ gap: 4, alignItems: 'center' }}>{r.partnerCode}<NccInfo code={r.partnerCode} showName={false} /></span> },
    { key: 'partnerName', header: 'Tên NCC', width: 230, value: (r) => names.partnerName(r.partnerCode), render: (r) => <span title={names.partnerName(r.partnerCode)}>{names.partnerName(r.partnerCode)}</span> },
    { key: 'partnerTax', header: 'MST NCC', type: 'code', width: 110, value: (r) => names.partner(r.partnerCode)?.taxCode ?? '' },
    { key: 'partnerPhone', header: 'SĐT NCC', type: 'code', width: 110, value: (r) => names.partner(r.partnerCode)?.phone ?? '' },
    { key: 'partnerAddress', header: 'Địa chỉ NCC', width: 240, value: (r) => names.partner(r.partnerCode)?.address ?? '', render: (r) => <span title={names.partner(r.partnerCode)?.address ?? ''}>{names.partner(r.partnerCode)?.address}</span> },
    { key: 'branch', header: 'Chi nhánh', width: 90, value: (r) => r.branchCode },
    { key: 'sku', header: 'Mã', type: 'code', width: 100 },
    { key: 'name', header: 'Tên hàng', width: 220 },
    { key: 'unit', header: 'ĐVT', width: 60, title: 'ĐVT của dòng đơn (mã ngoài đơn: ĐVT trên phiếu nhập) — SL đặt / nhận / chờ / chênh theo ĐVT này' },
    { key: 'ordered', header: 'SL đặt', type: 'qty', width: 80 },
    { key: 'received', header: 'Đã nhận', type: 'qty', width: 80, title: 'Từ phiếu nhập ĐÃ DUYỆT' },
    { key: 'pending', header: 'Đang chờ', type: 'qty', width: 80, title: 'Phiếu nhập nháp / chờ duyệt theo đơn — chưa vào sổ' },
    { key: 'diff', header: 'Chênh', type: 'qty', width: 80, title: 'Đã nhận − đặt (âm = còn thiếu, dương = giao thừa)', render: (r) => <span className={r.diff < 0 ? 'mh-warn' : r.diff > 0 ? 'mh-bad' : ''}>{r.diff ? r.diff.toLocaleString('vi-VN', { maximumFractionDigits: 4 }) : ''}</span> },
    { key: 'state', header: 'Tình trạng', width: 170, value: (r) => label(r)[0] + (r.swappedTo.length ? ` → ${r.swappedTo.join(', ')}` : ''), render: (r) => <span className={`badge ${label(r)[1]}`} title={r.swappedTo.length ? `Nhận bằng mã ${r.swappedTo.join(', ')} thay cho ${r.sku}` : undefined}>{label(r)[0]}{r.swappedTo.length ? ` → ${r.swappedTo.join(', ')}` : ''}</span> },
    { key: 'orderPrice', header: 'Giá đặt', type: 'price', width: 100, value: (r) => r.orderPrice ?? '', render: (r) => money(r.orderPrice) },
    { key: 'receivedPrice', header: 'Giá nhập (BQ)', type: 'price', width: 110, title: 'Đơn giá nhập bình quân các phiếu đã duyệt, quy về ĐVT và loại giá (gồm / chưa thuế) của đơn', value: (r) => r.receivedPrice ?? '', render: (r) => money(r.receivedPrice) },
    { key: 'priceDiffPct', header: 'Lệch giá %', type: 'number', width: 85, value: (r) => r.priceDiffPct ?? '', render: (r) => (priceOff(r) ? <span className={Math.abs(r.priceDiffPct!) >= 2 ? 'mh-bad' : 'mh-warn'}>{r.priceDiffPct! > 0 ? '+' : ''}{r.priceDiffPct!.toLocaleString('vi-VN')}%</span> : '') },
    { key: 'receipts', header: 'Phiếu nhập (theo vết)', width: 280, value: (r) => r.receipts.map((x) => `${x.docNo} ${dmy(x.docDate)} ${x.qty} ${x.unit}${x.status !== 'approved' ? ` (${STATUS_LABEL[x.status as keyof typeof STATUS_LABEL] ?? x.status})` : ''}`).join('; '),
      render: (r) => <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '2px 8px' }}>{r.receipts.map((x, i) => <span key={i} title={`${dmy(x.docDate)} · ${x.sku} · ${x.qty} ${x.unit} × ${money(x.price)}`}>{open(x.id, x.docNo || '(nháp)')}{x.status !== 'approved' && <span className="muted"> ({STATUS_LABEL[x.status as keyof typeof STATUS_LABEL] ?? x.status})</span>}</span>)}{!r.receipts.length && <span className="muted">chưa giao</span>}</span> },
  ];
  const s = q.data?.summary;
  const chip = (k: typeof state, label: string, n?: number) => <button type="button" className={`btn btn-sm ${state === k ? 'btn-primary' : ''}`} onClick={() => setState(state === k ? '' : k)}>{label}{n !== undefined ? ` (${n})` : ''}</button>;
  return (
    <>
      <PageHeader title="Đối chiếu đơn đặt ↔ phiếu nhập" code="MH21" helpKey="mua-hang-doi-chieu"
        subtitle="Theo vết từng đơn đặt: đặt bao nhiêu, đã nhận / đang chờ, giao thiếu, thừa, mã ngoài đơn, đổi mã, lệch giá — kèm phiếu nhập ngoài đơn" />
      <div className="card">
        <div className="filters">
          <span style={{ fontSize: 13 }}>Ngày đơn từ</span><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span style={{ fontSize: 13 }}>đến</span><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <div style={{ width: 240 }}><PartnerPicker value={partner} onChange={setPartner} placeholder="Mọi nhà cung cấp" /></div>
          <label className="row" style={{ gap: 4, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> Chỉ dòng lệch / chưa xong</label>
          <button className="btn btn-sm" onClick={() => exportRef.current?.()}>Xuất Excel</button>
        </div>
        {s && <div className="filters" style={{ paddingTop: 0 }}>
          {chip('thieu', 'Thiếu', s.thieu)}{chip('thua', 'Thừa', s.thua)}{chip('ngoai_don', 'Ngoài đơn', s.ngoai_don)}{chip('doi_ma', 'Đổi mã', s.doi_ma)}{chip('lech_gia', 'Lệch giá', s.lech_gia)}{chip('cho', 'Có phiếu đang chờ')}
          <span className="muted" style={{ fontSize: 12 }}>{q.data!.orders} đơn đã duyệt · {q.data!.outsideReceipts} phiếu nhập ngoài đơn trong kỳ</span>
        </div>}
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid storageKey="mh-doi-chieu-don" exportName="doi-chieu-don-dat-phieu-nhap" exportRef={exportRef} rows={rows} rowKey={(r) => r.key} columns={columns}
            emptyText={onlyDiff ? 'Không có dòng lệch — mọi đơn trong kỳ đã giao đủ, đúng giá' : 'Không có đơn đặt / phiếu nhập ngoài đơn trong kỳ'} />
        )}
      </div>
    </>
  );
}
