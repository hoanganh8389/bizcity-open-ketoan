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
import { ArrowLeft, Building2, Copy, ChevronDown, ChevronRight, FileDown, FileUp, Filter, FolderOpen, Network, Plus, Printer, RefreshCw, RotateCcw, Store, Users, Warehouse as WarehouseIcon } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Hoi, Loading, Modal, useViewAgain } from '@/components/ui';
import { ListPicker, plain } from '@/components/pickers';
import { ValuePicker } from '@/components/DataGrid';
import { TaxCodeField } from '@/components/TaxCodeField';
import { invalidateOrg, useOrgTree, type OrgNode } from '@/lib/orgUnits';
import type { Branch } from './BranchesPage';
import { useWarehouses, type Warehouse } from './WarehousesPage';
import { LoaiKhoForm, useWarehouseTypes } from './WarehouseTypesPage';
import type { DimRow } from './DimensionsPage';
import { DanhSachLoai, xuatCoCau, type KieuDs } from './CoCauExcel';
import { NutNhapExcel } from '@/components/NhapExcelWizard';
import { nhapLoai } from '@/lib/nhapExcel';
import './co-cau.css';

export type Loai = 'company' | 'unit' | 'branch' | 'warehouse' | 'department' | 'none';
// [2026-11-20 Nguyễn Văn Thủy] cơ cấu linh hoạt: Công ty (cấp 0) → Chi nhánh cấp N → Cửa hàng; bộ phận thay phòng ban (0171) (đóng góp)
export const LOAI_TEN: Record<Loai, string> = { company: 'Công ty', unit: 'Chi nhánh', branch: 'Cửa hàng', warehouse: 'Kho', department: 'Bộ phận', none: '' };
export const LOAI_ICON: Record<Loai, ReactNode> = {
  company: <Building2 size={14} />, unit: <Network size={14} />, branch: <Store size={14} />, warehouse: <WarehouseIcon size={14} />, department: <Users size={14} />, none: <FolderOpen size={14} />,
};
/** Loại cha hợp lệ của từng loại. */
const CHA: Record<Exclude<Loai, 'none'>, Loai[]> = { company: ['company', 'unit'], unit: ['company', 'unit'], branch: ['company', 'unit'], warehouse: ['branch', 'company', 'unit'], department: ['company', 'unit', 'branch'] };
/** Nút đặt được kho / ghi chứng từ: cửa hàng, hoặc công ty / chi nhánh có điểm hoạt động. */
export const coHoatDong = (n: CNode) => n.loai === 'branch' || Boolean(n.ownBranch);

export interface CNode {
  key: string; loai: Loai; code: string; name: string; parentKey: string | null; isActive: boolean;
  /** Cấp trên cây (gốc = 0). */
  depth: number;
  org?: OrgNode; branch?: Branch; warehouse?: Warehouse; dept?: DimRow;
  /** Điểm hoạt động của công ty / chi nhánh (có kho, ghi chứng từ) — 0171. */
  ownBranch?: Branch;
  /** MST hiệu lực: của nút, trống thì theo nút trên; from = nút đặt MST. */
  mst?: { value: string; from: string | null };
}

export const NONE_KEY = 'x:none';
export const homNay = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
export const loaiNhan = (n: CNode) => (n.loai === 'unit' ? `Chi nhánh cấp ${n.depth}` : n.loai === 'company' ? 'Công ty (cấp 0)' : LOAI_TEN[n.loai]);
const thongKe = (n: CNode) => Boolean(n.org?.statsOnly ?? n.branch?.statsOnly);
export const off = (n: { code: string; isActive: boolean }) => !n.isActive || /_OFF$/i.test(n.code);
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
    const branchByCode = new Map((branches.data ?? []).map((b) => [b.code, b]));
    /** mã chi nhánh là điểm hoạt động → khoá nút công ty / chi nhánh */
    const ownOf = new Map<string, string>();
    for (const n of org.data?.nodes ?? []) {
      const own = n.branchCode ? branchByCode.get(n.branchCode) : undefined;
      if (own) ownOf.set(own.code, `o:${n.code}`);
      nodes.push({ key: `o:${n.code}`, loai: n.kind === 'company' || (!n.kind && !n.parentCode) ? 'company' : 'unit', code: n.code, name: n.name, parentKey: n.parentCode ? `o:${n.parentCode}` : null, isActive: n.isActive, depth: 0, org: n, ownBranch: own });
    }
    const pointKey = (branchCode: string) => ownOf.get(branchCode) ?? `b:${branchCode}`;
    const shopDept = new Set<string>();
    for (const b of branches.data ?? []) {
      if (b.departmentCode) shopDept.add(b.departmentCode);
      if (ownOf.has(b.code)) continue; // điểm hoạt động hiện chung dòng với nút của nó
      nodes.push({ key: `b:${b.code}`, loai: 'branch', code: b.code, name: b.name, parentKey: b.orgUnitCode && orgCodes.has(b.orgUnitCode) ? `o:${b.orgUnitCode}` : NONE_KEY, isActive: b.isActive, depth: 0, branch: b });
    }
    for (const w of whs.data ?? []) nodes.push({ key: `w:${w.code}`, loai: 'warehouse', code: w.code, name: w.name, parentKey: pointKey(w.branchCode), isActive: w.isActive, depth: 0, warehouse: w });
    // Phòng ban riêng của cửa hàng không thành dòng (là ô "Phòng ban" của cửa hàng); chỉ phòng ban chung lên cây.
    for (const d of deps.data ?? []) {
      if (shopDept.has(d.code) || (d.parentCode && shopDept.has(d.parentCode))) continue;
      const o = d.extra?.orgUnitCode;
      const bc = typeof d.extra?.branchCode === 'string' ? d.extra.branchCode : '';
      const pk = bc && branchByCode.has(bc) ? pointKey(bc) : o && orgCodes.has(o) ? `o:${o}` : NONE_KEY;
      nodes.push({ key: `d:${d.code}`, loai: 'department', code: d.code, name: d.name, parentKey: pk, isActive: d.isActive, depth: 0, dept: d });
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
    // MST hiệu lực: của nút, trống thì lấy theo nút trên (cấp cha tự áp xuống cấp con).
    const setMst = (list: CNode[], up: { value: string; from: string | null }) => {
      for (const n of list) {
        const own = mstOf(n);
        n.mst = own ? { value: own, from: null } : up;
        setMst(kids.get(n.key) ?? [], own ? { value: own, from: n.name } : up);
      }
    };
    setMst(roots, { value: '', from: null });
    const pathOf = (n: CNode): CNode[] => { const out: CNode[] = []; const seen = new Set<string>(); for (let x: CNode | undefined = n; x && !seen.has(x.key); x = x.parentKey ? byKey.get(x.parentKey) : undefined) { seen.add(x.key); out.unshift(x); } return out; };
    const under = (key: string): CNode[] => { const out: CNode[] = []; const stack = [...(kids.get(key) ?? [])]; while (stack.length) { const x = stack.pop()!; out.push(x); stack.push(...(kids.get(x.key) ?? [])); } return out; };
    return { nodes, byKey, kids, roots, pathOf, under, pointKey, allBranches: branches.data ?? [] };
  }, [org.data, branches.data, whs.data, deps.data]);
  return {
    ...data, orgTree: org.data, departments: deps.data ?? [],
    loading: org.isLoading || branches.isLoading || whs.isLoading || deps.isLoading,
    error: org.error ?? branches.error ?? whs.error ?? deps.error,
    refetch: () => { void org.refetch(); void branches.refetch(); void whs.refetch(); void deps.refetch(); },
  };
}
export type CC = ReturnType<typeof useCoCau>;

