// @bizcity-layer D modules/mua-hang
/**
 * Lưu / đọc chứng từ và chính sách mua hàng (bảng purchase_documents, purchase_policies — db/migrations/0010_mua_hang.sql).
 * Khuôn trả ra giao diện là PDoc / Policy của '@ketoan/contracts/mua-hang' (cùng khuôn bộ máy tính).
 */
import { sql } from 'kysely';
import { z } from 'zod';
import { unitsOf } from './gia-mua.js';
import { PURCHASE_KINDS, amountTax, termFromRule, type DocCalc, type PDoc, type Policy, type PolicyKind } from '@ketoan/contracts/mua-hang';
import { db, toNumber, type Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày theo dạng YYYY-MM-DD');
const code = z.string().trim().min(1).max(64);

export const lineSchema = z.object({
  lineKey: z.string().trim().min(1).max(64),
  sku: z.string().trim().max(64),
  name: z.string().trim().max(500).default(''),
  unit: z.string().trim().max(32).default(''),
  qty: z.number().finite().min(0),
  price: z.number().finite().min(0).default(0),
  discountPct: z.number().finite().min(0).max(100).optional(),
  discountAmt: z.number().finite().min(0).optional(),
  taxCode: z.string().trim().min(1).max(16).default('V08'),
  lineType: z.enum(['buy', 'gift_seller', 'gift_consumer']).default('buy'),
  lotNo: z.string().trim().max(64).optional(),
  expDate: day.optional(),
  mfgDate: day.optional(),
  program: z.string().trim().max(64).optional(),
  dir: z.enum(['out', 'in']).optional(),
  autoGift: z.boolean().optional(),
  /** Nhãn của mặt hàng — máy chủ ghi lại theo danh mục khi lưu (giá trị gửi lên chỉ dùng khi mã chưa có trong danh mục). */
  brandCode: z.string().trim().max(64).optional(),
  note: z.string().trim().max(500).optional(),
  pack: z.number().finite().positive().optional(),
  nccSku: z.string().trim().max(64).optional(),
  nccName: z.string().trim().max(500).optional(),
  barcode: z.string().trim().max(500).optional(),
  newItem: z.boolean().optional(),
  refLineKey: z.string().trim().max(64).optional(),
  stockInfo: z.record(z.number().finite()).optional(),
  family: z.array(z.object({ sku: z.string().max(64), kind: z.string().max(80), tonKho: z.number().finite(), tonShop: z.number().finite(), banShop: z.number().finite(), dangDat: z.number().finite(), maxKho: z.number().finite().optional(), maxShop: z.number().finite().optional(), diDuong: z.number().finite().optional(), banThangTruoc: z.number().finite().optional() })).max(50).optional(),
});

/** Điều khoản thanh toán (dùng cho chính sách payment_term và điều khoản riêng của phiếu). */
const termSchema = z.object({
  basis: z.enum(['receipt_date', 'invoice_date', 'order_date', 'fixed', 'immediate', 'prepay']),
  days: z.number().int().min(0).max(3650).default(0),
  workingDays: z.boolean().default(false),
  dayType: z.enum(['working', 'working6', 'calendar']).optional(),
  payDays: z.array(z.number().int().min(1).max(31)).max(10).optional(),
  monthDay: z.number().int().min(1).max(31).optional(),
});

/** Khuôn chứng từ gửi lên (thêm / sửa / phân tích). Tổng tiền máy chủ tự tính. */
export const docInputSchema = z.object({
  id: z.string().optional(),
  kind: z.enum(PURCHASE_KINDS as [string, ...string[]]),
  docNo: z.string().trim().max(64).default(''),
  docDate: day,
  branchCode: code,
  partnerCode: code,
  brandCode: z.string().trim().max(64).optional().nullable().transform((x) => x || undefined),
  priceIncludesVat: z.boolean().default(true),
  invoice: z.object({ no: z.string().trim().min(1).max(32), serial: z.string().trim().max(32).optional(), date: day, total: z.number().finite().optional() }).optional(),
  orderDiscount: z.object({ pct: z.number().min(0).max(100).optional(), amount: z.number().min(0).optional() }).optional(),
  term: termSchema.optional(),
  receivedDate: day.optional(),
  invoiceFix: z.object({ from: day, to: day }).optional(),
  /** Nhập ngoài đơn: chỉ nhận lý do từ người lập; người duyệt / rà soát do máy chủ ghi. */
  outsideOrder: z.object({ reason: z.string().trim().max(500) }).optional(),
  /** Mã chính sách bỏ tích trên phiếu này (không áp). */
  skipPolicies: z.array(z.string().trim().min(1).max(64)).max(200).optional(),
  cktt: z.object({ pct: z.number().min(0).max(100) }).optional(),
  lines: z.array(lineSchema).max(2000).default([]),
  schedule: z.array(z.object({ seq: z.number().int(), dueDate: day, amount: z.number().finite().positive() })).max(60).optional(),
  amount: z.number().finite().min(0).optional(),
  method: z.enum(['bank', 'cash']).optional(),
  moneyAccount: z.string().trim().max(20).regex(/^11[12]/, 'Tài khoản tiền phải là 111* (tiền mặt) hoặc 112* (ngân hàng)').optional().or(z.literal('')),
  ckttAmount: z.number().finite().min(0).optional(),
  taxCode: z.string().trim().max(16).optional(),
  costType: z.enum(['van_chuyen', 'boc_xep', 'luu_kho', 'bao_hiem', 'kiem_dinh', 'khac']).optional(),
  basis: z.enum(['value', 'qty']).optional(),
  refIds: z.array(z.string().regex(/^[1-9][0-9]*$/)).max(50).optional(),
  settle: z.enum(['offset', 'pay', 'refund']).optional(),
  reason: z.string().trim().max(500).optional(),
  gift: z.object({ source: z.enum(['ncc_program', 'ncc_extra', 'self_buy']), program: z.string().trim().max(64).optional(), hasVat: z.boolean() }).optional(),
  rebate: z.object({ policyCode: z.string(), period: z.string(), base: z.number(), rate: z.number(), detail: z.array(z.string()) }).optional(),
  allocation: z.array(z.object({ sku: z.string().min(1), name: z.string().optional(), amount: z.number().finite() })).max(2000).optional(),
  note: z.string().trim().max(1000).optional(),
  budget: z.number().finite().min(0).optional(),
  deliveryDate: day.optional(),
  deliveryWarehouse: z.string().trim().max(64).optional(),
  warehouseCode: z.string().trim().max(64).optional(),
});
export type DocInput = z.infer<typeof docInputSchema>;

/** Phần lưu ở cột data (jsonb). */
const DATA_KEYS = ['priceIncludesVat', 'orderDiscount', 'term', 'cktt', 'lines', 'schedule', 'amount', 'method', 'moneyAccount', 'ckttAmount', 'taxCode', 'costType', 'basis', 'settle', 'reason', 'gift', 'rebate', 'allocation', 'override', 'note', 'checks', 'policyTrace', 'invoiceTotal', 'receivedDate', 'invoiceFix', 'budget', 'deliveryDate', 'deliveryWarehouse', 'warehouseCode', 'outsideOrder', 'skipPolicies'] as const;

type Row = Awaited<ReturnType<typeof selectDocs>>[number];
function selectDocs(trx: Db, tenantId: string) {
  return trx.selectFrom('purchase_documents').selectAll().where('tenant_id', '=', tenantId).execute();
}

/**
 * CHIẾT KHẤU TỰ ÁP CHỐT LÚC DUYỆT: CK dòng bộ máy lấy từ chính sách (bậc số lượng, CK theo mã), CK đơn (CKTM NCC), CKTT và
 * điều khoản thanh toán (hạn / công nợ cố định)
 * khi phiếu không ghi tay. Ghi ở data.frozen; phiếu đã duyệt đọc ra thì gắn sẵn vào dòng / đầu phiếu, nên mọi chỗ tính lại
 * không cần chính sách (computeDoc(d, [])) — giá vốn thực tế, tổng hợp mua, phân bổ chi phí, lịch sử giá — ra đúng như bút
 * toán, kể cả khi chính sách sau đó bị sửa / tắt. Bỏ duyệt về nháp thì bỏ qua (phiếu nháp tính lại theo chính sách hiện hành).
 * Chốt cả dòng KHÔNG được CK (0%) để chính sách thêm sau không tự áp ngược vào phiếu cũ.
 * Không chốt ĐƠN ĐẶT: lập phiếu nhập từ đơn chép dòng của đơn (giao một phần phải xét lại bậc theo SL thực nhận).
 */
export const FREEZE_KINDS = ['receipt', 'return', 'exchange'] as const;
export const FREEZE_VERSION = 3;
export interface Frozen { v?: number; lines: ({ discountPct?: number; discountAmt?: number } | null)[]; orderDiscount?: PDoc['orderDiscount']; orderDiscountLines?: string[]; cktt?: PDoc['cktt']; term?: PDoc['term'] }

/** Phiếu "công nợ cố định": không tính hạn từng phiếu — không bao giờ quá hạn (sổ công nợ vẫn ghi hạn = ngày phiếu). */
export const noDueDate = (d: Pick<PDoc, 'term'>) => d.term?.basis === 'fixed';

export function freezeOf(doc: PDoc, calc: DocCalc, policies: Policy[]): Frozen {
  const auto = (kind: string) => calc.trace.find((t) => t.kind === kind && t.policy !== 'Trên phiếu')?.policy;
  const rule = (code?: string) => (code ? policies.find((p) => p.code === code)?.rule : undefined);
  const lines = doc.lines.map((l, i) => {
    const c = calc.lines[i];
    if (!c || l.lineType !== 'buy' || l.discountPct !== undefined || l.discountAmt !== undefined) return null;
    const amt = c.lineDiscount - Math.round((c.gross * (c.discountPct ?? 0)) / 100);
    return { discountPct: c.discountPct ?? 0, ...(amt ? { discountAmt: amt } : {}) };
  });
  const f: Frozen = { v: FREEZE_VERSION, lines };
  if (doc.orderDiscount === undefined && (doc.kind === 'receipt' || doc.kind === 'order')) {
    const r = rule(auto('trade_discount'));
    // CK số tiền: chốt đúng số đã giảm (cộng dồn nhiều lần thì là tổng), không phải số tiền một lần của chính sách.
    f.orderDiscount = r ? (Number(r.pct) ? { pct: Number(r.pct) } : { amount: calc.orderDiscount || undefined }) : {};
    // CK trên đơn không chia vào mã đang áp riêng chương trình khác: chốt luôn các dòng được chia.
    const buy = calc.lines.filter((l) => l.lineType === 'buy');
    if (r && buy.some((l) => !l.orderDiscount) && buy.some((l) => l.orderDiscount)) f.orderDiscountLines = buy.filter((l) => l.orderDiscount).map((l) => l.lineKey);
  }
  if (doc.term === undefined && (doc.kind === 'receipt' || doc.kind === 'order')) { const r = rule(auto('payment_term')); if (r) f.term = termFromRule(r); }
  if (doc.cktt === undefined && (doc.kind === 'receipt' || doc.kind === 'order')) { const pct = Number(rule(auto('payment_discount'))?.pct) || 0; if (pct) f.cktt = { pct }; }
  return f;
}

export function withFrozen<T extends PDoc>(doc: T, f?: Frozen): T {
  if (!f) return doc;
  return {
    ...doc,
    lines: doc.lines.map((l, i) => (f.lines[i] ? { ...l, ...f.lines[i] } : l)),
    orderDiscount: doc.orderDiscount ?? f.orderDiscount,
    ...(doc.orderDiscount === undefined && f.orderDiscountLines ? { orderDiscountLines: f.orderDiscountLines } : {}),
    cktt: doc.cktt ?? f.cktt,
    term: doc.term ?? f.term,
  };
}

export interface StoredDoc extends PDoc {
  revision: number;
  links: { docKey: string; docNo: string; eventId: string; role: string }[];
  checks?: { level: string; code: string; text: string }[];
  policyTrace?: unknown[];
  totals: { beforeTax: number; tax: number; total: number };
  dueDate?: string;
  isDemo: boolean;
  createdByName: string;
  approvedBy: string | null;
  approvedAt: string | null;
  updatedAt: string;
  /** Người tạo (mã tài khoản, vd user:12), thời điểm tạo; người duyệt (mã tài khoản, ghi lúc duyệt). */
  createdBy?: string; createdAt?: string; approvedActor?: string;
  /** Nhãn hiển thị "đăng nhập (Họ tên)" — danh sách chứng từ điền (userLabels). */
  createdByLabel?: string; approvedByLabel?: string;
  /** Công nợ NCC (TK 331) phát sinh từ phiếu đã ghi sổ — danh sách chứng từ điền (withDebtStatus):
   *  owed / owedPaid  = phải trả NCC (bên Có) và số đã trả / đã đối trừ; advance / advanceUsed = NCC nợ lại mình (ứng trước, trả hàng, thưởng…) và số đã đối trừ. */
  debt?: { owed: number; owedPaid: number; advance: number; advanceUsed: number };
}

/** Gắn tình trạng công nợ cho từng phiếu đã ghi sổ: cộng debt_items TK 331 của các chứng từ kế toán phiếu sinh ra (một lượt truy vấn). */
export async function withDebtStatus(trx: Db, tenantId: string, docs: StoredDoc[]): Promise<StoredDoc[]> {
  const ev = [...new Set(docs.flatMap((d) => d.links.map((l) => l.eventId)).filter(Boolean))];
  if (!ev.length) return docs;
  const rows = await trx.selectFrom('debt_items').select(['event_id', 'side', sql<string>`SUM(amount)`.as('amount'), sql<string>`SUM(settled_amount)`.as('settled')])
    .where('tenant_id', '=', tenantId).where('account_code', 'like', '331%').where('event_id', 'in', ev).groupBy(['event_id', 'side']).execute();
  const by = new Map<string, { owed: number; owedPaid: number; advance: number; advanceUsed: number }>();
  for (const r of rows) {
    const x = by.get(r.event_id) ?? by.set(r.event_id, { owed: 0, owedPaid: 0, advance: 0, advanceUsed: 0 }).get(r.event_id)!;
    if (r.side === 'credit') { x.owed += toNumber(r.amount); x.owedPaid += toNumber(r.settled); } else { x.advance += toNumber(r.amount); x.advanceUsed += toNumber(r.settled); }
  }
  return docs.map((d) => {
    if (!d.links.length) return d;
    const t = { owed: 0, owedPaid: 0, advance: 0, advanceUsed: 0 };
    for (const l of d.links) { const x = by.get(l.eventId); if (x) { t.owed += x.owed; t.owedPaid += x.owedPaid; t.advance += x.advance; t.advanceUsed += x.advanceUsed; } }
    return { ...d, debt: t };
  });
}

/** Đổi mã tài khoản (user:<id> / apikey:<id>) thành "email đăng nhập (Họ tên)" / "khoá API <tên>" — một lượt truy vấn. */
export async function userLabels(trx: Db, tenantId: string, actors: string[]): Promise<Map<string, string>> {
  const ids = (p: string) => [...new Set(actors.filter((a) => a?.startsWith(p)).map((a) => a.slice(p.length)).filter((x) => /^[0-9]+$/.test(x)))];
  const out = new Map<string, string>();
  const u = ids('user:'), k = ids('apikey:');
  if (u.length) for (const r of await trx.selectFrom('users').select(['id', 'email', 'full_name']).where('tenant_id', '=', tenantId).where('id', 'in', u).execute()) out.set(`user:${r.id}`, r.full_name && r.full_name !== r.email ? `${r.email} (${r.full_name})` : r.email);
  if (k.length) for (const r of await trx.selectFrom('api_keys').select(['id', 'name']).where('tenant_id', '=', tenantId).where('id', 'in', k).execute()) out.set(`apikey:${r.id}`, `khoá API ${r.name}`);
  return out;
}
/** Gắn nhãn người tạo / người duyệt cho danh sách chứng từ (phiếu cũ chưa có mã người duyệt thì dùng tên đã lưu). */
export async function withUserLabels(trx: Db, tenantId: string, docs: StoredDoc[]): Promise<StoredDoc[]> {
  const m = await userLabels(trx, tenantId, docs.flatMap((d) => [d.createdBy ?? '', d.approvedActor ?? '']));
  return docs.map((d) => ({ ...d, createdByLabel: m.get(d.createdBy ?? '') ?? d.createdByName, approvedByLabel: d.status === 'approved' ? (m.get(d.approvedActor ?? '') ?? d.approvedBy ?? undefined) : undefined }));
}

export function toDoc(r: Row): StoredDoc {
  const d = (r.data ?? {}) as Record<string, any>;
  const doc: StoredDoc = {
    id: String(r.id), kind: r.kind as PDoc['kind'], status: r.status as PDoc['status'], docNo: r.doc_no, docDate: String(r.doc_date).slice(0, 10),
    branchCode: r.branch_code, partnerCode: r.partner_code, brandCode: r.brand_code ?? undefined,
    priceIncludesVat: d.priceIncludesVat ?? true,
    invoice: r.invoice_no ? { no: r.invoice_no, serial: r.invoice_serial || undefined, date: String(r.invoice_date ?? r.doc_date).slice(0, 10), total: d.invoiceTotal } : undefined,
    orderDiscount: d.orderDiscount, term: d.term, cktt: d.cktt, lines: d.lines ?? [], schedule: d.schedule, amount: d.amount, method: d.method, moneyAccount: d.moneyAccount || undefined, ckttAmount: d.ckttAmount,
    taxCode: d.taxCode, costType: d.costType, basis: d.basis, refIds: (r.ref_ids ?? []).map(String), settle: d.settle, reason: d.reason, gift: d.gift, rebate: d.rebate, allocation: d.allocation,
    override: d.override, note: d.note, checks: d.checks, policyTrace: d.policyTrace, receivedDate: d.receivedDate, invoiceFix: d.invoiceFix, budget: d.budget, deliveryDate: d.deliveryDate, deliveryWarehouse: d.deliveryWarehouse, warehouseCode: d.warehouseCode, outsideOrder: d.outsideOrder, skipPolicies: d.skipPolicies,
    revision: r.revision, links: (r.links ?? []) as StoredDoc['links'],
    totals: { beforeTax: toNumber(r.total_before_tax), tax: toNumber(r.total_tax), total: toNumber(r.total) },
    dueDate: r.due_date ? String(r.due_date).slice(0, 10) : undefined,
    isDemo: r.is_demo, createdByName: r.created_by_name, approvedBy: r.approved_by, approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : null,
    updatedAt: new Date(r.updated_at).toISOString(),
    createdBy: r.created_by, createdAt: new Date(r.created_at as unknown as string).toISOString(), approvedActor: d.approvedActor,
  };
  return r.status === 'approved' ? withFrozen(doc, d.frozen as Frozen | undefined) : doc;
}

/**
 * Chỉ các chứng từ LIÊN QUAN tới một phiếu (phân tích / lưu / duyệt không đọc toàn bộ): cùng NCC (đơn đang mở, phiếu nhập theo
 * đơn, ứng trước, trùng hoá đơn, trả / đổi), cùng nhãn (hạn mức nhãn), phiếu được gắn và phiếu gắn vào phiếu này (chi phí /
 * thưởng của NCC khác trỏ tới phiếu nhập), quà cùng chi nhánh (xuất quà). Lịch sử giá tra riêng bằng SQL (priceHistory).
 */
export async function listDocsFor(trx: Db, tenantId: string, doc: { id?: string; partnerCode: string; brandCode?: string; branchCode: string; kind: string; refIds?: string[]; lines?: { brandCode?: string }[] }): Promise<StoredDoc[]> {
  const brands = [...new Set([doc.brandCode, ...(doc.lines ?? []).map((l) => l.brandCode)].filter(Boolean))] as string[];
  const refs = (doc.refIds ?? []).filter((x) => /^[1-9][0-9]*$/.test(x));
  const own = doc.id && /^[1-9][0-9]*$/.test(doc.id) ? doc.id : undefined;
  const rows = await trx.selectFrom('purchase_documents').selectAll().where('tenant_id', '=', tenantId).where((eb) => eb.or([
    eb('partner_code', '=', doc.partnerCode),
    // Cùng nhãn (hạn mức toàn nhãn): phiếu có nhãn chính đó hoặc có dòng thuộc nhãn đó (chỉ mục GIN trên data->'lines').
    ...brands.flatMap((b) => [eb('brand_code', '=', b), sql<boolean>`data -> 'lines' @> ${JSON.stringify([{ brandCode: b }])}::jsonb`]),
    ...(refs.length ? [eb('id', 'in', refs), sql<boolean>`ref_ids && ${sql.val(refs)}::bigint[]`] : []),
    ...(own ? [eb('id', '=', own), sql<boolean>`${own}::bigint = ANY(ref_ids)`] : []),
    ...(doc.kind === 'gift_out' ? [eb.and([eb('branch_code', '=', doc.branchCode), eb('kind', 'in', ['gift_in', 'gift_out', 'receipt'])])] : []),
  ])).orderBy('doc_date', 'desc').orderBy('id', 'desc').execute();
  return rows.map(toDoc);
}

/** Phiếu nhập đã duyệt có dòng chứa mã hàng (chỉ mục GIN trên data->'lines'), mới nhất trước. */
export async function receiptsWithSku(trx: Db, tenantId: string, sku: string, before: string, limit = 20): Promise<StoredDoc[]> {
  const rows = await trx.selectFrom('purchase_documents').selectAll().where('tenant_id', '=', tenantId).where('kind', '=', 'receipt').where('status', '=', 'approved')
    .where('doc_date', '<=', before).where(sql<boolean>`data -> 'lines' @> ${JSON.stringify([{ sku }])}::jsonb`).orderBy('doc_date', 'desc').limit(limit).execute();
  return rows.map(toDoc);
}

/** Phiếu đã duyệt đang dựa trên phiếu id (bỏ duyệt phải bỏ các phiếu này trước). */
export async function dependentsOf(trx: Db, tenantId: string, id: string): Promise<StoredDoc[]> {
  const rows = await trx.selectFrom('purchase_documents').selectAll().where('tenant_id', '=', tenantId).where('status', '=', 'approved').where('id', '<>', id)
    .where(sql<boolean>`${id}::bigint = ANY(ref_ids)`).execute();
  return rows.map(toDoc);
}

/** Danh sách chứng từ; bộ lọc chạy trong SQL (chỉ mục theo NCC / trạng thái / ngày). */
export async function listDocs(trx: Db, tenantId: string, f: { kind?: string; status?: string; partnerCode?: string; from?: string; to?: string } = {}): Promise<StoredDoc[]> {
  let q = trx.selectFrom('purchase_documents').selectAll().where('tenant_id', '=', tenantId);
  if (f.kind) q = q.where('kind', 'in', f.kind.split(','));
  if (f.status) q = q.where('status', '=', f.status);
  if (f.partnerCode) q = q.where('partner_code', '=', f.partnerCode);
  if (f.from) q = q.where('doc_date', '>=', f.from);
  if (f.to) q = q.where('doc_date', '<=', f.to);
  const rows = await q.orderBy('doc_date', 'desc').orderBy('id', 'desc').execute();
  return rows.map(toDoc);
}

export async function getDoc(trx: Db, tenantId: string, id: string, lock = false): Promise<StoredDoc> {
  let q = trx.selectFrom('purchase_documents').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id);
  if (lock) q = q.forUpdate();
  const r = await q.executeTakeFirst();
  if (!r) throw Errors.notFound('chứng từ mua hàng');
  return toDoc(r);
}

