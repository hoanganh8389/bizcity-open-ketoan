// @bizcity-layer P apps.external
// [2026-11-02 10:43 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.14 (ADR-0011 mức 2): app ngoài tiến trình — registry manifest kind "app", phạm vi quyền cho phép, webhook ký HMAC từ outbox, vé iframe ngắn hạn (khoá dẫn xuất riêng, không dùng được làm phiên)
/**
 * APP NGOÀI TIẾN TRÌNH (ADR-0011 mức 2, PHASES 3.14) — dịch vụ riêng (ngôn ngữ bất kỳ) nói chuyện với Core CHỈ qua API công khai.
 *
 *   Manifest      bizcity.module.json `kind: "app"` trong mã nguồn bản cài (apps/api/src/ung-dung/<key>/), không có mã chạy.
 *                 `app.scopes` = quyền Core app xin (chỉ trong APP_SCOPES), `events.subscribes[]` = sự kiện nhận qua webhook,
 *                 `app.webhook.url`, `ui.origin` + `ui.entry` = giao diện nhúng iframe.
 *   Kết nối       chủ đơn vị kết nối app (apps/api/src/modules/apps) → app_installations + khoá API gắn app (0051). Khoá app:
 *                 quyền = phạm vi đã đồng ý (core/auth.ts), cửa nạp buộc docKey `<app>:…` (Kernel), bằng chứng via `app:<key>`.
 *   Webhook       mỗi app một subscriber `<key>.webhook` trên outbox có sẵn (thử lại, dead, replay như mọi subscriber): chỉ
 *                 tạo việc giao cho đơn vị đã kết nối và nhận loại sự kiện đó (SubscriberDef.accepts), gửi POST JSON phong bì
 *                 sự kiện, ký `Bizcity-Signature: t=<giây>,v1=<hex HMAC-SHA256(bí mật, "<t>.<thân>")>`, `Idempotency-Key` =
 *                 id sự kiện (STD-EVT-2). Non-2xx / quá hạn → thử lại. Bí mật không lưu: HMAC(khoá máy chủ, đơn vị|app|muối).
 *   Vé iframe     JWT HS256 ≤ 5 phút, ký bằng khoá DẪN XUẤT riêng (không phải khoá phiên) → không dùng làm Bearer được.
 *                 Core trao vé cho iframe qua postMessage; app gửi vé + khoá API của nó tới POST /api/v1/apps/ticket/exchange.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { sql } from 'kysely';
import { env } from '../config/env.js';
import type { Db } from '../db/client.js';
import { defineSubscriber, registerSubscribers, type EventEnvelope, type SubscriberDef } from './events.js';

/** Quyền Core cấp được cho khoá app. Quyền quản trị / duyệt / khoá kỳ / sửa phiếu người khác: không bao giờ (risk high). */
// [2026-11-02 03:28 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.14: bỏ catalog:write khỏi phạm vi app (app không ghi danh mục; cổng route chỉ mở cửa nạp)
export const APP_SCOPES = ['catalog:read', 'documents:read', 'documents:write', 'ledger:read', 'reports:read'] as const;
/** Thời hạn vé iframe (ADR-0011: ≤ 5 phút). */
export const APP_TICKET_TTL_SECONDS = 300;
const TICKET_AUDIENCE = 'bizcity.app-ticket';
const WEBHOOK_TIMEOUT_MS = 5_000;

export interface AppManifest {
  contract: 'bizcity_module@1';
  id: string;
  key: string;
  kind: 'app';
  version: string;
  label: string;
  description: string;
  app: { scopes?: string[]; webhook?: { url: string } };
  events?: { subscribes?: { type: string; version: number }[] };
  ui?: { origin?: string; entry?: string; icon?: string; color?: string; order?: number };
  [field: string]: unknown;
}

const KEY_RE = /^[a-z][a-z0-9-]*$/;
const registry = new Map<string, AppManifest>();

const isLocalHost = (h: string) => h === 'localhost' || h === '127.0.0.1' || h === '[::1]';

