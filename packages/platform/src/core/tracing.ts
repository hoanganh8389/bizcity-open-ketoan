// @bizcity-layer P observability
// [2026-11-01 04:13 PM Johnny Chu - Chu Hoàng Anh] ADR-0010 — OpenTelemetry từ lõi (PHASE-018 W5): span ở khớp nối Platform + cổng Kernel, lọc thuộc tính, traceparent qua outbox
/**
 * TRUY VẾT OpenTelemetry (ADR-0010; docs/ops/OBSERVABILITY.md §1.1) — lớp 3 của sáu lớp bảo đảm: CHỈ QUAN SÁT.
 * Span không chứng minh việc đã ghi sổ (giao dịch bọc ngoài vẫn có thể huỷ); sự thật nằm ở posting_log / ledger_* / audit_logs.
 *
 * Đây là tệp DUY NHẤT import @opentelemetry/* (R-OBS-7, check SC-OBS-2). Kernel, module, add-in tạo span qua các hàm ở đây
 * hoặc ctx.trace.step — không import SDK. Span đặt ở KHỚP NỐI mà mọi module đi qua (bảng S1–S9, OBSERVABILITY §1.1):
 *
 *   initTracing()            gọi đầu tiên ở main.ts: TracerProvider + ngữ cảnh theo AsyncLocalStorage + lan truyền W3C traceparent
 *                            + span gọi ra ngoài (fetch / undici, S8). Không đặt OTEL_EXPORTER_OTLP_ENDPOINT → vẫn sinh traceId
 *                            (log, phản hồi lỗi, bằng chứng) nhưng không gửi đi đâu. OTEL_SDK_DISABLED=true → không đăng ký gì.
 *   traced / withSpan        span cho một bước (đồng bộ hay async). Lỗi → bizcity.error.code + bizcity.outcome theo errorKind:
 *                            từ chối đúng luật (kỳ khoá, không cân…) là 'rejected', KHÔNG đặt trạng thái ERROR (không phải sự cố);
 *                            lỗi kỹ thuật là 'error' + trạng thái ERROR.
 *   traceKernelFn / Api      bọc cổng kernel/public.ts (S4) — Kernel không biết gì về OpenTelemetry.
 *   startServerSpan …        span yêu cầu HTTP (S1), core/observability.ts gọi.
 *   traceDbQuery             span CSDL (S5) dựng từ log của Kysely: chỉ loại câu + bảng, KHÔNG câu SQL, KHÔNG tham số; chỉ khi có span cha.
 *   currentTraceId / currentTraceparent / linksFrom   cho log, phản hồi lỗi, bằng chứng, outbox (S6 → S7 nối bằng span link).
 *
 * An toàn (ADR-0010 §4): mọi thuộc tính đi qua DANH SÁCH CHO PHÉP ở bộ xuất (AllowlistExporter) — thuộc tính khác bị bỏ trước khi
 * rời tiến trình, kể cả của thư viện (undici gắn url.full có query, MST…). Thông điệp trạng thái / ngoại lệ bị bỏ (có thể chứa dữ
 * liệu). Hàng đợi xuất có trần, đầy thì bỏ; lỗi xuất bị SDK nuốt: hỏng truy vết không bao giờ hỏng ghi sổ (O-3).
 */
import {
  context, INVALID_SPAN_CONTEXT, propagation, ROOT_CONTEXT, SpanKind, SpanStatusCode, trace,
  type Attributes, type Context, type Link, type Span,
} from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator, type ExportResult } from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, SimpleSpanProcessor, TracerProvider, type ReadableSpan, type SpanExporter, type SpanProcessor } from '@opentelemetry/sdk-trace';
import { env } from '../config/env.js';
import { errorCodeOf, errorKind } from './errors.js';
import { BUILD_VERSION } from './version.js';

export { SpanKind };
export type { Span };

/**
 * Thuộc tính được phép rời tiến trình (ADR-0010 §4, bảng OBSERVABILITY §1.1). Thêm khoá mới: sửa bảng §1.1 cùng PR (R-OBS-8).
 * KHÔNG BAO GIỜ thêm: payload, số tiền, tên, MST, SĐT, số tài khoản ngân hàng, câu / tham số SQL, URL đầy đủ, header xác thực, token.
 */
