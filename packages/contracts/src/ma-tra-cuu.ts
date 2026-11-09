// [2026-11-09 09:43 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — S022-18 (RV-R1-06): mã tra cứu mang step + remedy của details (BIZCITY-ERRORS §4b); chép / báo lỗi thêm dòng Bước
// [2026-11-01 09:28 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W1: mã tra cứu (requestId, traceId) cho mọi lỗi API; nội dung Báo lỗi chỉ gồm mã (D019-6).
/**
 * Mã tra cứu của lỗi API (PHASE-019 W1, 20-KIEN-TRUC §4.4).
 *
 * API trả `error.requestId` (luôn có, R-ERR-5) và `error.traceId` (khi truy vết bật, ADR-0010). Trước đây web bỏ mất hai mã này —
 * người dùng gặp lỗi không có gì để gửi cho dev. Tệp này giữ vài lỗi gần nhất để khay "Mã tra cứu" hiện ở mọi màn, và dựng nội dung
 * "Báo lỗi" theo mẫu `.github/ISSUE_TEMPLATE/bao-loi.yml`.
 *
 * Luật riêng tư (D019-6, repo công khai): nội dung chép / báo lỗi **chỉ gồm mã** — mã lỗi, `details.reason`, requestId, traceId,
 * đường dẫn đã bỏ query và thay đoạn không phải chữ thường bằng `:x`. Không có câu thông báo của máy chủ (có thể nêu tên khách, số
 * chứng từ), không có thân yêu cầu, không có dữ liệu trên màn.
 *
 * Ở hợp đồng (không đụng DOM / React) để web dùng và API kiểm được bằng vitest (apps/api/test/ma-tra-cuu.test.ts, ca T019-1).
 * Kho lỗi gần nhất (trạng thái của tab) ở apps/web/src/lib/maTraCuu.ts.
 */
import type { ErrorCode } from './api.js';
import { ERROR_CATALOG, ERROR_REASONS, ERROR_STEPS } from './errors.js';
import type { Remedy } from './remedy.js';

export interface LoiTraCuu {
  code: string;
  status: number;
  requestId?: string;
  traceId?: string;
  /** `details.reason` khi là mã (chữ hoa, số, `_`, `.`) — không lấy câu chữ. */
  reason?: string;
  /** `details.context.step` khi thuộc ERROR_STEPS (BIZCITY-ERRORS §4b) — bước của đường ghi sổ nơi lỗi xảy ra. */
  step?: string;
  /** `details.remedy` (bizcity_remedy@1) khi đúng khuôn: văn bản tĩnh của danh mục, không chứa dữ liệu. */
  remedy?: Remedy;
  /** Phương thức + đường dẫn API đã làm sạch, vd `POST /api/v1/documents/:x/post`. */
  api: string;
  /** Màn đang mở, đã làm sạch như trên. */
  screen: string;
  /** ISO, giờ máy người dùng. */
  at: string;
}

/** Từ chối đúng luật (người dùng sửa được) hay lỗi kỹ thuật (cần dev) — U2. Mã lạ / không có thân → kỹ thuật. */
export type LoaiLoi = 'tu-choi' | 'ky-thuat';

const REQ_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const TRACE_ID_RE = /^[0-9a-f]{32}$/;
const REASON_RE = /^[A-Z][A-Z0-9_.]{1,63}$/;
const PLAIN_SEG_RE = /^[a-z][a-z0-9-]*$/;

