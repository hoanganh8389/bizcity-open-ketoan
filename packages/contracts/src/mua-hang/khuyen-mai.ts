// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 04:56 PM Nguyễn Văn Thủy] R-REV — % chiết khấu trong bảng khuyến mại hiển thị kiểu Việt Nam (số lẻ) (commit f03e8e6, đóng góp).
// [2026-10-31 04:53 PM Johnny Chu - Chu Hoàng Anh] R-REV — duyệt thay đổi của Nguyễn Văn Thủy (commit f03e8e6), biên bản docs/audits/REVIEW-2026-10-31-THUY.md §7.
/**
 * NHÃN HÀNG & KHUYẾN MẠI CỦA PHIẾU — hàm thuần dùng chung máy chủ + giao diện.
 *
 * Nhãn hàng (theo danh mục 3 cấp Ngành → Nhãn → Nhóm): là thuộc tính của MẶT HÀNG, khai một chỗ ở danh mục mặt hàng.
 *   - dòng phiếu mang nhãn của mặt hàng (máy chủ ghi lại khi lưu, không nhập tay);
 *   - phiếu có "nhãn chính" = nhãn chiếm giá trị hàng mua lớn nhất (tự suy, chỉ để lọc / hiển thị);
 *   - số liệu theo nhãn (hạn mức toàn nhãn, chỉ tiêu, thưởng) tính theo PHẦN của nhãn trong phiếu (brandShare), nên phiếu
 *     nhiều nhãn vẫn đúng.
 *
 * Khuyến mại (như màn khuyến mại của quầy bán hàng): bảng liệt kê mọi chương trình liên quan tới phiếu —
 *   - "đã áp": chiết khấu theo mã / bậc SL / CK đơn / CKTT / quà đã đủ;
 *   - "cần xem": thiếu / thừa quà, CK ghi tay khác chính sách;
 *   - "gợi ý": mua thêm bao nhiêu để được tặng / lên bậc chiết khấu.
 * syncGifts: tự thêm / sửa / bỏ dòng quà theo chương trình mỗi khi bảng hàng đổi (dòng quà người dùng tự sửa SL thì giữ nguyên).
 */
import { exclusiveBySku, findPolicy, policyApplies, isRepeat, tradeTimes, giftPlan, policiesFor, policiesForSku, itemDiscountFor, pickTier, tradeDiscountMin, tradeDiscountReady, type DocCalc, type ItemDiscount, type LineType, type PDoc, type PLine, type Policy, type PolicyKind } from './engine.js';

/** Nhãn chính của phiếu: nhãn có tổng giá trị hàng mua lớn nhất (chưa có giá thì theo số dòng). */
export function docBrand(lines: Pick<PLine, 'brandCode' | 'qty' | 'price' | 'lineType'>[]): string | undefined {
  const by = new Map<string, number>();
  for (const l of lines) if (l.brandCode && l.lineType === 'buy') by.set(l.brandCode, (by.get(l.brandCode) ?? 0) + (l.qty * l.price || 0.000001));
  return [...by].sort((a, b) => b[1] - a[1])[0]?.[0];
}
/** Các nhãn của phiếu và tỉ trọng giá trị (0–1), lớn trước. */
export function brandMix(doc: Pick<PDoc, 'lines' | 'brandCode'>): { brandCode: string; share: number }[] {
  const by = new Map<string, number>();
  let total = 0;
  for (const l of doc.lines) if (l.lineType === 'buy') { const v = l.qty * l.price; total += v; if (l.brandCode) by.set(l.brandCode, (by.get(l.brandCode) ?? 0) + v); }
  if (!by.size) return doc.brandCode ? [{ brandCode: doc.brandCode, share: 1 }] : [];
  return [...by].map(([brandCode, v]) => ({ brandCode, share: total ? v / total : 1 / by.size })).sort((a, b) => b.share - a.share);
}
/** Phần của một nhãn trong phiếu (nhân với tiền phiếu để ra số theo nhãn). Phiếu cũ chưa có nhãn dòng: theo nhãn phiếu. */
export function brandShare(doc: Pick<PDoc, 'lines' | 'brandCode'>, brand: string): number {
  return brandMix(doc).find((x) => x.brandCode === brand)?.share ?? 0;
}

