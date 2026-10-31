// @bizcity-layer P observability
// [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp.
/**
 * Số đo Prometheus (docs/ops/OBSERVABILITY.md §3) — bộ đếm / gauge / histogram tối thiểu, định dạng văn bản Prometheus 0.0.4,
 * không cần gói ngoài. Không import CSDL (db/client.ts gọi observeDbQuery ở đây — tránh vòng import).
 * Luật R-OBS-4: nhãn chỉ có tập giá trị nhỏ (route, method, status, code, action, tool, kind) — KHÔNG tenant, actor, docKey, reqId.
 */
import { monitorEventLoopDelay } from 'node:perf_hooks';

type Labels = Record<string, string>;
const key = (l: Labels) => JSON.stringify(Object.entries(l).sort(([a], [b]) => a.localeCompare(b)));
const fmtLabels = (l: Labels) => {
  const e = Object.entries(l);
  return e.length ? `{${e.map(([k, v]) => `${k}="${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`).join(',')}}` : '';
};

interface Metric { name: string; help: string; type: 'counter' | 'gauge' | 'histogram'; render(): string[] }
const registry: Metric[] = [];

export class Counter implements Metric {
  readonly type = 'counter';
  private values = new Map<string, { labels: Labels; v: number }>();
  constructor(readonly name: string, readonly help: string) { registry.push(this); }
  inc(labels: Labels = {}, n = 1): void {
    const k = key(labels);
    const cur = this.values.get(k);
    if (cur) cur.v += n; else this.values.set(k, { labels, v: n });
  }
  render() { return [...this.values.values()].map((x) => `${this.name}${fmtLabels(x.labels)} ${x.v}`); }
}

export class Gauge implements Metric {
  readonly type = 'gauge';
  private values = new Map<string, { labels: Labels; v: number }>();
  constructor(readonly name: string, readonly help: string) { registry.push(this); }
  set(labels: Labels, v: number): void { this.values.set(key(labels), { labels, v }); }
  render() { return [...this.values.values()].map((x) => `${this.name}${fmtLabels(x.labels)} ${x.v}`); }
}

export class Histogram implements Metric {
  readonly type = 'histogram';
  private values = new Map<string, { labels: Labels; buckets: number[]; sum: number; count: number }>();
  constructor(readonly name: string, readonly help: string, readonly bounds: number[]) { registry.push(this); }
  observe(labels: Labels, v: number): void {
    const k = key(labels);
    let cur = this.values.get(k);
    if (!cur) this.values.set(k, (cur = { labels, buckets: this.bounds.map(() => 0), sum: 0, count: 0 }));
    for (let i = 0; i < this.bounds.length; i++) if (v <= this.bounds[i]!) cur.buckets[i]!++;
    cur.sum += v;
    cur.count++;
  }
  render() {
    const out: string[] = [];
    for (const x of this.values.values()) {
      this.bounds.forEach((b, i) => out.push(`${this.name}_bucket${fmtLabels({ ...x.labels, le: String(b) })} ${x.buckets[i]}`));
      out.push(`${this.name}_bucket${fmtLabels({ ...x.labels, le: '+Inf' })} ${x.count}`);
      out.push(`${this.name}_sum${fmtLabels(x.labels)} ${x.sum}`);
      out.push(`${this.name}_count${fmtLabels(x.labels)} ${x.count}`);
    }
    return out;
  }
}

const HTTP_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const DB_BUCKETS = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

