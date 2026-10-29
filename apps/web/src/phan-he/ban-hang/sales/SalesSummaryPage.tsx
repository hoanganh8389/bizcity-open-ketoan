/**
 * Tổng hợp bán hàng: doanh số bán, hàng trả lại, doanh thu thuần, thuế — xem theo
 * phiếu (mặc định: mỗi phiếu một dòng, kèm tiền đã thu, ghi nợ, hình thức thanh toán) hoặc gom theo
 * ngày / tháng / chi nhánh / mặt hàng / khách hàng / loại thuế (chọn ở hàng thẻ phía trên bảng).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { date, defaultFrom, defaultTo, money } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';
import { Empty, ErrorBox, Loading, Money } from '@/components/ui';
import { KindSelect, Qty, ScopeSelect } from '../../../components/salesFilters';
import { DocumentDetail } from '../../../features/documents/DocumentDetail';
import { DataGrid, type Column } from '@/components/DataGrid';
import { PrintButton } from '@/components/print';
import { summaryTemplates } from './mauIn/baoCaoBanHang';

type GroupBy = 'document' | 'day' | 'month' | 'branch' | 'product' | 'customer' | 'taxCode' | 'brand' | 'industry' | 'itemGroup' | 'itemType' | 'customerGroup' | 'department';
/** Mỗi cách nhóm: nhãn thẻ, tiêu đề cột mã / tên / thông tin thêm (để trống = không hiện cột). */
const GROUPS: { key: GroupBy; tab: string; keyHead: string; labelHead?: string; extraHead?: string }[] = [
  { key: 'document', tab: 'Theo phiếu', keyHead: 'Số phiếu' },
  { key: 'day', tab: 'Theo ngày', keyHead: 'Ngày' },
  { key: 'month', tab: 'Theo tháng', keyHead: 'Tháng' },
  { key: 'branch', tab: 'Theo chi nhánh', keyHead: 'Mã chi nhánh', labelHead: 'Tên chi nhánh' },
  { key: 'product', tab: 'Theo mặt hàng', keyHead: 'Mã hàng', labelHead: 'Tên hàng', extraHead: 'ĐVT' },
  { key: 'customer', tab: 'Theo khách hàng', keyHead: 'Mã khách', labelHead: 'Tên khách hàng', extraHead: 'Mã số thuế' },
  { key: 'taxCode', tab: 'Theo loại thuế', keyHead: 'Loại thuế' },
  { key: 'brand', tab: 'Theo nhãn hàng', keyHead: 'Mã nhãn hàng', labelHead: 'Nhãn hàng' },
  { key: 'industry', tab: 'Theo ngành hàng', keyHead: 'Mã ngành hàng', labelHead: 'Ngành hàng' },
  { key: 'itemGroup', tab: 'Theo nhóm hàng', keyHead: 'Mã nhóm hàng', labelHead: 'Nhóm hàng' },
  { key: 'itemType', tab: 'Theo loại hàng', keyHead: 'Mã loại hàng', labelHead: 'Loại hàng' },
  { key: 'customerGroup', tab: 'Theo nhóm khách', keyHead: 'Mã nhóm khách', labelHead: 'Nhóm khách hàng' },
  { key: 'department', tab: 'Theo bộ phận (cửa hàng)', keyHead: 'Mã bộ phận', labelHead: 'Bộ phận' },
];

interface Measures { saleDocs: number; returnDocs: number; saleQty: number; saleAmount: number; returnQty: number; returnAmount: number; netAmount: number; tax: number; total: number }
interface Row extends Measures {
  key: string; label: string; extra: string;
  // Chỉ có khi xem theo phiếu.
  docId?: string; docDate?: string; docNo?: string; isReturn?: boolean; invoiceNo?: string; invoiceSerial?: string;
  branchCode?: string; partnerCode?: string; partnerName?: string; methods?: string; paid?: number; onCredit?: number; remaining?: number;
}
interface Data { rows: Row[]; totals: Measures & { paid: number; onCredit: number } }

