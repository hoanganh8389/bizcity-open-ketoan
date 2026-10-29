#!/usr/bin/env node
/**
 * DỮ LIỆU MẪU TEST CHUYỂN HÀNG XUỐNG SHOP (MH16 / MH19) — đơn vị demo (tenant 1), cây 08000 → 08001Premium, 08002Premium, 08003Premium.
 *   node scripts/mau-chuyen-kho.mjs          nạp (chạy lại được: chứng từ cùng docKey không nhân đôi, max ghi đè)
 *   node scripts/mau-chuyen-kho.mjs --xoa    xoá sạch dữ liệu mẫu (huỷ chứng từ, xoá max, cài riêng mã, đề nghị chuyển, mã hàng)
 * Mã hàng mẫu TCK01–TCK05, mỗi mã một tình huống (xem KICH_BAN). Tồn / bán / đi đường gửi qua API chứng từ như POS thật;
 * max, cài riêng mã, mã hàng + quy cách ghi thẳng DB (docker ketoan-db-1). Cần SEED_API_KEY trong .env.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const API = process.env.API_URL ?? 'http://localhost:8088/api/v1';
const KEY = process.env.SEED_API_KEY ?? readFileSync(new URL('../.env', import.meta.url), 'utf8').match(/^SEED_API_KEY=(.*)$/m)?.[1]?.trim();
if (!KEY) throw new Error('Thiếu SEED_API_KEY (.env)');
const TENANT = 1;
const CHA = '08000', KHO = '08-HH';
const S1 = '08001Premium', S2 = '08002Premium', S3 = '08003Premium';
const PFX = 'mau-ck';

const sql = (q) => execFileSync('docker', ['exec', '-i', 'ketoan-db-1', 'psql', '-U', 'ketoan', '-d', 'ketoan', '-v', 'ON_ERROR_STOP=1', '-At'], { input: q, encoding: 'utf8' });
const esc = (s) => `'${String(s).replace(/'/g, "''")}'`;
async function call(path, body) {
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': KEY }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(`${path} ${r.status}: ${JSON.stringify(j).slice(0, 500)}`);
  return j.data;
}

/** Mã hàng: ĐVT gốc Lon, thùng = pack lon (ĐVT mua mặc định). mode = cách làm tròn khi chuyển. */
const HANG = [
  { sku: 'TCK01', name: 'TEST chuyển kho – kho không đủ, ưu tiên shop', pack: 12, mode: 'auto' },
  { sku: 'TCK02', name: 'TEST chuyển kho – chỉ nguyên thùng', pack: 12, mode: 'pack' },
  { sku: 'TCK03', name: 'TEST chuyển kho – chuyển lẻ', pack: 6, mode: 'unit' },
  { sku: 'TCK04', name: 'TEST chuyển kho – hàng đi đường', pack: 12, mode: 'auto' },
  { sku: 'TCK05', name: 'TEST chuyển kho – gợi ý max từ tốc độ bán', pack: 24, mode: 'auto' },
];
const nameOf = Object.fromEntries(HANG.map((h) => [h.sku, h.name]));

/** Tồn đầu (phiếu điều chỉnh tăng 01/10): [chi nhánh, mã, SL]. */
const TON = [
  [CHA, 'TCK01', 30], [S1, 'TCK01', 5], [S2, 'TCK01', 15],
  [CHA, 'TCK02', 100], [S1, 'TCK02', 10], [S2, 'TCK02', 25],
  [CHA, 'TCK03', 50], [S1, 'TCK03', 3], [S2, 'TCK03', 8],
  [CHA, 'TCK04', 80], [S1, 'TCK04', 4], [S2, 'TCK04', 12],
  [CHA, 'TCK05', 48], [S1, 'TCK05', 50],
];
/** Max shop (kho mặc định của shop) + max kho cha (08-HH). Không khai TCK05: để test "Có bán, chưa có max" → áp gợi ý. */
const MAX = [
  [S1, 'TCK01', 24], [S2, 'TCK01', 20], [S3, 'TCK01', 12], [CHA, 'TCK01', 62],
  [S1, 'TCK02', 30], [S2, 'TCK02', 30], [S3, 'TCK02', 24],
  [S1, 'TCK03', 10], [S2, 'TCK03', 8], [S3, 'TCK03', 5],
  [S1, 'TCK04', 24], [S2, 'TCK04', 12], [S3, 'TCK04', 24],
];

