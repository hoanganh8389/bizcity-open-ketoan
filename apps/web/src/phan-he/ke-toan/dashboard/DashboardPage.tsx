// [2026-11-06 03:00 AM Nguyễn Văn Thủy] MENU — Bảng điều khiển cùng kiểu Tổng quan: chọn kỳ, ô số bấm được, biểu đồ, việc cần chú ý
/**
 * BẢNG ĐIỀU KHIỂN: xem kỹ theo kỳ tự chọn (Tổng quan chỉ có tháng này, năm nay). Doanh thu, thuế, tiền thu, tình trạng chứng từ,
 * doanh thu theo ngày hoặc tháng, việc cần chú ý (cùng nguồn với thanh mép phải).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Percent, Receipt, RotateCcw, Wallet } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { defaultTo, periodFrom } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { DateRange } from '@/components/filters';
import { ErrorBox, Loading } from '@/components/ui';
import { BieuDoDoanhThu, Tile } from '../../../features/launcher/TongQuanPage';
import { ViecRow } from '../../../layout/rail/ViecPanel';
import { useViec, viecOf } from '../../../layout/rail/useViec';

interface Dashboard {
  days: { day: string; revenue: number; returns: number; tax: number; cashIn: number }[];
  totals: { revenue: number; returns: number; tax: number; cashIn: number };
  documents: Record<string, number>;
}

export function DashboardPage() {
  const [range, setRange] = useState({ from: periodFrom(), to: defaultTo() });
  const q = useQuery({ queryKey: ['dashboard', range], queryFn: () => api.get<Dashboard>('/api/v1/reports/dashboard', range) });
  const d = q.data;
  const viec = viecOf(useViec().items);
  return (
    <>
      <PageHeader title="Bảng điều khiển" subtitle="Số liệu sổ nhật ký chung, cập nhật ngay khi chứng từ được ghi sổ" helpKey="tong-quan" />
      <div className="card tq-card tq-filter"><DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} /></div>
      {q.isLoading && <Loading />}
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {d && (
        <section className="card tq-card">
          <div className="tq-tiles">
            <Tile icon={Receipt} label="Doanh thu bán hàng" value={d.totals.revenue} hint="Phát sinh Có trừ Nợ TK 511" path="/ban-hang/bao-cao" />
            <Tile icon={RotateCcw} label="Hàng bán trả lại" value={d.totals.returns} hint="Phát sinh Nợ trừ Có TK 521" path="/ban-hang/tra-lai" />
            <Tile icon={Percent} label="Thuế GTGT đầu ra" value={d.totals.tax} hint="Phát sinh Có trừ Nợ TK 3331" path="/thue/bang-ke-ban-ra" />
            <Tile icon={Wallet} label="Tiền thu về" value={d.totals.cashIn} hint="Tăng thuần tiền mặt và tiền gửi" path="/quy/so-du-tien" />
            <Tile icon={CheckCircle2} label="Chứng từ đã ghi sổ" value={d.documents.posted ?? 0} hint="Số chứng từ đã ghi sổ trong kỳ" path="/chung-tu?status=posted" />
            <Tile icon={AlertCircle} label="Chứng từ lỗi" value={d.documents.error ?? 0} hint="Chứng từ không định khoản được, cần xử lý và ghi sổ lại" path="/chung-tu?status=error" />
          </div>
          <BieuDoDoanhThu days={d.days} from={range.from} to={range.to} />
        </section>
      )}
      {viec.length > 0 && (
        <section className="card tq-card tq-chu-y">
          <div className="tq-head"><h3>Cần chú ý</h3></div>
          <div>{viec.map((v) => <ViecRow key={v.key} v={v} onGo={() => undefined} />)}</div>
        </section>
      )}
    </>
  );
}
