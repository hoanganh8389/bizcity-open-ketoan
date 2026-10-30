/**
 * bizcity_action@1, bizcity_api@1, bizcity_event@1, bizcity_evidence@1 — phần đọc được từ mã nguồn.
 */
const API = 'apps/api/src';
const srcOpts = (ctx) => (ctx.mode === 'module' ? { ext: ['.ts', '.mjs', '.js'], not: /(^|\/)(test|tests)\// } : { under: [API], ext: ['.ts'] });
const ROUTE_RE = /\b(?:r|app|fastify|server|router|api)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]*)['"`]/;

export const checks = [
  {
    id: 'SC-API-1',
    title: 'Lỗi ném Errors.*, không tự reply.status(4xx/5xx)',
    gate: 'CONF-STATIC', contract: 'bizcity_action', rules: ['R-API-2', 'STD-ACT-5'], conf: ['CONF-STATIC-9'], tier: 1, enforce: 'ratchet', weight: 3, targets: ['repo', 'module'], scope: 'module',
    run(ctx) {
      const opts = srcOpts(ctx);
      const hits = ctx.repo.grep(/reply\.(status|code)\(\s*[45]\d\d\s*\)/, { ...opts, skipComments: true }).filter((h) => !h.file.startsWith(`${API}/core/`));
      return { examined: ctx.repo.files(opts).length, findings: hits.map((h) => ctx.finding(h.file, h.line, h.text, h.text.replace(/\s+/g, ''))) };
    },
  },
  {
    id: 'SC-API-2',
    title: 'Tham số true/false dùng queryBool, không z.coerce.boolean()',
    gate: 'CONF-STATIC', contract: 'bizcity_api', rules: ['R-API-5'], conf: [], tier: 1, enforce: 'ratchet', weight: 1, targets: ['repo', 'module'], scope: 'module',
    run(ctx) {
      const opts = srcOpts(ctx);
      return { examined: ctx.repo.files(opts).length, findings: ctx.repo.grep(/z\.coerce\.boolean\(/, { ...opts, skipComments: true }).map((h) => ctx.finding(h.file, h.line, h.text, h.text.replace(/\s+/g, ''))) };
    },
  },
  {
    id: 'SC-API-3',
    title: 'Mọi route khai quyền (requirePermission) hoặc config.public',
    gate: 'CONF-STATIC', contract: 'bizcity_action', rules: ['R-API-6', 'R-TEN-3', 'STD-ACT-2'], conf: ['CONF-MAN-3'], tier: 0, enforce: 'ratchet', weight: 5, targets: ['repo'], scope: 'module',
    run(ctx) {
      const findings = []; let routes = 0;
      for (const file of ctx.repo.files({ under: [API], ext: ['.ts'] })) {
        const ls = ctx.repo.lines(file);
        const text = ctx.repo.read(file);
        const fileGuard = /addHook\(\s*['"](preHandler|onRequest)['"][^)]*requirePermission/.test(text);
        // Mẫu phổ biến: const read = requirePermission('…') rồi preHandler: read
        const guards = [...text.matchAll(/(?:const|let)\s+(\w+)\s*=\s*requirePermission\(/g)].map((m) => m[1]);
        // requireUser() / requireAuthenticated(): route tự phục vụ — vẫn là khai báo tường minh (R-API-6).
        const guarded = new RegExp(String.raw`requirePermission\(|requireUser\(|requireAuthenticated\(|config:\s*\{\s*public:\s*true` + (guards.length ? String.raw`|preHandler:\s*\[?[^\]\n]*\b(` + guards.join('|') + String.raw`)\b` : ''));
        const starts = [];
        ls.forEach((t, i) => { const m = ROUTE_RE.exec(t); if (m) starts.push([i, m[1], m[2]]); });
        starts.forEach(([i, method, url], n) => {
          routes++;
          const end = Math.min(starts[n + 1]?.[0] ?? ls.length, i + 60);
          const block = ls.slice(i, end).join('\n');
          if (fileGuard || guarded.test(block)) return;
          findings.push(ctx.finding(file, i + 1, `${method.toUpperCase()} ${url} không khai requirePermission`, `${method} ${url}`));
        });
      }
      return { examined: routes, findings };
    },
  },
  {
    id: 'SC-ACT-1',
    title: 'Thao tác ghi đi qua defineAction (quyền, zod, Idempotency-Key, dry-run, bằng chứng)',
    gate: 'CONF-STATIC', contract: 'bizcity_action', rules: ['STD-ACT-1', 'STD-ACT-4'], conf: ['CONF-STATIC-8', 'CONF-RUN-4'], tier: 1, enforce: 'planned', phase: 'Phase 2 (2.3)', weight: 4, targets: ['repo'], scope: 'module',
    run(ctx) {
      let writes = 0; let viaAction = 0;
      for (const file of ctx.repo.files({ under: [API], ext: ['.ts'] })) {
        for (const t of ctx.repo.lines(file)) { const m = ROUTE_RE.exec(t); if (m && m[1] !== 'get') writes++; }
        viaAction += (ctx.repo.read(file).match(/\bdefineAction\(/g) ?? []).length;
      }
      return { examined: writes, readiness: writes ? Math.min(1, viaAction / writes) : 0, findings: [], metrics: { writeRoutes: writes, defineAction: viaAction }, notes: [`${viaAction}/${writes} route ghi đi qua defineAction (audit A-21: chưa có idempotency ngoài cửa sổ sổ cái)`] };
    },
  },
  {
    id: 'SC-EVT-1',
    title: 'Không hẹn giờ tự chế (setInterval / setTimeout / cron) — dùng events.clock',
    gate: 'CONF-STATIC', contract: 'bizcity_event', rules: ['STD-EVT-6'], conf: ['CONF-STATIC-11'], tier: 1, enforce: 'ratchet', weight: 2, targets: ['repo', 'module'], scope: 'module',
    run(ctx) {
      const opts = srcOpts(ctx);
      // Không tính: hạn giờ của một lời gọi (setTimeout(() => ctl.abort(), …)) và chờ trước khi thử lại (new Promise(r => setTimeout(r, …))).
      // Hai thứ đó là một phần của lời gọi đang chạy, không phải việc định kỳ (STD-EVT-6).
      const benign = /setTimeout\(\s*\(\)\s*=>\s*\w+\.abort\(\)|new Promise\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*setTimeout\(\s*\1\s*,/;
      // Runtime sự kiện của Platform (dispatcher + đồng hồ) là chỗ hẹn giờ DUY NHẤT được phép — chính nó là events.clock.
      const hits = ctx.repo.grep(/\b(setInterval|setTimeout)\(|from ['"](node-cron|cron|node-schedule)['"]/, { ...opts, skipComments: true })
        .filter((h) => !benign.test(h.text) && h.file !== `${API}/core/events.ts`);
      return { examined: ctx.repo.files(opts).length, findings: hits.map((h) => ctx.finding(h.file, h.line, h.text, /setInterval/.test(h.text) ? 'setInterval' : /setTimeout/.test(h.text) ? 'setTimeout' : 'cron')) };
    },
  },
  {
    id: 'SC-EVT-2',
    title: 'Subscriber chịu được giao lại: id cố định, gọi HTTP ra ngoài phải kèm Idempotency-Key — AP-6',
    gate: 'CONF-STATIC', contract: 'bizcity_event', rules: ['STD-EVT-2', 'R-OUTBOX-4'], conf: ['CONF-RUN-10'], tier: 0, enforce: 'block', weight: 3, targets: ['repo', 'module'], scope: 'module',
    run(ctx) {
      // Runtime chống thực thi trùng phía CSDL ((consumer, event_id) cùng giao dịch); hiệu ứng NGOÀI CSDL thì subscriber phải tự
      // mang khoá idempotency = id sự kiện. id phải là chuỗi cố định: đổi id = mất lịch sử đã xử lý, giao lại từ đầu.
      const opts = srcOpts(ctx);
      const findings = [];
      let examined = 0;
      for (const file of ctx.repo.files(opts)) {
        const text = ctx.repo.read(file) ?? '';
        if (!/defineSubscriber\(\{/.test(text)) continue;
        for (const m of text.matchAll(/defineSubscriber\(\{([\s\S]*?)\n\}\);/g)) {
          examined += 1;
          const body = m[1];
          const line = text.slice(0, m.index).split('\n').length;
          const id = /^\s*id:\s*'([a-z0-9.-]+)'/m.exec(body)?.[1];
          if (!id) findings.push(ctx.finding(file, line, 'defineSubscriber thiếu id dạng chuỗi cố định (id: \'<module>.<việc>\')', `id:${line}`));
          if (/\bfetch\(/.test(body) && !/idempotency-key/i.test(body)) findings.push(ctx.finding(file, line, `subscriber ${id ?? '?'} gọi HTTP ra ngoài mà không gửi Idempotency-Key = event.id (STD-EVT-2)`, `idem:${id ?? line}`));
        }
      }
      return { examined, unitBy: 'key', findings };
    },
  },
  {
    id: 'SC-EVD-1',
    title: 'Không ghi nhật ký nghiệp vụ ra tệp (appendFile / createWriteStream / .jsonl)',
    gate: 'CONF-STATIC', contract: 'bizcity_evidence', rules: ['STD-EVD-4'], conf: ['CONF-STATIC-13'], tier: 1, enforce: 'ratchet', weight: 3, targets: ['repo', 'module'], scope: 'module',
    run(ctx) {
      const opts = srcOpts(ctx);
      // appendFile / createWriteStream ở đâu cũng là ghi tệp; writeFile chỉ tính khi tệp đó làm việc với .jsonl (đọc tệp seed thì không sao).
      const findings = [];
      for (const file of ctx.repo.files(opts)) {
        const jsonl = /\.jsonl/.test(ctx.repo.read(file));
        ctx.repo.lines(file).forEach((t, i) => {
          if (/^\s*(\/\/|\*)/.test(t)) return;
          if (/\b(appendFile|appendFileSync|createWriteStream)\(/.test(t) || (jsonl && /\b(writeFile|writeFileSync)\(/.test(t))) {
            findings.push(ctx.finding(file, i + 1, t.trim().slice(0, 160), /append/.test(t) ? 'appendFile' : /createWriteStream/.test(t) ? 'stream' : 'writeFile'));
          }
        });
      }
      return { examined: ctx.repo.files(opts).length, findings };
    },
  },
  {
    id: 'SC-EVD-2',
    title: 'Bằng chứng có chuỗi băm, actor_kind, via, result (audit_logs mở rộng)',
    gate: 'CONF-MIG', contract: 'bizcity_evidence', rules: ['STD-EVD-1', 'STD-EVD-2'], conf: ['CONF-RUN-11', 'CONF-RUN-12'], tier: 0, enforce: 'block', weight: 3, targets: ['repo'],
    run(ctx) {
      // Cột theo bizcity_evidence@1 §5; trigger chuỗi băm + chỉ thêm (migration 0036). Hành vi chạy thật: test/evidence.test.ts, DG-EVD-1.
      const t = ctx.migrations().tables.get('audit_logs');
      if (!t) return { examined: 0, findings: [], notes: ['không có bảng audit_logs'] };
      const want = ['actor_kind', 'actor_via', 'on_behalf_of', 'module_id', 'subject', 'request_id', 'idempotency_key', 'input_hash', 'result_ok', 'result_code', 'chain_seq', 'prev_hash', 'hash'];
      const findings = want.filter((c) => !t.columns.has(c))
        .map((c) => ctx.finding(null, null, `audit_logs thiếu cột bằng chứng ${c} (bizcity_evidence@1 §5)`, `column:${c}`));
      const sqlText = ctx.migrations().files.map((f) => ctx.repo.read(f) ?? '').join('\n');
      for (const trig of ['audit_logs_chain', 'audit_logs_no_update', 'audit_logs_no_truncate']) {
        if (!new RegExp(`CREATE\\s+TRIGGER\\s+${trig}\\b[\\s\\S]*?\\bON\\s+(?:public\\.)?audit_logs\\b`, 'i').test(sqlText)) {
          findings.push(ctx.finding(null, null, `thiếu trigger ${trig} trên audit_logs (STD-EVD-2: chỉ thêm, chuỗi băm)`, `trigger:${trig}`));
        }
      }
      return { examined: want.length + 3, unitBy: 'key', findings };
    },
  },
];
