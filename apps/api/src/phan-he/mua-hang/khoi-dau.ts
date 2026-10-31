// @bizcity-layer D modules/mua-hang
/**
 * NHẬP DỮ LIỆU KHỞI ĐẦU (MH20) — 3 việc từ tệp Excel xuất ở phần mềm cũ, chạy lại bao nhiêu lần cũng được (có rồi thì đè):
 *   1. Giá mua theo NCC: tệp dòng phiếu nhập (Mã NCC, Mã hàng, SL, TT trước VAT, ĐVT…) → mỗi NCC × mã × ĐVT một giá
 *      = TT trước VAT ÷ SL của dòng MỚI NHẤT; bỏ dòng TT < 1 (trả hàng, hàng tặng); NCC chưa có thì tạo → supplier_products.
 *   2. Cân tồn: tệp tồn theo kho (Kho, Mã hàng, Số lượng) so với tồn trên sổ ERP của đúng kho → chênh lệch +/− → mỗi kho một
 *      phiếu điều chỉnh kho (stock_adjustment, mixed) ghi sổ ngay. Tuỳ chọn: mã có tồn trên sổ mà tệp không có → cân về 0.
 *   3. Tồn max: tệp (Kho, Mã hàng, Tồn max) → stock_levels (min = 0).
 * Cột "Kho" là mã kho của danh mục kho (DM12); không có kho đó thì thử mã chi nhánh (kho mặc định của chi nhánh).
 * Mỗi việc có bước xem trước (không ghi) và bước ghi.
 */
import { sql } from 'kysely';
import { z } from 'zod';
import { ingestDocumentSchema, type IngestDocument } from '@ketoan/contracts';
import { toNumber, type Db } from '../../db/client.js';
import type { AuthContext } from '../../core/auth.js';
import { Errors } from '../../core/errors.js';
import { postDocumentIn } from '../../kernel/public.js';
import { partnerRepository } from '../../modules/partners/partner.repository.js';
import { saveSupplierProducts, unitsOf } from './gia-mua.js';
import { listLevels, saveLevels } from './ton-max.js';

const r4 = (x: number) => Math.round(x * 10000) / 10000;
const sameText = (a?: string, b?: string) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/* ------------------------------------------------------------------ kho → chi nhánh */

interface WhRef { branchCode: string; branchName: string; warehouseCode: string; warehouseName: string }
async function warehouseResolver(trx: Db, tenantId: string) {
  const [whs, brs] = await Promise.all([
    trx.selectFrom('warehouses as w').innerJoin('branches as b', 'b.id', 'w.branch_id').select(['w.code', 'w.name', 'w.is_default', 'b.code as bcode', 'b.name as bname', 'b.id as bid'])
      .where('w.tenant_id', '=', tenantId).execute(),
    trx.selectFrom('branches').select(['id', 'code', 'name']).where('tenant_id', '=', tenantId).execute(),
  ]);
  const byWh = new Map(whs.map((w) => [w.code.toUpperCase(), w]));
  const defOf = (bid: string) => whs.find((w) => String(w.bid) === String(bid) && w.is_default) ?? whs.find((w) => String(w.bid) === String(bid));
  const cache = new Map<string, WhRef | null>();
  return (kho: string): WhRef | null => {
    // Ô Excel kiểu số làm mất số 0 đầu (02008 → 2008): mã toàn số ngắn hơn 5 ký tự thì bù 0.
    const t = kho.trim().toUpperCase();
    const k = /^\d{1,4}$/.test(t) ? t.padStart(5, '0') : t;
    if (cache.has(k)) return cache.get(k)!;
    let out: WhRef | null = null;
    const w = byWh.get(k);
    if (w) out = { branchCode: w.bcode, branchName: w.bname, warehouseCode: w.code, warehouseName: w.name };
    else {
      // Không có mã kho: thử mã chi nhánh trùng hẳn, rồi chi nhánh bắt đầu bằng mã đó (00001 → 00001Premium).
      const b = brs.find((x) => x.code.toUpperCase() === k) ?? (/^\d{5}$/.test(k) ? brs.filter((x) => x.code.toUpperCase().startsWith(k)).sort((a, c) => a.code.length - c.code.length)[0] : undefined);
      const d = b ? defOf(String(b.id)) : undefined;
      if (b) out = { branchCode: b.code, branchName: b.name, warehouseCode: d?.code ?? '', warehouseName: d?.name ?? '' };
    }
    cache.set(k, out);
    return out;
  };
}

