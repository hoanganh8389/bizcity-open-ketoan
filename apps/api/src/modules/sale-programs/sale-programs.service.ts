// @bizcity-layer D modules/ban-hang
// [2026-11-10 03:00 PM Nguyễn Văn Thủy] PHASE-026 — chương trình bán có thời gian + hạn mức theo cửa hàng, thay mã phụ (đóng góp)
/**
 * CHƯƠNG TRÌNH BÁN CÓ HẠN MỨC (migration 0096, docs/nghiep-vu/15 §6).
 *
 * Hàng tặng / hàng giảm giá (kể cả cận date) VẪN LÀ mặt hàng chính — không sinh mã phụ. Thay vào đó:
 *   - chương trình: mặt hàng chính, kiểu (tặng hàng / giảm giá), thời gian, loại chương trình (để định khoản theo quy tắc);
 *   - hạn mức theo cửa hàng: số quà được tặng / số được bán giá giảm;
 *   - lượt dùng: mỗi dòng bán theo chương trình một lượt (trừ hạn mức có khoá dòng — hai máy POS không trừ trùng món cuối);
 *     huỷ phiếu thì trả lại hạn mức. Báo cáo quà tặng / hàng giảm giá tính từ lượt dùng.
 *
 * Mỗi lần đổi nội dung (không tính hạn mức) là một bản ở sổ đăng ký chính sách (policy_registry): POS gửi dòng bán kèm
 * policyRef { key = mã chương trình, version, hash } → lõi kiểm tham chiếu và bảng quy tắc định khoản đọc loại chương trình.
 */
