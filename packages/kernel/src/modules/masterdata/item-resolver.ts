// @bizcity-layer K kernel/masterdata
// [2026-11-03 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — B2a (S024-6, D024-1 / 8, R-ITEM-1 / 5 / 6): Item Resolver — mã (hoặc itemId) tại một ngày → item_id + phân loại hiệu lực
/**
 * ITEM RESOLVER. Một cửa tra mặt hàng cho tiền kiểm, định khoản, báo cáo: (mã hoặc itemId, ngày) → `item_id`, mã hiệu lực, phân loại tại
 * ngày, đơn vị quy đổi. CHỈ ĐỌC. Thứ tự thử: itemId → sku (và bí danh) → barcode → mã ngoài.
 *
 *   - itemId phải thuộc đơn vị (IN-ITEM-008);
 *   - mã tra theo hiệu lực tại `asOf`: có mã nhưng không hiệu lực ngày đó → IN-ITEM-002 (nêu các khoảng), chưa có mã → IN-ITEM-001;
 *   - mã là bí danh (gộp mã, D024-8) → trả mặt hàng đích kèm `alias.fromCode`;
 *   - phân loại lấy bản có valid_from ≤ asOf < valid_to; không có bản hoặc kind null → `unclassified` (R-ITEM-8).
 * `resolveItems` gom MỘT truy vấn cho cả chứng từ (2.000 dòng không tra 2.000 lần). Đệm theo phiên bản danh mục: khi có bảng items làm
 * nguồn chính (B2b) — hiện mỗi lần gọi đọc CSDL (B2a chưa nằm trên đường nóng).
 */
import { sql } from 'kysely';
import type { Db } from '@bizcity/platform/db/client';
import { isItemId, type ItemClassificationInfo, type ItemCodeInfo, type ItemCodeKind, type ItemKind, type ItemRef, type ItemStatus, type ResolveFailure, type ResolveResult } from '@ketoan/contracts';

interface CodeRow { item_id: string; kind: string; code: string; valid_from: string; valid_to: string | null }
const day = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const toCode = (r: CodeRow): ItemCodeInfo => ({ kind: r.kind as ItemCodeKind, code: r.code, validFrom: day(r.valid_from), validTo: r.valid_to ? day(r.valid_to) : null });
const validAt = (r: CodeRow, asOf: string) => day(r.valid_from) <= asOf && (!r.valid_to || asOf < day(r.valid_to));
const ranges = (rows: CodeRow[]) => rows.map((r) => `${day(r.valid_from)} → ${r.valid_to ? day(r.valid_to) : 'nay'}`).join('; ');

/** Khoá tra của một ref: [loại mã, mã]; itemId xử lý riêng. */
function lookupKey(ref: ItemRef): { kinds: string[]; code: string } | null {
  if (ref.sku?.trim()) return { kinds: ['sku', 'alias'], code: ref.sku.trim() };
  if (ref.barcode?.trim()) return { kinds: ['barcode'], code: ref.barcode.trim() };
  if (ref.external?.code?.trim() && ref.external.source?.trim()) return { kinds: [`external:${ref.external.source.trim()}`], code: ref.external.code.trim() };
  return null;
}