export function CoCauToChucPage() {
  const { can } = useAuth();
  const canWrite = can('catalog:write');
  const qc = useQueryClient();
  const cc = useCoCau();
  const [sel, setSel] = useState<string | null>(null);
  // [2026-11-13 Nguyễn Văn Thủy] kiểu xem: cây, sơ đồ, hoặc danh sách kiểu Excel theo loại (đóng góp)
  const [view, setView] = useState<'buoc' | 'table' | 'chart' | KieuDs>('buoc');
  const [showOff, setShowOff] = useState(false);
  const listExport = useRef<(() => void) | null>(null);
  /** back: các nút đã đi qua (bấm đúp dòng bên trong) để Quay lại. */
  const [form, setForm] = useState<{ key: string | null; parentKey: string | null; back?: string[]; copy?: string; loai?: F['loai'] } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // [2026-11-20 Nguyễn Văn Thủy] Quay về dữ liệu gốc = xoá trắng cơ cấu để khai lại từ bước 1 (0171) (đóng góp)
  const restore = useMutation({
    mutationFn: async () => {
      if (!window.confirm('Quay về dữ liệu gốc: XOÁ TRẮNG cơ cấu tổ chức?\n\n- Xoá mọi công ty, chi nhánh các cấp, bộ phận chưa dùng.\n- Xoá cửa hàng, kho chưa có chứng từ.\n- Cửa hàng, kho đã có chứng từ giữ lại, chuyển về "Chưa xếp vào cơ cấu" để xếp lại.\n- Gán vai trò theo chi nhánh / vùng bị thu hồi.\n\nKhông hoàn tác được.')) return null;
      const password = window.prompt('Nhập mật khẩu để xoá trắng cơ cấu tổ chức:'); // [2026-11-17 Nguyễn Văn Thủy] đỡ bấm nhầm (đóng góp)
      if (!password) return null;
      return api.post<{ orgUnits: number; branchesDeleted: number; branchesKept: number; warehousesDeleted: number; departmentsDeleted: number; assignmentsRevoked: number }>('/api/v1/org-units/wipe', { confirm: true, password });
    },
    onSuccess: (r) => {
      if (!r) return;
      invalidateOrg(qc);
      for (const k of [['branches'], ['warehouses'], ['dimensions', 'department']]) void qc.invalidateQueries({ queryKey: k });
      setView('buoc');
      setMsg({ ok: true, text: `Đã xoá trắng: ${r.orgUnits} nút, ${r.branchesDeleted} cửa hàng, ${r.warehousesDeleted} kho, ${r.departmentsDeleted} bộ phận${r.assignmentsRevoked ? `, thu hồi ${r.assignmentsRevoked} lần gán vai trò` : ''}. Giữ ${r.branchesKept} cửa hàng đã có chứng từ (ở "Chưa xếp vào cơ cấu"). Bắt đầu lại từ Bước 1.` });
    },
    onError: (e) => setMsg({ ok: false, text: errorText(e) }),
  });

  const selNode = sel ? cc.byKey.get(sel) : null;
  const addParent = selNode && selNode.loai !== 'none' && selNode.loai !== 'department' ? (selNode.loai === 'warehouse' ? selNode.parentKey : selNode.key) : null;
  return (
    <>
      {/* [2026-11-17 kiennt] như các màn danh mục: Quay về dữ liệu gốc ở tiêu đề; thanh nút — kiểu xem bên trái, nút chức năng lề phải (đóng góp) */}
      <PageHeader title="Cơ cấu tổ chức" code="DM16" helpKey="so-do-to-chuc"
        actions={can('settings:write') && <button className="btn" disabled={restore.isPending} title="Xoá trắng cơ cấu để khai lại từ đầu (cửa hàng, kho đã có chứng từ được giữ lại)" onClick={() => restore.mutate()}><RotateCcw size={16} /> Quay về dữ liệu gốc</button>} />
      <div className="card">
        {/* [2026-11-18 01:40 PM kiennt] NT-DM-006 — nút chức năng bên trái, chọn kiểu xem sang phải; nút Nhân bản (đóng góp) */}
        <div className="catalog-toolbar canh-phai">
          {canWrite && <button className="btn btn-sm btn-primary" title="Thêm vào dưới dòng đang chọn (chưa chọn: thêm công ty mới)" onClick={() => { setMsg(null); setForm({ key: null, parentKey: addParent }); }}><Plus size={14} /> Thêm</button>}
          {canWrite && <button className="btn btn-sm" disabled={!sel || !cc.byKey.get(sel) || cc.byKey.get(sel)!.loai === 'none'} title={sel ? 'Nhân bản: thêm nút mới cùng cha, chép thông tin nút đang chọn (mã để trống)' : 'Chọn một dòng để nhân bản'} onClick={() => { const n = sel ? cc.byKey.get(sel) : null; if (n) { setMsg(null); setForm({ key: null, parentKey: n.parentKey === NONE_KEY ? null : n.parentKey, copy: n.key }); } }}><Copy size={14} /> Nhân bản</button>}
          <button className="btn btn-sm" onClick={cc.refetch}><RefreshCw size={14} /> Nạp</button>
          <button className="btn btn-sm" title="Tệp 4 sheet Cơ cấu / Cửa hàng / Kho / Phòng ban — sửa rồi Nhập Excel lại được" onClick={() => void xuatCoCau(cc)}><FileDown size={14} /> Xuất</button>
          <button className="btn btn-sm" onClick={() => window.print()} title="In màn hình đang xem"><Printer size={14} /> In</button>
          {/* [2026-11-18 02:00 PM kiennt] NT-DM-007 — Nhập Excel ▾: 4 loại qua trình nhập chung, theo thứ tự Cơ cấu → Phòng ban → Cửa hàng → Kho (đóng góp) */}
          {canWrite && <NhapCoCauMenu />}
          <span className="spacer" />
          <span className="cc-xem">
            {([['buoc', 'Từng bước'], ['table', 'Cây'], ['chart', 'Sơ đồ'], ['org', 'Cơ cấu'], ['branch', 'Cửa hàng'], ['warehouse', 'Kho'], ['department', 'Bộ phận'], ['all', 'Tất cả']] as const).map(([k, t]) => (
              <button key={k} className={`btn btn-sm${view === k ? ' btn-primary' : ''}`} title={k === 'buoc' ? 'Khai báo lần lượt: công ty → chi nhánh các cấp → cửa hàng → kho, bộ phận' : k === 'table' || k === 'chart' ? undefined : `Danh sách ${t.toLowerCase()} dạng bảng: lọc từng cột, sắp xếp, xuất Excel`} onClick={() => setView(k)}>{t}</button>
            ))}
          </span>
        </div>
        {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'}`} style={{ margin: '0 12px 8px' }}>{msg.text}</div>}
        <ErrorBox error={cc.error ? errorText(cc.error) : null} />
        <div style={{ padding: '0 12px 12px' }}>
          {cc.loading ? <Loading /> : view === 'buoc'
            ? <TungBuoc cc={cc} canWrite={canWrite} onOpen={(n) => { setSel(n.key); setForm({ key: n.key, parentKey: n.parentKey }); }} onAdd={(loai, parentKey) => { setMsg(null); setForm({ key: null, parentKey, loai }); }} onChart={() => setView('chart')} />
            : view === 'table'
            ? <BangCoCau cc={cc} selected={sel} onSelect={setSel} onOpen={(n) => n.loai !== 'none' && setForm({ key: n.key, parentKey: n.parentKey })} showOff={showOff} setShowOff={setShowOff} />
            : view === 'chart' ? <SoDoCoCau cc={cc} selected={sel} onOpen={(n) => { setSel(n.key); setForm({ key: n.key, parentKey: n.parentKey }); }} />
            : (
              <>
                <div className="cc-filter">
                  <label className="checkbox"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Hiện đã ngừng</label>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => listExport.current?.()}><FileDown size={13} /> Xuất danh sách này</button>
                  <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>Gõ vào hàng lọc dưới tiêu đề để lọc từng cột · bấm đúp một dòng để xem / sửa</span>
                </div>
                <DanhSachLoai cc={cc} kieu={view} showOff={showOff} exportRef={listExport} onOpen={(n) => { setSel(n.key); setForm({ key: n.key, parentKey: n.parentKey }); }} />
              </>
            )}
        </div>
      </div>
      {form && <NutForm key={form.key ?? `new:${form.parentKey}:${form.copy ?? ''}:${form.loai ?? ''}`} cc={cc} nodeKey={form.key} parentKey={form.parentKey} copyKey={form.copy} loai={form.loai} canWrite={canWrite} onClose={() => setForm(null)} onSaved={(key) => { setSel(key); setForm({ key, parentKey: null }); }}
        onGo={(key) => { setSel(key); setForm((x) => ({ key, parentKey: null, back: [...(x?.back ?? []), ...(x?.key ? [x.key] : [])] })); }}
        onBack={form.back?.length ? () => { const back = [...form.back!]; const key = back.pop()!; setSel(key); setForm({ key, parentKey: null, back }); } : undefined}
        onAdd={(parentKey) => setForm((x) => ({ key: null, parentKey, back: [...(x?.back ?? []), ...(x?.key ? [x.key] : [])] }))} />}
    </>
  );
}

