// @bizcity-layer P observability
// [2026-11-01 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W2: đọc trace Tempo (OTLP JSON), kiểm trace thuộc đơn vị (D019-5), lọc trường lần hai, tóm tắt "chuyện gì đã xảy ra"
/**
 * Trace cho Bàn điều tra (PHASE-019, 20-KIEN-TRUC §2.3, §3.2, §3.3). Hàm thuần — không gọi mạng — để test dựng trace giả.
 *
 *   parseTempoTrace  JSON của Tempo GET /api/traces/{id} (khuôn `batches`, hoặc `resourceSpans` / `trace.resourceSpans`) → span thô.
 *                    Tempo mã hoá id bằng base64; đổi về hex.
 *   ownsTrace        D019-5: thuộc đơn vị khi tập giá trị `bizcity.tenant` của mọi span đúng bằng { đơn vị của phiên }. Rỗng (yêu cầu
 *                    chưa xác thực) hoặc có đơn vị khác → KHÔNG thuộc — người gọi trả 404 giống hệt "không có" (không xác nhận tồn tại).
 *   viewTrace        lọc lần hai: chỉ thuộc tính trong TRACE_ATTRIBUTES (dùng chung hằng của core/tracing.ts), bỏ status.message,
 *                    sự kiện chỉ giữ tên + exception.type. Thời gian tương đối từ đầu trace (ms).
 *   summarize        luật cố định (không AI, không đoán): kết quả span gốc, chỗ dừng (span không-ok sâu nhất đầu tiên), Kernel có được
 *                    gọi không, span tự thân chậm nhất, sự kiện đã phát, tình huống gợi ý trong Sổ tay điều tra lỗi.
 */
import { TRACE_ATTRIBUTES } from '@bizcity/platform/core/tracing';

type AttrValue = string | number | boolean;

export interface RawSpan {
  spanId: string;
  parentId: string | null;
  name: string;
  kind: string;
  startNs: bigint;
  endNs: bigint;
  attributes: Record<string, AttrValue>;
  /** 0 = chưa đặt, 1 = ok, 2 = lỗi (OTLP). */
  statusCode: number;
  events: { name: string; attributes: Record<string, AttrValue> }[];
}

export type Outcome = 'ok' | 'rejected' | 'error';

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
  /** Mã tình huống trong docs/ops/SO-TAY-DIEU-TRA-LOI.md. */
  playbook: string | null;
  /** Câu kết luận tiếng Việt (U1) — dựng từ các trường trên. */
  lines: string[];
}

const HEX = /^[0-9a-f]+$/i;

/** Tempo trả id dạng base64 (OTLP JSON của Tempo 2.x); một số bản / công cụ trả hex. */
export function idToHex(id: unknown): string {
  if (typeof id !== 'string' || !id) return '';
  if (HEX.test(id) && (id.length === 32 || id.length === 16)) return id.toLowerCase();
  return Buffer.from(id, 'base64').toString('hex');
}

function attrValue(v: unknown): AttrValue | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.stringValue === 'string') return o.stringValue;
  if (o.intValue !== undefined) return Number(o.intValue);
  if (typeof o.doubleValue === 'number') return o.doubleValue;
  if (typeof o.boolValue === 'boolean') return o.boolValue;
  return undefined; // mảng / đối tượng: không có thuộc tính nào của ta dùng
}

function attrs(list: unknown): Record<string, AttrValue> {
  const out: Record<string, AttrValue> = {};
  if (Array.isArray(list)) {
    for (const a of list as { key?: unknown; value?: unknown }[]) {
      const v = attrValue(a?.value);
      if (typeof a?.key === 'string' && v !== undefined) out[a.key] = v;
    }
  }
  return out;
}

const KIND: Record<string, string> = { SPAN_KIND_SERVER: 'server', SPAN_KIND_CLIENT: 'client', SPAN_KIND_PRODUCER: 'producer', SPAN_KIND_CONSUMER: 'consumer', SPAN_KIND_INTERNAL: 'internal', '1': 'internal', '2': 'server', '3': 'client', '4': 'producer', '5': 'consumer' };
const STATUS: Record<string, number> = { STATUS_CODE_UNSET: 0, STATUS_CODE_OK: 1, STATUS_CODE_ERROR: 2 };

