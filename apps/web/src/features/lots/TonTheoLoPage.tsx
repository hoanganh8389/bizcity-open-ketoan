// [2026-11-10 06:30 PM Nguyễn Văn Thủy] PHASE-026 — tồn theo lô: hạn dùng, tên hàng lúc mua, tồn từng chi nhánh, thẻ lô, tên kê khai theo phiếu (đóng góp)
// [2026-11-10 09:30 PM Nguyễn Văn Thủy] PHASE-026 — lô theo từng phân kho; bảng lọc trái chi nhánh + mã kho; lô theo phiếu chọn từ danh sách (đóng góp)
/**
 * TỒN THEO LÔ (KHO05) — lô theo số lô + hạn dùng của nhà cung cấp, giữ TÊN HÀNG LÚC MUA, quản lý theo TỪNG PHÂN KHO.
 *   Hàng ra tự động lấy lô hạn sớm trước ở đúng chi nhánh + kho; khách trả về đúng lô đã bán; chuyển kho mang theo lô. Giá vốn vẫn bình quân.
 *   Thẻ "Tồn theo lô": bảng lọc trái (chi nhánh, mã kho, hạn dùng, mã / tên / số lô); mỗi dòng = một lô ở một chi nhánh · kho.
 *     Bấm dòng xem thẻ lô ở kho đó (có nút xem mọi nơi). Bấm số phiếu trong thẻ lô → xem phiếu đó lấy lô nào.
 *   Thẻ "Lô theo phiếu": danh sách phiếu có hàng đi theo lô (lọc ngày, chi nhánh / kho, loại, số phiếu / mã) → bấm phiếu xem từng dòng.
 *   Hoá đơn vẫn theo dòng bán như bill.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';
import { DataGrid } from '@/components/DataGrid';
import { ErrorBox, Loading, Modal } from '@/components/ui';
import './ton-theo-lo.css';

interface LotRow {
  id: string; sku: string; skuAtLot: string; name: string; lotNo: string; expDate: string | null; daysLeft: number | null; purchaseName: string; purchaseUnit: string;
  namesSeen: { name: string; docNo: string; date: string | null }[]; nameChanged: boolean; firstDocNo: string; firstDate: string | null; qtyIn: number; qtyOut: number; stock: number;
  branch: string; branchName: string; warehouse: string; warehouseName: string;
}
interface Move { doc_date: string; doc_no: string; doc_key: string; doc_type: string; branch: string; warehouse_code: string; kind: string; qty: number; how: string }
interface LotPick { lotId: string; lotNo: string; expDate: string | null; purchaseName: string; qty: number; how: string; branch: string; warehouse: string; dir: 'in' | 'out' }
interface DocLots { docKey: string; docNo: string; docType: string; docDate: string; lines: { lineNo: number; sku: string; name: string; unit: string; qty: number; lots: LotPick[]; lotNames: string[]; nameDiffers: boolean }[] }
interface DocRow { docKey: string; docNo: string; docType: string; docDate: string; branch: string; places: string[]; lines: number; lots: number; multiLot: boolean; nameDiffers: boolean }

const num = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 4 });
const viDate = (d: string | null) => (d ? d.split('-').reverse().join('/') : '');
const HOW: Record<string, string> = { line: 'theo số lô trên phiếu', fifo: 'tự động: hạn sớm trước', return: 'trả về lô đã bán', transfer: 'theo lô bên xuất', shortage: 'thiếu tồn lô', nolot: 'không số lô' };
const KIND: Record<string, string> = { purchase: 'Nhập mua', purchase_return: 'Trả NCC', sale: 'Bán', sale_return: 'Khách trả', transfer_out: 'Xuất chuyển', transfer_in: 'Nhận chuyển', adjust_in: 'Nhập điều chỉnh', adjust_out: 'Xuất điều chỉnh' };
const DOC_TYPE: Record<string, string> = { purchase: 'Phiếu nhập mua', purchase_return: 'Trả hàng NCC', sale: 'Phiếu bán', sale_return: 'Khách trả hàng', transfer: 'Chuyển kho', stock_adjustment: 'Điều chỉnh kho' };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monthStart = () => { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth(), 1)); };
const place = (branch: string, wh: string) => `${branch}${wh ? ` · ${wh}` : ''}`;

function expClass(d: number | null) {
  if (d === null) return '';
  if (d < 0) return 'ttl-exp is-expired';
  if (d <= 30) return 'ttl-exp is-soon';
  if (d <= 90) return 'ttl-exp is-near';
  return 'ttl-exp';
}

type OpenDoc = (docKey: string, docNo: string) => void;

/** Thẻ lô: mặc định ở đúng chi nhánh + kho của dòng đã bấm; "Mọi nơi" để xem lô đi qua mọi kho. */
function TheLo({ lot, onClose, onOpenDoc }: { lot: LotRow; onClose: () => void; onOpenDoc: OpenDoc }) {
  const [all, setAll] = useState(false);
  const params = all ? {} : { branchCode: lot.branch, warehouse: lot.warehouse };
  const q = useQuery({ queryKey: ['lots', 'moves', lot.id, params], queryFn: () => api.get<Move[]>(`/api/v1/lots/${lot.id}/moves`, params) });
  let run = 0;
  return (
    <Modal title={`Thẻ lô ${lot.lotNo || '(không số)'} — ${lot.sku}`} onClose={onClose} wide footer={<button className="btn" onClick={onClose}>Thoát</button>}>
      <div className="ttl-lot-head full">
        <div><span>Tên lúc mua</span><b>{lot.purchaseName || '—'}</b></div>
        <div><span>Tên trong danh mục</span><b>{lot.name}</b></div>
        <div><span>Hạn dùng</span><b>{viDate(lot.expDate) || 'không có'}</b></div>
        <div><span>Chi nhánh · kho</span><b>{place(lot.branch, lot.warehouse)}</b></div>
        <div><span>Tồn ở kho này</span><b>{num(lot.stock)}</b></div>
      </div>
      {lot.namesSeen.length > 0 && <div className="alert alert-info full">Nhập thêm cùng lô với tên khác: {lot.namesSeen.map((n) => `"${n.name}" (${n.docNo})`).join(', ')}. Kê khai vẫn theo tên lúc mua đầu tiên.</div>}
      <div className="ttl-toolbar full" style={{ border: 0, padding: '0 0 6px' }}>
        <button type="button" className={`btn btn-sm ${!all ? 'btn-primary' : ''}`} onClick={() => setAll(false)} title="Chỉ phát sinh của lô ở chi nhánh · kho này">Ở {place(lot.branch, lot.warehouse)}</button>
        <button type="button" className={`btn btn-sm ${all ? 'btn-primary' : ''}`} onClick={() => setAll(true)} title="Lô này vào / ra ở mọi chi nhánh, mọi kho">Mọi nơi</button>
        <span className="muted" style={{ fontSize: 12 }}>Bấm số phiếu để xem phiếu đó lấy lô nào.</span>
      </div>
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {q.isLoading ? <Loading /> : (
        <div className="table-wrap full" style={{ maxHeight: 420, overflow: 'auto' }}><table className="grid">
          <thead><tr><th title="Ngày chứng từ">Ngày</th><th title="Số phiếu — bấm để xem phiếu lấy lô nào">Phiếu</th><th title="Loại hàng vào / ra">Loại</th><th title="Chi nhánh · kho">Nơi</th><th className="num" title="Vào (+) / ra (−)">SL</th><th className="num" title="Tồn lô cộng dồn (trong phạm vi đang xem)">Tồn</th><th title="Cách chọn lô">Cách chọn lô</th></tr></thead>
          <tbody>{(q.data ?? []).map((m, i) => { run += m.qty; return (
            <tr key={i}><td>{viDate(m.doc_date)}</td>
              <td className="mono"><button type="button" className="ttl-link" title="Xem phiếu này lấy lô nào" onClick={() => onOpenDoc(m.doc_key, m.doc_no)}>{m.doc_no}</button></td>
              <td>{KIND[m.kind] ?? m.kind}</td><td className="mono">{place(m.branch, m.warehouse_code)}</td>
              <td className={`num ${m.qty < 0 ? 'neg' : ''}`}>{num(m.qty)}</td><td className="num">{num(Math.round(run * 10000) / 10000)}</td><td className="muted">{HOW[m.how] ?? m.how}</td></tr>
          ); })}</tbody>
        </table></div>
      )}
    </Modal>
  );
}

