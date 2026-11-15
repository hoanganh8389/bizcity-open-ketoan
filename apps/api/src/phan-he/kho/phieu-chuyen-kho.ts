// @bizcity-layer D modules/kho
// [2026-11-10 08:30 PM Nguyễn Văn Thủy] PHASE-026 — phiếu chuyển kho lập trên phần mềm kế toán (KHO01): lưu là xuất, thủ kho nhập xác nhận mới nhập (đóng góp)
/**
 * PHIẾU CHUYỂN KHO (KHO01) — lập trên phần mềm kế toán, cả hai đầu trên một phiếu (bảng stock_transfer_docs, 0099).
 * Không có sổ riêng: phiếu vào sổ thành HAI chứng từ "transfer" một đầu qua cửa ghi sổ của lõi (postDocumentIn):
 *   - Lưu phiếu = XUẤT: ghi ngay chứng từ đầu xuất (out_doc_key). Tồn chi nhánh + phân kho xuất giảm, hàng nằm trên tài khoản
 *     hàng đang chuyển. Dòng có số lô thì xuất đúng lô; trống thì lõi tự chọn lô hạn sớm trước.
 *   - Thủ kho nhập XÁC NHẬN: ghi chứng từ đầu nhập (in_doc_key) theo SỐ THỰC NHẬN, vào đúng các lô bên xuất đã xuất.
 *     Nhận thiếu thì phần chênh còn trên tài khoản hàng đang chuyển để xử lý. Cùng chi nhánh (chuyển giữa hai kho) thì
 *     mặc định nhận luôn khi lưu.
 *   - [2026-11-15 Nguyễn Văn Thủy] Nháp: "Ghi nháp" (mode=draft) chưa trừ tồn, chưa vào sổ; "Duyệt xuất" (…/ship) mới ghi đầu xuất (đóng góp).
 *   - Sửa sau khi duyệt xuất = BẢN ĐIỀU CHỈNH (…/adjust, bắt buộc lý do): sổ giữ bản đã duyệt; đầu nhận bị KHOÁ NHẬN tới khi duyệt.
 *       Chưa nhận: điều chỉnh đầu xuất. Đã nhận: điều chỉnh cả hai đầu — bên nhận phải XÁC NHẬN (…/adjust-confirm) rồi mới duyệt.
 *       Duyệt (…/adjust-approve): ghi phiên bản mới từng đầu, lõi đảo bút toán cũ bằng số âm; lưu lý do + thay đổi vào lịch sử.
 *       Phiếu XK-VCNB điện tử đã phát hành (einvoice) thì khi duyệt ghi số phiếu thay thế / điều chỉnh vào lịch sử.
 *   - Đã nhận mà chỉ lệch số nhận: BIÊN BẢN CHÊNH LỆCH = xác nhận nhận lại số thực nhận, bắt buộc ghi chú, lưu lịch sử.
 *   - Từ chối nhận: huỷ đầu xuất (trả tồn bên chuyển). Huỷ phiếu: huỷ cả hai đầu. Không xoá phiếu.
 * Phiếu chuyển từ website bán hàng (cầu nối) vẫn đi thẳng vào sổ như trước, không qua bảng này.
 *
 *   GET  /api/v1/kho/transfers?from=&to=&branchCodes=&warehouses=&status=&search=   danh sách
 *   GET  /api/v1/kho/transfers/:id                                                 một phiếu (kèm lô đã xuất từng dòng)
 *   GET  /api/v1/kho/transfers/stock?branchCode=&warehouse=&date=&skus=&exceptId=   tồn của các mã ở chi nhánh + phân kho
 *   POST /api/v1/kho/transfers                 lập (= xuất)          PUT /api/v1/kho/transfers/:id      sửa
 *   POST /api/v1/kho/transfers/:id/receive     xác nhận nhận         POST /…/:id/unreceive              bỏ xác nhận nhận
 *   POST /api/v1/kho/transfers/:id/reject      bên nhận từ chối      POST /…/:id/cancel                 huỷ phiếu
 *   POST /…/:id/ship  duyệt xuất (phiếu nháp)   POST /…/:id/adjust {reason}  lập điều chỉnh   POST /…/:id/adjust-confirm  bên nhận xác nhận
 *   POST /…/:id/adjust-approve {einvoiceReplacement?}  duyệt điều chỉnh   POST /…/:id/adjust-cancel  huỷ điều chỉnh
 *   PUT  /…/:id/einvoice {no, serial, date}  ghi số phiếu xuất kho kiêm vận chuyển nội bộ điện tử đã phát hành
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql } from 'kysely';
import { ingestDocumentSchema, type IngestDocument } from '@ketoan/contracts';
import { zodIssueTexts } from '@bizcity/platform/core/http';
import { db, toNumber, type Db } from '../../db/client.js';
import { authOf, documentPermissionOf, requirePermission, type AuthContext } from '../../core/auth.js';
import { Errors } from '../../core/errors.js';
import { idParamSchema, ok } from '../../core/http.js';
import { defineAction, mountActions, type AnyActionDef } from '../../core/actions.js';
import { documentNumbers, documentService, documentStatusIn, postDocumentIn } from '../../kernel/public.js';
import { documentLots } from '../../modules/lots/lots.service.js';
import { quyenThaoTac } from '../../modules/access/man-hinh.js';
import { writeAudit } from '../../core/audit.js';
import './man-hinh-kho.js'; // đăng ký màn KHO01 / KHO02 trước khi lệnh đọc quyền

const tags = ['Kho — phiếu chuyển kho'];
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export const transferLineSchema = z.object({
  lineKey: z.string().trim().min(1).max(64),
  sku: z.string().trim().min(1, 'Dòng thiếu mã hàng').max(64),
  name: z.string().trim().max(500).default(''),
  unit: z.string().trim().max(32).default(''),
  qty: z.number().finite().positive('Số lượng phải lớn hơn 0'),
  /** Số thực nhận; trống = nhận đủ. */
  receivedQty: z.number().finite().min(0).optional(),
  lotNo: z.string().trim().max(64).optional().transform((x) => x || undefined),
  expDate: day.optional().or(z.literal('')).transform((x) => x || undefined),
  note: z.string().trim().max(500).optional().transform((x) => x || undefined),
});
export type TransferLine = z.infer<typeof transferLineSchema>;