import { sql } from 'kysely';
import { contentHash } from '@bizcity/platform/core/documents';
import { listPolicyVersions, registerPolicyVersion } from '@bizcity/platform/core/policies';
import type { Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';

/** Loại chương trình mặc định cho đơn vị tạo sau migration 0096 (cùng bộ với posting-rules.service). */
async function ensureProgramKinds(trx: Db, tenantId: string): Promise<void> {
  for (const [i, k] of [['KM-NCC', 'Khuyến mại của nhà cung cấp', 'both'], ['KM-CTY', 'Khuyến mại của công ty', 'sale'], ['XA-DATE', 'Xả hàng cận date', 'sale']].entries()) {
    await sql`INSERT INTO program_kinds (tenant_id, code, name, side, sort_order) VALUES (${tenantId}, ${k[0]}, ${k[1]}, ${k[2]}, ${(i + 1) * 10}) ON CONFLICT DO NOTHING`.execute(trx);
  }
}

export interface ProgramInput {
  code: string;
  name: string;
  programKind: string;
  mode: 'gift' | 'discount';
  sku: string;
  buyQty?: number;
  giftSku?: string | null;
  giftQty?: number | null;
  discountPct?: number | null;
  discountAmount?: number | null;
  salePrice?: number | null;
  validFrom: string;
  validTo: string;
  isActive?: boolean;
  note?: string;
  quotas?: { branchCode: string; quotaQty: number }[];
}

type ProgramRow = {
  id: string; code: string; name: string; program_kind: string; mode: 'gift' | 'discount'; sku: string; buy_qty: string; gift_sku: string | null; gift_qty: string | null;
  discount_pct: string | null; discount_amount: string | null; sale_price: string | null; valid_from: string; valid_to: string; is_active: boolean;
  version: number; content_hash: string | null; note: string; created_by: string; updated_by: string; updated_at: string;
};
const COLS = sql`p.id::text, p.code, p.name, p.program_kind, p.mode, p.sku, p.buy_qty::text, p.gift_sku, p.gift_qty::text, p.discount_pct::text, p.discount_amount::text,
  p.sale_price::text, p.valid_from::text, p.valid_to::text, p.is_active, p.version, p.content_hash, p.note, p.created_by, p.updated_by, p.updated_at::text`;
const num = (v: string | null) => (v === null ? null : Number(v));

/** Nội dung chính sách (không gồm hạn mức — hạn mức là phân bổ vận hành, đổi thường xuyên). */
const contentOf = (p: ProgramRow | ProgramInput | Record<string, unknown>) => {
  const r = p as Record<string, unknown>;
  const pick = (a: string, b: string) => (r[a] !== undefined ? r[a] : r[b]);
  return {
    code: r.code as string, name: r.name as string, programKind: pick('programKind', 'program_kind'), mode: r.mode as 'gift' | 'discount', sku: r.sku as string,
    buyQty: Number(pick('buyQty', 'buy_qty') ?? 1), giftSku: pick('giftSku', 'gift_sku') ?? null, giftQty: num((pick('giftQty', 'gift_qty') ?? null) as string | null),
    discountPct: num((pick('discountPct', 'discount_pct') ?? null) as string | null), discountAmount: num((pick('discountAmount', 'discount_amount') ?? null) as string | null),
    salePrice: num((pick('salePrice', 'sale_price') ?? null) as string | null), validFrom: pick('validFrom', 'valid_from'), validTo: pick('validTo', 'valid_to'),
  };
};

// [2026-11-12 09:45 PM Võ Hoàng] POS-KM — PHASE-031 · 00 §17 mục 2 (đóng góp): bộ đọc nội dung bản ở sổ đăng ký dựng lại nội dung theo đúng hàm đã băm lúc đăng ký.
/** Nội dung bản chính sách của một dòng `sale_programs` (cùng hàm băm lúc đăng ký bản). */
export const programContent = (row: Record<string, unknown>) => contentOf(row);

async function quotasOf(trx: Db, tenantId: string, ids: string[]) {
  if (!ids.length) return new Map<string, { branchCode: string; quotaQty: number; usedQty: number; remaining: number }[]>();
  const rows = (await sql<{ program_id: string; branch_code: string; quota_qty: string; used_qty: string }>`
    SELECT program_id::text, branch_code, quota_qty::text, used_qty::text FROM sale_program_quotas WHERE tenant_id = ${tenantId} AND program_id = ANY(${ids}::bigint[]) ORDER BY branch_code`.execute(trx)).rows;
  const map = new Map<string, { branchCode: string; quotaQty: number; usedQty: number; remaining: number }[]>();
  for (const r of rows) {
    const q = { branchCode: r.branch_code, quotaQty: Number(r.quota_qty), usedQty: Number(r.used_qty), remaining: Math.max(0, Number(r.quota_qty) - Number(r.used_qty)) };
    map.set(r.program_id, [...(map.get(r.program_id) ?? []), q]);
  }
  return map;
}

function present(p: ProgramRow, quotas: { branchCode: string; quotaQty: number; usedQty: number; remaining: number }[], today: string, names: Map<string, string>) {
  const state = !p.is_active ? 'stopped' : p.valid_to < today ? 'ended' : p.valid_from > today ? 'upcoming' : 'running';
  const quota = quotas.reduce((a, q) => a + q.quotaQty, 0);
  const used = quotas.reduce((a, q) => a + q.usedQty, 0);
  return {
    id: p.id, code: p.code, name: p.name, programKind: p.program_kind, mode: p.mode, sku: p.sku, skuName: names.get(p.sku) ?? null,
    buyQty: Number(p.buy_qty), giftSku: p.gift_sku, giftSkuName: p.gift_sku ? names.get(p.gift_sku) ?? null : null, giftQty: num(p.gift_qty),
    discountPct: num(p.discount_pct), discountAmount: num(p.discount_amount), salePrice: num(p.sale_price), validFrom: p.valid_from, validTo: p.valid_to,
    isActive: p.is_active, state, version: p.version, contentHash: p.content_hash, note: p.note, updatedBy: p.updated_by, updatedAt: p.updated_at,
    quotas, quotaTotal: quota, usedTotal: used, remainingTotal: Math.max(0, quota - used),
    policyRef: p.version > 0 && p.content_hash ? { key: p.code, version: p.version, hash: p.content_hash } : null,
  };
}

const todayOf = async (trx: Db) => (await sql<{ d: string }>`SELECT current_date::text AS d`.execute(trx)).rows[0]!.d;

async function productNames(trx: Db, tenantId: string, skus: string[]) {
  const list = [...new Set(skus.filter(Boolean))];
  if (!list.length) return new Map<string, string>();
  return new Map((await sql<{ sku: string; name: string }>`SELECT sku, name FROM products WHERE tenant_id = ${tenantId} AND sku = ANY(${list})`.execute(trx)).rows.map((r) => [r.sku, r.name]));
}

export async function listPrograms(trx: Db, tenantId: string, q: { state?: string; sku?: string; search?: string } = {}) {
  const today = await todayOf(trx);
  const search = q.search?.trim() ? `%${q.search.trim().toLowerCase()}%` : null;
  const rows = (await sql<ProgramRow>`SELECT ${COLS} FROM sale_programs p WHERE p.tenant_id = ${tenantId}
    ${q.sku ? sql`AND (p.sku = ${q.sku} OR p.gift_sku = ${q.sku})` : sql``}
    ${search ? sql`AND (lower(p.code) LIKE ${search} OR lower(p.name) LIKE ${search} OR lower(p.sku) LIKE ${search})` : sql``}
    ORDER BY p.valid_to DESC, p.code`.execute(trx)).rows;
  const quotas = await quotasOf(trx, tenantId, rows.map((r) => r.id));
  const names = await productNames(trx, tenantId, rows.flatMap((r) => [r.sku, r.gift_sku ?? '']));
  return rows.map((r) => present(r, quotas.get(r.id) ?? [], today, names)).filter((p) => !q.state || p.state === q.state);
}

async function getRow(trx: Db, tenantId: string, id: string, lock = false): Promise<ProgramRow> {
  const r = (await sql<ProgramRow>`SELECT ${COLS} FROM sale_programs p WHERE p.tenant_id = ${tenantId} AND p.id = ${id} ${lock ? sql`FOR UPDATE` : sql``}`.execute(trx)).rows[0];
  if (!r) throw Errors.notFound(`chương trình #${id}`);
  return r;
}

async function validate(trx: Db, tenantId: string, i: ProgramInput) {
  await ensureProgramKinds(trx, tenantId);
  const code = i.code.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(code)) throw Errors.validation('Mã chương trình: 2–64 ký tự chữ, số, dấu chấm, gạch');
  if (!i.name.trim()) throw Errors.validation('Nhập tên chương trình');
  if (i.validTo < i.validFrom) throw Errors.validation('Ngày kết thúc phải từ ngày bắt đầu trở đi');
  const kind = (await sql<{ code: string; side: string }>`SELECT code, side FROM program_kinds WHERE tenant_id = ${tenantId} AND code = ${i.programKind} AND is_active`.execute(trx)).rows[0];
  if (!kind) throw Errors.validation(`Loại chương trình ${i.programKind} chưa có`);
  if (kind.side === 'purchase') throw Errors.validation(`Loại ${i.programKind} chỉ dùng cho chính sách mua`);
  const skus = [i.sku, i.giftSku ?? ''].filter(Boolean);
  const found = await productNames(trx, tenantId, skus);
  for (const s of skus) if (!found.has(s)) throw Errors.validation(`Mặt hàng ${s} chưa có trong danh mục`);
  if (i.mode === 'gift') {
    if (!i.giftQty || i.giftQty <= 0) throw Errors.validation('Tặng hàng: nhập số lượng tặng');
    if (!i.buyQty || i.buyQty <= 0) throw Errors.validation('Tặng hàng: nhập số lượng mua để được tặng');
  } else {
    const n = [i.discountPct, i.discountAmount, i.salePrice].filter((x) => x !== null && x !== undefined).length;
    if (n !== 1) throw Errors.validation('Giảm giá: chọn đúng một cách giảm — phần trăm, số tiền giảm, hoặc giá bán chương trình');
    if (i.discountPct != null && (i.discountPct <= 0 || i.discountPct > 100)) throw Errors.validation('Phần trăm giảm từ 0 đến 100');
    if ((i.discountAmount != null && i.discountAmount <= 0) || (i.salePrice != null && i.salePrice < 0)) throw Errors.validation('Số tiền giảm / giá bán phải dương');
  }
  const branches = new Set((await sql<{ code: string }>`SELECT code FROM branches WHERE tenant_id = ${tenantId}`.execute(trx)).rows.map((b) => b.code));
  const seen = new Set<string>();
  for (const q of i.quotas ?? []) {
    if (!branches.has(q.branchCode)) throw Errors.validation(`Cửa hàng ${q.branchCode} chưa có`);
    if (seen.has(q.branchCode)) throw Errors.validation(`Cửa hàng ${q.branchCode} khai hai lần`);
    if (q.quotaQty < 0) throw Errors.validation('Hạn mức không âm');
    seen.add(q.branchCode);
  }
  return code;
}

