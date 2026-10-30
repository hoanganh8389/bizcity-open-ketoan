// @bizcity-layer K kernel/ledger
/**
 * Kiểm toàn vẹn sổ của Kernel (L3) và lớp bảo vệ sổ (L1) — đăng ký vào bộ chẩn đoán của Platform (modules/system/diagnostics.ts)
 * lúc lắp ráp. SQL chép từ lane diagnostics của bộ kiểm chuẩn (tests/conformance/diagnostics/ledger.diag.mjs, install.diag.mjs),
 * thêm điều kiện đơn vị + khoảng ngày + chi nhánh. Đổi một bên thì đổi bên kia: SC-DIAG-1 kiểm hai nơi cùng bộ mã (R-DIAG-9).
 *
 * Ngày xét: bút toán theo posting_date, sự việc theo doc_date (= ngày hạch toán, bizcity_ledger_intake@1 §3).
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql, type RawBuilder } from 'kysely';
import { MIGRATIONS_DIR } from '../../db/paths.js';
import { sqlCounts, type DiagCheck, type DiagScope } from '../system/diagnostics.js';

const SAMPLE = 20;
/** Sự việc do service lõi tự sinh, chưa đi một cửa ghi sổ (nợ A-01, hết khi có eventStore.commit — PHASES 2.1). */
const INTERNAL = ['closing', 'cogs', 'depreciation'];

/** Điều kiện đơn vị + phạm vi trên bảng alias `t` có cột ngày `date` và (tuỳ) cột chi nhánh. */
function scoped(s: DiagScope, t: string, date: string, branch: string | null = 'branch_id'): RawBuilder<boolean> {
  const parts: RawBuilder<unknown>[] = [sql`${sql.ref(`${t}.tenant_id`)} = ${s.tenantId}`];
  if (s.from) parts.push(sql`${sql.ref(`${t}.${date}`)} >= ${s.from}`);
  if (s.to) parts.push(sql`${sql.ref(`${t}.${date}`)} <= ${s.to}`);
  if (s.branchId && branch) parts.push(sql`${sql.ref(`${t}.${branch}`)} = ${s.branchId}`);
  return sql<boolean>`(${sql.join(parts, sql` AND `)})`;
}

const internal = sql.join(INTERNAL);

