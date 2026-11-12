// @bizcity-layer D modules/kho
// [2026-11-12 03:30 PM kiennt] NT-KHO-002 — kiểm kê kho (KHO02): biên bản kiểm kê → xác minh → quyết định xử lý chênh lệch, ngoài lõi
/**
 * KIỂM KÊ KHO (KHO02) — phiếu nghiệm thu docs/nghiem-thu/kho/NT-KHO-002-kiem-ke-kho.md. Bảng stock_counts (0110).
 * Không có sổ riêng: chênh lệch vào sổ bằng chứng từ có sẵn qua cửa ghi sổ của lõi (postDocumentIn), huỷ = bút toán đảo.
 *   1. Biên bản kiểm kê (nháp, không đụng sổ): kho + ngày; "Lấy số tồn" theo mặt hàng × lô / HSD; nhập số đếm, phẩm chất, thành viên.
 *      Ghi nhận chênh lệch → (a) chứng từ điều chỉnh tồn `stock_adjustment` (mixed): thiếu / thừa theo lô — lõi tự chọn lý do kiểm kê
 *      thiếu / thừa mặc định của đơn vị (1381 / 3381), chưa vào chi phí; (b) hàng kém / mất phẩm chất → chứng từ chuyển kho cùng chi
 *      nhánh sang kho cách ly (không ghi giảm 156, không phát sinh bút toán).
 *   2. Biên bản xác minh: nguyên nhân từng dòng chênh lệch (tổng số lượng = chênh lệch).
 *   3. Quyết định xử lý → phiếu kế toán `manual_journal` theo lý do (kind journal) đơn vị chọn: bồi thường (1388 / 1381), tính vào
 *      chi phí (632 / 1381), thừa thuộc doanh nghiệp (3381 / 711). "Ghi thiếu phiếu nhập": không ghi 711, ghi lại chứng từ điều chỉnh
 *      bỏ phần thừa đó (tồn không tăng hai lần). Giá trị = số lượng × đơn giá bình quân tháng (inventory_costs) — tháng chưa tính giá
 *      vốn thì không cho ghi quyết định.
 * HSD thực tế khác sổ: ghi trên biên bản (cột HSD thực tế), CHƯA đổi HSD của lô trong sổ — lõi chưa có thao tác sửa HSD lô.
 *
 *   GET  /api/v1/kho/kiem-ke?from=&to=&search=          danh sách        GET /api/v1/kho/kiem-ke/:id      một biên bản
 *   GET  /api/v1/kho/kiem-ke/so-ton?branchCode=&warehouse=&date=   số theo sổ từng mặt hàng × lô
 *   POST /api/v1/kho/kiem-ke             lập (nháp)          PUT  /api/v1/kho/kiem-ke/:id          sửa nháp
 *   POST /…/:id/ghi-nhan                 ghi nhận chênh lệch POST /…/:id/bo-ghi-nhan               bỏ ghi nhận (huỷ chứng từ)
 *   POST /…/:id/xac-minh                 biên bản xác minh   POST /…/:id/quyet-dinh                quyết định xử lý
 *   POST /…/:id/huy-quyet-dinh           huỷ quyết định
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql } from 'kysely';
import { ingestDocumentSchema, type IngestDocument } from '@ketoan/contracts';
import { zodIssueTexts } from '@bizcity/platform/core/http';
import { db, toNumber, type Db } from '../../db/client.js';
import { authOf, canDocument, documentPermissionOf, requirePermission, type AuthContext } from '../../core/auth.js';
import { Errors } from '../../core/errors.js';
import { idParamSchema, ok } from '../../core/http.js';
import { defineAction, mountActions, type AnyActionDef } from '../../core/actions.js';
import { documentNumbers, documentService, documentStatusIn, postDocumentIn } from '../../kernel/public.js';

const tags = ['Kho — kiểm kê'];
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const optText = (max: number) => z.string().trim().max(max).optional().transform((x) => x || undefined);

export const countLineSchema = z.object({
  lineKey: z.string().trim().min(1).max(64),
  sku: z.string().trim().min(1, 'Dòng thiếu mã hàng').max(64),
  name: z.string().trim().max(500).default(''),
  unit: z.string().trim().max(32).default(''),
  lotNo: z.string().trim().max(64).default(''),
  expDate: day.optional().or(z.literal('')).transform((x) => x || undefined),
  actualExpDate: day.optional().or(z.literal('')).transform((x) => x || undefined),
  bookQty: z.number().finite().default(0),
  countedQty: z.number().finite().min(0, 'Số kiểm kê phải ≥ 0'),
  poorQty: z.number().finite().min(0, 'Số kém phẩm chất phải ≥ 0').default(0),
  lostQty: z.number().finite().min(0, 'Số mất phẩm chất phải ≥ 0').default(0),
  newLot: z.boolean().default(false),
  note: optText(500),
});
export type CountLine = z.infer<typeof countLineSchema>;
const memberSchema = z.object({ name: z.string().trim().min(1).max(200), title: z.string().trim().max(200).default(''), represent: z.string().trim().max(200).default('') });
export const countInputSchema = z.object({
  docNo: z.string().trim().max(64).default(''),
  countDate: day,
  branchCode: z.string().trim().min(1, 'Chưa chọn chi nhánh').max(32),
  warehouseCode: z.string().trim().max(64).default(''),
  quarantineWarehouse: z.string().trim().max(64).default(''),
  purpose: z.string().trim().max(500).default(''),
  conclusion: z.string().trim().max(2000).default(''),
  members: z.array(memberSchema).max(50).default([]),
  lines: z.array(countLineSchema).max(5000).default([]),
});
export type CountInput = z.input<typeof countInputSchema>;

export const CAUSES = ['unknown', 'compensate', 'expense', 'owned', 'missing_receipt'] as const;
const causeSchema = z.object({
  lineKey: z.string().trim().min(1).max(64),
  cause: z.enum(CAUSES),
  qty: z.number().finite().positive('Số lượng nguyên nhân phải > 0'),
  partnerCode: optText(64),
  receiptDocNo: optText(64),
  note: optText(500),
});
export type Cause = z.infer<typeof causeSchema>;
const verifySchema = z.object({ causes: z.array(causeSchema).max(10000), note: z.string().trim().max(2000).default('') });
const decideSchema = z.object({
  decisionNo: z.string().trim().min(1, 'Thiếu số quyết định').max(64),
  decisionDate: day,
  signer: z.string().trim().max(200).default(''),
  reasons: z.object({ compensate: optText(32), expense: optText(32), owned: optText(32) }).default({}),
  causes: z.array(causeSchema).max(10000).optional(),
});

interface Row {
  id: string; doc_no: string; count_date: string; branch_code: string; warehouse_code: string; quarantine_warehouse: string; purpose: string; conclusion: string;
  members: { name: string; title: string; represent: string }[]; lines: CountLine[]; status: 'draft' | 'recorded' | 'verified' | 'settled';
  adjust_doc_key: string; transfer_doc_key: string; recorded_at: Date | null; recorded_by: string | null; causes: Cause[]; verify_note: string;
  verified_at: Date | null; verified_by: string | null; decision_no: string; decision_date: string | null; decision_signer: string;
  decision_reasons: Record<string, string>; journal_doc_key: string; settled_at: Date | null; settled_by: string | null;
  created_by: string | null; updated_by: string | null; created_at: Date; updated_at: Date;
}
const COLS = sql.raw(`id::text, doc_no, to_char(count_date, 'YYYY-MM-DD') AS count_date, branch_code, warehouse_code, quarantine_warehouse, purpose, conclusion,
  members, lines, status, adjust_doc_key, transfer_doc_key, recorded_at, recorded_by, causes, verify_note, verified_at, verified_by, decision_no,
  to_char(decision_date, 'YYYY-MM-DD') AS decision_date, decision_signer, decision_reasons, journal_doc_key, settled_at, settled_by,
  created_by, updated_by, created_at, updated_at`);

const STATUS_TEXT: Record<Row['status'], string> = { draft: 'Nháp', recorded: 'Đã ghi nhận chênh lệch', verified: 'Đã xác minh', settled: 'Đã xử lý' };

/** Chênh lệch của dòng (kiểm kê − sổ). */
export const diffOf = (l: Pick<CountLine, 'countedQty' | 'bookQty'>) => r4(l.countedQty - l.bookQty);

