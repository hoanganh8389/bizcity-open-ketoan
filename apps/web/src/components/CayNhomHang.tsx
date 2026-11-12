// [2026-11-03 04:30 PM Nguyễn Văn Thủy] NHOM — cây nhóm hàng dùng chung: màn Nhóm hàng (DM11) và ô "Chọn nhóm" ở mọi báo cáo theo mã hàng (đóng góp)
/**
 * CÂY NHÓM HÀNG — gốc "Nhóm hàng" → cấp 1 → cấp 2 → cấp 3 → …
 *
 *  - CayNhomHang: cây. Bấm chọn một nhóm (`selected` + `onSelect`, null = gốc) hoặc tích nhiều nhóm (`checkable` + `picked` + `onPick`).
 *    Tích nhóm cha = cả nhánh con bên dưới; bỏ một nhóm con trong nhánh đã tích thì giữ các nhóm anh em còn lại.
 *    Giá trị tích luôn gọn: chỉ giữ nhóm trên cùng (tích đủ mọi nhóm con thì tự gộp lên nhóm cha).
 *  - ChonNhomHang: ô lọc báo cáo "Nhóm hàng: Tất cả | Chọn nhóm" + cây tích. Giá trị = mã nhóm cách dấu phẩy ('' = tất cả).
 *  - useLocNhomHang(value): trả hàm lọc dòng báo cáo theo cột sku (null khi chọn Tất cả) — mã hàng thuộc nhóm lấy từ
 *    GET /api/v1/products/skus-by-group (tính cả nhóm con).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Folder, FolderTree } from 'lucide-react';
import { api } from '@/lib/api';
import { plain } from './pickers';
import { useFilterPanel } from './filterPanel';
import './cay-don-vi.css';

export interface NhomHang { code: string; name: string; parentCode: string | null; isActive: boolean; products: number; skuCode?: string; fullName?: string; createdBy?: string; createdAt?: string | null; updatedBy?: string; updatedAt?: string | null }

export const useNhomHang = () => useQuery({ queryKey: ['item-classes', 'group'], queryFn: () => api.get<NhomHang[]>('/api/v1/item-classes/group'), staleTime: 60_000 });

/** Độ dài mã ngắn (mã ghép vào mã hàng) theo cấp; cấp sâu hơn không ghép vào mã hàng. */
export const MA_NGAN_DAI: Record<number, number> = { 1: 2, 2: 3, 3: 1 };

export interface NhomIndex {
  byCode: Map<string, NhomHang>;
  kids: Map<string, NhomHang[]>;
  roots: NhomHang[];
  level: (code: string | null) => number;
  path: (code: string | null) => string;
  /** Đầu mã hàng của nhóm = mã ngắn các cấp 1 → 3 ghép lại ('' khi còn cấp chưa có mã ngắn). */
  prefix: (code: string | null) => string;
  subtree: (code: string) => Set<string>;
  parentOf: (code: string) => string | null;
}

export function indexNhom(list: NhomHang[] | undefined): NhomIndex {
  const all = list ?? [];
  const byCode = new Map(all.map((c) => [c.code, c]));
  const parentOf = (code: string) => { const p = byCode.get(code)?.parentCode; return p && p !== code && byCode.has(p) ? p : null; };
  const kids = new Map<string, NhomHang[]>();
  const roots: NhomHang[] = [];
  for (const c of all) { const p = parentOf(c.code); if (p) (kids.get(p) ?? kids.set(p, []).get(p)!).push(c); else roots.push(c); }
  const byName = (a: NhomHang, b: NhomHang) => a.name.localeCompare(b.name, 'vi');
  roots.sort(byName);
  for (const l of kids.values()) l.sort(byName);
  const chain = (code: string | null) => {
    const out: NhomHang[] = [];
    const seen = new Set<string>();
    for (let c = code; c && !seen.has(c); c = parentOf(c)) { seen.add(c); const n = byCode.get(c); if (n) out.unshift(n); }
    return out;
  };
  const subtree = (code: string) => {
    const s = new Set<string>();
    const walk = (c: string) => { if (s.has(c)) return; s.add(c); for (const k of kids.get(c) ?? []) walk(k.code); };
    walk(code);
    return s;
  };
  return {
    byCode, kids, roots, subtree, parentOf,
    level: (code) => chain(code).length,
    path: (code) => chain(code).map((c) => c.name).join(' / '),
    prefix: (code) => {
      const segs = chain(code).slice(0, 3).map((c) => c.skuCode ?? '');
      const firstEmpty = segs.indexOf('');
      return (firstEmpty < 0 ? segs : segs.slice(0, firstEmpty)).join('');
    },
  };
}

