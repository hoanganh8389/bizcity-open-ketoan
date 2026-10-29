/**
 * TỒN MAX (MH16) — khai max (và min nếu cần) theo chi nhánh – kho – mã, một nơi duy nhất.
 *   Theo chi nhánh / shop: chọn kho của chi nhánh cha hoặc một shop → mỗi mã một dòng: tồn, bán / ngày (đo trong N ngày),
 *     gợi ý max (shop = bán / ngày × số ngày đủ hàng; kho = tổng max shop + % dự phòng), max / min sửa ngay trên ô.
 *   Theo mã hàng: một mã ở kho + mọi shop của chi nhánh cha.
 * Áp gợi ý hàng loạt cho các dòng đang lọc, nhập / xuất Excel, cài riêng từng mã (số ngày đo bán, số ngày đủ hàng, cách chuyển).
 */
import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp, Plus, Settings2, Sparkles } from 'lucide-react';
import { TRANSFER_MODES, type TransferMode } from '@ketoan/contracts/mua-hang';
import { PageHeader } from '@/components/PageHeader';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ErrorBox, Field, Loading, Modal } from '@/components/ui';
import { ItemPicker } from '@/components/pickers';
import { errorText } from '@/lib/api';
import { NhapExcelChung } from '../thanh-phan/NhapExcelChung';
import { ChonMatHang } from '../thanh-phan/ChonMatHang';
import { num, qtyFmt, stockApi, useHierarchy, type MaxBoardRow } from './api';
import { ChonChiNhanhCha, ChonShop, ChuaPhanCap, KhoiSo, isOff } from './chung';

type Draft = { max?: number; min?: number; mode?: TransferMode };
type Filter = '' | 'below' | 'nomax' | 'diff' | 'set';
const k = (r: { branchCode: string; warehouseCode: string; sku: string }) => `${r.branchCode}|${r.warehouseCode}|${r.sku}`;