export const mstOf = (n: CNode) => n.org?.taxId || n.ownBranch?.taxCode || n.branch?.taxCode || (n.warehouse ? n.warehouse.taxId ?? '' : '');
export function ghiChu(n: CNode, cc: CC): string {
  if (n.org) return [n.ownBranch ? `Có hoạt động (điểm ${n.ownBranch.code})` : '', n.org.statsOnly ? 'Chỉ để thống kê' : '', n.org.note].filter(Boolean).join(' · ');
  if (n.branch?.statsOnly) return ['Chỉ để thống kê', n.branch.departmentCode ? `Bộ phận ${n.branch.departmentCode}` : ''].filter(Boolean).join(' · ');
  if (n.branch) return n.branch.departmentCode ? `Bộ phận ${n.branch.departmentCode}` : '';
  if (n.warehouse) { const t = n.warehouse.typeName || n.warehouse.typeCode; return [t, n.warehouse.isDefault ? 'kho mặc định' : ''].filter(Boolean).join(' · '); }
  if (n.dept) return n.dept.note;
  void cc;
  return '';
}

/* ------------------------------------------------------------------ bảng cây */

function BangCoCau({ cc, selected, onSelect, onOpen, showOff, setShowOff }: { cc: CC; selected: string | null; onSelect: (key: string) => void; onOpen: (n: CNode) => void; showOff: boolean; setShowOff: (v: boolean) => void }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(cc.nodes.filter((n) => n.org && n.depth < 1).map((n) => n.key)));
  // [2026-11-17 kiennt] hàng lọc dưới tiêu đề như các bảng khác: mỗi cột một ô; dòng khớp mọi ô thì hiện kèm các nút cha (đóng góp)
  const [loc, setLoc] = useState<Record<string, string>>({});
  // Phễu ở tiêu đề cột: tích chọn giá trị (như các bảng khác).
  const [picks, setPicks] = useState<Record<string, Set<string>>>({});
  const [picker, setPicker] = useState<{ key: string; x: number; y: number } | null>(null);
  const [show, setShow] = useState({ warehouse: true });
  const visible = (n: CNode) => (n.loai !== 'warehouse' || show.warehouse) && (showOff || !off(n));
  const COT: [string, (n: CNode) => string][] = [
    ['code', (n) => n.code], ['name', (n) => n.name], ['loai', (n) => loaiNhan(n)], ['mst', (n) => n.mst?.value ?? mstOf(n)], ['note', (n) => ghiChu(n, cc)],
    ['active', (n) => (n.loai === 'none' ? '' : off(n) ? 'Ngừng' : 'Đang dùng')],
  ];
  const hit = useMemo(() => {
    const dk = COT.map(([k, f]) => [plain(loc[k] ?? '').split(/\s+/).filter(Boolean), f] as const).filter(([w]) => w.length);
    const pk = COT.filter(([k]) => picks[k]);
    if (!dk.length && !pk.length) return null;
    const keep = new Set<string>();
    for (const n of cc.nodes) {
      if (!visible(n)) continue;
      if (!dk.every(([w, f]) => { const v = plain(f(n)); return w.every((x) => v.includes(x)); })) continue;
      if (!pk.every(([k, f]) => picks[k]!.has(f(n)))) continue;
      for (const x of cc.pathOf(n)) keep.add(x.key);
    }
    return keep;
  }, [loc, picks, cc, show, showOff]); // eslint-disable-line react-hooks/exhaustive-deps
  // Giá trị của cột (kèm số dòng) cho hộp phễu — trên các dòng đang hiện được (theo Hiện kho / Hiện đã ngừng).
  const giaTri = (k: string): [string, number][] => {
    const f = COT.find(([x]) => x === k)![1];
    const m = new Map<string, number>();
    for (const n of cc.nodes) if (visible(n)) { const v = f(n); m.set(v, (m.get(v) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'vi'));
  };
  const pheu = (k: string) => (
    <button type="button" className={`dgrid-funnel ${picks[k] ? 'on' : ''}`} title="Lọc nhanh theo giá trị"
      onClick={(e) => { e.stopPropagation(); const b = (e.currentTarget as HTMLElement).getBoundingClientRect(); setPicker(picker?.key === k ? null : { key: k, x: Math.min(b.left, window.innerWidth - 300), y: b.bottom + 4 }); }}>
      <Filter size={11} />
    </button>
  );
  const toggle = (k: string) => setOpen((o) => { const s = new Set(o); if (s.has(k)) s.delete(k); else s.add(k); return s; });
  const out: ReactNode[] = [];
  const walk = (list: CNode[]) => {
    for (const n of list) {
      if (!visible(n) || (hit && !hit.has(n.key))) continue;
      const kids = (cc.kids.get(n.key) ?? []).filter(visible);
      const o = hit ? true : open.has(n.key);
      out.push(
        <tr key={n.key} className={`cc-tr cc-${n.loai}${selected === n.key ? ' on' : ''}${off(n) ? ' muted' : ''}`} onClick={() => { onSelect(n.key); if (kids.length && !hit) toggle(n.key); }} onDoubleClick={() => onOpen(n)} title="Bấm: mở / đóng nhánh · bấm đúp: xem / sửa">
          <td>
            <div className="cc-cell" style={{ paddingLeft: n.depth * 18 }}>
              <button type="button" className="cc-tog" disabled={!kids.length} onClick={(e) => { e.stopPropagation(); toggle(n.key); }}>{kids.length ? (o ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : null}</button>
              <span className="cc-ic">{LOAI_ICON[n.loai]}</span>
              <span className="mono">{n.code}</span>
            </div>
          </td>
          <td className="cc-name">{n.name}{kids.length > 0 && !o && <span className="cc-count" title="Số dòng bên trong">{kids.length}</span>}</td>
          <td>{loaiNhan(n)}</td>
          <td className="mono">{n.mst?.from ? <span className="muted" title={`Theo ${n.mst.from} (cấp trên)`}>{n.mst.value}</span> : n.mst?.value ?? mstOf(n)}</td>
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
        <label className="checkbox"><input type="checkbox" checked={show.warehouse} onChange={(e) => setShow((s) => ({ ...s, warehouse: e.target.checked }))} /> Hiện kho</label>
        <label className="checkbox"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Hiện đã ngừng</label>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(new Set(cc.nodes.filter((n) => n.org).map((n) => n.key)))}>Mở hết các cấp</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(new Set())}>Thu gọn</button>
        {hit && <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setLoc({}); setPicks({}); }}>Bỏ lọc</button>}
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>Bấm một dòng: mở / đóng nhánh · bấm đúp: xem / sửa</span>
      </div>
      <div className="table-wrap cc-table">
        <table className="grid">
          <thead><tr>
            <th style={{ width: 300 }} title="Mã của nút">Mã{pheu('code')}</th><th title="Tên">Tên{pheu('name')}</th><th style={{ width: 130 }} title="Công ty (cấp 0), chi nhánh (cấp tính theo cây), cửa hàng, kho, bộ phận">Loại{pheu('loai')}</th>
            <th style={{ width: 140 }} title="Mã số thuế: chữ đậm = đặt ở nút; chữ mờ = lấy theo cấp trên">MST{pheu('mst')}</th><th style={{ width: 220 }} title="Có hoạt động, chỉ để thống kê, mô tả; cửa hàng: bộ phận; kho: loại kho">Ghi chú{pheu('note')}</th><th style={{ width: 90 }} title="Đang dùng">Theo dõi{pheu('active')}</th>
          </tr>
          <tr className="dgrid-filter">
            {COT.map(([k]) => <th key={k}><input size={1} value={loc[k] ?? ''} onChange={(e) => setLoc((x) => ({ ...x, [k]: e.target.value }))} placeholder="🔍" /></th>)}
          </tr></thead>
          <tbody>{out}{hit && !hit.size && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 16 }}>Không có dòng nào khớp ô lọc</td></tr>}</tbody>
        </table>
        {picker && <ValuePicker x={picker.x} y={picker.y} values={giaTri(picker.key)} selected={picks[picker.key]} onClose={() => setPicker(null)}
          onApply={(sel) => { setPicks((x) => { const n = { ...x }; if (sel) n[picker.key] = sel; else delete n[picker.key]; return n; }); setPicker(null); }} />}
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

