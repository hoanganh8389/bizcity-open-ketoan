// @bizcity-layer P events
/**
 * Báo hệ thống bán hàng "danh mục hàng vừa đổi" để bên đó kéo về NGAY (GET /api/v1/catalog/feed/*), không đợi lịch.
 *
 * - Gắn một chỗ (app.ts, hook onResponse): mọi lệnh ghi thành công vào /api/v1/catalog/*, /api/v1/products*,
 *   /api/v1/item-classes* → emitCatalogChanged(): phát bizcity.masterdata.catalog.changed vào outbox (core/events.ts).
 * - Gom: khoá chống trùng theo khung 5 giây của đơn vị — nhiều lần sửa liền nhau chỉ báo một lần (thay hẹn giờ trong bộ nhớ
 *   trước PHASE-006: mất khi khởi động lại, không thử lại — A-22).
 * - Subscriber catalog.notify-sales gửi tới kết nối CHÍNH tới hệ thống bán hàng (trạm ACC14, đầu chuẩn): đường dẫn cổng chờ
 *   …/pending đổi thành …/catalog-changed, cùng khoá Bearer, Idempotency-Key = id sự kiện (STD-EVT-2). Lỗi → dispatcher thử
 *   lại giãn nhịp (tối đa 5 lần, 10 phút); bên đó vẫn tự kéo theo lịch (5 phút), không mất thay đổi.
 * - Hook onResponse chạy SAU khi route danh mục commit, nên sự kiện ghi ở giao dịch riêng ngay sau đó (route danh mục cũ
 *   chưa là action; chuyển sang defineAction thì emit trong giao dịch — PHASE-011).
 * - Sổ thuế (BOOK_MODE=tax) không làm chuẩn danh mục → không báo.
 */
import { env } from '../../config/env.js';
import type { AuthContext } from '../../core/auth.js';
import { db } from '../../db/client.js';
import { defineSubscriber, emitEvent } from '../../core/events.js';
import { primaryConnection } from '../connections/connection.service.js';

export const CATALOG_CHANGED = 'bizcity.masterdata.catalog.changed';
const BUCKET_MS = 5_000;

/** Lệnh ghi này có làm đổi danh mục hàng không (dùng ở hook onResponse). */
export function isCatalogWrite(method: string, url: string, status: number): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || status >= 400) return false;
  const path = url.split('?')[0]!;
  return /^\/api\/v1\/(catalog\/|products(\/|$)|item-classes\/)/.test(path) && !path.startsWith('/api/v1/catalog/feed/');
}

/** Phát "danh mục đổi" (gom theo khung 5 giây). Trả id sự kiện, hoặc null khi khung này đã có. */
export async function emitCatalogChanged(auth: AuthContext, now = Date.now()): Promise<string | null> {
  if (env.BOOK_MODE === 'tax') return null;
  const bucket = Math.floor(now / BUCKET_MS);
  return db.transaction().execute((trx) => emitEvent(trx, {
    tenantId: auth.tenantId, type: CATALOG_CHANGED, subject: 'catalog', source: 'bizcity.platform',
    actor: { kind: auth.kind, id: auth.actor }, dedupeKey: `${CATALOG_CHANGED}:${bucket}`, data: { at: new Date(now).toISOString() },
  }));
}

export const catalogNotifySubscriber = defineSubscriber({
  id: 'catalog.notify-sales',
  module: 'bizcity.platform',
  on: [CATALOG_CHANGED],
  retry: { maxAttempts: 5, baseDelayMs: 10_000, maxDelayMs: 600_000 },
  async handle(ctx, evt) {
    const c = await primaryConnection(ctx.tenantId);
    if (!c) return;
    const u = new URL(c.url);
    if (!/\/pending\/?$/.test(u.pathname)) return;
    u.pathname = u.pathname.replace(/\/pending\/?$/, '/catalog-changed');
    u.search = '';
    const res = await fetch(u, {
      method: 'POST',
      headers: {
        'content-type': 'application/json', accept: 'application/json', 'idempotency-key': evt.id,
        ...(c.apiKey ? { authorization: `Bearer ${c.apiKey}` } : {}),
      },
      body: JSON.stringify({ at: evt.occurredAt, eventId: evt.id }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  },
});