const line = (sku, qty, i = 1, wh) => ({ lineKey: String(i), sku, name: nameOf[sku], unit: 'Lon', qty, amount: 0, ...(wh ? { warehouseCode: wh } : {}) });
function docs() {
  const out = [];
  // Tồn đầu: mỗi chi nhánh một phiếu điều chỉnh tăng.
  for (const b of [CHA, S1, S2]) {
    const ls = TON.filter((t) => t[0] === b).map(([, sku, qty], i) => line(sku, qty, i + 1, b === CHA ? KHO : undefined));
    out.push({ docType: 'stock_adjustment', docKey: `${PFX}:${b}:adjust:TON`, branchCode: b, docNo: `MAU-TON-${b}`, docDate: '2026-10-01', direction: 'increase', internalOnly: true, sourceSystem: 'mau', description: 'Mẫu test chuyển kho: tồn đầu', lines: ls, totals: { total: 0 } });
  }
  // TCK04: lần chuyển đã nhận (8 lon → S1) và lần đang đi đường (12 lon → S3, chưa nhận).
  out.push({ docType: 'transfer', docKey: `${PFX}:transfer:CK-NHAN`, branchCode: CHA, toBranchCode: S1, docNo: 'MAU-CK-NHAN', docDate: '2026-10-24', status: 'received', internalOnly: true, sourceSystem: 'mau', lines: [line('TCK04', 8, 1, KHO)], totals: { total: 0 } });
  out.push({ docType: 'transfer', docKey: `${PFX}:transfer:CK-DI`, branchCode: CHA, toBranchCode: S3, docNo: 'MAU-CK-DI', docDate: '2026-10-26', status: 'shipped', internalOnly: true, sourceSystem: 'mau', lines: [line('TCK04', 12, 1, KHO)], totals: { total: 0 } });
  // TCK05: S1 bán 5 lon / ngày trong 7 ngày gần nhất (21–27/10) → bán / ngày 5, gợi ý max 35.
  for (let d = 21; d <= 27; d++) {
    const qty = 5, price = 100000, before = qty * price, tax = before * 0.08;
    out.push({ docType: 'sale', docKey: `${PFX}:${S1}:sale:${d}`, branchCode: S1, docNo: `MAU-BAN-${d}`, docDate: `2026-10-${d}`, internalOnly: true, sourceSystem: 'mau',
      lines: [{ lineKey: '1', sku: 'TCK05', name: nameOf.TCK05, unit: 'Lon', qty, unitPrice: price, amountBeforeTax: before, discount: 0, taxCode: 'R08', taxAmount: tax }],
      payments: [{ methodCode: 'TM', amount: before + tax }], totals: { beforeTax: before, tax, total: before + tax } });
  }
  return out;
}

const eventIds = (where) => sql(`SELECT id FROM accounting_events WHERE tenant_id = ${TENANT} AND doc_key LIKE '${PFX}:%' AND ${where}`).split('\n').filter(Boolean);