export const transferInputSchema = z.object({
  docNo: z.string().trim().max(64).default(''),
  docDate: day,
  fromBranchCode: z.string().trim().min(1, 'Chưa chọn chi nhánh xuất').max(32),
  fromWarehouse: z.string().trim().max(64).default(''),
  toBranchCode: z.string().trim().min(1, 'Chưa chọn chi nhánh nhập').max(32),
  toWarehouse: z.string().trim().max(64).default(''),
  reasonCode: z.string().trim().max(32).optional().transform((x) => x || undefined),
  note: z.string().trim().max(1000).default(''),
  lines: z.array(transferLineSchema).min(1, 'Phiếu chưa có dòng hàng').max(2000),
  /** Nhận luôn khi lưu (mặc định: cùng chi nhánh thì nhận luôn, khác chi nhánh thì chờ thủ kho nhập xác nhận). */
  receiveNow: z.boolean().optional(),
  /** draft = ghi nháp (chưa trừ tồn); ship = duyệt xuất luôn (mặc định — giữ cách cũ "lưu là xuất"). */
  mode: z.enum(['draft', 'ship']).optional(),
});
export type TransferInput = z.infer<typeof transferInputSchema>;

export const receiveSchema = z.object({
  receivedDate: day.optional(),
  /** Số thực nhận theo dòng; dòng không gửi = nhận đủ. */
  lines: z.array(z.object({ lineKey: z.string().min(1).max(64), receivedQty: z.number().finite().min(0) })).max(2000).default([]),
  note: z.string().trim().max(500).default(''),
});

interface Row {
  id: string; doc_no: string; doc_date: string; from_branch_code: string; from_warehouse: string; to_branch_code: string; to_warehouse: string;
  reason_code: string | null; note: string; status: string; lines: TransferLine[]; received_date: string | null; received_by: string | null;
  received_note: string; out_doc_key: string; in_doc_key: string; created_by: string | null; updated_by: string | null; created_at: string; updated_at: string;
  adjust: AdjustState | null; adjustments: HistoryItem[]; einvoice: EInvoice | null;
}
interface EInvoice { no: string; serial?: string; date?: string }
interface AdjustState { reason: string; by: string; at: string; both: boolean; confirmedBy?: string; confirmedAt?: string; snapshot: Record<string, unknown> }
interface HistoryItem { kind: 'adjust' | 'chenh_lech'; reason: string; by: string; at: string; both?: boolean; confirmedBy?: string; approvedBy?: string; approvedAt?: string; changes: string[]; einvoiceOld?: EInvoice | null; einvoiceNew?: EInvoice | null }

const COLS = sql`id::text, doc_no, doc_date::text, from_branch_code, from_warehouse, to_branch_code, to_warehouse, reason_code, note, status, lines,
  received_date::text, received_by, received_note, out_doc_key, in_doc_key, created_by, updated_by, created_at::text, updated_at::text, adjust, adjustments, einvoice`;

function view(r: Row) {
  const lines = r.lines.map((l) => ({ ...l, receivedQty: l.receivedQty ?? (r.status === 'received' ? l.qty : undefined) }));
  const qty = round4(lines.reduce((s, l) => s + l.qty, 0));
  const received = r.status === 'received' ? round4(lines.reduce((s, l) => s + (l.receivedQty ?? l.qty), 0)) : 0;
  return {
    id: r.id, docNo: r.doc_no, docDate: r.doc_date, fromBranchCode: r.from_branch_code, fromWarehouse: r.from_warehouse, toBranchCode: r.to_branch_code,
    toWarehouse: r.to_warehouse, reasonCode: r.reason_code ?? undefined, note: r.note, status: r.status, lines, receivedDate: r.received_date ?? undefined,
    receivedBy: r.received_by ?? undefined, receivedNote: r.received_note, outDocKey: r.out_doc_key, inDocKey: r.in_doc_key,
    createdBy: r.created_by ?? undefined, updatedBy: r.updated_by ?? undefined, createdAt: r.created_at, updatedAt: r.updated_at,
    totalQty: qty, totalReceived: received, short: r.status === 'received' && received < qty,
    adjust: r.adjust ? { reason: r.adjust.reason, by: r.adjust.by, at: r.adjust.at, both: r.adjust.both, confirmedBy: r.adjust.confirmedBy, confirmedAt: r.adjust.confirmedAt } : undefined,
    adjustments: r.adjustments ?? [], einvoice: r.einvoice ?? undefined,
  };
}
export type TransferView = ReturnType<typeof view>;

async function load(trx: Db, tenantId: string, id: string, forUpdate = false): Promise<Row> {
  const r = (await sql<Row>`SELECT ${COLS} FROM stock_transfer_docs WHERE tenant_id = ${tenantId} AND id = ${id}::bigint ${forUpdate ? sql`FOR UPDATE` : sql``}`.execute(trx)).rows[0];
  if (!r) throw Errors.notFound('phiếu chuyển kho');
  return r;
}

const list = (s?: string) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);

export async function listTransfers(trx: Db, tenantId: string, q: { from?: string; to?: string; branchCodes?: string; warehouses?: string; status?: string; search?: string }) {
  const codes = list(q.branchCodes);
  const whs = list(q.warehouses);
  const s = q.search?.trim() ? `%${q.search.trim().toLowerCase()}%` : null;
  const rows = (await sql<Row>`
    SELECT ${COLS} FROM stock_transfer_docs
     WHERE tenant_id = ${tenantId}
       ${q.from ? sql`AND doc_date >= ${q.from}::date` : sql``} ${q.to ? sql`AND doc_date <= ${q.to}::date` : sql``}
       ${codes.length ? sql`AND (from_branch_code = ANY(${codes}::text[]) OR to_branch_code = ANY(${codes}::text[]))` : sql``}
       ${whs.length ? sql`AND (from_warehouse = ANY(${whs}::text[]) OR to_warehouse = ANY(${whs}::text[]))` : sql``}
       ${q.status === 'pending' ? sql`AND status = 'shipped'` : q.status ? sql`AND status = ${q.status}` : sql``}
       ${s ? sql`AND (lower(doc_no) LIKE ${s} OR lower(note) LIKE ${s} OR lower(lines::text) LIKE ${s})` : sql``}
     ORDER BY doc_date DESC, id DESC LIMIT 5000`.execute(trx)).rows;
  return rows.map(view);
}

/** Một phiếu + các lô đầu xuất đã xuất theo từng dòng (dòng không ghi lô thì lõi tự chọn — xem ở đây). */
export async function getTransfer(trx: Db, tenantId: string, id: string) {
  const r = await load(trx, tenantId, id);
  const v = view(r);
  let lots: Record<string, { lotNo: string; expDate: string | null; qty: number }[]> = {};
  try {
    if (r.status !== 'cancelled' && r.status !== 'rejected') {
      const d = await documentLots(trx, tenantId, r.out_doc_key);
      lots = Object.fromEntries(d.lines.map((l) => [r.lines[l.lineNo - 1]?.lineKey ?? String(l.lineNo), l.lots.map((x) => ({ lotNo: x.lotNo, expDate: x.expDate, qty: x.qty }))]));
    }
  } catch { /* chứng từ đầu xuất chưa có (dữ liệu cũ) */ }
  const ev = (await sql<{ doc_key: string; status: string; version: number }>`
    SELECT doc_key, status, version FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key IN (${r.out_doc_key}, ${r.in_doc_key})`.execute(trx)).rows;
  const leg = (k: string) => { const e = ev.find((x) => x.doc_key === k); return e ? { status: e.status, version: e.version } : null; };
  return { ...v, outLots: lots, ledger: { out: leg(r.out_doc_key), in: leg(r.in_doc_key) } };
}

