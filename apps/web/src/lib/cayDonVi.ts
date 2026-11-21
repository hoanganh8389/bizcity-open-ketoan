// [2026-11-21 Nguyễn Văn Thủy] Cây đơn vị (chi nhánh cha – con) dùng chung cho mọi ô chọn chi nhánh, chi nhánh đang làm việc, bộ phận (đóng góp)
/**
 * CÂY ĐƠN VỊ — đọc cơ cấu một bảng (/api/v1/co-cau: đơn vị = chi nhánh có cha, phân kho, bộ phận), xếp theo cây (cha trước,
 * con thụt vào ngay dưới) để các ô chọn chi nhánh nhìn được cha – con. Dùng chung khoá ['co-cau'] với màn DM16 (một lần tải).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Unit { uid: string; code: string; name: string; parentCode: string | null; level: number; levelLabel: string; sortOrder: number; isActive: boolean; departmentCode: string | null; taxUsed?: string; companyName?: string; address?: string; phone?: string }
interface Dept { uid: string; code: string; name: string; branchCode: string | null; parentCode?: string | null; isActive: boolean }
interface Wh { code: string; name: string; branchCode: string; isDefault: boolean; isActive: boolean; address?: string }
/** Thông tin đơn vị in trên chứng từ (bên nhận / bên mua): tên in, MST dùng (kế thừa cấp trên), địa chỉ + điện thoại (trống thì lấy cấp trên gần nhất). */
export interface DonViIn { code: string; name: string; printName: string; taxCode: string; address: string; addressFrom: string | null; phone: string }

export interface DonViCay {
  code: string; name: string; uid: string; isActive: boolean;
  /** Độ sâu trong cây (0 = gốc). */
  depth: number;
  /** Tên gọi cấp (Công ty, Chi nhánh, Cửa hàng…). */
  levelLabel: string;
  hasKids: boolean;
  parentCode: string | null;
  /** Đường dẫn tên từ gốc tới cha (vd "TGS › CN Phú Thọ"). */
  parentPath: string;
  departmentCode: string | null;
}

export function useCayDonVi() {
  const q = useQuery({ queryKey: ['co-cau'], queryFn: () => api.get<{ units: Unit[]; departments: Dept[]; warehouses: Wh[] }>('/api/v1/co-cau'), staleTime: 30_000, retry: false });
  return useMemo(() => {
    const units = q.data?.units ?? [];
    const byCode = new Map(units.map((u) => [u.code, u]));
    const kids = new Map<string, Unit[]>();
    for (const u of units) if (u.parentCode && byCode.has(u.parentCode)) (kids.get(u.parentCode) ?? kids.set(u.parentCode, []).get(u.parentCode)!).push(u);
    const sx = (a: Unit, b: Unit) => a.sortOrder - b.sortOrder || Number(!kids.get(a.code)?.length) - Number(!kids.get(b.code)?.length) || a.code.localeCompare(b.code);
    for (const l of kids.values()) l.sort(sx);
    const roots = units.filter((u) => !u.parentCode || !byCode.has(u.parentCode)).sort((a, b) => (kids.get(b.code)?.length ?? 0) - (kids.get(a.code)?.length ?? 0) || sx(a, b));
    const list: DonViCay[] = [];
    const seen = new Set<string>();
    const di = (u: Unit, depth: number, path: string[]) => {
      if (seen.has(u.code) || depth > 30) return;
      seen.add(u.code);
      list.push({ code: u.code, name: u.name, uid: u.uid, isActive: u.isActive, depth, levelLabel: u.levelLabel, hasKids: Boolean(kids.get(u.code)?.length), parentCode: u.parentCode, parentPath: path.join(' › '), departmentCode: u.departmentCode });
      for (const k of kids.get(u.code) ?? []) di(k, depth + 1, [...path, u.name]);
    };
    for (const r of roots) di(r, 0, []);
    const deptOf = (branch: string) => (q.data?.departments ?? []).filter((d) => d.branchCode === branch);
    /** Bộ phận mặc định của đơn vị (đơn vị tạo ra là tự có một bộ phận). */
    const defaultDept = (branch: string) => byCode.get(branch)?.departmentCode ?? deptOf(branch).find((d) => d.isActive)?.code ?? '';
    const whOf = (branch: string) => (q.data?.warehouses ?? []).filter((w) => w.branchCode === branch);
    const index = new Map(list.map((x) => [x.code, x]));
    // Kho → chi nhánh sở hữu; chi nhánh con (đệ quy) theo cây; kho mặc định của chi nhánh (đánh dấu mặc định, không có thì kho đang dùng đầu tiên).
    const chuKho = new Map((q.data?.warehouses ?? []).map((w) => [w.code, w.branchCode]));
    const khoChu = (code: string) => chuKho.get(code) ?? '';
    const conCua = (branch: string) => { const i = list.findIndex((u) => u.code === branch); const out: string[] = []; if (i >= 0) for (let j = i + 1; j < list.length && list[j]!.depth > list[i]!.depth; j++) out.push(list[j]!.code); return out; };
    const khoMacDinh = (branch: string) => { const ws = whOf(branch).filter((w) => w.isActive); return (ws.find((w) => w.isDefault) ?? ws[0])?.code ?? ''; };
    const khoTen = (code: string) => (q.data?.warehouses ?? []).find((w) => w.code === code)?.name ?? '';
    const khoDiaChi = (code: string) => (q.data?.warehouses ?? []).find((w) => w.code === code)?.address?.trim() ?? '';
    /** Lấy giá trị theo cấp trên gần nhất (đơn vị con không tự khai thì dùng của cha). */
    const theoCap = (branch: string, f: (u: Unit) => string | undefined): [string, string | null] => {
      let u = byCode.get(branch); let n = 0;
      while (u && n++ < 30) { const v = f(u)?.trim(); if (v) return [v, u.code === branch ? null : u.code]; u = u.parentCode ? byCode.get(u.parentCode) : undefined; }
      return ['', null];
    };
    const thongTinIn = (branch: string): DonViIn => {
      const u = byCode.get(branch);
      const [address, addressFrom] = theoCap(branch, (x) => x.address);
      const [printName] = theoCap(branch, (x) => x.companyName);
      return { code: branch, name: u?.name ?? branch, printName: printName || u?.name || branch, taxCode: u?.taxUsed ?? '', address, addressFrom, phone: theoCap(branch, (x) => x.phone)[0] };
    };
    return { list, index, ready: Boolean(q.data), deptOf, defaultDept, whOf, khoChu, conCua, khoMacDinh, khoTen, khoDiaChi, thongTinIn, departments: q.data?.departments ?? [] };
  }, [q.data]);
}
