/**
 * Lane diagnostics — kiểm BẢN CÀI (chỉ đọc pg_catalog / cấu hình CSDL), khác ledger.diag.mjs (kiểm dữ liệu sổ).
 * Trả lời: lớp bảo vệ Kernel ở tầng CSDL có còn nguyên trên máy này không? (RULE-SELF-DIAGNOSTICS, RULE-KERNEL)
 */

/** Trigger khai trong migration (đọc tĩnh) — nguồn sự thật để so với CSDL đang chạy. */
function declaredTriggers(repo) {
  const out = [];
  for (const f of repo.list('db/migrations').filter((x) => x.endsWith('.sql'))) {
    const t = repo.read(`db/migrations/${f}`) ?? '';
    for (const m of t.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+(\w+)[\s\S]*?\bON\s+(?:public\.)?(\w+)/gi)) {
      out.push({ name: m[1], table: m[2], file: f });
    }
  }
  return out;
}

export const checks = [
  {
    id: 'DG-DB-2', code: 'LEDGER_TRIGGERS',
    title: 'Trigger bảo vệ sổ cái (chỉ thêm, cân Nợ = Có, chặn TRUNCATE) còn đủ và đang bật',
    gate: 'CONF-RUN', contract: 'kernel', rules: ['R-LEDGER-1', 'R-DB-2', 'R-KER-3', 'R-DIAG-2'], conf: ['CONF-RUN-17'], tier: 0, enforce: 'block', weight: 5,
    async run(ctx) {
      const want = declaredTriggers(ctx.repo);
      const rows = await ctx.db.query(`SELECT t.tgname AS name, c.relname AS "table", t.tgenabled AS enabled
                                       FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
                                       JOIN pg_namespace n ON n.oid = c.relnamespace
                                       WHERE NOT t.tgisinternal AND n.nspname = 'public'`);
      const have = new Map(rows.map((r) => [`${r.table}.${r.name}`, r.enabled]));
      const findings = [];
      for (const w of want) {
        const k = `${w.table}.${w.name}`;
        if (!have.has(k)) findings.push(ctx.finding(`db/migrations/${w.file}`, null, `trigger ${k} khai trong migration nhưng KHÔNG có trong CSDL`, `missing:${k}`));
        else if (have.get(k) === 'D') findings.push(ctx.finding(`db/migrations/${w.file}`, null, `trigger ${k} đang bị TẮT (ALTER TABLE … DISABLE TRIGGER)`, `disabled:${k}`));
      }
      return { examined: want.length, unitBy: 'key', findings, metrics: { declared: want.length, inDb: rows.length } };
    },
  },
  {
    id: 'DG-SEC-1', code: 'DB_ROLE_PRIVILEGE',
    title: 'Ứng dụng không kết nối CSDL bằng quyền superuser (superuser tắt được trigger bảo vệ sổ)',
    gate: 'CONF-RUN', contract: 'kernel', rules: ['R-SEC-6', 'R-DIAG-2'], conf: [], tier: 1, enforce: 'info', weight: 3,
    async run(ctx) {
      const [r] = await ctx.db.query(`SELECT current_user AS role, r.rolsuper AS super, r.rolbypassrls AS bypass
                                      FROM pg_roles r WHERE r.rolname = current_user`);
      const findings = [];
      if (r?.super) findings.push(ctx.finding(null, null, `vai trò "${r.role}" là superuser — đổi API sang vai trò thường (RULE-SECURITY R-SEC-6)`, 'superuser'));
      else if (r?.bypass) findings.push(ctx.finding(null, null, `vai trò "${r.role}" có BYPASSRLS — RLS sẽ không có tác dụng`, 'bypassrls'));
      return { examined: 1, unitBy: 'key', findings, notes: ['Đo vai trò của kết nối diagnostics; bản cài thật phải chạy kiểm này bằng đúng chuỗi kết nối của API'] };
    },
  },
  {
    id: 'DG-DB-3', code: 'DB_SETTINGS',
    title: 'CSDL đúng cấu hình nền: PostgreSQL ≥ 16, múi giờ Asia/Ho_Chi_Minh, mã hoá UTF8',
    gate: 'CONF-RUN', contract: 'kernel', rules: ['R-DIAG-2'], conf: [], tier: 1, enforce: 'info', weight: 2,
    async run(ctx) {
      const [r] = await ctx.db.query(`SELECT current_setting('server_version_num')::int AS ver, current_setting('TimeZone') AS tz,
                                             pg_encoding_to_char(d.encoding) AS enc
                                      FROM pg_database d WHERE d.datname = current_database()`);
      const findings = [];
      if (r.ver < 160000) findings.push(ctx.finding(null, null, `PostgreSQL ${r.ver} < 16`, 'version'));
      if (!/Ho_Chi_Minh|Saigon|\+07|UTC\+7/i.test(r.tz)) findings.push(ctx.finding(null, null, `TimeZone = ${r.tz} (chuẩn: Asia/Ho_Chi_Minh — ngày hạch toán lệch quanh nửa đêm)`, 'timezone'));
      if (r.enc !== 'UTF8') findings.push(ctx.finding(null, null, `mã hoá ${r.enc} (chuẩn UTF8)`, 'encoding'));
      return { examined: 3, unitBy: 'key', findings, metrics: r };
    },
  },
];
