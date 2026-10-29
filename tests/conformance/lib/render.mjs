/** Hiển thị bảng điểm: console, SCOREBOARD.md, scoreboard.html, evidence.txt (khối bằng chứng DIAGNOSTICS §4). */
const ICON = { pass: '✔', debt: '◐', warn: '▲', fail: '✘', error: '!', planned: '○', skip: '·' };
const LABEL = { pass: 'đạt', debt: 'nợ cũ', warn: 'cảnh báo', fail: 'KHÔNG ĐẠT', error: 'lỗi bộ kiểm', planned: 'chưa có năng lực', skip: 'bỏ qua' };
const fmt = (s) => (s == null ? '—' : `${s}`);
const delta = (d) => (d == null ? '' : d === 0 ? ' (=)' : d > 0 ? ` (+${d})` : ` (${d})`);

export function renderConsole(sb, results, { verbose = false } = {}) {
  const out = [];
  out.push('');
  for (const lane of ['selfcheck', 'diagnostics']) {
    const rs = results.filter((r) => r.lane === lane);
    if (!rs.length) continue;
    out.push(`── ${lane === 'selfcheck' ? 'SELFCHECK (tĩnh, không cần CSDL)' : `DIAGNOSTICS (CSDL thật, chỉ đọc${sb.scores.diagnostics.db ? ` — ${sb.scores.diagnostics.db}` : ''})`}`);
    const skipped = rs.filter((r) => r.status === 'skip');
    if (skipped.length) out.push(`  · ${skipped.length} check bỏ qua: ${skipped[0].skip}`);
    for (const r of rs) {
      if (r.status === 'skip') continue;
      const n = r.findings.length;
      const nn = r.findings.filter((f) => !f.known).length;
      const tail = r.status === 'planned' ? `sẵn sàng ${fmt(r.readiness == null ? null : Math.round(r.readiness * 100))}%`
        : r.status === 'skip' ? (r.skip ?? '')
        : n ? `${n} phát hiện${nn && r.status !== 'warn' ? `, ${nn} MỚI` : ''}`
        : r.lane === 'diagnostics' ? `${r.examined} dòng đã xét${r.examined ? '' : ' (đạt rỗng)'}` : '';
      out.push(`  ${ICON[r.status]} ${r.id.padEnd(12)} ${pad(r.title, 70)} ${String(fmt(r.score)).padStart(5)}  ${tail}`);
      const show = r.status === 'fail' || r.status === 'error' || verbose ? r.findings.filter((f) => verbose || !f.known).slice(0, verbose ? 50 : 8) : [];
      for (const f of show) out.push(`        ${f.file ? `${f.file}${f.line ? `:${f.line}` : ''}  ` : ''}${f.message}`);
      if (r.error) out.push(`        ${r.error.split('\n')[0]}`);
      if (r.fixed?.length) out.push(`        ↳ ${r.fixed.length} mục nợ đã hết — chạy --update-baseline để bánh cóc chặt lại`);
    }
    out.push('');
  }
  const s = sb.scores;
  out.push('── BẢNG ĐIỂM');
  out.push(`  Tuân chuẩn (conformance) ${fmt(s.conformance.score).padStart(5)}  ${s.conformance.grade}${delta(s.conformance.delta)}`);
  out.push(`  Sẵn sàng Standard v1     ${fmt(s.readiness.score).padStart(5)}  ${s.readiness.grade}${delta(s.readiness.delta)}`);
  out.push(`  Độ phủ luật              ${fmt(s.coverage.score).padStart(5)}  ${s.coverage.grade}${delta(s.coverage.delta)}`);
  out.push(`  Diagnostics              ${fmt(s.diagnostics.score).padStart(5)}  ${s.diagnostics.grade}${s.diagnostics.score == null ? '  (bỏ qua: chưa chỉ CSDL)' : ''}`);
  const c = sb.counts;
  out.push(`  ${c.pass} đạt · ${c.debt} nợ cũ · ${c.warn} cảnh báo · ${c.fail} không đạt · ${c.error} lỗi · ${c.planned} chưa có năng lực · ${c.skip} bỏ qua   (${sb.durationMs} ms)`);
  out.push('');
  out.push(`KẾT QUẢ: ${sb.verdict === 'pass' ? 'ĐẠT' : 'KHÔNG ĐẠT'}`);
  return out.join('\n');
}

