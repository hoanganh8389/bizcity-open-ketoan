/**
 * Form một đơn đặt hàng (NT-BH-023): sửa khi Nháp / Chờ duyệt / Đã gửi; nút theo trạng thái — Ghi, Gửi, Duyệt, Từ chối, Giao, Đóng, Huỷ,
 * In báo giá; thẻ Lịch sử (người, lúc, cũ → mới). Máy chủ tính lại tiền, kiểm hạn mức, giữ hàng; màn chỉ gửi và hiện kết quả.
 * NT-BH-032: khối Thông tin giao; "Lập chuyến giao" theo số "Giao lần này" và bảng chuyến giao (Đi giao / Đã giao / Hoàn, nhật ký);
 * "Giao tại quầy" = Giao cũ (phiếu bán nháp xuất thẳng từ KCB); nút Copy đơn (đơn mới nháp, giá + khuyến mại tính lại).
 */
// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: màn Đơn đặt hàng (đóng góp)
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-032: thông tin giao, chuyến giao, copy đơn (đóng góp)
import { useEffect, useState } from 'react';
import { BranchPicker, ErrorBox, Field, ItemPicker, Loading, Modal, errorText, useApi, useCan, useMutation, useQuery, useQueryClient } from '@bizcity/ui-kit';
import { ACTION, M, SELF_CARRIER, SHIP_NEXT, SHIP_STATUS, STATUS, fmt, printQuote, remaining, time, today, vnd, type HistoryEvent, type Order, type ShipStatus } from '../lib';

type DraftLine = { lineKey: string; sku: string; qty: string; unitPrice: string; discount: string; isGift: boolean };
type Draft = {
  orderDate: string; validUntil: string; branchCode: string; warehouseCode: string; partnerCode: string; customerName: string; phone: string;
  source: 'manual' | 'livestream'; note: string; lines: DraftLine[];
  receiver: string; shipPhone: string; address: string; fee: string; carrier: string; trackingNo: string; cod: string;
};

const fromOrder = (o: Order): Draft => ({
  orderDate: o.orderDate, validUntil: o.validUntil ?? '', branchCode: o.branchCode, warehouseCode: o.warehouseCode, partnerCode: o.partner?.code ?? '',
  customerName: o.customer?.name ?? '', phone: o.customer?.phone ?? o.phone ?? '', source: o.source, note: o.note ?? '',
  lines: o.lines.map((l) => ({ lineKey: l.lineKey, sku: l.sku, qty: String(l.qty), unitPrice: String(l.unitPrice), discount: l.discount ? String(l.discount) : '', isGift: l.isGift })),
  receiver: o.shipping?.receiver ?? '', shipPhone: o.shipping?.phone ?? '', address: o.shipping?.address ?? '', fee: o.shipping?.fee ? String(o.shipping.fee) : '',
  carrier: o.shipping?.carrier ?? '', trackingNo: o.shipping?.trackingNo ?? '', cod: o.shipping?.cod ? String(o.shipping.cod) : '',
});
const blank = (): Draft => ({
  orderDate: today(), validUntil: today(3), branchCode: '', warehouseCode: '', partnerCode: '', customerName: '', phone: '', source: 'manual', note: '',
  lines: [{ lineKey: 'L1', sku: '', qty: '1', unitPrice: '', discount: '', isGift: false }],
  receiver: '', shipPhone: '', address: '', fee: '', carrier: '', trackingNo: '', cod: '',
});
const n = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(/\./g, '').replace(',', '.')));

function toInput(d: Draft) {
  return {
    orderDate: d.orderDate, validUntil: d.validUntil, branchCode: d.branchCode, ...(d.warehouseCode ? { warehouseCode: d.warehouseCode } : {}), source: d.source,
    ...(d.partnerCode ? { partner: { code: d.partnerCode } } : {}),
    ...(d.customerName || d.phone ? { customer: { ...(d.customerName ? { name: d.customerName } : {}), ...(d.phone ? { phone: d.phone } : {}) } } : {}),
    ...(d.note ? { note: d.note } : {}),
    ...(d.receiver || d.shipPhone || d.address || d.carrier || d.trackingNo || n(d.fee) || n(d.cod) ? { shipping: {
      ...(d.receiver ? { receiver: d.receiver } : {}), ...(d.shipPhone ? { phone: d.shipPhone } : {}), ...(d.address ? { address: d.address } : {}),
      ...(d.carrier ? { carrier: d.carrier } : {}), ...(d.trackingNo ? { trackingNo: d.trackingNo } : {}), fee: n(d.fee) ?? 0, cod: n(d.cod) ?? 0,
    } } : {}),
    lines: d.lines.filter((l) => l.sku).map((l) => ({
      lineKey: l.lineKey, sku: l.sku, qty: n(l.qty) ?? 0, ...(n(l.unitPrice) !== undefined ? { unitPrice: n(l.unitPrice) } : {}),
      ...(n(l.discount) ? { discount: n(l.discount) } : {}), ...(l.isGift ? { isGift: true } : {}),
    })),
  };
}