async function nap() {
  const skus = HANG.map((h) => esc(h.sku)).join(',');
  sql(`
    INSERT INTO products (tenant_id, sku, name, unit, note) VALUES ${HANG.map((h) => `(${TENANT}, ${esc(h.sku)}, ${esc(h.name)}, 'Lon', 'mẫu test chuyển kho')`).join(',')}
      ON CONFLICT (tenant_id, sku) DO UPDATE SET name = EXCLUDED.name, unit = 'Lon';
    DELETE FROM product_units WHERE tenant_id = ${TENANT} AND sku IN (${skus});
    INSERT INTO product_units (tenant_id, sku, unit, ratio, is_default, is_purchase_default) VALUES
      ${HANG.flatMap((h) => [`(${TENANT}, ${esc(h.sku)}, 'Lon', 1, true, false)`, `(${TENANT}, ${esc(h.sku)}, 'Thùng', ${h.pack}, false, true)`]).join(',')};
  `);
  console.log(`✓ ${HANG.length} mã hàng + quy cách thùng`);

  const r = await call('/documents/batch', { documents: docs() });
  const res = r.results ?? r;
  const bad = (Array.isArray(res) ? res : []).filter((x) => x.status === 'error' && !/định khoản|tài khoản|posting/i.test(JSON.stringify(x)));
  console.log(`✓ ${docs().length} chứng từ (tồn đầu, chuyển kho, bán)${bad.length ? ` — ${bad.length} lỗi: ${JSON.stringify(bad).slice(0, 400)}` : ''}`);
  // Chứng từ vào trạm ACC14 ở trạng thái chờ: định khoản luôn (định khoản xong mới sinh thẻ kho / tồn).
  const ids = eventIds("status IN ('pending', 'error')");
  if (ids.length) { await call('/documents/post', { ids }); console.log(`✓ Định khoản ${ids.length} chứng từ`); }

  sql(`
    DELETE FROM stock_levels WHERE tenant_id = ${TENANT} AND sku IN (${skus});
    INSERT INTO stock_levels (tenant_id, branch_code, warehouse_code, sku, max_qty, source, note, updated_by) VALUES
      ${MAX.map(([b, sku, max]) => `(${TENANT}, ${esc(b)}, (SELECT w.code FROM warehouses w JOIN branches x ON x.id = w.branch_id WHERE x.tenant_id = ${TENANT} AND x.code = ${esc(b)} AND ${b === CHA ? `w.code = ${esc(KHO)}` : 'w.is_default'} LIMIT 1), ${esc(sku)}, ${max}, 'mau', 'mẫu test chuyển kho', 'mau')`).join(',')};
    DELETE FROM stock_sku_settings WHERE tenant_id = ${TENANT} AND sku IN (${skus});
    INSERT INTO stock_sku_settings (tenant_id, sku, transfer_mode, note, updated_by) VALUES
      ${HANG.map((h) => `(${TENANT}, ${esc(h.sku)}, ${esc(h.mode)}, 'mẫu test chuyển kho', 'mau')`).join(',')};
    DELETE FROM transfer_requests WHERE tenant_id = ${TENANT} AND data::text LIKE '%"TCK0%';
  `);
  console.log(`✓ ${MAX.length} tồn max, ${HANG.length} cài riêng mã, xoá đề nghị chuyển mẫu cũ`);
}

async function xoa() {
  for (const d of docs()) {
    try { await call('/documents/cancel', { docKey: d.docKey, reason: 'Xoá dữ liệu mẫu test chuyển kho' }); } catch (e) { if (!/không có|not.?found|đã huỷ/i.test(String(e))) console.warn(String(e).slice(0, 200)); }
  }
  // Chế độ "Chờ định khoản": huỷ vào hàng Chờ huỷ ở ACC14 — định khoản huỷ luôn (đảo bút toán, bỏ thẻ kho).
  const ids = eventIds("status <> 'cancelled'");
  if (ids.length) await call('/documents/post', { ids });
  const left = eventIds("status <> 'cancelled'");
  if (left.length) console.warn(`! Còn ${left.length} chứng từ mẫu chưa huỷ — huỷ tay ở ACC14 (docKey bắt đầu ${PFX}:)`);
  const skus = HANG.map((h) => esc(h.sku)).join(',');
  sql(`
    DELETE FROM stock_levels WHERE tenant_id = ${TENANT} AND sku IN (${skus});
    DELETE FROM stock_sku_settings WHERE tenant_id = ${TENANT} AND sku IN (${skus});
    DELETE FROM transfer_requests WHERE tenant_id = ${TENANT} AND data::text LIKE '%"TCK0%';
  `);
  console.log('✓ Đã xoá dữ liệu mẫu (chứng từ huỷ, max, cài riêng mã, đề nghị chuyển; mã hàng TCK01–05 giữ lại trong danh mục)');
}

await (process.argv.includes('--xoa') ? xoa() : nap());