function view(r: Row) {
  const lines = r.lines.map((l) => ({ ...l, diff: diffOf(l), expMismatch: Boolean(l.actualExpDate && l.expDate && l.actualExpDate !== l.expDate) }));
  return {
    id: r.id, docNo: r.doc_no, countDate: r.count_date, branchCode: r.branch_code, warehouseCode: r.warehouse_code, quarantineWarehouse: r.quarantine_warehouse,
    purpose: r.purpose, conclusion: r.conclusion, members: r.members, lines, status: r.status, statusText: STATUS_TEXT[r.status],
    adjustDocKey: r.adjust_doc_key, transferDocKey: r.transfer_doc_key, recordedAt: r.recorded_at, recordedBy: r.recorded_by,
    causes: r.causes, verifyNote: r.verify_note, verifiedAt: r.verified_at, verifiedBy: r.verified_by,
    decisionNo: r.decision_no, decisionDate: r.decision_date, decisionSigner: r.decision_signer, decisionReasons: r.decision_reasons,
    journalDocKey: r.journal_doc_key, settledAt: r.settled_at, settledBy: r.settled_by, createdBy: r.created_by, updatedBy: r.updated_by,
    createdAt: r.created_at, updatedAt: r.updated_at,
    totals: {
      bookQty: r4(lines.reduce((s, l) => s + l.bookQty, 0)), countedQty: r4(lines.reduce((s, l) => s + l.countedQty, 0)), diff: r4(lines.reduce((s, l) => s + l.diff, 0)),
      surplus: r4(lines.reduce((s, l) => s + Math.max(0, l.diff), 0)), shortage: r4(lines.reduce((s, l) => s + Math.max(0, -l.diff), 0)),
      poorQty: r4(lines.reduce((s, l) => s + l.poorQty + l.lostQty, 0)),
    },
  };
}
export type CountView = ReturnType<typeof view>;

async function load(trx: Db, tenantId: string, id: string, forUpdate = false): Promise<Row> {
  const r = (await sql<Row>`SELECT ${COLS} FROM stock_counts WHERE tenant_id = ${tenantId} AND id = ${id}::bigint ${forUpdate ? sql`FOR UPDATE` : sql``}`.execute(trx)).rows[0];
  if (!r) throw Errors.notFound('biên bản kiểm kê');
  return r;
}
export const getCount = async (trx: Db, tenantId: string, id: string) => view(await load(trx, tenantId, id));

export async function listCounts(trx: Db, tenantId: string, q: { from?: string; to?: string; search?: string }) {
  const s = q.search?.trim() ? `%${q.search.trim().toLowerCase()}%` : null;
  const rows = (await sql<Row>`
    SELECT ${COLS} FROM stock_counts WHERE tenant_id = ${tenantId}
       ${q.from ? sql`AND count_date >= ${q.from}::date` : sql``} ${q.to ? sql`AND count_date <= ${q.to}::date` : sql``}
       ${s ? sql`AND (lower(doc_no) LIKE ${s} OR lower(branch_code) LIKE ${s} OR lower(warehouse_code) LIKE ${s} OR lower(purpose) LIKE ${s})` : sql``}
     ORDER BY count_date DESC, id DESC LIMIT 2000`.execute(trx)).rows;
  return rows.map((r) => { const v = view(r); return { ...v, lines: undefined, lineCount: r.lines.length }; });
}