function TonLo({ onOpenDoc }: { onOpenDoc: OpenDoc }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ branchCodes: '', warehouses: '', search: '', exp: '', onlyStock: true });
  const set = (p: Partial<typeof f>) => setF((o) => ({ ...o, ...p }));
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<LotRow | null>(null);
  const params = {
    split: '1',
    ...(f.branchCodes && f.branchCodes !== '-' ? { branchCodes: f.branchCodes } : {}),
    ...(f.warehouses ? { warehouses: f.warehouses } : {}),
    ...(f.search ? { search: f.search } : {}),
    ...(f.onlyStock ? { stock: '1' } : {}),
    ...(f.exp ? { expWithin: f.exp } : {}),
  };
  const q = useQuery({ queryKey: ['lots', params], queryFn: () => api.get<LotRow[]>('/api/v1/lots', params) });
  const rebuild = useMutation({ mutationFn: () => api.post<{ documents: number }>('/api/v1/lots/rebuild', {}), onSuccess: () => qc.invalidateQueries({ queryKey: ['lots'] }) });
  const rows = q.data ?? [];
  return (
    <FilterLayout
      onSearch={() => set({ search: search.trim() })}
      filters={
        <form className="rp-form" onSubmit={(e) => { e.preventDefault(); set({ search: search.trim() }); }}>
          <div className="field"><label>Mã / tên / số lô</label><input className="input" placeholder="Mã, tên, tên lúc mua, số lô" value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => set({ search: search.trim() })} /></div>
          <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} warehouses={{ value: f.warehouses, onChange: (warehouses) => set({ warehouses }) }} />
          <div className="field"><label>Hạn dùng</label>
            <select className="select input" value={f.exp} onChange={(e) => set({ exp: e.target.value })} title="Lọc lô sắp hết hạn">
              <option value="">Mọi hạn dùng</option><option value="0">Đã hết hạn</option><option value="30">Hết hạn trong 30 ngày</option><option value="90">Trong 90 ngày</option><option value="180">Trong 180 ngày</option>
            </select>
          </div>
          <label className="checkbox"><input type="checkbox" checked={f.onlyStock} onChange={(e) => set({ onlyStock: e.target.checked })} /> Chỉ lô còn tồn</label>
        </form>
      }
    >
      <div className="card">
        <div className="ttl-toolbar">
          <span className="muted" style={{ fontSize: 12 }}>Mỗi dòng là một lô ở một chi nhánh · kho. Hàng ra tự lấy lô hạn sớm trước <b>ở đúng kho đó</b>; dòng không ghi kho tính vào kho mặc định của chi nhánh.</span>
          <span style={{ flex: 1 }} />
          <button className="btn btn-sm" disabled={rebuild.isPending} onClick={() => { if (window.confirm('Phân lô lại toàn bộ theo đúng thứ tự ngày chứng từ? (dùng khi phiếu về muộn hoặc vừa sửa ngày)')) rebuild.mutate(); }}
            title="Chứng từ về muộn / sửa ngày làm thứ tự xuất lô lệch: chạy lại theo thứ tự ngày. Không đổi sổ, không đổi giá vốn"><RefreshCw size={13} /> {rebuild.isPending ? 'Đang phân lô…' : 'Phân lô lại'}</button>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : rebuild.error ? errorText(rebuild.error) : null} />
        {rebuild.data && <div className="alert alert-ok">Đã phân lô lại {rebuild.data.documents} chứng từ.</div>}
        {q.isLoading ? <Loading /> : (
          <DataGrid
            storageKey="kho05-lo-kho"
            rows={rows}
            rowKey={(l) => `${l.id}|${l.branch}|${l.warehouse}`}
            exportName="ton-theo-lo"
            onRowClick={(l) => setOpen(l)}
            emptyText="Không có lô nào. Lô sinh ra khi phiếu nhập ghi số lô / hạn dùng của nhà cung cấp."
            columns={[
              { key: 'sku', header: 'Mã', title: 'Mã hàng hiện tại (đổi mã vẫn cùng lô — theo định danh)', type: 'code' },
              { key: 'name', header: 'Tên', title: 'Tên trong danh mục hiện tại' },
              { key: 'lotNo', header: 'Số lô', title: 'Số lô của nhà cung cấp', type: 'code', render: (l) => l.lotNo || <span className="muted">không số</span> },
              { key: 'expDate', header: 'Hạn dùng', title: 'Hạn dùng; đỏ = đã hết hạn, cam ≤ 30 ngày, vàng ≤ 90 ngày', render: (l) => <span className={expClass(l.daysLeft)}>{viDate(l.expDate) || '—'}</span> },
              { key: 'daysLeft', header: 'Còn ngày', title: 'Còn bao nhiêu ngày tới hạn dùng', type: 'number', value: (l) => l.daysLeft },
              { key: 'branch', header: 'Chi nhánh', title: 'Chi nhánh đang giữ lô', type: 'code', render: (l) => <span title={l.branchName}>{l.branch}</span> },
              { key: 'warehouse', header: 'Kho', title: 'Phân kho đang giữ lô (trống = dòng chưa có mã kho và chi nhánh chưa khai kho mặc định)', type: 'code', render: (l) => <span title={l.warehouseName}>{l.warehouse || <span className="muted">—</span>}</span> },
              { key: 'purchaseName', header: 'Tên lúc mua', title: 'Tên hàng lúc mua của lô (tra cứu)', render: (l) => <>{l.purchaseName}{(l.nameChanged || l.namesSeen.length > 0) && <span className="ttl-flag" title={l.namesSeen.length ? `Tên khác đã gặp: ${l.namesSeen.map((n) => n.name).join(' | ')}` : 'Tên lúc mua khác tên danh mục'}>khác tên</span>}</> },
              { key: 'qtyIn', header: 'Nhập', title: 'Tổng đã vào lô ở kho này', type: 'qty', sum: true },
              { key: 'qtyOut', header: 'Xuất', title: 'Tổng đã ra khỏi lô ở kho này', type: 'qty', sum: true },
              { key: 'stock', header: 'Tồn', title: 'Tồn của lô ở chi nhánh · kho này (âm = bán quá tồn lô, thường do chưa có tồn đầu kỳ)', type: 'qty', sum: true, bold: true },
              { key: 'firstDocNo', header: 'Nhập đầu', title: 'Phiếu nhập đầu tiên của lô', type: 'code', render: (l) => <>{l.firstDocNo} <span className="muted">{viDate(l.firstDate)}</span></> },
            ]}
          />
        )}
      </div>
      {open && <TheLo lot={open} onClose={() => setOpen(null)} onOpenDoc={(k, n) => { setOpen(null); onOpenDoc(k, n); }} />}
    </FilterLayout>
  );
}

