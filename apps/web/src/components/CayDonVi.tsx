// [2026-11-03 10:39 AM Nguyễn Văn Thủy] SDTC — cây đơn vị theo sơ đồ tổ chức: Công ty → Miền → Chi nhánh → Tỉnh → điểm kinh doanh → kho; tích cha tích hết con
/**
 * CÂY ĐƠN VỊ theo sơ đồ tổ chức (giống thẻ "Tree" của bộ chọn chi nhánh / kho quen dùng).
 *
 *  Hai cách dùng:
 *   - Tích chọn (bộ lọc báo cáo): `checkable` + `picked` (mã chi nhánh) + `pickedWarehouses` (mã kho, rỗng = mọi kho của chi nhánh đã tích).
 *     Tích một nút = tích mọi chi nhánh (và kho) bên dưới; nút có một phần được tích hiện ô gạch ngang.
 *   - Bấm chọn nút (màn DM16, ô Thuộc SĐTC): `selected` + `onSelect`.
 *  Ô tìm: gõ mã / tên (không dấu, nhiều từ) — giữ nhánh cha của dòng khớp và tự mở ra.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Modal } from './ui';
import { useOrgTree } from '@/lib/orgUnits';
import { ChevronDown, ChevronRight, Building2, MapPin, Store, Warehouse } from 'lucide-react';
import { branchOff, indexOrg, levelName, matchText, type OrgBranch, type OrgNode, type OrgTree } from '@/lib/orgUnits';
import './cay-don-vi.css';

export interface CayDonViProps {
  tree: OrgTree | undefined;
  /** Hiện chi nhánh (điểm kinh doanh) dưới nút. */
  showBranches?: boolean;
  /** Hiện kho dưới chi nhánh (chỉ khi showBranches). */
  showWarehouses?: boolean;
  checkable?: boolean;
  picked?: string[];
  pickedWarehouses?: string[];
  onPick?: (branches: string[], warehouses: string[]) => void;
  selected?: string | null;
  onSelect?: (node: OrgNode) => void;
  /** Bấm vào chi nhánh (chế độ chọn nút). */
  onSelectBranch?: (b: OrgBranch) => void;
  /** Phần thêm cuối dòng nút (vd nhãn "Đơn vị mua hàng"). */
  nodeExtra?: (n: OrgNode) => ReactNode;
  height?: number | string;
  /** Mở sẵn tới cấp này (0 = chỉ gốc). */
  openLevel?: number;
}