async function knownProducts(trx: Db, tenantId: string, skus: string[]) {
  const list = [...new Set(skus.filter(Boolean))];
  const map = new Map<string, { name: string; unit: string }>();
  for (let i = 0; i < list.length; i += 2000) {
    const rows = await trx.selectFrom('products').select(['sku', 'name', 'unit']).where('tenant_id', '=', tenantId).where('sku', 'in', list.slice(i, i + 2000)).execute();
    for (const r of rows) map.set(r.sku, { name: r.name, unit: r.unit });
  }
  return map;
}

/* ------------------------------------------------------------------ 1. giá mua theo NCC */

export const priceRowsSchema = z.object({
  rows: z.array(z.object({
    row: z.number().int().optional(),
    supplierCode: z.string().trim().max(64).default(''), supplierName: z.string().trim().max(255).default(''),
    sku: z.string().trim().max(64).default(''), name: z.string().trim().max(500).default(''), unit: z.string().trim().max(32).default(''),
    qty: z.number().finite().nullable().default(null), totalBeforeVat: z.number().finite().nullable().default(null), pack: z.number().finite().nullable().optional(),
    date: z.string().max(40).optional(),
  })).min(1).max(100000),
});
type PriceInput = z.infer<typeof priceRowsSchema>['rows'][number];

export interface PricePreviewRow {
  supplierCode: string; supplierName: string; sku: string; name: string; unit: string; price: number; qty: number; totalBeforeVat: number; date?: string; rows: number[];
  status: 'new' | 'update' | 'same' | 'error'; oldPrice: number | null; supplierExists: boolean; error?: string;
}

/** Ngày để so dòng nào mới hơn: dd/mm/yyyy hoặc yyyy-mm-dd, có / không có giờ. Không đọc được = 0 (dòng sau thắng). */
function dateKey(s?: string): number {
  if (!s) return 0;
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0));
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) return Date.UTC(+m[3]!, +m[2]! - 1, +m[1]!, +(m[4] ?? 0), +(m[5] ?? 0));
  return 0;
}

