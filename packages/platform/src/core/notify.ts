// @bizcity-layer P module-sdk
// [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W4 (G4): thông báo trong ứng dụng (notify.inapp) — gửi, xem, đánh dấu đã đọc
/**
 * THÔNG BÁO TRONG ỨNG DỤNG (notify.inapp, migration 0060). Module gửi bằng ctx.notify.send (action, subscriber); Core gửi bằng
 * sendNotification. Người dùng xem thông báo của mình: gửi riêng mình, hoặc gửi theo một quyền mình đang có.
 * Nội dung là câu chữ + đường dẫn mở màn, không số tiền. dedupeKey chống gửi trùng khi sự kiện được giao lại.
 */
import { sql } from 'kysely';
import type { Db } from '../db/client.js';
import { Errors } from './errors.js';

export interface NotifyInput {
  /** Gửi riêng một người (users.id) HOẶC mọi người có một quyền. */
  to: { userId: string } | { permission: string };
  title: string;
  body?: string;
  /** Đường dẫn màn trong ứng dụng, bắt đầu bằng / (vd /app/hop-dong/lich-thu). */
  link?: string;
  /** Khoá chống trùng (vd `installment:42:due:2026-11-05`): gửi lại cùng khoá → không thêm. */
  dedupeKey?: string;
}

/** Gửi một thông báo (cùng giao dịch của người gọi). Trả id, hoặc null khi trùng dedupeKey. */
export async function sendNotification(trx: Db, tenantId: string, source: string, n: NotifyInput): Promise<string | null> {
  const title = n.title.trim();
  if (!title || title.length > 200) throw Errors.validation('Tiêu đề thông báo 1–200 ký tự');
  if (n.link && !n.link.startsWith('/')) throw Errors.validation('Đường dẫn thông báo phải bắt đầu bằng /');
  const userId = 'userId' in n.to ? n.to.userId : null;
  const permission = 'permission' in n.to ? n.to.permission : null;
  const r = await sql<{ id: string }>`
    INSERT INTO notifications (tenant_id, source, recipient_user_id, audience_permission, title, body, link, dedupe_key)
    VALUES (${tenantId}, ${source}, ${userId}, ${permission}, ${title}, ${n.body ?? null}, ${n.link ?? null}, ${n.dedupeKey ?? null})
    ON CONFLICT (tenant_id, source, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING id::text`.execute(trx);
  return r.rows[0]?.id ?? null;
}

export interface NotificationRow { id: string; source: string; title: string; body: string | null; link: string | null; createdAt: string; read: boolean }

/** Các quyền-đích đang có thông báo ở đơn vị mà người này có (ctx.can) — để lọc thông báo gửi theo quyền. */
export async function audiencesOf(trx: Db, tenantId: string, can: (p: never) => boolean): Promise<string[]> {
  const r = await sql<{ p: string }>`SELECT DISTINCT audience_permission AS p FROM notifications WHERE tenant_id = ${tenantId} AND audience_permission IS NOT NULL`.execute(trx);
  return r.rows.map((x) => x.p).filter((p) => can(p as never));
}

/** Thông báo của một người (mới trước, tối đa 50) + số chưa đọc. */
export async function myNotifications(trx: Db, tenantId: string, userId: string, permissions: readonly string[]): Promise<{ items: NotificationRow[]; unread: number }> {
  const perms = permissions.length ? [...permissions] : [''];
  const r = await sql<{ id: string; source: string; title: string; body: string | null; link: string | null; created_at: Date; read: boolean }>`
    SELECT n.id::text, n.source, n.title, n.body, n.link, n.created_at, (r.user_id IS NOT NULL) AS read
      FROM notifications n
      LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ${userId}
     WHERE n.tenant_id = ${tenantId}
       AND (n.recipient_user_id = ${userId} OR n.audience_permission = ANY(${perms}::text[]))
     ORDER BY n.id DESC LIMIT 50`.execute(trx);
  const items = r.rows.map((x) => ({ id: x.id, source: x.source, title: x.title, body: x.body, link: x.link, createdAt: new Date(x.created_at).toISOString(), read: x.read }));
  return { items, unread: items.filter((x) => !x.read).length };
}

/** Đánh dấu đã đọc (chỉ thông báo người đó thấy được). Trả số dòng mới đánh dấu. */
export async function markNotificationsRead(trx: Db, tenantId: string, userId: string, permissions: readonly string[], ids: readonly string[]): Promise<number> {
  if (!ids.length) return 0;
  const perms = permissions.length ? [...permissions] : [''];
  const r = await sql`
    INSERT INTO notification_reads (notification_id, user_id, tenant_id)
    SELECT n.id, ${userId}, n.tenant_id FROM notifications n
     WHERE n.tenant_id = ${tenantId} AND n.id = ANY(${[...ids]}::bigint[])
       AND (n.recipient_user_id = ${userId} OR n.audience_permission = ANY(${perms}::text[]))
    ON CONFLICT DO NOTHING`.execute(trx);
  return Number(r.numAffectedRows ?? 0);
}