export const LEDGER_DIAGNOSTICS: DiagCheck[] = [
  {
    code: 'LEDGER_BALANCED', layer: 'L3', level: 'error', scoped: true,
    title: 'Mỗi bút toán: tổng Nợ = tổng Có',
    fix: 'Bút toán lệch làm sai bảng cân đối. Trigger cân Nợ = Có đã bị vượt qua — báo nhóm Lõi, không tự sửa sổ.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM ledger_entries e WHERE ${scoped(s, 'e', 'posting_date')}`,
      sql`SELECT e.entry_no AS key, count(*) OVER ()::int AS total
            FROM ledger_entries e JOIN ledger_lines l ON l.entry_id = e.id
           WHERE ${scoped(s, 'e', 'posting_date')}
           GROUP BY e.id, e.entry_no HAVING sum(l.debit) <> sum(l.credit)
           ORDER BY e.id LIMIT ${SAMPLE}`),
  },
  {
    code: 'LEDGER_BALANCES_DAILY', layer: 'L3', level: 'error', scoped: true,
    title: 'Số dư ngày (ledger_balances_daily) = tổng dòng sổ theo chi nhánh, tài khoản, ngày',
    fix: 'Báo cáo đọc số dư ngày sẽ lệch sổ chi tiết. Dựng lại số dư ngày bằng lệnh của nhóm Lõi (ngoại lệ RULE-LEDGER), có bằng chứng.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM (SELECT DISTINCT l.branch_id, l.account_code, l.posting_date FROM ledger_lines l WHERE ${scoped(s, 'l', 'posting_date')}) x`,
      sql`WITH l AS (SELECT l.branch_id, l.account_code, l.posting_date, sum(l.debit) d, sum(l.credit) c FROM ledger_lines l
                      WHERE ${scoped(s, 'l', 'posting_date')} GROUP BY 1, 2, 3),
               b AS (SELECT b.branch_id, b.account_code, b.posting_date, sum(b.debit) d, sum(b.credit) c FROM ledger_balances_daily b
                      WHERE ${scoped(s, 'b', 'posting_date')} GROUP BY 1, 2, 3)
          SELECT concat_ws(':', branch_id, account_code, posting_date) AS key, count(*) OVER ()::int AS total
            FROM l FULL JOIN b USING (branch_id, account_code, posting_date)
           WHERE coalesce(l.d, 0) <> coalesce(b.d, 0) OR coalesce(l.c, 0) <> coalesce(b.c, 0)
           LIMIT ${SAMPLE}`),
  },
  {
    code: 'LEDGER_REVERSED_ONCE', layer: 'L3', level: 'error', scoped: true,
    title: 'Bút toán đã đảo có đúng một bút toán đảo; bút toán đảo trỏ về bút toán đã đảo',
    fix: 'Đảo hai lần hoặc đảo trỏ sai làm số phát sinh bị trừ thừa / thiếu. Báo nhóm Lõi kèm số bút toán.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM ledger_entries e WHERE ${scoped(s, 'e', 'posting_date')} AND (e.status = 'reversed' OR e.reverses_entry_id IS NOT NULL)`,
      sql`SELECT key, count(*) OVER ()::int AS total FROM (
            SELECT e.entry_no AS key FROM ledger_entries e
             WHERE ${scoped(s, 'e', 'posting_date')} AND e.status = 'reversed'
               AND (SELECT count(*) FROM ledger_entries r WHERE r.reverses_entry_id = e.id) <> 1
            UNION ALL
            SELECT r.entry_no FROM ledger_entries r LEFT JOIN ledger_entries o ON o.id = r.reverses_entry_id
             WHERE ${scoped(s, 'r', 'posting_date')} AND r.reverses_entry_id IS NOT NULL AND (o.id IS NULL OR o.status <> 'reversed')
          ) x LIMIT ${SAMPLE}`),
  },
  {
    code: 'LEDGER_ORPHAN', layer: 'L3', level: 'error', scoped: true,
    title: 'Mọi bút toán trỏ về một sự việc (accounting_events) có thật',
    fix: 'Bút toán không có sự việc thì không truy được chứng từ gốc, không đảo đúng được khi sửa. Báo nhóm Lõi (câu 1: không sự việc, không bút toán).',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM ledger_entries e WHERE ${scoped(s, 'e', 'posting_date')}`,
      sql`SELECT e.entry_no AS key, count(*) OVER ()::int AS total FROM ledger_entries e
           WHERE ${scoped(s, 'e', 'posting_date')}
             AND (e.event_id IS NULL OR NOT EXISTS (SELECT 1 FROM accounting_events a WHERE a.id = e.event_id))
           LIMIT ${SAMPLE}`),
  },
  {
    code: 'EVENT_POSTED_VERSION', layer: 'L3', level: 'error', scoped: true,
    title: 'Sự việc đã ghi sổ có posted_version = version',
    fix: 'Sổ đang phản ánh phiên bản cũ của chứng từ. Định khoản lại chứng từ ở ACC14 (Chờ định khoản) hoặc gửi lại bản mới nhất.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM accounting_events a WHERE ${scoped(s, 'a', 'doc_date')} AND a.status = 'posted' AND a.doc_type NOT IN (${internal})`,
      sql`SELECT a.doc_key AS key, count(*) OVER ()::int AS total FROM accounting_events a
           WHERE ${scoped(s, 'a', 'doc_date')} AND a.status = 'posted' AND a.doc_type NOT IN (${internal})
             AND a.posted_version IS DISTINCT FROM a.version
           LIMIT ${SAMPLE}`),
  },
  {
    code: 'EVENT_HAS_ENTRY', layer: 'L3', level: 'warn', scoped: true,
    title: 'Sự việc đã ghi sổ có ít nhất một bút toán hiệu lực',
    fix: 'Chứng từ báo "đã ghi sổ" nhưng không còn bút toán hiệu lực (vd mọi dòng tiền bằng 0, hoặc đã đảo hết). Mở chứng từ ở ACC14 để xem.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM accounting_events a WHERE ${scoped(s, 'a', 'doc_date')} AND a.status = 'posted'`,
      sql`SELECT a.doc_key AS key, count(*) OVER ()::int AS total FROM accounting_events a
           WHERE ${scoped(s, 'a', 'doc_date')} AND a.status = 'posted'
             AND NOT EXISTS (SELECT 1 FROM ledger_entries e WHERE e.event_id = a.id AND e.status = 'posted' AND NOT e.is_reversal)
           LIMIT ${SAMPLE}`),
  },
  {
    code: 'EVENT_PENDING_AGE', layer: 'L3', level: 'warn', scoped: true,
    title: 'Không có sự việc chờ định khoản / lỗi quá 3 ngày',
    fix: 'Chứng từ chưa vào sổ thì báo cáo thiếu số. Xử lý ở ACC14 (Chờ định khoản): sửa thiếu sót rồi định khoản, hoặc huỷ.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM accounting_events a WHERE ${scoped(s, 'a', 'doc_date')} AND a.status IN ('pending', 'error')`,
      sql`SELECT a.doc_key AS key, count(*) OVER ()::int AS total FROM accounting_events a
           WHERE ${scoped(s, 'a', 'doc_date')} AND a.status IN ('pending', 'error') AND a.received_at < now() - interval '3 days'
           ORDER BY a.received_at LIMIT ${SAMPLE}`),
  },
  {
    code: 'INTERNAL_EVENT_VERSION', layer: 'L3', level: 'info', scoped: true,
    title: 'Sự việc nội bộ (kết chuyển, giá vốn, khấu hao) có posted_version',
    fix: 'Nợ kỹ thuật A-01, không ảnh hưởng số liệu: các service này chưa đi một cửa ghi sổ. Hết khi có eventStore.commit() (PHASES 2.1).',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM accounting_events a WHERE ${scoped(s, 'a', 'doc_date')} AND a.status = 'posted' AND a.doc_type IN (${internal})`,
      sql`SELECT a.doc_key AS key, count(*) OVER ()::int AS total FROM accounting_events a
           WHERE ${scoped(s, 'a', 'doc_date')} AND a.status = 'posted' AND a.doc_type IN (${internal})
             AND a.posted_version IS DISTINCT FROM a.version
           LIMIT ${SAMPLE}`),
  },
  {
    code: 'LEDGER_TRIGGERS', layer: 'L1', level: 'error', scoped: false,
    title: 'Trigger bảo vệ sổ (chỉ thêm, cân Nợ = Có, chặn TRUNCATE) còn đủ và đang bật',
    fix: 'Sổ đang mất lớp bảo vệ: có thể sửa / xoá bút toán. Không ghi sổ tiếp; chạy lại migration (db-migrate) và tìm ai đã tắt trigger (R-KER-3).',
    async run(trx) {
      const want = await declaredTriggers();
      const rows = await sql<{ name: string; table: string; enabled: string }>`
        SELECT t.tgname AS name, c.relname AS "table", t.tgenabled AS enabled
          FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND n.nspname = 'public'`.execute(trx);
      const have = new Map(rows.rows.map((r) => [`${r.table}.${r.name}`, r.enabled]));
      const bad = want.filter((k) => !have.has(k) || have.get(k) === 'D').map((k) => (have.has(k) ? `tắt:${k}` : `thiếu:${k}`));
      return { examined: want.length, count: bad.length, sample: bad };
    },
  },
];

let triggerCache: string[] | null = null;

/** `<bảng>.<trigger>` khai trong db/migrations (CREATE TRIGGER … ON …) — cùng cách đọc với DG-DB-2. */
async function declaredTriggers(): Promise<string[]> {
  if (triggerCache) return triggerCache;
  const out = new Set<string>();
  for (const f of (await readdir(MIGRATIONS_DIR)).filter((x) => x.endsWith('.sql')).sort()) {
    const text = await readFile(path.join(MIGRATIONS_DIR, f), 'utf8');
    for (const m of text.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+(\w+)[\s\S]*?\bON\s+(?:public\.)?(\w+)/gi)) out.add(`${m[2]}.${m[1]}`);
  }
  return (triggerCache = [...out]);
}