/** Ghi hạn mức: không hạ dưới số đã dùng. Cửa hàng không còn trong danh sách mà chưa dùng thì bỏ. */
async function writeQuotas(trx: Db, tenantId: string, programId: string, quotas: { branchCode: string; quotaQty: number }[]) {
  const cur = (await quotasOf(trx, tenantId, [programId])).get(programId) ?? [];
  for (const q of quotas) {
    const used = cur.find((c) => c.branchCode === q.branchCode)?.usedQty ?? 0;
    if (q.quotaQty < used) throw Errors.validation(`Cửa hàng ${q.branchCode} đã dùng ${used}, hạn mức không hạ dưới số này`);
    await sql`INSERT INTO sale_program_quotas (tenant_id, program_id, branch_code, quota_qty) VALUES (${tenantId}, ${programId}, ${q.branchCode}, ${q.quotaQty})
              ON CONFLICT (program_id, branch_code) DO UPDATE SET quota_qty = EXCLUDED.quota_qty, updated_at = now()`.execute(trx);
  }
  for (const c of cur) {
    if (quotas.some((q) => q.branchCode === c.branchCode)) continue;
    if (c.usedQty > 0) throw Errors.validation(`Cửa hàng ${c.branchCode} đã dùng ${c.usedQty} — không bỏ khỏi chương trình được (đặt hạn mức bằng số đã dùng)`);
    await sql`DELETE FROM sale_program_quotas WHERE tenant_id = ${tenantId} AND program_id = ${programId} AND branch_code = ${c.branchCode}`.execute(trx);
  }
}