/** Bỏ query / hash; đoạn nào không phải chữ thường (mã, số, uuid, số chứng từ) thay bằng `:x`. */
export function lamSachDuongDan(path: string): string {
  const bare = path.split(/[?#]/)[0] ?? '';
  return bare.split('/').map((s) => (s === '' || PLAIN_SEG_RE.test(s) ? s : ':x')).join('/') || '/';
}

/** Nhận `details.remedy` chỉ khi đúng khuôn tối thiểu (mảng bước có chữ, owner, verify); sai khuôn thì bỏ, không báo lỗi. */
function docRemedy(v: unknown): Remedy | undefined {
  const r = v as Partial<Remedy> | null;
  if (!r || typeof r !== 'object' || !Array.isArray(r.steps) || r.steps.length === 0 || typeof r.owner !== 'string' || !r.verify || typeof r.verify !== 'object') return undefined;
  if (!r.steps.every((x) => x && typeof x.text === 'string')) return undefined;
  return r as Remedy;
}

/** Đọc phần `error` của thân phản hồi lỗi (và header X-Request-Id khi thân hỏng) thành mã tra cứu. Mã sai khuôn thì bỏ. */
export function docMaTuPhanHoi(input: {
  status: number;
  method: string;
  path: string;
  screen: string;
  error?: { code?: unknown; requestId?: unknown; traceId?: unknown; details?: unknown } | null;
  headerRequestId?: string | null;
  now?: Date;
}): LoiTraCuu {
  const e = input.error ?? {};
  const reqRaw = typeof e.requestId === 'string' ? e.requestId : input.headerRequestId ?? undefined;
  const traceRaw = typeof e.traceId === 'string' ? e.traceId.toLowerCase() : undefined;
  const det = (e.details && typeof e.details === 'object' && !Array.isArray(e.details) ? e.details : {}) as { reason?: unknown; context?: { step?: unknown }; remedy?: unknown };
  const reasonRaw = det.reason;
  const stepRaw = det.context?.step;
  const remedy = docRemedy(det.remedy);
  return {
    code: typeof e.code === 'string' && REASON_RE.test(e.code) ? e.code : input.status >= 500 || input.status === 0 ? 'INTERNAL_ERROR' : `HTTP_${input.status}`,
    status: input.status,
    ...(reqRaw && REQ_ID_RE.test(reqRaw) ? { requestId: reqRaw } : {}),
    ...(traceRaw && TRACE_ID_RE.test(traceRaw) ? { traceId: traceRaw } : {}),
    ...(typeof reasonRaw === 'string' && REASON_RE.test(reasonRaw) ? { reason: reasonRaw } : {}),
    ...(typeof stepRaw === 'string' && (ERROR_STEPS as readonly string[]).includes(stepRaw) ? { step: stepRaw } : {}),
    ...(remedy ? { remedy } : {}),
    api: `${input.method.toUpperCase()} ${lamSachDuongDan(input.path)}`,
    screen: lamSachDuongDan(input.screen),
    at: (input.now ?? new Date()).toISOString(),
  };
}

export function loaiLoi(e: Pick<LoiTraCuu, 'code' | 'status'>): LoaiLoi {
  const spec = ERROR_CATALOG[e.code as ErrorCode];
  if (spec) return spec.category === 'server' || spec.category === 'platform' ? 'ky-thuat' : 'tu-choi';
  return e.status >= 400 && e.status < 500 ? 'tu-choi' : 'ky-thuat';
}

/** Câu mặc định của mã (danh mục lỗi, không chứa dữ liệu) — thay cho câu của máy chủ trong nội dung chép. */
export function cauMacDinh(code: string): string {
  return ERROR_CATALOG[code as ErrorCode]?.message ?? 'Lỗi không có trong danh mục';
}

/** "req-1a2b… · 0af76519…" — rút gọn để hiện trên khay. */
export function tomTatMa(e: LoiTraCuu): string {
  const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
  return [e.requestId && cut(e.requestId, 16), e.traceId && cut(e.traceId, 8)].filter(Boolean).join(' · ') || '(không có mã)';
}

/** Nội dung nút **Chép**: đủ để dev tra (Sổ tay TH-01), không dữ liệu. */
export function noiDungChep(e: LoiTraCuu): string {
  return [
    `Mã lỗi: ${e.code}${e.reason ? ` (${e.reason})` : ''} — HTTP ${e.status}`,
    `requestId: ${e.requestId ?? '—'}`,
    `traceId: ${e.traceId ?? '—'}`,
    ...(e.step ? [`Bước: ${e.step}`] : []),
    `Lúc: ${e.at}`,
    `Màn: ${e.screen}`,
    `API: ${e.api}`,
  ].join('\n');
}

export interface PhienBan { version?: string; kernel?: string; standard?: string }

/** Nội dung nút **Báo lỗi** theo các ô của `bao-loi.yml`; phần người báo tự điền để trống có gợi ý. */
export function noiDungBaoLoi(e: LoiTraCuu, pb?: PhienBan): string {
  const v = pb ? [pb.version, pb.kernel, pb.standard].map((x) => x || '?').join(' / ') : '(xem GET /api/v1/system/health)';
  return [
    `**Mức độ:** ${loaiLoi(e) === 'ky-thuat' ? 'sev2? (lỗi kỹ thuật — chọn lại khi mở issue)' : 'sev3? (từ chối đúng luật — chọn lại khi mở issue)'}`,
    `**Phiên bản (version / kernel / standard):** ${v}`,
    `**requestId:** ${e.requestId ?? '—'}`,
    `**traceId:** ${e.traceId ?? '—'}`,
    `**Mã lỗi:** ${e.code}${e.reason ? ` / ${e.reason}` : ''} (HTTP ${e.status}) — ${cauMacDinh(e.code)}`,
    ...(e.step ? [`**Bước:** ${e.step}`] : []),
    `**Lúc:** ${e.at}`,
    `**Màn / API:** ${e.screen} → ${e.api}`,
    '',
    '**Các bước tái hiện:**',
    '1. Mở màn …',
    '2. Nhập … (dữ liệu mẫu / hư cấu, KHÔNG dán dữ liệu thật)',
    '3. Bấm …',
    '',
    '**Mong đợi và thực tế:**',
    '…',
  ].join('\n');
}

/** Mã lý do có trong danh mục Core thì kèm mô tả (dùng cho tooltip). */
export function moTaLyDo(reason?: string): string | undefined {
  return reason ? (ERROR_REASONS as Record<string, string>)[reason] : undefined;
}
