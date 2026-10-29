/**
 * Bố cục màn sổ / báo cáo như phần mềm kế toán để bàn: bảng lọc dọc bên trái, lưới bên phải.
 *   ReportSideLayout  khung hai cột (bảng lọc | nội dung); kéo thanh giữa để đổi bề rộng bảng lọc (nhớ theo máy).
 *                     Bảng lọc luôn vừa chiều cao màn hình: danh sách chi nhánh co lại, nút Tìm kiếm / Xuất / In luôn thấy.
 *   SideField         một ô lọc: nhãn bên trái, ô nhập bên phải
 *   BranchCheckList   danh sách chi nhánh (mã, tên) có ô "Chọn" (tích để xem; tích hết = tất cả)
 *   SideActions       nút Tìm kiếm / Xuất / In ở cuối bảng lọc
 * Dùng chung cho Sổ nhật ký chung, Sổ cái, Sổ chi tiết tài khoản… để các màn cùng một kiểu.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useLocation } from 'react-router-dom';
import { FileSpreadsheet, Plus, Printer, Search, Sparkles, X } from 'lucide-react';
import { useBranches } from './filters';
import { FilterPanelCtx, useFilterPanel, type FilterPanelContext } from './filterPanel';

/**
 * Bề rộng bảng lọc (nhớ theo máy): mặc định 240px để nhường chỗ cho bảng số liệu; kéo rộng tới 600px,
 * kéo hẹp dưới 120px thì thu gọn hẳn (0). Nút trên thanh kéo thu gọn / mở lại; bấm đúp thanh kéo cũng vậy.
 */
const WIDTH_KEY = 'ketoan.rp.w';
const DEFAULT_W = 240;
const MIN_W = 160;
const readWidth = () => {
  try { const v = localStorage.getItem(WIDTH_KEY); const w = Number(v); return v !== null && (w === 0 || (w >= MIN_W && w <= 600)) ? w : DEFAULT_W; } catch { return DEFAULT_W; }
};
const saveWidth = (w: number) => { try { localStorage.setItem(WIDTH_KEY, String(w)); } catch { /* bỏ qua */ } };

export function ReportSideLayout({ panel, children }: { panel: ReactNode; children: ReactNode }) {
  const [width, setWidth] = useState(readWidth);
  const lastOpen = useRef(width || DEFAULT_W);
  const [maxH, setMaxH] = useState<number | undefined>();
  // Màn hẹp: bảng lọc xếp trên nội dung, bấm "Bộ lọc" để thu gọn / mở.
  const [mOpen, setMOpen] = useState(true);
  const panelRef = useRef<HTMLElement>(null);
  const collapsed = width === 0;
  const toggle = () => {
    const w = collapsed ? lastOpen.current || DEFAULT_W : 0;
    if (!collapsed) lastOpen.current = width;
    setWidth(w);
    saveWidth(w);
  };

  // Chiều cao bảng lọc = từ mép trên của nó tới đáy cửa sổ.
  // Tính lại mỗi lần vẽ (thẻ số tổng hiện ra sau làm bảng tụt xuống), khi đổi cỡ cửa sổ và khi cuộn (bảng dính đầu trang).
  // Đo theo khung hai cột và vùng cuộn, không đo chính bảng lọc: cuộn tới đáy, bảng dính bị đẩy lên theo chiều cao của nó,
  // đo nó thì chiều cao lại tăng, lặp mãi (trang trắng).
  const measure = () => {
    const el = panelRef.current;
    const box = el?.parentElement;
    if (!el || !box) return undefined;
    const scroller = el.closest('.ws-panel');
    const top = Math.max(box.getBoundingClientRect().top, (scroller ? scroller.getBoundingClientRect().top : 0) + 8);
    return Math.max(320, Math.floor(window.innerHeight - top - 12));
  };
  const fitRef = useRef(() => {});
  fitRef.current = () => { const h = measure(); if (h !== undefined) setMaxH((old) => (old !== undefined && Math.abs(old - h) < 2 ? old : h)); };
  useLayoutEffect(() => { fitRef.current(); });
  useLayoutEffect(() => {
    const fit = () => fitRef.current();
    window.addEventListener('resize', fit);
    window.addEventListener('scroll', fit, true);
    return () => { window.removeEventListener('resize', fit); window.removeEventListener('scroll', fit, true); };
  }, []);

  const startDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = width;
    let w = w0;
    const move = (ev: MouseEvent) => {
      const raw = w0 + ev.clientX - x0;
      w = raw < 120 ? 0 : Math.min(600, Math.max(MIN_W, raw));
      setWidth(w);
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
      if (w) lastOpen.current = w;
      saveWidth(w);
    };
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  return (
    <div className={`rp-layout${collapsed ? ' collapsed' : ''}${mOpen ? '' : ' m-closed'}`} style={{ gridTemplateColumns: `${width}px 12px minmax(0, 1fr)` }}>
      <button type="button" className="rp-mtoggle" onClick={() => setMOpen((x) => !x)}>{mOpen ? '▾' : '▸'} Bộ lọc</button>
      <aside className="rp-panel" ref={panelRef} style={{ height: maxH }}>{panel}</aside>
      <div className="rp-split" onMouseDown={startDrag} onDoubleClick={toggle} title="Kéo để đổi bề rộng bảng lọc; kéo hết sang trái hoặc bấm nút để thu gọn">
        <button type="button" className="rp-toggle" onClick={toggle} title={collapsed ? 'Mở bảng lọc' : 'Thu gọn bảng lọc'}>{collapsed ? '›' : '‹'}</button>
      </div>
      <div className="rp-main">{children}</div>
    </div>
  );
}

