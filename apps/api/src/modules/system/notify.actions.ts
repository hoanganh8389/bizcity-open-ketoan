// @bizcity-layer P module-sdk
// [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W4 (G4): thông báo của người dùng — xem, đánh dấu đã đọc (notify.inapp)
/**
 *   GET  /api/v1/notifications        core.notification.list   thông báo của tôi (gửi riêng tôi, hoặc theo quyền tôi có) + số chưa đọc
 *   POST /api/v1/notifications/read   core.notification.read   đánh dấu đã đọc (chỉ thông báo tôi thấy được)
 * Khoá API không có hộp thư (trả rỗng / từ chối đánh dấu). Gửi thông báo: ctx.notify.send của module, không qua HTTP.
 */
import { z } from 'zod';
import { defineAction, type AnyActionDef } from '../../core/actions.js';
import { Errors } from '../../core/errors.js';
import { audiencesOf, markNotificationsRead, myNotifications } from '@bizcity/platform/core/notify';

const tags = ['Thông báo'];
const userIdOf = (actor: string) => (actor.startsWith('user:') ? actor.slice(5) : null);
const item = z.object({ id: z.string(), source: z.string(), title: z.string(), body: z.string().nullable(), link: z.string().nullable(), createdAt: z.string(), read: z.boolean() });

export const notifyActions: AnyActionDef[] = [
  defineAction({
    id: 'core.notification.list', title: 'Thông báo của tôi', tags,
    description: 'Thông báo gửi riêng người dùng hoặc gửi theo một quyền người dùng đang có; mới trước, tối đa 50; kèm số chưa đọc.',
    permission: 'documents:read', effect: 'read', idempotency: 'none',
    input: z.object({}), output: z.object({ items: z.array(item), unread: z.number() }),
    expose: { http: { method: 'GET', path: '/api/v1/notifications' }, mcp: false, ai: 'read' },
    handler: async (ctx) => {
      const uid = userIdOf(ctx.actor.id);
      if (!uid) return { items: [], unread: 0 };
      return myNotifications(ctx.data.tx, ctx.tenant.id, uid, await audiencesOf(ctx.data.tx, ctx.tenant.id, ctx.can));
    },
  }),
  defineAction({
    id: 'core.notification.read', title: 'Đánh dấu thông báo đã đọc', tags,
    description: 'Đánh dấu một hoặc nhiều thông báo của chính người dùng là đã đọc. Không đổi dữ liệu nghiệp vụ.',
    permission: 'documents:read', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: z.object({ ids: z.array(z.string().regex(/^\d+$/)).min(1).max(200) }), output: z.object({ marked: z.number() }),
    expose: { http: { method: 'POST', path: '/api/v1/notifications/read' }, mcp: false, ai: 'deny' },
    handler: async (ctx, { ids }) => {
      const uid = userIdOf(ctx.actor.id);
      if (!uid) throw Errors.forbidden('Khoá API không có hộp thông báo');
      return { marked: await markNotificationsRead(ctx.data.tx, ctx.tenant.id, uid, await audiencesOf(ctx.data.tx, ctx.tenant.id, ctx.can), ids) };
    },
  }),
];
