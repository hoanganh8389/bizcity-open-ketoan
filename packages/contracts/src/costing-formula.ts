// [2026-11-05 09:30 PM Nguyễn Văn Thủy] PHASE-026 — công thức giá vốn theo từng bản cài: nội bộ, thuế (đóng góp)
// [2026-11-05 09:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-026 — nhận đóng góp vào framework: Nguyễn Văn Thủy rà và gộp theo uỷ quyền review / merge
/**
 * Công thức giá vốn bình quân tháng của hai dữ liệu, theo quy định công ty (07/07/2026). BOOK_MODE của bản cài chọn công thức.
 *   - Nội bộ: lưu mọi chứng từ. Ưu tiên.
 *   - Thuế: chứng từ có số hoá đơn.
 * Một nơi khai báo: tính giá vốn (Kernel) và màn Công thức (web) cùng đọc từ đây.
 */
export type CostBook = 'internal' | 'tax';

export interface CostReasonRule { code: string; name: string; basis: string }

export interface CostFormula {
  label: string;
  scope: string;
  numerator: string;
  denominator: string;
  /** Lý do trả nhà cung cấp định giá theo tồn đầu. Rỗng: mọi lý do lấy thành tiền − thuế. */
  returnAtOpeningReasons: string[];
  returnRule: string;
  adjustRule: string;
  inReasons: CostReasonRule[];
  returnReasons: CostReasonRule[];
}

const NET = 'Giá Net';
const RETURN_AMOUNT = 'Thành tiền − thuế';
const RETURN_OPENING = 'Theo tồn đầu';

const COMMON_IN: CostReasonRule[] = [
  { code: 'NMH1', name: 'Nhập mua hàng từ NCC', basis: NET },
  { code: 'NMH2', name: 'Nhập mua hàng từ NCC (không HĐTC)', basis: NET },
  { code: 'NMH3', name: 'Nhập mua hàng chiến lược', basis: NET },
  { code: 'NTT1', name: 'Nhập hàng trả thưởng', basis: NET },
  { code: 'NTT2', name: 'Nhập hàng trả thưởng (không HĐTC)', basis: NET },
  { code: 'NCN', name: 'Nhập hàng từ chi nhánh khác', basis: NET },
  { code: 'NDC', name: 'Nhập điều chỉnh kho / mã', basis: NET },
  { code: 'NKKT', name: 'Nhập kiểm kê thừa không cấn trừ', basis: NET },
  { code: 'NVT1', name: 'Nhập vật tư', basis: NET },
  { code: 'NVT2', name: 'Nhập vật tư (không HĐTC)', basis: NET },
  { code: 'NTR1', name: 'Nhập hàng đổi trả NCC', basis: NET },
  { code: 'NTR2', name: 'Nhập hàng đổi trả NCC (không HĐTC)', basis: NET },
  { code: 'NCKhau1', name: 'Nhập chiết khấu NCC', basis: 'Giá trị chiết khấu theo từng mã hàng' },
];