export function SideField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="rp-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** Giá trị "không chọn chi nhánh nào" của BranchCheckList (bấm Tìm kiếm thì báo phải chọn). */
export const BRANCH_NONE = '-';

/** Bấm Tìm kiếm mà chưa tích chi nhánh nào: báo và không tìm. Trả về true nếu được tìm. */
export function branchesPicked(branchCodes: string): boolean {
  if (branchCodes !== BRANCH_NONE) return true;
  window.alert('Chưa chọn chi nhánh. Hãy tích ít nhất một chi nhánh.');
  return false;
}

/** Bộ chọn chi nhánh đặt tên (dùng chung mọi màn, nhớ theo máy). */
interface BranchPreset { name: string; codes: string[] }
const PRESETS_KEY = 'ketoan.cn.presets';
const readPresets = (): BranchPreset[] => {
  try {
    const v = JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '[]') as BranchPreset[];
    return Array.isArray(v) ? v.filter((p) => p && typeof p.name === 'string' && Array.isArray(p.codes)) : [];
  } catch { return []; }
};
const savePresets = (list: BranchPreset[]) => { try { localStorage.setItem(PRESETS_KEY, JSON.stringify(list)); } catch { /* bỏ qua */ } };

/** Chi nhánh đã tích của từng màn (nhớ theo máy, mỗi màn một chỗ). */
const pickedKey = (pathname: string) => `ketoan.cn.chon:${pathname}`;

/**
 * Chi nhánh: value là các mã cách nhau dấu phẩy; rỗng = tất cả (mọi ô đều tích); BRANCH_NONE = không chi nhánh nào.
 * Ô tìm lọc theo mã hoặc tên.
 * Nhớ theo màn: lần sau mở lại màn, các ô tích như lần trước (onRestore nhận giá trị nhớ; mặc định gọi onChange).
 *   Màn mở kèm chi nhánh chỉ định sẵn (bấm từ màn khác sang) thì không lấy giá trị nhớ.
 * Chọn nhanh: lưu các ô đang tích thành một bộ có tên (ví dụ "Chi nhánh Phú Thọ"); ở bất kỳ màn nào bấm tên bộ là tích đúng các chi nhánh đó.
 *   Danh sách vẫn hiện đủ mọi chi nhánh, bộ chọn chỉ đặt dấu tích.
 */