/**
 * Tồn của các mã ở một chi nhánh + phân kho tại ngày (trống phân kho = kho mặc định), không tính chính phiếu đang sửa.
 * Theo thẻ kho của lõi (inventory_movements) — cùng số với báo cáo nhập xuất tồn.
 */
export async function stockAt(trx: Db, tenantId: string, q: { branchCode: string; warehouse?: string; date?: string; skus: string[]; exceptId?: string }) {
  if (!q.skus.length) return {};
  const b = (await sql<{ id: string }>`SELECT id::text FROM branches WHERE tenant_id = ${tenantId} AND code = ${q.branchCode}`.execute(trx)).rows[0];
  if (!b) throw Errors.validation(`Chi nhánh ${q.branchCode} không có`);
  // Dòng thẻ kho cũ ghi mã kho trống = kho mặc định của chi nhánh (cùng luật báo cáo kho, phân lô).
  const def = await warehouseOf(trx, tenantId, b.id, '', 'Kho');
  const wh = q.warehouse?.trim() || def;
  const except = q.exceptId ? (await sql<{ k: string }>`SELECT out_doc_key AS k FROM stock_transfer_docs WHERE tenant_id = ${tenantId} AND id = ${q.exceptId}::bigint
                                                       UNION ALL SELECT in_doc_key FROM stock_transfer_docs WHERE tenant_id = ${tenantId} AND id = ${q.exceptId}::bigint`.execute(trx)).rows.map((x) => x.k) : [];
  const rows = (await sql<{ sku: string; qty: string }>`
    SELECT im.sku, sum(im.qty)::text AS qty
      FROM inventory_movements im JOIN accounting_events e ON e.id = im.event_id
     WHERE im.tenant_id = ${tenantId} AND im.branch_id = ${b.id} AND ${wh === def ? sql`im.warehouse_code IN (${wh}, '')` : sql`im.warehouse_code = ${wh}`}
       AND im.sku = ANY(${q.skus}::text[]) ${q.date ? sql`AND im.doc_date <= ${q.date}::date` : sql``}
       ${except.length ? sql`AND NOT (e.doc_key = ANY(${except}::text[]))` : sql``}
     GROUP BY im.sku`.execute(trx)).rows;
  const out: Record<string, number> = Object.fromEntries(q.skus.map((s) => [s, 0]));
  for (const r of rows) out[r.sku] = toNumber(r.qty);
  return { warehouse: wh, stock: out };
}

/* ------------------------------------------------------------------ kiểm tra + ghi sổ */

async function branchOf(trx: Db, tenantId: string, code: string, label: string) {
  const b = (await sql<{ id: string; code: string; is_active: boolean }>`SELECT id::text, code, is_active FROM branches WHERE tenant_id = ${tenantId} AND code = ${code}`.execute(trx)).rows[0];
  if (!b) throw Errors.validation(`${label} ${code} chưa có trong danh mục chi nhánh`);
  return b;
}
/** Phân kho thật của một đầu: ghi thì phải thuộc chi nhánh và đang dùng; trống = kho mặc định của chi nhánh. */
async function warehouseOf(trx: Db, tenantId: string, branchId: string, code: string, label: string): Promise<string> {
  const ws = (await sql<{ code: string; is_default: boolean; is_active: boolean }>`SELECT code, is_default, is_active FROM warehouses WHERE tenant_id = ${tenantId} AND branch_id = ${branchId} ORDER BY id`.execute(trx)).rows;
  if (code) {
    const w = ws.find((x) => x.code === code);
    if (!w) throw Errors.validation(`${label} ${code} không thuộc chi nhánh đã chọn`);
    if (!w.is_active) throw Errors.validation(`${label} ${code} đã ngừng dùng`);
    return code;
  }
  const active = ws.filter((x) => x.is_active);
  return (active.find((x) => x.is_default) ?? (active.length === 1 ? active[0] : undefined))?.code ?? '';
}

async function validate(trx: Db, tenantId: string, d: TransferInput) {
  const from = await branchOf(trx, tenantId, d.fromBranchCode, 'Chi nhánh xuất');
  const to = await branchOf(trx, tenantId, d.toBranchCode, 'Chi nhánh nhập');
  const fromWh = await warehouseOf(trx, tenantId, from.id, d.fromWarehouse, 'Kho xuất');
  const toWh = await warehouseOf(trx, tenantId, to.id, d.toWarehouse, 'Kho nhập');
  if (from.id === to.id && fromWh === toWh) throw Errors.validation('Cùng chi nhánh thì kho xuất và kho nhập phải khác nhau');
  const keys = new Set<string>();
  for (const l of d.lines) {
    if (keys.has(l.lineKey)) throw Errors.validation(`Trùng khoá dòng ${l.lineKey}`);
    keys.add(l.lineKey);
    if (l.receivedQty !== undefined && l.receivedQty > l.qty) throw Errors.validation(`Dòng ${l.sku}: số nhận (${l.receivedQty}) lớn hơn số xuất (${l.qty})`);
  }
  return { fromWh, toWh, sameBranch: from.id === to.id };
}

async function nextVersion(trx: Db, tenantId: string, docKey: string) {
  return ((await documentStatusIn(trx, tenantId, docKey))?.version ?? 0) + 1;
}

async function ingest(trx: Db, auth: AuthContext, raw: Record<string, unknown>) {
  const parsed = ingestDocumentSchema.safeParse(raw);
  if (!parsed.success) throw Errors.validation('Chứng từ chuyển kho dựng từ phiếu không đúng khuôn', zodIssueTexts(parsed.error));
  await postDocumentIn(trx, auth, parsed.data as IngestDocument, { post: true, force: true });
  const e = (await sql<{ status: string; error_message: string | null }>`SELECT status, error_message FROM accounting_events WHERE tenant_id = ${auth.tenantId} AND doc_key = ${String(raw.docKey)}`.execute(trx)).rows[0];
  if (e?.status === 'error') throw Errors.posting(`Không ghi sổ được: ${e.error_message ?? ''}`);
}

const head = (r: Row) => ({ docNo: r.doc_no, docDate: r.doc_date, reasonCode: r.reason_code ?? undefined, sourceSystem: 'erp', sourceRef: { type: 'stock_transfer', id: r.id, label: r.doc_no }, extra: { transferGroup: `erp:ck:${r.id}` } });