/** Thêm / sửa chương trình. Nội dung đổi → bản mới ở sổ đăng ký chính sách (áp từ hôm nay, hoặc từ ngày bắt đầu nếu còn ở tương lai). */
export async function saveProgram(trx: Db, tenantId: string, actor: string, id: string | null, i: ProgramInput) {
  const code = await validate(trx, tenantId, i);
  const vals = {
    name: i.name.trim(), kind: i.programKind, mode: i.mode, sku: i.sku, buy: i.mode === 'gift' ? i.buyQty ?? 1 : 1, giftSku: i.mode === 'gift' ? i.giftSku || null : null,
    giftQty: i.mode === 'gift' ? i.giftQty ?? null : null, pct: i.mode === 'discount' ? i.discountPct ?? null : null, amt: i.mode === 'discount' ? i.discountAmount ?? null : null,
    price: i.mode === 'discount' ? i.salePrice ?? null : null,
  };
  let programId = id;
  if (id) {
    const cur = await getRow(trx, tenantId, id, true);
    if (cur.code !== code) throw Errors.validation('Không đổi mã chương trình (dòng bán cũ trỏ theo mã) — tạo chương trình mới');
    await sql`UPDATE sale_programs SET name = ${vals.name}, program_kind = ${vals.kind}, mode = ${vals.mode}, sku = ${vals.sku}, buy_qty = ${vals.buy}, gift_sku = ${vals.giftSku},
              gift_qty = ${vals.giftQty}, discount_pct = ${vals.pct}, discount_amount = ${vals.amt}, sale_price = ${vals.price}, valid_from = ${i.validFrom}::date,
              valid_to = ${i.validTo}::date, is_active = ${i.isActive ?? true}, note = ${i.note ?? ''}, updated_by = ${actor}, updated_at = now()
              WHERE tenant_id = ${tenantId} AND id = ${id}`.execute(trx);
  } else {
    const dup = (await sql<{ id: string }>`SELECT id::text FROM sale_programs WHERE tenant_id = ${tenantId} AND code = ${code}`.execute(trx)).rows[0];
    if (dup) throw Errors.conflict(`Mã chương trình ${code} đã có`);
    programId = (await sql<{ id: string }>`
      INSERT INTO sale_programs (tenant_id, code, name, program_kind, mode, sku, buy_qty, gift_sku, gift_qty, discount_pct, discount_amount, sale_price, valid_from, valid_to, is_active, note, created_by, updated_by)
      VALUES (${tenantId}, ${code}, ${vals.name}, ${vals.kind}, ${vals.mode}, ${vals.sku}, ${vals.buy}, ${vals.giftSku}, ${vals.giftQty}, ${vals.pct}, ${vals.amt}, ${vals.price},
              ${i.validFrom}::date, ${i.validTo}::date, ${i.isActive ?? true}, ${i.note ?? ''}, ${actor}, ${actor})
      RETURNING id::text`.execute(trx)).rows[0]!.id;
  }
  if (i.quotas) await writeQuotas(trx, tenantId, programId!, i.quotas);
  // Bản chính sách: chỉ khi nội dung đổi.
  const row = await getRow(trx, tenantId, programId!);
  const content = contentOf(row);
  const hash = contentHash(content);
  if (hash !== row.content_hash) {
    const policyId = `ban-hang:sale_programs:${programId}`;
    const last = (await listPolicyVersions(trx, tenantId, policyId)).at(-1);
    const today = await todayOf(trx);
    const effectiveFrom = last ? (row.valid_from > today ? row.valid_from : today) : null;
    const lastFrom = last?.effectiveFrom ?? null;
    await registerPolicyVersion(trx, {
      tenantId, ownerModule: 'ban-hang', policyKey: row.code, policyId, version: (last?.version ?? 0) + 1, ruleContract: `sale.program.${row.mode}@1`,
      scope: { sku: row.sku }, effectiveFrom: effectiveFrom && lastFrom && effectiveFrom < lastFrom ? lastFrom : effectiveFrom, store: 'module', storeRef: `sale_programs:${programId}`,
      content, hash, actor, reason: id ? 'Sửa chương trình' : 'Tạo chương trình',
    });
    await sql`UPDATE sale_programs SET version = ${(last?.version ?? 0) + 1}, content_hash = ${hash} WHERE tenant_id = ${tenantId} AND id = ${programId}`.execute(trx);
  }
  await writeAudit(trx, { tenantId, actor, action: id ? 'sale_program.update' : 'sale_program.create', objectType: 'sale_program', objectId: code, after: { ...i, code } });
  return (await listPrograms(trx, tenantId)).find((p) => p.id === programId);
}

