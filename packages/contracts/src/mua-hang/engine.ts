// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:17 PM Nguyễn Văn Thủy] R-REV — so giá lần nhập trước 4 chữ số lẻ và quy về ĐVT dòng; % hiển thị kiểu Việt Nam; CK theo mã quy đổi ĐVT bảng ↔ ĐVT phiếu; CK dòng không vượt tiền hàng (commit 6cd9908, f03e8e6, 3e45f20, đóng góp).
// [2026-10-31 04:53 PM Johnny Chu - Chu Hoàng Anh] R-REV — duyệt có sửa: ĐVT bảng CK chưa khai → không áp thay đổi của Nguyễn Văn Thủy (commit 6cd9908, f03e8e6, 3e45f20), biên bản docs/audits/REVIEW-2026-10-31-THUY.md §7.
/**
 * BỘ MÁY MUA HÀNG — hàm thuần (không gọi mạng, không cơ sở dữ liệu), dùng chung cho máy chủ (apps/api/src/phan-he/mua-hang)
 * và giao diện (tính tức thời khi sửa phiếu): hai phía ra đúng một con số. Thiết kế: docs/nghiep-vu/08-mua-hang.md.
 * Nhập: '@ketoan/contracts/mua-hang'.
 *
 *   computeDoc      tính phiếu: CK dòng (bậc SL / %), CK đơn (% / tiền, phân bổ theo giá trị), tách thuế (giá gồm hay chưa VAT),
 *                   quà chia giá vào giá vốn, giá vốn thực tế từng mã, tổng phải trả, CKTT dự kiến, hạn thanh toán
 *   checkDoc        cảnh báo: lệch giá, vượt hạn mức, thiếu / thừa quà, trùng hoá đơn, lệch tổng hoá đơn, thiếu lô / cận date
 *   creditStatus    nợ hiện tại + đơn đang mở + phiếu này so với hạn mức NCC / nhãn / chi nhánh
 *   ckttFor         chiết khấu thanh toán khi trả: đúng hạn mới được hưởng
 *   rebateFor       thưởng cuối kỳ: theo bậc doanh số, theo chỉ tiêu (% hoàn thành), theo giai đoạn
 *   allocate        phân bổ một khoản (chi phí, thưởng) theo giá trị hoặc số lượng, tổng khớp tới đồng
 *   postingFor      bút toán xem trước (Nợ / Có) theo bảng hạch toán
 *   addDays         cộng ngày làm việc (trừ cuối tuần, ngày nghỉ / lễ) hoặc ngày lịch
 */
import { priceFor, ratioOf, type ProductUnit, type SupplierProduct } from './gia-mua.js';

/* ------------------------------------------------------------------ kiểu dữ liệu */

export type LineType = 'buy' | 'gift_seller' | 'gift_consumer';
export type PurchaseKind = 'order' | 'receipt' | 'return' | 'exchange' | 'gift_in' | 'gift_out' | 'cost' | 'rebate' | 'prepayment' | 'payment';
export const PURCHASE_KINDS: PurchaseKind[] = ['order', 'receipt', 'return', 'exchange', 'gift_in', 'gift_out', 'cost', 'rebate', 'prepayment', 'payment'];
export type DocStatus = 'draft' | 'pending_approval' | 'approved' | 'cancelled';

export interface PLine {
  lineKey: string;
  sku: string;
  name: string;
  unit: string;
  qty: number;
  /** Đơn giá (gồm VAT nếu doc.priceIncludesVat). Dòng quà: 0. */
  price: number;
  discountPct?: number;
  discountAmt?: number;
  taxCode: string;
  lineType: LineType;
  lotNo?: string;
  expDate?: string;
  mfgDate?: string;
  /** Chương trình KM của dòng quà (đối chiếu quà theo chương trình). */
  program?: string;
  /** Dòng quà phần mềm tự thêm theo chương trình: SL tự chạy theo hàng mua; người dùng sửa SL thì thôi tự chạy (false). */
  autoGift?: boolean;
  /** Nhãn hàng của mặt hàng — luôn lấy từ danh mục mặt hàng (máy chủ ghi lại khi lưu), không nhập tay. */
  brandCode?: string;
  /** Phiếu đổi hàng: dòng trả đi (out) / nhận về (in). */
  dir?: 'out' | 'in';
  /** Ghi chú dòng (đơn đặt gửi NCC: tự điền từ ghi chú mặt hàng của NCC). */
  note?: string;
  /** Quy cách: số ĐVT nhỏ nhất trong một thùng (in đơn, làm tròn SL). */
  pack?: number;
  /** Mã / tên hàng bên NCC. */
  nccSku?: string;
  nccName?: string;
  /** Mã vạch (in đơn gửi NCC). */
  barcode?: string;
  /** Dòng hàng mới chưa có mã trong danh mục (đơn đặt): có mã thì gắn sku sau. */
  newItem?: boolean;
  /** Phiếu nhập lập từ đơn: khoá dòng của đơn (gắn mã hàng mới thì ghi ngược vào đơn). */
  refLineKey?: string;
  /** Số liệu tồn lúc lập đơn đặt (phân tích đặt hàng) — để in đơn, không vào sổ. */
  /** Họ mã của dòng (lập từ phân tích đặt hàng): mã cha + mã con đuôi Z / Q / K / M / T / B… và số liệu từng mã lúc lập đơn. */
  family?: { sku: string; kind: string; tonKho: number; tonShop: number; banShop: number; dangDat: number; maxKho?: number; maxShop?: number; diDuong?: number; banThangTruoc?: number }[];
  stockInfo?: { need?: number; tonKho?: number; dangDat?: number; banThangTruoc?: number; banShop?: number; maxKho?: number; diDuong?: number; maxShop?: number; tonShop?: number };
}
/**
 * Điều khoản thanh toán (theo các hợp đồng thực tế):
 *  - basis: tính từ ngày nhận đủ hàng + hồ sơ hợp lệ (receipt_date) / ngày hoá đơn / ngày đơn; fixed = công nợ cố định
 *    (không tính hạn từng phiếu); immediate = nhận hàng trả ngay; prepay = trả trước khi giao (đơn đặt phải ứng trước).
 *  - dayType: working = ngày làm việc T2–T6 trừ lễ; working6 = T2–T7 (chỉ trừ CN và lễ); calendar = ngày lịch. Hạn rơi vào
 *    ngày nghỉ / lễ thì sang ngày làm việc kế tiếp. workingDays giữ cho dữ liệu cũ (true = working).
 *  - payDays: chỉ trả vào các ngày cố định trong tháng (vd 5, 15, 25) — lấy ngày trả gần nhất không trễ hơn hạn.
 *  - monthDay: trả trước ngày N hàng tháng — nhận trước / đúng ngày N thì hạn ngày N tháng đó, sau ngày N thì ngày N tháng sau.
 */
export type TermBasis = 'receipt_date' | 'invoice_date' | 'order_date' | 'fixed' | 'immediate' | 'prepay';
export type DayType = 'working' | 'working6' | 'calendar';
export interface PaymentTerm { basis: TermBasis; days: number; workingDays: boolean; dayType?: DayType; payDays?: number[]; monthDay?: number }
export interface PDoc {
  id: string;
  kind: PurchaseKind;
  status: DocStatus;
  docNo: string;
  docDate: string;
  branchCode: string;
  partnerCode: string;
  /** Nhãn hàng chính của phiếu — TỰ SUY từ nhãn các dòng (nhãn chiếm giá trị lớn nhất), không nhập tay. Phiếu không có dòng
   *  hàng (thưởng theo nhãn) mang nhãn của chính sách. */
  brandCode?: string;
  priceIncludesVat: boolean;
  invoice?: { no: string; serial?: string; date: string; total?: number };
  orderDiscount?: { pct?: number; amount?: number };
  /** CK trên đơn chỉ chia vào các dòng này (lineKey) — chốt lúc duyệt khi có mã đang áp riêng chương trình khác. Trống = mọi dòng mua. */
  orderDiscountLines?: string[];
  term?: PaymentTerm;
  cktt?: { pct: number };
  lines: PLine[];
  /** Lịch trả nhiều đợt (trống = một đợt theo hạn). */
  schedule?: { seq: number; dueDate: string; amount: number }[];
  /** Phiếu chi / ứng trước: số tiền; chi phí / thưởng: số tiền trước thuế cần phân bổ. */
  amount?: number;
  /** Trả tiền / ứng trước: chuyển khoản hay tiền mặt. */
  method?: 'bank' | 'cash';
  /** Trả tiền / ứng trước / chênh lệch đổi hàng: tài khoản tiền cụ thể (vd ngân hàng khác 11210002); trống = tài khoản mặc định theo cài đặt. */
  moneyAccount?: string;
  /** Trả tiền: chiết khấu thanh toán được hưởng (Nợ 3312 / Có 515), đã kiểm đúng hạn. */
  ckttAmount?: number;
  /** Chi phí / thưởng: loại thuế đầu vào của hoá đơn (dịch vụ, hoá đơn điều chỉnh giảm); trống = không thuế. */
  taxCode?: string;
  /** Chi phí mua hàng: loại chi phí. */
  costType?: 'van_chuyen' | 'boc_xep' | 'luu_kho' | 'bao_hiem' | 'kiem_dinh' | 'khac';
  /** Chi phí / thưởng: tiêu thức phân bổ vào các mã hàng. */
  basis?: 'value' | 'qty';
  /** Thưởng: chính sách + kỳ đã tính (chặn tính trùng). */
  rebate?: { policyCode: string; period: string; base: number; rate: number; detail: string[] };
  /** Chi phí / thưởng: phần phân bổ theo mã hàng (máy chủ tính lúc lưu). */
  allocation?: { sku: string; name?: string; amount: number }[];
  refIds?: string[];
  /** Đổi hàng khác giá trị: chênh lệch xử lý bằng bù trừ công nợ / thanh toán bổ sung / hoàn tiền. */
  settle?: 'offset' | 'pay' | 'refund';
  /** Quà: nguồn (chương trình NCC / NCC tặng ngoài hợp đồng / TGS tự mua), có hoá đơn VAT hay không. */
  gift?: { source: 'ncc_program' | 'ncc_extra' | 'self_buy'; program?: string; hasVat: boolean };
  /** Lý do trả / đổi (lỗi, cận date, sai quy cách…). */
  reason?: string;
  override?: { by: string; at: string; reason: string };
  /** Phiếu nhập mua NGOÀI ĐƠN (không theo đơn đặt nào — ngoại lệ được phép): lý do bắt buộc khi duyệt; by / at = người duyệt;
   *  reviewed* = kế toán đã rà soát riêng (lọc "Nhập ngoài đơn", việc cần làm ở trang Quy trình). */
  outsideOrder?: { reason: string; by?: string; at?: string; reviewedBy?: string; reviewedAt?: string; reviewNote?: string };
  /** Mã chính sách BỎ trên phiếu này (bỏ tích ở bảng khuyến mại: NCC hết quà, không cho CK lần này…) — mọi phép tính bỏ qua. */
  skipPolicies?: string[];
  /** Ngày nhận đủ hàng và hồ sơ giao hàng hợp lệ — mốc tính hạn thanh toán theo hợp đồng (trống = ngày phiếu). */
  receivedDate?: string;
  /** Hoá đơn sai phải điều chỉnh: hạn thanh toán lùi đúng số ngày từ lúc báo sai (from) đến lúc nhận hoá đơn đúng (to). */
  invoiceFix?: { from: string; to: string };
  note?: string;
  createdAt?: string;
  /** Đơn đặt: ngân sách mua được cấp (chỉ để ước lượng còn / vượt). */
  budget?: number;
  /** Đơn đặt: ngày giao, giao tại kho. */
  deliveryDate?: string;
  deliveryWarehouse?: string;
  /** Phân kho của phiếu hàng (nhập, trả, đổi, quà): mọi dòng đi theo kho này; trống → kho mặc định của chi nhánh (máy chủ điền khi lưu). */
  warehouseCode?: string;
}

