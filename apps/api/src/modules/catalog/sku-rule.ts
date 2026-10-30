// @bizcity-layer M data/masterdata
/**
 * Quy tắc sinh MÃ HÀNG từ nhóm hàng (giống phần mềm kế toán cũ của công ty — quy tắc "3 cấp nhóm + số thứ tự").
 *
 *   mã hàng = mã SKU nhóm cấp 1 + mã SKU nhóm cấp 2 + mã SKU nhóm cấp 3 + số thứ tự (đệm 0)
 *
 * "Cấp 1" là nhóm không có cha (ngành hàng: Sữa bột, Bỉm/tã…). Cây nào có thêm một nút gốc chung tên "Nhóm hàng" thì
 * nút đó không tính (cấp 0). Ví dụ 110063101 — Abbott Grow Gold 3+:
 *   11  Sữa bột (cấp 1) · 006 Sữa bột ABBOTT (cấp 2) · 3 Sữa công thức trẻ em (cấp 3) · 101 số thứ tự.
 * Mặt hàng gắn nhóm sâu hơn cấp 3 thì lấy theo nhóm tổ tiên ở cấp 3. Số thứ tự = số lớn nhất đang có của các mã cùng
 * tiền tố + 1 (mã đủ 9 ký tự). Quy tắc mã hàng: cấp 1 = ngành (2 ký tự; quà khuyến mại là "Q"), cấp 2 = nhãn
 * (3), cấp 3 = nhóm sản phẩm (1); quà khuyến mại số thứ tự 4 ký tự. Mã SKU của nhóm khai ở Phân loại hàng hoá
 * (item_classes.sku_code); chưa khai thì nextSku tự suy từ mã hàng đang có / tự cấp số kế tiếp và ghi lại.
 *
 * Muốn đổi quy tắc (số cấp, độ dài từng đoạn, độ dài số thứ tự): sửa SKU_RULE — mọi chỗ khác đọc từ đây.
 */
