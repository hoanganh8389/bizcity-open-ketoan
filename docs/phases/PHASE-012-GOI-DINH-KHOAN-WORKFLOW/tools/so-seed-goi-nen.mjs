#!/usr/bin/env node
// [2026-10-30 11:12 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — T012-1: so cấu hình định khoản của đơn vị lập bằng seed mới (gói nền db/packs) với hằng của seed.ts cũ.
/**
 * PHASE-012 · T012-1 — seed mới (gói nền `db/packs/vn-tt99-nen.posting-pack.json`) cho đúng dữ liệu như seed cũ (chỉ đọc).
 *
 *   SEED_TENANT_CODE=seed-goi-nen SEED_ADMIN_EMAIL=admin@seed-goi-nen.local npx tsx apps/api/src/db/seed.ts   # lập đơn vị bằng seed mới
 *   BIZCITY_PSQL="docker exec -i ketoan-db-1 psql -U ketoan -d ketoan_test" node docs/phases/PHASE-012-GOI-DINH-KHOAN-WORKFLOW/tools/so-seed-goi-nen.mjs seed-goi-nen [commit]
 *
 * commit: bản seed.ts còn năm hằng TAX_CODES, REASONS, GROUPS, PAYMENT_METHODS, DEFAULTS (mặc định a82f091 — commit cuối trước S012-3b).
 * Thoát 0 khi năm bảng tax_codes, posting_reasons, product_posting_groups, payment_methods, posting_defaults của đơn vị TRÙNG hằng cũ.
 */
import { execFileSync, execSync } from 'node:child_process';

const [tenant, commit = 'a82f091'] = process.argv.slice(2);
if (!tenant || !/^[a-z0-9-]+$/.test(tenant)) {
  console.error('Dùng: node so-seed-goi-nen.mjs <mã đơn vị> [commit]');
  process.exit(2);
}
const PSQL = process.env.BIZCITY_PSQL ?? 'psql';
const src = execFileSync('git', ['show', `${commit}:apps/api/src/db/seed.ts`], { encoding: 'utf8' });
const grab = (name) => {
  const start = src.indexOf(`const ${name}`);
  if (start < 0) throw new Error(`${commit}: seed.ts không còn hằng ${name}`);
  const eq = src.indexOf('=', start);
  const end = name === 'DEFAULTS' ? src.indexOf('\n};', eq) + 2 : src.indexOf('\n];', eq) + 2;
  return Function(`return (${src.slice(eq + 1, end).trim()});`)();
};
const query = (q) => JSON.parse(execSync(`${PSQL} -At -c "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim() || '[]');
const tid = `(SELECT id FROM tenants WHERE code = '${tenant}')`;
const sortObj = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
const norm = (rows) => JSON.stringify(rows.map(sortObj).map(JSON.stringify).sort());
const agg = (cols, table) => query(`SELECT coalesce(json_agg(json_build_object(${cols})), '[]') FROM ${table} WHERE tenant_id = ${tid}`);

const pairs = {
  tax_codes: [grab('TAX_CODES').map((t) => ({ ...t, rate: Number(t.rate) })),
    agg("'code',code,'name',name,'rate',rate::float,'direction',direction,'account_code',account_code,'report_group',report_group", 'tax_codes')],
  posting_reasons: [grab('REASONS').map((r) => ({ ...r, flags: sortObj(r.flags) })),
    agg("'code',code,'name',name,'kind',kind,'counter_account',counter_account,'revenue_account',revenue_account,'expense_account',expense_account,'cashflow_code',cashflow_code,'flags',flags", 'posting_reasons').map((r) => ({ ...r, flags: sortObj(r.flags) }))],
  product_posting_groups: [grab('GROUPS'),
    agg("'code',code,'name',name,'inventory_account',inventory_account,'cogs_account',cogs_account,'revenue_account',revenue_account,'discount_account',discount_account,'sales_return_account',sales_return_account,'is_default',is_default", 'product_posting_groups')],
  payment_methods: [grab('PAYMENT_METHODS'), agg("'code',code,'name',name,'account_code',account_code,'is_receivable',is_receivable", 'payment_methods')],
  posting_defaults: [Object.entries(grab('DEFAULTS')).map(([key, account_code]) => ({ key, account_code })), agg("'key',key,'account_code',account_code", 'posting_defaults')],
};
let ok = true;
for (const [table, [want, got]] of Object.entries(pairs)) {
  const same = norm(want) === norm(got);
  ok &&= same;
  console.log(`${same ? 'TRÙNG' : 'KHÁC '}  ${table}: seed cũ ${want.length} dòng, đơn vị ${tenant} ${got.length} dòng`);
}
console.log(ok ? 'KẾT QUẢ: seed mới (gói nền) = seed cũ' : 'KẾT QUẢ: LỆCH');
process.exit(ok ? 0 : 1);
