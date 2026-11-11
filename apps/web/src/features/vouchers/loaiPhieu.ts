// [2026-11-11 Nguyễn Văn Thủy] Loại phiếu thu / chi (mẫu định khoản ngầm định) ở tiêu đề form (đóng góp)
/**
 * LOẠI PHIẾU THU / CHI — ô cạnh tiêu đề form: chọn loại thì điền sẵn tài khoản tiền và tài khoản đối ứng của dòng.
 *   no / co: ĐẦU SỐ tài khoản (111, 131…); form lấy tài khoản chi tiết đầu tiên có đầu số đó trong hệ thống tài khoản.
 *   Ô trống = người lập tự chọn (thu khác, chi khác, chi mua ngoài có hoá đơn).
 *   Tài khoản tiền: phiếu thu / báo có ở bên Nợ, phiếu chi / báo nợ ở bên Có; tiền gửi lấy theo tài khoản ngân hàng chọn trên phiếu.
 */
import type { VoucherType } from '@ketoan/contracts';

export interface LoaiPhieu { name: string; no?: string; co?: string }

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

/** Tài khoản chi tiết đầu tiên có đầu số `prefix` (khớp đúng mã thì lấy luôn). */
export const pickAccount = (accounts: { code: string }[], prefix?: string): string =>
  !prefix ? '' : accounts.find((a) => a.code === prefix)?.code ?? accounts.find((a) => a.code.startsWith(prefix))?.code ?? '';

/** Đoán loại của phiếu đã lập theo tài khoản đối ứng của dòng đầu. */
export const guessLoai = (list: LoaiPhieu[], counter: string, lineSide: 'debit' | 'credit'): number =>
  counter ? list.findIndex((l) => { const p = lineSide === 'debit' ? l.no : l.co; return Boolean(p && counter.startsWith(p)); }) : -1;
