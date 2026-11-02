// [2026-11-01 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W3: kiểu dữ liệu + hook gọi API trung gian của Bàn điều tra
/**
 * Gọi API trung gian của Bàn điều tra (`/api/v1/system/devtools/*`, PHASE-019 W2–W3). Trình duyệt KHÔNG gọi Tempo / Loki / Grafana
 * (N1); mọi bộ lọc đơn vị do máy chủ gắn. Kiểu ở đây khớp output của các action trong apps/api/src/modules/system/devtools.routes.ts.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type Outcome = 'ok' | 'rejected' | 'error';
export type SourceState = 'off' | 'up' | 'down';
type AttrValue = string | number | boolean;

export interface DevStatus {
  mode: 'unit' | 'ops';
  opsBlocked: string | null;
  sources: { tempo: SourceState; loki: SourceState; prometheus: SourceState | null; alertmanager: SourceState | null };
  grafanaUrl: string | null;
  bugReportUrl: string | null;
  limits: { logHours: number; logLines: number; traceDays: number; traces: number; perMinute: number };
}

export interface SpanView {
  spanId: string;
  parentId: string | null;
  name: string;
  kind: string;
  startMs: number;
  durationMs: number;
  outcome: Outcome;
  attributes: Record<string, AttrValue>;
  events: { name: string; exceptionType?: string }[];
}

export interface TraceSummary {
  outcome: Outcome;
  route: string | null;
  status: number | null;
  errorCode: string | null;
  stoppedAt: { spanId: string; name: string; module: string | null } | null;
  kernel: { state: 'not-called' | 'ok' | 'rejected' | 'error'; ops: string[] };
  slowest: { spanId: string; name: string; selfMs: number; share: number } | null;
  events: string[];
  playbook: string | null;
  lines: string[];
}

export interface TraceView {
  traceId: string;
  startedAt: string | null;
  durationMs: number;
  summary: TraceSummary;
  spans: SpanView[];
  links: { logs: string; evidence: string; grafana: string | null };
}

export interface LogLine {
  time: string;
  level: string;
  msg: string;
  reqId?: string;
  traceId?: string;
  route?: string;
  method?: string;
  status?: number;
  ms?: number;
  errCode?: string;
  evt?: string;
  module?: string;
  action?: string;
  docType?: string;
  docKey?: string;
  err?: { type?: string; message?: string; stack?: string };
}

export interface RequestView {
  requestId: string;
  traceId: string | null;
  logs: LogLine[];
  trace: TraceView | null;
  traceMissing: string | null;
}

export interface EvidenceRow {
  id: string;
  at: string;
  action: string;
  module: string | null;
  object: { type: string; id: string | null };
  actor: { kind: string; id: string };
  result: { ok: boolean; code: string | null };
  requestId: string | null;
  traceId: string | null;
}

export interface TraceHit {
  traceId: string;
  rootName: string;
  startedAt: string;
  durationMs: number;
  attributes: Record<string, AttrValue>;
}

export interface DevSummary {
  window: string;
  generatedAt: string;
  level: 'ok' | 'warn' | 'bad';
  lines: string[];
  errors: { state: SourceState; rejected: number; error: number; byCode: { code: string; count: number; kind: 'rejected' | 'error' }[] };
  slow: { state: SourceState; count: number };
  recent: { state: SourceState; traces: TraceHit[] };
  events: { pending: number; dead: number; oldestPendingAt: string | null; deadConsumers: string[] };
  diagnostics: { at: string; layer: string; errorCount: number } | null;
}

const BASE = '/api/v1/system/devtools';
/** Truy vấn của Bàn điều tra tính vào hạn 30 / phút / người: không thử lại, không tự tải lại khi quay lại tab. */
const OPTS = { retry: false, refetchOnWindowFocus: false } as const;

export const TRACE_RE = /^[0-9a-f]{32}$/i;
export const REQUEST_RE = /^[A-Za-z0-9._:-]{4,128}$/;

export function useDevStatus() {
  return useQuery({ queryKey: ['devtools', 'status'], queryFn: () => api.get<DevStatus>(`${BASE}/status`), staleTime: 60_000, ...OPTS });
}

export function useTrace(traceId: string | null) {
  return useQuery({ queryKey: ['devtools', 'trace', traceId], queryFn: () => api.get<TraceView>(`${BASE}/traces/${traceId}`), enabled: Boolean(traceId), staleTime: 300_000, ...OPTS });
}

export function useRequest(requestId: string | null) {
  return useQuery({ queryKey: ['devtools', 'request', requestId], queryFn: () => api.get<RequestView>(`${BASE}/requests/${encodeURIComponent(requestId!)}`), enabled: Boolean(requestId), staleTime: 300_000, ...OPTS });
}

export function useEvidence(by: { traceId?: string | null; requestId?: string | null }, enabled = true) {
  const key = by.traceId ? { traceId: by.traceId } : by.requestId ? { requestId: by.requestId } : null;
  return useQuery({ queryKey: ['devtools', 'evidence', key], queryFn: () => api.get<EvidenceRow[]>(`${BASE}/evidence`, key ?? {}), enabled: enabled && Boolean(key), staleTime: 60_000, ...OPTS });
}