export function BranchCheckList({ value, onChange, onRestore }: { value: string; onChange: (v: string) => void; onRestore?: (v: string) => void }) {
  const { data: raw = [] } = useBranches();
  // Chỉ chi nhánh đang dùng (chi nhánh đã ngừng / mã cũ sau khi đổi mã không hiện); chi nhánh ngừng mà đang được chọn thì
  // vẫn giữ để bỏ tích được. Không tích gì (= tất cả) thì báo cáo vẫn gồm số liệu cũ của chi nhánh đã ngừng.
  const data = useMemo(() => {
    const sel = new Set(value && value !== BRANCH_NONE ? value.split(',') : []);
    return raw.filter((b) => b.isActive !== false || sel.has(b.code));
  }, [raw, value]);
  const { pathname } = useLocation();
  const keyRef = useRef(pickedKey(pathname));
  const restored = useRef(false);
  const [text, setText] = useState('');
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [presets, setPresets] = useState(readPresets);
  const [newName, setNewName] = useState<string | null>(null);
  const all = data.map((b) => b.code);
  const picked = useMemo(() => new Set(value === BRANCH_NONE ? [] : value ? value.split(',') : all), [value, all.join(',')]);

  useLayoutEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (value) return;
    try {
      const v = localStorage.getItem(keyRef.current);
      if (v && v !== BRANCH_NONE && v !== value) (onRestore ?? onChange)(v);
    } catch { /* bỏ qua */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!restored.current || value === BRANCH_NONE) return;
    try { if (value) localStorage.setItem(keyRef.current, value); else localStorage.removeItem(keyRef.current); } catch { /* bỏ qua */ }
  }, [value]);

  const q = text.trim().toLowerCase();
  const shown = data.filter((b) => !q || b.code.toLowerCase().includes(q) || b.name.toLowerCase().includes(q));
  const emit = (s: Set<string>) => onChange(s.size === all.length ? '' : s.size === 0 ? BRANCH_NONE : all.filter((c) => s.has(c)).join(','));
  const toggle = (code: string) => { const s = new Set(picked); if (s.has(code)) s.delete(code); else s.add(code); emit(s); };
  const allOn = all.length > 0 && picked.size === all.length;

  const usePreset = (p: BranchPreset) => { emit(new Set(p.codes.filter((c) => all.includes(c)))); setPresetsOpen(false); };
  const storePresets = (list: BranchPreset[]) => { setPresets(list); savePresets(list); };
  const addPreset = () => {
    const name = (newName ?? '').trim();
    if (!name) return;
    if (picked.size === 0) { window.alert('Chưa tích chi nhánh nào để lưu.'); return; }
    const codes = all.filter((c) => picked.has(c));
    const exists = presets.some((p) => p.name.toLowerCase() === name.toLowerCase());
    if (exists && !window.confirm(`Đã có bộ chọn "${name}". Thay bằng các chi nhánh đang tích?`)) return;
    storePresets([...presets.filter((p) => p.name.toLowerCase() !== name.toLowerCase()), { name, codes }].sort((a, b) => a.name.localeCompare(b.name, 'vi')));
    setNewName(null);
  };
  const removePreset = (p: BranchPreset) => { if (window.confirm(`Xoá bộ chọn "${p.name}"?`)) storePresets(presets.filter((x) => x !== p)); };
  const isCurrent = (p: BranchPreset) => p.codes.length === picked.size && p.codes.every((c) => picked.has(c));

  return (
    <div className="rp-branches">
      <div className="rp-branches-head">
        <input className="input" placeholder="Tìm mã, tên chi nhánh" value={text} onChange={(e) => setText(e.target.value)} />
        <label className="checkbox" title="Tích / bỏ tích tất cả"><input type="checkbox" checked={allOn} onChange={() => onChange(allOn ? BRANCH_NONE : '')} /> Chọn</label>
      </div>
      <div className="rp-branches-list">
        {shown.map((b) => (
          <label key={b.code} className="rp-branch" title={`${b.code} — ${b.name}`}>
            <span className="mono rp-branch-code">{b.code}</span>
            <span className="rp-branch-name">{b.name}</span>
            <input type="checkbox" checked={picked.has(b.code)} onChange={() => toggle(b.code)} />
          </label>
        ))}
        {shown.length === 0 && <div className="muted" style={{ padding: 6 }}>Không thấy chi nhánh nào</div>}
      </div>
      {presetsOpen && (
        <div className="rp-presets">
          {presets.length === 0 && newName === null && <div className="muted rp-presets-empty">Chưa có bộ chọn nào. Tích các chi nhánh rồi bấm "Lưu bộ chọn".</div>}
          {presets.map((p) => (
            <div key={p.name} className={`rp-preset${isCurrent(p) ? ' current' : ''}`}>
              <button type="button" className="rp-preset-use" onClick={() => usePreset(p)} title={p.codes.join(', ')}>
                <span className="rp-preset-name">{p.name}</span>
                <span className="muted">{p.codes.length} CN</span>
              </button>
              <button type="button" className="rp-preset-del" title="Xoá bộ chọn" onClick={() => removePreset(p)}><X size={12} /></button>
            </div>
          ))}
          {newName === null ? (
            <button type="button" className="rp-preset-add" onClick={() => setNewName('')}><Plus size={12} /> Lưu bộ chọn mới ({picked.size} chi nhánh đang tích)</button>
          ) : (
            <form className="rp-preset-new" data-no-search onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); addPreset(); }}>
              <input className="input" autoFocus placeholder="Tên, ví dụ: Chi nhánh Phú Thọ" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setNewName(null); }} />
              <button type="submit" className="btn btn-primary">Lưu</button>
              <button type="button" className="btn" onClick={() => setNewName(null)}>Huỷ</button>
            </form>
          )}
        </div>
      )}
      <div className="rp-branches-foot">
        <span className="muted">{allOn ? `Tất cả ${all.length} chi nhánh` : picked.size === 0 ? 'Chưa chọn chi nhánh nào' : `Đang chọn ${picked.size} / ${all.length}`}</span>
        <button
          type="button"
          className={`rp-preset-btn${presetsOpen ? ' on' : ''}`}
          title="Chọn nhanh theo bộ chi nhánh đã lưu"
          onClick={() => { setPresets(readPresets()); setPresetsOpen((x) => !x); setNewName(null); }}
        >
          <Sparkles size={12} /> Chọn nhanh
        </button>
      </div>
    </div>
  );
}