/** Đầu XUẤT: chi nhánh + phân kho xuất, đúng số xuất; lô theo dòng (trống = lõi tự chọn hạn sớm trước). */
async function postOut(trx: Db, auth: AuthContext, r: Row) {
  await ingest(trx, auth, {
    ...head(r), docType: 'transfer', leg: 'out', docKey: r.out_doc_key, version: await nextVersion(trx, auth.tenantId, r.out_doc_key),
    branchCode: r.from_branch_code, toBranchCode: r.to_branch_code,
    description: r.note || `Xuất chuyển kho ${r.doc_no} → ${r.to_branch_code}${r.to_warehouse ? ` · ${r.to_warehouse}` : ''}`,
    lines: r.lines.map((l) => ({ lineKey: l.lineKey, sku: l.sku, name: l.name, unit: l.unit, qty: l.qty, amount: 0, warehouseCode: r.from_warehouse || undefined, lotNo: l.lotNo, expDate: l.expDate })),
    totals: { total: 0 },
  });
}

/**
 * Đầu NHẬP: chi nhánh + phân kho nhập, theo số thực nhận. Lô: dòng ghi lô thì đúng lô đó; không thì đúng các lô đầu xuất đã xuất
 * cho dòng đó (theo thứ tự), phần còn lại vào lô không số.
 */
async function postIn(trx: Db, auth: AuthContext, r: Row) {
  const out = await documentLots(trx, auth.tenantId, r.out_doc_key).catch(() => null);
  const lines: Record<string, unknown>[] = [];
  r.lines.forEach((l, i) => {
    let left = l.receivedQty ?? l.qty;
    if (left <= 0) return;
    const base = { sku: l.sku, name: l.name, unit: l.unit, amount: 0, warehouseCode: r.to_warehouse || undefined };
    if (!l.lotNo) {
      const outLots = out?.lines.find((x) => x.lineNo === i + 1)?.lots.filter((x) => x.dir === 'out') ?? [];
      outLots.forEach((x, k) => {
        const take = round4(Math.min(left, x.qty));
        if (take <= 0) return;
        lines.push({ ...base, lineKey: `${l.lineKey}.${k + 1}`, qty: take, lotNo: x.lotNo || undefined, expDate: x.expDate ?? undefined });
        left = round4(left - take);
      });
    }
    if (left > 0) lines.push({ ...base, lineKey: l.lotNo ? l.lineKey : `${l.lineKey}.0`, qty: left, lotNo: l.lotNo, expDate: l.expDate });
  });
  if (!lines.length) {
    await cancelLeg(trx, auth, r.in_doc_key, `Phiếu ${r.doc_no}: nhận 0`);
    return;
  }
  await ingest(trx, auth, {
    ...head(r), docType: 'transfer', leg: 'in', docKey: r.in_doc_key, version: await nextVersion(trx, auth.tenantId, r.in_doc_key),
    docDate: r.received_date ?? r.doc_date, branchCode: r.to_branch_code, fromBranchCode: r.from_branch_code,
    description: r.received_note || r.note || `Nhận chuyển kho ${r.doc_no} ← ${r.from_branch_code}${r.from_warehouse ? ` · ${r.from_warehouse}` : ''}`,
    lines, totals: { total: 0 },
  });
}

async function cancelLeg(trx: Db, auth: AuthContext, docKey: string, reason: string) {
  const s = await documentStatusIn(trx, auth.tenantId, docKey);
  if (s && s.status !== 'cancelled') await documentService.cancelIn(trx, auth, docKey, reason);
}

async function touch(trx: Db, auth: AuthContext, id: string, patch: Record<string, unknown>) {
  const JSONB = ['lines', 'adjust', 'adjustments', 'einvoice'];
  const sets = Object.entries(patch).map(([k, v]) => (JSONB.includes(k) ? sql`${sql.ref(k)} = ${v === null ? null : JSON.stringify(v)}::jsonb` : sql`${sql.ref(k)} = ${v}`));
  await sql`UPDATE stock_transfer_docs SET ${sql.join([...sets, sql`updated_by = ${auth.actorName || auth.actor}`, sql`updated_at = now()`])} WHERE tenant_id = ${auth.tenantId} AND id = ${id}::bigint`.execute(trx);
}

/** Lập phiếu = xuất ngay; cùng chi nhánh (hoặc receiveNow) thì nhận luôn. */
export async function createTransfer(trx: Db, auth: AuthContext, input: TransferInput) {
  const d = transferInputSchema.parse(input);
  const { fromWh, toWh, sameBranch } = await validate(trx, auth.tenantId, d);
  let docNo = d.docNo;
  if (!docNo) docNo = `CK${d.docDate.slice(2, 4)}${String(await documentNumbers.next(trx, auth.tenantId, 'kho:transfer', Number(d.docDate.slice(0, 4)))).padStart(5, '0')}`;
  const dup = (await sql<{ id: string }>`SELECT id::text FROM stock_transfer_docs WHERE tenant_id = ${auth.tenantId} AND doc_no = ${docNo}`.execute(trx)).rows[0];
  if (dup) throw Errors.conflict(`Số phiếu ${docNo} đã có`);
  const draft = d.mode === 'draft';
  const receive = !draft && (d.receiveNow ?? sameBranch);
  const id = (await sql<{ id: string }>`
    INSERT INTO stock_transfer_docs (tenant_id, doc_no, doc_date, from_branch_code, from_warehouse, to_branch_code, to_warehouse, reason_code, note, status, lines,
                                     received_date, received_by, out_doc_key, in_doc_key, created_by, updated_by)
    VALUES (${auth.tenantId}, ${docNo}, ${d.docDate}::date, ${d.fromBranchCode}, ${fromWh}, ${d.toBranchCode}, ${toWh}, ${d.reasonCode ?? null}, ${d.note},
            ${draft ? 'draft' : receive ? 'received' : 'shipped'}, ${JSON.stringify(d.lines)}::jsonb, ${receive ? d.docDate : null}::date, ${receive ? auth.actorName || auth.actor : null},
            '', '', ${auth.actorName || auth.actor}, ${auth.actorName || auth.actor})
    RETURNING id::text`.execute(trx)).rows[0]!.id;
  await sql`UPDATE stock_transfer_docs SET out_doc_key = ${`erp:ck:${id}:out`}, in_doc_key = ${`erp:ck:${id}:in`} WHERE id = ${id}::bigint`.execute(trx);
  const r = await load(trx, auth.tenantId, id);
  if (!draft) {
    await postOut(trx, auth, r);
    if (receive) await postIn(trx, auth, r);
  }
  return getTransfer(trx, auth.tenantId, id);
}

/** Duyệt xuất phiếu nháp: ghi đầu xuất (trừ tồn bên chuyển); cùng chi nhánh / receiveNow thì nhận luôn. */
export async function shipTransfer(trx: Db, auth: AuthContext, id: string, receiveNow?: boolean) {
  const cur = await load(trx, auth.tenantId, id, true);
  if (cur.status !== 'draft') throw Errors.conflict('Chỉ duyệt xuất phiếu nháp');
  const receive = receiveNow ?? cur.from_branch_code === cur.to_branch_code;
  await touch(trx, auth, id, receive ? { status: 'received', received_date: cur.doc_date, received_by: auth.actorName || auth.actor } : { status: 'shipped' });
  const r = await load(trx, auth.tenantId, id);
  await postOut(trx, auth, r);
  if (receive) await postIn(trx, auth, r);
  return getTransfer(trx, auth.tenantId, id);
}

