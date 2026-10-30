/**
 * NHẬP DỮ LIỆU KHỞI ĐẦU (MH20) — đưa số liệu từ tệp Excel xuất ở phần mềm cũ vào ERP để chạy thử / bắt đầu dùng.
 * Một màn, 3 thẻ; thẻ nào cũng: chọn tệp → chọn sheet → Phân tích (xem trước, không ghi) → Ghi. Chạy lại được (có rồi thì đè).
 *   ① Giá mua theo NCC — tệp dòng phiếu nhập: giá = TT trước VAT ÷ SL của dòng mới nhất, theo ĐVT của dòng (trống = ĐVT nhỏ nhất).
 *   ② Cân tồn kho — tệp tồn theo kho: so với tồn trên sổ ERP từng kho → mỗi kho một phiếu điều chỉnh (+/−) ghi sổ ngay.
 *   ③ Tồn max — tệp (Kho, Mã hàng, Tồn max) → bảng tồn max (min = 0).
 * Cột "Kho" là mã kho ở Danh mục kho (DM12); không có thì thử mã chi nhánh (dùng kho mặc định).
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileUp } from 'lucide-react';
import { readTable } from '@ketoan/contracts/mua-hang';
import { PageHeader } from '@/components/PageHeader';
import { DataGrid, type Column } from '@/components/DataGrid';
import { api, errorText } from '@/lib/api';
import { today } from '../du-lieu';
import { KhoiSo } from '../ton-max/chung';
import { num, qtyFmt } from '../ton-max/api';
import '../ton-max/ton-max.css';

const S = '/api/v1/stock/init';
/** Số dòng tối đa mỗi lần gửi (tệp hàng trăm nghìn dòng vượt giới hạn một lần gửi của máy chủ). */
const CHUNK = 15000;
/**
 * Chia dòng thành từng phần theo khoá nhóm (kho / NCC): một nhóm luôn nằm trọn trong một phần (máy chủ tính đúng theo nhóm:
 * cân về 0 mã thiếu của kho, lấy dòng mới nhất của NCC). Mỗi phần ≤ CHUNK dòng (nhóm lớn hơn CHUNK thì đứng riêng một phần).
 */
function chunksBy<T>(rows: T[], key: (r: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const r of rows) { const k = key(r).toUpperCase(); (groups.get(k) ?? groups.set(k, []).get(k)!).push(r); }
  const out: T[][] = [];
  let cur: T[] = [];
  for (const g of groups.values()) {
    if (cur.length && cur.length + g.length > CHUNK) { out.push(cur); cur = []; }
    cur = cur.concat(g);
  }
  if (cur.length) out.push(cur);
  return out;
}
/** Gửi từng phần nối tiếp, báo tiến độ. */
async function sendChunks<T, R>(parts: T[][], send: (part: T[]) => Promise<R>, progress: (t: string) => void): Promise<R[]> {
  const out: R[] = [];
  for (const [i, part] of parts.entries()) { if (parts.length > 1) progress(`Đang xử lý phần ${i + 1}/${parts.length}…`); out.push(await send(part)); }
  progress('');
  return out;
}
const sumObj = (list: Record<string, number>[]) => list.reduce<Record<string, number>>((a, o) => { for (const [k, v] of Object.entries(o)) a[k] = (a[k] ?? 0) + v; return a; }, {});
type Tab = 'gia' | 'ton' | 'max';
type Spec<K extends string> = { key: K; label: string; names: string[]; required?: boolean }[];