/** off = chính sách đã bỏ tích trên phiếu này (tích lại để áp); blocked = không áp cho mã vì mã đang nhận chương trình áp riêng khác. */
export type PromoStatus = 'applied' | 'fix' | 'hint' | 'off' | 'blocked';
export interface PromoRow {
  key: string;
  status: PromoStatus;
  kind: PolicyKind | 'manual';
  policy: string;
  name: string;
  sku?: string;
  lineKey?: string;
  /** Câu mô tả ngắn: "CK 3%", "mua 25 → tặng 2" … */
  text: string;
  /** Quà: số được tặng / số trên phiếu. */
  expected?: number;
  got?: number;
  giftSku?: string;
  /** ĐVT tặng của chương trình (số expected / got theo ĐVT này). */
  giftUnit?: string;
  lineType?: LineType;
  /** Việc có thể bấm: sửa số quà về đúng, bỏ CK ghi tay để dùng chính sách, mua thêm để lên bậc. */
  action?: { label: string; type: 'gift_fix' | 'use_policy' | 'add_qty'; qty?: number };
}

const vn = (n: number) => n.toLocaleString('vi-VN');

/** Bảng khuyến mại của phiếu (đã áp · cần xem · gợi ý). */
export function promoBoard(doc: PDoc, policies: Policy[], calc: DocCalc): PromoRow[] {
  const rows: PromoRow[] = [];
  const commercial = doc.kind === 'receipt' || doc.kind === 'order';
  if (!commercial) return rows;
  const all = policies;
  policies = policiesFor(doc, policies);
  const ex = exclusiveBySku(doc, policies);
  const pol = policies;
  const ctxBase = { date: doc.docDate, partnerCode: doc.partnerCode, branchCode: doc.branchCode };
  // 1. Chiết khấu dòng: đã áp (theo bảng mã / bậc SL) + ghi tay khác chính sách + gợi ý lên bậc.
  for (const l of calc.lines.filter((x) => x.lineType === 'buy' && x.sku)) {
    const src = doc.lines.find((x) => x.lineKey === l.lineKey);
    const policies = policiesForSku(ex, pol, l.sku);
    const ctx = { ...ctxBase, brandCode: l.brandCode ?? doc.brandCode, sku: l.sku };
    const hit = itemDiscountFor(policies, { ...ctx, unit: l.unit, qty: l.qty });
    const tier = findPolicy(policies, 'qty_tier', ctx);
    const tiers = ((tier?.rule.tiers as { from: number; pct: number }[] | undefined) ?? []).filter((t) => t.pct);
    const t = tier ? pickTier(tiers, l.qty) : undefined;
    const manual = src?.discountPct !== undefined || src?.discountAmt !== undefined;
    // CK trên đơn khai riêng mã này (đứng sau bảng CK theo mã và bậc SL, như bộ tính computeDoc).
    const own = !hit && !t ? policies.filter((p) => p.kind === 'trade_discount' && p.scope.sku === l.sku && policyApplies(p, ctx))
      .sort((a, b) => Object.values(b.scope).filter(Boolean).length - Object.values(a.scope).filter(Boolean).length || (b.priority ?? 0) - (a.priority ?? 0))[0] : undefined;
    const policyText = hit ? (hit.item.pct ? `CK ${Number(hit.item.pct).toLocaleString('vi-VN')}%` : `giảm ${vn(hit.item.amount ?? 0)}đ / ${hit.item.unit || l.unit}`) : t ? `CK ${Number(t.pct).toLocaleString('vi-VN')}% (bậc từ ${t.from})`
      : own ? (Number(own.rule.pct) ? `CK ${Number(Number(own.rule.pct)).toLocaleString('vi-VN')}% riêng mã` : `giảm ${vn(Number(own.rule.amount) || 0)}đ riêng mã`) : '';
    const policyOf = hit ? hit.policy : t ? tier! : own;
    if (manual && policyOf) {
      const same = hit ? (hit.item.pct ?? undefined) === src?.discountPct : t ? t.pct === src?.discountPct : (Number(own?.rule.pct) || undefined) === src?.discountPct;
      if (!same) rows.push({ key: `manual|${l.lineKey}`, status: 'fix', kind: 'manual', policy: policyOf.code, name: policyOf.name, sku: l.sku, lineKey: l.lineKey, text: `${l.sku}: đang ghi tay ${src?.discountPct !== undefined ? `CK ${Number(src.discountPct).toLocaleString('vi-VN')}%` : `giảm ${vn(src?.discountAmt ?? 0)}`}, chính sách là ${policyText}`, action: { label: 'Dùng theo chính sách', type: 'use_policy' } });
    } else if (!manual && policyOf) {
      rows.push({ key: `disc|${l.lineKey}`, status: 'applied', kind: hit ? 'item_discount' : t ? 'qty_tier' : 'trade_discount', policy: policyOf.code, name: policyOf.name, sku: l.sku, lineKey: l.lineKey, text: `${l.sku}: ${policyText}${l.lineDiscount ? ` = −${vn(l.lineDiscount)}` : ''}` });
    }
    // Gợi ý: bậc kế tiếp (bậc SL của chính sách hoặc dòng bảng mã có SL tối thiểu lớn hơn).
    if (!manual) {
      const nextTier = tiers.filter((x) => x.from > l.qty).sort((a, b) => a.from - b.from)[0];
      const items = hit || !tier ? (((itemDiscountFor(policies, { ...ctx, unit: l.unit, qty: Number.MAX_SAFE_INTEGER })?.policy.rule.items as ItemDiscount[] | undefined) ?? [])
        .filter((i) => i.sku === l.sku && (!i.unit || i.unit.toLowerCase() === l.unit.toLowerCase()) && (i.minQty ?? 0) > l.qty)) : [];
      const nextItem = items.sort((a, b) => (a.minQty ?? 0) - (b.minQty ?? 0))[0];
      const next = nextItem ? { from: nextItem.minQty!, text: nextItem.pct ? `CK ${Number(nextItem.pct).toLocaleString('vi-VN')}%` : `giảm ${vn(nextItem.amount ?? 0)}đ`, p: itemDiscountFor(policies, { ...ctx, unit: l.unit, qty: nextItem.minQty! })?.policy }
        : nextTier ? { from: nextTier.from, text: `CK ${Number(nextTier.pct).toLocaleString('vi-VN')}%`, p: tier } : undefined;
      if (next?.p) rows.push({ key: `next|${l.lineKey}`, status: 'hint', kind: next.p.kind, policy: next.p.code, name: next.p.name, sku: l.sku, lineKey: l.lineKey, text: `${l.sku}: mua thêm ${vn(next.from - l.qty)} ${l.unit} (đủ ${vn(next.from)}) để được ${next.text}`, action: { label: `Lên ${vn(next.from)}`, type: 'add_qty', qty: next.from } });
    }
  }
  // 2. CK đơn, hạn trả, CKTT: theo vết bộ máy tính.
  for (const t of calc.trace.filter((x) => x.kind === 'trade_discount' || x.kind === 'payment_discount')) {
    rows.push({ key: `trace|${t.kind}|${t.policy}`, status: 'applied', kind: t.kind, policy: t.policy, name: t.policy, text: `${t.text}${t.amount ? ` = ${t.kind === 'payment_discount' ? '' : '−'}${vn(t.amount)}` : ''}` });
  }
  // CK số tiền cộng dồn đã áp: gợi ý mua thêm để được thêm một lần.
  for (const t of calc.trace.filter((x) => x.kind === 'trade_discount' && x.policy !== 'Trên phiếu')) {
    const p = policies.find((x) => x.code === t.policy);
    if (!p || !isRepeat(p)) continue;
    const min = Number(p.rule.minOrder) || 0;
    const net = calc.lines.filter((l) => l.lineType === 'buy' && l.orderDiscount).reduce((s, l) => s + l.after + l.orderDiscount, 0);
    const times = tradeTimes(p, net);
    if (min && times) rows.push({ key: `hint|trade-next|${p.code}`, status: 'hint', kind: 'trade_discount', policy: p.code, name: p.name, text: `${p.name}: đang được ${times} lần × ${vn(Number(p.rule.amount) || 0)}đ — mua thêm ${vn(min * (times + 1) - net)} (đủ ${vn(min * (times + 1))}) để được thêm một lần (cộng dồn)` });
  }
  // CK trên đơn theo chính sách chưa đủ điều kiện (tổng đơn dưới mức "Áp khi tổng đơn từ") → gợi ý, không tự áp.
  if (doc.orderDiscount === undefined && !calc.trace.some((x) => x.kind === 'trade_discount')) {
    const p = findPolicy(policies, 'trade_discount', ctxBase);
    const net = calc.lines.filter((l) => l.lineType === 'buy').reduce((s, l) => s + l.after + l.orderDiscount, 0);
    if (p && !tradeDiscountReady(p, net)) {
      const what = Number(p.rule.pct) ? `CK ${Number(Number(p.rule.pct)).toLocaleString('vi-VN')}% trên đơn` : `CK ${vn(Number(p.rule.amount) || 0)}đ trên đơn`;
      rows.push({ key: `hint|trade|${p.code}`, status: 'hint', kind: 'trade_discount', policy: p.code, name: p.name, text: `${p.name}: tổng đơn từ ${vn(tradeDiscountMin(p))} mới được ${what} — đơn đang ${vn(net)}, mua thêm ${vn(tradeDiscountMin(p) - net)}` });
    }
  }
  // 3. Quà theo chương trình — ghi rõ ĐVT mua / ĐVT tặng ("mua 2 Thùng → tặng 2 Lon").
  for (const g of giftPlan(doc, policies)) {
    const who = g.lineType === 'gift_seller' ? 'chia vào giá' : 'quà người tiêu dùng';
    const what = (n: number) => `${vn(n)} ${g.giftUnit}${g.giftSku === g.sku ? '' : ` ${g.giftSku}`}`;
    const rule = `mua ${vn(g.buy)} ${g.unit} tặng ${what(g.get)}${g.repeat ? ', cộng dồn' : ', một lần'}`;
    const base = { kind: 'promo_gift' as const, policy: g.policy.code, name: g.policy.name, sku: g.sku, lineKey: g.buyLineKey, expected: g.expected, got: g.got, giftSku: g.giftSku, giftUnit: g.giftUnit, lineType: g.lineType };
    // Nút "Lên …" sửa thẳng SL dòng mua — chỉ khi dòng phiếu cùng ĐVT với chính sách (khác ĐVT thì chỉ gợi ý bằng chữ).
    const sameUnit = doc.lines.find((l) => l.lineKey === g.buyLineKey)?.unit.toLowerCase() === g.unit.toLowerCase();
    const once = !g.repeat && g.buyQty >= g.buy * 2 ? ' — chỉ tặng một lần (không cộng dồn)' : '';
    if (g.expected === g.got && g.expected > 0) rows.push({ key: `gift|${g.key}`, status: 'applied', ...base, text: `${g.sku}: mua ${vn(g.buyQty)} ${g.unit} → tặng ${what(g.expected)} (${who}; ${rule})${once}` });
    else if (g.expected !== g.got) rows.push({ key: `gift|${g.key}`, status: 'fix', ...base, text: `${g.sku}: mua ${vn(g.buyQty)} ${g.unit} → được tặng ${what(g.expected)}, phiếu ghi ${vn(g.got)} ${g.giftUnit} — ${g.got < g.expected ? `thiếu ${vn(g.expected - g.got)}` : `thừa ${vn(g.got - g.expected)}`} (${rule})`, action: { label: `Sửa về ${vn(g.expected)}`, type: 'gift_fix', qty: g.expected } });
    if (g.repeat && g.expected > 0 && g.toNext > 0 && g.toNext < g.buy) rows.push({ key: `giftnext|${g.key}`, status: 'hint', ...base, text: `${g.sku}: mua thêm ${vn(g.toNext)} ${g.unit} để được tặng thêm ${what(g.get)} (${rule})`, ...(sameUnit ? { action: { label: `Lên ${vn(g.buyQty + g.toNext)} ${g.unit}`, type: 'add_qty' as const, qty: g.buyQty + g.toNext } } : {}) });
    else if (g.expected === 0) rows.push({ key: `giftnext|${g.key}`, status: 'hint', ...base, text: `${g.sku}: mua đủ ${vn(g.buy)} ${g.unit} để được tặng ${what(g.get)} (đang ${vn(g.buyQty)} ${g.unit})`, ...(sameUnit ? { action: { label: `Lên ${vn(g.buy)} ${g.unit}`, type: 'add_qty' as const, qty: g.buy } } : {}) });
  }
  // Áp riêng: mã đang nhận chương trình áp riêng → các chương trình khác của mã hiện "không áp" kèm lý do (muốn dùng thì bỏ tích
  // chương trình áp riêng trước). Chương trình chặn ở mọi mã nó khớp và không áp ở đâu khác thì vẫn là một dòng.
  for (const [sku, h] of ex) {
    for (const p of h.blocked) rows.push({ key: `blocked|${p.code}|${sku}`, status: 'blocked', kind: p.kind, policy: p.code, name: p.name, sku,
      text: `${sku}: ${p.name} — không áp vì mã đang áp riêng "${h.winner.name}" (${h.winner.code}). Muốn dùng thì bỏ tích ${h.winner.code}` });
    const mine = rows.filter((r) => r.status === 'applied' && r.policy === h.winner.code && (!r.sku || r.sku === sku));
    for (const r of mine) if (!r.text.includes('(áp riêng)')) r.text += ' (áp riêng)';
    // CK trên đơn khai riêng một mã chưa có dòng nào trên bảng (vết ghi như CK theo mã): thêm dòng "đã áp".
    if (!mine.length) { const l = calc.lines.find((x) => x.sku === sku && x.lineType === 'buy'); rows.push({ key: `excl|${h.winner.code}|${sku}`, status: 'applied', kind: h.winner.kind, policy: h.winner.code, name: h.winner.name, sku, lineKey: l?.lineKey, text: `${sku}: ${h.winner.name}${l?.lineDiscount ? ` = −${vn(l.lineDiscount)}` : ''} (áp riêng)` }); }
  }
  // Chính sách đã bỏ tích trên phiếu này: vẫn hiện để tích lại.
  for (const code of doc.skipPolicies ?? []) {
    const p = all.find((x) => x.code === code);
    if (p) rows.push({ key: `off|${code}`, status: 'off', kind: p.kind, policy: p.code, name: p.name, text: `${p.name} — đã bỏ trên phiếu này (tích lại để áp)` });
  }
  const order: Record<PromoStatus, number> = { fix: 0, applied: 1, hint: 2, blocked: 3, off: 4 };
  return rows.sort((a, b) => order[a.status] - order[b.status]);
}