/** print: nút In có chọn mẫu (PrintButton) của màn; không truyền thì In là in nguyên màn hình. */
export function SideActions({ onSearch, onExport, busy, print }: { onSearch: () => void; onExport?: () => void; busy?: boolean; print?: ReactNode }) {
  const qc = useQueryClient();
  // Tìm kiếm luôn lấy số liệu MỚI từ máy chủ (chứng từ đẩy vào tức thời), kể cả khi điều kiện lọc không đổi.
  const search = () => { onSearch(); void qc.invalidateQueries({ type: 'active' }); };
  return (
    <div className="rp-actions">
      <button type="button" className="btn btn-primary" onClick={search} disabled={busy}><Search size={14} /> Tìm kiếm</button>
      <div className="rp-actions-row">
        <button type="button" className="btn" onClick={onExport} disabled={!onExport}><FileSpreadsheet size={14} /> Xuất</button>
        {print ?? <button type="button" className="btn" onClick={() => window.print()}><Printer size={14} /> In</button>}
      </div>
    </div>
  );
}

/**
 * Khung màn có bảng lọc bên trái (như màn báo cáo của phần mềm kế toán để bàn), dùng cho mọi màn có lọc ngày / chi nhánh.
 *   filters  : các ô lọc như cũ (DateRange, BranchSelect, .field…) — trong bảng tự xếp dọc;
 *              BranchSelect nhiều chi nhánh thành danh sách tích chọn, áp dụng khi bấm Tìm kiếm.
 *   Tìm kiếm : áp dụng chi nhánh đã tích rồi tải lại số liệu; In: in trang.
 */
export function FilterLayout({ filters, children, onSearch, print }: { filters: ReactNode; children: ReactNode; onSearch?: () => void; print?: ReactNode }) {
  const appliers = useRef(new Set<() => boolean | void>());
  const box = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const ctx = useMemo<FilterPanelContext>(() => ({ register: (fn) => { appliers.current.add(fn); return () => { appliers.current.delete(fn); }; } }), []);
  const search = () => {
    for (const fn of appliers.current) if (fn() === false) return;
    // Ô tìm kiếm của màn (form gõ rồi Enter) cũng được gửi khi bấm Tìm kiếm.
    box.current?.querySelectorAll<HTMLFormElement>('form:not([data-no-search])').forEach((f) => f.requestSubmit());
    onSearch?.();
    void qc.invalidateQueries({ type: 'active' });
  };
  return (
    <FilterPanelCtx.Provider value={ctx}>
      <ReportSideLayout
        panel={
          <>
            <div className="rp-filters" ref={box}>{filters}</div>
            <div className="rp-actions">
              <button type="button" className="btn btn-primary" onClick={search}><Search size={14} /> Tìm kiếm</button>
              {print ?? <button type="button" className="btn" onClick={() => window.print()}><Printer size={14} /> In</button>}
            </div>
          </>
        }
      >
        {children}
      </ReportSideLayout>
    </FilterPanelCtx.Provider>
  );
}

/** Chi nhánh trong bảng lọc: tích chọn, giữ bản nháp, chỉ đổi điều kiện xem khi bấm Tìm kiếm. */
export function PanelBranchList({ value, onChange, warehouses }: { value: string; onChange: (v: string) => void; warehouses?: { value: string; onChange: (v: string) => void } }) {
  const panel = useFilterPanel();
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => panel?.register(() => {
    if (!branchesPicked(draftRef.current)) return false;
    if (draftRef.current !== valueRef.current) onChange(draftRef.current);
  }), [panel, onChange]);
  // Mã kho (nếu màn có lọc kho): bản nháp riêng, áp dụng cùng lúc bấm Tìm kiếm.
  const [whDraft, setWhDraft] = useState(warehouses?.value ?? '');
  const whRef = useRef(whDraft);
  whRef.current = whDraft;
  const whValue = warehouses?.value ?? '';
  const whValueRef = useRef(whValue);
  whValueRef.current = whValue;
  const whChange = warehouses?.onChange;
  useEffect(() => { setWhDraft(whValue); }, [whValue]);
  useEffect(() => (whChange ? panel?.register(() => { if (whRef.current !== whValueRef.current) whChange(whRef.current); }) : undefined), [panel, whChange]);
  return (
    <>
      <span className="muted" style={{ fontSize: 12, marginTop: 2 }}>Chi nhánh</span>
      <BranchCheckList value={draft} onChange={setDraft} onRestore={(v) => { setDraft(v); onChange(v); }} />
      {warehouses && (
        <>
          <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>Mã kho</span>
          <WarehouseCheckList branches={draft} value={whDraft} onChange={setWhDraft} />
        </>
      )}
    </>
  );
}

