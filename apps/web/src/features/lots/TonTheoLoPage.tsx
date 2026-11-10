// [2026-11-10 06:30 PM Nguyễn Văn Thủy] PHASE-026 — tồn theo lô: hạn dùng, tên hàng lúc mua, tồn từng chi nhánh, thẻ lô, tên kê khai theo phiếu (đóng góp)
/**
 * TỒN THEO LÔ (KHO05) — lô theo số lô + hạn dùng của nhà cung cấp, giữ TÊN HÀNG LÚC MUA.
 *   Hàng ra tự động lấy lô hạn sớm trước; khách trả về đúng lô đã bán; chuyển kho mang theo lô. Giá vốn vẫn bình quân.
 *   Thẻ "Tồn theo lô": lọc mã / tên / số lô, chi nhánh, sắp hết hạn; bấm lô xem thẻ lô.
 *   Thẻ "Lô theo phiếu": nhập mã phiếu → từng dòng lấy từ lô nào, tên lúc mua của lô (tra cứu). Hoá đơn vẫn theo dòng bán như bill.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading, Modal } from '@/components/ui';
import './ton-theo-lo.css';

interface Lot {
  id: string; sku: string; skuAtLot: string; name: string; lotNo: string; expDate: string | null; daysLeft: number | null; purchaseName: string; purchaseUnit: string;
  namesSeen: { name: string; docNo: string; date: string | null }[]; nameChanged: boolean; firstDocNo: string; firstDate: string | null; qtyIn: number; qtyOut: number; stock: number;
  branches: { code: string; warehouse: string; qty: number }[];
}
interface Move { doc_date: string; doc_no: string; doc_key: string; doc_type: string; branch: string; warehouse_code: string; kind: string; qty: number; how: string }
interface DocLots { docKey: string; docNo: string; docType: string; docDate: string; lines: { lineNo: number; sku: string; name: string; unit: string; qty: number; lots: { lotId: string; lotNo: string; expDate: string | null; purchaseName: string; qty: number; how: string }[]; lotNames: string[]; nameDiffers: boolean }[] }
interface Branch { code: string; name: string }

const num = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 4 });
const viDate = (d: string | null) => (d ? d.split('-').reverse().join('/') : '');
const HOW: Record<string, string> = { line: 'theo số lô trên phiếu', fifo: 'tự động: hạn sớm trước', return: 'trả về lô đã bán', transfer: 'theo lô bên xuất', shortage: 'thiếu tồn lô', nolot: 'không số lô' };
const KIND: Record<string, string> = { purchase: 'Nhập mua', purchase_return: 'Trả NCC', sale: 'Bán', sale_return: 'Khách trả', transfer_out: 'Xuất chuyển', transfer_in: 'Nhận chuyển', adjust_in: 'Nhập điều chỉnh', adjust_out: 'Xuất điều chỉnh' };

function expClass(d: number | null) {
  if (d === null) return '';
  if (d < 0) return 'ttl-exp is-expired';
  if (d <= 30) return 'ttl-exp is-soon';
  if (d <= 90) return 'ttl-exp is-near';
  return 'ttl-exp';
}

function TheLo({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const q = useQuery({ queryKey: ['lots', 'moves', lot.id], queryFn: () => api.get<Move[]>(`/api/v1/lots/${lot.id}/moves`) });
  let run = 0;
  return (
    <Modal title={`Thẻ lô ${lot.lotNo || '(không số)'} — ${lot.sku}`} onClose={onClose} wide footer={<button className="btn" onClick={onClose}>Thoát</button>}>
      <div className="ttl-lot-head full">
        <div><span>Tên lúc mua</span><b>{lot.purchaseName || '—'}</b></div>
        <div><span>Tên trong danh mục</span><b>{lot.name}</b></div>
        <div><span>Hạn dùng</span><b>{viDate(lot.expDate) || 'không có'}</b></div>
        <div><span>Nhập đầu</span><b>{lot.firstDocNo} {viDate(lot.firstDate)}</b></div>
        <div><span>Tồn</span><b>{num(lot.stock)}</b></div>
      </div>
      {lot.namesSeen.length > 0 && <div className="alert alert-info full">Nhập thêm cùng lô với tên khác: {lot.namesSeen.map((n) => `"${n.name}" (${n.docNo})`).join(', ')}. Kê khai vẫn theo tên lúc mua đầu tiên.</div>}
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {q.isLoading ? <Loading /> : (
        <div className="table-wrap full" style={{ maxHeight: 420, overflow: 'auto' }}><table className="grid">
          <thead><tr><th title="Ngày chứng từ">Ngày</th><th title="Số phiếu">Phiếu</th><th title="Loại hàng vào / ra">Loại</th><th title="Chi nhánh / kho">Nơi</th><th className="num" title="Vào (+) / ra (−)">SL</th><th className="num" title="Tồn lô cộng dồn">Tồn</th><th title="Cách chọn lô">Cách chọn lô</th></tr></thead>
          <tbody>{(q.data ?? []).map((m, i) => { run += m.qty; return (
            <tr key={i}><td>{viDate(m.doc_date)}</td><td className="mono">{m.doc_no}</td><td>{KIND[m.kind] ?? m.kind}</td><td className="mono">{m.branch}{m.warehouse_code ? ` · ${m.warehouse_code}` : ''}</td>
              <td className={`num ${m.qty < 0 ? 'neg' : ''}`}>{num(m.qty)}</td><td className="num">{num(Math.round(run * 10000) / 10000)}</td><td className="muted">{HOW[m.how] ?? m.how}</td></tr>
          ); })}</tbody>
        </table></div>
      )}
    </Modal>
  );
}

function TonLo() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [branch, setBranch] = useState('');
  const [onlyStock, setOnlyStock] = useState(true);
  const [exp, setExp] = useState('');
  const [open, setOpen] = useState<Lot | null>(null);
  const branches = useQuery({ queryKey: ['branches'], queryFn: () => api.get<Branch[]>('/api/v1/branches'), staleTime: 60_000 }).data ?? [];
  const params = { ...(search.trim() ? { search: search.trim() } : {}), ...(branch ? { branchCode: branch } : {}), ...(onlyStock ? { stock: '1' } : {}), ...(exp ? { expWithin: exp } : {}) };
  const q = useQuery({ queryKey: ['lots', params], queryFn: () => api.get<Lot[]>('/api/v1/lots', params) });
  const rebuild = useMutation({ mutationFn: () => api.post<{ documents: number }>('/api/v1/lots/rebuild', {}), onSuccess: () => qc.invalidateQueries({ queryKey: ['lots'] }) });
  const rows = q.data ?? [];
  return (
    <div>
      <div className="ttl-toolbar">
        <input className="input" style={{ width: 260 }} placeholder="Mã, tên, tên lúc mua, số lô" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="select input" value={branch} onChange={(e) => setBranch(e.target.value)} title="Tồn ở chi nhánh"><option value="">Mọi chi nhánh</option>{branches.map((b) => <option key={b.code} value={b.code}>{b.code} — {b.name}</option>)}</select>
        <select className="select input" value={exp} onChange={(e) => setExp(e.target.value)} title="Lọc lô sắp hết hạn">
          <option value="">Mọi hạn dùng</option><option value="0">Đã hết hạn</option><option value="30">Hết hạn trong 30 ngày</option><option value="90">Trong 90 ngày</option><option value="180">Trong 180 ngày</option>
        </select>
        <label className="checkbox"><input type="checkbox" checked={onlyStock} onChange={(e) => setOnlyStock(e.target.checked)} /> Chỉ lô còn tồn</label>
        <span style={{ flex: 1 }} />
        <button className="btn btn-sm" disabled={rebuild.isPending} onClick={() => { if (window.confirm('Phân lô lại toàn bộ theo đúng thứ tự ngày chứng từ? (dùng khi phiếu về muộn hoặc vừa sửa ngày)')) rebuild.mutate(); }}
          title="Chứng từ về muộn / sửa ngày làm thứ tự xuất lô lệch: chạy lại theo thứ tự ngày. Không đổi sổ, không đổi giá vốn"><RefreshCw size={13} /> {rebuild.isPending ? 'Đang phân lô…' : 'Phân lô lại'}</button>
      </div>
      <ErrorBox error={q.error ? errorText(q.error) : rebuild.error ? errorText(rebuild.error) : null} />
      {rebuild.data && <div className="alert alert-ok">Đã phân lô lại {rebuild.data.documents} chứng từ.</div>}
      {q.isLoading ? <Loading /> : (
        <div className="table-wrap"><table className="grid">
          <thead><tr>
            <th title="Mã hàng hiện tại (đổi mã vẫn cùng lô — theo định danh)">Mã</th><th title="Tên trong danh mục hiện tại">Tên</th><th title="Số lô của nhà cung cấp">Số lô</th>
            <th title="Hạn dùng; đỏ = đã hết hạn, cam ≤ 30 ngày, vàng ≤ 90 ngày">Hạn dùng</th><th className="num" title="Còn bao nhiêu ngày">Còn ngày</th>
            <th title="Tên hàng lúc mua — tên kê khai khi bán ra lô này">Tên lúc mua (kê khai)</th><th className="num" title="Tổng đã nhập vào lô">Nhập</th><th className="num" title="Tổng đã xuất khỏi lô">Xuất</th>
            <th className="num" title="Tồn của lô">Tồn</th><th title="Tồn từng chi nhánh · kho">Nơi còn</th><th title="Phiếu nhập đầu tiên">Nhập đầu</th>
          </tr></thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} className="clickable" onClick={() => setOpen(l)}>
                <td className="mono">{l.sku}</td>
                <td>{l.name}</td>
                <td className="mono">{l.lotNo || <span className="muted">không số</span>}</td>
                <td><span className={expClass(l.daysLeft)}>{viDate(l.expDate) || '—'}</span></td>
                <td className="num">{l.daysLeft ?? ''}</td>
                <td title={l.namesSeen.length ? `Tên khác đã gặp: ${l.namesSeen.map((n) => n.name).join(' | ')}` : ''}>{l.purchaseName}{(l.nameChanged || l.namesSeen.length > 0) && <span className="ttl-flag" title="Tên lúc mua khác tên danh mục / có tên khác đã gặp">khác tên</span>}</td>
                <td className="num">{num(l.qtyIn)}</td><td className="num">{num(l.qtyOut)}</td>
                <td className={`num ${l.stock < 0 ? 'neg' : ''}`}><b>{num(l.stock)}</b></td>
                <td className="mono ttl-where">{l.branches.map((b) => `${b.code}${b.warehouse ? `/${b.warehouse}` : ''}: ${num(b.qty)}`).join(' · ')}</td>
                <td className="mono">{l.firstDocNo} <span className="muted">{viDate(l.firstDate)}</span></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={11} className="muted">Không có lô nào. Lô sinh ra khi phiếu nhập ghi số lô / hạn dùng của nhà cung cấp.</td></tr>}
          </tbody>
        </table></div>
      )}
      {open && <TheLo lot={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function TenKeKhai() {
  const [docKey, setDocKey] = useState('');
  const [key, setKey] = useState('');
  const q = useQuery({ queryKey: ['lots', 'doc', key], queryFn: () => api.get<DocLots>('/api/v1/lots/document', { docKey: key }), enabled: Boolean(key) });
  const d = q.data;
  return (
    <div>
      <div className="ttl-toolbar">
        <input className="input mono" style={{ width: 320 }} placeholder="Khoá phiếu (docKey), vd pos:CN01:HD0001" value={docKey} onChange={(e) => setDocKey(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') setKey(docKey.trim()); }} />
        <button className="btn btn-primary btn-sm" onClick={() => setKey(docKey.trim())} disabled={!docKey.trim()}>Xem</button>
        <span className="muted" style={{ fontSize: 12 }}>Mỗi dòng lấy từ lô nào và tên lúc mua của lô. Hoá đơn vẫn theo dòng bán như bill ở cửa hàng.</span>
      </div>
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {q.isLoading && key && <Loading />}
      {d && (
        <div className="table-wrap"><table className="grid">
          <thead><tr><th title="Dòng phiếu">#</th><th title="Mã hàng">Mã</th><th title="Tên trên phiếu">Tên trên phiếu</th><th className="num" title="Số lượng">SL</th><th title="Lô đã lấy">Lô</th><th title="Tên hàng lúc mua của các lô dòng này lấy (tra cứu)">Tên lúc mua của lô</th></tr></thead>
          <tbody>{d.lines.map((l) => (
            <tr key={l.lineNo} className={l.nameDiffers ? 'is-warn' : ''}>
              <td>{l.lineNo}</td><td className="mono">{l.sku}</td><td>{l.name}</td><td className="num">{num(l.qty)}</td>
              <td>{l.lots.map((x) => <div key={x.lotId}>{x.lotNo || 'không số'} {x.expDate ? `(HSD ${viDate(x.expDate)})` : ''}: <b>{num(x.qty)}</b> <span className="muted">· {HOW[x.how] ?? x.how}</span></div>)}</td>
              <td>{l.lotNames.map((n) => <div key={n}>{n}</div>)}{l.nameDiffers && <span className="ttl-flag" title="Tên lúc mua khác tên trên dòng bán">khác tên</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

export function TonTheoLoPage() {
  const [tab, setTab] = useState<'ton' | 'ke-khai'>('ton');
  return (
    <div className="page">
      <PageHeader title="Tồn theo lô" code="KHO05" helpKey="kho-ton-theo-lo"
        subtitle="Lô theo số lô + hạn dùng của nhà cung cấp, giữ tên hàng lúc mua; hàng ra tự lấy lô hạn sớm trước; khách trả về đúng lô; giá vốn vẫn bình quân" />
      <div className="tabs" role="tablist" style={{ marginBottom: 8 }}>
        <button role="tab" className={`tab ${tab === 'ton' ? 'active' : ''}`} onClick={() => setTab('ton')}>Tồn theo lô</button>
        <button role="tab" className={`tab ${tab === 'ke-khai' ? 'active' : ''}`} onClick={() => setTab('ke-khai')} title="Phiếu lấy hàng từ lô nào, tên lúc mua của lô">Lô theo phiếu</button>
      </div>
      {tab === 'ton' ? <TonLo /> : <TenKeKhai />}
    </div>
  );
}