/** Chỉ đổi hạn mức (phân bổ lại cho cửa hàng giữa chương trình) — không sinh bản chính sách mới. */
export async function setQuotas(trx: Db, tenantId: string, actor: string, id: string, quotas: { branchCode: string; quotaQty: number }[]) {
  const row = await getRow(trx, tenantId, id, true);
  const branches = new Set((await sql<{ code: string }>`SELECT code FROM branches WHERE tenant_id = ${tenantId}`.execute(trx)).rows.map((b) => b.code));
  for (const q of quotas) if (!branches.has(q.branchCode)) throw Errors.validation(`Cửa hàng ${q.branchCode} chưa có`);
  await writeQuotas(trx, tenantId, id, quotas);
  await writeAudit(trx, { tenantId, actor, action: 'sale_program.quotas', objectType: 'sale_program', objectId: row.code, after: { quotas } });
  return (await listPrograms(trx, tenantId)).find((p) => p.id === id);
}

/**
 * Chương trình đang chạy cho một cửa hàng (POS gọi khi bán): mặt hàng trong danh sách, còn hạn ngày, còn hạn mức ở cửa hàng.
 * Trả kèm policyRef để POS gắn vào dòng bán.
 */
export async function activeFor(trx: Db, tenantId: string, q: { branchCode: string; date?: string; skus?: string[] }) {
  const date = q.date ?? await todayOf(trx);
  const rows = (await sql<ProgramRow>`SELECT ${COLS} FROM sale_programs p WHERE p.tenant_id = ${tenantId} AND p.is_active
     AND p.valid_from <= ${date}::date AND p.valid_to >= ${date}::date ${q.skus?.length ? sql`AND p.sku = ANY(${q.skus})` : sql``}
     ORDER BY p.sku, p.code`.execute(trx)).rows;
  const quotas = await quotasOf(trx, tenantId, rows.map((r) => r.id));
  const names = await productNames(trx, tenantId, rows.flatMap((r) => [r.sku, r.gift_sku ?? '']));
  const today = await todayOf(trx);
  return rows.map((r) => {
    const quota = (quotas.get(r.id) ?? []).find((x) => x.branchCode === q.branchCode);
    return { ...present(r, quota ? [quota] : [], today, names), branchCode: q.branchCode, branchRemaining: quota?.remaining ?? 0 };
  }).filter((p) => p.branchRemaining > 0);
}

export interface ConsumeInput {
  branchCode: string;
  docKey: string;
  docNo?: string;
  docDate: string;
  source?: string;
  lines: { lineKey: string; program: string; sku?: string; qty: number; amount?: number }[];
}

/**
 * Trừ hạn mức cho các dòng của một phiếu bán (một giao dịch: thiếu một dòng là không trừ dòng nào). Khoá dòng hạn mức theo thứ tự
 * (chương trình, cửa hàng) để hai máy cùng bán món cuối thì một máy bị từ chối. Gửi lại cùng phiếu = không trừ thêm (idempotent).
 */
