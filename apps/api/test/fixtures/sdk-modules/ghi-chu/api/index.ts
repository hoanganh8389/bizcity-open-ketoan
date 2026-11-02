/** Module thử ghi-chu (PHASE-014 W1/W4): chỗ nạp module SDK — route /api/v1/m/ghi-chu/…, quyền manifest, ctx.data.module, cấu hình, hook, thông báo. */
import { defineAction, defineHook, defineModule, defineSubscriber, Errors, sql, z } from '@bizcity/module-sdk';
import manifest from '../bizcity.module.json' with { type: 'json' };

const create = defineAction({
  id: 'ghi-chu.note.create', title: 'Viết ghi chú', permission: 'ghi-chu:write', effect: 'write', idempotency: 'required', sideEffects: ['documents'],
  input: z.object({ body: z.string().min(1).max(500), partnerCode: z.string().optional() }), output: z.object({ id: z.string() }),
  expose: { http: { method: 'POST', path: '/notes' }, mcp: false, ai: 'deny' },
  handler: async (ctx, { body, partnerCode }) => {
    const max = Number(await ctx.settings.get('bizcity.ghi_chu.max_len'));
    if (body.length > max) throw Errors.validation(`Ghi chú dài quá ${max} ký tự (cấu hình bizcity.ghi_chu.max_len)`);
    return ctx.data.module(async (tx) => {
      // đọc danh mục chuẩn qua khung nhìn khai ở data.reads (G7)
      if (partnerCode && !(await sql<{ ok: boolean }>`SELECT EXISTS (SELECT 1 FROM bizcity_read.partners WHERE code = ${partnerCode}) AS ok`.execute(tx)).rows[0]?.ok) throw Errors.validation(`Không có đối tượng ${partnerCode}`);
      const r = await sql<{ id: string }>`INSERT INTO mod_ghi_chu.notes (tenant_id, body, created_by, partner_code) VALUES (${ctx.tenant.id}, ${body}, ${ctx.actor.id}, ${partnerCode ?? null}) RETURNING id::text`.execute(tx);
      return { id: r.rows[0]!.id };
    });
  },
});

const list = defineAction({
  id: 'ghi-chu.note.list', title: 'Danh sách ghi chú', permission: 'ghi-chu:read', effect: 'read', idempotency: 'none',
  input: z.object({}), output: z.object({ items: z.array(z.object({ id: z.string(), body: z.string() })) }),
  expose: { http: { method: 'GET', path: '/notes' }, mcp: false, ai: 'read' },
  handler: async (ctx) => ctx.data.module(async (tx) => ({
    items: (await sql<{ id: string; body: string }>`SELECT id::text, body FROM mod_ghi_chu.notes ORDER BY id`.execute(tx)).rows,
  })),
});

/** Đồng hồ ngày: đếm ghi chú (bảng của module) rồi báo người có quyền đọc; giao lại cùng sự kiện → không báo lần hai. */
const daily = defineSubscriber({
  id: 'ghi-chu.daily', module: 'ghi-chu', on: ['bizcity.clock.daily'],
  handle: async (ctx, evt) => {
    const n = await ctx.module(async (tx) => (await sql<{ n: number }>`SELECT count(*)::int AS n FROM mod_ghi_chu.notes`.execute(tx)).rows[0]!.n);
    await ctx.notify.send({ to: { permission: 'ghi-chu:read' }, title: `Có ${n} ghi chú`, link: '/app/ghi-chu/danh-sach', dedupeKey: `daily:${evt.id}` });
  },
});

/** Đối tượng có ghi chú thì Core không cho xoá. */
const partnerInUse = defineHook({
  id: 'ghi-chu.partner-in-use', module: 'ghi-chu', hook: 'masterdata.referenceCheck',
  handle: async (ctx, { kind, code }) => {
    if (kind !== 'partner') return null;
    const n = await ctx.module(async (tx) => (await sql<{ n: number }>`SELECT count(*)::int AS n FROM mod_ghi_chu.notes WHERE partner_code = ${code}`.execute(tx)).rows[0]!.n);
    return n ? `${n} ghi chú` : null;
  },
});

export default defineModule({ manifest, actions: [create, list], subscribers: [daily], hooks: [partnerInUse] });
