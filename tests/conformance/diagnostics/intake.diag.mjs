// [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W4 (S021-19): DG-INTAKE-1 INTAKE_OPEN_AGE — mục bể chờ mở quá ngưỡng (cùng mã với kiểm trong app, packages/kernel/src/modules/intake/intake.diagnostics.ts)
/**
 * Lane diagnostics — bể chờ đầu vào (bizcity_intake_findings@1 §5, migration 0059): chứng từ cửa nạp từ chối nằm ở bể quá
 * ngưỡng (tenants.settings.intake.openAlertDays, mặc định 3 ngày) = chưa vào sổ, báo cáo thiếu số. CHỈ ĐỌC; không đọc nguyên văn.
 */
export const checks = [
  {
    id: 'DG-INTAKE-1', code: 'INTAKE_OPEN_AGE',
    title: 'Không có chứng từ nằm ở bể chờ đầu vào quá ngưỡng ngày',
    gate: 'CONF-RUN', contract: 'bizcity_ledger_intake', rules: ['R-INTAKE-2'], conf: [], tier: 2, enforce: 'info', weight: 1,
    async run(ctx) {
      const [t] = await ctx.db.query("SELECT to_regclass('public.intake_inbox') IS NOT NULL AS ok");
      if (!t?.ok) return { examined: 0, findings: [], notes: ['CSDL chưa áp migration 0059 (chưa có bể chờ) — xem DG-DB-1'] };
      const [n] = await ctx.db.query("SELECT count(*)::int AS n FROM intake_inbox WHERE status = 'open'");
      const rows = await ctx.db.query(`
        SELECT t.code AS tenant, coalesce(i.doc_key, '#' || i.id) AS key, i.received_at::date AS since
          FROM intake_inbox i JOIN tenants t ON t.id = i.tenant_id
         WHERE i.status = 'open'
           AND i.received_at < now() - make_interval(days => coalesce((t.settings #>> '{intake,openAlertDays}')::int, 3))
         ORDER BY i.received_at LIMIT 200`);
      return {
        examined: n?.n ?? 0, unitBy: 'key',
        findings: rows.map((r) => ctx.finding(null, null, `[${r.tenant}] ${r.key}: ở bể chờ từ ${r.since}`, `${r.tenant}:${r.key}`)),
        metrics: { code: 'INTAKE_OPEN_AGE' },
      };
    },
  },
];
