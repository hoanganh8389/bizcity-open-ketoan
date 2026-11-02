/** Module thử ghi-chu (PHASE-014 W1): chứng minh chỗ nạp module SDK — route /api/v1/m/ghi-chu/…, quyền manifest, ctx.data.module. */
import { defineAction, defineModule, defineSubscriber, sql, z } from '@bizcity/module-sdk';
import manifest from '../bizcity.module.json' with { type: 'json' };

const create = defineAction({
  id: 'ghi-chu.note.create', title: 'Viết ghi chú', permission: 'ghi-chu:write', effect: 'write', idempotency: 'required', sideEffects: ['documents'],
  input: z.object({ body: z.string().min(1).max(500) }), output: z.object({ id: z.string() }),
  expose: { http: { method: 'POST', path: '/notes' }, mcp: false, ai: 'deny' },
  handler: async (ctx, { body }) => ctx.data.module(async (tx) => {
    const r = await sql<{ id: string }>`INSERT INTO mod_ghi_chu.notes (tenant_id, body, created_by) VALUES (${ctx.tenant.id}, ${body}, ${ctx.actor.id}) RETURNING id::text`.execute(tx);
    return { id: r.rows[0]!.id };
  }),
});

const list = defineAction({
  id: 'ghi-chu.note.list', title: 'Danh sách ghi chú', permission: 'ghi-chu:read', effect: 'read', idempotency: 'none',
  input: z.object({}), output: z.object({ items: z.array(z.object({ id: z.string(), body: z.string() })) }),
  expose: { http: { method: 'GET', path: '/notes' }, mcp: false, ai: 'read' },
  handler: async (ctx) => ctx.data.module(async (tx) => ({
    items: (await sql<{ id: string; body: string }>`SELECT id::text, body FROM mod_ghi_chu.notes ORDER BY id`.execute(tx)).rows,
  })),
});

const daily = defineSubscriber({ id: 'ghi-chu.daily', module: 'ghi-chu', on: ['bizcity.clock.daily'], handle: async () => {} });

export default defineModule({ manifest, actions: [create, list], subscribers: [daily] });
