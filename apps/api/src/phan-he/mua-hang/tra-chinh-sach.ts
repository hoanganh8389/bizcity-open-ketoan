// @bizcity-layer D modules/mua-hang
// [2026-11-20 khanhtd] TRA-CUU — tra chính sách mua hàng theo một mã: chạy đúng bộ máy của phiếu nhập trên phiếu giả một dòng (đóng góp)
/**
 * TRA CHÍNH SÁCH THEO MÃ HÀNG — dùng cho màn TC01 của phân hệ Tra cứu (modules/tra-cuu, gọi qua HTTP).
 * Dựng một PHIẾU NHẬP GIẢ một dòng (mã, NCC, chi nhánh, ngày, SL, ĐVT, đơn giá) rồi chạy ĐÚNG các hàm phiếu nhập thật dùng:
 * syncGifts → computeDoc → promoBoard (+ exclusiveBySku). Không viết lại luật: kết quả ở đây khớp phiếu thật lập cùng số liệu.
 * Mỗi chính sách khớp mã có một trạng thái:
 *   ap         đang áp (kèm số tiền / số quà), có thể là chương trình áp riêng đang thắng;
 *   bi-chan    khớp mã nhưng bị chương trình áp riêng khác chặn;
 *   chua-du    khớp mã, chưa đủ điều kiện (SL, tổng đơn) — kèm gợi ý mua thêm;
 *   khong-dung khớp mã nhưng không dùng (CK dòng chỉ lấy một nguồn, CK trên đơn chỉ lấy một chính sách…).
 * Chỉ đọc: không lưu phiếu, không chạm sổ.
 */