export interface CayNhomHangProps {
  list: NhomHang[] | undefined;
  selected?: string | null;
  onSelect?: (code: string | null) => void;
  checkable?: boolean;
  picked?: string[];
  onPick?: (codes: string[]) => void;
  height?: number | string;
  /** Mở sẵn tới cấp này (0 = chỉ gốc). */
  openLevel?: number;
  /** Ẩn nhóm ngừng dùng (vẫn hiện nhóm đang chọn / đang tích). */
  hideInactive?: boolean;
}

export function CayNhomHang({ list, selected, onSelect, checkable = false, picked = [], onPick, height = 420, openLevel = 0, hideInactive = false }: CayNhomHangProps) {
  const ix = useMemo(() => indexNhom(list), [list]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const inited = useRef(false);
  useEffect(() => {
    if (inited.current || !list?.length) return;
    inited.current = true;
    const s = new Set<string>();
    for (const c of list) if (ix.level(c.code) < openLevel) s.add(c.code);
    // Mở sẵn đường tới nhóm đang chọn.
    for (let c = selected ? ix.parentOf(selected) : null; c; c = ix.parentOf(c)) s.add(c);
    setOpen(s);
  }, [list, ix, openLevel, selected]);

  const pickedSet = useMemo(() => new Set(picked), [picked]);
  // Nhóm "đang tích" = chính nó hoặc một nhóm cha của nó đã tích.
  const onState = (code: string) => { for (let c: string | null = code; c; c = ix.parentOf(c)) if (pickedSet.has(c)) return true; return false; };
  const someBelow = useMemo(() => { const s = new Set<string>(); for (const p of picked) for (let c = ix.parentOf(p); c; c = ix.parentOf(c)) s.add(c); return s; }, [picked, ix]);
  const state = (code: string): 'on' | 'off' | 'some' => (onState(code) ? 'on' : someBelow.has(code) ? 'some' : 'off');

  const toggle = (code: string) => {
    const s = new Set(pickedSet);
    if (state(code) === 'on') {
      // Bỏ tích: nhóm tích nằm phía trên → tách thành các nhóm anh em dọc đường xuống, trừ nhánh đang bỏ.
      const up: string[] = [];
      for (let c: string | null = code; c; c = ix.parentOf(c)) { up.unshift(c); if (s.has(c)) break; }
      s.delete(up[0]!);
      for (let i = 0; i < up.length - 1; i++) for (const k of ix.kids.get(up[i]!) ?? []) if (k.code !== up[i + 1]) s.add(k.code);
    } else {
      for (const c of ix.subtree(code)) s.delete(c);
      s.add(code);
      // Tích đủ mọi nhóm con → gộp lên nhóm cha.
      for (let p = ix.parentOf(code); p; p = ix.parentOf(p)) {
        const ks = ix.kids.get(p) ?? [];
        if (!ks.every((k) => s.has(k.code))) break;
        for (const k of ks) s.delete(k.code);
        s.add(p);
      }
    }
    onPick?.([...s]);
  };

  const s = plain(q.trim());
  const shown = useMemo(() => {
    if (!s) return null;
    const keep = new Set<string>();
    for (const c of list ?? []) if (plain(c.name).includes(s) || plain(c.code) === s || (c.skuCode && plain(c.skuCode) === s)) {
      for (const x of ix.subtree(c.code)) keep.add(x);
      for (let p = ix.parentOf(c.code); p; p = ix.parentOf(p)) keep.add(p);
    }
    return keep;
  }, [s, list, ix]);
  const isOpen = (code: string) => open.has(code) || Boolean(shown && (ix.kids.get(code) ?? []).some((k) => shown.has(k.code)));
  const flip = (code: string) => setOpen((o) => { const n = new Set(o); if (n.has(code)) n.delete(code); else n.add(code); return n; });

  const row = (c: NhomHang, depth: number): React.ReactNode => {
    if (shown && !shown.has(c.code)) return null;
    if (hideInactive && !c.isActive && selected !== c.code && !pickedSet.has(c.code)) return null;
    const ks = ix.kids.get(c.code) ?? [];
    const o = isOpen(c.code);
    const st = checkable ? state(c.code) : 'off';
    return (
      <div key={c.code}>
        <div className={`cdv-row cdv-node${selected === c.code ? ' sel' : ''}${c.isActive ? '' : ' off'}`} style={{ paddingLeft: depth * 16 + 4 }}
          onClick={() => (onSelect ? onSelect(c.code) : checkable ? toggle(c.code) : ks.length && flip(c.code))}
          title={`${ix.path(c.code)} — cấp ${ix.level(c.code)}${c.skuCode ? ` · mã ngắn ${c.skuCode}` : ''}${c.isActive ? '' : ' (ngừng dùng)'}`}>
          <button type="button" className="cdv-tog" disabled={!ks.length} onClick={(e) => { e.stopPropagation(); flip(c.code); }}>{ks.length ? (o ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : null}</button>
          {checkable && <input type="checkbox" className="cdv-check" checked={st === 'on'} ref={(el) => { if (el) el.indeterminate = st === 'some'; }} onChange={() => toggle(c.code)} onClick={(e) => e.stopPropagation()} />}
          <Folder size={13} className="cdv-ic" />
          <span className="cdv-name">{c.name}</span>
        </div>
        {o && ks.map((k) => row(k, depth + 1))}
      </div>
    );
  };

  return (
    <div className="cdv">
      <div className="cdv-head"><input className="input" placeholder="Tìm nhóm" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="cdv-body" style={{ maxHeight: height, height }}>
        {!list ? <div className="muted cdv-empty">Đang tải nhóm hàng…</div> : (
          <>
            <div className={`cdv-row cdv-node lv0${onSelect && selected === null ? ' sel' : ''}`} style={{ paddingLeft: 4 }} onClick={() => onSelect?.(null)}>
              <span className="cdv-tog" />
              {checkable && <input type="checkbox" className="cdv-check" checked={ix.roots.length > 0 && ix.roots.every((r) => pickedSet.has(r.code))}
                ref={(el) => { if (el) el.indeterminate = picked.length > 0 && !ix.roots.every((r) => pickedSet.has(r.code)); }}
                onChange={(e) => onPick?.(e.target.checked ? ix.roots.map((r) => r.code) : [])} onClick={(e) => e.stopPropagation()} />}
              <FolderTree size={14} className="cdv-ic" /><span className="cdv-name">Nhóm hàng</span>
            </div>
            {ix.roots.map((r) => row(r, 1))}
            {shown && !shown.size && <div className="muted cdv-empty">Không có nhóm nào khớp</div>}
          </>
        )}
      </div>
    </div>
  );
}

/** Mô tả ngắn các nhóm đang tích. */
function tomTat(codes: string[], ix: NhomIndex) {
  if (!codes.length) return 'Tất cả';
  const names = codes.map((c) => ix.byCode.get(c)?.name ?? c);
  return codes.length === 1 ? names[0]! : `${codes.length} nhóm: ${names.join(', ')}`;
}

/**
 * Ô lọc "Nhóm hàng" của báo cáo: Tất cả | Chọn nhóm (cây tích, tích cha = cả nhánh). Giá trị = mã nhóm cách dấu phẩy, '' = tất cả.
 * Trong bảng lọc bên trái: hiện cây ngay dưới; ở thanh lọc trên: nút thả xuống.
 */
export function ChonNhomHang({ value, onChange, label = 'Nhóm hàng' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const q = useNhomHang();
  const ix = useMemo(() => indexNhom(q.data), [q.data]);
  const codes = useMemo(() => (value ? value.split(',').filter(Boolean) : []), [value]);
  const [chon, setChon] = useState(codes.length > 0);
  const inPanel = useFilterPanel() !== null;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const body = (
    <div className="cnh">
      <div className="cnh-mode">
        <label className="checkbox"><input type="radio" checked={!chon} onChange={() => { setChon(false); onChange(''); }} /> Tất cả</label>
        <label className="checkbox"><input type="radio" checked={chon} onChange={() => setChon(true)} /> Chọn nhóm</label>
      </div>
      {chon && <CayNhomHang list={q.data} checkable picked={codes} onPick={(c) => onChange(c.join(','))} height={inPanel ? 240 : 320} hideInactive />}
    </div>
  );
  if (inPanel) return <div className="field cnh-field"><label>{label}</label>{body}</div>;
  return (
    <div className="field multi" ref={box}>
      <label>{label}</label>
      <button type="button" className="select input w-lg multi-btn" onClick={() => setOpen((x) => !x)} title={tomTat(codes, ix)}><span>{tomTat(codes, ix)}</span><ChevronDown size={14} /></button>
      {open && <div className="multi-drop" style={{ width: 340, padding: 8 }}>{body}</div>}
    </div>
  );
}

/**
 * Lọc dòng báo cáo theo nhóm hàng đã chọn (cột sku). Trả null khi chọn Tất cả (không lọc).
 * `dangTai` = đang lấy danh sách mã của nhóm — báo cáo nên coi như chưa có dữ liệu.
 */
export function useLocNhomHang(value: string) {
  const q = useQuery({
    queryKey: ['skus-by-group', value], enabled: Boolean(value), staleTime: 60_000,
    queryFn: () => api.get<{ skus: string[] }>('/api/v1/products/skus-by-group', { groups: value }),
  });
  return useMemo(() => {
    const set = value ? new Set(q.data?.skus ?? []) : null;
    const loc = <T extends { sku: string }>(rows: T[]): T[] => (set ? rows.filter((r) => set.has(r.sku)) : rows);
    return { loc, dangTai: Boolean(value) && q.isLoading, coLoc: Boolean(value) };
  }, [value, q.data, q.isLoading]);
}