export interface Product { sku: string; name: string; unit: string; brandCode: string; groupCode?: string; taxCode: string; trackLot?: boolean; isGiftItem?: boolean; giftValue?: number }
export interface Partner { code: string; name: string; taxCode?: string; group?: string; address?: string; openingDebt?: number }

export type PolicyKind = 'trade_discount' | 'item_discount' | 'qty_tier' | 'payment_discount' | 'promo_gift' | 'period_rebate' | 'target_rebate' | 'stage_rebate'
  | 'credit_limit' | 'payment_term' | 'supply_target' | 'lot_tracking' | 'gift_budget' | 'contract';
export interface Scope { partnerCode?: string; brandCode?: string; sku?: string; branchCode?: string }
export interface Policy {
  /** Người tạo / sửa và thời điểm (máy chủ điền khi đọc). */
  createdBy?: string; createdAt?: string; updatedBy?: string; updatedAt?: string;
  id: string;
  code: string;
  kind: PolicyKind;
  name: string;
  scope: Scope;
  validFrom?: string;
  validTo?: string;
  priority?: number;
  isActive: boolean;
  /** Khuôn theo kind — xem RULE_HINT. */
  rule: Record<string, unknown>;
}

export const POLICY_LABEL: Record<PolicyKind, string> = {
  trade_discount: 'Chiết khấu thương mại trên đơn',
  item_discount: 'Chiết khấu theo mã hàng (bảng nhiều mã)',
  qty_tier: 'Chiết khấu theo bậc số lượng',
  payment_discount: 'Chiết khấu thanh toán (CKTT)',
  promo_gift: 'Khuyến mại mua X tặng Y',
  period_rebate: 'Thưởng doanh số theo kỳ',
  target_rebate: 'Thưởng theo chỉ tiêu nhãn',
  stage_rebate: 'Thưởng theo giai đoạn trong tháng',
  credit_limit: 'Hạn mức công nợ',
  payment_term: 'Điều khoản thanh toán',
  supply_target: 'Chỉ tiêu cung ứng theo chi nhánh',
  lot_tracking: 'Theo dõi lô / hạn dùng',
  gift_budget: 'Ngân sách quà tặng theo chương trình',
  contract: 'Hợp đồng mua bán',
};
/** Khuôn rule từng loại (giao diện hiện gợi ý, máy chủ kiểm bằng zod). */
export const RULE_HINT: Record<PolicyKind, string> = {
  trade_discount: '{ "pct": 7 }  hoặc  { "amount": 2000000 }',
  item_discount: '{ "items": [ { "sku": "130181002", "pct": 3 }, { "sku": "140181001", "amount": 500, "unit": "Hộp", "minQty": 48 } ] }',
  qty_tier: '{ "tiers": [ { "from": 0, "pct": 0 }, { "from": 50, "pct": 3 }, { "from": 100, "pct": 5 }, { "from": 200, "pct": 7 } ] }',
  payment_discount: '{ "pct": 2 }',
  promo_gift: '{ "splitIntoCost": true, "items": [{ "sku": "140181006", "buyQty": 1, "buyUnit": "Thùng", "giftSku": "", "getQty": 2, "getUnit": "Hộp", "repeat": true, "apply": "exclusive" }] }',
  period_rebate: '{ "period": "month", "tiers": [ { "from": 200000000, "pct": 2 }, { "from": 300000000, "pct": 3 } ] }',
  target_rebate: '{ "period": "month", "target": 500000000, "tiers": [ { "fromPct": 100, "pct": 2 }, { "fromPct": 110, "pct": 3 } ] }',
  stage_rebate: '{ "mode": "stage", "stages": [ { "from": 1, "to": 10, "min": 100000000, "pct": 1 }, … ] }',
  credit_limit: '{ "limit": 600000000, "warnPct": 90, "branches": { "CN-ND": 500000000 } }',
  payment_term: '{ "basis": "invoice_date", "days": 10, "workingDays": true }',
  supply_target: '{ "period": "2026-10", "branches": { "CN-ND": 600000000, "CN-PT": 700000000 } }',
  lot_tracking: '{ "required": true }',
  gift_budget: '{ "program": "TGS-TRI-AN", "amount": 10000000 }',
  contract: '{ "no": "01/2026/HĐMB", "signedOn": "2026-01-05", "note": "" }',
};

/** Chính sách còn áp cho phiếu: bỏ các chính sách người dùng đã bỏ tích trên phiếu (doc.skipPolicies). */
export const policiesFor = (doc: Pick<PDoc, 'skipPolicies'>, policies: Policy[]) => (doc.skipPolicies?.length ? policies.filter((p) => !doc.skipPolicies!.includes(p.code)) : policies);

/** Mức tổng đơn tối thiểu để chính sách CK trên đơn được tự áp (CK số tiền không khai mức: phải lớn hơn số CK). */
export const tradeDiscountMin = (p: Policy) => num(p.rule.minOrder) || (num(p.rule.pct) ? 0 : num(p.rule.amount) + 1);
export const tradeDiscountReady = (p: Policy, net: number) => net >= tradeDiscountMin(p);
/**
 * CỘNG DỒN (rule.repeat) — đủ điều kiện nhiều lần thì được hưởng nhiều lần:
 *   - mua X tặng Y: mặc định CỘNG DỒN (mua 2 tặng 1 → mua 4 tặng 2); tắt = chỉ tặng một lần (mua 4 vẫn tặng 1);
 *   - CK số tiền cố định trên đơn có mức "Áp khi tổng đơn từ": mặc định MỘT LẦN; bật = mỗi đủ một mức giảm một lần
 *     (từ 50 triệu giảm 2 triệu → đơn 100 triệu giảm 4 triệu);
 *   - CK %, bậc số lượng, CK theo mã: vốn tính theo tiền / từng ĐVT nên không có lựa chọn này.
 */
export const canRepeat = (p: Pick<Policy, 'kind' | 'rule'>) => p.kind === 'promo_gift' || (p.kind === 'trade_discount' && !num(p.rule.pct) && num(p.rule.minOrder) > 0);
export const isRepeat = (p: Pick<Policy, 'kind' | 'rule'>) => (p.kind === 'promo_gift' ? p.rule.repeat !== false : canRepeat(p) && p.rule.repeat === true);
/** Số lần được hưởng CK số tiền trên đơn ở tổng đơn net (0 = chưa đủ điều kiện). */
export const tradeTimes = (p: Policy, net: number) => (!tradeDiscountReady(p, net) ? 0 : isRepeat(p) ? Math.floor(net / num(p.rule.minOrder)) : 1);
/** Số quà mua X tặng Y được với số lượng mua qty. */
export const giftQty = (p: Policy, qty: number) => { const b = num(p.rule.buy), g = num(p.rule.get); return !b || !g || qty < b ? 0 : isRepeat(p) ? Math.floor(qty / b) * g : g; };

/**
 * MUA X TẶNG Y nhiều dòng (rule.items): mỗi dòng "mua <SL> <ĐVT> mã A → tặng <SL> <ĐVT> mã B", mỗi dòng có cộng dồn / áp riêng riêng.
 * So sánh theo ĐVT NHỎ NHẤT: máy chủ ghi kèm tỉ lệ quy đổi của mã mua / mã tặng khi lưu (buyRatios / giftRatios, khoá = ĐVT viết
 * thường) — dòng phiếu ghi ĐVT nào cũng quy đổi đúng (mua 1 Thùng = 24 Lon: phiếu ghi 6 Lốc hay 24 Lon đều đủ).
 * Chính sách cũ một dòng (rule.buy / get / giftSku, mã ở phạm vi) đọc như một dòng: ĐVT trống = theo ĐVT của dòng phiếu.
 */
export interface GiftItem {
  /** Mã hàng mua ('' = mọi mã trong phạm vi chính sách — chỉ chính sách cũ). */
  sku: string;
  buyQty: number;
  /** ĐVT mua ('' = theo ĐVT của dòng phiếu). */
  buyUnit: string;
  /** Mã hàng tặng ('' = chính mã mua). */
  giftSku?: string;
  getQty: number;
  /** ĐVT tặng ('' = cùng ĐVT với dòng mua). */
  getUnit: string;
  /** Cộng dồn (mặc định có): đủ mấy lần tặng mấy lần. */
  repeat?: boolean;
  apply?: 'exclusive';
  note?: string;
  buyRatios?: Record<string, number>;
  giftRatios?: Record<string, number>;
}
export function giftItemsOf(p: Pick<Policy, 'rule' | 'scope'>): GiftItem[] {
  if (Array.isArray(p.rule.items)) return p.rule.items as GiftItem[];
  const buy = num(p.rule.buy), get = num(p.rule.get);
  return buy && get ? [{ sku: p.scope?.sku ?? '', buyQty: buy, buyUnit: '', giftSku: String(p.rule.giftSku ?? ''), getQty: get, getUnit: '', repeat: p.rule.repeat !== false, ...(p.rule.apply === 'exclusive' ? { apply: 'exclusive' as const } : {}) }] : [];
}
/** Mua X tặng Y nhiều dòng: bao nhiêu dòng cộng dồn / áp riêng (để hiện ô tích ở danh sách: tất cả / không / theo dòng). */
export function giftFlags(p: Pick<Policy, 'rule' | 'scope'>): { rows: number; repeat: number; exclusive: number } {
  const it = giftItemsOf(p);
  return { rows: it.length, repeat: it.filter((i) => i.repeat !== false).length, exclusive: it.filter((i) => i.apply === 'exclusive' || p.rule.apply === 'exclusive').length };
}
const lc = (u?: string) => (u ?? '').trim().toLowerCase();
/** Kết quả một dòng mua X tặng Y trên các dòng mua của một mã. */
export interface GiftMatch {
  index: number; item: GiftItem; sku: string; giftSku: string;
  /** SL mua (theo ĐVT mua của dòng chính sách) và ĐVT đó. */
  buyQty: number; unit: string; buy: number;
  get: number; giftUnit: string; repeat: boolean; exclusive: boolean;
  expected: number; toNext: number;
  /** Giá trị quà ước tính (để chọn chương trình áp riêng lợi hơn). */
  value: number;
}
export function giftMatches(p: Policy, sku: string, ls: PLine[]): GiftMatch[] {
  const out: GiftMatch[] = [];
  giftItemsOf(p).forEach((item, index) => {
    if ((item.sku && item.sku !== sku) || !item.buyQty || !item.getQty || !ls.length) return;
    const first = ls[0]!;
    const unit = item.buyUnit || first.unit;
    const r = item.buyRatios ?? {};
    const ratio = (u: string) => (lc(u) === lc(unit) ? r[lc(unit)] ?? 1 : r[lc(u)]);
    const unitRatio = r[lc(unit)] ?? 1;
    // SL mua quy về ĐVT mua của chính sách: dòng ĐVT khác quy qua ĐVT nhỏ nhất; ĐVT chưa biết tỉ lệ thì không tính.
    const base = ls.reduce((t, l) => { const k = ratio(l.unit); return t + (k ? l.qty * k : 0); }, 0);
    const buyQty = Math.round((base / unitRatio) * 1000) / 1000;
    const repeat = item.repeat !== false;
    const times = buyQty < item.buyQty ? 0 : repeat ? Math.floor(buyQty / item.buyQty + 1e-9) : 1;
    const giftSku = item.giftSku || sku;
    const giftUnit = item.getUnit || (giftSku === sku ? unit : first.unit);
    const toNext = repeat ? Math.round((item.buyQty - (buyQty % item.buyQty)) * 1000) / 1000 : buyQty < item.buyQty ? Math.round((item.buyQty - buyQty) * 1000) / 1000 : 0;
    const gross = ls.reduce((t, l) => t + l.qty * l.price, 0);
    const giftBase = (item.giftRatios ?? (giftSku === sku ? r : {}))[lc(giftUnit)] ?? 1;
    const value = base ? (gross / base) * times * item.getQty * giftBase : 0;
    out.push({ index, item, sku, giftSku, buyQty, unit, buy: item.buyQty, get: item.getQty, giftUnit, repeat, exclusive: p.rule.apply === 'exclusive' || item.apply === 'exclusive', expected: times * item.getQty, toNext, value });
  });
  return out;
}