interface WarehouseOption { code: string; branchCode: string; name: string; isActive: boolean; isDefault: boolean }

/**
 * Mã kho của các chi nhánh đang tích (như màn tồn kho của phần mềm kế toán để bàn: tích chi nhánh thì hiện kho của chi nhánh đó).
 * value: các mã kho cách dấu phẩy; rỗng = không lọc theo kho (mọi kho). Kho mặc định gánh các dòng nhập xuất không ghi mã kho.
 * Bỏ tích chi nhánh thì các kho của chi nhánh đó tự rời khỏi danh sách đã chọn.
 */
export function WarehouseCheckList({ branches, value, onChange }: { branches: string; value: string; onChange: (v: string) => void }) {
  const { data = [] } = useQuery({ queryKey: ['warehouses'], queryFn: () => api.get<WarehouseOption[]>('/api/v1/warehouses'), staleTime: 60_000 });
  const [text, setText] = useState('');
  const [onlyActive, setOnlyActive] = useState(true);
  const pickedBranches = branches === BRANCH_NONE ? new Set<string>() : branches ? new Set(branches.split(',')) : null;
  const ofBranches = data.filter((w) => (!pickedBranches || pickedBranches.has(w.branchCode)) && (!onlyActive || w.isActive || value.split(',').includes(w.code)));
  const visibleCodes = new Set(ofBranches.map((w) => w.code));
  const picked = new Set(value ? value.split(',').filter((c) => visibleCodes.has(c)) : []);
  useEffect(() => {
    if (!value) return;
    const kept = value.split(',').filter((c) => visibleCodes.has(c));
    if (kept.length !== value.split(',').length) onChange(kept.join(','));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches, data.length]);
  const q = text.trim().toLowerCase();
  const shown = ofBranches.filter((w) => !q || w.code.toLowerCase().includes(q) || w.name.toLowerCase().includes(q));
  const emit = (s: Set<string>) => onChange(ofBranches.filter((w) => s.has(w.code)).map((w) => w.code).join(','));
  const toggle = (code: string) => { const s = new Set(picked); if (s.has(code)) s.delete(code); else s.add(code); emit(s); };
  const allOn = ofBranches.length > 0 && picked.size === ofBranches.length;
  return (
    <div className="rp-branches">
      <div className="rp-branches-head">
        <input className="input" placeholder="Tìm mã, tên kho" value={text} onChange={(e) => setText(e.target.value)} />
        <label className="checkbox" title="Tích / bỏ tích tất cả kho đang hiện"><input type="checkbox" checked={allOn} onChange={() => emit(allOn ? new Set() : new Set(ofBranches.map((w) => w.code)))} /> Chọn</label>
      </div>
      <div className="rp-branches-list">
        {shown.map((w) => (
          <label key={w.code} className="rp-branch" title={`${w.code} — ${w.name} (chi nhánh ${w.branchCode})${w.isDefault ? ' · kho mặc định' : ''}`}>
            <span className="mono rp-branch-code">{w.code}</span>
            <span className="rp-branch-name">{w.name}{w.isDefault ? ' *' : ''}</span>
            <input type="checkbox" checked={picked.has(w.code)} onChange={() => toggle(w.code)} />
          </label>
        ))}
        {shown.length === 0 && <div className="muted" style={{ padding: 6 }}>{data.length ? 'Chi nhánh đang tích chưa có kho' : 'Chưa có danh mục kho (DM12)'}</div>}
      </div>
      <div className="rp-branches-foot">
        <span className="muted">{picked.size === 0 ? 'Mọi kho' : `Đang chọn ${picked.size} / ${ofBranches.length} kho`}</span>
        <label className="checkbox" style={{ fontSize: 11 }} title="Chỉ hiện kho đang theo dõi"><input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} /> Đang dùng</label>
      </div>
    </div>
  );
}
