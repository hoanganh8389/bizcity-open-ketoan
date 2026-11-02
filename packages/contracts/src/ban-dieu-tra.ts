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
  'TH-13': { links: [{ label: 'Tổng quan — dải nguồn', path: '/dev/tong-quan' }], note: 'Số đo đứng yên là việc của người vận hành (Prometheus, Grafana) — chế độ Vận hành (W5).' },
  'TH-14': { links: [{ label: 'Tổng quan — dải nguồn Tempo / Loki', path: '/dev/tong-quan' }] },
};