let seq = 0;
const giftKey = () => `G${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * Tự đồng bộ dòng quà theo chương trình: thêm dòng còn thiếu, chỉnh SL dòng tự thêm (autoGift), bỏ dòng tự thêm không còn
 * được tặng. Dòng quà người dùng tự nhập / đã sửa SL thì giữ nguyên (bảng khuyến mại báo thiếu / thừa để bấm sửa).
 * Trả về lines mới + câu mô tả thay đổi (rỗng = không đổi).
 */
export function syncGifts(doc: PDoc, policies: Policy[], info: (sku: string) => { name?: string; unit?: string; taxCode?: string } | undefined = () => undefined): { lines: PLine[]; changes: string[] } {
  const plan = giftPlan(doc, policies);
  const changes: string[] = [];
  let lines = [...doc.lines];
  const want = new Map<string, { qty: number; g: (typeof plan)[number] }>();
  for (const g of plan) {
    const k = `${g.lineType}|${g.giftSku}|${g.policy.code}|${g.giftUnit.toLowerCase()}`;
    const cur = want.get(k);
    want.set(k, { qty: (cur?.qty ?? 0) + g.expected, g: cur?.g ?? g });
  }
  // Dòng tự thêm: chỉnh SL hoặc bỏ.
  lines = lines.flatMap((l) => {
    if (!l.autoGift) return [l];
    const w = want.get(`${l.lineType}|${l.sku}|${l.program ?? ''}|${l.unit.toLowerCase()}`);
    if (!w || !w.qty) { changes.push(`bỏ quà ${l.sku} (${l.program}) — ${doc.skipPolicies?.includes(l.program ?? '') ? 'đã bỏ tích chương trình' : 'hàng mua không còn đủ điều kiện'}`); return []; }
    const manualSame = doc.lines.filter((x) => !x.autoGift && x.lineType === l.lineType && x.sku === l.sku && x.unit.toLowerCase() === l.unit.toLowerCase()).reduce((s, x) => s + x.qty, 0);
    const qty = Math.max(0, w.qty - manualSame);
    if (!qty) { changes.push(`bỏ quà ${l.sku} — đã có dòng nhập tay`); return []; }
    if (qty !== l.qty) changes.push(`quà ${l.sku}: ${vn(l.qty)} → ${vn(qty)} (${l.program})`);
    return [{ ...l, qty }];
  });
  // Thêm dòng còn thiếu (chưa có dòng nào cùng loại + mã quà).
  for (const [k, w] of want) {
    if (!w.qty) continue;
    const [type, giftSku] = k.split('|') as [LineType, string];
    if (lines.some((x) => x.lineType === type && x.sku === giftSku && x.unit.toLowerCase() === w.g.giftUnit.toLowerCase())) continue;
    const src = doc.lines.find((x) => x.lineKey === w.g.buyLineKey)!;
    const same = giftSku === src.sku;
    const meta = same ? undefined : info(giftSku);
    lines.push({ lineKey: giftKey(), sku: giftSku, name: same ? src.name : meta?.name ?? '', unit: w.g.giftUnit || (same ? src.unit : meta?.unit ?? ''), qty: w.qty, price: 0, taxCode: same ? src.taxCode : meta?.taxCode ?? src.taxCode, lineType: type, program: w.g.policy.code, autoGift: true, brandCode: same ? src.brandCode : undefined, ...(same ? { lotNo: src.lotNo, expDate: src.expDate } : {}) });
    changes.push(`tự thêm quà ${vn(w.qty)} ${w.g.giftUnit} ${giftSku} theo ${w.g.policy.code}`);
  }
  return { lines, changes };
}


