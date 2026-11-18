/**
 * Nghiệp vụ phiếu bán / trả nhập tay (NT-BH-015): lưu nháp (tính lại ở máy chủ, cấp số theo cửa hàng, chặn trùng), duyệt (nộp sổ),
 * bỏ duyệt (huỷ chứng từ trong sổ = đảo bút toán), số còn trả được. Mọi action ghi chạy trong một giao dịch của runtime.
 * Duyệt / bỏ duyệt phát sự kiện cùng giao dịch (outbox) để website shop có bản sao phiếu — không cần plugin POS (NT-BH-017,
 * chữ chốt nghiep-vu/23): phieu-ban.doc.recorded (kèm TradeDoc đã tính, phiên bản sổ), phieu-ban.doc.cancelled.
 */
// [2026-11-14 11:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-017: phát sự kiện duyệt / bỏ duyệt cho bản sao website (đóng góp)
// [2026-11-13 11:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-015: nghiệp vụ phiếu bán / trả nhập tay (đóng góp)
import { randomUUID } from 'node:crypto';
import { Errors, type ActionContext } from '@bizcity/module-sdk';
import { computeDoc, docKeyOf, overReturn, returnableBySku, stockShortByWarehouse, stockShortOf, toLedgerDoc, withGiftWarehouse, type Body, type DocInput, type Kind } from './domain/doc.js';
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: voucher TGS / hãng (đóng góp)
import { applyVouchers, stripVouchers, type QuotedVoucher, type VoucherBody } from './domain/voucher.js';
import {
  activeMethods, approvedReturnsOf, lockVoucher, voucherHeldByOther, lockedStock, branchExists, catalogFor, getDoc, noTaken, partnerByCode, saleByNo, saveDoc, setStatus, takeNo, taxRates, toTradeDoc,
  type DocRow, type Tx,
} from './store.js';

const fail = (problems: string[]): never => { throw Errors.validation(problems.join(' · '), { items: problems }); };

// [2026-11-16 06:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-021: công tắc riêng của phiếu bán (Q6), mặc định tắt = chỉ cảnh báo như trước
export const BLOCK_NEGATIVE_STOCK = 'bizcity.phieu_ban.block_negative_stock';


// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: hạn mức lượt khuyến mại dùng chung với máy bán (đóng góp)
type QuotaState = { branch: string; items: { key: string; quota: number; used: number; left: number }[] };
/**
 * Phiếu bán có dòng mang chương trình khuyến mại: hỏi lượt còn ở cửa hàng qua action đọc `pos.promo.quota` của module pos (đếm chung
 * đơn máy bán + phiếu bán đã duyệt; bỏ lượt của chính phiếu này khi duyệt lại). Hết lượt → PHIEU_BAN_PROMO_QUOTA. Module pos chưa bật
 * (NOT_FOUND) → không có hạn mức, bỏ qua. Lượt của phiếu được module pos ghi khi nhận sự kiện phieu-ban.doc.recorded.
 */
async function checkPromoQuota(ctx: ActionContext, branch: string, lines: readonly { policyRef?: { key: string } }[], docId: string) {
  const keys = [...new Set(lines.map((l) => l.policyRef?.key).filter((k): k is string => Boolean(k)))];
  if (!keys.length) return;
  let st: QuotaState;
  try {
    st = await ctx.actions.call<QuotaState>('pos.promo.quota', { branch, keys: keys.join(','), exclude: docId });
  } catch (e) {
    if ((e as { code?: string }).code === 'NOT_FOUND') return;
    throw e;
  }
  const short = st.items.filter((x) => x.left <= 0).map(({ key, quota, used }) => ({ key, quota, used }));
  if (short.length) {
    throw Errors.validation(`Chương trình khuyến mại hết lượt ở ${branch}: ${short.map((s) => `${s.key} (đã dùng ${s.used}/${s.quota})`).join('; ')} — bỏ khuyến mại đó khỏi phiếu rồi duyệt lại`,
      { reason: 'PHIEU_BAN_PROMO_QUOTA', items: short });
  }
}

// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-028: dòng quà của phiếu bán tự vào kho quà (KKM) của cửa hàng — khoá bizcity.pos.gift_warehouses dùng chung với máy bán (đóng góp)
type GiftWarehouse = { branch: string; saleWarehouse: string; giftWarehouse: string | null; issue: string | null };
/**
 * Kho quà của cửa hàng cho phiếu bán có dòng quà: hỏi action đọc `pos.gift-warehouse.get` của module pos (khoá cài đặt thuộc module pos;
 * ctx.settings.get của module này chỉ đọc khoá bizcity.phieu_ban.*). Module pos chưa bật (NOT_FOUND) / cửa hàng chưa khai → null (như cũ:
 * quà ở kho của phiếu). Khai sai (không thuộc cửa hàng, ngừng dùng, không phải KKM) → POS_GIFT_WAREHOUSE. Gọi NGOÀI ctx.data.module.
 */
export async function giftWarehouseOf(ctx: ActionContext, kind: Kind, branch: string, lines: readonly { isGift?: boolean }[]): Promise<string | null> {
  if (kind !== 'sale' || !lines.some((l) => l.isGift)) return null;
  let g: GiftWarehouse;
  try {
    g = await ctx.actions.call<GiftWarehouse>('pos.gift-warehouse.get', { branch });
  } catch (e) {
    if ((e as { code?: string }).code === 'NOT_FOUND') return null;
    throw e;
  }
  if (g.issue) {
    throw Errors.validation(`Kho quà của cửa hàng ${branch} không dùng được: ${g.issue} — kế toán chọn lại kho khuyến mại (KKM) ở Cài đặt bán hàng (BH17)`,
      { reason: 'POS_GIFT_WAREHOUSE', branchCode: branch });
  }
  return g.giftWarehouse;
}

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
  const giftWarehouse = await giftWarehouseOf(ctx, kind, input.branchCode, input.lines);
  return ctx.data.module(async (tx) => saveDraftIn(tx, ctx, kind, input, id, { giftWarehouse }));
}

// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: lưu nháp trong giao dịch module có sẵn (đơn đặt hàng sinh phiếu bán nháp khi giao) (đóng góp)
/**
 * Lưu nháp trong giao dịch module của người gọi. `order`: chỉ máy chủ gắn (nút Giao của đơn đặt hàng) — số đơn do màn gửi lên bị bỏ;
 * sửa phiếu đã nối đơn thì giữ nối đơn và báo đơn số lượng mới của lần giao (onLinkedEdit).
 */
export async function saveDraftIn(tx: Tx, ctx: ActionContext, kind: Kind, input: DocInput, id?: string, opts: {
  order?: { id: string; no: string };
  /** NT-BH-028: kho quà của cửa hàng (đã hỏi module pos) — dòng quà tự vào kho này; không có thì gán lúc duyệt. */
  giftWarehouse?: string | null;
  onLinkedEdit?: (tx: Tx, doc: { docId: string; orderId: string; lines: { lineKey: string; sku: string; qty: number }[] }) => Promise<void>;
} = {}) {
  const cur = id ? await getDoc(tx, id, true) : null;
  if (cur && cur.kind !== kind) throw Errors.validation('Sai loại phiếu');
  if (cur && cur.status !== 'draft') throw Errors.conflict('Phiếu đã duyệt — bỏ duyệt rồi mới sửa');
  const order = opts.order ?? cur?.body.order;
  const prepared = await prepare(tx, kind, { ...input, order });
  if (prepared.problems.length) fail(prepared.problems);
  const body = withGiftWarehouse(prepared.body, opts.giftWarehouse ?? null);
  if (cur && order && opts.onLinkedEdit) {
    await opts.onLinkedEdit(tx, { docId: cur.doc_id, orderId: order.id, lines: body.lines.map((l) => ({ lineKey: l.lineKey, sku: l.sku, qty: l.qty })) });
  }
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
}

// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: duyệt lại tính từ phiếu đã gỡ phần voucher; mã voucher của nháp đi lại vào đầu vào (đóng góp)
const asInput = (r: DocRow): DocInput => {
  const b = stripVouchers(r.body as VoucherBody);
  return { docNo: r.doc_no, docDate: r.doc_date, branchCode: r.branch_code, ...(b as Body), ...(b.voucherCodes ? { vouchers: b.voucherCodes } : {}), warehouseCode: r.warehouse_code ?? undefined } as DocInput;
};

// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: voucher TGS / hãng lúc duyệt phiếu bán (đóng góp)
type VoucherQuote = { vouchers: QuotedVoucher[]; problems: { code: string; reason: string; message: string }[] };
/**
 * Phiếu bán có mã voucher: khoá theo từng mã (pg_advisory_xact_lock(hashtext('voucher:'||mã)) — cùng khoá máy bán lấy khi nhận đơn) tới hết
 * giao dịch duyệt; mã đang nằm ở phiếu bán khác đã duyệt → VOUCHER_USED; hỏi action đọc `voucher.order.quote` (của khách phiếu, chưa dùng,
 * còn hạn, đơn tối thiểu, giỏ có sản phẩm / nhãn) rồi áp: TGS = chiết khấu trên dòng, hãng = dòng thanh toán. Module voucher đánh dấu đã
 * dùng khi nhận phieu-ban.doc.recorded. Cửa sổ rủi ro: mã vừa dùng ở máy bán mà module voucher chưa nhận sự kiện đơn (outbox) thì quote
 * chưa thấy — module voucher ghi "dùng trùng" vào nhật ký mã khi nhận sự kiện thứ hai.
 */
async function applyDocVouchers(ctx: ActionContext, r: DocRow, body: Body): Promise<Body> {
  const codes = (body as VoucherBody).voucherCodes ?? [];
  if (r.kind !== 'sale' || !codes.length) return body;
  if (!body.partner?.code) throw Errors.validation('Phiếu dùng voucher phải chọn khách (voucher gắn SĐT khách, chỉ khách đó dùng)', { reason: 'VOUCHER_NEED_CUSTOMER', field: 'partner' });
  const { held, rates, methods } = await ctx.data.module(async (tx) => {
    for (const code of [...codes].sort()) await lockVoucher(tx, code);
    return { held: await voucherHeldByOther(tx, codes, r.doc_id), rates: await taxRates(tx), methods: await activeMethods(tx) };
  });
  if (held.length) {
    throw Errors.validation(held.map((h) => `Voucher ${h.code} đã dùng ở phiếu ${h.docNo} ngày ${h.docDate}`).join('; '),
      { reason: 'VOUCHER_USED', field: 'vouchers', items: held.map((h) => ({ code: h.code, usedIn: { source: 'phieu-ban', refCode: h.docNo, date: h.docDate } })) });
  }
  let q: VoucherQuote;
  try {
    q = await ctx.actions.call<VoucherQuote>('voucher.order.quote', {
      customer: body.partner.code, branch: r.branch_code, refId: r.doc_id, date: r.doc_date, orderTotal: body.totals.total, codes, issue: false,
      items: body.lines.filter((l) => !l.isGift).map((l) => ({ sku: l.sku, qty: l.qty, amount: l.amountBeforeTax + l.taxAmount })),
    });
  } catch (e) {
    throw Errors.validation(`Chưa dùng voucher được: ${(e as Error).message}`, { reason: 'VOUCHER_UNAVAILABLE', field: 'vouchers' });
  }
  if (q.problems.length) throw Errors.validation(q.problems.map((p) => p.message).join('; '), { reason: q.problems[0]!.reason, field: 'vouchers', items: q.problems });
  const ordered = codes.map((c) => q.vouchers.find((v) => v.code === c)).filter((v): v is QuotedVoucher => Boolean(v));
  const res = applyVouchers(body as VoucherBody, ordered, rates);
  if ('problem' in res) throw Errors.validation(res.problem.message, { reason: res.problem.reason, field: 'vouchers', code: res.problem.code });
  const bad = res.body.payments.find((p) => p.voucherCode && !methods.has(p.methodCode));
  if (bad) {
    throw Errors.validation(`Hình thức thanh toán ${bad.methodCode} của voucher hãng ${bad.voucherCode} không có / ngừng dùng — kế toán khai lại ở đợt phát`, { reason: 'VOUCHER_PAYMENT_METHOD', method: bad.methodCode });
  }
  const paid = res.body.payments.reduce((s, p) => s + p.amount, 0);
  if (paid > res.body.totals.total) fail([`Tiền thu (${paid.toLocaleString('vi-VN')}) lớn hơn tổng phiếu sau voucher (${res.body.totals.total.toLocaleString('vi-VN')}) — giảm tiền thu`]);
  return res.body as Body;
}

