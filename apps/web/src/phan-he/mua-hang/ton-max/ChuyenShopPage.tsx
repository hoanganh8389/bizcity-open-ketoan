/**
 * ĐỀ XUẤT CHUYỂN HÀNG XUỐNG SHOP (MH19) — 2 lần / tuần mỗi shop được chia hàng từ kho chi nhánh cha:
 *   cần chuyển = max shop − tồn shop − hàng đang đi đường đến shop − đề nghị đã chốt chưa làm; làm tròn theo thùng
 *   (tự động / nguyên thùng / lẻ — cài từng mã ở Tồn max); kho không đủ thì ưu tiên shop thiếu nhiều nhất so với max.
 * Sửa số chuyển, bỏ dòng, bấm "Chốt đề nghị" → mỗi shop một đề nghị chuyển. Thẻ "Đề nghị đã chốt": kế toán kho quét danh sách
 * này (hoặc kho / POS đọc qua API) để lên phiếu chuyển kho, rồi đánh dấu "Đã lên phiếu".
 */
import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Send } from 'lucide-react';
import { TRANSFER_MODES } from '@ketoan/contracts/mua-hang';
import { PageHeader } from '@/components/PageHeader';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ErrorBox, Loading, Modal } from '@/components/ui';
import { errorText } from '@/lib/api';
import { monthStart, today } from '../du-lieu';
import { num, qtyFmt, stockApi, useHierarchy, type TransferRequest, type TransferSuggestLine } from './api';
import { ChonChiNhanhCha, ChuaPhanCap, KhoiSo } from './chung';

type Row = TransferSuggestLine & { _group?: boolean; _key: string };
const lk = (l: TransferSuggestLine) => `${l.shopCode}|${l.sku}`;
const STATUS: Record<TransferRequest['status'], string> = { open: 'Chờ lên phiếu', done: 'Đã lên phiếu', cancelled: 'Đã huỷ' };

export function ChuyenShopPage() {
  const [tab, setTab] = useState<'suggest' | 'list'>('suggest');
  const h = useHierarchy();
  const [parent, setParent] = useState('');
  return (
    <>
      <PageHeader title="Chuyển hàng xuống shop" code="MH19" helpKey="mua-hang-chuyen-shop" subtitle="Tự tính shop nào thiếu bao nhiêu so với tồn max (trừ hàng đang đi đường), làm tròn theo thùng, không vượt tồn kho — chốt thành đề nghị cho kho lên phiếu chuyển" />
      <div className="card">
        <ChuaPhanCap branches={h.data?.branches} />
        <div className="tm-bar">
          <ChonChiNhanhCha value={parent} onChange={setParent} />
          <div className="tm-sign"><button className={tab === 'suggest' ? 'on' : ''} onClick={() => setTab('suggest')}>Đề xuất chuyển</button><button className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>Đề nghị đã chốt</button></div>
        </div>
        {parent && (tab === 'suggest' ? <DeXuat parent={parent} onDone={() => setTab('list')} /> : <DaChot parent={parent} />)}
      </div>
    </>
  );
}

