// [2026-10-30 11:27 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — bằng chứng chỉ thêm, chuỗi băm theo đơn vị, biên nhận (PHASES 2.6).
// [2026-11-01 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — chú thích: diagnostics.ts nay ở packages/platform/src/system
// [2026-11-06 10:15 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-30c: DG-EVD-2..5 bản niêm phong (EVIDENCE_SEAL_*, ADR-0030) — cần DATA_DIR trỏ thư mục dữ liệu của bản cài
/**
 * Lane diagnostics — bằng chứng (bizcity_evidence@1, migration 0036): chuỗi băm audit_logs của từng đơn vị liền mạch.
 * Cùng mã EVIDENCE_CHAIN với kiểm trong app (packages/platform/src/system/diagnostics.ts) — SC-DIAG-1. CHỈ ĐỌC.
 * DG-EVD-2..5: bản niêm phong theo ngày (ADR-0030) — cùng mã EVIDENCE_SEAL_* với packages/platform/src/core/evidence-export.ts. Tệp kiểm
 * bằng packages/cli/lib/evidence-seal.mjs (cùng bộ kiểm của `bizcity evidence verify`); chiều CSDL so băm từng dòng trong khoảng của manifest.
 * Không có DATA_DIR thì bỏ qua (ghi chú), không đoán đường dẫn.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { verifyDir } from '../../../packages/cli/lib/evidence-seal.mjs';

const GRACE = 2;
const SPAN = 31;
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const vnToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const memo = new WeakMap();

/** Một lượt cho cả bốn mã: { skip?: string, examined, findings: [{ code, tenant, date, detail }] }. */
async function sealScan(ctx) {
  if (memo.has(ctx.db)) return memo.get(ctx.db);
  const run = (async () => {
    if (!process.env.DATA_DIR) return { skip: 'chưa đặt DATA_DIR (thư mục dữ liệu của bản cài) — bỏ qua kiểm bản niêm phong', examined: 0, findings: [] };
    const root = path.resolve(process.env.DATA_DIR, 'bang-chung');
    const tenants = await ctx.db.query(`
      SELECT t.id::text AS id, t.code, to_char(min(a.created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS first
        FROM audit_logs a JOIN tenants t ON t.id = a.tenant_id WHERE a.chain_seq IS NOT NULL GROUP BY t.id, t.code ORDER BY t.id`);
    const out = { examined: 0, findings: [] };
    const overdue = addDays(vnToday(), -(GRACE + 1));
    for (const t of tenants) {
      const dir = path.join(root, t.id);
      const r = verifyDir(dir);
      out.examined += r.days;
      for (const f of r.findings) out.findings.push({ ...f, tenant: t.code });
      // MISSING: ngày đã quá hạn trong SPAN ngày gần nhất mà chưa có manifest
      for (let d = t.first > addDays(overdue, -SPAN) ? t.first : addDays(overdue, -SPAN); d <= overdue; d = addDays(d, 1)) {
        const [y, m, dd] = d.split('-');
        if (!existsSync(path.join(dir, y, m, `${dd}.manifest.json`))) out.findings.push({ code: 'EVIDENCE_SEAL_MISSING', tenant: t.code, date: d, detail: 'ngày đã đóng chưa niêm phong' });
      }
      // CSDL ↔ tệp: băm từng dòng trong khoảng của manifest, và băm tính lại trong CSDL
      if (!existsSync(dir)) continue;
      for (const y of readdirSync(dir).filter((x) => /^\d{4}$/.test(x))) for (const m of readdirSync(path.join(dir, y)).filter((x) => /^\d{2}$/.test(x))) {
        for (const f of readdirSync(path.join(dir, y, m)).filter((x) => /^\d{2}\.manifest\.json$/.test(x))) {
          const date = `${y}-${m}-${f.slice(0, 2)}`;
          let man;
          try { man = JSON.parse(readFileSync(path.join(dir, y, m, f), 'utf8')); } catch { continue; }
          if (!man.rows) continue;
          // ctx.db.query chỉ nhận chuỗi SQL (chạy được cả qua psql): số lấy từ tệp phải là số nguyên mới vào câu lệnh
          const [tid, lo, hi] = [Number(t.id), man.firstSeq, man.lastSeq];
          if (![tid, lo, hi].every(Number.isSafeInteger)) { out.findings.push({ code: 'EVIDENCE_SEAL_FILE', tenant: t.code, date, detail: 'firstSeq / lastSeq không phải số nguyên' }); continue; }
          const [x] = await ctx.db.query(`
            SELECT count(*)::int AS n, count(*) FILTER (WHERE a.hash IS DISTINCT FROM audit_log_hash(a))::int AS bad, string_agg(a.hash, ',' ORDER BY a.chain_seq) AS agg
              FROM audit_logs a WHERE a.tenant_id = ${tid} AND a.chain_seq BETWEEN ${lo} AND ${hi}`);
          const jsonl = path.join(dir, y, m, `${f.slice(0, 2)}.jsonl`);
          const fileHashes = existsSync(jsonl) ? readFileSync(jsonl, 'utf8').split('\n').filter((l) => l).map((l) => { try { return JSON.parse(l).hash; } catch { return '?'; } }).join(',') : null;
          const why = x.n !== man.rows ? `CSDL có ${x.n} dòng, tệp ${man.rows}` : x.bad ? `${x.bad} dòng trong CSDL băm lại không khớp` : fileHashes != null && x.agg !== fileHashes ? 'băm dòng trong CSDL khác tệp' : null;
          if (why) out.findings.push({ code: 'EVIDENCE_SEAL_DB', tenant: t.code, date, detail: why });
        }
      }
    }
    return out;
  })();
  memo.set(ctx.db, run);
  return run;
}

const sealCheck = (id, code, title, enforce, weight) => ({
  id, code, title, gate: 'CONF-RUN', contract: 'bizcity_evidence', rules: ['STD-EVD-9', 'STD-EVD-10'], conf: ['CONF-RUN-12'], tier: 1, enforce, weight,
  async run(ctx) {
    const r = await sealScan(ctx);
    if (r.skip) return { examined: 0, findings: [], notes: [r.skip] };
    const hits = r.findings.filter((f) => f.code === code);
    return {
      examined: r.examined, unitBy: 'key',
      findings: hits.slice(0, 200).map((f) => ctx.finding(null, null, `[${f.tenant}] ${f.date}: ${f.detail}`, `${f.tenant}:${f.date}`)),
      metrics: { code },
    };
  },
});

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
  { ...sealCheck('DG-EVD-2', 'EVIDENCE_SEAL_MISSING', 'Ngày đã đóng quá 2 ngày đều đã niêm phong bằng chứng', 'info', 1), code: 'EVIDENCE_SEAL_MISSING' },
  { ...sealCheck('DG-EVD-3', 'EVIDENCE_SEAL_FILE', 'Tệp niêm phong bằng chứng đủ, đúng băm, từng dòng tự kiểm được', 'block', 3), code: 'EVIDENCE_SEAL_FILE' },
  { ...sealCheck('DG-EVD-4', 'EVIDENCE_SEAL_DB', 'Bằng chứng trong CSDL khớp bản niêm phong', 'block', 3), code: 'EVIDENCE_SEAL_DB' },
  { ...sealCheck('DG-EVD-5', 'EVIDENCE_SEAL_CHAIN', 'Các manifest niêm phong nối liền theo ngày', 'block', 3), code: 'EVIDENCE_SEAL_CHAIN' },
];
