// [2026-11-11 Nguyễn Văn Thủy] Loại phiếu thu / chi (mẫu định khoản ngầm định) ở tiêu đề form (đóng góp)
/**
 * LOẠI PHIẾU THU / CHI — ô cạnh tiêu đề form: chọn loại thì điền sẵn tài khoản tiền và tài khoản đối ứng của dòng.
 *   no / co: ĐẦU SỐ tài khoản (111, 131…); form lấy tài khoản chi tiết đầu tiên có đầu số đó trong hệ thống tài khoản.
 *   Ô trống = người lập tự chọn (thu khác, chi khác, chi mua ngoài có hoá đơn).
 *   Tài khoản tiền: phiếu thu / báo có ở bên Nợ, phiếu chi / báo nợ ở bên Có; tiền gửi lấy theo tài khoản ngân hàng chọn trên phiếu.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { VoucherType } from '@ketoan/contracts';
import { api } from '@/lib/api';

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

// [2026-11-13 Nguyễn Văn Thủy] loại phiếu đọc từ Tài khoản ngầm định theo loại (ACC41): kế toán sửa lọc / mặc định ở đó, form theo (đóng góp)
interface AdCol { key: string; filter: string[]; default: string }
interface AdType { code: string; group: string; name: string; columns: AdCol[]; isActive: boolean }
const only = (f: string[] | undefined, pre: string) => Boolean(f?.length) && f!.every((x) => x.startsWith(pre));
const shortName = (n: string) => {
  const t = n.replace(/^Phiếu (thu|chi) /i, (_m, a: string) => (a.toLowerCase() === 'thu' ? 'Thu ' : 'Chi '))
    .replace(/ bằng (tiền mặt|tiền gửi|Chuyển khoản)$/i, '').replace(/^(Thu|Chi) (Thu|Chi) /, '$2 ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};
/** Loại phiếu của một màn thu / chi: lấy theo Tài khoản ngầm định; chưa tải xong thì dùng danh sách sẵn. */
export function useLoaiPhieu(type: Exclude<VoucherType, 'manual'>): LoaiPhieu[] {
  const q = useQuery({ queryKey: ['account-default-types'], queryFn: () => api.get<AdType[]>('/api/v1/account-default-types'), staleTime: 60_000 });
  return useMemo(() => {
    if (!q.data?.length) return LOAI_PHIEU[type];
    const money = type === 'receipt' || type === 'payment' ? '111' : '112';
    const grp = money === '111' ? 'Tiền mặt' : 'Tiền gửi';
    const recv = type === 'receipt' || type === 'bank_receipt';
    const out: LoaiPhieu[] = [];
    for (const t of q.data) {
      if (t.group !== grp || !t.isActive) continue;
      const d = t.columns.find((c) => c.key === 'debit_account');
      const c = t.columns.find((x) => x.key === 'credit_account');
      const isMoney = (col?: AdCol) => (col?.default || col?.filter[0] || '').startsWith(money) || only(col?.filter, money);
      const dm = isMoney(d);
      const cm = isMoney(c);
      if (dm === cm || dm !== recv) continue; // chuyển tiền giữa hai tài khoản tiền, và chiều ngược: bỏ qua
      out.push({ name: shortName(t.name), no: d?.default || undefined, co: c?.default || undefined, noFilter: d?.filter, coFilter: c?.filter });
    }
    // Thu tiền khách / trả tiền NCC lên đầu (phiếu theo hoá đơn lấy loại đầu), loại "… khác" xuống cuối.
    const rank = (n: string) => (/^(Thu|Chi) khác$/i.test(n) ? 3 : /(khách hàng|nhà cung cấp)/i.test(n) ? (/không theo/i.test(n) ? 0 : 1) : 2);
    out.sort((a, b) => rank(a.name) - rank(b.name));
    return out.length ? out : LOAI_PHIEU[type];
  }, [q.data, type]);
}

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