export async function pricePreview(trx: Db, tenantId: string, input: PriceInput[]) {
  const skipped = { empty: 0, noSku: 0, noSupplier: 0, badQty: 0, badTotal: 0, older: 0 };
  const buckets = new Map<string, PricePreviewRow & { ts: number }>();
  for (const [i, r] of input.entries()) {
    const sku = r.sku.trim(), sup = r.supplierCode.trim().toUpperCase();
    if (!sku && !sup && !r.qty) { skipped.empty++; continue; }
    if (!sku) { skipped.noSku++; continue; }
    if (!sup) { skipped.noSupplier++; continue; }
    if (!(r.qty && r.qty > 0)) { skipped.badQty++; continue; }
    // Dưới 1 đồng: dòng trả hàng (âm) hoặc hàng tặng (0) — không phải giá mua.
    if (!(r.totalBeforeVat !== null && r.totalBeforeVat >= 1)) { skipped.badTotal++; continue; }
    const key = `${sup}|${sku}|${r.unit.toLowerCase()}`;
    const ts = dateKey(r.date);
    const cur = buckets.get(key);
    if (cur) { skipped.older++; if (ts < cur.ts) { cur.rows.push(r.row ?? i + 2); continue; } }
    buckets.set(key, { supplierCode: sup, supplierName: r.supplierName || cur?.supplierName || '', sku, name: r.name || cur?.name || '', unit: r.unit, qty: r.qty, totalBeforeVat: r.totalBeforeVat,
      price: Math.round((r.totalBeforeVat / r.qty) * 100) / 100, date: r.date, rows: [...(cur?.rows ?? []), r.row ?? i + 2], ts, status: 'new', oldPrice: null, supplierExists: false });
  }
  const rows = [...buckets.values()];
  const skus = [...new Set(rows.map((r) => r.sku))];
  const [prods, units, partners, existing] = await Promise.all([
    knownProducts(trx, tenantId, skus), unitsOf(trx, tenantId, skus),
    trx.selectFrom('partners').select('code').where('tenant_id', '=', tenantId).where('code', 'in', [...new Set(rows.map((r) => r.supplierCode))].concat([''])).execute(),
    skus.length ? trx.selectFrom('supplier_products').select(['partner_code', 'sku', 'unit', 'price']).where('tenant_id', '=', tenantId).where('sku', 'in', skus).where('partner_code', 'is not', null).where('is_active', '=', true).orderBy(sql`valid_from DESC NULLS LAST`).execute() : [],
  ]);
  const hasPartner = new Set(partners.map((p) => p.code));
  for (const r of rows) {
    r.supplierExists = hasPartner.has(r.supplierCode);
    const p = prods.get(r.sku);
    if (!p) { r.status = 'error'; r.error = 'Mã chưa có trong danh mục mặt hàng'; continue; }
    if (!r.name) r.name = p.name;
    const us = units[r.sku] ?? [];
    // Tệp không có ĐVT: giá theo ĐVT nhỏ nhất. Có ĐVT mà mặt hàng chưa khai ĐVT đó: báo lỗi (khai thêm ở DM10).
    const u = r.unit ? us.find((x) => sameText(x.unit, r.unit)) : us.find((x) => Number(x.ratio) === 1) ?? us[0];
    if (!u) { r.status = 'error'; r.error = `Mặt hàng chưa có ĐVT "${r.unit}" (có: ${us.map((x) => x.unit).join(', ') || p.unit})`; continue; }
    r.unit = u.unit;
    const old = existing.find((e) => e.partner_code === r.supplierCode && e.sku === r.sku && sameText(e.unit, r.unit));
    r.oldPrice = old?.price === null || old?.price === undefined ? null : toNumber(old.price);
    r.status = !old ? 'new' : r.oldPrice !== null && Math.abs(r.oldPrice - r.price) < 0.01 ? 'same' : 'update';
  }
  rows.sort((a, b) => a.supplierCode.localeCompare(b.supplierCode) || a.sku.localeCompare(b.sku));
  return {
    rows: rows.map(({ ts: _t, ...r }) => r), skipped, rawRows: input.length,
    suppliers: [...new Set(rows.map((r) => r.supplierCode))].map((code) => {
      const rs = rows.filter((r) => r.supplierCode === code);
      return { code, name: rs.find((r) => r.supplierName)?.supplierName ?? '', exists: rs[0]!.supplierExists, rows: rs.length, new: rs.filter((r) => r.status === 'new').length, update: rs.filter((r) => r.status === 'update').length, same: rs.filter((r) => r.status === 'same').length, error: rs.filter((r) => r.status === 'error').length };
    }),
  };
}

export async function priceImport(trx: Db, tenantId: string, actor: string, input: PriceInput[]) {
  const pv = await pricePreview(trx, tenantId, input);
  const ok = pv.rows.filter((r) => r.status === 'new' || r.status === 'update');
  let createdSuppliers = 0;
  for (const s of pv.suppliers.filter((x) => !x.exists && ok.some((r) => r.supplierCode === x.code))) {
    await partnerRepository.upsert(trx, tenantId, { code: s.code, name: s.name || s.code }, 'supplier');
    createdSuppliers++;
  }
  // Ghi đè dòng giá mới nhất cùng NCC × mã × ĐVT (không ghi ngày hiệu lực) — chạy lại tệp mới là cập nhật.
  let added = 0, updated = 0;
  for (let i = 0; i < ok.length; i += 500) {
    const r = await saveSupplierProducts(trx, tenantId, actor, ok.slice(i, i + 500).map((x) => ({
      partnerCode: x.supplierCode, sku: x.sku, unit: x.unit, isDefaultUnit: false, nccSku: '', nccName: '', price: x.price, priceIncludesVat: false, warnPct: 2,
      validFrom: null, validTo: null, note: `Giá từ phiếu nhập${x.date ? ` ${x.date}` : ''} (dữ liệu khởi đầu)`, isActive: true,
    })));
    added += r.added; updated += r.updated;
  }
  return { added, updated, same: pv.rows.filter((r) => r.status === 'same').length, errors: pv.rows.filter((r) => r.status === 'error').length, createdSuppliers, skipped: pv.skipped };
}