export function CayDonVi({
  tree, showBranches = false, showWarehouses = false, checkable = false, picked = [], pickedWarehouses = [], onPick,
  selected, onSelect, onSelectBranch, nodeExtra, height = 420, openLevel = 1,
}: CayDonViProps) {
  const ix = useMemo(() => indexOrg(tree), [tree]);
  const [q, setQ] = useState('');
  const [onlyActive, setOnlyActive] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const inited = useRef(false);
  useEffect(() => {
    if (inited.current || !tree?.nodes.length) return;
    inited.current = true;
    setOpen(new Set(tree.nodes.filter((n) => n.level < openLevel).map((n) => n.code)));
  }, [tree, openLevel]);

  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const branchByCode = useMemo(() => new Map((tree?.branches ?? []).map((b) => [b.code, b])), [tree]);
  const whSet = useMemo(() => new Set(pickedWarehouses), [pickedWarehouses]);
  const visibleBranch = (b: OrgBranch) => !onlyActive || !branchOff(b) || pickedSet.has(b.code);

  // Tìm: nút khớp → hiện cả nhánh; chi nhánh / kho khớp → hiện chi nhánh + đường cha.
  const searching = q.trim().length > 0;
  const shown = useMemo(() => {
    if (!searching) return null;
    const nodes = new Set<string>(), branches = new Set<string>();
    const addUp = (code: string | null) => { for (let c = code; c && !nodes.has(c); c = ix.byCode.get(c)?.parentCode ?? null) nodes.add(c); };
    for (const n of tree?.nodes ?? []) if (matchText(q, n.code, n.name)) {
      addUp(n.code);
      for (const c of ix.subtree(n.code)) { nodes.add(c); for (const b of ix.branchesAt.get(c) ?? []) branches.add(b.code); }
    }
    if (showBranches) for (const b of tree?.branches ?? []) if (b.orgCode && matchText(q, b.code, b.name, ...(showWarehouses ? b.warehouses.map((w) => w.code) : []))) { branches.add(b.code); addUp(b.orgCode); }
    return { nodes, branches };
  }, [searching, q, tree, ix, showBranches, showWarehouses]);

  const toggleOpen = (code: string) => setOpen((s) => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n; });
  const isOpen = (code: string) => searching || open.has(code);

  /* ---------- tích chọn ---------- */
  const emit = (b: Set<string>, w: Set<string>) => onPick?.([...b], [...w]);
  const branchesIn = (code: string) => ix.branchesUnder(code).filter(visibleBranch);
  const nodeState = (code: string): 'on' | 'off' | 'some' => {
    const list = branchesIn(code);
    if (!list.length) return 'off';
    const n = list.filter((b) => pickedSet.has(b.code)).length;
    return n === 0 ? 'off' : n === list.length ? 'on' : 'some';
  };
  const setBranches = (codes: string[], on: boolean) => {
    const b = new Set(pickedSet);
    const w = new Set(whSet);
    for (const c of codes) {
      if (on) b.add(c); else b.delete(c);
      if (!on) for (const x of branchByCode.get(c)?.warehouses ?? []) w.delete(x.code);
    }
    // Đang lọc theo kho: chi nhánh mới tích kéo theo mọi kho của nó.
    if (on && w.size) for (const c of codes) for (const x of branchByCode.get(c)?.warehouses ?? []) w.add(x.code);
    emit(b, w);
  };
  const toggleWarehouse = (br: OrgBranch, code: string) => {
    const b = new Set(pickedSet);
    let w = new Set(whSet);
    if (!w.size) w = new Set((tree?.branches ?? []).filter((x) => b.has(x.code)).flatMap((x) => x.warehouses.map((y) => y.code)));
    if (w.has(code) && b.has(br.code)) w.delete(code); else { w.add(code); b.add(br.code); }
    // Kho của chi nhánh bỏ hết → bỏ tích chi nhánh.
    if (!br.warehouses.some((x) => w.has(x.code))) b.delete(br.code);
    const all = (tree?.branches ?? []).filter((x) => b.has(x.code)).flatMap((x) => x.warehouses.map((y) => y.code));
    emit(b, all.every((c) => w.has(c)) ? new Set() : w);
  };

  const Check = ({ state, onClick, title }: { state: 'on' | 'off' | 'some'; onClick: () => void; title: string }) => (
    <input type="checkbox" className="cdv-check" title={title} checked={state === 'on'} ref={(el) => { if (el) el.indeterminate = state === 'some'; }} onChange={onClick} onClick={(e) => e.stopPropagation()} />
  );

  const renderBranch = (b: OrgBranch, depth: number) => {
    if (shown && !shown.branches.has(b.code)) return null;
    if (!visibleBranch(b)) return null;
    const bOpen = open.has(`br:${b.code}`) || (searching && showWarehouses && b.warehouses.some((w) => matchText(q, w.code)));
    return (
      <div key={`b-${b.code}`}>
        <div className={`cdv-row cdv-branch${branchOff(b) ? ' off' : ''}`} style={{ paddingLeft: depth * 16 + 4 }} onClick={() => onSelectBranch?.(b)}
          title={`${b.code} — ${b.name}${branchOff(b) ? ' (ngừng)' : ''}`}>
          {showWarehouses && b.warehouses.length ? <button type="button" className="cdv-tog" onClick={(e) => { e.stopPropagation(); toggleOpen(`br:${b.code}`); }}>{bOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button> : <span className="cdv-tog" />}
          {checkable && <Check state={pickedSet.has(b.code) ? 'on' : 'off'} onClick={() => setBranches([b.code], !pickedSet.has(b.code))} title="Tích / bỏ chi nhánh" />}
          <Store size={13} className="cdv-ic" />
          <span className="mono cdv-code">{b.code}</span><span className="cdv-name">{b.name}</span>
          {branchOff(b) && <span className="cdv-tag">ngừng</span>}
        </div>
        {showWarehouses && bOpen && b.warehouses.map((w) => {
          const on = pickedSet.has(b.code) && (!whSet.size || whSet.has(w.code));
          return (
            <div key={`w-${w.code}`} className={`cdv-row cdv-wh${w.isActive ? '' : ' off'}`} style={{ paddingLeft: (depth + 1) * 16 + 4 }} title={`Kho ${w.code} — ${w.name}${w.isDefault ? ' (kho mặc định)' : ''}`}>
              <span className="cdv-tog" />
              {checkable && <Check state={on ? 'on' : 'off'} onClick={() => toggleWarehouse(b, w.code)} title="Tích / bỏ kho" />}
              <Warehouse size={12} className="cdv-ic" />
              <span className="mono cdv-code">{w.code}</span><span className="cdv-name">{w.name}{w.isDefault ? ' *' : ''}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderNode = (n: OrgNode, depth: number): ReactNode => {
    if (shown && !shown.nodes.has(n.code)) return null;
    const children = ix.kids.get(n.code) ?? [];
    const branches = showBranches ? ix.branchesAt.get(n.code) ?? [] : [];
    const has = children.length > 0 || branches.length > 0;
    const o = isOpen(n.code);
    return (
      <div key={`n-${n.code}`}>
        <div className={`cdv-row cdv-node lv${Math.min(n.level, 4)}${selected === n.code ? ' sel' : ''}${n.isActive ? '' : ' off'}`} style={{ paddingLeft: depth * 16 + 4 }}
          onClick={() => (onSelect ? onSelect(n) : has && toggleOpen(n.code))} title={`${n.path} — ${levelName(n.level)}${n.isActive ? '' : ' (ngừng dùng)'} · ${n.totalBranches} điểm kinh doanh`}>
          <button type="button" className="cdv-tog" disabled={!has} onClick={(e) => { e.stopPropagation(); toggleOpen(n.code); }}>{has ? (o ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : null}</button>
          {checkable && <Check state={nodeState(n.code)} onClick={() => setBranches(branchesIn(n.code).map((b) => b.code), nodeState(n.code) !== 'on')} title="Tích / bỏ cả nhánh" />}
          {n.level === 0 || n.kind === 'company' ? <Building2 size={14} className="cdv-ic" /> : <MapPin size={13} className="cdv-ic" />}
          <span className="mono cdv-code">{n.code}</span>
          <span className="cdv-name">{n.name}</span>
          {nodeExtra?.(n)}
        </div>
        {o && (
          <>
            {children.map((c) => renderNode(c, depth + 1))}
            {branches.map((b) => renderBranch(b, depth + 1))}
          </>
        )}
      </div>
    );
  };

  const allVisible = (tree?.branches ?? []).filter((b) => b.orgCode && visibleBranch(b));
  return (
    <div className="cdv">
      <div className="cdv-head">
        <input className="input" placeholder={showBranches ? 'Tìm mã, tên nút / chi nhánh / kho' : 'Tìm mã, tên nút'} value={q} onChange={(e) => setQ(e.target.value)} />
        {/* [2026-11-03 03:10 PM Nguyễn Văn Thủy] SDTC — ô ẩn chi nhánh ngừng chỉ có ở cây có chi nhánh (bộ lọc báo cáo), màn DM16 không có */}
        {showBranches && <label className="checkbox" title="Ẩn chi nhánh đã ngừng (tắt theo dõi hoặc mã _OFF)"><input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} /> Đang dùng</label>}
      </div>
      {checkable && (
        <div className="cdv-tools">
          <button type="button" className="btn btn-sm" onClick={() => emit(new Set(allVisible.map((b) => b.code)), new Set())}>Chọn tất</button>
          <button type="button" className="btn btn-sm" onClick={() => emit(new Set(), new Set())}>Bỏ chọn</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(new Set((tree?.nodes ?? []).map((n) => n.code)))}>Mở hết</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(new Set(ix.roots.map((r) => r.code)))}>Thu gọn</button>
        </div>
      )}
      <div className="cdv-body" style={{ maxHeight: height }}>
        {!tree ? <div className="muted cdv-empty">Đang tải sơ đồ tổ chức…</div>
          : !ix.root ? <div className="muted cdv-empty">Chưa có sơ đồ tổ chức — khai ở Danh mục → Sơ đồ tổ chức (DM16).</div>
          : ix.roots.map((r) => renderNode(r, 0))}
      </div>
      {checkable && (
        <div className="cdv-foot muted">
          {picked.length === 0 ? 'Chưa tích chi nhánh nào' : `Đang chọn ${picked.length} chi nhánh${pickedWarehouses.length ? ` · ${pickedWarehouses.length} kho` : ' · mọi kho'}`}
          {ix.unassigned.length > 0 && <span title="Chi nhánh chưa gắn sơ đồ tổ chức không hiện trong cây — gắn ở DM16 hoặc DM02"> · {ix.unassigned.length} chưa gắn</span>}
        </div>
      )}
    </div>
  );
}

/**
 * Ô "Thuộc SĐTC" (như form chi nhánh quen dùng): hiện đường dẫn nút, bấm kính lúp mở cây sơ đồ tổ chức để chọn.
 */
export function ChonSoDoToChuc({ value, onChange, disabled }: { value: string | null; onChange: (code: string | null) => void; disabled?: boolean }) {
  const tree = useOrgTree();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string | null>(value);
  const path = tree.data?.nodes.find((n) => n.code === value)?.path ?? '';
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <input className="input" readOnly value={path || (value ?? '')} placeholder={tree.data?.nodes.length ? 'Bấm kính lúp để chọn' : 'Chưa có sơ đồ tổ chức (DM16)'} style={{ flex: 1 }} onDoubleClick={() => !disabled && setOpen(true)} />
      <button type="button" className="btn btn-sm" disabled={disabled} title="Chọn trên sơ đồ tổ chức" onClick={() => { setPick(value); setOpen(true); }}><Search size={14} /></button>
      {open && (
        <Modal title="Chọn sơ đồ tổ chức" onClose={() => setOpen(false)}
          footer={<><button className="btn btn-primary" disabled={!pick} onClick={() => { onChange(pick); setOpen(false); }}>Chọn</button>
            {value && <button className="btn" onClick={() => { onChange(null); setOpen(false); }}>Bỏ gắn</button>}
            <button className="btn" onClick={() => setOpen(false)}>Thoát</button></>}>
          <div className="full"><CayDonVi tree={tree.data} selected={pick} onSelect={(n) => setPick(n.code)} height={420} openLevel={2} /></div>
        </Modal>
      )}
    </div>
  );
}
