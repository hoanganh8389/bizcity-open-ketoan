/**
 * Báo cáo bán hàng: chi tiết từng dòng hàng đã bán / trả lại trong kỳ.
 * Hàng trả lại hiện số âm; dòng tổng là số thuần của toàn bộ kết quả lọc (không chỉ trang đang xem).
 */
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, errorText, ALL_ROWS } from '@/lib/api';
import { date, defaultFrom, defaultTo } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';
import { Empty, ErrorBox, Loading, Money } from '@/components/ui';
import { DocumentDetail } from '../../../features/documents/DocumentDetail';
import { KindSelect, Qty, ScopeSelect } from '../../../components/salesFilters';
import { DataGrid, type Column } from '@/components/DataGrid';
import { PrintButton } from '@/components/print';
import { SALES_DETAIL_TEMPLATES } from './mauIn/baoCaoBanHang';

interface Row {
  id: string; docDate: string; sourceDocumentId: string; docNo: string; invoiceNo: string | null; invoiceSerial: string; taxRate: number | null; isReturn: boolean; hasInvoice: boolean;
  branchCode: string; partnerCode: string | null; partnerName: string | null; sku: string; name: string; unit: string;
  qty: number; unitPrice: number; amount: number; discount: number; taxCode: string; tax: number; total: number; isGift: boolean;
}
interface Data { rows: Row[]; totals: { lines: number; documents: number; qty: number; amount: number; discount: number; tax: number; total: number } }

export function SalesDetailPage() {
  const [f, setF] = useState({ from: defaultFrom(), to: defaultTo(), branchCodes: '', kind: 'all', scope: 'all', search: '', page: 1 });
  const [searchText, setSearchText] = useState('');
  const [docId, setDocId] = useState<string | null>(null);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch, page: patch.page ?? 1 }));

  const q = useQuery({
    queryKey: ['sales-detail', f],
    queryFn: () => api.getPage<Data>('/api/v1/reports/sales-detail', { ...f, pageSize: ALL_ROWS }),
    placeholderData: keepPreviousData,
  });
  const d = q.data?.data;
  const total = Number(q.data?.meta?.total ?? 0);

  return (
    <>
      <PageHeader
        title="Báo cáo bán hàng"
        code="BH01"
        subtitle="Chi tiết từng mặt hàng đã bán và trả lại trong kỳ"
        helpKey="bao-cao-ban-hang"
      />
      <FilterLayout
        print={<PrintButton screen="BH01" templates={SALES_DETAIL_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ ...f, rows: d.rows }] : [])} />}
        filters={
          <>
            <form className="rp-form" onSubmit={(e) => { e.preventDefault(); set({ search: searchText.trim() }); }}>
              <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
              <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
              <KindSelect value={f.kind} onChange={(kind) => set({ kind })} />
              <ScopeSelect value={f.scope} onChange={(scope) => set({ scope })} />
              <div className="field">
                <label>Tìm kiếm</label>
                <input className="input w-lg" placeholder="Mã hàng, tên hàng, số chứng từ, khách…" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
              </div>
              <button className="btn btn-primary" type="submit">Tìm</button>
            </form>
          </>
        }
      >
        {d && (
          <div className="kpis">
            <div className="card kpi"><div className="label">Số chứng từ</div><div className="value">{d.totals.documents.toLocaleString('vi-VN')}</div></div>
            <div className="card kpi"><div className="label">Tiền hàng (chưa thuế)</div><div className="value"><Money value={d.totals.amount} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">Thuế GTGT</div><div className="value"><Money value={d.totals.tax} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">Tổng thanh toán</div><div className="value"><Money value={d.totals.total} blankZero={false} /></div></div>
          </div>
        )}
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !d || d.rows.length === 0 ? <Empty text="Không có dòng hàng nào trong khoảng này" /> : (
            <>
              <DataGrid
                storageKey="bh01"
                rows={d.rows}
                rowKey={(r) => String(r.id)}
                onRowClick={(r) => setDocId(r.sourceDocumentId)}
                note={`Cả kỳ: ${d.totals.lines.toLocaleString('vi-VN')} dòng`}
                columns={[
                  { key: 'docDate', header: 'Ngày', type: 'date' },
                  { key: 'docNo', header: 'Số chứng từ', type: 'code', render: (r) => <>{r.docNo}{r.isReturn && <span className="badge badge-warn" style={{ marginLeft: 6 }}>Trả lại</span>}</> },
                  { key: 'invoiceSerial', header: 'Ký hiệu', type: 'code' },
                  { key: 'invoiceNo', header: 'Số hoá đơn', type: 'code' },
                  { key: 'branchCode', header: 'Chi nhánh', type: 'code' },
                  { key: 'partnerCode', header: 'Mã khách', type: 'code', hidden: true },
                  { key: 'partnerName', header: 'Khách hàng' },
                  { key: 'sku', header: 'Mã hàng', type: 'code' },
                  { key: 'name', header: 'Tên hàng', render: (r) => <>{r.name}{r.isGift && <span className="badge badge-gray" style={{ marginLeft: 6 }}>Tặng</span>}</> },
                  { key: 'unit', header: 'ĐVT' },
                  { key: 'qty', header: 'Số lượng', type: 'qty', sum: true },
                  { key: 'unitPrice', header: 'Đơn giá', type: 'money' },
                  { key: 'discount', header: 'Chiết khấu', type: 'money', sum: true, hidden: true },
                  { key: 'amount', header: 'Tiền hàng', type: 'money', sum: true },
                  { key: 'taxRate', header: 'Thuế suất', value: (r) => (r.taxRate === null ? r.taxCode : r.taxCode === 'KCT' ? 'KCT' : `${r.taxRate}%`) },
                  { key: 'tax', header: 'Tiền thuế', type: 'money', sum: true },
                  { key: 'total', header: 'Tổng tiền', type: 'money', sum: true },
                ] satisfies Column<Row>[]}
              />
            </>
          )}
        </div>
      </FilterLayout>
      {docId && <DocumentDetail id={docId} onClose={() => setDocId(null)} />}
    </>
  );
}
