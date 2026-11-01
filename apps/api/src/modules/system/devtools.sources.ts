// @bizcity-layer P observability
// [2026-11-01 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W2: gọi Tempo / Loki cho Bàn điều tra — mẫu truy vấn đóng, thoát ký tự, thời hạn chờ, lọc trường log
/**
 * Nguồn quan sát của Bàn điều tra (PHASE-019, 20-KIEN-TRUC §2.2, §3.1, §3.3).
 *
 * - Địa chỉ đọc từ env MỖI LẦN GỌI (DEVTOOLS_*_URL): trống = nguồn "chưa bật" → NOT_READY { backend, reason: 'off' } (không 500,
 *   ADR-0007 G-5: công cụ quan sát là tuỳ chọn). Không trả lời trong 5 giây / lỗi mạng → reason 'down'; trả mã lạ → 'bad-response'.
 * - Gọi bằng fetch có sẵn (span S8 tự có), không thêm phụ thuộc.
 * - Truy vấn LogQL chỉ dựng từ mẫu cố định trong tệp này; giá trị chèn đã qua khuôn Zod ở route VÀ được thoát ký tự ở đây (hai lớp).
 * - Log: chỉ giữ trường trong danh sách cho phép; dòng không mang đúng đơn vị của phiên bị bỏ (lọc lần hai, không tin bộ lọc của Loki).
 */
import { env } from '@bizcity/platform/config/env';
import { Errors } from '@bizcity/platform/core/errors';

export type Backend = 'tempo' | 'loki' | 'prometheus' | 'alertmanager';
export type SourceState = 'off' | 'up' | 'down';

const TIMEOUT_MS = 5_000;
const PING_TIMEOUT_MS = 2_000;

export const LIMITS = { logHours: 24, logLines: 200, traceDays: 7, traces: 50, perMinute: 30 } as const;

function baseUrl(b: Backend): string {
  const raw = { tempo: env.DEVTOOLS_TEMPO_URL, loki: env.DEVTOOLS_LOKI_URL, prometheus: env.DEVTOOLS_PROMETHEUS_URL, alertmanager: env.DEVTOOLS_ALERTMANAGER_URL }[b];
  return raw.trim().replace(/\/+$/, '');
}

const unavailable = (backend: Backend, reason: 'off' | 'down' | 'bad-response') =>
  Errors.notReady(
    reason === 'off' ? `Chưa bật ${backend} cho Bàn điều tra (DEVTOOLS_${backend.toUpperCase()}_URL) — xem Sổ tay điều tra lỗi §0`
      : reason === 'down' ? `${backend} không trả lời — xem Sổ tay điều tra lỗi TH-14`
        : `${backend} trả lời không đúng khuôn — xem Sổ tay điều tra lỗi TH-14`,
    { backend, reason },
  );

/** GET JSON từ một nguồn. 404 trả về cho người gọi quyết (trace không có); mã khác 2xx → bad-response. */
export async function getJson(b: Backend, path: string, query: Record<string, string> = {}): Promise<{ status: number; body: unknown }> {
  const base = baseUrl(b);
  if (!base) throw unavailable(b, 'off');
  const url = new URL(base + path);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw unavailable(b, 'down');
  }
  if (res.status === 404) return { status: 404, body: null };
  if (!res.ok) throw unavailable(b, 'bad-response');
  try {
    return { status: res.status, body: await res.json() };
  } catch {
    throw unavailable(b, 'bad-response');
  }
}

