/**
 * Báo cáo thu tiền bán hàng: mỗi dòng là một phiếu thu (hoặc phiếu trả tiền khách) và phiếu bán / hoàn được thanh toán,
 * lọc theo ngày thu và chi nhánh của phiếu bán. Bấm dòng mở phiếu thu.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { defaultFrom, defaultTo } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { DocumentDetail } from '../../../features/documents/DocumentDetail';
import { PrintButton } from '@/components/print';
import { RECEIPTS_TEMPLATES } from './mauIn/baoCaoBanHang';

interface Row {
  id: string; payId: string; payNo: string; payDate: string; invNo: string; invDate: string; invTotal: number; paid: number;
  partnerCode: string; partnerName: string; branchName: string; bank: string; method: string; invBranchName: string; reasonCode: string; note: string; kind: string;
}
interface Data { rows: Row[]; totals: { paid: number } }

export function SalesReceiptsPage() {
  const [f, setF] = useState({ from: defaultFrom(), to: defaultTo(), branchCodes: '' });
  const [docId, setDocId] = useState<string | null>(null);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const q = useQuery({ queryKey: ['sales-receipts', f], queryFn: () => api.get<Data>('/api/v1/reports/sales-receipts', f) });
  const d = q.data;

  return (
    <>
      <PageHeader title="Báo cáo thu tiền bán hàng" code="BH05" subtitle="Từng phiếu thu tiền khách hàng và phiếu bán được thanh toán" />
      <FilterLayout
        print={<PrintButton screen="BH05" templates={RECEIPTS_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ ...f, rows: d.rows }] : [])} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
          </>
        }
      >
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !d || d.rows.length === 0 ? <Empty text="Không tìm thấy bản ghi nào thỏa mãn điều kiện" /> : (
            <DataGrid
              storageKey="bh05"
              rows={d.rows}
              rowKey={(r) => r.id}
              onRowClick={(r) => setDocId(r.payId)}
              columns={[
                { key: 'payNo', header: 'Số phiếu thu tiền', type: 'code' },
                { key: 'payDate', header: 'Ngày thu tiền', type: 'date' },
                { key: 'invNo', header: 'Số phiếu bán hàng', type: 'code' },
                { key: 'invDate', header: 'Ngày phiếu bán hàng', type: 'date' },
                { key: 'invTotal', header: 'Tổng tiền', type: 'money' },
                { key: 'paid', header: 'Số tiền đã thanh toán', type: 'money', sum: true },
                { key: 'partnerCode', header: 'Mã khách hàng', type: 'code' },
                { key: 'partnerName', header: 'Tên khách hàng' },
                { key: 'branchName', header: 'Chi nhánh' },
                { key: 'bank', header: 'Ngân hàng', type: 'code' },
                { key: 'method', header: 'Hình thức TT' },
                { key: 'invBranchName', header: 'Mã CN phiếu bán' },
                { key: 'reasonCode', header: 'Lý do thu', type: 'code' },
                { key: 'note', header: 'Ghi chú phiếu thu' },
                { key: 'kind', header: 'Loại phiếu' },
              ] satisfies Column<Row>[]}
            />
          )}
        </div>
      </FilterLayout>
      {docId && <DocumentDetail id={docId} onClose={() => setDocId(null)} />}
    </>
  );
}
