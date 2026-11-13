// [2026-11-13 Nguyễn Văn Thủy] Cơ cấu tổ chức một màn — làm lại đơn giản: MỘT bảng cây + MỘT hộp thoại chọn loại (đóng góp)
/**
 * CƠ CẤU TỔ CHỨC (DM16) — khai báo ở duy nhất một màn.
 *
 *   Bảng: một bảng dạng cây, mỗi dòng một nút: Mã · Tên · Loại · MST · Ghi chú · Theo dõi.
 *   Loại nút:
 *     Công ty        được nhiều công ty cha; công ty con nằm trong cây        (org_units kind=company)
 *     Cơ cấu cấp N   miền, chi nhánh, tỉnh… tên tự đặt, cấp tự tính theo cây   (org_units kind=unit)
 *     Cửa hàng       mã khớp hệ thống bán hàng; phòng ban riêng là một ô       (branches)
 *     Kho            thuộc một cửa hàng                                         (warehouses)
 *     Phòng ban      phòng ban chung (kế toán, kinh doanh…)                    (dimensions department)
 *   Hộp thoại Thêm / Sửa: chọn Loại → chọn Thuộc (chỉ hiện nút cha hợp lệ) → các ô của loại đó. Cuối hộp: lịch sử thay đổi.
 *   Sơ đồ: khối công ty / cơ cấu, bấm khối mở hộp thoại của nút đó.
 * Dữ liệu vẫn ở bảng riêng của từng loại (sổ sách, kho, phân quyền đang chạy không đổi); màn này chỉ gom lại.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronDown, ChevronRight, FileDown, FileUp, FolderOpen, Network, Plus, RefreshCw, RotateCcw, Store, Users, Warehouse as WarehouseIcon } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Hoi, Loading, Modal, useViewAgain } from '@/components/ui';
import { ListPicker, plain } from '@/components/pickers';
import { invalidateOrg, useOrgTree, type OrgNode } from '@/lib/orgUnits';
import type { Branch } from './BranchesPage';
import { useWarehouses, type Warehouse } from './WarehousesPage';
import { useWarehouseTypes } from './WarehouseTypesPage';
import type { DimRow } from './DimensionsPage';
import { ImportForm } from './OrgUnitsPage';
import './co-cau.css';

export type Loai = 'company' | 'unit' | 'branch' | 'warehouse' | 'department' | 'none';
const LOAI_TEN: Record<Loai, string> = { company: 'Công ty', unit: 'Cơ cấu', branch: 'Cửa hàng', warehouse: 'Kho', department: 'Phòng ban', none: '' };
const LOAI_ICON: Record<Loai, ReactNode> = {
  company: <Building2 size={14} />, unit: <Network size={14} />, branch: <Store size={14} />, warehouse: <WarehouseIcon size={14} />, department: <Users size={14} />, none: <FolderOpen size={14} />,
};
/** Loại cha hợp lệ của từng loại. */
const CHA: Record<Exclude<Loai, 'none'>, Loai[]> = { company: ['company', 'unit'], unit: ['company', 'unit'], branch: ['company', 'unit'], warehouse: ['branch'], department: ['company', 'unit'] };

export interface CNode {
  key: string; loai: Loai; code: string; name: string; parentKey: string | null; isActive: boolean;
  /** Cấp trên cây (gốc = 0). */
  depth: number;
  org?: OrgNode; branch?: Branch; warehouse?: Warehouse; dept?: DimRow;
}

const NONE_KEY = 'x:none';
const homNay = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const loaiNhan = (n: CNode) => (n.loai === 'unit' ? `Cơ cấu cấp ${n.depth}` : LOAI_TEN[n.loai]);
const off = (n: { code: string; isActive: boolean }) => !n.isActive || /_OFF$/i.test(n.code);
const MST_OK = /^[0-9]{10}(-[0-9]{3})?$/;