/** Thuế suất GTGT theo mã: đầu vào V… (V13K = không chịu thuế — hàng KCT mua vào; KKKN = không kê khai, quà không hoá đơn), đầu ra R… / KCT. */
export const TAX_RATE: Record<string, number> = { V00: 0, V05: 5, V08: 8, V10: 10, V13K: 0, KKKN: 0, KCT: 0, R00K: 0, R00: 0, R05: 5, R08: 8, R10: 10 };
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

/* ------------------------------------------------------------------ ngày */

/** Cộng ngày: workingDays = bỏ thứ 7, CN (workWeek mặc định T2–T6) và ngày nghỉ / lễ. */
export function addDays(date: string, n: number, opts: { workingDays?: boolean; holidays?: string[]; workWeek?: number[] } = {}): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (!opts.workingDays) { d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  const week = opts.workWeek ?? [1, 2, 3, 4, 5];
  const off = new Set(opts.holidays ?? []);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const iso = d.toISOString().slice(0, 10);
    if (week.includes(d.getUTCDay()) && !off.has(iso)) left--;
  }
  return d.toISOString().slice(0, 10);
}
const WEEK: Record<DayType, number[]> = { working: [1, 2, 3, 4, 5], working6: [1, 2, 3, 4, 5, 6], calendar: [0, 1, 2, 3, 4, 5, 6] };
const isWorkday = (iso: string, holidays: Set<string>, week = WEEK.working) => week.includes(new Date(`${iso}T00:00:00Z`).getUTCDay()) && !holidays.has(iso);
/** Rơi vào ngày nghỉ / lễ thì sang ngày làm việc kế tiếp. */
export function nextWorkday(iso: string, holidays: string[] = [], week = WEEK.working): string {
  const off = new Set(holidays);
  let d = iso;
  for (let i = 0; i < 60 && !isWorkday(d, off, week); i++) d = addDays(d, 1);
  return d;
}
export const termDayType = (t: Pick<PaymentTerm, 'dayType' | 'workingDays'>): DayType => t.dayType ?? (t.workingDays ? 'working' : 'calendar');
/** Mốc tính hạn của phiếu theo điều khoản. */
export function termBaseDate(term: PaymentTerm, doc: Pick<PDoc, 'docDate' | 'invoice' | 'receivedDate'>): string {
  if (term.basis === 'invoice_date') return doc.invoice?.date || doc.docDate;
  if (term.basis === 'receipt_date' || term.basis === 'immediate') return doc.receivedDate || doc.docDate;
  return doc.docDate;
}
/** Hạn thanh toán của một phiếu theo điều khoản (undefined = công nợ cố định, không tính hạn từng phiếu). */
export function dueDateFor(term: PaymentTerm, doc: Pick<PDoc, 'docDate' | 'invoice' | 'receivedDate' | 'invoiceFix'>, holidays: string[] = []): string | undefined {
  if (term.basis === 'fixed') return undefined;
  const base = termBaseDate(term, doc);
  const type = termDayType(term);
  let due: string;
  if (term.basis === 'immediate' || term.basis === 'prepay') due = base;
  else if (term.monthDay) {
    const [y, m, d] = base.split('-').map(Number) as [number, number, number];
    const [yy, mm] = d <= term.monthDay ? [y, m] : m === 12 ? [y + 1, 1] : [y, m + 1];
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    due = `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(term.monthDay, last)).padStart(2, '0')}`;
  } else due = type === 'calendar' ? addDays(base, term.days) : addDays(base, term.days, { workingDays: true, holidays, workWeek: WEEK[type] });
  if (doc.invoiceFix?.from && doc.invoiceFix.to && doc.invoiceFix.to > doc.invoiceFix.from) due = addDays(due, daysBetween(doc.invoiceFix.from, doc.invoiceFix.to));
  if (term.payDays?.length) {
    // Ngày trả cố định của tháng trước / tháng của hạn / tháng sau: lấy ngày muộn nhất không trễ hơn hạn và không sớm hơn mốc.
    const days = [...term.payDays].sort((a, b) => a - b);
    const cands: string[] = [];
    const [y, m] = due.split('-').map(Number) as [number, number];
    for (const off of [-1, 0, 1]) {
      const t = new Date(Date.UTC(y, m - 1 + off, 1));
      const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
      for (const pd of days) cands.push(`${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(pd, last)).padStart(2, '0')}`);
    }
    due = cands.filter((c) => c <= due && c >= base).pop() ?? cands.find((c) => c >= due) ?? due;
  }
  return nextWorkday(due, holidays, type === 'working6' ? WEEK.working6 : WEEK.working);
}
const TERM_BASIS_TEXT: Record<TermBasis, string> = { receipt_date: 'ngày nhận đủ hàng và hồ sơ', invoice_date: 'ngày hoá đơn', order_date: 'ngày đơn / phiếu', fixed: '', immediate: '', prepay: '' };
/** Điều khoản bằng chữ cho người đọc. */
export function termText(t: PaymentTerm): string {
  if (t.basis === 'fixed') return 'Công nợ cố định (duy trì số dư theo thoả thuận, không tính hạn từng phiếu)';
  if (t.basis === 'immediate') return 'Nhận hàng thanh toán ngay';
  if (t.basis === 'prepay') return 'Thanh toán trước khi giao hàng (đơn đặt phải ứng trước)';
  const type = termDayType(t);
  const head = t.monthDay ? `Trước ngày ${t.monthDay} hàng tháng (tính từ ${TERM_BASIS_TEXT[t.basis]})`
    : `${t.days} ngày ${type === 'calendar' ? 'lịch' : type === 'working6' ? 'làm việc (trừ CN, lễ)' : 'làm việc (trừ T7, CN, lễ)'} từ ${TERM_BASIS_TEXT[t.basis]}`;
  return head + (t.payDays?.length ? `; trả vào ngày ${t.payDays.join(', ')} hàng tháng` : '') + '; rơi vào ngày nghỉ thì sang ngày làm việc kế tiếp';
}
export const termFromRule = (r: Record<string, unknown>): PaymentTerm => ({
  basis: (r.basis as TermBasis) ?? 'invoice_date', days: num(r.days), workingDays: Boolean(r.workingDays), dayType: r.dayType as DayType | undefined,
  payDays: Array.isArray(r.payDays) && r.payDays.length ? (r.payDays as number[]).map(Number) : undefined, monthDay: r.monthDay ? num(r.monthDay) : undefined,
});
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/* ------------------------------------------------------------------ chính sách */

export function policyApplies(p: Policy, ctx: { date: string; partnerCode?: string; brandCode?: string; sku?: string; branchCode?: string }) {
  if (!p.isActive) return false;
  if (p.validFrom && ctx.date < p.validFrom) return false;
  if (p.validTo && ctx.date > p.validTo) return false;
  const s = p.scope;
  return (!s.partnerCode || s.partnerCode === ctx.partnerCode) && (!s.brandCode || s.brandCode === ctx.brandCode)
    && (!s.sku || s.sku === ctx.sku) && (!s.branchCode || s.branchCode === ctx.branchCode);
}
/** Chính sách khớp nhất (phạm vi hẹp hơn, ưu tiên cao hơn đứng trước). */
export function findPolicy(policies: Policy[], kind: PolicyKind, ctx: Parameters<typeof policyApplies>[1]): Policy | undefined {
  const spec = (p: Policy) => Object.values(p.scope).filter(Boolean).length;
  return policies.filter((p) => p.kind === kind && policyApplies(p, ctx)).sort((a, b) => spec(b) - spec(a) || (b.priority ?? 0) - (a.priority ?? 0))[0];
}
/**
 * Bảng chiết khấu theo mã hàng (item_discount): một chính sách chứa nhiều mã — mỗi dòng { sku, pct | amount, unit?, minQty? }.
 * Dòng phiếu khớp mã (và ĐVT nếu dòng bảng có ghi ĐVT, SL ≥ minQty) thì lấy CK của dòng đó; nhiều chính sách cùng áp thì chính
 * sách phạm vi hẹp hơn / ưu tiên cao hơn thắng; trong một chính sách, dòng có minQty lớn nhất mà SL đạt thắng.
 */
export interface ItemDiscount { sku: string; pct?: number; amount?: number; unit?: string; minQty?: number; note?: string }
/**
 * Dòng chiết khấu theo mã khớp dòng phiếu. Dòng bảng ghi ĐVT khác ĐVT của phiếu (vd giảm 105.000đ / Thùng, phiếu nhập theo Lon)
 * thì quy đổi theo tỉ lệ ĐVT của mặt hàng (units): factor = tỉ lệ ĐVT phiếu ÷ tỉ lệ ĐVT bảng — số tiền giảm / 1 ĐVT phiếu = amount × factor;
 * SL tối thiểu so sau khi quy về cùng ĐVT. Dòng đúng ĐVT được ưu tiên.
 */
