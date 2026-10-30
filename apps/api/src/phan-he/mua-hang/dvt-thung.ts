// @bizcity-layer D modules/mua-hang
/**
 * ĐVT THÙNG ĐẶT HÀNG (MH27): đặt hàng NCC chuẩn theo Thùng. Công cụ xem trước → chạy cho các mã có tương tác mua gần đây
 * (phiếu mua / đơn đặt trong N ngày, hoặc dòng Mặt hàng & giá mua của NCC khai / sửa trong N ngày):
 *   1. Mã chưa có ĐVT kiểu thùng → thêm ĐVT "Thùng", tỉ lệ đoán theo ngữ cảnh (tên hàng "x24" / "thùng 8", cùng họ mã, cùng nhãn +
 *      cùng dung tích đã có thùng), không có thì 48. Người dùng sửa quy cách từng mã ở màn xem trước hoặc nhập Excel quy cách
 *      ("12 Lốc", "48 Hộp", "12CAN/THÙNG") — quy về ĐVT nhỏ nhất theo ĐVT đã khai của mã (12 Lốc × 4 = 48 Hộp). Mã có quy cách nhập
 *      vào thì vào phạm vi dù không có tương tác gần đây; mã đã có thùng mà quy cách khác thì sửa tỉ lệ thùng.
 *   2. ĐVT thùng thành ĐVT MUA MẶC ĐỊNH của mặt hàng (lưu qua Danh mục mặt hàng — catalog.service, không ghi thẳng bảng lõi).
 *   3. Dòng giá NCC GIỮ NGUYÊN, không thêm dòng (mỗi NCC × mã một dòng giá): lập đơn lấy ĐVT mua mặc định (Thùng), đơn giá tự quy
 *      đổi từ dòng giá ĐVT khác (defaultUnitFor / priceFor). NCC đã có dòng Thùng thì chỉ đánh dấu "Đặt theo ĐVT này".
 *   Bản 30/10 đầu tiên từng thêm dòng Thùng trống giá: emptyThungRows / deleteEmptyThungRows dọn các dòng đó (xoá vĩnh viễn, ghi nhật ký).
 * Bỏ qua: mã ngừng theo dõi, hàng quà / KM (tên bắt đầu "KM", "(Z)"), mã có ĐVT nhỏ nhất đã là thùng (hàng combo).
 */
import { sql } from 'kysely';
import { toNumber, type Db } from '../../db/client.js';
import { saveProduct, type UnitInput } from '../../modules/catalog/catalog.service.js';
import { saveSupplierProducts } from './gia-mua.js';

export const THUNG = 'Thùng';
export const DEFAULT_THUNG_RATIO = 48;

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
/** ĐVT kiểu thùng: "Thùng", "thung", "Thùng_24", "Thùng 12"… */
export const isThung = (unit: string) => /^thung\b|^thung[_\s-]?\d/.test(plain(unit));
const isGift = (name: string) => /^\s*(\(z\)\s*)?km\b/.test(plain(name));
/** Số trong tên hàng: "180mlx24" / "x 24" / "(thùng 8)" / "24 hộp/thùng". Bỏ kích thước kiểu 41x27.5x16. */
export function ratioFromName(name: string): number | null {
  const s = plain(name);
  const m = /thung\s*(\d{1,3})\b/.exec(s) ?? /(\d{1,3})\s*[a-z]*\s*\/\s*thung/.exec(s) ?? /(?<![\d.,])x\s?(\d{1,3})(?![\d.,x])/.exec(s);
  const n = m ? Number(m[1]) : NaN;
  return n >= 2 && n <= 500 ? n : null;
}
/** Dung tích / khối lượng trong tên: "110ml", "1,5L", "900g" → "110ml" / "1.5l" / "900g". */
export function sizeOf(name: string): string | null {
  const m = /(\d+(?:[.,]\d+)?)\s?(ml|l|lit|g|gr|kg)\b/.exec(plain(name));
  return m ? `${m[1]!.replace(',', '.')}${m[2] === 'lit' ? 'l' : m[2] === 'gr' ? 'g' : m[2]}` : null;
}