/* ------------------------------------------------------------------ danh mục, kho, sổ */

async function branchOf(trx: Db, tenantId: string, code: string) {
  const b = (await sql<{ id: string; code: string; unit: string }>`SELECT id::text, code, COALESCE(accounting_unit_id, 0)::text AS unit FROM branches WHERE tenant_id = ${tenantId} AND code = ${code}`.execute(trx)).rows[0];
  if (!b) throw Errors.validation(`Chi nhánh ${code} chưa có trong danh mục chi nhánh`);
  return b;
}
/** Phân kho thật của chi nhánh: trống = kho mặc định (hoặc kho duy nhất); có mã thì phải thuộc chi nhánh và đang dùng. */
async function warehouseOf(trx: Db, tenantId: string, branchId: string, code: string, label: string): Promise<{ code: string; isDefault: boolean }> {
  const ws = (await sql<{ code: string; is_default: boolean; is_active: boolean }>`SELECT code, is_default, is_active FROM warehouses WHERE tenant_id = ${tenantId} AND branch_id = ${branchId} ORDER BY id`.execute(trx)).rows;
  const active = ws.filter((w) => w.is_active);
  const def = (active.find((x) => x.is_default) ?? (active.length === 1 ? active[0] : undefined))?.code ?? '';
  if (!code) return { code: def, isDefault: true };
  const w = ws.find((x) => x.code === code);
  if (!w) throw Errors.validation(`${label} ${code} không thuộc chi nhánh${ws.length ? ` (có: ${ws.map((x) => x.code).join(', ')})` : ' — chi nhánh chưa khai kho'}`);
  if (!w.is_active) throw Errors.validation(`${label} ${code} đang ngừng dùng`);
  return { code, isDefault: code === def };
}

/**
 * Số theo sổ từng mặt hàng × lô / HSD ở chi nhánh + phân kho đến hết ngày (dòng thẻ kho không ghi kho = kho mặc định).
 * Lấy lô có tồn khác 0, hoặc có phát sinh trong tháng kiểm kê. Trừ các chứng từ của chính biên bản (except).
 */
export async function bookStock(trx: Db, tenantId: string, q: { branchCode: string; warehouse?: string; date: string; except?: string[] }) {
  const b = await branchOf(trx, tenantId, q.branchCode);
  const wh = await warehouseOf(trx, tenantId, b.id, q.warehouse ?? '', 'Kho');
  const except = (q.except ?? []).filter(Boolean);
  const rows = (await sql<{ sku: string; name: string; unit: string; lot_no: string; exp_date: string | null; qty: string }>`
    SELECT m.sku, max(im.name) AS name, max(im.unit) AS unit, l.lot_no, to_char(l.exp_date, 'YYYY-MM-DD') AS exp_date, sum(m.qty)::text AS qty
      FROM inventory_lot_moves m
      JOIN item_lots l ON l.id = m.lot_id
      JOIN inventory_movements im ON im.id = m.movement_id
      JOIN accounting_events e ON e.id = m.event_id
     WHERE m.tenant_id = ${tenantId} AND m.branch_id = ${b.id}::bigint
       AND ${wh.isDefault ? sql`m.warehouse_code IN (${wh.code}, '')` : sql`m.warehouse_code = ${wh.code}`}
       AND m.doc_date <= ${q.date}::date
       ${except.length ? sql`AND NOT (e.doc_key = ANY(${except}::text[]))` : sql``}
     GROUP BY m.sku, l.lot_no, l.exp_date
    HAVING sum(m.qty) <> 0 OR max(m.doc_date) >= date_trunc('month', ${q.date}::date)
     ORDER BY m.sku, l.exp_date NULLS LAST, l.lot_no`.execute(trx)).rows;
  return {
    warehouse: wh.code,
    lines: rows.map((r, i) => ({ lineKey: `L${i + 1}`, sku: r.sku, name: r.name ?? '', unit: r.unit ?? '', lotNo: r.lot_no ?? '', expDate: r.exp_date ?? undefined, bookQty: r4(toNumber(r.qty)) })),
  };
}

/** Ngày nằm trong kỳ đã khoá (cả đơn vị hoặc đúng chi nhánh; mọi loại hoặc loại chứng từ biên bản sinh ra). */
async function assertOpen(trx: Db, tenantId: string, branchCode: string, date: string, docTypes: string[]) {
  const locked = (await sql<{ ym: string }>`
    SELECT to_char(p.start_date, 'MM/YYYY') AS ym FROM period_locks l JOIN fiscal_periods p ON p.id = l.period_id
      LEFT JOIN branches b ON b.id = l.branch_id
     WHERE l.tenant_id = ${tenantId} AND ${date}::date BETWEEN p.start_date AND p.end_date
       AND (l.branch_id IS NULL OR b.code = ${branchCode}) AND (l.doc_type = '*' OR l.doc_type = ANY(${docTypes}::text[])) LIMIT 1`.execute(trx)).rows[0];
  if (locked) throw Errors.conflict(`Kỳ ${locked.ym} đã khoá — không ghi được chứng từ ngày ${date.split('-').reverse().join('/')}`);
}

/* ------------------------------------------------------------------ chứng từ qua cửa ghi sổ */

