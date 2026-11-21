// [2026-11-21 Nguyễn Văn Thủy] Khoản mục chi phí xếp cây cha – con cho ô chọn (cha in đậm, con thụt vào), dùng chung (đóng góp)
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface KmRow { code: string; name: string; isActive: boolean; parentCode?: string | null }
export interface KmCay { code: string; name: string; level: number; strong: boolean; isActive: boolean }

/** Danh mục khoản mục (ACC24) theo cây; items(cur) = danh sách cho ListPicker (đang dùng + mã đang chọn). */
export function useKhoanMucCay() {
  const q = useQuery({ queryKey: ['dimensions', 'cost_item'], queryFn: () => api.get<KmRow[]>('/api/v1/dimensions/cost_item'), staleTime: 60_000 });
  return useMemo(() => {
    const rows = q.data ?? [];
    const codes = new Set(rows.map((c) => c.code));
    const kids = new Map<string, KmRow[]>();
    for (const c of rows) { const p = c.parentCode && codes.has(c.parentCode) ? c.parentCode : ''; kids.set(p, [...(kids.get(p) ?? []), c]); }
    const list: KmCay[] = [];
    const seen = new Set<string>();
    const di = (p: string, d: number) => {
      for (const c of (kids.get(p) ?? []).sort((a, b) => a.code.localeCompare(b.code))) {
        if (seen.has(c.code) || d > 20) continue;
        seen.add(c.code);
        list.push({ code: c.code, name: c.name, level: d + 1, strong: Boolean(kids.get(c.code)?.length), isActive: c.isActive });
        di(c.code, d + 1);
      }
    };
    di('', 0);
    return { list, items: (cur?: string | null) => list.filter((c) => c.isActive || c.code === cur) };
  }, [q.data]);
}