const PREFIX: Record<string, string> = { order: 'DH', receipt: 'NM', return: 'TN', exchange: 'DO', gift_in: 'QT', gift_out: 'XQ', cost: 'CP', rebate: 'TT', prepayment: 'UT', payment: 'UC' };
/** Số phiếu tự cấp: <tiền tố><yy><mm><4 số>, bộ đếm theo loại + năm (document_sequences). */
export async function nextDocNo(trx: Db, tenantId: string, kind: string, docDate: string): Promise<string> {
  const year = Number(docDate.slice(0, 4));
  const row = await trx.insertInto('document_sequences').values({ tenant_id: tenantId, doc_type: `mh:${kind}`, year, last_no: 1 })
    .onConflict((oc) => oc.columns(['tenant_id', 'doc_type', 'year']).doUpdateSet({ last_no: sql`document_sequences.last_no + 1` }))
    .returning('last_no').executeTakeFirstOrThrow();
  return `${PREFIX[kind] ?? 'MH'}${docDate.slice(2, 4)}${docDate.slice(5, 7)}${String(row.last_no).padStart(4, '0')}`;
}

/** Ghi các cột + data từ chứng từ đã tính. */
export function rowValues(doc: PDoc & { invoiceTotal?: number }, calc: { beforeTax: number; tax: number; payable: number; dueDate?: string }, extra: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = {};
  const src = { ...doc, invoiceTotal: doc.invoice?.total, ...extra } as Record<string, unknown>;
  for (const k of DATA_KEYS) if (src[k] !== undefined) data[k] = src[k];
  const gift = doc.kind === 'gift_in' || doc.kind === 'gift_out';
  const giftValue = gift ? doc.lines.reduce((s, l) => s + Math.round(l.qty * (l.price || 0)), 0) : 0;
  const amountOnly = !doc.lines.length && (doc.kind === 'cost' || doc.kind === 'rebate');
  const tax = amountOnly ? amountTax(doc) : 0;
  const money = gift ? giftValue : doc.lines.length ? calc.payable : (doc.amount ?? 0) + tax;
  return {
    kind: doc.kind, doc_no: doc.docNo, doc_date: doc.docDate, branch_code: doc.branchCode, partner_code: doc.partnerCode, brand_code: doc.brandCode ?? null,
    invoice_no: doc.invoice?.no ?? null, invoice_serial: doc.invoice?.serial ?? '', invoice_date: doc.invoice?.date ?? null, due_date: calc.dueDate ?? null,
    total_before_tax: gift ? giftValue : doc.lines.length ? calc.beforeTax : doc.amount ?? 0, total_tax: doc.lines.length && !gift ? calc.tax : tax, total: money,
    ref_ids: doc.refIds ?? [], data: JSON.stringify(data),
  };
}