export const TRACE_ATTRIBUTES: ReadonlySet<string> = new Set([
  // chuẩn OpenTelemetry — HTTP (route mẫu, không URL thật), CSDL, gọi ra ngoài
  'http.request.method', 'http.route', 'http.response.status_code', 'server.address', 'server.port', 'network.protocol.version',
  'db.system.name', 'db.operation.name', 'db.collection.name', 'error.type', 'exception.type',
  // của Bizcity
  'bizcity.module', 'bizcity.layer', 'bizcity.kernel.op', 'bizcity.outcome', 'bizcity.error.code', 'bizcity.doc_type',
  'bizcity.action.id', 'bizcity.action.effect', 'bizcity.dry_run', 'bizcity.idempotency', 'bizcity.step',
  'bizcity.event.type', 'bizcity.consumer', 'bizcity.delivery.result', 'bizcity.delivery.attempt',
  'bizcity.mcp.tool', 'bizcity.mcp.via', 'bizcity.mcp.phase', 'bizcity.tenant', 'bizcity.request_id',
]);

export function allowedAttributes(attrs: Attributes | undefined): Attributes {
  const out: Attributes = {};
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== undefined && TRACE_ATTRIBUTES.has(k)) out[k] = v;
  return out;
}

/** Bản chép của span chỉ còn thuộc tính được phép (cả của sự kiện); bỏ thông điệp trạng thái và thuộc tính của link. */
function filterSpan(s: ReadableSpan): ReadableSpan {
  return {
    name: s.name, kind: s.kind, spanContext: () => s.spanContext(), parentSpanContext: s.parentSpanContext,
    startTime: s.startTime, endTime: s.endTime, duration: s.duration, ended: s.ended,
    status: { code: s.status.code }, attributes: allowedAttributes(s.attributes),
    links: s.links.map((l) => ({ context: l.context })),
    events: s.events.map((e) => ({ name: e.name, time: e.time, attributes: allowedAttributes(e.attributes) })),
    resource: s.resource, instrumentationScope: s.instrumentationScope,
    droppedAttributesCount: s.droppedAttributesCount, droppedEventsCount: s.droppedEventsCount, droppedLinksCount: s.droppedLinksCount,
  };
}

/** Bộ xuất bọc ngoài mọi bộ xuất thật: lọc theo danh sách cho phép trước khi span rời tiến trình. */
export class AllowlistExporter implements SpanExporter {
  constructor(private readonly inner: SpanExporter) {}
  export(spans: ReadableSpan[], done: (r: ExportResult) => void): void {
    this.inner.export(spans.map(filterSpan), done);
  }
  shutdown(): Promise<void> {
    return this.inner.shutdown();
  }
  forceFlush(): Promise<void> {
    return this.inner.forceFlush?.() ?? Promise.resolve();
  }
}

let provider: TracerProvider | null = null;

export interface TracingOptions {
  /** Test: bộ xuất (vd InMemorySpanExporter) — xuất ngay từng span, vẫn qua bộ lọc. Không có thì theo OTEL_EXPORTER_OTLP_ENDPOINT. */
  exporter?: SpanExporter;
}

/** Bật truy vết một lần cho tiến trình. Trả provider (null khi OTEL_SDK_DISABLED=true). */
export function initTracing(opts: TracingOptions = {}): TracerProvider | null {
  if (provider || env.OTEL_SDK_DISABLED === 'true') return provider;
  const processors: SpanProcessor[] = [];
  if (opts.exporter) {
    processors.push(new SimpleSpanProcessor({ exporter: new AllowlistExporter(opts.exporter) }));
  } else if (env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    // Gom theo lô, hàng đợi có trần: Collector chậm / sập thì bỏ span, không giữ bộ nhớ, không chặn yêu cầu.
    processors.push(new BatchSpanProcessor({
      exporter: new AllowlistExporter(new OTLPTraceExporter({ timeoutMillis: 5_000 })),
      maxQueueSize: 2_048, maxExportBatchSize: 512, scheduledDelayMillis: 2_000, exportTimeoutMillis: 10_000,
    }));
  }
  provider = new TracerProvider({
    resource: resourceFromAttributes({ 'service.name': env.OTEL_SERVICE_NAME, 'service.version': BUILD_VERSION.version }),
    spanProcessors: processors,
  });
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  trace.setGlobalTracerProvider(provider);
  // S8: gọi ra ngoài bằng fetch (undici) — span con + chuyển tiếp traceparent; ngoài yêu cầu (không có span cha) thì không đo.
  unregister = registerInstrumentations({ tracerProvider: provider, instrumentations: [new UndiciInstrumentation({ requireParentforSpans: true })] });
  return provider;
}

let unregister: (() => void) | null = null;

/** Gửi nốt span còn trong hàng đợi khi tắt tiến trình (main.ts). Lỗi bỏ qua. */
export async function shutdownTracing(): Promise<void> {
  await provider?.shutdown().catch(() => undefined);
}