function ChiTietPhieu({ docKey }: { docKey: string }) {
  const q = useQuery({ queryKey: ['lots', 'doc', docKey], queryFn: () => api.get<DocLots>('/api/v1/lots/document', { docKey }) });
  const d = q.data;
  if (q.error) return <ErrorBox error={errorText(q.error)} />;
  if (!d) return <Loading />;
  return (
    <div className="table-wrap"><table className="grid">
      <thead><tr><th title="Dòng phiếu">#</th><th title="Mã hàng">Mã</th><th title="Tên trên phiếu">Tên trên phiếu</th><th className="num" title="Số lượng">SL</th><th title="Lô đã lấy, ở chi nhánh · kho nào, cách chọn lô">Lô · kho</th><th title="Tên hàng lúc mua của các lô dòng này lấy (tra cứu)">Tên lúc mua của lô</th></tr></thead>
      <tbody>{d.lines.map((l) => (
        <tr key={l.lineNo} className={l.nameDiffers ? 'is-warn' : ''}>
          <td>{l.lineNo}</td><td className="mono">{l.sku}</td><td>{l.name}</td><td className="num">{num(l.qty)}</td>
          <td>{l.lots.map((x, i) => (
            <div key={i}>
              {x.lotNo || 'không số'} {x.expDate ? `(HSD ${viDate(x.expDate)})` : ''}: <b>{num(x.qty)}</b>{' '}
              <span className="mono ttl-place" title={x.dir === 'out' ? 'Lấy ra từ kho này' : 'Vào kho này'}>{x.dir === 'out' ? 'từ' : 'vào'} {place(x.branch, x.warehouse)}</span>{' '}
              <span className="muted">· {HOW[x.how] ?? x.how}</span>
            </div>
          ))}</td>
          <td>{l.lotNames.map((n) => <div key={n}>{n}</div>)}{l.nameDiffers && <span className="ttl-flag" title="Tên lúc mua khác tên trên dòng bán">khác tên</span>}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

function LoTheoPhieu({ initial }: { initial?: { docKey: string; docNo: string } | null }) {
  const [f, setF] = useState({ from: initial ? '' : monthStart(), to: initial ? '' : ymd(new Date()), branchCodes: '', warehouses: '', docType: '', search: initial?.docNo ?? '' });
  const set = (p: Partial<typeof f>) => setF((o) => ({ ...o, ...p }));
  const [search, setSearch] = useState(f.search);
  const [picked, setPicked] = useState<string>(initial?.docKey ?? '');
  const params = {
    ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}),
    ...(f.branchCodes && f.branchCodes !== '-' ? { branchCodes: f.branchCodes } : {}), ...(f.warehouses ? { warehouses: f.warehouses } : {}),
    ...(f.search ? { search: f.search } : {}), ...(f.docType ? { docType: f.docType } : {}),
  };
  const q = useQuery({ queryKey: ['lots', 'docs', params], queryFn: () => api.get<DocRow[]>('/api/v1/lots/documents', params) });
  const rows = q.data ?? [];
  const cur = rows.find((r) => r.docKey === picked);
  return (
    <FilterLayout
      onSearch={() => set({ search: search.trim() })}
      filters={
        <form className="rp-form" onSubmit={(e) => { e.preventDefault(); set({ search: search.trim() }); }}>
          <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} remember={false} />
          <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} warehouses={{ value: f.warehouses, onChange: (warehouses) => set({ warehouses }) }} />
          <div className="field"><label>Loại phiếu</label>
            <select className="select input" value={f.docType} onChange={(e) => set({ docType: e.target.value })}><option value="">Mọi loại phiếu</option>{Object.entries(DOC_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div>
          <div className="field"><label>Số phiếu / mã hàng</label><input className="input" placeholder="Số phiếu, mã hàng, tên hàng" value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => set({ search: search.trim() })} /></div>
        </form>
      }
    >
      <div className="card">
        <div className="ttl-toolbar"><span className="muted" style={{ fontSize: 12 }}>Bấm một phiếu để xem từng dòng lấy lô nào, ở kho nào. Hoá đơn vẫn theo dòng bán như bill ở cửa hàng.</span></div>
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid
            storageKey="kho05-lo-phieu"
            rows={rows}
            rowKey={(r) => r.docKey}
            maxHeight="320px"
            onRowClick={(r) => setPicked(r.docKey)}
            emptyText="Không có phiếu nào. Đổi ngày hoặc bỏ bớt điều kiện lọc."
            columns={[
              { key: 'docDate', header: 'Ngày', title: 'Ngày chứng từ', render: (r) => viDate(r.docDate) },
              { key: 'docNo', header: 'Số phiếu', title: 'Số phiếu', type: 'code' },
              { key: 'docType', header: 'Loại', title: 'Loại phiếu', value: (r) => DOC_TYPE[r.docType] ?? r.docType },
              { key: 'places', header: 'Chi nhánh · kho', title: 'Nơi hàng của phiếu vào / ra lô', type: 'code', value: (r) => r.places.join(', ') },
              { key: 'lines', header: 'Dòng', title: 'Số dòng hàng có theo dõi lô', type: 'number' },
              { key: 'lots', header: 'Số lô', title: 'Số lô khác nhau phiếu đã lấy', type: 'number' },
              { key: 'note', header: 'Ghi chú', title: 'nhiều lô = có dòng lấy từ hai lô trở lên; khác tên = tên lúc mua của lô khác tên trên phiếu', noSort: true,
                value: (r) => [r.multiLot ? 'nhiều lô' : '', r.nameDiffers ? 'khác tên' : ''].filter(Boolean).join(', '),
                render: (r) => <>{r.multiLot && <span className="ttl-flag">nhiều lô</span>}{r.nameDiffers && <span className="ttl-flag">khác tên</span>}</> },
            ]}
          />
        )}
        {picked && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 600, margin: '4px 0' }}>Chi tiết phiếu {cur?.docNo ?? initial?.docNo ?? ''} {cur ? `· ${DOC_TYPE[cur.docType] ?? cur.docType} · ${viDate(cur.docDate)}` : ''}</div>
            <ChiTietPhieu docKey={picked} />
          </div>
        )}
      </div>
    </FilterLayout>
  );
}