/* ------------------------------------------------------------------ chính sách */

export const POLICY_KINDS: PolicyKind[] = ['trade_discount', 'item_discount', 'qty_tier', 'payment_discount', 'promo_gift', 'period_rebate', 'target_rebate', 'stage_rebate', 'credit_limit', 'payment_term', 'supply_target', 'lot_tracking', 'gift_budget', 'contract'];
const num = z.number().finite().min(0);
const pct = z.number().finite().min(0).max(100);
/** Khuôn quy tắc từng loại — kế toán nhập bằng form, máy chủ vẫn kiểm. */
export const RULE_SCHEMAS: Record<PolicyKind, z.ZodTypeAny> = {
  trade_discount: z.union([z.object({ pct }), z.object({ amount: num })]),
  // Bảng nhiều mã: mỗi dòng một mã (một mã nhiều dòng khi khác ĐVT / SL tối thiểu); % hoặc giảm tiền trên 1 ĐVT.
  // Ô trống gửi lên là null / 0 → coi như không ghi (chỉ một trong hai: % hoặc giảm tiền).
  item_discount: z.object({ items: z.array(z.object({ sku: z.string().trim().min(1).max(64), pct: pct.nullish().transform((x) => x || undefined), amount: num.nullish().transform((x) => x || undefined), unit: z.string().trim().max(32).nullish().transform((x) => x || undefined), minQty: num.nullish().transform((x) => x || undefined), note: z.string().max(200).nullish().transform((x) => x || undefined) })
    .superRefine((i, ctx) => { if (Boolean(i.pct) === Boolean(i.amount)) ctx.addIssue({ code: 'custom', message: i.pct ? `mã ${i.sku} đang ghi cả ${i.pct}% và giảm ${i.amount!.toLocaleString('vi-VN')}đ — chỉ giữ một trong hai` : `mã ${i.sku} chưa ghi % chiết khấu hoặc số tiền giảm` }); })).min(1).max(10000)
    .superRefine((items, ctx) => { const seen = new Map<string, number>(); items.forEach((i, n) => { const k = `${i.sku}|${(i.unit ?? '').toLowerCase()}|${i.minQty ?? 0}`; if (seen.has(k)) ctx.addIssue({ code: 'custom', path: [n], message: `dòng ${n + 1} trùng dòng ${seen.get(k)! + 1} (${i.sku})` }); else seen.set(k, n); }); }) }),
  qty_tier: z.object({ tiers: z.array(z.object({ from: num, pct })).min(1) }),
  payment_discount: z.object({ pct }),
  // Mua X tặng Y: dạng bảng nhiều dòng (items, có ĐVT) hoặc dạng cũ một dòng (buy / get / giftSku).
  promo_gift: z.union([
    z.object({ splitIntoCost: z.boolean(), items: z.array(z.object({
      sku: z.string().trim().min(1, 'thiếu mã hàng mua'), buyQty: z.number().positive('SL mua phải lớn hơn 0'), buyUnit: z.string().trim().default(''),
      giftSku: z.string().trim().default(''), getQty: z.number().positive('SL tặng phải lớn hơn 0'), getUnit: z.string().trim().default(''),
      repeat: z.boolean().optional(), apply: z.enum(['exclusive']).optional(), note: z.string().max(300).optional(),
    })).min(1, 'thêm ít nhất một dòng mua – tặng').max(5000) }),
    z.object({ buy: z.number().int().positive(), get: z.number().int().positive(), giftSku: z.string().default(''), splitIntoCost: z.boolean() }),
  ]),
  period_rebate: z.object({ period: z.enum(['month', 'quarter', 'year']), tiers: z.array(z.object({ from: num, pct })).min(1), vatPct: z.number().optional() }),
  target_rebate: z.object({ period: z.enum(['month', 'quarter', 'year']), target: z.number().positive(), tiers: z.array(z.object({ fromPct: num, pct })).min(1) }),
  stage_rebate: z.object({ mode: z.enum(['stage', 'cumulative']), stages: z.array(z.object({ from: z.number().int().min(1).max(31), to: z.number().int().min(1).max(31), min: num, pct: pct.optional(), amount: num.optional() })).min(1) }),
  credit_limit: z.object({ limit: z.number().positive(), warnPct: pct.default(90), branches: z.record(num).default({}) }),
  payment_term: termSchema,
  supply_target: z.object({ period: z.string().regex(/^\d{4}-\d{2}$/), branches: z.record(num) }),
  lot_tracking: z.object({ required: z.boolean().default(true) }),
  gift_budget: z.object({ program: z.string().trim().min(1), amount: z.number().positive() }),
  contract: z.object({ no: z.string().trim().min(1).max(64), signedOn: day.optional(), note: z.string().trim().max(500).optional() }),
};
export const policyInputSchema = z.object({
  code: z.string().trim().min(1).max(64),
  kind: z.enum(POLICY_KINDS as [PolicyKind, ...PolicyKind[]]),
  name: z.string().trim().min(1).max(255),
  scope: z.object({ partnerCode: z.string().optional(), brandCode: z.string().optional(), sku: z.string().optional(), branchCode: z.string().optional() }).default({}),
  validFrom: day.optional().nullable(),
  validTo: day.optional().nullable(),
  priority: z.number().int().default(0),
  isActive: z.boolean().default(true),
  rule: z.record(z.unknown()),
}).superRefine((p, ctx) => {
  const r = RULE_SCHEMAS[p.kind].safeParse(p.rule);
  if (!r.success) ctx.addIssue({ code: 'custom', path: ['rule'], message: `Nội dung chính sách chưa đúng: ${r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}` });
  if (p.kind === 'credit_limit') {
    const rule = p.rule as { limit?: number; branches?: Record<string, number> };
    const sum = Object.values(rule.branches ?? {}).reduce((a, b) => a + b, 0);
    if (rule.limit && sum > rule.limit) ctx.addIssue({ code: 'custom', path: ['rule'], message: `Tổng phân bổ chi nhánh ${sum.toLocaleString('vi-VN')} vượt hạn mức tổng ${rule.limit.toLocaleString('vi-VN')}` });
  }
  if (p.validFrom && p.validTo && p.validTo < p.validFrom) ctx.addIssue({ code: 'custom', path: ['validTo'], message: 'Ngày hết hiệu lực trước ngày bắt đầu' });
});
export type PolicyInput = z.infer<typeof policyInputSchema>;