export function renderMarkdown(sb) {
  const s = sb.scores;
  const L = [];
  L.push(`# Bảng điểm Bizcity Core — ${sb.verdict === 'pass' ? 'ĐẠT' : 'KHÔNG ĐẠT'}`);
  L.push('');
  L.push(`> Lần chạy \`${sb.runId}\` · ${sb.at} · Standard ${sb.standard} · ${sb.mode === 'module' ? `module \`${sb.target}\`` : 'toàn repo'} · Node ${sb.node} · ${sb.durationMs} ms`);
  L.push('> Sinh bởi `node tests/conformance/selfcheck.mjs`. Đừng sửa tay: chạy lại để cập nhật.');
  L.push('');
  L.push('| Điểm | Giá trị | Hạng | So lần trước | Nghĩa |');
  L.push('|---|---:|:---:|---:|---|');
  L.push(`| Tuân chuẩn | ${fmt(s.conformance.score)} | ${s.conformance.grade} | ${fmt(s.conformance.delta)} | Code hiện tại tuân các check đang thực thi |`);
  L.push(`| Sẵn sàng Standard v1 | ${fmt(s.readiness.score)} | ${s.readiness.grade} | ${fmt(s.readiness.delta)} | Core đã có bao nhiêu năng lực Standard v1 hứa |`);
  L.push(`| Độ phủ luật | ${fmt(s.coverage.score)} | ${s.coverage.grade} | ${fmt(s.coverage.delta)} | Luật R-/STD-/CONF- có kiểm tự động |`);
  L.push(`| Diagnostics | ${fmt(s.diagnostics.score)} | ${s.diagnostics.grade} | | ${s.diagnostics.score == null ? 'Bỏ qua — chưa chỉ CSDL' : `Toàn vẹn sổ trên ${s.diagnostics.db}`} |`);
  L.push('');
  L.push('## Theo hợp đồng');
  L.push('');
  L.push('| Hợp đồng | Điểm | Hạng | Check | Đạt | Nợ cũ | Không đạt | Chưa có năng lực | Sẵn sàng |');
  L.push('|---|---:|:---:|---:|---:|---:|---:|---:|---:|');
  for (const g of sb.byContract) L.push(`| \`${g.contract}\` | ${fmt(g.score)} | ${g.grade} | ${g.checks} | ${g.pass} | ${g.debt} | ${g.fail} | ${g.planned} | ${g.readiness == null ? '' : `${g.readiness}%`} |`);
  L.push('');
  L.push('## Theo cổng');
  L.push('');
  L.push('| Cổng | Điểm | Hạng | Check | Không đạt | Nợ cũ |');
  L.push('|---|---:|:---:|---:|---:|---:|');
  for (const g of sb.byGate) L.push(`| ${g.gate} | ${fmt(g.score)} | ${g.grade} | ${g.checks} | ${g.fail} | ${g.debt} |`);
  L.push('');
  if (sb.byModule.length) {
    L.push('## Theo phân hệ / add-in');
    L.push('');
    L.push('Điểm = phần trăm check phạm vi module mà phân hệ không vi phạm.');
    L.push('');
    L.push('| Phân hệ | Điểm | Hạng | Phát hiện | Mới | Vi phạm check |');
    L.push('|---|---:|:---:|---:|---:|---|');
    for (const m of sb.byModule) L.push(`| \`${m.module}\` | ${m.score} | ${m.grade} | ${m.findings} | ${m.newFindings} | ${m.checks.join(', ')} |`);
    L.push('');
  }
  L.push('## Sẵn sàng Standard v1');
  L.push('');
  const r = sb.readiness;
  L.push(`- Năng lực có sẵn: **${r.capabilities.available}/${r.capabilities.total}**.`);
  if (r.goldenCase) L.push(`- Ca chuẩn Hợp đồng: **${r.goldenCase.available}/${r.goldenCase.required}** năng lực cần đã có. Còn chặn: ${r.goldenCase.blockedBy.join(', ') || 'không'}.`);
  L.push('');
  L.push('| Check chờ năng lực | Phase | Sẵn sàng |');
  L.push('|---|---|---:|');
  for (const p of r.planned) L.push(`| ${p.id} ${p.title} | ${p.phase ?? ''} | ${p.readiness == null ? '—' : `${p.readiness}%`} |`);
  L.push('');
  if (sb.coverage) {
    const c = sb.coverage;
    L.push('## Độ phủ luật');
    L.push('');
    L.push(`- R-* (Kernel): ${c.R.automated}/${c.R.total} có kiểm tự động; ${c.R.bySuite} do bộ kiểm này. Theo loại "Kiểm bằng": ${Object.entries(c.R.byKind).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ')}.`);
    if (c.R.tier0Manual.length) L.push(`- Luật **Tier 0 chưa kiểm tự động**: ${c.R.tier0Manual.join(', ')}.`);
    L.push(`- STD-* (module): ${c.STD.automated}/${c.STD.total} có check chạy được; ${c.STD.mappedToConf}/${c.STD.total} đã nối tới mã CONF.`);
    L.push(`- CONF-* (cổng cài đặt): ${c.CONF.implemented}/${c.CONF.total} đã có check.`);
    if (c.unmappedStd.length) L.push(`- STD chưa có mã CONF nào: ${c.unmappedStd.join(', ')}.`);
    L.push('');
  }
  L.push('## Từng check');
  L.push('');
  L.push('| | Mã | Check | Cổng | Thực thi | Điểm | Phát hiện (mới) | ms |');
  L.push('|:---:|---|---|---|---|---:|---:|---:|');
  for (const c of sb.checks) {
    L.push(`| ${ICON[c.status]} | ${c.id} | ${c.title.replace(/\|/g, '\\|')}${c.notes.length ? `<br><sub>${c.notes.join('; ').replace(/\|/g, '\\|')}</sub>` : ''} | ${c.gate} | ${c.enforce} | ${c.status === 'planned' ? `${fmt(c.readiness)}%` : fmt(c.score)} | ${c.findings}${c.new ? ` (**${c.new}**)` : ''} | ${c.ms ?? ''} |`);
  }
  L.push('');
  L.push(`Ký hiệu: ${Object.entries(ICON).map(([k, v]) => `${v} ${LABEL[k]}`).join(' · ')}. Chi tiết phát hiện: \`selfcheck.json\`, \`diagnostics.json\` cùng thư mục.`);
  return L.join('\n') + '\n';
}

