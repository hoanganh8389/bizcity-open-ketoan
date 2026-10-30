#!/usr/bin/env node
/**
 * PHASE-004 · T004-1 — chụp sổ cái thành mốc để so trước / sau khi đổi đường ghi (chỉ đọc).
 *
 *   node so-du-moc.mjs --psql "docker exec -i ketoan-db-1 psql -U ketoan -d <csdl>" --out moc.json
 *   node so-du-moc.mjs --diff cu.json moi.json
 *
 * Gom theo (loại chứng từ, ngày hạch toán, tài khoản, bút toán đảo hay không): tổng Nợ, tổng Có, số dòng; cộng số sự việc
 * theo (loại, trạng thái). Không gom theo đơn vị: test tạo đơn vị tên ngẫu nhiên, nên so tổng mọi đơn vị của cùng kịch bản.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };

const LEDGER = `
SELECT e.doc_type, l.posting_date::text, l.account_code, e.is_reversal, SUM(l.debit)::text, SUM(l.credit)::text, count(*)
  FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
 GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3, 4`;
const EVENTS = `SELECT doc_type, status, count(*) FROM accounting_events GROUP BY 1, 2 ORDER BY 1, 2`;

function query(psql, sqlText) {
  // Dấu phẩy làm dấu phân cột: không cần nháy, chạy được cả cmd.exe lẫn bash (mã tài khoản, loại chứng từ không có dấu phẩy).
  const out = execSync(`${psql} -X -At -F , -v ON_ERROR_STOP=1 -c "SET default_transaction_read_only = on" -f -`, {
    input: sqlText, encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' }, maxBuffer: 1 << 28,
  });
  return out.split(/\r?\n/).filter((l) => l && l !== 'SET').map((l) => l.split(','));
}

if (args[0] === '--diff') {
  const [a, b] = [args[1], args[2]].map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  let diff = 0;
  for (const part of ['ledger', 'events']) {
    const keys = new Set([...Object.keys(a[part]), ...Object.keys(b[part])]);
    for (const k of [...keys].sort()) {
      if (a[part][k] !== b[part][k]) { diff += 1; console.log(`${part} ${k}\n  cũ: ${a[part][k] ?? '—'}\n  mới: ${b[part][k] ?? '—'}`); }
    }
  }
  console.log(diff ? `KHÁC ${diff} ô` : `TRÙNG: ${Object.keys(a.ledger).length} ô sổ cái, ${Object.keys(a.events).length} ô sự việc`);
  process.exit(diff ? 1 : 0);
}

const psql = opt('--psql');
const out = opt('--out');
if (!psql || !out) { console.error('cần --psql "<lệnh psql>" và --out <tệp.json>, hoặc --diff a.json b.json'); process.exit(2); }
const ledger = Object.fromEntries(query(psql, LEDGER).map((r) => [r.slice(0, 4).join('|'), r.slice(4).join('|')]));
const events = Object.fromEntries(query(psql, EVENTS).map((r) => [r.slice(0, 2).join('|'), r[2]]));
fs.writeFileSync(out, JSON.stringify({ takenAt: new Date().toISOString(), ledger, events }, null, 1));
console.log(`${out}: ${Object.keys(ledger).length} ô sổ cái, ${Object.keys(events).length} ô sự việc`);
