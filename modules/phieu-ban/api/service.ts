/**
 * Nghiệp vụ phiếu bán / trả nhập tay (NT-BH-015): lưu nháp (tính lại ở máy chủ, cấp số theo cửa hàng, chặn trùng), duyệt (nộp sổ),
 * bỏ duyệt (huỷ chứng từ trong sổ = đảo bút toán), số còn trả được. Mọi action ghi chạy trong một giao dịch của runtime.
 */
// [2026-11-13 11:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-015: nghiệp vụ phiếu bán / trả nhập tay (đóng góp)
import { randomUUID } from 'node:crypto';
import { Errors, type ActionContext } from '@bizcity/module-sdk';
import { computeDoc, docKeyOf, overReturn, returnableBySku, toLedgerDoc, type Body, type DocInput, type Kind } from './domain/doc.js';
import {
  activeMethods, approvedReturnsOf, branchExists, catalogFor, getDoc, noTaken, partnerByCode, saleByNo, saveDoc, setStatus, takeNo, taxRates, toTradeDoc,
  type DocRow, type Tx,
} from './store.js';

const fail = (problems: string[]): never => { throw Errors.validation(problems.join(' · '), { items: problems }); };

/** Kiểm + tính một phiếu (nháp hoặc lúc duyệt). Phiếu trả: nối phiếu bán gốc của module theo số (cùng cửa hàng) nếu có. */
async function prepare(tx: Tx, kind: Kind, input: DocInput) {
  if (!(await branchExists(tx, input.branchCode))) fail([`Chi nhánh ${input.branchCode} không có / ngừng dùng`]);
  const catalog = await catalogFor(tx, input.lines.map((l) => l.sku));
  const partner = input.partner?.code ? await partnerByCode(tx, input.partner.code) : null;
  const { body, problems } = computeDoc(input, { catalog, taxRates: await taxRates(tx), methods: await activeMethods(tx), partner });
  let original: DocRow | null = null;
  if (kind === 'sale_return' && input.originalDocNo) {
    original = await saleByNo(tx, input.branchCode, input.originalDocNo);
    // Số gốc không phải phiếu của module (đơn máy bán, phiếu WP…): giữ làm tham khảo, không kiểm số còn trả.
  }
  return { body, problems, catalog, original };
}

/** Lưu nháp: thêm (id trống) hoặc sửa phiếu nháp. Số trống → cấp theo cửa hàng; số gõ tay → không trùng trong cửa hàng + loại. */
export async function saveDraft(ctx: ActionContext, kind: Kind, input: DocInput, id?: string) {
  return ctx.data.module(async (tx) => {
    const cur = id ? await getDoc(tx, id, true) : null;
    if (cur && cur.kind !== kind) throw Errors.validation('Sai loại phiếu');
    if (cur && cur.status !== 'draft') throw Errors.conflict('Phiếu đã duyệt — bỏ duyệt rồi mới sửa');
    const { body, problems } = await prepare(tx, kind, input);
    if (problems.length) fail(problems);
    const sameBranch = cur && cur.branch_code === input.branchCode;
    let docNo = input.docNo?.trim() || (sameBranch ? cur.doc_no : '');
    if (docNo && await noTaken(tx, input.branchCode, kind, docNo, cur?.doc_id)) {
      fail([`Số phiếu ${docNo} đã có ở chi nhánh ${input.branchCode} — để trống để phần mềm tự cấp số mới`]);
    }
    docNo ||= await takeNo(tx, ctx.tenant.id, input.branchCode, kind, input.docDate);
    const docId = cur?.doc_id ?? randomUUID();
    await saveDoc(tx, {
      docId, tenantId: ctx.tenant.id, kind, branchCode: input.branchCode, warehouseCode: input.warehouseCode || null, docNo, docDate: input.docDate,
      partnerCode: body.partner?.code ?? null, originalDocId: null, body, actor: ctx.actor.id, insert: !cur,
    });
    return toTradeDoc(await getDoc(tx, docId));
  });
}

const asInput = (r: DocRow): DocInput => ({ docNo: r.doc_no, docDate: r.doc_date, branchCode: r.branch_code, ...(r.body as Body), warehouseCode: r.warehouse_code ?? undefined } as DocInput);