export function renderEvidence(sb) {
  const s = sb.scores;
  const c = sb.counts;
  return [
    '== BẰNG CHỨNG SELFCHECK ==',
    `lần chạy:    ${sb.runId}      ngày: ${sb.at}`,
    `lệnh:        node tests/conformance/selfcheck.mjs${sb.mode === 'module' ? ` --module ${sb.target}` : ''}`,
    `kết quả:     ${sb.verdict === 'pass' ? 'ĐẠT' : 'KHÔNG ĐẠT'}   (đạt ${c.pass} · nợ cũ ${c.debt} · cảnh báo ${c.warn} · không đạt ${c.fail} · lỗi ${c.error} · chờ năng lực ${c.planned} · bỏ qua ${c.skip})`,
    `điểm:        tuân chuẩn ${fmt(s.conformance.score)} (${s.conformance.grade}) · sẵn sàng ${fmt(s.readiness.score)} (${s.readiness.grade}) · độ phủ ${fmt(s.coverage.score)} (${s.coverage.grade})`,
    `diagnostics: ${s.diagnostics.score == null ? 'bỏ qua (chưa chỉ CSDL)' : `pass=${s.diagnostics.pass} warn=${s.diagnostics.warn} error=${s.diagnostics.error}   (${s.diagnostics.db})`}`,
    'ghi chú:     <nợ cũ / cảnh báo nào, vì sao chấp nhận>',
    '',
  ].join('\n');
}

