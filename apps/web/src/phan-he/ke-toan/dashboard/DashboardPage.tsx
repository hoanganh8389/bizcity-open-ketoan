/**
 * Tổng quan: doanh thu, thuế, tiền thu trong kỳ; tình trạng chứng từ; biểu đồ theo ngày.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { date, money, defaultFrom, defaultTo, periodFrom } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { DateRange } from '@/components/filters';
import { ErrorBox, Loading } from '@/components/ui';
import { AlertsPanel } from '../planning/PlanningPages';

interface Dashboard {
  days: { day: string; revenue: number; returns: number; tax: number; cashIn: number }[];
  totals: { revenue: number; returns: number; tax: number; cashIn: number };
  documents: Record<string, number>;
}

export function DashboardPage() {
  const [range, setRange] = useState({ from: periodFrom(), to: defaultTo() });
  const q = useQuery({ queryKey: ['dashboard', range], queryFn: () => api.get<Dashboard>('/api/v1/reports/dashboard', range) });
  const d = q.data;
  const max = Math.max(1, ...(d?.days.map((x) => x.revenue) ?? [1]));

  return (
    <>
      <PageHeader title="Tổng quan" subtitle="Số liệu sổ nhật ký chung, cập nhật ngay khi chứng từ được ghi sổ" helpKey="tong-quan" />
      <AlertsPanel />
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="filters" style={{ borderBottom: 0 }}>
          <DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
        </div>
      </div>
      {q.isLoading && <Loading />}
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {d && (
        <>
          <div className="kpis">
            <div className="card kpi"><div className="label">Doanh thu bán hàng</div><div className="value">{money(d.totals.revenue)}</div><div className="hint">Phát sinh Có TK 511</div></div>
            <div className="card kpi"><div className="label">Hàng bán trả lại</div><div className="value">{money(d.totals.returns)}</div><div className="hint">Phát sinh Nợ TK 521</div></div>
            <div className="card kpi"><div className="label">Thuế GTGT đầu ra</div><div className="value">{money(d.totals.tax)}</div><div className="hint">TK 3331</div></div>
            <div className="card kpi"><div className="label">Tiền thu về</div><div className="value">{money(d.totals.cashIn)}</div><div className="hint">Tăng thuần tiền mặt + ngân hàng</div></div>
          </div>
          <div className="kpis">
            <Link to="/chung-tu?status=posted" className="card kpi" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="label">Chứng từ đã ghi sổ</div><div className="value">{(d.documents.posted ?? 0).toLocaleString('vi-VN')}</div>
            </Link>
            <Link to="/chung-tu?status=error" className="card kpi" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="label">Chứng từ lỗi cần xử lý</div>
              <div className="value" style={{ color: (d.documents.error ?? 0) > 0 ? 'var(--bad)' : undefined }}>{(d.documents.error ?? 0).toLocaleString('vi-VN')}</div>
              <div className="hint">Bấm để xem và ghi sổ lại</div>
            </Link>
          </div>
          <div className="card">
            <div className="card-body">
              <h3 style={{ fontSize: 15 }}>Doanh thu theo ngày</h3>
              {d.days.length === 0 ? (
                <div className="empty">Chưa có phát sinh trong khoảng này</div>
              ) : (
                <div className="bar-chart">
                  {d.days.map((x) => (
                    <div key={x.day} className="bar" style={{ height: `${(Math.max(0, x.revenue) / max) * 100}%` }} title={`${date(x.day)}: ${money(x.revenue)}`} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