export function itemDiscountFor(policies: Policy[], ctx: Parameters<typeof policyApplies>[1] & { sku: string; unit?: string; qty: number; units?: ProductUnit[] }): { policy: Policy; item: ItemDiscount; factor: number } | undefined {
  const spec = (p: Policy) => Object.values(p.scope).filter(Boolean).length;
  const cands = policies.filter((p) => p.kind === 'item_discount' && policyApplies(p, { ...ctx, sku: undefined })).sort((a, b) => spec(b) - spec(a) || (b.priority ?? 0) - (a.priority ?? 0));
  const same = (a?: string, b?: string) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
  const us = ctx.units ?? [];
  // [2026-10-31 04:53 PM Johnny Chu - Chu Hoàng Anh] R-REV — sửa lỗi chặn (REVIEW-2026-10-31-THUY §7): ĐVT bảng CK chưa khai ở mặt hàng → 0 (không quy đổi), không lấy tỉ lệ 1 của ratioOf.
  // Tra đúng ĐVT, không dùng ratioOf (ĐVT lạ ở đó trả 1): ĐVT bảng chưa khai ở mặt hàng → 0 → dòng CK không áp, không quy đổi sai tỉ lệ.
  const r = (u?: string) => Number(us.find((x) => same(x.unit, u))?.ratio ?? 0);
  /** Tỉ lệ ĐVT phiếu ÷ ĐVT bảng; 0 = không quy đổi được (ĐVT lạ). */
  const factorOf = (i: ItemDiscount) => (!i.unit || same(i.unit, ctx.unit) ? 1 : r(ctx.unit) && r(i.unit) ? r(ctx.unit) / r(i.unit) : 0);
  for (const p of cands) {
    const items = ((p.rule.items as ItemDiscount[] | undefined) ?? []).filter((i) => i.sku === ctx.sku && factorOf(i) > 0 && ctx.qty * factorOf(i) >= (i.minQty ?? 0));
    const exact = (i: ItemDiscount) => (!i.unit || same(i.unit, ctx.unit) ? 1 : 0);
    const item = items.sort((a, b) => exact(b) - exact(a) || (b.minQty ?? 0) * factorOf(a) - (a.minQty ?? 0) * factorOf(b))[0];
    if (item && (item.pct || item.amount)) return { policy: p, item, factor: factorOf(item) };
  }
  return undefined;
}

/** Bậc khớp: dòng có `from` lớn nhất ≤ giá trị (không áp nhầm bậc cao hơn). */
export function pickTier<T extends { from: number }>(tiers: T[], value: number): T | undefined {
  return [...tiers].sort((a, b) => b.from - a.from).find((t) => value >= t.from);
}

/* ------------------------------------------------------------------ áp riêng / áp đồng thời */

/**
 * Cách áp của chương trình chiết khấu / khuyến mại (rule.apply, khai ở form chính sách):
 *   - 'together' (mặc định, trống): áp ĐỒNG THỜI — cộng với các chương trình khác;
 *   - 'exclusive': ÁP RIÊNG — mã hàng đã nhận chương trình này thì không nhận chương trình chiết khấu / khuyến mại nào khác.
 * Chỉ các loại tính lúc lập phiếu (CK theo mã, bậc SL, CK trên đơn, mua X tặng Y); CKTT và thưởng cuối kỳ không xét.
 */
export type ApplyMode = 'together' | 'exclusive';
export const STACK_KINDS: PolicyKind[] = ['item_discount', 'qty_tier', 'trade_discount', 'promo_gift'];
export const isExclusive = (p: Pick<Policy, 'rule'>) => p.rule.apply === 'exclusive';
export interface ExclusiveHit { winner: Policy; blocked: Policy[]; /** Chương trình thắng là mua X tặng Y: chỉ dòng này của nó được áp cho mã. */ winnerRow?: number }

/**
 * Theo từng mã hàng mua của phiếu: các chương trình khớp mã đó; có chương trình áp riêng thì chọn MỘT (ưu tiên cao hơn,
 * bằng nhau thì lợi hơn — số tiền giảm / giá trị quà lớn hơn), mọi chương trình khác bị chặn cho mã đó (mã khác không ảnh hưởng).
 * policies đã bỏ các chương trình bỏ tích trên phiếu (bỏ tích chương trình áp riêng → các chương trình khác áp lại).
 */
export function exclusiveBySku(doc: PDoc, policies: Policy[]): Map<string, ExclusiveHit> {
  const out = new Map<string, ExclusiveHit>();
  if ((doc.kind !== 'receipt' && doc.kind !== 'order') || !policies.some((p) => STACK_KINDS.includes(p.kind) && (isExclusive(p) || (p.kind === 'promo_gift' && giftItemsOf(p).some((i) => i.apply === 'exclusive'))))) return out;
  const buy = doc.lines.filter((l) => l.lineType === 'buy' && l.sku);
  const netAll = buy.reduce((t, l) => t + l.qty * l.price, 0);
  const bySku = new Map<string, PLine[]>();
  for (const l of buy) bySku.set(l.sku, [...(bySku.get(l.sku) ?? []), l]);
  for (const [sku, ls] of bySku) {
    const first = ls[0]!;
    const qty = ls.reduce((t, l) => t + l.qty, 0), gross = ls.reduce((t, l) => t + l.qty * l.price, 0), unitPrice = qty ? gross / qty : 0;
    const ctx = { date: doc.docDate, partnerCode: doc.partnerCode, brandCode: first.brandCode ?? doc.brandCode, branchCode: doc.branchCode, sku };
    const cands: { p: Policy; value: number; row?: number; exclusive?: boolean }[] = [];
    for (const p of policies) {
      if (!STACK_KINDS.includes(p.kind)) continue;
      if (p.kind === 'item_discount') {
        if (!policyApplies(p, { ...ctx, sku: undefined })) continue;
        const item = ((p.rule.items as ItemDiscount[] | undefined) ?? []).filter((i) => i.sku === sku && (!i.unit || i.unit.toLowerCase() === first.unit.toLowerCase()) && qty >= (i.minQty ?? 0)).sort((a, b) => (b.minQty ?? 0) - (a.minQty ?? 0))[0];
        if (item && (item.pct || item.amount)) cands.push({ p, value: item.pct ? (gross * item.pct) / 100 : (item.amount ?? 0) * qty });
      } else if (p.kind === 'qty_tier') {
        if (!policyApplies(p, ctx)) continue;
        const t = pickTier((p.rule.tiers as { from: number; pct: number }[]) ?? [], qty);
        if (t?.pct) cands.push({ p, value: (gross * t.pct) / 100 });
      } else if (p.kind === 'trade_discount') {
        if (p.scope.sku) { if (policyApplies(p, ctx)) cands.push({ p, value: num(p.rule.pct) ? (gross * num(p.rule.pct)) / 100 : num(p.rule.amount) }); }
        else if (doc.orderDiscount === undefined && policyApplies(p, { ...ctx, sku: undefined, brandCode: doc.brandCode }) && tradeDiscountReady(p, netAll)) {
          cands.push({ p, value: num(p.rule.pct) ? (gross * num(p.rule.pct)) / 100 : netAll ? (num(p.rule.amount) * tradeTimes(p, netAll) * gross) / netAll : 0 });
        }
      } else if (p.kind === 'promo_gift') {
        if (!policyApplies(p, { ...ctx, sku })) continue;
        for (const m of giftMatches(p, sku, ls)) if (m.expected) cands.push({ p, value: m.value, row: m.index, exclusive: m.exclusive });
      }
    }
    const ex = cands.filter((c) => c.exclusive ?? isExclusive(c.p)).sort((a, b) => (b.p.priority ?? 0) - (a.p.priority ?? 0) || b.value - a.value || a.p.code.localeCompare(b.p.code));
    if (ex.length) {
      const w = ex[0]!;
      // Dòng quà áp riêng thắng: các dòng khác của CÙNG chính sách cho mã này cũng không áp (winnerRow), chính sách khác bị chặn.
      out.set(sku, { winner: w.p, ...(w.row !== undefined ? { winnerRow: w.row } : {}), blocked: [...new Set(cands.filter((c) => c.p !== w.p).map((c) => c.p))] });
    }
  }
  return out;
}
/** Chính sách dùng được cho một mã hàng sau khi xét áp riêng. */
export const policiesForSku = (ex: Map<string, ExclusiveHit>, policies: Policy[], sku: string) => {
  const hit = ex.get(sku);
  return hit ? policies.filter((p) => !hit.blocked.includes(p)) : policies;
};

/* ------------------------------------------------------------------ tính phiếu */

export interface LineCalc extends PLine {
  gross: number;         // SL × đơn giá
  lineDiscount: number;  // CK dòng
  orderDiscount: number; // phần CK đơn phân bổ vào dòng
  after: number;         // sau CK (cùng loại giá với đơn giá)
  beforeTax: number;
  tax: number;
  /** Giá vốn thực tế / ĐVT (trước thuế, sau CK, đã chia quà người bán). */
  realUnitCost: number;
}
export interface TraceItem { policy: string; kind: PolicyKind | 'manual'; text: string; amount?: number }
export interface DocCalc {
  lines: LineCalc[];
  gross: number; lineDiscount: number; orderDiscount: number; beforeTax: number; tax: number; payable: number;
  buyQty: number; giftSellerQty: number; giftConsumerQty: number;
  dueDate?: string; ckttExpected?: number;
  /** Phiếu đổi hàng: giá trị trả đi / nhận về (gồm thuế), chênh lệch = nhận − trả (dương: TGS trả thêm NCC). */
  exchange?: { outBeforeTax: number; outTax: number; inBeforeTax: number; inTax: number; diff: number };
  trace: TraceItem[];
}

/** Phân bổ `total` theo trọng số, làm tròn đồng, phần dư dồn vào dòng lớn nhất → tổng khớp tuyệt đối. */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (!sum || !total) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let rest = Math.round(total - out.reduce((s, v) => s + v, 0));
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; rest > 0 && k < order.length; k++, rest--) out[order[k]!.i]! += 1;
  return out;
}

/**
 * opts.units: ĐVT của các mã (tỉ lệ quy đổi) — giá vốn thực tế / ĐVT tính trên ĐVT NHỎ NHẤT rồi đổi lại theo ĐVT của dòng, nên
 * dòng mua theo Thùng + quà theo Lon cùng mã vẫn đúng. Không truyền thì coi mọi ĐVT tỉ lệ 1 (đúng khi các dòng cùng ĐVT).
 */
