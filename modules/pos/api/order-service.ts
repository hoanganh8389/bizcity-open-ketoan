/**
 * Nhận một đơn bán (dùng chung cho POST /orders và đơn mới của POST /exchanges). Gọi trong handler của action ghi: runtime bọc
 * cả handler trong một giao dịch, nên kiểm + cấp mã + nộp chứng từ sale + lưu đơn cùng thành công hoặc cùng huỷ.
 */
import { Errors, sql, type ActionContext } from '@bizcity/module-sdk';
import { codePeriod, computeOrder, couponCodes, parseCode, saleDocKey, toOrderSnapshot, toSaleDocument, type OrderProblem } from './domain/order.js';
import type { OrderDraft } from './domain/schema.js';
import { lastCode, takeCodes } from './codes.js';
import { activePaymentMethods, catalogFor, partnerByCode, pricesFor, resolveBranch } from './read.js';
import { changedMessage, checkPrices, noPriceMessage, type PriceIssue } from './domain/price.js';
import { posSettings } from './settings.js';
import { openShiftOf } from './shifts.js';
import { stockOf } from './catalog.js';
import { stockNeeds, stockShortages, stockShortMessage, type StockShort } from './domain/stock.js';
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: hạn mức lượt khuyến mại theo cửa hàng (đóng góp)
import { usesOf } from './domain/promo.js';
import { checkQuota, quotaMessage, recordUses } from './promo.js';
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: voucher TGS / hãng, voucher lần mua sau tự phát (đóng góp)
import type { QuotedVoucher } from './domain/voucher.js';

export const EINVOICE_NONE = { required: false, lines: [] as unknown[], warnings: [] as string[] };

/**
 * Lỗi nghiệp vụ → Errors.*: `details = { reason, ...dữ liệu }` — danh sách (mã hàng…) ở `items`, dữ liệu dạng object trải
 * phẳng cạnh `reason`. Không dùng `details.context` vì khoá đó chỉ dành cho ngữ cảnh chứng từ (BIZCITY-ERRORS §4b).
 */
export function raise(p: OrderProblem): never {
  const extra = p.details === undefined ? {} : Array.isArray(p.details) ? { items: p.details } : (p.details as Record<string, unknown>);
  const details = { ...extra, reason: p.reason };
  throw p.kind === 'conflict' ? Errors.conflict(p.message, details) : Errors.validation(p.message, details);
}

/** Vi phạm UNIQUE (23505) — hai máy gửi đồng thời vượt qua bước kiểm. */
export const isUniqueViolation = (err: unknown) => (err as { code?: string } | null)?.code === '23505';