export interface LogQuery { window: '1h' | '6h' | '24h'; level?: string; errCode?: string; evt?: string; route?: string; traceId?: string }

export function useLogs(q: LogQuery | null) {
  return useQuery({ queryKey: ['devtools', 'logs', q], queryFn: () => api.get<{ window: string; from: string; to: string; lines: LogLine[] }>(`${BASE}/logs`, { ...q }), enabled: Boolean(q), staleTime: 30_000, ...OPTS });
}

export function useSummary(window: '1h' | '24h') {
  return useQuery({ queryKey: ['devtools', 'summary', window], queryFn: () => api.get<DevSummary>(`${BASE}/summary`, { window }), staleTime: 30_000, ...OPTS });
}

// [2026-11-02 10:42 AM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W4: Lỗi theo module (API trung gian) + Ghi sổ, Sự kiện, Toàn vẹn (API sẵn có)

export interface ModulePlace {
  kind: 'step' | 'kernel' | 'action' | 'request';
  place: string;
  count: number;
  codes: { code: string; count: number }[];
  via: string | null;
  lastAt: string;
  traceId: string;
}

export interface ModuleErrorsView {
  window: string;
  outcome: 'error' | 'rejected';
  traces: number;
  truncated: boolean;
  lines: string[];
  modules: { module: string | null; count: number; places: ModulePlace[] }[];
}

export function useModuleErrors(window: string, outcome: string) {
  return useQuery({ queryKey: ['devtools', 'module-errors', window, outcome], queryFn: () => api.get<ModuleErrorsView>(`${BASE}/module-errors`, { window, outcome }), staleTime: 30_000, ...OPTS });
}

/*
 * Ba màn dưới đọc API SẴN CÓ (20-KIEN-TRUC §2.1 — không viết lại): quyền documents:read / reports:read, vai trò developer có sẵn (như
 * viewer). Không tính vào hạn 30 / phút của Bàn điều tra; vẫn không thử lại, không tự tải khi quay lại tab.
 */

export interface PostingLogRow {
  id: string;
  eventId: string;
  docType: string;
  docNo: string | null;
  version: number;
  action: 'receive' | 'post' | 'repost' | 'error' | 'cancel';
  branchCode: string;
  message: string | null;
  createdAt: string;
  docStatus: string;
}

export function usePostingLog(q: { from: string; to: string; action?: string } | null) {
  return useQuery({ queryKey: ['devtools', 'posting-log', q], queryFn: () => api.get<PostingLogRow[]>('/api/v1/posting-log', { ...q }), enabled: Boolean(q), staleTime: 30_000, ...OPTS });
}

export interface StuckDoc {
  id: string;
  docKey: string;
  docType: string;
  docNo: string | null;
  docDate: string;
  status: string;
  errorMessage: string | null;
  receivedAt: string;
  sourceSystem: string;
  branchCode: string;
}

/** Chứng từ chờ / lỗi định khoản — 100 dòng mỗi trạng thái (màn ACC14 có đủ và có nút định khoản). */
export function useStuckDocs(enabled: boolean) {
  return useQuery({
    queryKey: ['devtools', 'stuck-docs'],
    queryFn: async () => {
      const [pending, error] = await Promise.all(['pending', 'error'].map((status) => api.getPage<StuckDoc[]>('/api/v1/documents', { status, pageSize: 100 })));
      return {
        pending: pending!.data, pendingTotal: Number(pending!.meta?.total ?? pending!.data.length),
        error: error!.data, errorTotal: Number(error!.meta?.total ?? error!.data.length),
      };
    },
    enabled, staleTime: 30_000, ...OPTS,
  });
}

export interface EventsStatus {
  subscribers: { id: string; module: string; on: string[] }[];
  consumers: { consumer: string; pending: number; done: number; dead: number; oldestPendingAt: string | null }[];
}

export function useEvents() {
  return useQuery({ queryKey: ['devtools', 'events'], queryFn: () => api.get<EventsStatus>('/api/v1/system/events'), staleTime: 30_000, ...OPTS });
}

export interface DiagRunRow { id: string; layer: string; trigger: string; errorCount: number; at: string; summary: Record<string, number> }
export interface DiagCheckResult { code: string; level: 'pass' | 'empty' | 'info' | 'warn' | 'error'; title: string; fix: string; examined: number; count: number; sample: string[] }
export interface DiagRun extends DiagRunRow { checks: DiagCheckResult[] }

export function useDiagRuns() {
  return useQuery({ queryKey: ['devtools', 'diag-runs'], queryFn: () => api.get<DiagRunRow[]>('/api/v1/system/diagnostics/runs', { limit: 20 }), staleTime: 30_000, ...OPTS });
}

export function useDiagRun(id: string | null) {
  return useQuery({ queryKey: ['devtools', 'diag-run', id], queryFn: () => api.get<DiagRun>(`/api/v1/system/diagnostics/runs/${id}`), enabled: Boolean(id), staleTime: 300_000, ...OPTS });
}