async function ingest(trx: Db, auth: AuthContext, raw: Record<string, unknown>) {
  const parsed = ingestDocumentSchema.safeParse(raw);
  if (!parsed.success) throw Errors.validation('Chứng từ dựng từ biên bản kiểm kê không đúng khuôn', zodIssueTexts(parsed.error));
  await postDocumentIn(trx, auth, parsed.data as IngestDocument, { post: true, force: true });
  const e = (await sql<{ status: string; error_message: string | null }>`SELECT status, error_message FROM accounting_events WHERE tenant_id = ${auth.tenantId} AND doc_key = ${String(raw.docKey)}`.execute(trx)).rows[0];
  if (e?.status === 'error') throw Errors.posting(`Không ghi sổ được: ${e.error_message ?? ''}`);
}
const nextVersion = async (trx: Db, tenantId: string, docKey: string) => ((await documentStatusIn(trx, tenantId, docKey))?.version ?? 0) + 1;
async function cancelDoc(trx: Db, auth: AuthContext, docKey: string, reason: string) {
  if (!docKey) return;
  const s = await documentStatusIn(trx, auth.tenantId, docKey);
  if (s && s.status !== 'cancelled') await documentService.cancelIn(trx, auth, docKey, reason);
}
const head = (r: Row) => ({ docNo: r.doc_no, sourceSystem: 'erp', sourceRef: { type: 'stock_count', id: r.id, label: r.doc_no }, extra: { stockCount: `erp:kk:${r.id}` } });
const keys = (id: string) => ({ adjust: `erp:kk:${id}:dc`, transfer: `erp:kk:${id}:cl`, journal: `erp:kk:${id}:qd` });

/** Phần "ghi thiếu phiếu nhập" theo dòng (không đưa vào chứng từ điều chỉnh khi đã có quyết định). */
const missingReceiptOf = (causes: Cause[]) => {
  const m = new Map<string, number>();
  for (const c of causes) if (c.cause === 'missing_receipt') m.set(c.lineKey, r4((m.get(c.lineKey) ?? 0) + c.qty));
  return m;
};

/** Dòng chứng từ điều chỉnh tồn: chênh lệch theo lô, trừ phần thừa đã xác định do ghi thiếu phiếu nhập. */
function adjustLines(r: Row, excludeSurplus = new Map<string, number>()) {
  const out: Record<string, unknown>[] = [];
  for (const l of r.lines) {
    let d = diffOf(l);
    if (d > 0) d = r4(d - Math.min(d, excludeSurplus.get(l.lineKey) ?? 0));
    if (!d) continue;
    out.push({ lineKey: l.lineKey, sku: l.sku, name: l.name, unit: l.unit, qty: d, amount: 0, warehouseCode: r.warehouse_code || undefined, lotNo: l.lotNo || undefined, expDate: (l.newLot ? l.actualExpDate ?? l.expDate : l.expDate) ?? undefined });
  }
  return out;
}
async function postAdjust(trx: Db, auth: AuthContext, r: Row, lines: Record<string, unknown>[]) {
  const k = keys(r.id).adjust;
  if (!lines.length) { await cancelDoc(trx, auth, k, `Biên bản kiểm kê ${r.doc_no}: không còn chênh lệch`); return ''; }
  await ingest(trx, auth, {
    ...head(r), docType: 'stock_adjustment', direction: 'mixed', docKey: k, version: await nextVersion(trx, auth.tenantId, k),
    branchCode: r.branch_code, docDate: r.count_date, description: `Chênh lệch kiểm kê ${r.doc_no} · kho ${r.warehouse_code || 'mặc định'}`,
    lines, totals: { total: 0 },
  });
  return k;
}

/* ------------------------------------------------------------------ biên bản */

function checkLines(d: z.infer<typeof countInputSchema>) {
  const seen = new Set<string>();
  for (const l of d.lines) {
    if (seen.has(l.lineKey)) throw Errors.validation(`Trùng khoá dòng ${l.lineKey}`);
    seen.add(l.lineKey);
    if (r4(l.poorQty + l.lostQty) > l.countedQty) throw Errors.validation(`Dòng ${l.sku}${l.lotNo ? ` lô ${l.lotNo}` : ''}: số kém + mất phẩm chất (${r4(l.poorQty + l.lostQty)}) lớn hơn số kiểm kê (${l.countedQty})`);
  }
}

export async function createCount(trx: Db, auth: AuthContext, input: CountInput) {
  const d = countInputSchema.parse(input);
  checkLines(d);
  const b = await branchOf(trx, auth.tenantId, d.branchCode);
  const wh = await warehouseOf(trx, auth.tenantId, b.id, d.warehouseCode, 'Kho kiểm');
  if (d.quarantineWarehouse) await warehouseOf(trx, auth.tenantId, b.id, d.quarantineWarehouse, 'Kho cách ly');
  let docNo = d.docNo;
  if (!docNo) docNo = `KK${d.countDate.slice(2, 4)}${String(await documentNumbers.next(trx, auth.tenantId, 'kho:kiem-ke', Number(d.countDate.slice(0, 4)))).padStart(5, '0')}`;
  if ((await sql`SELECT 1 FROM stock_counts WHERE tenant_id = ${auth.tenantId} AND doc_no = ${docNo}`.execute(trx)).rows.length) throw Errors.conflict(`Số biên bản ${docNo} đã có`);
  const who = auth.actorName || auth.actor;
  const id = (await sql<{ id: string }>`
    INSERT INTO stock_counts (tenant_id, doc_no, count_date, branch_code, warehouse_code, quarantine_warehouse, purpose, conclusion, members, lines, created_by, updated_by)
    VALUES (${auth.tenantId}, ${docNo}, ${d.countDate}::date, ${d.branchCode}, ${wh.code}, ${d.quarantineWarehouse}, ${d.purpose}, ${d.conclusion},
            ${JSON.stringify(d.members)}::jsonb, ${JSON.stringify(d.lines)}::jsonb, ${who}, ${who})
    RETURNING id::text`.execute(trx)).rows[0]!.id;
  return getCount(trx, auth.tenantId, id);
}

