// [2026-11-02 10:42 AM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W4: màn của Bàn điều tra và bộ lọc trên địa chỉ; Kịch bản TH-01…TH-14 → màn có bộ lọc điền sẵn (T019-5).
/**
 * Bàn điều tra phía web — phần thuần (PHASE-019 W4, 20-KIEN-TRUC §4.1).
 *
 *   DEV_SCREENS  mỗi màn /dev/… và các tham số địa chỉ nó đọc (giá trị cho phép / khuôn, mặc định). Màn đọc bộ lọc bằng devParams()
 *                — tham số sai khuôn bị bỏ (về mặc định), không gửi lên API.
 *   devLink      dựng link tới một màn với bộ lọc; bỏ tham số bằng mặc định (link ngắn, gửi cho nhau được).
 *   KICH_BAN     mỗi tình huống TH-xx của Sổ tay điều tra lỗi (docs/ops/SO-TAY-DIEU-TRA-LOI.md) → nút mở màn với bộ lọc điền sẵn.
 *                Tiêu đề, triệu chứng đọc từ chính Sổ tay (web dùng import.meta.glob) — ở đây chỉ có đường đi.
 *
 * Ở hợp đồng (không DOM / React) để web dùng và API kiểm được bằng vitest (apps/api/test/kich-ban.test.ts, ca T019-5: mọi TH của Sổ tay
 * có kịch bản, mọi link trỏ tới màn có thật, mọi tham số điền sẵn được màn đích đọc lại đúng).
 */

export interface DevParam {
  /** Giá trị được nhận (danh sách đóng). */
  values?: readonly string[];
  /** Hoặc khuôn. */
  pattern?: RegExp;
  /** Mặc định khi thiếu / sai khuôn. */
  def?: string;
}

const TRACE = /^[0-9a-fA-F]{32}$/;
const REQUEST = /^[A-Za-z0-9._:-]{4,128}$/;
/** Ô lọc của Nhật ký: mã lỗi VIẾT_HOA, evt chữ thường, hoặc route bắt đầu bằng / (xem nhatKyFilter). */
const LOG_Q = /^(\/[A-Za-z0-9/_:.-]{0,200}|[A-Z][A-Z0-9_]{1,63}|[a-z0-9][a-z0-9._-]{0,63})$/;

export const DEV_SCREENS = {
  '/dev/tong-quan': { window: { values: ['1h', '24h'], def: '1h' } },
  '/dev/tra-ma': { ma: { pattern: /^([0-9a-fA-F]{32}|[A-Za-z0-9._:-]{4,128})$/ }, traceId: { pattern: TRACE }, requestId: { pattern: REQUEST }, tab: { values: ['cay', 'log', 'bang-chung'], def: 'cay' } },
  '/dev/nhat-ky': { window: { values: ['1h', '6h', '24h'], def: '1h' }, level: { values: ['error', 'warn', 'info'] }, q: { pattern: LOG_Q }, traceId: { pattern: TRACE } },
  '/dev/loi-theo-module': { window: { values: ['1h', '6h', '24h', '7d'], def: '24h' }, outcome: { values: ['error', 'rejected'], def: 'error' } },
  '/dev/ghi-so': { xem: { values: ['loi', 'treo'], def: 'loi' }, ngay: { values: ['1', '7', '30'], def: '7' } },
  '/dev/su-kien': { xem: { values: ['tat-ca', 'chet', 'cho'], def: 'tat-ca' } },
  '/dev/toan-ven': { kiem: { pattern: /^[A-Z][A-Z0-9_]{1,63}$/ } },
  '/dev/kich-ban': { th: { pattern: /^TH-\d{2}$/ } },
  // [2026-11-02 02:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W5: màn Vận hành (chỉ mở ở chế độ Vận hành — Q019-2)
  '/dev/van-hanh': {},
} as const satisfies Record<string, Record<string, DevParam>>;

export type DevPath = keyof typeof DEV_SCREENS;
export const DEV_PATHS = Object.keys(DEV_SCREENS) as DevPath[];

/** Đọc được bằng URLSearchParams của trình duyệt hoặc bất kỳ thứ gì có get(). */
export interface ParamSource { get(key: string): string | null }

const ok = (p: DevParam, v: string) => (p.values ? p.values.includes(v) : p.pattern ? p.pattern.test(v) : false);

/** Bộ lọc của một màn từ địa chỉ: chỉ khoá màn đó đọc; sai khuôn → mặc định (hoặc bỏ). */
export function devParams(path: DevPath, src: ParamSource): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, p] of Object.entries(DEV_SCREENS[path]) as [string, DevParam][]) {
    const v = src.get(k)?.trim() ?? '';
    if (v && ok(p, v)) out[k] = v;
    else if (p.def !== undefined) out[k] = p.def;
  }
  return out;
}