/**
 * [2026-11-12 09:45 PM Võ Hoàng] POS-KM — PHASE-031 · 00 §17 mục 4 (đóng góp): `force` cho người nghe phiếu bán đã ghi sổ — hàng đã bán thật nên KHÔNG chặn:
 * vượt hạn mức vẫn ghi (báo cáo hiện phần vượt), dòng trỏ chương trình không có / số lượng không dương thì bỏ qua, cửa hàng chưa
 * được giao hạn mức thì vẫn ghi lượt dùng (không cộng vào hạn mức), ngoài thời gian chương trình vẫn ghi (cửa nạp đã báo IN-POL-002).
 */
export async function consume(trx: Db, tenantId: string, actor: string, c: ConsumeInput, opts: { force?: boolean } = {}) {
  const force = opts.force === true;
  if (!c.lines.length && !force) return { docKey: c.docKey, lines: [] };
  const codes = [...new Set(c.lines.map((l) => l.program))];
  const programs = (await sql<ProgramRow>`SELECT ${COLS} FROM sale_programs p WHERE p.tenant_id = ${tenantId} AND p.code = ANY(${codes})`.execute(trx)).rows;
  const byCode = new Map(programs.map((p) => [p.code, p]));
  const out: { lineKey: string; program: string; qty: number; remaining: number; already?: boolean }[] = [];
  const sorted = [...c.lines].sort((a, b) => a.program.localeCompare(b.program) || a.lineKey.localeCompare(b.lineKey));
  for (const l of sorted) {
    const p = byCode.get(l.program);
    if (!p) { if (force) continue; throw Errors.validation(`Chương trình ${l.program} không có`); }
    if (!force && (!p.is_active || c.docDate < p.valid_from || c.docDate > p.valid_to)) throw Errors.validation(`Chương trình ${p.code} không áp ngày ${c.docDate} (${p.valid_from} → ${p.valid_to}${p.is_active ? '' : ', đã ngừng'})`);
    if (!(l.qty > 0)) { if (force) continue; throw Errors.validation(`Dòng ${l.lineKey}: số lượng phải dương`); }
    const sku = l.sku || (p.mode === 'gift' ? p.gift_sku ?? p.sku : p.sku);
    const q = (await sql<{ quota_qty: string; used_qty: string }>`SELECT quota_qty::text, used_qty::text FROM sale_program_quotas
      WHERE tenant_id = ${tenantId} AND program_id = ${p.id} AND branch_code = ${c.branchCode} FOR UPDATE`.execute(trx)).rows[0];
    if (!q && !force) throw Errors.validation(`Cửa hàng ${c.branchCode} không có hạn mức của chương trình ${p.code}`);
    const prev = (await sql<{ qty: string }>`SELECT qty::text FROM sale_program_usage WHERE tenant_id = ${tenantId} AND program_id = ${p.id} AND doc_key = ${c.docKey} AND line_key = ${l.lineKey}`.execute(trx)).rows[0];
    const delta = l.qty - Number(prev?.qty ?? 0);
    const remaining = q ? Number(q.quota_qty) - Number(q.used_qty) : 0;
    if (delta > remaining && !force) throw Errors.conflict(`Chương trình ${p.code} ở cửa hàng ${c.branchCode} chỉ còn ${remaining} (cần ${delta})`);
    if (prev) {
      await sql`UPDATE sale_program_usage SET qty = ${l.qty}, amount = ${l.amount ?? 0}, doc_no = ${c.docNo ?? ''}, doc_date = ${c.docDate}::date, sku = ${sku}
                WHERE tenant_id = ${tenantId} AND program_id = ${p.id} AND doc_key = ${c.docKey} AND line_key = ${l.lineKey}`.execute(trx);
    } else {
      await sql`INSERT INTO sale_program_usage (tenant_id, program_id, branch_code, doc_key, line_key, doc_no, doc_date, sku, qty, amount, source, created_by)
                VALUES (${tenantId}, ${p.id}, ${c.branchCode}, ${c.docKey}, ${l.lineKey}, ${c.docNo ?? ''}, ${c.docDate}::date, ${sku}, ${l.qty}, ${l.amount ?? 0}, ${c.source ?? ''}, ${actor})`.execute(trx);
    }
    if (delta !== 0 && q) await sql`UPDATE sale_program_quotas SET used_qty = GREATEST(0, used_qty + ${delta}), updated_at = now() WHERE tenant_id = ${tenantId} AND program_id = ${p.id} AND branch_code = ${c.branchCode}`.execute(trx);
    out.push({ lineKey: l.lineKey, program: p.code, qty: l.qty, remaining: remaining - delta, ...(delta === 0 ? { already: true } : {}) });
  }
  // Dòng của phiếu không còn gửi (sửa phiếu bỏ dòng) → trả hạn mức.
  const keep = c.lines.map((l) => `${l.program}|${l.lineKey}`);
  const stale = (await sql<{ id: string; program_id: string; branch_code: string; qty: string; code: string; line_key: string }>`
    SELECT u.id::text, u.program_id::text, u.branch_code, u.qty::text, p.code, u.line_key FROM sale_program_usage u JOIN sale_programs p ON p.id = u.program_id
     WHERE u.tenant_id = ${tenantId} AND u.doc_key = ${c.docKey}`.execute(trx)).rows.filter((u) => !keep.includes(`${u.code}|${u.line_key}`));
  for (const u of stale) await giveBack(trx, tenantId, u);
  return { docKey: c.docKey, lines: out };
}