export async function updateCount(trx: Db, auth: AuthContext, id: string, input: CountInput) {
  const cur = await load(trx, auth.tenantId, id, true);
  if (cur.status !== 'draft') throw Errors.conflict('Biên bản đã ghi nhận chênh lệch — bấm Bỏ ghi nhận trước khi sửa số kiểm kê');
  const d = countInputSchema.parse(input);
  checkLines(d);
  const b = await branchOf(trx, auth.tenantId, d.branchCode);
  const wh = await warehouseOf(trx, auth.tenantId, b.id, d.warehouseCode, 'Kho kiểm');
  if (d.quarantineWarehouse) await warehouseOf(trx, auth.tenantId, b.id, d.quarantineWarehouse, 'Kho cách ly');
  const docNo = d.docNo || cur.doc_no;
  if (docNo !== cur.doc_no && (await sql`SELECT 1 FROM stock_counts WHERE tenant_id = ${auth.tenantId} AND doc_no = ${docNo} AND id <> ${id}::bigint`.execute(trx)).rows.length) throw Errors.conflict(`Số biên bản ${docNo} đã có`);
  await sql`UPDATE stock_counts SET doc_no = ${docNo}, count_date = ${d.countDate}::date, branch_code = ${d.branchCode}, warehouse_code = ${wh.code},
      quarantine_warehouse = ${d.quarantineWarehouse}, purpose = ${d.purpose}, conclusion = ${d.conclusion}, members = ${JSON.stringify(d.members)}::jsonb,
      lines = ${JSON.stringify(d.lines)}::jsonb, updated_by = ${auth.actorName || auth.actor}, updated_at = now()
    WHERE tenant_id = ${auth.tenantId} AND id = ${id}::bigint`.execute(trx);
  return getCount(trx, auth.tenantId, id);
}

/**
 * Ghi nhận chênh lệch: chứng từ điều chỉnh tồn (thừa / thiếu theo lô) + chuyển hàng kém / mất phẩm chất sang kho cách ly.
 * Không có chênh lệch và không có hàng kém phẩm chất → không sinh chứng từ, biên bản chuyển thẳng "Đã xử lý".
 */
export async function recordCount(trx: Db, auth: AuthContext, id: string) {
  const r = await load(trx, auth.tenantId, id, true);
  if (r.status !== 'draft') throw Errors.conflict(`Biên bản đang ở trạng thái "${STATUS_TEXT[r.status]}"`);
  if (!r.lines.length) throw Errors.validation('Biên bản chưa có dòng kiểm — bấm Lấy số tồn trước');
  const adj = adjustLines(r);
  const bad = r.lines.filter((l) => l.poorQty + l.lostQty > 0);
  const b = await branchOf(trx, auth.tenantId, r.branch_code);
  if (bad.length) {
    if (!r.quarantine_warehouse) throw Errors.validation(`Có hàng kém / mất phẩm chất nhưng chưa chọn kho cách ly cho chi nhánh ${r.branch_code}`);
    const q = await warehouseOf(trx, auth.tenantId, b.id, r.quarantine_warehouse, 'Kho cách ly');
    if (q.code === r.warehouse_code) throw Errors.validation('Kho cách ly phải khác kho kiểm');
  }
  const who = auth.actorName || auth.actor;
  if (!adj.length && !bad.length) {
    await sql`UPDATE stock_counts SET status = 'settled', recorded_at = now(), recorded_by = ${who}, settled_at = now(), settled_by = ${who}, updated_by = ${who}, updated_at = now()
      WHERE tenant_id = ${auth.tenantId} AND id = ${id}::bigint`.execute(trx);
    return { ...(await getCount(trx, auth.tenantId, id)), message: 'Không có chênh lệch' };
  }
  await assertOpen(trx, auth.tenantId, r.branch_code, r.count_date, ['stock_adjustment', 'transfer']);
  const adjustKey = await postAdjust(trx, auth, r, adj);
  let transferKey = '';
  if (bad.length) {
    transferKey = keys(r.id).transfer;
    await ingest(trx, auth, {
      ...head(r), docType: 'transfer', docKey: transferKey, version: await nextVersion(trx, auth.tenantId, transferKey), status: 'received',
      branchCode: r.branch_code, toBranchCode: r.branch_code, docDate: r.count_date,
      description: `Kiểm kê ${r.doc_no}: hàng kém / mất phẩm chất sang kho cách ly ${r.quarantine_warehouse}`,
      lines: bad.map((l) => ({ lineKey: l.lineKey, sku: l.sku, name: l.name, unit: l.unit, qty: r4(l.poorQty + l.lostQty), amount: 0,
        warehouseCode: r.warehouse_code || undefined, toWarehouseCode: r.quarantine_warehouse, lotNo: l.lotNo || undefined, expDate: (l.newLot ? l.actualExpDate ?? l.expDate : l.expDate) ?? undefined })),
      totals: { total: 0 },
    });
  }
  const status = adj.length ? 'recorded' : 'settled';
  await sql`UPDATE stock_counts SET status = ${status}, adjust_doc_key = ${adjustKey}, transfer_doc_key = ${transferKey}, recorded_at = now(), recorded_by = ${who},
      ${status === 'settled' ? sql`settled_at = now(), settled_by = ${who},` : sql``} updated_by = ${who}, updated_at = now()
    WHERE tenant_id = ${auth.tenantId} AND id = ${id}::bigint`.execute(trx);
  return getCount(trx, auth.tenantId, id);
}