/** Link tới màn với bộ lọc — bỏ tham số bằng mặc định; tham số lạ / sai khuôn là lỗi của người viết (ném). */
export function devLink(path: DevPath, filter: Record<string, string> = {}): string {
  const spec = DEV_SCREENS[path] as Record<string, DevParam>;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    const p = spec[k];
    if (!p || !ok(p, v)) throw new Error(`devLink(${path}): tham số ${k}=${v} không hợp lệ`);
    if (v !== p.def) q.set(k, v);
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/** Ô lọc chung của Nhật ký → đúng một bộ lọc của API; sai khuôn → null (báo người dùng, không gửi). */
export function nhatKyFilter(q: string): { errCode?: string; evt?: string; route?: string } | null {
  const v = q.trim();
  if (!v) return {};
  if (v.startsWith('/')) return /^\/[A-Za-z0-9/_:.-]{0,200}$/.test(v) ? { route: v } : null;
  if (/^[A-Z][A-Z0-9_]{1,63}$/.test(v)) return { errCode: v };
  if (/^[a-z0-9][a-z0-9._-]{0,63}$/.test(v)) return { evt: v };
  return null;
}

export interface TinhHuong {
  id: string;
  title: string;
  /** Dòng "**Triệu chứng:**" (bỏ đánh dấu), rỗng nếu tình huống không có. */
  symptom: string;
  /** Phần thân markdown của tình huống (sau tiêu đề, tới tình huống kế tiếp / mục kế tiếp). */
  body: string;
}

/** Tách Sổ tay điều tra lỗi thành các tình huống theo tiêu đề `### TH-xx · Tên` (khuôn §1 của Sổ tay). */
export function tachSoTay(md: string): TinhHuong[] {
  const out: TinhHuong[] = [];
  const re = /^### (TH-\d{2}) · (.+)$/gm;
  const heads = [...md.matchAll(re)];
  heads.forEach((h, i) => {
    const start = h.index! + h[0].length;
    const next = heads[i + 1]?.index ?? md.length;
    // Thân dừng ở mục cấp 2 kế tiếp (## 3. Luật an toàn…) nếu tới trước tình huống kế tiếp.
    const section = md.slice(start, next);
    const body = section.split(/^## /m)[0]!.trim();
    const symptom = (body.match(/^- \*\*Triệu chứng:\*\*\s*(.+)$/m)?.[1] ?? '').replace(/\*\*|`/g, '').trim();
    out.push({ id: h[1]!, title: h[2]!.replace(/`/g, '').trim(), symptom, body });
  });
  return out;
}

export interface KichBanLink {
  label: string;
  path: DevPath;
  filter?: Record<string, string>;
}

export interface KichBan {
  links: KichBanLink[];
  /** Phần Bàn điều tra chưa trả lời được (số đo toàn hệ, Grafana) — nói thẳng thay vì im lặng. */
  note?: string;
}

