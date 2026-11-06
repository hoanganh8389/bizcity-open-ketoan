// [2026-11-06 01:30 AM Nguyễn Văn Thủy] MENU — gom việc cần làm từ các phân hệ, gắn theo nhóm để đổi ưu tiên khi đổi nhóm (đóng góp)
// [2026-11-06 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-31: thêm nguồn hàng việc /api/v1/queue/mine (nháp, bị trả lại, chờ duyệt, bể chờ, chứng từ lỗi); bỏ dòng so:loi vì trùng ý với chứng từ lỗi của hàng việc (PHASE-030 · 23 §3)
/**
 * VIỆC CẦN LÀM dùng chung cho thanh mép phải. Mỗi nguồn trả về các việc và nhóm liên quan; một việc có thể thuộc nhiều nhóm
 * (lô sắp hết hạn hiện ở Mua hàng lẫn Kho). Thêm nguồn: thêm một useQuery rồi gộp vào `items`, khai nhóm vào GROUPS_WITH_SOURCE.
 * Nguồn lỗi hoặc không có quyền thì bỏ qua, không làm hỏng các nguồn khác.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export type ViecLevel = 'error' | 'warn' | 'info';
export interface Viec { key: string; level: ViecLevel; text: string; count: number; amount?: number; path: string; groups: string[]; /** Không hiện ở trang Tổng quan vì trùng ý với việc khác. */ homeHidden?: boolean }

/** Nhóm đã có nguồn nhắc việc: nhóm khác hiện "chưa có nhắc việc" thay vì để người dùng tưởng là không có việc. */
export const GROUPS_WITH_SOURCE = new Set(['mua-hang', 'ban-hang', 'cong-no', 'kho', 'tong-hop']);

const RANK: Record<ViecLevel, number> = { error: 0, warn: 1, info: 2 };
/** Việc mua hàng cũng thuộc nhóm khác. */
const MUA_GROUPS: Record<string, string[]> = { expired: ['mua-hang', 'kho'], near: ['mua-hang', 'kho'] };

interface Alerts {
  receivable: { overdue: { count: number; amount: number }; dueSoon: { count: number; amount: number } };
  payable: { overdue: { count: number; amount: number }; dueSoon: { count: number; amount: number } };
  contractPayments: { overdue?: boolean }[];
  contractsExpiring: unknown[];
}

/** Việc từ sổ công nợ. Phải trả chỉ hiện ở nhóm Công nợ vì Mua hàng đã có nhắc nợ NCC theo chứng từ mua. */
function fromAlerts(a: Alerts): Viec[] {
  const out: Viec[] = [];
  const push = (key: string, level: ViecLevel, text: string, x: { count: number; amount: number }, groups: string[], homeHidden?: boolean) => { if (x.count) out.push({ key, level, text, count: x.count, amount: x.amount, path: '/cong-no/khoan-cong-no', groups, homeHidden }); };
  push('cn:thu-qua-han', 'error', 'Khoản phải thu quá hạn', a.receivable.overdue, ['cong-no', 'ban-hang']);
  push('cn:thu-sap-han', 'info', 'Phải thu đến hạn trong 7 ngày', a.receivable.dueSoon, ['cong-no', 'ban-hang']);
  push('cn:tra-qua-han', 'error', 'Khoản phải trả quá hạn', a.payable.overdue, ['cong-no'], true);
  push('cn:tra-sap-han', 'info', 'Phải trả đến hạn trong 7 ngày', a.payable.dueSoon, ['cong-no'], true);
  if (a.contractPayments.length) out.push({ key: 'cn:hd-ky', level: a.contractPayments.some((c) => c.overdue) ? 'error' : 'warn', text: 'Kỳ thanh toán hợp đồng', count: a.contractPayments.length, path: '/bao-cao/lich-thanh-toan-hop-dong', groups: ['cong-no'] });
  if (a.contractsExpiring.length) out.push({ key: 'cn:hd-het', level: 'warn', text: 'Hợp đồng sắp hết hạn', count: a.contractsExpiring.length, path: '/bao-cao/lich-thanh-toan-hop-dong', groups: ['cong-no'] });
  return out;
}

export function useViec() {
  const { can } = useAuth();
  const enabled = can('documents:read');
  const opts = { enabled, retry: false, staleTime: 60_000, refetchInterval: 120_000 } as const;
  const mua = useQuery({ ...opts, queryKey: ['rail', 'purchase-todo'], queryFn: () => api.get<{ items: { key: string; level: ViecLevel; text: string; count: number; amount?: number; path: string }[] }>('/api/v1/purchase/todo') });
  const cn = useQuery({ ...opts, queryKey: ['rail', 'alerts'], queryFn: () => api.get<Alerts>('/api/v1/alerts') });
  const hv = useQuery({ ...opts, queryKey: ['rail', 'queue-mine'], queryFn: () => api.get<{ viec: Viec[] }>('/api/v1/queue/mine') });
  const items: Viec[] = [
    ...(cn.data ? fromAlerts(cn.data) : []),
    ...(mua.data?.items ?? []).map((v) => ({ ...v, key: `mua:${v.key}`, groups: MUA_GROUPS[v.key] ?? ['mua-hang'] })),
    ...(hv.data?.viec ?? []),
  ].sort((a, b) => RANK[a.level] - RANK[b.level]);
  return { items, loading: mua.isLoading || cn.isLoading || hv.isLoading, refresh: () => { void mua.refetch(); void cn.refetch(); void hv.refetch(); } };
}

/** Việc của một nhóm; không có nhóm (trang Tổng quan) thì lấy tất cả. */
export const viecOf = (items: Viec[], group?: string) => (group ? items.filter((v) => v.groups.includes(group)) : items.filter((v) => !v.homeHidden));