export function TonTheoLoPage() {
  const [tab, setTab] = useState<'ton' | 'phieu'>('ton');
  const [doc, setDoc] = useState<{ docKey: string; docNo: string } | null>(null);
  return (
    <div className="page">
      <PageHeader title="Tồn theo lô" code="KHO05" helpKey="kho-ton-theo-lo"
        subtitle="Lô theo số lô + hạn dùng của nhà cung cấp, quản lý theo từng phân kho, giữ tên hàng lúc mua; hàng ra tự lấy lô hạn sớm trước; khách trả về đúng lô; giá vốn vẫn bình quân" />
      <div className="tabs" role="tablist" style={{ marginBottom: 8 }}>
        <button role="tab" className={`tab ${tab === 'ton' ? 'active' : ''}`} onClick={() => setTab('ton')}>Tồn theo lô</button>
        <button role="tab" className={`tab ${tab === 'phieu' ? 'active' : ''}`} onClick={() => { setDoc(null); setTab('phieu'); }} title="Phiếu lấy hàng từ lô nào, ở kho nào">Lô theo phiếu</button>
      </div>
      {tab === 'ton'
        ? <TonLo onOpenDoc={(docKey, docNo) => { setDoc({ docKey, docNo }); setTab('phieu'); }} />
        : <LoTheoPhieu key={doc?.docKey ?? 'all'} initial={doc} />}
    </div>
  );
}
