// [2026-11-13 Nguyễn Văn Thủy] Dùng chung cho báo cáo "xem theo nhóm mẹ – chi nhánh": cây cha – con, sắp dòng theo nhóm, dòng Cộng nhóm (đóng góp)
/**
 * Cách hiện thống nhất ở mọi báo cáo (MH01, ACC38, BH02…), không có nút bấm, chỉ hai cấp như sổ sách:
 *   đơn vị mẹ (in đậm) → các chi nhánh ngay dưới (thụt vào, dấu └) → dòng "Cộng nhóm: <đơn vị mẹ>" (số = tổng cả nhóm).
 * Dòng Cộng nhóm là RowKind 'subtotal' nên dòng Cộng cuối bảng không cộng trùng. Đơn vị không thuộc nhóm nào giữ nguyên chỗ.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import '../../phan-he/mua-hang/mua-hang.css';

export interface FamilyMember { code: string; name: string; parentCode: string | null; rootCode: string; rootName: string; depth: number }

/** Cây cha – con của danh mục đối tượng (chỉ đơn vị có cha hoặc có con). */
export function usePartnerFamilies(enabled = true) {
  const q = useQuery({ queryKey: ['partners', 'families'], queryFn: () => api.get<FamilyMember[]>('/api/v1/partners/families'), staleTime: 60_000, enabled });
  return useMemo(() => {
    const by = new Map((q.data ?? []).map((m) => [m.code, m]));
    const roots = new Set((q.data ?? []).map((m) => m.rootCode));
    return {
      loaded: Boolean(q.data),
      /** Số nhóm mẹ – chi nhánh. */
      count: roots.size,
      info: (code: string | null | undefined) => (code ? by.get(code) : undefined),
      /** Mã chính nó + mọi đơn vị cấp dưới của nó. */
      familyOf: (code: string) => { const out = [code]; for (const m of q.data ?? []) { let p = m.parentCode; for (let i = 0; p && i < 20; i++) { if (p === code) { out.push(m.code); break; } p = by.get(p)?.parentCode ?? null; } } return out; },
    };
  }, [q.data]);
}

export type GopRow<T> = T & { _kind?: 'subtotal'; _depth?: number; _head?: boolean };

/**
 * Sắp dòng theo nhóm mẹ – chi nhánh. keyOf: khoá phụ (vd tài khoản, chi nhánh) — chỉ dòng cùng gốc + cùng khoá phụ mới chung nhóm.
 * merge: cộng các dòng thành dòng "Cộng nhóm" (máy tự đặt nhãn ở cột tên qua nameKey).
 */
export function gopNhom<T>(rows: T[], on: boolean, fam: ReturnType<typeof usePartnerFamilies>, o: {
  partnerOf: (r: T) => string | null | undefined; keyOf?: (r: T) => string; merge: (list: T[]) => T; nameKey: keyof T;
}): GopRow<T>[] {
  if (!on) return rows as GopRow<T>[];
  const groups = new Map<string, T[]>();
  const order: string[] = [];
  for (const r of rows) {
    const info = fam.info(o.partnerOf(r));
    const k = info ? `${info.rootCode}|${o.keyOf?.(r) ?? ''}` : `__${order.length}`;
    if (!groups.has(k)) { groups.set(k, []); order.push(k); }
    groups.get(k)!.push(r);
  }
  const res: GopRow<T>[] = [];
  for (const k of order) {
    const list = groups.get(k)!;
    const first = fam.info(o.partnerOf(list[0]!));
    if (!first) { res.push(...(list as GopRow<T>[])); continue; }
    // Đơn vị mẹ trước, rồi theo cấp, cùng cấp theo mã.
    const sorted = [...list].sort((a, b) => (fam.info(o.partnerOf(a))?.depth ?? 0) - (fam.info(o.partnerOf(b))?.depth ?? 0) || String(o.partnerOf(a)).localeCompare(String(o.partnerOf(b))));
    for (const r of sorted) { const d = fam.info(o.partnerOf(r))?.depth ?? 0; res.push({ ...(r as GopRow<T>), _depth: d, _head: d === 0 }); }
    if (list.length > 1) res.push({ ...(o.merge(list) as GopRow<T>), [o.nameKey]: `Cộng nhóm: ${first.rootName} (${list.length} đơn vị)`, _kind: 'subtotal', _depth: 0 } as GopRow<T>);
  }
  return res;
}

/** Ô mã có thụt lề theo cấp (đơn vị con có dấu └). */
export function MaThut({ depth, children }: { depth?: number; children: React.ReactNode }) {
  return <span style={{ paddingLeft: (depth ?? 0) * 16 }}>{(depth ?? 0) > 0 && <span className="muted">└ </span>}{children}</span>;
}