/** Chọn tệp + sheet, đọc bảng theo tên cột (dòng tiêu đề tìm tự động). */
function TaiTep<K extends string>({ spec, keyField, onRead, hint }: { spec: Spec<K>; keyField: K; onRead: (rows: (Record<K, string> & { row: number })[], info: string) => void; hint: ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState('');
  const [sheets, setSheets] = useState<{ name: string; table: unknown[][] }[]>([]);
  const [sheet, setSheet] = useState('');
  const [err, setErr] = useState('');
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
  const tableSpec = spec.map((c) => [c.key, c.names.map(fold)] as [K, string[]]);
  const read = (name: string, list = sheets) => {
    const sh = list.find((x) => x.name === name);
    if (!sh) return;
    const t = readTable(sh.table, tableSpec, keyField);
    const miss = spec.filter((c) => c.required && t.columns[c.key] === undefined).map((c) => c.label);
    if (miss.length) { setErr(`Sheet "${name}" thiếu cột: ${miss.join(', ')}`); onRead([], ''); return; }
    setErr('');
    onRead(t.rows, `${t.rows.length.toLocaleString('vi-VN')} dòng · cột nhận: ${spec.filter((c) => t.columns[c.key] !== undefined).map((c) => `${c.label} ← "${t.columns[c.key]}"`).join(', ')}`);
  };
  const pick = async (f: File) => {
    setFile(f.name); setErr('');
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: false });
      const list = wb.SheetNames.map((name) => ({ name, table: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, raw: true, defval: '' }) }));
      setSheets(list);
      // Tự chọn sheet có cột chính.
      const best = list.find((x) => readTable(x.table, tableSpec, keyField).rows.length) ?? list[0];
      if (best) { setSheet(best.name); read(best.name, list); }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="mh-panel" style={{ margin: '0 12px 8px' }}>
      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="mh-drop" style={{ flex: 1, minWidth: 320, margin: 0 }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void pick(f); }}>
          <FileUp size={18} /> <span>{file ? `Tệp: ${file}` : 'Kéo thả tệp Excel vào đây hoặc'}</span>
          <button type="button" className="btn btn-sm" onClick={() => input.current?.click()}>Chọn tệp…</button>
          <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ''; }} />
        </div>
        {sheets.length > 0 && <label className="tm-parent"><span>Sheet</span><select className="select input" value={sheet} onChange={(e) => { setSheet(e.target.value); read(e.target.value); }}>{sheets.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}</select></label>}
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{hint} Cột cần: {spec.map((c) => <b key={c.key} style={{ marginRight: 6 }}>{c.label}{c.required ? '*' : ''}</b>)}</div>
      {err && <div className="alert alert-bad" style={{ marginTop: 6 }}>{err}</div>}
    </div>
  );
}

const STATUS_CHIP: Record<string, [string, string]> = { new: ['ok', 'Thêm mới'], update: ['warn', 'Cập nhật'], same: ['', 'Như cũ'], error: ['bad', 'Lỗi'], up: ['ok', 'Tăng (+)'], down: ['bad', 'Giảm (−)'] };
const chip = (s: string) => <span className={`tm-chip ${STATUS_CHIP[s]?.[0] ?? ''}`}>{STATUS_CHIP[s]?.[1] ?? s}</span>;