/** Tình huống → màn (Sổ tay điều tra lỗi §2). Thêm TH mới vào Sổ tay thì thêm ở đây — ca T019-5 bắt thiếu. */
export const KICH_BAN: Record<string, KichBan> = {
  'TH-01': { links: [{ label: 'Tra mã', path: '/dev/tra-ma' }] },
  'TH-02': {
    links: [
      { label: 'Lỗi kỹ thuật theo module, 24 giờ', path: '/dev/loi-theo-module', filter: { window: '24h', outcome: 'error' } },
      { label: 'Nhật ký mức error, 24 giờ', path: '/dev/nhat-ky', filter: { window: '24h', level: 'error' } },
    ],
    note: 'Tỉ lệ 5xx của cả bản cài là số đo toàn hệ — người vận hành xem trên Grafana (dashboard 02).',
  },
  'TH-03': {
    links: [{ label: 'Tổng quan 24 giờ — ô yêu cầu chậm', path: '/dev/tong-quan', filter: { window: '24h' } }],
    note: 'Mở một trace chậm ở Tra mã: dòng "Chậm nhất" chỉ span tự thân tốn thời gian nhất. p95 theo route là số đo toàn hệ (Grafana).',
  },
  'TH-04': {
    links: [
      { label: 'Ghi sổ bị lỗi, 7 ngày', path: '/dev/ghi-so', filter: { xem: 'loi', ngay: '7' } },
      { label: 'Từ chối đúng luật theo module', path: '/dev/loi-theo-module', filter: { outcome: 'rejected' } },
    ],
  },
  'TH-05': {
    links: [
      { label: 'Chứng từ chờ / lỗi định khoản', path: '/dev/ghi-so', filter: { xem: 'treo' } },
      { label: 'Toàn vẹn — EVENT_PENDING_AGE', path: '/dev/toan-ven', filter: { kiem: 'EVENT_PENDING_AGE' } },
    ],
  },
  'TH-06': {
    links: [
      { label: 'Sự kiện chết theo nơi nhận', path: '/dev/su-kien', filter: { xem: 'chet' } },
      { label: 'Toàn vẹn — EVENT_DEAD', path: '/dev/toan-ven', filter: { kiem: 'EVENT_DEAD' } },
    ],
    note: 'Phát lại cho một nơi nhận làm ở màn Hệ thống (quyền settings:write, có bằng chứng) — Bàn điều tra không có nút ghi.',
  },
  'TH-07': { links: [{ label: 'Nhật ký IDEMPOTENCY_CONFLICT, 24 giờ', path: '/dev/nhat-ky', filter: { window: '24h', q: 'IDEMPOTENCY_CONFLICT' } }] },
  'TH-08': {
    links: [{ label: 'Tổng quan 24 giờ — yêu cầu chậm cùng lúc', path: '/dev/tong-quan', filter: { window: '24h' } }],
    note: 'Bão hoà pool kết nối là số đo toàn hệ — người vận hành xem trên Grafana (dashboard 03).',
  },
  'TH-09': { links: [{ label: 'Lỗi kỹ thuật theo module, 24 giờ', path: '/dev/loi-theo-module', filter: { window: '24h' } }], note: 'Mở trace ở Tra mã: span gọi ra ngoài có server.address và mã trạng thái.' },
  'TH-10': { links: [{ label: 'Toàn vẹn — tự chẩn đoán gần nhất', path: '/dev/toan-ven' }], note: 'sev1 — đọc RUNBOOK-CANH-BAO § LedgerIntegrityError, báo Nhóm Lõi.' },
  'TH-11': { links: [{ label: 'Lỗi kỹ thuật theo module, 7 ngày', path: '/dev/loi-theo-module', filter: { window: '7d' } }] },
  'TH-12': { links: [{ label: 'Lỗi kỹ thuật theo module, 24 giờ', path: '/dev/loi-theo-module', filter: { window: '24h' } }], note: 'Trace của công cụ MCP có span mcp tools/call; lỗi ở confirm mà không có span Kernel → chưa ghi gì.' },
  'TH-13': {
    links: [{ label: 'Vận hành — số đo toàn hệ', path: '/dev/van-hanh' }, { label: 'Tổng quan — dải nguồn', path: '/dev/tong-quan' }],
    note: 'Màn Vận hành chỉ mở ở bản cài một đơn vị bật DEVTOOLS_OPS=true, cho chủ đơn vị; còn lại người vận hành xem Prometheus / Grafana.',
  },
  'TH-14': { links: [{ label: 'Tổng quan — dải nguồn Tempo / Loki', path: '/dev/tong-quan' }] },
};

// [2026-11-02 02:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W5: "Chép cho AI" — một khối markdown từ trace đã lọc để dán vào công cụ AI code

/** Phần của một trace (khớp output core.devtools.trace) mà nội dung cho AI dùng. */
export interface TraceChoAI {
  traceId: string;
  durationMs: number;
  summary: {
    outcome: string;
    errorCode: string | null;
    stoppedAt: { name: string; module: string | null } | null;
    kernel: { state: string; ops: string[] };
    playbook: string | null;
    lines: string[];
  };
  spans: { spanId: string; parentId: string | null; name: string; durationMs: number; outcome: string; attributes: Record<string, string | number | boolean>; events?: { exceptionType?: string }[] }[];
}

/**
 * Thuộc tính span đưa sang AI: chỉ thứ chỉ tới MÃ NGUỒN (module, action, bước, bảng, route, mã lỗi). Không bizcity.tenant, không
 * request_id — AI không cần đơn vị nào, chỉ cần chỗ hỏng.
 */
const AI_ATTRS: Record<string, string> = {
  'http.route': 'route', 'http.response.status_code': 'status', 'bizcity.module': 'module', 'bizcity.action.id': 'action', 'bizcity.step': 'step',
  'bizcity.layer': 'layer', 'bizcity.kernel.op': 'kernel', 'bizcity.doc_type': 'docType', 'bizcity.error.code': 'error', 'db.operation.name': 'db',
  'db.collection.name': 'table', 'error.type': 'errorType', 'server.address': 'host', 'bizcity.event.type': 'event', 'bizcity.consumer': 'consumer',
  'bizcity.mcp.tool': 'mcpTool',
};
const MAX_SPANS = 60;

/**
 * Khối markdown "Chép cho AI" ở màn Tra mã: tóm tắt, cây span rút gọn, chỉ dẫn tìm mã theo tên span, việc phải làm (test tái hiện
 * trước — Sổ tay §4; không sửa Kernel / sổ — AGENTS.md). Đầu vào đã qua lọc của API (D019-7); hàm lọc thêm lần nữa theo AI_ATTRS.
 */