/** Bỏ ghi nhận: huỷ chứng từ điều chỉnh + chuyển kho cách ly (bút toán đảo), biên bản về nháp. Đã có quyết định thì huỷ quyết định trước. */
export async function unrecordCount(trx: Db, auth: AuthContext, id: string, reason: string) {
  const r = await load(trx, auth.tenantId, id, true);
  if (r.status === 'draft') throw Errors.conflict('Biên bản chưa ghi nhận chênh lệch');
  if (r.status === 'settled' && r.journal_doc_key) throw Errors.conflict('Biên bản đã có quyết định xử lý — huỷ quyết định trước');
  const why = `Bỏ ghi nhận kiểm kê ${r.doc_no}${reason ? `: ${reason}` : ''}`;
  await cancelDoc(trx, auth, r.transfer_doc_key, why);
  await cancelDoc(trx, auth, r.adjust_doc_key, why);
  await sql`UPDATE stock_counts SET status = 'draft', adjust_doc_key = '', transfer_doc_key = '', recorded_at = NULL, recorded_by = NULL, causes = '[]'::jsonb,
      verify_note = '', verified_at = NULL, verified_by = NULL, decision_no = '', decision_date = NULL, decision_signer = '', decision_reasons = '{}'::jsonb,
      settled_at = NULL, settled_by = NULL, updated_by = ${auth.actorName || auth.actor}, updated_at = now()
    WHERE tenant_id = ${auth.tenantId} AND id = ${id}::bigint`.execute(trx);
  return getCount(trx, auth.tenantId, id);
}

/** Kiểm nguyên nhân: đúng dòng chênh lệch, tổng số lượng mỗi dòng = |chênh lệch|, hướng hợp với thừa / thiếu. */
function checkCauses(r: Row, causes: Cause[]) {
  const byLine = new Map(r.lines.map((l) => [l.lineKey, l]));
  const sum = new Map<string, number>();
  for (const c of causes) {
    const l = byLine.get(c.lineKey);
    if (!l) throw Errors.validation(`Nguyên nhân trỏ tới dòng ${c.lineKey} không có trên biên bản`);
    const d = diffOf(l);
    if (!d) throw Errors.validation(`Dòng ${l.sku}${l.lotNo ? ` lô ${l.lotNo}` : ''} không có chênh lệch`);
    if (d < 0 && (c.cause === 'owned' || c.cause === 'missing_receipt')) throw Errors.validation(`Dòng ${l.sku}${l.lotNo ? ` lô ${l.lotNo}` : ''} thiếu — nguyên nhân "${c.cause === 'owned' ? 'thừa thuộc doanh nghiệp' : 'ghi thiếu phiếu nhập'}" chỉ dùng cho hàng thừa`);
    if (d > 0 && (c.cause === 'compensate' || c.cause === 'expense')) throw Errors.validation(`Dòng ${l.sku}${l.lotNo ? ` lô ${l.lotNo}` : ''} thừa — nguyên nhân "${c.cause === 'compensate' ? 'cá nhân bồi thường' : 'tính vào chi phí'}" chỉ dùng cho hàng thiếu`);
    sum.set(c.lineKey, r4((sum.get(c.lineKey) ?? 0) + c.qty));
  }
  const bad: string[] = [];
  for (const l of r.lines) {
    const d = Math.abs(diffOf(l));
    if (d && r4(sum.get(l.lineKey) ?? 0) !== d) bad.push(`${l.sku}${l.lotNo ? ` lô ${l.lotNo}` : ''} (chênh lệch ${d}, nguyên nhân ${r4(sum.get(l.lineKey) ?? 0)})`);
  }
  if (bad.length) throw Errors.validation(`Tổng số lượng nguyên nhân phải bằng chênh lệch: ${bad.join('; ')}`);
}

export async function verifyCount(trx: Db, auth: AuthContext, id: string, input: z.input<typeof verifySchema>) {
  const r = await load(trx, auth.tenantId, id, true);
  if (r.status !== 'recorded' && r.status !== 'verified') throw Errors.conflict(r.status === 'draft' ? 'Ghi nhận chênh lệch trước khi xác minh' : 'Biên bản đã có quyết định xử lý — huỷ quyết định trước khi sửa xác minh');
  const d = verifySchema.parse(input);
  checkCauses(r, d.causes);
  const who = auth.actorName || auth.actor;
  await sql`UPDATE stock_counts SET status = 'verified', causes = ${JSON.stringify(d.causes)}::jsonb, verify_note = ${d.note}, verified_at = now(), verified_by = ${who},
      updated_by = ${who}, updated_at = now() WHERE tenant_id = ${auth.tenantId} AND id = ${id}::bigint`.execute(trx);
  return getCount(trx, auth.tenantId, id);
}

/** Đơn giá bình quân tháng của từng mã (nhóm tính giá = đơn vị hạch toán của chi nhánh); thiếu mã nào thì báo. */
async function unitCosts(trx: Db, tenantId: string, unit: string, date: string, skus: string[]) {
  const [y, m] = date.split('-').map(Number) as [number, number];
  const rows = (await sql<{ sku: string; unit_cost: string }>`
    SELECT sku, unit_cost::text FROM inventory_costs WHERE tenant_id = ${tenantId} AND cost_group = ${unit}::bigint AND year = ${y} AND month = ${m} AND sku = ANY(${skus}::text[])`.execute(trx)).rows;
  const map = new Map(rows.map((x) => [x.sku, toNumber(x.unit_cost)]));
  const missing = skus.filter((s) => !map.has(s));
  if (missing.length) throw Errors.conflict(`Tính giá vốn tháng ${String(m).padStart(2, '0')}/${y} trước (chưa có đơn giá bình quân của ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '…' : ''}) — số tiền tất toán phải bằng số đã ghi 1381 / 3381`);
  return map;
}

/**
 * Quyết định xử lý: phiếu kế toán tất toán theo hướng xử lý (bồi thường / chi phí / thừa thuộc doanh nghiệp) với giá trị = số lượng ×
 * đơn giá bình quân tháng kiểm kê. "Ghi thiếu phiếu nhập": cần số phiếu nhập đã bổ sung; ghi lại chứng từ điều chỉnh bỏ phần thừa đó.
 * "Chưa rõ": không tất toán, chênh lệch còn trên 1381 / 3381.
 */
