// @bizcity-layer K kernel/masterdata
// [2026-11-08 06:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — S029-19 đợt 1: resolveEntity trả thêm thuộc tính hiệu lực tại ngày (tên, MST, địa chỉ) kèm phiên bản
// [2026-11-08 01:49 PM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-4 (D026-3): Entity Resolver — (mã hoặc id, ngày) → định danh thực thể + mã hiệu lực, cho đối tượng / chi nhánh / kho
/**
 * ENTITY RESOLVER. Theo khuôn `resolveItem`: (loại thực thể, tham chiếu, ngày) → `entityId` bất biến và mã hiệu lực tại ngày.
 * CHỈ ĐỌC. Thứ tự thử: id → mã chính + bí danh → mã ngoài.
 *
 *   - id phải thuộc đơn vị (bảng thực thể là nguồn sự thật cho "có thật"), không thì ENTITY_NOT_FOUND;
 *   - mã tra theo hiệu lực tại `asOf`; có mã nhưng không hiệu lực ngày đó → ENTITY_CODE_NOT_VALID_AT_DATE (nêu các khoảng);
 *   - chưa từng có mã → ENTITY_NOT_FOUND. Mã cũ của thực thể đã đổi mã vẫn ra đúng thực thể ở ngày mã đó còn hiệu lực.
 * `resolveEntities` gom hai truy vấn cho cả chứng từ.
 */
import { sql } from 'kysely';
import type { Db } from '@bizcity/platform/db/client';
import type { EntityAttributesInfo, EntityCodeInfo, EntityCodeKind, EntityRef, EntityResolveResult, EntityType } from '@ketoan/contracts';

interface AttrRow { id: string; entity_id: string; version: number; name: string; tax_code: string | null; address: string | null; valid_from: unknown; valid_to: unknown }
interface CodeRow { entity_id: string; kind: string; code: string; valid_from: unknown; valid_to: unknown }
const day = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const toInfo = (r: CodeRow): EntityCodeInfo => ({ kind: r.kind as EntityCodeKind, code: r.code, validFrom: day(r.valid_from), validTo: r.valid_to ? day(r.valid_to) : null });
const validAt = (r: CodeRow, asOf: string) => day(r.valid_from) <= asOf && (!r.valid_to || asOf < day(r.valid_to));
const ranges = (rows: CodeRow[]) => rows.map((r) => `${day(r.valid_from)} → ${r.valid_to ? day(r.valid_to) : 'nay'}`).join('; ');
const TABLE: Record<EntityType, 'partners' | 'branches' | 'warehouses'> = { partner: 'partners', branch: 'branches', warehouse: 'warehouses' };

const toAttr = (r: AttrRow): EntityAttributesInfo => ({ attributeId: r.id, version: Number(r.version), name: r.name, taxCode: r.tax_code, address: r.address, validFrom: day(r.valid_from), validTo: r.valid_to ? day(r.valid_to) : null });
function attrAt(list: AttrRow[] | undefined, asOf: string): EntityAttributesInfo | null {
  if (!list?.length) return null;
  const sorted = [...list].sort((a, b) => Number(a.version) - Number(b.version));
  const hit = [...sorted].reverse().find((r) => day(r.valid_from) <= asOf && (!r.valid_to || asOf < day(r.valid_to)));
  if (hit) return toAttr(hit);
  return toAttr(asOf < day(sorted[0]!.valid_from) ? sorted[0]! : sorted[sorted.length - 1]!);
}

/** Khoá tra của một ref theo mã: [các loại mã, mã]. id xử lý riêng. */
function lookupKey(ref: EntityRef): { kinds: string[]; code: string } | null {
  if (ref.code?.trim()) return { kinds: ['code', 'alias'], code: ref.code.trim() };
  if (ref.external?.code?.trim() && ref.external.source?.trim()) return { kinds: [`external:${ref.external.source.trim()}`], code: ref.external.code.trim() };
  return null;
}

