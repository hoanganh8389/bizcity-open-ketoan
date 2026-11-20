// [2026-11-20 Nguyễn Văn Thủy] CƠ CẤU TỔ CHỨC (DM16) — làm lại theo mô hình một bảng: ĐƠN VỊ lồng nhau – PHÂN KHO – BỘ PHẬN (0173) (đóng góp)
/**
 * Mọi cấp (công ty, miền, chi nhánh, tỉnh, cửa hàng…) đều là một ĐƠN VỊ: chỉ khác tên gọi cấp do người dùng đặt.
 *   - Đơn vị: mã, tên, thuộc (cha), đường dẫn A/B/C, MST (trống = theo cấp gần nhất có khai), tên in chứng từ, địa chỉ, điện thoại.
 *   - Phân kho và bộ phận thuộc một đơn vị. Tạo đơn vị là tự có một bộ phận (đổi tên tuỳ ý).
 *   - Mã không trùng giữa đơn vị, phân kho, bộ phận.
 * Dữ liệu: GET /api/v1/co-cau; ghi qua /api/v1/co-cau/* và /api/v1/warehouses.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building, Building2, ChevronDown, ChevronRight, FileDown, FileText, FileUp, Filter, History, Info, Layers, List, ListTree, MapPinned, MoreHorizontal, Mountain, Network,
  Pencil, Plus, Printer, RefreshCw, Search, Store, Trash2, Users, Warehouse as WarehouseIcon, X,
} from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Hoi, Loading, Modal } from '@/components/ui';
import { ListPicker, plain } from '@/components/pickers';
import { DataGrid, type Column } from '@/components/DataGrid';
import { TaxCodeField } from '@/components/TaxCodeField';
import { NutNhapExcel } from '@/components/NhapExcelWizard';
import { nhapLoai } from '@/lib/nhapExcel';
import { invalidateOrg } from '@/lib/orgUnits';
import { LoaiKhoForm, useWarehouseTypes } from './WarehouseTypesPage';
import { xuatCoCau } from './CoCauExcel';
import './co-cau.css';
import './co-cau-moi.css';

/* ------------------------------------------------------------------ dữ liệu */

export interface DonVi {
  uid: string; code: string; name: string; parentCode: string | null; path: string; level: number; levelLabel: string; sortOrder: number;
  taxCode: string; taxUsed: string; taxFrom: string | null; companyName: string; address: string; phone: string; note: string; isActive: boolean; departmentCode: string | null;
  createdBy?: string; createdAt?: string | null; updatedBy?: string; updatedAt?: string | null;
}
export interface PhanKho { uid: string; code: string; name: string; branchCode: string; typeCode: string; typeName: string; isDefault: boolean; isActive: boolean; address: string; note: string; createdBy?: string; createdAt?: string | null; updatedBy?: string; updatedAt?: string | null }
export interface BoPhan { uid: string; code: string; name: string; branchCode: string | null; parentCode?: string | null; isActive: boolean; note: string; createdBy?: string; createdAt?: string | null; updatedBy?: string; updatedAt?: string | null }
interface CoCauRaw { units: DonVi[]; warehouses: PhanKho[]; departments: BoPhan[] }

export const ngung = (x: { code: string; isActive: boolean }) => !x.isActive || /_OFF$/i.test(x.code);

export function useCoCau() {
  const q = useQuery({ queryKey: ['co-cau'], queryFn: () => api.get<CoCauRaw>('/api/v1/co-cau'), staleTime: 30_000 });
  const ix = useMemo(() => {
    const units = q.data?.units ?? [];
    const byCode = new Map(units.map((u) => [u.code, u]));
    const kids = new Map<string, DonVi[]>();
    for (const u of units) if (u.parentCode && byCode.has(u.parentCode)) (kids.get(u.parentCode) ?? kids.set(u.parentCode, []).get(u.parentCode)!).push(u);
    const sx = (a: DonVi, b: DonVi) => a.sortOrder - b.sortOrder || Number(!(kids.get(a.code)?.length)) - Number(!(kids.get(b.code)?.length)) || a.code.localeCompare(b.code);
    for (const l of kids.values()) l.sort(sx);
    const roots = units.filter((u) => !u.parentCode || !byCode.has(u.parentCode)).sort((a, b) => (kids.get(b.code)?.length ?? 0) - (kids.get(a.code)?.length ?? 0) || sx(a, b));
    const under = (code: string): DonVi[] => { const out: DonVi[] = []; const st = [...(kids.get(code) ?? [])]; while (st.length) { const x = st.pop()!; out.push(x); st.push(...(kids.get(x.code) ?? [])); } return out; };
    const khoCua = new Map<string, PhanKho[]>();
    for (const w of q.data?.warehouses ?? []) (khoCua.get(w.branchCode) ?? khoCua.set(w.branchCode, []).get(w.branchCode)!).push(w);
    const bpCua = new Map<string, BoPhan[]>();
    for (const d of q.data?.departments ?? []) if (d.branchCode) (bpCua.get(d.branchCode) ?? bpCua.set(d.branchCode, []).get(d.branchCode)!).push(d);
    // Bộ phận cha – con (chỉ trong cùng đơn vị).
    const bpByCode = new Map((q.data?.departments ?? []).map((d) => [d.code, d]));
    const chaBp = (d: BoPhan) => { const p = d.parentCode ? bpByCode.get(d.parentCode) : undefined; return p && p.branchCode === d.branchCode ? p : undefined; };
    const bpCon = new Map<string, BoPhan[]>();
    for (const d of q.data?.departments ?? []) { const p = chaBp(d); if (p) (bpCon.get(p.code) ?? bpCon.set(p.code, []).get(p.code)!).push(d); }
    for (const l of bpCon.values()) l.sort((a, b) => a.code.localeCompare(b.code));
    const bpSau = (d: BoPhan) => { let n = 0; for (let x = chaBp(d); x && n < 30; x = chaBp(x)) n++; return n; };
    /** Xếp bộ phận theo cây (cha trước, con ngay dưới) — gốc là bộ phận không có cha trong cùng danh sách. */
    const xepCay = (list: BoPhan[]) => {
      const co = new Set(list.map((d) => d.code));
      const out: BoPhan[] = [];
      const di = (d: BoPhan, n: number) => { if (n > 30) return; out.push(d); for (const c of bpCon.get(d.code) ?? []) if (co.has(c.code)) di(c, n + 1); };
      for (const d of list) { const p = chaBp(d); if (!p || !co.has(p.code)) di(d, 0); }
      return out;
    };
    const pathOf = (u: DonVi) => { const out: DonVi[] = []; const seen = new Set<string>(); for (let x: DonVi | undefined = u; x && !seen.has(x.code); x = x.parentCode ? byCode.get(x.parentCode) : undefined) { seen.add(x.code); out.unshift(x); } return out; };
    // Mã đã dùng (đơn vị, phân kho, bộ phận) để báo trùng ngay khi gõ.
    const ma = new Map<string, string>();
    for (const u of units) ma.set(u.code.toLowerCase(), `đơn vị ${u.name}`);
    for (const w of q.data?.warehouses ?? []) ma.set(w.code.toLowerCase(), `phân kho ${w.name}`);
    for (const d of q.data?.departments ?? []) ma.set(d.code.toLowerCase(), `bộ phận ${d.name}`);
    return { units, byCode, kids, roots, under, khoCua, bpCua, bpByCode, bpCon, chaBp, bpSau, xepCay, pathOf, ma, warehouses: q.data?.warehouses ?? [], departments: q.data?.departments ?? [] };
  }, [q.data]);
  return { ...ix, loading: q.isLoading, error: q.error, refetch: () => void q.refetch() };
}
export type CC = ReturnType<typeof useCoCau>;

function useLamMoi() {
  const qc = useQueryClient();
  return () => {
    invalidateOrg(qc);
    for (const k of [['co-cau'], ['warehouses'], ['branches'], ['dimensions', 'department'], ['co-cau-history'], ['co-cau-doi-cha']]) void qc.invalidateQueries({ queryKey: k });
  };
}

/** Biểu tượng theo tên gọi cấp (chỉ để nhìn cho nhanh). */
export function iconDonVi(u: DonVi, coCon: boolean): ReactNode {
  const t = plain(u.levelLabel);
  if (/cong ty|^ho\b|tap doan/.test(t)) return <Building2 />;
  if (/mien|vung/.test(t)) return <Mountain />;
  if (/chi nhanh/.test(t)) return <Building />;
  if (/tinh|thanh pho/.test(t)) return <MapPinned />;
  if (/cua hang|shop|diem ban/.test(t)) return <Store />;
  if (/kho/.test(t)) return <WarehouseIcon />;
  return coCon ? <Network /> : <Store />;
}
export const tenCap = (u: DonVi) => u.levelLabel || `Cơ cấu cấp ${u.level}`;
const TrangThai = ({ x }: { x: { code: string; isActive: boolean } }) => (ngung(x) ? <span className="ccm-tt ngung">Ngừng hoạt động</span> : <span className="ccm-tt">Đang hoạt động</span>);
const OIc = ({ children, to }: { children: ReactNode; to?: boolean }) => <span className={`ccm-o-ic${to ? ' to' : ''}`}>{children}</span>;
const homNay = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const MST_OK = /^[0-9]{10}(-[0-9]{3})?$/;

/* ------------------------------------------------------------------ trang */

type Xem = 'cay' | 'sodo' | 'ds';
type HopThoai = { loai: 'donvi'; code: string | null; cha: string | null } | { loai: 'kho'; code: string | null; donVi: string | null } | { loai: 'bophan'; code: string | null; donVi: string | null; cha?: string | null } | { loai: 'xoa'; key: string; ten: string; ma: string };