/**
 * Sửa phiếu. Nháp: sửa tự do (mode=ship thì duyệt xuất luôn). Đã duyệt xuất / đã nhận: chỉ sửa được khi đang ĐIỀU CHỈNH — ghi nội dung,
 * KHÔNG ghi sổ (sổ giữ bản đã duyệt tới khi duyệt điều chỉnh).
 */
export async function updateTransfer(trx: Db, auth: AuthContext, id: string, input: TransferInput) {
  const cur = await load(trx, auth.tenantId, id, true);
  if (cur.status === 'cancelled') throw Errors.conflict('Phiếu đã huỷ, không sửa được');
  if (cur.status === 'rejected') throw Errors.conflict('Phiếu đã bị bên nhận từ chối, không sửa được — lập phiếu mới');
  if (cur.status === 'shipped' && !cur.adjust) throw Errors.conflict('Phiếu đã duyệt xuất: bấm "Lập điều chỉnh" (ghi lý do) rồi mới sửa — đầu nhận bị khoá nhận trong lúc điều chỉnh');
  if (cur.status === 'received' && !cur.adjust) throw Errors.conflict('Đầu nhận đã nhận: lệch số nhận thì lập biên bản chênh lệch; sai phiếu thì đề nghị điều chỉnh hai đầu (bên nhận xác nhận)');
  const d = transferInputSchema.parse(input);
  const { fromWh, toWh } = await validate(trx, auth.tenantId, d);
  const docNo = d.docNo || cur.doc_no;
  if (docNo !== cur.doc_no) {
    const dup = (await sql<{ id: string }>`SELECT id::text FROM stock_transfer_docs WHERE tenant_id = ${auth.tenantId} AND doc_no = ${docNo} AND id <> ${id}::bigint`.execute(trx)).rows[0];
    if (dup) throw Errors.conflict(`Số phiếu ${docNo} đã có`);
  }
  // Số nhận đã ghi khác số xuất (nhận thiếu) thì giữ; còn lại theo số xuất mới (nhận đủ).
  const lines = d.lines.map((l) => {
    const old = cur.lines.find((x) => x.lineKey === l.lineKey);
    const keep = l.receivedQty ?? (old && old.receivedQty !== undefined && old.receivedQty !== old.qty ? Math.min(old.receivedQty, l.qty) : undefined);
    return { ...l, receivedQty: keep };
  });
  await touch(trx, auth, id, {
    doc_no: docNo, doc_date: d.docDate, from_branch_code: d.fromBranchCode, from_warehouse: fromWh, to_branch_code: d.toBranchCode, to_warehouse: toWh,
    reason_code: d.reasonCode ?? null, note: d.note, lines,
  });
  if (cur.status === 'received' && cur.received_date && cur.received_date < d.docDate) await touch(trx, auth, id, { received_date: d.docDate });
  if (cur.status === 'draft' && d.mode === 'ship') return shipTransfer(trx, auth, id, d.receiveNow);
  return getTransfer(trx, auth.tenantId, id);
}

/* ------------------------------------------------------------------ điều chỉnh sau khi duyệt xuất */

const SNAP_COLS = ['doc_no', 'doc_date', 'from_branch_code', 'from_warehouse', 'to_branch_code', 'to_warehouse', 'reason_code', 'note', 'lines', 'received_date', 'received_by', 'received_note'] as const;

/** Những gì đổi giữa bản chụp và bản hiện tại (câu ngắn cho lịch sử). */
function diffText(before: Record<string, unknown>, after: Row): string[] {
  const out: string[] = [];
  const head: [string, string][] = [['doc_date', 'Ngày'], ['from_branch_code', 'Chi nhánh xuất'], ['from_warehouse', 'Kho xuất'], ['to_branch_code', 'Chi nhánh nhập'], ['to_warehouse', 'Kho nhập'], ['note', 'Diễn giải']];
  for (const [k, label] of head) if (String(before[k] ?? '') !== String((after as unknown as Record<string, unknown>)[k] ?? '')) out.push(`${label}: ${before[k] ?? ''} → ${(after as unknown as Record<string, unknown>)[k] ?? ''}`);
  const bl = (before.lines as TransferLine[]) ?? [];
  const key = (l: TransferLine) => `${l.sku}|${l.lotNo ?? ''}`;
  const sum = (ls: TransferLine[], f: (l: TransferLine) => number) => ls.reduce((m, l) => m.set(key(l), (m.get(key(l)) ?? 0) + f(l)), new Map<string, number>());
  const bq = sum(bl, (l) => l.qty), aq = sum(after.lines, (l) => l.qty);
  for (const k of new Set([...bq.keys(), ...aq.keys()])) {
    const x = bq.get(k) ?? 0, y = aq.get(k) ?? 0;
    if (x !== y) out.push(`${k.replace(/\|$/, '').replace('|', ' lô ')}: SL ${x} → ${y}`);
  }
  return out;
}

/** Lập điều chỉnh phiếu đã duyệt xuất / đã nhận: chụp bản đang có; đầu nhận bị khoá nhận; sổ giữ nguyên. */
export async function startAdjust(trx: Db, auth: AuthContext, id: string, reason: string) {
  const cur = await load(trx, auth.tenantId, id, true);
  if (cur.status !== 'shipped' && cur.status !== 'received') throw Errors.conflict(cur.status === 'draft' ? 'Phiếu nháp sửa trực tiếp, không cần điều chỉnh' : 'Phiếu đã huỷ / bị từ chối, không điều chỉnh được');
  if (cur.adjust) throw Errors.conflict('Phiếu đang điều chỉnh');
  if (reason.trim().length < 5) throw Errors.validation('Ghi lý do điều chỉnh (ít nhất 5 ký tự)');
  const snapshot = Object.fromEntries(SNAP_COLS.map((k) => [k, (cur as unknown as Record<string, unknown>)[k]]));
  const adjust: AdjustState = { reason: reason.trim(), by: auth.actorName || auth.actor, at: new Date().toISOString(), both: cur.status === 'received', snapshot };
  await touch(trx, auth, id, { adjust });
  await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'stock_transfer.adjust_started', objectType: 'stock_transfer', objectId: id, after: { docNo: cur.doc_no, reason: adjust.reason, both: adjust.both, einvoice: cur.einvoice } });
  return getTransfer(trx, auth.tenantId, id);
}

