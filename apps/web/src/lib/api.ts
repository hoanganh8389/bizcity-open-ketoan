/**
 * Gọi API. Mọi màn hình gọi qua đây để thống nhất: gắn token, đọc khuôn { ok, data | error },
 * hết phiên thì đưa về trang đăng nhập.
 */
import type { ApiFailure, ApiSuccess } from '@ketoan/contracts';

const TOKEN_KEY = 'ketoan.token';

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number, public details?: unknown) {
    super(message);
  }
}

export const tokenStore = {
  get: () => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set: (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* chế độ riêng tư */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* bỏ qua */ } },
};

type Query = Record<string, string | number | boolean | undefined | null | string[]>;

function buildUrl(path: string, query?: Query): string {
  const url = new URL(path, window.location.origin);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  return url.pathname + url.search;
}

/**
 * Khoá chống gửi lặp (Idempotency-Key, bizcity_action@1 §8): một khoá cho một ý định thao tác. crypto.randomUUID chỉ có ở https /
 * localhost; máy chủ LAN chạy http thì dựng từ getRandomValues.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

interface WriteOptions {
  /** Khoá giữ nguyên qua các lần bấm của cùng một form (bấm đúp, gửi lại sau lỗi mạng). Không truyền = khoá mới mỗi lần gọi. */
  idempotencyKey?: string;
}

async function request<T>(method: string, path: string, opts: { query?: Query; body?: unknown; signal?: AbortSignal } & WriteOptions = {}): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const token = tokenStore.get();
  const res = await fetch(buildUrl(path, opts.query), {
    method,
    headers: {
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(method !== 'GET' ? { 'idempotency-key': opts.idempotencyKey ?? newIdempotencyKey() } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  let json: ApiSuccess<T> | ApiFailure;
  try {
    json = await res.json();
  } catch {
    throw new ApiError('INTERNAL_ERROR', res.status === 504 ? 'Quá thời gian chờ (504): báo cáo chạy lâu hơn giới hạn của máy chủ — thu hẹp chi nhánh / kho / kỳ rồi tìm lại' : `Máy chủ trả lỗi ${res.status}`, res.status);
  }
  if (!json.ok) {
    if (res.status === 401 && path !== '/api/v1/auth/login' && path !== '/api/v1/auth/wp-sso') {
      tokenStore.clear();
      window.dispatchEvent(new Event('ketoan:logout'));
    }
    throw new ApiError(json.error.code, json.error.message, res.status, json.error.details);
  }
  return { data: json.data, meta: json.meta as Record<string, unknown> | undefined };
}

export const api = {
  /** signal: huỷ được (react-query truyền vào queryFn) — báo cáo nặng bấm Huỷ thì trình duyệt cắt luôn yêu cầu. */
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>('GET', path, { query, signal }).then((r) => r.data),
  getPage: <T>(path: string, query?: Query) => request<T>('GET', path, { query }),
  post: <T>(path: string, body?: unknown, opts?: WriteOptions) => request<T>('POST', path, { body: body ?? {}, ...opts }).then((r) => r.data),
  put: <T>(path: string, body: unknown, opts?: WriteOptions) => request<T>('PUT', path, { body, ...opts }).then((r) => r.data),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, { body }).then((r) => r.data),
  delete: <T>(path: string) => request<T>('DELETE', path).then((r) => r.data),
  /** Lấy nội dung tệp (có gắn token) để xem ngay trên trang. */
  async blob(path: string, query: Query = {}): Promise<Blob> {
    const res = await fetch(buildUrl(path, query), { headers: { authorization: `Bearer ${tokenStore.get() ?? ''}` } });
    if (!res.ok) throw new ApiError('DOWNLOAD_FAILED', 'Không tải được tệp', res.status);
    return res.blob();
  },
  /** Tải tệp (CSV…) có gắn token. */
  async download(path: string, query: Query, filename: string): Promise<void> {
    const res = await fetch(buildUrl(path, query), { headers: { authorization: `Bearer ${tokenStore.get() ?? ''}` } });
    if (!res.ok) throw new ApiError('DOWNLOAD_FAILED', 'Không tải được tệp', res.status);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  },
};

/** Lấy thông điệp lỗi dễ đọc (kèm chi tiết dạng danh sách nếu có). */
export function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (Array.isArray(err.details) && err.details.length) return `${err.message}: ${err.details.map((d) => (typeof d === 'string' ? d : (d as { message?: string })?.message ?? JSON.stringify(d))).join('; ')}`;
    return err.message;
  }
  return (err as Error)?.message ?? 'Có lỗi xảy ra';
}

/** Màn danh sách, sổ, báo cáo không phân trang: lấy toàn bộ kết quả lọc (bảng lưới chỉ vẽ phần đang thấy). */
export const ALL_ROWS = 1_000_000;