export function TonMaxPage() {
  const qc = useQueryClient();
  const h = useHierarchy();
  const [parent, setParent] = useState('');
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'branch' | 'sku'>(params.get('sku') ? 'sku' : 'branch');
  const [target, setTarget] = useState(''); // '' = kho chi nhánh cha
  const [wh, setWh] = useState('');
  const [sku, setSku] = useState(params.get('sku') ?? '');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [extra, setExtra] = useState<MaxBoardRow[]>([]);
  const [filter, setFilter] = useState<Filter>('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [imp, setImp] = useState(false);
  const [add, setAdd] = useState(false);
  const [cfgSku, setCfgSku] = useState<MaxBoardRow | null>(null);
  const view = useRef<MaxBoardRow[]>([]);
  const shops = (h.data?.branches ?? []).filter((b) => b.level === 'shop' && b.parentCode === parent);
  const parentNode = (h.data?.branches ?? []).find((b) => b.code === parent);
  // Chi nhánh / shop đang xem: kho của nó luôn hiện để chọn (shop thường một kho cố định, kho chi nhánh cha có nhiều kho).
  const targetNode = target ? shops.find((s) => s.code === target) : parentNode;
  const q = useQuery({
    queryKey: ['ton-max', 'board', parent, mode, target, wh, sku], enabled: Boolean(parent) && (mode === 'branch' || Boolean(sku)),
    queryFn: () => stockApi.board({ parentCode: parent, ...(mode === 'sku' ? { sku } : { branchCode: target || parent, warehouseCode: wh || undefined }) }),
  });
  const isKho = mode === 'branch' && !target;
  const rows = useMemo(() => {
    const base = [...(q.data?.rows ?? []), ...extra.filter((x) => !(q.data?.rows ?? []).some((r) => k(r) === k(x)))];
    return base.filter((r) => {
      const d = drafts[k(r)], max = d?.max ?? r.max;
      if (filter === 'below') return max > 0 && r.ton < max;
      if (filter === 'nomax') return !max && (r.avgPerDay > 0 || (r.shopMaxSum ?? 0) > 0);
      if (filter === 'diff') return r.suggested > 0 && Math.abs(max - r.suggested) / r.suggested > 0.3;
      if (filter === 'set') return max > 0;
      return true;
    });
  }, [q.data, extra, drafts, filter]);
  const all = q.data?.rows ?? [];
  const dirty = Object.keys(drafts).length;
  const setD = (r: MaxBoardRow, d: Draft) => setDrafts((x) => ({ ...x, [k(r)]: { ...x[k(r)], ...d } }));
  const val = (r: MaxBoardRow, f: 'max' | 'min') => drafts[k(r)]?.[f] ?? r[f];

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const list = [...all, ...extra];
      const levels = Object.entries(drafts).filter(([, d]) => d.max !== undefined || d.min !== undefined).map(([key, d]) => {
        const r = list.find((x) => k(x) === key)!;
        const max = d.max ?? r.max, min = d.min ?? r.min;
        return { branchCode: r.branchCode, warehouseCode: r.warehouseCode, sku: r.sku, max, min, remove: !max && !min && r.hasLevel };
      }).filter((l) => l.max || l.min || l.remove);
      const modes = Object.entries(drafts).filter(([, d]) => d.mode).map(([key, d]) => ({ sku: key.split('|')[2]!, transferMode: d.mode! }));
      if (levels.length) await stockApi.saveLevels(levels);
      if (modes.length) await stockApi.saveSkuSettings(modes.map((m) => ({ ...m, windowDays: null, coverDays: null })));
      setDrafts({}); setExtra([]);
      setMsg({ ok: true, text: `Đã lưu ${levels.length} dòng tồn max${modes.length ? `, ${modes.length} cách chuyển` : ''}.` });
      await qc.invalidateQueries({ queryKey: ['ton-max'] });
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  };
  const applySuggest = (onlyEmpty: boolean) => {
    const list = view.current.filter((r) => r.suggested > 0 && (!onlyEmpty || !val(r, 'max')));
    setDrafts((x) => ({ ...x, ...Object.fromEntries(list.map((r) => [k(r), { ...x[k(r)], max: r.suggested }])) }));
    setMsg({ ok: true, text: `Đã điền gợi ý cho ${list.length} dòng — kiểm rồi bấm Lưu.` });
  };

  const cols: Column<MaxBoardRow>[] = [
    // Mã kho đứng đầu bảng (như báo cáo tồn kho quen dùng).
    { key: 'warehouseCode', header: 'Mã kho', type: 'code' as const, width: 80 },
    ...(mode === 'sku' ? [
      { key: 'branchCode', header: 'Chi nhánh', type: 'code' as const, width: 90 },
      { key: 'branchName', header: 'Tên', width: 160 },
    ] : [
      { key: 'sku', header: 'Mã hàng', type: 'code' as const, width: 110 },
      { key: 'name', header: 'Tên hàng', width: 220 },
    ]),
    { key: 'baseUnit', header: 'ĐVT', width: 60 },
    { key: 'pack', header: 'Quy cách', type: 'qty', width: 70, render: (r) => (r.pack ? <span title={`1 ${r.packUnit} = ${r.pack} ${r.baseUnit}`}>{r.pack} / {r.packUnit}</span> : '') },
    { key: 'ton', header: 'Tồn', type: 'qty', width: 80, className: 'tm-stock', showZero: true, sum: true },
    ...(isKho ? [{ key: 'shopMaxSum', header: 'Tổng max shop', type: 'qty' as const, width: 100, sum: true, className: 'tm-ref' }] : [
      { key: 'avgPerDay', header: 'Bán / ngày', type: 'qty' as const, width: 80, title: 'Bán trung bình mỗi ngày trong số ngày đo', render: (r: MaxBoardRow) => <span title={`Đo trong ${r.windowDays} ngày gần nhất`}>{qtyFmt(r.avgPerDay)}</span> },
    ]),
    { key: 'suggested', header: 'Gợi ý max', type: 'qty', width: 90, title: 'Gợi ý max', render: (r) => (r.suggested ? <button className="tm-opt" title={isKho || r.shopMaxSum !== undefined ? `Tổng max shop ${qtyFmt(r.shopMaxSum)} + ${q.data?.formula.warehouseBufferPct ?? 10}% dự phòng — bấm để dùng` : `${qtyFmt(r.avgPerDay)} / ngày × ${r.coverDays} ngày — bấm để dùng`} onClick={() => setD(r, { max: r.suggested })}><span className="tm-sug">{qtyFmt(r.suggested)}</span></button> : '') },
    { key: 'max', header: 'Tồn max', type: 'qty', width: 100, value: (r) => val(r, 'max'), sum: true, className: 'tm-max',
      render: (r) => <input className={`tm-input${drafts[k(r)]?.max !== undefined ? ' dirty' : ''}`} value={val(r, 'max') || ''} placeholder="0" onChange={(e) => setD(r, { max: num(e.target.value) })} /> },
    { key: 'min', header: 'Tồn min', type: 'qty', width: 90, value: (r) => val(r, 'min'), hidden: !isKho,
      render: (r) => <input className={`tm-input${drafts[k(r)]?.min !== undefined ? ' dirty' : ''}`} value={val(r, 'min') || ''} placeholder="0" onChange={(e) => setD(r, { min: num(e.target.value) })} /> },
    { key: 'gap', header: 'Thiếu so max', type: 'qty', width: 90, value: (r) => Math.max(0, val(r, 'max') - r.ton), render: (r) => { const g = val(r, 'max') - r.ton; return g > 0 ? <span className="tm-low">{qtyFmt(g)}</span> : g < 0 ? <span className="muted">dư {qtyFmt(-g)}</span> : ''; } },
    { key: 'transferMode', header: 'Chuyển xuống shop', width: 130, value: (r) => drafts[k(r)]?.mode ?? r.transferMode, hidden: isKho,
      render: (r) => <select className="select input" style={{ height: 26, fontSize: 12 }} value={drafts[k(r)]?.mode ?? r.transferMode} onChange={(e) => setD(r, { mode: e.target.value as TransferMode })}>{TRANSFER_MODES.map((m) => <option key={m.key} value={m.key} title={m.hint}>{m.label}</option>)}</select> },
    { key: 'cfg', header: '', width: 40, noFilter: true, noSort: true, render: (r) => <button className="btn btn-xs" title="Cài riêng mã: số ngày đo bán, số ngày đủ hàng" onClick={() => setCfgSku(r)}><Settings2 size={13} /></button> },
  ];

  const stats = {
    all: all.length, set: all.filter((r) => val(r, 'max') > 0).length, below: all.filter((r) => val(r, 'max') > 0 && r.ton < val(r, 'max')).length,
    nomax: all.filter((r) => !val(r, 'max') && (r.avgPerDay > 0 || (r.shopMaxSum ?? 0) > 0)).length, diff: all.filter((r) => r.suggested > 0 && Math.abs(val(r, 'max') - r.suggested) / r.suggested > 0.3).length,
  };
  const curWh = q.data?.warehouseCode || wh;
  const targetName = mode === 'sku' ? `mã ${sku}` : `kho ${curWh} của ${target ? targetNode?.name ?? target : parentNode?.name ?? parent}${targetNode && isOff(targetNode) ? ' (ngừng)' : ''}`;

  return (
    <>
      <PageHeader title="Tồn max" code="MH16" helpKey="mua-hang-ton-max" subtitle="Khai tồn max theo chi nhánh – kho – mã. Gợi ý từ tốc độ bán (shop) và tổng max shop (kho). Max là gốc của chia hàng xuống shop và đặt mua" />
      <div className="card">
        <ChuaPhanCap branches={h.data?.branches} />
        <div className="tm-bar">
          <ChonChiNhanhCha value={parent} onChange={(v) => { setParent(v); setTarget(''); setWh(''); setDrafts({}); setExtra([]); }} />
          <div className="tm-sign" title="Xem theo chi nhánh / shop hoặc theo một mã hàng">
            <button className={mode === 'branch' ? 'on' : ''} onClick={() => setMode('branch')}>Theo chi nhánh / shop</button>
            <button className={mode === 'sku' ? 'on' : ''} onClick={() => setMode('sku')}>Theo mã hàng</button>
          </div>
          {mode === 'branch' ? <>
            <ChonShop parent={parent} value={target} onChange={(v) => { setTarget(v); setWh(''); setDrafts({}); setExtra([]); }} />
            <label className="tm-parent" title="Phân kho đang xem — max khai theo từng kho">
              <span>Phân kho</span>
              {targetNode?.warehouses.length ? <select className="select input" style={{ minWidth: 130 }} value={curWh} onChange={(e) => { setWh(e.target.value); setDrafts({}); setExtra([]); }}>
                {targetNode.warehouses.map((w) => <option key={w.code} value={w.code}>{w.code}{w.isDefault ? ' (mặc định)' : ''}</option>)}
              </select> : <span className="mh-bad" style={{ fontSize: 13 }}>chưa có kho — khai ở <Link to="/danh-muc/kho">Danh mục kho</Link></span>}
            </label>
          </> : <div style={{ width: 300 }}><ItemPicker value={sku} onChange={setSku} placeholder="Gõ mã / tên hàng" /></div>}
          <span className="grow" />
          {mode === 'branch' && <button className="btn btn-sm" onClick={() => setAdd(true)}><Plus size={14} /> Thêm mã</button>}
          <button className="btn btn-sm" onClick={() => applySuggest(true)} title="Điền gợi ý cho các dòng đang lọc mà chưa có max"><Sparkles size={14} /> Gợi ý cho mã chưa có max</button>
          <button className="btn btn-sm" onClick={() => applySuggest(false)} title="Điền gợi ý cho MỌI dòng đang lọc (ghi đè max đang có)">Áp gợi ý cho dòng đang lọc</button>
          <button className="btn btn-sm" onClick={() => setImp(true)}><FileUp size={14} /> Nhập Excel</button>
          {dirty > 0 && <button className="btn btn-sm" onClick={() => { setDrafts({}); setExtra([]); }}>Bỏ ({dirty})</button>}
          <button className="btn btn-primary" disabled={!dirty || busy} onClick={() => void save()}>Lưu{dirty ? ` (${dirty})` : ''}</button>
        </div>
        <div className="tm-stats">
          <KhoiSo label="Số mã" value={stats.all} active={filter === ''} onClick={() => setFilter('')} />
          <KhoiSo label="Đã có max" value={stats.set} tone="green" active={filter === 'set'} onClick={() => setFilter('set')} />
          <KhoiSo label="Đang dưới max" value={stats.below} tone="orange" active={filter === 'below'} onClick={() => setFilter('below')} hint="Tồn nhỏ hơn max — sẽ được chia thêm / đặt thêm" />
          <KhoiSo label="Có bán, chưa có max" value={stats.nomax} tone="red" active={filter === 'nomax'} onClick={() => setFilter('nomax')} hint="Nên khai max (bấm Gợi ý cho mã chưa có max)" />
          <KhoiSo label="Max lệch gợi ý > 30%" value={stats.diff} tone="purple" active={filter === 'diff'} onClick={() => setFilter('diff')} />
        </div>
        {q.data && <div className="muted" style={{ padding: '0 12px 6px', fontSize: 12 }}>
          Đang xem <b>{targetName}</b> · bán / ngày đo trong <b>{q.data.formula.windowDays}</b> ngày, max shop gợi ý = bán / ngày × <b>{q.data.formula.coverDays}</b> ngày; max kho gợi ý = tổng max shop + <b>{q.data.formula.warehouseBufferPct}%</b> (đổi ở <Link to="/mua-hang/cong-thuc">Công thức đặt hàng</Link>; riêng mã: nút ⚙ cuối dòng).
        </div>}
        {q.data && mode === 'branch' && !q.data.mainWarehouse && <div className="alert alert-info" style={{ margin: '0 12px 8px', fontSize: 13 }}>
          Kho <b>{curWh}</b> là kho phụ: <b>không gợi ý max</b> (gợi ý chỉ ở kho chính để tồn max không bị tính trùng ở nhiều kho) — khai tay, Thêm mã hoặc Nhập Excel.
        </div>}
        {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'}`} style={{ margin: '0 12px 8px' }}>{msg.text}</div>}
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {mode === 'sku' && !sku ? <div className="empty">Chọn một mã hàng để xem max ở kho và mọi shop.</div> : q.isLoading ? <Loading /> : (
          <div className="tm-grid"><DataGrid rows={rows} columns={cols} rowKey={(r) => k(r)} storageKey={`ton-max-v2-${mode}-${isKho ? 'kho' : 'shop'}`} viewRef={view} exportName={`ton-max-${parent}-${target || 'kho'}`}
            exportTitle={`Tồn max — ${targetName}`} emptyText="Chưa có mã nào (chưa có tồn, bán hay max). Bấm Thêm mã hoặc Nhập Excel." /></div>
        )}
      </div>
      {add && q.data && <ChonMatHang title="Thêm mã để khai max — bấm vào dòng để thêm" existing={new Map([...all, ...extra].map((r) => [r.sku, '✓ đã có']))} onClose={() => setAdd(false)}
        onPick={(p) => { setExtra((x) => [...x, { branchCode: target || parent, branchName: '', warehouseCode: curWh, sku: p.sku, name: p.name, baseUnit: p.unit, ton: 0, avgPerDay: 0, windowDays: q.data!.formula.windowDays, coverDays: q.data!.formula.coverDays, suggested: 0, max: 0, min: 0, hasLevel: false, transferMode: 'auto' }]); }} />}
      {cfgSku && <CaiRiengMa row={cfgSku} onClose={() => setCfgSku(null)} onSaved={() => { setCfgSku(null); void qc.invalidateQueries({ queryKey: ['ton-max'] }); }} />}
      {imp && parent && <NhapExcelChung<'branch' | 'wh' | 'sku' | 'max' | 'min', { branch: string; wh: string; sku: string; max: number; min: number }> onClose={() => setImp(false)} onAdd={async (list) => {
        setImp(false); setBusy(true);
        try { const r = await stockApi.saveLevels(list.map((x) => ({ branchCode: x.branch, warehouseCode: x.wh, sku: x.sku, max: x.max, min: x.min })), 'import'); setMsg({ ok: true, text: `Đã ghi ${r.saved} dòng tồn max từ Excel.` }); await qc.invalidateQueries({ queryKey: ['ton-max'] }); }
        catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
      }} s={{
        title: 'Nhập tồn max từ Excel (kho + shop cùng một tệp)', file: 'mau-ton-max.xlsx', keyField: 'sku',
        columns: [
          { name: 'Mã chi nhánh', required: true, aliases: 'Mã shop, Chi nhánh', example: target || shops[0]?.code || '08001', note: 'Mã chi nhánh cha (kho) hoặc mã shop' },
          { name: 'Mã kho', aliases: 'Kho', example: '', note: 'Trống = kho mặc định của chi nhánh (shop thường chỉ có một kho)' },
          { name: 'Mã hàng', required: true, aliases: 'Mã SP, SKU', example: '110154035', note: 'Mã trong danh mục mặt hàng' },
          { name: 'Tồn max', required: true, aliases: 'Max', example: 24, note: 'Theo ĐVT nhỏ nhất (Lon, Hộp…)' },
          { name: 'Tồn min', aliases: 'Min', example: 0, note: 'Tuỳ chọn (thường chỉ khai cho kho)' },
        ],
        spec: [['branch', ['ma chi nhanh', 'ma shop', 'chi nhanh']], ['wh', ['ma kho', 'kho']], ['sku', ['ma hang', 'ma sp', 'sku']], ['max', ['ton max', 'max']], ['min', ['ton min', 'min']]],
        map: (r) => {
          const branch = String(r.branch).trim(), s = String(r.sku).trim();
          if (!(h.data?.branches ?? []).some((b) => b.code === branch)) return { error: `không có chi nhánh ${branch}` };
          const max = num(String(r.max ?? '')), min = num(String(r.min ?? ''));
          if (max < 0 || min < 0) return { error: 'max / min không âm' };
          if (min > 0 && max > 0 && min > max) return { error: 'min lớn hơn max' };
          return { value: { branch, wh: String(r.wh ?? '').trim(), sku: s, max, min } };
        },
        head: ['Chi nhánh', 'Kho', 'Mã hàng', 'Max', 'Min'], cells: (x) => [x.branch, x.wh || '(mặc định)', x.sku, qtyFmt(x.max), qtyFmt(x.min)],
        note: 'Ghi ngay khi bấm "Đưa vào": dòng đã có thì cập nhật. Mã chưa có trong danh mục bị báo lỗi.',
      }} />}
    </>
  );
}

/** Cài riêng một mã: số ngày đo bán, số ngày cần đủ hàng, cách làm tròn khi chuyển. */
function CaiRiengMa({ row, onClose, onSaved }: { row: MaxBoardRow; onClose: () => void; onSaved: () => void }) {
  const cur = useQuery({ queryKey: ['ton-max', 'sku-setting', row.sku], queryFn: () => stockApi.skuSettings([row.sku]) });
  const s = cur.data?.[0];
  const [win, setWin] = useState<string | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const [mode, setMode] = useState<TransferMode | null>(null);
  const [err, setErr] = useState('');
  const w = win ?? (s?.windowDays ? String(s.windowDays) : ''), c = cover ?? (s?.coverDays ? String(s.coverDays) : ''), m = mode ?? s?.transferMode ?? 'auto';
  const save = async (remove = false) => {
    try { await stockApi.saveSkuSettings([{ sku: row.sku, windowDays: w ? Number(w) : null, coverDays: c ? num(c) : null, transferMode: m, remove }]); onSaved(); } catch (e) { setErr(errorText(e)); }
  };
  return (
    <Modal title={`Cài riêng mã ${row.sku} — ${row.name}`} onClose={onClose} footer={<>{s && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => void save(true)}>Bỏ cài riêng</button>}<button className="btn btn-primary" onClick={() => void save()}>Ghi</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <div className="full alert alert-info" style={{ fontSize: 13 }}>Để trống = theo công thức của chi nhánh cha ({row.windowDays} ngày đo, {row.coverDays} ngày đủ hàng). Áp cho mọi chi nhánh.</div>
      <Field label="Số ngày đo tốc độ bán" hint="Bán / ngày = tổng bán trong N ngày gần nhất ÷ N (mặc định 7)"><input className="input num" style={{ width: 100 }} value={w} placeholder={String(row.windowDays)} onChange={(e) => setWin(e.target.value.replace(/\D/g, ''))} /></Field>
      <Field label="Số ngày cần đủ hàng ở shop" hint="Max gợi ý = bán / ngày × số này"><input className="input num" style={{ width: 100 }} value={c} placeholder={String(row.coverDays)} onChange={(e) => setCover(e.target.value)} /></Field>
      <Field label="Chuyển xuống shop" full>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>{TRANSFER_MODES.map((x) => <label key={x.key} className="checkbox chk-explain"><input type="radio" checked={m === x.key} onChange={() => setMode(x.key)} /> <span><b>{x.label}</b><small>{x.hint}</small></span></label>)}</div>
      </Field>
      {err && <div className="full alert alert-bad">{err}</div>}
    </Modal>
  );
}