export function CoCauToChucPage() {
  const { can } = useAuth();
  const canWrite = can('catalog:write');
  const cc = useCoCau();
  const [sel, setSel] = useState<string | null>(null);
  const [xem, setXem] = useState<Xem>('cay');
  const [hop, setHop] = useState<HopThoai | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!menu) return;
    const dong = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', dong);
    return () => document.removeEventListener('mousedown', dong);
  }, [menu]);
  useEffect(() => { if (!msg?.ok) return; const t = window.setTimeout(() => setMsg(null), 4000); return () => window.clearTimeout(t); }, [msg]);
  const chon = sel ? cc.byCode.get(sel) ?? null : null;
  const dangChon = chon ?? cc.roots[0] ?? null;
  const thongBao = (text: string) => setMsg({ ok: true, text });
  const mo = (h: HopThoai) => { setMsg(null); setHop(h); };

  return (
    <>
      <PageHeader title="Cơ cấu tổ chức" code="DM16" helpKey="so-do-to-chuc" subtitle="Đơn vị lồng nhau tuỳ ý (A/B/C…); mỗi đơn vị có phân kho, bộ phận riêng"
        actions={
          <div className="ccm-hd-nut">
            {canWrite && <button className="btn btn-primary" onClick={() => mo({ loai: 'donvi', code: null, cha: dangChon?.code ?? null })} title="Thêm đơn vị con của đơn vị đang chọn"><Plus size={16} /> Thêm đơn vị</button>}
            <span className="ccm-pop-o" ref={menuRef}>
              <button className="btn" title="Làm mới, xuất / nhập Excel, in" onClick={() => setMenu((x) => !x)}><MoreHorizontal size={16} /></button>
              {menu && (
                <div className="ccm-menu">
                  <button type="button" onClick={() => { setMenu(false); cc.refetch(); }}><RefreshCw size={15} /> Làm mới</button>
                  <button type="button" onClick={() => { setMenu(false); void xuatCoCau(cc); }}><FileDown size={15} /> Xuất Excel</button>
                  {canWrite && <div className="ccm-menu-nhom"><FileUp size={15} /> Nhập Excel, lần lượt:</div>}
                  {canWrite && ([['co-cau', '1. Đơn vị'], ['kho-co-cau', '2. Phân kho'], ['phong-ban', '3. Bộ phận']] as const).map(([id, nhan]) => <div key={id} className="ccm-menu-nhap"><NutNhapExcel loai={nhapLoai(id)!} label={nhan} /></div>)}
                  <button type="button" onClick={() => { setMenu(false); window.print(); }}><Printer size={15} /> In</button>
                </div>
              )}
            </span>
          </div>
        } />
      <div className="ccm-xem">
        {([['cay', 'Cây', <ListTree key="i" size={15} />], ['sodo', 'Sơ đồ', <Network key="i" size={15} />], ['ds', 'Danh sách', <List key="i" size={15} />]] as const).map(([v, t, ic]) => (
          <button key={v} type="button" className={xem === v ? 'on' : ''} onClick={() => setXem(v)}>{ic} {t}</button>
        ))}
      </div>
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'} ccm-bao`}>{msg.text}</div>}
      <ErrorBox error={cc.error ? errorText(cc.error) : null} />
      {cc.loading ? <Loading /> : xem === 'sodo' ? <SoDo cc={cc} sel={dangChon?.code ?? null} onChon={(c) => { setSel(c); setXem('cay'); }} />
        : xem === 'ds' ? <DanhSachTat cc={cc} onChon={(c) => { setSel(c); setXem('cay'); }} />
        : (
          <div className="ccm">
            <div className="ccm-trai"><CayDonVi cc={cc} sel={dangChon?.code ?? null} onSel={setSel} /></div>
            {dangChon ? <ChiTiet key={dangChon.code} cc={cc} u={dangChon} canWrite={canWrite} onSel={setSel} mo={mo} />
              : <div className="ccm-phai"><div className="ccm-the-trang ccm-rong">Chưa có đơn vị nào. Bấm <b>Thêm đơn vị</b> để bắt đầu.</div></div>}
          </div>
        )}
      {hop?.loai === 'donvi' && <DonViModal cc={cc} code={hop.code} cha={hop.cha} onClose={() => setHop(null)} onSaved={(c, t, tiep) => { thongBao(t); setSel(c); if (!tiep) setHop(null); }} />}
      {hop?.loai === 'kho' && <PhanKhoModal cc={cc} code={hop.code} donVi={hop.donVi} onClose={() => setHop(null)} onSaved={(t) => { thongBao(t); setHop(null); }} />}
      {hop?.loai === 'bophan' && <BoPhanModal cc={cc} code={hop.code} donVi={hop.donVi} cha={hop.cha ?? null} onClose={() => setHop(null)} onSaved={(t) => { thongBao(t); setHop(null); }} />}
      {hop?.loai === 'xoa' && <XoaModal hop={hop} onClose={() => setHop(null)} onDone={(t, cha) => { thongBao(t); setHop(null); if (hop.key.startsWith('u:')) setSel(cha); }} cc={cc} />}
    </>
  );
}

/* ------------------------------------------------------------------ cây trái */