/* ------------------------------------------------------------------ 2. cân tồn → phiếu điều chỉnh */

export const stockRowsSchema = z.object({
  rows: z.array(z.object({ row: z.number().int().optional(), kho: z.string().trim().max(64), sku: z.string().trim().max(64), name: z.string().trim().max(500).default(''), qty: z.number().finite().nullable().default(null) })).min(1).max(200000),
  /** Mã có tồn trên sổ ở kho đó mà tệp không có → cân về 0. */
  zeroMissing: z.boolean().default(true),
  docDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Chỉ ghi các kho này (trống = mọi kho có chênh lệch). */
  warehouses: z.array(z.string()).optional(),
  note: z.string().max(500).default(''),
});
type StockInput = z.infer<typeof stockRowsSchema>;

export interface ReconRow { kho: string; branchCode: string; warehouseCode: string; sku: string; name: string; unit: string; fileQty: number | null; bookQty: number; diff: number; status: 'up' | 'down' | 'same' | 'error'; error?: string; onlyBook?: boolean }

export async function reconcilePreview(trx: Db, tenantId: string, body: StockInput) {
  const resolve = await warehouseResolver(trx, tenantId);
  // Gộp dòng trùng kho × mã (cộng số lượng).
  const file = new Map<string, { kho: string; sku: string; name: string; qty: number }>();
  const errors: ReconRow[] = [];
  for (const r of body.rows) {
    if (!r.kho || !r.sku) continue;
    const k = `${r.kho.toUpperCase()}|${r.sku}`;
    const cur = file.get(k);
    file.set(k, { kho: r.kho, sku: r.sku, name: r.name || cur?.name || '', qty: (cur?.qty ?? 0) + (r.qty ?? 0) });
  }
  const groups = new Map<string, { ref: WhRef; items: { sku: string; name: string; qty: number; kho: string }[] }>();
  for (const f of file.values()) {
    const ref = resolve(f.kho);
    if (!ref) { errors.push({ kho: f.kho, branchCode: '', warehouseCode: '', sku: f.sku, name: f.name, unit: '', fileQty: f.qty, bookQty: 0, diff: 0, status: 'error', error: `Không có kho / chi nhánh "${f.kho}" trong danh mục kho (DM12)` }); continue; }
    const gk = `${ref.branchCode}|${ref.warehouseCode}`;
    (groups.get(gk) ?? groups.set(gk, { ref, items: [] }).get(gk)!).items.push(f);
  }
  const branchIds = new Map((await trx.selectFrom('branches').select(['id', 'code']).where('tenant_id', '=', tenantId).execute()).map((b) => [b.code, String(b.id)]));
  const defaults = new Map((await trx.selectFrom('warehouses as w').innerJoin('branches as b', 'b.id', 'w.branch_id').select(['b.code', 'w.code as wcode']).where('w.tenant_id', '=', tenantId).where('w.is_default', '=', true).execute()).map((x) => [x.code, x.wcode]));
  const rows: ReconRow[] = [...errors];
  const allSkus = [...new Set([...file.values()].map((f) => f.sku))];
  const prods = await knownProducts(trx, tenantId, allSkus);
  for (const { ref, items } of groups.values()) {
    const bid = branchIds.get(ref.branchCode)!;
    const isDefault = defaults.get(ref.branchCode) === ref.warehouseCode;
    // Tồn trên sổ của đúng kho (dòng không ghi kho tính vào kho mặc định của chi nhánh).
    // Kho mặc định nhận cả dòng không ghi kho hoặc ghi mã kho không thuộc chi nhánh (phiếu chuyển chép mã kho đầu đi).
    const others = (await trx.selectFrom('warehouses').select('code').where('tenant_id', '=', tenantId).where('branch_id', '=', bid).where('code', '<>', ref.warehouseCode).execute()).map((w) => w.code);
    const book = await trx.selectFrom('inventory_movements').select(['sku', sql<string>`SUM(qty)`.as('qty')]).where('tenant_id', '=', tenantId).where('branch_id', '=', bid)
      .where((eb) => (isDefault ? (others.length ? eb('warehouse_code', 'not in', others) : eb.val(true)) : eb('warehouse_code', '=', ref.warehouseCode))).groupBy('sku').execute();
    const bookOf = new Map(book.map((b) => [b.sku, toNumber(b.qty)]));
    const seen = new Set<string>();
    for (const it of items) {
      seen.add(it.sku);
      const p = prods.get(it.sku);
      const bq = r4(bookOf.get(it.sku) ?? 0), diff = r4(it.qty - bq);
      rows.push({ kho: it.kho, branchCode: ref.branchCode, warehouseCode: ref.warehouseCode, sku: it.sku, name: p?.name ?? it.name, unit: p?.unit ?? '', fileQty: it.qty, bookQty: bq, diff,
        status: !p ? 'error' : diff > 0 ? 'up' : diff < 0 ? 'down' : 'same', error: p ? undefined : 'Mã chưa có trong danh mục mặt hàng' });
    }
    if (body.zeroMissing) {
      const extra = [...bookOf.entries()].filter(([s, q]) => !seen.has(s) && Math.abs(q) > 1e-6).map(([s]) => s);
      const ep = await knownProducts(trx, tenantId, extra);
      for (const s of extra) {
        const bq = r4(bookOf.get(s)!);
        rows.push({ kho: items[0]!.kho, branchCode: ref.branchCode, warehouseCode: ref.warehouseCode, sku: s, name: ep.get(s)?.name ?? s, unit: ep.get(s)?.unit ?? '', fileQty: null, bookQty: bq, diff: -bq, status: bq > 0 ? 'down' : 'up', onlyBook: true });
      }
    }
  }
  const whs = [...groups.values()].map(({ ref }) => {
    const rs = rows.filter((r) => r.branchCode === ref.branchCode && r.warehouseCode === ref.warehouseCode);
    return { ...ref, kho: rs[0]?.kho ?? '', lines: rs.length, up: rs.filter((r) => r.status === 'up').length, down: rs.filter((r) => r.status === 'down').length, same: rs.filter((r) => r.status === 'same').length, errors: rs.filter((r) => r.status === 'error').length,
      qtyUp: r4(rs.filter((r) => r.status === 'up').reduce((s, r) => s + r.diff, 0)), qtyDown: r4(rs.filter((r) => r.status === 'down').reduce((s, r) => s + r.diff, 0)) };
  }).sort((a, b) => a.branchCode.localeCompare(b.branchCode) || a.warehouseCode.localeCompare(b.warehouseCode));
  return { rows, warehouses: whs, unknownKho: [...new Set(errors.map((e) => e.kho))] };
}