export function renderHtml(sb) {
  const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const card = (label, v) => `<div class="card"><div class="lbl">${label}</div><div class="val g-${v.grade}">${fmt(v.score)}</div><div class="sub">hạng ${v.grade}${v.delta != null ? ` · ${delta(v.delta).trim()}` : ''}</div></div>`;
  const bar = (score) => (score == null ? '' : `<span class="bar"><span style="width:${score}%"></span></span>`);
  const rows = (list, cols) => list.map((x) => `<tr>${cols.map((c) => `<td${c.num ? ' class="num"' : ''}>${c.f(x)}</td>`).join('')}</tr>`).join('');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bảng điểm Bizcity Core</title>
<style>
:root{--bg:#fff;--fg:#1b1f24;--mut:#59636e;--line:#d8dee4;--ok:#1a7f37;--warn:#9a6700;--bad:#cf222e;--acc:#0f766e}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--mut:#8d96a0;--line:#30363d;--ok:#3fb950;--warn:#d29922;--bad:#f85149;--acc:#2dd4bf}}
body{background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;padding:24px 16px;max-width:1100px;margin:auto}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px}.meta{color:var(--mut);font-size:12px}
.verdict{display:inline-block;padding:2px 10px;border-radius:999px;font-weight:600;color:#fff;background:var(--${sb.verdict === 'pass' ? 'ok' : 'bad'})}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-top:16px}
.card{border:1px solid var(--line);border-radius:8px;padding:12px}.lbl{color:var(--mut);font-size:12px}.val{font-size:28px;font-weight:700}.sub{color:var(--mut);font-size:12px}
.g-A,.g-B{color:var(--ok)}.g-C{color:var(--warn)}.g-D,.g-F{color:var(--bad)}
.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
th{color:var(--mut);font-weight:600}.num{text-align:right;font-variant-numeric:tabular-nums}
.bar{display:inline-block;width:80px;height:6px;background:var(--line);border-radius:3px;margin-left:6px;vertical-align:middle}.bar span{display:block;height:100%;background:var(--acc);border-radius:3px}
.s-pass{color:var(--ok)}.s-fail,.s-error{color:var(--bad)}.s-debt,.s-warn{color:var(--warn)}.s-planned,.s-skip{color:var(--mut)}
small{color:var(--mut)}
</style></head><body>
<h1>Bảng điểm Bizcity Core <span class="verdict">${sb.verdict === 'pass' ? 'ĐẠT' : 'KHÔNG ĐẠT'}</span></h1>
<div class="meta">Lần chạy ${esc(sb.runId)} · ${esc(sb.at)} · Standard ${esc(sb.standard)} · ${sb.mode === 'module' ? `module ${esc(sb.target)}` : 'toàn repo'} · ${sb.durationMs} ms</div>
<div class="cards">${card('Tuân chuẩn', sb.scores.conformance)}${card('Sẵn sàng Standard v1', sb.scores.readiness)}${card('Độ phủ luật', sb.scores.coverage)}${card('Diagnostics', sb.scores.diagnostics)}</div>
<h2>Theo hợp đồng</h2><div class="wrap"><table><tr><th>Hợp đồng</th><th class="num">Điểm</th><th>Hạng</th><th class="num">Check</th><th class="num">Không đạt</th><th class="num">Nợ cũ</th><th class="num">Chờ năng lực</th></tr>
${rows(sb.byContract, [{ f: (g) => esc(g.contract) }, { num: 1, f: (g) => `${fmt(g.score)}${bar(g.score)}` }, { f: (g) => g.grade }, { num: 1, f: (g) => g.checks }, { num: 1, f: (g) => g.fail }, { num: 1, f: (g) => g.debt }, { num: 1, f: (g) => g.planned }])}</table></div>
${sb.byModule.length ? `<h2>Theo phân hệ / add-in</h2><div class="wrap"><table><tr><th>Phân hệ</th><th class="num">Điểm</th><th class="num">Phát hiện</th><th class="num">Mới</th><th>Check vi phạm</th></tr>
${rows(sb.byModule, [{ f: (m) => esc(m.module) }, { num: 1, f: (m) => `${m.score}${bar(m.score)}` }, { num: 1, f: (m) => m.findings }, { num: 1, f: (m) => m.newFindings }, { f: (m) => esc(m.checks.join(', ')) }])}</table></div>` : ''}
<h2>Sẵn sàng Standard v1</h2><p>Năng lực có sẵn <b>${sb.readiness.capabilities.available}/${sb.readiness.capabilities.total}</b>${sb.readiness.goldenCase ? ` · Ca chuẩn Hợp đồng <b>${sb.readiness.goldenCase.available}/${sb.readiness.goldenCase.required}</b>` : ''}</p>
<h2>Từng check</h2><div class="wrap"><table><tr><th></th><th>Mã</th><th>Check</th><th>Cổng</th><th class="num">Điểm</th><th class="num">Phát hiện</th></tr>
${rows(sb.checks, [{ f: (c) => `<span class="s-${c.status}">${ICON[c.status]}</span>` }, { f: (c) => esc(c.id) }, { f: (c) => `${esc(c.title)}${c.notes.length ? `<br><small>${esc(c.notes.join('; '))}</small>` : ''}` }, { f: (c) => esc(c.gate) }, { num: 1, f: (c) => (c.status === 'planned' ? `${fmt(c.readiness)}%` : fmt(c.score)) }, { num: 1, f: (c) => `${c.findings}${c.new ? ` <b class="s-fail">(${c.new} mới)</b>` : ''}` }])}</table></div>
</body></html>`;
}

function pad(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n); }