type Dup = { orderId: string; orderNo: string; skus: string[] };

export function OrderEditor({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const [cur, setCur] = useState<Order | null>(order);
  const [d, setD] = useState<Draft>(order ? fromOrder(order) : blank());
  const [tab, setTab] = useState<'form' | 'history'>('form');
  const [give, setGive] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string>('');
  const [dups, setDups] = useState<Dup[]>([]);
  const status = cur?.status ?? 'draft';
  const editable = !cur || ['draft', 'pending', 'open'].includes(status);
  const write = can('phieu-ban:write');
  const approver = can('phieu-ban:order-approve');
  const shipLap = can('phieu-ban:giao-hang-lap');
  const shipSua = can('phieu-ban:giao-hang-sua');
  // Danh sách không kèm chuyến giao — mở đơn thì đọc chi tiết (có chuyến giao).
  const detail = useQuery({ queryKey: ['phieu-ban', 'order', order?.id], enabled: Boolean(order), queryFn: () => api.get<Order>(`${M}/orders/${order!.id}`) });
  useEffect(() => { if (detail.data) setCur(detail.data); }, [detail.data]);
  const history = useQuery({ queryKey: ['phieu-ban', 'order-history', cur?.id], enabled: Boolean(cur) && tab === 'history',
    queryFn: () => api.get<{ events: HistoryEvent[] }>(`${M}/orders/${cur!.id}/history`) });

  const done = (o: Order, text: string) => { setCur(o); setD(fromOrder(o)); setGive({}); setMsg(text); qc.invalidateQueries({ queryKey: ['phieu-ban', 'orders'] }); };
  const run = useMutation({
    mutationFn: async (what: { act: string; body?: unknown; onDuplicate?: 'keep' | 'merge'; mergeInto?: string }) => {
      setMsg('');
      if (what.act === 'save') {
        if (cur) return { o: await api.put<Order>(`${M}/orders/${cur.id}`, toInput(d)), text: 'Đã ghi' };
        const r = await api.post<{ created: boolean; merged?: boolean; order?: Order; duplicates?: Dup[] }>(`${M}/orders`, {
          ...toInput(d), ...(what.onDuplicate ? { onDuplicate: what.onDuplicate } : {}), ...(what.mergeInto ? { mergeInto: what.mergeInto } : {}) });
        if (r.duplicates?.length) { setDups(r.duplicates); return null; }
        setDups([]);
        return { o: r.order!, text: r.merged ? `Đã gộp vào đơn ${r.order!.orderNo}` : 'Đã lập đơn nháp' };
      }
      if (what.act === 'copy') {
        const o = await api.post<Order>(`${M}/orders/copy`, { from: 'order', id: cur!.id });
        return { o, text: `Đã lập đơn nháp ${o.orderNo} — copy từ ${cur!.orderNo}, giá + khuyến mại tính theo hôm nay` };
      }
      const r = await api.post<Order | { order: Order; doc: { docNo: string } }>(`${M}/orders/${cur!.id}/${what.act}`, what.body ?? {});
      if ('doc' in r) return { o: r.order, text: `Đã sinh phiếu bán nháp ${r.doc.docNo} (BH10) — kế toán duyệt phiếu để ghi sổ` };
      if (what.act.startsWith('shipments/')) {
        const sid = what.act.split('/')[1];
        const sh = r.shipments?.find((x) => x.id === sid);
        return { o: r, text: sh?.status === 'delivered' ? `Chuyến ${sh.seq} đã giao — phiếu bán nháp ${sh.saleDocNo} (BH10) xuất từ kho ${sh.shipWarehouseCode}; kế toán duyệt để ghi doanh thu`
          : sh ? `Chuyến ${sh.seq}: ${SHIP_STATUS[sh.status].label}` : 'Xong' };
      }
      if (what.act === 'shipments') return { o: r, text: 'Đã lập chuyến giao (Chờ lấy hàng)' };
      return { o: r, text: r.status === 'pending' ? `Chờ duyệt: ${r.pendingReasons.join(' · ')}` : 'Xong' };
    },
    onSuccess: (r) => { if (r) done(r.o, r.text); },
  });
  const act = (a: string, body?: unknown) => run.mutate({ act: a, body });
  const ask = (a: string, label: string, required = false) => {
    const note = window.prompt(`${label} — ghi chú / lý do${required ? ' (bắt buộc)' : ''}`) ?? null;
    if (note === null || (required && !note.trim())) return;
    act(a, { note });
  };
  const setLine = (i: number, patch: Partial<DraftLine>) => setD({ ...d, lines: d.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) });
  const addLine = () => {
    let k = d.lines.length + 1;
    while (d.lines.some((l) => l.lineKey === `L${k}`)) k++;
    setD({ ...d, lines: [...d.lines, { lineKey: `L${k}`, sku: '', qty: '1', unitPrice: '', discount: '', isGift: false }] });
  };
  const line = (key: string) => cur?.lines.find((l) => l.lineKey === key);
  const giveLines = () => Object.entries(give).map(([lineKey, v]) => ({ lineKey, qty: Number(v) || 0 })).filter((x) => x.qty > 0);
  const hasGive = giveLines().length > 0;
  const shipTo = (sid: string, to: ShipStatus, label: string) => {
    const note = window.prompt(`${label} — ghi chú${to === 'returned' ? ' / lý do hoàn' : ''} (tuỳ chọn)`);
    if (note === null) return;
    const tracking = to === 'shipping' ? window.prompt('Mã vận đơn (để trống = giữ như chuyến)') ?? '' : '';
    act(`shipments/${sid}/status`, { status: to, ...(note ? { note } : {}), ...(tracking ? { trackingNo: tracking } : {}) });
  };
  const noShipLap = shipLap ? '' : 'Cần quyền phieu-ban:giao-hang-lap';
  const noShipSua = shipSua ? '' : 'Cần quyền phieu-ban:giao-hang-sua (cập nhật chuyến giao)';
  const lockedHead = status === 'open';
  const noWrite = write ? '' : 'Cần quyền phieu-ban:write (kế toán, kế toán trưởng, chủ đơn vị)';
  const noApprove = approver ? '' : 'Chỉ kế toán trưởng / chủ đơn vị duyệt (quyền phieu-ban:order-approve)';

  return (
    <Modal wide title={cur ? `Đơn ${cur.orderNo} · ${STATUS[status].label}` : 'Lập đơn đặt hàng'} onClose={onClose} footer={(
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {editable && <button className="btn btn-primary" disabled={!write || run.isPending} title={noWrite || 'Ghi đơn (máy chủ tính lại tiền)'} onClick={() => run.mutate({ act: 'save' })}>Ghi</button>}
        {cur && status === 'draft' && <button className="btn" disabled={!write || run.isPending} title={noWrite || 'Kiểm hạn mức, nợ quá hạn; không vướng thì giữ hàng ngay'} onClick={() => act('send')}>Gửi</button>}
        {cur && status === 'pending' && <button className="btn" disabled={!approver || run.isPending} title={noApprove || 'Duyệt: đơn vào Đã gửi và giữ hàng'} onClick={() => ask('approve', 'Duyệt đơn')}>Duyệt</button>}
        {cur && status === 'pending' && <button className="btn" disabled={!approver || run.isPending} title={noApprove || 'Từ chối: đơn về Nháp'} onClick={() => ask('reject', 'Từ chối đơn', true)}>Từ chối</button>}
        {cur && status === 'open' && (
          <button className="btn" disabled={!shipLap || run.isPending || !hasGive}
            title={noShipLap || (hasGive ? 'Lập chuyến giao (Chờ lấy hàng) theo số "Giao lần này"; phí ship, COD, hãng theo Thông tin giao' : 'Nhập số "Giao lần này" ở dòng hàng trước')}
            onClick={() => act('shipments', { lines: giveLines() })}>Lập chuyến giao</button>
        )}
        {cur && status === 'open' && (
          <button className="btn" disabled={!write || run.isPending || !hasGive}
            title={noWrite || (hasGive ? 'Khách nhận ngay tại cửa hàng: sinh phiếu bán BH10 nháp xuất từ kho KCB' : 'Nhập số "Giao lần này" ở dòng hàng trước')}
            onClick={() => act('deliver', { lines: giveLines() })}>Giao tại quầy</button>
        )}
        {cur && status === 'open' && <button className="btn" disabled={!write || run.isPending} title={noWrite || 'Thôi giữ phần chưa giao: chuyển từ KCB về kho bán'} onClick={() => ask('close', 'Đóng đơn')}>Đóng đơn</button>}
        {cur && ['draft', 'pending', 'open'].includes(status) && <button className="btn" disabled={!write || run.isPending} title={noWrite || 'Chỉ huỷ được khi chưa giao gì; đã giao một phần thì dùng Đóng đơn'} onClick={() => ask('cancel', 'Huỷ đơn')}>Huỷ đơn</button>}
        {cur && <button className="btn" disabled={!write || run.isPending} title={noWrite || 'Lập đơn nháp mới cùng khách, hàng, số lượng, thông tin giao; giá + khuyến mại tính theo hôm nay'} onClick={() => act('copy')}>Copy đơn</button>}
        {cur && <button className="btn" onClick={() => printQuote(cur)}>In báo giá</button>}
        <button className="btn" onClick={onClose}>Đóng cửa sổ</button>
      </div>
    )}>
      {cur && (
        <div className="row" style={{ gap: 6, marginBottom: 8 }}>
          <button className={`btn btn-xs${tab === 'form' ? ' btn-primary' : ''}`} onClick={() => setTab('form')}>Đơn</button>
          <button className={`btn btn-xs${tab === 'history' ? ' btn-primary' : ''}`} onClick={() => setTab('history')}>Lịch sử</button>
        </div>
      )}
      {run.error && <ErrorBox error={errorText(run.error)} />}
      {msg && <div className="badge badge-info" style={{ marginBottom: 8 }}>{msg}</div>}
      {cur?.status === 'pending' && <div className="badge badge-warn" style={{ marginBottom: 8 }}>Chờ duyệt: {cur.pendingReasons.join(' · ')}</div>}
      {cur?.copiedFrom && <div className="muted" style={{ marginBottom: 8 }}>Copy từ {cur.copiedFrom.slice(cur.copiedFrom.indexOf(':') + 1)}</div>}
      {cur?.rejection && status === 'draft' && <div className="muted" style={{ marginBottom: 8 }}>Bị từ chối bởi {cur.rejection.by} lúc {time(cur.rejection.at)}: {cur.rejection.note}</div>}
      {dups.length > 0 && (
        <div className="card card-body" style={{ marginBottom: 8 }}>
          <b>Trùng đơn livestream (cùng SĐT, cùng mã hàng trong 24 giờ):</b>
          {dups.map((x) => (
            <div key={x.orderId} className="row" style={{ gap: 6 }}>
              {x.orderNo} ({x.skus.join(', ')})
              <button className="btn btn-xs" onClick={() => run.mutate({ act: 'save', onDuplicate: 'merge', mergeInto: x.orderId })}>Gộp vào đơn này</button>
            </div>
          ))}
          <button className="btn btn-xs" onClick={() => run.mutate({ act: 'save', onDuplicate: 'keep' })}>Giữ riêng (lập đơn mới)</button>
        </div>
      )}
      {tab === 'history' && cur ? (
        history.isLoading ? <Loading /> : history.error ? <ErrorBox error={errorText(history.error)} /> : (
          <table className="grid">
            <thead><tr><th>Lúc</th><th>Người</th><th>Việc</th><th>Thay đổi (cũ → mới)</th><th>Ghi chú</th></tr></thead>
            <tbody>{(history.data?.events ?? []).map((e) => (
              <tr key={e.id}><td>{time(e.at)}</td><td>{e.actorName || e.actor}</td><td>{ACTION[e.action] ?? e.action}</td>
                <td>{e.changes.map((c) => `${c.field}: ${fmt(c.from)} → ${fmt(c.to)}`).join('; ')}</td><td>{e.note}</td></tr>
            ))}</tbody>
          </table>
        )
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
            <Field label="Cửa hàng"><BranchPicker value={d.branchCode} onChange={(v) => setD({ ...d, branchCode: v })} disabled={!editable || lockedHead} /></Field>
            <Field label="Kho bán" hint="Trống = kho mặc định"><input className="input" value={d.warehouseCode} disabled={!editable || lockedHead} title={lockedHead ? 'Đơn đang giữ hàng — không đổi kho' : ''} onChange={(e) => setD({ ...d, warehouseCode: e.target.value })} /></Field>
            <Field label="Ngày đơn"><input className="input" type="date" value={d.orderDate} disabled={!editable} onChange={(e) => setD({ ...d, orderDate: e.target.value })} /></Field>
            <Field label="Hiệu lực đến" hint="Báo giá có hạn"><input className="input" type="date" value={d.validUntil} disabled={!editable} onChange={(e) => setD({ ...d, validUntil: e.target.value })} /></Field>
            <Field label="Mã khách"><input className="input" value={d.partnerCode} disabled={!editable || lockedHead} title={lockedHead ? 'Đơn đang giữ hàng — không đổi khách' : ''} onChange={(e) => setD({ ...d, partnerCode: e.target.value })} /></Field>
            <Field label="Tên người đặt"><input className="input" value={d.customerName} disabled={!editable} onChange={(e) => setD({ ...d, customerName: e.target.value })} /></Field>
            <Field label="Số điện thoại"><input className="input" value={d.phone} disabled={!editable} onChange={(e) => setD({ ...d, phone: e.target.value })} /></Field>
            <Field label="Nguồn">
              <select className="input" value={d.source} disabled={Boolean(cur)} title={cur ? 'Nguồn chọn lúc lập đơn' : ''} onChange={(e) => setD({ ...d, source: e.target.value as Draft['source'] })}>
                <option value="manual">Lập tay</option><option value="livestream">Livestream</option>
              </select>
            </Field>
            <Field label="Ghi chú" full><input className="input" value={d.note} disabled={!editable} onChange={(e) => setD({ ...d, note: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 8 }}><b>Thông tin giao</b> <span className="muted">— phí ship và COD mặc định cho chuyến giao đầu tiên</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
            <Field label="Người nhận"><input className="input" value={d.receiver} disabled={!editable} onChange={(e) => setD({ ...d, receiver: e.target.value })} /></Field>
            <Field label="SĐT người nhận"><input className="input" value={d.shipPhone} disabled={!editable} onChange={(e) => setD({ ...d, shipPhone: e.target.value })} /></Field>
            <Field label="Địa chỉ giao" full><input className="input" value={d.address} disabled={!editable} onChange={(e) => setD({ ...d, address: e.target.value })} /></Field>
            <Field label="Hãng vận chuyển" hint="SELF = tự giao; hoặc mã hãng (GHN, GHTK…)">
              <input className="input" list="phieu-ban-carriers" value={d.carrier} disabled={!editable} onChange={(e) => setD({ ...d, carrier: e.target.value.toUpperCase() })} />
              <datalist id="phieu-ban-carriers"><option value={SELF_CARRIER}>Tự giao</option><option value="GHN" /><option value="GHTK" /><option value="VTP" /></datalist>
            </Field>
            <Field label="Mã vận đơn"><input className="input" value={d.trackingNo} disabled={!editable} onChange={(e) => setD({ ...d, trackingNo: e.target.value })} /></Field>
            <Field label="Phí ship thu khách"><input className="input" value={d.fee} disabled={!editable} onChange={(e) => setD({ ...d, fee: e.target.value })} /></Field>
            <Field label="Tiền COD"><input className="input" value={d.cod} disabled={!editable} onChange={(e) => setD({ ...d, cod: e.target.value })} /></Field>
          </div>
          <table className="grid" style={{ marginTop: 8 }}>
            <thead><tr><th>Mã hàng</th><th>Tên</th><th>SL</th><th>Đơn giá</th><th>Chiết khấu</th><th>Quà</th><th>Thành tiền</th><th>Đã giao</th><th>Đang giao</th><th>Đang giữ</th>{status === 'open' && <th>Giao lần này</th>}<th /></tr></thead>
            <tbody>{d.lines.map((l, i) => {
              const s = line(l.lineKey);
              return (
                <tr key={l.lineKey}>
                  <td style={{ minWidth: 160 }}><ItemPicker value={l.sku} onChange={(v) => setLine(i, { sku: v })} disabled={!editable || Boolean(s?.delivered)} /></td>
                  <td>{s?.name ?? ''}</td>
                  <td><input className="input" style={{ width: 70 }} value={l.qty} disabled={!editable} onChange={(e) => setLine(i, { qty: e.target.value })} /></td>
                  <td><input className="input" style={{ width: 110 }} value={l.unitPrice} placeholder="giá cửa hàng" disabled={!editable || l.isGift} title={l.isGift ? 'Dòng quà: giá 0' : ''} onChange={(e) => setLine(i, { unitPrice: e.target.value })} /></td>
                  <td><input className="input" style={{ width: 90 }} value={l.discount} disabled={!editable || l.isGift} title={l.isGift ? 'Dòng quà: không chiết khấu' : ''} onChange={(e) => setLine(i, { discount: e.target.value })} /></td>
                  <td><input type="checkbox" checked={l.isGift} disabled={!editable} onChange={(e) => setLine(i, { isGift: e.target.checked })} /></td>
                  <td style={{ textAlign: 'right' }}>{s ? vnd(s.amountBeforeTax + s.taxAmount) : ''}</td>
                  <td style={{ textAlign: 'right' }}>{s ? vnd(s.delivered) : ''}</td>
                  <td style={{ textAlign: 'right' }}>{s?.shipping ? vnd(s.shipping) : ''}</td>
                  <td style={{ textAlign: 'right' }}>{s ? vnd(s.held) : ''}</td>
                  {status === 'open' && <td><input className="input" style={{ width: 70 }} value={give[l.lineKey] ?? ''} placeholder={s ? `≤ ${remaining(s)}` : ''} onChange={(e) => setGive({ ...give, [l.lineKey]: e.target.value })} /></td>}
                  <td>{editable && !s?.delivered && <button className="btn btn-xs" onClick={() => setD({ ...d, lines: d.lines.filter((_, k) => k !== i) })}>Bỏ</button>}</td>
                </tr>
              );
            })}</tbody>
          </table>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
            {editable ? <button className="btn btn-xs" onClick={addLine}>+ Thêm dòng</button> : <span />}
            {cur && <b>Tổng: {vnd(cur.totals.total)}</b>}
          </div>
          {cur && cur.deliveries.length > 0 && (
            <div className="muted" style={{ marginTop: 6 }}>
              Các lần giao: {cur.deliveries.map((x) => `${x.docNo}${x.returned ? ' (đã xoá)' : ''} · ${time(x.at)} · ${x.lines.map((y) => `${y.sku} × ${y.qty}`).join(', ')}`).join(' | ')}
            </div>
          )}
          {cur?.holdWarehouseCode && <div className="muted">Giữ hàng ở kho {cur.holdWarehouseCode} (kho bán {cur.warehouseCode})</div>}
          {cur && (cur.shipments ?? []).length > 0 && (
            <>
              <div style={{ marginTop: 10 }}><b>Chuyến giao</b> <span className="muted">— Đang giao: hàng ở kho KHG (chưa doanh thu); Đã giao: phiếu bán nháp xuất từ KHG</span></div>
              <table className="grid" style={{ marginTop: 4 }}>
                <thead><tr><th>#</th><th>Trạng thái</th><th>Hàng</th><th>Hãng / mã vận đơn</th><th>Phí ship</th><th>COD</th><th>Phiếu bán</th><th>Nhật ký</th><th /></tr></thead>
                <tbody>{(cur.shipments ?? []).map((x) => (
                  <tr key={x.id}>
                    <td>{x.seq}</td>
                    <td><span className={`badge badge-${SHIP_STATUS[x.status].tone}`}>{SHIP_STATUS[x.status].label}</span></td>
                    <td>{x.lines.map((y) => `${y.sku} × ${vnd(y.qty)}`).join(', ')}</td>
                    <td>{x.carrier === SELF_CARRIER ? 'Tự giao' : x.carrier}{x.trackingNo ? ` · ${x.trackingNo}` : ''}</td>
                    <td style={{ textAlign: 'right' }}>{vnd(x.fee)}</td>
                    <td style={{ textAlign: 'right' }}>{vnd(x.cod)}</td>
                    <td>{x.saleDocNo ?? ''}</td>
                    <td className="muted">{x.log.map((g) => `${time(g.at)} ${g.byName || g.by}: ${g.from ? `${SHIP_STATUS[g.from].label} → ` : ''}${SHIP_STATUS[g.to].label}${g.docNo ? ` (${g.docNo})` : ''}${g.note ? ` — ${g.note}` : ''}`).join(' | ')}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{SHIP_NEXT[x.status].map(([to, label, hint]) => (
                      <button key={to} className="btn btn-xs" disabled={!shipSua || run.isPending} title={noShipSua || hint} onClick={() => shipTo(x.id, to, label)}>{label}</button>
                    ))}</td>
                  </tr>
                ))}</tbody>
              </table>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