/** Kiểm một manifest app; trả danh sách lỗi (rỗng = đúng). Chạy lúc đăng ký (khởi động): sai → dừng như manifest module. */
export function appManifestProblems(m: AppManifest): string[] {
  const bad: string[] = [];
  if (m.contract !== 'bizcity_module@1') bad.push(`contract "${m.contract}"`);
  if (m.kind !== 'app') bad.push(`kind "${m.kind}" ≠ "app"`);
  if (!KEY_RE.test(m.key ?? '')) bad.push(`key "${m.key}" sai khuôn`);
  if (!m.app || typeof m.app !== 'object') bad.push('thiếu app');
  for (const s of m.app?.scopes ?? []) if (!(APP_SCOPES as readonly string[]).includes(s)) bad.push(`app.scopes "${s}" không cấp được cho app (chỉ ${APP_SCOPES.join(', ')})`);
  const subs = m.events?.subscribes ?? [];
  if (subs.length && !m.app?.webhook?.url) bad.push('events.subscribes cần app.webhook.url');
  const checkUrl = (label: string, raw: string | undefined, originOnly: boolean) => {
    if (raw === undefined) return;
    let u: URL;
    try { u = new URL(raw); } catch { bad.push(`${label} "${raw}" không phải URL`); return; }
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && (isLocalHost(u.hostname) || env.NODE_ENV !== 'production'))) bad.push(`${label} phải https`);
    if (u.username || u.password) bad.push(`${label} không được chứa tài khoản`);
    if (originOnly && u.origin !== raw) bad.push(`${label} phải là origin (scheme://host[:port]), không đường dẫn`);
  };
  checkUrl('app.webhook.url', m.app?.webhook?.url, false);
  checkUrl('ui.origin', m.ui?.origin, true);
  if (m.ui?.entry !== undefined && !/^\/[^\s]*$/.test(m.ui.entry)) bad.push('ui.entry phải là đường dẫn bắt đầu "/"');
  if (m.ui?.entry !== undefined && !m.ui.origin) bad.push('ui.entry cần ui.origin');
  return bad;
}

/** Loại sự kiện app nhận qua webhook. */
export const appEventTypes = (m: AppManifest): string[] => [...new Set((m.events?.subscribes ?? []).map((e) => e.type))];

/**
 * Đăng ký app (buildApp + test). Cùng đối tượng thì bỏ qua; khoá trùng với đối tượng khác → lỗi. App có webhook → đăng ký
 * subscriber `<key>.webhook`. `taken`: khoá phân hệ / add-in đã dùng — trùng thì consumer outbox lẫn nhau → lỗi.
 */
export function registerAppManifests(list: AppManifest[], taken: Iterable<string> = []): void {
  const used = new Set(taken);
  for (const m of list) {
    const bad = appManifestProblems(m);
    if (used.has(m.key)) bad.push(`key "${m.key}" trùng phân hệ / add-in`);
    const cur = registry.get(m.key);
    if (cur && cur !== m) bad.push(`app "${m.key}" đăng ký hai lần`);
    if (bad.length) throw new Error(`Manifest app ${m.key}: ${bad.join('; ')}`);
    if (cur) continue;
    registry.set(m.key, m);
    if (m.app.webhook?.url && appEventTypes(m).length) registerSubscribers([webhookSubscriber(m)]);
  }
}

export const listAppManifests = (): AppManifest[] => [...registry.values()];
export const getAppManifest = (key: string): AppManifest | undefined => registry.get(key);

// ── Khoá dẫn xuất: một khoá máy chủ (JWT_SECRET), mỗi mục đích một nhãn → vé / bí mật webhook không thay được phiên ─────────
const derive = (label: string) => createHmac('sha256', env.JWT_SECRET).update(label).digest();

export const newWebhookSalt = (): string => randomBytes(18).toString('base64url');

/** Bí mật ký webhook của (đơn vị, app). Không lưu ở CSDL; xoay = đổi muối. */
export function webhookSecret(tenantId: string, appKey: string, salt: string): string {
  return `whsec_${createHmac('sha256', derive('bizcity.app.webhook')).update(`${tenantId}|${appKey}|${salt}`).digest('base64url')}`;
}