/** Quy cách 1 thùng: "12 Lốc", "12CAN/THÙNG", "48 hộp/thùng", "x24", "48" → { qty, unit } (unit trống = ĐVT nhỏ nhất). */
export function parseSpec(text: string): { qty: number; unit: string } | null {
  const t = plain(text).replace(/\s+/g, ' ');
  const m = /^(?:1 ?thung ?[=:] ?)?x? ?(\d+(?:[.,]\d+)?) ?([^\d/=]*?) ?(?:\/ ?thung)?$/.exec(t);
  if (!m) return null;
  const qty = Number(m[1]!.replace(',', '.'));
  return qty > 0 ? { qty, unit: m[2]!.trim() } : null;
}
const unitKey = (u: string) => plain(u).replace(/[_\s-]?\d+$/, '');

export interface ThungRow {
  sku: string; name: string; baseUnit: string; units: { unit: string; ratio: number; isPurchaseDefault: boolean }[];
  /** add = thêm ĐVT Thùng; ratio = đã có thùng, quy cách nhập vào khác → sửa tỉ lệ; default = đã có ĐVT thùng, chỉ đặt làm ĐVT mua
   *  mặc định; ok = đã đúng chuẩn, không đổi ĐVT mặt hàng; error = quy cách nhập vào không đọc được / ĐVT không có ở mã (không chạy). */
  action: 'add' | 'ratio' | 'default' | 'ok' | 'error';
  /** Quy cách đã nhập (chữ gốc), lỗi nếu có, tỉ lệ thùng cũ khi sửa tỉ lệ. */
  spec?: string; error?: string; oldRatio?: number;
  thungUnit: string; ratio: number; source: string;
  /** Lý do có trong danh sách: mua gần đây / NCC khai. */
  reason: string;
  ncc: { partnerCode: string; fromUnit: string; price: number | null; toPrice: number | null; action: 'auto' | 'ok' }[];
  // auto = dòng giá giữ nguyên, lập đơn theo Thùng tự quy đổi (toPrice để xem); ok = NCC đã có dòng thùng (đánh dấu Đặt theo ĐVT này).
}

interface Ctx { days: number; since: string; specSkus: string[] }
const sinceOf = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

/** Mã trong phạm vi: phiếu mua / đơn đặt (chưa huỷ) trong N ngày ∪ dòng giá NCC khai / sửa trong N ngày. days = 0: mọi mã NCC khai. */
async function scope(trx: Db, tenantId: string, c: Ctx): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const docs = await sql<{ sku: string }>`
    SELECT DISTINCT l->>'sku' AS sku FROM purchase_documents d, jsonb_array_elements(COALESCE(d.data->'lines', '[]'::jsonb)) l
     WHERE d.tenant_id = ${tenantId} AND d.kind IN ('order', 'receipt', 'exchange') AND d.status <> 'cancelled' AND d.doc_date >= ${c.days ? c.since : '1900-01-01'}
       AND COALESCE(l->>'sku', '') <> ''`.execute(trx);
  for (const r of docs.rows) out.set(r.sku, 'Mua gần đây');
  let q = trx.selectFrom('supplier_products').select('sku').distinct().where('tenant_id', '=', tenantId).where('partner_code', 'is not', null).where('is_active', '=', true);
  if (c.days) q = q.where((eb) => eb.or([eb('created_at', '>=', new Date(c.since)), eb('updated_at', '>=', new Date(c.since))]));
  for (const r of await q.execute()) out.set(r.sku, out.has(r.sku) ? 'Mua gần đây · NCC khai' : 'NCC khai');
  for (const sku of c.specSkus) out.set(sku, out.has(sku) ? `${out.get(sku)} · Nhập quy cách` : 'Nhập quy cách');
  return out;
}

