/**
 * bizcity_data@1 — đọc tĩnh migration (CONF-MIG phần không cần CSDL).
 */
const DIR = 'db/migrations';
const LOCK = 'tests/conformance/locks/migrations.lock.json';
/** Bảng toàn cục, không thuộc đơn vị nào. */
const GLOBAL_TABLES = new Set(['tenants', 'schema_migrations']);

export const checks = [
  {
    id: 'SC-DATA-1',
    title: 'Migration: tên NNNN_ten.sql, số không trùng, không hở',
    gate: 'CONF-MIG', contract: 'bizcity_data', rules: ['R-DB-3'], conf: ['CONF-MIG-1'], tier: 1, enforce: 'ratchet', weight: 3, targets: ['repo', 'module'],
    run(ctx) {
      const files = ctx.repo.list(DIR).filter((f) => f.endsWith('.sql'));
      const findings = [];
      const byNo = new Map();
      for (const f of files) {
        if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(f)) findings.push(ctx.finding(`${DIR}/${f}`, null, 'tên tệp phải dạng NNNN_ten_khong_dau.sql', 'bad-name'));
        const no = f.slice(0, 4);
        byNo.set(no, [...(byNo.get(no) ?? []), f]);
      }
      for (const [no, fs] of byNo) if (fs.length > 1) findings.push(ctx.finding(DIR, null, `trùng số ${no}: ${fs.join(', ')}`, `dup:${no}`));
      const nums = [...byNo.keys()].map(Number).filter(Number.isFinite).sort((a, b) => a - b);
      for (let n = nums[0]; n < nums.at(-1); n++) if (!byNo.has(String(n).padStart(4, '0'))) findings.push(ctx.finding(DIR, null, `hở số ${String(n).padStart(4, '0')}`, `gap:${String(n).padStart(4, '0')}`));
      return { examined: files.length, unitBy: 'key', findings };
    },
  },
  {
    id: 'SC-DATA-2',
    title: 'Migration đã phát hành không bị sửa (so băm với locks/migrations.lock.json)',
    gate: 'CONF-MIG', contract: 'bizcity_data', rules: ['R-DB-1'], conf: ['CONF-MIG-1'], tier: 0, enforce: 'block', weight: 5, targets: ['repo'],
    run(ctx) {
      const lock = ctx.core.json(LOCK);
      const files = ctx.repo.list(DIR).filter((f) => f.endsWith('.sql'));
      if (!lock) return { examined: files.length, findings: [], notes: [`chưa có ${LOCK} — chạy: node tests/conformance/selfcheck.mjs --update-lock`] };
      const findings = []; const fresh = [];
      for (const f of files) {
        const want = lock.files[f];
        const got = ctx.repo.hash(`${DIR}/${f}`);
        if (!want) fresh.push(f);
        else if (want !== got) findings.push(ctx.finding(`${DIR}/${f}`, null, 'tệp đã khoá bị sửa — viết migration mới thay vì sửa tệp cũ', 'changed'));
      }
      for (const f of Object.keys(lock.files)) if (!files.includes(f)) findings.push(ctx.finding(`${DIR}/${f}`, null, 'tệp đã khoá bị xoá / đổi tên', 'removed'));
      return { examined: files.length, findings, notes: fresh.length ? [`migration mới chưa khoá: ${fresh.join(', ')} (khoá khi phát hành: --update-lock)`] : [] };
    },
  },
  {
    id: 'SC-DATA-3',
    title: 'Mọi bảng và cột có COMMENT ON',
    gate: 'CONF-MIG', contract: 'bizcity_data', rules: ['R-DB-5'], conf: ['CONF-MIG-6'], tier: 1, enforce: 'ratchet', weight: 2, targets: ['repo', 'module'],
    run(ctx) {
      const m = ctx.migrations();
      const findings = []; let units = 0;
      for (const t of m.tables.values()) {
        units++;
        if (!m.tableComments.has(t.name)) findings.push(ctx.finding(t.file, t.line, `bảng ${t.name} thiếu COMMENT ON TABLE`, `table:${t.name}`));
        const missing = [...t.columns.keys()].filter((c) => !m.columnComments.has(`${t.name}.${c}`) && !['id', 'tenant_id', 'created_at', 'updated_at'].includes(c));
        units += t.columns.size;
        if (!missing.length) continue;
        // Bảng nền (_goc_, sinh từ pg_dump) gộp một mục mỗi bảng cho baseline gọn; bảng mới thì từng cột.
        if (/_goc_/.test(t.file)) findings.push({ ...ctx.finding(t.file, t.line, `bảng nền ${t.name}: ${missing.length} cột thiếu COMMENT ON COLUMN`, `columns:${t.name}`), weight: missing.length });
        else for (const c of missing) findings.push(ctx.finding(t.file, t.line, `cột ${t.name}.${c} thiếu COMMENT ON COLUMN`, `column:${t.name}.${c}`));
      }
      const tables = m.tables.size;
      const uncommented = findings.reduce((a, f) => a + (f.weight ?? 1), 0);
      return { examined: units, unitBy: 'key', affected: uncommented, findings, metrics: { tables, tablesCommented: [...m.tables.keys()].filter((t) => m.tableComments.has(t)).length, uncommented } };
    },
  },
  {
    id: 'SC-DATA-4',
    title: 'Tiền là numeric(18,2): không float / real / double precision / money',
    gate: 'CONF-MIG', contract: 'bizcity_data', rules: ['R-DB-9'], conf: ['CONF-MIG-4'], tier: 0, enforce: 'ratchet', weight: 4, targets: ['repo', 'module'],
    run(ctx) {
      const m = ctx.migrations();
      const findings = []; let units = 0;
      for (const t of m.tables.values()) for (const [c, type] of t.columns) {
        units++;
        if (/^(float[48]?|real|double precision|money)\b/i.test(type)) findings.push(ctx.finding(t.file, t.line, `${t.name}.${c} kiểu ${type.split(' ')[0]}`, `${t.name}.${c}`));
      }
      return { examined: units, unitBy: 'key', findings };
    },
  },
  {
    id: 'SC-DATA-5',
    title: 'Bảng nghiệp vụ có cột tenant_id',
    gate: 'CONF-MIG', contract: 'bizcity_data', rules: ['R-DB-7', 'R-TEN-1'], conf: ['CONF-MIG-2'], tier: 0, enforce: 'ratchet', weight: 4, targets: ['repo', 'module'],
    run(ctx) {
      const m = ctx.migrations();
      const findings = [];
      for (const t of m.tables.values()) {
        if (GLOBAL_TABLES.has(t.name)) continue;
        if (!t.columns.has('tenant_id')) findings.push(ctx.finding(t.file, t.line, `bảng ${t.name} không có tenant_id (bảng con phải lọc qua bảng cha — RLS không làm được)`, t.name));
      }
      return { examined: m.tables.size, unitBy: 'key', findings };
    },
  },
  {
    id: 'SC-DATA-6',
    title: 'Cô lập đơn vị bằng RLS (Row Level Security) trên bảng có tenant_id',
    gate: 'CONF-MIG', contract: 'bizcity_data', rules: ['STD-DATA-1'], conf: ['CONF-MIG-2'], tier: 0, enforce: 'planned', phase: 'Phase 2 (2.5)', weight: 4, targets: ['repo', 'module'],
    run(ctx) {
      const m = ctx.migrations();
      const scoped = [...m.tables.values()].filter((t) => t.columns.has('tenant_id'));
      const done = scoped.filter((t) => m.rls.has(t.name) && (m.policies.get(t.name) ?? 0) > 0);
      return {
        examined: scoped.length,
        readiness: scoped.length ? done.length / scoped.length : 0,
        findings: [],
        metrics: { tenantTables: scoped.length, withRls: done.length },
        notes: [`${done.length}/${scoped.length} bảng có RLS + chính sách (audit A-23)`],
      };
    },
  },
];
