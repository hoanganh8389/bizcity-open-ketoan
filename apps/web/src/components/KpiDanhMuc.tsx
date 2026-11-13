// [2026-11-11 Nguyễn Văn Thủy] thẻ chỉ số của danh mục Đối tượng (nợ) và Mặt hàng (tồn) (đóng góp)
/**
 * Thẻ chỉ số đặt trên đầu danh mục:
 *  - KpiDoiTuong: nợ phải thu / phải trả quá hạn (sổ công nợ theo hạn), tổng phải thu (dư Nợ 131), tổng phải trả (dư Có 331) tới hôm nay.
 *    `kind` = customer / supplier chỉ hiện phía tương ứng.
 *  - KpiMatHang: số mã còn hàng / hết hàng / âm kho theo tồn hiện tại (chi nhánh đang làm việc nếu đã chọn).
 * Bấm thẻ mở màn chi tiết. Nguồn nào lỗi / không có quyền thì thẻ đó hiện "…", không làm hỏng danh mục.
 */
import { useQuery } from '@tanstack/react-query';
import { AlarmClock, ArrowDownLeft, ArrowUpRight, Banknote, FileText, PackageCheck, PackageMinus, PackageX, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { today } from '@/lib/format';
import { workBranch } from '@/lib/workBranch';
import { KpiCards, type KpiItem } from './KpiCards';

interface Alerts { receivable: { overdue: { count: number; amount: number } }; payable: { overdue: { count: number; amount: number } } }
interface Tb { rows: { code: string; closingDebit: number; closingCredit: number }[] }

const opts = { retry: false, staleTime: 120_000 } as const;

export function KpiDoiTuong({ kind }: { kind?: string }) {
  const to = today();
  const al = useQuery({ ...opts, queryKey: ['kpi', 'alerts'], queryFn: () => api.get<Alerts>('/api/v1/alerts') });
  const tb = useQuery({ ...opts, queryKey: ['kpi', 'tb', to], queryFn: () => api.get<Tb>('/api/v1/reports/trial-balance', { from: `${to.slice(0, 4)}-01-01`, to }) });
  const acc = (c: string) => tb.data?.rows.find((r) => r.code === c);
  const items: KpiItem[] = [];
  if (kind !== 'supplier') {
    items.push({ key: 'thu-qh', label: 'Nợ phải thu quá hạn', value: al.data?.receivable.overdue.amount, sub: al.data ? `${al.data.receivable.overdue.count} khoản` : undefined, tone: 'bad', icon: <AlarmClock size={18} />, to: '/cong-no/khoan-cong-no', hint: 'Khoản phải thu đã quá hạn thanh toán — bấm để xem từng khoản' });
    items.push({ key: 'thu', label: 'Tổng nợ phải thu', value: tb.data ? acc('131')?.closingDebit ?? 0 : undefined, tone: 'warn', icon: <ArrowDownLeft size={18} />, to: '/bao-cao/cong-no', hint: 'Dư Nợ TK 131 tới hôm nay' });
  }
  if (kind !== 'customer') {
    items.push({ key: 'tra-qh', label: 'Nợ phải trả quá hạn', value: al.data?.payable.overdue.amount, sub: al.data ? `${al.data.payable.overdue.count} khoản` : undefined, tone: 'bad', icon: <AlarmClock size={18} />, to: '/cong-no/khoan-cong-no', hint: 'Khoản phải trả nhà cung cấp đã quá hạn — bấm để xem từng khoản' });
    items.push({ key: 'tra', label: 'Tổng nợ phải trả', value: tb.data ? acc('331')?.closingCredit ?? 0 : undefined, tone: 'info', icon: <ArrowUpRight size={18} />, to: '/bao-cao/cong-no', hint: 'Dư Có TK 331 tới hôm nay' });
  }
  return <KpiCards items={items} at={al.dataUpdatedAt || tb.dataUpdatedAt || null} />;
}

/**
 * Danh sách phiếu tiền: tổng tiền các phiếu đang xem, số phiếu, tồn quỹ tiền mặt (dư Nợ 111) hoặc số dư tiền gửi (dư Nợ 112) đến hôm nay.
 * `chieu` 'thu' / 'chi' chỉ để đặt nhãn.
 */
export function KpiTien({ title, total, count, from, to, tk, thuChi }: { title: string; total: number | undefined; count: number | undefined; from: string; to: string; tk: '111' | '112' | null; /** Màn gộp thu, chi: hai ô Tổng thu, Tổng chi thay cho Tổng tiền + Số phiếu. */ thuChi?: { thu: number; chi: number } }) {
  const today_ = today();
  const tb = useQuery({ ...opts, enabled: Boolean(tk), queryKey: ['kpi', 'tb', today_], queryFn: () => api.get<Tb>('/api/v1/reports/trial-balance', { from: `${today_.slice(0, 4)}-01-01`, to: today_ }) });
  const du = tk ? (tb.data?.rows.find((r) => r.code === tk)?.closingDebit ?? (tb.data ? 0 : undefined)) : undefined;
  const ky = `${from.slice(8, 10)}/${from.slice(5, 7)} – ${to.slice(8, 10)}/${to.slice(5, 7)}/${to.slice(0, 4)}`;
  const items: KpiItem[] = thuChi ? [
    { key: 'thu', label: `Tổng thu (${ky})`, value: thuChi.thu, tone: 'ok', icon: <Banknote size={18} />, hint: 'Cộng số tiền các phiếu thu đang hiện (theo kỳ, chi nhánh đã chọn)' },
    { key: 'chi', label: `Tổng chi (${ky})`, value: thuChi.chi, tone: 'info', icon: <Banknote size={18} />, hint: 'Cộng số tiền các phiếu chi đang hiện (theo kỳ, chi nhánh đã chọn)' },
  ] : [
    { key: 'tong', label: `Tổng ${title.toLowerCase()} (${ky})`, value: total, tone: 'ok', icon: <Banknote size={18} />, hint: 'Cộng số tiền các phiếu đang hiện trong danh sách (theo kỳ, chi nhánh đã chọn)' },
    { key: 'so', label: 'Số phiếu', value: count, tone: 'info', icon: <FileText size={18} /> },
  ];
  if (tk) items.push({ key: 'du', label: tk === '111' ? 'Tồn quỹ tiền mặt đến hôm nay' : 'Số dư tiền gửi đến hôm nay', value: du, tone: 'warn', icon: <Wallet size={18} />, to: tk === '111' ? '/quy/so-quy-tien-mat' : '/quy/so-tien-gui', hint: `Dư Nợ TK ${tk} tới hôm nay (mọi chi nhánh) — bấm để xem sổ` });
  return <KpiCards items={items} at={tb.dataUpdatedAt || null} />;
}

export function KpiMatHang() {
  const branchCode = workBranch.get() || undefined;
  const q = useQuery({ ...opts, queryKey: ['kpi', 'stock', branchCode], queryFn: () => api.get<{ inStock: number; out: number; negative: number }>('/api/v1/inventory/stock-counts', { branchCode }) });
  const where = branchCode ? ` (${branchCode})` : '';
  return (
    <KpiCards at={q.dataUpdatedAt || null} items={[
      { key: 'con', label: `Mã còn hàng${where}`, value: q.data?.inStock, tone: 'ok', icon: <PackageCheck size={18} />, to: '/bao-cao/nhap-xuat-ton', hint: 'Số mã có tồn hiện tại > 0 — bấm để xem nhập xuất tồn' },
      { key: 'het', label: `Mã hết hàng${where}`, value: q.data?.out, tone: 'warn', icon: <PackageMinus size={18} />, to: '/bao-cao/nhap-xuat-ton', hint: 'Mã đã có phát sinh kho, tồn hiện tại = 0' },
      { key: 'am', label: `Mã âm kho${where}`, value: q.data?.negative, tone: 'bad', icon: <PackageX size={18} />, to: '/bao-cao/nhap-xuat-ton', hint: 'Tồn hiện tại < 0: xuất trước khi nhập hoặc thiếu phiếu nhập — cần kiểm tra' },
    ]} />
  );
}