/** Gom 4 nguồn (cơ cấu, cửa hàng, kho, phòng ban chung) thành một cây. */
export function useCoCau() {
  const org = useOrgTree();
  const branches = useQuery({ queryKey: ['branches'], queryFn: () => api.get<Branch[]>('/api/v1/branches') });
  const whs = useWarehouses();
  const deps = useQuery({ queryKey: ['dimensions', 'department'], queryFn: () => api.get<DimRow[]>('/api/v1/dimensions/department'), staleTime: 60_000 });
  const data = useMemo(() => {
    const nodes: CNode[] = [];
    const orgCodes = new Set((org.data?.nodes ?? []).map((n) => n.code));
    for (const n of org.data?.nodes ?? []) nodes.push({ key: `o:${n.code}`, loai: n.kind === 'company' || (!n.kind && !n.parentCode) ? 'company' : 'unit', code: n.code, name: n.name, parentKey: n.parentCode ? `o:${n.parentCode}` : null, isActive: n.isActive, depth: 0, org: n });
    const shopDept = new Set<string>();
    for (const b of branches.data ?? []) {
      nodes.push({ key: `b:${b.code}`, loai: 'branch', code: b.code, name: b.name, parentKey: b.orgUnitCode && orgCodes.has(b.orgUnitCode) ? `o:${b.orgUnitCode}` : NONE_KEY, isActive: b.isActive, depth: 0, branch: b });
      if (b.departmentCode) shopDept.add(b.departmentCode);
    }
    for (const w of whs.data ?? []) nodes.push({ key: `w:${w.code}`, loai: 'warehouse', code: w.code, name: w.name, parentKey: `b:${w.branchCode}`, isActive: w.isActive, depth: 0, warehouse: w });
    // Phòng ban riêng của cửa hàng không thành dòng (là ô "Phòng ban" của cửa hàng); chỉ phòng ban chung lên cây.
    for (const d of deps.data ?? []) {
      if (shopDept.has(d.code) || (d.parentCode && shopDept.has(d.parentCode))) continue;
      const o = d.extra?.orgUnitCode;
      nodes.push({ key: `d:${d.code}`, loai: 'department', code: d.code, name: d.name, parentKey: o && orgCodes.has(o) ? `o:${o}` : NONE_KEY, isActive: d.isActive, depth: 0, dept: d });
    }
    const byKey = new Map(nodes.map((n) => [n.key, n]));
    for (const n of nodes) if (n.parentKey && n.parentKey !== NONE_KEY && !byKey.has(n.parentKey)) n.parentKey = NONE_KEY;
    const kids = new Map<string, CNode[]>();
    for (const n of nodes) if (n.parentKey) (kids.get(n.parentKey) ?? kids.set(n.parentKey, []).get(n.parentKey)!).push(n);
    const ORDER: Record<Loai, number> = { company: 0, unit: 1, department: 2, branch: 3, warehouse: 4, none: 5 };
    for (const list of kids.values()) list.sort((a, b) => ORDER[a.loai] - ORDER[b.loai] || (a.org?.sortOrder ?? 0) - (b.org?.sortOrder ?? 0) || a.code.localeCompare(b.code));
    const roots = nodes.filter((n) => !n.parentKey).sort((a, b) => (a.org?.sortOrder ?? 0) - (b.org?.sortOrder ?? 0) || a.code.localeCompare(b.code));
    if (kids.get(NONE_KEY)?.length) {
      const none: CNode = { key: NONE_KEY, loai: 'none', code: '', name: 'Chưa xếp vào cơ cấu', parentKey: null, isActive: true, depth: 0 };
      byKey.set(NONE_KEY, none);
      roots.push(none);
    }
    const setDepth = (list: CNode[], d: number) => { for (const n of list) { n.depth = d; setDepth(kids.get(n.key) ?? [], d + 1); } };
    setDepth(roots, 0);
    const pathOf = (n: CNode): CNode[] => { const out: CNode[] = []; const seen = new Set<string>(); for (let x: CNode | undefined = n; x && !seen.has(x.key); x = x.parentKey ? byKey.get(x.parentKey) : undefined) { seen.add(x.key); out.unshift(x); } return out; };
    const under = (key: string): CNode[] => { const out: CNode[] = []; const stack = [...(kids.get(key) ?? [])]; while (stack.length) { const x = stack.pop()!; out.push(x); stack.push(...(kids.get(x.key) ?? [])); } return out; };
    return { nodes, byKey, kids, roots, pathOf, under };
  }, [org.data, branches.data, whs.data, deps.data]);
  return {
    ...data, orgTree: org.data, departments: deps.data ?? [],
    loading: org.isLoading || branches.isLoading || whs.isLoading || deps.isLoading,
    error: org.error ?? branches.error ?? whs.error ?? deps.error,
    refetch: () => { void org.refetch(); void branches.refetch(); void whs.refetch(); void deps.refetch(); },
  };
}
type CC = ReturnType<typeof useCoCau>;

