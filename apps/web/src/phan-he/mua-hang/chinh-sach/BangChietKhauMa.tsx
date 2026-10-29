/**
 * BẢNG CHIẾT KHẤU THEO MÃ HÀNG (chính sách item_discount) — một chính sách chứa cả nghìn mã, không phải khai từng mã:
 *   - thêm từ danh mục (bộ chọn dùng chung: bấm dòng là thêm, lọc nhãn, thêm tất cả, ghi % một lần), dán nhiều dòng (copy từ Excel: Mã | % CK | Giảm tiền | ĐVT | SL tối thiểu | Ghi chú), nhập Excel có hướng dẫn cột
 *     + file mẫu + xem trước (mã chưa có trong danh mục báo đỏ, dòng trùng báo vàng), xuất Excel cả bảng;
 *   - tìm theo mã / tên, áp cùng % / số tiền cho các dòng đang lọc, xoá các dòng đang lọc;
 *   - cuộn trong khung, tiêu đề đứng yên, hiện 200 dòng mỗi lần (bấm "Hiện thêm") — nhẹ cả khi có hàng nghìn mã.
 * Một mã nhiều dòng (khác SL tối thiểu) = bậc chiết khấu theo số lượng của riêng mã đó.
 */
import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileUp, Plus } from 'lucide-react';
import { readTable, type ItemDiscount, type ProductUnit } from '@ketoan/contracts/mua-hang';
import { Modal } from '@/components/ui';
import { api } from '@/lib/api';
import { P, purchaseApi } from '../du-lieu';
import { ExcelGuide, type GuideColumn } from '../thanh-phan/ExcelGuide';
import { ChonMatHang } from '../thanh-phan/ChonMatHang';

const COLS: GuideColumn[] = [
  { name: 'Mã hàng', required: true, aliases: 'Mã SP, SKU', example: '130181002', note: 'Mã trong danh mục mặt hàng (mã chưa có báo đỏ, không lấy)' },
  { name: '% chiết khấu', aliases: 'CK %, Chiết khấu', example: 3, note: 'Phần trăm trừ trên dòng hàng. Ghi % HOẶC Giảm tiền, không ghi cả hai' },
  { name: 'Giảm tiền', aliases: 'Giảm giá, Số tiền giảm', example: '', note: 'Số tiền giảm trên 1 ĐVT (theo ĐVT ở cột bên)' },
  { name: 'ĐVT', aliases: 'Đơn vị tính', example: 'Thùng', note: 'Trống = mọi ĐVT. Ghi ĐVT thì chỉ áp khi dòng phiếu đúng ĐVT đó' },
  { name: 'SL tối thiểu', aliases: 'Mua từ, Số lượng từ', example: 10, note: 'Mua từ số lượng này mới được. Một mã nhiều dòng khác SL = bậc chiết khấu theo SL' },
  { name: 'Ghi chú', example: 'CTKM tháng 11', note: 'Tuỳ ý' },
];
const SPEC: ['sku' | 'pct' | 'amount' | 'unit' | 'minQty' | 'note', string[]][] = [
  ['sku', ['ma hang', 'ma sp', 'sku']], ['pct', ['% chiet khau', 'ck %', 'chiet khau', 'ck']], ['amount', ['giam tien', 'giam gia', 'so tien giam']],
  ['unit', ['dvt', 'don vi tinh']], ['minQty', ['sl toi thieu', 'mua tu', 'so luong tu']], ['note', ['ghi chu']],
];
const n = (v: unknown) => { const t = String(v ?? '').replace(/\./g, '').replace(',', '.').replace('%', '').trim(); return t === '' ? undefined : Number(t) || undefined; };
const clean = (i: ItemDiscount): ItemDiscount => ({ sku: i.sku.trim(), ...(i.pct ? { pct: i.pct } : {}), ...(i.amount ? { amount: i.amount } : {}), ...(i.unit?.trim() ? { unit: i.unit.trim() } : {}), ...(i.minQty ? { minQty: i.minQty } : {}), ...(i.note?.trim() ? { note: i.note.trim() } : {}) });
const PAGE = 200;

