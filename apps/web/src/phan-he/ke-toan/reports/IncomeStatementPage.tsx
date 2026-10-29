/**
 * Báo cáo kết quả hoạt động kinh doanh (mẫu B02-DN): kỳ này và cùng kỳ năm trước.
 * Số lấy từ sổ cái, không tính bút toán kết chuyển, nên xem được cả trước và sau khi kết chuyển.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { date, defaultFrom, defaultTo, periodFrom } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';
import { ErrorBox, Loading, Money } from '@/components/ui';
import { PrintButton } from '@/components/print';
import { INCOME_STATEMENT_TEMPLATES } from './mauIn/baoCaoTaiChinh';

interface Row { code: string; name: string; note: string; bold: boolean; accounts: string; current: number; previous: number }
interface Data { period: { from: string; to: string }; previous: { from: string; to: string }; rows: Row[] }

export function IncomeStatementPage() {
  const navigate = useNavigate();
  const [f, setF] = useState({ from: periodFrom(), to: defaultTo(), branchCodes: '' });
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const q = useQuery({ queryKey: ['income-statement', f], queryFn: () => api.get<Data>('/api/v1/reports/income-statement', f) });
  const d = q.data;
  /** Bấm chỉ tiêu lấy số → mở cân đối phát sinh của nhóm tài khoản tạo nên số đó. */
  const drill = (r: Row) => {
    const first = r.accounts.split(',')[0]?.trim();
    if (first) navigate(`/bao-cao/so-chi-tiet?${new URLSearchParams({ account: first, from: f.from, to: f.to }).toString()}`);
  };

  return (
    <>
      <PageHeader
        title="Báo cáo kết quả hoạt động kinh doanh"
        code="ACC9"
        subtitle="Mẫu B02-DN — doanh thu, chi phí, lợi nhuận trong kỳ"
        helpKey="ket-qua-kinh-doanh"
        actions={<button className="btn" disabled={!d} onClick={() => api.download('/api/v1/addins/excel-export/income-statement.csv', f, `ket-qua-kinh-doanh-${f.from}-${f.to}.csv`)}><Download size={16} /> Xuất Excel</button>}
      />
      <FilterLayout
        print={<PrintButton screen="ACC9" templates={INCOME_STATEMENT_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ branchCodes: f.branchCodes, period: d.period, previous: d.previous, rows: d.rows }] : [])} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
          </>
        }
      >
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading || !d ? <Loading /> : (
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Chỉ tiêu</th><th style={{ width: 70 }}>Mã số</th><th style={{ width: 100 }}>Thuyết minh</th>
                    <th className="num" style={{ width: 190 }}>Kỳ này<div className="muted" style={{ fontWeight: 400, fontSize: 11 }}>{date(d.period.from)} – {date(d.period.to)}</div></th>
                    <th className="num" style={{ width: 190 }}>Cùng kỳ năm trước<div className="muted" style={{ fontWeight: 400, fontSize: 11 }}>{date(d.previous.from)} – {date(d.previous.to)}</div></th>
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map((r) => (
                    <tr key={r.code} className={`${r.bold ? 'bold' : ''} ${r.accounts ? 'clickable' : ''}`} onClick={() => drill(r)} title={r.accounts ? `Lấy từ tài khoản ${r.accounts}. Bấm để xem sổ chi tiết.` : ''}>
                      <td style={{ whiteSpace: 'pre' }}>{r.name}</td>
                      <td className="mono">{r.code}</td>
                      <td className="muted">{r.note}</td>
                      <td className="num"><Money value={r.current} bold={r.bold} /></td>
                      <td className="num"><Money value={r.previous} bold={r.bold} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </FilterLayout>
    </>
  );
}