export function KhoiDauPage() {
  const [tab, setTab] = useState<Tab>('gia');
  return (
    <>
      <PageHeader title="Nhập dữ liệu khởi đầu" code="MH20" helpKey="mua-hang-khoi-dau" subtitle="Đưa số liệu từ tệp Excel của phần mềm cũ vào ERP: giá mua theo NCC, cân tồn kho các shop (phiếu điều chỉnh tự động), tồn max. Chạy lại được — có rồi thì đè" />
      <div className="card">
        <div className="tabs" style={{ padding: '8px 12px 0' }}>
          {([['gia', '① Giá mua theo NCC'], ['ton', '② Cân tồn kho (phiếu điều chỉnh)'], ['max', '③ Tồn max']] as [Tab, string][]).map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        <div style={{ paddingTop: 8 }}>{tab === 'gia' ? <GiaMua /> : tab === 'ton' ? <CanTon /> : <TonMax />}</div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ ① giá mua */

type PriceKey = 'supplierCode' | 'supplierName' | 'sku' | 'name' | 'unit' | 'qty' | 'total' | 'pack' | 'date';
const PRICE_SPEC: Spec<PriceKey> = [
  { key: 'supplierCode', label: 'Mã NCC', names: ['Mã NCC', 'Ma NCC', 'NCC', 'Supplier code'], required: true },
  { key: 'supplierName', label: 'Nhà cung cấp', names: ['Nhà cung cấp', 'Tên NCC', 'Supplier', 'Supplier name'] },
  { key: 'sku', label: 'Mã hàng', names: ['Mã hàng', 'Mã SKU', 'SKU', 'Mã SP'], required: true },
  { key: 'name', label: 'Tên hàng', names: ['Tên hàng', 'Tên sản phẩm'] },
  { key: 'unit', label: 'ĐVT', names: ['ĐVT', 'Đơn vị tính', 'DVT'] },
  { key: 'qty', label: 'Số lượng', names: ['Số lượng', 'SL', 'Quantity'], required: true },
  { key: 'total', label: 'TT trước VAT', names: ['TT trước VAT', 'Thành tiền trước VAT', 'Tổng trước VAT', 'Total before VAT'], required: true },
  { key: 'pack', label: 'Quy cách', names: ['Quy cách sl / 1 thùng', 'SL / 1 thùng', 'Quy cách'] },
  { key: 'date', label: 'Ngày tạo', names: ['Ngày tạo', 'Ngày', 'Ngày chứng từ', 'Created at'] },
];
interface PriceRow { supplierCode: string; supplierName: string; sku: string; name: string; unit: string; price: number; qty: number; totalBeforeVat: number; date?: string; rows: number[]; status: string; oldPrice: number | null; supplierExists: boolean; error?: string }
interface PricePv { rows: PriceRow[]; skipped: Record<string, number>; rawRows: number; suppliers: { code: string; name: string; exists: boolean; rows: number; new: number; update: number; same: number; error: number }[] }

/** Ô số Excel (số thật, hoặc chữ kiểu 1.234,5 / 1,234.5). */
const xnum = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').trim();
  if (!s) return null;
  const t = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number(t.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
/** Ngày Excel (số ngày từ 1900) → dd/mm/yyyy; chữ giữ nguyên. */
const xdate = (v: unknown) => { const n = typeof v === 'number' ? v : /^\d{5}(\.\d+)?$/.test(String(v ?? '').trim()) ? Number(v) : NaN; if (n > 20000 && n < 80000) { v = n; const d = new Date(Math.round(((v as number) - 25569) * 86400000)); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; } return String(v ?? '').trim(); };

function GiaMua() {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [info, setInfo] = useState('');
  const [pv, setPv] = useState<PricePv | null>(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [prog, setProg] = useState('');
  const parts = () => chunksBy(rows.map((r) => ({ row: r.row, supplierCode: String(r.supplierCode ?? '').trim(), supplierName: String(r.supplierName ?? ''), sku: String(r.sku ?? '').trim(), name: String(r.name ?? ''), unit: String(r.unit ?? ''), qty: xnum(r.qty), totalBeforeVat: xnum(r.total), pack: xnum(r.pack), date: xdate(r.date) || undefined })), (r) => r.supplierCode);
  const preview = async () => {
    const res = await sendChunks(parts(), (p) => api.post<PricePv>(`${S}/prices/preview`, { rows: p }), setProg);
    return { rows: res.flatMap((x) => x.rows), suppliers: res.flatMap((x) => x.suppliers), rawRows: res.reduce((t, x) => t + x.rawRows, 0), skipped: sumObj(res.map((x) => x.skipped)) } as PricePv;
  };
  const run = async (write: boolean) => {
    setBusy(true); setMsg(null);
    try {
      if (!write) { setPv(await preview()); return; }
      const res = await sendChunks(parts(), (p) => api.post<{ added: number; updated: number; same: number; errors: number; createdSuppliers: number }>(`${S}/prices/import`, { rows: p }), setProg);
      const r = sumObj(res as unknown as Record<string, number>[]);
      setMsg({ ok: true, text: `Đã ghi: ${r.added} giá mới, ${r.updated} giá cập nhật, ${r.same} như cũ (bỏ qua), ${r.errors} dòng lỗi; tạo ${r.createdSuppliers} NCC mới.` });
      setPv(await preview());
      await qc.invalidateQueries({ queryKey: ['mua-hang'] });
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); setProg(''); }
  };
  const shown = (pv?.rows ?? []).filter((r) => !filter || r.status === filter);
  const cols: Column<PriceRow>[] = [
    { key: 'status', header: 'Kết quả', width: 96, value: (r) => STATUS_CHIP[r.status]?.[1] ?? r.status, render: (r) => chip(r.status) },
    { key: 'supplierCode', header: 'Mã NCC', type: 'code', width: 100, render: (r) => <span>{r.supplierCode}{!r.supplierExists && <span className="tm-chip info" style={{ marginLeft: 4 }}>NCC mới</span>}</span> },
    { key: 'supplierName', header: 'Nhà cung cấp', width: 200 },
    { key: 'sku', header: 'Mã hàng', type: 'code', width: 110 },
    { key: 'name', header: 'Tên hàng', width: 230 },
    { key: 'unit', header: 'ĐVT', width: 60 },
    { key: 'qty', header: 'SL dòng', type: 'qty', width: 70 },
    { key: 'totalBeforeVat', header: 'TT trước VAT', type: 'money', width: 105 },
    { key: 'price', header: 'Giá mua (chưa VAT)', type: 'price', width: 110, bold: true },
    { key: 'oldPrice', header: 'Giá đang có', type: 'price', width: 100 },
    { key: 'date', header: 'Ngày dòng', width: 95 },
    { key: 'error', header: 'Lỗi', width: 260, render: (r) => (r.error ? <span className="mh-bad">{r.error}</span> : '') },
  ];
  return (
    <>
      <TaiTep spec={PRICE_SPEC} keyField="sku" onRead={(r, i) => { setRows(r); setInfo(i); setPv(null); setMsg(null); }}
        hint={<>Tệp dòng phiếu nhập (Excel xuất từ màn phiếu nhập / hàng mua). Mỗi NCC × mã × ĐVT lấy dòng <b>mới nhất</b>; giá = TT trước VAT ÷ SL; bỏ dòng TT &lt; 1 (trả hàng, hàng tặng); không có cột ĐVT thì giá theo ĐVT nhỏ nhất. NCC chưa có thì tạo; giá cũ thì đè.</>} />
      <div className="tm-bar">
        <span className="muted" style={{ fontSize: 12 }}>{info}</span><span className="grow" />
        {prog && <span className="mh-warn">{prog}</span>}
        <button className="btn btn-sm" disabled={!rows.length || busy} onClick={() => void run(false)}>Phân tích</button>
        <button className="btn btn-primary" disabled={!pv || busy || !pv.rows.some((r) => r.status === 'new' || r.status === 'update')} onClick={() => void run(true)}>Ghi giá mua ({(pv?.rows ?? []).filter((r) => r.status === 'new' || r.status === 'update').length})</button>
      </div>
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'}`} style={{ margin: '0 12px 8px' }}>{msg.text}</div>}
      {pv && <>
        <div className="tm-stats">
          <KhoiSo label="Dòng trong tệp" value={pv.rawRows.toLocaleString('vi-VN')} active={!filter} onClick={() => setFilter('')} hint={`Bỏ qua: ${Object.entries(pv.skipped).filter(([, v]) => v).map(([k, v]) => `${({ empty: 'trống', noSku: 'thiếu mã', noSupplier: 'thiếu NCC', badQty: 'SL ≤ 0', badTotal: 'TT < 1', older: 'dòng cũ hơn' } as Record<string, string>)[k] ?? k} ${v}`).join(', ')}`} />
          <KhoiSo label="NCC" value={`${pv.suppliers.length} (${pv.suppliers.filter((s) => !s.exists).length} mới)`} tone="purple" />
          <KhoiSo label="Giá mới" value={pv.rows.filter((r) => r.status === 'new').length} tone="green" active={filter === 'new'} onClick={() => setFilter('new')} />
          <KhoiSo label="Cập nhật giá" value={pv.rows.filter((r) => r.status === 'update').length} tone="orange" active={filter === 'update'} onClick={() => setFilter('update')} />
          <KhoiSo label="Như cũ" value={pv.rows.filter((r) => r.status === 'same').length} tone="grey" active={filter === 'same'} onClick={() => setFilter('same')} />
          <KhoiSo label="Lỗi (mã / ĐVT)" value={pv.rows.filter((r) => r.status === 'error').length} tone="red" active={filter === 'error'} onClick={() => setFilter('error')} />
        </div>
        <div className="tm-grid"><DataGrid rows={shown} columns={cols} rowKey={(r) => `${r.supplierCode}|${r.sku}|${r.unit}`} storageKey="khoi-dau-gia" exportName={`khoi-dau-gia-mua-${today()}`} emptyText="Không có dòng nào." /></div>
      </>}
    </>
  );
}

/* ------------------------------------------------------------------ ② cân tồn */

type StockKey = 'kho' | 'sku' | 'name' | 'qty';
const STOCK_SPEC: Spec<StockKey> = [
  { key: 'kho', label: 'Kho', names: ['Kho', 'Mã kho', 'Ma kho'], required: true },
  { key: 'sku', label: 'Mã hàng', names: ['Mã hàng', 'Mã SKU', 'SKU', 'Mã SP'], required: true },
  { key: 'name', label: 'Tên hàng', names: ['Tên hàng', 'Tên sản phẩm'] },
  { key: 'qty', label: 'Số lượng', names: ['Số lượng', 'SL', 'Tồn', 'Số lượng tồn'], required: true },
];
interface ReconRow { kho: string; branchCode: string; warehouseCode: string; sku: string; name: string; unit: string; fileQty: number | null; bookQty: number; diff: number; status: string; error?: string; onlyBook?: boolean }
interface ReconWh { branchCode: string; branchName: string; warehouseCode: string; warehouseName: string; kho: string; lines: number; up: number; down: number; same: number; errors: number; qtyUp: number; qtyDown: number }
interface ReconPv { rows: ReconRow[]; warehouses: ReconWh[]; unknownKho: string[] }

function CanTon() {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [info, setInfo] = useState('');
  const [pv, setPv] = useState<ReconPv | null>(null);
  const [zero, setZero] = useState(true);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [wh, setWh] = useState('');
  const [filter, setFilter] = useState('diff');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [prog, setProg] = useState('');
  // Tên hàng không gửi (máy chủ lấy theo danh mục) — tệp lớn gửi nhẹ hơn.
  const parts = () => chunksBy(rows.map((r) => ({ kho: String(r.kho ?? '').trim(), sku: String(r.sku ?? '').trim(), qty: xnum(r.qty) })).filter((r) => r.kho && r.sku), (r) => r.kho);
  const analyse = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await sendChunks(parts(), (p) => api.post<ReconPv>(`${S}/reconcile/preview`, { docDate: date, zeroMissing: zero, note, rows: p }), setProg);
      const p: ReconPv = { rows: res.flatMap((x) => x.rows), warehouses: res.flatMap((x) => x.warehouses), unknownKho: [...new Set(res.flatMap((x) => x.unknownKho))] };
      setPv(p); setPick(Object.fromEntries(p.warehouses.filter((w) => w.up + w.down > 0).map((w) => [`${w.branchCode}|${w.warehouseCode}`, true]))); }
    catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  };
  const chosen = Object.entries(pick).filter(([, v]) => v).map(([k]) => k);
  const apply = async () => {
    if (!window.confirm(`Tạo ${chosen.length} phiếu điều chỉnh kho (ghi sổ ngay) ngày ${date.split('-').reverse().join('/')}?`)) return;
    setBusy(true); setMsg(null);
    try {
      const khos = new Set((pv?.warehouses ?? []).filter((w) => chosen.includes(`${w.branchCode}|${w.warehouseCode}`)).map((w) => w.kho.toUpperCase()));
      const all = parts().map((p) => p.filter((x) => khos.has(x.kho.toUpperCase()))).filter((p) => p.length);
      const res = await sendChunks(all, (p) => api.post<{ created: { branchCode: string; warehouseCode: string; docNo: string; lines: number; up: number; down: number }[] }>(`${S}/reconcile/import`, { docDate: date, zeroMissing: zero, note, warehouses: chosen, rows: p }), setProg);
      const r = { created: res.flatMap((x) => x.created) };
      setMsg({ ok: true, text: `Đã tạo ${r.created.length} phiếu điều chỉnh: ${r.created.map((c) => `${c.docNo} (${c.branchCode}/${c.warehouseCode}: +${c.up} / −${c.down} dòng)`).join('; ')}. Tồn trên sổ giờ khớp tệp.` });
      await analyse();
      await qc.invalidateQueries({ queryKey: ['ton-max'] });
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  };
  const shown = useMemo(() => (pv?.rows ?? []).filter((r) => (!wh || `${r.branchCode}|${r.warehouseCode}` === wh) && (filter === 'diff' ? r.status === 'up' || r.status === 'down' : !filter || r.status === filter || (filter === 'onlyBook' && r.onlyBook))), [pv, wh, filter]);
  const whCols: Column<ReconWh>[] = [
    { key: 'pick', header: '', width: 34, noFilter: true, noSort: true, render: (w) => <input type="checkbox" disabled={!(w.up + w.down)} checked={Boolean(pick[`${w.branchCode}|${w.warehouseCode}`])} onChange={(e) => setPick({ ...pick, [`${w.branchCode}|${w.warehouseCode}`]: e.target.checked })} /> },
    { key: 'kho', header: 'Kho trong tệp', type: 'code', width: 100 },
    { key: 'branch', header: 'Chi nhánh / shop', width: 220, value: (w) => `${w.branchCode} ${w.branchName}`, render: (w) => <><b className="mono">{w.branchCode}</b> {w.branchName}</> },
    { key: 'warehouseCode', header: 'Kho ERP', type: 'code', width: 90 },
    { key: 'lines', header: 'Số mã', type: 'number', width: 70, sum: true },
    { key: 'up', header: 'Mã tăng', type: 'number', width: 70, sum: true },
    { key: 'down', header: 'Mã giảm', type: 'number', width: 70, sum: true },
    { key: 'same', header: 'Khớp', type: 'number', width: 70, sum: true },
    { key: 'qtyUp', header: 'SL tăng', type: 'qty', width: 80, sum: true },
    { key: 'qtyDown', header: 'SL giảm', type: 'qty', width: 80, sum: true },
    { key: 'errors', header: 'Lỗi', type: 'number', width: 60, sum: true },
    { key: 'see', header: '', width: 70, noFilter: true, noSort: true, render: (w) => <button className="btn btn-xs" onClick={() => setWh(`${w.branchCode}|${w.warehouseCode}`)}>Xem</button> },
  ];
  const cols: Column<ReconRow>[] = [
    { key: 'status', header: 'Kết quả', width: 90, value: (r) => STATUS_CHIP[r.status]?.[1] ?? r.status, render: (r) => chip(r.status) },
    { key: 'branchCode', header: 'Chi nhánh', type: 'code', width: 100 },
    { key: 'warehouseCode', header: 'Kho', type: 'code', width: 80 },
    { key: 'sku', header: 'Mã hàng', type: 'code', width: 110 },
    { key: 'name', header: 'Tên hàng', width: 240 },
    { key: 'unit', header: 'ĐVT', width: 55 },
    { key: 'fileQty', header: 'Tồn theo tệp', type: 'qty', width: 90, className: 'tm-stock', render: (r) => (r.fileQty === null ? <span className="muted" title="Mã có tồn trên sổ nhưng tệp không có — cân về 0">không có</span> : qtyFmt(r.fileQty)) },
    { key: 'bookQty', header: 'Tồn trên sổ', type: 'qty', width: 90, showZero: true },
    { key: 'diff', header: 'Điều chỉnh', type: 'qty', width: 90, bold: true, render: (r) => (r.diff ? <span className={r.diff > 0 ? 'tm-sug' : 'tm-low'}>{r.diff > 0 ? '+' : ''}{qtyFmt(r.diff)}</span> : '') },
    { key: 'error', header: 'Lỗi', width: 240, render: (r) => (r.error ? <span className="mh-bad">{r.error}</span> : '') },
  ];
  return (
    <>
      <TaiTep spec={STOCK_SPEC} keyField="sku" onRead={(r, i) => { setRows(r); setInfo(i); setPv(null); setMsg(null); setWh(''); }}
        hint={<>Tệp <b>tồn kho theo mặt hàng</b> (cột Kho = mã kho, Số lượng = tồn đúng). Phần mềm so với <b>tồn trên sổ ERP của đúng kho</b>, chênh bao nhiêu thì ghi phiếu điều chỉnh bấy nhiêu (mỗi kho một phiếu, dòng + tăng / − giảm).</>} />
      <div className="tm-bar">
        <label className="tm-parent"><span>Ngày phiếu</span><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="checkbox chk-explain"><input type="checkbox" checked={zero} onChange={(e) => { setZero(e.target.checked); setPv(null); }} /> <span><b>Mã không có trong tệp → cân về 0</b><small>Mã có tồn trên sổ ở kho đó mà tệp không có</small></span></label>
        <input className="input" style={{ width: 260 }} placeholder="Ghi chú phiếu (tuỳ chọn)" value={note} onChange={(e) => setNote(e.target.value)} />
        <span className="grow" />
        {prog && <span className="mh-warn">{prog}</span>}
        <button className="btn btn-sm" disabled={!rows.length || busy} onClick={() => void analyse()}>Phân tích</button>
        <button className="btn btn-primary" disabled={!pv || !chosen.length || busy} onClick={() => void apply()}>Tạo phiếu điều chỉnh ({chosen.length} kho)</button>
      </div>
      <div className="muted" style={{ padding: '0 12px 6px', fontSize: 12 }}>{info}</div>
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'}`} style={{ margin: '0 12px 8px' }}>{msg.text}</div>}
      {pv && <>
        {pv.unknownKho.length > 0 && <div className="alert alert-warn" style={{ margin: '0 12px 8px' }}>Kho không có trong danh mục kho (DM12), bỏ qua: <b>{pv.unknownKho.join(', ')}</b> — khai kho / sửa mã kho rồi phân tích lại.</div>}
        <div className="tm-stats">
          <KhoiSo label="Kho" value={pv.warehouses.length} />
          <KhoiSo label="Mã cần tăng" value={pv.rows.filter((r) => r.status === 'up').length} tone="green" active={filter === 'up'} onClick={() => setFilter('up')} />
          <KhoiSo label="Mã cần giảm" value={pv.rows.filter((r) => r.status === 'down').length} tone="red" active={filter === 'down'} onClick={() => setFilter('down')} />
          <KhoiSo label="Có chênh lệch" value={pv.rows.filter((r) => r.status === 'up' || r.status === 'down').length} tone="orange" active={filter === 'diff'} onClick={() => setFilter('diff')} />
          <KhoiSo label="Đã khớp" value={pv.rows.filter((r) => r.status === 'same').length} tone="grey" active={filter === 'same'} onClick={() => setFilter('same')} />
          <KhoiSo label="Lỗi" value={pv.rows.filter((r) => r.status === 'error').length} tone="purple" active={filter === 'error'} onClick={() => setFilter('error')} />
        </div>
        <h4 className="mh-h4" style={{ margin: '0 12px 4px' }}>Theo kho — tích kho cần tạo phiếu</h4>
        <div style={{ padding: '0 0 8px' }}><DataGrid rows={pv.warehouses} columns={whCols} rowKey={(w) => `${w.branchCode}|${w.warehouseCode}`} storageKey="khoi-dau-can-ton-kho" exportName={`can-ton-theo-kho-${date}`} maxHeight="260px" /></div>
        <h4 className="mh-h4" style={{ margin: '0 12px 4px' }}>Chi tiết từng mã {wh && <><span className="tm-chip info">{wh.replace('|', ' / ')}</span> <button className="btn btn-xs" onClick={() => setWh('')}>Mọi kho</button></>}</h4>
        <div className="tm-grid"><DataGrid rows={shown} columns={cols} rowKey={(r) => `${r.branchCode}|${r.warehouseCode}|${r.sku}|${r.kho}`} storageKey="khoi-dau-can-ton" exportName={`can-ton-chi-tiet-${date}`} emptyText="Không có dòng nào." /></div>
      </>}
    </>
  );
}

/* ------------------------------------------------------------------ ③ tồn max */

type MaxKey = 'kho' | 'sku' | 'name' | 'max';
const MAX_SPEC: Spec<MaxKey> = [
  { key: 'kho', label: 'Kho', names: ['Kho', 'Mã kho', 'Ma kho', 'Mã chi nhánh'], required: true },
  { key: 'sku', label: 'Mã hàng', names: ['Mã hàng', 'Mã SKU', 'SKU', 'Mã SP'], required: true },
  { key: 'name', label: 'Tên hàng', names: ['Tên hàng', 'Tên sản phẩm'] },
  { key: 'max', label: 'Tồn max', names: ['Tồn max', 'Ton max', 'Max'], required: true },
];
interface MaxRow { kho: string; branchCode: string; warehouseCode: string; sku: string; name: string; max: number; oldMax: number | null; status: string; error?: string }
interface MaxPv { rows: MaxRow[]; new: number; update: number; same: number; errors: number }

function TonMax() {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [info, setInfo] = useState('');
  const [pv, setPv] = useState<MaxPv | null>(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Bỏ dòng không có số max (ô trống) — không phải "max = 0".
  const [prog, setProg] = useState('');
  const parts = () => chunksBy(rows.filter((r) => xnum(r.max) !== null).map((r) => ({ kho: String(r.kho ?? '').trim(), sku: String(r.sku ?? '').trim(), max: num(String(xnum(r.max) ?? 0)) })), (r) => r.kho);
  const run = async (write: boolean) => {
    setBusy(true); setMsg(null);
    try {
      if (write) {
        const r = sumObj(await sendChunks(parts(), (p) => api.post<{ saved: number; same: number; errors: number }>(`${S}/max/import`, { rows: p }), setProg) as unknown as Record<string, number>[]);
        setMsg({ ok: true, text: `Đã ghi ${r.saved} dòng tồn max (${r.same} như cũ, ${r.errors} lỗi bỏ qua).` });
        await qc.invalidateQueries({ queryKey: ['ton-max'] });
      }
      const res = await sendChunks(parts(), (p) => api.post<MaxPv>(`${S}/max/preview`, { rows: p }), setProg);
      setPv({ rows: res.flatMap((x) => x.rows), new: res.reduce((t, x) => t + x.new, 0), update: res.reduce((t, x) => t + x.update, 0), same: res.reduce((t, x) => t + x.same, 0), errors: res.reduce((t, x) => t + x.errors, 0) });
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  };
  const cols: Column<MaxRow>[] = [
    { key: 'status', header: 'Kết quả', width: 90, value: (r) => STATUS_CHIP[r.status]?.[1] ?? r.status, render: (r) => chip(r.status) },
    { key: 'kho', header: 'Kho trong tệp', type: 'code', width: 100 },
    { key: 'branchCode', header: 'Chi nhánh', type: 'code', width: 110 },
    { key: 'warehouseCode', header: 'Kho ERP', type: 'code', width: 90 },
    { key: 'sku', header: 'Mã hàng', type: 'code', width: 110 },
    { key: 'name', header: 'Tên hàng', width: 260 },
    { key: 'oldMax', header: 'Max đang có', type: 'qty', width: 90 },
    { key: 'max', header: 'Max mới', type: 'qty', width: 90, bold: true, showZero: true },
    { key: 'error', header: 'Lỗi', width: 240, render: (r) => (r.error ? <span className="mh-bad">{r.error}</span> : '') },
  ];
  const shown = (pv?.rows ?? []).filter((r) => !filter || r.status === filter);
  return (
    <>
      <TaiTep spec={MAX_SPEC} keyField="sku" onRead={(r, i) => { setRows(r); setInfo(i); setPv(null); setMsg(null); }}
        hint={<>Tệp tồn max theo kho (Kho, Mã hàng, Tồn max — như tệp tồn kho theo mặt hàng có cột Tồn max). Ghi vào <b>Tồn max (MH16)</b>, tồn min = 0; mức cũ thì đè. Ô Tồn max trống thì bỏ qua dòng.</>} />
      <div className="tm-bar">
        <span className="muted" style={{ fontSize: 12 }}>{info}</span><span className="grow" />
        {prog && <span className="mh-warn">{prog}</span>}
        <button className="btn btn-sm" disabled={!rows.length || busy} onClick={() => void run(false)}>Phân tích</button>
        <button className="btn btn-primary" disabled={!pv || busy || !(pv.new + pv.update)} onClick={() => void run(true)}>Ghi tồn max ({pv ? pv.new + pv.update : 0})</button>
      </div>
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'}`} style={{ margin: '0 12px 8px' }}>{msg.text}</div>}
      {pv && <>
        <div className="tm-stats">
          <KhoiSo label="Dòng" value={pv.rows.length} active={!filter} onClick={() => setFilter('')} />
          <KhoiSo label="Thêm mới" value={pv.new} tone="green" active={filter === 'new'} onClick={() => setFilter('new')} />
          <KhoiSo label="Cập nhật" value={pv.update} tone="orange" active={filter === 'update'} onClick={() => setFilter('update')} />
          <KhoiSo label="Như cũ" value={pv.same} tone="grey" active={filter === 'same'} onClick={() => setFilter('same')} />
          <KhoiSo label="Lỗi (kho / mã)" value={pv.errors} tone="red" active={filter === 'error'} onClick={() => setFilter('error')} />
        </div>
        <div className="tm-grid"><DataGrid rows={shown} columns={cols} rowKey={(r) => `${r.kho}|${r.sku}`} storageKey="khoi-dau-max" exportName={`khoi-dau-ton-max-${today()}`} emptyText="Không có dòng nào." /></div>
      </>}
    </>
  );
}
