// @bizcity-layer D modules/mua-hang
/**
 * Nghiệp vụ chứng từ mua hàng: lưu (máy chủ tự tính tiền, hạn, cảnh báo), gửi duyệt, duyệt (ghi sổ), duyệt ngoại lệ vượt
 * hạn mức, bỏ duyệt (huỷ chứng từ kế toán đã sinh), huỷ. Mỗi bước ghi nhật ký JSONL (log.ts).
 * Trạng thái và chuyển (ai được gửi / duyệt / bỏ duyệt / huỷ, từ trạng thái nào): purchase-document.workflow.yaml
 * (documents.workflow, PHASES 3.5) — runtime core/workflow.ts.
 */
import { sql } from 'kysely';
import { computeDoc, type PDoc, type PLine } from '@ketoan/contracts/mua-hang';
import { db, type Db } from '../../db/client.js';
import type { AuthContext } from '../../core/auth.js';
import { Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import { loadWorkflow, workflowActor } from '../../core/workflow.js';
import { documentService } from '../../kernel/public.js';
import { analyze, isOutsideOrder, loadCtx, withBrands, type Analysis } from './analysis.js';
import { postPurchase, refReceipts, spreadOverMany } from './posting.js';
import { logEvents, type LogRow } from './log.js';
import { dependentsOf, docInputSchema, FREEZE_KINDS, freezeOf, getDoc, listDocs, listDocsFor, nextDocNo, withUserLabels, withDebtStatus, rowValues, type DocInput, type StoredDoc } from './store.js';
import { resolveWarehouse } from '../../modules/warehouses/default-warehouse.js';

/** Phiếu mua có hàng ra / vào kho (đơn đặt chưa vào kho; chi phí, thưởng chỉ điều chỉnh giá trị). */
const STOCK_KINDS: string[] = ['receipt', 'return', 'exchange', 'gift_in', 'gift_out'];

/** Máy trạng thái khai báo của chứng từ mua hàng. */
export const purchaseWorkflow = loadWorkflow(new URL('./purchase-document.workflow.yaml', import.meta.url));
const wf = purchaseWorkflow;
/** Không sửa nội dung được: đã duyệt / hoàn tất / huỷ. Phiếu chờ duyệt vẫn sửa được (như trước khi khai workflow). */
const LOCKED = new Set([...wf.statesIn('approved'), ...wf.statesIn('done'), ...wf.statesIn('cancelled')]);

function toPDoc(input: DocInput, id = 'new'): PDoc {
  return { ...(input as unknown as PDoc), id, status: 'draft', docNo: input.docNo ?? '', refIds: input.refIds ?? [] };
}

/** Tóm tắt cảnh báo lưu kèm phiếu (danh sách hiện số lỗi / cảnh báo mà không phải tính lại). */
const checksOf = (a: Analysis) => a.checks.map(({ level, code, text, blocking }) => ({ level, code, text, blocking: Boolean(blocking) }));

/** Dòng nhật ký cho các cảnh báo + chính sách đã áp. */
function logRowsFor(d: PDoc, a: Analysis, user: string, withTrace: boolean): Omit<LogRow, 'ts'>[] {
  const ev = (code: string) => (code.startsWith('price') ? 'price_check' : code.startsWith('credit') ? 'limit_check' : code.startsWith('invoice') || code.startsWith('po_') ? 'invoice_mismatch' : code.includes('expir') || code === 'lot_missing' ? 'lot_check' : code === 'gift_qty' ? 'gift_check' : '');
  const rows: Omit<LogRow, 'ts'>[] = a.checks.filter((c) => c.level !== 'info' && ev(c.code)).map((c) => ({ event: ev(c.code), docNo: d.docNo, user, data: { level: c.level, code: c.code, text: c.text } }));
  if (withTrace) for (const t of a.calc.trace) rows.push({ event: 'policy_applied', docNo: d.docNo, user, data: { policy: t.policy, kind: t.kind, text: t.text, amount: t.amount } });
  return rows;
}

const OVERRIDABLE = new Set(['credit_exceeded', 'code_swap', 'po_none']);

/** Những gì đổi giữa hai lần ghi phiếu — ghi nhật ký để ai cũng xem được "sửa gì, từ gì sang gì". */
export function docChanges(b: StoredDoc, a: StoredDoc): string[] {
  const out: string[] = [];
  const v = (n: number) => Math.round(n).toLocaleString('vi-VN');
  const cmp = (label: string, x: unknown, y: unknown) => { if (String(x ?? '') !== String(y ?? '')) out.push(`${label}: ${String(x ?? '—') || '—'} → ${String(y ?? '—') || '—'}`); };
  cmp('Ngày', b.docDate, a.docDate); cmp('NCC', b.partnerCode, a.partnerCode); cmp('Chi nhánh', b.branchCode, a.branchCode);
  cmp('Số hoá đơn', b.invoice?.no, a.invoice?.no); cmp('Ngày nhận đủ hồ sơ', b.receivedDate, a.receivedDate); cmp('Ghi chú', b.note, a.note);
  if (b.totals.total !== a.totals.total) out.push(`Tổng tiền: ${v(b.totals.total)} → ${v(a.totals.total)}`);
  const key = (l: StoredDoc['lines'][number]) => `${l.sku}|${l.lineType}`;
  const bm = new Map(b.lines.map((l) => [key(l), l])), am = new Map(a.lines.map((l) => [key(l), l]));
  for (const [k, l] of am) {
    const o = bm.get(k);
    if (!o) out.push(`Thêm dòng ${l.sku} SL ${l.qty} × ${v(l.price)}`);
    else if (o.qty !== l.qty || o.price !== l.price || (o.discountPct ?? 0) !== (l.discountPct ?? 0)) out.push(`Dòng ${l.sku}: SL ${o.qty} → ${l.qty}, giá ${v(o.price)} → ${v(l.price)}${(o.discountPct ?? 0) !== (l.discountPct ?? 0) ? `, CK ${o.discountPct ?? 0}% → ${l.discountPct ?? 0}%` : ''}`);
  }
  for (const [k, l] of bm) if (!am.has(k)) out.push(`Bỏ dòng ${l.sku} SL ${l.qty}`);
  if (JSON.stringify(b.term ?? null) !== JSON.stringify(a.term ?? null)) out.push('Đổi điều khoản thanh toán riêng của phiếu');
  return out.slice(0, 40);
}
export const purchaseService = {
  list: async (auth: AuthContext, f: Parameters<typeof listDocs>[2] = {}) => withDebtStatus(db, auth.tenantId, await withUserLabels(db, auth.tenantId, await listDocs(db, auth.tenantId, f))),

  async get(auth: AuthContext, id: string): Promise<{ doc: StoredDoc; analysis: Analysis }> {
    const doc = await getDoc(db, auth.tenantId, id);
    const docs = await listDocsFor(db, auth.tenantId, doc);
    return { doc, analysis: await analyze(db, auth.tenantId, doc, await loadCtx(db, auth.tenantId, docs)) };
  },

  /** Chạy bộ máy cho phiếu đang nhập (chưa lưu). */
  async analyze(auth: AuthContext, raw: unknown): Promise<Analysis> {
    const input = await withBrands(db, auth.tenantId, docInputSchema.parse(raw));
    const docs = await listDocsFor(db, auth.tenantId, input);
    return analyze(db, auth.tenantId, toPDoc(input, input.id ?? 'new'), await loadCtx(db, auth.tenantId, docs));
  },

  async save(auth: AuthContext, raw: unknown, id?: string): Promise<StoredDoc> {
    const parsed = docInputSchema.parse(raw);
    const saved = await db.transaction().execute(async (trx) => {
      const input = await withBrands(trx, auth.tenantId, parsed);
      // Chỉ đọc chứng từ liên quan (cùng NCC / nhãn / phiếu gắn) — trùng số phiếu khác NCC do ràng buộc CSDL chặn.
      const docs = await listDocsFor(trx, auth.tenantId, { ...input, id });
      const cur = id ? docs.find((d) => d.id === id) : undefined;
      if (id && !cur) throw Errors.notFound('chứng từ mua hàng');
      if (cur && LOCKED.has(cur.status)) throw Errors.conflict(cur.status === 'approved' ? 'Phiếu đã duyệt: bỏ duyệt rồi mới sửa được' : 'Phiếu đã huỷ');
      if (cur && cur.kind !== input.kind) throw Errors.validation('Không đổi được loại chứng từ');
      const doc = toPDoc(input, id ?? 'new');
      // Phiếu hàng (trừ đơn đặt): mọi dòng thuộc một phân kho của chi nhánh — trống thì kho mặc định, sai chi nhánh thì báo lỗi.
      if (STOCK_KINDS.includes(doc.kind)) doc.warehouseCode = (await resolveWarehouse(trx, auth.tenantId, doc.branchCode, doc.warehouseCode)) || undefined;
      else delete doc.warehouseCode;
      doc.docNo = input.docNo || cur?.docNo || (await nextDocNo(trx, auth.tenantId, input.kind, input.docDate));
      const ctx = await loadCtx(trx, auth.tenantId, docs);
      const a = await analyze(trx, auth.tenantId, doc, ctx);
      const extra: Record<string, unknown> = { checks: checksOf(a), policyTrace: a.calc.trace };
      if (doc.kind === 'cost' || (doc.kind === 'rebate' && !doc.rebate && doc.refIds?.length)) {
        const receipts = refReceipts(doc, docs);
        if (receipts.length) extra.allocation = spreadOverMany(receipts, doc.amount ?? 0, doc.basis ?? 'value').rows.map((p) => ({ sku: p.sku, name: p.name, amount: p.amount }));
      }
      if (doc.kind === 'rebate' && doc.rebate) {
        const dup = docs.find((d) => d.id !== id && d.kind === 'rebate' && d.status !== 'cancelled' && d.rebate?.policyCode === doc.rebate!.policyCode && d.rebate?.period === doc.rebate!.period);
        if (dup) throw Errors.conflict(`Chính sách ${doc.rebate.policyCode} kỳ ${doc.rebate.period} đã tính thưởng ở phiếu ${dup.docNo} — huỷ phiếu đó nếu cần tính lại`);
      }
      const values = rowValues(doc, a.calc, extra);
      const dupNo = docs.find((d) => d.kind === doc.kind && d.docNo === doc.docNo && d.id !== id);
      if (dupNo) throw Errors.conflict(`Số phiếu ${doc.docNo} đã có`);
      let newId = id;
      if (id) await trx.updateTable('purchase_documents').set({ ...values, updated_at: new Date() }).where('tenant_id', '=', auth.tenantId).where('id', '=', id).execute();
      else newId = String((await trx.insertInto('purchase_documents').values({ tenant_id: auth.tenantId, ...values, created_by: auth.actor, created_by_name: auth.actorName }).returning('id').executeTakeFirstOrThrow()).id);
      if (doc.kind === 'receipt' && doc.refIds?.length) await linkNewItems(trx, auth.tenantId, doc);
      return { doc: await getDoc(trx, auth.tenantId, newId!), a, before: cur };
    }).catch((e: { code?: string; constraint?: string }) => {
      if (e?.code === '23505') throw Errors.conflict('Hoá đơn hoặc số phiếu này đã có ở chứng từ khác');
      throw e;
    });
    await logEvents(auth.tenantId, [{ event: saved.before ? 'doc_saved' : 'doc_created', docNo: saved.doc.docNo, user: auth.actorName, data: { kind: saved.doc.kind, partnerCode: saved.doc.partnerCode, payable: saved.doc.totals.total, errors: saved.a.checks.filter((c) => c.level === 'error').length, warnings: saved.a.checks.filter((c) => c.level === 'warn').length, changes: saved.before ? docChanges(saved.before, saved.doc) : [] } }]);
    return saved.doc;
  },

  async submit(auth: AuthContext, id: string): Promise<StoredDoc> {
    const out = await db.transaction().execute(async (trx) => {
      const docs = await listDocsFor(trx, auth.tenantId, await getDoc(trx, auth.tenantId, id));
      const d = docs.find((x) => x.id === id);
      if (!d) throw Errors.notFound('chứng từ mua hàng');
      const step = wf.plan('submit', d, workflowActor(auth));
      const a = await analyze(trx, auth.tenantId, d, await loadCtx(trx, auth.tenantId, docs));
      await trx.updateTable('purchase_documents').set({ status: step.to, updated_at: new Date() }).where('id', '=', id).execute();
      return { doc: await getDoc(trx, auth.tenantId, id), a };
    }).catch((e: { code?: string }) => { if (e?.code === '23505') throw Errors.conflict('Hoá đơn này đã có ở chứng từ khác đang chờ duyệt / đã duyệt'); throw e; });
    await logEvents(auth.tenantId, [{ event: 'doc_submitted', docNo: out.doc.docNo, user: auth.actorName, data: { payable: out.doc.totals.total } }, ...logRowsFor(out.doc, out.a, auth.actorName, false)]);
    return out.doc;
  },

  /** Duyệt = ghi sổ. override: duyệt ngoại lệ vượt hạn mức (chỉ khi mọi cảnh báo chặn là vượt hạn mức), bắt buộc lý do. */
  async approve(auth: AuthContext, id: string, override?: { reason: string }): Promise<StoredDoc> {
    const out = await db.transaction().execute(async (trx: Db) => {
      const docs = await listDocsFor(trx, auth.tenantId, await getDoc(trx, auth.tenantId, id, true));
      const d = docs.find((x) => x.id === id);
      if (!d) throw Errors.notFound('chứng từ mua hàng');
      // Duyệt ngoại lệ: quyền payments:approve + lý do bắt buộc (khai ở workflow).
      const step = wf.plan(override ? 'override' : 'approve', d, workflowActor(auth), override);
      const ctx = await loadCtx(trx, auth.tenantId, docs);
      const a = await analyze(trx, auth.tenantId, d, ctx);
      // Được duyệt ngoại lệ (có lý do, người có quyền): vượt hạn mức, nhập đổi mã so với đơn đặt.
      const creditOnly = a.blocking.length > 0 && a.blocking.every((c) => OVERRIDABLE.has(c.code));
      if (a.blocking.length && !(override && creditOnly)) {
        throw Errors.conflict(a.blocking.map((c) => c.text).join('; '), { checks: checksOf(a), canOverride: creditOnly });
      }
      const ov = override && creditOnly ? { by: auth.actorName, at: new Date().toISOString(), reason: override.reason.trim() } : undefined;
      // Nhập ngoài đơn: đóng dấu người duyệt + thời điểm cùng lý do (giữ mãi trên phiếu, lọc / rà soát riêng).
      const outside = isOutsideOrder(d, a.refOrder) ? { reason: d.outsideOrder!.reason.trim(), by: auth.actorName, at: new Date().toISOString() } : undefined;
      const links = await postPurchase(trx, auth, d, a.calc, a.accounts, docs);
      const data = { ...(await trx.selectFrom('purchase_documents').select('data').where('id', '=', id).executeTakeFirstOrThrow()).data as Record<string, unknown>, checks: checksOf(a), policyTrace: a.calc.trace, ...((FREEZE_KINDS as readonly string[]).includes(d.kind) ? { frozen: freezeOf(d, a.calc, ctx.policies) } : {}), override: ov, outsideOrder: outside, approvedActor: auth.actor }; // duyệt thường: không mang dấu duyệt ngoại lệ của lần trước
      await trx.updateTable('purchase_documents').set({
        status: step.to, revision: d.revision + 1, links: JSON.stringify(links), data: JSON.stringify(data), approved_by: auth.actorName, approved_at: new Date(),
        due_date: a.calc.dueDate ?? null, updated_at: new Date(),
      }).where('id', '=', id).execute();
      if (ov) await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'purchase.override_credit', objectType: 'purchase_document', objectId: id, after: { docNo: d.docNo, reason: ov.reason, credit: a.credit } });
      return { doc: await getDoc(trx, auth.tenantId, id), a, ov, outside };
    }).catch((e: { code?: string }) => { if (e?.code === '23505') throw Errors.conflict('Hoá đơn này đã có ở chứng từ khác đã duyệt'); throw e; });
    const user = auth.actorName;
    await logEvents(auth.tenantId, [
      ...(out.outside ? [{ event: 'outside_order_approved', docNo: out.doc.docNo, user, data: { reason: out.outside.reason, partner: out.doc.partnerCode, payable: out.doc.totals.total } }] : []),
      ...(out.ov ? [{ event: 'override_approved', docNo: out.doc.docNo, user, data: { reason: out.ov.reason, credit: out.a.credit.map((c) => ({ scope: c.scope, exceeded: c.exceeded, after: c.after, limit: c.limit })) } }] : []),
      { event: 'doc_approved', docNo: out.doc.docNo, user, data: { kind: out.doc.kind, payable: out.doc.totals.total, ledger: out.doc.links.map((l) => `${l.role}: ${l.docNo}`) } },
      ...logRowsFor(out.doc, out.a, user, true),
    ]);
    return out.doc;
  },

  /** Kế toán rà soát phiếu nhập ngoài đơn đã duyệt (xử lý riêng): ghi người, lúc, ghi chú; bỏ khỏi việc cần làm. */
  async reviewOutside(auth: AuthContext, id: string, note = ''): Promise<StoredDoc> {
    const d = await getDoc(db, auth.tenantId, id);
    if (d.status !== 'approved' || !d.outsideOrder?.by) throw Errors.conflict('Chỉ rà soát phiếu nhập ngoài đơn đã duyệt');
    const row = await db.selectFrom('purchase_documents').select('data').where('tenant_id', '=', auth.tenantId).where('id', '=', id).executeTakeFirstOrThrow();
    const data = row.data as Record<string, unknown>;
    const outsideOrder = { ...d.outsideOrder, reviewedBy: auth.actorName, reviewedAt: new Date().toISOString(), reviewNote: note.trim() };
    await db.updateTable('purchase_documents').set({ data: JSON.stringify({ ...data, outsideOrder }), updated_at: new Date() }).where('tenant_id', '=', auth.tenantId).where('id', '=', id).execute();
    await logEvents(auth.tenantId, [{ event: 'outside_order_reviewed', docNo: d.docNo, user: auth.actorName, data: { reason: d.outsideOrder.reason, note: note.trim() } }]);
    return getDoc(db, auth.tenantId, id);
  },

  /** Bỏ duyệt: huỷ các chứng từ kế toán đã sinh (đảo bút toán, gỡ kho, gỡ đối trừ) rồi về nháp. */
  async unapprove(auth: AuthContext, id: string, reason = 'Bỏ duyệt phiếu mua hàng'): Promise<StoredDoc> {
    const d = await getDoc(db, auth.tenantId, id);
    const step = wf.plan('unapprove', d, workflowActor(auth));
    const dependents = (await dependentsOf(db, auth.tenantId, id)).filter((x) => x.kind !== 'payment');
    if (dependents.length) throw Errors.conflict(`Phiếu ${dependents.map((x) => x.docNo).join(', ')} đang dựa trên phiếu này — bỏ duyệt các phiếu đó trước`);
    for (const l of [...d.links].reverse()) await documentService.cancel(auth, l.docKey, `${reason} ${d.docNo}`);
    // Về nháp: xoá dấu duyệt ngoại lệ (lịch sử vẫn ở nhật ký mua hàng MH10 và nhật ký thao tác).
    await db.updateTable('purchase_documents').set({ status: step.to, links: '[]', approved_by: null, approved_at: null, data: sql`data - 'override'`, updated_at: new Date() }).where('tenant_id', '=', auth.tenantId).where('id', '=', id).execute();
    await logEvents(auth.tenantId, [{ event: 'doc_unapproved', docNo: d.docNo, user: auth.actorName, data: { reason, cancelled: d.links.map((l) => l.docNo) } }]);
    return getDoc(db, auth.tenantId, id);
  },

  async cancel(auth: AuthContext, id: string): Promise<StoredDoc> {
    const d = await getDoc(db, auth.tenantId, id);
    if (d.status === 'cancelled') return d;
    const step = wf.plan('cancel', d, workflowActor(auth));
    await db.updateTable('purchase_documents').set({ status: step.to, updated_at: new Date() }).where('tenant_id', '=', auth.tenantId).where('id', '=', id).execute();
    await logEvents(auth.tenantId, [{ event: 'doc_cancelled', docNo: d.docNo, user: auth.actorName, data: {} }]);
    return getDoc(db, auth.tenantId, id);
  },

  /** Tính tiền nhanh không cần cơ sở dữ liệu (dùng cho dữ liệu mẫu). */
  compute: (d: PDoc) => computeDoc(d, []),
};

/** Phiếu nhập lập từ đơn: dòng hàng mới của đơn (chưa có mã) vừa được gắn mã ở phiếu nhập → ghi ngược mã vào dòng của đơn. */
async function linkNewItems(trx: Db, tenantId: string, doc: PDoc): Promise<void> {
  const links = doc.lines.filter((l) => l.refLineKey && l.sku);
  if (!links.length) return;
  const orders = await trx.selectFrom('purchase_documents').select(['id', 'data']).where('tenant_id', '=', tenantId).where('kind', '=', 'order').where('id', 'in', doc.refIds!).execute();
  for (const o of orders) {
    const data = (typeof o.data === 'string' ? JSON.parse(o.data) : o.data) as { lines?: PLine[] };
    let changed = false;
    for (const l of data.lines ?? []) {
      const hit = !l.sku && links.find((x) => x.refLineKey === l.lineKey);
      if (hit) { l.sku = hit.sku; l.name = hit.name || l.name; l.newItem = true; changed = true; }
    }
    if (changed) await trx.updateTable('purchase_documents').set({ data: JSON.stringify(data) as never, updated_at: new Date() }).where('id', '=', o.id).execute();
  }
}