/** Tra nhiều tham chiếu cùng loại tại cùng một ngày (YYYY-MM-DD). Kết quả cùng thứ tự `refs`. */
export async function resolveEntities(trx: Db, tenantId: string, type: EntityType, refs: readonly EntityRef[], asOf: string): Promise<EntityResolveResult[]> {
  const ids = [...new Set(refs.map((r) => r.id).filter((v): v is string => typeof v === 'string' && /^\d+$/.test(v)))];
  const keys = refs.map((r) => (r.id ? null : lookupKey(r)));
  const codes = [...new Set(keys.filter((k): k is NonNullable<typeof k> => k !== null).map((k) => k.code))];

  const byCode = new Map<string, CodeRow[]>();
  if (codes.length) {
    const rows = (await sql<CodeRow>`
      SELECT entity_id::text AS entity_id, kind, code, valid_from, valid_to FROM entity_codes
       WHERE tenant_id = ${tenantId} AND entity_type = ${type} AND code IN (${sql.join(codes)})`.execute(trx)).rows;
    for (const r of rows) byCode.set(r.code, [...(byCode.get(r.code) ?? []), r]);
  }
  const hit = (k: { kinds: string[]; code: string } | null): { row?: CodeRow; all: CodeRow[] } => {
    if (!k) return { all: [] };
    const all = (byCode.get(k.code) ?? []).filter((r) => k.kinds.includes(r.kind));
    const valid = all.filter((r) => validAt(r, asOf));
    return { row: valid.find((r) => r.kind === 'code') ?? valid[0], all };
  };

  const wanted = new Set(ids);
  refs.forEach((_, i) => { const h = hit(keys[i] ?? null); if (h.row) wanted.add(h.row.entity_id); });

  // id có thật trong bảng thực thể của đơn vị (id không thuộc đơn vị → không tra được)
  const real = new Set<string>();
  if (ids.length) {
    const r = await sql<{ id: string }>`SELECT id::text AS id FROM ${sql.table(TABLE[type])} WHERE tenant_id = ${tenantId} AND id IN (${sql.join(ids.map((v) => sql`${v}::bigint`))})`.execute(trx);
    for (const x of r.rows) real.add(x.id);
  }
  // mã chính của mỗi thực thể: hiệu lực tại ngày; không có thì mã gần nhất (thực thể đã xoá / đóng mã trước ngày đó)
  const mainByEntity = new Map<string, CodeRow[]>();
  if (wanted.size) {
    const r = (await sql<CodeRow>`
      SELECT entity_id::text AS entity_id, kind, code, valid_from, valid_to FROM entity_codes
       WHERE tenant_id = ${tenantId} AND entity_type = ${type} AND kind = 'code' AND entity_id IN (${sql.join([...wanted].map((v) => sql`${v}::bigint`))})`.execute(trx)).rows;
    for (const x of r) mainByEntity.set(x.entity_id, [...(mainByEntity.get(x.entity_id) ?? []), x]);
  }
  const attrsByEntity = new Map<string, AttrRow[]>();
  if (wanted.size) {
    const r = (await sql<AttrRow>`
      SELECT id::text AS id, entity_id::text AS entity_id, version, name, tax_code, address, valid_from, valid_to FROM entity_attributes
       WHERE tenant_id = ${tenantId} AND entity_type = ${type} AND entity_id IN (${sql.join([...wanted].map((v) => sql`${v}::bigint`))})`.execute(trx)).rows;
    for (const x of r) attrsByEntity.set(x.entity_id, [...(attrsByEntity.get(x.entity_id) ?? []), x]);
  }
  const mainAt = (entityId: string): CodeInfoOrNull => {
    const list = mainByEntity.get(entityId) ?? [];
    const row = list.find((r) => validAt(r, asOf)) ?? [...list].sort((a, b) => day(b.valid_from).localeCompare(day(a.valid_from)))[0];
    return row ? toInfo(row) : null;
  };

  return refs.map((ref, i): EntityResolveResult => {
    if (ref.id) {
      if (!real.has(ref.id)) return { ok: false, code: 'ENTITY_NOT_FOUND', detail: `${type} ${ref.id} không thuộc đơn vị này`, ref };
      return { ok: true, type, entityId: ref.id, code: mainAt(ref.id), attributes: attrAt(attrsByEntity.get(ref.id), asOf) };
    }
    const k = keys[i];
    if (!k) return { ok: false, code: 'ENTITY_REF_EMPTY', detail: 'Không có id, mã hay mã ngoài để tra', ref };
    const h = hit(k);
    if (h.row) {
      const matched = h.row.kind === 'code' ? undefined : toInfo(h.row);
      return { ok: true, type, entityId: h.row.entity_id, code: mainAt(h.row.entity_id), attributes: attrAt(attrsByEntity.get(h.row.entity_id), asOf), ...(matched ? { matched } : {}) };
    }
    if (h.all.length) return { ok: false, code: 'ENTITY_CODE_NOT_VALID_AT_DATE', detail: `Mã ${k.code} không có hiệu lực ngày ${asOf} (hiệu lực: ${ranges(h.all)})`, ref };
    return { ok: false, code: 'ENTITY_NOT_FOUND', detail: `Mã ${k.code} chưa có trong danh mục ${type}`, ref };
  });
}

type CodeInfoOrNull = EntityCodeInfo | null;

export async function resolveEntity(trx: Db, tenantId: string, type: EntityType, ref: EntityRef, asOf: string): Promise<EntityResolveResult> {
  return (await resolveEntities(trx, tenantId, type, [ref], asOf))[0]!;
}