export function computeDoc(doc: PDoc, policies: Policy[], opts: { holidays?: string[]; units?: Record<string, ProductUnit[]> } = {}): DocCalc {
  policies = policiesFor(doc, policies);
  const trace: TraceItem[] = [];
  const ctxBase = { date: doc.docDate, partnerCode: doc.partnerCode, brandCode: doc.brandCode, branchCode: doc.branchCode };
  // Chương trình áp riêng: mã hàng nhận nó thì các chương trình khác bị chặn cho mã đó.
  const ex = exclusiveBySku(doc, policies);
  const all = policies;
  // 1. CK dòng: % nhập tay → bảng chiết khấu theo mã hàng (item_discount) → bậc số lượng theo mã.
  const lines = doc.lines.map((l) => {
    const policies = policiesForSku(ex, all, l.sku);
    const gross = l.lineType === 'buy' ? Math.round(l.qty * l.price) : 0;
    let pct = l.discountPct;
    let amt = l.discountAmt;
    if (pct === undefined && amt === undefined && l.lineType === 'buy') {
      const hit = itemDiscountFor(policies, { ...ctxBase, brandCode: l.brandCode ?? doc.brandCode, sku: l.sku, unit: l.unit, qty: l.qty, units: opts.units?.[l.sku] });
      if (hit) {
        if (hit.item.pct) pct = hit.item.pct; else amt = Math.round((hit.item.amount ?? 0) * hit.factor * l.qty);
        trace.push({ policy: hit.policy.code, kind: 'item_discount', text: `${l.sku}: ${hit.item.pct ? `CK ${Number(hit.item.pct).toLocaleString('vi-VN')}%` : `giảm ${(hit.item.amount ?? 0).toLocaleString('vi-VN')}đ / ${hit.item.unit || l.unit}`}${hit.item.minQty ? ` (mua từ ${hit.item.minQty})` : ''} — ${hit.policy.name}` });
      }
    }
    if (pct === undefined && amt === undefined && l.lineType === 'buy') {
      const tier = findPolicy(policies, 'qty_tier', { ...ctxBase, brandCode: l.brandCode ?? doc.brandCode, sku: l.sku });
      const t = tier ? pickTier((tier.rule.tiers as { from: number; pct: number }[]) ?? [], l.qty) : undefined;
      if (tier && t && t.pct) { pct = t.pct; trace.push({ policy: tier.code, kind: 'qty_tier', text: `${l.sku}: SL ${l.qty} → bậc từ ${t.from}, CK ${Number(t.pct).toLocaleString('vi-VN')}%` }); }
    }
    // CK trên đơn khai cho RIÊNG một mã (phạm vi có mã hàng): áp vào dòng mã đó như CK dòng (sau CK tay, bảng CK theo mã, bậc SL
    // — không cộng trùng). CK trên đơn không ghi mã vẫn áp cả đơn ở bước 2. Ghi vết là item_discount để không lẫn với CK đơn.
    if (pct === undefined && amt === undefined && l.lineType === 'buy' && (doc.kind === 'receipt' || doc.kind === 'order')) {
      const own = policies.filter((p) => p.kind === 'trade_discount' && p.scope.sku === l.sku && policyApplies(p, { ...ctxBase, brandCode: l.brandCode ?? doc.brandCode, sku: l.sku }))
        .sort((a, b) => Object.values(b.scope).filter(Boolean).length - Object.values(a.scope).filter(Boolean).length || (b.priority ?? 0) - (a.priority ?? 0))[0];
      if (own) {
        if (num(own.rule.pct)) pct = num(own.rule.pct); else if (num(own.rule.amount)) amt = num(own.rule.amount);
        if (pct !== undefined || amt !== undefined) trace.push({ policy: own.code, kind: 'item_discount', text: `${l.sku}: ${pct ? `CK ${Number(pct).toLocaleString('vi-VN')}%` : `giảm ${num(own.rule.amount).toLocaleString('vi-VN')}đ`} trên đơn (riêng mã) — ${own.name}` });
      }
    }
    // CK dòng không vượt tiền hàng của dòng (CK % tối đa 100%, CK tiền tối đa bằng tiền hàng).
    const lineDiscount = Math.min(gross, Math.round((gross * Math.min(100, pct ?? 0)) / 100) + Math.round(amt ?? 0));
    return { ...l, discountPct: pct, gross, lineDiscount, orderDiscount: 0, after: gross - lineDiscount, beforeTax: 0, tax: 0, realUnitCost: 0 };
  });
  // 2. CK đơn: % hoặc tiền, phân bổ vào các dòng mua theo giá trị sau CK dòng.
  let buyIdx = lines.map((l, i) => (l.lineType === 'buy' ? i : -1)).filter((i) => i >= 0);
  let net = buyIdx.reduce((s, i) => s + lines[i]!.after, 0);
  // Phiếu không ghi CK đơn (undefined) → lấy chính sách CKTM của NCC; ghi {} = thoả thuận không chiết khấu.
  let od = doc.orderDiscount;
  // Chính sách CKTM, hạn thanh toán, CKTT chỉ áp cho chứng từ phát sinh công nợ mua (đơn đặt, nhập mua).
  const commercial = doc.kind === 'receipt' || doc.kind === 'order';
  let fromPolicy: Policy | undefined;
  if (od === undefined && commercial) {
    // Chính sách CK trên đơn chỉ tự áp khi đơn đủ điều kiện: tổng đơn ≥ "Áp khi tổng đơn từ" (rule.minOrder); CK số tiền cố định
    // không khai mức tối thiểu thì tiền hàng phải lớn hơn số CK (không bao giờ tự áp làm số phải trả âm). Chưa đủ → gợi ý ở bảng KM.
    const p = findPolicy(policies, 'trade_discount', ctxBase);
    if (p && tradeDiscountReady(p, net)) {
      // Mã hàng đang nhận chương trình áp riêng khác: CK trên đơn không chia vào dòng mã đó (tính trên phần còn lại của đơn).
      const ok = buyIdx.filter((i) => !ex.get(lines[i]!.sku)?.blocked.includes(p));
      if (ok.length) {
        buyIdx = ok; net = ok.reduce((s, i) => s + lines[i]!.after, 0);
        // CK số tiền cộng dồn: mỗi đủ một mức "Áp khi tổng đơn từ" giảm một lần.
        const times = num(p.rule.pct) ? 1 : tradeTimes(p, net);
        if (times) { od = { pct: num(p.rule.pct) || undefined, amount: num(p.rule.amount) ? num(p.rule.amount) * times : undefined }; fromPolicy = p; }
      }
    }
  }
  if (!fromPolicy && od && doc.orderDiscountLines) { buyIdx = buyIdx.filter((i) => doc.orderDiscountLines!.includes(lines[i]!.lineKey)); net = buyIdx.reduce((s, i) => s + lines[i]!.after, 0); }
  const orderDisc = od?.pct ? Math.round((net * od.pct) / 100) : Math.round(od?.amount ?? 0);
  if (orderDisc) {
    const parts = allocate(orderDisc, buyIdx.map((i) => lines[i]!.after));
    buyIdx.forEach((i, k) => { lines[i]!.orderDiscount = parts[k]!; lines[i]!.after -= parts[k]!; });
    // Một vết cho một khoản CK: theo chính sách (mã + tên) hoặc ghi trên phiếu.
    const times = fromPolicy && !od?.pct ? tradeTimes(fromPolicy, net) : 1;
    const what = od?.pct ? `CK ${Number(od.pct).toLocaleString('vi-VN')}% trên đơn × ${net.toLocaleString('vi-VN')}` : times > 1 ? `CK bằng tiền trên tổng đơn × ${times} lần (cộng dồn: mỗi đủ ${num(fromPolicy!.rule.minOrder).toLocaleString('vi-VN')}đ)` : 'CK bằng tiền trên tổng đơn';
    trace.push(fromPolicy ? { policy: fromPolicy.code, kind: 'trade_discount', text: `${fromPolicy.name}: ${what}`, amount: orderDisc } : { policy: 'Trên phiếu', kind: 'trade_discount', text: `${what} (ghi trên phiếu)`, amount: orderDisc });
  }
  // 3. Thuế: giá gồm VAT → tách ngược; giá chưa VAT → tính thuế trên tiền sau CK.
  for (const l of lines) {
    const rate = TAX_RATE[l.taxCode] ?? 0;
    if (doc.priceIncludesVat) { l.beforeTax = Math.round(l.after / (1 + rate / 100)); l.tax = l.after - l.beforeTax; }
    else { l.beforeTax = l.after; l.tax = Math.round((l.after * rate) / 100); }
  }
  // 4. Giá vốn thực tế: quà người bán chia vào giá (SL tăng, giá trị không đổi); quà người tiêu dùng không chia.
  const rt = (sku: string, unit: string) => (opts.units?.[sku]?.length ? ratioOf(opts.units[sku]!, unit) || 1 : 1);
  const bySku = new Map<string, { value: number; qty: number }>();
  for (const l of lines) {
    if (l.lineType === 'gift_consumer') continue;
    const cur = bySku.get(l.sku) ?? { value: 0, qty: 0 };
    cur.value += l.beforeTax; cur.qty += l.qty * rt(l.sku, l.unit);
    bySku.set(l.sku, cur);
  }
  for (const l of lines) {
    const s = bySku.get(l.sku);
    l.realUnitCost = l.lineType === 'gift_consumer' || !s?.qty ? 0 : Math.round((s.value / s.qty) * rt(l.sku, l.unit) * 100) / 100;
  }
  const sum = (f: (l: LineCalc) => number) => lines.reduce((s, l) => s + f(l), 0);
  const sideSum = (d: 'out' | 'in', f: (l: LineCalc) => number) => lines.reduce((s, l) => s + ((l.dir ?? 'in') === d ? f(l) : 0), 0);
  const exchange = doc.kind === 'exchange'
    ? { outBeforeTax: sideSum('out', (l) => l.beforeTax), outTax: sideSum('out', (l) => l.tax), inBeforeTax: sideSum('in', (l) => l.beforeTax), inTax: sideSum('in', (l) => l.tax), diff: 0 }
    : undefined;
  if (exchange) exchange.diff = exchange.inBeforeTax + exchange.inTax - exchange.outBeforeTax - exchange.outTax;
  const payable = exchange ? exchange.diff : sum((l) => l.beforeTax + l.tax);
  // 5. Hạn thanh toán: điều khoản trên phiếu, không có thì chính sách NCC.
  let term = doc.term;
  if (!term && commercial) {
    const p = findPolicy(policies, 'payment_term', ctxBase);
    if (p) { term = termFromRule(p.rule); trace.push({ policy: p.code, kind: 'payment_term', text: termText(term) }); }
  }
  const dueDate = term ? dueDateFor(term, doc, opts.holidays) : undefined;
  // 6. CKTT dự kiến (chỉ hưởng nếu trả đúng hạn).
  const ckttPct = doc.cktt?.pct ?? (commercial ? num(findPolicy(policies, 'payment_discount', ctxBase)?.rule.pct) : 0);
  const ckttExpected = ckttPct ? Math.round((payable * ckttPct) / 100) : undefined;
  if (ckttPct) trace.push({ policy: doc.cktt ? 'Trên phiếu' : findPolicy(policies, 'payment_discount', ctxBase)?.code ?? '', kind: 'payment_discount', text: `CKTT ${Number(ckttPct).toLocaleString('vi-VN')}% nếu trả đúng hạn${dueDate ? ` (đến ${dueDate.split('-').reverse().join('/')})` : ''}`, amount: ckttExpected });
  return {
    lines, gross: sum((l) => l.gross), lineDiscount: sum((l) => l.lineDiscount), orderDiscount: orderDisc, beforeTax: sum((l) => l.beforeTax), tax: sum((l) => l.tax), payable,
    buyQty: sum((l) => (l.lineType === 'buy' ? l.qty : 0)), giftSellerQty: sum((l) => (l.lineType === 'gift_seller' ? l.qty : 0)), giftConsumerQty: sum((l) => (l.lineType === 'gift_consumer' ? l.qty : 0)),
    dueDate, ckttExpected, exchange, trace,
  };
}

/** CKTT khi trả tiền: trả đủ & không quá hạn mới được hưởng. */
export function ckttFor(payable: number, pct: number, dueDate: string | undefined, payDate: string, paid: number) {
  if (!pct || !dueDate) return { eligible: false, amount: 0, reason: 'Không có CKTT' };
  if (payDate > dueDate) return { eligible: false, amount: 0, reason: `Trả ngày ${payDate} quá hạn ${dueDate}: không được hưởng CKTT` };
  const amount = Math.round((payable * pct) / 100);
  if (paid + amount < payable) return { eligible: false, amount: 0, reason: 'Chưa trả đủ số phải trả sau CKTT' };
  return { eligible: true, amount, reason: `Trả đúng hạn (≤ ${dueDate}): được CKTT ${Number(pct).toLocaleString('vi-VN')}%` };
}