export async function listPolicies(trx: Db, tenantId: string, opts: { exclude?: PolicyKind[] } = {}): Promise<Policy[]> {
  let q = trx.selectFrom('purchase_policies').selectAll().where('tenant_id', '=', tenantId);
  if (opts.exclude?.length) q = q.where('kind', 'not in', opts.exclude);
  const rows = await q.orderBy('kind').orderBy('code').execute();
  return rows.map((r) => ({
    id: String(r.id), code: r.code, kind: r.kind as PolicyKind, name: r.name, scope: (r.scope ?? {}) as Policy['scope'],
    validFrom: r.valid_from ? String(r.valid_from).slice(0, 10) : undefined, validTo: r.valid_to ? String(r.valid_to).slice(0, 10) : undefined,
    priority: r.priority, isActive: r.is_active, rule: (r.rule ?? {}) as Record<string, unknown>,
    createdBy: r.created_by, createdAt: new Date(r.created_at as unknown as string).toISOString(), updatedBy: r.updated_by, updatedAt: new Date(r.updated_at as unknown as string).toISOString(),
  }));
}

/**
 * Xoá chính sách: chỉ khi CHƯA áp vào chứng từ nào còn hiệu lực (vết tính policyTrace, chương trình KM trên dòng hàng,
 * phiếu thưởng). Đã áp thì giữ để tra lại cách tính phiếu cũ — tắt "Áp dụng" để ngừng.
 */