/** Chữ ký webhook: `t=<giây>,v1=<hex>`; v1 = HMAC-SHA256(bí mật, "<t>.<thân>"). App so trong thời gian hằng và từ chối t quá 5 phút. */
export function signWebhook(secret: string, body: string, at = Math.floor(Date.now() / 1000)): string {
  return `t=${at},v1=${createHmac('sha256', secret).update(`${at}.${body}`).digest('hex')}`;
}

export interface AppTicketClaims { tenantId: string; app: string; userId: string; name: string; role: string }

const ticketKey = () => derive('bizcity.app.ticket');

export async function signAppTicket(c: AppTicketClaims): Promise<{ ticket: string; expiresAt: string }> {
  const exp = Math.floor(Date.now() / 1000) + APP_TICKET_TTL_SECONDS;
  const ticket = await new SignJWT({ tid: c.tenantId, app: c.app, name: c.name, role: c.role })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(c.userId).setAudience(TICKET_AUDIENCE).setIssuedAt().setExpirationTime(exp)
    .sign(ticketKey());
  return { ticket, expiresAt: new Date(exp * 1000).toISOString() };
}

export async function verifyAppTicket(ticket: string): Promise<AppTicketClaims | null> {
  try {
    const { payload: p } = await jwtVerify(ticket, ticketKey(), { algorithms: ['HS256'], audience: TICKET_AUDIENCE });
    if (!p.sub || typeof p.tid !== 'string' || typeof p.app !== 'string') return null;
    return { tenantId: p.tid, app: p.app, userId: p.sub, name: String(p.name ?? ''), role: String(p.role ?? '') };
  } catch {
    return null;
  }
}

// ── Webhook ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Kết nối đang bật của (đơn vị, app) có nhận loại sự kiện này không; trả muối để ký. */
async function activeInstallation(trx: Db, tenantId: string, appKey: string, type: string) {
  return trx.selectFrom('app_installations').select(['webhook_salt'])
    .where('tenant_id', '=', tenantId).where('app_key', '=', appKey).where('status', '=', 'active')
    .where(sql<boolean>`${type} = ANY(events)`)
    .executeTakeFirst();
}

function webhookSubscriber(m: AppManifest): SubscriberDef {
  const url = m.app.webhook!.url;
  return defineSubscriber({
    id: `${m.key}.webhook`,
    module: m.key,
    on: appEventTypes(m),
    retry: { maxAttempts: 10, baseDelayMs: 10_000, maxDelayMs: 3_600_000 },
    accepts: async (trx, tenantId, type) => Boolean(await activeInstallation(trx, tenantId, m.key, type)),
    // Kết nối tắt / bỏ loại sự kiện sau lúc phát: không gửi, việc giao xong (bật lại không tự gửi bù — `events replay`).
    handle: async (ctx, evt) => {
      const inst = await activeInstallation(ctx.tx, ctx.tenantId, m.key, evt.type);
      if (!inst) return;
      await postWebhook(url, webhookSecret(ctx.tenantId, m.key, inst.webhook_salt), evt);
    },
  });
}

async function postWebhook(url: string, secret: string, evt: EventEnvelope): Promise<void> {
  const body = JSON.stringify(evt);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      headers: {
        'content-type': 'application/json',
        'user-agent': 'bizcity-webhook/1',
        'idempotency-key': evt.id,
        'bizcity-event-id': evt.id,
        'bizcity-event-type': evt.type,
        'bizcity-signature': signWebhook(secret, body),
      },
      body,
    });
  } catch (err) {
    throw new Error(`webhook ${new URL(url).host}: ${(err as Error).name === 'TimeoutError' ? `quá ${WEBHOOK_TIMEOUT_MS} ms` : (err as Error).message}`);
  }
  // Chỉ đọc mã trạng thái; thân trả về của app không vào nhật ký (có thể chứa dữ liệu của app).
  await res.body?.cancel().catch(() => {});
  if (res.status < 200 || res.status >= 300) throw new Error(`webhook ${new URL(url).host}: HTTP ${res.status}`);
}
