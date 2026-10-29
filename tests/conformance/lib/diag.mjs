/** Dựng check diagnostics từ hai câu SQL chỉ đọc: `count` (đơn vị đã xét) và `sql` (các dòng sai). */
export function sqlCheck({ id, code, title, rules = [], conf = [], tier = 0, enforce = 'block', weight = 3, contract = 'kernel', count, sql }) {
  return {
    id, code, title, gate: 'CONF-RUN', contract, rules, conf, tier, enforce, weight,
    async run(ctx) {
      const [n] = await ctx.db.query(count);
      const rows = await ctx.db.query(sql);
      return {
        examined: n?.n ?? 0,
        unitBy: 'key',
        findings: rows.map((r) => ctx.finding(null, null, `[${r.tenant}] ${r.key} ${r.detail ? JSON.stringify(r.detail) : ''}`.trim(), `${r.tenant}:${r.key}`)),
        metrics: { code, truncated: rows.length >= 200 },
      };
    },
  };
}