function DeXuat({ parent, onDone }: { parent: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [wh, setWh] = useState('');
  const [edit, setEdit] = useState<Record<string, number>>({});
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [quick, setQuick] = useState<'' | 'short'>('');
  const exportRef = useRef<(() => void) | null>(null);
  const q = useQuery({ queryKey: ['ton-max', 'transfer-suggest', parent, wh], queryFn: () => stockApi.transferSuggest(parent, wh || undefined) });
  const lines = q.data?.lines ?? [];
  const qty = (l: TransferSuggestLine) => edit[lk(l)] ?? l.qty;
  const rows = useMemo(() => {
    const out: Row[] = [];
    let last = '';
    for (const l of [...lines].filter((x) => quick !== 'short' || x.short > 0).sort((a, b) => a.shopCode.localeCompare(b.shopCode) || a.sku.localeCompare(b.sku))) {
      if (l.shopCode !== last) { out.push({ ...l, _group: true, _key: `g:${l.shopCode}` }); last = l.shopCode; }
      out.push({ ...l, _key: lk(l) });
    }
    return out;
  }, [lines, quick]);
  const picked = lines.filter((l) => !off[lk(l)] && qty(l) > 0);
  const shops = new Set(picked.map((l) => l.shopCode));
  const cols: Column<Row>[] = [
    { key: 'pick', header: '', width: 34, noFilter: true, noSort: true, render: (l) => <input type="checkbox" checked={!off[lk(l)]} onChange={(e) => setOff({ ...off, [lk(l)]: !e.target.checked })} /> },
    { key: 'sku', header: 'Mã hàng', type: 'code', width: 110 },
    { key: 'name', header: 'Tên hàng', width: 200 },
    { key: 'max', header: 'Max shop', type: 'qty', width: 74, className: 'tm-max' },
    { key: 'ton', header: 'Tồn shop', type: 'qty', width: 74, className: 'tm-stock', showZero: true },
    { key: 'diDuong', header: 'Đi đường + đã đề nghị', type: 'qty', width: 92, render: (l) => <span title={`Đang đi đường ${qtyFmt(l.diDuong - l.reserved)} · đề nghị đã chốt chưa làm ${qtyFmt(l.reserved)}`}>{qtyFmt(l.diDuong) || ''}</span> },
    { key: 'gap', header: 'Thiếu', type: 'qty', width: 70, className: 'tm-need' },
    { key: 'mode', header: 'Làm tròn', width: 100, value: (l) => TRANSFER_MODES.find((m) => m.key === l.mode)?.label ?? l.mode, render: (l) => <span title={TRANSFER_MODES.find((m) => m.key === l.mode)?.hint}>{TRANSFER_MODES.find((m) => m.key === l.mode)?.label}{l.pack ? ` · ${l.pack}/${l.packUnit}` : ''}</span> },
    { key: 'qty', header: 'Chuyển', type: 'qty', width: 160, value: (l) => qty(l), sum: true, render: (l) => <span><input className={`tm-input${edit[lk(l)] !== undefined ? ' dirty' : ''}`} value={qty(l) || ''} onChange={(e) => setEdit({ ...edit, [lk(l)]: num(e.target.value) })} />{l.pack && qty(l) >= l.pack ? <span className="muted" style={{ fontSize: 10.5, marginLeft: 4 }}>{Math.floor(qty(l) / l.pack)} {l.packUnit}{qty(l) % l.pack ? ` + ${qty(l) % l.pack} ${l.baseUnit}` : ''}</span> : null}</span> },
    { key: 'short', header: 'Thiếu do kho hết', type: 'qty', width: 90, render: (l) => (l.short ? <span className="tm-low" title={`Muốn chuyển ${qtyFmt(l.want)}, kho chỉ còn đủ ${qtyFmt(l.qty)}`}>{qtyFmt(l.short)}</span> : '') },
    { key: 'khoTon', header: 'Tồn kho (trước chia)', type: 'qty', width: 90, className: 'tm-ref' },
  ];
  const commit = async () => {
    setBusy(true); setMsg(null);
    try {
      const by = new Map<string, TransferSuggestLine[]>();
      for (const l of picked) by.set(l.shopCode, [...(by.get(l.shopCode) ?? []), l]);
      const r = await stockApi.createTransfers({ fromBranch: parent, fromWarehouse: q.data?.fromWarehouse, shops: [...by].map(([s, ls]) => ({ toBranch: s, toWarehouse: ls[0]!.toWarehouse, lines: ls.map((l) => ({ sku: l.sku, name: l.name, unit: l.baseUnit, qty: qty(l), pack: l.pack, packUnit: l.packUnit })) })) });
      setEdit({}); setOff({});
      setMsg({ ok: true, text: `Đã chốt ${r.codes.length} đề nghị chuyển (${r.codes.join(', ')}).` });
      await qc.invalidateQueries({ queryKey: ['ton-max'] });
      onDone();
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="tm-bar" style={{ paddingTop: 0 }}>
        <label className="tm-parent"><span>Xuất từ kho</span>
          <select className="select input" style={{ minWidth: 200 }} value={wh || q.data?.fromWarehouse || ''} onChange={(e) => setWh(e.target.value)}>
            {(q.data?.warehouses ?? []).map((w) => <option key={w.code} value={w.code}>{w.code} · {w.name}{w.isDefault ? ' (mặc định)' : ''}</option>)}
          </select></label>
        <span className="muted" style={{ fontSize: 12 }}>Tự động: thiếu từ {Math.round((q.data?.threshold ?? 0.5) * 100)}% thùng trở lên thì lên nguyên thùng (đổi ở Công thức đặt hàng).</span>
        <span className="grow" />
        <button className="btn btn-sm" onClick={() => exportRef.current?.()}><FileSpreadsheet size={14} /> Xuất Excel</button>
        <button className="btn btn-primary" disabled={!picked.length || busy} onClick={() => void commit()}><Send size={14} /> Chốt đề nghị ({shops.size} shop · {picked.length} dòng)</button>
      </div>
      <div className="tm-stats">
        <KhoiSo label="Shop cần chia hàng" value={new Set(lines.map((l) => l.shopCode)).size} tone="green" />
        <KhoiSo label="Dòng đề xuất" value={lines.length} active={quick === ''} onClick={() => setQuick('')} />
        <KhoiSo label="Tổng SL chuyển" value={qtyFmt(picked.reduce((s, l) => s + qty(l), 0))} tone="orange" />
        <KhoiSo label="Dòng thiếu do kho hết" value={lines.filter((l) => l.short > 0).length} tone="red" active={quick === 'short'} onClick={() => setQuick('short')} hint="Kho không đủ — nên đặt mua thêm (Phân tích đặt hàng)" />
      </div>
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'}`} style={{ margin: '0 12px 8px' }}>{msg.text}</div>}
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {q.isLoading ? <Loading /> : <div className="tm-grid"><DataGrid rows={rows} columns={cols} rowKey={(r) => r._key} storageKey="chuyen-shop-de-xuat" exportRef={exportRef} exportName={`de-xuat-chuyen-${parent}-${today()}`}
        rowKind={(r) => (r._group ? 'group' : 'data')} groupLabel={(r) => <b>{r.shopCode} · {r.shopName} <span className="muted" style={{ fontWeight: 400 }}>→ kho {r.toWarehouse}</span></b>}
        emptyText="Không shop nào thiếu hàng so với tồn max (hoặc chưa khai max cho shop — mở Tồn max MH16)." /></div>}
    </>
  );
}

function DaChot({ parent }: { parent: string }) {
  const qc = useQueryClient();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [status, setStatus] = useState('open');
  const [open, setOpen] = useState<TransferRequest | null>(null);
  const [err, setErr] = useState('');
  const q = useQuery({ queryKey: ['ton-max', 'transfer-requests', parent, from, to, status], queryFn: () => stockApi.transferRequests({ from, to, status: status || undefined, branchCode: parent }) });
  const act = async (r: TransferRequest, a: 'done' | 'cancel' | 'reopen') => {
    try { await stockApi.transferStatus(r.id, a); setOpen(null); await qc.invalidateQueries({ queryKey: ['ton-max'] }); } catch (e) { setErr(errorText(e)); }
  };
  const exportOne = async (r: TransferRequest) => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([[`ĐỀ NGHỊ CHUYỂN HÀNG ${r.code}`], [`Từ: ${r.fromBranch} ${r.fromName} (kho ${r.fromWarehouse}) → ${r.toBranch} ${r.toName} (kho ${r.toWarehouse})`], [], ['STT', 'Mã hàng', 'Tên hàng', 'ĐVT', 'Số lượng', 'Quy đổi thùng', 'Ghi chú'],
      ...r.lines.map((l, i) => [i + 1, l.sku, l.name, l.unit, l.qty, l.pack ? `${Math.floor(l.qty / l.pack)} ${l.packUnit}${l.qty % l.pack ? ` + ${l.qty % l.pack} ${l.unit}` : ''}` : '', l.note ?? ''])]);
    ws['!cols'] = [{ wch: 5 }, { wch: 14 }, { wch: 44 }, { wch: 8 }, { wch: 10 }, { wch: 18 }, { wch: 24 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'De nghi'); XLSX.writeFile(wb, `${r.code}.xlsx`);
  };
  const cols: Column<TransferRequest>[] = [
    { key: 'code', header: 'Số đề nghị', type: 'code', width: 120 },
    { key: 'createdAt', header: 'Ngày chốt', width: 130, value: (r) => r.createdAt, render: (r) => new Date(r.createdAt).toLocaleString('vi-VN') },
    { key: 'toBranch', header: 'Shop nhận', width: 200, value: (r) => `${r.toBranch} ${r.toName}`, render: (r) => <><b className="mono">{r.toBranch}</b> {r.toName}</> },
    { key: 'fromWarehouse', header: 'Xuất từ kho', type: 'code', width: 90 },
    { key: 'lineCount', header: 'Số dòng', type: 'number', width: 70, sum: true },
    { key: 'qty', header: 'Tổng SL', type: 'qty', width: 80, sum: true },
    { key: 'status', header: 'Trạng thái', width: 120, value: (r) => STATUS[r.status], render: (r) => <span className={`tm-chip ${r.status === 'done' ? 'ok' : r.status === 'open' ? 'warn' : 'bad'}`}>{STATUS[r.status]}</span> },
    { key: 'createdBy', header: 'Người chốt', width: 120 },
    { key: 'doneBy', header: 'Người lên phiếu', width: 120 },
  ];
  return (
    <>
      <div className="tm-bar" style={{ paddingTop: 0 }}>
        <label className="tm-parent"><span>Từ</span><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="tm-parent"><span>Đến</span><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <select className="select input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="open">Chờ lên phiếu</option><option value="done">Đã lên phiếu</option><option value="cancelled">Đã huỷ</option><option value="">Tất cả</option></select>
        <span className="muted" style={{ fontSize: 12 }}>Kho / POS đọc danh sách này qua API <code>GET /api/v1/stock/transfer-requests?status=open</code>.</span>
      </div>
      {err && <div className="alert alert-bad" style={{ margin: '0 12px 8px' }}>{err}</div>}
      {q.isLoading ? <Loading /> : <DataGrid rows={q.data ?? []} columns={cols} rowKey={(r) => r.id} storageKey="chuyen-shop-da-chot" onRowClick={setOpen} exportName={`de-nghi-chuyen-${parent}`} emptyText="Chưa có đề nghị nào trong khoảng ngày này." />}
      {open && <Modal wide title={`Đề nghị chuyển ${open.code} → ${open.toBranch} ${open.toName}`} onClose={() => setOpen(null)} footer={<>
        {open.status === 'open' && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => void act(open, 'cancel')}>Huỷ đề nghị</button>}
        {open.status !== 'open' && <button className="btn" style={{ marginRight: 'auto' }} onClick={() => void act(open, 'reopen')}>Mở lại</button>}
        <button className="btn" onClick={() => void exportOne(open)}><FileSpreadsheet size={14} /> Xuất Excel</button>
        {open.status === 'open' && <button className="btn btn-primary" onClick={() => void act(open, 'done')}>Đã lên phiếu chuyển</button>}
        <button className="btn" onClick={() => setOpen(null)}>Đóng</button></>}>
        <div className="full muted" style={{ fontSize: 12.5 }}>Từ {open.fromBranch} {open.fromName} (kho {open.fromWarehouse}) · chốt bởi {open.createdBy} lúc {new Date(open.createdAt).toLocaleString('vi-VN')}{open.doneBy ? ` · ${STATUS[open.status].toLowerCase()} bởi ${open.doneBy}` : ''}</div>
        <div className="full"><table className="mh-mini"><thead><tr><th>#</th><th>Mã</th><th>Tên hàng</th><th className="num">SL</th><th>ĐVT</th><th>Quy đổi</th></tr></thead><tbody>
          {open.lines.map((l, i) => <tr key={l.sku}><td>{i + 1}</td><td className="mono">{l.sku}</td><td>{l.name}</td><td className="num">{qtyFmt(l.qty)}</td><td>{l.unit}</td><td>{l.pack ? `${Math.floor(l.qty / l.pack)} ${l.packUnit}${l.qty % l.pack ? ` + ${l.qty % l.pack}` : ''}` : ''}</td></tr>)}
        </tbody></table></div>
      </Modal>}
    </>
  );
}
