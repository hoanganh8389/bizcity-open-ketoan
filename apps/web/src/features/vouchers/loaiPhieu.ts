// [2026-11-11 Nguyễn Văn Thủy] Loại phiếu thu / chi (mẫu định khoản ngầm định) ở tiêu đề form (đóng góp)
/**
 * LOẠI PHIẾU THU / CHI — ô cạnh tiêu đề form: chọn loại thì điền sẵn tài khoản tiền và tài khoản đối ứng của dòng.
 *   no / co: ĐẦU SỐ tài khoản (111, 131…); form lấy tài khoản chi tiết đầu tiên có đầu số đó trong hệ thống tài khoản.
 *   Ô trống = người lập tự chọn (thu khác, chi khác, chi mua ngoài có hoá đơn).
 *   Tài khoản tiền: phiếu thu / báo có ở bên Nợ, phiếu chi / báo nợ ở bên Có; tiền gửi lấy theo tài khoản ngân hàng chọn trên phiếu.
 */
import type { VoucherType } from '@ketoan/contracts';

/** no / co: tài khoản mặc định (hoặc đầu số); noFilter / coFilter: danh sách được chọn trên dòng (theo đầu số, trống = mọi tài khoản). */
export interface LoaiPhieu { name: string; no?: string; co?: string; noFilter?: string[]; coFilter?: string[] }

export const LOAI_PHIEU: Record<Exclude<VoucherType, 'manual'>, LoaiPhieu[]> = {
  receipt: [
    { name: 'Thu tiền khách hàng (không theo hóa đơn)', no: '111', co: '131' },
    { name: 'Thu hoàn ứng nhân viên', no: '111', co: '141' },
    { name: 'Rút tiền gửi về nhập quỹ', no: '111', co: '112' },
    { name: 'Thu hồi các khoản cho vay', no: '111', co: '1283' },
    { name: 'Thu khác', no: '111' },
  ],
  payment: [
    { name: 'Trả tiền nhà cung cấp (không theo hóa đơn)', no: '331', co: '111' },
    { name: 'Tạm ứng cho nhân viên', no: '141', co: '111' },
    { name: 'Chi mua ngoài có hóa đơn', co: '111' },
    { name: 'Trả lương nhân viên', no: '334', co: '111' },
    { name: 'Gửi tiền vào ngân hàng', no: '112', co: '111' },
    { name: 'Chuyển tiền cho chi nhánh khác', no: '1368', co: '111' },
    { name: 'Chi cho vay', no: '1283', co: '111' },
    { name: 'Nộp thuế TNDN tạm tính', no: '3334', co: '111' },
    { name: 'Chi khác', co: '111' },
  ],
  bank_receipt: [
    { name: 'Thu tiền khách hàng (không theo hóa đơn)', no: '112', co: '131' },
    { name: 'Thu hoàn ứng nhân viên', no: '112', co: '141' },
    { name: 'Thu lãi đầu tư tài chính', no: '112', co: '515' },
    { name: 'Thu tiền vay', no: '112', co: '3411' },
    { name: 'Thu hoàn thuế GTGT', no: '112', co: '1331' },
    { name: 'Thu hồi các khoản cho vay', no: '112', co: '1283' },
    { name: 'Thu khác', no: '112' },
  ],
  bank_payment: [
    { name: 'Trả tiền nhà cung cấp (không theo hóa đơn)', no: '331', co: '112' },
    { name: 'Trả các khoản vay', no: '3411', co: '112' },
    { name: 'Tạm ứng cho nhân viên', no: '141', co: '112' },
    { name: 'Chi mua ngoài có hóa đơn', co: '112' },
    { name: 'Trả lương nhân viên', no: '334', co: '112' },
    { name: 'Chuyển tiền cho chi nhánh khác', no: '1368', co: '112' },
    { name: 'Chi cho vay', no: '1283', co: '112' },
    { name: 'Nộp thuế TNDN tạm tính', no: '3334', co: '112' },
    { name: 'Chi khác', co: '112' },
  ],
};

// [2026-11-15 Nguyễn Văn Thủy] mẫu loại phiếu cố định trong code (bỏ bảng Tài khoản ngầm định theo loại) (đóng góp)
/** Loại phiếu của một màn thu / chi (mẫu định khoản điền sẵn). */
export function useLoaiPhieu(type: Exclude<VoucherType, 'manual'>): LoaiPhieu[] {
  return LOAI_PHIEU[type];
}

/** Loại PHIẾU KẾ TOÁN: chọn loại → điền tài khoản còn trống; ô tài khoản chỉ chọn trong danh sách lọc (đầu số). */
export interface LoaiKeToan { code: string; name: string; debit?: string; credit?: string; debitFilter?: string[]; creditFilter?: string[] }
export const LOAI_KE_TOAN: LoaiKeToan[] = [
  { code: 'tinh-khau-hao-tscd', name: 'Tính khấu hao TSCĐ', debitFilter: ['623', '627', '641', '642', '3533', '632', '811', '241', '3562', '154', '138', '136'], creditFilter: ['214'] },
  { code: 'phan-bo-ccdc', name: 'Phân bổ CCDC', debitFilter: ['623', '627', '641', '642', '632', '811', '241', '3533', '3562', '154', '138', '136'], creditFilter: ['242'] },
  { code: 'hach-toan-chi-phi-luong', name: 'Hạch toán chi phí lương', credit: '334', creditFilter: ['334'] },
  { code: 'hach-toan-thue-tndn-phai-nop', name: 'Hạch toán thuế TNDN phải nộp', debit: '8211', credit: '3334', debitFilter: ['821'], creditFilter: ['3334'] },
  { code: 'khau-tru-thue-tieu-thu-dac-biet', name: 'Khấu trừ thuế tiêu thụ đặc biệt', debit: '3332', credit: '1383', debitFilter: ['3332'], creditFilter: ['1383'] },
  { code: 'ket-chuyen-lai-lo-dau-nam', name: 'Kết chuyển lãi lỗ đầu năm', debitFilter: ['421'], creditFilter: ['421'] },
  { code: 'vay-ngan-hang-chuyen-tra-cho-nha-cung-cap', name: 'Vay ngân hàng chuyển trả cho nhà cung cấp', debit: '331', credit: '3411', debitFilter: ['331', '3388', '635'], creditFilter: ['341', '335'] },
  { code: 'quyet-toan-tam-ung', name: 'Quyết toán tạm ứng', credit: '141', debitFilter: ['641', '642', '627', '621', '623', '242', '811', '133'], creditFilter: ['141'] },
  { code: 'chung-tu-nghiep-vu-khac', name: 'Chứng từ nghiệp vụ khác' },
];

/** Tài khoản chi tiết đầu tiên có đầu số `prefix` (khớp đúng mã thì lấy luôn). */
export const pickAccount = (accounts: { code: string }[], prefix?: string): string =>
  !prefix ? '' : accounts.find((a) => a.code === prefix)?.code ?? accounts.find((a) => a.code.startsWith(prefix))?.code ?? '';

/** Đoán loại của phiếu đã lập theo tài khoản đối ứng của dòng đầu. */
export const guessLoai = (list: LoaiPhieu[], counter: string, lineSide: 'debit' | 'credit'): number => {
  if (!counter) return -1;
  const exact = list.findIndex((l) => (lineSide === 'debit' ? l.no : l.co) === counter);
  if (exact >= 0) return exact;
  return list.findIndex((l) => { const p = lineSide === 'debit' ? l.no : l.co; return Boolean(p && counter.startsWith(p)); });
};