/** Bên nhận xác nhận đề nghị điều chỉnh hai đầu (phiếu đã nhận). */
export async function confirmAdjust(trx: Db, auth: AuthContext, id: string) {
  const cur = await load(trx, auth.tenantId, id, true);
  if (!cur.adjust?.both) throw Errors.conflict('Phiếu không có đề nghị điều chỉnh hai đầu');
  const adjust = { ...cur.adjust, confirmedBy: auth.actorName || auth.actor, confirmedAt: new Date().toISOString() };
  await touch(trx, auth, id, { adjust });
  await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'stock_transfer.adjust_confirmed', objectType: 'stock_transfer', objectId: id, after: { docNo: cur.doc_no, reason: cur.adjust.reason } });
  return getTransfer(trx, auth.tenantId, id);
}

/** Duyệt điều chỉnh: ghi phiên bản mới của đầu xuất (và đầu nhập nếu đã nhận) — lõi đảo bút toán cũ; lưu lịch sử. */
export async function approveAdjust(trx: Db, auth: AuthContext, id: string, einvoiceReplacement?: EInvoice) {
  const cur = await load(trx, auth.tenantId, id, true);
  if (!cur.adjust) throw Errors.conflict('Phiếu không đang điều chỉnh');
  if (cur.adjust.both && !cur.adjust.confirmedBy) throw Errors.conflict('Phiếu đã nhận: chờ bên nhận xác nhận đề nghị điều chỉnh rồi mới duyệt');
  if (cur.einvoice && !einvoiceReplacement?.no) throw Errors.validation(`Phiếu XK-VCNB điện tử ${cur.einvoice.no} đã phát hành: ghi số phiếu thay thế / điều chỉnh trước khi duyệt`);
  const item: HistoryItem = {
    kind: 'adjust', reason: cur.adjust.reason, by: cur.adjust.by, at: cur.adjust.at, both: cur.adjust.both, confirmedBy: cur.adjust.confirmedBy,
    approvedBy: auth.actorName || auth.actor, approvedAt: new Date().toISOString(), changes: diffText(cur.adjust.snapshot, cur),
    einvoiceOld: cur.einvoice, einvoiceNew: einvoiceReplacement?.no ? einvoiceReplacement : cur.einvoice,
  };
  await postOut(trx, auth, cur);
  if (cur.status === 'received') await postIn(trx, auth, cur);
  await touch(trx, auth, id, { adjust: null, adjustments: [...(cur.adjustments ?? []), item], ...(einvoiceReplacement?.no ? { einvoice: einvoiceReplacement } : {}) });
  await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'stock_transfer.adjust_approved', objectType: 'stock_transfer', objectId: id, after: { docNo: cur.doc_no, ...item } });
  return getTransfer(trx, auth.tenantId, id);
}

/** Huỷ điều chỉnh: trả nội dung về bản đã duyệt (bản chụp); sổ không đổi. */
export async function cancelAdjust(trx: Db, auth: AuthContext, id: string) {
  const cur = await load(trx, auth.tenantId, id, true);
  if (!cur.adjust) throw Errors.conflict('Phiếu không đang điều chỉnh');
  await touch(trx, auth, id, { ...cur.adjust.snapshot, adjust: null });
  await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'stock_transfer.adjust_cancelled', objectType: 'stock_transfer', objectId: id, after: { docNo: cur.doc_no, reason: cur.adjust.reason } });
  return getTransfer(trx, auth.tenantId, id);
}

/** Ghi số phiếu xuất kho kiêm vận chuyển nội bộ điện tử đã phát hành (đổi số sau đó phải qua điều chỉnh). */
export async function setEInvoice(trx: Db, auth: AuthContext, id: string, e: EInvoice) {
  const cur = await load(trx, auth.tenantId, id, true);
  if (cur.status === 'draft' || cur.status === 'cancelled' || cur.status === 'rejected') throw Errors.conflict('Chỉ ghi số phiếu điện tử cho phiếu đã duyệt xuất');
  if (cur.einvoice?.no && cur.einvoice.no !== e.no) throw Errors.conflict(`Đã ghi phiếu điện tử ${cur.einvoice.no}: đổi số thì lập điều chỉnh (ghi số phiếu thay thế khi duyệt)`);
  await touch(trx, auth, id, { einvoice: e });
  await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'stock_transfer.einvoice_set', objectType: 'stock_transfer', objectId: id, after: { docNo: cur.doc_no, einvoice: e } });
  return getTransfer(trx, auth.tenantId, id);
}

/** Thủ kho nhập xác nhận: ghi đầu nhập theo số thực nhận (gọi lại khi đã nhận = sửa số nhận). */
export async function receiveTransfer(trx: Db, auth: AuthContext, id: string, input: z.infer<typeof receiveSchema>) {
  const cur = await load(trx, auth.tenantId, id, true);
  if (cur.status === 'cancelled' || cur.status === 'rejected') throw Errors.conflict(`Phiếu ${cur.status === 'cancelled' ? 'đã huỷ' : 'đã bị từ chối'}, không nhận được`);
  if (cur.status === 'draft') throw Errors.conflict('Phiếu nháp: bên xuất chưa duyệt xuất');
  if (cur.adjust) throw Errors.conflict('Phiếu đang được điều chỉnh: chờ duyệt điều chỉnh rồi mới nhận');
  const reReceive = cur.status === 'received';
  if (reReceive && input.note.trim().length < 5) throw Errors.validation('Đã nhận rồi: sửa số nhận là lập biên bản chênh lệch — ghi rõ lý do (ít nhất 5 ký tự)');
  const date = input.receivedDate ?? cur.received_date ?? cur.doc_date;
  if (date < cur.doc_date) throw Errors.validation(`Ngày nhận (${date}) không được trước ngày xuất (${cur.doc_date})`);
  const byKey = new Map(input.lines.map((l) => [l.lineKey, l.receivedQty]));
  const lines = cur.lines.map((l) => {
    const q = byKey.get(l.lineKey);
    if (q !== undefined && q > l.qty) throw Errors.validation(`Dòng ${l.sku}: số nhận (${q}) lớn hơn số xuất (${l.qty})`);
    return { ...l, receivedQty: q === undefined || q === l.qty ? undefined : q };
  });
  await touch(trx, auth, id, { status: 'received', lines, received_date: date, received_by: auth.actorName || auth.actor, received_note: input.note });
  const after = await load(trx, auth.tenantId, id);
  await postIn(trx, auth, after);
  if (reReceive) {
    // Biên bản chênh lệch: ghi lịch sử số nhận cũ → mới.
    const changes = cur.lines.flatMap((l) => { const n = after.lines.find((x) => x.lineKey === l.lineKey); const a = l.receivedQty ?? l.qty, b = n?.receivedQty ?? n?.qty ?? a; return a !== b ? [`${l.sku}: nhận ${a} → ${b}`] : []; });
    const item: HistoryItem = { kind: 'chenh_lech', reason: input.note.trim(), by: auth.actorName || auth.actor, at: new Date().toISOString(), changes };
    await touch(trx, auth, id, { adjustments: [...(cur.adjustments ?? []), item] });
    await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'stock_transfer.receipt_difference', objectType: 'stock_transfer', objectId: id, after: { docNo: cur.doc_no, ...item } });
  }
  return getTransfer(trx, auth.tenantId, id);
}

