/**
 * Kernel: ranh giới sổ cái. Chuyển từ scripts/kiem-chuan.sh (giữ nguyên nghĩa; danh sách nợ chuyển sang baseline.json).
 */
import path from 'node:path';
import { expectedLayer } from '../../lib/layers.mjs';

const SRC = 'apps/api/src';
const PUBLIC = `${SRC}/kernel/public.ts`;
const ts = { under: [SRC], ext: ['.ts'] };

const scan = (ctx, re, keep) => {
  const hits = ctx.repo.grep(re, ts).filter(keep);
  return { examined: ctx.repo.files(ts).length, findings: hits.map((h) => ctx.finding(h.file, h.line, h.text)) };
};

export const checks = [
  {
    id: 'SC-KERNEL-1',
    title: 'Chỉ modules/ledger ghi bảng ledger_* (trừ ngoại lệ E2)',
    gate: 'KERNEL', contract: 'kernel', rules: ['R-LEDGER-4'], conf: ['CONF-STATIC-2'], tier: 0, enforce: 'block', weight: 5, targets: ['repo'],
    run: (ctx) => scan(ctx, /(insertInto|updateTable|deleteFrom)\('ledger_|(INSERT INTO|UPDATE|DELETE FROM) ledger_/,
      (h) => !h.file.startsWith(`${SRC}/modules/ledger/`) &&
        !(h.file === `${SRC}/modules/posting/posting.service.ts` && /updateTable\('ledger_entries'\)/.test(h.text))),
  },
  {
    id: 'SC-KERNEL-2',
    title: 'Chỉ modules/documents thêm accounting_events / accounting_event_versions / posting_log',
    gate: 'KERNEL', contract: 'kernel', rules: ['R-EVENT-2'], conf: ['CONF-STATIC-2'], tier: 0, enforce: 'block', weight: 5, targets: ['repo'],
    run: (ctx) => scan(ctx, /insertInto\('(accounting_events|accounting_event_versions|posting_log)'\)|INSERT INTO (accounting_events|accounting_event_versions|posting_log)\b/,
      (h) => !h.file.startsWith(`${SRC}/modules/documents/`)),
  },
  {
    id: 'SC-KERNEL-3',
    title: 'Chỉ posting / documents / ledger gọi ledgerService; nơi khác ghi sổ qua postDocumentIn hoặc eventStore',
    gate: 'KERNEL', contract: 'kernel', rules: ['R-LEDGER-4', 'R-EVENT-2'], conf: ['CONF-STATIC-2'], tier: 0, enforce: 'block', weight: 5, targets: ['repo'],
    run(ctx) {
      // Nợ A-01 (vouchers, closing, assets, inventory/costing) hết 2026-10-30 (PHASE-004): chặn mọi hàm của ledgerService,
      // kể cả ngoại lệ ghi đè giá vốn (đi eventStore.overwriteCostPairs).
      const r = scan(ctx, /ledgerService\.[A-Za-z]+\(/, (h) => !/^apps\/api\/src\/modules\/(ledger|posting|documents)\//.test(h.file));
      for (const f of r.findings) f.key = 'ledgerService call'; // một nợ mỗi tệp, không đếm từng dòng
      r.findings = dedupeBy(r.findings, (f) => f.file);
      return r;
    },
  },
  {
    id: 'SC-KERNEL-4',
    title: 'Cờ thoát trigger sổ cái (E1–E4) chỉ ở chỗ được phép',
    gate: 'KERNEL', contract: 'kernel', rules: ['R-LEDGER-1', 'R-LEDGER-4'], conf: [], tier: 0, enforce: 'block', weight: 5, targets: ['repo'],
    run(ctx) {
      const opts = { under: ['apps', 'packages', 'scripts'], ext: ['.ts', '.mjs', '.sh'] };
      const allow = {
        cost_overwrite: /^(apps\/api\/src\/modules\/ledger\/|apps\/api\/test\/|scripts\/kiem-chuan\.sh)/,
        allow_ledger_purge: /^(apps\/api\/test\/|scripts\/kiem-chuan\.sh)/,
        // test được nhắc tên cờ để chứng minh vai trò ứng dụng KHÔNG đặt được (app-role.test.ts)
        session_replication_role: /^(scripts\/xoa-chung-tu\.sh|scripts\/kiem-chuan\.sh|apps\/api\/test\/)/,
      };
      const findings = [];
      for (const [flag, ok] of Object.entries(allow)) {
        for (const h of ctx.repo.grep(new RegExp(flag), opts)) if (!ok.test(h.file)) findings.push(ctx.finding(h.file, h.line, `${flag}: ${h.text}`));
      }
      return { examined: ctx.repo.files(opts).length, findings };
    },
  },
  {
    id: 'SC-KERNEL-5',
    title: 'Luật định khoản không viết cứng số tài khoản (tra qua AccountResolver)',
    gate: 'KERNEL', contract: 'kernel', rules: ['R-POST-2'], conf: [], tier: 0, enforce: 'ratchet', weight: 4, targets: ['repo'],
    run(ctx) {
      const opts = { under: [`${SRC}/modules/posting/rules`], ext: ['.ts'] };
      const add = ctx.repo.files({ under: [`${SRC}/phan-he`], ext: ['.ts'], match: /posting[^/]*\.ts$/ });
      const files = [...ctx.repo.files(opts), ...add];
      const findings = [];
      for (const file of files) {
        ctx.repo.lines(file).forEach((t, i) => {
          if (/^\s*(\/\/|\*)/.test(t)) return;
          for (const m of t.matchAll(/'([1-9][0-9]{2,5})'/g)) findings.push(ctx.finding(file, i + 1, `số tài khoản '${m[1]}' viết cứng: ${t.trim().slice(0, 140)}`, `account '${m[1]}'`));
        });
      }
      return { examined: files.length, findings: dedupeBy(findings, (f) => `${f.file}|${f.key}`) };
    },
  },
  {
    id: 'SC-KERNEL-6',
    title: 'Ngoài Kernel chỉ import Kernel qua cổng công khai apps/api/src/kernel/public.ts',
    gate: 'KERNEL', contract: 'kernel', rules: ['R-BOUND-10', 'R-KER-1'], conf: ['CONF-STATIC-2'], tier: 0, enforce: 'block', weight: 4, targets: ['repo'],
    run(ctx) {
      // Kernel = tệp có lớp K theo bảng lớp (lib/layers.mjs). Tệp không thuộc K (Platform, phân hệ, add-in, lắp ráp) gọi Kernel qua
      // public.ts — một chỗ để tách gói packages/kernel (PHASES 2.3, PHASE-010 W2) mà không sửa nơi gọi.
      const isKernel = (file) => (expectedLayer(file)?.layer ?? '').split('+').includes('K');
      const files = ctx.repo.files({ under: [SRC], ext: ['.ts'] }).filter((f) => !isKernel(f) && f !== PUBLIC);
      const findings = [];
      for (const file of files) {
        ctx.repo.lines(file).forEach((t, i) => {
          for (const m of t.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
            const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1])).replace(/\.js$/, '.ts');
            if (target !== PUBLIC && isKernel(target)) findings.push(ctx.finding(file, i + 1, `import thẳng vào Kernel ${target.slice(SRC.length + 1)} — dùng kernel/public.ts`, target.slice(SRC.length + 1)));
          }
        });
      }
      return { examined: files.length, findings };
    },
  },
  {
    id: 'SC-QG-1',
    title: 'Không còn test .only / .skip',
    gate: 'KERNEL', contract: 'quality', rules: ['R-QG-8'], conf: [], tier: 1, enforce: 'block', weight: 2, targets: ['repo'],
    run(ctx) {
      const opts = { under: ['apps/api/test'], ext: ['.ts'] };
      return { examined: ctx.repo.files(opts).length, findings: ctx.repo.grep(/\b(it|describe|test)\.(only|skip)\(/, opts).map((h) => ctx.finding(h.file, h.line, h.text)) };
    },
  },
];

function dedupeBy(list, key) {
  const seen = new Set();
  return list.filter((x) => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; });
}