import {
  computeDoc, exclusiveBySku, giftItemsOf, giftPlan, isExclusive, policiesFor, policyApplies, priceFor, promoBoard, syncGifts, POLICY_LABEL, STACK_KINDS,
  type ItemDiscount, type PDoc, type Policy, type PolicyKind, type ProductUnit, type PromoRow, type SupplierProduct,
} from '@bizcity/mua-hang-domain';
import type { Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { listSupplierProducts, unitsOf } from './gia-mua.js';
import { listPolicies } from './store.js';

export type TraStatus = 'ap' | 'bi-chan' | 'chua-du' | 'khong-dung';
export interface TraRow {
  code: string; name: string; kind: PolicyKind; kindLabel: string; partnerCode: string;
  priority: number; exclusive: boolean; validFrom: string | null; validTo: string | null;
  status: TraStatus;
  /** Câu nói vì sao (đang áp gì, bị ai chặn, thiếu gì). */
  reason: string;
  /** Số tiền giảm đang áp cho dòng này (0 khi không áp). */
  amount: number;
  /** Nếu chỉ có mình chính sách này: giảm bao nhiêu / tặng bao nhiêu — để so khi chọn áp riêng. */
  alone: { amount: number; gift: string };
  /** Chương trình áp riêng đang thắng ở mã này. */
  winner: boolean;
}
export interface TraInput {
  sku: string; name: string; brandCode?: string; unit: string; qty: number; price: number; priceIncludesVat: boolean;
  date: string; branchCode: string; partnerCode: string; policies: Policy[]; units: ProductUnit[];
}
export interface TraResult {
  rows: TraRow[];
  /** Chính sách khác áp cho mã / NCC nhưng không tính lúc lập phiếu theo dòng (CKTT, hạn trả, hạn mức, thưởng…). */
  other: { code: string; name: string; kind: PolicyKind; kindLabel: string }[];
  /** Kết quả phiếu giả: tiền hàng, CK dòng, CK đơn, sau CK, giá vốn thực tế / ĐVT, quà. */
  total: { gross: number; lineDiscount: number; orderDiscount: number; after: number; realUnitCost: number; gifts: string[] };
  /** Giải thích chọn chương trình áp riêng khi có ≥ 2 cùng khớp. */
  exclusiveNote: string;
}

const vn = (n: number) => Math.round(n).toLocaleString('vi-VN');
const LINE_KINDS: PolicyKind[] = ['item_discount', 'qty_tier'];
/** CK trên đơn khai riêng một mã tính như CK dòng (computeDoc bước 1). */
const isLineSource = (p: Policy) => LINE_KINDS.includes(p.kind) || (p.kind === 'trade_discount' && Boolean(p.scope.sku));

/** Chính sách có nhắc tới mã này không (bỏ qua điều kiện SL / tổng đơn — đó là việc của bộ máy). */
function matchesSku(p: Policy, ctx: { date: string; partnerCode: string; brandCode?: string; branchCode: string; sku: string }): boolean {
  if (p.kind === 'item_discount') return policyApplies(p, { ...ctx, sku: undefined }) && ((p.rule.items as { sku: string }[] | undefined) ?? []).some((i) => i.sku === ctx.sku);
  if (p.kind === 'promo_gift') return policyApplies(p, ctx) && giftItemsOf(p).some((i) => !i.sku || i.sku === ctx.sku);
  return policyApplies(p, ctx);
}

/** Phần thuần (không CSDL) — test ở apps/api/test/tra-chinh-sach.test.ts. */
export function traChinhSach(i: TraInput): TraResult {
  const base: PDoc = {
    id: 'tra-cuu', kind: 'receipt', status: 'draft', docNo: '', docDate: i.date, branchCode: i.branchCode, partnerCode: i.partnerCode, brandCode: i.brandCode,
    priceIncludesVat: i.priceIncludesVat,
    lines: [{ lineKey: 'L1', sku: i.sku, name: i.name, unit: i.unit, qty: i.qty, price: i.price, taxCode: '', lineType: 'buy', brandCode: i.brandCode }],
  };
  const units = { [i.sku]: i.units };
  // Quà tự thêm như phiếu thật — để bảng khuyến mại ra "đã áp" thay vì "thiếu quà".
  const doc: PDoc = { ...base, lines: syncGifts(base, i.policies).lines };
  const calc = computeDoc(doc, i.policies, { units });
  const board = promoBoard(doc, i.policies, calc);
  const atDate = policiesFor(doc, i.policies);
  const hit = exclusiveBySku(doc, atDate).get(i.sku);
  const ctx = { date: i.date, partnerCode: i.partnerCode, brandCode: i.brandCode, branchCode: i.branchCode, sku: i.sku };
  const line = calc.lines.find((l) => l.lineKey === 'L1')!;
  const lineSrc = calc.trace.find((t) => t.kind === 'item_discount' || t.kind === 'qty_tier')?.policy;
  const orderSrc = calc.trace.find((t) => t.kind === 'trade_discount' && t.policy !== 'Trên phiếu')?.policy;

  const alone = (p: Policy) => {
    const one = { ...base, lines: syncGifts(base, [p]).lines };
    const c = computeDoc(one, [p], { units });
    const g = giftPlan(one, [p]).filter((x) => x.expected > 0).map((x) => `${vn(x.expected)} ${x.giftUnit}${x.giftSku === i.sku ? '' : ` ${x.giftSku}`}`);
    return { amount: c.lineDiscount + c.orderDiscount, gift: g.join(', ') };
  };
  const mine = (p: Policy) => board.filter((r: PromoRow) => r.policy === p.code && (!r.sku || r.sku === i.sku));

  const rows: TraRow[] = [];
  const other: TraResult['other'] = [];
  for (const p of atDate) {
    if (!matchesSku(p, ctx)) continue;
    if (!STACK_KINDS.includes(p.kind)) { other.push({ code: p.code, name: p.name, kind: p.kind, kindLabel: POLICY_LABEL[p.kind] }); continue; }
    const rs = mine(p);
    // [2026-11-20 khanhtd] TRA-CUU — bảng CK theo mã: áp riêng / ưu tiên lấy theo DÒNG của mã này (trống = theo chính sách) (đóng góp)
    const rowsOfSku = p.kind === 'item_discount' ? ((p.rule.items as ItemDiscount[] | undefined) ?? []).filter((x) => x.sku === i.sku) : [];
    const exclusive = isExclusive(p) || (p.kind === 'promo_gift' && giftItemsOf(p).some((g) => g.apply === 'exclusive' && (!g.sku || g.sku === i.sku)))
      || rowsOfSku.some((x) => x.apply === 'exclusive');
    const rowPri = rowsOfSku.filter((x) => x.priority != null && (isExclusive(p) || x.apply === 'exclusive')).map((x) => x.priority!);
    const applied = rs.find((r) => r.status === 'applied');
    const blocked = rs.find((r) => r.status === 'blocked');
    const hint = rs.find((r) => r.status === 'hint' || r.status === 'fix');
    let status: TraStatus, reason: string, amount = 0;
    if (applied) {
      status = 'ap'; reason = applied.text;
      amount = p.code === lineSrc && isLineSource(p) ? line.lineDiscount : p.code === orderSrc ? line.orderDiscount : 0;
    } else if (blocked) {
      status = 'bi-chan'; reason = blocked.text;
    } else if (hint) {
      status = 'chua-du'; reason = hint.text;
    } else if (isLineSource(p) && lineSrc && lineSrc !== p.code) {
      status = 'khong-dung'; reason = `Chiết khấu dòng chỉ lấy MỘT nguồn (bảng CK theo mã → bậc số lượng → CK trên đơn riêng mã); dòng này đang lấy từ ${lineSrc}`;
    } else if (p.kind === 'trade_discount' && !p.scope.sku && orderSrc && orderSrc !== p.code) {
      status = 'khong-dung'; reason = `CK trên đơn chỉ lấy MỘT chính sách: đang dùng ${orderSrc} (phạm vi hẹp hơn hoặc ưu tiên cao hơn)`;
    } else {
      status = 'chua-du'; reason = 'Khớp mã nhưng chưa đủ điều kiện với số liệu đang nhập (số lượng, ĐVT, tổng đơn)';
    }
    rows.push({
      code: p.code, name: p.name, kind: p.kind, kindLabel: POLICY_LABEL[p.kind], partnerCode: p.scope.partnerCode ?? '',
      priority: rowPri.length ? Math.max(...rowPri) : p.priority ?? 0, exclusive, validFrom: p.validFrom ?? null, validTo: p.validTo ?? null,
      status, reason, amount, alone: alone(p), winner: hit?.winner.code === p.code,
    });
  }
  // Nhiều chương trình áp riêng cùng khớp: nói vì sao cái thắng thắng (ưu tiên → lợi hơn → mã chính sách).
  const ex = rows.filter((r) => r.exclusive && (r.status === 'ap' || r.status === 'bi-chan'));
  const w = rows.find((r) => r.winner);
  let exclusiveNote = '';
  if (w && ex.length > 1) {
    const losers = ex.filter((r) => r !== w);
    const why = losers.map((r) => (w.priority !== r.priority ? `${r.code}: ưu tiên ${w.priority} > ${r.priority}`
      : w.alone.amount !== r.alone.amount ? `${r.code}: cùng ưu tiên ${w.priority}, ${w.code} lợi hơn (−${vn(w.alone.amount)} so với −${vn(r.alone.amount)})`
      : `${r.code}: cùng ưu tiên, cùng mức lợi — lấy theo mã chính sách`));
    exclusiveNote = `${ex.length} chương trình áp riêng cùng khớp mã ${i.sku}; ${w.code} thắng — ${why.join('; ')}`;
  }
  const order: Record<TraStatus, number> = { ap: 0, 'chua-du': 1, 'bi-chan': 2, 'khong-dung': 3 };
  rows.sort((a, b) => order[a.status] - order[b.status] || Number(b.winner) - Number(a.winner) || b.priority - a.priority || a.code.localeCompare(b.code));
  const gifts = calc.lines.filter((l) => l.lineType !== 'buy').map((l) => `${vn(l.qty)} ${l.unit} ${l.sku} (${l.program ?? ''})`);
  return {
    rows, other, exclusiveNote,
    total: { gross: line.gross, lineDiscount: line.lineDiscount, orderDiscount: line.orderDiscount, after: line.after, realUnitCost: line.realUnitCost, gifts },
  };
}

export interface TraQuery { sku: string; partnerCode?: string; qty?: number; unit?: string; price?: number; branchCode?: string; date: string }

/** Đọc CSDL (mặt hàng, ĐVT, giá mua, chính sách, NCC) rồi gọi phần thuần. */
export async function traChinhSachTheoMa(trx: Db, tenantId: string, q: TraQuery) {
  const product = await trx.selectFrom('products').select(['sku', 'name', 'unit', 'brand_code']).where('tenant_id', '=', tenantId).where('sku', '=', q.sku).executeTakeFirst();
  if (!product) throw Errors.notFound(`mặt hàng ${q.sku}`);
  const [policies, prices, unitMap] = await Promise.all([listPolicies(trx, tenantId), listSupplierProducts(trx, tenantId, { sku: q.sku }), unitsOf(trx, tenantId, [q.sku])]);
  const units = unitMap[q.sku] ?? [];
  const brandCode = product.brand_code ?? undefined;
  // NCC chọn được: NCC có chính sách nhắc tới mã này hoặc có giá mua của mã.
  const ctxNoPartner = { date: q.date, brandCode, branchCode: q.branchCode ?? '', sku: q.sku };
  const codes = new Set<string>();
  for (const p of policiesFor({ docDate: q.date }, policies)) if (p.scope.partnerCode && matchesSku(p, { ...ctxNoPartner, partnerCode: p.scope.partnerCode })) codes.add(p.scope.partnerCode);
  for (const r of prices) if (r.partnerCode) codes.add(r.partnerCode);
  if (q.partnerCode) codes.add(q.partnerCode);
  const names = codes.size ? await trx.selectFrom('partners').select(['code', 'name']).where('tenant_id', '=', tenantId).where('code', 'in', [...codes]).execute() : [];
  const partners = [...codes].sort().map((code) => ({ code, name: names.find((n) => n.code === code)?.name ?? '' }));
  const partnerCode = q.partnerCode ?? partners[0]?.code ?? '';
  const unit = q.unit || units.find((u) => u.isPurchaseDefault)?.unit || product.unit || units[0]?.unit || '';
  const found = priceFor(prices as SupplierProduct[], { date: q.date, partnerCode, sku: q.sku, unit }, units);
  const price = q.price ?? found?.price ?? 0;
  const priceSource: 'nhap' | 'gia-mua' | 'khong-co' = q.price !== undefined ? 'nhap' : found ? 'gia-mua' : 'khong-co';
  const priceIncludesVat = q.price === undefined && found ? found.row.priceIncludesVat : false;
  const qty = q.qty ?? 1;
  const result = traChinhSach({ sku: q.sku, name: product.name, brandCode, unit, qty, price, priceIncludesVat, date: q.date, branchCode: q.branchCode ?? '', partnerCode, policies, units });
  return {
    item: { sku: product.sku, name: product.name, brandCode: brandCode ?? '', units: units.map((u) => ({ unit: u.unit, ratio: u.ratio })) },
    partners,
    input: { partnerCode, qty, unit, price, priceSource, priceIncludesVat, date: q.date, branchCode: q.branchCode ?? '' },
    ...result,
  };
}
