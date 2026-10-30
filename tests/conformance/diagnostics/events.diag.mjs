/**
 * Lane diagnostics — sự kiện miền (bizcity_event@1, migration 0039): không có việc giao hết lượt thử (dead) nằm im.
 * Cùng mã EVENT_DEAD với kiểm trong app (apps/api/src/modules/system/diagnostics.ts) — SC-DIAG-1. CHỈ ĐỌC.
 * Là một nửa cách thực thi AP-6 (sự kiện phát lại được, consumer idempotent); nửa kia: SC-EVT-2.
 */
export const checks = [
  {
    id: 'DG-EVT-1', code: 'EVENT_DEAD',
    title: 'Không có sự kiện hết lượt giao (dead) chưa xử lý',
    gate: 'CONF-RUN', contract: 'bizcity_event', rules: ['R-OUTBOX-3', 'R-OUTBOX-4'], conf: ['CONF-RUN-10'], tier: 1, enforce: 'info', weight: 2,
    async run(ctx) {
      const [t] = await ctx.db.query("SELECT to_regclass('public.event_deliveries') IS NOT NULL AS ok");
      if (!t?.ok) return { examined: 0, findings: [], notes: ['CSDL chưa áp migration 0039 (chưa có outbox) — xem DG-DB-1'] };
      const [n] = await ctx.db.query('SELECT count(*)::int AS n FROM event_deliveries');
      const rows = await ctx.db.query(`
        SELECT t.code AS tenant, d.consumer, o.type, o.subject, d.attempts, left(coalesce(d.last_error, ''), 120) AS err
          FROM event_deliveries d JOIN event_outbox o ON o.id = d.event_id JOIN tenants t ON t.id = o.tenant_id
         WHERE d.status = 'dead' ORDER BY o.seq LIMIT 200`);
      return {
        examined: n?.n ?? 0, unitBy: 'key',
        findings: rows.map((r) => ctx.finding(null, null, `[${r.tenant}] ${r.consumer} ← ${r.type} (${r.subject}): hết ${r.attempts} lượt — ${r.err}`, `${r.tenant}:${r.consumer}:${r.type}:${r.subject}`)),
        metrics: { code: 'EVENT_DEAD' },
      };
    },
  },
];