export async function decideCount(trx: Db, auth: AuthContext, id: string, input: z.input<typeof decideSchema>) {
  const r = await load(trx, auth.tenantId, id, true);
  if (r.status !== 'verified') throw Errors.conflict(r.status === 'settled' ? 'Biên bản đã có quyết định xử lý' : 'Lập biên bản xác minh trước khi ghi quyết định');
  const d = decideSchema.parse(input);
  const causes = d.causes ?? r.causes;
  checkCauses(r, causes);
  for (const c of causes) if (c.cause === 'missing_receipt' && !c.receiptDocNo) throw Errors.validation('Nguyên nhân "ghi thiếu phiếu nhập" cần số phiếu nhập đã bổ sung');
  for (const c of causes) if (c.cause === 'compensate' && !c.partnerCode) throw Errors.validation('Nguyên nhân "cá nhân bồi thường" cần đối tượng bồi thường');
  const need = [...new Set(causes.filter((c) => c.cause === 'compensate' || c.cause === 'expense' || c.cause === 'owned').map((c) => c.cause))];
  for (const k of need) if (!d.reasons[k as 'compensate' | 'expense' | 'owned']) throw Errors.validation(`Chưa chọn lý do phiếu kế toán cho hướng "${k === 'compensate' ? 'bồi thường' : k === 'expense' ? 'tính vào chi phí' : 'thừa thuộc doanh nghiệp'}"`);
  const b = await branchOf(trx, auth.tenantId, r.branch_code);
  const byLine = new Map(r.lines.map((l) => [l.lineKey, l]));
  const valued = causes.filter((c) => c.cause === 'compensate' || c.cause === 'expense' || c.cause === 'owned');
  await assertOpen(trx, auth.tenantId, r.branch_code, d.decisionDate, ['manual_journal', 'stock_adjustment']);
  const costs = valued.length ? await unitCosts(trx, auth.tenantId, b.unit, r.count_date, [...new Set(valued.map((c) => byLine.get(c.lineKey)!.sku))]) : new Map<string, number>();
  const lines = valued.map((c, i) => {
    const l = byLine.get(c.lineKey)!;
    const amount = Math.round(c.qty * (costs.get(l.sku) ?? 0));
    const what = c.cause === 'compensate' ? 'bồi thường' : c.cause === 'expense' ? 'tính vào chi phí' : 'thừa thuộc doanh nghiệp';
    // Đối tượng: bồi thường = người bồi thường (13888 theo dõi đúng người); còn lại = đối tượng của chi nhánh (CN-<mã>) — cùng đối tượng
    // lõi đã gắn cho 1381 / 3381 lúc tính giá vốn, để tất toán về 0 theo đối tượng. Phiếu kế toán chỉ có MỘT đối tượng cho cả Nợ và Có.
    return { lineKey: `Q${i + 1}`, reasonCode: d.reasons[c.cause as 'compensate' | 'expense' | 'owned']!, amount, partnerCode: c.cause === 'compensate' ? c.partnerCode! : `CN-${r.branch_code}`,
      description: `${l.sku}${l.lotNo ? ` lô ${l.lotNo}` : ''}: ${c.qty} ${l.unit} ${what}${c.note ? ` — ${c.note}` : ''}` };
  }).filter((x) => x.amount > 0);
  const missing = missingReceiptOf(causes);
  if (missing.size) await postAdjust(trx, auth, r, adjustLines(r, missing));
  let journalKey = '';
  if (lines.length) {
    journalKey = keys(r.id).journal;
    await ingest(trx, auth, {
      ...head(r), docType: 'manual_journal', docKey: journalKey, version: await nextVersion(trx, auth.tenantId, journalKey), docNo: d.decisionNo,
      branchCode: r.branch_code, docDate: d.decisionDate, description: `Xử lý chênh lệch kiểm kê ${r.doc_no} theo quyết định ${d.decisionNo}`,
      lines, totals: { total: lines.reduce((s, x) => s + x.amount, 0) },
    });
  }
  const who = auth.actorName || auth.actor;
  await sql`UPDATE stock_counts SET status = 'settled', causes = ${JSON.stringify(causes)}::jsonb, decision_no = ${d.decisionNo}, decision_date = ${d.decisionDate}::date,
      decision_signer = ${d.signer}, decision_reasons = ${JSON.stringify(d.reasons)}::jsonb, journal_doc_key = ${journalKey}, settled_at = now(), settled_by = ${who},
      updated_by = ${who}, updated_at = now() WHERE tenant_id = ${auth.tenantId} AND id = ${id}::bigint`.execute(trx);
  return getCount(trx, auth.tenantId, id);
}

/** Huỷ quyết định: huỷ phiếu kế toán tất toán, ghi lại chứng từ điều chỉnh đủ chênh lệch (nếu đã bỏ phần ghi thiếu phiếu nhập). */
export async function undecideCount(trx: Db, auth: AuthContext, id: string, reason: string) {
  const r = await load(trx, auth.tenantId, id, true);
  if (r.status !== 'settled' || !r.decision_no) throw Errors.conflict('Biên bản chưa có quyết định xử lý');
  await cancelDoc(trx, auth, r.journal_doc_key, `Huỷ quyết định ${r.decision_no} (kiểm kê ${r.doc_no})${reason ? `: ${reason}` : ''}`);
  if (missingReceiptOf(r.causes).size) await postAdjust(trx, auth, r, adjustLines(r));
  await sql`UPDATE stock_counts SET status = 'verified', decision_no = '', decision_date = NULL, decision_signer = '', decision_reasons = '{}'::jsonb, journal_doc_key = '',
      settled_at = NULL, settled_by = NULL, updated_by = ${auth.actorName || auth.actor}, updated_at = now() WHERE tenant_id = ${auth.tenantId} AND id = ${id}::bigint`.execute(trx);
  return getCount(trx, auth.tenantId, id);
}