/** Test: gỡ hẳn truy vết khỏi API toàn cục (provider, ngữ cảnh, lan truyền, undici) — tệp test sau chạy như không có SDK. */
export async function disableTracing(): Promise<void> {
  await shutdownTracing();
  unregister?.();
  unregister = null;
  provider = null;
  trace.disable();
  context.disable();
  propagation.disable();
}

const tracer = trace.getTracer('bizcity-core', BUILD_VERSION.version);

/** Ghi lỗi lên span: mã lỗi chuẩn + từ chối nghiệp vụ / lỗi kỹ thuật. Chỉ lỗi kỹ thuật đặt trạng thái ERROR. */
export function markError(span: Span, err: unknown): void {
  const code = errorCodeOf(err);
  const kind = errorKind(code);
  span.setAttributes({ 'bizcity.error.code': code, 'bizcity.outcome': kind });
  if (kind === 'error') {
    span.setStatus({ code: SpanStatusCode.ERROR });
    span.addEvent('exception', { 'exception.type': err instanceof Error ? err.name : typeof err });
  }
}

export interface SpanOptions {
  kind?: SpanKind;
  attributes?: Attributes;
  links?: Link[];
  /** Mở trace mới (không làm con của span đang chạy) — vd lần giao sự kiện, nối về span phát bằng links. */
  root?: boolean;
  /** Chỉ tạo span khi đang có span cha ghi nhận (vd phát sự kiện từ đồng hồ mỗi phút: không có yêu cầu nào → không span rác). */
  requireParent?: boolean;
}

const NOOP_SPAN = trace.wrapSpanContext(INVALID_SPAN_CONTEXT);

/**
 * Chạy fn trong một span (fn đồng bộ hay trả Promise đều được — kết quả giữ nguyên dạng). Mặc định bizcity.outcome = 'ok';
 * lỗi → markError, ném lại nguyên lỗi. Không có SDK (test, OTEL_SDK_DISABLED) thì span là no-op, chi phí gần 0.
 */
export function traced<T>(name: string, opts: SpanOptions, fn: (span: Span) => T): T {
  const parent = opts.root ? ROOT_CONTEXT : context.active();
  if (opts.requireParent && !trace.getSpan(parent)?.isRecording()) return fn(NOOP_SPAN);
  const span = tracer.startSpan(name, {
    kind: opts.kind ?? SpanKind.INTERNAL, attributes: { 'bizcity.outcome': 'ok', ...opts.attributes }, links: opts.links, root: opts.root,
  }, parent);
  let out: T;
  try {
    out = context.with(trace.setSpan(parent, span), fn, undefined, span);
  } catch (err) {
    markError(span, err);
    span.end();
    throw err;
  }
  if (out && typeof (out as { then?: unknown }).then === 'function') {
    return (out as unknown as Promise<unknown>).then(
      (v) => { span.end(); return v; },
      (err: unknown) => { markError(span, err); span.end(); throw err; },
    ) as T;
  }
  span.end();
  return out;
}

export function withSpan<T>(name: string, opts: SpanOptions, fn: (span: Span) => Promise<T>): Promise<T> {
  return traced(name, opts, fn);
}

/** Loại chứng từ trong tham số (đối tượng có docType dạng mã) — thuộc tính bizcity.doc_type của span Kernel. */
function docTypeOf(args: unknown[]): Attributes {
  for (const a of args) {
    const t = a && typeof a === 'object' ? (a as { docType?: unknown }).docType : undefined;
    if (typeof t === 'string' && /^[a-z_]{2,40}$/.test(t)) return { 'bizcity.doc_type': t };
  }
  return {};
}

const kernelAttrs = (op: string, args: unknown[]): Attributes => ({ 'bizcity.layer': 'K', 'bizcity.kernel.op': op, ...docTypeOf(args) });

/** S4: một hàm ở cổng Kernel → span `kernel <op>`. Hàm đồng bộ vẫn đồng bộ. */
export function traceKernelFn<F extends (...args: never[]) => unknown>(op: string, fn: F): F {
  return function (this: unknown, ...args: never[]) {
    return traced(`kernel ${op}`, { attributes: kernelAttrs(op, args) }, () => fn.apply(this, args));
  } as unknown as F;
}

/** S4: một đối tượng dịch vụ ở cổng Kernel → mỗi lời gọi phương thức là span `kernel <tên>.<phương thức>`; `this` vẫn là đối tượng gốc. */
export function traceKernelApi<O extends object>(name: string, api: O): O {
  const cache = new WeakMap<object, unknown>();
  return new Proxy(api, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver) as unknown;
      if (typeof v !== 'function' || typeof prop !== 'string') return v;
      let w = cache.get(v);
      if (!w) {
        const op = `${name}.${prop}`;
        const f = v as (...a: unknown[]) => unknown;
        w = (...args: unknown[]) => traced(`kernel ${op}`, { attributes: kernelAttrs(op, args) }, () => f.apply(target, args));
        cache.set(v, w);
      }
      return w;
    },
  });
}