/** Duyệt: tính lại theo danh mục hiện tại, kiểm số còn trả (phiếu trả nối phiếu của module), nộp sổ phiên bản kế tiếp. */
export async function approve(ctx: ActionContext, id: string) {
  // Cài đặt đọc ngoài giao dịch của module (vai trò module không đọc bảng cấu hình của Core).
  const blockStock = (await ctx.settings.get<unknown>(BLOCK_NEGATIVE_STOCK)) === true;
  const head = await ctx.data.module(async (tx) => getDoc(tx, id));
  const giftWh = await giftWarehouseOf(ctx, head.kind, head.branch_code, head.body.lines);
  const prepared = await ctx.data.module(async (tx) => {
    const r = await getDoc(tx, id, true);
    if (r.status === 'approved') throw Errors.conflict('Phiếu đã duyệt');
    const p0 = await prepare(tx, r.kind, asInput(r));
    if (p0.problems.length) fail(p0.problems);
    const p = { ...p0, body: withGiftWarehouse(p0.body, r.branch_code === head.branch_code ? giftWh : null) };
    // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-030 Q4: phiếu trả này trả hết hàng bán (không kể quà) của phiếu gốc → báo module pos trả lượt khuyến mại (đóng góp)
    let originalFullyReturned = false;
    if (r.kind === 'sale_return' && p.original) {
      if (p.original.status !== 'approved') fail([`Phiếu bán gốc ${p.original.doc_no} chưa duyệt`]);
      const done = (await approvedReturnsOf(tx, p.original.doc_id, r.doc_id)).flatMap((x) => x.body.lines);
      const sold = p.original.body.lines.filter((l) => !l.isGift);
      const over = overReturn(p.body.lines, returnableBySku(sold, done));
      if (over.length) fail(over.map((x) => `Trả vượt số đã bán của phiếu ${p.original!.doc_no} — ${x}`));
      originalFullyReturned = [...returnableBySku(sold, [...done, ...p.body.lines].filter((l) => !l.isGift)).values()].every((q) => q <= 1e-9);
    }
    if (r.kind === 'sale' && blockStock) {
      // Phiếu đang sửa đã bỏ duyệt (chứng từ trong sổ đã huỷ) nên tồn đọc được không còn trừ chính nó.
      const have = await lockedStock(tx, r.branch_code, r.warehouse_code, p.body.lines.filter((l) => !l.warehouseCode).map((l) => l.sku));
      // NT-BH-028: dòng quà ở kho quà kiểm tồn kho quà, không cộng chung với kho của phiếu.
      const giftLines = p.body.lines.filter((l) => l.warehouseCode);
      const short = giftLines.length && giftWh
        ? stockShortByWarehouse(p.body.lines, new Map([[r.warehouse_code ?? '', have], [giftWh, await lockedStock(tx, r.branch_code, giftWh, giftLines.map((l) => l.sku))]]), r.warehouse_code ?? '')
        : stockShortOf(p.body.lines, have);
      if (short.length) {
        const where = r.warehouse_code || r.branch_code;
        throw Errors.validation(`Bán quá tồn: ${short.map((s) => `${s.sku} cần ${s.need}, tồn ${s.have}`).join('; ')} ở ${where} — tắt công tắc "Chặn bán quá tồn ở phiếu bán nhập tay" ở BH17 nếu muốn chỉ cảnh báo`,
          { reason: 'PHIEU_BAN_STOCK_SHORT', items: short });
      }
    }
    return { r, ...p, originalFullyReturned };
  });
  // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: chương trình khuyến mại có hạn mức lượt theo cửa hàng — hỏi lượt còn ở module pos (đóng góp)
  if (prepared.r.kind === 'sale') await checkPromoQuota(ctx, prepared.r.branch_code, prepared.body.lines, id);
  const body = await applyDocVouchers(ctx, prepared.r, prepared.body);
  // Đã từng nộp rồi bỏ duyệt: chứng từ trong sổ phải đã huỷ xong (chế độ chờ duyệt: kế toán duyệt huỷ ở ACC14) mới nộp lại.
  if (prepared.r.ledger_version > 0) {
    const st = await ctx.ledger.get(docKeyOf(id));
    if (st && st.status !== 'cancelled') throw Errors.conflict(`Chứng từ trong sổ đang ở trạng thái "${st.status}" — chờ huỷ xong ở Trạm chứng từ ACC14 rồi duyệt lại`);
  }
  const version = prepared.r.ledger_version + 1;
  const submitted = await ctx.ledger.submit(toLedgerDoc({
    docId: id, kind: prepared.r.kind, branchCode: prepared.r.branch_code, docNo: prepared.r.doc_no, docDate: prepared.r.doc_date, body,
    version, originalDocId: prepared.original?.doc_id ?? null, catalog: prepared.catalog,
  }));
  return ctx.data.module(async (tx) => {
    await saveDoc(tx, {
      docId: id, tenantId: ctx.tenant.id, kind: prepared.r.kind, branchCode: prepared.r.branch_code, warehouseCode: prepared.r.warehouse_code, docNo: prepared.r.doc_no,
      docDate: prepared.r.doc_date, partnerCode: prepared.body.partner?.code ?? null, originalDocId: prepared.original?.doc_id ?? null, body, actor: ctx.actor.id, insert: false,
    });
    await setStatus(tx, id, { status: 'approved', ledgerVersion: version, ledgerStatus: submitted.status, actor: ctx.actor.id });
    return toTradeDoc(await getDoc(tx, id));
  }).then(async (doc) => {
    await ctx.events.emit('phieu-ban.doc.recorded', {
      docId: id, docKey: docKeyOf(id), version, kind: prepared.r.kind, branchCode: prepared.r.branch_code, cashier: { name: ctx.actor.name },
      doc, ...(prepared.original ? {
        originalDocKey: docKeyOf(prepared.original.doc_id), originalDocId: prepared.original.doc_id, originalFullyReturned: prepared.originalFullyReturned,
      } : {}),
    }, { subject: `phieu-ban.doc:${id}`, dedupeKey: `phieu-ban.doc.recorded:${id}:${version}` });
    return doc;
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
    // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: phiếu về nháp → gỡ phần voucher đã áp (giữ mã ở nháp); module voucher trả mã theo sự kiện (đóng góp)
    if ((r.body as VoucherBody).vouchers?.length) {
      await saveDoc(tx, {
        docId: id, tenantId: ctx.tenant.id, kind: r.kind, branchCode: r.branch_code, warehouseCode: r.warehouse_code, docNo: r.doc_no, docDate: r.doc_date,
        partnerCode: r.partner_code, originalDocId: r.original_doc_id, body: stripVouchers(r.body as VoucherBody) as Body, actor: ctx.actor.id, insert: false,
      });
    }
    return { ...toTradeDoc(await getDoc(tx, id)), reversed: res.reversed };
  }).then(async (doc) => {
    // NT-BH-030 Q4: phiếu trả bỏ duyệt mang phiếu gốc — module pos lấy lại lượt khuyến mại đã trả theo phiếu trả này.
    await ctx.events.emit('phieu-ban.doc.cancelled', {
      docId: id, docKey: docKeyOf(id), version: r.ledger_version, kind: r.kind, branchCode: r.branch_code,
      ...(r.kind === 'sale_return' && r.original_doc_id ? { originalDocId: r.original_doc_id } : {}),
    },
      { subject: `phieu-ban.doc:${id}`, dedupeKey: `phieu-ban.doc.cancelled:${id}:${r.ledger_version}` });
    return doc;
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