/** Ghi phiếu điều chỉnh: mỗi kho có chênh lệch một phiếu (dòng có dấu: + tăng, − giảm), ghi sổ ngay. */
export async function reconcileApply(trx: Db, auth: AuthContext, body: StockInput) {
  const pv = await reconcilePreview(trx, auth.tenantId, body);
  const pick = body.warehouses?.length ? new Set(body.warehouses) : null;
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(2, 14);
  const created: { branchCode: string; warehouseCode: string; docNo: string; lines: number; up: number; down: number }[] = [];
  for (const w of pv.warehouses) {
    const key = `${w.branchCode}|${w.warehouseCode}`;
    if (pick && !pick.has(key)) continue;
    const lines = pv.rows.filter((r) => r.branchCode === w.branchCode && r.warehouseCode === w.warehouseCode && (r.status === 'up' || r.status === 'down'));
    if (!lines.length) continue;
    for (let part = 0; part * 2000 < lines.length; part++) {
      const chunk = lines.slice(part * 2000, (part + 1) * 2000);
      // Số phiếu theo kho (tệp lớn gửi nhiều phần cùng giây vẫn không trùng): CT<thời điểm>-<mã kho>[-phần].
      const docNo = `CT${stamp}-${w.warehouseCode || w.branchCode}${part ? `-${part + 1}` : ''}`.slice(0, 64);
      const raw = {
        docType: 'stock_adjustment', direction: 'mixed', docKey: `khoi-dau:can-ton:${w.branchCode}:${w.warehouseCode}:${stamp}:${part}`, version: 1, branchCode: w.branchCode, docNo, docDate: body.docDate,
        description: body.note || `Cân tồn theo tệp tồn kho (dữ liệu khởi đầu) — kho ${w.warehouseCode}`, sourceSystem: 'erp',
        lines: chunk.map((l, i) => ({ lineKey: `L${i + 1}`, sku: l.sku, name: l.name, unit: l.unit, qty: l.diff, amount: 0, warehouseCode: w.warehouseCode })), totals: { total: 0 },
      };
      const parsed = ingestDocumentSchema.safeParse(raw);
      if (!parsed.success) throw Errors.validation(`Phiếu điều chỉnh kho ${w.warehouseCode} không đúng khuôn`, parsed.error.flatten());
      await postDocumentIn(trx, auth, parsed.data as IngestDocument, { post: true, force: true });
      created.push({ branchCode: w.branchCode, warehouseCode: w.warehouseCode, docNo, lines: chunk.length, up: chunk.filter((l) => l.diff > 0).length, down: chunk.filter((l) => l.diff < 0).length });
    }
  }
  return { created, errors: pv.rows.filter((r) => r.status === 'error').length };
}

