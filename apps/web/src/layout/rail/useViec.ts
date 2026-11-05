// [2026-11-06 01:30 AM Nguyễn Văn Thủy] MENU — gom việc cần làm từ các phân hệ, gắn theo nhóm để đổi ưu tiên khi đổi nhóm (đóng góp)
/**
 * VIỆC CẦN LÀM dùng chung cho thanh mép phải. Mỗi nguồn trả về các việc và nhóm liên quan; một việc có thể thuộc nhiều nhóm
 * (nợ NCC quá hạn hiện ở Mua hàng lẫn Công nợ). Thêm nguồn: thêm một useQuery rồi gộp vào `items`, khai nhóm vào GROUPS_WITH_SOURCE.
 * Nguồn lỗi hoặc không có quyền thì bỏ qua, không làm hỏng các nguồn khác.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { defaultTo, periodFrom } from '@/lib/format';

export type ViecLevel = 'error' | 'warn' | 'info';
export interface Viec { key: string; level: ViecLevel; text: string; count: number; amount?: number; path: string; groups: string[] }

/** Nhóm đã có nguồn nhắc việc: nhóm khác hiện "chưa có nhắc việc" thay vì để người dùng tưởng là không có việc. */
export const GROUPS_WITH_SOURCE = new Set(['mua-hang', 'cong-no', 'kho', 'tong-hop']);

const RANK: Record<ViecLevel, number> = { error: 0, warn: 1, info: 2 };
/** Việc mua hàng cũng thuộc nhóm khác. */
const MUA_GROUPS: Record<string, string[]> = {
  overdue: ['mua-hang', 'cong-no'], due: ['mua-hang', 'cong-no'], soon: ['mua-hang', 'cong-no'],
  expired: ['mua-hang', 'kho'], near: ['mua-hang', 'kho'],
};

export function useViec() {
  const { can } = useAuth();
  const enabled = can('documents:read');
  const opts = { enabled, retry: false, staleTime: 60_000, refetchInterval: 120_000 } as const;
  const mua = useQuery({ ...opts, queryKey: ['rail', 'purchase-todo'], queryFn: () => api.get<{ items: { key: string; level: ViecLevel; text: string; count: number; amount?: number; path: string }[] }>('/api/v1/purchase/todo') });
  const so = useQuery({ ...opts, queryKey: ['rail', 'dashboard'], queryFn: () => api.get<{ documents: Record<string, number> }>('/api/v1/reports/dashboard', { from: periodFrom(), to: defaultTo() }) });
  const items: Viec[] = [
    ...(mua.data?.items ?? []).map((v) => ({ ...v, key: `mua:${v.key}`, groups: MUA_GROUPS[v.key] ?? ['mua-hang'] })),
    ...((so.data?.documents.error ?? 0) > 0 ? [{ key: 'so:loi', level: 'error' as const, text: 'Chứng từ lỗi cần ghi sổ lại', count: so.data!.documents.error!, path: '/chung-tu?status=error', groups: ['tong-hop'] }] : []),
  ].sort((a, b) => RANK[a.level] - RANK[b.level]);
  return { items, loading: mua.isLoading || so.isLoading, refresh: () => { void mua.refetch(); void so.refetch(); } };
}

/** Việc của một nhóm; không có nhóm (trang Tổng quan) thì lấy tất cả. */
export const viecOf = (items: Viec[], group?: string) => (group ? items.filter((v) => v.groups.includes(group)) : items);