export function SalesSummaryPage() {
  const [f, setF] = useState({ from: defaultFrom(), to: defaultTo(), branchCodes: '', kind: 'all', scope: 'all', groupBy: 'document' as GroupBy });
  const [docId, setDocId] = useState<string | null>(null);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const q = useQuery({ queryKey: ['sales-summary', f], queryFn: () => api.get<Data>('/api/v1/reports/sales-summary', f) });
  const d = q.data;
  const g = GROUPS.find((x) => x.key === f.groupBy)!;
  const lead = 1 + (g.labelHead ? 1 : 0) + (g.extraHead ? 1 : 0);
  const showKey = (r: Row) => (f.groupBy === 'day' ? date(r.key) : f.groupBy === 'month' ? r.label : r.key || '(không có)');

  return (
    <>
      <PageHeader
        title="Tổng hợp bán hàng"
        code="BH02"
        subtitle="Doanh số bán, hàng trả lại và doanh thu thuần theo nhiều góc nhìn"
        helpKey="tong-hop-ban-hang"
      />
      <FilterLayout
        print={<PrintButton screen="BH02" templates={summaryTemplates(f.groupBy)} disabled={!d}
          getDocs={() => (d ? [{ ...f, tab: g.tab, keyHead: g.keyHead, labelHead: g.labelHead, extraHead: g.extraHead, rows: d.rows }] : [])} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
            <KindSelect value={f.kind} onChange={(kind) => set({ kind })} />
            <ScopeSelect value={f.scope} onChange={(scope) => set({ scope })} />
          </>
        }
      >
        {d && (
          <div className="kpis">
            <div className="card kpi"><div className="label">Doanh số bán ({d.totals.saleDocs.toLocaleString('vi-VN')} chứng từ)</div><div className="value"><Money value={d.totals.saleAmount} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">Hàng trả lại ({d.totals.returnDocs.toLocaleString('vi-VN')} chứng từ)</div><div className="value"><Money value={d.totals.returnAmount} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">Doanh thu thuần</div><div className="value"><Money value={d.totals.netAmount} blankZero={false} /></div></div>
            <div className="card kpi"><div className="label">Tổng thanh toán (gồm thuế)</div><div className="value"><Money value={d.totals.total} blankZero={false} /></div></div>
          </div>
        )}
        <div className="card">
          <div className="tabs" role="tablist">
            {GROUPS.map((x) => (
              <button key={x.key} role="tab" aria-selected={f.groupBy === x.key} className={`tab ${f.groupBy === x.key ? 'active' : ''}`} onClick={() => set({ groupBy: x.key })}>{x.tab}</button>
            ))}
          </div>
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !d || d.rows.length === 0 ? <Empty text="Không có số liệu bán hàng trong khoảng này" /> : f.groupBy === 'document' ? (
            <DocumentTable d={d} onOpen={setDocId} />
          ) : (
            <DataGrid
              storageKey={`bh02-${f.groupBy}`}
              rows={d.rows}
              rowKey={(r) => r.key}
              columns={[
                { key: 'key', header: g.keyHead, type: f.groupBy === 'day' ? 'date' : g.labelHead ? 'code' : 'text', value: (r) => (f.groupBy === 'month' ? r.label : r.key), render: (r) => showKey(r) },
                ...(g.labelHead ? [{ key: 'label', header: g.labelHead }] : []),
                ...(g.extraHead ? [{ key: 'extra', header: g.extraHead }] : []),
                { key: 'saleDocs', header: 'Số CT bán', type: 'number', footer: d.totals.saleDocs.toLocaleString('vi-VN') },
                { key: 'saleQty', header: 'SL bán', type: 'qty', sum: true },
                { key: 'saleAmount', header: 'Doanh số bán', type: 'money', sum: true },
                { key: 'returnQty', header: 'SL trả lại', type: 'qty', sum: true },
                { key: 'returnAmount', header: 'Hàng trả lại', type: 'money', sum: true },
                { key: 'netAmount', header: 'Doanh thu thuần', type: 'money', sum: true, bold: true },
                { key: 'tax', header: 'Thuế GTGT', type: 'money', sum: true },
                { key: 'total', header: 'Tổng thanh toán', type: 'money', sum: true },
              ] satisfies Column<Row>[]}
            />
          )}
        </div>
      </FilterLayout>
      {docId && <DocumentDetail id={docId} onClose={() => setDocId(null)} />}
    </>
  );
}

/** Theo phiếu: mỗi hoá đơn bán / phiếu trả lại một dòng (phiếu trả lại ghi số âm). */
function DocumentTable({ d, onOpen }: { d: Data; onOpen: (id: string) => void }) {
  return (
    <DataGrid
      storageKey="bh02-document"
      rows={d.rows}
      rowKey={(r) => r.key}
      onRowClick={(r) => r.docId && onOpen(r.docId)}
      columns={[
        { key: 'docDate', header: 'Ngày', type: 'date' },
        { key: 'docNo', header: 'Số phiếu', type: 'code', value: (r) => r.docNo ?? r.label },
        { key: 'isReturn', header: 'Loại', value: (r) => (r.isReturn ? 'Trả lại' : 'Bán'), render: (r) => (r.isReturn ? <span className="badge badge-warn">Trả lại</span> : 'Bán') },
        { key: 'invoiceSerial', header: 'Ký hiệu', type: 'code' },
        { key: 'invoiceNo', header: 'Số HĐ', type: 'code' },
        { key: 'branchCode', header: 'Chi nhánh', type: 'code' },
        { key: 'partnerCode', header: 'Mã khách', type: 'code' },
        { key: 'partnerName', header: 'Tên khách hàng' },
        { key: 'qty', header: 'Số lượng', type: 'qty', sum: true, value: (r) => r.saleQty - r.returnQty },
        { key: 'netAmount', header: 'Tiền hàng', type: 'money', sum: true, showZero: true },
        { key: 'tax', header: 'Thuế GTGT', type: 'money', sum: true },
        { key: 'total', header: 'Tổng thanh toán', type: 'money', sum: true, bold: true, showZero: true },
        { key: 'paid', header: 'Đã thu', type: 'money', sum: true },
        { key: 'onCredit', header: 'Ghi nợ', type: 'money', sum: true },
        // Còn nợ = Tổng thanh toán − Đã thu − đối trừ đổi trả (phiếu thu chưa định khoản chưa tính là đã thu).
        { key: 'remaining', header: 'Còn nợ', type: 'money', sum: true, render: (r) => (r.remaining ? <b className={r.remaining > 0 ? 'text-bad' : ''}>{money(r.remaining)}</b> : '') },
        { key: 'methods', header: 'Hình thức TT' },
      ] satisfies Column<Row>[]}
    />
  );
}