/** Khoá theo giao dịch (tự nhả lúc commit / huỷ): hai lần gửi cùng khoá chạy nối tiếp. */
export async function lockKey(tx: Parameters<Parameters<ActionContext['data']['module']>[0]>[0], key: string): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`.execute(tx);
}

// [2026-11-15 07:50 PM Võ Hoàng] POS-LOYALTY — NT-BH-020 bước 2: hỏi module loyalty trước khi nhận đơn (đóng góp)
type QuoteReward = { index: string; kind: 'gift' | 'voucher'; points: number; sku?: string; quantity?: number; voucher?: { code: string; discountType: string; discountValue: number; maxDiscount: number; minOrderAmount: number; expiresAt: string | null } };
type Quote = { enabled: boolean; tierKey?: string; tierName?: string; balance?: number; rewards: QuoteReward[]; points: number; earned: number; voucher?: { code: string; amount: number }; problems: string[] };

/**
 * Đổi điểm / voucher / điểm đơn này (NT-BH-020 bước 2): hỏi action đọc `loyalty.redeem.quote` của module loyalty (gọi chéo theo mã,
 * quyền của thu ngân). Đơn có đổi điểm hoặc voucher mà module chưa bật / báo lỗi → chặn, nói rõ. Đơn chỉ có khách: hỏi để in điểm
 * trên bill, module chưa bật thì bỏ qua. `base`: đơn tính thử chưa có voucher (tổng để kiểm đơn tối thiểu, chia tiền giảm).
 */
async function quoteLoyalty(ctx: ActionContext, draft: OrderDraft, branchCode: string, base: ReturnType<typeof computeOrder>) {
  if ('problem' in base) raise(base.problem);
  const coupons = couponCodes(draft);
  const redeem = draft.loyalty?.redeem ?? [];
  const customer = base.customer?.code;
  if (redeem.length && !customer) throw Errors.validation('Đổi điểm phải chọn khách thành viên', { field: 'loyalty' });
  if (!customer && !coupons.length) return null;
  const must = coupons.length > 0 || redeem.length > 0;
  let q: Quote;
  try {
    q = await ctx.actions.call<Quote>('loyalty.redeem.quote', {
      ...(customer ? { customer } : {}), branch: branchCode, orderId: draft.id, orderTotal: base.total, redeem,
      items: base.lines.filter((l) => !l.draft.isGift).map((l) => ({ sku: l.item.sku, qty: l.draft.unitQty * l.unitRatio })),
      ...(coupons[0] ? { voucher: coupons[0] } : {}),
    });
  } catch (e) {
    if (!must) return null;
    throw Errors.validation(`Chưa đổi điểm / dùng voucher được: ${(e as Error).message}`, { field: coupons.length ? 'promotionSelections' : 'loyalty' });
  }
  if (q.problems.length) throw Errors.validation(q.problems.join('; '), { field: coupons.length && !redeem.length ? 'promotionSelections' : 'loyalty' });
  if (!q.enabled && !q.voucher) return null;
  const gifts = new Map(q.rewards.filter((r) => r.kind === 'gift' && r.sku).map((r) => [r.index, { sku: r.sku!, quantity: r.quantity ?? 1 }]));
  const issued = q.rewards.filter((r) => r.kind === 'voucher' && r.voucher).map((r) => r.voucher!);
  return {
    input: { gifts, ...(q.voucher ? { voucher: q.voucher } : {}) },
    snapshot: q.enabled && customer
      ? {
          earned: q.earned, redeemed: q.points, balanceAfter: (q.balance ?? 0) - q.points + q.earned, tierKey: q.tierKey ?? '', tierName: q.tierName ?? '',
          vouchers: issued.map((v) => ({ code: v.code, discountType: v.discountType, discountValue: v.discountValue, maxDiscount: v.maxDiscount, minOrderAmount: v.minOrderAmount, expiresAt: v.expiresAt })),
          rewards: q.rewards,
        }
      : undefined,
  };
}

// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: hỏi module voucher trước khi nhận đơn có voucher / có khách (đóng góp)
type VoucherProblem = { code: string; reason: string; message: string };
type VoucherQuote = { vouchers: QuotedVoucher[]; problems: VoucherProblem[]; issue: Record<string, unknown>[] };

/**
 * Voucher TGS / hãng (NT-BH-026). Đơn có mã: khoá theo từng mã (pg_advisory_xact_lock(hashtext('voucher:'||mã)), thứ tự cố định — cùng khoá
 * phiếu bán BH10 lấy lúc duyệt) tới hết giao dịch, rồi
 * 1. mã đang dùng ở đơn máy bán khác (mod_pos.voucher_uses chưa trả — gồm đơn module voucher chưa nhận sự kiện) → VOUCHER_USED;
 * 2. hỏi action đọc `voucher.order.quote` của module voucher: của khách này, chưa dùng, còn hạn, đơn tối thiểu, giỏ có sản phẩm / nhãn.
 * Đơn có khách (không mất mạng): hỏi luôn voucher lần mua sau tự phát (mã định theo đơn — in trên bill; module voucher thêm mã khi nhận
 * pos.order.recorded). Module voucher chưa bật / thu ngân thiếu quyền voucher:use: đơn có mã → VOUCHER_UNAVAILABLE; đơn không mã → bỏ qua.
 * Cửa sổ rủi ro: mã vừa dùng ở phiếu bán BH10 mà module voucher chưa nhận sự kiện duyệt (outbox) thì quote chưa thấy — module voucher ghi
 * "dùng trùng" vào nhật ký mã khi nhận sự kiện thứ hai (giữ lần đầu) để kế toán xử lý.
 */
async function quoteVouchers(ctx: ActionContext, tx: Parameters<Parameters<ActionContext['data']['module']>[0]>[0], draft: OrderDraft, branchCode: string,
  base: ReturnType<typeof computeOrder>): Promise<{ vouchers: QuotedVoucher[]; issue: Record<string, unknown>[] }> {
  if ('problem' in base) raise(base.problem);
  const codes = [...new Set((draft.vouchers ?? []).map((c) => c.trim().toUpperCase()))];
  const customer = base.customer;
  if (codes.length && !customer) throw Errors.validation('Đơn dùng voucher phải chọn khách (voucher gắn SĐT khách, chỉ khách đó dùng)', { reason: 'VOUCHER_NEED_CUSTOMER', field: 'customer' });
  if (!customer) return { vouchers: [], issue: [] };
  for (const code of [...codes].sort()) await lockKey(tx, `voucher:${code}`);
  if (codes.length) {
    const held = (await sql<{ code: string; order_code: string; business_date: string; branch_code: string }>`
      SELECT code, order_code, business_date::text AS business_date, branch_code FROM mod_pos.voucher_uses
       WHERE code IN (${sql.join(codes)}) AND released_at IS NULL AND order_id <> ${draft.id}`.execute(tx)).rows;
    if (held.length) {
      throw Errors.validation(held.map((h) => `Voucher ${h.code} đã dùng ở đơn ${h.order_code} ngày ${h.business_date} (${h.branch_code})`).join('; '),
        { reason: 'VOUCHER_USED', field: 'vouchers', items: held.map((h) => ({ code: h.code, usedIn: { source: 'pos', refCode: h.order_code, branch: h.branch_code, date: h.business_date } })) });
    }
  }
  let q: VoucherQuote;
  try {
    q = await ctx.actions.call<VoucherQuote>('voucher.order.quote', {
      customer: customer.code, ...(customer.phone ? { phone: customer.phone } : {}), branch: branchCode, refId: draft.id, date: draft.businessDate,
      orderTotal: base.total, codes, issue: !draft.offlineCreatedAt,
      items: base.lines.filter((l) => !l.draft.isGift).map((l) => ({ sku: l.item.sku, qty: l.draft.unitQty * l.unitRatio, amount: l.money.gross })),
    });
  } catch (e) {
    if (!codes.length) return { vouchers: [], issue: [] };
    throw Errors.validation(`Chưa dùng voucher được: ${(e as Error).message}`, { reason: 'VOUCHER_UNAVAILABLE', field: 'vouchers' });
  }
  if (q.problems.length) {
    throw Errors.validation(q.problems.map((p) => p.message).join('; '), { reason: q.problems[0]!.reason, field: 'vouchers', items: q.problems });
  }
  return { vouchers: codes.map((c) => q.vouchers.find((v) => v.code === c)).filter((v): v is QuotedVoucher => Boolean(v)), issue: q.issue };
}

/** Khoá chi nhánh × mã rồi so số xuất (ĐVT nhỏ nhất) với tồn cửa hàng. Trả danh sách mã thiếu (rỗng = đủ). */
export async function checkStock(tx: Parameters<Parameters<ActionContext['data']['module']>[0]>[0], branchCode: string,
  lines: readonly { sku: string; qty: number }[]): Promise<StockShort[]> {
  const need = stockNeeds(lines);
  const skus = [...need.keys()].sort();
  for (const sku of skus) await lockKey(tx, `pos:stock:${branchCode}:${sku}`);
  const have = new Map((await stockOf(tx, branchCode, skus)).map((x) => [x.sku, x.available]));
  return stockShortages(need, have);
}

export type CreatedOrder = { order: Record<string, unknown>; nextReservedCodes: string[]; einvoiceReview: typeof EINVOICE_NONE; replayed: boolean };

export async function createOrder(ctx: ActionContext, draft: OrderDraft, opts: { exchange?: { credit: number; returnDocKey: string } } = {}): Promise<CreatedOrder> {
  const { requireOpenShift } = await posSettings(ctx);
  const prepared = await ctx.data.module(async (tx) => {
    await lockKey(tx, `pos:order:${draft.id}`);
    const old = (await sql<{ snapshot: Record<string, unknown>; same: boolean }>`
      SELECT snapshot, draft = ${JSON.stringify(draft)}::jsonb AS same FROM mod_pos.orders WHERE order_id = ${draft.id}`.execute(tx)).rows[0];
    if (old && !old.same) {
      throw Errors.conflict(`Đơn ${draft.id} đã nhận với nội dung khác — máy phải tạo đơn mới (id mới) thay vì sửa đơn đã gửi`, { reason: 'POS_ORDER_ID_REUSED', orderId: draft.id });
    }
    if (old) return { kind: 'replay', snapshot: old.snapshot } as const;

    const branch = await resolveBranch(tx, draft.branchCode);
    // Cài đặt bán hàng bắt buộc mở ca (NT-BH-011): đơn ngoại tuyến gửi bù vẫn nhận — hàng đã bán thật.
    if (requireOpenShift && !draft.offlineCreatedAt && !(await openShiftOf(tx, branch.code))) {
      throw Errors.conflict(`Chi nhánh ${branch.code} chưa mở ca — mở ca rồi mới bán (Cài đặt bán hàng)`, { reason: 'POS_SHIFT_REQUIRED', branchCode: branch.code });
    }
    const catalog = await catalogFor(tx, draft.lines.map((l) => l.sku));
    // [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-022 (đóng góp): bán đúng bảng giá cửa hàng, không giảm tay, chưa có giá thì không bán.
    // Đơn bán dự phòng lúc mất mạng gửi bù mà giá đã đổi / chưa có giá: hàng đã giao, tiền đã thu → nhận, đánh dấu cho kế toán xem.
    const pc = checkPrices(draft.lines, catalog, await pricesFor(tx, branch.code, draft.lines.map((l) => l.sku)));
    if (pc.manual.length) {
      throw Errors.validation(`Thu ngân không giảm tay (chỉ giảm theo chương trình khuyến mại): ${pc.manual.map((m) => m.sku).join(', ')}`, { reason: 'POS_MANUAL_DISCOUNT', items: pc.manual });
    }
    const priceOffline: PriceIssue[] = draft.offlineCreatedAt ? [...pc.noPrice, ...pc.changed] : [];
    if (!draft.offlineCreatedAt && pc.noPrice.length) throw Errors.validation(noPriceMessage(pc.noPrice, branch.code), { reason: 'POS_NO_PRICE', items: pc.noPrice });
    if (!draft.offlineCreatedAt && pc.changed.length) throw Errors.conflict(changedMessage(pc.changed), { reason: 'POS_PRICE_CHANGED', items: pc.changed });
    const paymentMethods = await activePaymentMethods(tx);
    const partner = 'partnerId' in draft.customer ? await partnerByCode(tx, draft.customer.partnerId) : null;
    const base = { draft, catalog, paymentMethods, partner, ...(opts.exchange ? { exchange: opts.exchange } : {}) };
    const lenient = computeOrder({ ...base, loyalty: { lenient: true } });
    const loyalty = await quoteLoyalty(ctx, draft, branch.code, lenient);
    const vq = await quoteVouchers(ctx, tx, draft, branch.code, lenient);
    const computed = computeOrder({ ...base, ...(loyalty ? { loyalty: loyalty.input } : {}), vouchers: vq.vouchers });
    if ('problem' in computed) raise(computed.problem);

    // [2026-11-16 06:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-021 chặn bán quá tồn (đóng góp)
    // Khoá theo chi nhánh × mã (thứ tự mã cố định, tránh khoá chéo) tới hết giao dịch: hai máy cùng bán một mã chạy nối tiếp,
    // đơn sau thấy tồn đã trừ đơn trước. Đơn bán dự phòng lúc mất mạng gửi bù: hàng đã giao → nhận, đánh dấu cho kế toán xem.
    const stockShort = await checkStock(tx, branch.code, computed.lines.map((l) => ({ sku: l.item.sku, qty: l.draft.unitQty * l.unitRatio })));
    if (stockShort.length && !draft.offlineCreatedAt) {
      throw Errors.validation(stockShortMessage(stockShort, branch.code), { reason: 'POS_STOCK_SHORT', items: stockShort });
    }

    // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: chương trình có hạn mức lượt ở cửa hàng — khoá cửa hàng × chương trình rồi đếm lượt
    // đã dùng (đơn máy bán + phiếu bán BH10 chưa trả lượt). Hết lượt → không nhận; đơn mất mạng gửi bù → nhận, đánh dấu (đóng góp).
    const promoKeys = computed.lines.map((l) => l.draft.policyRef?.key).filter((k): k is string => Boolean(k));
    const quotaShort = await checkQuota(tx, branch.code, promoKeys, draft.id);
    if (quotaShort.length && !draft.offlineCreatedAt) {
      throw Errors.validation(quotaMessage(quotaShort, branch.code), { reason: 'POS_PROMO_QUOTA', items: quotaShort });
    }

    // Mã phiếu: dùng số máy đã được cấp trước (đúng khuôn, đã cấp, chưa dùng); không thì cấp số mới. Khoá theo số để hai máy
    // cùng dùng một số đã cấp không cùng qua bước "chưa dùng".
    const period = codePeriod(draft.businessDate);
    let code: string | undefined;
    const reservedNo = draft.reservedCode ? parseCode('sale', period, draft.reservedCode) : null;
    if (reservedNo !== null && reservedNo <= (await lastCode(tx, branch.code, 'sale', period))) {
      await lockKey(tx, `pos:code:${branch.code}:${draft.reservedCode!}`);
      const used = (await sql<{ n: number }>`
        SELECT 1 AS n FROM mod_pos.orders WHERE branch_code = ${branch.code} AND code = ${draft.reservedCode!}`.execute(tx)).rows.length > 0;
      if (!used) code = draft.reservedCode!;
    }
    code ??= (await takeCodes(tx, ctx.tenant.id, branch.code, 'sale', period, 1))[0]!;
    return { kind: 'new', computed, branch, code, loyalty, stockShort, priceOffline, quotaShort, issuedVouchers: vq.issue } as const;
  });
  if (prepared.kind === 'replay') return { order: prepared.snapshot, nextReservedCodes: [], einvoiceReview: EINVOICE_NONE, replayed: true };

  const { computed, branch, code, loyalty, stockShort, priceOffline, quotaShort, issuedVouchers } = prepared;
  const doc = toSaleDocument(computed, { draft, branchCode: branch.code, code });
  const submitted = await ctx.ledger.submit(doc);
  const order = toOrderSnapshot(computed, { draft, code, branch, createdAt: new Date().toISOString(), ...(loyalty?.snapshot ? { loyalty: loyalty.snapshot } : {}), ...(loyalty?.input.voucher ? { usedVouchers: [loyalty.input.voucher.code] } : {}), issuedVouchers });
  if (stockShort.length) Object.assign(order, { stockShortOffline: stockShort });
  if (priceOffline.length) Object.assign(order, { priceChangedOffline: priceOffline });
  if (quotaShort.length) Object.assign(order, { promoQuotaOffline: quotaShort });

  try {
    await ctx.data.module(async (tx) => {
      await sql`
        INSERT INTO mod_pos.orders (tenant_id, order_id, branch_code, code, business_date, status, customer_code,
                                    subtotal, tax_total, total, doc_key, doc_status, snapshot, draft, created_by, cashier_name)
        VALUES (${ctx.tenant.id}, ${draft.id}, ${branch.code}, ${code}, ${draft.businessDate}, ${order.status},
                ${computed.customer?.code ?? null}, ${computed.subtotal}, ${computed.taxTotal}, ${computed.total},
                ${saleDocKey(branch.code, draft.id)}, ${submitted.status}, ${JSON.stringify(order)}::jsonb,
                ${JSON.stringify(draft)}::jsonb, ${ctx.actor.id}, ${ctx.actor.name || null})`.execute(tx);
      // Lượt dùng chương trình khuyến mại (NT-BH-025): một dòng mỗi chương trình của đơn, cùng giao dịch với đơn.
      const uses = usesOf(computed.lines.map((l) => ({ policyRef: l.draft.policyRef, isGift: l.draft.isGift, qty: l.draft.unitQty, discount: l.draft.promoDiscount })));
      await recordUses(tx, ctx.tenant.id, { source: 'pos', refId: draft.id, refCode: code, branch: branch.code, date: draft.businessDate, uses, offlineOver: quotaShort.map((q) => q.key) });
      // Voucher TGS / hãng (NT-BH-026): mã đang dùng duy nhất (chỉ mục voucher_uses_live) — cùng giao dịch với đơn, còn giữ khoá theo mã.
      for (const v of computed.voucherUses) {
        await sql`INSERT INTO mod_pos.voucher_uses (tenant_id, code, order_id, order_code, branch_code, business_date, kind, method_code, amount, face_value, campaign_id)
          VALUES (${ctx.tenant.id}, ${v.code}, ${draft.id}, ${code}, ${branch.code}, ${draft.businessDate}, ${v.kind}, ${v.methodCode ?? null}, ${v.amount}, ${v.faceValue}, ${v.campaignId})`.execute(tx);
      }
      // Dòng đơn lưu định danh mặt hàng (item_id, ADR-0017 / STD-DATA-6); mã và tên chỉ là ảnh chụp lúc bán.
      for (const l of computed.lines) {
        await sql`
          INSERT INTO mod_pos.order_lines (tenant_id, order_id, line_key, item_id, sku, item_name, unit_name, unit_qty, unit_ratio,
                                           amount, amount_before_tax, tax_amount, discount, tax_code, send_tax)
          VALUES (${ctx.tenant.id}, ${draft.id}, ${l.draft.lineId}, ${l.item.itemId}, ${l.item.sku}, ${l.item.name}, ${l.draft.unitName},
                  ${l.draft.unitQty}, ${l.unitRatio}, ${l.money.gross}, ${l.money.net}, ${l.money.tax}, ${l.money.discountNet},
                  ${l.item.taxCode}, ${l.item.sendTax})`.execute(tx);
      }
    });
  } catch (err) {
    // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: chốt chặn cuối — mã voucher đang dùng ở đơn khác (đóng góp)
    if (isUniqueViolation(err) && (err as { constraint?: string }).constraint === 'voucher_uses_live') {
      throw Errors.validation('Voucher vừa được dùng ở đơn khác — bỏ voucher đó rồi gửi lại', { reason: 'VOUCHER_USED', field: 'vouchers' });
    }
    if (isUniqueViolation(err)) throw Errors.conflict(`Mã phiếu ${code} hoặc đơn ${draft.id} vừa được máy khác dùng — gửi lại đơn`, { reason: 'POS_CODE_TAKEN', code });
    throw err;
  }
  ctx.evidence.note('pos.order', { code, docKey: doc.docKey, docStatus: submitted.status, total: computed.total });
  // Bản sao WP (local_ledger) nhận qua webhook app: sự kiện ghi cùng giao dịch (outbox) — đơn hỏng thì không có sự kiện.
  // Đơn QR chờ tiền: chưa có bản sao (website chỉ ghi đơn đã hoàn tất) — phát lúc xác nhận tiền về (NT-BH-009).
  if (order.status === 'completed') await ctx.events.emit('pos.order.recorded', { orderId: draft.id, code, branchCode: branch.code, docKey: doc.docKey, version: 1, cashier: { name: ctx.actor.name }, order }, {
    subject: `pos.order:${draft.id}`, dedupeKey: `pos.order.recorded:${draft.id}`,
  });
  return { order, nextReservedCodes: [], einvoiceReview: EINVOICE_NONE, replayed: false };
}