async function giveBack(trx: Db, tenantId: string, u: { id: string; program_id: string; branch_code: string; qty: string }) {
  await sql`DELETE FROM sale_program_usage WHERE tenant_id = ${tenantId} AND id = ${u.id}`.execute(trx);
  await sql`UPDATE sale_program_quotas SET used_qty = GREATEST(0, used_qty - ${Number(u.qty)}), updated_at = now() WHERE tenant_id = ${tenantId} AND program_id = ${u.program_id} AND branch_code = ${u.branch_code}`.execute(trx);
}

/** Huỷ phiếu bán (hoặc khách trả cả phiếu): trả lại toàn bộ hạn mức đã dùng của phiếu. */
export async function release(trx: Db, tenantId: string, actor: string, docKey: string) {
  const rows = (await sql<{ id: string; program_id: string; branch_code: string; qty: string }>`
    SELECT id::text, program_id::text, branch_code, qty::text FROM sale_program_usage WHERE tenant_id = ${tenantId} AND doc_key = ${docKey}`.execute(trx)).rows;
  for (const u of rows) await giveBack(trx, tenantId, u);
  if (rows.length) await writeAudit(trx, { tenantId, actor, action: 'sale_program.release', objectType: 'sale_document', objectId: docKey, after: { lines: rows.length } });
  return { docKey, released: rows.length, qty: rows.reduce((a, r) => a + Number(r.qty), 0) };
}

/** Báo cáo quản lý chương trình: theo chương trình × cửa hàng — hạn mức, đã dùng trong khoảng ngày, còn lại, giá trị. */
export async function programReport(trx: Db, tenantId: string, q: { from: string; to: string; program?: string; branchCode?: string; kind?: string }) {
  const rows = (await sql<{ id: string; code: string; name: string; program_kind: string; mode: string; sku: string; valid_from: string; valid_to: string; branch_code: string; quota_qty: string; used_qty: string; period_qty: string; period_amount: string; period_docs: string }>`
    SELECT p.id::text, p.code, p.name, p.program_kind, p.mode, p.sku, p.valid_from::text, p.valid_to::text, q.branch_code, q.quota_qty::text, q.used_qty::text,
           COALESCE(sum(u.qty), 0)::text AS period_qty, COALESCE(sum(u.amount), 0)::text AS period_amount, count(DISTINCT u.doc_key)::text AS period_docs
      FROM sale_programs p
      JOIN sale_program_quotas q ON q.program_id = p.id
      LEFT JOIN sale_program_usage u ON u.program_id = p.id AND u.branch_code = q.branch_code AND u.doc_date BETWEEN ${q.from}::date AND ${q.to}::date
     WHERE p.tenant_id = ${tenantId} AND p.valid_from <= ${q.to}::date AND p.valid_to >= ${q.from}::date
       ${q.program ? sql`AND p.code = ${q.program}` : sql``} ${q.branchCode ? sql`AND q.branch_code = ${q.branchCode}` : sql``} ${q.kind ? sql`AND p.program_kind = ${q.kind}` : sql``}
     GROUP BY p.id, q.branch_code, q.quota_qty, q.used_qty ORDER BY p.code, q.branch_code`.execute(trx)).rows;
  const names = await productNames(trx, tenantId, rows.map((r) => r.sku));
  const today = await todayOf(trx);
  const items = rows.map((r) => {
    const quota = Number(r.quota_qty); const used = Number(r.used_qty);
    const days = Math.max(1, (Date.parse(r.valid_to) - Date.parse(r.valid_from)) / 86400000 + 1);
    const elapsed = Math.min(days, Math.max(0, (Date.parse(today) - Date.parse(r.valid_from)) / 86400000 + 1));
    return {
      programId: r.id, program: r.code, name: r.name, programKind: r.program_kind, mode: r.mode, sku: r.sku, skuName: names.get(r.sku) ?? null, validFrom: r.valid_from, validTo: r.valid_to,
      branchCode: r.branch_code, quota, used, remaining: Math.max(0, quota - used), usedPct: quota ? Math.round((used / quota) * 1000) / 10 : 0,
      periodQty: Number(r.period_qty), periodAmount: Number(r.period_amount), periodDocs: Number(r.period_docs),
      /** Tốc độ dùng so với thời gian đã trôi: > 100 = dùng nhanh hơn kế hoạch (sắp hết sớm), < 100 = chậm (còn tồn quà / hàng). */
      pace: elapsed > 0 && quota > 0 ? Math.round(((used / quota) / (elapsed / days)) * 100) : null,
    };
  });
  return {
    items,
    totals: { quota: items.reduce((a, x) => a + x.quota, 0), used: items.reduce((a, x) => a + x.used, 0), periodQty: items.reduce((a, x) => a + x.periodQty, 0), periodAmount: items.reduce((a, x) => a + x.periodAmount, 0) },
  };
}

