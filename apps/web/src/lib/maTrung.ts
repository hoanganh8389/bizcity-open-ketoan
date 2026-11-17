// [2026-11-17 07:27 PM kiennt] NT-DM-002 — L01: form Thêm báo mã đã có (cả trong thùng rác) thay vì ghi đè bản ghi cũ qua PUT thêm-hoặc-sửa (đóng góp)
/**
 * CHỐNG GHI ĐÈ KHI THÊM MỚI — các danh mục lưu bằng PUT /…/:code (thêm hoặc sửa theo mã): form Thêm mà gõ trùng mã đang có
 * thì PUT sửa luôn bản ghi cũ. Hook này kiểm mã đang nhập với danh sách đã tải (không phân biệt hoa thường) và thùng rác
 * của danh mục (GET /api/v1/catalog-trash?catalog=…), trả câu báo lỗi để form khoá nút Ghi. Sửa bản ghi có sẵn: không kiểm.
 * API giữ nguyên thêm-hoặc-sửa (đồng bộ từ hệ thống ngoài vẫn dùng).
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface TrashRow { key: string; label: string }

export function useMaTrung(o: { isNew?: boolean; code: string | null | undefined; list: { code: string; name?: string | null }[] | undefined; catalog?: string; trash?: { code: string; name?: string | null }[] }): string {
  const ma = (o.code ?? '').trim();
  const rac = useQuery({
    queryKey: ['catalog-trash', o.catalog],
    enabled: Boolean(o.isNew && o.catalog),
    queryFn: () => api.getQuiet<TrashRow[]>('/api/v1/catalog-trash', { catalog: o.catalog! }).then((r) => r.data),
    staleTime: 30_000,
  });
  if (!o.isNew || !ma) return '';
  const k = ma.toLowerCase();
  const co = (o.list ?? []).find((x) => x.code.toLowerCase() === k);
  if (co) return `Mã ${co.code} đã có${co.name ? `: ${co.name}` : ''}. Nhập mã khác (muốn đổi thông tin thì mở mã đó để sửa).`;
  const r = [...(rac.data ?? []).map((x) => ({ code: x.key, name: x.label })), ...(o.trash ?? [])].find((x) => x.code.toLowerCase() === k);
  if (r) return `Mã ${r.code} đang nằm trong Thùng rác${r.name ? ` (${r.name})` : ''}. Khôi phục mã đó hoặc nhập mã khác.`;
  return '';
}
