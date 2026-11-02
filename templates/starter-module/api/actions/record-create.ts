/** Lập một bản ghi. Action ghi: quyền <key>:write, Idempotency-Key bắt buộc; bằng chứng do runtime ghi (không gọi writeAudit). */
import { defineAction, sql, z } from '@bizcity/module-sdk';

export default defineAction({
  id: 'mau-module.record.create', title: 'Lập bản ghi Module mẫu', tags: ['Module mẫu'],
  permission: 'mau-module:write', effect: 'write', sideEffects: ['documents'], idempotency: 'required', dryRun: true,
  input: z.object({ title: z.string().trim().min(1).max(200), note: z.string().max(2000).optional() }),
  output: z.object({ id: z.string() }),
  expose: { http: { method: 'POST', path: '/records' }, mcp: true, ai: 'propose' },
  handler: async (ctx, input) => ctx.data.module(async (tx) => {
    const r = await sql<{ id: string }>`
      INSERT INTO mod_mau_module.records (tenant_id, title, note, created_by)
      VALUES (${ctx.tenant.id}, ${input.title}, ${input.note ?? null}, ${ctx.actor.id})
      RETURNING id::text`.execute(tx);
    return { id: r.rows[0]!.id };
  }),
});