import { sql } from 'kysely';
import type { Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';

export const SKU_RULE = {
  /** Số cấp nhóm ghép vào mã (tính từ cấp 1). */
  levels: 3,
  /** Độ dài mã SKU thường gặp của từng cấp — chỉ dùng khi suy mã SKU nhóm từ mã hàng đang có. */
  segmentLengths: [2, 3, 1],
  /** Độ dài số thứ tự cuối mã. */
  seqLength: 3,
} as const;

interface GroupNode { code: string; name: string; parent_code: string | null; sku_code: string }

async function loadGroups(trx: Db, tenantId: string): Promise<Map<string, GroupNode>> {
  const rows = await trx.selectFrom('item_classes').select(['code', 'name', 'parent_code', 'sku_code']).where('tenant_id', '=', tenantId).where('kind', '=', 'group').execute();
  return new Map(rows.map((r) => [r.code, r]));
}

/** Nút gốc chung (chỉ để chứa cây, không mang mã SKU). */
const isContainerRoot = (g: GroupNode) => !g.parent_code && /^nhóm hàng$/i.test(g.name.trim());

/** Chuỗi nhóm từ cấp 1 xuống nhóm đang xét (bỏ nút gốc chung nếu có). */
function chainOf(groups: Map<string, GroupNode>, code: string): GroupNode[] {
  const up: GroupNode[] = [];
  const seen = new Set<string>();
  let cur = groups.get(code);
  while (cur && !seen.has(cur.code)) {
    seen.add(cur.code);
    up.push(cur);
    cur = cur.parent_code ? groups.get(cur.parent_code) : undefined;
  }
  up.reverse(); // gốc → lá
  return up.length && isContainerRoot(up[0]!) ? up.slice(1) : up;
}

export interface SkuPreview {
  prefix: string; sku: string; next: number;
  segments: { level: number; code: string; name: string; skuCode: string; source: 'declared' | 'inferred' | 'new' }[];
  /** Ngành (nhóm cấp 1) và nhãn (nhóm cấp 2) của mặt hàng — theo cây nhóm (mã trùng mã nhóm), để form tự điền. */
  industryCode: string; brandCode: string;
}

/** Quà khuyến mại: ngành là chữ ("Q") → độ dài từng đoạn và số thứ tự khác hàng thường (quy tắc mã hàng). */
const lensFor = (level1: string) => (/^[A-Za-z]/.test(level1) ? { seg: [1, 3, 1], seq: 4 } : { seg: [...SKU_RULE.segmentLengths], seq: SKU_RULE.seqLength });
const TOTAL = 9;

/**
 * Mã SKU của một nhóm (cấp 1..3) khi chưa khai — để "Sinh mã" luôn chạy được mà không bắt khai tay từng nhóm:
 *   1. suy từ mã hàng đang có dưới nhóm (đoạn ký tự đúng vị trí của cấp, giá trị gặp nhiều nhất);
 *   2. nhóm mới chưa có mặt hàng: số kế tiếp sau mọi số đã dùng ở cấp đó (đệm 0 theo độ dài đoạn) — gồm mã SKU đã khai
 *      của các nhóm cùng cha VÀ đoạn mã đang có trong mã hàng cùng tiền tố cấp trên (nhóm cũ chưa khai mã SKU vẫn
 *      đang "giữ" số của mình trong mã hàng). Số kế tiếp vượt độ dài đoạn thì lấy số trống nhỏ nhất.
 * Mã tìm được ghi lại vào item_classes.sku_code (lần sau dùng luôn, sửa được ở Phân loại hàng hoá → Nhóm hàng).
 * prefix: đoạn mã các cấp trên đã có (cấp 1: rỗng).
 */
async function codeOf(trx: Db, tenantId: string, groups: Map<string, GroupNode>, chain: GroupNode[], i: number, offset: number, len: number, prefix = ''): Promise<{ code: string; source: 'declared' | 'inferred' | 'new' }> {
  const g = chain[i]!;
  if (g.sku_code) return { code: g.sku_code, source: 'declared' };
  // Mọi nhóm con cháu của g (gồm g).
  const under = new Set([g.code]);
  for (let grew = true; grew;) { grew = false; for (const x of groups.values()) if (x.parent_code && under.has(x.parent_code) && !under.has(x.code)) { under.add(x.code); grew = true; } }
  const rows = await trx.selectFrom('products').select('sku').where('tenant_id', '=', tenantId).where('group_code', 'in', [...under]).execute();
  const votes = new Map<string, number>();
  for (const r of rows) {
    if (r.sku.length !== TOTAL) continue;
    // Cấp 1 của quà khuyến mại là một chữ ("Q"), hàng thường là 2 số.
    const seg = i === 0 && /^[A-Za-z]/.test(r.sku) ? r.sku[0]! : r.sku.slice(offset, offset + len);
    if (seg.length === len || (i === 0 && seg.length === 1)) votes.set(seg, (votes.get(seg) ?? 0) + 1);
  }
  let code = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
  let source: 'inferred' | 'new' = 'inferred';
  if (!code) {
    source = 'new';
    const used = new Set([...groups.values()].filter((x) => x.parent_code === g.parent_code && x.code !== g.code && x.sku_code && /^\d+$/.test(x.sku_code)).map((x) => Number(x.sku_code)));
    const inSkus = await sql<{ seg: string }>`
      SELECT DISTINCT substr(sku, ${offset + 1}, ${len}) AS seg FROM products
       WHERE tenant_id = ${tenantId} AND length(sku) = ${TOTAL} AND left(sku, ${prefix.length}) = ${prefix} AND substr(sku, ${offset + 1}, ${len}) ~ '^[0-9]+$'`.execute(trx);
    for (const r of inSkus.rows) used.add(Number(r.seg));
    const max = 10 ** len - 1;
    let n = (used.size ? Math.max(...used) : 0) + 1;
    if (n > max) { n = 1; while (n <= max && used.has(n)) n++; }
    if (n > max) throw Errors.conflict(`Các nhóm cùng cấp với "${g.name}" đã dùng hết mã ${len} ký tự — khai mã SKU nhóm ở Phân loại hàng hoá → Nhóm hàng`);
    code = String(n).padStart(len, '0');
  }
  await trx.updateTable('item_classes').set({ sku_code: code, updated_at: new Date() }).where('tenant_id', '=', tenantId).where('kind', '=', 'group').where('code', '=', g.code).where('sku_code', '=', '').execute();
  g.sku_code = code;
  return { code, source };
}

/** Mã hàng kế tiếp cho nhóm hàng (nhóm cấp 3): ngành + nhãn + nhóm + số thứ tự; mã SKU nhóm chưa khai thì tự suy / tự cấp. */
export async function nextSku(trx: Db, tenantId: string, groupCode: string): Promise<SkuPreview> {
  const groups = await loadGroups(trx, tenantId);
  if (!groups.has(groupCode)) throw Errors.validation(`Nhóm hàng ${groupCode} chưa có`);
  const chain = chainOf(groups, groupCode).slice(0, SKU_RULE.levels);
  if (chain.length < SKU_RULE.levels) {
    const lv = ['ngành hàng', 'nhãn hàng', 'nhóm sản phẩm'];
    throw Errors.validation(`Chọn tới nhóm sản phẩm (cấp 3: ngành → nhãn → nhóm) để sinh mã — đang chọn ${lv[chain.length - 1] ?? 'nhóm'} "${chain.at(-1)?.name ?? ''}"`);
  }
  const first = await codeOf(trx, tenantId, groups, chain, 0, 0, 2);
  const lens = lensFor(first.code);
  const segs: SkuPreview['segments'] = [];
  let offset = 0;
  for (let i = 0; i < chain.length; i++) {
    const r = i === 0 ? first : await codeOf(trx, tenantId, groups, chain, i, offset, lens.seg[i]!, segs.map((x) => x.skuCode).join(''));
    segs.push({ level: i + 1, code: chain[i]!.code, name: chain[i]!.name, skuCode: r.code, source: r.source });
    offset += r.code.length;
  }
  const prefix = segs.map((x) => x.skuCode).join('');
  const seqLen = prefix.length < TOTAL ? TOTAL - prefix.length : lens.seq;
  const pattern = `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[0-9]{${seqLen}}$`;
  const row = await sql<{ n: string | null }>`
    SELECT MAX(right(sku, ${seqLen})::int)::text AS n FROM products
     WHERE tenant_id = ${tenantId} AND sku ~ ${pattern}`.execute(trx);
  const next = Number(row.rows[0]?.n ?? 0) + 1;
  if (String(next).length > seqLen) throw Errors.conflict(`Tiền tố ${prefix} đã hết số thứ tự (${seqLen} chữ số)`);
  return { prefix, next, sku: prefix + String(next).padStart(seqLen, '0'), segments: segs, industryCode: chain[0]!.code, brandCode: chain[1]!.code };
}

export interface InferResult { code: string; name: string; level: number; skuCode: string; votes: number; total: number }

/**
 * Suy mã SKU cho các nhóm cấp 1..3 CHƯA khai, từ mã hàng đang có dưới nhóm đó: lấy đoạn ký tự đúng vị trí của cấp
 * (theo SKU_RULE.segmentLengths), chọn giá trị xuất hiện nhiều nhất. Chỉ xét mã hàng toàn chữ số đúng độ dài chuẩn.
 * apply = false: chỉ xem trước.
 */
export async function inferSkuCodes(trx: Db, tenantId: string, apply: boolean): Promise<InferResult[]> {
  const groups = await loadGroups(trx, tenantId);
  const products = await trx.selectFrom('products').select(['sku', 'group_code']).where('tenant_id', '=', tenantId).where('group_code', 'is not', null).execute();
  const fullLen = SKU_RULE.segmentLengths.reduce((s, n) => s + n, 0) + SKU_RULE.seqLength;
  const votes = new Map<string, Map<string, number>>(); // mã nhóm → (đoạn mã → số phiếu)
  for (const p of products) {
    if (p.sku.length !== fullLen || !/^\d+$/.test(p.sku)) continue;
    const chain = chainOf(groups, p.group_code!).slice(0, SKU_RULE.levels);
    let offset = 0;
    chain.forEach((g, i) => {
      const len = SKU_RULE.segmentLengths[i]!;
      const seg = p.sku.slice(offset, offset + len);
      offset += len;
      const m = votes.get(g.code) ?? new Map<string, number>();
      m.set(seg, (m.get(seg) ?? 0) + 1);
      votes.set(g.code, m);
    });
  }
  const out: InferResult[] = [];
  for (const [code, m] of votes) {
    const g = groups.get(code)!;
    if (g.sku_code) continue;
    const total = [...m.values()].reduce((s, n) => s + n, 0);
    const [skuCode, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0]!;
    out.push({ code, name: g.name, level: chainOf(groups, code).length, skuCode, votes: n, total });
  }
  out.sort((a, b) => a.level - b.level || a.code.localeCompare(b.code));
  if (apply) {
    for (const r of out) {
      await trx.updateTable('item_classes').set({ sku_code: r.skuCode, updated_at: new Date() })
        .where('tenant_id', '=', tenantId).where('kind', '=', 'group').where('code', '=', r.code).where('sku_code', '=', '').execute();
    }
  }
  return out;
}