export interface ThungOpts { days?: number; specs?: Record<string, string>; skus?: string[] }
/**
 * Bảng xem trước. specs = quy cách 1 thùng người dùng sửa tay / nhập Excel theo mã (chạy thật dùng lại hàm này nên xem trước và chạy
 * ra cùng một kết quả). unknown = mã trong quy cách nhập vào mà danh mục không có.
 */
export async function thungPlan(trx: Db, tenantId: string, opts: ThungOpts = {}): Promise<{ days: number; since: string; rows: ThungRow[]; skipped: { sku: string; name: string; reason: string }[]; unknown: string[] }> {
  const days = Math.max(0, Math.min(3650, Math.trunc(opts.days ?? 30)));
  const specs: Record<string, string> = Object.fromEntries(Object.entries(opts.specs ?? {}).map(([k, v]) => [k.trim(), String(v).trim()]).filter(([k, v]) => k && v));
  const c: Ctx = { days, since: sinceOf(days), specSkus: Object.keys(specs) };
  const inScope = await scope(trx, tenantId, c);
  const skus = [...inScope.keys()].filter((s) => !opts.skus || opts.skus.includes(s));
  if (!skus.length) return { days, since: c.since, rows: [], skipped: [], unknown: c.specSkus };
  const [prods, units, ncc, known] = await Promise.all([
    trx.selectFrom('products').select(['sku', 'name', 'unit', 'brand_code', 'parent_sku', 'is_active']).where('tenant_id', '=', tenantId).where('sku', 'in', skus).execute(),
    trx.selectFrom('product_units').select(['sku', 'unit', 'ratio', 'is_purchase_default']).where('tenant_id', '=', tenantId).where('sku', 'in', skus).orderBy('ratio').execute(),
    trx.selectFrom('supplier_products').select(['id', 'partner_code', 'sku', 'unit', 'price', 'valid_from']).where('tenant_id', '=', tenantId).where('sku', 'in', skus)
      .where('partner_code', 'is not', null).where('is_active', '=', true).orderBy(sql`valid_from DESC NULLS LAST`).orderBy('id', 'desc').execute(),
    // Ngữ cảnh: mọi mã trong danh mục đã có ĐVT thùng (cùng họ mã, cùng nhãn + dung tích).
    trx.selectFrom('product_units as u').innerJoin('products as p', (j) => j.onRef('p.tenant_id', '=', 'u.tenant_id').onRef('p.sku', '=', 'u.sku'))
      .select(['u.sku', 'u.unit', 'u.ratio', 'p.name', 'p.brand_code', 'p.parent_sku']).where('u.tenant_id', '=', tenantId).where('u.ratio', '>', '1').execute(),
  ]);
  const thungs = known.filter((k) => isThung(k.unit)).map((k) => ({ ...k, ratio: toNumber(k.ratio), family: k.parent_sku ?? k.sku, size: sizeOf(k.name) }));
  const unitsBy = new Map<string, typeof units>();
  for (const u of units) (unitsBy.get(u.sku) ?? unitsBy.set(u.sku, []).get(u.sku)!).push(u);
  const nccBy = new Map<string, typeof ncc>();
  for (const r of ncc) (nccBy.get(r.sku) ?? nccBy.set(r.sku, []).get(r.sku)!).push(r);

  const guess = (p: (typeof prods)[number]): { ratio: number; source: string } => {
    const fromName = ratioFromName(p.name);
    if (fromName) return { ratio: fromName, source: `Theo tên hàng (${fromName})` };
    const fam = p.parent_sku ?? p.sku;
    const f = thungs.find((t) => t.family === fam && t.sku !== p.sku);
    if (f) return { ratio: f.ratio, source: `Cùng họ mã ${f.sku}` };
    const size = sizeOf(p.name);
    if (size && p.brand_code) {
      const same = thungs.filter((t) => t.brand_code === p.brand_code && t.size === size);
      if (same.length) {
        const cnt = new Map<number, number>();
        for (const t of same) cnt.set(t.ratio, (cnt.get(t.ratio) ?? 0) + 1);
        const [r, n] = [...cnt].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]!;
        return { ratio: r, source: `Cùng nhãn, cùng ${size} (${n} mã có thùng ${r})` };
      }
    }
    return { ratio: DEFAULT_THUNG_RATIO, source: `Mặc định ${DEFAULT_THUNG_RATIO}` };
  };

  const rows: ThungRow[] = [];
  const skipped: { sku: string; name: string; reason: string }[] = [];
  for (const p of prods.sort((a, b) => a.sku.localeCompare(b.sku))) {
    const us = (unitsBy.get(p.sku) ?? []).map((u) => ({ unit: u.unit, ratio: toNumber(u.ratio), isPurchaseDefault: u.is_purchase_default }));
    if (!us.length && p.unit) us.push({ unit: p.unit, ratio: 1, isPurchaseDefault: false });
    const base = us.find((u) => u.ratio === 1)?.unit ?? p.unit;
    if (!p.is_active) { skipped.push({ sku: p.sku, name: p.name, reason: 'Ngừng theo dõi' }); continue; }
    if (isGift(p.name)) { skipped.push({ sku: p.sku, name: p.name, reason: 'Hàng quà / khuyến mại' }); continue; }
    if (isThung(base)) { skipped.push({ sku: p.sku, name: p.name, reason: `ĐVT nhỏ nhất đã là ${base} (hàng combo / thùng lẻ)` }); continue; }
    const has = us.filter((u) => isThung(u.unit) && u.ratio > 1).sort((a, b) => b.ratio - a.ratio)[0];
    // Quy cách nhập vào: "12 Lốc" → 12 × tỉ lệ Lốc của mã; ĐVT trống thì là ĐVT nhỏ nhất.
    const specText = specs[p.sku];
    let manual: { ratio: number; source: string } | null = null, error: string | undefined;
    if (specText) {
      const sp = parseSpec(specText);
      const per = sp && (!sp.unit ? us.find((u) => u.ratio === 1) : us.find((u) => plain(u.unit) === plain(sp.unit)) ?? us.find((u) => unitKey(u.unit) === unitKey(sp.unit)));
      if (!sp) error = `Không đọc được quy cách "${specText}" — ghi kiểu "12 Lốc", "48 Hộp", "12CAN/THÙNG"`;
      else if (!per) error = `Mã không có ĐVT "${sp.unit}" (đang có: ${us.map((u) => u.unit).join(', ')}) — khai thêm ĐVT ở Danh mục mặt hàng hoặc ghi theo ĐVT đang có`;
      else if (isThung(per.unit)) error = `Quy cách phải ghi theo ĐVT nhỏ hơn thùng, không phải "${per.unit}"`;
      else {
        const ratio = Math.round(sp.qty * per.ratio * 10000) / 10000;
        if (ratio <= 1) error = `1 thùng phải lớn hơn 1 ${base} (đang ra ${ratio})`;
        else manual = { ratio, source: per.ratio === 1 ? `Quy cách: ${sp.qty} ${per.unit}` : `Quy cách: ${sp.qty} ${per.unit} × ${per.ratio} = ${ratio} ${base}` };
      }
    }
    const g = manual ?? (has ? { ratio: has.ratio, source: `Đã có ĐVT ${has.unit}` } : guess(p));
    const thungUnit = has?.unit ?? THUNG;
    const action: ThungRow['action'] = error ? 'error' : !has ? 'add' : manual && manual.ratio !== has.ratio ? 'ratio' : has.isPurchaseDefault ? 'ok' : 'default';
    const oldBuy = us.find((u) => u.isPurchaseDefault)?.unit;
    const ratioOf = (unit: string) => us.find((u) => u.unit.toLowerCase() === unit.toLowerCase())?.ratio;
    // NCC: mỗi NCC một kết quả — có dòng thùng thì đánh dấu; không thì thêm dòng Thùng, giá quy đổi từ dòng ĐVT mua cũ (ưu tiên ĐVT mua mặc định, mới nhất).
    const byPartner = new Map<string, NonNullable<ReturnType<typeof nccBy.get>>>();
    for (const r of nccBy.get(p.sku) ?? []) (byPartner.get(r.partner_code!) ?? byPartner.set(r.partner_code!, []).get(r.partner_code!)!).push(r);
    const nccRows: ThungRow['ncc'] = [];
    for (const [partnerCode, list] of error ? [] : byPartner) {
      const th = list.find((r) => r.unit.toLowerCase() === thungUnit.toLowerCase());
      if (th) { nccRows.push({ partnerCode, fromUnit: th.unit, price: th.price === null ? null : toNumber(th.price), toPrice: th.price === null ? null : toNumber(th.price), action: 'ok' }); continue; }
      const from = list.find((r) => oldBuy && r.unit.toLowerCase() === oldBuy.toLowerCase()) ?? list[0]!;
      const fr = ratioOf(from.unit) ?? 1;
      const price = from.price === null ? null : toNumber(from.price);
      nccRows.push({ partnerCode, fromUnit: from.unit, price, toPrice: price === null ? null : Math.round((price / fr) * g.ratio * 10000) / 10000, action: 'auto' });
    }
    rows.push({ sku: p.sku, name: p.name, baseUnit: base, units: us, action, thungUnit, ratio: g.ratio, source: error ? 'Quy cách lỗi' : g.source, reason: inScope.get(p.sku) ?? '', ncc: nccRows,
      ...(specText ? { spec: specText } : {}), ...(error ? { error } : {}), ...(has && action === 'ratio' ? { oldRatio: has.ratio } : {}) });
  }
  const found = new Set(prods.map((p) => p.sku));
  return { days, since: c.since, rows, skipped, unknown: c.specSkus.filter((s) => !found.has(s)) };
}