/* ------------------------------------------------------------------ 3. tồn max */

export const maxRowsSchema = z.object({
  rows: z.array(z.object({ row: z.number().int().optional(), kho: z.string().trim().max(64), sku: z.string().trim().max(64), name: z.string().trim().max(500).default(''), max: z.number().finite().nullable().default(null) })).min(1).max(200000),
});
type MaxInput = z.infer<typeof maxRowsSchema>['rows'];

export async function maxPreview(trx: Db, tenantId: string, input: MaxInput) {
  const resolve = await warehouseResolver(trx, tenantId);
  const map = new Map<string, { kho: string; sku: string; name: string; max: number; row?: number }>();
  for (const r of input) if (r.kho && r.sku) map.set(`${r.kho.toUpperCase()}|${r.sku}`, { kho: r.kho, sku: r.sku, name: r.name, max: Math.max(0, r.max ?? 0), row: r.row });
  const list = [...map.values()];
  const prods = await knownProducts(trx, tenantId, list.map((x) => x.sku));
  const refs = list.map((x) => resolve(x.kho));
  const branchCodes = [...new Set(refs.filter(Boolean).map((r) => r!.branchCode))];
  const cur = await listLevels(trx, tenantId, { branchCodes, skus: [...new Set(list.map((x) => x.sku))] });
  const rows = list.map((x, i) => {
    const ref = refs[i];
    const p = prods.get(x.sku);
    const old = ref ? cur.find((c) => c.branchCode === ref.branchCode && c.warehouseCode === ref.warehouseCode && c.sku === x.sku) : undefined;
    const error = !ref ? `Không có kho / chi nhánh "${x.kho}"` : !p ? 'Mã chưa có trong danh mục mặt hàng' : undefined;
    return { kho: x.kho, branchCode: ref?.branchCode ?? '', warehouseCode: ref?.warehouseCode ?? '', sku: x.sku, name: p?.name ?? x.name, max: x.max, oldMax: old?.max ?? null,
      status: error ? 'error' as const : old === undefined ? 'new' as const : Math.abs(old.max - x.max) < 1e-6 ? 'same' as const : 'update' as const, error };
  });
  return { rows, new: rows.filter((r) => r.status === 'new').length, update: rows.filter((r) => r.status === 'update').length, same: rows.filter((r) => r.status === 'same').length, errors: rows.filter((r) => r.status === 'error').length };
}

export async function maxImport(trx: Db, tenantId: string, actor: string, input: MaxInput) {
  const pv = await maxPreview(trx, tenantId, input);
  const ok = pv.rows.filter((r) => r.status === 'new' || r.status === 'update');
  let saved = 0;
  for (let i = 0; i < ok.length; i += 2000) saved += (await saveLevels(trx, tenantId, actor, ok.slice(i, i + 2000).map((r) => ({ branchCode: r.branchCode, warehouseCode: r.warehouseCode, sku: r.sku, max: r.max, min: 0, note: 'Dữ liệu khởi đầu' })), 'import')).saved;
  return { saved, same: pv.same, errors: pv.errors };
}
