/**
 * Thu tiền theo hình thức thanh toán: mỗi hình thức một cột (thu của khách − trả lại khách),
 * mỗi dòng là một ngày hoặc một chi nhánh. Dùng để đối chiếu tiền nộp quỹ / ngân hàng.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { date, defaultFrom, defaultTo } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';
import { Empty, ErrorBox, Loading, Money } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { PrintButton } from '@/components/print';
import { PAYMENTS_TEMPLATES } from './mauIn/baoCaoBanHang';

interface Cells { cells: Record<string, number>; received: number; refunded: number; net: number }
interface Data {
  methods: { code: string; name: string; isReceivable: boolean }[];
  rows: (Cells & { key: string; label: string })[];
  totals: Cells;
}

export function SalesPaymentsPage() {
  const [f, setF] = useState({ from: defaultFrom(), to: defaultTo(), branchCodes: '', groupBy: 'day' });
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const q = useQuery({ queryKey: ['sales-payments', f], queryFn: () => api.get<Data>('/api/v1/reports/sales-payments', f) });
  const d = q.data;
  const byBranch = f.groupBy === 'branch';

  return (
    <>
      <PageHeader
        title="Thu tiền theo hình thức thanh toán"
        code="BH03"
        subtitle="Tiền thu của khách trừ tiền trả lại khách, tách theo từng hình thức"
        helpKey="thu-tien-ban-hang"
      />
      <FilterLayout
        print={<PrintButton screen="BH03" templates={PAYMENTS_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ ...f, methods: d.methods, rows: d.rows }] : [])} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
            <div className="field">
              <label>Xem theo</label>
              <select className="select input w-md" value={f.groupBy} onChange={(e) => set({ groupBy: e.target.value })}>
                <option value="day">Ngày</option>
                <option value="branch">Chi nhánh</option>
              </select>
            </div>
          </>
        }
      >
        {d && (
          <div className="kpis">
            <div className="card kpi"><div className="label">Tổng thu của khách</div><div className="value"><Money value={d.totals.received} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">Trả lại khách</div><div className="value"><Money value={d.totals.refunded} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">Thực thu</div><div className="value"><Money value={d.totals.net} blankZero={false} /></div></div>
          </div>
        )}
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !d || d.rows.length === 0 ? <Empty text="Không có khoản thanh toán nào trong khoảng này" /> : (
            <DataGrid
              storageKey={`bh03-${f.groupBy}`}
              rows={d.rows}
              rowKey={(r) => r.key}
              columns={[
                { key: 'key', header: byBranch ? 'Mã chi nhánh' : 'Ngày', type: byBranch ? 'code' : 'date' },
                ...(byBranch ? [{ key: 'label', header: 'Tên chi nhánh' }] : []),
                ...d.methods.map((m) => ({ key: `m-${m.code}`, header: `${m.name}${m.isReceivable ? ' *' : ''}`, type: 'money' as const, sum: true, value: (r: (typeof d.rows)[number]) => r.cells[m.code] ?? 0 })),
                { key: 'received', header: 'Tổng thu', type: 'money', sum: true },
                { key: 'refunded', header: 'Trả lại khách', type: 'money', sum: true },
                { key: 'net', header: 'Thực thu', type: 'money', sum: true, bold: true },
              ]}
            />
          )}
          {d?.methods.some((m) => m.isReceivable) && <div className="muted" style={{ padding: '8px 16px', fontSize: 12 }}>* Ghi nợ / đối trừ (khách chưa trả tiền hoặc bù trừ với phiếu hoàn): không phải tiền thực nhận, không cộng vào Tổng thu, Thực thu.</div>}
        </div>
      </FilterLayout>
    </>
  );
}
