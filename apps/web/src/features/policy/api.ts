// [2026-11-09 02:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W4b (S031-18 / S031-24, chữ chốt PHASE-031 · 00 §13): kiểu dữ liệu + truy vấn của màn Chính sách
/** Kiểu theo bizcity_policy@1 §11 (W4a) và hàng việc policy_review (W2c). Số trên màn là số API trả — không tính lại ở trình duyệt (D-POL-8). */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface RegistryVersion {
  version: number; effectiveFrom: string | null; effectiveTo: string | null; status: 'published' | 'retired'; contentHash: string;
  scope: Record<string, unknown>; publishedBy: string; publishedAt: string; reason: string | null; applied: number;
}
export interface RegistryPolicy {
  policyId: string; policyKey: string; ownerModule: string; ruleContract: string; versions: RegistryVersion[];
  current: number | null; gaps: { after: number; from: string; to: string }[]; expiresOn: string | null;
}
export interface ApplicationRow { eventId: number; docKey: string; docType: string; docDate: string | null; sourceSystem: string; status: string; version: number; codes: string[]; ok: boolean }
export interface Tracking {
  range: { from: string; to: string };
  applied: { events: number; total: number };
  pass: { events: number; passed: number; rate: number | null };
  codes: { code: string; n: number }[];
  coverage: { sourceSystem: string; events: number; withRefs: number; rate: number | null }[];
  stale: { source_system: string; policy_key: string; stale: number; last_sent: number }[];
  timeline: { policyId: string; policyKey: string; version: number; effectiveFrom: string | null; effectiveTo: string | null; status: string }[];
  health: {
    expiringSoon: { policyId: string; policyKey: string; expiresOn: string }[];
    noPublished: { policyId: string; policyKey: string }[];
    gaps: { policyId: string; policyKey: string; gaps: { after: number; from: string; to: string }[] }[];
  };
}
export interface Lineage {
  event: { eventId: number; docKey: string; docType: string; docDate: string | null; status: string; sourceSystem: string };
  refs: { key: string; version: number; sentHash: string; registered: boolean; policyId: string | null; ownerModule: string | null; status: string | null; registryHash: string | null; hashMatches: boolean; covers: boolean | null; effectiveFrom: string | null; effectiveTo: string | null }[];
  policyCheck: { checkedAt?: string; mode?: string; findings?: { code: string; message?: string }[] } | null;
}
export interface ReviewItem { sourceId: string; docRef: string; docType: string; docNo: string; docDate: string | null; branchCode: string | null; amount: number | null; waitingSince: string; ageDays: number }

export const useRegistry = (q: string) => useQuery({ queryKey: ['policy', 'registry', q], queryFn: () => api.get<{ items: RegistryPolicy[] }>('/api/v1/policy-registry', q ? { q } : {}) });
export const useReviewItems = () => useQuery({
  queryKey: ['policy', 'review'],
  queryFn: () => api.get<{ items: ReviewItem[]; next: string | null }>('/api/v1/queue/items', { source: 'policy_review', flag: 'policy', limit: 100 }),
});
export const useTracking = (f: { from?: string; to?: string; source?: string; owner?: string; branch?: string }) => useQuery({
  queryKey: ['policy', 'tracking', f],
  queryFn: () => api.get<Tracking>('/api/v1/policy-tracking', Object.fromEntries(Object.entries(f).filter(([, v]) => v))),
});

/** Tỉ lệ → chữ; null (mẫu số 0) hiện "—", không phải 0%. */
export const pct = (r: number | null | undefined) => (r == null ? '—' : `${Math.round(r * 1000) / 10}%`);
export const shortHash = (h: string | null | undefined) => (h ? h.slice(0, 8) : '—');