/** Tình trạng một nguồn cho màn Tổng quan / status: không ném lỗi. */
export async function ping(b: Backend): Promise<SourceState> {
  const base = baseUrl(b);
  if (!base) return 'off';
  // [2026-11-01 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W3: Tempo / Loki: hỏi API truy vấn, không hỏi /ready
  // /ready của Tempo / Loki đo bộ ghi (ingester) — trả 503 "waiting for 15s after being ready" từng lúc trong khi truy vấn vẫn chạy
  // (đo trên bản 2.6.1 / 3.3.2, 2026-11-01). Bàn điều tra chỉ đọc nên hỏi đường nhẹ của API truy vấn.
  const path = { tempo: '/api/echo', loki: '/loki/api/v1/status/buildinfo', prometheus: '/-/ready', alertmanager: '/-/ready' }[b];
  try {
    const res = await fetch(base + path, { signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
    return res.ok ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

/** Chuỗi trong LogQL / TraceQL: đặt trong ngoặc kép, thoát \ và " (và xuống dòng). Khuôn Zod đã chặn trước — đây là lớp thứ hai. */
export function quote(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`;
}

// ---------------------------------------------------------------- Loki ----

/** Bộ lọc tuỳ chọn của màn Nhật ký — mọi giá trị đã qua khuôn Zod ở route. */
export interface LogFilter {
  level?: 'error' | 'warn' | 'info';
  errCode?: string;
  evt?: string;
  route?: string;
  traceId?: string;
}

/** Mẫu LogQL đóng (20-KIEN-TRUC §3.1). `tenant` luôn do máy chủ gắn từ phiên. */
export const LOGQL = {
  byRequest: (requestId: string, tenant: string) => `{service="api"} | reqId=${quote(requestId)} | json | tenant=${quote(tenant)}`,
  byTrace: (traceId: string, tenant: string) => `{service="api"} | traceId=${quote(traceId)} | json | tenant=${quote(tenant)}`,
  // [2026-11-01 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W3: mẫu Nhật ký (bộ lọc tuỳ chọn) + số đo lỗi theo mã / yêu cầu chậm cho Tổng quan
  /** Nhật ký: nhãn `level` (promtail gắn) lọc ở bộ chọn luồng; còn lại lọc sau `| json`. Dòng không phải JSON bị bỏ (`__error__`). */
  list: (tenant: string, f: LogFilter) =>
    `{service="api"${f.level ? `, level=${quote(f.level)}` : ''}}` +
    (f.traceId ? ` | traceId=${quote(f.traceId)}` : '') +
    ` | json | __error__="" | tenant=${quote(tenant)}` +
    (f.errCode ? ` | errCode=${quote(f.errCode)}` : '') +
    (f.evt ? ` | evt=${quote(f.evt)}` : '') +
    (f.route ? ` | route=${quote(f.route)}` : ''),
  /** Số yêu cầu có mã lỗi trong khung, theo mã (truy vấn số đo, không trả dòng log). */
  errorsByCode: (tenant: string, range: string) =>
    `sum by (errCode) (count_over_time({service="api"} | json | __error__="" | tenant=${quote(tenant)} | errCode != "" [${range}]))`,
  /** Số dòng "xong yêu cầu" chậm hơn 1 giây trong khung. */
  slowRequests: (tenant: string, range: string) =>
    `sum(count_over_time({service="api"} | json | __error__="" | tenant=${quote(tenant)} | ms > 1000 [${range}]))`,
};

export interface LogLine {
  time: string;
  level: string;
  msg: string;
  [field: string]: unknown;
}

const LEVELS: Record<number, string> = { 10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal' };
/** Trường log được trả (20-KIEN-TRUC §3.3). `err` xử lý riêng. */
export const LOG_FIELDS = ['reqId', 'traceId', 'route', 'method', 'status', 'ms', 'errCode', 'evt', 'module', 'action', 'docType', 'docKey', 'version'] as const;

/** Một dòng log pino → dòng đã lọc; dòng không thuộc đơn vị (hoặc không phân tích được) → null. */
export function filterLogLine(raw: string, tenant: string, opts: { ops: boolean }): LogLine | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (o === null || typeof o !== 'object' || String(o.tenant ?? '') !== String(tenant)) return null;
  const line: LogLine = {
    time: typeof o.time === 'number' ? new Date(o.time).toISOString() : String(o.time ?? ''),
    level: typeof o.level === 'number' ? LEVELS[o.level] ?? String(o.level) : String(o.level ?? ''),
    msg: typeof o.msg === 'string' ? o.msg : '',
  };
  for (const k of LOG_FIELDS) {
    const v = o[k];
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') line[k] = v;
  }
  const err = o.err as Record<string, unknown> | undefined;
  if (err && typeof err === 'object') {
    // D019-7: chế độ Đơn vị chỉ thấy loại lỗi; thông điệp / ngăn xếp có thể chứa giá trị dữ liệu → chỉ chế độ Vận hành.
    line.err = {
      ...(typeof err.type === 'string' ? { type: err.type } : {}),
      ...(opts.ops && typeof err.message === 'string' ? { message: err.message } : {}),
      ...(opts.ops && typeof err.stack === 'string' ? { stack: err.stack } : {}),
    };
  }
  return line;
}

/**
 * Loki query_range theo mẫu → dòng đã lọc. Mặc định cũ trước mới sau (tra một yêu cầu); `newest: true` lấy N dòng MỚI NHẤT của
 * khung và trả mới trước (màn Nhật ký — không thì khung 24 giờ chỉ thấy 200 dòng đầu ngày).
 */
export async function queryLogs(query: string, tenant: string, range: { from: Date; to: Date }, opts: { ops: boolean; limit?: number; newest?: boolean }): Promise<LogLine[]> {
  const { body } = await getJson('loki', '/loki/api/v1/query_range', {
    query,
    start: String(BigInt(range.from.getTime()) * 1_000_000n),
    end: String(BigInt(range.to.getTime()) * 1_000_000n),
    limit: String(Math.min(opts.limit ?? LIMITS.logLines, LIMITS.logLines)),
    direction: opts.newest ? 'backward' : 'forward',
  });
  const result = ((body as { data?: { result?: unknown } } | null)?.data?.result ?? null) as { values?: [string, string][] }[] | null;
  if (!Array.isArray(result)) throw unavailable('loki', 'bad-response');
  const rows: { ns: bigint; line: LogLine }[] = [];
  for (const stream of result) {
    for (const v of Array.isArray(stream.values) ? stream.values : []) {
      const line = typeof v?.[1] === 'string' ? filterLogLine(v[1], tenant, opts) : null;
      if (line) rows.push({ ns: BigInt(String(v[0] ?? '0')), line });
    }
  }
  rows.sort((a, b) => (a.ns < b.ns ? -1 : a.ns > b.ns ? 1 : 0) * (opts.newest ? -1 : 1));
  return rows.slice(0, LIMITS.logLines).map((r) => r.line);
}

/** Truy vấn số đo tức thời của Loki (vector) → [{ nhãn, giá trị }]. */
export async function queryLogMetric(query: string, at = new Date()): Promise<{ metric: Record<string, string>; value: number }[]> {
  const { body } = await getJson('loki', '/loki/api/v1/query', { query, time: String(BigInt(at.getTime()) * 1_000_000n) });
  const result = (body as { data?: { result?: unknown } } | null)?.data?.result;
  if (!Array.isArray(result)) throw unavailable('loki', 'bad-response');
  return (result as { metric?: Record<string, string>; value?: [number, string] }[]).map((r) => ({ metric: r.metric ?? {}, value: Number(r.value?.[1] ?? 0) }));
}

// --------------------------------------------------------------- Tempo ----

/** Bộ lọc tìm trace — giá trị đã qua khuôn Zod ở route. */
export interface TraceFilter {
  outcome?: 'error' | 'rejected' | 'failed';
  module?: string;
  minDurationMs?: number;
}

/**
 * Mẫu TraceQL đóng (20-KIEN-TRUC §3.1): điều kiện đặt trên CÙNG một span mang `bizcity.tenant` (span HTTP sau xác thực, span
 * action) — máy chủ gắn đơn vị. `select` chỉ xin các thuộc tính cần hiện; kết quả vẫn lọc lại bằng TRACE_ATTRIBUTES.
 */
export function traceSearchQuery(tenant: string, f: TraceFilter): string {
  const cond = [`span.bizcity.tenant = ${quote(tenant)}`];
  if (f.outcome === 'failed') cond.push('span.bizcity.outcome != "ok"');
  else if (f.outcome) cond.push(`span.bizcity.outcome = ${quote(f.outcome)}`);
  if (f.module) cond.push(`span.bizcity.module = ${quote(f.module)}`);
  if (f.minDurationMs) cond.push(`duration > ${Math.trunc(f.minDurationMs)}ms`);
  return `{ ${cond.join(' && ')} } | select(span.bizcity.module, span.bizcity.action.id, span.bizcity.error.code, span.bizcity.outcome, span.http.route, span.http.response.status_code)`;
}

export interface TraceHit {
  traceId: string;
  rootName: string;
  startedAt: string;
  durationMs: number;
  /** Thuộc tính của span khớp (đã lọc) — gộp các span khớp của trace. */
  attributes: Record<string, string | number | boolean>;
}

/** Tempo /api/search → danh sách trace. Tempo bỏ số 0 đầu của traceID → đệm trái đủ 32 ký tự (20-KIEN-TRUC §2.5). */
export async function searchTraces(query: string, range: { from: Date; to: Date }, limit: number, allowed: ReadonlySet<string>): Promise<TraceHit[]> {
  const { body } = await getJson('tempo', '/api/search', {
    q: query,
    start: String(Math.floor(range.from.getTime() / 1000)),
    end: String(Math.ceil(range.to.getTime() / 1000)),
    limit: String(Math.min(limit, LIMITS.traces)),
    spss: '3',
  });
  const traces = (body as { traces?: unknown } | null)?.traces;
  if (!Array.isArray(traces)) throw unavailable('tempo', 'bad-response');
  return (traces as Record<string, unknown>[])
    .filter((t) => typeof t.traceID === 'string' && /^[0-9a-f]{1,32}$/i.test(t.traceID))
    .map((t) => {
      const attributes: Record<string, string | number | boolean> = {};
      const sets = (Array.isArray(t.spanSets) ? t.spanSets : t.spanSet ? [t.spanSet] : []) as { spans?: { attributes?: { key: string; value: Record<string, unknown> }[] }[] }[];
      for (const set of sets) for (const sp of set.spans ?? []) for (const a of sp.attributes ?? []) {
        if (!allowed.has(a.key) || a.key === 'bizcity.tenant' || attributes[a.key] !== undefined) continue;
        const v = a.value ?? {};
        const val = typeof v.stringValue === 'string' ? v.stringValue : v.intValue !== undefined ? Number(v.intValue) : typeof v.boolValue === 'boolean' ? v.boolValue : undefined;
        if (val !== undefined) attributes[a.key] = val;
      }
      return {
        traceId: (t.traceID as string).toLowerCase().padStart(32, '0'),
        rootName: typeof t.rootTraceName === 'string' ? t.rootTraceName : '',
        startedAt: new Date(Number(BigInt(String(t.startTimeUnixNano ?? '0')) / 1_000_000n)).toISOString(),
        durationMs: typeof t.durationMs === 'number' ? t.durationMs : 0,
        attributes,
      };
    });
}

/** Khung thời gian theo tên: Nhật ký ≤ 24 giờ, trace ≤ 7 ngày (D019-4). */
export const WINDOWS = { '1h': 3600_000, '6h': 6 * 3600_000, '24h': 24 * 3600_000, '7d': 7 * 24 * 3600_000 } as const;
export type WindowKey = keyof typeof WINDOWS;
export const windowRange = (w: WindowKey, now = new Date()) => ({ from: new Date(now.getTime() - WINDOWS[w]), to: now });

/** Khung thời gian tra log ≤ 24 giờ (D019-4): có mốc `at` thì ±12 giờ quanh mốc, không thì 24 giờ gần nhất; không vượt hiện tại. */
export function logWindow(at?: string, now = new Date()): { from: Date; to: Date } {
  const half = (LIMITS.logHours / 2) * 3600_000;
  if (at) {
    const t = new Date(at).getTime();
    const to = Math.min(t + half, now.getTime());
    return { from: new Date(to - 2 * half), to: new Date(to) };
  }
  return { from: new Date(now.getTime() - 2 * half), to: now };
}

// --------------------------------------------------------- giới hạn ----

const calls = new Map<string, number[]>();

/** ≤ 30 truy vấn / phút / người (D019-4). Bộ nhớ trong tiến trình — đủ cho một API; nhiều bản API thì mỗi bản đếm riêng. */
export function takeQuota(actor: string, now = Date.now()): void {
  const recent = (calls.get(actor) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= LIMITS.perMinute) {
    calls.set(actor, recent);
    throw Errors.rateLimited(`Bàn điều tra: quá ${LIMITS.perMinute} truy vấn / phút — chờ một lát rồi thử lại`);
  }
  recent.push(now);
  calls.set(actor, recent);
}

/** Cho test: xoá bộ đếm. */
export function resetQuota(): void {
  calls.clear();
}
