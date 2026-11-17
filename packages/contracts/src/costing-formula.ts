// [2026-11-05 09:30 PM Nguyễn Văn Thủy] PHASE-026 — công thức giá vốn theo từng bản cài: nội bộ, thuế (đóng góp)
// [2026-11-05 09:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-026 — nhận đóng góp vào framework: Nguyễn Văn Thủy rà và gộp theo uỷ quyền review / merge
/**
 * Công thức giá vốn bình quân tháng của hai dữ liệu, theo quy định công ty (07/07/2026). BOOK_MODE của bản cài chọn công thức.
 *   - Nội bộ: lưu mọi chứng từ. Ưu tiên.
 *   - Thuế: chứng từ có số hoá đơn.
 * Một nơi khai báo: tính giá vốn (Kernel) và màn Công thức (web) cùng đọc từ đây.
 */
export type CostBook = 'internal' | 'tax';

/** Căn cứ đưa một loại nghiệp vụ vào công thức (theo nghiệp vụ, không theo lý do — lý do chỉ là nhãn). */
export interface CostBasisRow { item: string; internal: string; tax: string }

export interface CostFormula {
  label: string;
  scope: string;
  numerator: string;
  denominator: string;
  /** Hàng trả nhà cung cấp: 'doc' = thành tiền − thuế trên phiếu; 'opening' = định giá theo tồn đầu. */
  purchaseReturn: 'doc' | 'opening';
  returnRule: string;
  adjustRule: string;
}

export const COST_FORMULAS: Record<CostBook, CostFormula> = {
  internal: {
    label: 'Nội bộ',
    scope: 'Lưu mọi chứng từ',
    numerator: 'Giá trị (tồn đầu + nhập mua NCC + chi phí mua − chiết khấu, thưởng NCC + nhập điều chỉnh + nhận chi nhánh khác − hàng mua trả lại)',
    denominator: 'Số lượng (tồn đầu + nhập mua NCC + nhập điều chỉnh + nhận chi nhánh khác − hàng mua trả lại)',
    purchaseReturn: 'doc',
    returnRule: 'Thành tiền trên phiếu trả − thuế, không vượt giá trị đang có (tồn đầu + nhập); trả hết số đang có thì lấy hết giá trị. Chênh lệch ghi TK chênh lệch hàng trả NCC.',
    adjustRule: 'Số lượng × đơn giá trên phiếu; số lượng 0 thì giá trị = tiền trên phiếu (điều chỉnh giá trị).',
  },
  tax: {
    label: 'Thuế',
    scope: 'Chứng từ có số hoá đơn',
    numerator: 'Giá trị (tồn đầu + nhập mua NCC + chi phí mua − chiết khấu, thưởng NCC + nhập điều chỉnh + nhận chi nhánh khác − hàng mua trả lại − xuất chi nhánh)',
    denominator: 'Số lượng (tồn đầu + nhập mua NCC + nhập điều chỉnh + nhận chi nhánh khác − hàng mua trả lại − xuất chi nhánh)',
    purchaseReturn: 'opening',
    returnRule: 'Định giá theo tồn đầu, không theo tiền trên phiếu. Chênh lệch với tiền trên phiếu ghi TK chênh lệch hàng trả NCC.',
    adjustRule: 'Số lượng × đơn giá trên phiếu; số lượng 0 thì giá trị = tiền trên phiếu (điều chỉnh giá trị).',
  },
};

/** Căn cứ tính của từng nghiệp vụ ở hai sổ. */
export const COST_BASIS: CostBasisRow[] = [
  { item: 'Nhập mua nhà cung cấp', internal: 'Giá Net (chưa VAT − chiết khấu)', tax: 'Giá Net (chưa VAT − chiết khấu)' },
  { item: 'Chi phí mua phân bổ (vận chuyển…)', internal: 'Cộng vào giá trị', tax: 'Cộng vào giá trị' },
  { item: 'Chiết khấu, thưởng nhà cung cấp theo mã', internal: 'Trừ khỏi giá trị', tax: 'Trừ khỏi giá trị' },
  { item: 'Nhận hàng từ chi nhánh khác', internal: 'Giá trên phiếu chuyển', tax: 'Giá trên phiếu chuyển' },
  { item: 'Nhập điều chỉnh kho', internal: 'Số lượng × đơn giá', tax: 'Số lượng × đơn giá' },
  { item: 'Hàng mua trả lại', internal: 'Thành tiền − thuế trên phiếu, không vượt giá trị đang có', tax: 'Định giá theo tồn đầu' },
  { item: 'Chênh lệch hàng trả (tiền phiếu − giá trị trừ)', internal: 'Ghi TK chênh lệch hàng trả NCC', tax: 'Ghi TK chênh lệch hàng trả NCC' },
  { item: 'Xuất chi nhánh (bán cho chi nhánh khác theo giá bán, có hoá đơn)', internal: 'Không có — chuyển chi nhánh là chuyển kho theo giá vốn', tax: 'Giá vốn ghi ngay = giá bán; trừ khỏi tử và mẫu' },
  { item: 'Quà khuyến mãi nhận kèm phiếu mua', internal: 'Không vào công thức (giá 0)', tax: 'Không vào công thức (giá 0)' },
];

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
