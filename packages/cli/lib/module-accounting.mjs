// [2026-11-03 07:17 PM Johnny Chu - Chu Hoàng Anh] ADR-0020 — `bizcity module accounting-check`: module mới không chạm sổ, không tự chọn tài khoản, không tự tính giá vốn; chứng từ mẫu qua event check
/**
 * [2026-11-04 12:25 AM Johnny Chu - Chu Hoàng Anh] PHASE-027 — nhãn luật theo khung 0–VIII (D027-1)
 * KIỂM KẾ TOÁN CỦA MỘT MODULE (skill build-business-app-with-open-ketoan, ADR-0015, trụ cột I IV V trong docs/standard/tru-cot.json).
 * `selfcheck --module` chỉ chạy 15 luật về manifest, dữ liệu, bảo mật; nó KHÔNG thấy một module tự ghi bảng sổ,
 * tự điền số tài khoản hay tự tính giá vốn (đã thử: module làm cả ba vẫn ra "ĐẠT"). Lệnh này bù đúng khoảng đó.
 *
 *   AC-1  không đụng bảng sổ / kho của Core (ledger_*, inventory_*, accounting_events); đọc chỉ qua bizcity_read.* / ctx.ledger.query
 *   AC-2  không viết số tài khoản (module `ke-toan` là ngoại lệ duy nhất, ADR-0015)
 *   AC-3  cảnh báo: tự điền giá vốn (cost, unitCost, cogs) — chỉ hợp lệ khi kế toán trưởng chọn hệ thống gửi là nguồn giá vốn
 *   AC-4  docType gửi vào sổ phải thuộc bizcity_ledger_intake@1 (APPROVABLE_DOC_TYPES của hợp đồng); tên của cổng chờ → chỉ sang skill mở cổng
 *   AC-5  docKey ổn định, mang tiền tố mã module (gửi lại không ghi hai lần)
 *   AC-6  chứng từ mẫu modules/<key>/examples/*.json qua `event check` (small win: thấy bút toán Kernel dựng)
 *
 * Quét TĨNH bằng biểu thức chính quy sau khi bỏ chú thích: có thể bỏ sót, không thay test hợp đồng module trên CSDL
 * (`module check`). Chỉ báo FAIL khi thấy đúng mẫu; không đoán.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { ROOT, loadContracts } from './sources.mjs';
import { RESERVED_GATES, gateOf } from './gates.mjs';
import { checkEvent } from './event-check.mjs';

const CODE_EXT = /\.(ts|tsx|js|mjs)$/;
const CORE_TABLES = 'ledger_lines|ledger_entries|ledger_balances_daily|ledger_links|ledger_entry_sequences|inventory_movements|inventory_costs|accounting_events';
const WRITE_BEFORE = /(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?|ALTER\s+TABLE|DROP\s+TABLE)\s*$/i;
const ACCOUNT_KEYS = 'debitAccount|creditAccount|accountCode|account_code|counterAccount|expenseAccount|revenueAccount|inventoryAccount|cogsAccount|taxAccount';

const row = (id, title, status, detail = '', extra = {}) => ({ id, title, status, detail, ...extra });

// Bỏ chú thích (dòng, khối; với SQL là dấu hai gạch) nhưng giữ chuỗi và số dòng.
export function stripComments(src, { sql = false } = {}) {
  let out = '';
  let i = 0;
  let q = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (q) {
      out += c;
      if (c === '\\' && !sql) { out += n ?? ''; i += 2; continue; }
      if (c === q) q = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || (c === '`' && !sql)) { q = c; out += c; i++; continue; }
    if (sql ? c === '-' && n === '-' : c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i++; }
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function listFiles(dir, accept) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'dist' || e === '.bizcity') continue;
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...listFiles(p, accept));
    else if (accept.test(e)) out.push(p);
  }
  return out;
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const snippet = (text, index) => text.slice(text.lastIndexOf('\n', index) + 1, text.indexOf('\n', index) === -1 ? undefined : text.indexOf('\n', index)).trim().slice(0, 120);

/** @returns {{key:string, verdict:string, rows:object[], files:number}} */
export async function checkModuleAccounting(key, { server, key: apiKey, staticOnly = false, fetchImpl, modulesDir = path.join(ROOT, 'modules') } = {}) {
  const dir = path.join(modulesDir, key);
  const rows = [];
  if (!existsSync(path.join(dir, 'bizcity.module.json'))) throw new Error(`không có modules/${key}/bizcity.module.json`);
  let manifest = {};
  try {
    manifest = JSON.parse(readFileSync(path.join(dir, 'bizcity.module.json'), 'utf8'));
  } catch (err) {
    return { key, verdict: 'FAIL', files: 0, rows: [row('AC-0', 'Manifest đọc được', 'FAIL', `bizcity.module.json không phải JSON: ${err.message}`)] };
  }

  const sources = [
    ...listFiles(path.join(dir, 'api'), CODE_EXT).map((f) => ({ f, text: stripComments(readFileSync(f, 'utf8')) })),
    ...listFiles(path.join(dir, 'web'), CODE_EXT).map((f) => ({ f, text: stripComments(readFileSync(f, 'utf8')) })),
    ...listFiles(path.join(dir, 'migrations'), /\.sql$/).map((f) => ({ f, text: stripComments(readFileSync(f, 'utf8'), { sql: true }) })),
  ];
  const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
  const hits = (re, filter = () => true, files = sources) => {
    const out = [];
    for (const { f, text } of files) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) if (filter(m, text, f)) out.push({ file: rel(f), line: lineOf(text, m.index), text: snippet(text, m.index), match: m });
    }
    return out;
  };
  // Mỗi dòng nguồn chỉ kể một lần dù khớp nhiều mẫu.
  const lines = (list) => [...new Map(list.map((h) => [`${h.file}:${h.line}`, h])).values()];
  const show = (list) => lines(list).slice(0, 5).map((h) => `${h.file}:${h.line}  ${h.text}`);
  const submitting = sources.filter(({ text }) => /\bledger\s*\.\s*submit\b|\bsubmitDocument/.test(text));

  // AC-1: bảng sổ / kho của Core
  const coreRe = new RegExp(`\\b(bizcity_read\\.|public\\.)?(${CORE_TABLES})\\b`, 'g');
  const ac1 = hits(coreRe, (m, text) => {
    const writing = WRITE_BEFORE.test(text.slice(Math.max(0, m.index - 40), m.index));
    m.writing = writing;
    return m[1] !== 'bizcity_read.' || writing;
  });
  rows.push(ac1.length
    ? row('AC-1', 'Không đụng bảng sổ / kho của Core', 'FAIL', `${lines(ac1).length} chỗ: ${[...new Set(ac1.map((h) => h.match[2]))].join(', ')}`, {
      hits: show(ac1),
      fix: 'Module không thấy và không ghi bảng sổ. Tiền vào sổ: ctx.ledger.submit(chứng từ). Đọc số liệu: ctx.ledger.query hoặc khung nhìn bizcity_read.* (chỉ đọc).',
      rule: 'ADR-0015 · docs/contracts/BIZCITY-DATA-v1.md §7 · R-LEDGER-1 (sổ chỉ thêm)',
    })
    : row('AC-1', 'Không đụng bảng sổ / kho của Core', 'PASS', `${sources.length} tệp đã quét`));

  // AC-2: số tài khoản
  if (key === 'ke-toan') {
    rows.push(row('AC-2', 'Không viết số tài khoản', 'N/A', 'module ke-toan được tự chọn tài khoản (ADR-0015)'));
  } else {
    const ac2 = hits(new RegExp(`\\b(${ACCOUNT_KEYS})\\b['"]?\\s*[:=]\\s*['"\`](\\d{3,6})['"\`]`, 'g'));
    rows.push(ac2.length
      ? row('AC-2', 'Không viết số tài khoản', 'FAIL', `${lines(ac2).length} chỗ: ${[...new Set(ac2.map((h) => h.match[2]))].join(', ')}`, {
        hits: show(ac2),
        fix: 'Chỉ kể sự việc kèm lý do (reasonCode lấy từ GET /api/v1/posting/reasons). Kernel và AccountResolver chọn Nợ / Có theo gói định khoản của đơn vị.',
        rule: 'ADR-0015 (chỉ module ke-toan được tự chọn tài khoản) · docs/rules/RULE-POSTING.md',
      })
      : row('AC-2', 'Không viết số tài khoản', 'PASS'));
  }

  // AC-3: giá vốn tự điền (chỉ trong tệp có gửi sổ)
  const ac3 = hits(/\b(unitCost|cogs|cogsAmount|costPrice|giaVon)\b\s*:|\bcost\s*:\s*(?!z\.)/g, () => true, submitting);
  rows.push(ac3.length
    ? row('AC-3', 'Không tự điền giá vốn', 'WARN', `${lines(ac3).length} chỗ trong tệp có gửi sổ`, {
      hits: show(ac3),
      fix: 'Đừng gửi giá vốn: kế toán trưởng chạy Tính giá vốn tháng (ACC49). Chỉ gửi lines[].cost khi đơn vị đã chọn hệ thống gửi là nguồn giá vốn; nếu đúng vậy, ghi rõ ở README của module.',
      rule: 'skills/open-ketoan-standard C1 · trụ cột V (docs/standard/tru-cot.json)',
    })
    : row('AC-3', 'Không tự điền giá vốn', submitting.length ? 'PASS' : 'N/A', submitting.length ? '' : 'module không gửi chứng từ vào sổ'));

  // AC-4: docType
  const contracts = await loadContracts();
  const allowed = contracts.mod?.APPROVABLE_DOC_TYPES ? [...contracts.mod.APPROVABLE_DOC_TYPES] : null;
  // ledger.submits[].docType: loại chứng từ module khai nộp vào sổ (BIZCITY-MODULE-v1, STD-MOD-2). docTypes / documents: loại chứng từ riêng của module.
  const submitsDeclared = new Set((manifest.ledger?.submits ?? []).map((s) => s?.docType).filter((x) => typeof x === 'string'));
  const declared = new Set([...submitsDeclared, ...(manifest.docTypes ?? []), ...(manifest.documents ?? []).map((d) => d?.type ?? d?.key ?? d)].filter((x) => typeof x === 'string'));
  const dtHits = hits(/\bdocType\s*:\s*['"`]([a-z_]+)['"`]/g, () => true, submitting);
  if (!submitting.length) rows.push(row('AC-4', 'docType gửi vào sổ thuộc hợp đồng', 'N/A', 'module không gửi chứng từ vào sổ'));
  else if (!allowed) rows.push(row('AC-4', 'docType gửi vào sổ thuộc hợp đồng', 'SKIP', `${contracts.missing ?? 'bản dựng contracts thiếu APPROVABLE_DOC_TYPES'} — dựng contracts để kiểm`));
  else {
    const bad = dtHits.filter((h) => !allowed.includes(h.match[1]) && !declared.has(h.match[1]));
    const gates = bad.filter((h) => gateOf(h.match[1]));
    const unknown = bad.filter((h) => !gateOf(h.match[1]));
    if (gates.length) {
      const g = gateOf(gates[0].match[1]);
      rows.push(row('AC-4', 'docType gửi vào sổ thuộc hợp đồng', 'FAIL', `${gates[0].match[1]}: cổng "${g.title}" mới giữ chỗ, Kernel chưa mở (không phải lỗi của bạn)`, {
        hits: show(gates),
        fix: `${g.today} ${g.forbid} Muốn mở cổng: ${g.skill}`,
        rule: 'trụ cột IV (docs/standard/tru-cot.json) · skills/contribute-production-module',
      }));
    } else if (unknown.length) {
      rows.push(row('AC-4', 'docType gửi vào sổ thuộc hợp đồng', 'FAIL', `docType ngoài hợp đồng: ${[...new Set(unknown.map((h) => h.match[1]))].join(', ')}`, {
        hits: show(unknown),
        fix: `Dùng một trong: ${allowed.join(', ')}. Cần loại mới thì đề xuất qua ADR, không tự đặt tên.`,
        rule: 'bizcity_ledger_intake@1 (packages/contracts, APPROVABLE_DOC_TYPES)',
      }));
    } else {
      const undeclared = dtHits.filter((h) => allowed.includes(h.match[1]) && !submitsDeclared.has(h.match[1]));
      rows.push(undeclared.length
        ? row('AC-4', 'docType gửi vào sổ thuộc hợp đồng', 'FAIL', `chưa khai ở manifest ledger.submits: ${[...new Set(undeclared.map((h) => h.match[1]))].join(', ')}`, {
          hits: show(undeclared),
          fix: 'Khai mỗi docType module nộp vào bizcity.module.json → ledger.submits[] ({ "docType": "sale", … }). Module chỉ được làm những gì đã khai.',
          rule: 'STD-MOD-2 (docs/contracts/BIZCITY-MODULE-v1.md) · CONF-STATIC-2',
        })
        : row('AC-4', 'docType gửi vào sổ thuộc hợp đồng', 'PASS', [...new Set(dtHits.map((h) => h.match[1]))].join(', ')));
    }
  }

  // AC-5: docKey ổn định + tiền tố
  const dkHits = hits(/\bdocKey\s*:\s*(['"`])([^'"`]*)\1|\bdocKey\s*:\s*([^,}\n]+)/g, () => true, submitting);
  const badKeys = [];
  for (const h of dkHits) {
    const lit = h.match[2];
    const expr = h.match[3] ?? '';
    if (/Date\.now|Math\.random|randomUUID|crypto\./.test(h.text)) badKeys.push({ ...h, why: 'không ổn định (gửi lại sẽ ghi hai lần)' });
    else if (lit !== undefined && !lit.startsWith('${') && !lit.startsWith(`${key}:`)) badKeys.push({ ...h, why: `không mang tiền tố "${key}:"` });
    else if (lit === undefined && expr && /^['"`]/.test(expr.trim())) continue;
  }
  rows.push(!submitting.length
    ? row('AC-5', 'docKey ổn định, mang tiền tố module', 'N/A', 'module không gửi chứng từ vào sổ')
    : badKeys.length
      ? row('AC-5', 'docKey ổn định, mang tiền tố module', 'FAIL', `${lines(badKeys).length} chỗ: ${[...new Set(badKeys.map((h) => h.why))].join('; ')}`, {
        hits: show(badKeys),
        fix: `docKey = "${key}:<mã nghiệp vụ ổn định>" (vd ${key}:CN01:2026-11:HD01). Sửa chứng từ = cùng docKey, version + 1; huỷ qua ctx.ledger.cancel.`,
        rule: 'IN-BIZ-003 (cửa nạp chặn docKey không bắt đầu bằng mã nguồn gửi) · R-EVENT-13 · ADR-0011 D5',
      })
      : row('AC-5', 'docKey ổn định, mang tiền tố module', 'PASS', `${dkHits.length} chỗ`));

  // AC-6: chứng từ mẫu qua event check
  const exDir = path.join(dir, 'examples');
  const exFiles = listFiles(exDir, /\.json$/);
  if (staticOnly) rows.push(row('AC-6', 'Chứng từ mẫu qua event check', 'N/A', 'bỏ qua (--static)'));
  else if (!submitting.length) rows.push(row('AC-6', 'Chứng từ mẫu qua event check', 'N/A', 'module không gửi chứng từ vào sổ'));
  else if (!exFiles.length) {
    rows.push(row('AC-6', 'Chứng từ mẫu qua event check', 'WARN', `chưa có modules/${key}/examples/*.json`, {
      fix: `Tạo một chứng từ mẫu mỗi loại module gửi (JSON đúng bizcity_ledger_intake@1; mẫu: docs/api/vi-du/). Lệnh này sẽ cho bạn thấy bút toán Kernel dựng — bước small win đầu tiên.`,
      rule: 'skills/validate-accounting-event',
    }));
  } else {
    for (const f of exFiles) {
      let doc;
      try { doc = JSON.parse(readFileSync(f, 'utf8')); } catch (err) { rows.push(row(`AC-6 ${path.basename(f)}`, 'Chứng từ mẫu qua event check', 'FAIL', `không phải JSON: ${err.message}`)); continue; }
      if (doc && typeof doc === 'object' && 'document' in doc && !('docType' in doc)) doc = doc.document;
      const r = await checkEvent(doc, { server, key: apiKey, fetchImpl });
      const prefixOk = typeof doc?.docKey === 'string' && doc.docKey.startsWith(`${key}:`);
      const status = r.verdict === 'FAIL' || !prefixOk ? 'FAIL' : r.verdict;
      const why = [!prefixOk ? `docKey "${doc?.docKey ?? ''}" không mang tiền tố "${key}:"` : null,
        ...r.rows.filter((x) => x.status !== 'PASS').map((x) => `${x.layer} ${x.status}${x.detail ? `: ${x.detail}` : ''}`)].filter(Boolean).join(' · ');
      rows.push(row(`AC-6 ${path.basename(f)}`, 'Chứng từ mẫu qua event check', status, status === 'PASS' ? `${r.entries.length} dòng bút toán Kernel dựng` : why, {
        entries: r.entries, findings: r.findings,
        fix: status === 'FAIL' ? `npx bizcity event check ${path.relative(ROOT, f).split(path.sep).join('/')} để xem từng lớp` : undefined,
      }));
    }
  }

  const verdict = rows.some((r) => r.status === 'FAIL') ? 'FAIL'
    : rows.some((r) => r.status === 'SKIP' || (r.status === 'WARN' && r.id === 'AC-6')) ? 'SKIP' : 'PASS';
  return { key, verdict, files: sources.length, rows };
}

export function formatModuleAccounting(r) {
  const L = [`Kiểm kế toán của module ${r.key} (${r.files} tệp quét tĩnh; không thay test hợp đồng trên CSDL)`];
  for (const x of r.rows) {
    L.push(`  ${x.status.padEnd(4)}  ${x.id}  ${x.title}${x.detail ? ` — ${x.detail}` : ''}`);
    for (const h of x.hits ?? []) L.push(`              ${h}`);
    if (x.fix && x.status !== 'PASS') L.push(`              sửa: ${x.fix}`);
    if (x.rule && x.status !== 'PASS') L.push(`              luật: ${x.rule}`);
    if (x.entries?.length) {
      L.push('              bút toán Kernel dựng (Nợ / Có do luật định khoản của đơn vị, không do module):');
      for (const e of x.entries) L.push(`                ${e.accountCode.padEnd(8)} Nợ ${String(e.debit || '').padStart(12)}  Có ${String(e.credit || '').padStart(12)}`);
    }
  }
  const gates = Object.values(RESERVED_GATES).map((g) => g.docTypes.join('/')).join(' · ');
  L.push('', `Cổng chờ (Kernel chưa mở, không dùng được): ${gates}`);
  L.push(`KẾT LUẬN: ${r.verdict}${r.verdict === 'SKIP' ? ' — còn mục chưa đủ bằng chứng (AC-6 cần chứng từ mẫu và máy chủ BIZCITY_SERVER + BIZCITY_API_KEY)' : ''}`);
  return L.join('\n');
}