/** Tra nhiều tham chiếu tại cùng một ngày (YYYY-MM-DD). Kết quả cùng thứ tự `refs`. */
export async function resolveItems(trx: Db, tenantId: string, refs: readonly ItemRef[], asOf: string): Promise<ResolveResult[]> {
  const ids = [...new Set(refs.map((r) => r.itemId).filter((v): v is string => isItemId(v)))];
  const keys = refs.map((r) => (r.itemId ? null : lookupKey(r)));
  const codes = [...new Set(keys.filter((k): k is NonNullable<typeof k> => k !== null).map((k) => k.code))];

  const byCode = new Map<string, CodeRow[]>();
  if (codes.length) {
    const rows = await trx.selectFrom('item_codes').select(['item_id', 'kind', 'code', 'valid_from', 'valid_to']).where('tenant_id', '=', tenantId).where('code', 'in', codes).execute() as unknown as CodeRow[];
    for (const r of rows) byCode.set(r.code, [...(byCode.get(r.code) ?? []), r]);
  }
  // mặt hàng cần đọc: theo itemId, và theo mã tìm được
  const hit = (ref: ItemRef, k: { kinds: string[]; code: string } | null): { row?: CodeRow; all: CodeRow[] } => {
    if (!k) return { all: [] };
    const all = (byCode.get(k.code) ?? []).filter((r) => k.kinds.includes(r.kind));
    const valid = all.filter((r) => validAt(r, asOf));
    // sku trước bí danh
    return { row: valid.find((r) => r.kind === 'sku') ?? valid[0], all };
  };
  const wanted = new Set(ids);
  refs.forEach((ref, i) => { const h = hit(ref, keys[i] ?? null); if (h.row) wanted.add(h.row.item_id); });
  // [2026-11-05 01:10 PM Nguyễn Văn Thủy] PHASE-026 — S026-19: mã trỏ mặt hàng đã gộp → đi theo chuỗi gộp tại ngày, gộp mấy lần cũng ra mặt hàng đang có hiệu lực (đóng góp)
  const walked = new Map<string, string>();
  if (wanted.size) {
    const w = await sql<{ item_id: string; cur: string }>`SELECT i.item_id, bizcity_item_walk(i.item_id, ${asOf}::date) AS cur FROM items i WHERE i.tenant_id = ${tenantId} AND i.item_id IN (${sql.join([...wanted])})`.execute(trx);
    for (const r of w.rows) { walked.set(r.item_id, r.cur); wanted.add(r.cur); }
  }
  const currentOf = (id: string) => walked.get(id) ?? id;

  const items = wanted.size
    ? await trx.selectFrom('items').select(['item_id', 'name', 'unit_base', 'status']).where('tenant_id', '=', tenantId).where('item_id', 'in', [...wanted]).execute()
    : [];
  const itemById = new Map(items.map((r) => [r.item_id, r]));
  const cls = wanted.size
    ? await trx.selectFrom('item_classification').selectAll().where('tenant_id', '=', tenantId).where('item_id', 'in', [...wanted])
      .where('valid_from', '<=', asOf as never).where((eb) => eb.or([eb('valid_to', 'is', null), eb('valid_to', '>', asOf as never)])).execute()
    : [];
  const clsByItem = new Map(cls.map((r) => [r.item_id, r]));
  // mã sku hiệu lực của mỗi mặt hàng (để trả `code` khi tra bằng itemId, và để lấy đơn vị quy đổi)
  const skuRows = wanted.size
    ? await trx.selectFrom('item_codes').select(['item_id', 'kind', 'code', 'valid_from', 'valid_to']).where('tenant_id', '=', tenantId).where('kind', '=', 'sku').where('item_id', 'in', [...wanted]).execute() as unknown as CodeRow[]
    : [];
  const skuByItem = new Map<string, CodeRow[]>();
  for (const r of skuRows) skuByItem.set(r.item_id, [...(skuByItem.get(r.item_id) ?? []), r]);
  const skuAt = (itemId: string): CodeRow | undefined => {
    const list = skuByItem.get(itemId) ?? [];
    return list.find((r) => validAt(r, asOf)) ?? [...list].sort((a, b) => day(b.valid_from).localeCompare(day(a.valid_from)))[0];
  };
  // [2026-11-05 01:10 PM Nguyễn Văn Thủy] PHASE-026 — S026-19: đơn vị quy đổi đọc theo định danh, mã tại ngày cũ vẫn ra đúng đơn vị (đóng góp)
  const unitRows = wanted.size
    ? await sql<{ item_id: string; unit: string; ratio: string }>`SELECT item_id, unit, ratio FROM product_units WHERE tenant_id = ${tenantId} AND item_id IN (${sql.join([...wanted])})`.execute(trx)
    : { rows: [] as { item_id: string; unit: string; ratio: string }[] };
  const unitsByItem = new Map<string, Record<string, number>>();
  for (const u of unitRows.rows) unitsByItem.set(u.item_id, { ...(unitsByItem.get(u.item_id) ?? {}), [u.unit]: Number(u.ratio) });

  const build = (itemId: string, code: ItemCodeInfo, alias?: string): ResolveResult => {
    const it = itemById.get(itemId)!;
    const c = clsByItem.get(itemId);
    const classification: ItemClassificationInfo | null = c
      ? { validFrom: day(c.valid_from), validTo: c.valid_to ? day(c.valid_to) : null, kind: (c.kind as ItemKind | null) ?? null, postingGroupCode: c.posting_group_code, taxOutCode: c.tax_out_code, taxInCode: c.tax_in_code, exciseRate: c.excise_rate === null ? null : Number(c.excise_rate), track: c.track ?? [] }
      : null;
    const units = { ...(it.unit_base ? { [it.unit_base]: 1 } : {}), ...(unitsByItem.get(itemId) ?? {}) };
    return { ok: true, itemId, name: it.name, unitBase: it.unit_base, status: it.status as ItemStatus, code, classification, unclassified: !classification || classification.kind === null, units, ...(alias ? { alias: { fromCode: alias } } : {}) };
  };
  const fail = (ref: ItemRef, code: ResolveFailure['code'], detail: string): ResolveFailure => ({ ok: false, code, detail, ref });

  return refs.map((ref, i): ResolveResult => {
    if (ref.itemId) {
      if (!isItemId(ref.itemId) || !itemById.has(ref.itemId)) return fail(ref, 'IN-ITEM-008', `itemId ${ref.itemId} không thuộc đơn vị này`);
      const cur = currentOf(ref.itemId);
      const sku = skuAt(cur);
      return build(cur, sku ? toCode(sku) : { kind: 'sku', code: '', validFrom: '1970-01-01', validTo: null });
    }
    const k = keys[i];
    if (!k) return fail(ref, 'IN-ITEM-001', 'Không có mã, mã vạch hay itemId để tra');
    const h = hit(ref, k);
    if (h.row) {
      const cur = currentOf(h.row.item_id);
      // Mã đã gộp: trả mã hiện hành của mặt hàng đích, giữ dấu mã đã gửi ở alias.
      if (cur !== h.row.item_id) { const s = skuAt(cur); return build(cur, s ? toCode(s) : toCode(h.row), h.row.code); }
      return build(h.row.item_id, toCode(h.row), h.row.kind === 'alias' ? h.row.code : undefined);
    }
    if (h.all.length) return fail(ref, 'IN-ITEM-002', `Mã ${k.code} không có hiệu lực ngày ${asOf} (hiệu lực: ${ranges(h.all)})`);
    return fail(ref, 'IN-ITEM-001', `Mã ${k.code} chưa có trong danh mục`);
  });
}

export async function resolveItem(trx: Db, tenantId: string, ref: ItemRef, asOf: string): Promise<ResolveResult> {
  return (await resolveItems(trx, tenantId, [ref], asOf))[0]!;
}