/* ------------------------------------------------------------------ hạn mức công nợ */

export interface CreditStatus { scope: string; limit: number; current: number; openOrders: number; thisDoc: number; after: number; remaining: number; exceeded: number; warn: boolean; policy?: string }
/** current = nợ đang có; openOrders = đơn đặt / phiếu chưa duyệt khác; thisDoc = phiếu đang lập. */
export function creditStatus(limitPolicy: Policy | undefined, current: number, openOrders: number, thisDoc: number, branchCode?: string): CreditStatus | undefined {
  if (!limitPolicy) return undefined;
  const branches = (limitPolicy.rule.branches as Record<string, number> | undefined) ?? {};
  const limit = branchCode && branches[branchCode] !== undefined ? branches[branchCode]! : num(limitPolicy.rule.limit);
  const after = current + openOrders + thisDoc;
  const warnPct = num(limitPolicy.rule.warnPct) || 90;
  return {
    scope: branchCode && branches[branchCode] !== undefined ? `Chi nhánh ${branchCode}` : limitPolicy.scope.brandCode ? `Nhãn ${limitPolicy.scope.brandCode}` : `NCC ${limitPolicy.scope.partnerCode ?? ''}`,
    limit, current, openOrders, thisDoc, after, remaining: limit - after, exceeded: Math.max(0, after - limit), warn: after >= (limit * warnPct) / 100, policy: limitPolicy.code,
  };
}

/* ------------------------------------------------------------------ cảnh báo */

export type Level = 'info' | 'warn' | 'error';
export interface Check { level: Level; code: string; text: string; lineKey?: string; blocking?: boolean }
export interface PriceRow { date: string; partnerCode: string; docNo: string; unitPrice: number; includesVat: boolean; unit?: string; qty?: number }

export interface CheckCtx {
  policies: Policy[];
  products: Product[];
  /** Lịch sử giá mua theo mã (mới nhất trước). */
  priceHistory: (sku: string) => PriceRow[];
  credit?: CreditStatus[];
  otherDocs: PDoc[];
  partnerTaxCode?: string;
  prepaymentAvailable?: number;
  /** Đơn đặt hàng mà phiếu nhập này giao theo (đối chiếu 3 bên). */
  refOrder?: PDoc;
  /** Mặt hàng & giá mua của NCC (supplier_products) + ĐVT của các mã — so giá cố định. */
  prices?: SupplierProduct[];
  units?: Record<string, ProductUnit[]>;
  /** Mức lệch giá cảnh báo (%) — cài đặt chung của đơn vị (mặc định 2). */
  priceWarnPct?: number;
}
/**
 * QUÀ THEO CHƯƠNG TRÌNH (mua X tặng Y) — một phép tính dùng chung cho kiểm tra, bảng khuyến mại và tự thêm dòng quà:
 * gộp hàng mua cùng mã (cùng ĐVT với dòng đầu), mỗi chính sách promo_gift khớp (NCC, nhãn của mặt hàng, mã, chi nhánh, ngày)
 * cho số quà được tặng = ⌊SL mua / X⌋ × Y; "got" = tổng SL các dòng quà đúng loại, đúng mã quà trên phiếu.
 */
export interface GiftPlanRow {
  key: string; policy: Policy; sku: string; buyLineKey: string;
  /** SL đang mua theo ĐVT mua của dòng chính sách (đã quy đổi). */
  buyQty: number; unit: string;
  buy: number; get: number; giftSku: string; giftUnit: string; lineType: LineType; expected: number; got: number;
  /** Cộng dồn: đủ nhiều mốc thì tặng nhiều lần. */
  repeat: boolean;
  /** Mua thêm bao nhiêu (ĐVT mua) để được tặng thêm (0 = không còn mốc). */
  toNext: number;
  /** Dòng thứ mấy của chính sách. */
  row: number;
}
export function giftPlan(doc: PDoc, policies: Policy[]): GiftPlanRow[] {
  if (doc.kind !== 'receipt' && doc.kind !== 'order') return [];
  policies = policiesFor(doc, policies);
  const ex = exclusiveBySku(doc, policies);
  const all = policies;
  const out: GiftPlanRow[] = [];
  const bySku = new Map<string, PLine[]>();
  for (const l of doc.lines) if (l.lineType === 'buy' && l.sku) bySku.set(l.sku, [...(bySku.get(l.sku) ?? []), l]);
  for (const [sku, ls] of bySku) {
    const first = ls[0]!;
    const ctx = { date: doc.docDate, partnerCode: doc.partnerCode, brandCode: first.brandCode ?? doc.brandCode, branchCode: doc.branchCode, sku };
    const hit = ex.get(sku);
    for (const p of policiesForSku(ex, all, sku).filter((x) => x.kind === 'promo_gift')) {
      if (!policyApplies(p, { ...ctx, sku })) continue;
      const lineType: LineType = p.rule.splitIntoCost ? 'gift_seller' : 'gift_consumer';
      for (const m of giftMatches(p, sku, ls)) {
        if (hit?.winner === p && hit.winnerRow !== undefined && hit.winnerRow !== m.index) continue;
        const gr = m.item.giftRatios ?? (m.giftSku === sku ? m.item.buyRatios : undefined) ?? {};
        const toGiftUnit = (l: PLine) => (lc(l.unit) === lc(m.giftUnit) ? l.qty : gr[lc(l.unit)] && gr[lc(m.giftUnit)] ? (l.qty * gr[lc(l.unit)]!) / gr[lc(m.giftUnit)]! : 0);
        const got = doc.lines.filter((x) => x.lineType === lineType && x.sku === m.giftSku && (!x.program || x.program === p.code)).reduce((t, x) => t + toGiftUnit(x), 0);
        out.push({ key: `${p.code}|${m.index}|${sku}`, policy: p, sku, buyLineKey: first.lineKey, buyQty: m.buyQty, unit: m.unit, buy: m.buy, get: m.get, giftSku: m.giftSku, giftUnit: m.giftUnit,
          lineType, expected: m.expected, got: Math.round(got * 1000) / 1000, repeat: m.repeat, toNext: m.toNext, row: m.index });
      }
    }
  }
  return out;
}