export const COST_FORMULAS: Record<CostBook, CostFormula> = {
  internal: {
    label: 'Nội bộ',
    scope: 'Lưu mọi chứng từ',
    numerator: 'Giá trị (tồn đầu + nhập mua NCC + nhập điều chỉnh + hàng mua trả lại)',
    denominator: 'Số lượng (tồn đầu + nhập mua NCC + nhập điều chỉnh + hàng mua trả lại)',
    returnAtOpeningReasons: [],
    returnRule: 'Mọi lý do: thành tiền trên phiếu hàng mua trả lại − thuế.',
    adjustRule: 'Nhập điều chỉnh = số lượng × đơn giá trên phiếu, trừ lý do ĐGTTK.',
    inReasons: [
      ...COMMON_IN,
      { code: 'NMH4', name: 'Nhập mua hàng hoá đơn chưa về', basis: NET },
      { code: 'NMH9', name: 'Nhập mua hàng từ NCC (không HĐTC)', basis: NET },
      { code: 'NVT3', name: 'Nhập vật tư (không HĐTC)', basis: NET },
      { code: 'NVT4', name: 'Nhập vật tư (chưa có hoá đơn)', basis: NET },
      { code: 'NTR3', name: 'Nhập hàng chiến lược đổi trả', basis: NET },
      { code: 'NTR9', name: 'Nhập hàng đổi trả NCC (không HĐTC)', basis: NET },
      { code: 'NCKhau9', name: 'Nhập chiết khấu NCC (nội bộ)', basis: 'Giá trị chiết khấu theo từng mã hàng' },
      { code: 'NTH3', name: 'Theo danh sách quy định', basis: NET },
      { code: 'NTS1', name: 'Theo danh sách quy định', basis: NET },
      { code: 'MCN', name: 'Nhập hàng từ chi nhánh khác', basis: NET },
      { code: 'MCNKS', name: 'Theo danh sách quy định', basis: NET },
      { code: 'NMHKS', name: 'Theo danh sách quy định', basis: NET },
      { code: 'NSDK311', name: 'Nhập số dư đầu kỳ 311', basis: NET },
      { code: 'NNB1', name: 'Nhập vật tư, CCDC, tài sản từ chi nhánh', basis: NET },
    ],
    returnReasons: [
      { code: 'XDC', name: 'Xuất điều chỉnh kho / mã hàng', basis: RETURN_AMOUNT },
      { code: 'XKK', name: 'Xuất xử lý kiểm kê', basis: RETURN_AMOUNT },
      { code: 'XTT1', name: 'Xuất trả hàng trả thưởng', basis: RETURN_AMOUNT },
      { code: 'XTT2', name: 'Xuất trả hàng trả thưởng (không HĐTC)', basis: RETURN_AMOUNT },
      { code: 'XTR1', name: 'Xuất hàng đổi trả NCC', basis: RETURN_AMOUNT },
      { code: 'XTR2', name: 'Xuất trả hàng NCC (không HĐTC)', basis: RETURN_AMOUNT },
      { code: 'XTR3', name: 'Xuất trả hàng chiến lược', basis: RETURN_AMOUNT },
      { code: 'XTR4', name: 'Xuất trả hàng chi nhánh', basis: RETURN_AMOUNT },
      { code: 'XTR9', name: 'Xuất trả hàng NCC (không HĐTC)', basis: RETURN_AMOUNT },
      { code: 'XCN3', name: 'Xuất trả hàng chi nhánh', basis: RETURN_AMOUNT },
    ],
  },
  tax: {
    label: 'Thuế',
    scope: 'Chứng từ có số hoá đơn',
    numerator: 'Giá trị (tồn đầu + nhập mua NCC + hàng mua trả lại + nhập điều chỉnh − xuất chi nhánh)',
    denominator: 'Số lượng (tồn đầu + nhập mua NCC + hàng mua trả lại + nhập điều chỉnh − xuất chi nhánh)',
    returnAtOpeningReasons: ['XTR1', 'XTR9'],
    returnRule: 'XTR1, XTR9 định giá theo tồn đầu; lý do khác: thành tiền − thuế.',
    adjustRule: 'Mọi lý do: số lượng 0 thì giá trị = đơn giá trên phiếu; số lượng khác 0 thì số lượng × đơn giá.',
    inReasons: [
      ...COMMON_IN,
      { code: 'NCKhau2', name: 'Nhập chiết khấu NCC (nội bộ)', basis: 'Giá trị chiết khấu theo từng mã hàng' },
      { code: 'MCNKS', name: 'Theo danh sách quy định', basis: NET },
      { code: 'NMHKS', name: 'Theo danh sách quy định', basis: NET },
    ],
    returnReasons: [
      { code: 'XDC', name: 'Xuất điều chỉnh kho / mã hàng', basis: RETURN_AMOUNT },
      { code: 'XKK', name: 'Xuất xử lý kiểm kê', basis: RETURN_AMOUNT },
      { code: 'XTT1', name: 'Xuất trả hàng trả thưởng', basis: RETURN_AMOUNT },
      { code: 'XTT2', name: 'Xuất trả hàng trả thưởng (không HĐTC)', basis: RETURN_AMOUNT },
      { code: 'XTR1', name: 'Xuất hàng đổi trả NCC', basis: RETURN_OPENING },
      { code: 'XTR9', name: 'Xuất trả hàng NCC (không HĐTC)', basis: RETURN_OPENING },
      { code: 'XTR3', name: 'Xuất trả hàng chiến lược', basis: RETURN_AMOUNT },
      { code: 'XTR4', name: 'Xuất trả hàng chi nhánh', basis: RETURN_AMOUNT },
      { code: 'XTRCN', name: 'Xuất trả hàng chi nhánh', basis: RETURN_AMOUNT },
    ],
  },
};

/** Lý do trả nhà cung cấp có định giá theo tồn đầu không. Bản nội bộ: không. Bản thuế: theo danh sách hoặc cờ của lý do. */
export function returnsAtOpening(book: CostBook, reasonCode: string | null, reasonFlag: boolean): boolean {
  if (book === 'internal') return false;
  return reasonFlag || (reasonCode !== null && COST_FORMULAS.tax.returnAtOpeningReasons.includes(reasonCode));
}

/** Giá trị hàng trả nhà cung cấp định giá theo tồn đầu (số dương). */
export function returnValueAtOpening(qty: number, amount: number, openingQty: number, openingValue: number): number {
  if (!amount || !qty) return 0;
  const oq = openingQty > 0 ? openingQty : 0;
  const ov = openingQty > 0 ? openingValue : 0;
  const unitReturn = amount / qty;
  const unitOpening = oq > 0 ? ov / oq : 0;
  if (oq > 0 && unitReturn <= unitOpening) return Math.round(qty * unitOpening);
  if (amount <= ov) return amount;
  if (qty <= oq) return ov;
  return Math.round(ov + (qty - oq) * unitReturn);
}