/** Bỏ xác nhận nhận: huỷ đầu nhập, phiếu về "đã xuất, chờ nhận". */
export async function unreceiveTransfer(trx: Db, auth: AuthContext, id: string) {
  const cur = await load(trx, auth.tenantId, id, true);
  if (cur.status !== 'received') throw Errors.conflict('Phiếu chưa nhận');
  if (cur.adjust) throw Errors.conflict('Phiếu đang điều chỉnh: huỷ điều chỉnh trước');
  await cancelLeg(trx, auth, cur.in_doc_key, `Bỏ xác nhận nhận phiếu chuyển kho ${cur.doc_no}`);
  await touch(trx, auth, id, { status: 'shipped', received_date: null, received_by: null, received_note: '', lines: cur.lines.map(({ receivedQty: _r, ...l }) => l) });
  return getTransfer(trx, auth.tenantId, id);
}

/** Bên nhận từ chối: huỷ đầu xuất — bên chuyển được trả lại tồn. */
export async function rejectTransfer(trx: Db, auth: AuthContext, id: string, reason: string) {
  const cur = await load(trx, auth.tenantId, id, true);
  if (cur.status !== 'shipped') throw Errors.conflict(cur.status === 'received' ? 'Phiếu đã nhận: bỏ xác nhận nhận trước rồi mới từ chối' : cur.status === 'draft' ? 'Phiếu nháp: bên xuất chưa duyệt xuất' : 'Phiếu đã huỷ / đã từ chối');
  if (cur.adjust) throw Errors.conflict('Phiếu đang điều chỉnh: chờ bên xuất duyệt hoặc huỷ điều chỉnh');
  await cancelLeg(trx, auth, cur.out_doc_key, `Bên nhận từ chối phiếu chuyển kho ${cur.doc_no}: ${reason}`);
  await touch(trx, auth, id, { status: 'rejected', received_note: reason });
  return getTransfer(trx, auth.tenantId, id);
}

/** Huỷ phiếu: huỷ cả hai đầu (đảo bút toán bằng số âm, trả lại tồn), giữ phiếu để tra cứu. */
export async function cancelTransfer(trx: Db, auth: AuthContext, id: string, reason: string) {
  const cur = await load(trx, auth.tenantId, id, true);
  if (cur.status === 'cancelled') return getTransfer(trx, auth.tenantId, id);
  if (cur.adjust) throw Errors.conflict('Phiếu đang điều chỉnh: huỷ điều chỉnh trước');
  if (cur.status === 'draft') { await touch(trx, auth, id, { status: 'cancelled', received_note: reason }); return getTransfer(trx, auth.tenantId, id); }
  const why = `Huỷ phiếu chuyển kho ${cur.doc_no}${reason ? `: ${reason}` : ''}`;
  await cancelLeg(trx, auth, cur.in_doc_key, why);
  await cancelLeg(trx, auth, cur.out_doc_key, why);
  await touch(trx, auth, id, { status: 'cancelled', received_note: reason || cur.received_note });
  return getTransfer(trx, auth.tenantId, id);
}

/* ------------------------------------------------------------------ route */

export async function transferDocRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  // [2026-11-13 05:30 PM kiennt] PHAN-QUYEN — bản thử: xem theo thao tác đã đăng ký của màn KHO01 (documents:read kéo theo) (đóng góp)
  const read = requirePermission(quyenThaoTac('kho.chuyen-kho', 'xem'));
  r.get('/api/v1/kho/transfers', {
    preHandler: read,
    schema: { tags, summary: 'Danh sách phiếu chuyển kho', querystring: z.object({ from: day.optional(), to: day.optional(), branchCodes: z.string().max(20000).optional(), warehouses: z.string().max(20000).optional(), status: z.enum(['draft', 'shipped', 'pending', 'received', 'rejected', 'cancelled']).optional().or(z.literal('')), search: z.string().max(100).optional() }) },
    handler: async (req) => { const rows = await listTransfers(db, authOf(req).tenantId, { ...req.query, status: req.query.status || undefined }); return ok(rows, { total: rows.length, page: 1, pageSize: rows.length }); },
  });
  r.get('/api/v1/kho/transfers/stock', {
    preHandler: read,
    schema: { tags, summary: 'Tồn của các mã ở chi nhánh + phân kho tại ngày (trừ chính phiếu đang sửa)', querystring: z.object({ branchCode: z.string().min(1).max(32), warehouse: z.string().max(64).optional(), date: day.optional(), skus: z.string().max(20000), exceptId: z.string().regex(/^\d+$/).optional() }) },
    handler: async (req) => ok(await stockAt(db, authOf(req).tenantId, { ...req.query, skus: list(req.query.skus).slice(0, 2000) })),
  });
  r.get('/api/v1/kho/transfers/:id', {
    preHandler: read,
    schema: { tags, summary: 'Một phiếu chuyển kho (kèm lô đã xuất từng dòng, trạng thái hai đầu trong sổ)', params: idParamSchema },
    handler: async (req) => ok(await getTransfer(db, authOf(req).tenantId, String(req.params.id))),
  });
  mountActions(app, transferActions);
}

const anyOut = z.any();
const reasonBody = z.object({ reason: z.string().trim().max(500).default('') });

