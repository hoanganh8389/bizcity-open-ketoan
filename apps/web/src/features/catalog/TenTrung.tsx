// Báo trùng tên mặt hàng (form mặt hàng).
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// [2026-11-10 03:00 PM Nguyễn Văn Thủy] PHASE-026 — tên mặt hàng không trùng: báo ngay khi gõ (đóng góp)
/** Mặt hàng khác đang dùng tên này (trừ mã except). Hỏi máy chủ sau khi ngừng gõ 300ms; máy chủ vẫn chặn khi lưu. */
export function useSameName(name: string, except = '') {
  const n = name.replace(/\s+/g, ' ').trim();
  const [q, setQ] = useState(n);
  useEffect(() => { const t = setTimeout(() => setQ(n), 300); return () => clearTimeout(t); }, [n]);
  const r = useQuery({ queryKey: ['name-check', q.toLowerCase(), except], enabled: Boolean(q), staleTime: 10_000,
    queryFn: () => api.get<{ same: { sku: string; name: string; isActive: boolean } | null }>('/api/v1/catalog/name-check', { name: q, except }) });
  return q === n && q ? r.data?.same ?? null : null;
}

/** Câu báo trùng tên, dùng chung form mặt hàng và thêm sản phẩm con. */
export function TrungTen({ same }: { same: { sku: string; name: string; isActive: boolean } | null }) {
  if (!same) return null;
  return <div className="alert alert-bad full" style={{ marginTop: -4 }}>Tên này đã dùng cho mã <b className="mono">{same.sku}</b>{same.isActive ? '' : ' (đã ngừng theo dõi)'}. Đặt tên khác để quầy, kho không chọn nhầm.</div>;
}
