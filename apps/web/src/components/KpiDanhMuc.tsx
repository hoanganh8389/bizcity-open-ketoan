// [2026-11-11 Nguyễn Văn Thủy] thẻ chỉ số của danh mục Đối tượng (nợ) và Mặt hàng (tồn) (đóng góp)
/**
 * Thẻ chỉ số đặt trên đầu danh mục:
 *  - KpiDoiTuong: nợ phải thu / phải trả quá hạn (sổ công nợ theo hạn), tổng phải thu (dư Nợ 131), tổng phải trả (dư Có 331) tới hôm nay.
 *    `kind` = customer / supplier chỉ hiện phía tương ứng.
 *  - KpiMatHang: số mã còn hàng / hết hàng / âm kho theo tồn hiện tại (chi nhánh đang làm việc nếu đã chọn).
 * Bấm thẻ mở màn chi tiết. Nguồn nào lỗi / không có quyền thì thẻ đó hiện "…", không làm hỏng danh mục.
 */
import { useQuery } from '@tanstack/react-query';
import { AlarmClock, ArrowDownLeft, ArrowUpRight, PackageCheck, PackageMinus, PackageX } from 'lucide-react';
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