export function checkDoc(doc: PDoc, calc: DocCalc, c: CheckCtx): Check[] {
  const out: Check[] = [];
  const ctx = { date: doc.docDate, partnerCode: doc.partnerCode, brandCode: doc.brandCode, branchCode: doc.branchCode };
  // Dòng hàng mới chưa có mã: đơn đặt được (gắn mã khi hàng về); phiếu nhập / trả phải gắn mã trước khi duyệt.
  const noSku = doc.lines.filter((l) => !l.sku && l.qty > 0);
  if (noSku.length) out.push(doc.kind === 'order'
    ? { level: 'info', code: 'new_item', text: `${noSku.length} dòng hàng mới chưa có mã (${noSku.slice(0, 3).map((l) => l.name || l.nccSku || '?').join(', ')}${noSku.length > 3 ? '…' : ''}) — gắn mã khi hàng về kho` }
    : { level: 'error', code: 'new_item_unlinked', blocking: true, text: `${noSku.length} dòng chưa có mã hàng (${noSku.slice(0, 3).map((l) => l.name || l.nccSku || '?').join(', ')}) — tạo / chọn mã hàng cho dòng trước khi duyệt` });
  // Dòng hàng mua phải có đơn giá (hàng tặng thì chọn loại hàng tặng) — đơn / phiếu tổng 0 không được gửi duyệt / duyệt.
  if (['order', 'receipt', 'return', 'exchange'].includes(doc.kind)) {
    const noPrice = doc.lines.filter((l) => l.lineType === 'buy' && l.qty > 0 && !(l.price > 0));
    if (noPrice.length) out.push({ level: 'error', code: 'price_missing', blocking: true, lineKey: noPrice[0]!.lineKey, text: `${noPrice.length} dòng hàng mua chưa có đơn giá (${noPrice.slice(0, 3).map((l) => l.sku || l.name || '?').join(', ')}${noPrice.length > 3 ? '…' : ''}) — nhập đơn giá, hàng tặng thì chọn loại hàng tặng` });
    // Đơn đặt / phiếu nhập toàn hàng tặng (nhập giá 0 thì dòng thành hàng tặng) → tổng 0: không phải đơn mua.
    if ((doc.kind === 'order' || doc.kind === 'receipt') && doc.lines.length && !doc.lines.some((l) => l.lineType === 'buy' && l.qty > 0 && l.price > 0)) {
      out.push({ level: 'error', code: 'no_buy_line', blocking: true, text: `${doc.kind === 'order' ? 'Đơn đặt' : 'Phiếu nhập'} chưa có dòng hàng mua có đơn giá (tổng tiền 0) — nhập đơn giá cho hàng mua; chỉ có quà / hàng tặng thì lập phiếu Nhận quà` });
    }
  }
  for (const l of doc.lines.filter((x) => x.lineType === 'buy' && x.sku && !c.products.find((p) => p.sku === x.sku)?.isGiftItem)) {
    // Giá mua: so giá cố định (chính sách) và lần mua gần nhất.
    const fixed = priceFor(c.prices ?? [], { date: doc.docDate, partnerCode: doc.partnerCode, sku: l.sku, unit: l.unit }, c.units?.[l.sku] ?? []);
    const warnPct = c.priceWarnPct ?? 2;
    const rate = TAX_RATE[l.taxCode] ?? 0;
    /** Quy giá về cùng loại với phiếu (gồm / chưa VAT) rồi mới so. */
    const sameBasis = (price: number, includesVat: boolean) => (includesVat === doc.priceIncludesVat ? price : includesVat ? Math.round((price / (1 + rate / 100)) * 10000) / 10000 : Math.round(price * (1 + rate / 100) * 10000) / 10000);
    if (fixed) {
      const fp = sameBasis(fixed.price, Boolean(fixed.row.priceIncludesVat));
      const diff = fp ? ((l.price - fp) / fp) * 100 : 0;
      if (Math.abs(diff) > warnPct) out.push({ level: Math.abs(diff) > warnPct * 2 ? 'error' : 'warn', code: 'price_fixed', lineKey: l.lineKey, text: `${l.sku}: đơn giá ${l.price.toLocaleString('vi-VN')} lệch ${diff > 0 ? '+' : ''}${diff.toFixed(1)}% so với giá cố định ${fp.toLocaleString('vi-VN')} / ${l.unit}${fixed.row.partnerCode ? '' : ' (giá chung)'}` });
    }
    const last = c.priceHistory(l.sku)[0];
    if (last) {
      // Lần nhập trước theo ĐVT khác (vd nhập lẻ theo Hộp, nay đặt theo Thùng): quy về ĐVT của dòng rồi mới so.
      const us = c.units?.[l.sku] ?? [];
      const k = last.unit && us.length && last.unit.toLowerCase() !== l.unit.toLowerCase() ? (ratioOf(us, l.unit) || 1) / (ratioOf(us, last.unit) || 1) : 1;
      const lp = Math.round(sameBasis(last.unitPrice, last.includesVat) * k * 10000) / 10000;
      const diff = ((l.price - lp) / lp) * 100;
      if (Math.abs(diff) > warnPct) out.push({ level: 'warn', code: 'price_last', lineKey: l.lineKey, text: `${l.sku}: đơn giá ${diff > 0 ? 'cao' : 'thấp'} hơn lần nhập gần nhất ${Math.abs(diff).toFixed(1)}% (${lp.toLocaleString('vi-VN')} / ${l.unit}${k !== 1 ? ` — quy từ ${last.unit}` : ''} — phiếu ${last.docNo} ngày ${last.date})` });
    }
  }
  // Quà theo chương trình (mua X tặng Y): số được tặng so với số trên phiếu — cùng một phép tính với bảng khuyến mại.
  for (const g of giftPlan(doc, c.policies).filter((x) => x.expected !== x.got)) {
    out.push({ level: 'warn', code: 'gift_qty', lineKey: g.buyLineKey, text: `${g.policy.name}: mua ${g.buyQty} → được tặng ${g.expected} (${g.lineType === 'gift_seller' ? 'KM người bán, chia giá' : 'KM người tiêu dùng'}), phiếu ghi ${g.got} → ${g.got < g.expected ? `thiếu ${g.expected - g.got}` : `thừa ${g.got - g.expected}`}` });
  }
  // Lô / hạn dùng (khi hàng thực nhận vào kho — đơn đặt chưa có lô).
  for (const l of doc.kind === 'order' ? [] : doc.lines) {
    const p = c.products.find((x) => x.sku === l.sku);
    // Theo nhãn của mặt hàng trong danh mục; hàng mua (không phải quà) xét thêm nhãn chính của phiếu — mã nhãn trong danh mục
    // có thể khác cách gọi nhãn ở chính sách (ví dụ danh mục ghi mã hãng, chính sách ghi ANLENE).
    const lotCtx = { date: doc.docDate, partnerCode: doc.partnerCode, sku: l.sku, branchCode: doc.branchCode };
    const lotPolicy = findPolicy(c.policies, 'lot_tracking', { ...lotCtx, brandCode: p?.brandCode })
      ?? (l.lineType !== 'gift_consumer' && !p?.isGiftItem ? findPolicy(c.policies, 'lot_tracking', { ...lotCtx, brandCode: doc.brandCode }) : undefined);
    const tracked = p?.trackLot || Boolean(lotPolicy && lotPolicy.rule.required !== false);
    if (tracked && (!l.lotNo || !l.expDate)) out.push({ level: 'error', code: 'lot_missing', lineKey: l.lineKey, blocking: true, text: `${l.sku}: mặt hàng theo dõi lô — nhập số lô và hạn dùng` });
    if (l.expDate) {
      const left = daysBetween(doc.docDate, l.expDate);
      if (left < 0) out.push({ level: 'error', code: 'expired', lineKey: l.lineKey, blocking: true, text: `${l.sku} lô ${l.lotNo ?? ''}: đã hết hạn (${l.expDate})` });
      else if (left <= 30) out.push({ level: left <= 7 ? 'error' : 'warn', code: 'near_expiry', lineKey: l.lineKey, text: `${l.sku} lô ${l.lotNo ?? ''}: còn ${left} ngày hết hạn (${l.expDate})` });
    }
  }
  // Hạn mức công nợ.
  for (const cs of c.credit ?? []) {
    if (cs.exceeded > 0) out.push({ level: 'error', code: 'credit_exceeded', blocking: !doc.override, text: `${cs.scope}: vượt hạn mức ${cs.exceeded.toLocaleString('vi-VN')} (nợ sau phiếu ${cs.after.toLocaleString('vi-VN')} / hạn mức ${cs.limit.toLocaleString('vi-VN')})${doc.override ? ` — đã duyệt ngoại lệ bởi ${doc.override.by}` : ' — cần duyệt ngoại lệ'}` });
    else if (cs.warn) out.push({ level: 'warn', code: 'credit_near', text: `${cs.scope}: đã dùng ${Math.round((cs.after / cs.limit) * 100)}% hạn mức, còn ${cs.remaining.toLocaleString('vi-VN')}` });
  }
  // Hoá đơn: trùng số cùng NCC, lệch tổng.
  if (doc.invoice?.no) {
    const dup = c.otherDocs.find((d) => d.id !== doc.id && (d.status === 'approved' || d.status === 'pending_approval') && d.partnerCode === doc.partnerCode && d.invoice?.no === doc.invoice?.no && (d.invoice?.serial ?? '') === (doc.invoice?.serial ?? ''));
    if (dup) out.push({ level: 'error', code: 'invoice_dup', blocking: true, text: `Hoá đơn ${doc.invoice.no} của NCC này đã nhập ở phiếu ${dup.docNo}` });
    if (doc.invoice.total && Math.abs(doc.invoice.total - calc.payable) >= 1) out.push({ level: 'warn', code: 'invoice_total', text: `Tổng hoá đơn ${doc.invoice.total.toLocaleString('vi-VN')} lệch ${(doc.invoice.total - calc.payable).toLocaleString('vi-VN')} so với tổng tính ${calc.payable.toLocaleString('vi-VN')}` });
  } else if (doc.kind === 'receipt') {
    out.push({ level: 'info', code: 'no_invoice', text: 'Chưa có hoá đơn: hàng về trước, bổ sung hoá đơn sau (thuế đầu vào chưa khấu trừ)' });
  }
  if (c.refOrder) {
    const bad = threeWayMatch(c.refOrder, doc).filter((m) => !m.ok);
    out.push(bad.length
      ? { level: 'warn', code: 'po_mismatch', text: `Lệch đơn đặt ${c.refOrder.docNo}: ${bad.map((m) => `${m.sku} ${m.text}`).join('; ')}` }
      : { level: 'info', code: 'po_match', text: `Khớp đơn đặt ${c.refOrder.docNo} (số lượng, đơn giá) — đối chiếu 3 bên đơn đặt ↔ phiếu nhập ↔ hoá đơn đạt` });
  }
  if (c.prepaymentAvailable) out.push({ level: 'info', code: 'prepayment', text: `NCC còn ${c.prepaymentAvailable.toLocaleString('vi-VN')} tiền ứng trước — tự đối trừ khi duyệt, không ghi trả trùng` });
  return out;
}

/* ------------------------------------------------------------------ thưởng cuối kỳ */

export interface RebateResult { policy: string; kind: PolicyKind; base: number; rate: number; amount: number; detail: string[]; /** Thưởng giai đoạn: tiền thưởng và khoảng ngày (luỹ kế: từ đầu tháng) của từng giai đoạn — để chia cho đúng hàng mua trong khoảng đó. */ stages?: { from: number; to: number; amount: number }[] }
/** sales: doanh số mua thuần trước thuế trong kỳ (stage: theo ngày trong tháng). */
export function rebateFor(p: Policy, sales: { total: number; byDay?: Record<number, number> }): RebateResult {
  const detail: string[] = [];
  if (p.kind === 'period_rebate') {
    const t = pickTier((p.rule.tiers as { from: number; pct: number }[]) ?? [], sales.total);
    const rate = t?.pct ?? 0;
    detail.push(`Doanh số ${sales.total.toLocaleString('vi-VN')} → bậc ${t ? `từ ${t.from.toLocaleString('vi-VN')}` : 'chưa đạt'}: ${Number(rate).toLocaleString('vi-VN')}%`);
    return { policy: p.code, kind: p.kind, base: sales.total, rate, amount: Math.round((sales.total * rate) / 100), detail };
  }
  if (p.kind === 'target_rebate') {
    const target = num(p.rule.target);
    // So ngưỡng bằng số tiền thật (doanh số × 100 ≥ ngưỡng % × chỉ tiêu), không qua % đã làm tròn: thiếu vài đồng là chưa đạt.
    // % hiện ra cắt (không làm tròn lên) 2 số lẻ: 109,999…% hiện 109,99%, không thành 110%.
    const pct = target ? Math.floor((sales.total / target) * 10000) / 100 : 0;
    const t = [...((p.rule.tiers as { fromPct: number; pct: number }[]) ?? [])].sort((a, b) => b.fromPct - a.fromPct).find((x) => target > 0 && sales.total * 100 >= x.fromPct * target);
    const rate = t?.pct ?? 0;
    detail.push(`Hoàn thành ${sales.total.toLocaleString('vi-VN')} / ${target.toLocaleString('vi-VN')} = ${Number(pct).toLocaleString('vi-VN')}% → ${t ? `ngưỡng ${Number(t.fromPct).toLocaleString('vi-VN')}%: thưởng ${Number(rate).toLocaleString('vi-VN')}%` : 'chưa đạt ngưỡng'}`);
    return { policy: p.code, kind: p.kind, base: sales.total, rate, amount: Math.round((sales.total * rate) / 100), detail };
  }
  // stage_rebate: mỗi giai đoạn tính trên doanh số CỦA giai đoạn đó (mode=stage) hoặc luỹ kế từ đầu tháng (mode=cumulative,
  // trừ phần đã thưởng ở giai đoạn trước để không tính trùng).
  const stages = (p.rule.stages as { from: number; to: number; min: number; pct?: number; amount?: number }[]) ?? [];
  const cumulative = p.rule.mode === 'cumulative';
  let total = 0, paidBase = 0, paidTo = 0;
  const parts: { from: number; to: number; amount: number }[] = [];
  for (const s of stages) {
    const inStage = Object.entries(sales.byDay ?? {}).filter(([d]) => Number(d) >= s.from && Number(d) <= s.to).reduce((a, [, v]) => a + v, 0);
    const cum = Object.entries(sales.byDay ?? {}).filter(([d]) => Number(d) <= s.to).reduce((a, [, v]) => a + v, 0);
    const base = cumulative ? cum : inStage;
    const ok = base >= s.min;
    const amt = ok ? (s.amount ?? Math.round(((cumulative ? base - paidBase : base) * (s.pct ?? 0)) / 100)) : 0;
    // Luỹ kế: phần thưởng mới tính trên doanh số tăng thêm từ lần thưởng trước → chia cho hàng mua sau mốc đó.
    if (amt) parts.push({ from: cumulative ? paidTo + 1 : s.from, to: s.to, amount: amt });
    if (ok && cumulative) { paidBase = base; paidTo = s.to; }
    total += amt;
    detail.push(`Giai đoạn ${s.from}–${s.to}: doanh số ${base.toLocaleString('vi-VN')} ${ok ? `≥ ${s.min.toLocaleString('vi-VN')} → ${s.amount ? `${s.amount.toLocaleString('vi-VN')}đ` : `${Number(s.pct).toLocaleString('vi-VN')}%`} = ${amt.toLocaleString('vi-VN')}` : `< ${s.min.toLocaleString('vi-VN')} → không thưởng`}`);
  }
  return { policy: p.code, kind: p.kind, base: sales.total, rate: 0, amount: total, detail, stages: parts };
}

/* ------------------------------------------------------------------ hạch toán xem trước */

export interface Entry { debit: string; credit: string; amount: number; text: string }
/** Tài khoản mặc định; máy chủ truyền tài khoản thật của đơn vị (cấu hình hạch toán) qua opts.accounts. */
export const ACC = { stock: '1561', vatIn: '1331', payable: '3312', cash: '1111', bank: '1121', giftIncome: '711', giftExpense: '6418', finIncome: '515' };
export type Accounts = typeof ACC;

/** Giá trị quà không hoá đơn: giá trị hợp lý nhập trên dòng, không có thì giá trị khai ở mặt hàng. */
export const giftLineValue = (l: PLine, giftValue?: (sku: string) => number) => Math.round(l.qty * (l.price || giftValue?.(l.sku) || 0));