/** Chạy thật theo đúng bảng xem trước (cùng hàm thungPlan); trả số mã / dòng NCC đã đổi. */
export async function thungApply(trx: Db, tenantId: string, actor: string, opts: ThungOpts & { skus: string[] }) {
  const plan = await thungPlan(trx, tenantId, opts);
  let added = 0, defaulted = 0, ratioFixed = 0, nccAdded = 0, nccMarked = 0, errors = 0;
  for (const r of plan.rows) {
    if (r.action === 'error') { errors++; continue; }
    if (r.action !== 'ok') {
      const units: UnitInput[] = (await trx.selectFrom('product_units').selectAll().where('tenant_id', '=', tenantId).where('sku', '=', r.sku).orderBy('ratio').execute())
        .map((u) => ({ unit: u.unit, ratio: toNumber(u.ratio), isDefault: u.is_default, isPurchaseDefault: false, weightKg: u.weight_kg === null ? null : toNumber(u.weight_kg), note: u.note }));
      if (!units.length) units.push({ unit: r.baseUnit, ratio: 1, isDefault: true });
      if (r.action === 'add') units.push({ unit: THUNG, ratio: r.ratio, isDefault: false, isPurchaseDefault: true });
      else for (const u of units) if (u.unit === r.thungUnit) Object.assign(u, { isPurchaseDefault: true }, r.action === 'ratio' ? { ratio: r.ratio } : {});
      await saveProduct(trx, tenantId, actor, r.sku, { units }, { quiet: true });
      if (r.action === 'add') added++; else if (r.action === 'ratio') ratioFixed++; else defaulted++;
    }
    const items = [];
    for (const n of r.ncc) {
      const rows = await trx.selectFrom('supplier_products').selectAll().where('tenant_id', '=', tenantId).where('sku', '=', r.sku).where('partner_code', '=', n.partnerCode)
        .where('unit', '=', n.fromUnit).where('is_active', '=', true).orderBy(sql`valid_from DESC NULLS LAST`).orderBy('id', 'desc').limit(1).execute();
      const s = rows[0];
      if (!s) continue;
      if (n.action === 'ok' && s.is_default_unit) continue;
      const iso = (v: unknown) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null);
      // Dòng giá NCC giữ nguyên, KHÔNG thêm dòng: lập đơn tự lấy ĐVT mua mặc định (Thùng) và quy đổi giá. NCC đã có dòng thùng:
      // chỉ đánh dấu "Đặt theo ĐVT này".
      if (n.action === 'auto') continue;
      items.push({ id: String(s.id), partnerCode: n.partnerCode, sku: r.sku, isDefaultUnit: true, nccSku: s.ncc_sku, nccName: s.ncc_name ?? '', priceIncludesVat: s.price_includes_vat, warnPct: toNumber(s.warn_pct), validFrom: iso(s.valid_from), validTo: iso(s.valid_to), isActive: true,
        unit: s.unit, price: s.price === null ? null : toNumber(s.price), note: s.note });
      nccMarked++;
    }
    if (items.length) await saveSupplierProducts(trx, tenantId, actor, items);
  }
  return { products: plan.rows.length, added, defaulted, ratioFixed, nccAdded, nccMarked, errors, skipped: plan.skipped.length };
}