export function noiDungChoAI(t: TraceChoAI): string {
  const s = t.summary;
  const out: string[] = [];
  out.push(`## Lỗi cần sửa — trace ${t.traceId}`, '', '_Từ Bàn điều tra của open-ketoan. Chỉ có mã và tên bước — không có dữ liệu kế toán, không có đơn vị._', '');
  out.push('### Chuyện gì đã xảy ra', ...s.lines.map((l) => `- ${l}`), '');

  // Cây span: cha trước con, anh em theo thứ tự đầu vào; thụt lề theo cấp.
  const byId = new Map(t.spans.map((x) => [x.spanId, x]));
  const kids = new Map<string | null, TraceChoAI['spans']>();
  for (const x of t.spans) {
    const k = x.parentId && byId.has(x.parentId) ? x.parentId : null;
    kids.set(k, [...(kids.get(k) ?? []), x]);
  }
  const rows: string[] = [];
  const walk = (k: string | null, depth: number) => {
    for (const x of kids.get(k) ?? []) {
      if (rows.length < MAX_SPANS) {
        const attrs = Object.entries(x.attributes).filter(([a]) => AI_ATTRS[a]).map(([a, v]) => `${AI_ATTRS[a]}=${v}`);
        const ex = (x.events ?? []).map((e) => e.exceptionType).filter(Boolean);
        rows.push(`${'  '.repeat(depth)}- \`${x.name}\` — ${x.outcome}, ${Math.round(x.durationMs * 10) / 10} ms${attrs.length ? ` [${attrs.join(', ')}]` : ''}${ex.length ? ` (ngoại lệ ${ex.join(', ')})` : ''}`);
      }
      walk(x.spanId, depth + 1);
    }
  };
  walk(null, 0);
  out.push(`### Cây span (${t.spans.length} span, ${Math.round(t.durationMs * 10) / 10} ms)`, ...rows);
  if (t.spans.length > MAX_SPANS) out.push(`- … còn ${t.spans.length - MAX_SPANS} span (xem trên Bàn điều tra)`);
  out.push('');

  const where: string[] = [];
  for (const x of t.spans) {
    const a = x.attributes;
    if (typeof a['bizcity.action.id'] === 'string') where.push(`- \`action ${a['bizcity.action.id']}\` → \`defineAction({ id: '${a['bizcity.action.id']}' … })\` trong \`apps/api/src/phan-he/${a['bizcity.module'] ?? '<module>'}/\` (hoặc \`apps/api/src/modules/\` nếu module là core)`);
    if (typeof a['bizcity.step'] === 'string') where.push(`- \`step ${a['bizcity.step']}\` → \`ctx.trace.step('${String(a['bizcity.step']).split('.').slice(1).join('.')}', …)\` trong module \`${a['bizcity.module'] ?? String(a['bizcity.step']).split('.')[0]}\``);
    if (a['bizcity.layer'] === 'K') where.push(`- \`${x.name}\` là **Kernel** — không sửa Kernel trong PR phân hệ; Kernel từ chối nghĩa là dữ liệu sai đã tới được đây, sửa ở chỗ gửi`);
  }
  out.push('### Tìm mã ở đâu', ...[...new Set(where)]);
  if (s.playbook) out.push(`- Tình huống giống **${s.playbook}** — đọc \`docs/ops/SO-TAY-DIEU-TRA-LOI.md\` mục ${s.playbook}`);
  out.push('');

  const at = s.stoppedAt ? `${s.stoppedAt.name}${s.stoppedAt.module ? ` (module ${s.stoppedAt.module})` : ''}` : 'span đầu tiên khác ok';
  out.push(
    '### Việc cần làm',
    `1. Viết test tái hiện trong \`apps/api/test/\` (dùng \`setupTenant\` / \`call\` ở \`apps/api/test/helpers.ts\`): phải đỏ đúng ${s.errorCode ? `mã \`${s.errorCode}\`` : 'kết quả lỗi'}, đúng chỗ ${at}. Dữ liệu trong test là dữ liệu giả.`,
    s.outcome === 'rejected'
      ? '2. Đây là **từ chối đúng luật** — hệ thống làm đúng. Sửa chỗ để dữ liệu sai đi tới đây (kiểm sớm ở giao diện / module, báo người dùng), không nới luật.'
      : '2. Sửa ở đúng tầng chỗ hỏng; không vá Kernel, không UPDATE / DELETE bảng `ledger_*`, không viết số tài khoản trong code.',
    '3. Chạy lại test, `npm run typecheck`, `node tests/conformance/selfcheck.mjs`.',
    '',
    'Luật khi dùng AI sửa lỗi: `AGENTS.md` mục "Sửa lỗi bằng AI từ Bàn điều tra".',
  );
  return out.join('\n');
}
