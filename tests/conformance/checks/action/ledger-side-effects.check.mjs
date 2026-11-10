// [2026-11-10 09:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — S014-16 (STD-ACT-9): SC-ACT-2 — action ghi sổ khai sideEffects 'ledger' và errors có PERIOD_LOCKED
/**
 * SC-ACT-2 (STD-ACT-9): action `effect: 'write'` mà handler có thể sinh bút toán phải khai `sideEffects` có `ledger`
 * (bảng `GET /system/capabilities`, AI và người duyệt nhìn vào đó để biết thao tác chạm sổ), và nếu khai `errors` thì
 * phải có `PERIOD_LOCKED` (kỳ khoá là lỗi chắc chắn gặp của mọi thao tác ghi sổ).
 *
 * "Có thể sinh bút toán" = handler gọi (trực tiếp hoặc qua dây gọi) tới một hàm có `insertInto('ledger_entries' |
 * 'ledger_lines')`, hoặc tới `ctx.ledger.submit`. Dây gọi lần theo TÊN: hàm `function X` / `const X = (…) => {`,
 * phương thức đối tượng `const O = { m(…) {…}, m: f }` (gọi là `O.m(`), bí danh `import { A as B }`, lớp bọc
 * `traceKernelFn('…', A)` / `traceKernelApi('…', O)`. Lần theo tên nên có thể báo thừa khi hai hàm trùng tên;
 * khi đó đổi tên hàm, không thêm ngoại lệ. Khai `ledger` mà không tìm thấy dây gọi thì không báo (khai thừa an toàn).
 */
const UNDER = ['apps/api/src', 'packages/platform/src', 'packages/kernel/src', 'packages/module-sdk/src', 'modules'];
const NOT = /(^|\/)(test|tests|dist|node_modules)\/|\.test\.tsx?$/;
const SINK = /\binsertInto\(\s*'ledger_(entries|lines)'\s*\)/;
const SEEDS = ['ctx.ledger.submit'];
/**
 * Đường chạy định khoản thật nhưng KHÔNG để lại bút toán — không tính là cửa ghi sổ. Thêm tên vào đây phải kèm lý do
 * kiểm được trong mã (savepoint rồi hoàn tác, hoặc chỉ ghi khi dry-run mà runtime hoàn tác cả giao dịch).
 */
const TRIAL = {
  trialPosting: 'L5 định khoản thử: SAVEPOINT rồi ROLLBACK TO SAVEPOINT (packages/kernel/src/modules/intake/trial-posting.ts)',
  draftManualIn: 'phiếu nháp: chỉ ghi sổ khi preview = dry-run, runtime hoàn tác cả giao dịch (voucher.service.ts)',
  draftDocumentIn: 'chứng từ nháp: preview = dry-run (post + force), còn lại hold — không bút toán (document.service.ts)',
};