function CayDonVi({ cc, sel, onSel }: { cc: CC; sel: string | null; onSel: (c: string) => void }) {
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState(false);
  const [hienNgung, setHienNgung] = useState(false);
  const [mo, setMo] = useState<Set<string>>(() => new Set(cc.roots.flatMap((r) => [r.code, ...(cc.kids.get(r.code) ?? []).map((x) => x.code)])));
  useEffect(() => {
    if (!sel) return;
    const u = cc.byCode.get(sel);
    if (u) setMo((o) => { const s = new Set(o); for (const x of cc.pathOf(u).slice(0, -1)) s.add(x.code); return s; });
  }, [sel, cc]);
  const hien = (u: DonVi) => hienNgung || !ngung(u);
  const khop = useMemo(() => {
    const w = plain(q).split(/\s+/).filter(Boolean);
    if (!w.length) return null;
    const keep = new Set<string>();
    let dem = 0;
    for (const u of cc.units) {
      if (!hien(u) || !w.every((x) => plain(`${u.code} ${u.name} ${u.taxCode} ${u.levelLabel}`).includes(x))) continue;
      dem++;
      for (const x of cc.pathOf(u)) keep.add(x.code);
    }
    return { keep, dem };
  }, [q, cc, hienNgung]); // eslint-disable-line react-hooks/exhaustive-deps
  const out: ReactNode[] = [];
  const walk = (list: DonVi[], d: number) => {
    for (const u of list) {
      if (khop ? !khop.keep.has(u.code) : !hien(u)) continue;
      const kids = (cc.kids.get(u.code) ?? []).filter((x) => (khop ? khop.keep.has(x.code) : hien(x)));
      const o = khop ? true : mo.has(u.code);
      out.push(
        <div key={u.code} className={`ccm-node${sel === u.code ? ' on' : ''}${ngung(u) ? ' muted' : ''}${kids.length ? ' co-con' : ''}`} style={{ paddingLeft: 4 + d * 18 }} onClick={() => onSel(u.code)} title={`${tenCap(u)} · ${u.path}`}>
          <button type="button" className="ccm-tog" disabled={!kids.length} onClick={(e) => { e.stopPropagation(); setMo((x) => { const s = new Set(x); if (s.has(u.code)) s.delete(u.code); else s.add(u.code); return s; }); }}>
            {kids.length ? (o ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
          </button>
          <span className="ccm-cay-ic">{iconDonVi(u, kids.length > 0)}</span>
          <span className="ccm-ten">{u.name}</span>
          <span className="ccm-ma">({u.code})</span>
        </div>,
      );
      if (o) walk(kids, d + 1);
    }
  };
  walk(cc.roots, 0);
  return (
    <div className="ccm-the-trang ccm-cay-khung">
      <div className="ccm-cay-tim">
        <div className="ccm-tim"><Search size={15} /><input placeholder="Tìm mã, tên, MST, tên gọi cấp…" value={q} onChange={(e) => setQ(e.target.value)} />{q && <button type="button" onClick={() => setQ('')} title="Xoá ô tìm"><X size={13} /></button>}</div>
        <span className="ccm-pop-o">
          <button type="button" className={`ccm-nut-vuong${hienNgung ? ' on' : ''}`} title="Bộ lọc" onClick={() => setLoc((x) => !x)}><Filter size={16} /></button>
          {loc && (
            <div className="ccm-menu" style={{ minWidth: 230 }}>
              <label className="checkbox ccm-menu-o"><input type="checkbox" checked={hienNgung} onChange={(e) => setHienNgung(e.target.checked)} /> Hiện đơn vị ngừng hoạt động</label>
              <button type="button" onClick={() => { setMo(new Set(cc.units.filter((u) => cc.kids.get(u.code)?.length).map((u) => u.code))); setLoc(false); }}>Mở hết</button>
              <button type="button" onClick={() => { setMo(new Set()); setLoc(false); }}>Thu gọn tất cả</button>
            </div>
          )}
        </span>
      </div>
      {khop && <div className="ccm-dem">{khop.dem ? `${khop.dem} kết quả` : 'Không tìm thấy'}</div>}
      <div className="ccm-cay">{out.length ? out : <div className="ccm-rong">Chưa có đơn vị nào.</div>}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ bảng dùng chung (DataGrid: lọc từng cột, ẩn / hiện cột, Xuất Excel, không phân trang) */

const luc = (d?: string | null) => (d ? new Date(d).toLocaleString('vi-VN', { hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
type Dau = { createdBy?: string; createdAt?: string | null; updatedBy?: string; updatedAt?: string | null };
type Hang = { code: string; name: string; isActive: boolean } & Dau;
/** Một cột: k = khoá, v = giá trị để lọc / sắp xếp / xuất Excel, gt = cách hiện (bỏ trống thì hiện v). */
interface Cot<T> { k: string; ten: string; w?: number; v: (x: T) => string | number; gt?: (x: T) => ReactNode; an?: boolean }
function Bang<T extends Hang>({ rows, cot, onMo, onSua, onXoa, rong, them, khoa, tenXuat }: { rows: T[]; cot: Cot<T>[]; onMo?: (x: T) => void; onSua?: (x: T) => void; onXoa?: (x: T) => void; rong: ReactNode; them?: ReactNode; khoa: string; tenXuat: string }) {
  const [tt, setTt] = useState<'' | 'dung' | 'ngung'>('dung');
  const list = useMemo(() => rows.filter((x) => !tt || (tt === 'dung' ? !ngung(x) : ngung(x))), [rows, tt]);
  const columns: Column<T>[] = [
    ...cot.map((c): Column<T> => ({ key: c.k, header: c.ten, title: c.ten, width: c.w, value: c.v, render: c.gt, hidden: c.an })),
    { key: 'trangThai', header: 'Trạng thái', width: 130, value: (x) => (ngung(x) ? 'Ngừng hoạt động' : 'Đang hoạt động'), render: (x) => <TrangThai x={x} /> },
    { key: 'createdBy', header: 'Người tạo', width: 140, hidden: true, value: (x) => x.createdBy ?? '' },
    { key: 'createdAt', header: 'Ngày tạo', width: 130, hidden: true, value: (x) => x.createdAt ?? '', render: (x) => luc(x.createdAt) },
    { key: 'updatedBy', header: 'Người sửa', width: 140, hidden: true, value: (x) => x.updatedBy ?? '' },
    { key: 'updatedAt', header: 'Ngày sửa', width: 130, hidden: true, value: (x) => x.updatedAt ?? '', render: (x) => luc(x.updatedAt) },
    ...(onSua || onXoa ? [{ key: '_thaoTac', header: 'Thao tác', width: 80, noFilter: true, noSort: true, noExport: true, value: () => '',
      render: (x: T) => <>{onSua && <button type="button" className="ccm-nut-ic" title="Sửa" onClick={(e) => { e.stopPropagation(); onSua(x); }}><Pencil size={15} /></button>}{onXoa && <button type="button" className="ccm-nut-ic do" title="Xoá vĩnh viễn" onClick={(e) => { e.stopPropagation(); onXoa(x); }}><Trash2 size={15} /></button>}</> } as Column<T>] : []),
  ];
  return (
    <>
      <div className="ccm-ds-loc">
        <select className="input" value={tt} onChange={(e) => setTt(e.target.value as typeof tt)} title="Lọc trạng thái"><option value="dung">Đang hoạt động</option><option value="ngung">Ngừng hoạt động</option><option value="">Tất cả trạng thái</option></select>
        {them && <span className="ccm-ds-them">{them}</span>}
      </div>
      {!rows.length ? <div className="ccm-rong">{rong}</div>
        : <DataGrid rows={list} columns={columns} rowKey={(x) => x.code} storageKey={khoa} exportName={tenXuat} onRowDoubleClick={onMo} footerLabel={false} emptyText="Không có dòng nào khớp" maxHeight="calc(100vh - 330px)" />}
    </>
  );
}

/** Đường dẫn theo tên: Công ty TGS / Miền Bắc / Chi nhánh Phú Thọ. */
export const duongTen = (cc: CC, u: DonVi) => cc.pathOf(u).map((x) => x.name).join(' / ');
const tenDonVi = (cc: CC, code: string | null) => { const x = code ? cc.byCode.get(code) : null; return x ? `${x.name} (${x.code})` : ''; };
const duongCua = (cc: CC, code: string | null) => { const x = code ? cc.byCode.get(code) : null; return x ? duongTen(cc, x) : ''; };

function cotDonVi(cc: CC, o: { duong?: boolean; cap?: boolean }): Cot<DonVi>[] {
  return [
    { k: 'code', ten: 'Mã', w: 120, v: (x) => x.code, gt: (x) => <span className="mono">{x.code}</span> },
    { k: 'name', ten: 'Tên', w: 240, v: (x) => x.name, gt: (x) => <><span className="ccm-cay-ic nho">{iconDonVi(x, !!cc.kids.get(x.code)?.length)}</span> {x.name}</> },
    { k: 'levelLabel', ten: 'Tên gọi cấp', w: 120, v: (x) => x.levelLabel || '', gt: tenCap },
    { k: 'level', ten: 'Cấp', w: 60, v: (x) => x.level, an: !o.cap },
    { k: 'path', ten: 'Đường dẫn', w: 340, v: (x) => duongTen(cc, x), gt: (x) => <span className="muted">{duongTen(cc, x)}</span>, an: !o.duong },
    { k: 'taxUsed', ten: 'MST dùng', w: 150, v: (x) => x.taxUsed, gt: (x) => <span className="mono">{x.taxUsed}{x.taxFrom && <span className="muted" title={`Kế thừa từ ${x.taxFrom}`}> ↑</span>}</span> },
    { k: 'companyName', ten: 'Tên in chứng từ', w: 220, v: (x) => x.companyName, an: true },
    { k: 'address', ten: 'Địa chỉ', w: 220, v: (x) => x.address, an: true },
    { k: 'phone', ten: 'Điện thoại', w: 110, v: (x) => x.phone, an: true },
    { k: 'kho', ten: 'Số phân kho', w: 90, v: (x) => (cc.khoCua.get(x.code) ?? []).filter((w) => !ngung(w)).length },
    { k: 'note', ten: 'Ghi chú', w: 200, v: (x) => x.note, an: true },
  ];
}
function cotKho(cc: CC, thuoc: boolean): Cot<PhanKho>[] {
  return [
    { k: 'code', ten: 'Mã phân kho', w: 130, v: (x) => x.code, gt: (x) => <span className="mono">{x.code}</span> },
    { k: 'name', ten: 'Tên phân kho', w: 240, v: (x) => x.name, gt: (x) => <>{x.name}{x.isDefault && <span className="ccm-mac-dinh">Mặc định</span>}</> },
    { k: 'branch', ten: 'Thuộc đơn vị', w: 240, v: (x) => tenDonVi(cc, x.branchCode), an: !thuoc },
    { k: 'path', ten: 'Đường dẫn', w: 340, v: (x) => duongCua(cc, x.branchCode), gt: (x) => <span className="muted">{duongCua(cc, x.branchCode)}</span>, an: !thuoc },
    { k: 'type', ten: 'Loại kho', w: 170, v: (x) => x.typeName || x.typeCode },
    { k: 'address', ten: 'Địa chỉ', w: 220, v: (x) => x.address ?? '', an: true },
    { k: 'note', ten: 'Ghi chú', w: 200, v: (x) => x.note ?? '', an: true },
  ];
}
function cotBoPhan(cc: CC, thuoc: boolean): Cot<BoPhan>[] {
  return [
    { k: 'code', ten: 'Mã bộ phận', w: 140, v: (x) => x.code, gt: (x) => <span className="mono">{x.code}</span> },
    { k: 'name', ten: 'Tên bộ phận', w: 260, v: (x) => x.name, gt: (x) => <span style={{ paddingLeft: cc.bpSau(x) * 18 }}>{cc.bpSau(x) > 0 && <span className="muted">└ </span>}{x.name}{cc.byCode.get(x.branchCode ?? '')?.departmentCode === x.code && <span className="ccm-mac-dinh">Mặc định</span>}</span> },
    { k: 'parent', ten: 'Bộ phận cha', w: 200, v: (x) => { const p = cc.chaBp(x); return p ? `${p.name} (${p.code})` : ''; } },
    { k: 'branch', ten: 'Thuộc đơn vị', w: 240, v: (x) => tenDonVi(cc, x.branchCode), gt: (x) => tenDonVi(cc, x.branchCode) || <span className="muted">Chưa gắn đơn vị</span>, an: !thuoc },
    { k: 'path', ten: 'Đường dẫn', w: 340, v: (x) => duongCua(cc, x.branchCode), gt: (x) => <span className="muted">{duongCua(cc, x.branchCode)}</span>, an: !thuoc },
    { k: 'note', ten: 'Ghi chú', w: 200, v: (x) => x.note ?? '', an: true },
  ];
}

/* ------------------------------------------------------------------ chi tiết */

type Tab = 'tt' | 'con' | 'kho' | 'bp' | 'ls';

function ChiTiet({ cc, u, canWrite, onSel, mo }: { cc: CC; u: DonVi; canWrite: boolean; onSel: (c: string) => void; mo: (h: HopThoai) => void }) {
  const [tab, setTab] = useState<Tab>('tt');
  const [ca, setCa] = useState<{ con: boolean; kho: boolean; bp: 'rieng' | 'sodo' | 'nhanh' }>({ con: false, kho: false, bp: 'rieng' });
  const [menu, setMenu] = useState(false);
  const truc = cc.kids.get(u.code) ?? [];
  const nhanh = useMemo(() => cc.under(u.code), [cc, u.code]);
  const khoRieng = cc.khoCua.get(u.code) ?? [];
  const bpRieng = cc.bpCua.get(u.code) ?? [];
  const khoNhanh = useMemo(() => [...khoRieng, ...nhanh.flatMap((x) => cc.khoCua.get(x.code) ?? [])], [cc, nhanh, khoRieng]);
  const bpNhanh = useMemo(() => [...bpRieng, ...nhanh.flatMap((x) => cc.bpCua.get(x.code) ?? [])], [cc, nhanh, bpRieng]);
  const dem = (l: { code: string; isActive: boolean }[]) => l.filter((x) => !ngung(x)).length;
  const p = u.parentCode ? cc.byCode.get(u.parentCode) : null;
  const duong = cc.pathOf(u);
  const tenDv = (code: string | null) => { const x = code ? cc.byCode.get(code) : null; return x ? `${x.name} (${x.code})` : ''; };
  const dong = (nhan: string, gt: ReactNode, tip?: string) => <tr><th>{nhan}{tip && <Hoi text={tip} />}</th><td>{gt || <span className="muted">—</span>}</td></tr>;
  const xoa = (key: string, ten: string, ma: string) => mo({ loai: 'xoa', key, ten, ma });
  return (
    <div className="ccm-phai">
      <div className="ccm-the-trang ccm-dau">
        <OIc to>{iconDonVi(u, truc.length > 0)}</OIc>
        <div style={{ minWidth: 0 }}>
          <div className="ccm-tieude">{u.name} <span className="ccm-ma">({u.code})</span> <TrangThai x={u} /></div>
          <div className="ccm-phu">
            <span>{tenCap(u)}</span><span>Cấp {u.level}</span>
            <span>MST: <span className="mono">{u.taxUsed || '—'}</span>{u.taxFrom && <span className="muted"> (theo {u.taxFrom})</span>}</span>
          </div>
          <div className="ccm-duong-dan">{duong.map((x, i) => <span key={x.code}>{i > 0 && <span className="gach">/</span>}<button type="button" className={x.code === u.code ? 'cuoi' : ''} onClick={() => onSel(x.code)} title={x.code}>{x.name}</button></span>)}</div>
        </div>
        <span className="spacer" />
        {canWrite && (
          <span className="ccm-pop-o">
            <button className="btn btn-primary" onClick={() => setMenu((x) => !x)}><Plus size={15} /> Thêm <ChevronDown size={14} /></button>
            {menu && (
              <div className="ccm-menu">
                <button type="button" onClick={() => { setMenu(false); mo({ loai: 'donvi', code: null, cha: u.code }); }}><OIc><Network /></OIc> Đơn vị con của {u.code}</button>
                <button type="button" onClick={() => { setMenu(false); mo({ loai: 'kho', code: null, donVi: u.code }); }}><OIc><WarehouseIcon /></OIc> Phân kho của {u.code}</button>
                <button type="button" onClick={() => { setMenu(false); mo({ loai: 'bophan', code: null, donVi: u.code }); }}><OIc><Users /></OIc> Bộ phận của {u.code}</button>
              </div>
            )}
          </span>
        )}
        {canWrite && <button className="btn" onClick={() => mo({ loai: 'donvi', code: u.code, cha: null })}><Pencil size={15} /> Chỉnh sửa</button>}
        {canWrite && <button className="btn ccx-nut" onClick={() => xoa(`u:${u.code}`, u.name, u.code)} title="Xoá vĩnh viễn đơn vị và mọi thứ bên trong (xem trước ảnh hưởng)"><Trash2 size={15} /> Xoá</button>}
      </div>

      <div className="ccm-tk-hang">
        {([[<Network key="i" />, 'Đơn vị con trực tiếp', dem(truc), 'con'], [<Layers key="i" />, 'Đơn vị toàn nhánh', dem(nhanh), 'con'], [<WarehouseIcon key="i" />, 'Phân kho riêng', dem(khoRieng), 'kho'], [<Users key="i" />, 'Bộ phận riêng', dem(bpRieng), 'bp']] as const).map(([ic, ten, so, t]) => (
          <button key={ten} type="button" className="ccm-the-trang ccm-tk" onClick={() => setTab(t)}><OIc>{ic}</OIc><div><div className="ccm-tk-ten">{ten}</div><div className="ccm-tk-so">{so}</div></div></button>
        ))}
      </div>

      <div className="ccm-the-trang ccm-noi-dung">
        <div className="ccm-tabs">
          {([['tt', 'Thông tin', <Info key="i" size={16} />], ['con', 'Đơn vị con', <Network key="i" size={16} />], ['kho', 'Phân kho', <WarehouseIcon key="i" size={16} />], ['bp', 'Bộ phận', <Users key="i" size={16} />], ['ls', 'Lịch sử', <History key="i" size={16} />]] as const).map(([t, nhan, ic]) => (
            <button key={t} type="button" className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{ic} {nhan}</button>
          ))}
        </div>
        <div className="ccm-than">
          {tab === 'tt' && (
            <div className="ccm-tq">
              <div className="ccm-khoi">
                <div className="ccm-khoi-dau"><Info size={16} /> Thông tin đơn vị</div>
                <table className="ccm-tt-bang"><tbody>
                  {dong('Mã', <span className="mono">{u.code}</span>)}
                  {dong('Tên', u.name)}
                  {dong('Tên gọi cấp', tenCap(u), 'Chỉ là tên gọi (Công ty, Miền, Chi nhánh, Tỉnh, Cửa hàng…) — mọi cấp đều là đơn vị như nhau')}
                  {dong('Thuộc', p ? <button type="button" className="ccm-link" onClick={() => onSel(p.code)}>{p.name} ({p.code})</button> : 'Cấp cao nhất')}
                  {dong('Đường dẫn', <span className="mono">{u.path}</span>)}
                  {dong('MST tự khai', <span className="mono">{u.taxCode}</span>, 'Trống = dùng MST của cấp gần nhất có khai')}
                  {dong('MST dùng trên chứng từ', u.taxUsed ? <><span className="mono">{u.taxUsed}</span>{u.taxFrom && <span className="muted"> — kế thừa từ {tenDv(u.taxFrom)}</span>}</> : '')}
                  {dong('Tên in chứng từ', u.companyName)}
                  {dong('Địa chỉ', u.address)}
                  {dong('Điện thoại', u.phone)}
                  {dong('Bộ phận mặc định', u.departmentCode ? `${u.departmentCode} · ${cc.departments.find((d) => d.code === u.departmentCode)?.name ?? ''}` : '', 'Chứng từ của đơn vị chưa chọn bộ phận thì tính vào bộ phận này')}
                  {dong('Trạng thái', <TrangThai x={u} />)}
                </tbody></table>
              </div>
              <div className="ccm-khoi">
                <div className="ccm-khoi-dau"><Layers size={16} /> Bên trong</div>
                {([[<Network key="i" />, 'Đơn vị con trực tiếp', dem(truc)], [<Layers key="i" />, 'Đơn vị toàn nhánh', dem(nhanh)], [<WarehouseIcon key="i" />, 'Phân kho riêng / toàn nhánh', `${dem(khoRieng)} / ${dem(khoNhanh)}`], [<Users key="i" />, 'Bộ phận riêng / toàn nhánh', `${dem(bpRieng)} / ${dem(bpNhanh)}`]] as const).map(([ic, ten, so]) => (
                  <div key={ten} className="ccm-tk-dong"><OIc>{ic}</OIc> <span>{ten}</span><b>{so}</b></div>
                ))}
              </div>
              {u.note && <div className="ccm-khoi ccm-ca-dong"><div className="ccm-khoi-dau"><FileText size={16} /> Ghi chú</div><div className="ccm-ghichu">{u.note}</div></div>}
            </div>
          )}
          {tab === 'con' && (
            <>
              <div className="ccm-chip-hang">
                <button type="button" className={`ccm-chip${!ca.con ? ' on' : ''}`} onClick={() => setCa({ ...ca, con: false })}><Network size={15} /> Trực tiếp ({dem(truc)})</button>
                <button type="button" className={`ccm-chip${ca.con ? ' on' : ''}`} onClick={() => setCa({ ...ca, con: true })}><Layers size={15} /> Toàn nhánh ({dem(nhanh)})</button>
              </div>
              <Bang key={String(ca.con)} rows={ca.con ? nhanh : truc} onMo={(x) => onSel(x.code)} onSua={canWrite ? (x) => mo({ loai: 'donvi', code: x.code, cha: null }) : undefined} onXoa={canWrite ? (x) => xoa(`u:${x.code}`, x.name, x.code) : undefined}
                them={canWrite && <button type="button" className="btn btn-sm ccm-nut-them" onClick={() => mo({ loai: 'donvi', code: null, cha: u.code })}><Plus size={14} /> Thêm đơn vị con</button>}
                khoa="co-cau-con" tenXuat={`Don-vi-con-${u.code}`}
                cot={cotDonVi(cc, { duong: ca.con })}
                rong={<>Chưa có đơn vị con.</>} />
            </>
          )}
          {tab === 'kho' && (
            <>
              <div className="ccm-chip-hang">
                <button type="button" className={`ccm-chip${!ca.kho ? ' on' : ''}`} onClick={() => setCa({ ...ca, kho: false })}><WarehouseIcon size={15} /> Phân kho của {u.code} ({dem(khoRieng)})</button>
                <button type="button" className={`ccm-chip${ca.kho ? ' on' : ''}`} onClick={() => setCa({ ...ca, kho: true })}><Layers size={15} /> Toàn nhánh ({dem(khoNhanh)})</button>
              </div>
              <Bang key={String(ca.kho)} rows={ca.kho ? khoNhanh : khoRieng} onSua={canWrite ? (x) => mo({ loai: 'kho', code: x.code, donVi: null }) : undefined} onXoa={canWrite ? (x) => xoa(`w:${x.code}`, x.name, x.code) : undefined}
                them={canWrite && <button type="button" className="btn btn-sm ccm-nut-them" onClick={() => mo({ loai: 'kho', code: null, donVi: u.code })}><Plus size={14} /> Thêm phân kho</button>}
                khoa="co-cau-kho" tenXuat={`Phan-kho-${u.code}`}
                cot={cotKho(cc, ca.kho)}
                rong={<>{u.name} chưa có phân kho riêng.</>} />
            </>
          )}
          {tab === 'bp' && (
            <>
              <div className="ccm-chip-hang">
                <button type="button" className={`ccm-chip${ca.bp === 'rieng' ? ' on' : ''}`} onClick={() => setCa({ ...ca, bp: 'rieng' })}><Users size={15} /> Bộ phận của {u.code} ({dem(bpRieng)})</button>
                <button type="button" className={`ccm-chip${ca.bp === 'sodo' ? ' on' : ''}`} onClick={() => setCa({ ...ca, bp: 'sodo' })}><Network size={15} /> Sơ đồ bộ phận</button>
                <button type="button" className={`ccm-chip${ca.bp === 'nhanh' ? ' on' : ''}`} onClick={() => setCa({ ...ca, bp: 'nhanh' })}><Layers size={15} /> Toàn nhánh ({dem(bpNhanh)})</button>
              </div>
              {ca.bp === 'sodo'
                ? <SoDoBoPhan cc={cc} u={u} onMo={canWrite ? (x) => mo({ loai: 'bophan', code: x.code, donVi: null }) : undefined} onThem={canWrite ? (cha) => mo({ loai: 'bophan', code: null, donVi: u.code, cha }) : undefined} />
                : <Bang key={ca.bp} rows={cc.xepCay(ca.bp === 'nhanh' ? bpNhanh : bpRieng)} onMo={canWrite ? (x) => mo({ loai: 'bophan', code: x.code, donVi: null }) : undefined} onSua={canWrite ? (x) => mo({ loai: 'bophan', code: x.code, donVi: null }) : undefined} onXoa={canWrite ? (x) => xoa(`d:${x.code}`, x.name, x.code) : undefined}
                  them={canWrite && <button type="button" className="btn btn-sm ccm-nut-them" onClick={() => mo({ loai: 'bophan', code: null, donVi: u.code })}><Plus size={14} /> Thêm bộ phận</button>}
                  khoa="co-cau-bp" tenXuat={`Bo-phan-${u.code}`}
                  cot={cotBoPhan(cc, ca.bp === 'nhanh')}
                  rong={<>{u.name} chưa có bộ phận.</>} />}
            </>
          )}
          {tab === 'ls' && <LichSu u={u} />}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ sơ đồ bộ phận trong một đơn vị */

/**
 * Vẽ như sơ đồ tổ chức trên Excel: đơn vị ở đỉnh, chuỗi một con đi thẳng xuống, các nhánh trải ngang,
 * lớp cuối (bộ phận không có con) xếp dọc dưới cha. Màu nhạt dần theo cấp.
 */
function SoDoBoPhan({ cc, u, onMo, onThem }: { cc: CC; u: DonVi; onMo?: (d: BoPhan) => void; onThem?: (cha: string | null) => void }) {
  const [hienNgung, setHienNgung] = useState(false);
  const [to, setTo] = useState(false);
  const khung = useRef<HTMLDivElement>(null);
  // Sơ đồ rộng hơn khung: cuộn sao cho đỉnh (đơn vị) nằm giữa.
  useEffect(() => { const k = khung.current; if (k) k.scrollLeft = Math.max(0, (k.scrollWidth - k.clientWidth) / 2); }, [u.code, hienNgung, to]);
  const ds = (cc.bpCua.get(u.code) ?? []).filter((x) => hienNgung || !ngung(x));
  const co = new Set(ds.map((d) => d.code));
  const con = (c: string) => (cc.bpCon.get(c) ?? []).filter((x) => co.has(x.code));
  const goc = cc.xepCay(ds).filter((d) => { const p = cc.chaBp(d); return !p || !co.has(p.code); });
  const macDinh = u.departmentCode;
  const o = (d: BoPhan, lv: number) => (
    <div role="button" tabIndex={0} className={`ccb-o lv${Math.min(lv, 3)}${ngung(d) ? ' muted' : ''}`} onClick={() => onMo?.(d)} onKeyDown={(e) => { if (e.key === 'Enter') onMo?.(d); }}
      title={`${d.name} (${d.code})${onMo ? ' · bấm để sửa' : ''}`}>
      <span className="ccb-ten">{d.name}</span>
      <span className="ccb-ma">{d.code}{d.code === macDinh && ' · mặc định'}</span>
      {onThem && <button type="button" className="ccb-them" title={`Thêm bộ phận con của ${d.name}`} onClick={(e) => { e.stopPropagation(); onThem(d.code); }}><Plus size={12} /></button>}
    </div>
  );
  const ngang = (kids: ReactNode[]) => (
    <div className="cc-hrow">
      {kids.map((k, i) => (
        <div key={i} className="cc-hcell">
          {kids.length > 1 && <div className="cc-hline ccs-net" style={{ left: i === 0 ? '50%' : 0, right: i === kids.length - 1 ? '50%' : 0 }} />}
          <div className="cc-hstem ccs-net" />
          {k}
        </div>
      ))}
    </div>
  );
  const ve = (d: BoPhan, lv: number, n = 0): ReactNode => {
    const k = n > 30 ? [] : con(d.code);
    if (!k.length) return o(d, lv);
    // Lớp cuối: các con đều không có con → xếp dọc dưới cha.
    if (k.every((x) => !con(x.code).length)) {
      return <div className="ccb-doc">{o(d, lv)}<ul className="ccb-la">{k.map((x) => <li key={x.code}>{o(x, lv + 1)}</li>)}</ul></div>;
    }
    return <><div className="cc-center">{o(d, lv)}</div><div className="cc-stem ccs-net" />{ngang(k.map((x) => ve(x, lv + 1, n + 1)))}</>;
  };
  return (
    <div className={`ccb${to ? ' ccb-full' : ''}`}>
      <div className="ccb-loc">
        <span className="muted">Bấm một ô để sửa, nút + để thêm bộ phận con. Bộ phận cha – con chỉ trong cùng đơn vị.</span>
        <label className="checkbox ccm-menu-o" style={{ marginLeft: 'auto' }}><input type="checkbox" checked={hienNgung} onChange={(e) => setHienNgung(e.target.checked)} /> Hiện ngừng hoạt động</label>
        {onThem && <button type="button" className="btn btn-sm ccm-nut-them" onClick={() => onThem(null)}><Plus size={14} /> Thêm bộ phận</button>}
        <button type="button" className="btn btn-sm" onClick={() => setTo((x) => !x)} title={to ? 'Thu về khung chi tiết' : 'Xem sơ đồ toàn màn hình'}>{to ? <><X size={14} /> Thu nhỏ</> : 'Toàn màn hình'}</button>
      </div>
      {to && <div className="ccb-tieude">Sơ đồ bộ phận · {u.name} ({u.code})</div>}
      {!ds.length ? <div className="ccm-rong">{u.name} chưa có bộ phận.</div> : (
        <div ref={khung} className="cc-chart ccs-khung ccb-khung">
          <div className="cc-chart-in">
            <div className="cc-chart-root">
              <div className="cc-center"><div className="ccb-o goc"><span className="ccb-ten">{u.name}</span><span className="ccb-ma">{tenCap(u)} · {u.code}</span></div></div>
              <div className="cc-stem ccs-net" />
              {ngang(goc.map((d) => ve(d, 0)))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ lịch sử */

interface DoiCha { id: string; at: string; data: { code: string; tu: string | null; den: string | null; duongDanCu: string; apDung: string | null; nguoi: string } }
interface SuaDong { at: string; by: string; action: string; changes: string[] }
function LichSu({ u }: { u: DonVi }) {
  const dc = useQuery({ queryKey: ['co-cau-doi-cha', u.code], queryFn: () => api.get<DoiCha[]>('/api/v1/co-cau/doi-cha', { code: u.code }) });
  const sua = useQuery({ queryKey: ['co-cau-history', 'branch', u.code], queryFn: () => api.get<SuaDong[]>('/api/v1/co-cau/history', { type: 'branch', code: u.code }) });
  const t = (iso: string) => new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <div className="ccm-khoi-dau"><History size={16} /> Đổi cha (thuộc đơn vị nào)</div>
        {dc.isLoading ? <Loading /> : !(dc.data ?? []).length ? <div className="muted" style={{ fontSize: 13 }}>Chưa đổi cha lần nào.</div> : (
          <table className="grid cc-log"><thead><tr><th>Thời gian</th><th>Từ</th><th>Sang</th><th>Đường dẫn cũ</th><th>Áp dụng từ</th><th>Người làm</th></tr></thead>
            <tbody>{dc.data!.map((x) => <tr key={x.id}><td className="mono">{t(x.at)}</td><td>{x.data.tu ?? '(gốc)'}</td><td>{x.data.den ?? '(gốc)'}</td><td className="mono muted">{x.data.duongDanCu}</td><td>{x.data.apDung ?? 'ngay'}</td><td>{x.data.nguoi}</td></tr>)}</tbody></table>
        )}
      </div>
      <div>
        <div className="ccm-khoi-dau"><Pencil size={16} /> Sửa thông tin</div>
        {sua.isLoading ? <Loading /> : !(sua.data ?? []).length ? <div className="muted" style={{ fontSize: 13 }}>Chưa có thay đổi.</div> : (
          <table className="grid cc-log"><thead><tr><th>Thời gian</th><th>Người làm</th><th>Việc</th><th>Thay đổi</th></tr></thead>
            <tbody>{sua.data!.map((r, i) => <tr key={i}><td className="mono">{t(r.at)}</td><td>{r.by}</td><td>{r.action}</td><td>{r.changes.map((c, j) => <div key={j}>{c}</div>)}</td></tr>)}</tbody></table>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ hộp thoại đơn vị */

const GOI_Y_CAP = ['Công ty', 'Miền', 'Chi nhánh', 'Tỉnh', 'Cửa hàng', 'Kho trung gian', 'Văn phòng'];

function DonViModal({ cc, code, cha, onClose, onSaved }: { cc: CC; code: string | null; cha: string | null; onClose: () => void; onSaved: (code: string, text: string, tiep: boolean) => void }) {
  const lamMoi = useLamMoi();
  const u = code ? cc.byCode.get(code) ?? null : null;
  const moi = () => ({ code: '', name: '', parentCode: cha ?? '', levelLabel: '', taxCode: '', companyName: '', address: '', phone: '', note: '', isActive: true, departmentName: '', departmentCode: '', validFrom: homNay() });
  const [f, setF] = useState(() => (u ? { code: u.code, name: u.name, parentCode: u.parentCode ?? '', levelLabel: u.levelLabel, taxCode: u.taxCode, companyName: u.companyName, address: u.address, phone: u.phone, note: u.note, isActive: u.isActive, departmentName: '', departmentCode: u.departmentCode ?? '', validFrom: homNay() } : moi()));
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const [daBam, setDaBam] = useState(false);
  const cam = useMemo(() => new Set(u ? [u.code, ...cc.under(u.code).map((x) => x.code)] : []), [cc, u]);
  const chaList = useMemo(() => cc.units.filter((x) => !cam.has(x.code) && !ngung(x)).map((x) => ({ code: x.code, name: duongTen(cc, x) })), [cc, cam]);
  const chaU = f.parentCode ? cc.byCode.get(f.parentCode) : null;
  const doiCha = !!u && (f.parentCode || null) !== (u.parentCode || null);
  const doiMst = !!u && f.taxCode.trim() !== u.taxCode.trim();
  const maMoi = f.code.trim();
  const trungMa = !!maMoi && (!u || maMoi.toLowerCase() !== u.code.toLowerCase()) && cc.ma.has(maMoi.toLowerCase());
  // MST cũ chưa chuẩn (dữ liệu cũ) không chặn khi không đổi.
  const mstSai = !!f.taxCode.trim() && !MST_OK.test(f.taxCode.trim()) && (!u || f.taxCode.trim() !== u.taxCode.trim());
  const loi: Record<string, string> = {};
  if (daBam) {
    if (!maMoi) loi.code = 'Nhập mã'; else if (trungMa) loi.code = `Mã đã dùng cho ${cc.ma.get(maMoi.toLowerCase())}`;
    if (!f.name.trim()) loi.name = 'Nhập tên';
  }
  const luu = useMutation({
    mutationFn: async () => {
      const body = { name: f.name.trim(), levelLabel: f.levelLabel.trim(), taxCode: f.taxCode.trim(), companyName: f.companyName, address: f.address, phone: f.phone, note: f.note };
      if (!u) { await api.post('/api/v1/co-cau/units', { ...body, code: maMoi, parentCode: f.parentCode || null, ...(f.departmentName.trim() ? { departmentName: f.departmentName.trim() } : {}) }); return maMoi; }
      await api.patch(`/api/v1/co-cau/units/${encodeURIComponent(u.code)}`, {
        ...body, isActive: f.isActive, departmentCode: f.departmentCode || null, ...(maMoi !== u.code ? { newCode: maMoi } : {}),
        ...(doiCha ? { parentCode: f.parentCode || null } : {}), ...(doiCha || doiMst ? { validFrom: f.validFrom || null } : {}),
      });
      return maMoi;
    },
  });
  const ghi = (tiep: boolean) => {
    setDaBam(true);
    if (!maMoi || !f.name.trim() || trungMa || mstSai) return;
    luu.mutate(undefined, {
      onSuccess: (ma) => {
        lamMoi();
        onSaved(ma, `Đã lưu đơn vị ${ma} · ${f.name.trim()}`, tiep);
        if (tiep) { setF({ ...moi(), parentCode: f.parentCode, levelLabel: f.levelLabel }); setDaBam(false); }
      },
    });
  };
  const bpList = u ? (cc.bpCua.get(u.code) ?? []).map((d) => ({ code: d.code, name: d.name })) : [];
  return (
    <Modal title={<span className="ccm-md-dau"><OIc>{u ? iconDonVi(u, !!cc.kids.get(u.code)?.length) : <Network />}</OIc><span><span className="ccm-md-ten">{u ? `Sửa đơn vị ${u.code}` : 'Thêm đơn vị'}</span><span className="ccm-md-mo">{chaU ? `Thuộc ${duongTen(cc, chaU)}` : 'Cấp cao nhất'}</span></span></span>}
      onClose={onClose} helpKey="so-do-to-chuc"
      footer={<>
        <button className="btn" onClick={onClose}>Huỷ</button>
        <button className="btn btn-primary" disabled={luu.isPending} onClick={() => ghi(false)}>Lưu</button>
        {!u && <button className="btn" disabled={luu.isPending} onClick={() => ghi(true)}><Plus size={14} /> Lưu và thêm tiếp</button>}
      </>}>
      <Field label="Mã (*)" error={loi.code} tip="Không trùng với mã đơn vị, phân kho, bộ phận khác"><input className="input mono" value={f.code} maxLength={32} autoFocus={!u} onChange={(e) => set({ code: e.target.value })} /></Field>
      <Field label="Tên (*)" error={loi.name}><input className="input" value={f.name} autoFocus={!!u} onChange={(e) => set({ name: e.target.value })} /></Field>
      <Field label="Thuộc" full tip="Đơn vị cha. Trống = cấp cao nhất">
        <ListPicker items={chaList} value={f.parentCode} onChange={(c) => set({ parentCode: c })} placeholder="Tìm và chọn đơn vị cha (trống = cấp cao nhất)" />
      </Field>
      <Field label="Tên gọi cấp" tip="Chỉ là tên gọi để dễ nhìn: Công ty, Miền, Chi nhánh, Tỉnh, Cửa hàng… Trống = Cơ cấu cấp N">
        <input className="input" list="ccm-goi-y-cap" value={f.levelLabel} placeholder={`Cơ cấu cấp ${(chaU?.level ?? 0) + 1}`} onChange={(e) => set({ levelLabel: e.target.value })} />
        <datalist id="ccm-goi-y-cap">{GOI_Y_CAP.map((x) => <option key={x} value={x} />)}</datalist>
      </Field>
      {u ? <Field label=" "><label className="checkbox"><input type="checkbox" checked={f.isActive} onChange={(e) => set({ isActive: e.target.checked })} /> Đang hoạt động</label></Field> : <div />}
      <TaxCodeField label="MST" full value={f.taxCode} showExisting={false} autoWhenEmpty={false}
        onChange={(v) => set({ taxCode: v.replace(/[^0-9-]/g, '') })}
        onFill={(t, overwrite) => setF((x) => ({ ...x, companyName: overwrite || !x.companyName.trim() ? t.name || x.companyName : x.companyName, address: overwrite || !x.address.trim() ? t.address || x.address : x.address }))} />
      <div className="ccm-goi full">{mstSai ? <span className="o-loi-chu">MST gồm 10 số hoặc 10 số-3 số</span> : f.taxCode.trim() ? 'Đơn vị dùng MST này; đơn vị con không tự khai sẽ lấy theo.' : chaU?.taxUsed ? <>Để trống: dùng MST <b className="mono">{chaU.taxUsed}</b> của {cc.byCode.get(chaU.taxFrom ?? chaU.code)?.name}.</> : 'Để trống: chưa có cấp trên nào khai MST.'}</div>
      <Field label="Tên in chứng từ" full tip="Tên đơn vị in trên hoá đơn, phiếu"><input className="input" value={f.companyName} onChange={(e) => set({ companyName: e.target.value })} /></Field>
      <Field label="Địa chỉ" full><input className="input" value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
      <Field label="Điện thoại"><input className="input" value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
      {!u
        ? <Field label="Tên bộ phận mặc định" tip="Tạo đơn vị là tự có một bộ phận (vd Kế toán). Trống = theo tên đơn vị"><input className="input" value={f.departmentName} placeholder={f.name || 'Theo tên đơn vị'} onChange={(e) => set({ departmentName: e.target.value })} /></Field>
        : <Field label="Bộ phận mặc định" tip="Chứng từ của đơn vị chưa chọn bộ phận thì tính vào bộ phận này"><ListPicker items={bpList} value={f.departmentCode} onChange={(c) => set({ departmentCode: c })} /></Field>}
      {(doiCha || doiMst) && (
        <Field label="Áp dụng từ ngày" tip="Chứng từ từ ngày này theo nơi thuộc / MST mới; trước đó giữ như cũ"><input className="input" type="date" value={f.validFrom} onChange={(e) => set({ validFrom: e.target.value })} /></Field>
      )}
      <Field label="Ghi chú" full><input className="input" value={f.note} onChange={(e) => set({ note: e.target.value })} /></Field>
      {luu.error && <div className="alert alert-bad full">{errorText(luu.error)}</div>}
    </Modal>
  );
}

/* ------------------------------------------------------------------ hộp thoại phân kho / bộ phận */

function chonDonVi(cc: CC) { return cc.units.filter((x) => !ngung(x)).map((x) => ({ code: x.code, name: duongTen(cc, x) })); }

function PhanKhoModal({ cc, code, donVi, onClose, onSaved }: { cc: CC; code: string | null; donVi: string | null; onClose: () => void; onSaved: (text: string) => void }) {
  const lamMoi = useLamMoi();
  const w = code ? cc.warehouses.find((x) => x.code === code) ?? null : null;
  const [f, setF] = useState({ code: w?.code ?? '', name: w?.name ?? '', branchCode: w?.branchCode ?? donVi ?? '', typeCode: w?.typeCode || 'KHH', isDefault: w?.isDefault ?? false, address: w?.address ?? '', note: w?.note ?? '', isActive: w?.isActive ?? true });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const types = (useWarehouseTypes().data?.types ?? []).filter((t) => t.isActive || t.code === f.typeCode);
  const [themLoai, setThemLoai] = useState<string | null>(null);
  const [daBam, setDaBam] = useState(false);
  const items = useMemo(() => chonDonVi(cc), [cc]);
  const trung = !w && !!f.code.trim() && cc.ma.has(f.code.trim().toLowerCase());
  const loi: Record<string, string> = {};
  if (daBam) {
    if (!f.code.trim()) loi.code = 'Nhập mã'; else if (trung) loi.code = `Mã đã dùng cho ${cc.ma.get(f.code.trim().toLowerCase())}`;
    if (!f.name.trim()) loi.name = 'Nhập tên';
    if (!f.branchCode) loi.branchCode = 'Chọn đơn vị';
  }
  const luu = useMutation({
    mutationFn: () => {
      const body = { branchCode: f.branchCode, name: f.name.trim(), typeCode: f.typeCode || 'KHH', isDefault: f.isDefault, address: f.address, note: f.note, isActive: f.isActive };
      return w ? api.patch(`/api/v1/warehouses/${encodeURIComponent(w.code)}`, body) : api.post('/api/v1/warehouses', { ...body, code: f.code.trim() });
    },
    onSuccess: () => { lamMoi(); onSaved(`Đã lưu phân kho ${f.code.trim()} · ${f.name.trim()}`); },
  });
  const ok = () => { setDaBam(true); if (f.code.trim() && f.name.trim() && f.branchCode && !trung) luu.mutate(); };
  return (
    <Modal title={<span className="ccm-md-dau"><OIc><WarehouseIcon /></OIc><span><span className="ccm-md-ten">{w ? `Sửa phân kho ${w.code}` : 'Thêm phân kho'}</span><span className="ccm-md-mo">{f.branchCode ? `Thuộc ${duongCua(cc, f.branchCode) || f.branchCode}` : 'Chọn đơn vị sở hữu'}</span></span></span>}
      onClose={onClose} helpKey="so-do-to-chuc" footer={<><button className="btn" onClick={onClose}>Huỷ</button><button className="btn btn-primary" disabled={luu.isPending} onClick={ok}>Lưu</button></>}>
      <Field label="Mã phân kho (*)" error={loi.code} tip="Tối đa 12 ký tự, không trùng mã khác"><input className="input mono" value={f.code} maxLength={12} disabled={!!w} autoFocus={!w} onChange={(e) => set({ code: e.target.value })} /></Field>
      <Field label="Tên phân kho (*)" error={loi.name}><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
      <Field label="Thuộc đơn vị (*)" full error={loi.branchCode}><ListPicker items={items} value={f.branchCode} onChange={(c) => set({ branchCode: c })} placeholder="Tìm và chọn đơn vị" /></Field>
      <Field label="Loại kho (*)" tip="Loại quyết định phân kho dùng cho nghiệp vụ nào (nhập mua, bán, trả lại…)">
        <ListPicker items={types.map((t) => ({ code: t.code, name: t.name, hint: t.purpose }))} value={f.typeCode} onChange={(c) => set({ typeCode: c || 'KHH' })} onAdd={(t) => setThemLoai(t)} addLabel="Thêm loại kho" />
        {themLoai !== null && <LoaiKhoForm value={{ isNew: true, name: themLoai }} onClose={() => setThemLoai(null)} onSaved={(c) => set({ typeCode: c })} />}
      </Field>
      <Field label=" "><label className="checkbox"><input type="checkbox" checked={f.isDefault} onChange={(e) => set({ isDefault: e.target.checked })} /> Phân kho mặc định<Hoi text="Nhận các dòng nhập xuất không ghi mã kho của đơn vị" /></label></Field>
      <Field label="Địa chỉ" full><input className="input" value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
      <Field label="Ghi chú" full><input className="input" value={f.note} onChange={(e) => set({ note: e.target.value })} /></Field>
      {w && <Field label=" "><label className="checkbox"><input type="checkbox" checked={f.isActive} onChange={(e) => set({ isActive: e.target.checked })} /> Đang hoạt động</label></Field>}
      {luu.error && <div className="alert alert-bad full">{errorText(luu.error)}</div>}
    </Modal>
  );
}

function BoPhanModal({ cc, code, donVi, cha, onClose, onSaved }: { cc: CC; code: string | null; donVi: string | null; cha: string | null; onClose: () => void; onSaved: (text: string) => void }) {
  const lamMoi = useLamMoi();
  const d = code ? cc.departments.find((x) => x.code === code) ?? null : null;
  const [f, setF] = useState({ code: d?.code ?? '', name: d?.name ?? '', branchCode: d?.branchCode ?? donVi ?? '', parentCode: (d ? cc.chaBp(d)?.code : cha) ?? '', note: d?.note ?? '', isActive: d?.isActive ?? true });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const [daBam, setDaBam] = useState(false);
  const items = useMemo(() => chonDonVi(cc), [cc]);
  // Bộ phận cha: bộ phận cùng đơn vị, trừ chính nó và các bộ phận con cháu của nó.
  const chaList = useMemo(() => {
    const cam = new Set<string>(); if (d) { const st = [d.code]; while (st.length) { const c = st.pop()!; cam.add(c); for (const x of cc.bpCon.get(c) ?? []) st.push(x.code); } }
    return cc.xepCay((cc.bpCua.get(f.branchCode) ?? []).filter((x) => !cam.has(x.code) && !ngung(x))).map((x) => { const t: string[] = []; for (let y: BoPhan | undefined = x, n = 0; y && n < 30; y = cc.chaBp(y), n++) t.unshift(y.name); return { code: x.code, name: t.join(' / ') }; });
  }, [cc, d, f.branchCode]);
  const trung = !d && !!f.code.trim() && cc.ma.has(f.code.trim().toLowerCase());
  const loi: Record<string, string> = {};
  if (daBam) {
    if (!f.code.trim()) loi.code = 'Nhập mã'; else if (trung) loi.code = `Mã đã dùng cho ${cc.ma.get(f.code.trim().toLowerCase())}`;
    if (!f.name.trim()) loi.name = 'Nhập tên';
    if (!f.branchCode) loi.branchCode = 'Chọn đơn vị';
  }
  const luu = useMutation({
    mutationFn: () => api.put(`/api/v1/co-cau/departments/${encodeURIComponent(f.code.trim())}`, { name: f.name.trim(), branchCode: f.branchCode, parentCode: f.parentCode, note: f.note, isActive: f.isActive }),
    onSuccess: () => { lamMoi(); onSaved(`Đã lưu bộ phận ${f.code.trim()} · ${f.name.trim()}`); },
  });
  const ok = () => { setDaBam(true); if (f.code.trim() && f.name.trim() && f.branchCode && !trung) luu.mutate(); };
  return (
    <Modal title={<span className="ccm-md-dau"><OIc><Users /></OIc><span><span className="ccm-md-ten">{d ? `Sửa bộ phận ${d.code}` : 'Thêm bộ phận'}</span><span className="ccm-md-mo">{f.branchCode ? `Thuộc ${duongCua(cc, f.branchCode) || f.branchCode}` : 'Chọn đơn vị'}</span></span></span>}
      onClose={onClose} helpKey="so-do-to-chuc" footer={<><button className="btn" onClick={onClose}>Huỷ</button><button className="btn btn-primary" disabled={luu.isPending} onClick={ok}>Lưu</button></>}>
      <Field label="Mã bộ phận (*)" error={loi.code}><input className="input mono" value={f.code} maxLength={64} disabled={!!d} autoFocus={!d} onChange={(e) => set({ code: e.target.value })} /></Field>
      <Field label="Tên bộ phận (*)" error={loi.name}><input className="input" value={f.name} placeholder="vd Kế toán, Kinh doanh…" onChange={(e) => set({ name: e.target.value })} /></Field>
      <Field label="Thuộc đơn vị (*)" full error={loi.branchCode}><ListPicker items={items} value={f.branchCode} onChange={(c) => set({ branchCode: c, parentCode: c === f.branchCode ? f.parentCode : '' })} placeholder="Tìm và chọn đơn vị" /></Field>
      <Field label="Thuộc bộ phận" full tip="Không bắt buộc. Chỉ chọn được bộ phận trong cùng đơn vị, ví dụ Kế toán thuế thuộc Kế toán.">
        <ListPicker items={chaList} value={f.parentCode} onChange={(c) => set({ parentCode: c })} placeholder={f.branchCode ? 'Trống = bộ phận cấp cao nhất của đơn vị' : 'Chọn đơn vị trước'} disabled={!f.branchCode} />
      </Field>
      <Field label="Ghi chú" full><input className="input" value={f.note} onChange={(e) => set({ note: e.target.value })} /></Field>
      {d && <Field label=" "><label className="checkbox"><input type="checkbox" checked={f.isActive} onChange={(e) => set({ isActive: e.target.checked })} /> Đang hoạt động</label></Field>}
      {luu.error && <div className="alert alert-bad full">{errorText(luu.error)}</div>}
    </Modal>
  );
}

/* ------------------------------------------------------------------ xoá */

interface XoaKQ { ten: string; dem: { donVi: number; kho: number; boPhan: number }; donVi: string[]; kho: string[]; boPhan: string[]; chan: string[]; daXoa: boolean }
function XoaModal({ cc, hop, onClose, onDone }: { cc: CC; hop: { key: string; ten: string; ma: string }; onClose: () => void; onDone: (text: string, cha: string | null) => void }) {
  const lamMoi = useLamMoi();
  const [go, setGo] = useState('');
  const xem = useQuery({ queryKey: ['co-cau-xoa', hop.key], queryFn: () => api.post<XoaKQ>('/api/v1/co-cau/delete', { key: hop.key, dryRun: true }), gcTime: 0 });
  const cha = hop.key.startsWith('u:') ? cc.byCode.get(hop.ma)?.parentCode ?? null : null;
  const xoa = useMutation({
    mutationFn: () => api.post<XoaKQ>('/api/v1/co-cau/delete', { key: hop.key, dryRun: false }),
    onSuccess: (r) => { lamMoi(); onDone(`Đã xoá vĩnh viễn ${r.ten}: ${r.dem.donVi} đơn vị, ${r.dem.kho} phân kho, ${r.dem.boPhan} bộ phận`, cha); },
  });
  const r = xem.data;
  const dong = (ic: ReactNode, ten: string, list: string[]) => (list.length ? (
    <details className="ccx-dong"><summary><OIc>{ic}</OIc> <b>{list.length}</b> {ten}</summary><div className="ccx-ds">{list.slice(0, 300).map((x) => <div key={x}>{x}</div>)}{list.length > 300 && <div className="muted">… và {list.length - 300} mục nữa</div>}</div></details>
  ) : null);
  return (
    <Modal title={<span className="ccm-md-dau"><span className="ccm-o-ic ccx-ic"><Trash2 /></span><span><span className="ccm-md-ten">Xoá vĩnh viễn {hop.ma}</span><span className="ccm-md-mo">{hop.ten}</span></span></span>}
      onClose={onClose} helpKey="so-do-to-chuc"
      footer={<><button className="btn" onClick={onClose}>Huỷ</button><button className="btn btn-danger" disabled={!r || r.chan.length > 0 || xoa.isPending || go.trim() !== hop.ma} onClick={() => xoa.mutate()}><Trash2 size={14} /> Xoá vĩnh viễn</button></>}>
      <div className="full">
        {xem.isLoading ? <div className="muted">Đang kiểm tra ảnh hưởng…</div> : xem.error ? <div className="alert alert-bad">{errorText(xem.error)}</div> : r && (
          <>
            <div className="ccx-canh">Xoá <b>{r.ten}</b> sẽ xoá luôn mọi thứ dưới đây, <b>không khôi phục được</b>:</div>
            {dong(<Network />, 'đơn vị (gồm chính nó và mọi đơn vị con)', r.donVi)}
            {dong(<WarehouseIcon />, 'phân kho', r.kho)}
            {dong(<Users />, 'bộ phận', r.boPhan)}
            {r.chan.length > 0 ? (
              <div className="alert alert-bad" style={{ marginTop: 10 }}>
                <b>Không xoá được</b> vì đã có dữ liệu phát sinh:
                <ul style={{ margin: '4px 0 0 18px' }}>{r.chan.map((x) => <li key={x}>{x}</li>)}</ul>
                Hãy bỏ tích <b>Đang hoạt động</b> để ngừng dùng thay vì xoá.
              </div>
            ) : (
              <Field label={`Gõ mã ${hop.ma} để xác nhận`} full><input className="input mono" value={go} onChange={(e) => setGo(e.target.value)} placeholder={hop.ma} autoFocus /></Field>
            )}
          </>
        )}
        {xoa.error && <div className="alert alert-bad" style={{ marginTop: 8 }}>{errorText(xoa.error)}</div>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ sơ đồ */

function SoDo({ cc, sel, onChon }: { cc: CC; sel: string | null; onChon: (c: string) => void }) {
  const [goc, setGoc] = useState('');
  const [h, setH] = useState({ kho: true, bp: false, ngung: false });
  const [thu, setThu] = useState<Set<string>>(new Set());
  const [moBp, setMoBp] = useState<Set<string>>(new Set());
  const latBp = (c: string) => setMoBp((s) => { const x = new Set(s); if (x.has(c)) x.delete(c); else x.add(c); return x; });
  const hien = (u: DonVi) => h.ngung || !ngung(u);
  const kidsOf = (c: string) => (cc.kids.get(c) ?? []).filter(hien);
  const lat = (c: string) => setThu((s) => { const x = new Set(s); if (x.has(c)) x.delete(c); else x.add(c); return x; });
  const oDv = (u: DonVi) => {
    const kids = kidsOf(u.code);
    const so = kids.length + (h.kho ? (cc.khoCua.get(u.code) ?? []).length : 0) + (h.bp ? (cc.bpCua.get(u.code) ?? []).length : 0);
    return (
      <div role="button" tabIndex={0} className={`ccs-o lv${Math.min(u.level, 5)}${sel === u.code ? ' on' : ''}${ngung(u) ? ' muted' : ''}`} onClick={() => onChon(u.code)} onKeyDown={(e) => { if (e.key === 'Enter') onChon(u.code); }} title={`${u.path} · bấm để xem chi tiết`}>
        <span className="ccs-o-ic">{iconDonVi(u, kids.length > 0)}</span>
        <span className="ccs-o-chu"><span className="ccs-o-loai">{tenCap(u)} · <span className="mono">{u.code}</span></span><span className="ccs-o-ten">{u.name}</span></span>
        {so > 0 && <button type="button" className="ccs-thu" title={thu.has(u.code) ? `Mở ${so} mục` : 'Thu nhánh'} onClick={(e) => { e.stopPropagation(); lat(u.code); }}>{thu.has(u.code) ? `+${so}` : <ChevronDown size={12} />}</button>}
      </div>
    );
  };
  const la = (ic: ReactNode, cls: string, ma: string, ten: string, nhan: string) => (
    <div className={`ccs-o ${cls}`}><span className="ccs-o-ic">{ic}</span><span className="ccs-o-chu"><span className="ccs-o-loai">{nhan} · <span className="mono">{ma}</span></span><span className="ccs-o-ten">{ten}</span></span></div>
  );
  // Bộ phận có con: thu gọn sẵn, bấm ô để mở / đóng (moBp), "Mở hết" mở tất cả.
  const bpNut = (d: BoPhan): ReactNode => {
    const con = (cc.bpCon.get(d.code) ?? []).filter((x) => h.ngung || !ngung(x));
    const mo = moBp.has(d.code);
    return (
      <div className="ccs-n">
        {con.length
          ? <div role="button" tabIndex={0} className="ccs-bp-nut" title={mo ? 'Thu nhánh' : `Mở ${con.length} bộ phận con`} onClick={() => latBp(d.code)} onKeyDown={(e) => { if (e.key === 'Enter') latBp(d.code); }}>
              {la(<Users />, 'k-phongban', d.code, d.name, `Bộ phận · ${con.length} con ${mo ? '▾' : '▸'}`)}
            </div>
          : la(<Users />, 'k-phongban', d.code, d.name, 'Bộ phận')}
        {mo && con.length > 0 && <ul className="ccs-con ccs-con-bp">{con.map((x) => <li key={x.code}>{bpNut(x)}</li>)}</ul>}
      </div>
    );
  };
  const cayDoc = (u: DonVi): ReactNode => {
    const kids = kidsOf(u.code);
    const kho = h.kho ? (cc.khoCua.get(u.code) ?? []).filter((x) => h.ngung || !ngung(x)) : [];
    const bp = h.bp ? (cc.bpCua.get(u.code) ?? []).filter((x) => h.ngung || !ngung(x)) : [];
    const co = !thu.has(u.code) && (kids.length || kho.length || bp.length);
    return (
      <div className="ccs-n">
        {oDv(u)}
        {co ? (
          <ul className="ccs-con">
            {kho.map((w) => <li key={`w${w.code}`}>{la(<WarehouseIcon />, 'k-kho', w.code, w.name, 'Phân kho')}</li>)}
            {bp.filter((d) => !cc.chaBp(d)).map((d) => <li key={`d${d.code}`}>{bpNut(d)}</li>)}
            {kids.map((x) => <li key={x.code}>{cayDoc(x)}</li>)}
          </ul>
        ) : null}
      </div>
    );
  };
  // Đơn vị vẽ ngang: phân kho + cây bộ phận của chính nó đặt ngay dưới ô (trước các đơn vị con).
  const rieng = (u: DonVi): ReactNode => {
    const kho = h.kho ? (cc.khoCua.get(u.code) ?? []).filter((x) => h.ngung || !ngung(x)) : [];
    const bp = h.bp ? (cc.bpCua.get(u.code) ?? []).filter((x) => (h.ngung || !ngung(x)) && !cc.chaBp(x)) : [];
    if (!kho.length && !bp.length) return null;
    return (
      <div className="cc-center"><div className="ccs-rieng">
        <div className="ccs-rieng-dau">Riêng của {u.name}: {kho.length ? `${kho.length} phân kho` : ''}{kho.length && bp.length ? ', ' : ''}{bp.length ? `${bp.length} bộ phận gốc` : ''}</div>
        <ul className="ccs-con">
          {kho.map((w) => <li key={`w${w.code}`}>{la(<WarehouseIcon />, 'k-kho', w.code, w.name, 'Phân kho')}</li>)}
          {bp.map((d) => <li key={`d${d.code}`}>{bpNut(d)}</li>)}
        </ul>
      </div></div>
    );
  };
  // Hai cấp trên cùng trải ngang, từ cấp 3 trở xuống cây thụt lề.
  const ve = (u: DonVi, d: number): ReactNode => {
    const kids = kidsOf(u.code);
    if (d >= 1 || !kids.some((x) => cc.kids.get(x.code)?.length) || thu.has(u.code)) return cayDoc(u);
    return (
      <>
        <div className="cc-center">{oDv(u)}</div>
        {rieng(u)}
        <div className="cc-stem ccs-net" />
        <div className="cc-hrow">
          {kids.map((x, i) => (
            <div key={x.code} className="cc-hcell">
              {kids.length > 1 && <div className="cc-hline ccs-net" style={{ left: i === 0 ? '50%' : 0, right: i === kids.length - 1 ? '50%' : 0 }} />}
              <div className="cc-hstem ccs-net" />
              {ve(x, d + 1)}
            </div>
          ))}
        </div>
      </>
    );
  };
  const gocU = goc ? cc.byCode.get(goc) : null;
  const roots = gocU ? [gocU] : cc.roots.filter(hien);
  return (
    <div className="ccm-the-trang ccs">
      <div className="ccs-loc">
        <span className="ccs-goc"><ListPicker items={chonDonVi(cc)} value={goc} onChange={setGoc} placeholder="Xem từ: toàn bộ (gõ để chọn một nhánh)" /></span>
        <label className="checkbox ccm-menu-o"><input type="checkbox" checked={h.kho} onChange={(e) => setH({ ...h, kho: e.target.checked })} /> Hiện phân kho</label>
        <label className="checkbox ccm-menu-o"><input type="checkbox" checked={h.bp} onChange={(e) => setH({ ...h, bp: e.target.checked })} /> Hiện bộ phận</label>
        <label className="checkbox ccm-menu-o"><input type="checkbox" checked={h.ngung} onChange={(e) => setH({ ...h, ngung: e.target.checked })} /> Hiện ngừng hoạt động</label>
        <button type="button" className="btn btn-sm" onClick={() => setThu(new Set(cc.units.filter((u) => u.level >= 3 && cc.kids.get(u.code)?.length).map((u) => u.code)))}>Thu gọn từ cấp 3</button>
        <button type="button" className="btn btn-sm" onClick={() => { setThu(new Set()); setMoBp(new Set(cc.bpCon.keys())); }}>Mở hết</button>
      </div>
      <div className="cc-chart ccs-khung">
        {roots.length ? <div className="cc-chart-in">{roots.map((r) => <div key={r.code} className="cc-chart-root">{ve(r, 0)}</div>)}</div> : <div className="ccm-rong">Chưa có đơn vị nào.</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ danh sách phẳng */

function DanhSachTat({ cc, onChon }: { cc: CC; onChon: (c: string) => void }) {
  const [loai, setLoai] = useState<'dv' | 'kho' | 'bp'>('dv');
  const tenDv = (code: string | null) => { const x = code ? cc.byCode.get(code) : null; return x ? `${x.name} (${x.code})` : ''; };
  return (
    <div className="ccm-the-trang ccm-ds-khung">
      <div className="ccm-chip-hang">
        <button type="button" className={`ccm-chip${loai === 'dv' ? ' on' : ''}`} onClick={() => setLoai('dv')}><Network size={15} /> Đơn vị ({cc.units.length})</button>
        <button type="button" className={`ccm-chip${loai === 'kho' ? ' on' : ''}`} onClick={() => setLoai('kho')}><WarehouseIcon size={15} /> Phân kho ({cc.warehouses.length})</button>
        <button type="button" className={`ccm-chip${loai === 'bp' ? ' on' : ''}`} onClick={() => setLoai('bp')}><Users size={15} /> Bộ phận ({cc.departments.length})</button>
      </div>
      {loai === 'dv' && <Bang key="dv" rows={[...cc.units].sort((a, b) => a.path.localeCompare(b.path))} onMo={(x) => onChon(x.code)} rong="Chưa có đơn vị." khoa="co-cau-ds-dv" tenXuat="Don-vi" cot={cotDonVi(cc, { duong: true, cap: true })} />}
      {loai === 'kho' && <Bang key="kho" rows={cc.warehouses} onMo={(x) => onChon(x.branchCode)} rong="Chưa có phân kho." khoa="co-cau-ds-kho" tenXuat="Phan-kho" cot={cotKho(cc, true)} />}
      {loai === 'bp' && <Bang key="bp" rows={cc.departments} onMo={(x) => x.branchCode && onChon(x.branchCode)} rong="Chưa có bộ phận." khoa="co-cau-ds-bp" tenXuat="Bo-phan" cot={cotBoPhan(cc, true)} />}
    </div>
  );
}