/* ------------------------------------------------------------------ HTTP */

export async function stockCountRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const read = requirePermission('documents:read');
  r.get('/api/v1/kho/kiem-ke', {
    preHandler: read,
    schema: { tags, summary: 'Danh sách biên bản kiểm kê', querystring: z.object({ from: day.optional(), to: day.optional(), search: z.string().max(100).optional() }) },
    handler: async (req) => { const rows = await listCounts(db, authOf(req).tenantId, req.query); return ok(rows, { total: rows.length, page: 1, pageSize: rows.length }); },
  });
  r.get('/api/v1/kho/kiem-ke/so-ton', {
    preHandler: read,
    schema: { tags, summary: 'Số theo sổ từng mặt hàng × lô ở chi nhánh + phân kho đến hết ngày (Lấy số tồn)', querystring: z.object({ branchCode: z.string().min(1).max(32), warehouse: z.string().max(64).optional(), date: day, exceptId: z.string().regex(/^\d+$/).optional() }) },
    handler: async (req) => {
      const tenantId = authOf(req).tenantId;
      const except = req.query.exceptId ? Object.values(keys(req.query.exceptId)) : [];
      return ok(await bookStock(db, tenantId, { branchCode: req.query.branchCode, warehouse: req.query.warehouse, date: req.query.date, except }));
    },
  });
  r.get('/api/v1/kho/kiem-ke/:id', {
    preHandler: read,
    schema: { tags, summary: 'Một biên bản kiểm kê (kèm xác minh, quyết định)', params: idParamSchema },
    handler: async (req) => ok(await getCount(db, authOf(req).tenantId, String(req.params.id))),
  });
  mountActions(app, stockCountActions);
}

const anyOut = z.any();
const reasonBody = z.object({ reason: z.string().trim().max(500).default('') });
/** Biên bản kiểm kê sinh chứng từ điều chỉnh kho → dùng quyền của phiếu điều chỉnh kho (kho:dieu-chinh-lap / -huy). */
const countGate = (auth: AuthContext, op: 'create' | 'cancel'): void => {
  if (!canDocument(auth, 'stock_adjustment', op)) throw Errors.forbidden(`Không có quyền ${op === 'create' ? 'lập / ghi nhận / xử lý' : 'bỏ ghi nhận / huỷ quyết định'} biên bản kiểm kê (${documentPermissionOf('stock_adjustment', op)})`);
};
const act = (id: string, title: string, method: 'POST' | 'PUT', path: string, input: z.AnyZodObject, op: 'create' | 'cancel', fn: (trx: Db, auth: AuthContext, i: never) => Promise<unknown>) =>
  defineAction({
    id, title, tags, permission: 'documents:write', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input, output: anyOut, expose: { http: { method, path }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'stock_count', objectId: (i: { id?: string | number; docNo?: string }) => String(i.id ?? i.docNo ?? 'new') },
    handler: (ctx, i) => { countGate(ctx.legacyAuth, op); return fn(ctx.data.tx, ctx.legacyAuth, i as never); },
  });
export const stockCountActions: AnyActionDef[] = [
  act('kho.stock-count.create', 'Lập biên bản kiểm kê (nháp, chưa đụng sổ)', 'POST', '/api/v1/kho/kiem-ke', countInputSchema, 'create', (t, a, i) => createCount(t, a, i)),
  act('kho.stock-count.update', 'Sửa biên bản kiểm kê nháp', 'PUT', '/api/v1/kho/kiem-ke/:id', countInputSchema.merge(idParamSchema), 'create', (t, a, i: CountInput & { id: string }) => { const { id, ...b } = i; return updateCount(t, a, String(id), b); }),
  act('kho.stock-count.record', 'Ghi nhận chênh lệch kiểm kê (điều chỉnh tồn + chuyển kho cách ly)', 'POST', '/api/v1/kho/kiem-ke/:id/ghi-nhan', idParamSchema, 'create', (t, a, i: { id: string }) => recordCount(t, a, String(i.id))),
  act('kho.stock-count.unrecord', 'Bỏ ghi nhận chênh lệch kiểm kê (huỷ chứng từ, biên bản về nháp)', 'POST', '/api/v1/kho/kiem-ke/:id/bo-ghi-nhan', reasonBody.merge(idParamSchema), 'cancel', (t, a, i: { id: string; reason: string }) => unrecordCount(t, a, String(i.id), i.reason)),
  act('kho.stock-count.verify', 'Biên bản xác minh chênh lệch kiểm kê', 'POST', '/api/v1/kho/kiem-ke/:id/xac-minh', verifySchema.merge(idParamSchema), 'create', (t, a, i: z.input<typeof verifySchema> & { id: string }) => { const { id, ...b } = i; return verifyCount(t, a, String(id), b); }),
  act('kho.stock-count.decide', 'Quyết định xử lý chênh lệch kiểm kê (phiếu kế toán tất toán)', 'POST', '/api/v1/kho/kiem-ke/:id/quyet-dinh', decideSchema.merge(idParamSchema), 'create', (t, a, i: z.input<typeof decideSchema> & { id: string }) => { const { id, ...b } = i; return decideCount(t, a, String(id), b); }),
  act('kho.stock-count.undecide', 'Huỷ quyết định xử lý chênh lệch kiểm kê', 'POST', '/api/v1/kho/kiem-ke/:id/huy-quyet-dinh', reasonBody.merge(idParamSchema), 'cancel', (t, a, i: { id: string; reason: string }) => undecideCount(t, a, String(i.id), i.reason)),
];