/** Duyệt: tính lại theo danh mục hiện tại, kiểm số còn trả (phiếu trả nối phiếu của module), nộp sổ phiên bản kế tiếp. */
export async function approve(ctx: ActionContext, id: string) {
  const prepared = await ctx.data.module(async (tx) => {
    const r = await getDoc(tx, id, true);
    if (r.status === 'approved') throw Errors.conflict('Phiếu đã duyệt');
    const p = await prepare(tx, r.kind, asInput(r));
    if (p.problems.length) fail(p.problems);
    if (r.kind === 'sale_return' && p.original) {
      if (p.original.status !== 'approved') fail([`Phiếu bán gốc ${p.original.doc_no} chưa duyệt`]);
      const done = (await approvedReturnsOf(tx, p.original.doc_id, r.doc_id)).flatMap((x) => x.body.lines);
      const over = overReturn(p.body.lines, returnableBySku(p.original.body.lines.filter((l) => !l.isGift), done));
      if (over.length) fail(over.map((x) => `Trả vượt số đã bán của phiếu ${p.original!.doc_no} — ${x}`));
    }
    return { r, ...p };
  });
  // Đã từng nộp rồi bỏ duyệt: chứng từ trong sổ phải đã huỷ xong (chế độ chờ duyệt: kế toán duyệt huỷ ở ACC14) mới nộp lại.
  if (prepared.r.ledger_version > 0) {
    const st = await ctx.ledger.get(docKeyOf(id));
    if (st && st.status !== 'cancelled') throw Errors.conflict(`Chứng từ trong sổ đang ở trạng thái "${st.status}" — chờ huỷ xong ở Trạm chứng từ ACC14 rồi duyệt lại`);
  }
  const version = prepared.r.ledger_version + 1;
  const submitted = await ctx.ledger.submit(toLedgerDoc({
    docId: id, kind: prepared.r.kind, branchCode: prepared.r.branch_code, docNo: prepared.r.doc_no, docDate: prepared.r.doc_date, body: prepared.body,
    version, originalDocId: prepared.original?.doc_id ?? null, catalog: prepared.catalog,
  }));
  return ctx.data.module(async (tx) => {
    await saveDoc(tx, {
      docId: id, tenantId: ctx.tenant.id, kind: prepared.r.kind, branchCode: prepared.r.branch_code, warehouseCode: prepared.r.warehouse_code, docNo: prepared.r.doc_no,
      docDate: prepared.r.doc_date, partnerCode: prepared.body.partner?.code ?? null, originalDocId: prepared.original?.doc_id ?? null, body: prepared.body, actor: ctx.actor.id, insert: false,
    });
    await setStatus(tx, id, { status: 'approved', ledgerVersion: version, ledgerStatus: submitted.status, actor: ctx.actor.id });
    return toTradeDoc(await getDoc(tx, id));
  });
}

/** Bỏ duyệt: huỷ chứng từ trong sổ (ghi ngay → đảo bút toán; chờ duyệt → chờ huỷ ở ACC14), phiếu về nháp. Phiếu bán còn phiếu trả đã duyệt → chặn. */
export async function unapprove(ctx: ActionContext, id: string, reason: string) {
  const r = await ctx.data.module(async (tx) => {
    const row = await getDoc(tx, id, true);
    if (row.status !== 'approved') throw Errors.conflict('Phiếu chưa duyệt');
    if (row.kind === 'sale') {
      const rets = await approvedReturnsOf(tx, row.doc_id);
      if (rets.length) fail([`Phiếu bán đã có phiếu trả đã duyệt (${rets.map((x) => x.doc_no).join(', ')}) — bỏ duyệt phiếu trả trước`]);
    }
    return row;
  });
  const res = await ctx.ledger.cancel(docKeyOf(id), reason);
  return ctx.data.module(async (tx) => {
    await setStatus(tx, id, { status: 'draft', ledgerStatus: res.cancelled ? 'cancelled' : res.requested ? 'cancel_requested' : r.ledger_status, actor: ctx.actor.id });
    return { ...toTradeDoc(await getDoc(tx, id)), reversed: res.reversed };
  });
}

/** Số còn trả được của một phiếu bán đã duyệt, theo dòng (quà không trả riêng). */
export async function returnable(ctx: ActionContext, id: string) {
  return ctx.data.module(async (tx) => {
    const r = await getDoc(tx, id);
    if (r.kind !== 'sale') throw Errors.validation('Chỉ phiếu bán mới có số còn trả được');
    const left = returnableBySku(r.body.lines.filter((l) => !l.isGift), (await approvedReturnsOf(tx, r.doc_id)).flatMap((x) => x.body.lines));
    return { docNo: r.doc_no, status: r.status, lines: r.body.lines.filter((l) => !l.isGift).map((l) => ({ lineKey: l.lineKey, sku: l.sku, name: l.name, unit: l.unit, qty: l.qty, returnable: Math.max(0, left.get(l.sku) ?? 0) })) };
  });
}