// [2026-11-11 09:37 AM kiennt] PHASE-028 — S028-22: action chuyển kho gác quyền theo loại chứng từ.
// [2026-11-11 10:09 AM kiennt] PHASE-028 — S028-22 sửa: quyền theo loại chứng từ tính khi kiểm (getter, documentPermissionOf) — phân hệ Kho bật thì
// kho:chuyen-kho-lap / -huy (documents:write kéo theo, thủ kho chỉ được Cho quyền chi tiết vẫn lập được); Kho tắt (route nhóm hàng hoá vẫn bật) thì
// documents:write. Bộ action là hằng (registry so đúng đối tượng — dựng app nhiều lần trong một tiến trình không báo trùng mã).
// [2026-11-11 10:55 AM kiennt] PHASE-028 — S028-22 sửa: hàm dựng action mỗi lần gắn route làm registry báo "Trùng mã action" khi dựng app lần hai → getter
// [2026-11-13 05:30 PM kiennt] PHAN-QUYEN — bản thử: lệnh chuyển kho gác theo thao tác của màn KHO01 (them / sua / nhan / huy) thay quyền chung theo loại chứng từ (đóng góp)
export const transferActions: AnyActionDef[] = [
  defineAction({
    id: 'kho.transfer.create', title: 'Lập phiếu chuyển kho (lưu là xuất: trừ tồn bên chuyển)', tags,
    get permission() { return quyenThaoTac('kho.chuyen-kho', 'them'); }, effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: transferInputSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/kho/transfers' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'stock_transfer', objectId: (i) => i.docNo || 'new' },
    handler: (ctx, i) => createTransfer(ctx.data.tx, ctx.legacyAuth, i),
  }),
  defineAction({
    id: 'kho.transfer.update', title: 'Sửa phiếu chuyển kho (ghi lại hai đầu)', tags,
    get permission() { return quyenThaoTac('kho.chuyen-kho', 'sua'); }, effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: transferInputSchema.merge(idParamSchema), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/kho/transfers/:id' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'stock_transfer', objectId: (i) => String(i.id) },
    handler: (ctx, i) => { const { id, ...body } = i; return updateTransfer(ctx.data.tx, ctx.legacyAuth, String(id), body); },
  }),
  defineAction({
    id: 'kho.transfer.receive', title: 'Thủ kho nhập xác nhận nhận hàng (cộng tồn bên nhận theo số thực nhận)', tags,
    get permission() { return quyenThaoTac('kho.chuyen-kho', 'nhan'); }, effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: receiveSchema.merge(idParamSchema), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/kho/transfers/:id/receive' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'stock_transfer', objectId: (i) => String(i.id) },
    handler: (ctx, i) => { const { id, ...body } = i; return receiveTransfer(ctx.data.tx, ctx.legacyAuth, String(id), body); },
  }),
  defineAction({
    id: 'kho.transfer.unreceive', title: 'Bỏ xác nhận nhận (huỷ đầu nhập)', tags,
    get permission() { return quyenThaoTac('kho.chuyen-kho', 'nhan'); }, effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: idParamSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/kho/transfers/:id/unreceive' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'stock_transfer', objectId: (i) => String(i.id) },
    handler: (ctx, i) => unreceiveTransfer(ctx.data.tx, ctx.legacyAuth, String(i.id)),
  }),
  defineAction({
    id: 'kho.transfer.reject', title: 'Bên nhận từ chối (huỷ đầu xuất, trả tồn bên chuyển)', tags,
    get permission() { return quyenThaoTac('kho.chuyen-kho', 'huy'); }, effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: reasonBody.merge(idParamSchema), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/kho/transfers/:id/reject' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'stock_transfer', objectId: (i) => String(i.id) },
    handler: (ctx, i) => rejectTransfer(ctx.data.tx, ctx.legacyAuth, String(i.id), i.reason),
  }),
  defineAction({
    id: 'kho.transfer.cancel', title: 'Huỷ phiếu chuyển kho (đảo cả hai đầu, giữ phiếu)', tags,
    get permission() { return quyenThaoTac('kho.chuyen-kho', 'huy'); }, effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: reasonBody.merge(idParamSchema), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/kho/transfers/:id/cancel' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'stock_transfer', objectId: (i) => String(i.id) },
    handler: (ctx, i) => cancelTransfer(ctx.data.tx, ctx.legacyAuth, String(i.id), i.reason),
  }),
  // [2026-11-15 Nguyễn Văn Thủy] nháp → duyệt xuất; điều chỉnh sau duyệt (một đầu / hai đầu có bên nhận xác nhận); phiếu điện tử (đóng góp)
  defineAction({
    id: 'kho.transfer.ship', title: 'Duyệt xuất phiếu chuyển kho nháp (trừ tồn bên chuyển)', tags,
    get permission() { return quyenThaoTac('kho.chuyen-kho', 'sua'); }, effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: z.object({ receiveNow: z.boolean().optional() }).merge(idParamSchema), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/kho/transfers/:id/ship' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'stock_transfer', objectId: (i) => String(i.id) },
    handler: (ctx, i) => shipTransfer(ctx.data.tx, ctx.legacyAuth, String(i.id), i.receiveNow),
  }),
  defineAction({
    id: 'kho.transfer.adjust', title: 'Lập điều chỉnh phiếu đã duyệt xuất (khoá nhận; sổ giữ bản cũ tới khi duyệt) — body { reason }', tags,
    get permission() { return quyenThaoTac('kho.chuyen-kho', 'sua'); }, effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: z.object({ reason: z.string().trim().min(5).max(500) }).merge(idParamSchema), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/kho/transfers/:id/adjust' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'stock_transfer', objectId: (i) => String(i.id) },
    handler: (ctx, i) => startAdjust(ctx.data.tx, ctx.legacyAuth, String(i.id), i.reason),
  }),
  defineAction({
    id: 'kho.transfer.adjust-confirm', title: 'Bên nhận xác nhận đề nghị điều chỉnh hai đầu', tags,
    get permission() { return quyenThaoTac('kho.chuyen-kho', 'nhan'); }, effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: idParamSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/kho/transfers/:id/adjust-confirm' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'stock_transfer', objectId: (i) => String(i.id) },
    handler: (ctx, i) => confirmAdjust(ctx.data.tx, ctx.legacyAuth, String(i.id)),
  }),
  defineAction({
    id: 'kho.transfer.adjust-approve', title: 'Duyệt điều chỉnh: đảo bút toán cũ, ghi phiên bản mới từng đầu', tags,
    get permission() { return quyenThaoTac('kho.chuyen-kho', 'sua'); }, effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'natural',
    input: z.object({ einvoiceReplacement: z.object({ no: z.string().trim().min(1).max(64), serial: z.string().trim().max(32).optional(), date: day.optional() }).optional() }).merge(idParamSchema), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/kho/transfers/:id/adjust-approve' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'stock_transfer', objectId: (i) => String(i.id) },
    handler: (ctx, i) => approveAdjust(ctx.data.tx, ctx.legacyAuth, String(i.id), i.einvoiceReplacement),
  }),
  defineAction({
    id: 'kho.transfer.adjust-cancel', title: 'Huỷ điều chỉnh: phiếu về bản đã duyệt, sổ không đổi', tags,
    get permission() { return quyenThaoTac('kho.chuyen-kho', 'sua'); }, effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: idParamSchema, output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/kho/transfers/:id/adjust-cancel' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'stock_transfer', objectId: (i) => String(i.id) },
    handler: (ctx, i) => cancelAdjust(ctx.data.tx, ctx.legacyAuth, String(i.id)),
  }),
  defineAction({
    id: 'kho.transfer.einvoice', title: 'Ghi số phiếu xuất kho kiêm vận chuyển nội bộ điện tử đã phát hành', tags,
    get permission() { return quyenThaoTac('kho.chuyen-kho', 'sua'); }, effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
    input: z.object({ no: z.string().trim().min(1).max(64), serial: z.string().trim().max(32).optional(), date: day.optional() }).merge(idParamSchema), output: anyOut,
    expose: { http: { method: 'PUT', path: '/api/v1/kho/transfers/:id/einvoice' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'stock_transfer', objectId: (i) => String(i.id) },
    handler: (ctx, i) => { const { id, ...e } = i; return setEInvoice(ctx.data.tx, ctx.legacyAuth, String(id), e); },
  }),
];
