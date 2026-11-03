#!/usr/bin/env node
// [2026-11-03 03:00 PM Johnny Chu - Chu Hoàng Anh] G3-01 — pos-mini: một đơn bán ở quầy → một chứng từ sale (bizcity_ledger_intake@1), không cài gói, không tính thuế
/**
 * POS MINI — mẫu tích hợp nhỏ nhất cho dev bán hàng (skill build-pos-with-open-ketoan).
 *
 *   node examples/pos-mini/pos-mini.mjs --catalog                       in danh mục thật của đơn vị (BIZCITY_SERVER + BIZCITY_API_KEY)
 *   node examples/pos-mini/pos-mini.mjs <don.json> [--config cau-hinh.json] [--out build/chung-tu.json]
 *
 * Việc của app: KỂ SỰ VIỆC đúng như hoá đơn đã chốt ở quầy. Không có số tài khoản, không có thuế suất, không tính thuế
 * ở đây: tiền trước thuế và tiền thuế từng dòng là số in trên hoá đơn của POS. `totals` chỉ là cộng các dòng (cửa nạp kiểm
 * lại tới đồng: IN-SUM-001/005/006). Mã chi nhánh, mã thuế, hình thức thanh toán lấy từ bảng ánh xạ cau-hinh.json, bảng này
 * khai theo danh mục của đơn vị (GET /api/v1/branches, /tax-codes, /posting/payment-methods).
 *
 * Kế tiếp: npx bizcity event check <tệp ra> → PASS ở L5 thì thêm --submit.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dong = (n) => Math.round(Number(n) || 0);
const sum = (xs) => xs.reduce((s, x) => s + dong(x), 0);

/**
 * @param {object} order đơn của POS (khuôn trong don-mau.json)
 * @param {{source: string, branches: Record<string,string>, payments: Record<string,string>}} cfg bảng ánh xạ
 */
export function toDocument(order, cfg) {
  const problems = [];
  const branchCode = cfg.branches?.[order.store];
  if (!branchCode) problems.push(`cửa hàng "${order.store}" chưa có trong cau-hinh.json → branches`);
  const lines = (order.items ?? []).map((it) => ({
    lineKey: String(it.lineId),
    sku: it.sku,
    name: it.name,
    ...(it.unit ? { unit: it.unit } : {}),
    qty: it.qty,
    ...(it.unitPrice !== undefined ? { unitPrice: it.unitPrice } : {}),
    ...(it.discount ? { discount: dong(it.discount) } : {}),
    amountBeforeTax: dong(it.amountBeforeTax),
    taxCode: it.taxCode,
    taxAmount: dong(it.taxAmount),
    ...(it.gift ? { isGift: true } : {}),
  }));
  for (const [i, it] of (order.items ?? []).entries()) if (!it.taxCode) problems.push(`dòng ${i + 1} (${it.sku}) thiếu taxCode — hỏi kế toán mặt hàng chịu mã thuế nào, không tự đoán`);
  const payments = (order.payments ?? []).map((p) => {
    const methodCode = cfg.payments?.[p.method];
    if (!methodCode) problems.push(`hình thức "${p.method}" chưa có trong cau-hinh.json → payments`);
    return { methodCode: methodCode ?? p.method, amount: dong(p.amount), ...(p.ref ? { reference: p.ref } : {}) };
  });
  const beforeTax = sum(lines.map((l) => l.amountBeforeTax));
  const tax = sum(lines.map((l) => l.taxAmount));
  const document = {
    docType: 'sale',
    docKey: `${cfg.source}:${order.store}:sale:${order.id}`,
    version: order.version ?? 1,
    branchCode: branchCode ?? order.store,
    docNo: order.receiptNo,
    docDate: order.date,
    sourceSystem: cfg.source,
    ...(order.customer?.phone ? { partner: { code: order.customer.phone, name: order.customer.name ?? order.customer.phone, ...(order.customer.taxCode ? { taxCode: order.customer.taxCode } : {}) } } : {}),
    ...(order.invoice ? { invoice: order.invoice } : {}),
    lines,
    payments,
    totals: { beforeTax, tax, total: beforeTax + tax },
  };
  return { document, problems };
}

/** Danh mục thật của đơn vị — để điền cau-hinh.json bằng mã có thật, không đoán. */
export async function readCatalog(server, key, fetchImpl = globalThis.fetch) {
  const get = async (p) => {
    const res = await fetchImpl(`${server.replace(/\/$/, '')}${p}`, { headers: { 'X-Api-Key': key } });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) return { error: `${p}: ${body?.error?.code ?? `HTTP ${res.status}`}` };
    const d = body.data;
    return { rows: Array.isArray(d) ? d : (d?.items ?? []) };
  };
  return {
    branches: await get('/api/v1/branches'),
    taxCodes: await get('/api/v1/tax-codes'),
    payments: await get('/api/v1/posting/payment-methods'),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain && process.argv.includes('--catalog')) {
  const server = process.env.BIZCITY_SERVER;
  const key = process.env.BIZCITY_API_KEY;
  if (!server || !key) { process.stderr.write('SKIP: đặt BIZCITY_SERVER và BIZCITY_API_KEY (khoá HT02) rồi chạy lại\n'); process.exit(2); }
  const c = await readCatalog(server, key);
  const show = (title, r, fmt) => {
    process.stdout.write(`\n${title}\n`);
    if (r.error) process.stdout.write(`  ✘ ${r.error}\n`);
    else if (!r.rows.length) process.stdout.write('  (trống — nhờ kế toán khai)\n');
    else for (const x of r.rows) process.stdout.write(`  ${fmt(x)}\n`);
  };
  show('Chi nhánh → cau-hinh.json "branches"', c.branches, (x) => `${x.code}  ${x.name ?? ''}`);
  show('Mã thuế → taxCode từng dòng (bán ra: direction output)', c.taxCodes, (x) => `${x.code}  ${x.rate ?? ''}%  ${x.direction ?? ''}  ${x.name ?? ''}`);
  show('Hình thức thanh toán → cau-hinh.json "payments"', c.payments, (x) => `${x.code}  ${x.name ?? ''}`);
  process.exit(Object.values(c).some((r) => r.error) ? 1 : 0);
} else if (isMain) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const file = args.find((a, i) => !a.startsWith('--') && !['--config', '--out'].includes(args[i - 1]));
  if (!file) { process.stderr.write('✘ cần tệp đơn: node examples/pos-mini/pos-mini.mjs examples/pos-mini/don-mau.json\n'); process.exit(2); }
  const cfgFile = opt('--config') ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'cau-hinh.json');
  const { document, problems } = toDocument(JSON.parse(readFileSync(file, 'utf8')), JSON.parse(readFileSync(cfgFile, 'utf8')));
  for (const p of problems) process.stderr.write(`⚠ ${p}\n`);
  const text = `${JSON.stringify(document, null, 2)}\n`;
  const out = opt('--out');
  if (out) {
    mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    writeFileSync(out, text);
    process.stdout.write(`✔ ${document.docKey} → ${out}\n  Kế tiếp: npx bizcity event check ${out}\n`);
  } else process.stdout.write(text);
  process.exit(problems.length ? 1 : 0);
}
