// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
/**
 * bizcity_module@1 + ranh giới phân hệ (R-BOUND). Chạy trên apps/{api,web}/src/{phan-he,addins}/<key>/;
 * khi --module: chạy trên thư mục module (cây đích modules/<key>/).
 */
import path from 'node:path';
import { baselineTables } from '../../lib/sql.mjs';

const ROOTS = ['apps/api/src/phan-he', 'apps/web/src/phan-he', 'apps/api/src/addins'];
const WEB_SRC = 'apps/web/src';
/** R-BOUND-2: bảng nhân. */
const KERNEL_TABLE = /^(accounting_events.*|posting_log|ledger_.*|document_sequences|tax_invoices.*|inventory_movements|inventory_costs|debt_.*)$/;
/** Bảng tạo trong migration nền nhưng thuộc nghiệp vụ của một phân hệ (audit A-26) — phân hệ đó được ghi. */
const MODULE_OWNED = {
  quy: ['payment_requests', 'payment_request_settings'],
  'ke-toan': ['cash_plans', 'cost_norms'],
  thue: ['authority_invoices', 'risky_taxpayers', 'cit_returns', 'vat_returns', 'taxpayer_profiles', 'tax_info_patches', 'long_term_balances'],
};
/** Import được phép cho module cộng đồng (CONF-STATIC-1). */
const MODULE_ALLOWED_IMPORTS = /^(@bizcity\/(module-sdk|ui-kit)(\/.*)?|zod|react|react-dom|react\/jsx-runtime|node:(path|url|crypto))$/;

const IMPORT_RE = /(?:from\s+|import\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/g;

export const checks = [
  {
    id: 'SC-MOD-1',
    title: 'Phân hệ / module không import phân hệ khác, không với ra ngoài thư mục của mình',
    gate: 'CONF-STATIC', contract: 'bizcity_module', rules: ['R-BOUND-1', 'STD-MOD-3'], conf: ['CONF-STATIC-1'], tier: 1, enforce: 'block', weight: 5, targets: ['repo', 'module'], scope: 'module',
    run(ctx) {
      const findings = [];
      if (ctx.mode === 'module') {
        const files = ctx.repo.files({ ext: ['.ts', '.tsx', '.mjs', '.js'], not: /(^|\/)(test|tests|__tests__)\// });
        for (const file of files) for (const [spec, line] of imports(ctx, file)) {
          if (spec.startsWith('.')) {
            const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
            if (target.startsWith('..')) findings.push(ctx.finding(file, line, `import ra ngoài thư mục module: ${spec}`, `escape:${spec}`));
          } else if (!MODULE_ALLOWED_IMPORTS.test(spec)) {
            findings.push(ctx.finding(file, line, `import ngoài danh sách cho phép (@bizcity/module-sdk, @bizcity/ui-kit, zod, react): ${spec}`, `import:${spec}`));
          }
        }
        return { examined: files.length, findings };
      }
      let examined = 0;
      for (const root of ROOTS) {
        for (const file of ctx.repo.files({ under: [root], ext: ['.ts', '.tsx'] })) {
          const own = file.slice(root.length + 1).split('/');
          if (own.length < 2) continue; // tệp lắp ráp ở gốc phan-he (index, types, loi)
          examined++;
          for (const [spec, line] of imports(ctx, file)) {
            let target;
            if (spec.startsWith('@/')) target = `${WEB_SRC}/${spec.slice(2)}`;
            else if (spec.startsWith('.')) target = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
            else continue;
            if (!target.startsWith(root + '/')) continue;
            const other = target.slice(root.length + 1).split('/');
            if (other.length > 1 && other[0] !== own[0]) findings.push(ctx.finding(file, line, `import phân hệ "${other[0]}": ${spec}`, `${other[0]}:${spec}`));
          }
        }
      }
      return { examined, findings };
    },
  },
  {
    id: 'SC-MOD-2',
    title: 'Phân hệ không ghi bảng nhân, bảng danh mục / cấu hình của lõi',
    gate: 'CONF-STATIC', contract: 'bizcity_module', rules: ['R-BOUND-2', 'R-BOUND-5', 'STD-MOD-2'], conf: ['CONF-STATIC-2'], tier: 1, enforce: 'ratchet', weight: 5, targets: ['repo'], scope: 'module',
    run(ctx) {
      const core = baselineTables(ctx.migrations());
      const findings = []; let examined = 0;
      for (const root of ['apps/api/src/phan-he', 'apps/api/src/addins']) {
        for (const file of ctx.repo.files({ under: [root], ext: ['.ts'] })) {
          const key = file.slice(root.length + 1).split('/')[0];
          examined++;
          ctx.repo.lines(file).forEach((t, i) => {
            for (const m of t.matchAll(/(?:insertInto|updateTable|deleteFrom)\(\s*'([a-z_]+)'|(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?([a-z_]+)\b/g)) {
              const table = m[1] ?? m[2];
              if (MODULE_OWNED[key]?.includes(table)) continue;
              if (KERNEL_TABLE.test(table)) findings.push(ctx.finding(file, i + 1, `ghi bảng NHÂN ${table} — chỉ được nộp sự việc (R-BOUND-2)`, `kernel:${table}`));
              else if (core.has(table)) findings.push(ctx.finding(file, i + 1, `ghi bảng lõi ${table} — đi qua API / service danh mục (A-17)`, `core:${table}`));
            }
          });
        }
      }
      return { examined, findings: dedupe(findings) };
    },
  },
  {
    id: 'SC-MOD-3',
    title: 'Mỗi phân hệ / add-in có bizcity.module.json hợp lệ',
    gate: 'CONF-MAN', contract: 'bizcity_module', rules: ['STD-MOD-1'], conf: ['CONF-MAN-1'], tier: 1, enforce: 'planned', phase: 'Phase 3 (3.2)', weight: 3, targets: ['repo'], scope: 'module',
    run(ctx) {
      const keys = [
        ...ctx.repo.list('apps/api/src/phan-he').filter((k) => ctx.repo.isDir(`apps/api/src/phan-he/${k}`)).map((k) => `apps/api/src/phan-he/${k}`),
        ...ctx.repo.list('apps/api/src/addins').filter((k) => ctx.repo.isDir(`apps/api/src/addins/${k}`)).map((k) => `apps/api/src/addins/${k}`),
        ...ctx.repo.list('modules').filter((k) => ctx.repo.isDir(`modules/${k}`)).map((k) => `modules/${k}`),
      ];
      const have = keys.filter((d) => ctx.repo.exists(`${d}/bizcity.module.json`));
      return { examined: keys.length, readiness: keys.length ? have.length / keys.length : 0, findings: [], notes: [`${have.length}/${keys.length} thư mục có manifest (audit A-25)`] };
    },
  },
];

function imports(ctx, file) {
  const out = [];
  ctx.repo.lines(file).forEach((t, i) => { for (const m of t.matchAll(IMPORT_RE)) out.push([m[1], i + 1]); });
  return out;
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((f) => { const k = `${f.file}|${f.key}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