export function parseTempoTrace(json: unknown): RawSpan[] {
  const root = (json ?? {}) as Record<string, unknown>;
  const batches = (root.batches ?? root.resourceSpans ?? (root.trace as Record<string, unknown> | undefined)?.resourceSpans ?? []) as Record<string, unknown>[];
  const spans: RawSpan[] = [];
  for (const b of Array.isArray(batches) ? batches : []) {
    const scopes = (b.scopeSpans ?? b.instrumentationLibrarySpans ?? []) as Record<string, unknown>[];
    for (const sc of Array.isArray(scopes) ? scopes : []) {
      for (const s of (Array.isArray(sc.spans) ? sc.spans : []) as Record<string, unknown>[]) {
        const status = (s.status ?? {}) as { code?: unknown };
        spans.push({
          spanId: idToHex(s.spanId),
          parentId: idToHex(s.parentSpanId) || null,
          name: typeof s.name === 'string' ? s.name : '',
          kind: KIND[String(s.kind)] ?? 'internal',
          startNs: BigInt(String(s.startTimeUnixNano ?? '0')),
          endNs: BigInt(String(s.endTimeUnixNano ?? s.startTimeUnixNano ?? '0')),
          attributes: attrs(s.attributes),
          statusCode: typeof status.code === 'number' ? status.code : STATUS[String(status.code)] ?? 0,
          events: (Array.isArray(s.events) ? s.events : []).map((e: Record<string, unknown>) => ({ name: typeof e.name === 'string' ? e.name : '', attributes: attrs(e.attributes) })),
        });
      }
    }
  }
  return spans;
}

/** D019-5. */
export function ownsTrace(spans: readonly RawSpan[], tenantId: string): boolean {
  const tenants = new Set<string>();
  for (const s of spans) if (s.attributes['bizcity.tenant'] !== undefined) tenants.add(String(s.attributes['bizcity.tenant']));
  return tenants.size === 1 && tenants.has(String(tenantId));
}

function outcomeOf(s: RawSpan): Outcome {
  const o = s.attributes['bizcity.outcome'];
  if (o === 'ok' || o === 'rejected' || o === 'error') return o;
  return s.statusCode === 2 ? 'error' : 'ok';
}

const ms = (ns: bigint) => Math.round(Number(ns) / 1e3) / 1e3;

export function viewTrace(spans: readonly RawSpan[]): { startedAt: string | null; durationMs: number; spans: SpanView[] } {
  if (!spans.length) return { startedAt: null, durationMs: 0, spans: [] };
  const t0 = spans.reduce((m, s) => (s.startNs < m ? s.startNs : m), spans[0]!.startNs);
  const t1 = spans.reduce((m, s) => (s.endNs > m ? s.endNs : m), spans[0]!.endNs);
  const view = [...spans]
    .sort((a, b) => (a.startNs < b.startNs ? -1 : a.startNs > b.startNs ? 1 : 0))
    .map((s): SpanView => {
      const kept: Record<string, AttrValue> = {};
      for (const [k, v] of Object.entries(s.attributes)) if (TRACE_ATTRIBUTES.has(k)) kept[k] = v;
      return {
        spanId: s.spanId, parentId: s.parentId, name: s.name, kind: s.kind,
        startMs: ms(s.startNs - t0), durationMs: ms(s.endNs - s.startNs), outcome: outcomeOf(s), attributes: kept,
        events: s.events.map((e) => (typeof e.attributes['exception.type'] === 'string' ? { name: e.name, exceptionType: e.attributes['exception.type'] as string } : { name: e.name })),
      };
    });
  return { startedAt: new Date(Number(t0 / 1_000_000n)).toISOString(), durationMs: ms(t1 - t0), spans: view };
}

const LEDGER_CODES = new Set(['PERIOD_LOCKED', 'UNBALANCED_ENTRY', 'POSTING_FAILED']);

