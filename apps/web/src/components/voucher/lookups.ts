/**
 * Danh mục nhỏ dùng chung trong các form phiếu (nạp một lần, giữ 60 giây): chiều phân tích (nhân viên, khoản mục,
 * bộ phận, hợp đồng…).
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Dimension { code: string; name: string; isActive: boolean }

export const useDimension = (kind: string) => useQuery({ queryKey: ['dimensions', kind], queryFn: () => api.get<Dimension[]>(`/api/v1/dimensions/${kind}`), staleTime: 60_000 }).data ?? [];