export interface F {
  loai: Exclude<Loai, 'none'>; parentKey: string | null; code: string; name: string; note: string; isActive: boolean;
  taxId: string; validFrom: string;
  /** cửa hàng */ address: string; phone: string; companyName: string; departmentCode: string;
  /** kho */ typeCode: string; isDefault: boolean;
  /** công ty / chi nhánh: có điểm hoạt động (kho, chứng từ) — mã điểm, trống = tạo mới cùng mã nút */ active: boolean; pointCode: string;
  /** chỉ để thống kê: không hiện khi tìm / chọn chi nhánh */ statsOnly: boolean;
}
export function formOf(n: CNode | null, parentKey: string | null, cc: CC): F {
  const base: F = { loai: 'unit', parentKey, code: '', name: '', note: '', isActive: true, taxId: '', validFrom: homNay(), address: '', phone: '', companyName: '', departmentCode: '', typeCode: 'KHH', isDefault: false, active: false, pointCode: '', statsOnly: false };
  if (!n) {
    const p = parentKey ? cc.byKey.get(parentKey) : null;
    return { ...base, loai: !p ? 'company' : p.loai === 'branch' ? 'warehouse' : 'unit' };
  }
  const f: F = { ...base, loai: n.loai as F['loai'], parentKey: n.parentKey === NONE_KEY ? null : n.parentKey, code: n.code, name: n.name, isActive: n.isActive };
  if (n.org) return { ...f, note: n.org.note, taxId: n.org.taxId ?? '', active: Boolean(n.ownBranch), pointCode: n.ownBranch?.code ?? '', statsOnly: Boolean(n.org.statsOnly) };
  if (n.branch) return { ...f, statsOnly: Boolean(n.branch.statsOnly), isActive: n.branch.isActive, note: n.branch.note, taxId: n.branch.taxCode, address: n.branch.address ?? '', phone: n.branch.phone, companyName: n.branch.companyName, departmentCode: n.branch.departmentCode ?? '' };
  if (n.warehouse) return { ...f, note: n.warehouse.note, address: n.warehouse.address, typeCode: n.warehouse.typeCode || 'KHH', isDefault: n.warehouse.isDefault };
  if (n.dept) return { ...f, note: n.dept.note };
  return f;
}

