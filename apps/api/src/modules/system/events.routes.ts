// @bizcity-layer P events
// [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — transactional outbox, subscriber, đồng hồ, correlation_id.
/**
 * Sự kiện miền (bizcity_event@1 §5) — vận hành:
 *   GET  /api/v1/system/events          core.events.status — subscriber đang đăng ký + tình trạng giao theo nơi nhận
 *   POST /api/v1/system/events/replay   core.events.replay — phát lại cho một nơi nhận (R-OUTBOX-7); runtime ghi bằng chứng ai phát lại
 * Dead letter: tự chẩn đoán EVENT_DEAD (GET /api/v1/system/diagnostics).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Errors } from '../../core/errors.js';
import { defineAction, mountActions } from '../../core/actions.js';
import { eventStatus, listSubscribers, replayEvents } from '../../core/events.js';

const statusAction = defineAction({
  id: 'core.events.status', title: 'Tình trạng giao sự kiện miền', tags: ['Hệ thống'],
  description: 'Subscriber đang đăng ký trong tiến trình này và số việc giao chờ / xong / hết lượt (dead) theo nơi nhận của đơn vị.',
  permission: 'reports:read', effect: 'read', idempotency: 'none',
  input: z.object({}),
  output: z.object({
    subscribers: z.array(z.object({ id: z.string(), module: z.string(), on: z.array(z.string()) })),
    consumers: z.array(z.object({ consumer: z.string(), pending: z.number(), done: z.number(), dead: z.number(), oldestPendingAt: z.string().nullable() })),
  }),
  expose: { http: { method: 'GET', path: '/api/v1/system/events' }, mcp: false, ai: 'deny' },
  handler: async (ctx) => ({
    subscribers: listSubscribers().map((s) => ({ id: s.id, module: s.module, on: s.on })),
    consumers: await eventStatus(ctx.data.tx, ctx.tenant.id),
  }),
});

const replayAction = defineAction({
  id: 'core.events.replay', title: 'Phát lại sự kiện cho một nơi nhận', tags: ['Hệ thống'],
  description: 'Xoá dấu đã xử lý và đặt lại việc giao của `consumer` cho sự kiện trong khoảng `from`…`to` (lọc thêm theo loại / chủ thể). Nơi nhận phải chịu được giao lại (STD-EVT-2). Bằng chứng ghi ai phát lại.',
  permission: 'settings:write', effect: 'write', idempotency: 'required', sideEffects: ['external'],
  input: z.object({
    consumer: z.string().min(3),
    from: z.string().datetime({ offset: true }).describe('Từ thời điểm (ISO 8601)'),
    to: z.string().datetime({ offset: true }).optional(),
    type: z.string().optional(),
    subject: z.string().optional(),
  }),
  output: z.object({ replayed: z.number() }),
  expose: { http: { method: 'POST', path: '/api/v1/system/events/replay' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'event_consumer', objectId: (input) => input.consumer },
  handler: async (ctx, input) => {
    if (!listSubscribers().some((s) => s.id === input.consumer)) throw Errors.notFound(`nơi nhận sự kiện ${input.consumer}`);
    return { replayed: await replayEvents(ctx.data.tx, { tenantId: ctx.tenant.id, ...input }) };
  },
});

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  mountActions(app, [statusAction, replayAction]);
}