/** Vị trí ngoặc đóng khớp với ngoặc mở ở `i` (bỏ qua chuỗi và chú thích đơn giản). */
function close(t, i, open = '{', shut = '}') {
  let d = 0;
  for (let j = i; j < t.length; j++) {
    const c = t[j];
    if (c === '/' && t[j + 1] === '/') { j = t.indexOf('\n', j); if (j < 0) return t.length; continue; }
    if (c === '/' && t[j + 1] === '*') { j = t.indexOf('*/', j + 2); if (j < 0) return t.length; j += 1; continue; }
    if (c === "'" || c === '"' || c === '`') { for (j++; j < t.length && t[j] !== c; j++) if (t[j] === '\\') j++; continue; }
    if (c === open) d++;
    else if (c === shut) { d--; if (!d) return j; }
  }
  return t.length;
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const callRe = (name) => new RegExp('(?<![\\w.$])' + esc(name) + '\\s*(?:<[^>()]*>)?\\(');

/** Thân hàm, phương thức, bí danh của một tệp. */
function units(t) {
  const out = []; const alias = [];
  const fnRe = /(?:\bfunction\s*\*?\s*(\w+)\s*(?:<[^>]*>)?\s*\(|\b(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?(?:function\b[^(]*\(|\((?:[^()]|\([^()]*\))*\)\s*(?::[^=]*?)?=>|\w+\s*=>))/g;
  for (const m of t.matchAll(fnRe)) {
    const name = m[1] || m[2];
    // `function f(…)`: bỏ qua danh sách tham số (có thể chứa `{` của kiểu) rồi mới tìm thân
    const from = m[1] ? close(t, m.index + m[0].length - 1, '(', ')') : m.index + m[0].length - 1;
    const b = t.indexOf('{', from);
    const semi = t.indexOf(';', m.index + m[0].length);
    if (b < 0) continue;
    // Hàm mũi tên thân biểu thức (`=> foo(…)`): lấy tới hết câu
    if (semi >= 0 && semi < b && /=>\s*$/.test(m[0])) { out.push({ name, body: t.slice(m.index, semi) }); continue; }
    out.push({ name, body: t.slice(b, close(t, b)) });
  }
  // Đối tượng: const O = { … } — phương thức `m(…) {`, `async m(…) {`, `m: async (…) => …`, `m: f`
  for (const m of t.matchAll(/\b(?:const|let)\s+(\w+)\s*(?::[^={]+)?=\s*\{/g)) {
    const o = m[1]; const b = t.indexOf('{', m.index + m[0].length - 1); const e = close(t, b); const body = t.slice(b + 1, e);
    // Đầu dòng ở độ sâu 0 của thân đối tượng: `m(`, `async m(`, `m<T>(`, `m: …`
    const heads = [];
    for (let j = 0, depth = 0, bol = true; j < body.length; j++) {
      const c = body[j];
      if (c === '\n') { bol = true; continue; }
      if (bol && depth === 0 && !/\s/.test(c)) {
        const h = /^(?:async\s+)?(\w+)\s*(?:<[^>()]*>)?\s*(\(|:)/.exec(body.slice(j, j + 200));
        if (h) heads.push({ at: j, name: h[1] });
      }
      if (!/\s/.test(c)) bol = false;
      if (c === '/' && body[j + 1] === '/') { j = body.indexOf('\n', j) - 1; if (j < 0) break; continue; }
      if (c === '/' && body[j + 1] === '*') { j = body.indexOf('*/', j + 2) + 1; if (j <= 0) break; continue; }
      if (c === "'" || c === '"' || c === '`') { for (j++; j < body.length && body[j] !== c; j++) if (body[j] === '\\') j++; continue; }
      if ('{(['.includes(c)) depth++;
      else if ('})]'.includes(c)) depth--;
    }
    heads.forEach((h, n) => {
      const p = body.slice(h.at, heads[n + 1]?.at ?? body.length);
      const ref = /^\w+\s*:\s*(\w+)\s*,?\s*$/.exec(p.replace(/\/\/[^\n]*/g, '').trim());
      if (ref) alias.push([`${o}.${h.name}`, ref[1]]);
      else out.push({ name: `${o}.${h.name}`, body: p });
    });
  }
  for (const m of t.matchAll(/\bimport\s*(?:type\s*)?\{([^}]*)\}/g)) {
    for (const s of m[1].split(',')) { const a = /^\s*(\w+)\s+as\s+(\w+)\s*$/.exec(s); if (a) alias.push([a[2], a[1]]); }
  }
  for (const m of t.matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*traceKernel(Fn|Api)\(\s*'[^']*'\s*,\s*(\w+)\s*\)/g)) {
    alias.push([m[1], m[3], m[2] === 'Api']);
  }
  return { out, alias };
}

/** Mọi action trong tệp: id, effect, sideEffects, errors, khối, dòng. */
function actions(t) {
  const res = [];
  for (const m of t.matchAll(/\bdefineAction\s*(?:<[^>()]*>)?\(/g)) {
    const a = m.index + m[0].length - 1; const block = t.slice(a, close(t, a, '(', ')'));
    res.push({
      line: t.slice(0, m.index).split('\n').length,
      block,
      id: /\bid:\s*'([^']+)'/.exec(block)?.[1] ?? `?:${t.slice(0, m.index).split('\n').length}`,
      effect: /\beffect:\s*'(\w+)'/.exec(block)?.[1],
      side: /\bsideEffects:\s*\[([^\]]*)\]/.exec(block)?.[1] ?? '',
      errors: /\berrors:\s*\[([^\]]*)\]/.exec(block)?.[1],
    });
  }
  return res;
}

export default {
  id: 'SC-ACT-2',
  title: 'Action ghi sổ khai sideEffects ledger và errors có PERIOD_LOCKED (STD-ACT-9)',
  gate: 'CONF-STATIC', contract: 'bizcity_action', rules: ['STD-ACT-9'], tier: 1, enforce: 'ratchet', weight: 3, targets: ['repo'],
  run(ctx) {
    const files = ctx.repo.files({ under: UNDER, ext: ['.ts', '.tsx'], not: NOT });
    const fns = []; const aliases = []; const acts = [];
    for (const file of files) {
      const t = ctx.repo.read(file) ?? '';
      const { out, alias } = units(t);
      fns.push(...out); aliases.push(...alias);
      if (t.includes('defineAction')) for (const a of actions(t)) acts.push({ file, ...a });
    }
    const writers = new Set(SEEDS);
    for (const f of fns) if (SINK.test(f.body)) writers.add(f.name);
    const res = new Map(); const isW = (n) => writers.has(n);
    for (let changed = true; changed;) {
      changed = false;
      for (const [to, from, api] of aliases) {
        if (api) {
          for (const w of [...writers]) if (w.startsWith(`${from}.`)) { const n = `${to}${w.slice(from.length)}`; if (!isW(n)) { writers.add(n); changed = true; } }
        } else if (isW(from) && !isW(to)) { writers.add(to); changed = true; }
      }
      for (const f of fns) {
        if (isW(f.name) || f.name in TRIAL) continue;
        for (const w of writers) { if (!res.has(w)) res.set(w, callRe(w)); if (res.get(w).test(f.body)) { writers.add(f.name); changed = true; break; } }
      }
    }
    const findings = []; let ledgerActs = 0;
    const reOf = (w) => { if (!res.has(w)) res.set(w, callRe(w)); return res.get(w); };
    for (const a of acts) {
      if (a.effect !== 'write') continue;
      const via = [...writers].find((w) => reOf(w).test(a.block));
      const declared = /'ledger'/.test(a.side);
      if (!via && !declared) continue;
      ledgerActs += 1;
      if (via && !declared) findings.push(ctx.finding(a.file, a.line, `action ${a.id} gọi ${via} (có thể sinh bút toán) nhưng sideEffects [${a.side.trim()}] thiếu 'ledger' — STD-ACT-9`, `side:${a.id}`));
      if (a.errors != null && !/'PERIOD_LOCKED'/.test(a.errors)) findings.push(ctx.finding(a.file, a.line, `action ${a.id} ghi sổ, khai errors nhưng thiếu 'PERIOD_LOCKED'`, `errors:${a.id}`));
    }
    return { examined: acts.length, findings, metrics: { writers: writers.size, ledgerActions: ledgerActs }, notes: [`${writers.size} hàm / phương thức có thể sinh bút toán; ${ledgerActs} action ghi sổ`] };
  },
};
