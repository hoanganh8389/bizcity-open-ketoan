// [2026-10-30 11:27 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — bằng chứng chỉ thêm, chuỗi băm theo đơn vị, biên nhận (PHASES 2.6).
/**
 * Lane diagnostics — bằng chứng (bizcity_evidence@1, migration 0036): chuỗi băm audit_logs của từng đơn vị liền mạch.
 * Cùng mã EVIDENCE_CHAIN với kiểm trong app (apps/api/src/modules/system/diagnostics.ts) — SC-DIAG-1. CHỈ ĐỌC.
 */
export const checks = [
  {
    id: 'DG-EVD-1', code: 'EVIDENCE_CHAIN',
    title: 'Chuỗi băm bằng chứng liền mạch: mỗi dòng băm đúng, nối đúng dòng trước, không hở số thứ tự',
    gate: 'CONF-RUN', contract: 'bizcity_evidence', rules: ['STD-EVD-2'], conf: ['CONF-RUN-12'], tier: 0, enforce: 'block', weight: 4,
    async run(ctx) {
      const [fn] = await ctx.db.query("SELECT to_regprocedure('audit_log_hash(audit_logs)') IS NOT NULL AS ok");
      if (!fn?.ok) return { examined: 0, findings: [], notes: ['CSDL chưa áp migration 0036 (chưa có chuỗi băm) — xem DG-DB-1'] };
      const [n] = await ctx.db.query('SELECT count(*)::int AS n FROM audit_logs WHERE chain_seq IS NOT NULL');
      const rows = await ctx.db.query(`
        WITH c AS (SELECT id, chain_seq, lag(hash) OVER w AS lag_hash, lag(chain_seq) OVER w AS lag_seq
                     FROM audit_logs WHERE chain_seq IS NOT NULL WINDOW w AS (PARTITION BY tenant_id ORDER BY chain_seq))
        SELECT t.code AS tenant, a.id::text AS key,
               CASE WHEN a.hash IS DISTINCT FROM audit_log_hash(a) THEN 'băm sai'
                    WHEN a.prev_hash IS DISTINCT FROM c.lag_hash THEN 'không nối dòng trước'
                    ELSE 'hở số thứ tự' END AS why, c.chain_seq AS seq
          FROM c JOIN audit_logs a ON a.id = c.id JOIN tenants t ON t.id = a.tenant_id
         WHERE a.hash IS DISTINCT FROM audit_log_hash(a) OR a.prev_hash IS DISTINCT FROM c.lag_hash OR c.chain_seq <> coalesce(c.lag_seq, 0) + 1
         ORDER BY a.tenant_id, c.chain_seq LIMIT 200`);
      return {
        examined: n?.n ?? 0, unitBy: 'key',
        findings: rows.map((r) => ctx.finding(null, null, `[${r.tenant}] audit_logs #${r.key} (chuỗi ${r.seq}): ${r.why}`, `${r.tenant}:${r.key}`)),
        metrics: { code: 'EVIDENCE_CHAIN' },
      };
    },
  },
];