export const metrics = {
  buildInfo: new Gauge('bizcity_build_info', 'Phiên bản đang chạy (luôn = 1)'),
  httpRequests: new Counter('bizcity_http_requests_total', 'Số yêu cầu HTTP theo route, method, status'),
  httpDuration: new Histogram('bizcity_http_request_duration_seconds', 'Thời gian xử lý yêu cầu HTTP (giây)', HTTP_BUCKETS),
  httpErrors: new Counter('bizcity_http_errors_total', 'Phản hồi lỗi theo mã lỗi (bizcity_errors@1)'),
  dbDuration: new Histogram('bizcity_db_query_duration_seconds', 'Thời gian truy vấn CSDL (giây) theo loại câu', DB_BUCKETS),
  dbErrors: new Counter('bizcity_db_query_errors_total', 'Truy vấn CSDL lỗi'),
  dbPool: new Gauge('bizcity_db_pool_connections', 'Kết nối trong pool theo trạng thái'),
  actions: new Counter('bizcity_actions_total', 'Lần chạy action (bizcity_action@1) theo kết quả, mã lỗi'),
  mcpCalls: new Counter('bizcity_mcp_tool_calls_total', 'Lần gọi công cụ MCP theo kết quả'),
  ledgerEvents: new Gauge('bizcity_ledger_events', 'Sự việc kế toán theo trạng thái (mọi đơn vị, đo mỗi 60 giây)'),
  ledgerOldestPending: new Gauge('bizcity_ledger_events_oldest_pending_seconds', 'Tuổi sự việc chờ định khoản / lỗi lâu nhất (giây)'),
  ledgerEntries24h: new Gauge('bizcity_ledger_entries_last_24h', 'Bút toán ghi trong 24 giờ qua'),
  diagnosticsErrors: new Gauge('bizcity_diagnostics_errors', 'Số kiểm mức error của lượt tự chẩn đoán gần nhất theo tầng'),
  heapUsed: new Gauge('nodejs_heap_used_bytes', 'Heap V8 đang dùng'),
  heapTotal: new Gauge('nodejs_heap_total_bytes', 'Heap V8 đã cấp'),
  eventLoopLag: new Gauge('nodejs_eventloop_lag_seconds', 'Độ trễ event loop p99 (giây)'),
  rss: new Gauge('process_resident_memory_bytes', 'Bộ nhớ tiến trình (RSS)'),
  cpu: new Counter('process_cpu_seconds_total', 'Thời gian CPU của tiến trình (giây)'),
  startTime: new Gauge('process_start_time_seconds', 'Lúc tiến trình khởi động (giây Unix)'),
};

/** Loại câu SQL cho nhãn kind (ít giá trị). */
export function observeDbQuery(sqlText: string, ms: number, failed: boolean): void {
  const verb = /^\s*(?:with\b[\s\S]*?\)\s*)?(select|insert|update|delete)\b/i.exec(sqlText)?.[1]?.toLowerCase();
  metrics.dbDuration.observe({ kind: verb ?? 'other' }, ms / 1000);
  if (failed) metrics.dbErrors.inc();
}

/**
 * Bộ thu số đo nghiệp vụ (đọc CSDL): Kernel / module đăng ký, chạy khi Prometheus đọc /metrics nhưng tối đa một lần mỗi
 * `everyMs` (mặc định 60 giây) — không có hẹn giờ chạy nền. Cùng tên đăng ký lại thì thay (buildApp chạy nhiều lần trong test).
 */
const collectors = new Map<string, { fn: () => Promise<void>; everyMs: number; last: number }>();
export function registerCollector(name: string, fn: () => Promise<void>, everyMs = 60_000): void {
  collectors.set(name, { fn, everyMs, last: 0 });
}
export async function collect(log?: { warn(o: unknown, m: string): void }): Promise<void> {
  const now = Date.now();
  await Promise.all([...collectors.entries()].filter(([, c]) => now - c.last >= c.everyMs).map(async ([name, c]) => {
    c.last = now;
    try {
      await c.fn();
    } catch (err) {
      log?.warn({ err, collector: name }, 'bộ thu số đo lỗi');
    }
  }));
}

const loop = monitorEventLoopDelay({ resolution: 20 });
loop.enable();
const started = Date.now() / 1000;
let cpuSeen = 0;

/** Văn bản Prometheus của mọi số đo; số đo tiến trình đọc ngay lúc gọi. */
export function renderMetrics(): string {
  const mem = process.memoryUsage();
  metrics.heapUsed.set({}, mem.heapUsed);
  metrics.heapTotal.set({}, mem.heapTotal);
  metrics.rss.set({}, mem.rss);
  metrics.eventLoopLag.set({}, loop.percentile(99) / 1e9);
  const cpu = process.cpuUsage();
  const cpuNow = (cpu.user + cpu.system) / 1e6;
  metrics.cpu.inc({}, cpuNow - cpuSeen);
  cpuSeen = cpuNow;
  metrics.startTime.set({}, started);
  const out: string[] = [];
  for (const m of registry) {
    const lines = m.render();
    if (!lines.length) continue;
    out.push(`# HELP ${m.name} ${m.help}`, `# TYPE ${m.name} ${m.type}`, ...lines);
  }
  return out.join('\n') + '\n';
}
