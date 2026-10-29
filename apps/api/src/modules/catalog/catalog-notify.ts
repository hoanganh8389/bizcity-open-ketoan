/**
 * Báo hệ thống bán hàng "danh mục hàng vừa đổi" để bên đó kéo về NGAY (GET /api/v1/catalog/feed/*), không đợi lịch.
 *
 * - Gắn một chỗ (app.ts, hook onResponse): mọi lệnh ghi thành công vào /api/v1/catalog/*, /api/v1/products*,
 *   /api/v1/item-classes* → notifyCatalogChanged(tenant).
 * - Gom: nhiều lần sửa trong DEBOUNCE_MS chỉ báo một lần.
 * - Nơi nhận: kết nối CHÍNH tới hệ thống bán hàng (trạm ACC14, đầu chuẩn) — đường dẫn cổng chờ …/pending đổi thành
 *   …/catalog-changed, cùng khoá Bearer. Không có kết nối chính thì thôi.
 * - Báo lỗi / hệ thống bán hàng không trả lời: chỉ ghi log. Bên đó vẫn tự kéo theo lịch (5 phút), không mất thay đổi.
 * - Sổ thuế (BOOK_MODE=tax) không làm chuẩn danh mục → không báo.
 */
import { env } from '../../config/env.js';
import { primaryConnection } from '../connections/connection.service.js';

const DEBOUNCE_MS = 2000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Lệnh ghi này có làm đổi danh mục hàng không (dùng ở hook onResponse). */
export function isCatalogWrite(method: string, url: string, status: number): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || status >= 400) return false;
  const path = url.split('?')[0]!;
  return /^\/api\/v1\/(catalog\/|products(\/|$)|item-classes\/)/.test(path) && !path.startsWith('/api/v1/catalog/feed/');
}

export function notifyCatalogChanged(tenantId: string, log?: { warn: (o: object, m: string) => void }): void {
  if (env.BOOK_MODE === 'tax') return;
  const t = timers.get(tenantId);
  if (t) clearTimeout(t);
  timers.set(tenantId, setTimeout(() => {
    timers.delete(tenantId);
    void send(tenantId).catch((e: unknown) => log?.warn({ err: String(e), tenantId }, 'Báo hệ thống bán hàng danh mục hàng đổi: lỗi (bên đó vẫn tự kéo theo lịch)'));
  }, DEBOUNCE_MS));
}

async function send(tenantId: string): Promise<void> {
  const c = await primaryConnection(tenantId);
  if (!c) return;
  const u = new URL(c.url);
  if (!/\/pending\/?$/.test(u.pathname)) return;
  u.pathname = u.pathname.replace(/\/pending\/?$/, '/catalog-changed');
  u.search = '';
  const res = await fetch(u, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...(c.apiKey ? { authorization: `Bearer ${c.apiKey}` } : {}) },
    body: JSON.stringify({ at: new Date().toISOString() }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