export async function deletePolicy(trx: Db, tenantId: string, id: string): Promise<Policy> {
  const p = (await listPolicies(trx, tenantId)).find((x) => x.id === id);
  if (!p) throw Errors.notFound(`chính sách #${id}`);
  const used = await trx.selectFrom('purchase_documents').select(['doc_no']).where('tenant_id', '=', tenantId).where('status', '<>', 'cancelled')
    .where((eb) => eb.or([
      sql<boolean>`data->'policyTrace' @> ${JSON.stringify([{ policy: p.code }])}::jsonb`,
      sql<boolean>`data->'lines' @> ${JSON.stringify([{ program: p.code }])}::jsonb`,
      sql<boolean>`data->'rebate'->>'policyCode' = ${p.code}`,
    ])).limit(5).execute();
  if (used.length) throw Errors.conflict(`Chính sách ${p.code} đã áp vào phiếu ${used.map((u) => u.doc_no).join(', ')}${used.length === 5 ? '…' : ''} — không xoá được (phiếu cũ cần tra lại cách tính). Bỏ tích "Áp dụng" để ngừng.`);
  await trx.deleteFrom('purchase_policies').where('tenant_id', '=', tenantId).where('id', '=', id).execute();
  return p;
}

/**
 * Mua X tặng Y dạng bảng: kiểm mã + ĐVT có trong danh mục, rồi ghi kèm tỉ lệ quy đổi ĐVT của mã mua / mã tặng (buyRatios /
 * giftRatios) để bộ máy quy mọi ĐVT trên phiếu về ĐVT nhỏ nhất mà không phải tra danh mục.
 */