/**
 * Tài khoản tiền của phiếu: tài khoản chọn trên phiếu nếu đúng loại (tiền mặt 111*, chuyển khoản 112*), không thì mặc định theo cài đặt.
 */
export function moneyAccountOf(doc: Pick<PDoc, 'method' | 'moneyAccount'>, A: Pick<Accounts, 'cash' | 'bank'>): string {
  const cash = doc.method === 'cash';
  const pick = doc.moneyAccount?.trim();
  if (pick && pick.startsWith(cash ? '111' : '112')) return pick;
  return cash ? A.cash : A.bank;
}

export function postingFor(doc: PDoc, calc: DocCalc, opts: { giftValue?: (sku: string) => number; accounts?: Partial<Accounts> } = {}): Entry[] {
  const A = { ...ACC, ...opts.accounts };
  const money = moneyAccountOf(doc, A);
  const e: Entry[] = [];
  if (doc.kind === 'receipt') {
    if (calc.beforeTax) e.push({ debit: A.stock, credit: A.payable, amount: calc.beforeTax, text: 'Giá trị hàng nhập (đã trừ chiết khấu thương mại; hàng KM nhập kho giá 0, chia vào giá vốn)' });
    if (calc.tax) e.push({ debit: A.vatIn, credit: A.payable, amount: calc.tax, text: 'Thuế GTGT đầu vào' });
  } else if (doc.kind === 'gift_in') {
    const v = calc.lines.reduce((s, l) => s + giftLineValue(l, opts.giftValue), 0);
    if (v) e.push({ debit: A.stock, credit: A.giftIncome, amount: v, text: 'Nhận quà / hàng tặng không hoá đơn (giá trị hợp lý)' });
  } else if (doc.kind === 'gift_out') {
    const v = calc.lines.reduce((s, l) => s + giftLineValue(l, opts.giftValue), 0);
    if (v) e.push({ debit: A.giftExpense, credit: A.stock, amount: v, text: 'Xuất quà tặng khách (giá trị tạm tính; giá vốn chốt khi tính giá vốn tháng)' });
  } else if (doc.kind === 'return') {
    if (calc.beforeTax) e.push({ debit: A.payable, credit: A.stock, amount: calc.beforeTax, text: 'Trả hàng nhà cung cấp' });
    if (calc.tax) e.push({ debit: A.payable, credit: A.vatIn, amount: calc.tax, text: 'Giảm thuế GTGT đầu vào' });
  } else if (doc.kind === 'exchange' && calc.exchange) {
    const x = calc.exchange;
    if (x.outBeforeTax) e.push({ debit: A.payable, credit: A.stock, amount: x.outBeforeTax, text: 'Hàng trả đi (xuất kho trả NCC)' });
    if (x.outTax) e.push({ debit: A.payable, credit: A.vatIn, amount: x.outTax, text: 'Giảm thuế đầu vào hàng trả' });
    if (x.inBeforeTax) e.push({ debit: A.stock, credit: A.payable, amount: x.inBeforeTax, text: 'Hàng nhận về (nhập kho)' });
    if (x.inTax) e.push({ debit: A.vatIn, credit: A.payable, amount: x.inTax, text: 'Thuế đầu vào hàng nhận' });
    if (x.diff > 0 && doc.settle === 'pay') e.push({ debit: A.payable, credit: money, amount: x.diff, text: 'Thanh toán bổ sung phần chênh lệch' });
    if (x.diff < 0 && doc.settle === 'refund') e.push({ debit: money, credit: A.payable, amount: -x.diff, text: 'Nhà cung cấp hoàn tiền phần chênh lệch' });
  } else if (doc.kind === 'prepayment') {
    e.push({ debit: A.payable, credit: money, amount: num(doc.amount), text: 'Ứng trước cho nhà cung cấp (tự đối trừ khi nhận hàng, hoá đơn)' });
  } else if (doc.kind === 'payment') {
    if (num(doc.amount)) e.push({ debit: A.payable, credit: money, amount: num(doc.amount), text: 'Trả tiền nhà cung cấp' });
    if (num(doc.ckttAmount)) e.push({ debit: A.payable, credit: A.finIncome, amount: num(doc.ckttAmount), text: 'Chiết khấu thanh toán được hưởng (trả đúng hạn)' });
  } else if (doc.kind === 'cost') {
    e.push({ debit: A.stock, credit: A.payable, amount: num(doc.amount), text: 'Chi phí mua hàng phân bổ vào giá vốn từng mã' });
    const rate = TAX_RATE[doc.taxCode ?? ''] ?? 0;
    if (rate) e.push({ debit: A.vatIn, credit: A.payable, amount: Math.round((num(doc.amount) * rate) / 100), text: 'Thuế GTGT đầu vào của dịch vụ' });
  } else if (doc.kind === 'rebate') {
    const rate = TAX_RATE[doc.taxCode ?? ''] ?? 0;
    if (rate) e.push({ debit: A.payable, credit: A.vatIn, amount: Math.round((num(doc.amount) * rate) / 100), text: 'Giảm thuế GTGT đầu vào theo hoá đơn điều chỉnh giảm' });
    e.push({ debit: A.payable, credit: A.stock, amount: num(doc.amount), text: 'Thưởng / chiết khấu cuối kỳ giảm giá trị hàng nhập (giá vốn bình quân tháng tự chia cho hàng còn tồn và hàng đã bán)' });
  }
  return e;
}

/* ------------------------------------------------------------------ lịch trả nhiều đợt, tuổi nợ */

export interface InstallmentStatus { seq: number; dueDate: string; amount: number; paid: number; remaining: number; state: 'paid' | 'not_due' | 'due' | 'overdue'; daysOverdue: number }
/** Số đã trả rải vào các đợt theo thứ tự hạn (đợt sớm trả trước) → biết từng đợt đến hạn / quá hạn còn bao nhiêu. */
export function scheduleStatus(schedule: { seq: number; dueDate: string; amount: number }[], paidTotal: number, asOf: string): InstallmentStatus[] {
  let left = paidTotal;
  return [...schedule].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((s) => {
    const paid = Math.min(s.amount, Math.max(0, left));
    left -= paid;
    const remaining = s.amount - paid;
    const d = daysBetween(s.dueDate, asOf);
    const state = remaining <= 0 ? 'paid' : d < 0 ? 'not_due' : d === 0 ? 'due' : 'overdue';
    return { ...s, paid, remaining, state, daysOverdue: state === 'overdue' ? d : 0 };
  });
}
export const AGING_BUCKETS = ['Chưa đến hạn', 'Đến hạn', 'Quá hạn 1–7 ngày', 'Quá hạn 8–15 ngày', 'Quá hạn 16–30 ngày', 'Quá hạn > 30 ngày'] as const;
export function agingBucket(dueDate: string, asOf: string): number {
  const d = daysBetween(dueDate, asOf);
  return d < 0 ? 0 : d === 0 ? 1 : d <= 7 ? 2 : d <= 15 ? 3 : d <= 30 ? 4 : 5;
}

/* ------------------------------------------------------------------ lô / hạn dùng */

export interface LotStock { sku: string; lotNo: string; expDate: string; mfgDate?: string; branchCode: string; qty: number; unitCost: number; partnerCode: string; docNo: string; receivedAt: string }
export const EXPIRY_MARKS = [30, 15, 7];
export function expiryState(expDate: string, asOf: string): { days: number; level: 'ok' | 'm30' | 'm15' | 'm7' | 'expired' } {
  const days = daysBetween(asOf, expDate);
  return { days, level: days < 0 ? 'expired' : days <= 7 ? 'm7' : days <= 15 ? 'm15' : days <= 30 ? 'm30' : 'ok' };
}
/** FEFO: chọn xuất lô hạn xa hơn trong khi cùng chi nhánh còn lô hạn gần → cảnh báo. */
export function fefoCheck(lots: LotStock[], pick: { sku: string; lotNo: string; branchCode: string }): string | null {
  const same = lots.filter((l) => l.sku === pick.sku && l.branchCode === pick.branchCode && l.qty > 0).sort((a, b) => a.expDate.localeCompare(b.expDate));
  const chosen = same.find((l) => l.lotNo === pick.lotNo);
  const first = same[0];
  if (!chosen || !first || first.lotNo === chosen.lotNo || first.expDate === chosen.expDate) return null;
  return `Đang chọn lô ${chosen.lotNo} (hạn ${chosen.expDate}) trong khi còn ${first.qty} lô ${first.lotNo} hạn gần hơn (${first.expDate}) — nên xuất lô ${first.lotNo} trước (FEFO)`;
}

/* ------------------------------------------------------------------ đối chiếu 3 bên: đơn đặt ↔ phiếu nhập ↔ hoá đơn */

export interface MatchRow { sku: string; orderQty: number; receiptQty: number; orderPrice: number; receiptPrice: number; ok: boolean; text: string }
export function threeWayMatch(order: PDoc, receipt: PDoc): MatchRow[] {
  const skus = [...new Set([...order.lines, ...receipt.lines].filter((l) => l.lineType === 'buy').map((l) => l.sku))];
  return skus.map((sku) => {
    const o = order.lines.filter((l) => l.sku === sku && l.lineType === 'buy');
    const r = receipt.lines.filter((l) => l.sku === sku && l.lineType === 'buy');
    const oq = o.reduce((s, l) => s + l.qty, 0), rq = r.reduce((s, l) => s + l.qty, 0);
    const op = o[0]?.price ?? 0, rp = r[0]?.price ?? 0;
    const ok = oq === rq && op === rp;
    const text = ok ? 'Khớp' : [oq !== rq && `SL đặt ${oq} / nhận ${rq}`, op !== rp && `giá đặt ${op.toLocaleString('vi-VN')} / hoá đơn ${rp.toLocaleString('vi-VN')}`].filter(Boolean).join(' · ');
    return { sku, orderQty: oq, receiptQty: rq, orderPrice: op, receiptPrice: rp, ok, text };
  });
}

/* ------------------------------------------------------------------ thưởng giảm giá vốn: phần còn tồn / phần đã bán */

/** Thưởng phân bổ cho một mã: phần tương ứng hàng còn tồn giảm 1561 (giá vốn tồn), phần đã bán ghi giảm 632. */
export function splitStockSold(amount: number, purchasedQty: number, onHandQty: number): { stock: number; sold: number } {
  if (!purchasedQty) return { stock: 0, sold: amount };
  const stock = Math.round((amount * Math.min(onHandQty, purchasedQty)) / purchasedQty);
  return { stock, sold: amount - stock };
}

export const COST_TYPES: Record<NonNullable<PDoc['costType']>, string> = { van_chuyen: 'Vận chuyển', boc_xep: 'Bốc xếp', luu_kho: 'Lưu kho, thuê kho', bao_hiem: 'Bảo hiểm hàng hoá', kiem_dinh: 'Kiểm định, kiểm nghiệm', khac: 'Chi phí mua khác' };
/** Thuế của phiếu chỉ có số tiền (chi phí, thưởng). */
export const amountTax = (d: Pick<PDoc, 'amount' | 'taxCode'>) => Math.round((num(d.amount) * (TAX_RATE[d.taxCode ?? ''] ?? 0)) / 100);