/** Lượt dùng chi tiết (phiếu, dòng) của một chương trình. */
export async function usageDetail(trx: Db, tenantId: string, programId: string, q: { branchCode?: string; from?: string; to?: string }) {
  return (await sql<{ branch_code: string; doc_key: string; doc_no: string; doc_date: string; line_key: string; sku: string; qty: string; amount: string; source: string; created_at: string }>`
    SELECT branch_code, doc_key, doc_no, doc_date::text, line_key, sku, qty::text, amount::text, source, created_at::text FROM sale_program_usage
     WHERE tenant_id = ${tenantId} AND program_id = ${programId}
       ${q.branchCode ? sql`AND branch_code = ${q.branchCode}` : sql``} ${q.from ? sql`AND doc_date >= ${q.from}::date` : sql``} ${q.to ? sql`AND doc_date <= ${q.to}::date` : sql``}
     ORDER BY doc_date DESC, doc_no LIMIT 2000`.execute(trx)).rows.map((r) => ({ ...r, qty: Number(r.qty), amount: Number(r.amount) }));
}

export async function listProgramKinds(trx: Db, tenantId: string) {
  await ensureProgramKinds(trx, tenantId);
  return (await sql<{ code: string; name: string; side: string; note: string; is_active: boolean }>`SELECT code, name, side, note, is_active FROM program_kinds WHERE tenant_id = ${tenantId} ORDER BY sort_order, code`.execute(trx)).rows
    .map((k) => ({ code: k.code, name: k.name, side: k.side, note: k.note, isActive: k.is_active }));
}

export async function saveProgramKind(trx: Db, tenantId: string, actor: string, k: { code: string; name: string; side: 'sale' | 'purchase' | 'both'; note?: string; isActive?: boolean }) {
  await ensureProgramKinds(trx, tenantId);
  const code = k.code.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{1,31}$/.test(code)) throw Errors.validation('Mã loại: 2–32 ký tự chữ, số, dấu chấm, gạch');
  await sql`INSERT INTO program_kinds (tenant_id, code, name, side, note, is_active, sort_order)
            VALUES (${tenantId}, ${code}, ${k.name.trim()}, ${k.side}, ${k.note ?? ''}, ${k.isActive ?? true}, (SELECT COALESCE(max(sort_order), 0) + 10 FROM program_kinds WHERE tenant_id = ${tenantId}))
            ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name, side = EXCLUDED.side, note = EXCLUDED.note, is_active = EXCLUDED.is_active`.execute(trx);
  await writeAudit(trx, { tenantId, actor, action: 'program_kind.save', objectType: 'program_kind', objectId: code, after: k });
  return (await listProgramKinds(trx, tenantId)).find((x) => x.code === code);
}