async function withGiftRatios(trx: Db, tenantId: string, p: PolicyInput): Promise<PolicyInput> {
  if (p.kind !== 'promo_gift' || !Array.isArray(p.rule.items)) return p;
  const items = p.rule.items as { sku: string; buyUnit: string; giftSku: string; getUnit: string }[];
  const units = await unitsOf(trx, tenantId, items.flatMap((i) => [i.sku, i.giftSku]).filter(Boolean));
  const ratios = (sku: string) => Object.fromEntries((units[sku] ?? []).map((u) => [u.unit.trim().toLowerCase(), u.ratio]));
  const problems: string[] = [];
  const out = items.map((it, i) => {
    const gift = it.giftSku || it.sku;
    const has = (sku: string, u: string) => !u || (units[sku] ?? []).some((x) => x.unit.trim().toLowerCase() === u.trim().toLowerCase());
    if (!units[it.sku]?.length) problems.push(`Dòng ${i + 1}: mã mua ${it.sku} chưa có trong danh mục mặt hàng`);
    else if (!has(it.sku, it.buyUnit)) problems.push(`Dòng ${i + 1}: mã ${it.sku} không có ĐVT "${it.buyUnit}"`);
    if (it.giftSku && !units[it.giftSku]?.length) problems.push(`Dòng ${i + 1}: mã tặng ${it.giftSku} chưa có trong danh mục mặt hàng`);
    else if (units[gift]?.length && !has(gift, it.getUnit)) problems.push(`Dòng ${i + 1}: mã ${gift} không có ĐVT "${it.getUnit}"`);
    return { ...it, buyRatios: ratios(it.sku), ...(it.giftSku && it.giftSku !== it.sku ? { giftRatios: ratios(it.giftSku) } : {}) };
  });
  if (problems.length) throw Errors.validation(problems.slice(0, 10).join('; ') + (problems.length > 10 ? ` … (+${problems.length - 10})` : ''));
  return { ...p, scope: { ...p.scope, sku: undefined }, rule: { ...p.rule, items: out } };
}