function NutForm({ cc, nodeKey, parentKey, copyKey, loai: loaiDat, canWrite, onClose, onSaved, onGo, onAdd, onBack }: { cc: CC; nodeKey: string | null; parentKey: string | null; /** Nhân bản: chép thông tin nút này (mã để trống). */ copyKey?: string; /** Thêm theo bước: loại đặt sẵn. */ loai?: F['loai']; canWrite: boolean; onClose: () => void; onSaved: (key: string) => void; /** Mở nút khác (bấm đúp dòng bên trong). */ onGo: (key: string) => void; /** Thêm nút con vào nút này. */ onAdd: (parentKey: string) => void; /** Lùi về nút vừa xem. */ onBack?: () => void }) {
  const qc = useQueryClient();
  const node = nodeKey ? cc.byKey.get(nodeKey) ?? null : null;
  const isNew = !node;
  // [2026-11-18 01:40 PM kiennt] NT-DM-006 — nhân bản: lấy thông tin nút gốc, mã để trống, kho không là kho mặc định (đóng góp)
  const goc = !node && copyKey ? cc.byKey.get(copyKey) ?? null : null;
  const start = useMemo(() => (goc ? { ...formOf(goc, parentKey, cc), code: '', isDefault: false, active: false, pointCode: '' } : { ...formOf(node, parentKey, cc), ...(!node && loaiDat ? { loai: loaiDat } : {}) }), [nodeKey, copyKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [f, setF] = useState<F>(start);
  useEffect(() => setF(start), [start]);
  const set = (p: Partial<F>) => setF((x) => ({ ...x, ...p }));
  const viewAgain = useViewAgain();
  const needParent = f.loai === 'warehouse';
  const types = (useWarehouseTypes().data?.types ?? []).filter((t) => t.isActive || t.code === f.typeCode);
  const [themLoai, setThemLoai] = useState<string | null>(null);
  // Kho: đặt dưới cửa hàng hoặc công ty / chi nhánh có điểm hoạt động (mã của ô Thuộc = mã điểm). Bộ phận: dưới công ty, chi nhánh, cửa hàng.
  const parents = useMemo(() => cc.nodes.filter((n) => CHA[f.loai].includes(n.loai) && n.key !== nodeKey && !(nodeKey && cc.pathOf(n).some((x) => x.key === nodeKey)) && (f.loai !== 'warehouse' || coHoatDong(n)))
    .map((n) => ({ code: f.loai === 'warehouse' && n.ownBranch ? n.ownBranch.code : n.loai === 'branch' && f.loai === 'department' ? `#${n.code}` : n.code, name: `${n.name} (${loaiNhan(n).toLowerCase()})` })), [cc, f.loai, nodeKey]);
  const keyOf = (code: string) => (!code ? null : needParent ? cc.pointKey(code) : code.startsWith('#') ? `b:${code.slice(1)}` : `o:${code}`);
  const codeOfKey = (k: string | null) => { const n = k ? cc.byKey.get(k) : null; return !n ? '' : f.loai === 'warehouse' ? (n.ownBranch?.code ?? n.branch?.code ?? '') : n.loai === 'branch' ? `#${n.code}` : n.code; };
  const parent = f.parentKey ? cc.byKey.get(f.parentKey) : null;
  const parentOk = !f.parentKey || CHA[f.loai].includes(parent?.loai ?? 'none');
  const changedPlace = !isNew && (f.parentKey !== start.parentKey || ((f.loai === 'company' || f.loai === 'unit') && f.taxId !== start.taxId));
  const taxBad = f.taxId !== '' && !MST_OK.test(f.taxId) && f.loai !== 'branch';

  const save = useMutation({
    mutationFn: () => luuNut(cc, f, node, start, changedPlace ? f.validFrom || null : null),
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
  const ok = f.name.trim() && f.code.trim() && parentOk && !taxBad && (!needParent || (parent && coHoatDong(parent)));
  const laNut = f.loai === 'company' || f.loai === 'unit';
  /** Chi nhánh làm được điểm hoạt động: chưa là điểm của nút khác (cửa hàng bên dưới nút này lên trước). */
  const diemCo = useMemo(() => {
    const taken = new Set(cc.nodes.filter((n) => n.ownBranch && n.key !== nodeKey).map((n) => n.ownBranch!.code));
    const mine = new Set(node ? cc.under(node.key).filter((x) => x.branch).map((x) => x.code) : []);
    return cc.allBranches.filter((b) => !taken.has(b.code)).sort((a, b) => Number(mine.has(b.code)) * -1 + Number(mine.has(a.code)) || a.code.localeCompare(b.code)).map((b) => ({ code: b.code, name: `${b.name}${mine.has(b.code) ? ' (đang thuộc nút này)' : ''}` }));
  }, [cc, nodeKey, node]);
  return (
    <Modal wide viewAgain={viewAgain} viewFirst={!isNew} title={title.charAt(0).toUpperCase() + title.slice(1)} onClose={onClose} helpKey="so-do-to-chuc"
      footer={<>{onBack && <button className="btn" data-view-ok style={{ marginRight: 'auto' }} title="Lùi về nút vừa xem" onClick={onBack}><ArrowLeft size={14} /> Quay lại</button>}{canWrite && <button className="btn btn-primary" disabled={!ok || save.isPending} onClick={() => save.mutate()}>Ghi</button>}<button className="btn" onClick={onClose}>Thoát</button></>}>
      <Field label="Loại (*)" full tip="Công ty (cấp 0): đơn vị pháp lý, có MST. Chi nhánh: cấp quản lý bên dưới (miền, chi nhánh mua hàng, tỉnh…), cấp tính theo cây. Cửa hàng: điểm bán. Kho: thuộc cửa hàng hoặc công ty / chi nhánh có hoạt động. Bộ phận: phòng ban, tổ, nhóm…">
        <div className="cc-loai-pick">
          {(['company', 'unit', 'branch', 'warehouse', 'department'] as const).map((l) => (
            <label key={l} className={`cc-loai-opt${f.loai === l ? ' on' : ''}${!isNew && f.loai !== l && !((l === 'company' || l === 'unit') && (f.loai === 'company' || f.loai === 'unit')) ? ' dis' : ''}`}>
              <input type="radio" checked={f.loai === l} disabled={!isNew && !((l === 'company' || l === 'unit') && (f.loai === 'company' || f.loai === 'unit'))} onChange={() => {
                // [2026-11-13 Nguyễn Văn Thủy] đổi loại mà "Thuộc" không hợp: chuyển sang nút cùng mã hợp loại (vd cửa hàng cùng mã), không có thì để trống (đóng góp)
                const cur = f.parentKey ? cc.byKey.get(f.parentKey) : null;
                const ok = !cur || CHA[l].includes(cur.loai);
                const same = cur && !ok ? cc.nodes.find((n) => n.code === cur.code && CHA[l].includes(n.loai)) : undefined;
                set({ loai: l, ...(ok ? {} : { parentKey: same?.key ?? null }) });
              }} /> {LOAI_ICON[l]} {LOAI_TEN[l]}
            </label>
          ))}
        </div>
      </Field>
      <Field label={needParent ? 'Thuộc (*)' : 'Thuộc'} full tip={needParent ? 'Kho nằm ở cửa hàng, hoặc công ty / chi nhánh đã tích Có hoạt động' : 'Cấp trên trên cây. Trống = công ty riêng (gốc)'}>
        <ListPicker items={parents} value={codeOfKey(f.parentKey)} onChange={(c) => set({ parentKey: keyOf(c) })} placeholder={needParent ? 'Chọn nơi đặt kho' : 'Không (gốc riêng)'} />
        {!parentOk && <div className="neg" style={{ fontSize: 12.5, marginTop: 3, fontWeight: 600 }}>{LOAI_TEN[f.loai]} không đặt dưới {parent ? LOAI_TEN[parent.loai].toLowerCase() : 'nút này'} — chọn lại Thuộc</div>}
      </Field>
      <Field label={f.loai === 'warehouse' ? 'Mã kho (*)' : 'Mã (*)'} tip={f.loai === 'branch' ? 'Khớp mã cửa hàng của hệ thống bán hàng. Đổi mã (lên Plus / Premium, đóng _OFF): chứng từ, sổ sách, kho giữ nguyên' : undefined}>
        <input className="input mono" value={f.code} disabled={!isNew && f.loai !== 'branch'} maxLength={f.loai === 'warehouse' ? 12 : 32} onChange={(e) => set({ code: e.target.value })} autoFocus={isNew} />
      </Field>
      {txt('name', 'Tên (*)')}

      {(laNut || f.loai === 'branch') && (
        <Field label=" " full>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {laNut && <label className="checkbox"><input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} /> Có hoạt động (có kho, ghi chứng từ)<Hoi text="Tích khi cấp này tự mua hàng, có kho, có kế toán… Hệ thống gắn một điểm hoạt động (chi nhánh ghi sổ) cho cấp này; kho và chứng từ ghi theo điểm đó. Không tích = cấp chỉ để gom các cấp dưới." /></label>}
            <label className="checkbox"><input type="checkbox" checked={f.statsOnly} onChange={(e) => set({ statsOnly: e.target.checked })} /> Chỉ để thống kê<Hoi text="Không hiện ở ô tìm / chọn chi nhánh khi lập chứng từ; vẫn dùng để gom báo cáo." /></label>
          </div>
        </Field>
      )}
      {laNut && f.active && (
        <Field label="Điểm hoạt động" full tip="Chi nhánh ghi sổ của cấp này (vd kho tổng 08000 của CN Phú Thọ). Để trống = tạo mới cùng mã, cùng tên với cấp này">
          <ListPicker items={diemCo} value={f.pointCode} onChange={(c) => set({ pointCode: c })} placeholder={`Tạo mới cùng mã ${f.code || '…'}`} />
        </Field>
      )}
      {(f.loai === 'company' || f.loai === 'unit' || f.loai === 'branch') && (
        // [2026-11-13 Nguyễn Văn Thủy] ô MST có tra cứu như form nhà cung cấp: Lấy thông tin → hiện tên, địa chỉ, tình trạng theo Cục Thuế, điền sẵn, sửa lại được (đóng góp)
        <>
          <TaxCodeField label="MST" full value={f.taxId} showExisting={false} autoWhenEmpty={isNew && !f.name.trim()}
            onChange={(v) => set({ taxId: v.replace(/[^0-9-]/g, '') })}
            onFill={(t, overwrite) => setF((x) => {
              const pick = (cur: string, v: string) => (overwrite || !cur.trim() ? v || cur : cur);
              if (x.loai === 'branch') return { ...x, companyName: pick(x.companyName, t.name), address: pick(x.address, t.address) };
              if (x.loai === 'company') return { ...x, name: pick(x.name, t.name), note: pick(x.note, t.address) };
              return { ...x, note: pick(x.note, [t.name, t.address].filter(Boolean).join(' — ')) };
            })} />
          {taxBad && <div className="neg full" style={{ fontSize: 12.5, marginTop: -4, fontWeight: 600 }}>MST gồm 10 số hoặc 10 số-3 số</div>}
        </>
      )}
      {changedPlace && (
        <Field label="Áp dụng từ ngày" tip="Chứng từ từ ngày này theo nơi thuộc / MST mới; chứng từ trước ngày này giữ như cũ">
          <input className="input" type="date" value={f.validFrom} onChange={(e) => set({ validFrom: e.target.value })} />
        </Field>
      )}
      {f.loai === 'branch' && (
        <>
          {!isNew && (
            <Field label="Bộ phận" tip="Chứng từ của cửa hàng tự mang bộ phận này. Cửa hàng mới tự có bộ phận riêng (BH + số mã)">
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
            <ListPicker items={types.map((t) => ({ code: t.code, name: t.name, hint: t.purpose }))} value={f.typeCode} onChange={(c) => set({ typeCode: c || 'KHH' })}
              onAdd={(t) => setThemLoai(t)} addLabel="Thêm loại kho" />
            {themLoai !== null && <LoaiKhoForm value={{ isNew: true, name: themLoai }} onClose={() => setThemLoai(null)} onSaved={(c) => set({ typeCode: c })} />}
          </Field>
          <Field label=" "><label className="checkbox"><input type="checkbox" checked={f.isDefault} onChange={(e) => set({ isDefault: e.target.checked })} /> Kho mặc định<Hoi text="Nhận các dòng nhập xuất không ghi mã kho" /></label></Field>
          {txt('address', 'Địa chỉ', { full: true })}
        </>
      )}
      {laNut && !isNew && !f.taxId && parent?.mst?.value && <div className="muted full" style={{ fontSize: 12.5, marginTop: -4 }}>MST để trống: dùng {parent.mst.value} theo {parent.mst.from ?? parent.name}.</div>}
      {txt('note', f.loai === 'company' || f.loai === 'unit' ? 'Mô tả' : 'Ghi chú', { full: true })}
      {!isNew && <Field label=" "><label className="checkbox"><input type="checkbox" checked={f.isActive} onChange={(e) => set({ isActive: e.target.checked })} /> Theo dõi</label></Field>}
      {node && node.loai !== 'department' && <BenTrong cc={cc} node={node} text={insideText} onGo={onGo} onAdd={canWrite ? () => onAdd(node.key) : undefined} />}
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
      {node && <div className="full"><div className="field-title">Lịch sử thay đổi</div><LichSuNut node={node} /></div>}
    </Modal>
  );
}

/**
 * Ghi một nút theo loại — dùng chung cho hộp thoại và Nhập Excel. start = giá trị trước khi sửa (null = thêm mới).
 * Trả khoá nút (o: / b: / w: / d: + mã).
 */
export async function luuNut(cc: CC, f: F, node: CNode | null, start: F | null, validFrom: string | null): Promise<string> {
  const isNew = !node;
  const orgOf = (k: string | null) => (k ? cc.byKey.get(k)?.org?.code ?? (k.startsWith('o:') ? k.slice(2) : null) : null);
  const code = f.code.trim(), name = f.name.trim();
  const moved = !isNew && f.parentKey !== (start?.parentKey ?? null);
  if (f.loai === 'company' || f.loai === 'unit') {
    const body = { kind: f.loai, name, note: f.note, taxId: f.taxId.trim(), validFrom, statsOnly: f.statsOnly };
    const me = isNew ? code : node.code;
    if (isNew) await api.post('/api/v1/org-units', { ...body, code, parentCode: orgOf(f.parentKey) });
    else await api.patch(`/api/v1/org-units/${encodeURIComponent(node.code)}`, { ...body, isActive: f.isActive, ...(moved ? { parentCode: orgOf(f.parentKey) } : {}) });
    // [2026-11-20 Nguyễn Văn Thủy] điểm hoạt động: chọn chi nhánh có sẵn, hoặc tạo mới cùng mã nút; bỏ tích thì gỡ (0171) (đóng góp)
    const cur = node?.ownBranch?.code ?? '';
    if (f.active) {
      const pc = f.pointCode.trim() || me;
      if (!cc.allBranches.some((b) => b.code === pc)) await api.post('/api/v1/branches', { code: pc, name, taxCode: '' });
      if (pc !== cur) {
        await api.patch(`/api/v1/branches/${encodeURIComponent(pc)}`, { orgUnitCode: me });
        await api.patch(`/api/v1/org-units/${encodeURIComponent(me)}`, { branchCode: pc });
      }
    } else if (cur) await api.patch(`/api/v1/org-units/${encodeURIComponent(me)}`, { branchCode: null });
    return `o:${me}`;
  }
  if (f.loai === 'branch') {
    const body = { name, note: f.note, taxCode: f.taxId.trim(), address: f.address, phone: f.phone, companyName: f.companyName, statsOnly: f.statsOnly };
    if (isNew) {
      await api.post('/api/v1/branches', { ...body, code });
      const extra = { ...(f.parentKey ? { orgUnitCode: orgOf(f.parentKey) } : {}), ...(f.departmentCode ? { departmentCode: f.departmentCode } : {}), ...(f.isActive ? {} : { isActive: false }) };
      if (Object.keys(extra).length) await api.patch(`/api/v1/branches/${encodeURIComponent(code)}`, extra);
      return `b:${code}`;
    }
    await api.patch(`/api/v1/branches/${encodeURIComponent(node.code)}`, {
      ...body, isActive: f.isActive, departmentCode: f.departmentCode || null,
      ...(code && code !== node.code ? { newCode: code } : {}),
      ...(moved ? { orgUnitCode: orgOf(f.parentKey), validFrom } : {}),
    });
    return `b:${code || node.code}`;
  }
  if (f.loai === 'warehouse') {
    const pn = f.parentKey ? cc.byKey.get(f.parentKey) : null;
    const branchCode = pn ? (pn.ownBranch?.code ?? pn.branch?.code ?? '') : '';
    const body = { branchCode, name, note: f.note, address: f.address, isActive: f.isActive, isDefault: f.isDefault, typeCode: f.typeCode || 'KHH' };
    if (isNew) await api.post('/api/v1/warehouses', { ...body, code });
    else await api.patch(`/api/v1/warehouses/${encodeURIComponent(node.code)}`, body);
    return `w:${isNew ? code : node.code}`;
  }
  const pd = f.parentKey ? cc.byKey.get(f.parentKey) : null;
  const extra = { ...(node?.dept?.extra ?? {}), orgUnitCode: pd?.org?.code ?? '', branchCode: pd?.branch?.code ?? '' };
  await api.put(`/api/v1/dimensions/department/${encodeURIComponent(isNew ? code : node.code)}`, { name, parentCode: node?.dept?.parentCode || undefined, note: f.note, isActive: f.isActive, extra });
  return `d:${isNew ? code : node.code}`;
}

/* ------------------------------------------------------------------ bên trong */

// [2026-11-13 Nguyễn Văn Thủy] bấm một nút (trên bảng hay sơ đồ) thấy ngay bên trong có gì: danh sách theo loại, bấm đúp đi tiếp (đóng góp)
function BenTrong({ cc, node, text, onGo, onAdd }: { cc: CC; node: CNode; text: string; onGo: (key: string) => void; onAdd?: () => void }) {
  const [loai, setLoai] = useState<Loai | 'direct'>('direct');
  const all = useMemo(() => cc.under(node.key).filter((x) => !off(x)), [cc, node.key]);
  const direct = (cc.kids.get(node.key) ?? []).filter((x) => !off(x));
  const rows = loai === 'direct' ? direct : all.filter((x) => x.loai === loai);
  const kinds = (['company', 'unit', 'branch', 'warehouse', 'department'] as Loai[]).filter((l) => all.some((x) => x.loai === l));
  return (
    <div className="full" data-view-ok>
      <div className="field-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Thuộc {node.name}{text ? `: ${text}` : ''}</span>
        {onAdd && <button type="button" className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={onAdd}><Plus size={13} /> Thêm vào đây</button>}
      </div>
      {!all.length ? <div className="muted" style={{ fontSize: 13 }}>Chưa có mục nào{onAdd ? ' — bấm Thêm vào đây để thêm' : ''}.</div> : (
        <>
          {/* Chỉ một loại, không có cấp sâu hơn: không cần nút chọn, hiện thẳng danh sách */}
          {!(kinds.length === 1 && direct.length === all.length) && (
            <div className="cc-in" style={{ margin: '4px 0' }}>
              <button type="button" className={`cc-chip${loai === 'direct' ? ' on' : ''}`} title="Chỉ các mục nằm ngay dưới, chưa mở các cấp sâu hơn" onClick={() => setLoai('direct')}>Cấp ngay dưới ({direct.length})</button>
              {kinds.map((l) => <button key={l} type="button" className={`cc-chip${loai === l ? ' on' : ''}`} title={`Mọi ${LOAI_TEN[l].toLowerCase()} trong nhánh này, kể cả các cấp sâu hơn`} onClick={() => setLoai(l)}>{LOAI_ICON[l]} {LOAI_TEN[l]} ({all.filter((x) => x.loai === l).length})</button>)}
            </div>
          )}
          <div className="table-wrap" style={{ maxHeight: 240 }}>
            <table className="grid cc-log">
              <thead><tr><th title="Loại nút">Loại</th><th title="Mã">Mã</th><th title="Tên">Tên</th><th title="Nút chứa trực tiếp">Thuộc</th></tr></thead>
              <tbody>{rows.map((n) => {
                const p = n.parentKey ? cc.byKey.get(n.parentKey) : null;
                return (
                  <tr key={n.key} className="cc-tr" title="Bấm đúp để mở" onDoubleClick={() => onGo(n.key)}>
                    <td><span className="cc-loai">{LOAI_ICON[n.loai]} {loaiNhan(n)}</span></td><td className="mono">{n.code}</td><td>{n.name}</td><td className="muted">{p ? p.name : ''}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
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

/** Nút Nhập Excel ▾ của DM16: chọn một trong 4 loại; tệp Xuất 4 sheet dùng thẳng (trình nhập tự chọn đúng sheet). */
function NhapCoCauMenu() {
  const [mo, setMo] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!mo) return;
    const dong = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMo(false); };
    document.addEventListener('mousedown', dong);
    return () => document.removeEventListener('mousedown', dong);
  }, [mo]);
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button className="btn btn-sm" onClick={() => setMo((x) => !x)} title="Nhập từ tệp Excel (tệp Xuất 4 sheet dùng được) — nhập lần lượt Cơ cấu → Phòng ban → Cửa hàng → Kho"><FileUp size={14} /> Nhập Excel ▾</button>
      {mo && (
        <div className="card" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 30, padding: 8, display: 'grid', gap: 6, minWidth: 200, boxShadow: '0 4px 14px rgba(0,0,0,.15)' }}>
          <div className="muted" style={{ fontSize: 12 }}>Nhập lần lượt theo thứ tự:</div>
          {([['co-cau', '1. Cơ cấu'], ['phong-ban', '2. Phòng ban'], ['cua-hang', '3. Cửa hàng'], ['kho-co-cau', '4. Kho']] as const).map(([id, nhan]) => <NutNhapExcel key={id} loai={nhapLoai(id)!} label={nhan} />)}
        </div>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ khai báo từng bước */

// [2026-11-20 Nguyễn Văn Thủy] khai báo từng bước: công ty → chi nhánh cấp 1, 2, 3… → cửa hàng → kho, bộ phận; mỗi bước có gợi ý (0171) (đóng góp)
const GOI_Y_CAP: Record<number, { ten: string; vd: string; text: string }> = {
  0: { ten: 'Công ty', vd: 'Công ty CP Đầu tư Thế Giới Sữa', text: 'Đơn vị pháp lý: mã, tên, MST. Có nhiều công ty thì thêm từng công ty. Công ty tự mua hàng, có kho, kế toán thì tích "Có hoạt động", rồi khai kho, bộ phận ở bước Kho & bộ phận.' },
  1: { ten: 'Chi nhánh cấp 1', vd: 'Miền Bắc, Miền Trung, Miền Nam', text: 'Thường là vùng / miền để gom số liệu. Không dùng thì bỏ qua bước này, khai thẳng cấp sau vào công ty. Cấp chỉ để gom thì tích "Chỉ để thống kê".' },
  2: { ten: 'Chi nhánh cấp 2', vd: 'CN Hà Nội, CN Phú Thọ', text: 'Thường là chi nhánh mua hàng: có MST riêng, kho tổng, phòng kế toán → tích "Có hoạt động". MST để trống thì tự dùng MST của cấp trên.' },
  3: { ten: 'Chi nhánh cấp 3', vd: 'Hà Nội, Hưng Yên, Phú Thọ', text: 'Thường là tỉnh / khu vực, gom các cửa hàng. Tỉnh có kho riêng thì tích "Có hoạt động".' },
};
const goiY = (d: number) => GOI_Y_CAP[d] ?? { ten: `Chi nhánh cấp ${d}`, vd: '', text: 'Cấp sâu hơn khi cần chia nhỏ thêm. Cấp nào cũng có thể có kho, bộ phận, MST riêng.' };

function TungBuoc({ cc, canWrite, onOpen, onAdd, onChart }: { cc: CC; canWrite: boolean; onOpen: (n: CNode) => void; onAdd: (loai: F['loai'], parentKey: string | null) => void; onChart: () => void }) {
  const org = cc.nodes.filter((n) => n.org && !off(n));
  const maxDepth = org.reduce((m, n) => Math.max(m, n.depth), 0);
  const buocCap = Array.from({ length: maxDepth + 2 }, (_, d) => d); // thêm một cấp trống để khai cấp mới
  const steps: { key: string; nhan: string }[] = [...buocCap.map((d) => ({ key: `cap${d}`, nhan: goiY(d).ten })), { key: 'shop', nhan: 'Cửa hàng' }, { key: 'kho', nhan: 'Kho & bộ phận' }];
  const [buoc, setBuoc] = useState(steps[0]!.key);
  const idx = Math.max(0, steps.findIndex((s) => s.key === buoc));
  const cur = steps[idx]!;
  const dem = (k: string) => (k === 'shop' ? cc.nodes.filter((n) => n.loai === 'branch' && !off(n)).length : k === 'kho' ? cc.nodes.filter((n) => (n.loai === 'warehouse' || n.loai === 'department') && !off(n)).length : org.filter((n) => `cap${n.depth}` === k).length);
  const cha = (n: CNode) => (n.parentKey && n.parentKey !== NONE_KEY ? cc.byKey.get(n.parentKey) ?? null : null);
  const bang = (rows: CNode[], cot: 'cap' | 'shop' | 'kho') => (
    <div className="table-wrap" style={{ maxHeight: 460 }}>
      <table className="grid">
        <thead><tr>
          <th style={{ width: 130 }} title="Mã">Mã</th><th title="Tên">Tên</th><th style={{ width: 220 }} title="Cấp trên trực tiếp">Thuộc</th>
          {cot === 'kho' && <th style={{ width: 110 }} title="Kho hay bộ phận">Loại</th>}
          <th style={{ width: 130 }} title="Mã số thuế; chữ mờ = lấy theo cấp trên">MST</th>
          {cot === 'cap' && <th style={{ width: 150 }} title="Có hoạt động = có kho, ghi chứng từ (mã điểm hoạt động)">Có hoạt động</th>}
          {cot !== 'kho' && <th style={{ width: 90 }} title="Không hiện khi tìm / chọn chi nhánh lập chứng từ">Chỉ thống kê</th>}
          {cot !== 'kho' && <th style={{ width: 140 }} title="Số mục ngay bên dưới">Bên dưới</th>}
        </tr></thead>
        <tbody>
          {rows.map((n) => {
            const p = cha(n);
            const kids = (cc.kids.get(n.key) ?? []).filter((x) => !off(x));
            const kt = (['unit', 'branch', 'warehouse', 'department'] as Loai[]).map((l) => [l, kids.filter((x) => x.loai === l).length] as const).filter(([, c]) => c).map(([l, c]) => `${c} ${LOAI_TEN[l].toLowerCase()}`).join(', ');
            return (
              <tr key={n.key} className="cc-tr" title="Bấm đúp để xem / sửa" onDoubleClick={() => onOpen(n)}>
                <td className="mono">{n.code}</td><td>{n.name}</td><td className="muted">{p ? p.name : n.org && !n.parentKey ? '— (gốc)' : 'Chưa xếp'}</td>
                {cot === 'kho' && <td>{LOAI_TEN[n.loai]}</td>}
                <td className="mono">{n.mst?.from ? <span className="muted" title={`Theo ${n.mst.from}`}>{n.mst.value}</span> : n.mst?.value}</td>
                {cot === 'cap' && <td>{n.ownBranch ? <span title="Điểm hoạt động">✓ {n.ownBranch.code}</span> : <span className="muted">—</span>}</td>}
                {cot !== 'kho' && <td style={{ textAlign: 'center' }}>{thongKe(n) ? '✓' : ''}</td>}
                {cot !== 'kho' && <td className="muted" style={{ fontSize: 12 }}>{kt}</td>}
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 14 }}>Chưa có — bấm nút Thêm ở trên{cur.key.startsWith('cap') && cur.key !== 'cap0' ? ', hoặc bỏ qua bước này nếu không dùng cấp này' : ''}.</td></tr>}
        </tbody>
      </table>
    </div>
  );
  let body: ReactNode;
  if (cur.key.startsWith('cap')) {
    const d = Number(cur.key.slice(3));
    const g = goiY(d);
    const rows = org.filter((n) => n.depth === d);
    const chaCo = org.filter((n) => n.depth === d - 1);
    body = (
      <>
        <div className="alert alert-info" style={{ marginBottom: 8 }}><b>{g.ten}{g.vd ? ` — ví dụ: ${g.vd}` : ''}.</b> {g.text}</div>
        {canWrite && (
          <div className="row" style={{ gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {d === 0 ? <button className="btn btn-sm btn-primary" onClick={() => onAdd('company', null)}><Plus size={14} /> Thêm công ty</button>
              : chaCo.length ? chaCo.map((c) => <button key={c.key} className="btn btn-sm" title={`Thêm ${g.ten.toLowerCase()} dưới ${c.name}`} onClick={() => onAdd('unit', c.key)}><Plus size={14} /> Thêm vào {c.name}</button>)
              : <span className="muted">Khai cấp trên trước (bước {d}).</span>}
          </div>
        )}
        {bang(rows, 'cap')}
      </>
    );
  } else if (cur.key === 'shop') {
    const rows = cc.nodes.filter((n) => n.loai === 'branch' && !off(n));
    body = (
      <>
        <div className="alert alert-info" style={{ marginBottom: 8 }}><b>Cửa hàng — điểm bán.</b> Mã khớp hệ thống bán hàng; đặt dưới cấp gần nhất (thường là tỉnh). Cửa hàng mới tự có bộ phận riêng; kho của cửa hàng khai ở bước sau. Cửa hàng ở "Chưa xếp" là cửa hàng đã có chứng từ, bấm đúp để xếp lại vào cây.</div>
        {canWrite && <div className="row" style={{ gap: 6, marginBottom: 8 }}><button className="btn btn-sm btn-primary" onClick={() => onAdd('branch', null)}><Plus size={14} /> Thêm cửa hàng</button><span className="muted" style={{ fontSize: 12 }}>Chọn "Thuộc" trong hộp thoại.</span></div>}
        {bang(rows, 'shop')}
      </>
    );
  } else {
    const rows = cc.nodes.filter((n) => (n.loai === 'warehouse' || n.loai === 'department') && !off(n));
    body = (
      <>
        <div className="alert alert-info" style={{ marginBottom: 8 }}><b>Kho & bộ phận.</b> Kho đặt ở cửa hàng, hoặc công ty / chi nhánh đã tích "Có hoạt động". Bộ phận (phòng ban, tổ, nhóm…) đặt ở cấp nào cũng được.</div>
        {canWrite && <div className="row" style={{ gap: 6, marginBottom: 8 }}><button className="btn btn-sm btn-primary" onClick={() => onAdd('warehouse', null)}><Plus size={14} /> Thêm kho</button><button className="btn btn-sm" onClick={() => onAdd('department', null)}><Plus size={14} /> Thêm bộ phận</button></div>}
        {bang(rows, 'kho')}
      </>
    );
  }
  return (
    <div className="cc-buoc">
      <div className="tabs" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
        {steps.map((s, i) => <button key={s.key} className={`tab ${s.key === cur.key ? 'active' : ''}`} onClick={() => setBuoc(s.key)}>Bước {i + 1}. {s.nhan} <span className="muted">({dem(s.key)})</span></button>)}
        <button className="tab" title="Xem toàn bộ cây dạng sơ đồ" onClick={onChart}>Xem sơ đồ</button>
      </div>
      {body}
      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        <button className="btn btn-sm" disabled={idx === 0} onClick={() => setBuoc(steps[idx - 1]!.key)}>← Bước trước</button>
        <button className="btn btn-sm" disabled={idx === steps.length - 1} onClick={() => setBuoc(steps[idx + 1]!.key)}>Bước sau →</button>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>Bấm đúp một dòng để xem / sửa · cấp nào không dùng thì bỏ qua</span>
      </div>
    </div>
  );
}