export function CoCauToChucPage() {
  const { can } = useAuth();
  const canWrite = can('catalog:write');
  const qc = useQueryClient();
  const cc = useCoCau();
  const [sel, setSel] = useState<string | null>(null);
  const [view, setView] = useState<'table' | 'chart'>('table');
  const [form, setForm] = useState<{ key: string | null; parentKey: string | null } | null>(null);
  const [imp, setImp] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const restore = useMutation({
    mutationFn: async () => {
      const info = await api.get<{ nodes: number; assignments: number }>('/api/v1/org-units/defaults');
      if (!window.confirm(`Quay về dữ liệu gốc cơ cấu tổ chức?\n\nTệp gốc: ${info.nodes} nút, ${info.assignments} cửa hàng gắn nút.`)) return null;
      return api.post<{ created: number; updated: number; assigned: number }>('/api/v1/org-units/restore-defaults', { confirm: true });
    },
    onSuccess: (r) => { if (r) { invalidateOrg(qc); setMsg({ ok: true, text: `Đã quay về dữ liệu gốc: ${r.created + r.updated} nút, gắn ${r.assigned} cửa hàng.` }); } },
    onError: (e) => setMsg({ ok: false, text: errorText(e) }),
  });

  const exportExcel = async () => {
    const XLSX = await import('@/lib/excelChuan').then((m) => m.xlsxChuan());
    const rows: (string | number)[][] = [['Loại', 'Mã', 'Tên', 'Thuộc (mã)', 'MST', 'Ghi chú', 'Theo dõi']];
    const walk = (list: CNode[]) => { for (const n of list) { if (n.loai !== 'none') { const p = n.parentKey ? cc.byKey.get(n.parentKey) : null; rows.push([loaiNhan(n), n.code, n.name, p?.code ?? '', mstOf(n), ghiChu(n, cc), off(n) ? '' : 'x']); } walk(cc.kids.get(n.key) ?? []); } };
    walk(cc.roots);
    const nodes = [...(cc.orgTree?.nodes ?? [])].sort((a, b) => a.path.localeCompare(b.path));
    const s2 = [['Mã', 'Tên', 'Mã cha', 'MST', 'Mô tả', 'Đường dẫn']].concat(nodes.map((n) => [n.code, n.name, n.parentCode ?? '', n.taxId ?? '', n.note, n.path]));
    const s3 = [['Mã chi nhánh', 'Tên chi nhánh', 'Mã nút']].concat((cc.orgTree?.branches ?? []).map((b) => [b.code, b.name, b.orgCode ?? '']));
    const wb = XLSX.utils.book_new();
    for (const [name, data, cols] of [['Cơ cấu', rows, [16, 14, 40, 14, 16, 30, 9]], ['Nút', s2, [14, 40, 12, 16, 30, 30]], ['Gắn chi nhánh', s3, [16, 36, 12]]] as const) {
      const ws = XLSX.utils.aoa_to_sheet(data as unknown as string[][]);
      ws['!cols'] = cols.map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(wb, ws, name);
    }
    XLSX.writeFile(wb, 'co-cau-to-chuc.xlsx');
  };

  const selNode = sel ? cc.byKey.get(sel) : null;
  const addParent = selNode && selNode.loai !== 'none' && selNode.loai !== 'department' ? (selNode.loai === 'warehouse' ? selNode.parentKey : selNode.key) : null;
  return (
    <>
      <PageHeader title="Cơ cấu tổ chức" code="DM16" helpKey="so-do-to-chuc" />
      <div className="card">
        <div className="cc-toolbar">
          {canWrite && <button className="btn btn-sm btn-primary" title="Thêm vào dưới dòng đang chọn (chưa chọn: thêm công ty mới)" onClick={() => { setMsg(null); setForm({ key: null, parentKey: addParent }); }}><Plus size={14} /> Thêm</button>}
          <button className="btn btn-sm" onClick={cc.refetch}><RefreshCw size={14} /> Nạp</button>
          <button className="btn btn-sm" onClick={() => void exportExcel()}><FileDown size={14} /> Xuất</button>
          {canWrite && <button className="btn btn-sm" onClick={() => setImp(true)}><FileUp size={14} /> Nhập Excel</button>}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button className={`btn btn-sm${view === 'table' ? ' btn-primary' : ''}`} onClick={() => setView('table')}>Bảng</button>
            <button className={`btn btn-sm${view === 'chart' ? ' btn-primary' : ''}`} onClick={() => setView('chart')}>Sơ đồ</button>
          </div>
          {can('settings:write') && <button className="btn btn-sm" disabled={restore.isPending} title="Đặt lại cây và việc gắn cửa hàng theo tệp gốc" onClick={() => restore.mutate()}><RotateCcw size={14} /> Quay về dữ liệu gốc</button>}
        </div>
        {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'}`} style={{ margin: '0 12px 8px' }}>{msg.text}</div>}
        <ErrorBox error={cc.error ? errorText(cc.error) : null} />
        <div style={{ padding: '0 12px 12px' }}>
          {cc.loading ? <Loading /> : view === 'table'
            ? <BangCoCau cc={cc} selected={sel} onSelect={setSel} onOpen={(n) => n.loai !== 'none' && setForm({ key: n.key, parentKey: n.parentKey })} />
            : <SoDoCoCau cc={cc} selected={sel} onOpen={(n) => { setSel(n.key); setForm({ key: n.key, parentKey: n.parentKey }); }} />}
        </div>
      </div>
      {form && <NutForm cc={cc} nodeKey={form.key} parentKey={form.parentKey} canWrite={canWrite} onClose={() => setForm(null)} onSaved={(key) => { setSel(key); setForm({ key, parentKey: null }); }} />}
      {imp && <ImportForm onClose={() => setImp(false)} onSaved={(text) => { setImp(false); invalidateOrg(qc); setMsg({ ok: true, text }); }} />}
    </>
  );
}

const mstOf = (n: CNode) => n.org?.taxId ?? n.branch?.taxCode ?? (n.warehouse ? n.warehouse.taxId ?? '' : '');
function ghiChu(n: CNode, cc: CC): string {
  if (n.org) return n.org.note;
  if (n.branch) return n.branch.departmentCode ? `Phòng ban ${n.branch.departmentCode}` : '';
  if (n.warehouse) { const t = n.warehouse.typeName || n.warehouse.typeCode; return [t, n.warehouse.isDefault ? 'kho mặc định' : ''].filter(Boolean).join(' · '); }
  if (n.dept) return n.dept.note;
  void cc;
  return '';
}

/* ------------------------------------------------------------------ bảng cây */

function BangCoCau({ cc, selected, onSelect, onOpen }: { cc: CC; selected: string | null; onSelect: (key: string) => void; onOpen: (n: CNode) => void }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(cc.nodes.filter((n) => n.org && n.depth < 1).map((n) => n.key)));
  const [q, setQ] = useState('');
  const [show, setShow] = useState({ warehouse: true, off: false });
  const visible = (n: CNode) => (n.loai !== 'warehouse' || show.warehouse) && (show.off || !off(n));
  const words = plain(q).split(/\s+/).filter(Boolean);
  const hit = useMemo(() => {
    if (!words.length) return null;
    const keep = new Set<string>();
    for (const n of cc.nodes) if (words.every((w) => plain(`${n.code} ${n.name}`).includes(w))) for (const x of cc.pathOf(n)) keep.add(x.key);
    return keep;
  }, [q, cc]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (k: string) => setOpen((o) => { const s = new Set(o); if (s.has(k)) s.delete(k); else s.add(k); return s; });
  const out: ReactNode[] = [];
  const walk = (list: CNode[]) => {
    for (const n of list) {
      if (!visible(n) || (hit && !hit.has(n.key))) continue;
      const kids = (cc.kids.get(n.key) ?? []).filter(visible);
      const o = hit ? true : open.has(n.key);
      out.push(
        <tr key={n.key} className={`cc-tr cc-${n.loai}${selected === n.key ? ' on' : ''}${off(n) ? ' muted' : ''}`} onClick={() => onSelect(n.key)} onDoubleClick={() => onOpen(n)}>
          <td>
            <div className="cc-cell" style={{ paddingLeft: n.depth * 18 }}>
              <button type="button" className="cc-tog" disabled={!kids.length} onClick={(e) => { e.stopPropagation(); toggle(n.key); }}>{kids.length ? (o ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : null}</button>
              <span className="cc-ic">{LOAI_ICON[n.loai]}</span>
              <span className="mono">{n.code}</span>
            </div>
          </td>
          <td className="cc-name">{n.name}{kids.length > 0 && !o && <span className="cc-count" title="Số dòng bên trong">{kids.length}</span>}</td>
          <td>{loaiNhan(n)}</td>
          <td className="mono">{mstOf(n)}</td>
          <td className="muted">{ghiChu(n, cc)}</td>
          <td style={{ textAlign: 'center' }}>{n.loai !== 'none' && <input type="checkbox" readOnly checked={!off(n)} tabIndex={-1} />}</td>
        </tr>,
      );
      if (o) walk(kids);
    }
  };
  walk(cc.roots);
  return (
    <>
      <div className="cc-filter">
        <input className="input" style={{ width: 320 }} placeholder="Tìm mã, tên" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="checkbox"><input type="checkbox" checked={show.warehouse} onChange={(e) => setShow((s) => ({ ...s, warehouse: e.target.checked }))} /> Hiện kho</label>
        <label className="checkbox"><input type="checkbox" checked={show.off} onChange={(e) => setShow((s) => ({ ...s, off: e.target.checked }))} /> Hiện đã ngừng</label>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(new Set(cc.nodes.filter((n) => n.org).map((n) => n.key)))}>Mở hết cơ cấu</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(new Set())}>Thu gọn</button>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>Bấm đúp một dòng để xem / sửa</span>
      </div>
      <div className="table-wrap cc-table">
        <table className="grid">
          <thead><tr>
            <th style={{ width: 300 }} title="Mã của nút">Mã</th><th title="Tên">Tên</th><th style={{ width: 130 }} title="Công ty, cơ cấu (cấp tính theo cây), cửa hàng, kho, phòng ban">Loại</th>
            <th style={{ width: 140 }} title="Mã số thuế đặt ở nút; trống = theo nút trên">MST</th><th style={{ width: 220 }} title="Mô tả; cửa hàng: phòng ban; kho: loại kho">Ghi chú</th><th style={{ width: 70 }} title="Đang dùng">Theo dõi</th>
          </tr></thead>
          <tbody>{out}</tbody>
        </table>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ sơ đồ */

function SoDoCoCau({ cc, selected, onOpen }: { cc: CC; selected: string | null; onOpen: (n: CNode) => void }) {
  const orgKids = (k: string) => (cc.kids.get(k) ?? []).filter((n) => n.org);
  const count = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const n of cc.nodes) if (n.org) { const c: Record<string, number> = {}; for (const x of cc.under(n.key)) if (!off(x)) c[x.loai] = (c[x.loai] ?? 0) + 1; m.set(n.key, c); }
    return m;
  }, [cc]);
  const box = (n: CNode) => {
    const c = count.get(n.key) ?? {};
    return (
      <div role="button" tabIndex={0} className={`cc-box cc-${n.loai} lv${Math.min(n.depth, 3)}${selected === n.key ? ' on' : ''}${n.isActive ? '' : ' muted'}`}
        onClick={() => onOpen(n)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(n); }} title={`${loaiNhan(n)} · bấm để xem / sửa`}>
        <div className="cc-box-name">{n.name}</div>
        <div className="cc-box-code">{n.code}</div>
        {(c.branch || c.warehouse || c.department) ? <div className="cc-box-n">{c.branch ? <span title="Cửa hàng"><Store size={11} /> {c.branch}</span> : null}{c.warehouse ? <span title="Kho"><WarehouseIcon size={11} /> {c.warehouse}</span> : null}{c.department ? <span title="Phòng ban"><Users size={11} /> {c.department}</span> : null}</div> : null}
      </div>
    );
  };
  const draw = (n: CNode, depth: number): ReactNode => {
    const kids = orgKids(n.key);
    if (!kids.length) return box(n);
    if (depth >= 2) return <>{box(n)}<div className="cc-vlist">{kids.map((k) => <div key={k.key} className="cc-vitem"><span className="cc-vline" />{draw(k, depth + 1)}</div>)}</div></>;
    return (
      <>
        <div className="cc-center">{box(n)}</div>
        <div className="cc-stem" />
        <div className="cc-hrow">
          {kids.map((k, i) => (
            <div key={k.key} className="cc-hcell">
              {kids.length > 1 && <div className="cc-hline" style={{ left: i === 0 ? '50%' : 0, right: i === kids.length - 1 ? '50%' : 0 }} />}
              <div className="cc-hstem" />
              {draw(k, depth + 1)}
            </div>
          ))}
        </div>
      </>
    );
  };
  const roots = cc.roots.filter((r) => r.org);
  return (
    <div className="cc-chart">
      {roots.length === 0 ? <div className="muted" style={{ padding: 16 }}>Chưa có nút nào — bấm Thêm.</div>
        : <div className="cc-chart-in">{roots.map((r) => <div key={r.key} className="cc-chart-root">{draw(r, 0)}</div>)}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ một hộp thoại cho mọi loại */

interface F {
  loai: Exclude<Loai, 'none'>; parentKey: string | null; code: string; name: string; note: string; isActive: boolean;
  taxId: string; validFrom: string;
  /** cửa hàng */ address: string; phone: string; companyName: string; departmentCode: string;
  /** kho */ typeCode: string; isDefault: boolean;
}
function formOf(n: CNode | null, parentKey: string | null, cc: CC): F {
  const base: F = { loai: 'unit', parentKey, code: '', name: '', note: '', isActive: true, taxId: '', validFrom: homNay(), address: '', phone: '', companyName: '', departmentCode: '', typeCode: 'KHH', isDefault: false };
  if (!n) {
    const p = parentKey ? cc.byKey.get(parentKey) : null;
    return { ...base, loai: !p ? 'company' : p.loai === 'branch' ? 'warehouse' : 'unit' };
  }
  const f: F = { ...base, loai: n.loai as F['loai'], parentKey: n.parentKey === NONE_KEY ? null : n.parentKey, code: n.code, name: n.name, isActive: n.isActive };
  if (n.org) return { ...f, note: n.org.note, taxId: n.org.taxId ?? '' };
  if (n.branch) return { ...f, isActive: n.branch.isActive, note: n.branch.note, taxId: n.branch.taxCode, address: n.branch.address ?? '', phone: n.branch.phone, companyName: n.branch.companyName, departmentCode: n.branch.departmentCode ?? '' };
  if (n.warehouse) return { ...f, note: n.warehouse.note, address: n.warehouse.address, typeCode: n.warehouse.typeCode || 'KHH', isDefault: n.warehouse.isDefault };
  if (n.dept) return { ...f, note: n.dept.note };
  return f;
}

function NutForm({ cc, nodeKey, parentKey, canWrite, onClose, onSaved }: { cc: CC; nodeKey: string | null; parentKey: string | null; canWrite: boolean; onClose: () => void; onSaved: (key: string) => void }) {
  const qc = useQueryClient();
  const node = nodeKey ? cc.byKey.get(nodeKey) ?? null : null;
  const isNew = !node;
  const start = useMemo(() => formOf(node, parentKey, cc), [nodeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [f, setF] = useState<F>(start);
  useEffect(() => setF(start), [start]);
  const set = (p: Partial<F>) => setF((x) => ({ ...x, ...p }));
  const viewAgain = useViewAgain();
  const needParent = f.loai === 'warehouse';
  const types = (useWarehouseTypes().data?.types ?? []).filter((t) => t.isActive || t.code === f.typeCode);
  const parents = useMemo(() => cc.nodes.filter((n) => CHA[f.loai].includes(n.loai) && n.key !== nodeKey && !(nodeKey && cc.pathOf(n).some((x) => x.key === nodeKey)))
    .map((n) => ({ code: n.code, name: `${n.name}${n.loai === 'unit' ? ` (cơ cấu cấp ${n.depth})` : n.loai === 'company' ? ' (công ty)' : ''}` })), [cc, f.loai, nodeKey]);
  const keyOf = (code: string) => (code ? `${needParent ? 'b' : 'o'}:${code}` : null);
  const parent = f.parentKey ? cc.byKey.get(f.parentKey) : null;
  const parentOk = !f.parentKey || CHA[f.loai].includes(parent?.loai ?? 'none');
  const changedPlace = !isNew && (f.parentKey !== start.parentKey || ((f.loai === 'company' || f.loai === 'unit') && f.taxId !== start.taxId));
  const taxBad = f.taxId !== '' && !MST_OK.test(f.taxId) && f.loai !== 'branch';
  const orgOf = (k: string | null) => (k ? cc.byKey.get(k)?.org?.code ?? null : null);

  const save = useMutation({
    mutationFn: async (): Promise<string> => {
      const code = f.code.trim(), name = f.name.trim();
      const vf = changedPlace ? f.validFrom || null : null;
      if (f.loai === 'company' || f.loai === 'unit') {
        const body = { kind: f.loai, name, note: f.note, taxId: f.taxId.trim(), validFrom: vf };
        if (isNew) await api.post('/api/v1/org-units', { ...body, code, parentCode: orgOf(f.parentKey) });
        else await api.patch(`/api/v1/org-units/${encodeURIComponent(node!.code)}`, { ...body, isActive: f.isActive, ...(f.parentKey !== start.parentKey ? { parentCode: orgOf(f.parentKey) } : {}) });
        return `o:${isNew ? code : node!.code}`;
      }
      if (f.loai === 'branch') {
        const body = { name, note: f.note, taxCode: f.taxId.trim(), address: f.address, phone: f.phone, companyName: f.companyName };
        if (isNew) {
          await api.post('/api/v1/branches', { ...body, code });
          if (f.parentKey) await api.patch(`/api/v1/branches/${encodeURIComponent(code)}`, { orgUnitCode: orgOf(f.parentKey) });
          return `b:${code}`;
        }
        await api.patch(`/api/v1/branches/${encodeURIComponent(node!.code)}`, {
          ...body, isActive: f.isActive, departmentCode: f.departmentCode || null,
          ...(code && code !== node!.code ? { newCode: code } : {}),
          ...(f.parentKey !== start.parentKey ? { orgUnitCode: orgOf(f.parentKey), validFrom: vf } : {}),
        });
        return `b:${code || node!.code}`;
      }
      if (f.loai === 'warehouse') {
        const branchCode = parent?.branch?.code ?? '';
        const body = { branchCode, name, note: f.note, address: f.address, isActive: f.isActive, isDefault: f.isDefault, typeCode: f.typeCode || 'KHH' };
        if (isNew) await api.post('/api/v1/warehouses', { ...body, code });
        else await api.patch(`/api/v1/warehouses/${encodeURIComponent(node!.code)}`, body);
        return `w:${isNew ? code : node!.code}`;
      }
      const extra = { ...(node?.dept?.extra ?? {}), orgUnitCode: orgOf(f.parentKey) ?? '' };
      await api.put(`/api/v1/dimensions/department/${encodeURIComponent(isNew ? code : node!.code)}`, { name, parentCode: node?.dept?.parentCode || undefined, note: f.note, isActive: f.isActive, extra });
      return `d:${isNew ? code : node!.code}`;
    },
    onSuccess: (key) => {
      invalidateOrg(qc);
      for (const k of [['warehouses'], ['dimensions', 'department'], ['co-cau-history']]) void qc.invalidateQueries({ queryKey: k });
      if (isNew) onSaved(key); else viewAgain[1]();
    },
  });

  const txt = (k: keyof F, label: string, opts: { full?: boolean; mono?: boolean; tip?: string; ph?: string } = {}) => (
    <Field label={label} full={opts.full} tip={opts.tip}><input className={`input${opts.mono ? ' mono' : ''}`} value={String(f[k] ?? '')} placeholder={opts.ph} onChange={(e) => set({ [k]: e.target.value } as Partial<F>)} /></Field>
  );
  const inside = node ? cc.under(node.key).filter((x) => !off(x)) : [];
  const insideText = (['unit', 'company', 'branch', 'warehouse', 'department'] as Loai[]).map((l) => [l, inside.filter((x) => x.loai === l).length] as const).filter(([, c]) => c).map(([l, c]) => `${c} ${LOAI_TEN[l].toLowerCase()}`).join(' · ');
  const title = `${isNew ? 'Thêm' : ''} ${isNew ? LOAI_TEN[f.loai].toLowerCase() : LOAI_TEN[f.loai]}${node ? ` ${node.code}` : ''}`.trim();
  const ok = f.name.trim() && f.code.trim() && parentOk && !taxBad && (!needParent || parent?.branch);
  return (
    <Modal wide viewAgain={viewAgain} viewFirst={!isNew} title={title.charAt(0).toUpperCase() + title.slice(1)} onClose={onClose} helpKey="so-do-to-chuc"
      footer={<>{canWrite && <button className="btn btn-primary" disabled={!ok || save.isPending} onClick={() => save.mutate()}>Ghi</button>}<button className="btn" onClick={onClose}>Thoát</button></>}>
      <Field label="Loại (*)" full tip="Công ty: đơn vị pháp lý có MST. Cơ cấu: cấp quản lý (miền, chi nhánh, tỉnh…). Cửa hàng: điểm bán / chi nhánh hạch toán. Kho: thuộc một cửa hàng. Phòng ban: phòng ban chung">
        <div className="cc-loai-pick">
          {(['company', 'unit', 'branch', 'warehouse', 'department'] as const).map((l) => (
            <label key={l} className={`cc-loai-opt${f.loai === l ? ' on' : ''}${!isNew && f.loai !== l && !((l === 'company' || l === 'unit') && (f.loai === 'company' || f.loai === 'unit')) ? ' dis' : ''}`}>
              <input type="radio" checked={f.loai === l} disabled={!isNew && !((l === 'company' || l === 'unit') && (f.loai === 'company' || f.loai === 'unit'))} onChange={() => set({ loai: l })} /> {LOAI_ICON[l]} {LOAI_TEN[l]}
            </label>
          ))}
        </div>
      </Field>
      <Field label={needParent ? 'Thuộc cửa hàng (*)' : 'Thuộc'} full tip={needParent ? 'Kho nằm trong cửa hàng nào' : 'Nút cha trên cây. Trống = gốc riêng (công ty cha độc lập)'}>
        <ListPicker items={parents} value={parent?.code ?? ''} onChange={(c) => set({ parentKey: keyOf(c) })} placeholder={needParent ? 'Chọn cửa hàng' : 'Không (gốc riêng)'} />
        {!parentOk && <div className="neg" style={{ fontSize: 12.5, marginTop: 3, fontWeight: 600 }}>{LOAI_TEN[f.loai]} không đặt dưới {parent ? LOAI_TEN[parent.loai].toLowerCase() : 'nút này'} — chọn lại Thuộc</div>}
      </Field>
      <Field label={f.loai === 'warehouse' ? 'Mã kho (*)' : 'Mã (*)'} tip={f.loai === 'branch' ? 'Khớp mã cửa hàng của hệ thống bán hàng. Đổi mã (lên Plus / Premium, đóng _OFF): chứng từ, sổ sách, kho giữ nguyên' : undefined}>
        <input className="input mono" value={f.code} disabled={!isNew && f.loai !== 'branch'} maxLength={f.loai === 'warehouse' ? 12 : 32} onChange={(e) => set({ code: e.target.value })} autoFocus={isNew} />
      </Field>
      {txt('name', 'Tên (*)')}

      {(f.loai === 'company' || f.loai === 'unit' || f.loai === 'branch') && (
        <Field label="MST" tip={f.loai === 'branch' ? 'Số ĐKKD / MST in trên chứng từ của cửa hàng' : 'Cửa hàng, kho bên dưới không đặt MST riêng thì dùng MST này. Trống = theo nút trên'}>
          <input className="input mono" value={f.taxId} placeholder="10 số hoặc 10 số-3 số" onChange={(e) => set({ taxId: e.target.value.replace(/[^0-9-]/g, '') })} />
          {taxBad && <div className="neg" style={{ fontSize: 12.5, marginTop: 3, fontWeight: 600 }}>MST gồm 10 số hoặc 10 số-3 số</div>}
        </Field>
      )}
      {changedPlace && (
        <Field label="Áp dụng từ ngày" tip="Chứng từ từ ngày này theo nơi thuộc / MST mới; chứng từ trước ngày này giữ như cũ">
          <input className="input" type="date" value={f.validFrom} onChange={(e) => set({ validFrom: e.target.value })} />
        </Field>
      )}
      {f.loai === 'branch' && (
        <>
          {!isNew && (
            <Field label="Phòng ban" tip="Chứng từ của cửa hàng tự mang phòng ban này. Cửa hàng mới tự có phòng ban riêng (BH + số mã)">
              <ListPicker value={f.departmentCode} onChange={(c) => set({ departmentCode: c })} items={cc.departments.filter((d) => d.isActive || d.code === f.departmentCode).map((d) => ({ code: d.code, name: d.name }))} />
            </Field>
          )}
          {txt('companyName', 'Tên công ty in chứng từ', { full: true })}
          {txt('address', 'Địa chỉ', { full: true })}
          {txt('phone', 'Điện thoại')}
        </>
      )}
      {f.loai === 'warehouse' && (
        <>
          <Field label="Loại kho (*)" tip="Loại quyết định kho dùng cho nghiệp vụ nào (nhập mua, bán, trả lại…). Khai loại ở Danh mục → Loại kho">
            <select className="select input" value={f.typeCode} onChange={(e) => set({ typeCode: e.target.value })}>
              {types.map((t) => <option key={t.code} value={t.code} title={t.purpose}>{t.code} · {t.name}</option>)}
            </select>
          </Field>
          <Field label=" "><label className="checkbox"><input type="checkbox" checked={f.isDefault} onChange={(e) => set({ isDefault: e.target.checked })} /> Kho mặc định<Hoi text="Nhận các dòng nhập xuất không ghi mã kho" /></label></Field>
          {txt('address', 'Địa chỉ', { full: true })}
        </>
      )}
      {txt('note', f.loai === 'company' || f.loai === 'unit' ? 'Mô tả' : 'Ghi chú', { full: true })}
      {!isNew && <Field label=" "><label className="checkbox"><input type="checkbox" checked={f.isActive} onChange={(e) => set({ isActive: e.target.checked })} /> Theo dõi</label></Field>}
      {!isNew && insideText && <div className="full muted" style={{ fontSize: 13 }}>Bên trong: {insideText}</div>}
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
      {node && <div className="full"><div className="field-title">Lịch sử thay đổi</div><LichSuNut node={node} /></div>}
    </Modal>
  );
}

/* ------------------------------------------------------------------ lịch sử */

// [2026-11-13 Nguyễn Văn Thủy] lịch sử thay đổi của nút: ai, lúc nào, đổi ô nào từ gì sang gì (nhật ký bằng chứng) (đóng góp)
interface HistoryLine { at: string; by: string; action: string; changes: string[] }
const HIST_TYPE: Partial<Record<Loai, string>> = { company: 'org', unit: 'org', branch: 'branch', warehouse: 'warehouse', department: 'department' };
function LichSuNut({ node }: { node: CNode }) {
  const type = HIST_TYPE[node.loai];
  const q = useQuery({ queryKey: ['co-cau-history', type, node.code], queryFn: () => api.get<HistoryLine[]>('/api/v1/co-cau/history', { type: type!, code: node.code }), enabled: Boolean(type) });
  const box = useRef<HTMLDivElement>(null);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={errorText(q.error)} />;
  const rows = q.data ?? [];
  if (!rows.length) return <div className="muted" style={{ fontSize: 13 }}>Chưa có thay đổi nào được ghi nhận.</div>;
  const t = (iso: string) => new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
  return (
    <div ref={box} className="table-wrap" style={{ maxHeight: 220 }}>
      <table className="grid cc-log">
        <thead><tr><th title="Thời điểm ghi">Thời gian</th><th title="Người thực hiện">Người làm</th><th title="Việc đã làm">Việc</th><th title="Ô đã đổi: giá trị cũ → giá trị mới">Thay đổi</th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}><td className="mono" style={{ whiteSpace: 'nowrap' }}>{t(r.at)}</td><td>{r.by}</td><td>{r.action}</td>
            <td>{r.changes.length ? r.changes.map((c, j) => <div key={j}>{c}</div>) : <span className="muted">—</span>}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}
