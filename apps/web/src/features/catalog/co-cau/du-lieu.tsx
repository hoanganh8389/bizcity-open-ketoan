// [2026-11-20 Nguyễn Văn Thủy] Cơ cấu tổ chức (DM16) — Dữ liệu cơ cấu: kiểu, hook useCoCau (chỉ mục cây đơn vị / phân kho / bộ phận), tiện ích hiển thị dùng chung. (đóng góp)
import { useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building, Building2, MapPinned, Mountain, Network, Store, Warehouse as WarehouseIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { plain } from '@/components/pickers';
import { invalidateOrg } from '@/lib/orgUnits';

/* ------------------------------------------------------------------ dữ liệu */

export interface DonVi {
  uid: string; code: string; name: string; parentCode: string | null; path: string; level: number; levelLabel: string; sortOrder: number;
  taxCode: string; taxUsed: string; taxFrom: string | null; companyName: string; address: string; phone: string; note: string; isActive: boolean; departmentCode: string | null;
  createdBy?: string; createdAt?: string | null; updatedBy?: string; updatedAt?: string | null;
}
export interface PhanKho { uid: string; code: string; name: string; branchCode: string; typeCode: string; typeName: string; isDefault: boolean; isActive: boolean; address: string; note: string; createdBy?: string; createdAt?: string | null; updatedBy?: string; updatedAt?: string | null }
export interface BoPhan { uid: string; code: string; name: string; branchCode: string | null; parentCode?: string | null; isActive: boolean; note: string; createdBy?: string; createdAt?: string | null; updatedBy?: string; updatedAt?: string | null }
export interface CoCauRaw { units: DonVi[]; warehouses: PhanKho[]; departments: BoPhan[] }

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

export function useLamMoi() {
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
export const TrangThai = ({ x }: { x: { code: string; isActive: boolean } }) => (ngung(x) ? <span className="ccm-tt ngung">Ngừng hoạt động</span> : <span className="ccm-tt">Đang hoạt động</span>);
export const OIc = ({ children, to }: { children: ReactNode; to?: boolean }) => <span className={`ccm-o-ic${to ? ' to' : ''}`}>{children}</span>;
export const homNay = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
export const MST_OK = /^[0-9]{10}(-[0-9]{3})?$/;

export const duongTen = (cc: CC, u: DonVi) => cc.pathOf(u).map((x) => x.name).join(' / ');
export const tenDonVi = (cc: CC, code: string | null) => { const x = code ? cc.byCode.get(code) : null; return x ? `${x.name} (${x.code})` : ''; };
export const duongCua = (cc: CC, code: string | null) => { const x = code ? cc.byCode.get(code) : null; return x ? duongTen(cc, x) : ''; };

/** Hộp thoại đang mở trên trang. */
export type HopThoai = { loai: 'donvi'; code: string | null; cha: string | null } | { loai: 'kho'; code: string | null; donVi: string | null } | { loai: 'bophan'; code: string | null; donVi: string | null; cha?: string | null } | { loai: 'xoa'; key: string; ten: string; ma: string };