export async function savePolicy(trx: Db, tenantId: string, actor: string, input: PolicyInput, id?: string, isDemo = false): Promise<string> {
  const p = await withGiftRatios(trx, tenantId, input);
  const values = {
    code: p.code, kind: p.kind, name: p.name, scope: JSON.stringify(Object.fromEntries(Object.entries(p.scope).filter(([, x]) => x))),
    valid_from: p.validFrom ?? null, valid_to: p.validTo ?? null, priority: p.priority, rule: JSON.stringify(p.rule), is_active: p.isActive, updated_by: actor, updated_at: new Date(),
  };
  const dup = await trx.selectFrom('purchase_policies').select('id').where('tenant_id', '=', tenantId).where('code', '=', p.code).executeTakeFirst();
  if (dup && String(dup.id) !== id) throw Errors.conflict(`Mã chính sách ${p.code} đã có`);
  if (id) {
    const r = await trx.updateTable('purchase_policies').set(values).where('tenant_id', '=', tenantId).where('id', '=', id).returning('id').executeTakeFirst();
    if (!r) throw Errors.notFound('chính sách');
    return String(r.id);
  }
  return String((await trx.insertInto('purchase_policies').values({ tenant_id: tenantId, is_demo: isDemo, created_by: actor, ...values }).returning('id').executeTakeFirstOrThrow()).id);
}

export { db };
