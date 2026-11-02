/** Danh sách bản ghi của đơn vị (RLS lọc theo đơn vị — không tự thêm WHERE tenant_id). */
import { defineAction, sql, z } from '@bizcity/module-sdk';

const row = z.object({ id: z.string(), title: z.string(), note: z.string().nullable(), createdAt: z.string() });

export default defineAction({
  id: 'mau-module.record.list', title: 'Danh sách Module mẫu', tags: ['Module mẫu'],
  permission: 'mau-module:read', effect: 'read', idempotency: 'none',
  input: z.object({ q: z.string().max(100).optional() }),
  output: z.object({ items: z.array(row) }),
  expose: { http: { method: 'GET', path: '/records' }, mcp: true, ai: 'read' },
  handler: async (ctx, { q }) => ctx.data.module(async (tx) => {
    const r = await sql<{ id: string; title: string; note: string | null; created_at: Date }>`
      SELECT id::text, title, note, created_at FROM mod_mau_module.records
       WHERE ${q ? sql`title ILIKE ${`%${q}%`}` : sql`true`}
       ORDER BY id DESC LIMIT 500`.execute(tx);
    return { items: r.rows.map((x) => ({ id: x.id, title: x.title, note: x.note, createdAt: new Date(x.created_at).toISOString() })) };
  }),
});