export function BangChietKhauMa({ items, onChange, prefer }: { items: ItemDiscount[]; onChange: (items: ItemDiscount[]) => void; prefer?: { brandCode: string; skus: number }[] }) {
  const [find, setFind] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [paste, setPaste] = useState(false);
  const [excel, setExcel] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [bulk, setBulk] = useState('');
  const [val, setVal] = useState('');
  const skus = useMemo(() => [...new Set(items.map((i) => i.sku).filter(Boolean))], [items]);
  const names = useQuery({ queryKey: ['mua-hang', 'lookup-ck', skus.join(',')], queryFn: () => purchaseApi.lookupProducts(skus), enabled: skus.length > 0, staleTime: 60_000 });
  const nameOf = (s: string) => names.data?.find((p) => p.sku === s)?.name;
  const rows = items.map((it, idx) => ({ it, idx })).filter(({ it }) => !find || `${it.sku} ${nameOf(it.sku) ?? ''} ${it.note ?? ''}`.toLowerCase().includes(find.toLowerCase()));
  const dupKey = (i: ItemDiscount) => `${i.sku}|${(i.unit ?? '').toLowerCase()}|${i.minQty ?? 0}`;
  const dups = new Set(items.map(dupKey).filter((k, i, a) => a.indexOf(k) !== i));
  // ĐVT chọn trong danh sách ĐVT đã khai của mã (không gõ tay) — chỉ tải cho các dòng đang hiện.
  const shown = useMemo(() => [...new Set(rows.slice(0, limit).map((r) => r.it.sku).filter(Boolean))], [rows, limit]);
  const units = useQuery({ queryKey: ['mua-hang', 'units-ck', shown.join(',')], enabled: shown.length > 0, staleTime: 60_000,
    queryFn: () => api.post<Record<string, ProductUnit[]>>(`${P}/units`, { skus: shown }) });
  const set = (idx: number, p: Partial<ItemDiscount>) => onChange(items.map((x, j) => (j === idx ? { ...x, ...p } : x)));
  const exportXlsx = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(items.map((i) => ({ 'Mã hàng': i.sku, 'Tên hàng': nameOf(i.sku) ?? '', '% chiết khấu': i.pct ?? '', 'Giảm tiền': i.amount ?? '', 'ĐVT': i.unit ?? '', 'SL tối thiểu': i.minQty ?? '', 'Ghi chú': i.note ?? '' })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Chiet khau theo ma'); XLSX.writeFile(wb, 'chiet-khau-theo-ma-hang.xlsx');
  };
  const applyBulk = () => {
    const v = bulk.trim();
    if (!v) return;
    const isPct = v.endsWith('%') || Number(v.replace(',', '.')) <= 100;
    const val = n(v);
    if (!val) return;
    const ids = new Set(rows.map((r) => r.idx));
    onChange(items.map((x, j) => (ids.has(j) ? (isPct ? { ...x, pct: val, amount: undefined } : { ...x, amount: val, pct: undefined }) : x)));
    setBulk('');
  };
  return (
    <div className="full ckma">
      <div className="ckma-bar">
        <button type="button" className="btn btn-sm btn-primary" onClick={() => setPick('')}><Plus size={13} /> Thêm từ danh mục…</button>
        <input className="input" style={{ width: 220 }} placeholder="Lọc dòng trong bảng: mã / tên" value={find} onChange={(e) => { setFind(e.target.value); setLimit(PAGE); }} />
        <span className="ckma-count"><b>{items.length.toLocaleString('vi-VN')}</b> dòng{find ? ` · đang lọc ${rows.length.toLocaleString('vi-VN')}` : ''}</span>
        <button type="button" className="btn btn-sm" onClick={() => setPaste(true)}>Dán nhiều dòng…</button>
        <button type="button" className="btn btn-sm" onClick={() => setExcel(true)}><FileUp size={13} /> Nhập Excel…</button>
        <button type="button" className="btn btn-sm" disabled={!items.length} onClick={() => void exportXlsx()}><Download size={13} /> Xuất Excel</button>
        <span className="ckma-bulk">
          <input className="input num" style={{ width: 90 }} placeholder="3% / 500" value={bulk} onChange={(e) => setBulk(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyBulk()} title="Ghi 3 hoặc 3% = chiết khấu %, số lớn hơn 100 = giảm tiền / ĐVT" />
          <button type="button" className="btn btn-sm" disabled={!bulk.trim() || !rows.length} onClick={applyBulk}>Áp cho {find ? `${rows.length} dòng đang lọc` : 'tất cả'}</button>
          {find && rows.length > 0 && <button type="button" className="btn btn-sm" onClick={() => { if (window.confirm(`Xoá ${rows.length} dòng đang lọc?`)) { const ids = new Set(rows.map((r) => r.idx)); onChange(items.filter((_, j) => !ids.has(j))); } }}>Xoá dòng đang lọc</button>}
        </span>
      </div>
      <div className="ckma-scroll">
        <table className="mh-mini ckma-table">
          <thead><tr><th style={{ width: 50 }}>STT</th><th style={{ width: 130 }}>Mã hàng</th><th>Tên hàng</th><th style={{ width: 90 }} className="num">% CK</th><th style={{ width: 120 }} className="num">Giảm tiền / ĐVT</th><th style={{ width: 90 }}>ĐVT</th><th style={{ width: 100 }} className="num">SL tối thiểu</th><th style={{ width: 160 }}>Ghi chú</th><th style={{ width: 40 }} /></tr></thead>
          <tbody>
            {rows.slice(0, limit).map(({ it, idx }, k) => {
              const nm = nameOf(it.sku);
              const bad = !it.sku.trim() ? 'Chưa ghi mã' : names.data && !nm ? 'Mã chưa có trong danh mục' : !it.pct === !it.amount ? 'Ghi % HOẶC giảm tiền' : dups.has(dupKey(it)) ? 'Trùng dòng khác' : '';
              return (
                <tr key={idx} className={bad ? 'mh-row-bad' : ''} title={bad}>
                  <td>{k + 1}</td>
                  <td className="mono">{it.sku || <span className="mh-bad">—</span>}</td>
                  <td>{nm ?? (bad ? <span className="mh-bad">{bad}</span> : '')}</td>
                  <td><input className="input num" value={it.pct ?? ''} onChange={(e) => set(idx, { pct: n(e.target.value) })} /></td>
                  <td><input className="input num" value={it.amount ? it.amount.toLocaleString('vi-VN') : ''} onChange={(e) => set(idx, { amount: n(e.target.value) })} /></td>
                  <td>{(() => {
                    const us = units.data?.[it.sku] ?? [];
                    const cur = us.find((u) => u.unit.toLowerCase() === (it.unit ?? '').toLowerCase())?.unit ?? it.unit ?? '';
                    return <select className="select input" value={cur} title="Trống = mọi ĐVT; chọn ĐVT thì chỉ áp khi dòng phiếu đúng ĐVT đó" onChange={(e) => set(idx, { unit: e.target.value || undefined })}>
                      <option value="">mọi ĐVT</option>
                      {cur && !us.some((u) => u.unit === cur) && <option value={cur}>{cur} (chưa khai)</option>}
                      {us.map((u) => <option key={u.unit} value={u.unit}>{u.unit}{u.ratio !== 1 ? ` ×${u.ratio}` : ''}</option>)}
                    </select>;
                  })()}</td>
                  <td><input className="input num" value={it.minQty ?? ''} onChange={(e) => set(idx, { minQty: n(e.target.value) })} /></td>
                  <td><input className="input" value={it.note ?? ''} onChange={(e) => set(idx, { note: e.target.value })} /></td>
                  <td><button type="button" className="btn btn-xs" title="Bỏ dòng" onClick={() => onChange(items.filter((_, j) => j !== idx))}>×</button></td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={9} className="muted">
              {find ? <>Bảng chưa có dòng nào khớp "{find}". <button type="button" className="btn btn-xs btn-primary" onClick={() => setPick(find)}>Tìm "{find}" trong danh mục mặt hàng để thêm →</button></>
                : 'Chưa có mã nào — bấm "Thêm từ danh mục…" (tìm, lọc theo nhãn, chọn nhiều) hoặc "Nhập Excel…" (có file mẫu) để thêm hàng loạt.'}
            </td></tr>}
          </tbody>
        </table>
        {rows.length > limit && <button type="button" className="btn btn-sm ckma-more" onClick={() => setLimit((x) => x + PAGE)}>Hiện thêm {Math.min(PAGE, rows.length - limit)} dòng (còn {(rows.length - limit).toLocaleString('vi-VN')})</button>}
      </div>
      <div className="muted" style={{ fontSize: 12 }}>Dòng phiếu đúng mã (và đúng ĐVT nếu có ghi, SL đạt mức tối thiểu) tự được chiết khấu. Một mã ghi nhiều dòng khác "SL tối thiểu" = bậc chiết khấu theo số lượng của mã đó.</div>
      {pick !== null && (() => {
        const v = n(val), isPct = val.trim().endsWith('%') || (v !== undefined && v <= 100);
        const make = (sku: string) => clean({ sku, ...(v ? (isPct ? { pct: v } : { amount: v }) : {}) });
        return <ChonMatHang title="Thêm mã vào bảng chiết khấu — bấm vào dòng để thêm" initial={pick} prefer={prefer}
          existing={new Map(items.map((i) => [i.sku, 'đã có']))} onClose={() => { setPick(null); setFind(''); }}
          onPick={(p) => onChange([...items.filter((i) => i.sku), make(p.sku)])}
          onPickAll={(ps) => onChange([...items.filter((i) => i.sku), ...ps.map((p) => make(p.sku))])}
          footer={<span className="row" style={{ gap: 6, alignItems: 'center', marginRight: 'auto' }}>Chiết khấu cho mã thêm vào: <input className="input num" style={{ width: 100 }} placeholder="3% / 500" value={val} onChange={(e) => setVal(e.target.value)} /><span className="muted" style={{ fontSize: 12 }}>(≤ 100 hoặc có % = chiết khấu %, lớn hơn = giảm tiền / ĐVT; để trống thì điền sau)</span></span>} />;
      })()}
      {paste && <DanNhieuDong onClose={() => setPaste(false)} onAdd={(list) => { setPaste(false); onChange([...items.filter((i) => i.sku), ...list]); }} />}
      {excel && <NhapExcel onClose={() => setExcel(false)} onAdd={(list, replace) => { setExcel(false); onChange(replace ? list : [...items.filter((i) => i.sku), ...list]); }} />}
    </div>
  );
}

/** Kiểm trước khi đưa vào bảng: mã có trong danh mục, ghi % hoặc giảm tiền, không trùng trong danh sách. */
function usePreview(list: ItemDiscount[]) {
  const skus = [...new Set(list.map((i) => i.sku))];
  const q = useQuery({ queryKey: ['mua-hang', 'lookup-ck-preview', skus.join(',')], queryFn: () => purchaseApi.lookupProducts(skus), enabled: skus.length > 0 });
  const key = (i: ItemDiscount) => `${i.sku}|${(i.unit ?? '').toLowerCase()}|${i.minQty ?? 0}`;
  const check = (i: ItemDiscount, idx: number) => !q.data ? '…' : !q.data.some((p) => p.sku === i.sku) ? 'mã chưa có trong danh mục hàng' : !i.pct === !i.amount ? 'ghi % HOẶC giảm tiền' : list.findIndex((x) => key(x) === key(i)) !== idx ? 'trùng dòng phía trên' : '';
  return { ready: Boolean(q.data), check, name: (s: string) => q.data?.find((p) => p.sku === s)?.name ?? '', ok: list.filter((i, idx) => q.data && !check(i, idx)) };
}
function Preview({ list, p }: { list: (ItemDiscount & { row?: number })[]; p: ReturnType<typeof usePreview> }) {
  return (
    <div className="full ckma-scroll" style={{ maxHeight: 320 }}>
      <table className="mh-mini"><thead><tr><th>Dòng</th><th>Mã</th><th>Tên theo danh mục</th><th className="num">% CK</th><th className="num">Giảm tiền</th><th>ĐVT</th><th className="num">SL tối thiểu</th><th>Kiểm tra</th></tr></thead>
        <tbody>{list.slice(0, 500).map((i, k) => { const c = p.check(i, k); return <tr key={k} className={c && c !== '…' ? 'mh-row-bad' : ''}><td>{i.row ?? k + 1}</td><td className="mono">{i.sku}</td><td>{p.name(i.sku)}</td><td className="num">{i.pct ?? ''}</td><td className="num">{i.amount?.toLocaleString('vi-VN') ?? ''}</td><td>{i.unit ?? ''}</td><td className="num">{i.minQty ?? ''}</td><td>{c ? <span className="mh-bad">{c}</span> : '✓'}</td></tr>; })}</tbody>
      </table>
      {list.length > 500 && <div className="muted" style={{ fontSize: 12 }}>Xem trước 500 dòng đầu — cả {list.length.toLocaleString('vi-VN')} dòng vẫn được kiểm.</div>}
    </div>
  );
}
function DanNhieuDong({ onClose, onAdd }: { onClose: () => void; onAdd: (l: ItemDiscount[]) => void }) {
  const [text, setText] = useState('');
  const list = text.split(/\r?\n/).map((l) => l.split('\t')).filter((c) => c[0]?.trim()).map((c) => clean({ sku: c[0]!.trim(), pct: n(c[1]), amount: n(c[2]), unit: c[3], minQty: n(c[4]), note: c[5] }));
  const p = usePreview(list);
  return (
    <Modal wide title="Dán nhiều dòng chiết khấu theo mã" onClose={onClose} footer={<><button className="btn btn-primary" disabled={!p.ok.length} onClick={() => onAdd(p.ok)}>Thêm {p.ok.length} dòng hợp lệ</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <div className="full muted" style={{ fontSize: 12 }}>Copy từ Excel theo thứ tự cột: <b>Mã hàng | % chiết khấu | Giảm tiền | ĐVT | SL tối thiểu | Ghi chú</b> (chỉ cần 2 cột đầu). Mỗi dòng một mã.</div>
      <div className="full"><textarea className="input" rows={6} style={{ width: '100%' }} placeholder={'130181002\t3\n140181001\t\t500\tHộp\t48'} value={text} onChange={(e) => setText(e.target.value)} /></div>
      {list.length > 0 && <Preview list={list} p={p} />}
    </Modal>
  );
}
function NhapExcel({ onClose, onAdd }: { onClose: () => void; onAdd: (l: ItemDiscount[], replace: boolean) => void }) {
  const [list, setList] = useState<(ItemDiscount & { row: number })[]>([]);
  const [file, setFile] = useState('');
  const [err, setErr] = useState('');
  const [replace, setReplace] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const p = usePreview(list);
  const pick = async (f: File) => {
    setErr(''); setFile(f.name);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      for (const name of wb.SheetNames) {
        const t = readTable(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, raw: true, defval: '' }), SPEC, 'sku');
        if (t.rows.length) { setList(t.rows.map((r) => ({ ...clean({ sku: String(r.sku), pct: n(r.pct), amount: n(r.amount), unit: r.unit ? String(r.unit) : undefined, minQty: n(r.minQty), note: r.note ? String(r.note) : undefined }), row: r.row }))); return; }
      }
      throw new Error('Không thấy bảng có cột "Mã hàng"');
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setList([]); }
  };
  return (
    <Modal wide title="Nhập chiết khấu theo mã hàng từ Excel" onClose={onClose}
      footer={<><label className="checkbox" style={{ marginRight: 'auto' }}><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Thay toàn bộ bảng hiện có (bỏ tích = thêm vào cuối)</label>
        <button className="btn btn-primary" disabled={!p.ok.length} onClick={() => onAdd(p.ok.map((x) => { const { row: _r, ...rest } = x as ItemDiscount & { row?: number }; return rest; }), replace)}>Đưa {p.ok.length.toLocaleString('vi-VN')} dòng hợp lệ vào bảng</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <div className="full"><ExcelGuide columns={COLS} file="mau-chiet-khau-theo-ma-hang.xlsx" defaultOpen={!list.length} /></div>
      <div className="full mh-drop" style={{ marginTop: 8 }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void pick(f); }}>
        <FileUp size={18} /> <span>{file ? `Tệp: ${file}` : 'Kéo thả tệp Excel vào đây hoặc'}</span>
        <button type="button" className="btn btn-sm" onClick={() => input.current?.click()}>Chọn tệp…</button>
        <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); }} />
      </div>
      {err && <div className="alert alert-bad full" style={{ marginTop: 6 }}>{err}</div>}
      {list.length > 0 && <><div className="full muted" style={{ fontSize: 12, margin: '6px 0' }}>{list.length.toLocaleString('vi-VN')} dòng — {p.ready ? `${p.ok.length.toLocaleString('vi-VN')} hợp lệ, ${(list.length - p.ok.length).toLocaleString('vi-VN')} dòng đỏ bị bỏ qua` : 'đang kiểm…'}. Đưa vào bảng rồi bấm Ghi chính sách.</div><Preview list={list} p={p} /></>}
    </Modal>
  );
}