export function summarize(spans: readonly SpanView[]): TraceSummary {
  const ids = new Set(spans.map((s) => s.spanId));
  const children = new Map<string, SpanView[]>();
  for (const s of spans) if (s.parentId && ids.has(s.parentId)) children.set(s.parentId, [...(children.get(s.parentId) ?? []), s]);
  // Gốc: span không có cha trong trace (cha ở bên gọi ngoài vẫn tính là gốc); nhiều gốc → lấy span HTTP / sớm nhất.
  const roots = spans.filter((s) => !s.parentId || !ids.has(s.parentId));
  const root = roots.find((s) => s.kind === 'server') ?? roots[0] ?? null;
  const str = (s: SpanView | null, k: string) => (s && typeof s.attributes[k] === 'string' ? (s.attributes[k] as string) : null);

  // Chỗ dừng: từ gốc, còn con không-ok thì đi xuống con không-ok sớm nhất.
  let stopped: SpanView | null = null;
  if (root && root.outcome !== 'ok') {
    let cur: SpanView = root;
    for (;;) {
      const next: SpanView | undefined = (children.get(cur.spanId) ?? []).find((c) => c.outcome !== 'ok');
      if (!next) break;
      cur = next;
    }
    stopped = cur;
  } else {
    stopped = spans.find((s) => s.outcome !== 'ok') ?? null;
  }

  const kernelSpans = spans.filter((s) => s.attributes['bizcity.layer'] === 'K');
  const kernelState = !kernelSpans.length ? 'not-called'
    : kernelSpans.some((s) => s.outcome === 'error') ? 'error'
      : kernelSpans.some((s) => s.outcome === 'rejected') ? 'rejected' : 'ok';

  // Thời gian tự thân = thời gian của span trừ phần các con phủ (gộp đoạn chồng nhau).
  const selfMs = (s: SpanView) => {
    const kids = (children.get(s.spanId) ?? []).map((c) => [c.startMs, c.startMs + c.durationMs] as const).sort((a, b) => a[0] - b[0]);
    let covered = 0, curS = -1, curE = -1;
    for (const [a, b] of kids) {
      if (a > curE) { covered += curE - curS; curS = a; curE = b; } else curE = Math.max(curE, b);
    }
    covered += curE - curS;
    return Math.max(0, s.durationMs - covered);
  };
  const total = root?.durationMs ?? spans.reduce((m, s) => Math.max(m, s.startMs + s.durationMs), 0);
  const ranked = spans.map((s) => ({ s, self: selfMs(s) })).sort((a, b) => b.self - a.self);
  const top = ranked[0];
  const slowest = top ? { spanId: top.s.spanId, name: top.s.name, selfMs: Math.round(top.self * 1000) / 1000, share: total > 0 ? Math.round((top.self / total) * 100) / 100 : 0 } : null;

  const events = spans.filter((s) => s.name.startsWith('event publish ')).map((s) => str(s, 'bizcity.event.type') ?? s.name.slice('event publish '.length));
  const outcome: Outcome = root?.outcome ?? (spans.some((s) => s.outcome === 'error') ? 'error' : spans.some((s) => s.outcome === 'rejected') ? 'rejected' : 'ok');
  const errorCode = str(root, 'bizcity.error.code') ?? str(stopped, 'bizcity.error.code');
  const status = root && typeof root.attributes['http.response.status_code'] === 'number' ? (root.attributes['http.response.status_code'] as number) : null;
  const route = str(root, 'http.route');
  const stoppedModule = str(stopped, 'bizcity.module');

  // Tình huống gợi ý (Sổ tay điều tra lỗi) — luật cố định, thứ tự ưu tiên từ cụ thể tới chung.
  const playbook =
    spans.some((s) => s.attributes['bizcity.mcp.tool'] !== undefined && s.outcome !== 'ok') ? 'TH-12'
      : errorCode && LEDGER_CODES.has(errorCode) ? 'TH-04'
        : errorCode === 'IDEMPOTENCY_CONFLICT' ? 'TH-07'
          : spans.some((s) => s.name.startsWith('event deliver ') && s.outcome !== 'ok') ? 'TH-06'
            : spans.some((s) => s.kind === 'client' && s.attributes['server.address'] !== undefined && s.outcome === 'error') ? 'TH-09'
              : outcome === 'error' ? (stoppedModule && stoppedModule !== 'core' && stopped !== root ? 'TH-11' : 'TH-02')
                : outcome === 'rejected' ? 'TH-01'
                  : total > 1000 ? 'TH-03' : null;

  const lines: string[] = [];
  const verdict = outcome === 'ok' ? 'chạy xong, không lỗi' : outcome === 'rejected' ? 'bị từ chối đúng luật' : 'lỗi kỹ thuật';
  lines.push(route ? `${route}${status !== null ? ` → ${status}` : ''}, ${verdict}.` : `Trace ${verdict}.`);
  if (stopped && outcome !== 'ok') lines.push(`Dừng ở ${stopped.name}${stoppedModule ? ` (module ${stoppedModule})` : ''}${errorCode ? `, mã ${errorCode}` : ''}.`);
  const kernelOps = kernelSpans.map((s) => str(s, 'bizcity.kernel.op') ?? s.name.replace(/^kernel /, ''));
  lines.push(
    kernelState === 'not-called' ? 'Kernel không được gọi — sổ không đổi.'
      : kernelState === 'ok' ? `Kernel ${kernelOps.join(', ')} đã chạy, ok.`
        : kernelState === 'rejected' ? `Kernel ${kernelOps.join(', ')} từ chối — sổ không đổi.`
          : `Kernel ${kernelOps.join(', ')} lỗi kỹ thuật — xem span lỗi bên dưới.`,
  );
  if (slowest && spans.length > 1) lines.push(`Chậm nhất: ${slowest.name} ${slowest.selfMs} ms (${Math.round(slowest.share * 100)}% thời gian).`);
  if (events.length) lines.push(`Phát ${events.length} sự kiện: ${events.join(', ')}.`);
  if (playbook) lines.push(`Giống ${playbook} trong Sổ tay điều tra lỗi.`);

  return {
    outcome, route, status, errorCode,
    stoppedAt: stopped && outcome !== 'ok' ? { spanId: stopped.spanId, name: stopped.name, module: stoppedModule } : null,
    kernel: { state: kernelState, ops: kernelOps }, slowest, events, playbook, lines,
  };
}