/**
 * Dòng Thùng TRỐNG GIÁ đã tạo ở bản MH27 đầu (30/10/2026): ĐVT kiểu thùng, chưa giá, không ghi chú, còn dùng, và cùng NCC × mã còn dòng
 * khác ĐÃ CÓ GIÁ (nên dòng thùng chỉ là bản thừa — lập đơn vẫn quy đổi từ dòng có giá). Không đụng dòng NCC tự khai.
 */
export async function emptyThungRows(trx: Db, tenantId: string) {
  const r = await sql<{ id: string; partner_code: string; sku: string; unit: string; name: string | null; keep_unit: string; keep_price: string }>`
    SELECT e.id, e.partner_code, e.sku, e.unit, p.name, k.unit AS keep_unit, k.price::text AS keep_price
      FROM supplier_products e
      LEFT JOIN products p ON p.tenant_id = e.tenant_id AND p.sku = e.sku
      JOIN LATERAL (SELECT o.unit, o.price FROM supplier_products o WHERE o.tenant_id = e.tenant_id AND o.partner_code = e.partner_code AND o.sku = e.sku
                     AND o.id <> e.id AND o.is_active AND o.price IS NOT NULL ORDER BY o.valid_from DESC NULLS LAST, o.id DESC LIMIT 1) k ON true
     WHERE e.tenant_id = ${tenantId} AND e.partner_code IS NOT NULL AND e.price IS NULL AND e.note = '' AND e.ncc_sku = '' AND e.is_active
     ORDER BY e.partner_code, e.sku`.execute(trx);
  return r.rows.filter((x) => isThung(x.unit)).map((x) => ({ id: String(x.id), partnerCode: x.partner_code, sku: x.sku, name: x.name ?? '', unit: x.unit, keepUnit: x.keep_unit, keepPrice: toNumber(x.keep_price) }));
}

/** Xoá vĩnh viễn các dòng Thùng trống giá ở trên; trả lại đủ nội dung các dòng đã xoá để ghi nhật ký. */
export async function deleteEmptyThungRows(trx: Db, tenantId: string) {
  const rows = await emptyThungRows(trx, tenantId);
  const ids = rows.map((r) => r.id);
  const deleted = ids.length ? await trx.deleteFrom('supplier_products').where('tenant_id', '=', tenantId).where('id', 'in', ids).returningAll().execute() : [];
  return { count: deleted.length, deleted };
}