// ── S1: yêu cầu HTTP ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Phạm vi một span đang mở (để hook Fastify chạy tiếp trong ngữ cảnh của span) — kiểu mờ, ngoài tệp này không cần biết SDK. */
export interface TraceScope {
  readonly span: Span;
  readonly ctx: Context;
}

/** Mở span server, nhận traceparent của bên gọi (Cell, plugin, proxy). */
export function startServerSpan(method: string, route: string, headers: Record<string, unknown>, requestId: string): TraceScope {
  const parent = propagation.extract(ROOT_CONTEXT, headers);
  const span = tracer.startSpan(`HTTP ${method} ${route}`, {
    kind: SpanKind.SERVER,
    attributes: { 'http.request.method': method, 'http.route': route, 'bizcity.request_id': requestId, 'bizcity.outcome': 'ok' },
  }, parent);
  return { span, ctx: trace.setSpan(parent, span) };
}

/** Chạy fn trong ngữ cảnh của span (hook onRequest dạng callback: done chạy bên trong). */
export function runInScope<T>(scope: TraceScope, fn: () => T): T {
  return context.with(scope.ctx, fn);
}

/** Đóng span HTTP: mã trạng thái, mã lỗi (từ chối nghiệp vụ / lỗi kỹ thuật); 5xx mới là ERROR. */
export function endServerSpan(scope: TraceScope, status: number, errCode?: string): void {
  const { span } = scope;
  span.setAttribute('http.response.status_code', status);
  if (errCode) span.setAttributes({ 'bizcity.error.code': errCode, 'bizcity.outcome': status >= 500 ? 'error' : errorKind(errCode) });
  if (status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
  span.end();
}

// ── S5: câu CSDL ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const SKIP_SQL = /^\s*(begin|commit|rollback|savepoint|release|start\s+transaction|set\s)/i;
const IDENT = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/;
const OPS = new Set(['select', 'insert', 'update', 'delete', 'with']);

/** Loại câu + bảng chính (định danh, không phải dữ liệu). Không nhận ra thì chỉ có loại câu. */
export function sqlTarget(text: string): { op: string; table?: string } {
  const s = text.trimStart();
  const first = (/^(\w+)/.exec(s)?.[1] ?? '').toLowerCase();
  const op = OPS.has(first) ? first : 'other';
  const re = op === 'insert' ? /\binto\s+([\w".]+)/i : op === 'update' ? /^update\s+([\w".]+)/i : /\bfrom\s+([\w".]+)/i;
  const raw = re.exec(s)?.[1]?.replace(/"/g, '').toLowerCase();
  return raw && IDENT.test(raw) ? { op, table: raw } : { op };
}

/** Span CSDL dựng sau khi câu chạy xong (log của Kysely, db/client.ts). Chỉ khi đang có span cha ghi nhận. */
export function traceDbQuery(sqlText: string, durationMs: number, failed: boolean): void {
  if (!trace.getSpan(context.active())?.isRecording() || SKIP_SQL.test(sqlText)) return;
  const { op, table } = sqlTarget(sqlText);
  const end = Date.now();
  const span = tracer.startSpan(table ? `db ${op} ${table}` : `db ${op}`, {
    kind: SpanKind.CLIENT, startTime: end - durationMs,
    attributes: { 'db.system.name': 'postgresql', 'db.operation.name': op, ...(table ? { 'db.collection.name': table } : {}) },
  });
  if (failed) span.setStatus({ code: SpanStatusCode.ERROR });
  span.end(end);
}

// ── Nối trace với log, phản hồi lỗi, bằng chứng, outbox ─────────────────────────────────────────────────────────────────

/** traceId (32 hex) của span đang chạy, không có thì undefined. */
export function currentTraceId(): string | undefined {
  const sc = trace.getSpan(context.active())?.spanContext();
  return sc && trace.isSpanContextValid(sc) ? sc.traceId : undefined;
}

/** W3C traceparent của span đang chạy (lưu vào outbox), không có thì null. */
export function currentTraceparent(): string | null {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier.traceparent ?? null;
}

/** Link về span đã lưu traceparent (span giao sự kiện → span phát). Sai khuôn / rỗng → không link. */
export function linksFrom(traceparent: string | null | undefined): Link[] {
  if (!traceparent) return [];
  const sc = trace.getSpanContext(propagation.extract(ROOT_CONTEXT, { traceparent }));
  return sc && trace.isSpanContextValid(sc) ? [{ context: sc }] : [];
}
